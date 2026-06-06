import fs from 'node:fs';
import path from 'node:path';
import { lookup } from 'node:dns/promises';

const ROOT = process.cwd();

const parseDotEnv = (fileText) => {
  const out = {};
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
    out[key] = value;
  }
  return out;
};

const loadEnv = () => {
  const merged = { ...process.env };
  const files = [
    path.join(ROOT, '.env'),
    path.join(ROOT, 'supabase', '.env.local'),
  ];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseDotEnv(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (merged[key] === undefined || merged[key] === '') {
        merged[key] = value;
      }
    }
  }

  return merged;
};

const env = loadEnv();

const numberEnv = (name, fallback) => {
  const parsed = Number(env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const deriveFunctionsUrl = () => {
  const viteSupabaseUrl = env.VITE_SUPABASE_URL || '';
  if (/^https:\/\//i.test(viteSupabaseUrl)) {
    return `${viteSupabaseUrl.replace(/\/$/, '')}/functions/v1/scan-arbitrage-opportunities`;
  }
  return 'http://127.0.0.1:54321/functions/v1/scan-arbitrage-opportunities';
};

const probeUrl = env.PROBE_URL || env.SUPABASE_FUNCTIONS_URL || deriveFunctionsUrl();
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

const defaults = {
  samples: Math.max(1, Math.min(10, Math.round(numberEnv('INDEX_ROLLOUT_SCORE_SAMPLES', 3)))),
  refreshFirst: String(env.INDEX_ROLLOUT_REFRESH_FIRST || 'true').toLowerCase() === 'true',
  refreshMode: String(env.INDEX_ROLLOUT_REFRESH_MODE || 'fast').trim().toLowerCase() || 'fast',
  refreshMaxPairs: Math.max(10, Math.round(numberEnv('INDEX_ROLLOUT_REFRESH_MAX_PAIRS', 100))),
  refreshNetworks: String(env.INDEX_ROLLOUT_REFRESH_NETWORKS || 'ethereum,arbitrum,base,polygon')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
  minAcceptedRows: numberEnv('INDEX_ROLLOUT_MIN_ACCEPTED_ROWS', 3),
  minHitPairs: numberEnv('INDEX_ROLLOUT_MIN_HIT_PAIRS', 3),
  minSavedCalls: numberEnv('INDEX_ROLLOUT_MIN_UPSTREAM_CALLS_SAVED', 3),
  minAcceptanceRatePct: numberEnv('INDEX_ROLLOUT_MIN_ACCEPTANCE_RATE_PCT', 4),
  maxP90AgeMs: numberEnv('INDEX_ROLLOUT_MAX_P90_AGE_MS', 120000),
};

const payload = {
  networks: ['ethereum', 'arbitrum', 'base', 'polygon'],
  loanAmountUsd: numberEnv('PROBE_LOAN_AMOUNT_USD', 10000),
  minNetProfitUsd: numberEnv('PROBE_MIN_NET_PROFIT_USD', 6),
  perNetworkMinNetProfitUsd: {
    ethereum: numberEnv('PROBE_MIN_NET_PROFIT_ETHEREUM_USD', 10),
    arbitrum: numberEnv('PROBE_MIN_NET_PROFIT_ARBITRUM_USD', 5),
    base: numberEnv('PROBE_MIN_NET_PROFIT_BASE_USD', 4),
    polygon: numberEnv('PROBE_MIN_NET_PROFIT_POLYGON_USD', 4),
  },
  minLiquidityUsd: numberEnv('PROBE_MIN_LIQUIDITY_USD', 120000),
  minSpreadPercent: numberEnv('PROBE_MIN_SPREAD_PERCENT', 0.03),
  maxResults: numberEnv('PROBE_MAX_RESULTS', 40),
  maxSlippageBps: numberEnv('PROBE_MAX_SLIPPAGE_BPS', 65),
  maxLiquidityUsagePercent: numberEnv('PROBE_MAX_LIQUIDITY_USAGE_PERCENT', 25),
  estimatedGasUsd: numberEnv('PROBE_ESTIMATED_GAS_USD', 12),
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const avg = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const formatNum = (value, digits = 2) => Number(value).toFixed(digits);

const runSample = async (sampleId) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  const response = await fetch(probeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`Sample ${sampleId}: scanner returned non-JSON body`);
  }

  if (!response.ok) {
    throw new Error(`Sample ${sampleId}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  }

  const indexCache = body?.diagnostics?.indexCache;
  if (!indexCache) {
    throw new Error(`Sample ${sampleId}: diagnostics.indexCache missing`);
  }

  const requestedRows = asNumber(indexCache.requestedRows);
  const acceptedRows = asNumber(indexCache.acceptedRows);
  const hitPairs = asNumber(indexCache.hitPairs);
  const misses = asNumber(indexCache.missPairs);
  const savedCalls = asNumber(indexCache.upstreamCallsSaved);
  const p90AgeMs = asNumber(indexCache.p90IndexedRowAgeMs);
  const acceptanceRatePct = requestedRows > 0 ? (acceptedRows / requestedRows) * 100 : 0;

  return {
    sampleId,
    enabled: Boolean(indexCache.enabled),
    requestedRows,
    acceptedRows,
    hitPairs,
    misses,
    savedCalls,
    p90AgeMs,
    acceptanceRatePct,
  };
};

const refreshIndexerFirst = async () => {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  const response = await fetch(probeUrl.replace('scan-arbitrage-opportunities', 'indexer-refresh-fast'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: defaults.refreshMode,
      maxPairs: defaults.refreshMaxPairs,
      networks: defaults.refreshNetworks,
      force: false,
    }),
  });

  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error('Refresh step returned non-JSON body');
  }

  if (!response.ok || !body?.success) {
    throw new Error(`Refresh step failed: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  }

  const upserted = body?.rowsUpserted || {};
  console.log(
    `refresh ok mode=${body.mode || defaults.refreshMode} pairs=${body.pairsScanned ?? 'n/a'} pools=${upserted.pools_index_latest ?? 0} quotes=${upserted.quotes_index_latest ?? 0} durationMs=${body.durationMs ?? 'n/a'}`
  );
};

const evaluateGates = (metrics) => {
  const gates = [
    {
      name: 'Index cache enabled',
      pass: metrics.enabledRatePct >= 100,
      actual: `${formatNum(metrics.enabledRatePct, 1)}%`,
      target: '100%',
    },
    {
      name: 'Accepted index rows',
      pass: metrics.avgAcceptedRows >= defaults.minAcceptedRows,
      actual: formatNum(metrics.avgAcceptedRows, 2),
      target: `>= ${defaults.minAcceptedRows}`,
    },
    {
      name: 'Index hit pairs',
      pass: metrics.avgHitPairs >= defaults.minHitPairs,
      actual: formatNum(metrics.avgHitPairs, 2),
      target: `>= ${defaults.minHitPairs}`,
    },
    {
      name: 'Upstream calls saved',
      pass: metrics.avgSavedCalls >= defaults.minSavedCalls,
      actual: formatNum(metrics.avgSavedCalls, 2),
      target: `>= ${defaults.minSavedCalls}`,
    },
    {
      name: 'Acceptance rate',
      pass: metrics.avgAcceptanceRatePct >= defaults.minAcceptanceRatePct,
      actual: `${formatNum(metrics.avgAcceptanceRatePct, 2)}%`,
      target: `>= ${formatNum(defaults.minAcceptanceRatePct, 2)}%`,
    },
    {
      name: 'Cache freshness (p90 age)',
      pass: metrics.avgP90AgeMs <= defaults.maxP90AgeMs,
      actual: `${Math.round(metrics.avgP90AgeMs)}ms`,
      target: `<= ${Math.round(defaults.maxP90AgeMs)}ms`,
    },
  ];

  return gates;
};

const main = async () => {
  console.log(`Rollout score target: ${probeUrl}`);
  try {
    const host = new URL(probeUrl).hostname;
    const resolved = await lookup(host);
    console.log(`Resolved host: ${host} -> ${resolved.address}`);
  } catch {
    // DNS check is best-effort.
  }

  if (defaults.refreshFirst) {
    console.log('Running pre-score index refresh...');
    await refreshIndexerFirst();
  }

  const sampleResults = [];
  for (let i = 1; i <= defaults.samples; i += 1) {
    const result = await runSample(i);
    sampleResults.push(result);
    console.log(
      `sample=${i} enabled=${result.enabled} requested=${result.requestedRows} accepted=${result.acceptedRows} hits=${result.hitPairs} saved=${result.savedCalls} p90AgeMs=${result.p90AgeMs} acceptance=${formatNum(result.acceptanceRatePct, 2)}%`
    );
  }

  const metrics = {
    enabledRatePct: avg(sampleResults.map((sample) => (sample.enabled ? 100 : 0))),
    avgRequestedRows: avg(sampleResults.map((sample) => sample.requestedRows)),
    avgAcceptedRows: avg(sampleResults.map((sample) => sample.acceptedRows)),
    avgHitPairs: avg(sampleResults.map((sample) => sample.hitPairs)),
    avgMissPairs: avg(sampleResults.map((sample) => sample.misses)),
    avgSavedCalls: avg(sampleResults.map((sample) => sample.savedCalls)),
    avgP90AgeMs: avg(sampleResults.map((sample) => sample.p90AgeMs)),
    avgAcceptanceRatePct: avg(sampleResults.map((sample) => sample.acceptanceRatePct)),
  };

  const gates = evaluateGates(metrics);
  const failing = gates.filter((gate) => !gate.pass);

  console.log('\n=== Rollout Metrics ===');
  console.log(`samples=${defaults.samples}`);
  console.log(`avg_requested_rows=${formatNum(metrics.avgRequestedRows, 2)}`);
  console.log(`avg_accepted_rows=${formatNum(metrics.avgAcceptedRows, 2)}`);
  console.log(`avg_hit_pairs=${formatNum(metrics.avgHitPairs, 2)}`);
  console.log(`avg_miss_pairs=${formatNum(metrics.avgMissPairs, 2)}`);
  console.log(`avg_saved_calls=${formatNum(metrics.avgSavedCalls, 2)}`);
  console.log(`avg_acceptance_rate_pct=${formatNum(metrics.avgAcceptanceRatePct, 2)}`);
  console.log(`avg_p90_age_ms=${Math.round(metrics.avgP90AgeMs)}`);

  console.log('\n=== Gate Results ===');
  for (const gate of gates) {
    console.log(`${gate.pass ? 'PASS' : 'FAIL'} ${gate.name}: actual=${gate.actual} target=${gate.target}`);
  }

  const score = Math.round((gates.filter((gate) => gate.pass).length / gates.length) * 100);
  console.log('\n=== Decision ===');
  console.log(`rollout_score=${score}/100`);

  if (failing.length > 0) {
    console.log(`NO-GO: ${failing.length} rollout gates failing.`);
    process.exit(1);
  }

  console.log('GO: indexer read-through rollout gates passed.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
