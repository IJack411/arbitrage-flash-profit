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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const median = (values) => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
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

const evaluateProfile = async ({ endpoint, anonKey, profile, iterations, delayMs, thresholds, networks, httpTimeoutMs }) => {
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

    const row = {
      active: opportunities.length,
      badQuotes: Number(diagnostics.droppedByBadQuotes || 0),
      pairKeys: Number(diagnostics.pairKeys || 0),
      topWatchNet: topWatch ? Number(topWatch.netProfit ?? Number.NaN) : Number.NaN,
      topDistance: topWatch ? Number(topWatch.distanceToExecutableUsd ?? Number.NaN) : Number.NaN,
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
    heartbeat: {
      anyPairKeysSeen,
    },
    closenessScore,
    config: profile,
  };
};

const run = async () => {
  loadEnvFallbacks();

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
  const networks = (process.env.ALERT_NETWORKS || 'ethereum').split(',').map((n) => n.trim()).filter(Boolean);

  const thresholds = {
    activeMin: parseNumber(process.env.ALERT_ACTIVE_MIN, 1),
    topWatchNetMin: parseNumber(process.env.ALERT_TOP_WATCH_NET_MIN, -10),
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
    minNetProfitUsd: parseNumber(process.env.ALERT_MIN_NET_PROFIT_USD, 3),
    perNetworkMinNetProfitUsd: {
      ethereum: parseNumber(process.env.ALERT_MIN_NET_PROFIT_ETHEREUM_USD, 8),
      arbitrum: parseNumber(process.env.ALERT_MIN_NET_PROFIT_ARBITRUM_USD, 4),
      base: parseNumber(process.env.ALERT_MIN_NET_PROFIT_BASE_USD, 3),
      polygon: parseNumber(process.env.ALERT_MIN_NET_PROFIT_POLYGON_USD, 3),
    },
    minSpreadPercent: parseNumber(process.env.ALERT_MIN_SPREAD_PERCENT, 0.02),
    estimatedGasUsd: parseNumber(process.env.ALERT_ESTIMATED_GAS_USD, 8),
    maxSlippageBps: parseNumber(process.env.ALERT_MAX_SLIPPAGE_BPS, 65),
    maxLiquidityUsagePercent: parseNumber(process.env.ALERT_MAX_LIQUIDITY_USAGE_PERCENT, 25),
    minLiquidityUsd: parseNumber(process.env.ALERT_MIN_LIQUIDITY_USD, 120000),
    maxResults: parseNumber(process.env.ALERT_MAX_RESULTS, 40),
  };

  const discovery = {
    minNetProfitUsd: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_USD, 2),
    perNetworkMinNetProfitUsd: {
      ethereum: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_ETHEREUM_USD, 8),
      arbitrum: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_ARBITRUM_USD, 4),
      base: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_BASE_USD, 3),
      polygon: parseNumber(process.env.ALERT_DISCOVERY_MIN_NET_PROFIT_POLYGON_USD, 3),
    },
    minLiquidityUsd: parseNumber(process.env.ALERT_DISCOVERY_MIN_LIQUIDITY_USD, 60000),
    maxSlippageBps: parseNumber(process.env.ALERT_DISCOVERY_MAX_SLIPPAGE_BPS, 75),
  };

  const profileSet = String(process.env.ALERT_SCOUT_PROFILE_SET || 'expanded').trim().toLowerCase();
  const enableGeckoMixed = parseBoolean(process.env.ALERT_ENABLE_GECKO_MIXED, true);

  const profiles = profileSet === 'default'
    ? [
      {
        id: 'subgraph-1000',
        ...base,
        loanAmountUsd: 1000,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: 'subgraph-600',
        ...base,
        loanAmountUsd: 600,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: 'mixed-1000',
        ...base,
        loanAmountUsd: 1000,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-1000-aggressive',
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_USD, 2),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ETHEREUM_USD, 6),
          arbitrum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ARBITRUM_USD, 3),
          base: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_BASE_USD, 2),
          polygon: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_POLYGON_USD, 2),
        },
        maxSlippageBps: parseNumber(process.env.ALERT_AGGRESSIVE_MAX_SLIPPAGE_BPS, 75),
        loanAmountUsd: 1000,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-1000-ultra-discovery',
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_USD, 1),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ETHEREUM_USD, 4),
          arbitrum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ARBITRUM_USD, 2),
          base: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_BASE_USD, 1),
          polygon: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_POLYGON_USD, 1),
        },
        estimatedGasUsd: parseNumber(process.env.ALERT_ULTRA_ESTIMATED_GAS_USD, 7),
        maxSlippageBps: parseNumber(process.env.ALERT_ULTRA_MAX_SLIPPAGE_BPS, 80),
        minLiquidityUsd: parseNumber(process.env.ALERT_ULTRA_MIN_LIQUIDITY_USD, 90000),
        loanAmountUsd: 1000,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-600',
        ...base,
        loanAmountUsd: 600,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
    ]
    : [
      {
        id: 'subgraph-1500-discovery',
        ...base,
        ...discovery,
        loanAmountUsd: 1500,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: 'subgraph-1000',
        ...base,
        loanAmountUsd: 1000,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: 'subgraph-600',
        ...base,
        ...discovery,
        loanAmountUsd: 600,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: 'subgraph-400-discovery',
        ...base,
        ...discovery,
        loanAmountUsd: 400,
        enableDexScreener: false,
        enableGecko: false,
      },
      {
        id: 'mixed-1500-discovery',
        ...base,
        ...discovery,
        loanAmountUsd: 1500,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-1000',
        ...base,
        loanAmountUsd: 1000,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-1000-aggressive',
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_USD, 2),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ETHEREUM_USD, 6),
          arbitrum: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_ARBITRUM_USD, 3),
          base: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_BASE_USD, 2),
          polygon: parseNumber(process.env.ALERT_AGGRESSIVE_MIN_NET_PROFIT_POLYGON_USD, 2),
        },
        maxSlippageBps: parseNumber(process.env.ALERT_AGGRESSIVE_MAX_SLIPPAGE_BPS, 75),
        loanAmountUsd: 1000,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-1000-ultra-discovery',
        ...base,
        minNetProfitUsd: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_USD, 1),
        perNetworkMinNetProfitUsd: {
          ethereum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ETHEREUM_USD, 4),
          arbitrum: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_ARBITRUM_USD, 2),
          base: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_BASE_USD, 1),
          polygon: parseNumber(process.env.ALERT_ULTRA_MIN_NET_PROFIT_POLYGON_USD, 1),
        },
        estimatedGasUsd: parseNumber(process.env.ALERT_ULTRA_ESTIMATED_GAS_USD, 7),
        maxSlippageBps: parseNumber(process.env.ALERT_ULTRA_MAX_SLIPPAGE_BPS, 80),
        minLiquidityUsd: parseNumber(process.env.ALERT_ULTRA_MIN_LIQUIDITY_USD, 90000),
        loanAmountUsd: 1000,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-600',
        ...base,
        ...discovery,
        loanAmountUsd: 600,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
      {
        id: 'mixed-400-discovery',
        ...base,
        ...discovery,
        loanAmountUsd: 400,
        enableDexScreener: true,
        enableGecko: enableGeckoMixed,
      },
    ];

  const results = [];
  for (const profile of profiles) {
    try {
      const result = await evaluateProfile({ endpoint, anonKey, profile, iterations, delayMs, thresholds, networks, httpTimeoutMs });
      results.push(result);
      console.log(`${profile.id}: alert=${result.alert} activeMed=${result.medians.active} badQuotesMed=${result.medians.badQuotes} pairKeysMed=${result.medians.pairKeys} topNet=${Number.isFinite(result.bestSeen.topWatchNet) ? result.bestSeen.topWatchNet.toFixed(2) : 'n/a'} topDist=${Number.isFinite(result.bestSeen.topDistance) ? result.bestSeen.topDistance.toFixed(2) : 'n/a'} score=${result.closenessScore.toFixed(2)}`);
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

run().catch((error) => {
  console.error('Opportunity alert scout failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
