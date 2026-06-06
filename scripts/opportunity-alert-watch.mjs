import fs from 'node:fs';
import path from 'node:path';

const parseDotEnv = (fileText) => {
  const out = {};
  for (const line of fileText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
      ? raw.slice(1, -1)
      : raw;
    out[key] = value;
  }
  return out;
};

const loadEnvFallbacks = () => {
  const files = ['.env', 'supabase/.env.local'];
  for (const file of files) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    const parsed = parseDotEnv(fs.readFileSync(full, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in process.env)) process.env[k] = v;
    }
  }
};

const parseNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseArgs = (argv) => {
  const args = {
    iterations: parseNumber(process.env.ALERT_ITERATIONS, 3),
    delayMs: parseNumber(process.env.ALERT_DELAY_MS, 1500),
    networks: (process.env.ALERT_NETWORKS || 'ethereum').split(',').map((n) => n.trim()).filter(Boolean),
    loanAmountUsd: parseNumber(process.env.ALERT_LOAN_AMOUNT_USD, 1000),
    minNetProfitUsd: parseNumber(process.env.ALERT_MIN_NET_PROFIT_USD, 3),
    minSpreadPercent: parseNumber(process.env.ALERT_MIN_SPREAD_PERCENT, 0.02),
    estimatedGasUsd: parseNumber(process.env.ALERT_ESTIMATED_GAS_USD, 8),
    maxSlippageBps: parseNumber(process.env.ALERT_MAX_SLIPPAGE_BPS, 65),
    maxLiquidityUsagePercent: parseNumber(process.env.ALERT_MAX_LIQUIDITY_USAGE_PERCENT, 25),
    minLiquidityUsd: parseNumber(process.env.ALERT_MIN_LIQUIDITY_USD, 120000),
    maxResults: parseNumber(process.env.ALERT_MAX_RESULTS, 40),
    enableDexScreener: parseBoolean(process.env.ALERT_ENABLE_DEXSCREENER, false),
    enableGecko: parseBoolean(process.env.ALERT_ENABLE_GECKO, false),
    activeMin: parseNumber(process.env.ALERT_ACTIVE_MIN, 1),
    topWatchNetMin: parseNumber(process.env.ALERT_TOP_WATCH_NET_MIN, -10),
    topWatchDistanceMax: parseNumber(process.env.ALERT_TOP_DISTANCE_MAX, 15),
    badQuotesMax: parseNumber(process.env.ALERT_BAD_QUOTES_MAX, 1),
    strictExit: parseBoolean(process.env.ALERT_STRICT_EXIT, false),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--iterations' && argv[i + 1]) args.iterations = parseNumber(argv[++i], args.iterations);
    else if (arg === '--delayMs' && argv[i + 1]) args.delayMs = parseNumber(argv[++i], args.delayMs);
  }

  return args;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  loadEnvFallbacks();
  const args = parseArgs(process.argv);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('Missing SUPABASE URL/ANON KEY env vars.');
    process.exit(1);
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/scan-arbitrage-opportunities`;

  const runs = [];
  for (let i = 0; i < args.iterations; i += 1) {
    const payload = {
      networks: args.networks,
      loanAmountUsd: args.loanAmountUsd,
      minNetProfitUsd: args.minNetProfitUsd,
      minSpreadPercent: args.minSpreadPercent,
      estimatedGasUsd: args.estimatedGasUsd,
      maxSlippageBps: args.maxSlippageBps,
      maxLiquidityUsagePercent: args.maxLiquidityUsagePercent,
      minLiquidityUsd: args.minLiquidityUsd,
      maxResults: args.maxResults,
      enableDexScreener: args.enableDexScreener,
      enableGecko: args.enableGecko,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response (${response.status}): ${text.slice(0, 300)}`);
    }

    if (!response.ok) {
      throw new Error(`Probe failed (${response.status}): ${data?.message || data?.error || 'unknown error'}`);
    }

    const diagnostics = data?.diagnostics || {};
    const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : [];
    const watchlist = Array.isArray(data?.watchlist) ? data.watchlist : [];
    const topWatch = watchlist.length > 0
      ? [...watchlist].sort((a, b) => Number(b.netProfit ?? -Infinity) - Number(a.netProfit ?? -Infinity))[0]
      : null;

    const row = {
      active: opportunities.length,
      watch: watchlist.length,
      badQuotes: Number(diagnostics.droppedByBadQuotes || 0),
      slipDrop: Number(diagnostics.droppedBySlippage || 0),
      netDrop: Number(diagnostics.droppedByNetProfit || 0),
      riskDrop: Number(diagnostics.droppedByExecutionRisk || 0),
      topPair: topWatch?.tokenPair || null,
      topWatchNet: topWatch ? Number(topWatch.netProfit ?? NaN) : NaN,
      topDistance: topWatch ? Number(topWatch.distanceToExecutableUsd ?? NaN) : NaN,
    };

    runs.push(row);
    console.log(`run ${i + 1}/${args.iterations}: active=${row.active} watch=${row.watch} badQuotes=${row.badQuotes} slip=${row.slipDrop} netDrop=${row.netDrop} risk=${row.riskDrop} top=${row.topPair || 'none'} net=${Number.isFinite(row.topWatchNet) ? row.topWatchNet.toFixed(2) : 'n/a'} dist=${Number.isFinite(row.topDistance) ? row.topDistance.toFixed(2) : 'n/a'}`);

    if (i < args.iterations - 1) {
      await wait(args.delayMs);
    }
  }

  const med = (values) => {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const activeMedian = med(runs.map((r) => r.active));
  const badQuotesMedian = med(runs.map((r) => r.badQuotes));
  const topWatchNetBest = Math.max(...runs.map((r) => (Number.isFinite(r.topWatchNet) ? r.topWatchNet : -Infinity)));
  const topDistanceBest = Math.min(...runs.map((r) => (Number.isFinite(r.topDistance) ? r.topDistance : Infinity)));

  const triggeredByActive = activeMedian >= args.activeMin;
  const triggeredByWatch = (
    Number.isFinite(topWatchNetBest)
    && Number.isFinite(topDistanceBest)
    && topWatchNetBest >= args.topWatchNetMin
    && topDistanceBest <= args.topWatchDistanceMax
    && badQuotesMedian <= args.badQuotesMax
  );

  const alert = triggeredByActive || triggeredByWatch;
  const summary = {
    alert,
    thresholds: {
      activeMin: args.activeMin,
      topWatchNetMin: args.topWatchNetMin,
      topWatchDistanceMax: args.topWatchDistanceMax,
      badQuotesMax: args.badQuotesMax,
    },
    medians: {
      active: activeMedian,
      badQuotes: badQuotesMedian,
    },
    bestSeen: {
      topWatchNet: topWatchNetBest,
      topDistance: topDistanceBest,
    },
    mode: {
      networks: args.networks,
      loanAmountUsd: args.loanAmountUsd,
      minNetProfitUsd: args.minNetProfitUsd,
      minSpreadPercent: args.minSpreadPercent,
      estimatedGasUsd: args.estimatedGasUsd,
      enableDexScreener: args.enableDexScreener,
      enableGecko: args.enableGecko,
    },
  };

  if (alert) {
    console.log('ALERT: check opportunities now');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(args.strictExit ? 10 : 0);
  }

  console.log('NO_ALERT: conditions not yet near-actionable');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
};

run().catch((error) => {
  console.error('Alert watch failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
