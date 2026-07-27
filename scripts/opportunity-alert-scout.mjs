import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { getServers, setServers } from 'node:dns';
import { Resolver } from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

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

const configureDnsResolvers = () => {
  const raw = String(process.env.SCANNER_DNS_SERVERS || '1.1.1.1,8.8.8.8').trim();
  if (!raw) return;
  const resolvers = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (resolvers.length === 0) return;
  try {
    const current = getServers();
    if (JSON.stringify(current) === JSON.stringify(resolvers)) return;
    setServers(resolvers);
    console.log(`DNS resolvers configured: ${resolvers.join(', ')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`DNS resolver configuration skipped: ${message}`);
  }

  if (!globalThis.__SCANNER_DNS_LOOKUP_PATCHED__) {
    const resolver = new Resolver();
    resolver.setServers(resolvers);
    const originalLookup = dns.lookup.bind(dns);
    dns.lookup = (hostname, options, callback) => {
      let opts = options;
      let cb = callback;
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      if (typeof opts === 'number') {
        opts = { family: opts };
      }
      opts = opts || {};
      const family = opts.family === 6 ? 6 : opts.family === 4 ? 4 : 0;
      const all = Boolean(opts.all);

      if (net.isIP(hostname) || hostname === 'localhost' || String(hostname).endsWith('.local')) {
        return originalLookup(hostname, opts, cb);
      }

      const done = (err, address, addrFamily) => {
        if (all) {
          if (err) return cb(err);
          return cb(null, [{ address, family: addrFamily }]);
        }
        return cb(err, address, addrFamily);
      };

      if (family === 6) {
        return resolver.resolve6(hostname)
          .then((addresses) => done(null, addresses[0], 6))
          .catch((err) => originalLookup(hostname, opts, cb));
      }
      if (family === 4) {
        return resolver.resolve4(hostname)
          .then((addresses) => done(null, addresses[0], 4))
          .catch((err) => originalLookup(hostname, opts, cb));
      }

      return resolver.resolve4(hostname)
        .then((addresses) => done(null, addresses[0], 4))
        .catch(() => resolver.resolve6(hostname)
          .then((addresses) => done(null, addresses[0], 6))
          .catch(() => originalLookup(hostname, opts, cb)));
    };
    globalThis.__SCANNER_DNS_LOOKUP_PATCHED__ = true;
    console.log('DNS lookup patch enabled for fetch requests');
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const median = (values) => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Fallback reasonCode values that mirror OPPORTUNITY_REASON_CODES in
// supabase/functions/_shared/opportunity-contract.ts. Used only if the shared
// contract file cannot be read at runtime.
const FALLBACK_REASON_CODE_VALUES = [
  'active_execution_ready',
  'watchlist_net_profit_below_threshold',
  'watchlist_realtime_verification_blocked',
  'watchlist_partial_realtime_signal',
  'watchlist_execution_payload_risk',
  'watchlist_persistence_pending',
  'execution_quote_parity_mismatch',
  'execution_quote_stale',
  'execution_boundary_invalid',
  'readiness_gates_failed',
];

// Read the canonical reasonCode enum values from the shared contract so the
// diagnostic tally uses exact keys rather than substring guesses.
const loadReasonCodeCatalog = () => {
  const candidates = [
    path.join(process.cwd(), 'supabase/functions/_shared/opportunity-contract.ts'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/functions/_shared/opportunity-contract.ts'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      const block = text.match(/OPPORTUNITY_REASON_CODES\s*=\s*\{([\s\S]*?)\}\s*as const/);
      if (!block) continue;
      const values = [];
      const pairRe = /(\w+)\s*:\s*'([^']+)'/g;
      let match;
      while ((match = pairRe.exec(block[1])) !== null) {
        values.push(match[2]);
      }
      if (values.length > 0) return { values, source: file };
    } catch {
      // Ignore and fall through to the next candidate / fallback.
    }
  }
  return { values: [...FALLBACK_REASON_CODE_VALUES], source: 'fallback' };
};

// Coarse readability rollup. Works on both snake_case values and camelCase keys.
const coarseBucketForReasonCode = (code) => {
  const normalized = String(code || '').toLowerCase();
  if (!normalized) return 'other';
  if (normalized.includes('persistence')) return 'persistence';
  if (normalized.includes('realtime') || normalized.includes('parity') || normalized.includes('quote_stale')) return 'realtimeVerification';
  if (normalized.includes('liquidity')) return 'liquidity';
  if (normalized.includes('payload')) return 'payload';
  if (normalized.includes('net_profit') || normalized.includes('netprofit')) return 'netProfit';
  return 'other';
};

// Build a per-run gating breakdown from a full watchlist array.
const buildGatingBreakdown = (watchlist, knownReasonCodes) => {
  const byReasonCode = {};
  const byBucket = {};
  const unknownReasonCodes = new Set();
  const known = knownReasonCodes instanceof Set ? knownReasonCodes : new Set(knownReasonCodes || []);
  for (const entry of Array.isArray(watchlist) ? watchlist : []) {
    const rawCode = entry && typeof entry.reasonCode === 'string' && entry.reasonCode.trim()
      ? entry.reasonCode.trim()
      : 'other';
    byReasonCode[rawCode] = (byReasonCode[rawCode] || 0) + 1;
    if (rawCode !== 'other' && known.size > 0 && !known.has(rawCode)) {
      unknownReasonCodes.add(rawCode);
    }
    const bucket = rawCode === 'other' ? 'other' : coarseBucketForReasonCode(rawCode);
    byBucket[bucket] = (byBucket[bucket] || 0) + 1;
  }
  return {
    total: Array.isArray(watchlist) ? watchlist.length : 0,
    byReasonCode,
    byBucket,
    unknownReasonCodes: [...unknownReasonCodes],
  };
};

// Compact record for a single near-miss watchlist candidate.
const toWatchCandidateRecord = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const route = entry.tokenPair
    ? `${entry.tokenPair}${entry.buyDex && entry.sellDex ? ` ${entry.buyDex}->${entry.sellDex}` : ''}`
    : (entry.route || entry.candidateId || 'unknown');
  return {
    route,
    network: entry.network ?? 'unknown',
    netProfit: Number(entry.netProfit ?? Number.NaN),
    distanceToExecutableUsd: Number(entry.distanceToExecutableUsd ?? Number.NaN),
    reasonCode: typeof entry.reasonCode === 'string' && entry.reasonCode.trim() ? entry.reasonCode.trim() : 'other',
  };
};

// Median the per-reasonCode / per-bucket counts across runs, matching how the
// scout medians its other metrics. Missing codes in a run count as 0.
const aggregateGatingBreakdowns = (breakdowns) => {
  const list = Array.isArray(breakdowns) ? breakdowns : [];
  const allCodes = new Set();
  const allBuckets = new Set();
  for (const b of list) {
    for (const code of Object.keys(b?.byReasonCode || {})) allCodes.add(code);
    for (const bucket of Object.keys(b?.byBucket || {})) allBuckets.add(bucket);
  }
  const medianByReasonCode = {};
  for (const code of allCodes) {
    medianByReasonCode[code] = median(list.map((b) => Number(b?.byReasonCode?.[code] || 0)));
  }
  const medianByBucket = {};
  for (const bucket of allBuckets) {
    medianByBucket[bucket] = median(list.map((b) => Number(b?.byBucket?.[bucket] || 0)));
  }
  return {
    runs: list.length,
    medianTotal: median(list.map((b) => Number(b?.total || 0))),
    byReasonCode: medianByReasonCode,
    byBucket: medianByBucket,
    unknownReasonCodes: [...new Set(list.flatMap((b) => b?.unknownReasonCodes || []))],
  };
};

const isTransientNetworkError = (error) => {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('fetch failed')
    || message.includes('eai_again')
    || message.includes('enotfound')
    || message.includes('econnreset')
    || message.includes('etimedout')
    || message.includes('timeout')
  );
};

const evaluateProfile = async ({ endpoint, anonKey, profile, iterations, delayMs, thresholds, networks, httpTimeoutMs, knownReasonCodes }) => {
  const runs = [];

  for (let i = 0; i < iterations; i += 1) {
    const payload = {
      networks,
      loanAmountUsd: profile.loanAmountUsd,
      minNetProfitUsd: profile.minNetProfitUsd,
      perNetworkMinNetProfitUsd: profile.perNetworkMinNetProfitUsd,
      minSpreadPercent: profile.minSpreadPercent,
      estimatedGasUsd: profile.estimatedGasUsd,
      maxSlippageBps: profile.maxSlippageBps,
      maxLiquidityUsagePercent: profile.maxLiquidityUsagePercent,
      minLiquidityUsd: profile.minLiquidityUsd,
      maxResults: profile.maxResults,
      enableDexScreener: profile.enableDexScreener,
      enableGecko: profile.enableGecko,
    };

    const maxRetries = Math.max(0, parseNumber(process.env.ALERT_HTTP_RETRIES, 1));
    const retryDelayMs = Math.max(250, parseNumber(process.env.ALERT_HTTP_RETRY_DELAY_MS, 1200));
    let response;
    let attemptError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort('opportunity-scout-timeout'), httpTimeoutMs);
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        attemptError = undefined;
        break;
      } catch (error) {
        attemptError = error;
        if (error instanceof Error && error.name === 'AbortError') {
          attemptError = new Error(`Scout request timeout for ${profile.id} after ${httpTimeoutMs}ms`);
        }
        const isRetryable = isTransientNetworkError(attemptError);
        if (!isRetryable || attempt >= maxRetries) {
          break;
        }
        await wait(retryDelayMs);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!response) {
      throw attemptError instanceof Error
        ? attemptError
        : new Error(`Scout request failed for ${profile.id}`);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response (${response.status}) for ${profile.id}: ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(`Probe failed (${response.status}) for ${profile.id}: ${data?.message || data?.error || 'unknown error'}`);
    }

    const diagnostics = data?.diagnostics || {};
    const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : [];
    const watchlist = Array.isArray(data?.watchlist) ? data.watchlist : [];
    const topWatch = watchlist.length > 0
      ? [...watchlist].sort((a, b) => Number(b.netProfit ?? -Infinity) - Number(a.netProfit ?? -Infinity))[0]
      : null;

    const gatingBreakdown = buildGatingBreakdown(watchlist, knownReasonCodes);

    const row = {
      active: opportunities.length,
      badQuotes: Number(diagnostics.droppedByBadQuotes || 0),
      pairKeys: Number(diagnostics.pairKeys || 0),
      topWatchNet: topWatch ? Number(topWatch.netProfit ?? Number.NaN) : Number.NaN,
      topDistance: topWatch ? Number(topWatch.distanceToExecutableUsd ?? Number.NaN) : Number.NaN,
      gatingBreakdown,
      watchlist,
    };
    runs.push(row);

    if (i < iterations - 1) {
      await wait(delayMs);
    }
  }

  const activeMedian = median(runs.map((r) => r.active));
  const badQuotesMedian = median(runs.map((r) => r.badQuotes));
  const pairKeysMedian = median(runs.map((r) => r.pairKeys));
  const anyPairKeysSeen = runs.some((r) => Number(r.pairKeys) > 0);
  const topWatchNetBest = Math.max(...runs.map((r) => (Number.isFinite(r.topWatchNet) ? r.topWatchNet : -Infinity)));
  const topDistanceBest = Math.min(...runs.map((r) => (Number.isFinite(r.topDistance) ? r.topDistance : Infinity)));

  const alert = (
    activeMedian >= thresholds.activeMin
    || (
      Number.isFinite(topWatchNetBest)
      && Number.isFinite(topDistanceBest)
      && topWatchNetBest >= thresholds.topWatchNetMin
      && topDistanceBest <= thresholds.topWatchDistanceMax
      && badQuotesMedian <= thresholds.badQuotesMax
    )
  );

  const closenessScore = Number.isFinite(topWatchNetBest) && Number.isFinite(topDistanceBest)
    ? (topWatchNetBest - thresholds.topWatchNetMin) + (thresholds.topWatchDistanceMax - topDistanceBest)
    : -999;

  const gatingBreakdown = aggregateGatingBreakdowns(runs.map((r) => r.gatingBreakdown));
  const topWatchCandidates = runs
    .flatMap((r) => (Array.isArray(r.watchlist) ? r.watchlist : []))
    .map(toWatchCandidateRecord)
    .filter(Boolean)
    .sort((a, b) => Number(b.netProfit ?? -Infinity) - Number(a.netProfit ?? -Infinity))
    .slice(0, 3);

  return {
    profile: profile.id,
    alert,
    medians: {
      active: activeMedian,
      badQuotes: badQuotesMedian,
      pairKeys: pairKeysMedian,
    },
    bestSeen: {
      topWatchNet: topWatchNetBest,
      topDistance: topDistanceBest,
    },
    gatingBreakdown,
    topWatchCandidates,
    heartbeat: {
      anyPairKeysSeen,
    },
    closenessScore,
    config: profile,
  };
};

const run = async () => {
  loadEnvFallbacks();
  configureDnsResolvers();

  const reasonCodeCatalog = loadReasonCodeCatalog();
  const knownReasonCodes = new Set(reasonCodeCatalog.values);
  console.log(`Loaded ${reasonCodeCatalog.values.length} reasonCodes from ${reasonCodeCatalog.source}`);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('Missing SUPABASE URL/ANON KEY env vars.');
    process.exit(1);
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/scan-arbitrage-opportunities`;
  const iterations = parseNumber(process.env.ALERT_SCOUT_ITERATIONS, 2);
  const delayMs = parseNumber(process.env.ALERT_SCOUT_DELAY_MS, 1200);
  const httpTimeoutMs = Math.max(2_500, parseNumber(process.env.ALERT_HTTP_TIMEOUT_MS, 20_000));
  const networks = (process.env.ALERT_NETWORKS || 'ethereum,arbitrum,base').split(',').map((n) => n.trim()).filter(Boolean);

  const thresholds = {
    activeMin: parseNumber(process.env.ALERT_ACTIVE_MIN, 1),
    topWatchNetMin: parseNumber(process.env.ALERT_TOP_WATCH_NET_MIN, -5),
    topWatchDistanceMax: parseNumber(process.env.ALERT_TOP_DISTANCE_MAX, 15),
    badQuotesMax: parseNumber(process.env.ALERT_BAD_QUOTES_MAX, 1),
  };

  const warmThresholds = {
    closenessMin: parseNumber(process.env.ALERT_WARM_CLOSENESS_MIN, -35),
    deltaMin: parseNumber(process.env.ALERT_WARM_DELTA_MIN, 8),
    badQuotesMax: parseNumber(process.env.ALERT_WARM_BAD_QUOTES_MAX, 2),
  };

  const precheckThresholds = {
    topWatchNetMin: parseNumber(process.env.ALERT_PRECHECK_TOP_WATCH_NET_MIN, -5),
    topWatchDistanceMax: parseNumber(process.env.ALERT_PRECHECK_TOP_DISTANCE_MAX, 20),
    badQuotesMax: parseNumber(process.env.ALERT_PRECHECK_BAD_QUOTES_MAX, 1),
  };

  const historyFile = process.env.ALERT_SCOUT_HISTORY_FILE || 'benchmark-results/opportunity-scout-history.jsonl';
  const historyPath = path.resolve(historyFile);

  const base = {
    minNetProfitUsd: parseNumber(process.env.ALERT_MIN_NET_PROFIT_USD, 6),
    perNetworkMinNetProfitUsd: {
      ethereum: parseNumber(process.env.ALERT_MIN_NET_PROFIT_ETHEREUM_USD, 18),
      arbitrum: parseNumber(process.env.ALERT_MIN_NET_PROFIT_ARBITRUM_USD, 5),
      base: parseNumber(process.env.ALERT_MIN_NET_PROFIT_BASE_USD, 4),
      polygon: parseNumber(process.env.ALERT_MIN_NET_PROFIT_POLYGON_USD, 6),
    },
    minSpreadPercent: parseNumber(process.env.ALERT_MIN_SPREAD_PERCENT, 0.03),
    estimatedGasUsd: parseNumber(process.env.ALERT_ESTIMATED_GAS_USD, 18),
    maxSlippageBps: parseNumber(process.env.ALERT_MAX_SLIPPAGE_BPS, 65),
    maxLiquidityUsagePercent: parseNumber(process.env.ALERT_MAX_LIQUIDITY_USAGE_PERCENT, 25),
    minLiquidityUsd: parseNumber(process.env.ALERT_MIN_LIQUIDITY_USD, 150000),
    maxResults: parseNumber(process.env.ALERT_MAX_RESULTS, 30),
  };

  const discovery = {
    minNetProfitUsd: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_USD, 4),
    perNetworkMinNetProfitUsd: {
      ethereum: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_ETHEREUM_USD, 15),
      arbitrum: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_ARBITRUM_USD, 5),
      base: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_BASE_USD, 4),
      polygon: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_POLYGON_USD, 6),
    },
    minLiquidityUsd: parseNumber(process.env.ALERT_DISCOVERY_MIN_LIQUIDITY_USD, 80000),
    maxSlippageBps: parseNumber(process.env.ALERT_DISCOVERY_MAX_SLIPPAGE_BPS, 75),
  };

  const profileSet = String(process.env.ALERT_SCOUT_PROFILE_SET || 'expanded').trim().toLowerCase();
  const enableGeckoMixed = parseBoolean(process.env.ALERT_ENABLE_GECKO_MIXED, true);
  const includeHighLoanProfiles = parseBoolean(process.env.ALERT_INCLUDE_HIGH_LOAN_PROFILES, true);
  const highLoanAmounts = String(process.env.ALERT_HIGH_LOAN_AMOUNTS_USD || '12000,20000')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((n) => Number.isFinite(n) && n >= 2000)
    .slice(0, 4);

  const highLoanDiscovery = {
    minNetProfitUsd: parseNumber(process.env.ALERT_HIGH_LOAN_MIN_NET_PROFIT_USD, 4),
    perNetworkMinNetProfitUsd: {
      ethereum: parseNumber(process.env.ALERT_HIGH_LOAN_MIN_NET_PROFIT_ETHEREUM_USD, 18),
      arbitrum: parseNumber(process.env.ALERT_HIGH_LOAN_MIN_NET_PROFIT_ARBITRUM_USD, 4),
      base: parseNumber(process.env.ALERT_HIGH_LOAN_MIN_NET_PROFIT_BASE_USD, 3),
      polygon: parseNumber(process.env.ALERT_HIGH_LOAN_MIN_NET_PROFIT_POLYGON_USD, 5),
    },
    minSpreadPercent: parseNumber(process.env.ALERT_HIGH_LOAN_MIN_SPREAD_PERCENT, 0.015),
    minLiquidityUsd: parseNumber(process.env.ALERT_HIGH_LOAN_MIN_LIQUIDITY_USD, 180000),
    maxSlippageBps: parseNumber(process.env.ALERT_HIGH_LOAN_MAX_SLIPPAGE_BPS, 80),
  };

  const actionableEthereumLoanUsd = Math.max(4_000, parseNumber(process.env.ALERT_ACTIONABLE_ETHEREUM_LOAN_USD, 12_000));
  const exploratoryEthereumLoanUsd = Math.max(3_000, parseNumber(process.env.ALERT_EXPLORATORY_ETHEREUM_LOAN_USD, 6_000));
  const discoveryEthereumLoanUsd = Math.max(2_000, parseNumber(process.env.ALERT_DISCOVERY_ETHEREUM_LOAN_USD, 4_000));

  let profiles = profileSet === 'default'
    ? [
      {
        id: `subgraph-${actionableEthereumLoanUsd}`,
        ...base,
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: `subgraph-${exploratoryEthereumLoanUsd}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: exploratoryEthereumLoanUsd,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: `mixed-${actionableEthereumLoanUsd}`,
        ...base,
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${actionableEthereumLoanUsd}-aggressive`,
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_USD, 2),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ETHEREUM_USD, 14),
          arbitrum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ARBITRUM_USD, 3),
          base: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_BASE_USD, 2),
          polygon: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_POLYGON_USD, 2),
        },
        maxSlippageBps: parseNumber(process.env.ALERT_AGGRESSIVE_MAX_SLIPPAGE_BPS, 75),
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${actionableEthereumLoanUsd}-ultra-discovery`,
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_USD, 1),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ETHEREUM_USD, 10),
          arbitrum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ARBITRUM_USD, 2),
          base: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_BASE_USD, 1),
          polygon: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_POLYGON_USD, 1),
        },
        estimatedGasUsd: parseNumber(process.env.ALERT_ULTRA_ESTIMATED_GAS_USD, 7),
        maxSlippageBps: parseNumber(process.env.ALERT_ULTRA_MAX_SLIPPAGE_BPS, 80),
        minLiquidityUsd: parseNumber(process.env.ALERT_ULTRA_MIN_LIQUIDITY_USD, 90000),
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${exploratoryEthereumLoanUsd}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: exploratoryEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
    ]
    : [
      {
        id: `subgraph-${exploratoryEthereumLoanUsd}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: exploratoryEthereumLoanUsd,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: `subgraph-${actionableEthereumLoanUsd}`,
        ...base,
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: `subgraph-${discoveryEthereumLoanUsd}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: discoveryEthereumLoanUsd,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: `subgraph-${Math.max(2_000, Math.floor(discoveryEthereumLoanUsd * 0.75))}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: Math.max(2_000, Math.floor(discoveryEthereumLoanUsd * 0.75)),
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: `mixed-${exploratoryEthereumLoanUsd}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: exploratoryEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${actionableEthereumLoanUsd}`,
        ...base,
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${actionableEthereumLoanUsd}-aggressive`,
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_USD, 2),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ETHEREUM_USD, 14),
          arbitrum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ARBITRUM_USD, 3),
          base: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_BASE_USD, 2),
          polygon: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_POLYGON_USD, 2),
        },
        maxSlippageBps: parseNumber(process.env.ALERT_AGGRESSIVE_MAX_SLIPPAGE_BPS, 75),
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${actionableEthereumLoanUsd}-ultra-discovery`,
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_USD, 1),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ETHEREUM_USD, 10),
          arbitrum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ARBITRUM_USD, 2),
          base: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_BASE_USD, 1),
          polygon: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_POLYGON_USD, 1),
        },
        estimatedGasUsd: parseNumber(process.env.ALERT_ULTRA_ESTIMATED_GAS_USD, 7),
        maxSlippageBps: parseNumber(process.env.ALERT_ULTRA_MAX_SLIPPAGE_BPS, 80),
        minLiquidityUsd: parseNumber(process.env.ALERT_ULTRA_MIN_LIQUIDITY_USD, 90000),
        loanAmountUsd: actionableEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${discoveryEthereumLoanUsd}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: discoveryEthereumLoanUsd,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: `mixed-${Math.max(2_000, Math.floor(discoveryEthereumLoanUsd * 0.75))}-discovery`,
        ...base,
        ...discovery,
        loanAmountUsd: Math.max(2_000, Math.floor(discoveryEthereumLoanUsd * 0.75)),
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
    ];

  if (includeHighLoanProfiles && highLoanAmounts.length > 0) {
    const highLoanProfiles = [];
    for (const loanAmountUsd of highLoanAmounts) {
      highLoanProfiles.push(
        {
          id: `subgraph-${loanAmountUsd}-highloan-discovery`,
          ...base,
          ...highLoanDiscovery,
          loanAmountUsd,
          enableDexScreener: false,
          enableGecko: false,
        },
        {
          id: `mixed-${loanAmountUsd}-highloan-discovery`,
          ...base,
          ...highLoanDiscovery,
          loanAmountUsd,
          enableDexScreener: true,
          enableGecko: enableGeckoMixed,
        },
      );
    }
    profiles = [...profiles, ...highLoanProfiles];
  }

  const results = [];
  for (const profile of profiles) {
    try {
      const result = await evaluateProfile({ endpoint, anonKey, profile, iterations, delayMs, thresholds, networks, httpTimeoutMs, knownReasonCodes });
      results.push(result);
      const gate = result.gatingBreakdown || {};
      const bucketSummary = Object.entries(gate.byBucket || {})
        .map(([bucket, count]) => `${bucket}:${count}`)
        .join(',') || 'none';
      console.log(`${profile.id}: alert=${result.alert} activeMed=${result.medians.active} badQuotesMed=${result.medians.badQuotes} pairKeysMed=${result.medians.pairKeys} topNet=${Number.isFinite(result.bestSeen.topWatchNet) ? result.bestSeen.topWatchNet.toFixed(2) : 'n/a'} topDist=${Number.isFinite(result.bestSeen.topDistance) ? result.bestSeen.topDistance.toFixed(2) : 'n/a'} score=${result.closenessScore.toFixed(2)} watchMed=${gate.medianTotal ?? 'n/a'} gating=[${bucketSummary}]`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult = {
        profile: profile.id,
        alert: false,
        medians: {
          active: 0,
          badQuotes: 0,
          pairKeys: 0,
        },
        bestSeen: {
          topWatchNet: Number.NaN,
          topDistance: Number.NaN,
        },
        gatingBreakdown: { runs: 0, medianTotal: Number.NaN, byReasonCode: {}, byBucket: {}, unknownReasonCodes: [] },
        topWatchCandidates: [],
        heartbeat: {
          anyPairKeysSeen: false,
          endpointReachable: false,
        },
        closenessScore: -999,
        config: profile,
        error: message,
      };
      results.push(failedResult);
      console.log(`${profile.id}: alert=false error=${message}`);
    }
  }

  const best = [...results].sort((a, b) => b.closenessScore - a.closenessScore)[0];
  const anyAlert = results.some((r) => r.alert);
  const endpointReachable = results.some((r) => !r.error);
  const errorProfiles = results.filter((r) => Boolean(r.error));
  const anyPairKeysSeen = results.some((r) => Number(r?.medians?.pairKeys) > 0 || Boolean(r?.heartbeat?.anyPairKeysSeen));
  const zeroPairProfiles = results.filter((r) => Number(r?.medians?.pairKeys) <= 0).length;

  let recentMedianCloseness = Number.NaN;
  let trendDelta = Number.NaN;
  try {
    if (fs.existsSync(historyPath)) {
      const lines = fs.readFileSync(historyPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-12);
      const closeness = lines
        .map((line) => {
          try {
            const parsed = JSON.parse(line);
            return Number(parsed?.bestProfile?.closenessScore);
          } catch {
            return Number.NaN;
          }
        })
        .filter((n) => Number.isFinite(n));
      if (closeness.length > 0) {
        recentMedianCloseness = median(closeness);
        trendDelta = best.closenessScore - recentMedianCloseness;
      }
    }
  } catch {
    // Ignore history parse issues and continue live evaluation.
  }

  const precheckAlert = (
    !anyAlert
    && Number.isFinite(best?.bestSeen?.topWatchNet)
    && Number.isFinite(best?.bestSeen?.topDistance)
    && Number(best?.medians?.badQuotes) <= precheckThresholds.badQuotesMax
    && best.bestSeen.topWatchNet >= precheckThresholds.topWatchNetMin
    && best.bestSeen.topDistance <= precheckThresholds.topWatchDistanceMax
  );

  const warmAlert = (
    !anyAlert
    && !precheckAlert
    && Number.isFinite(best?.bestSeen?.topWatchNet)
    && Number.isFinite(best?.bestSeen?.topDistance)
    && Number(best?.medians?.badQuotes) <= warmThresholds.badQuotesMax
    && (
      best.closenessScore >= warmThresholds.closenessMin
      || (Number.isFinite(trendDelta) && trendDelta >= warmThresholds.deltaMin)
    )
  );

  // Cross-profile gating rollup: sum each profile's per-run median counts so the
  // summary shows the overall distribution of why candidates stay on watchlist.
  const gatingByReasonCode = {};
  const gatingByBucket = {};
  const gatingUnknownReasonCodes = new Set();
  for (const r of results) {
    const gb = r?.gatingBreakdown;
    if (!gb) continue;
    for (const [code, count] of Object.entries(gb.byReasonCode || {})) {
      gatingByReasonCode[code] = (gatingByReasonCode[code] || 0) + Number(count || 0);
    }
    for (const [bucket, count] of Object.entries(gb.byBucket || {})) {
      gatingByBucket[bucket] = (gatingByBucket[bucket] || 0) + Number(count || 0);
    }
    for (const code of gb.unknownReasonCodes || []) gatingUnknownReasonCodes.add(code);
  }
  const gatingSummary = {
    byReasonCode: gatingByReasonCode,
    byBucket: gatingByBucket,
    unknownReasonCodes: [...gatingUnknownReasonCodes],
    topWatchCandidates: (best?.topWatchCandidates || []),
  };

  const summary = {
    anyAlert,
    precheckAlert,
    warmAlert,
    endpointHealth: {
      status: endpointReachable ? 'reachable' : 'unreachable',
      errorProfiles: errorProfiles.length,
      totalProfiles: results.length,
    },
    dataHeartbeat: {
      status: endpointReachable ? (anyPairKeysSeen ? 'ok' : 'starved') : 'unreachable',
      anyPairKeysSeen,
      zeroPairProfiles,
      totalProfiles: results.length,
      bestPairKeysMedian: Number(best?.medians?.pairKeys ?? 0),
    },
    thresholds,
    precheckThresholds,
    warmThresholds,
    reasonCodeCatalog: { source: reasonCodeCatalog.source, values: reasonCodeCatalog.values },
    gatingSummary,
    bestProfile: best,
    trend: {
      recentMedianCloseness,
      deltaVsRecentMedian: trendDelta,
    },
    results,
  };

  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.appendFileSync(historyPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...summary })}\n`);
  } catch {
    // Best-effort history logging.
  }

  if (anyAlert) {
    console.log('ALERT: at least one profile is check-worthy now');
  } else if (precheckAlert) {
    console.log('PRECHECK_ALERT: profile is near check-worthy thresholds; perform manual confirmation now');
  } else if (warmAlert) {
    console.log('WARM_ALERT: profile trend is improving toward check-worthy range');
  } else {
    console.log('NO_ALERT: no profile is currently check-worthy');
  }
  console.log(JSON.stringify(summary, null, 2));

  const strictExit = parseBoolean(process.env.ALERT_STRICT_EXIT, false);
  if (anyAlert && strictExit) {
    process.exit(10);
  }
  const warmStrictExit = parseBoolean(process.env.ALERT_WARM_STRICT_EXIT, false);
  if (warmAlert && strictExit && warmStrictExit) {
    process.exit(11);
  }
  const precheckStrictExit = parseBoolean(process.env.ALERT_PRECHECK_STRICT_EXIT, false);
  if (precheckAlert && strictExit && precheckStrictExit) {
    process.exit(14);
  }
};

export {
  buildGatingBreakdown,
  aggregateGatingBreakdowns,
  toWatchCandidateRecord,
  coarseBucketForReasonCode,
  loadReasonCodeCatalog,
};

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return true;
  }
})();

if (isMain) {
  run().catch((error) => {
    console.error('Opportunity alert scout failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
