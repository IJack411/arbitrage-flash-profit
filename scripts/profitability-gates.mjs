import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const SUPABASE_ENV_PATH = path.join(ROOT, 'supabase', '.env.local');

const defaults = {
  WINDOW_ATTEMPTS: 500,
  WINDOW_SCANNER_RUNS: 100,
  MIN_ATTEMPTS: 100,
  MIN_INCLUDED: 30,
  MIN_INCLUSION_RATE_PCT: 25,
  MIN_REALIZED_SAMPLES: 20,
  MIN_MEDIAN_REALIZED_NET_USD: 0,
  MAX_P90_LATENCY_MS: 12000,
  MIN_AVG_ELIGIBLE_PER_RUN: 0.2,
};

function parseDotEnv(fileText) {
  const result = {};
  const lines = fileText.split(/\r?\n/);

  for (const line of lines) {
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

function loadEnvFromFiles() {
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
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[rank];
}

async function fetchJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText} while requesting ${url} :: ${body}`);
  }

  const json = await response.json().catch(() => []);
  return Array.isArray(json) ? json : [];
}

function formatNum(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return Number(value).toFixed(digits);
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function evaluateGate(name, pass, actual, target, details = '') {
  return { name, pass, actual, target, details };
}

async function main() {
  const { rootEnv, supabaseEnv } = loadEnvFromFiles();

  const supabaseUrl = envValue(rootEnv, supabaseEnv, 'VITE_SUPABASE_URL', '').replace(/\/$/, '');
  const apiKey = envValue(
    rootEnv,
    supabaseEnv,
    'SUPABASE_SERVICE_ROLE_KEY',
    envValue(rootEnv, supabaseEnv, 'VITE_SUPABASE_ANON_KEY', ''),
  );

  if (!supabaseUrl || !apiKey) {
    console.error('Missing Supabase credentials. Require VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }

  const windowAttempts = Math.max(50, Math.round(numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_WINDOW_ATTEMPTS', defaults.WINDOW_ATTEMPTS)));
  const windowScannerRuns = Math.max(20, Math.round(numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_WINDOW_SCANNER_RUNS', defaults.WINDOW_SCANNER_RUNS)));

  const minAttempts = numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_MIN_ATTEMPTS', defaults.MIN_ATTEMPTS);
  const minIncluded = numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_MIN_INCLUDED', defaults.MIN_INCLUDED);
  const minInclusionRatePct = numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_MIN_INCLUSION_RATE_PCT', defaults.MIN_INCLUSION_RATE_PCT);
  const minRealizedSamples = numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_MIN_REALIZED_SAMPLES', defaults.MIN_REALIZED_SAMPLES);
  const minMedianRealizedNetUsd = numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_MIN_MEDIAN_REALIZED_NET_USD', defaults.MIN_MEDIAN_REALIZED_NET_USD);
  const maxP90LatencyMs = numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_MAX_P90_LATENCY_MS', defaults.MAX_P90_LATENCY_MS);
  const minAvgEligiblePerRun = numberEnv(rootEnv, supabaseEnv, 'PROFIT_GATE_MIN_AVG_ELIGIBLE_PER_RUN', defaults.MIN_AVG_ELIGIBLE_PER_RUN);

  const baseUrl = `${supabaseUrl}/rest/v1`;

  const executionAttempts = await fetchJson(
    `${baseUrl}/execution_attempts?select=id,included,failure_reason,latency_ms,realized_net_profit,submitted_at&order=submitted_at.desc&limit=${windowAttempts}`,
    apiKey,
  );

  const scannerRuns = await fetchJson(
    `${baseUrl}/scanner_runs?select=id,started_at,eligible_count,watchlist_count,opportunities_found&order=started_at.desc&limit=${windowScannerRuns}`,
    apiKey,
  );

  const totalAttempts = executionAttempts.length;
  const resolvedAttempts = executionAttempts.filter((row) => row.included === true || row.included === false).length;
  const includedAttempts = executionAttempts.filter((row) => row.included === true).length;
  const inclusionRatePct = resolvedAttempts > 0 ? (includedAttempts / resolvedAttempts) * 100 : 0;

  const latencies = executionAttempts
    .map((row) => Number(row.latency_ms))
    .filter((value) => Number.isFinite(value) && value > 0);

  const p90LatencyMs = percentile(latencies, 90);

  const realizedNetProfits = executionAttempts
    .map((row) => Number(row.realized_net_profit))
    .filter((value) => Number.isFinite(value));

  const medianRealizedNetUsd = median(realizedNetProfits);

  const avgEligiblePerRun = scannerRuns.length > 0
    ? scannerRuns.reduce((acc, row) => acc + Number(row.eligible_count || 0), 0) / scannerRuns.length
    : 0;

  const avgWatchPerRun = scannerRuns.length > 0
    ? scannerRuns.reduce((acc, row) => acc + Number(row.watchlist_count || 0), 0) / scannerRuns.length
    : 0;

  const gates = [
    evaluateGate(
      'Minimum recent execution attempts',
      totalAttempts >= minAttempts,
      totalAttempts,
      `>= ${minAttempts}`,
    ),
    evaluateGate(
      'Minimum included executions',
      includedAttempts >= minIncluded,
      includedAttempts,
      `>= ${minIncluded}`,
      `resolved=${resolvedAttempts}`,
    ),
    evaluateGate(
      'Minimum inclusion rate',
      inclusionRatePct >= minInclusionRatePct,
      `${formatNum(inclusionRatePct)}%`,
      `>= ${formatNum(minInclusionRatePct)}%`,
      `included=${includedAttempts}, resolved=${resolvedAttempts}`,
    ),
    evaluateGate(
      'Maximum p90 execution latency',
      p90LatencyMs !== null && p90LatencyMs <= maxP90LatencyMs,
      p90LatencyMs === null ? 'n/a' : `${Math.round(p90LatencyMs)}ms`,
      `<= ${Math.round(maxP90LatencyMs)}ms`,
      `latency_samples=${latencies.length}`,
    ),
    evaluateGate(
      'Minimum realized PnL samples',
      realizedNetProfits.length >= minRealizedSamples,
      realizedNetProfits.length,
      `>= ${minRealizedSamples}`,
    ),
    evaluateGate(
      'Minimum median realized net PnL',
      medianRealizedNetUsd !== null && medianRealizedNetUsd > minMedianRealizedNetUsd,
      medianRealizedNetUsd === null ? 'n/a' : `$${formatNum(medianRealizedNetUsd, 4)}`,
      `> $${formatNum(minMedianRealizedNetUsd, 4)}`,
    ),
    evaluateGate(
      'Minimum scanner opportunity density',
      avgEligiblePerRun >= minAvgEligiblePerRun,
      formatNum(avgEligiblePerRun, 3),
      `>= ${formatNum(minAvgEligiblePerRun, 3)}`,
      `runs=${scannerRuns.length}, avg_watch=${formatNum(avgWatchPerRun, 3)}`,
    ),
  ];

  const failingGates = gates.filter((gate) => !gate.pass);

  printSection('Profitability Windows');
  console.log(`execution_attempts_window=${windowAttempts}`);
  console.log(`scanner_runs_window=${windowScannerRuns}`);

  printSection('Observed Metrics');
  console.log(`total_attempts=${totalAttempts}`);
  console.log(`resolved_attempts=${resolvedAttempts}`);
  console.log(`included_attempts=${includedAttempts}`);
  console.log(`inclusion_rate_pct=${formatNum(inclusionRatePct)}`);
  console.log(`p90_latency_ms=${p90LatencyMs === null ? 'n/a' : Math.round(p90LatencyMs)}`);
  console.log(`realized_pnl_samples=${realizedNetProfits.length}`);
  console.log(`median_realized_net_usd=${medianRealizedNetUsd === null ? 'n/a' : formatNum(medianRealizedNetUsd, 4)}`);
  console.log(`avg_eligible_per_run=${formatNum(avgEligiblePerRun, 3)}`);
  console.log(`avg_watch_per_run=${formatNum(avgWatchPerRun, 3)}`);

  printSection('Gate Results');
  for (const gate of gates) {
    const marker = gate.pass ? 'PASS' : 'FAIL';
    const suffix = gate.details ? ` | ${gate.details}` : '';
    console.log(`${marker} ${gate.name}: actual=${gate.actual} target=${gate.target}${suffix}`);
  }

  printSection('Decision');
  if (failingGates.length > 0) {
    console.log(`NO-GO (${failingGates.length} failing gates).`);
    process.exit(1);
  }

  console.log('GO (all profitability gates passed).');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
