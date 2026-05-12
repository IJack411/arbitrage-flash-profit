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
  gasUnits: number;
  gasSafetyMultiplier: number;
  gasPriceGweiByNetwork: Partial<Record<NetworkName, number>>;
  nativeTokenUsdByNetwork: Partial<Record<NetworkName, number>>;
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
  mathDiagnostics?: {
    reservesUsd: { buy: number; sell: number };
    expectedOutputUsd: number;
    actualOutputUsd: number;
    expectedGrossProfitUsd: number;
    actualGrossProfitUsd: number;
    slippageFraction: number;
    liquidityUsageFraction: number;
    gasEstimateUsd: number;
    passReason: string;
  };
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

const FP_SCALE = 10n ** 18n;
const USD_SCALE = 10n ** 6n;

const decimalToFixed = (value: number | string, scale: bigint): bigint => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0n;
  const sign = raw.startsWith('-') ? -1n : 1n;
  const normalized = raw.replace(/^[+-]/, '');
  const [whole = '0', frac = ''] = normalized.split('.');
  const scaleDigits = scale.toString().length - 1;
  const fracNormalized = (frac + '0'.repeat(scaleDigits)).slice(0, scaleDigits);
  const digits = `${whole}${fracNormalized}`.replace(/^0+(?=\d)/, '');
  const base = digits ? BigInt(digits) : 0n;
  return sign * base;
};

const fixedToNumber = (value: bigint, scale: bigint, precision = 6): number => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / scale;
  const fraction = abs % scale;
  const scaleDigits = scale.toString().length - 1;
  const viewPrecision = Math.max(0, Math.min(scaleDigits, precision));
  const divisor = 10n ** BigInt(scaleDigits - viewPrecision);
  const compactFraction = fraction / divisor;
  const asText = `${negative ? '-' : ''}${whole.toString()}.${compactFraction.toString().padStart(viewPrecision, '0')}`;
  return Number(asText);
};

const clampNumber = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const roundDiv = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) return 0n;
  if (numerator >= 0n) return (numerator + (denominator / 2n)) / denominator;
  return (numerator - (denominator / 2n)) / denominator;
};

const confidenceScoreDeterministic = ({
  base,
  spreadBps,
  spreadMultiplier,
  slippageBps,
  slippageDivisor,
  minScore,
  maxScore,
  netProfitUsd,
  minProfitUsd,
}: {
  base: number;
  spreadBps: bigint;
  spreadMultiplier: number;
  slippageBps: bigint;
  slippageDivisor: number;
  minScore: number;
  maxScore: number;
  netProfitUsd?: number;
  minProfitUsd?: number;
}): number => {
  let scoreX100 = BigInt(base * 100) + (spreadBps * BigInt(spreadMultiplier));
  scoreX100 -= roundDiv(slippageBps * 100n, BigInt(Math.max(1, slippageDivisor)));

  if (typeof netProfitUsd === 'number' && typeof minProfitUsd === 'number') {
    const netProfitFixed = decimalToFixed(netProfitUsd, USD_SCALE);
    const minProfitFixed = decimalToFixed(Math.max(1, minProfitUsd), USD_SCALE);
    scoreX100 += roundDiv(netProfitFixed * 100n, minProfitFixed);
  }

  const rounded = Number(roundDiv(scoreX100, 100n));
  return clampNumber(rounded, minScore, maxScore);
};

const mulDiv = (a: bigint, b: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) return 0n;
  return (a * b) / denominator;
};

const scaleTo = (value: bigint, fromScale: bigint, toScale: bigint): bigint => {
  if (fromScale === toScale) return value;
  if (fromScale > toScale) {
    return mulDiv(value, toScale, fromScale);
  }
  return mulDiv(value, toScale, fromScale);
};

const sqrtBigInt = (value: bigint): bigint => {
  if (value <= 0n) return 0n;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
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

const parseNetworkNumberMap = (input: unknown): Partial<Record<NetworkName, number>> => {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<Record<NetworkName, number>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (!isNetworkName(normalized)) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) out[normalized] = parsed;
  }
  return out;
};

const parsePoolLiquidity = (pool: Pool): number => {
  const reserveFixed = decimalToFixed(pool.reserveUSD || '0', USD_SCALE);
  if (reserveFixed > 0n) return fixedToNumber(reserveFixed, USD_SCALE, 6);
  const liquidity = Number(pool.liquidity || '0');
  if (!Number.isFinite(liquidity) || liquidity <= 0) return 0;
  // Uniswap V3 liquidity is not USD-denominated; use a conservative heuristic proxy.
  return liquidity / 1e12;
};

const estimateSlippageBps = (tradeSizeUsd: number, liquidityUsd: number): number => {
  const trade = decimalToFixed(tradeSizeUsd, USD_SCALE);
  const liquidity = decimalToFixed(liquidityUsd, USD_SCALE);
  if (liquidity <= 0n || trade <= 0n) return 1;

  const ratioScaled = mulDiv(trade, FP_SCALE, liquidity);
  const hundredScaled = 100n * FP_SCALE;
  if (ratioScaled >= hundredScaled) return 10_000;

  // impact = 1 - 1/sqrt(1 + ratio)
  const onePlusRatio = FP_SCALE + ratioScaled;
  const sqrtTerm = sqrtBigInt(onePlusRatio * FP_SCALE);
  if (sqrtTerm <= 0n) return 10_000;
  const reciprocal = mulDiv(FP_SCALE, FP_SCALE, sqrtTerm);
  const impact = FP_SCALE - reciprocal;
  const impactBps = mulDiv(impact, 10_000n, FP_SCALE);

  const bounded = impactBps < 1n ? 1n : impactBps > 10_000n ? 10_000n : impactBps;
  return Number(bounded);
};

const dexPenaltyBps: Record<Opportunity['buyDex'], number> = {
  'Uniswap V3': 4,
  'Uniswap V2': 8,
  'SushiSwap': 9,
  'Balancer': 6,
  'Curve': 3,
};

const DEFAULT_MAX_EXECUTABLE_LIQUIDITY_FRACTION = 0.35;
const MAX_REASONABLE_SPREAD_FRACTION = 0.20; // 20%
const MAX_REASONABLE_ROI_FRACTION = 0.20; // 20% net/gross on single arb leg is suspicious

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

  const buyPriceFixed = decimalToFixed(buyPrice, FP_SCALE);
  const sellPriceFixed = decimalToFixed(sellPrice, FP_SCALE);
  const loanFixed = decimalToFixed(executableLoanAmount, USD_SCALE);
  const configLoanFixed = decimalToFixed(config.loanAmountUsd, USD_SCALE);
  if (buyPriceFixed <= 0n || sellPriceFixed <= 0n || loanFixed <= 0n || configLoanFixed <= 0n) return null;

  const buyImpactBps = estimateSlippageBps(executableLoanAmount, buyLiquidityUsd);
  const sellImpactBps = estimateSlippageBps(executableLoanAmount, sellLiquidityUsd);
  const routePenaltyBps = dexPenaltyBps[buyDex] + dexPenaltyBps[sellDex];
  const estimatedSlippageBps = buyImpactBps + sellImpactBps + routePenaltyBps;

  if (buyImpactBps > config.maxSlippageBps || sellImpactBps > config.maxSlippageBps) {
    return null;
  }

  const quotedBuyPrice = mulDiv(buyPriceFixed, BigInt(10_000 + buyImpactBps), 10_000n);
  const quotedSellPrice = mulDiv(sellPriceFixed, BigInt(10_000 - sellImpactBps), 10_000n);
  if (quotedBuyPrice <= 0n || quotedSellPrice <= 0n || quotedSellPrice <= quotedBuyPrice) {
    return null;
  }

  const quotedSpreadFixed = mulDiv(quotedSellPrice - quotedBuyPrice, FP_SCALE, quotedBuyPrice);
  const maxSpreadFixed = decimalToFixed(MAX_REASONABLE_SPREAD_FRACTION, FP_SCALE);
  if (quotedSpreadFixed <= 0n || quotedSpreadFixed > maxSpreadFixed) {
    return null;
  }

  const grossProfitFixed = mulDiv(quotedSpreadFixed, loanFixed, FP_SCALE);
  const routePenaltyCostFixed = mulDiv(loanFixed, BigInt(routePenaltyBps), 10_000n);

  // Gas cost scales inversely with trade-size ratio via deterministic sqrt(configLoan / loan)
  const loanRatioScaled = mulDiv(configLoanFixed, FP_SCALE, loanFixed);
  const gasMultiplierScaled = sqrtBigInt(loanRatioScaled * FP_SCALE);
  const baseGasFixed = decimalToFixed(estimateGasUsdForNetwork(network, config), USD_SCALE);
  const gasCostFixed = mulDiv(baseGasFixed, gasMultiplierScaled, FP_SCALE);

  const netProfitFixed = grossProfitFixed - routePenaltyCostFixed - gasCostFixed;
  const maxReasonableProfitFixed = mulDiv(loanFixed, decimalToFixed(MAX_REASONABLE_ROI_FRACTION, FP_SCALE), FP_SCALE);
  if (grossProfitFixed > maxReasonableProfitFixed || netProfitFixed > maxReasonableProfitFixed) {
    return null;
  }

  // Hard profitability gate: never allow candidates where gas dominates or net is non-positive.
  if (grossProfitFixed <= gasCostFixed || netProfitFixed <= 0n) {
    return null;
  }

  const grossProfit = fixedToNumber(grossProfitFixed, USD_SCALE, 6);
  const gasCost = fixedToNumber(gasCostFixed, USD_SCALE, 6);
  const netProfit = fixedToNumber(netProfitFixed, USD_SCALE, 6);

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
  const bodyGasUnits = parseNumberInput(body.gasUnits);
  const bodyGasSafetyMultiplier = parseNumberInput(body.gasSafetyMultiplier);

  const envGasPriceByNetworkRaw = Deno.env.get('SCANNER_GAS_PRICE_GWEI_BY_NETWORK');
  let envGasPriceByNetwork: Partial<Record<NetworkName, number>> = {};
  if (envGasPriceByNetworkRaw) {
    try {
      envGasPriceByNetwork = parseNetworkNumberMap(JSON.parse(envGasPriceByNetworkRaw));
    } catch {
      envGasPriceByNetwork = {};
    }
  }
  const bodyGasPriceByNetwork = parseNetworkNumberMap((body.gasPriceGweiByNetwork ?? body.networkGasPriceGwei) as unknown);

  const envNativeUsdByNetworkRaw = Deno.env.get('SCANNER_NATIVE_TOKEN_USD_BY_NETWORK');
  let envNativeUsdByNetwork: Partial<Record<NetworkName, number>> = {};
  if (envNativeUsdByNetworkRaw) {
    try {
      envNativeUsdByNetwork = parseNetworkNumberMap(JSON.parse(envNativeUsdByNetworkRaw));
    } catch {
      envNativeUsdByNetwork = {};
    }
  }
  const bodyNativeUsdByNetwork = parseNetworkNumberMap((body.nativeTokenUsdByNetwork ?? body.networkNativeTokenUsd) as unknown);

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
    gasUnits: bodyGasUnits ?? parseNumberEnv(Deno.env.get('SCANNER_GAS_UNITS'), 350_000),
    gasSafetyMultiplier: bodyGasSafetyMultiplier ?? parseNumberEnv(Deno.env.get('SCANNER_GAS_SAFETY_MULTIPLIER'), 1.15),
    gasPriceGweiByNetwork: {
      ...envGasPriceByNetwork,
      ...bodyGasPriceByNetwork,
    },
    nativeTokenUsdByNetwork: {
      ...envNativeUsdByNetwork,
      ...bodyNativeUsdByNetwork,
    },
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
  const b0Fixed = decimalToFixed(String(balances[0] || '0'), FP_SCALE);
  const b1Fixed = decimalToFixed(String(balances[1] || '0'), FP_SCALE);
  if (!token0 || !token1 || b0Fixed <= 0n || b1Fixed <= 0n) return null;

  const p01Fixed = mulDiv(b1Fixed, FP_SCALE, b0Fixed);
  const p10Fixed = mulDiv(b0Fixed, FP_SCALE, b1Fixed);
  return {
    token0: { symbol: token0 },
    token1: { symbol: token1 },
    token0Price: String(fixedToNumber(p01Fixed, FP_SCALE, 12)),
    token1Price: String(fixedToNumber(p10Fixed, FP_SCALE, 12)),
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

const DEFAULT_GAS_PRICE_GWEI_BY_NETWORK: Record<NetworkName, number> = {
  ethereum: 20,
  polygon: 60,
  arbitrum: 0.2,
  base: 0.2,
  bsc: 3,
};

const DEFAULT_NATIVE_TOKEN_USD_BY_NETWORK: Record<NetworkName, number> = {
  ethereum: 3200,
  polygon: 0.8,
  arbitrum: 3200,
  base: 3200,
  bsc: 600,
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

import { CORE_BASE_TOKENS, SEARCH_TERMS_BY_NETWORK, NetworkName, isNetworkName } from '../../../shared/networks-tokens.ts';

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


const MIN_FALLBACK_LIQUIDITY_USD = 20_000;

const toNetworkName = (value: string | undefined): NetworkName => {
  const normalized = (value || 'ethereum').toLowerCase();
  if (isNetworkName(normalized)) return normalized;
  return 'ethereum';
};

const estimateGasUsdForNetwork = (network: NetworkName, config: ScannerConfig): number => {
  const networkGasPriceGwei = config.gasPriceGweiByNetwork[network] ?? DEFAULT_GAS_PRICE_GWEI_BY_NETWORK[network];
  const nativeTokenUsd = config.nativeTokenUsdByNetwork[network] ?? DEFAULT_NATIVE_TOKEN_USD_BY_NETWORK[network];

  if (
    Number.isFinite(config.gasUnits) && config.gasUnits > 0 &&
    Number.isFinite(networkGasPriceGwei) && networkGasPriceGwei > 0 &&
    Number.isFinite(nativeTokenUsd) && nativeTokenUsd > 0
  ) {
    const gasUnitsFixed = decimalToFixed(config.gasUnits, FP_SCALE);
    const gasPriceGweiFixed = decimalToFixed(networkGasPriceGwei, FP_SCALE);
    const nativeUsdFixed = decimalToFixed(nativeTokenUsd, FP_SCALE);
    const safetyFixed = decimalToFixed(config.gasSafetyMultiplier, FP_SCALE);

    // costEth = gasUnits * gasPriceGwei / 1e9
    const gasCostGweiFixed = mulDiv(gasUnitsFixed, gasPriceGweiFixed, FP_SCALE);
    const gasCostEthFixed = gasCostGweiFixed / 1_000_000_000n;
    const gasCostUsdFixed = mulDiv(mulDiv(gasCostEthFixed, nativeUsdFixed, FP_SCALE), safetyFixed, FP_SCALE);
    const gasUsd = fixedToNumber(gasCostUsdFixed, FP_SCALE, 6);

    if (Number.isFinite(gasUsd) && gasUsd > 0) {
      return gasUsd;
    }
  }

  // Fallback path for compatibility when dynamic gas inputs are unavailable.
  return Math.max(1, config.estimatedGasUsd * NETWORK_GAS_MULTIPLIER[network]);
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
  const tokenScale = 10n ** BigInt(Math.max(0, decimals));
  return decimalToFixed(amount, tokenScale);
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

  const assetAmountFixed = decimalToFixed(assetAmountUsd, USD_SCALE);
  const buyPriceFixed = decimalToFixed(buyPrice, FP_SCALE);
  if (assetAmountFixed <= 0n || buyPriceFixed <= 0n) return 0n;

  // Token amount with USD scale (6 decimals): amount = usd / price
  const expectedTokenAmountUsdScale = mulDiv(assetAmountFixed, FP_SCALE, buyPriceFixed);
  const slippageBufferBps = BigInt(10_000 + estimatedSlippageBps + 200); // +2% safety
  const minTokenAmountUsdScale = mulDiv(expectedTokenAmountUsdScale, 10_000n, slippageBufferBps);

  const tokenScale = 10n ** BigInt(Math.max(0, tokenBDecimals));
  return scaleTo(minTokenAmountUsdScale, USD_SCALE, tokenScale);
};

const SOURCE_RELIABILITY_BPS: Record<'subgraph' | 'dexscreener' | 'gecko', bigint> = {
  subgraph: 10_000n,
  dexscreener: 7_200n,
  gecko: 5_200n,
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
  const baseFixed = decimalToFixed(getMinNetProfitUsdForNetwork(config, network), USD_SCALE);
  const networkGasFixed = decimalToFixed(estimateGasUsdForNetwork(network, config), USD_SCALE);
  const baselineGasFixed = decimalToFixed(Math.max(1, config.estimatedGasUsd), USD_SCALE);
  const multiplierFixed = decimalToFixed(config.adaptiveProfitPressureMultiplier, FP_SCALE);

  const gasFactorFixed = baselineGasFixed > 0n
    ? mulDiv(networkGasFixed, FP_SCALE, baselineGasFixed)
    : FP_SCALE;
  const gasExcessFixed = gasFactorFixed > FP_SCALE ? gasFactorFixed - FP_SCALE : 0n;
  const adjustmentFixed = mulDiv(gasExcessFixed, multiplierFixed, FP_SCALE);
  const adaptiveThresholdFixed = baseFixed + mulDiv(baseFixed, adjustmentFixed, FP_SCALE);
  return fixedToNumber(adaptiveThresholdFixed > 0n ? adaptiveThresholdFixed : 0n, USD_SCALE, 6);
};

const buildMathDiagnostics = ({
  loanAmountUsd,
  spreadBps,
  grossProfitUsd,
  buyLiquidityUsd,
  sellLiquidityUsd,
  gasCostUsd,
  passReason,
}: {
  loanAmountUsd: number;
  spreadBps: bigint;
  grossProfitUsd: number;
  buyLiquidityUsd: number;
  sellLiquidityUsd: number;
  gasCostUsd: number;
  passReason: string;
}) => {
  const loanFixed = decimalToFixed(loanAmountUsd, USD_SCALE);
  const grossProfitFixed = decimalToFixed(grossProfitUsd, USD_SCALE);
  const spreadFractionFixed = mulDiv(spreadBps, FP_SCALE, 10_000n);

  const expectedGrossFixed = mulDiv(loanFixed, spreadFractionFixed, FP_SCALE);
  const expectedOutputFixed = loanFixed + expectedGrossFixed;
  const actualOutputFixed = loanFixed + grossProfitFixed;

  const slippageFractionFixed = expectedGrossFixed > 0n
    ? (() => {
      const delta = expectedGrossFixed - grossProfitFixed;
      const positiveDelta = delta > 0n ? delta : 0n;
      return mulDiv(positiveDelta, FP_SCALE, expectedGrossFixed);
    })()
    : 0n;

  const buyLiquidityFixed = decimalToFixed(buyLiquidityUsd, USD_SCALE);
  const sellLiquidityFixed = decimalToFixed(sellLiquidityUsd, USD_SCALE);
  const minLiquidityFixed = buyLiquidityFixed < sellLiquidityFixed ? buyLiquidityFixed : sellLiquidityFixed;
  const oneFixed = FP_SCALE;
  const liquidityUsageFixed = minLiquidityFixed > 0n
    ? (() => {
      const usage = mulDiv(loanFixed, FP_SCALE, minLiquidityFixed);
      return usage > oneFixed ? oneFixed : usage;
    })()
    : oneFixed;

  return {
    reservesUsd: {
      buy: fixedToNumber(buyLiquidityFixed, USD_SCALE, 6),
      sell: fixedToNumber(sellLiquidityFixed, USD_SCALE, 6),
    },
    expectedOutputUsd: fixedToNumber(expectedOutputFixed, USD_SCALE, 6),
    actualOutputUsd: fixedToNumber(actualOutputFixed, USD_SCALE, 6),
    expectedGrossProfitUsd: fixedToNumber(expectedGrossFixed, USD_SCALE, 6),
    actualGrossProfitUsd: fixedToNumber(grossProfitFixed, USD_SCALE, 6),
    slippageFraction: fixedToNumber(slippageFractionFixed, FP_SCALE, 8),
    liquidityUsageFraction: fixedToNumber(liquidityUsageFixed, FP_SCALE, 8),
    gasEstimateUsd: fixedToNumber(decimalToFixed(gasCostUsd, USD_SCALE), USD_SCALE, 6),
    passReason,
  };
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
        const priceUsdFixed = decimalToFixed(String(pair.priceUsd || '0'), FP_SCALE);
        if (priceUsdFixed <= 0n) continue;

        const liquidityUsdFixed = decimalToFixed(String(pair.liquidity?.usd || 0), USD_SCALE);
        if (liquidityUsdFixed < decimalToFixed(MIN_FALLBACK_LIQUIDITY_USD, USD_SCALE)) continue;

        const dexBase = normalizeTokenSymbol(baseSymbol);
        const canonicalBase = normalizeTokenSymbol(base);
        if (dexBase !== canonicalBase) {
          // DexScreener returned the stable token as base; priceUsd is not a usable exchange rate here.
          continue;
        }

        const token0PriceFixed = priceUsdFixed;
        const token1PriceFixed = mulDiv(FP_SCALE, FP_SCALE, token0PriceFixed);
        if (token1PriceFixed <= 0n) continue;

        const pool: Pool = {
          token0: { symbol: base },
          token1: { symbol: quote },
          token0Price: fixedToNumber(token0PriceFixed, FP_SCALE, 12).toString(),
          token1Price: fixedToNumber(token1PriceFixed, FP_SCALE, 12).toString(),
          reserveUSD: fixedToNumber(liquidityUsdFixed, USD_SCALE, 6).toString(),
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
        const priceUsdFixed = decimalToFixed(String(attrs.base_token_price_usd || attrs.price_in_usd || attrs.price_usd || '0'), FP_SCALE);
        if (priceUsdFixed <= 0n) continue;

        const liquidityUsdFixed = decimalToFixed(String(attrs.reserve_in_usd || attrs.liquidity_usd || '0'), USD_SCALE);
        if (liquidityUsdFixed < decimalToFixed(MIN_FALLBACK_LIQUIDITY_USD, USD_SCALE)) continue;

        const geckoBase = normalizeTokenSymbol(baseSymbol);
        const canonicalBase = normalizeTokenSymbol(base);
        if (geckoBase !== canonicalBase) {
          // GeckoTerminal returned the stable quote as base; priceUsd is not a usable exchange rate here.
          continue;
        }

        const token0PriceFixed = priceUsdFixed;
        const token1PriceFixed = mulDiv(FP_SCALE, FP_SCALE, token0PriceFixed);
        if (token1PriceFixed <= 0n) continue;

        const pool: Pool = {
          token0: { symbol: base },
          token1: { symbol: quote },
          token0Price: fixedToNumber(token0PriceFixed, FP_SCALE, 12).toString(),
          token1Price: fixedToNumber(token1PriceFixed, FP_SCALE, 12).toString(),
          reserveUSD: fixedToNumber(liquidityUsdFixed, USD_SCALE, 6).toString(),
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
    const SCALE = 100n;
    const networkMinNetFixed = decimalToFixed(Math.max(1, getRequiredActiveNetProfitUsd(config, opportunity.network)), USD_SCALE);
    const netProfitFixed = decimalToFixed(Math.max(0, parseNumeric(opportunity.netProfit, 0)), USD_SCALE);
    const normalizedProfitBps = networkMinNetFixed > 0n
      ? mulDiv(netProfitFixed, 10_000n, networkMinNetFixed)
      : 0n;
    const cappedProfitBps = normalizedProfitBps > 40_000n ? 40_000n : normalizedProfitBps;

    const slippageBps = BigInt(Math.max(0, Math.round(parseNumeric(opportunity.estimatedSlippageBps, 0))));
    const liquidityUsdFixed = decimalToFixed(Math.max(1, parseNumeric(opportunity.liquidity, 1)), USD_SCALE);
    const confidence = BigInt(Math.max(1, Math.min(99, Math.round(parseNumeric(opportunity.confidenceScore, 1)))));
    const distanceToExecutableFixed = decimalToFixed(Math.max(0, parseNumeric(opportunity.distanceToExecutableUsd, 0)), USD_SCALE);

    const quoteSources = opportunity.quoteSources || [];
    const sourceQualityBps = quoteSources.length > 0
      ? quoteSources.reduce((sum, source) => sum + (SOURCE_RELIABILITY_BPS[source] ?? 0n), 0n) / BigInt(quoteSources.length)
      : 10_000n;

    const profitComponent = mulDiv(cappedProfitBps, 45n * SCALE, 10_000n);
    const confidenceComponent = mulDiv(confidence * 100n, 22n * SCALE, 10_000n);

    // Linear liquidity score up to $1,000,000 depth (deterministic, avoids floating log math).
    const liquidityRatioBps = mulDiv(liquidityUsdFixed, 10_000n, 1_000_000n * USD_SCALE);
    const cappedLiquidityBps = liquidityRatioBps > 10_000n ? 10_000n : liquidityRatioBps;
    const liquidityComponent = mulDiv(cappedLiquidityBps, 18n * SCALE, 10_000n);

    // Source component centered around 7000 bps quality.
    const sourceDeltaBps = sourceQualityBps - 7_000n;
    const rawSourceComponent = mulDiv(sourceDeltaBps, 20n * SCALE, 10_000n);
    const sourceComponent = rawSourceComponent < -(15n * SCALE)
      ? -(15n * SCALE)
      : rawSourceComponent > (15n * SCALE)
        ? (15n * SCALE)
        : rawSourceComponent;

    const rawSlippagePenalty = mulDiv(slippageBps, SCALE, 6n);
    const slippagePenalty = rawSlippagePenalty > (26n * SCALE) ? (26n * SCALE) : rawSlippagePenalty;

    const watchlistPenalty = opportunity.status === 'watchlist'
      ? (() => {
        const ratioBps = networkMinNetFixed > 0n
          ? mulDiv(distanceToExecutableFixed, 10_000n, networkMinNetFixed)
          : 0n;
        const penalty = mulDiv(ratioBps, 12n * SCALE, 10_000n);
        return penalty > (30n * SCALE) ? (30n * SCALE) : penalty;
      })()
      : 0n;

    const total = profitComponent + confidenceComponent + liquidityComponent + sourceComponent - slippagePenalty - watchlistPenalty;
    return Number(total) / Number(SCALE);
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
    const rawPriceFixed = decimalToFixed(p.token1Price || '0', FP_SCALE);
    if (rawPriceFixed <= 0n) {
      return { key: '', price: 0, pool: p, network };
    }

    const isCanonical = token0 < token1;
    const key = isCanonical ? `${network}:${token0}/${token1}` : `${network}:${token1}/${token0}`;
    const canonicalPriceFixed = isCanonical ? rawPriceFixed : mulDiv(FP_SCALE, FP_SCALE, rawPriceFixed);
    const price = fixedToNumber(canonicalPriceFixed, FP_SCALE, 12);
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
      score: bigint;
    } | null = null;

    for (const buy of buys) {
      for (const sell of sells) {
        if (buy.dex === sell.dex) continue;
        if (sell.price <= buy.price) continue;
        const buyLiquidity = parsePoolLiquidity(buy.pool);
        const sellLiquidity = parsePoolLiquidity(sell.pool);

        const buyPriceFixed = decimalToFixed(buy.price, FP_SCALE);
        const sellPriceFixed = decimalToFixed(sell.price, FP_SCALE);
        if (buyPriceFixed <= 0n || sellPriceFixed <= buyPriceFixed) continue;

        const spreadBps = mulDiv(sellPriceFixed - buyPriceFixed, 10_000n, buyPriceFixed);
        const liquidityFloorUsdFixed = decimalToFixed(Math.min(buyLiquidity, sellLiquidity), USD_SCALE);
        const liquidityCapUsdFixed = decimalToFixed(2_000_000, USD_SCALE);
        const cappedLiquidityFixed = liquidityFloorUsdFixed > liquidityCapUsdFixed ? liquidityCapUsdFixed : liquidityFloorUsdFixed;
        const liquidityBps = mulDiv(cappedLiquidityFixed, 10_000n, liquidityCapUsdFixed);

        // Heavily prioritize spread, then use liquidity as deterministic tie-breaker.
        const score = spreadBps * 100_000n + liquidityBps;
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

    const sellPriceFixed = decimalToFixed(sellEntry.price, FP_SCALE);
    const buyPriceFixed = decimalToFixed(buyEntry.price, FP_SCALE);
    if (sellPriceFixed <= buyPriceFixed || buyPriceFixed <= 0n) {
      diagnostics.droppedByBadQuotes++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'badQuotes', buyDex: buyEntry.dex, sellDex: sellEntry.dex, spread: 0 });
      continue;
    }

    const spreadFractionFixed = mulDiv(sellPriceFixed - buyPriceFixed, FP_SCALE, buyPriceFixed);
    const maxSpreadFixed = decimalToFixed(MAX_REASONABLE_SPREAD_FRACTION, FP_SCALE);
    if (spreadFractionFixed <= 0n || spreadFractionFixed > maxSpreadFixed) {
      diagnostics.droppedByBadQuotes++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'badQuotes', buyDex: buyEntry.dex, sellDex: sellEntry.dex, spread: fixedToNumber(mulDiv(spreadFractionFixed, 100n * FP_SCALE, FP_SCALE), FP_SCALE, 6) });
      continue;
    }

    const spreadBps = mulDiv(spreadFractionFixed, 10_000n, FP_SCALE);
    const spread = Number(spreadBps) / 100;
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
        const quotedBuyPrice = mulDiv(decimalToFixed(buyEntry.price, FP_SCALE), BigInt(10_000 + buyImpactBps), 10_000n);
        const quotedSellPrice = mulDiv(decimalToFixed(sellEntry.price, FP_SCALE), BigInt(10_000 - sellImpactBps), 10_000n);
        const requestedLoanFixed = decimalToFixed(requestedLoanAmount, USD_SCALE);
        const gasCostFixed = decimalToFixed(estimateGasUsdForNetwork(network, config), USD_SCALE);

        const grossProfitFixed = quotedSellPrice > quotedBuyPrice
          ? mulDiv(mulDiv(quotedSellPrice - quotedBuyPrice, FP_SCALE, quotedBuyPrice), requestedLoanFixed, FP_SCALE)
          : 0n;
        const nearMissNetProfitFixed = grossProfitFixed - mulDiv(requestedLoanFixed, BigInt(routePenaltyBps), 10_000n) - gasCostFixed;
        const maxReasonableProfitFixed = mulDiv(requestedLoanFixed, decimalToFixed(MAX_REASONABLE_ROI_FRACTION, FP_SCALE), FP_SCALE);
        if (grossProfitFixed > maxReasonableProfitFixed || nearMissNetProfitFixed > maxReasonableProfitFixed) {
          diagnostics.droppedByBadQuotes++;
          pushRejectionSample(diagnostics, {
            tokenPair: key,
            reason: 'badQuotes',
            buyDex: buyEntry.dex,
            sellDex: sellEntry.dex,
            spread,
            buyLiquidityUsd,
            sellLiquidityUsd,
            attemptedLoanAmount: requestedLoanAmount,
          });
          continue;
        }

        const gasCost = fixedToNumber(gasCostFixed, USD_SCALE, 6);
        const grossProfit = fixedToNumber(grossProfitFixed, USD_SCALE, 6);
        const nearMissNetProfit = fixedToNumber(nearMissNetProfitFixed, USD_SCALE, 6);

        if (grossProfit <= gasCost || nearMissNetProfit <= 0) {
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
          continue;
        }

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
          confidenceScore: confidenceScoreDeterministic({
            base: 42,
            spreadBps,
            spreadMultiplier: 65,
            slippageBps: BigInt(buyImpactBps + sellImpactBps + routePenaltyBps),
            slippageDivisor: 6,
            minScore: 1,
            maxScore: 89,
          }),
          confidenceTier: nearMissNetProfit >= 0 ? 'medium' : 'low',
          spread: spread.toFixed(4),
          liquidity: liquidityUsd.toFixed(0),
          estimatedSlippageBps: buyImpactBps + sellImpactBps + routePenaltyBps,
          buyImpactBps,
          sellImpactBps,
          routePenaltyBps,
          quoteSources,
          mathDiagnostics: buildMathDiagnostics({
            loanAmountUsd: requestedLoanAmount,
            spreadBps,
            grossProfitUsd: grossProfit,
            buyLiquidityUsd,
            sellLiquidityUsd,
            gasCostUsd: gasCost,
            passReason: 'watchlist-net-profit-below-threshold',
          }),
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
      if (executionCandidate.grossProfit <= executionCandidate.gasCost || executionCandidate.netProfit <= 0) {
        diagnostics.droppedByNetProfit++;
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
        gasCost: estimateGasUsdForNetwork(network, config),
        confidenceScore: confidenceScoreDeterministic({
          base: 48,
          spreadBps,
          spreadMultiplier: 70,
          slippageBps: BigInt(executionCandidate.estimatedSlippageBps),
          slippageDivisor: 6,
          minScore: 1,
          maxScore: 89,
        }),
        confidenceTier: executionCandidate.netProfit >= 0 ? 'medium' : 'low',
        spread: spread.toFixed(4),
        liquidity: liquidityUsd.toFixed(0),
        estimatedSlippageBps: executionCandidate.estimatedSlippageBps,
        buyImpactBps: executionCandidate.buyImpactBps,
        sellImpactBps: executionCandidate.sellImpactBps,
        routePenaltyBps: executionCandidate.routePenaltyBps,
        quoteSources,
        mathDiagnostics: buildMathDiagnostics({
          loanAmountUsd: executionCandidate.executableLoanAmount,
          spreadBps,
          grossProfitUsd: executionCandidate.grossProfit,
          buyLiquidityUsd,
          sellLiquidityUsd,
          gasCostUsd: executionCandidate.gasCost,
          passReason: 'watchlist-net-profit-below-threshold',
        }),
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

    const confidenceScore = confidenceScoreDeterministic({
      base: 58,
      spreadBps,
      spreadMultiplier: 90,
      slippageBps: BigInt(executionCandidate.estimatedSlippageBps),
      slippageDivisor: 5,
      minScore: 1,
      maxScore: 99,
      netProfitUsd: executionCandidate.netProfit,
      minProfitUsd: config.minNetProfitUsd,
    });
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
      if (executionCandidate.grossProfit <= executionCandidate.gasCost || executionCandidate.netProfit <= 0) {
        diagnostics.droppedByNetProfit++;
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
        confidenceScore: confidenceScoreDeterministic({
          base: 38,
          spreadBps,
          spreadMultiplier: 70,
          slippageBps: BigInt(executionCandidate.estimatedSlippageBps),
          slippageDivisor: 5,
          minScore: 1,
          maxScore: 79,
        }),
        confidenceTier: 'low',
        spread: spread.toFixed(4),
        liquidity: liquidityUsd.toFixed(0),
        estimatedSlippageBps: executionCandidate.estimatedSlippageBps,
        buyImpactBps: executionCandidate.buyImpactBps,
        sellImpactBps: executionCandidate.sellImpactBps,
        routePenaltyBps: executionCandidate.routePenaltyBps,
        quoteSources,
        mathDiagnostics: buildMathDiagnostics({
          loanAmountUsd: executionCandidate.executableLoanAmount,
          spreadBps,
          grossProfitUsd: executionCandidate.grossProfit,
          buyLiquidityUsd,
          sellLiquidityUsd,
          gasCostUsd: executionCandidate.gasCost,
          passReason: 'watchlist-execution-payload-risk',
        }),
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
      mathDiagnostics: buildMathDiagnostics({
        loanAmountUsd: executionCandidate.executableLoanAmount,
        spreadBps,
        grossProfitUsd: executionCandidate.grossProfit,
        buyLiquidityUsd,
        sellLiquidityUsd,
        gasCostUsd: executionCandidate.gasCost,
        passReason: 'active-profit-qualified',
      }),
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
    scanMode = (body as { scheduledRun?: boolean }).scheduledRun ? 'scheduled' : 'manual';
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
    // --- Enhanced Logging: Output config and diagnostics for debugging ---
    console.log('[SCAN-DEBUG] Scanner config:', JSON.stringify(config, null, 2));
    console.log('[SCAN-DEBUG] Networks:', JSON.stringify(networks));
    const { opportunities, diagnostics, watchlist } = await runScan(config, networks) as { opportunities: Opportunity[]; diagnostics: ScanDiagnostics; watchlist: Opportunity[] };
    console.log('[SCAN-DEBUG] Diagnostics summary:', JSON.stringify(diagnostics, null, 2));
    if (diagnostics.rejectionSamples && diagnostics.rejectionSamples.length > 0) {
      console.log('[SCAN-DEBUG] Rejection samples:', JSON.stringify(diagnostics.rejectionSamples, null, 2));
    }
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
