declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

export {};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UNI_V3_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
const UNI_V2_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2';
const SUSHI_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange';
const BALANCER_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2';
const CURVE_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/curvefi/curve';

const UNI_V3_SUBGRAPH = Deno.env.get('THEGRAPH_UNI_V3') ||
  (Deno.env.get('THEGRAPH_API_KEY')
    ? `https://gateway.thegraph.com/api/${Deno.env.get('THEGRAPH_API_KEY')}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`
    : UNI_V3_SUBGRAPH_PUBLIC);

const SUSHI_SUBGRAPH = Deno.env.get('THEGRAPH_SUSHI') ||
  (Deno.env.get('THEGRAPH_API_KEY')
    ? `https://gateway.thegraph.com/api/${Deno.env.get('THEGRAPH_API_KEY')}/subgraphs/id/6NUtT5mGjZ1tSshKLf5Q3uEEJtjBZJo1TpL5MXsUBqrT`
    : SUSHI_SUBGRAPH_PUBLIC);

const UNI_V2_SUBGRAPH = Deno.env.get('THEGRAPH_UNI_V2') || UNI_V2_SUBGRAPH_PUBLIC;
const BALANCER_SUBGRAPH = Deno.env.get('THEGRAPH_BALANCER') || BALANCER_SUBGRAPH_PUBLIC;
const CURVE_SUBGRAPH = Deno.env.get('THEGRAPH_CURVE') || CURVE_SUBGRAPH_PUBLIC;

type NetworkName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'bsc';

type Pool = {
  token0: { symbol: string; address?: string };
  token1: { symbol: string; address?: string };
  token0Price: string;
  token1Price: string;
  reserveUSD?: string;
  liquidity?: string;
  network?: NetworkName;
  poolAddress?: string;
  feeTier?: number;
  dex?: 'Uniswap V3' | 'Uniswap V2' | 'SushiSwap' | 'Balancer' | 'Curve';
  sourceType?: 'subgraph' | 'dexscreener' | 'gecko';
};

interface ScannerConfig {
  minSpreadPercent: number;
  minLiquidityUsd: number;
  minNetProfitUsd: number;
  minNetProfitUsdByNetwork: Partial<Record<NetworkName, number>>;
  adaptiveProfitPressureMultiplier: number;
  maxSlippageBps: number;
  maxLiquidityUsageFraction: number;
  maxResults: number;
  loanAmountUsd: number;
  estimatedGasUsd: number;
}

interface Opportunity {
  tokenPair: string;
  buyDex: 'Uniswap V3' | 'Uniswap V2' | 'SushiSwap' | 'Balancer' | 'Curve';
  sellDex: 'Uniswap V3' | 'Uniswap V2' | 'SushiSwap' | 'Balancer' | 'Curve';
  network: NetworkName;
  loanAmount: number;
  executableLoanAmount: number;
  grossProfit: number;
  netProfit: number;
  distanceToExecutableUsd: number;
  gasCost: number;
  confidenceScore: number;
  confidenceTier: 'high' | 'medium' | 'low';
  spread: string;
  liquidity: string;
  estimatedSlippageBps: number;
  buyImpactBps: number;
  sellImpactBps: number;
  routePenaltyBps: number;
  status: 'active' | 'watchlist';
  quoteSources: Array<'subgraph' | 'dexscreener' | 'gecko'>;
  executionPayload?: Record<string, unknown>;
}

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  baseToken?: { symbol?: string };
  quoteToken?: { symbol?: string };
}

interface GeckoSearchPool {
  attributes?: Record<string, unknown>;
  relationships?: {
    network?: {
      data?: {
        id?: string;
      };
    };
  };
}

interface ScanDiagnostics {
  poolCounts: {
    uniV3: number;
    uniV2: number;
    sushi: number;
    balancer: number;
    curve: number;
  };
  pairKeys: number;
  candidates: number;
  droppedBySpread: number;
  droppedByLiquidity: number;
  droppedBySlippage: number;
  droppedByNetProfit: number;
  droppedByBadQuotes: number;
  droppedBySameDex: number;
  droppedByExecutionRisk: number;
  sizeAdjusted: number;
  executionFeasible: number;
  profitQualified: number;
  quoteValidated: number;
  watchlistCount: number;
  quoteSourceCounts: {
    subgraph: number;
    dexscreener: number;
    gecko: number;
  };
  rejectionSamples: Array<{
    tokenPair: string;
    reason: 'badQuotes' | 'sameDex' | 'spread' | 'liquidity' | 'slippage' | 'netProfit' | 'executionRisk';
    buyDex?: Opportunity['buyDex'];
    sellDex?: Opportunity['sellDex'];
    spread?: number;
    buyLiquidityUsd?: number;
    sellLiquidityUsd?: number;
    attemptedLoanAmount?: number;
    buyImpactBps?: number;
    sellImpactBps?: number;
  }>;
}

interface ExecutionCandidate {
  executableLoanAmount: number;
  grossProfit: number;
  netProfit: number;
  gasCost: number;
  estimatedSlippageBps: number;
  buyImpactBps: number;
  sellImpactBps: number;
  routePenaltyBps: number;
}

type TelemetryOpportunity = Opportunity & {
  scanRunId: string;
  candidateId: string;
  quoteTimestamp: string;
  dataSource: 'multi-source';
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const canPersistTelemetry = () => Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const persistTelemetryRows = async (table: string, rows: Record<string, unknown>[]) => {
  if (!canPersistTelemetry() || rows.length === 0) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Failed to read error body');
      console.warn(`Failed to persist telemetry rows to ${table}: ${res.status} ${res.statusText} ${errorText}`);
    }
  } catch (error) {
    console.warn(`Failed to persist telemetry rows to ${table}:`, error);
  }
};

const pushRejectionSample = (
  diagnostics: ScanDiagnostics,
  sample: ScanDiagnostics['rejectionSamples'][number],
) => {
  const samples = diagnostics.rejectionSamples;
  const maxSamples = 5;

  if (sample.reason === 'badQuotes') {
    const existingBadQuotes = samples.filter((entry) => entry.reason === 'badQuotes').length;
    const hasActionableSample = samples.some((entry) => entry.reason !== 'badQuotes');
    if (hasActionableSample && existingBadQuotes >= 1) {
      return;
    }
  }

  if (samples.length < maxSamples) {
    samples.push(sample);
    return;
  }

  if (sample.reason !== 'badQuotes') {
    const badQuoteIndex = samples.findIndex((entry) => entry.reason === 'badQuotes');
    if (badQuoteIndex !== -1) {
      samples[badQuoteIndex] = sample;
    }
  }
};

const parseNumberEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseNumberInput = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMinNetProfitByNetwork = (input: unknown): Partial<Record<NetworkName, number>> => {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<Record<NetworkName, number>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (!isNetworkName(normalized)) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) out[normalized] = parsed;
  }
  return out;
};

const parsePoolLiquidity = (pool: Pool): number => {
  const reserve = parseFloat(pool.reserveUSD || '0');
  if (Number.isFinite(reserve) && reserve > 0) return reserve;
  const liquidity = parseFloat(pool.liquidity || '0');
  if (!Number.isFinite(liquidity) || liquidity <= 0) return 0;
  // Uniswap V3 liquidity is not USD-denominated; use a conservative heuristic proxy.
  return liquidity / 1e12;
};

const estimateSlippageBps = (tradeSizeUsd: number, liquidityUsd: number): number => {
  if (liquidityUsd <= 0) return 10_000;
  
  // Exponential price impact model based on AMM constant product (x*y=k).
  // As trade size increases relative to liquidity, impact grows exponentially, not linearly.
  // Formula: impact = (1 - 1/sqrt(1 + ratio)) * 10000, where ratio = tradeSize / liquidity
  // This matches Uniswap V2/V3 pricing behavior and other constant-product AMMs.
  const ratio = tradeSizeUsd / liquidityUsd;
  
  if (ratio <= 0) return 1;
  if (ratio >= 100) return 10_000; // Trade is ~100x larger than liquidity = 100% slippage
  
  // Use sqrt-based formula to model exponential impact
  const impactFraction = 1 - (1 / Math.sqrt(1 + ratio));
  const impactBps = Math.round(impactFraction * 10_000);
  
  return Math.max(1, Math.min(10_000, impactBps));
};

const dexPenaltyBps: Record<Opportunity['buyDex'], number> = {
  'Uniswap V3': 4,
  'Uniswap V2': 8,
  'SushiSwap': 9,
  'Balancer': 6,
  'Curve': 3,
};

const DEFAULT_MAX_EXECUTABLE_LIQUIDITY_FRACTION = 0.35;

// Volume steps inspired by Flashbots simple-arbitrage - test multiple sizes
const SIZE_STEPS = [1, 0.75, 0.56, 0.42, 0.31, 0.24, 0.18, 0.13, 0.1, 0.07, 0.05, 0.03, 0.02];

/**
 * Evaluate a single volume to get candidate metrics.
 * Returns null if the volume is infeasible (slippage too high, spread negative, etc.).
 */
const evaluateSingleVolume = (
  buyPrice: number,
  sellPrice: number,
  buyLiquidityUsd: number,
  sellLiquidityUsd: number,
  buyDex: Opportunity['buyDex'],
  sellDex: Opportunity['sellDex'],
  network: NetworkName,
  config: ScannerConfig,
  executableLoanAmount: number,
): ExecutionCandidate | null => {
  if (!Number.isFinite(executableLoanAmount) || executableLoanAmount <= 0) return null;

  const buyImpactBps = estimateSlippageBps(executableLoanAmount, buyLiquidityUsd);
  const sellImpactBps = estimateSlippageBps(executableLoanAmount, sellLiquidityUsd);
  const routePenaltyBps = dexPenaltyBps[buyDex] + dexPenaltyBps[sellDex];
  const estimatedSlippageBps = buyImpactBps + sellImpactBps + routePenaltyBps;

  if (buyImpactBps > config.maxSlippageBps || sellImpactBps > config.maxSlippageBps) {
    return null;
  }

  const quotedBuyPrice = buyPrice * (1 + buyImpactBps / 10_000);
  const quotedSellPrice = sellPrice * (1 - sellImpactBps / 10_000);
  if (!Number.isFinite(quotedBuyPrice) || !Number.isFinite(quotedSellPrice) || quotedBuyPrice <= 0 || quotedSellPrice <= 0 || quotedSellPrice <= quotedBuyPrice) {
    return null;
  }

  const quotedSpread = (quotedSellPrice - quotedBuyPrice) / quotedBuyPrice;
  const grossProfit = quotedSpread * executableLoanAmount;
  const routePenaltyCost = (routePenaltyBps / 10_000) * executableLoanAmount;
  const step = executableLoanAmount / config.loanAmountUsd;
  // Gas cost scales inversely with size step: smaller loans have proportionally higher gas impact
  const gasCost = estimateGasUsdForNetwork(network, config.estimatedGasUsd) * Math.pow(Math.max(0.01, step), -0.5);
  const netProfit = grossProfit - routePenaltyCost - gasCost;

  return {
    executableLoanAmount,
    grossProfit,
    netProfit,
    gasCost,
    estimatedSlippageBps,
    buyImpactBps,
    sellImpactBps,
    routePenaltyBps,
  };
};

/**
 * Binary search refinement between two volumes to find optimal profit.
 * Inspired by Flashbots simple-arbitrage getBestCrossedMarket().
 */
const binarySearchVolume = (
  buyPrice: number,
  sellPrice: number,
  buyLiquidityUsd: number,
  sellLiquidityUsd: number,
  buyDex: Opportunity['buyDex'],
  sellDex: Opportunity['sellDex'],
  network: NetworkName,
  config: ScannerConfig,
  executableLiquidityUsd: number,
  lowVolume: number,
  highVolume: number,
  best: ExecutionCandidate,
  maxIterations = 4,
): ExecutionCandidate => {
  let iterations = 0;
  let lo = lowVolume;
  let hi = highVolume;
  let current = best;

  while (iterations < maxIterations && hi - lo > config.loanAmountUsd * 0.01) {
    const midVolume = (lo + hi) / 2;
    const tryAmount = Math.min(midVolume, executableLiquidityUsd * config.maxLiquidityUsageFraction);
    const tryCandidate = evaluateSingleVolume(
      buyPrice, sellPrice, buyLiquidityUsd, sellLiquidityUsd,
      buyDex, sellDex, network, config, tryAmount
    );

    if (tryCandidate && tryCandidate.netProfit > current.netProfit) {
      current = tryCandidate;
      // Profit improved at mid, search higher
      lo = midVolume;
    } else {
      // Profit worse at mid, search lower
      hi = midVolume;
    }
    iterations++;
  }

  return current;
};

const evaluateExecutionCandidate = (
  buyPrice: number,
  sellPrice: number,
  buyPool: Pool,
  sellPool: Pool,
  buyDex: Opportunity['buyDex'],
  sellDex: Opportunity['sellDex'],
  network: NetworkName,
  config: ScannerConfig,
): ExecutionCandidate | null => {
  const buyLiquidityUsd = parsePoolLiquidity(buyPool);
  const sellLiquidityUsd = parsePoolLiquidity(sellPool);
  const executableLiquidityUsd = Math.min(buyLiquidityUsd, sellLiquidityUsd);
  if (executableLiquidityUsd <= 0) return null;

  // Pre-check: verify prices cross (sellPrice > buyPrice) before volume search
  // Inspired by Flashbots simple-arbitrage crossed market detection
  if (sellPrice <= buyPrice) return null;

  let best: ExecutionCandidate | null = null;
  let prevCandidate: ExecutionCandidate | null = null;
  let prevVolume = 0;

  for (const step of SIZE_STEPS) {
    const requestedLoanAmount = config.loanAmountUsd * step;
    const executableLoanAmount = Math.min(requestedLoanAmount, executableLiquidityUsd * config.maxLiquidityUsageFraction);

    const candidate = evaluateSingleVolume(
      buyPrice, sellPrice, buyLiquidityUsd, sellLiquidityUsd,
      buyDex, sellDex, network, config, executableLoanAmount
    );

    if (!candidate) {
      prevVolume = executableLoanAmount;
      prevCandidate = null;
      continue;
    }

    // Flashbots pattern: if profit decreased from previous step, binary search between them
    if (best && prevCandidate && candidate.netProfit < best.netProfit && prevVolume > 0) {
      const refined = binarySearchVolume(
        buyPrice, sellPrice, buyLiquidityUsd, sellLiquidityUsd,
        buyDex, sellDex, network, config, executableLiquidityUsd,
        executableLoanAmount, prevVolume, best
      );
      if (refined.netProfit > best.netProfit) {
        best = refined;
      }
      break; // Found local maximum, stop searching
    }

    if (!best || candidate.netProfit > best.netProfit) {
      best = candidate;
    }

    prevVolume = executableLoanAmount;
    prevCandidate = candidate;
  }

  return best;
};

const buildScannerConfig = (body: Record<string, unknown>): ScannerConfig => {
  const envLoanAmountUsd = parseNumberEnv(Deno.env.get('SCANNER_LOAN_AMOUNT_USD'), 10_000);
  const bodyLoanAmountUsd = parseNumberInput(body.loanAmountUsd);
  const bodyMinSpreadPercent = parseNumberInput(body.minSpreadPercent);
  const bodyMinLiquidityUsd = parseNumberInput(body.minLiquidityUsd);
  const bodyMinNetProfitUsd = parseNumberInput(body.minNetProfitUsd);
  const bodyAdaptiveProfitPressureMultiplier = parseNumberInput(body.adaptiveProfitPressureMultiplier);
  const bodyMaxSlippageBps = parseNumberInput(body.maxSlippageBps);
  const bodyMaxLiquidityUsagePercent = parseNumberInput(body.maxLiquidityUsagePercent);
  const bodyMaxLiquidityUsageFraction = parseNumberInput(body.maxLiquidityUsageFraction);
  const bodyMaxResults = parseNumberInput(body.maxResults);
  const bodyEstimatedGasUsd = parseNumberInput(body.estimatedGasUsd);

  const envByNetworkRaw = Deno.env.get('SCANNER_MIN_NET_PROFIT_USD_BY_NETWORK');
  let envByNetwork: Partial<Record<NetworkName, number>> = {};
  if (envByNetworkRaw) {
    try {
      envByNetwork = parseMinNetProfitByNetwork(JSON.parse(envByNetworkRaw));
    } catch {
      envByNetwork = {};
    }
  }
  const bodyByNetwork = parseMinNetProfitByNetwork((body.perNetworkMinNetProfitUsd ?? body.minNetProfitUsdByNetwork) as unknown);

  const envMaxLiquidityUsagePercent = parseNumberEnv(
    Deno.env.get('SCANNER_MAX_LIQUIDITY_USAGE_PERCENT'),
    DEFAULT_MAX_EXECUTABLE_LIQUIDITY_FRACTION * 100,
  );
  const normalizedMaxLiquidityUsagePercent = bodyMaxLiquidityUsagePercent
    ?? (Number.isFinite(bodyMaxLiquidityUsageFraction)
      ? (bodyMaxLiquidityUsageFraction as number) * 100
      : envMaxLiquidityUsagePercent);

  const maxLiquidityUsageFraction = Math.max(
    0.01,
    Math.min(0.95, normalizedMaxLiquidityUsagePercent / 100),
  );

  return {
    minSpreadPercent: bodyMinSpreadPercent ?? parseNumberEnv(Deno.env.get('SCANNER_MIN_SPREAD_PERCENT'), 0.075),
    minLiquidityUsd: bodyMinLiquidityUsd ?? parseNumberEnv(Deno.env.get('SCANNER_MIN_LIQUIDITY_USD'), 175_000),
    minNetProfitUsd: bodyMinNetProfitUsd ?? parseNumberEnv(Deno.env.get('SCANNER_MIN_NET_PROFIT_USD'), 14),
    minNetProfitUsdByNetwork: {
      ...envByNetwork,
      ...bodyByNetwork,
    },
    adaptiveProfitPressureMultiplier: bodyAdaptiveProfitPressureMultiplier ?? parseNumberEnv(Deno.env.get('SCANNER_NET_PROFIT_GAS_MULTIPLIER'), 0.35),
    maxSlippageBps: bodyMaxSlippageBps ?? parseNumberEnv(Deno.env.get('SCANNER_MAX_SLIPPAGE_BPS'), 40),
    maxLiquidityUsageFraction,
    maxResults: Math.max(1, Math.min(50, bodyMaxResults ?? parseNumberEnv(Deno.env.get('SCANNER_MAX_RESULTS'), 25))),
    loanAmountUsd: bodyLoanAmountUsd ?? envLoanAmountUsd,
    estimatedGasUsd: bodyEstimatedGasUsd ?? parseNumberEnv(Deno.env.get('SCANNER_ESTIMATED_GAS_USD'), 18),
  };
};

const fetchSubgraph = async (url: string, query: string) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph error ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
};

const fetchSubgraphWithFallback = async (primaryUrl: string, fallbackUrl: string, query: string) => {
  try {
    return await fetchSubgraph(primaryUrl, query);
  } catch (primaryError) {
    // If gateway auth fails (or other transient upstream errors), retry public endpoint.
    if (primaryUrl !== fallbackUrl) {
      console.warn(`Primary subgraph failed, retrying fallback: ${primaryUrl}`);
      try {
        return await fetchSubgraph(fallbackUrl, query);
      } catch {
        // Re-throw the primary error for clearer diagnostics.
      }
    }
    throw primaryError;
  }
};

const sanitizeGraphUrl = (url: string): string => {
  return url.replace(/\/api\/[^/]+\//, '/api/***/');
};

const testSubgraphConnectivity = async (
  name: string,
  primaryUrl: string,
  fallbackUrl: string,
) => {
  const probeQuery = '{ _meta { hasIndexingErrors } }';
  const detail = {
    name,
    primaryUrl: sanitizeGraphUrl(primaryUrl),
    fallbackUrl: sanitizeGraphUrl(fallbackUrl),
    usedSource: 'none' as 'primary' | 'fallback' | 'none',
    status: 'failed' as 'ok' | 'failed',
    error: '',
  };

  try {
    await fetchSubgraph(primaryUrl, probeQuery);
    detail.usedSource = 'primary';
    detail.status = 'ok';
    return detail;
  } catch (primaryError) {
    if (primaryUrl !== fallbackUrl) {
      try {
        await fetchSubgraph(fallbackUrl, probeQuery);
        detail.usedSource = 'fallback';
        detail.status = 'ok';
        detail.error = primaryError instanceof Error ? primaryError.message : 'Primary endpoint failed';
        return detail;
      } catch {
        // Fall through and report primary error for clearer diagnostics.
      }
    }
    detail.error = primaryError instanceof Error ? primaryError.message : 'Unknown connectivity error';
    return detail;
  }
};

const parseBooleanEnv = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const evaluateScannerReadinessGates = async () => {
  const hasGraphKey = Boolean(Deno.env.get('THEGRAPH_API_KEY'));
  const graphConnectivity = await Promise.all([
    testSubgraphConnectivity('uniswapV3', UNI_V3_SUBGRAPH, UNI_V3_SUBGRAPH_PUBLIC),
    testSubgraphConnectivity('uniswapV2', UNI_V2_SUBGRAPH, UNI_V2_SUBGRAPH_PUBLIC),
    testSubgraphConnectivity('sushiswap', SUSHI_SUBGRAPH, SUSHI_SUBGRAPH_PUBLIC),
    testSubgraphConnectivity('balancer', BALANCER_SUBGRAPH, BALANCER_SUBGRAPH_PUBLIC),
    testSubgraphConnectivity('curve', CURVE_SUBGRAPH, CURVE_SUBGRAPH_PUBLIC),
  ]);

  const healthySources = graphConnectivity.filter((source) => source.status === 'ok').length;
  const fallbackSources = graphConnectivity.filter((source) => source.usedSource === 'fallback').length;

  const minHealthySources = Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_MIN_GRAPH_SOURCES_HEALTHY'), 3)));
  const maxFallbackSources = Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_MAX_GRAPH_FALLBACK_SOURCES'), 2)));

  const pass = hasGraphKey && healthySources >= minHealthySources && fallbackSources <= maxFallbackSources;

  return {
    pass,
    hasGraphKey,
    healthySources,
    totalSources: graphConnectivity.length,
    fallbackSources,
    thresholds: {
      minHealthySources,
      maxFallbackSources,
    },
    graphConnectivity,
  };
};

const topPairsQuery = (limit = 20) => `
{
  pools(first: ${limit}, orderBy: volumeUSD, orderDirection: desc) {
    id
    fee
    token0 { symbol address }
    token1 { symbol address }
    token0Price
    token1Price
    liquidity
    reserveUSD
  }
}`;

const topV2PairsQuery = (limit = 20) => `
{
  pairs(first: ${limit}, orderBy: volumeUSD, orderDirection: desc) {
    id
    token0 { symbol address }
    token1 { symbol address }
    token0Price
    token1Price
    reserveUSD
  }
}`;

const topBalancerPoolsQuery = (limit = 20) => `
{
  pools(first: ${limit}, orderBy: totalLiquidity, orderDirection: desc, where: { totalLiquidity_gt: "100000" }) {
    tokensList
    totalLiquidity
    totalSwapVolume
  }
}`;

const topCurvePoolsQuery = (limit = 20) => `
{
  pools(first: ${limit}, orderBy: cumulativeVolumeUSD, orderDirection: desc) {
    coins
    balances
    cumulativeVolumeUSD
  }
}`;

const toPoolFromPair = (pair: Record<string, unknown>, dex: 'Uniswap V3' | 'Uniswap V2' | 'SushiSwap' | 'Balancer' | 'Curve' = 'Uniswap V3'): Pool => {
  const token0 = (pair.token0 as { symbol?: string; address?: string } | undefined) || {};
  const token1 = (pair.token1 as { symbol?: string; address?: string } | undefined) || {};
  return {
    token0: { symbol: token0.symbol || '', address: token0.address },
    token1: { symbol: token1.symbol || '', address: token1.address },
    token0Price: String(pair.token0Price || '0'),
    token1Price: String(pair.token1Price || '0'),
    reserveUSD: String(pair.reserveUSD || '0'),
    network: 'ethereum',
    poolAddress: String(pair.id || ''),
    feeTier: typeof pair.fee === 'number' ? pair.fee : undefined,
    dex,
    sourceType: 'subgraph',
  };
};

const toPoolFromBalancer = (pool: Record<string, unknown>): Pool | null => {
  const tokens = (pool.tokensList as string[] | undefined) || [];
  if (tokens.length < 2) return null;

  const token0 = tokens[0] || '';
  const token1 = tokens[1] || '';
  if (!token0 || !token1) return null;

  // Balancer response here does not expose token balances directly in this lightweight query.
  // Use neutral prices to keep pair present; spread decisions still require cross-dex deltas.
  return {
    token0: { symbol: token0 },
    token1: { symbol: token1 },
    token0Price: '1',
    token1Price: '1',
    reserveUSD: String(pool.totalLiquidity || '0'),
    network: 'ethereum',
    sourceType: 'subgraph',
  };
};

const toPoolFromCurve = (pool: Record<string, unknown>): Pool | null => {
  const coins = (pool.coins as string[] | undefined) || [];
  const balances = (pool.balances as string[] | undefined) || [];
  if (coins.length < 2 || balances.length < 2) return null;

  const token0 = coins[0] || '';
  const token1 = coins[1] || '';
  const b0 = parseFloat(String(balances[0] || '0'));
  const b1 = parseFloat(String(balances[1] || '0'));
  if (!token0 || !token1 || !Number.isFinite(b0) || !Number.isFinite(b1) || b0 <= 0 || b1 <= 0) return null;

  const p01 = b1 / b0;
  const p10 = b0 / b1;
  return {
    token0: { symbol: token0 },
    token1: { symbol: token1 },
    token0Price: String(p01),
    token1Price: String(p10),
    reserveUSD: String(pool.cumulativeVolumeUSD || '0'),
    network: 'ethereum',
    sourceType: 'subgraph',
  };
};

const CHAIN_MAP: Record<string, NetworkName> = {
  ethereum: 'ethereum',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
  bsc: 'bsc',
};

const NETWORK_GAS_MULTIPLIER: Record<NetworkName, number> = {
  ethereum: 1,
  polygon: 0.18,
  arbitrum: 0.35,
  base: 0.22,
  bsc: 0.22,
};

const GECKO_NETWORK_TO_APP: Record<string, NetworkName> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  polygon: 'polygon',
  polygon_pos: 'polygon',
  arbitrum: 'arbitrum',
  arbitrum_one: 'arbitrum',
  base: 'base',
  base_mainnet: 'base',
  bsc: 'bsc',
  binance_smart_chain: 'bsc',
};

const CORE_BASE_TOKENS: Record<NetworkName, Set<string>> = {
  ethereum: new Set(['WETH', 'ETH', 'WBTC', 'BTC', 'LINK', 'UNI', 'AAVE', 'LDO', 'CRV', 'FRAX', 'MKR']),
  polygon: new Set(['WMATIC', 'MATIC', 'WETH', 'ETH', 'WBTC', 'BTC', 'LINK', 'AAVE', 'GHST', 'CRV']),
  arbitrum: new Set(['WETH', 'ETH', 'WBTC', 'BTC', 'ARB', 'GMX', 'MAGIC', 'LINK', 'RDNT']),
  base: new Set(['WETH', 'ETH', 'WBTC', 'BTC', 'LINK', 'AERO', 'DEGEN', 'BRETT']),
  bsc: new Set(['WBNB', 'BNB', 'BTCB', 'BTC', 'ETH', 'CAKE', 'XVS']),
};

/**
 * DEX Router addresses for canonical execution payloads
 * Maps network → DEX → SwapRouter contract address
 */
const DEX_ROUTERS: Record<NetworkName, Partial<Record<'Uniswap V3' | 'Uniswap V2' | 'SushiSwap' | 'Balancer' | 'Curve', string>>> = {
  ethereum: {
    'Uniswap V3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    'Uniswap V2': '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    'SushiSwap': '0xd9e1cE17f2641f24aE9d90c5c91B2DA78cED6f1a',
    'Balancer': '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    'Curve': '0xF0d4c12a5768D386aCEd46608299AdE3f3d39010',
  },
  polygon: {
    'Uniswap V3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    'Uniswap V2': '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A07AaA',
    'SushiSwap': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    'Balancer': '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    'Curve': '0x445FE580eF8d70C59f5dFa67356b5C48c26f7d5F',
  },
  arbitrum: {
    'Uniswap V3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    'Uniswap V2': '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    'SushiSwap': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    'Balancer': '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    'Curve': '0x9823df5f33cAf82e9aF0b9405053ae367eA9b847',
  },
  base: {
    'Uniswap V3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    'Uniswap V2': '0x4752ba5DBc23f44D87826239FF86bbF073A9f58D',
    'SushiSwap': '0x6BDED42c6DA8FBf0d2f43e8F9328aBDADA431163',
    'Balancer': '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    'Curve': '0xd66116D54d1D74c752C33221A881852bEe2e129c',
  },
  bsc: {
    'Uniswap V2': '0x10ED43C718714eb63d5aA57B78f6c768FCf331ec',
    'SushiSwap': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    'Balancer': '0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce',
    'Curve': '0x7DA16CD7529d95cE2f75cF2625529FBa2d7155b5',
  },
};

const SEARCH_TERMS_BY_NETWORK: Record<NetworkName, string[]> = {
  ethereum: ['WETH USDC', 'WETH USDT', 'WBTC USDC', 'WBTC USDT', 'LINK USDC', 'UNI USDC', 'AAVE USDC', 'LDO USDC', 'CRV USDC', 'DAI USDC', 'USDC USDT', 'WETH', 'WBTC', 'LINK'],
  polygon: ['WMATIC USDC', 'WMATIC USDT', 'WETH USDC', 'WBTC USDC', 'LINK USDC', 'AAVE USDC', 'GHST USDC', 'DAI USDC', 'USDC USDT', 'WMATIC', 'WETH'],
  arbitrum: ['WETH USDC', 'WETH USDT', 'WBTC USDC', 'ARB USDC', 'GMX USDC', 'MAGIC USDC', 'LINK USDC', 'DAI USDC', 'USDC USDT', 'ARB', 'WETH', 'WBTC'],
  base: ['WETH USDC', 'WETH USDT', 'WBTC USDC', 'LINK USDC', 'AERO USDC', 'DEGEN USDC', 'USDC USDT', 'WETH', 'AERO'],
  bsc: ['WBNB USDT', 'WBNB USDC', 'BTCB USDT', 'ETH USDT', 'CAKE USDT', 'USDC USDT', 'WBNB', 'BTCB'],
};

const isNetworkName = (value: string): value is NetworkName => {
  return value === 'ethereum' || value === 'polygon' || value === 'arbitrum' || value === 'base' || value === 'bsc';
};

const MIN_FALLBACK_LIQUIDITY_USD = 20_000;

const toNetworkName = (value: string | undefined): NetworkName => {
  const normalized = (value || 'ethereum').toLowerCase();
  if (isNetworkName(normalized)) return normalized;
  return 'ethereum';
};

const estimateGasUsdForNetwork = (network: NetworkName, estimatedGasUsd: number): number => {
  return Math.max(1, estimatedGasUsd * NETWORK_GAS_MULTIPLIER[network]);
};

/**
 * Build a canonical ExecutionPayload from scan data
 * This maps scanner opportunity data to the exact parameters needed by FlashLoanArbitrage.executeArbitrage()
 */
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WETH: 18,
  ETH: 18,
  WBTC: 8,
  BTC: 8,
  LINK: 18,
  UNI: 18,
  AAVE: 18,
  MATIC: 18,
  WMATIC: 18,
  ARB: 18,
  GMX: 18,
};

const formatTokenUnits = (amount: number, decimals = 18): bigint => {
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  const [whole, fraction = ''] = amount.toFixed(decimals).split('.');
  const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(`${whole}${paddedFraction}`);
};

const getTokenDecimals = (symbol: string): number => {
  return TOKEN_DECIMALS[normalizeTokenSymbol(symbol)] ?? 18;
};

const calculateAmountBMin = (
  assetAmountUsd: number,
  buyPrice: number,
  estimatedSlippageBps: number,
  tokenBDecimals: number,
): bigint => {
  if (buyPrice <= 0) return 0n;
  const expectedTokenB = assetAmountUsd / buyPrice;
  const slippageBuffer = 1 + estimatedSlippageBps / 10_000 + 0.02;
  return formatTokenUnits(expectedTokenB / slippageBuffer, tokenBDecimals);
};

const SOURCE_RELIABILITY: Record<'subgraph' | 'dexscreener' | 'gecko', number> = {
  subgraph: 1.0,
  dexscreener: 0.72,
  gecko: 0.52,
};

const buildExecutionPayload = (
  buyPool: Pool,
  sellPool: Pool,
  buyDex: Opportunity['buyDex'],
  sellDex: Opportunity['sellDex'],
  tokenPair: string,
  network: NetworkName,
  executableLoanAmount: number,
  grossProfit: number,
  netProfit: number,
  gasCost: number,
  estimatedSlippageBps: number,
  confidenceScore: number,
  buyPrice: number,
): {
  payload: Record<string, unknown> | null;
  error?: string;
} => {
  // Extract token addresses from pool objects
  // tokenPair format: "ethereum:TOKEN0/TOKEN1" where TOKEN1 is typically the quote (USDC/USDT)
  const parts = tokenPair.split('/');
  if (parts.length !== 2) {
    return { payload: null, error: 'Invalid tokenPair format' };
  }

  const token0Symbol = parts[0].split(':').pop() || '';
  const token1Symbol = parts[1];
  
  // Determine which token is the quote (asset to borrow) and which is the base (tokenB to arbitrage)
  const isQuoteToken0 = isStableQuote(token0Symbol);
  const isQuoteToken1 = isStableQuote(token1Symbol);
  
  if (!isQuoteToken0 && !isQuoteToken1) {
    return { payload: null, error: 'No stable quote token found in pair' };
  }
  
  // Asset to borrow is the quote; tokenB to arbitrage is the base
  const assetSymbol = isQuoteToken0 ? token0Symbol : token1Symbol;
  const tokenBSymbol = isQuoteToken0 ? token1Symbol : token0Symbol;
  
  const assetDecimals = getTokenDecimals(assetSymbol);
  const tokenBDecimals = getTokenDecimals(tokenBSymbol);
  
  const asset = isQuoteToken0 ? buyPool.token0?.address || sellPool.token0?.address : buyPool.token1?.address || sellPool.token1?.address;
  const tokenB = isQuoteToken0 ? buyPool.token1?.address || sellPool.token1?.address : buyPool.token0?.address || sellPool.token0?.address;
  
  if (!asset || !tokenB) {
    return { payload: null, error: 'Missing token addresses from pools' };
  }

  const assetAmount = formatTokenUnits(executableLoanAmount, assetDecimals);
  const amountBMin = calculateAmountBMin(executableLoanAmount, buyPrice, estimatedSlippageBps, tokenBDecimals);
  if (assetAmount <= 0n || amountBMin <= 0n) {
    return { payload: null, error: 'Invalid amount conversion for execution payload' };
  }

  // Get router addresses
  const routerA = DEX_ROUTERS[network]?.[buyDex];
  const routerB = DEX_ROUTERS[network]?.[sellDex];
  
  if (!routerA || !routerB) {
    return { payload: null, error: `Router not configured for ${buyDex} or ${sellDex} on ${network}` };
  }
  
  // Determine V3 vs V2 status
  const routerAisV3 = buyDex === 'Uniswap V3';
  const routerBisV3 = sellDex === 'Uniswap V3';
  
  // Extract fee tiers (0 if V2)
  const feeA = routerAisV3 && buyPool.feeTier ? buyPool.feeTier : 0;
  const feeB = routerBisV3 && sellPool.feeTier ? sellPool.feeTier : 0;
  
  // Calculate amountBMin with slippage protection
  // This is the minimum amount of tokenB expected from the first swap
  // Use a conservative 2% additional slippage buffer for safety
  return {
    payload: {
      asset,
      amount: assetAmount.toString(),
      routerA,
      routerB,
      tokenB,
      routerAisV3,
      routerBisV3,
      feeA,
      feeB,
      amountBMin: amountBMin.toString(),
      // Metadata for logging and tracking
      tokenPair,
      buyDex,
      sellDex,
      network,
      predictedGrossProfit: grossProfit,
      predictedNetProfit: netProfit,
      estimatedGasCost: gasCost,
      estimatedSlippageBps,
      scanTimestamp: new Date().toISOString(),
      confidenceScore,
    },
  };
};


const getMinNetProfitUsdForNetwork = (config: ScannerConfig, network: NetworkName): number => {
  return config.minNetProfitUsdByNetwork[network] ?? config.minNetProfitUsd;
};

const getRequiredActiveNetProfitUsd = (config: ScannerConfig, network: NetworkName): number => {
  const base = getMinNetProfitUsdForNetwork(config, network);
  const gasFactor = estimateGasUsdForNetwork(network, config.estimatedGasUsd) / Math.max(1, config.estimatedGasUsd);
  const adjustment = Math.max(0, gasFactor - 1) * config.adaptiveProfitPressureMultiplier;
  const adaptiveThreshold = Math.max(0, base * (1 + adjustment));
  return Math.max(0, adaptiveThreshold);
};

const STABLE_QUOTES = new Set(['USDC', 'USDT', 'DAI']);
const STABLE_SYMBOL_ALIASES: Record<string, string> = {
  USDBC: 'USDC',
  USDCE: 'USDC',
  USDT0: 'USDT',
  USDTE: 'USDT',
};

const normalizeTokenSymbol = (symbol: string): string => {
  const cleaned = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return STABLE_SYMBOL_ALIASES[cleaned] ?? cleaned;
};

const isStableQuote = (symbol: string): boolean => STABLE_QUOTES.has(normalizeTokenSymbol(symbol));

const getTrackableBaseQuote = (
  network: NetworkName,
  tokenA: string,
  tokenB: string,
): { base: string; quote: string } | null => {
  const left = normalizeTokenSymbol(tokenA);
  const right = normalizeTokenSymbol(tokenB);
  if (!left || !right) return null;

  const leftStable = STABLE_QUOTES.has(left);
  const rightStable = STABLE_QUOTES.has(right);
  if (leftStable === rightStable) return null;

  const base = leftStable ? right : left;
  const quote = leftStable ? left : right;
  if (!CORE_BASE_TOKENS[network].has(base)) return null;

  return { base, quote };
};

const isTrackablePair = (network: NetworkName, tokenA: string, tokenB: string): boolean => {
  return getTrackableBaseQuote(network, tokenA, tokenB) !== null;
};

const upsertFallbackPool = (
  target: Pool[],
  candidate: Pool,
) => {
  const candidateLiquidity = parsePoolLiquidity(candidate);
  const existingIndex = target.findIndex((pool) =>
    pool.network === candidate.network &&
    pool.token0.symbol === candidate.token0.symbol &&
    pool.token1.symbol === candidate.token1.symbol,
  );

  if (existingIndex === -1) {
    target.push(candidate);
    return;
  }

  if (candidateLiquidity > parsePoolLiquidity(target[existingIndex])) {
    target[existingIndex] = candidate;
  }
};

const routePoolByDex = (
  dexName: string,
  pool: Pool,
  buckets: {
    uniV3Pools: Pool[];
    uniV2Pools: Pool[];
    sushiPools: Pool[];
    balancerPools: Pool[];
    curvePools: Pool[];
  },
) => {
  const dex = dexName.toLowerCase();
  if (dex.includes('sushi')) {
    upsertFallbackPool(buckets.sushiPools, pool);
  } else if (dex.includes('curve')) {
    upsertFallbackPool(buckets.curvePools, pool);
  } else if (dex.includes('balancer')) {
    upsertFallbackPool(buckets.balancerPools, pool);
  } else if (dex.includes('uniswap') && dex.includes('v2')) {
    upsertFallbackPool(buckets.uniV2Pools, pool);
  } else if (dex.includes('uniswap')) {
    upsertFallbackPool(buckets.uniV3Pools, pool);
  } else if (
    dex.includes('quickswap') ||
    dex.includes('pancakeswap') ||
    dex.includes('velodrome') ||
    dex.includes('aerodrome') ||
    dex.includes('syncswap') ||
    dex.includes('wagmi') ||
    dex.includes('camelot')
  ) {
    upsertFallbackPool(buckets.uniV2Pools, pool);
  }
};

const mergeFallbackPools = (
  target: Pool[],
  additions: Pool[],
) => {
  for (const pool of additions) upsertFallbackPool(target, pool);
};

const fetchDexScreenerFallback = async (networks: string[]) => {
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((n) => toNetworkName(CHAIN_MAP[n] || n));
  const allowedChains = new Set(selectedNetworks);
  const searchTerms = Array.from(new Set(selectedNetworks.flatMap((network) => SEARCH_TERMS_BY_NETWORK[network])));

  const uniV3Pools: Pool[] = [];
  const uniV2Pools: Pool[] = [];
  const sushiPools: Pool[] = [];
  const balancerPools: Pool[] = [];
  const curvePools: Pool[] = [];

  for (const term of searchTerms) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) continue;
      const json = await res.json();
      const pairs: DexScreenerPair[] = Array.isArray(json?.pairs) ? json.pairs : [];

      for (const pair of pairs) {
        const chain = (pair.chainId || '').toLowerCase();
        const normalizedChain = CHAIN_MAP[chain] ?? chain;
        if (!isNetworkName(normalizedChain) || !allowedChains.has(normalizedChain)) continue;

        const baseSymbol = String(pair.baseToken?.symbol || '');
        const quoteSymbol = String(pair.quoteToken?.symbol || '');
        const network = toNetworkName(normalizedChain);
        const trackablePair = getTrackableBaseQuote(network, baseSymbol, quoteSymbol);
        if (!trackablePair) continue;

        const { base, quote } = trackablePair;
        const priceUsd = parseFloat(String(pair.priceUsd || '0'));
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;

        const inversePrice = 1 / priceUsd;
        if (!Number.isFinite(inversePrice) || inversePrice <= 0) continue;

        const liquidityUsd = Number(pair.liquidity?.usd || 0);
        if (!Number.isFinite(liquidityUsd) || liquidityUsd < MIN_FALLBACK_LIQUIDITY_USD) continue;
        const pool: Pool = {
          token0: { symbol: base },
          token1: { symbol: quote },
          // Normalize fallback prices to the same token0/token1 conventions used by subgraphs.
          token0Price: priceUsd.toString(),
          token1Price: inversePrice.toString(),
          reserveUSD: Number.isFinite(liquidityUsd) ? liquidityUsd.toString() : '0',
          network,
          sourceType: 'dexscreener',
        };

        routePoolByDex(String(pair.dexId || ''), pool, { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools });
      }
    } catch {
      // Best-effort fallback source; ignore transient search errors.
    }
  }

  return { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools };
};

const fetchGeckoTerminalFallback = async (networks: string[]) => {
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((n) => toNetworkName(CHAIN_MAP[n] || n));
  const allowedChains = new Set(selectedNetworks);
  const searchTerms = Array.from(new Set(selectedNetworks.flatMap((network) => SEARCH_TERMS_BY_NETWORK[network])));

  const uniV3Pools: Pool[] = [];
  const uniV2Pools: Pool[] = [];
  const sushiPools: Pool[] = [];
  const balancerPools: Pool[] = [];
  const curvePools: Pool[] = [];

  for (const term of searchTerms) {
    try {
      const url = `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(term)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;

      const json = await res.json();
      const entries: GeckoSearchPool[] = Array.isArray(json?.data) ? json.data : [];
      for (const entry of entries) {
        const attrs = entry.attributes || {};
        const networkRaw = String(
          attrs.network ||
          entry.relationships?.network?.data?.id ||
          '',
        ).toLowerCase();
        const mappedNetwork = GECKO_NETWORK_TO_APP[networkRaw];
        if (!mappedNetwork || !allowedChains.has(mappedNetwork)) continue;

        const baseSymbol = String(attrs.base_token_symbol || '');
        const quoteSymbol = String(attrs.quote_token_symbol || '');
        const trackablePair = getTrackableBaseQuote(mappedNetwork, baseSymbol, quoteSymbol);
        if (!trackablePair) continue;

        const { base, quote } = trackablePair;
        const priceUsd = parseFloat(String(attrs.base_token_price_usd || attrs.price_in_usd || attrs.price_usd || '0'));
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;

        const inversePrice = 1 / priceUsd;
        if (!Number.isFinite(inversePrice) || inversePrice <= 0) continue;

        const liquidityUsd = parseFloat(String(attrs.reserve_in_usd || attrs.liquidity_usd || '0'));
        if (!Number.isFinite(liquidityUsd) || liquidityUsd < MIN_FALLBACK_LIQUIDITY_USD) continue;

        const pool: Pool = {
          token0: { symbol: base },
          token1: { symbol: quote },
          token0Price: priceUsd.toString(),
          token1Price: inversePrice.toString(),
          reserveUSD: liquidityUsd.toString(),
          network: mappedNetwork,
          sourceType: 'gecko',
        };

        routePoolByDex(String(attrs.dex_name || attrs.exchange_name || ''), pool, {
          uniV3Pools,
          uniV2Pools,
          sushiPools,
          balancerPools,
          curvePools,
        });
      }
    } catch {
      // Best-effort fallback source.
    }
  }

  return { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools };
};

const findSpreads = (
  uniV3Pools: Pool[],
  uniV2Pools: Pool[],
  sushiPools: Pool[],
  balancerPools: Pool[],
  curvePools: Pool[],
  config: ScannerConfig,
): { opportunities: Opportunity[]; watchlist: Opportunity[]; diagnostics: ScanDiagnostics } => {
  const normalizeSymbol = (symbol: string): string => normalizeTokenSymbol(symbol);

  const parseNumeric = (value: string | number | undefined, fallback = 0): number => {
    const numeric = typeof value === 'number' ? value : Number(value ?? fallback);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const rankOpportunity = (opportunity: Opportunity): number => {
    const networkMinNet = Math.max(1, getRequiredActiveNetProfitUsd(config, opportunity.network));
    const normalizedProfit = Math.min(4, Math.max(0, opportunity.netProfit / networkMinNet));
    const slippageBps = Math.max(0, parseNumeric(opportunity.estimatedSlippageBps, 0));
    const liquidityUsd = Math.max(1, parseNumeric(opportunity.liquidity, 1));
    const confidence = Math.max(1, Math.min(99, parseNumeric(opportunity.confidenceScore, 1)));
    const distanceToExecutable = Math.max(0, parseNumeric(opportunity.distanceToExecutableUsd, 0));
    const sourceQuality = (opportunity.quoteSources || []).reduce((sum, source) => sum + (SOURCE_RELIABILITY[source] ?? 0), 0) / Math.max(1, (opportunity.quoteSources || []).length);

    const profitComponent = normalizedProfit * 45;
    const confidenceComponent = (confidence / 100) * 22;
    const liquidityComponent = Math.min(1, Math.log10(liquidityUsd + 1) / 7) * 18;
    const sourceComponent = Math.max(-15, Math.min(15, (sourceQuality - 0.7) * 20));
    const slippagePenalty = Math.min(26, slippageBps / 6);
    const watchlistPenalty = opportunity.status === 'watchlist'
      ? Math.min(30, (distanceToExecutable / Math.max(1, networkMinNet)) * 12)
      : 0;

    return profitComponent + confidenceComponent + liquidityComponent + sourceComponent - slippagePenalty - watchlistPenalty;
  };

  const mapPrice = (p: Pool) => {
    const network = toNetworkName(p.network);
    const token0 = normalizeSymbol(p.token0.symbol || '');
    const token1 = normalizeSymbol(p.token1.symbol || '');
    if (!token0 || !token1) {
      return { key: '', price: 0, pool: p, network };
    }

    // token1Price is used as the base quote, then inverted if pair order is reversed
    // so every DEX contributes to the same canonical token pair key.
    const rawPrice = parseFloat(p.token1Price || '0');
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      return { key: '', price: 0, pool: p, network };
    }

    const isCanonical = token0 < token1;
    const key = isCanonical ? `${network}:${token0}/${token1}` : `${network}:${token1}/${token0}`;
    const price = isCanonical ? rawPrice : 1 / rawPrice;
    return { key, price, pool: p, network };
  };

  const uniV3Map = new Map<string, { price: number; pool: Pool }>();
  const uniV2Map = new Map<string, { price: number; pool: Pool }>();
  const sushiMap = new Map<string, { price: number; pool: Pool }>();
  const balancerMap = new Map<string, { price: number; pool: Pool }>();
  const curveMap = new Map<string, { price: number; pool: Pool }>();

  for (const p of uniV3Pools || []) {
    const { key, price, pool } = mapPrice(p);
    if (key && price > 0) uniV3Map.set(key, { price, pool });
  }

  for (const p of uniV2Pools || []) {
    const { key, price, pool } = mapPrice(p);
    if (key && price > 0) uniV2Map.set(key, { price, pool });
  }

  for (const p of sushiPools || []) {
    const { key, price, pool } = mapPrice(p);
    if (key && price > 0) sushiMap.set(key, { price, pool });
  }

  for (const p of balancerPools || []) {
    const { key, price, pool } = mapPrice(p);
    if (key && price > 0) balancerMap.set(key, { price, pool });
  }

  for (const p of curvePools || []) {
    const { key, price, pool } = mapPrice(p);
    if (key && price > 0) curveMap.set(key, { price, pool });
  }

  const opps: Opportunity[] = [];
  const watchlist: Opportunity[] = [];
  const keys = new Set<string>([
    ...uniV3Map.keys(),
    ...uniV2Map.keys(),
    ...sushiMap.keys(),
    ...balancerMap.keys(),
    ...curveMap.keys(),
  ]);

  const diagnostics: ScanDiagnostics = {
    poolCounts: {
      uniV3: uniV3Pools.length,
      uniV2: uniV2Pools.length,
      sushi: sushiPools.length,
      balancer: balancerPools.length,
      curve: curvePools.length,
    },
    pairKeys: keys.size,
    candidates: 0,
    droppedBySpread: 0,
    droppedByLiquidity: 0,
    droppedBySlippage: 0,
    droppedByNetProfit: 0,
    droppedByBadQuotes: 0,
    droppedBySameDex: 0,
    droppedByExecutionRisk: 0,
    sizeAdjusted: 0,
    executionFeasible: 0,
    profitQualified: 0,
    quoteValidated: 0,
    watchlistCount: 0,
    quoteSourceCounts: {
      subgraph: 0,
      dexscreener: 0,
      gecko: 0,
    },
    rejectionSamples: [],
  };

  for (const key of keys) {
    const quotes: Array<{ dex: Opportunity['buyDex']; price: number; pool: Pool }> = [];
    const v3 = uniV3Map.get(key);
    const v2 = uniV2Map.get(key);
    const sushi = sushiMap.get(key);
    const balancer = balancerMap.get(key);
    const curve = curveMap.get(key);

    if (v3) quotes.push({ dex: 'Uniswap V3', price: v3.price, pool: v3.pool });
    if (v2) quotes.push({ dex: 'Uniswap V2', price: v2.price, pool: v2.pool });
    if (sushi) quotes.push({ dex: 'SushiSwap', price: sushi.price, pool: sushi.pool });
    if (balancer) quotes.push({ dex: 'Balancer', price: balancer.price, pool: balancer.pool });
    if (curve) quotes.push({ dex: 'Curve', price: curve.price, pool: curve.pool });

    for (const quote of quotes) {
      const source = quote.pool.sourceType || 'subgraph';
      if (source === 'subgraph') diagnostics.quoteSourceCounts.subgraph += 1;
      if (source === 'dexscreener') diagnostics.quoteSourceCounts.dexscreener += 1;
      if (source === 'gecko') diagnostics.quoteSourceCounts.gecko += 1;
    }
    if (quotes.length < 2) {
      diagnostics.droppedByBadQuotes++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'badQuotes' });
      continue;
    }

    const prices = quotes.map((q) => q.price).filter((p) => p > 0);
    if (prices.length < 2) {
      diagnostics.droppedByBadQuotes++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'badQuotes' });
      continue;
    }

    diagnostics.candidates++;

    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    if (minPrice <= 0) {
      diagnostics.droppedByBadQuotes++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'badQuotes' });
      continue;
    }

    // Pick the best executable cross-DEX pair, not just absolute min/max which can land on the same DEX.
    const buys = [...quotes].sort((a, b) => a.price - b.price);
    const sells = [...quotes].sort((a, b) => b.price - a.price);
    let bestPair: {
      buy: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      sell: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      score: number;
    } | null = null;

    for (const buy of buys) {
      for (const sell of sells) {
        if (buy.dex === sell.dex) continue;
        if (sell.price <= buy.price) continue;
        const buyLiquidity = parsePoolLiquidity(buy.pool);
        const sellLiquidity = parsePoolLiquidity(sell.pool);
        const spread = (sell.price - buy.price) / buy.price;
        const liquidityScore = Math.min(buyLiquidity, sellLiquidity);
        const score = spread * 1_000_000 + Math.log10(Math.max(1, liquidityScore)) * 100;
        if (!bestPair || score > bestPair.score) {
          bestPair = { buy, sell, score };
        }
      }
    }

    if (!bestPair) {
      diagnostics.droppedBySameDex++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'sameDex' });
      continue;
    }

    const buyEntry = bestPair.buy;
    const sellEntry = bestPair.sell;

    if (!buyEntry || !sellEntry) {
      diagnostics.droppedBySameDex++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'sameDex' });
      continue;
    }

    const spread = ((sellEntry.price - buyEntry.price) / buyEntry.price) * 100;
    if (spread < config.minSpreadPercent) {
      diagnostics.droppedBySpread++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'spread', buyDex: buyEntry.dex, sellDex: sellEntry.dex, spread });
      continue;
    }

    const buyLiquidityUsd = parsePoolLiquidity(buyEntry.pool);
    const sellLiquidityUsd = parsePoolLiquidity(sellEntry.pool);
    const network = toNetworkName(buyEntry.pool.network || sellEntry.pool.network);
    const minNetProfitUsd = getRequiredActiveNetProfitUsd(config, network);
    const liquidityUsd = Math.max(...quotes.map((q) => parsePoolLiquidity(q.pool)));
    if (liquidityUsd < config.minLiquidityUsd) {
      diagnostics.droppedByLiquidity++;
      pushRejectionSample(diagnostics, {
        tokenPair: key,
        reason: 'liquidity',
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        spread,
        buyLiquidityUsd,
        sellLiquidityUsd,
      });
      continue;
    }

    const executionCandidate = evaluateExecutionCandidate(
      buyEntry.price,
      sellEntry.price,
      buyEntry.pool,
      sellEntry.pool,
      buyEntry.dex,
      sellEntry.dex,
      network,
      config,
    );
    if (!executionCandidate) {
      const requestedLoanAmount = Math.min(config.loanAmountUsd, Math.min(buyLiquidityUsd, sellLiquidityUsd) * config.maxLiquidityUsageFraction);
      const buyImpactBps = estimateSlippageBps(requestedLoanAmount, buyLiquidityUsd);
      const sellImpactBps = estimateSlippageBps(requestedLoanAmount, sellLiquidityUsd);
      if (buyImpactBps > config.maxSlippageBps || sellImpactBps > config.maxSlippageBps) {
        diagnostics.droppedBySlippage++;
        pushRejectionSample(diagnostics, {
          tokenPair: key,
          reason: 'slippage',
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
          spread,
          buyLiquidityUsd,
          sellLiquidityUsd,
          attemptedLoanAmount: requestedLoanAmount,
          buyImpactBps,
          sellImpactBps,
        });
      } else {
        const routePenaltyBps = dexPenaltyBps[buyEntry.dex] + dexPenaltyBps[sellEntry.dex];
        const quotedBuyPrice = buyEntry.price * (1 + buyImpactBps / 10_000);
        const quotedSellPrice = sellEntry.price * (1 - sellImpactBps / 10_000);
        const gasCost = estimateGasUsdForNetwork(network, config.estimatedGasUsd);
        const grossProfit = quotedSellPrice > quotedBuyPrice
          ? ((quotedSellPrice - quotedBuyPrice) / quotedBuyPrice) * requestedLoanAmount
          : 0;
        const nearMissNetProfit = grossProfit - ((routePenaltyBps / 10_000) * requestedLoanAmount) - gasCost;

        const quoteSources = [
          buyEntry.pool.sourceType || 'subgraph',
          sellEntry.pool.sourceType || 'subgraph',
        ];

        diagnostics.watchlistCount++;
        watchlist.push({
          tokenPair: key,
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
          network,
          loanAmount: config.loanAmountUsd,
          executableLoanAmount: requestedLoanAmount,
          grossProfit,
          netProfit: nearMissNetProfit,
          distanceToExecutableUsd: Math.max(0, minNetProfitUsd - nearMissNetProfit),
          gasCost,
          confidenceScore: Math.max(1, Math.min(89, Math.round(42 + spread * 65 - ((buyImpactBps + sellImpactBps + routePenaltyBps) / 6)))),
          confidenceTier: nearMissNetProfit >= 0 ? 'medium' : 'low',
          spread: spread.toFixed(4),
          liquidity: liquidityUsd.toFixed(0),
          estimatedSlippageBps: buyImpactBps + sellImpactBps + routePenaltyBps,
          buyImpactBps,
          sellImpactBps,
          routePenaltyBps,
          quoteSources,
          status: 'watchlist',
        });

        diagnostics.droppedByNetProfit++;
        pushRejectionSample(diagnostics, {
          tokenPair: key,
          reason: 'netProfit',
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
          spread,
          buyLiquidityUsd,
          sellLiquidityUsd,
          attemptedLoanAmount: requestedLoanAmount,
          buyImpactBps,
          sellImpactBps,
        });
      }
      diagnostics.droppedByExecutionRisk++;
      continue;
    }

    diagnostics.executionFeasible++;

    if (executionCandidate.netProfit < minNetProfitUsd) {
      diagnostics.droppedByNetProfit++;
      const quoteSources = [
        buyEntry.pool.sourceType || 'subgraph',
        sellEntry.pool.sourceType || 'subgraph',
      ];

      diagnostics.watchlistCount++;
      watchlist.push({
        tokenPair: key,
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        network,
        loanAmount: config.loanAmountUsd,
        executableLoanAmount: executionCandidate.executableLoanAmount,
        grossProfit: executionCandidate.grossProfit,
        netProfit: executionCandidate.netProfit,
        distanceToExecutableUsd: Math.max(0, minNetProfitUsd - executionCandidate.netProfit),
        gasCost: estimateGasUsdForNetwork(network, config.estimatedGasUsd),
        confidenceScore: Math.max(1, Math.min(89, Math.round(48 + spread * 70 - (executionCandidate.estimatedSlippageBps / 6)))),
        confidenceTier: executionCandidate.netProfit >= 0 ? 'medium' : 'low',
        spread: spread.toFixed(4),
        liquidity: liquidityUsd.toFixed(0),
        estimatedSlippageBps: executionCandidate.estimatedSlippageBps,
        buyImpactBps: executionCandidate.buyImpactBps,
        sellImpactBps: executionCandidate.sellImpactBps,
        routePenaltyBps: executionCandidate.routePenaltyBps,
        quoteSources,
        status: 'watchlist',
      });
      pushRejectionSample(diagnostics, {
        tokenPair: key,
        reason: 'netProfit',
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        spread,
        buyLiquidityUsd,
        sellLiquidityUsd,
        attemptedLoanAmount: executionCandidate.executableLoanAmount,
        buyImpactBps: executionCandidate.buyImpactBps,
        sellImpactBps: executionCandidate.sellImpactBps,
      });
      continue;
    }

    diagnostics.profitQualified++;
    diagnostics.quoteValidated++;
    if (executionCandidate.executableLoanAmount < config.loanAmountUsd) {
      diagnostics.sizeAdjusted++;
    }

    const confidenceRaw = 58 + spread * 90 - (executionCandidate.estimatedSlippageBps / 5) + (executionCandidate.netProfit / Math.max(1, config.minNetProfitUsd));
    const confidenceScore = Math.max(1, Math.min(99, Math.round(confidenceRaw)));
    const confidenceTier: Opportunity['confidenceTier'] = confidenceScore >= 80
      ? 'high'
      : confidenceScore >= 60
        ? 'medium'
        : 'low';

    const quoteSources = [
      buyEntry.pool.sourceType || 'subgraph',
      sellEntry.pool.sourceType || 'subgraph',
    ];

    const { payload: executionPayload, error: executionPayloadError } = buildExecutionPayload(
      buyEntry.pool,
      sellEntry.pool,
      buyEntry.dex,
      sellEntry.dex,
      key,
      network,
      executionCandidate.executableLoanAmount,
      executionCandidate.grossProfit,
      executionCandidate.netProfit,
      executionCandidate.gasCost,
      executionCandidate.estimatedSlippageBps,
      confidenceScore,
      buyEntry.price,
    );

    if (!executionPayload) {
      diagnostics.droppedByExecutionRisk++;
      diagnostics.watchlistCount++;
      pushRejectionSample(diagnostics, {
        tokenPair: key,
        reason: 'executionRisk',
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        spread,
      });
      const quoteSources = [
        buyEntry.pool.sourceType || 'subgraph',
        sellEntry.pool.sourceType || 'subgraph',
      ];

      watchlist.push({
        tokenPair: key,
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        network,
        loanAmount: config.loanAmountUsd,
        executableLoanAmount: executionCandidate.executableLoanAmount,
        grossProfit: executionCandidate.grossProfit,
        netProfit: executionCandidate.netProfit,
        distanceToExecutableUsd: Math.max(0, minNetProfitUsd - executionCandidate.netProfit),
        gasCost: executionCandidate.gasCost,
        confidenceScore: Math.max(1, Math.min(79, Math.round(38 + spread * 70 - (executionCandidate.estimatedSlippageBps / 5)))),
        confidenceTier: 'low',
        spread: spread.toFixed(4),
        liquidity: liquidityUsd.toFixed(0),
        estimatedSlippageBps: executionCandidate.estimatedSlippageBps,
        buyImpactBps: executionCandidate.buyImpactBps,
        sellImpactBps: executionCandidate.sellImpactBps,
        routePenaltyBps: executionCandidate.routePenaltyBps,
        quoteSources,
        status: 'watchlist',
      });
      continue;
    }

    opps.push({
      tokenPair: key,
      buyDex: buyEntry.dex,
      sellDex: sellEntry.dex,
      network,
      loanAmount: config.loanAmountUsd,
      executableLoanAmount: executionCandidate.executableLoanAmount,
      grossProfit: executionCandidate.grossProfit,
      netProfit: executionCandidate.netProfit,
      distanceToExecutableUsd: Math.max(0, minNetProfitUsd - executionCandidate.netProfit),
      gasCost: executionCandidate.gasCost,
      confidenceScore,
      confidenceTier,
      spread: spread.toFixed(4),
      liquidity: liquidityUsd.toFixed(0),
      estimatedSlippageBps: executionCandidate.estimatedSlippageBps,
      buyImpactBps: executionCandidate.buyImpactBps,
      sellImpactBps: executionCandidate.sellImpactBps,
      routePenaltyBps: executionCandidate.routePenaltyBps,
      quoteSources,
      status: 'active',
      executionPayload: executionPayload || undefined,
    });
  }
  return {
    opportunities: opps
      .sort((a, b) => {
        const scoreDiff = rankOpportunity(b) - rankOpportunity(a);
        if (scoreDiff !== 0) return scoreDiff;
        return b.netProfit - a.netProfit;
      })
      .slice(0, config.maxResults),
    watchlist: watchlist
      .sort((a, b) => {
        const scoreDiff = rankOpportunity(b) - rankOpportunity(a);
        if (scoreDiff !== 0) return scoreDiff;
        return a.distanceToExecutableUsd - b.distanceToExecutableUsd;
      })
      .slice(0, Math.min(10, config.maxResults)),
    diagnostics,
  };
};

const runScan = async (config: ScannerConfig, networks: string[]) => {
  // Run subgraph fetches and market-data fallbacks in parallel for full coverage.
  const [
    subgraphResults,
    dexFallback,
    geckoFallback,
  ] = await Promise.all([
    Promise.allSettled([
      fetchSubgraphWithFallback(UNI_V3_SUBGRAPH, UNI_V3_SUBGRAPH_PUBLIC, topPairsQuery(30)),
      fetchSubgraphWithFallback(UNI_V2_SUBGRAPH, UNI_V2_SUBGRAPH_PUBLIC, topV2PairsQuery(30)),
      fetchSubgraphWithFallback(SUSHI_SUBGRAPH, SUSHI_SUBGRAPH_PUBLIC, topV2PairsQuery(30)),
      fetchSubgraphWithFallback(BALANCER_SUBGRAPH, BALANCER_SUBGRAPH_PUBLIC, topBalancerPoolsQuery(30)),
      fetchSubgraphWithFallback(CURVE_SUBGRAPH, CURVE_SUBGRAPH_PUBLIC, topCurvePoolsQuery(30)),
    ]),
    fetchDexScreenerFallback(networks),
    fetchGeckoTerminalFallback(networks),
  ]);

  const [uniV3Result, uniV2Result, sushiResult, balancerResult, curveResult] = subgraphResults;

  if (uniV3Result.status === 'rejected') {
    console.error('Uniswap V3 subgraph fetch failed:', uniV3Result.reason);
  }
  if (uniV2Result.status === 'rejected') {
    console.error('Uniswap V2 subgraph fetch failed:', uniV2Result.reason);
  }
  if (sushiResult.status === 'rejected') {
    console.error('Sushi subgraph fetch failed:', sushiResult.reason);
  }
  if (balancerResult.status === 'rejected') {
    console.error('Balancer subgraph fetch failed:', balancerResult.reason);
  }
  if (curveResult.status === 'rejected') {
    console.error('Curve subgraph fetch failed:', curveResult.reason);
  }

  const uniV3Data = uniV3Result.status === 'fulfilled' ? uniV3Result.value : { pools: [] };
  const uniV2Data = uniV2Result.status === 'fulfilled' ? uniV2Result.value : { pairs: [] };
  const sushiData = sushiResult.status === 'fulfilled' ? sushiResult.value : { pairs: [] };
  const balancerData = balancerResult.status === 'fulfilled' ? balancerResult.value : { pools: [] };
  const curveData = curveResult.status === 'fulfilled' ? curveResult.value : { pools: [] };

  const uniV3Pools: Pool[] = (uniV3Data?.pools || []).map((pool: Record<string, unknown>) => toPoolFromPair(pool, 'Uniswap V3'));
  const uniV2Pools: Pool[] = (uniV2Data?.pairs || []).map((pair: Record<string, unknown>) => toPoolFromPair(pair, 'Uniswap V2'));
  const sushiPools: Pool[] = (sushiData?.pairs || []).map((pair: Record<string, unknown>) => toPoolFromPair(pair, 'SushiSwap'));
  const balancerPools: Pool[] = (balancerData?.pools || [])
    .map((pool: Record<string, unknown>) => toPoolFromBalancer(pool))
    .filter((pool: Pool | null): pool is Pool => pool !== null);
  const curvePools: Pool[] = (curveData?.pools || [])
    .map((pool: Record<string, unknown>) => toPoolFromCurve(pool))
    .filter((pool: Pool | null): pool is Pool => pool !== null);

  // Always merge real-time market prices from DexScreener and GeckoTerminal.
  // These provide multi-network quotes (arbitrum, base, polygon) that subgraphs lack,
  // and add a second or third DEX price per pair, enabling genuine cross-DEX spread detection.
  mergeFallbackPools(uniV3Pools, dexFallback.uniV3Pools);
  mergeFallbackPools(uniV2Pools, dexFallback.uniV2Pools);
  mergeFallbackPools(sushiPools, dexFallback.sushiPools);
  mergeFallbackPools(balancerPools, dexFallback.balancerPools);
  mergeFallbackPools(curvePools, dexFallback.curvePools);

  mergeFallbackPools(uniV3Pools, geckoFallback.uniV3Pools);
  mergeFallbackPools(uniV2Pools, geckoFallback.uniV2Pools);
  mergeFallbackPools(sushiPools, geckoFallback.sushiPools);
  mergeFallbackPools(balancerPools, geckoFallback.balancerPools);
  mergeFallbackPools(curvePools, geckoFallback.curvePools);

  return findSpreads(uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools, config);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const scanRunId = crypto.randomUUID();
  const scanStartedAt = Date.now();
  let scanMode = 'manual';

  try {
    const body = await req.json().catch(() => ({}));
    scanMode = Boolean((body as { scheduledRun?: boolean }).scheduledRun) ? 'scheduled' : 'manual';
    const test = Boolean(body.test);
    const enforceReadinessGates = parseBooleanEnv(
      Deno.env.get('SCANNER_ENFORCE_READINESS_GATES'),
      false,
    );

    if (test) {
      const readinessGates = await evaluateScannerReadinessGates();

      return new Response(
        JSON.stringify({
          success: true,
          scanRunId,
          message: 'scan-arbitrage-opportunities is reachable',
          hasGraphKey: readinessGates.hasGraphKey,
          graphConnectivity: readinessGates.graphConnectivity,
          readinessGates,
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (enforceReadinessGates) {
      const readinessGates = await evaluateScannerReadinessGates();
      if (!readinessGates.pass) {
        const durationMs = Date.now() - scanStartedAt;
        await persistTelemetryRows('scanner_runs', [{
          id: scanRunId,
          started_at: new Date(scanStartedAt).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
          scan_mode: scanMode,
          opportunities_found: 0,
          eligible_count: 0,
          watchlist_count: 0,
          diagnostics: {
            gateFailed: true,
            readinessGates,
            scanDurationMs: durationMs,
          },
        }]);

        return new Response(
          JSON.stringify({
            success: false,
            scanRunId,
            error: 'Scanner readiness gates failed',
            readinessGates,
            timestamp: new Date().toISOString(),
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const config = buildScannerConfig(body as Record<string, unknown>);
    const networks = Array.isArray((body as { networks?: unknown[] }).networks)
      ? ((body as { networks?: unknown[] }).networks || []).map((n) => String(n).toLowerCase())
      : ['ethereum'];
    const { opportunities, diagnostics, watchlist } = await runScan(config, networks) as { opportunities: Opportunity[]; diagnostics: ScanDiagnostics; watchlist: Opportunity[] };
    const quoteTimestamp = new Date().toISOString();
    const trackedOpportunities: TelemetryOpportunity[] = opportunities.map((opportunity) => ({
      ...opportunity,
      scanRunId,
      candidateId: crypto.randomUUID(),
      quoteTimestamp,
      dataSource: 'multi-source',
    }));
    const trackedWatchlist: TelemetryOpportunity[] = watchlist.map((opportunity) => ({
      ...opportunity,
      scanRunId,
      candidateId: crypto.randomUUID(),
      quoteTimestamp,
      dataSource: 'multi-source',
    }));
    const scanDurationMs = Date.now() - scanStartedAt;

    await persistTelemetryRows('scanner_runs', [{
      id: scanRunId,
      started_at: new Date(scanStartedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: scanDurationMs,
      scan_mode: scanMode,
      opportunities_found: trackedOpportunities.length,
      eligible_count: diagnostics.profitQualified,
      watchlist_count: trackedWatchlist.length,
      diagnostics: {
        ...diagnostics,
        networks,
        config,
        scanDurationMs,
      },
    }]);

    await persistTelemetryRows('scanner_candidates', [
      ...trackedOpportunities,
      ...trackedWatchlist,
    ].map((candidate) => ({
      id: candidate.candidateId,
      scan_run_id: candidate.scanRunId,
      token_pair: candidate.tokenPair,
      network: candidate.network,
      buy_dex: candidate.buyDex,
      sell_dex: candidate.sellDex,
      spread_pct: Number(candidate.spread),
      est_net_profit: candidate.netProfit,
      status: candidate.status,
      quote_timestamp: candidate.quoteTimestamp,
      data_source: candidate.dataSource,
      opportunity_payload: candidate,
    })));

    return new Response(
      JSON.stringify({
        success: true,
        scanRunId,
        scanDurationMs,
        found: opportunities.length,
        watchlistCount: trackedWatchlist.length,
        config,
        diagnostics: {
          ...diagnostics,
          scanDurationMs,
        },
        opportunities: trackedOpportunities,
        watchlist: trackedWatchlist,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const durationMs = Date.now() - scanStartedAt;
    await persistTelemetryRows('scanner_runs', [{
      id: scanRunId,
      started_at: new Date(scanStartedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      scan_mode: scanMode,
      opportunities_found: 0,
      eligible_count: 0,
      watchlist_count: 0,
      diagnostics: {
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'handler_exception',
        scanDurationMs: durationMs,
      },
    }]);

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
