#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function check(path) {
  return existsSync(resolve(root, path));
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function runNodeScript(relPath, args = []) {
  const result = spawnSync('node', [relPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
  });
  return result;
}

function loadAnonKey() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return '';
  const content = readFileSync(envPath, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((l) => l.startsWith('VITE_SUPABASE_ANON_KEY='));
  return line ? line.slice('VITE_SUPABASE_ANON_KEY='.length).trim() : '';
}

async function probeScanner() {
  const anon = loadAnonKey();
  if (!anon) {
    return { ok: false, reason: 'missing VITE_SUPABASE_ANON_KEY in .env' };
  }

  const body = {
    loanAmountUsd: 2000,
    minNetProfitUsd: 2,
    minSpreadPercent: 0.01,
    minLiquidityUsd: 20000,
    maxSlippageBps: 80,
    estimatedGasUsd: 4,
    maxLiquidityUsagePercent: 20,
    maxResults: 40,
  };

  try {
    const res = await fetch('https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/scan-arbitrage-opportunities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}`, response: json };
    }

    const d = json.diagnostics || {};
    return {
      ok: true,
      found: json.found || 0,
      watchlistCount: json.watchlistCount || 0,
      poolCounts: d.poolCounts || {},
      quoteSourceCounts: d.quoteSourceCounts || {},
      candidates: d.candidates || 0,
      executionFeasible: d.executionFeasible || 0,
      profitQualified: d.profitQualified || 0,
      topRejectionReason: d.topRejectionReason || 'n/a',
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

async function main() {
  printSection('Agent Files');
  const files = [
    '.copilot/agents/serena.agent.md',
    '.copilot/agents/arbitrage-scout.agent.md',
    'scout-agent/index.mjs',
    'scripts/verify-serena.js',
  ];

  for (const f of files) {
    console.log(`${check(f) ? 'PASS' : 'FAIL'} ${f}`);
  }

  printSection('Serena Verification');
  const verify = runNodeScript('scripts/verify-serena.js');
  if (verify.status === 0) {
    console.log('PASS verify-serena.js');
    if (verify.stdout.trim()) console.log(verify.stdout.trim());
  } else {
    console.log('FAIL verify-serena.js');
    console.log((verify.stderr || verify.stdout || '').trim());
  }

  printSection('Scout One-Shot');
  const scout = runNodeScript('scout-agent/index.mjs', ['--once']);
  if (scout.status === 0) {
    console.log('PASS scout-agent --once');
    const lines = (scout.stdout || '').trim().split(/\r?\n/).slice(-12);
    console.log(lines.join('\n'));
  } else {
    console.log('FAIL scout-agent --once');
    const msg = (scout.stderr || scout.stdout || '').trim();
    console.log(msg.split(/\r?\n/).slice(-15).join('\n'));
  }

  printSection('Scanner Probe');
  const probe = await probeScanner();
  if (!probe.ok) {
    console.log(`FAIL scanner probe: ${probe.reason}`);
    if (probe.response) console.log(JSON.stringify(probe.response, null, 2));
  } else {
    console.log('PASS scanner probe');
    console.log(JSON.stringify(probe, null, 2));
  }

  printSection('Indexer Rollout Healthcheck');
  const rollout = runNodeScript('scripts/indexer-rollout-healthcheck.mjs');
  if (rollout.status === 0) {
    console.log('PASS indexer-rollout-healthcheck');
    const lines = (rollout.stdout || '').trim().split(/\r?\n/).slice(-20);
    if (lines.length > 0 && lines[0] !== '') console.log(lines.join('\n'));
  } else {
    console.log('FAIL indexer-rollout-healthcheck');
    const msg = (rollout.stderr || rollout.stdout || '').trim();
    console.log(msg.split(/\r?\n/).slice(-25).join('\n'));
  }
}

main().catch((error) => {
  console.error('Fatal:', error.message);
  process.exit(1);
});
