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

const loadEnvFiles = () => {
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

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
};

const env = loadEnvFiles();
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const probeRuns = Math.max(3, Math.min(15, parseNumber(process.env.PROBE_SERIES_RUNS, 7)));
const probeNetworks = String(process.env.PROBE_NETWORKS || 'ethereum,arbitrum,base,polygon')
  .split(',')
  .map((part) => part.trim().toLowerCase())
  .filter(Boolean);

const deriveFunctionsUrl = () => {
  const viteSupabaseUrl = env.VITE_SUPABASE_URL || '';
  if (/^https:\/\//i.test(viteSupabaseUrl)) {
    return `${viteSupabaseUrl.replace(/\/$/, '')}/functions/v1/scan-arbitrage-opportunities`;
  }
  return 'http://127.0.0.1:54321/functions/v1/scan-arbitrage-opportunities';
};

const probeUrl = env.PROBE_URL || env.SUPABASE_FUNCTIONS_URL || deriveFunctionsUrl();

const payload = {
  networks: probeNetworks,
  loanAmountUsd: parseNumber(process.env.PROBE_LOAN_AMOUNT_USD, 4000),
  minNetProfitUsd: parseNumber(process.env.PROBE_MIN_NET_PROFIT_USD, 3),
  perNetworkMinNetProfitUsd: {
    ethereum: parseNumber(process.env.PROBE_MIN_NET_PROFIT_ETHEREUM_USD, 8),
    arbitrum: parseNumber(process.env.PROBE_MIN_NET_PROFIT_ARBITRUM_USD, 4),
    base: parseNumber(process.env.PROBE_MIN_NET_PROFIT_BASE_USD, 3),
    polygon: parseNumber(process.env.PROBE_MIN_NET_PROFIT_POLYGON_USD, 3),
  },
  minLiquidityUsd: parseNumber(process.env.PROBE_MIN_LIQUIDITY_USD, 120000),
  minSpreadPercent: parseNumber(process.env.PROBE_MIN_SPREAD_PERCENT, 0.03),
  maxResults: parseNumber(process.env.PROBE_MAX_RESULTS, 40),
  maxSlippageBps: parseNumber(process.env.PROBE_MAX_SLIPPAGE_BPS, 65),
  maxLiquidityUsagePercent: parseNumber(process.env.PROBE_MAX_LIQUIDITY_USAGE_PERCENT, 25),
  estimatedGasUsd: parseNumber(process.env.PROBE_ESTIMATED_GAS_USD, 12),
  enableDexScreener: process.env.PROBE_ENABLE_DEXSCREENER !== 'false',
  enableGecko: process.env.PROBE_ENABLE_GECKO !== 'false',
};

const headers = {
  'Content-Type': 'application/json',
};
if (anonKey) {
  headers.Authorization = `Bearer ${anonKey}`;
  headers.apikey = anonKey;
}

const runOnce = async () => {
  const res = await fetch(probeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 240)}`);
  }

  if (!res.ok) {
    throw new Error(`Probe failed ${res.status}: ${JSON.stringify(data).slice(0, 280)}`);
  }

  const d = data.diagnostics || {};
  const active = Array.isArray(data.opportunities) ? data.opportunities.length : 0;
  const watch = Array.isArray(data.watchlist) ? data.watchlist.length : 0;
  const pairKeys = Number(d.pairKeys ?? 0);
  const candidates = Number(d.candidates ?? 0);
  const policyHints = d.policyDryRun?.calibrationHints || null;

  const normalizeHintList = (list) => (
    Array.isArray(list)
      ? list
        .map((entry) => ({
          tokenPair: String(entry?.tokenPair || ''),
          liveDecisionTag: String(entry?.liveDecisionTag || 'selected_other'),
          flipThresholdScore: Number(entry?.flipThresholdScore ?? 0),
          marginToDistinctRouteScore: Number(entry?.marginToDistinctRouteScore ?? 0),
          challenger: entry?.challenger
            ? {
              buyDex: String(entry.challenger.buyDex || ''),
              sellDex: String(entry.challenger.sellDex || ''),
              buySource: String(entry.challenger.buySource || ''),
              sellSource: String(entry.challenger.sellSource || ''),
              decisionTag: String(entry.challenger.decisionTag || 'selected_other'),
              earlyGate: String(entry.challenger.earlyGate || 'pass'),
              spreadPercent: Number(entry.challenger.spreadPercent ?? 0),
            }
            : null,
        }))
        .filter((entry) => entry.tokenPair.length > 0)
      : []
  );

  return {
    active,
    watch,
    pairKeys,
    candidates,
    overlapGatePassRate: pairKeys > 0 ? (candidates / pairKeys) * 100 : 0,
    badQuotes: Number(d.droppedByBadQuotes ?? 0),
    spreadDrop: Number(d.droppedBySpread ?? 0),
    liqDrop: Number(d.droppedByLiquidity ?? 0),
    slipDrop: Number(d.droppedBySlippage ?? 0),
    netDrop: Number(d.droppedByNetProfit ?? 0),
    sameDexDrop: Number(d.droppedBySameDex ?? 0),
    riskDrop: Number(d.droppedByExecutionRisk ?? 0),
    policyCalibrationHints: {
      preferSubgraph: normalizeHintList(policyHints?.preferSubgraph?.easiestPairs),
      preferExternalRaw: normalizeHintList(policyHints?.preferExternalRaw?.easiestPairs),
    },
  };
};

const main = async () => {
  console.log(`Series probe target: ${probeUrl}`);
  console.log(`Series networks: ${probeNetworks.join(', ')}`);
  try {
    const host = new URL(probeUrl).hostname;
    const resolved = await lookup(host);
    console.log(`Resolved host: ${host} -> ${resolved.address}`);
  } catch {
    // Best effort only.
  }

  const runs = [];
  for (let i = 0; i < probeRuns; i += 1) {
    const snapshot = await runOnce();
    runs.push(snapshot);
    console.log(
      `run ${i + 1}/${probeRuns}: active=${snapshot.active} cand=${snapshot.candidates} overlap=${snapshot.overlapGatePassRate.toFixed(1)}% badQuotes=${snapshot.badQuotes} spread=${snapshot.spreadDrop} liq=${snapshot.liqDrop} slip=${snapshot.slipDrop} net=${snapshot.netDrop} sameDex=${snapshot.sameDexDrop} risk=${snapshot.riskDrop}`,
    );
  }

  const summarize = (field) => {
    const values = runs.map((r) => r[field]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      mean: Number(mean.toFixed(2)),
    };
  };

  const summary = {
    runs: probeRuns,
    active: summarize('active'),
    candidates: summarize('candidates'),
    overlapGatePassRate: summarize('overlapGatePassRate'),
    badQuotes: summarize('badQuotes'),
    spreadDrop: summarize('spreadDrop'),
    liqDrop: summarize('liqDrop'),
    slipDrop: summarize('slipDrop'),
    netDrop: summarize('netDrop'),
    sameDexDrop: summarize('sameDexDrop'),
    riskDrop: summarize('riskDrop'),
  };

  const aggregatePolicyHints = (mode) => {
    const byPair = new Map();

    for (const run of runs) {
      const hints = run.policyCalibrationHints?.[mode] || [];
      for (const hint of hints) {
        const existing = byPair.get(hint.tokenPair) || {
          tokenPair: hint.tokenPair,
          liveDecisionTag: hint.liveDecisionTag,
          seenRuns: 0,
          thresholds: [],
          margins: [],
          challenger: hint.challenger || null,
        };
        existing.seenRuns += 1;
        existing.liveDecisionTag = hint.liveDecisionTag || existing.liveDecisionTag;
        if (!existing.challenger && hint.challenger) {
          existing.challenger = hint.challenger;
        }
        if (Number.isFinite(hint.flipThresholdScore)) existing.thresholds.push(hint.flipThresholdScore);
        if (Number.isFinite(hint.marginToDistinctRouteScore)) existing.margins.push(hint.marginToDistinctRouteScore);
        byPair.set(hint.tokenPair, existing);
      }
    }

    return Array.from(byPair.values())
      .map((entry) => {
        const thresholdValues = entry.thresholds.length > 0 ? entry.thresholds : [0];
        const marginValues = entry.margins.length > 0 ? entry.margins : [0];
        const thresholdMean = thresholdValues.reduce((sum, value) => sum + value, 0) / thresholdValues.length;
        const marginMean = marginValues.reduce((sum, value) => sum + value, 0) / marginValues.length;
        return {
          tokenPair: entry.tokenPair,
          liveDecisionTag: entry.liveDecisionTag,
          seenRuns: entry.seenRuns,
          seenRatePercent: Number(((entry.seenRuns / probeRuns) * 100).toFixed(1)),
          thresholdMin: Math.min(...thresholdValues),
          thresholdP50: percentile(thresholdValues, 50),
          thresholdMean: Number(thresholdMean.toFixed(2)),
          marginP50: percentile(marginValues, 50),
          marginMean: Number(marginMean.toFixed(2)),
          challengerEarlyGate: entry.challenger?.earlyGate || null,
          challengerDecisionTag: entry.challenger?.decisionTag || null,
          challengerSpreadPercent: entry.challenger ? Number(entry.challenger.spreadPercent.toFixed(6)) : null,
        };
      })
      .sort((a, b) => {
        if (b.seenRuns !== a.seenRuns) return b.seenRuns - a.seenRuns;
        if (a.thresholdMean !== b.thresholdMean) return a.thresholdMean - b.thresholdMean;
        return a.tokenPair.localeCompare(b.tokenPair);
      })
      .slice(0, 8);
  };

  summary.policyCalibrationHints = {
    preferSubgraph: aggregatePolicyHints('preferSubgraph'),
    preferExternalRaw: aggregatePolicyHints('preferExternalRaw'),
  };

  const summarizeActionability = (entries) => {
    const lowThresholdCutoff = 25;
    const lowThresholdEntries = entries.filter((entry) => entry.thresholdP50 <= lowThresholdCutoff);
    const passEntries = lowThresholdEntries.filter((entry) => entry.challengerEarlyGate === 'pass');
    const blockedByBadQuotes = lowThresholdEntries.filter((entry) => entry.challengerEarlyGate === 'badQuotes');
    const blockedBySpread = lowThresholdEntries.filter((entry) => entry.challengerEarlyGate === 'spread');
    const unknownChallenger = lowThresholdEntries.filter((entry) => entry.challengerEarlyGate === null);

    return {
      lowThresholdCutoff,
      lowThresholdPairs: lowThresholdEntries.length,
      actionablePairs: passEntries.map((entry) => ({
        tokenPair: entry.tokenPair,
        thresholdP50: entry.thresholdP50,
        seenRatePercent: entry.seenRatePercent,
        challengerDecisionTag: entry.challengerDecisionTag,
      })),
      blockedByBadQuotes: blockedByBadQuotes.map((entry) => ({
        tokenPair: entry.tokenPair,
        thresholdP50: entry.thresholdP50,
        challengerSpreadPercent: entry.challengerSpreadPercent,
      })),
      blockedBySpread: blockedBySpread.map((entry) => ({
        tokenPair: entry.tokenPair,
        thresholdP50: entry.thresholdP50,
        challengerSpreadPercent: entry.challengerSpreadPercent,
      })),
      unknownChallenger: unknownChallenger.map((entry) => ({
        tokenPair: entry.tokenPair,
        thresholdP50: entry.thresholdP50,
      })),
    };
  };

  summary.policyActionability = {
    preferSubgraph: summarizeActionability(summary.policyCalibrationHints.preferSubgraph),
    preferExternalRaw: summarizeActionability(summary.policyCalibrationHints.preferExternalRaw),
  };

  console.log('--- series summary ---');
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
