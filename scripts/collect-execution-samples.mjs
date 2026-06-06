import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const SUPABASE_ENV_PATH = path.join(ROOT, 'supabase', '.env.local');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseDotEnv(fileText) {
  const result = {};
  for (const line of fileText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }
  return result;
}

function loadEnvFiles() {
  const rootEnv = fs.existsSync(ENV_PATH)
    ? parseDotEnv(fs.readFileSync(ENV_PATH, 'utf8'))
    : {};

  const supabaseEnv = fs.existsSync(SUPABASE_ENV_PATH)
    ? parseDotEnv(fs.readFileSync(SUPABASE_ENV_PATH, 'utf8'))
    : {};

  return { rootEnv, supabaseEnv };
}

function envValue(rootEnv, supabaseEnv, key, fallback = '') {
  const processValue = process.env[key];
  if (processValue !== undefined && processValue !== '') return processValue;
  if (rootEnv[key] !== undefined && rootEnv[key] !== '') return rootEnv[key];
  if (supabaseEnv[key] !== undefined && supabaseEnv[key] !== '') return supabaseEnv[key];
  return fallback;
}

function numberEnv(rootEnv, supabaseEnv, key, fallback) {
  const raw = envValue(rootEnv, supabaseEnv, key, String(fallback));
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(rootEnv, supabaseEnv, key, fallback) {
  const raw = String(envValue(rootEnv, supabaseEnv, key, fallback ? 'true' : 'false')).toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function parseFlag(name) {
  return process.argv.includes(name);
}

function buildHeaders(anonKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }
  return headers;
}

function formatNow() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pickCandidate(
  opportunities,
  targetNetwork,
  minNetProfitUsd,
  requireActive,
  minConfidenceScore,
  maxGasToNetRatio,
) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return null;

  const filtered = opportunities
    .filter((opp) => String(opp?.network || '').toLowerCase() === targetNetwork)
    .filter((opp) => !requireActive || String(opp?.status || '').toLowerCase() === 'active')
    .filter((opp) => Number(opp?.netProfit ?? 0) >= minNetProfitUsd)
    .filter((opp) => Number(opp?.confidenceScore ?? 0) >= minConfidenceScore)
    .filter((opp) => {
      const netProfit = Number(opp?.netProfit ?? 0);
      const gasCost = Number(opp?.gasCost ?? 0);
      if (!Number.isFinite(netProfit) || netProfit <= 0) return false;
      if (!Number.isFinite(gasCost) || gasCost < 0) return false;
      const gasToNetRatio = gasCost / netProfit;
      return gasToNetRatio <= maxGasToNetRatio;
    })
    .filter((opp) => {
      const payloadNetwork = String(opp?.executionPayload?.network ?? opp?.network ?? '').toLowerCase();
      return payloadNetwork === 'ethereum';
    });

  if (filtered.length === 0) return null;

  filtered.sort((a, b) => {
    const netA = Number(a.netProfit ?? 0);
    const netB = Number(b.netProfit ?? 0);
    const confA = Number(a.confidenceScore ?? 0) / 100;
    const confB = Number(b.confidenceScore ?? 0) / 100;
    const gasA = Number(a.gasCost ?? 0);
    const gasB = Number(b.gasCost ?? 0);
    const ratioA = netA > 0 ? gasA / netA : 99;
    const ratioB = netB > 0 ? gasB / netB : 99;
    const scoreA = netA * Math.max(0, confA) / (1 + ratioA);
    const scoreB = netB * Math.max(0, confB) / (1 + ratioB);

    const scoreDiff = scoreB - scoreA;
    if (scoreDiff !== 0) return scoreDiff;

    const netDiff = netB - netA;
    if (netDiff !== 0) return netDiff;

    return Number(b.confidenceScore ?? 0) - Number(a.confidenceScore ?? 0);
  });

  return filtered[0];
}

async function scan(scanUrl, headers, payload) {
  const response = await fetch(scanUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    const reason = json?.error || `HTTP ${response.status}`;
    throw new Error(`scan failed: ${reason}`);
  }
  return json;
}

async function execute(execUrl, headers, params) {
  const response = await fetch(execUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'execute-arbitrage',
      params,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    const reason = json?.error || `HTTP ${response.status}`;
    throw new Error(`execute failed: ${reason}`);
  }

  return json;
}

async function main() {
  const { rootEnv, supabaseEnv } = loadEnvFiles();

  const scanOnly = parseFlag('--scan-only') || boolEnv(rootEnv, supabaseEnv, 'COLLECT_SCAN_ONLY', false);

  const supabaseUrl = envValue(rootEnv, supabaseEnv, 'VITE_SUPABASE_URL', '').replace(/\/$/, '');
  const scanUrl = envValue(
    rootEnv,
    supabaseEnv,
    'COLLECT_SCAN_URL',
    supabaseUrl ? `${supabaseUrl}/functions/v1/scan-arbitrage-opportunities` : 'http://127.0.0.1:54321/functions/v1/scan-arbitrage-opportunities',
  );
  const execUrl = envValue(
    rootEnv,
    supabaseEnv,
    'COLLECT_EXEC_URL',
    supabaseUrl ? `${supabaseUrl}/functions/v1/flashbots-executor` : 'http://127.0.0.1:54321/functions/v1/flashbots-executor',
  );

  const anonKey = envValue(rootEnv, supabaseEnv, 'SUPABASE_ANON_KEY', envValue(rootEnv, supabaseEnv, 'VITE_SUPABASE_ANON_KEY', ''));
  const contractAddress = envValue(rootEnv, supabaseEnv, 'AUTO_CONTRACT_ADDRESS', envValue(rootEnv, supabaseEnv, 'VITE_ARBITRAGE_CONTRACT_ADDRESS', ''));
  const walletAddress = envValue(rootEnv, supabaseEnv, 'AUTO_WALLET_ADDRESS', '');

  const targetNetwork = String(envValue(rootEnv, supabaseEnv, 'COLLECT_NETWORK', 'ethereum')).toLowerCase();
  const intervalMs = Math.max(10_000, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_INTERVAL_MS', 30_000)));
  const maxCycles = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_MAX_CYCLES', 120)));
  const maxAttempts = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_MAX_ATTEMPTS', 40)));

  const loanAmountUsd = Math.max(100, numberEnv(rootEnv, supabaseEnv, 'COLLECT_LOAN_USD', 3000));
  const estimatedGasUsd = Math.max(0.1, numberEnv(rootEnv, supabaseEnv, 'COLLECT_ESTIMATED_GAS_USD', 8));
  const minNetProfitUsd = numberEnv(rootEnv, supabaseEnv, 'COLLECT_MIN_NET_PROFIT_USD', 15);
  const maxSlippageBps = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_MAX_SLIPPAGE_BPS', 65)));
  const minConfidenceScore = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_MIN_CONFIDENCE_SCORE', 40)));
  const maxGasToNetRatio = Math.max(0.05, numberEnv(rootEnv, supabaseEnv, 'COLLECT_MAX_GAS_TO_NET_RATIO', 0.6));
  const requireActive = boolEnv(rootEnv, supabaseEnv, 'COLLECT_REQUIRE_ACTIVE', true);

  const adaptiveEnabled = boolEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_ENABLED', true);
  const adaptiveStreak = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_NO_CANDIDATE_STREAK', 3)));
  const adaptiveMinNetStep = Math.max(0.1, numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_MIN_NET_STEP', 2));
  const adaptiveMinNetFloor = Math.max(0, numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_MIN_NET_FLOOR', 10));
  const adaptiveConfidenceStep = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_CONF_STEP', 3)));
  const adaptiveConfidenceFloor = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_CONF_FLOOR', 30)));
  const adaptiveGasRatioStep = Math.max(0.01, numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_GAS_RATIO_STEP', 0.05));
  const adaptiveGasRatioCap = Math.max(maxGasToNetRatio, numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_GAS_RATIO_CAP', 0.7));
  const adaptiveSlippageStep = Math.max(1, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_SLIPPAGE_STEP', 5)));
  const adaptiveSlippageCap = Math.max(maxSlippageBps, Math.round(numberEnv(rootEnv, supabaseEnv, 'COLLECT_ADAPTIVE_SLIPPAGE_CAP', 80)));

  let currentMinNetProfitUsd = minNetProfitUsd;
  let currentMinConfidenceScore = minConfidenceScore;
  let currentMaxGasToNetRatio = maxGasToNetRatio;
  let currentMaxSlippageBps = maxSlippageBps;
  let noCandidateStreak = 0;

  if (!scanOnly && !contractAddress) {
    console.error('Missing contract address. Set AUTO_CONTRACT_ADDRESS or VITE_ARBITRAGE_CONTRACT_ADDRESS.');
    process.exit(1);
  }

  const headers = buildHeaders(anonKey);

  const summary = {
    cycles: 0,
    scans: 0,
    scanErrors: 0,
    noCandidate: 0,
    attemptedExec: 0,
    execSuccess: 0,
    execFail: 0,
    included: 0,
    notIncluded: 0,
    pending: 0,
    relaxations: 0,
  };

  console.log(
    `[${formatNow()}] collection start network=${targetNetwork} scanOnly=${scanOnly} intervalMs=${intervalMs} maxCycles=${maxCycles} maxAttempts=${maxAttempts}`,
  );
  console.log(
    `[${formatNow()}] quality gates minNet=${minNetProfitUsd} minConfidence=${minConfidenceScore} maxGasToNetRatio=${maxGasToNetRatio}`,
  );
  if (adaptiveEnabled) {
    console.log(
      `[${formatNow()}] adaptive enabled streak=${adaptiveStreak} floors/caps minNetFloor=${adaptiveMinNetFloor} confFloor=${adaptiveConfidenceFloor} gasRatioCap=${adaptiveGasRatioCap} slippageCap=${adaptiveSlippageCap}`,
    );
  }

  while (summary.cycles < maxCycles && (scanOnly || summary.attemptedExec < maxAttempts)) {
    summary.cycles += 1;

    const scanPayload = {
      scheduledRun: true,
      networks: [targetNetwork],
      loanAmountUsd,
      estimatedGasUsd,
      minNetProfitUsd: currentMinNetProfitUsd,
      maxSlippageBps: currentMaxSlippageBps,
      maxResults: 6,
    };

    try {
      const scanResult = await scan(scanUrl, headers, scanPayload);
      summary.scans += 1;
      const opportunities = Array.isArray(scanResult.opportunities) ? scanResult.opportunities : [];
      const candidate = pickCandidate(
        opportunities,
        targetNetwork,
        currentMinNetProfitUsd,
        requireActive,
        currentMinConfidenceScore,
        currentMaxGasToNetRatio,
      );

      if (!candidate) {
        summary.noCandidate += 1;
        noCandidateStreak += 1;
        console.log(`[${formatNow()}] cycle=${summary.cycles} no candidate found active=${opportunities.length}`);

        if (adaptiveEnabled && noCandidateStreak % adaptiveStreak === 0) {
          const prevMinNet = currentMinNetProfitUsd;
          const prevConf = currentMinConfidenceScore;
          const prevGasRatio = currentMaxGasToNetRatio;
          const prevSlippage = currentMaxSlippageBps;

          currentMinNetProfitUsd = clamp(currentMinNetProfitUsd - adaptiveMinNetStep, adaptiveMinNetFloor, minNetProfitUsd);
          currentMinConfidenceScore = Math.round(clamp(currentMinConfidenceScore - adaptiveConfidenceStep, adaptiveConfidenceFloor, minConfidenceScore));
          currentMaxGasToNetRatio = clamp(currentMaxGasToNetRatio + adaptiveGasRatioStep, maxGasToNetRatio, adaptiveGasRatioCap);
          currentMaxSlippageBps = Math.round(clamp(currentMaxSlippageBps + adaptiveSlippageStep, maxSlippageBps, adaptiveSlippageCap));

          const changed = prevMinNet !== currentMinNetProfitUsd
            || prevConf !== currentMinConfidenceScore
            || prevGasRatio !== currentMaxGasToNetRatio
            || prevSlippage !== currentMaxSlippageBps;

          if (changed) {
            summary.relaxations += 1;
            console.log(
              `[${formatNow()}] adaptive relax #${summary.relaxations} minNet=${currentMinNetProfitUsd} minConfidence=${currentMinConfidenceScore} maxGasToNetRatio=${currentMaxGasToNetRatio.toFixed(2)} maxSlippageBps=${currentMaxSlippageBps}`,
            );
          }
        }
      } else if (scanOnly) {
        noCandidateStreak = 0;
        const net = Number(candidate?.netProfit ?? 0).toFixed(4);
        console.log(`[${formatNow()}] cycle=${summary.cycles} candidate=${candidate.tokenPair} route=${candidate.buyDex}->${candidate.sellDex} net=${net} (scan-only)`);
      } else {
        noCandidateStreak = 0;
        summary.attemptedExec += 1;
        const net = Number(candidate?.netProfit ?? 0).toFixed(4);
        console.log(`[${formatNow()}] cycle=${summary.cycles} executing=${candidate.tokenPair} route=${candidate.buyDex}->${candidate.sellDex} net=${net}`);

        try {
          const result = await execute(execUrl, headers, {
            walletAddress: walletAddress || undefined,
            contractAddress,
            opportunity: candidate,
            scanRunId: candidate?.scanRunId,
            candidateId: candidate?.candidateId,
          });

          summary.execSuccess += 1;
          if (result?.included === true) summary.included += 1;
          else if (result?.included === false) summary.notIncluded += 1;
          else summary.pending += 1;

          console.log(`[${formatNow()}] cycle=${summary.cycles} bundle=${result?.bundleHash || 'n/a'} included=${String(result?.included)}`);
        } catch (error) {
          summary.execFail += 1;
          console.log(`[${formatNow()}] cycle=${summary.cycles} execute error=${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      summary.scanErrors += 1;
      console.log(`[${formatNow()}] cycle=${summary.cycles} scan error=${error instanceof Error ? error.message : String(error)}`);
    }

    if (summary.cycles < maxCycles && (scanOnly || summary.attemptedExec < maxAttempts)) {
      await sleep(intervalMs);
    }
  }

  console.log('\n=== Collection Summary ===');
  summary.finalThresholds = {
    minNetProfitUsd: currentMinNetProfitUsd,
    minConfidenceScore: currentMinConfidenceScore,
    maxGasToNetRatio: Number(currentMaxGasToNetRatio.toFixed(2)),
    maxSlippageBps: currentMaxSlippageBps,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!scanOnly && summary.attemptedExec === 0) {
    console.error('No execution attempts were submitted. Loosen thresholds or extend runtime.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
