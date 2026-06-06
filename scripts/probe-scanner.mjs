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

const env = loadEnvFiles();

const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

const deriveFunctionsUrl = () => {
  const viteSupabaseUrl = env.VITE_SUPABASE_URL || '';
  if (/^https:\/\//i.test(viteSupabaseUrl)) {
    return `${viteSupabaseUrl.replace(/\/$/, '')}/functions/v1/scan-arbitrage-opportunities`;
  }
  return 'http://127.0.0.1:54321/functions/v1/scan-arbitrage-opportunities';
};

const probeUrl = env.PROBE_URL || env.SUPABASE_FUNCTIONS_URL || deriveFunctionsUrl();

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientNetworkError = (error) => {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('fetch failed')
    || message.includes('eai_again')
    || message.includes('enotfound')
    || message.includes('econnreset')
    || message.includes('etimedout')
    || message.includes('connect timeout')
    || message.includes('timeout')
  );
};

const parseNetworks = (value, fallback) => {
  const raw = String(value || fallback || '');
  const parsed = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ['ethereum', 'arbitrum', 'base', 'polygon'];
};

const probeNetworks = parseNetworks(process.env.PROBE_NETWORKS, 'ethereum,arbitrum,base,polygon');

const payload = {
  networks: probeNetworks,
  loanAmountUsd: parseNumber(process.env.PROBE_LOAN_AMOUNT_USD, 10000),
  minNetProfitUsd: parseNumber(process.env.PROBE_MIN_NET_PROFIT_USD, 6),
  perNetworkMinNetProfitUsd: {
    ethereum: parseNumber(process.env.PROBE_MIN_NET_PROFIT_ETHEREUM_USD, 10),
    arbitrum: parseNumber(process.env.PROBE_MIN_NET_PROFIT_ARBITRUM_USD, 5),
    base: parseNumber(process.env.PROBE_MIN_NET_PROFIT_BASE_USD, 4),
    polygon: parseNumber(process.env.PROBE_MIN_NET_PROFIT_POLYGON_USD, 4),
  },
  minLiquidityUsd: parseNumber(process.env.PROBE_MIN_LIQUIDITY_USD, 120000),
  minSpreadPercent: parseNumber(process.env.PROBE_MIN_SPREAD_PERCENT, 0.03),
  maxResults: parseNumber(process.env.PROBE_MAX_RESULTS, 40),
  maxSlippageBps: parseNumber(process.env.PROBE_MAX_SLIPPAGE_BPS, 65),
  maxLiquidityUsagePercent: parseNumber(process.env.PROBE_MAX_LIQUIDITY_USAGE_PERCENT, 25),
  estimatedGasUsd: parseNumber(process.env.PROBE_ESTIMATED_GAS_USD, 12),
  // Enable all fallback quote sources so the probe reflects real live-scanner conditions
  enableDexScreener: process.env.PROBE_ENABLE_DEXSCREENER !== 'false',
  enableGecko: process.env.PROBE_ENABLE_GECKO !== 'false',
};

const run = async () => {
  console.log(`Probe target: ${probeUrl}`);
  console.log(`Probe networks: ${probeNetworks.join(', ')}`);
  try {
    const host = new URL(probeUrl).hostname;
    const resolved = await lookup(host);
    console.log(`Resolved host: ${host} -> ${resolved.address}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Host resolution check failed: ${message}`);
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  const httpTimeoutMs = Math.max(2_500, parseNumber(process.env.PROBE_HTTP_TIMEOUT_MS, 20_000));
  const httpRetries = Math.max(0, Math.round(parseNumber(process.env.PROBE_HTTP_RETRIES, 2)));
  const retryDelayMs = Math.max(250, Math.round(parseNumber(process.env.PROBE_HTTP_RETRY_DELAY_MS, 1_200)));

  let res;
  let lastError;
  for (let attempt = 0; attempt <= httpRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('probe-timeout'), httpTimeoutMs);
    try {
      res = await fetch(probeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      const normalizedError = (error instanceof Error && error.name === 'AbortError')
        ? new Error(`Probe request timeout after ${httpTimeoutMs}ms`)
        : error;
      if (attempt >= httpRetries || !isTransientNetworkError(normalizedError)) {
        throw normalizedError;
      }
      console.warn(`Probe request attempt ${attempt + 1} failed; retrying in ${retryDelayMs}ms (${normalizedError instanceof Error ? normalizedError.message : String(normalizedError)})`);
      await sleep(retryDelayMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!res) {
    throw (lastError instanceof Error ? lastError : new Error('Probe request failed without response'));
  }

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    console.log('Non-JSON response:', text.slice(0, 500));
    process.exit(1);
  }

  if (!res.ok) {
    console.log('Request failed:', res.status, data);
    if (res.status === 503 && typeof data?.message === 'string' && /name resolution failed/i.test(data.message)) {
      console.log('Hint: upstream DNS resolution failed inside scanner dependencies. Verify THEGRAPH_API_KEY, endpoint host reachability, and Supabase egress/DNS.');
    }
    process.exit(1);
  }

  const d = data.diagnostics || {};
  const activeCount = (data.opportunities || []).length;
  const watchCount = (data.watchlist || []).length;
  const sameDexDrop = Number(d.droppedBySameDex ?? 0);
  const slippageDrop = Number(d.droppedBySlippage ?? 0);
  const netDrop = Number(d.droppedByNetProfit ?? 0);
  const riskDrop = Number(d.droppedByExecutionRisk ?? 0);
  const spreadDrop = Number(d.droppedBySpread ?? 0);
  const pairKeys = Number(d.pairKeys ?? 0);
  const candidates = Number(d.candidates ?? 0);
  const overlapGatePassRate = pairKeys > 0 ? ((candidates / pairKeys) * 100).toFixed(1) : '0.0';
  const profitabilityScorecard = {
    quoteOverlap: sameDexDrop < Math.max(10, pairKeys * 0.4) ? 'weak' : 'critical',
    slippageControl: slippageDrop <= 4 ? 'ok' : 'weak',
    netMargin: netDrop === 0 && activeCount > 0 ? 'ok' : 'weak',
    executionRisk: riskDrop <= 4 ? 'ok' : 'weak',
    routeDiversity: watchCount > 0 ? 'present' : 'none',
  };
  console.log(
    `profitabilityScorecard: quoteOverlap=${profitabilityScorecard.quoteOverlap} slippageControl=${profitabilityScorecard.slippageControl} netMargin=${profitabilityScorecard.netMargin} executionRisk=${profitabilityScorecard.executionRisk} routeDiversity=${profitabilityScorecard.routeDiversity} overlapGatePassRate=${overlapGatePassRate}%`
  );
  console.log(
    `active=${activeCount} watch=${watchCount} pairKeys=${pairKeys} cand=${candidates} badQuotes=${d.droppedByBadQuotes ?? 0} spreadDrop=${spreadDrop} liqDrop=${d.droppedByLiquidity ?? 0} slipDrop=${slippageDrop} netDrop=${netDrop} sameDexDrop=${sameDexDrop} riskDrop=${riskDrop}`
  );

  // Quote source breakdown
  const qsc = d.quoteSourceCounts || {};
  if (qsc.subgraph || qsc.dexscreener || qsc.gecko) {
    console.log(`quoteSources: subgraph=${qsc.subgraph ?? 0} dexscreener=${qsc.dexscreener ?? 0} gecko=${qsc.gecko ?? 0}`);
  }
  const sourcePolicy = d.sourcePolicy || null;
  if (sourcePolicy) {
    console.log(`sourcePolicy: mode=${sourcePolicy.mode ?? 'unknown'} useExternalRawFeed=${Boolean(sourcePolicy.useExternalRawFeed)}`);
    if (sourcePolicy.notes) {
      console.log(`sourcePolicyNotes: ${String(sourcePolicy.notes)}`);
    }
  }
  const qfs = d.quoteFilterStats || null;
  if (qfs) {
    console.log(`quoteFilterStats: dexscreenerOutliersDropped=${qfs.dexscreenerOutliersDropped ?? 0}`);
  }
  const ingestionHeartbeat = d.ingestionHeartbeat || null;
  if (ingestionHeartbeat) {
    console.log(
      `ingestionHeartbeat: status=${ingestionHeartbeat.status ?? 'unknown'} networksRequested=${ingestionHeartbeat.networksRequested ?? 0} pairKeys=${ingestionHeartbeat.pairKeys ?? 0} usablePools=${ingestionHeartbeat.usablePools ?? 0} subgraphEntries=${ingestionHeartbeat.subgraphEntries ?? 0} fallbackAccepted=${ingestionHeartbeat.fallbackEntriesAccepted ?? 0} subgraphSourcesOk=${ingestionHeartbeat.subgraphSourcesOk ?? 0}`
    );
    if (ingestionHeartbeat.starvationReason) {
      console.log(`ingestionHeartbeatReason: ${String(ingestionHeartbeat.starvationReason)}`);
    }
  }
  const subgraphFetchStats = d.subgraphFetchStats || null;
  if (subgraphFetchStats) {
    const v3 = subgraphFetchStats.uniswapV3 || {};
    const v2 = subgraphFetchStats.uniswapV2 || {};
    const sushi = subgraphFetchStats.sushiswap || {};
    const balancer = subgraphFetchStats.balancer || {};
    const curve = subgraphFetchStats.curve || {};
    console.log(
      `subgraphFetchStats: v3=${v3.status || 'n/a'}:${v3.entries ?? 0} v2=${v2.status || 'n/a'}:${v2.entries ?? 0} sushi=${sushi.status || 'n/a'}:${sushi.entries ?? 0} balancer=${balancer.status || 'n/a'}:${balancer.entries ?? 0} curve=${curve.status || 'n/a'}:${curve.entries ?? 0}`
    );
  }
  const fallbackFetchStats = d.fallbackFetchStats || null;
  if (fallbackFetchStats) {
    const dex = fallbackFetchStats.dexscreener || {};
    const gecko = fallbackFetchStats.gecko || {};
    console.log(
      `fallbackFetchStats: dexscreener_ok=${dex.responsesOk ?? 0}/${dex.queries ?? 0} dexscreener_accepted=${dex.entriesAccepted ?? 0} gecko_ok=${gecko.responsesOk ?? 0}/${gecko.queries ?? 0} gecko_accepted=${gecko.entriesAccepted ?? 0}`
    );
  }
  const canonicalization = d.canonicalizationStats || null;
  if (canonicalization) {
    console.log(
      `canonicalizationStats: seen=${canonicalization.totalPoolsSeen ?? 0} mapped=${canonicalization.mapped ?? 0} dropMissingSymbols=${canonicalization.droppedMissingSymbols ?? 0} dropUntrackablePair=${canonicalization.droppedUntrackablePair ?? 0} dropNonPositiveCanonicalPrice=${canonicalization.droppedNonPositiveCanonicalPrice ?? 0}`
    );
    const bySource = canonicalization.bySource || {};
    console.log(
      `canonicalizationBySource: subgraph=${bySource.subgraph ?? 0} dexscreener=${bySource.dexscreener ?? 0} gecko=${bySource.gecko ?? 0}`
    );
  }

  // Per-network candidate breakdown from rejections + active opportunities
  const networkTally = {};
  const allCandidates = [
    ...(data.opportunities || []),
    ...(data.watchlist || []),
    ...(d.rejectionSamples || []),
  ];
  for (const c of allCandidates) {
    const net = (c.tokenPair || '').split(':')[0] || c.network || 'unknown';
    networkTally[net] = (networkTally[net] || 0) + 1;
  }
  if (Object.keys(networkTally).length > 0) {
    console.log('networkTally (sample):', JSON.stringify(networkTally));
  }

  const idx = d.indexCache || null;
  if (idx) {
    console.log(
      `indexCache enabled=${Boolean(idx.enabled)} requested=${idx.requestedRows ?? 0} accepted=${idx.acceptedRows ?? 0} hits=${idx.hitPairs ?? 0} misses=${idx.missPairs ?? 0} stale=${idx.stalePairs ?? 0} saved=${idx.upstreamCallsSaved ?? 0} p90AgeMs=${idx.p90IndexedRowAgeMs ?? 0}`
    );
  }

  const sameDex = d.sameDexDetails || null;
  if (sameDex && sameDex.sourceComposition) {
    const sc = sameDex.sourceComposition;
    console.log(
      `sameDexSourceComposition: subgraphOnly=${sc.subgraphOnly ?? 0} fallbackOnly=${sc.fallbackOnly ?? 0} mixed=${sc.mixed ?? 0}`
    );
    const reasons = sameDex.reasons || {};
    console.log(
      `sameDexReasons: insufficientQuotes=${reasons.insufficientQuotes ?? 0} insufficientValidPrices=${reasons.insufficientValidPrices ?? 0} insufficientDexOverlap=${reasons.insufficientDexOverlap ?? 0} noCrossDexPositiveSpread=${reasons.noCrossDexPositiveSpread ?? 0} missingBestPairEntries=${reasons.missingBestPairEntries ?? 0}`
    );

    const samples = Array.isArray(sameDex.samples) ? sameDex.samples : [];
    const insufficientQuotesPairs = samples
      .filter((sample) => sample && sample.reason === 'insufficientQuotes')
      .map((sample) => String(sample.tokenPair || 'unknown'))
      .slice(0, 10);
    if (insufficientQuotesPairs.length > 0) {
      console.log(`sameDexTopInsufficientQuotesPairs=${insufficientQuotesPairs.join(', ')}`);
    }
  }

  const badQuoteDetails = d.badQuoteDetails || null;
  if (badQuoteDetails) {
    const reasons = badQuoteDetails.reasons || {};
    const composition = badQuoteDetails.sourceComposition || {};
    console.log(
      `badQuoteReasons: invalidPriceSet=${reasons.invalidPriceSet ?? 0} nonPositiveOrInvalidCross=${reasons.nonPositiveOrInvalidCross ?? 0} unreasonableSpread=${reasons.unreasonableSpread ?? 0} unreasonableNearMissRoi=${reasons.unreasonableNearMissRoi ?? 0}`
    );
    console.log(
      `badQuoteSourceComposition: subgraphOnly=${composition.subgraphOnly ?? 0} fallbackOnly=${composition.fallbackOnly ?? 0} mixed=${composition.mixed ?? 0} subgraphDexscreener=${composition.subgraphDexscreener ?? 0} subgraphGecko=${composition.subgraphGecko ?? 0} dexscreenerOnly=${composition.dexscreenerOnly ?? 0} geckoOnly=${composition.geckoOnly ?? 0} crossFallback=${composition.crossFallback ?? 0} unknownRoute=${composition.unknownRoute ?? 0}`
    );
    const samples = Array.isArray(badQuoteDetails.samples) ? badQuoteDetails.samples.slice(0, 6) : [];
    if (samples.length > 0) {
      console.log('badQuoteSamples=', JSON.stringify(samples, null, 2));
    }
  }

  const routeAlt = d.routeAlternativeInsights || null;
  if (routeAlt) {
    console.log(`routeAlternativeInsights: inspectedPairs=${routeAlt.inspectedPairs ?? 0} samples=${Array.isArray(routeAlt.samples) ? routeAlt.samples.length : 0}`);
    const samples = Array.isArray(routeAlt.samples) ? routeAlt.samples.slice(0, 6) : [];
    if (samples.length > 0) {
      console.log('routeAlternativeSamples=', JSON.stringify(samples, null, 2));
    }
  }

  const policyDryRun = d.policyDryRun || null;
  if (policyDryRun) {
    const sub = policyDryRun.summary?.preferSubgraph || {};
    const ext = policyDryRun.summary?.preferExternalRaw || {};
    console.log(
      `policyDryRunSummary: enabled=${Boolean(policyDryRun.enabled)} ` +
      `preferSubgraph.diff=${sub.differentFromSelected ?? 0} preferSubgraph.mixedExtreme=${sub.selectedMixedExtreme ?? 0} preferSubgraph.subgraphAnchored=${sub.selectedSubgraphAnchored ?? 0} preferSubgraph.marginMedian=${sub.medianFlipMarginScore ?? 0} preferSubgraph.marginMin=${sub.minFlipMarginScore ?? 0} preferSubgraph.marginDistinctMedian=${sub.medianFlipMarginDistinctRouteScore ?? 0} preferSubgraph.marginDistinctMin=${sub.minFlipMarginDistinctRouteScore ?? 0} preferSubgraph.flipThresholdMedian=${sub.medianFlipThresholdScore ?? 0} preferSubgraph.flipThresholdMin=${sub.minFlipThresholdScore ?? 0} preferSubgraph.topTies=${sub.topTiePairs ?? 0} ` +
      `preferExternalRaw.diff=${ext.differentFromSelected ?? 0} preferExternalRaw.mixedExtreme=${ext.selectedMixedExtreme ?? 0} preferExternalRaw.subgraphAnchored=${ext.selectedSubgraphAnchored ?? 0} preferExternalRaw.marginMedian=${ext.medianFlipMarginScore ?? 0} preferExternalRaw.marginMin=${ext.minFlipMarginScore ?? 0} preferExternalRaw.marginDistinctMedian=${ext.medianFlipMarginDistinctRouteScore ?? 0} preferExternalRaw.marginDistinctMin=${ext.minFlipMarginDistinctRouteScore ?? 0} preferExternalRaw.flipThresholdMedian=${ext.medianFlipThresholdScore ?? 0} preferExternalRaw.flipThresholdMin=${ext.minFlipThresholdScore ?? 0} preferExternalRaw.topTies=${ext.topTiePairs ?? 0}`
    );
    const samples = Array.isArray(policyDryRun.samples) ? policyDryRun.samples.slice(0, 6) : [];
    if (samples.length > 0) {
      console.log('policyDryRunSamples=', JSON.stringify(samples, null, 2));
    }

    const calibrationHints = policyDryRun.calibrationHints || null;
    if (calibrationHints) {
      const easiestSubgraph = Array.isArray(calibrationHints.preferSubgraph?.easiestPairs)
        ? calibrationHints.preferSubgraph.easiestPairs.slice(0, 6)
        : [];
      const easiestExternalRaw = Array.isArray(calibrationHints.preferExternalRaw?.easiestPairs)
        ? calibrationHints.preferExternalRaw.easiestPairs.slice(0, 6)
        : [];
      if (easiestSubgraph.length > 0) {
        console.log('policyCalibrationHints.preferSubgraph=', JSON.stringify(easiestSubgraph, null, 2));
      }
      if (easiestExternalRaw.length > 0) {
        console.log('policyCalibrationHints.preferExternalRaw=', JSON.stringify(easiestExternalRaw, null, 2));
      }
    }
  }

  console.log('rejectionSamples=', JSON.stringify((d.rejectionSamples || []).slice(0, 5), null, 2));
  if ((data.watchlist || []).length > 0) {
    console.log('topWatch=', JSON.stringify(data.watchlist.slice(0, 3), null, 2));
  }
};

run().catch((error) => {
  console.error('Probe error:', error);
  process.exit(1);
});
