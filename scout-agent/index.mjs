#!/usr/bin/env node
// Scout Agent — standalone DeFi intelligence monitor
// Runs independently, reads on-chain data, sends Telegram recommendations
// DOES NOT modify the arbitrage system in any way

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';


import { analyzeContract } from './analyzers/contract.mjs';
import { analyzeGas, detectNewPools } from './analyzers/market.mjs';
import { recordGasSnapshot, recordScanResult, analyzePatterns, suggestConfigChanges } from './analyzers/optimizer.mjs';
import { sendFindings } from './reporters/telegram.mjs';
import { runSystemSimulation, proactiveTroubleshoot, optimizeCodebase, runMaintenanceChecks } from './analyzers/systemHelpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTBOX_DIR = join(__dirname, 'data', 'outbox');

// ---------- Load Config ----------

function loadEnv() {
  const envFiles = [
    join(__dirname, '.env'),
    join(__dirname, '..', '.env'),
  ];

  for (const envPath of envFiles) {
    try {
      const lines = readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      // File is optional.
    }
  }

  // Root env frequently stores VITE_ALCHEMY_API_KEY; normalize for scout fallback use.
  if (!process.env.ALCHEMY_API_KEY && process.env.VITE_ALCHEMY_API_KEY) {
    process.env.ALCHEMY_API_KEY = process.env.VITE_ALCHEMY_API_KEY;
  }
}

loadEnv();

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://eth.drpc.org';
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';
const RPC_FALLBACKS = [
  RPC_URL,
  ALCHEMY_API_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : '',
  process.env.ETHEREUM_RPC_FALLBACK_1 || 'https://ethereum-rpc.publicnode.com',
  process.env.ETHEREUM_RPC_FALLBACK_2 || 'https://cloudflare-eth.com',
].filter(Boolean);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CONTRACT_ADDRESS = process.env.ARBITRAGE_CONTRACT;
const INTERVAL_MIN = parseInt(process.env.SCAN_INTERVAL_MINUTES || '15', 10);
const RUN_ONCE = process.argv.includes('--once');

function persistOutbox(findings, delivery) {
  if (!existsSync(OUTBOX_DIR)) {
    mkdirSync(OUTBOX_DIR, { recursive: true });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(OUTBOX_DIR, `report-${ts}.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    findingsCount: findings.length,
    delivery,
    findings,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  process.exit(1);
}

if (!CONTRACT_ADDRESS) {
  console.error('Missing ARBITRAGE_CONTRACT address');
  process.exit(1);
}

// ---------- Main Scan Cycle ----------

async function runCycle() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Scout cycle starting...`);

  // --- System Health & Maintenance (from Serena agent logic) ---
  const simResult = await runSystemSimulation();
  if (simResult.status !== 'ok') console.warn('Simulation warning:', simResult.message);

  const troubleshootResult = await proactiveTroubleshoot();
  if (troubleshootResult.status !== 'ok') console.warn('Troubleshooting warning:', troubleshootResult.message);

  const optimizeResult = await optimizeCodebase();
  if (optimizeResult.status !== 'ok') console.warn('Optimization warning:', optimizeResult.message);

  const maintenanceResult = await runMaintenanceChecks();
  if (maintenanceResult.status !== 'ok') console.warn('Maintenance warning:', maintenanceResult.message);

  const provider = await createProvider();
  const allFindings = [];

  // 1. Contract analysis
  try {
    const contractFindings = await analyzeContract(provider, CONTRACT_ADDRESS);
    allFindings.push(...contractFindings);
  } catch (err) {
    console.error('Contract analysis failed:', err.message);
    allFindings.push({
      type: 'error', severity: 'warning',
      title: 'Contract analysis failed',
      detail: err.message, action: null,
    });
  }

  // 2. Gas analysis
  let currentGasCostUsd = 18; // default
  try {
    const gasFindings = await analyzeGas(provider);
    allFindings.push(...gasFindings);

    // Extract current gas cost for optimizer
    const gasReport = gasFindings.find(f => f.type === 'gas_report');
    if (gasReport) {
      const match = gasReport.detail.match(/Arb tx cost: ~\$(\d+\.?\d*)/);
      if (match) currentGasCostUsd = parseFloat(match[1]);

      const baseMatch = gasReport.detail.match(/Base: (\d+\.?\d*)/);
      const ethMatch = gasReport.detail.match(/ETH: \$(\d+)/);
      if (baseMatch && ethMatch) {
        recordGasSnapshot(parseFloat(baseMatch[1]), 0, parseInt(ethMatch[1]));
      }
    }
  } catch (err) {
    console.error('Gas analysis failed:', err.message);
  }

  // 3. New pool detection
  try {
    const poolFindings = await detectNewPools();
    allFindings.push(...poolFindings);

    // Record spread data for the optimizer
    const spreadAlerts = poolFindings.filter(f => f.type === 'spread_alert');
    recordScanResult(spreadAlerts.length, spreadAlerts.map(s => ({
      pair: s.title.replace('Cross-DEX spread: ', '').split(' at ')[0],
      spread: parseFloat(s.title.split(' at ')[1]) || 0,
    })));
  } catch (err) {
    console.error('Pool detection failed:', err.message);
  }

  // 4. ML pattern analysis & config suggestions
  try {
    const { findings: patternFindings, recentRecTypes } = analyzePatterns();

    // Filter out recommendations we've already sent recently (dedup)
    for (const pf of patternFindings) {
      const recentCount = recentRecTypes.get(pf.type) || 0;
      if (recentCount < 3) { // max 3 of same type per day
        allFindings.push(pf);
      }
    }

    const configFindings = suggestConfigChanges(currentGasCostUsd, 18);
    allFindings.push(...configFindings);
  } catch (err) {
    console.error('Optimizer failed:', err.message);
  }

  // 5. Only send if we have actionable findings (recs or warnings)
  const actionable = allFindings.filter(f => f.severity === 'recommendation' || f.severity === 'warning');
  const infos = allFindings.filter(f => f.severity === 'info');

  // Always send if there are recommendations/warnings
  // Send info-only reports once every 4 cycles (~1 hour at 15min interval)
  const cycleCount = Math.floor(Date.now() / (INTERVAL_MIN * 60 * 1000));
  const sendInfoOnly = cycleCount % 4 === 0;

  if (actionable.length > 0) {
    console.log(`  Found ${actionable.length} actionable + ${infos.length} info findings. Sending to Telegram...`);
    const delivery = await sendFindings(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, allFindings);
    if (!delivery.ok) {
      const outPath = persistOutbox(allFindings, delivery);
      console.warn(`  Telegram delivery failed (${delivery.failedChunks} chunk(s)). Saved report locally: ${outPath}`);
    } else {
      console.log(`  Telegram delivery ok (${delivery.sentChunks} chunk(s)).`);
    }
  } else if (sendInfoOnly && infos.length > 0) {
    console.log(`  Status report cycle. Sending ${infos.length} info findings...`);
    const delivery = await sendFindings(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, infos);
    if (!delivery.ok) {
      const outPath = persistOutbox(infos, delivery);
      console.warn(`  Telegram status delivery failed (${delivery.failedChunks} chunk(s)). Saved report locally: ${outPath}`);
    } else {
      console.log(`  Telegram status delivery ok (${delivery.sentChunks} chunk(s)).`);
    }
  } else {
    console.log(`  ${infos.length} info findings, no actionable items. Skipping Telegram.`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Cycle complete in ${elapsed}s. Total findings: ${allFindings.length}`);
}

async function createProvider() {
  let lastError = null;

  for (const rpc of RPC_FALLBACKS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      await provider.getBlockNumber();
      if (rpc !== RPC_URL) {
        console.warn(`Using fallback RPC endpoint: ${rpc}`);
      }
      return provider;
    } catch (error) {
      lastError = error;
      console.warn(`RPC endpoint failed: ${rpc} (${error.message})`);
    }
  }

  throw new Error(`All RPC endpoints failed${lastError ? `: ${lastError.message}` : ''}`);
}

// ---------- Entry Point ----------

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Scout Agent — DeFi Intelligence Monitor');
  console.log('═══════════════════════════════════════════');
  console.log(`  Contract: ${CONTRACT_ADDRESS}`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Interval: ${INTERVAL_MIN} min`);
  console.log(`  Mode:     ${RUN_ONCE ? 'single run' : 'continuous'}`);
  console.log('═══════════════════════════════════════════\n');

  // Initial run (non-fatal; keep process alive for next scheduled cycle)
  try {
    await runCycle();
  } catch (err) {
    console.error(`Initial cycle failed: ${err.message}`);
  }

  if (RUN_ONCE) {
    console.log('\n--once flag set, exiting.');
    process.exit(0);
  }

  // Schedule recurring runs
  const intervalMs = INTERVAL_MIN * 60 * 1000;
  setInterval(async () => {
    try {
      await runCycle();
    } catch (err) {
      console.error(`Cycle failed: ${err.message}`);
    }
  }, intervalMs);

  console.log(`\nAgent running. Next cycle in ${INTERVAL_MIN} minutes. Press Ctrl+C to stop.\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
