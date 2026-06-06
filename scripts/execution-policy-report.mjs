import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const SUPABASE_ENV_PATH = path.join(ROOT, 'supabase', '.env.local');

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
  const rootEnv = fs.existsSync(ENV_PATH) ? parseDotEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
  const supabaseEnv = fs.existsSync(SUPABASE_ENV_PATH) ? parseDotEnv(fs.readFileSync(SUPABASE_ENV_PATH, 'utf8')) : {};
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

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function formatNum(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return Number(value).toFixed(digits);
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
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

function summarize(rows) {
  const summary = {
    total: rows.length,
    included: 0,
    excluded: 0,
    policyRejected: 0,
    simulationRejected: 0,
    relayRejected: 0,
    unsupportedRejected: 0,
    pending: 0,
    noCandidateNetwork: 0,
    noCandidatePolicy: 0,
    confidence: [],
    netProfit: [],
    gasCost: [],
    gasToNetRatio: [],
    latency: [],
    policyRejectionsByCause: {},
    policyRejectionsByRoute: {},
  };

  for (const row of rows) {
    if (row.included === true) summary.included += 1;
    else if (row.included === false) summary.excluded += 1;
    else summary.pending += 1;

    const failureReason = String(row.failure_reason || '').toLowerCase();
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const rejectCause = String(metadata.rejectCause || '').trim();

    if (failureReason === 'execution_policy_rejected') {
      summary.policyRejected += 1;
      if (rejectCause) summary.policyRejectionsByCause[rejectCause] = (summary.policyRejectionsByCause[rejectCause] || 0) + 1;

      const routeKey = String(metadata.routeKey || metadata.route || metadata.tokenPair || '').trim();
      if (routeKey) summary.policyRejectionsByRoute[routeKey] = (summary.policyRejectionsByRoute[routeKey] || 0) + 1;
    }

    if (failureReason.includes('simulation')) summary.simulationRejected += 1;
    if (failureReason.includes('relay')) summary.relayRejected += 1;
    if (failureReason.includes('unsupported')) summary.unsupportedRejected += 1;

    if (failureReason === 'no_candidate') summary.noCandidatePolicy += 1;
    if (failureReason === 'network_not_available' || failureReason === 'unsupported_network') summary.noCandidateNetwork += 1;

    const conf = Number(metadata?.observed?.confidenceScore ?? metadata?.confidenceScore ?? row?.confidence_score ?? NaN);
    if (Number.isFinite(conf)) summary.confidence.push(conf);

    const net = Number(metadata?.observed?.netProfit ?? metadata?.netProfit ?? row?.realized_net_profit ?? NaN);
    if (Number.isFinite(net)) summary.netProfit.push(net);

    const gas = Number(metadata?.observed?.gasCost ?? metadata?.gasCost ?? NaN);
    if (Number.isFinite(gas)) summary.gasCost.push(gas);

    const ratio = Number(metadata?.observed?.gasToNetRatio ?? NaN);
    if (Number.isFinite(ratio)) summary.gasToNetRatio.push(ratio);

    const latency = Number(row.latency_ms ?? NaN);
    if (Number.isFinite(latency) && latency > 0) summary.latency.push(latency);
  }

  return summary;
}

async function main() {
  const { rootEnv, supabaseEnv } = loadEnvFiles();
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

  const windowAttempts = Math.max(50, Math.round(numberEnv(rootEnv, supabaseEnv, 'POLICY_REPORT_WINDOW_ATTEMPTS', 250)));
  const windowScannerRuns = Math.max(20, Math.round(numberEnv(rootEnv, supabaseEnv, 'POLICY_REPORT_WINDOW_SCANNER_RUNS', 100)));

  const baseUrl = `${supabaseUrl}/rest/v1`;
  const executionAttempts = await fetchJson(
    `${baseUrl}/execution_attempts?select=id,included,failure_reason,latency_ms,realized_net_profit,metadata,submitted_at&order=submitted_at.desc&limit=${windowAttempts}`,
    apiKey,
  );
  const scannerRuns = await fetchJson(
    `${baseUrl}/scanner_runs?select=id,started_at,eligible_count,watchlist_count,opportunities_found,diagnostics&order=started_at.desc&limit=${windowScannerRuns}`,
    apiKey,
  );

  const attemptSummary = summarize(executionAttempts);
  const resolvedAttempts = attemptSummary.included + attemptSummary.excluded;
  const inclusionRatePct = resolvedAttempts > 0 ? (attemptSummary.included / resolvedAttempts) * 100 : 0;
  const netMedian = median(attemptSummary.netProfit);
  const netMean = mean(attemptSummary.netProfit);
  const gasMedian = median(attemptSummary.gasCost);
  const ratioMedian = median(attemptSummary.gasToNetRatio);
  const latencyP90 = percentile(attemptSummary.latency, 90);
  const latencyMedian = median(attemptSummary.latency);

  const avgEligiblePerRun = scannerRuns.length > 0
    ? scannerRuns.reduce((acc, row) => acc + Number(row.eligible_count || 0), 0) / scannerRuns.length
    : 0;
  const avgWatchPerRun = scannerRuns.length > 0
    ? scannerRuns.reduce((acc, row) => acc + Number(row.watchlist_count || 0), 0) / scannerRuns.length
    : 0;
  const runsWithExecFeedback = scannerRuns.filter((row) => Boolean(row?.diagnostics?.executionFeedback)).length;

  printSection('Execution Policy Report');
  console.log(`window_attempts=${windowAttempts}`);
  console.log(`window_scanner_runs=${windowScannerRuns}`);

  printSection('Execution Attempt Summary');
  console.log(`total_attempts=${attemptSummary.total}`);
  console.log(`resolved_attempts=${resolvedAttempts}`);
  console.log(`included_attempts=${attemptSummary.included}`);
  console.log(`excluded_attempts=${attemptSummary.excluded}`);
  console.log(`pending_attempts=${attemptSummary.pending}`);
  console.log(`policy_rejected=${attemptSummary.policyRejected}`);
  console.log(`simulation_rejected=${attemptSummary.simulationRejected}`);
  console.log(`relay_rejected=${attemptSummary.relayRejected}`);
  console.log(`unsupported_rejected=${attemptSummary.unsupportedRejected}`);
  console.log(`inclusion_rate_pct=${formatNum(inclusionRatePct)}`);
  console.log(`latency_median_ms=${latencyMedian === null ? 'n/a' : Math.round(latencyMedian)}`);
  console.log(`latency_p90_ms=${latencyP90 === null ? 'n/a' : Math.round(latencyP90)}`);
  console.log(`net_profit_median=${formatNum(netMedian, 4)}`);
  console.log(`net_profit_mean=${formatNum(netMean, 4)}`);
  console.log(`gas_cost_median=${formatNum(gasMedian, 4)}`);
  console.log(`gas_to_net_ratio_median=${formatNum(ratioMedian, 4)}`);

  printSection('Execution Policy Causes');
  const causeEntries = Object.entries(attemptSummary.policyRejectionsByCause).sort((a, b) => b[1] - a[1]);
  if (causeEntries.length === 0) {
    console.log('none');
  } else {
    for (const [cause, count] of causeEntries) {
      console.log(`${cause}=${count}`);
    }
  }

  printSection('Top Rejected Routes');
  const routeEntries = Object.entries(attemptSummary.policyRejectionsByRoute).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (routeEntries.length === 0) {
    console.log('none');
  } else {
    for (const [route, count] of routeEntries) {
      console.log(`${route}=${count}`);
    }
  }

  printSection('Scanner Behavior');
  console.log(`scanner_runs=${scannerRuns.length}`);
  console.log(`avg_eligible_per_run=${formatNum(avgEligiblePerRun, 3)}`);
  console.log(`avg_watch_per_run=${formatNum(avgWatchPerRun, 3)}`);
  console.log(`runs_with_execution_feedback=${runsWithExecFeedback}`);

  printSection('Threshold Suggestions');
  const suggestions = [];
  if (attemptSummary.policyRejected > 0 && attemptSummary.policyRejected > attemptSummary.included) {
    suggestions.push('Raise quality thresholds or reduce scan volume for routes with repeated policy rejections.');
  }
  if (resolvedAttempts > 0 && inclusionRatePct < 25) {
    suggestions.push('Keep EXEC_MAX_GAS_TO_NET_RATIO tight and increase min confidence before scaling capital.');
  }
  if (netMedian !== null && netMedian <= 0) {
    suggestions.push('Increase EXEC_MIN_NET_PROFIT_USD or tighten the scanner-side min profit floor.');
  }
  if (avgEligiblePerRun < 0.2) {
    suggestions.push('Scanner opportunity density is low; use adaptive sampling only until density improves.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Current policy settings look broadly consistent with recent observed outcomes.');
  }
  for (const suggestion of suggestions) {
    console.log(`- ${suggestion}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
