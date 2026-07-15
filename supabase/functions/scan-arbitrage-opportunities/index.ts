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
const CURVE_SUBGRAPH_PUBLIC_DEPRECATED = 'https://api.thegraph.com/subgraphs/name/curvefi/curve';

const THEGRAPH_API_KEY = (Deno.env.get('THEGRAPH_API_KEY') || '').trim();
const LEGACY_GRAPH_HOST = 'api.thegraph.com/subgraphs/name/';

const buildGraphEndpoint = (
  overrideEnvKey: string,
  publicUrl: string,
  options?: {
    defaultGatewayId?: string;
    gatewayIdEnvKey?: string;
  },
): string => {
  const overrideUrl = (Deno.env.get(overrideEnvKey) || '').trim();
  const envGatewayId = options?.gatewayIdEnvKey
    ? (Deno.env.get(options.gatewayIdEnvKey) || '').trim()
    : '';
  const gatewayId = envGatewayId || (options?.defaultGatewayId || '');
  const overrideIsLegacyHosted = overrideUrl.includes(LEGACY_GRAPH_HOST);

  // Prefer gateway endpoint when we have an API key + gateway ID and override is missing or legacy-hosted.
  if (THEGRAPH_API_KEY && gatewayId && (!overrideUrl || overrideIsLegacyHosted)) {
    return `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/${gatewayId}`;
  }

  return overrideUrl || publicUrl;
};

const UNI_V3_SUBGRAPH = buildGraphEndpoint('THEGRAPH_UNI_V3', UNI_V3_SUBGRAPH_PUBLIC, {
  defaultGatewayId: '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
  gatewayIdEnvKey: 'THEGRAPH_UNI_V3_ID',
});
const SUSHI_SUBGRAPH = buildGraphEndpoint('THEGRAPH_SUSHI', SUSHI_SUBGRAPH_PUBLIC, {
  defaultGatewayId: '6NUtT5mGjZ1tSshKLf5Q3uEEJtjBZJo1TpL5MXsUBqrT',
  gatewayIdEnvKey: 'THEGRAPH_SUSHI_ID',
});
const UNI_V2_SUBGRAPH = buildGraphEndpoint('THEGRAPH_UNI_V2', UNI_V2_SUBGRAPH_PUBLIC, {
  defaultGatewayId: 'A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum',
  gatewayIdEnvKey: 'THEGRAPH_UNI_V2_ID',
});
// Balancer V2 Ethereum gateway subgraph (verified 2026-06: returns real pool data with `pools { tokensList, totalLiquidity, totalSwapVolume }`).
const BALANCER_SUBGRAPH = buildGraphEndpoint('THEGRAPH_BALANCER', BALANCER_SUBGRAPH_PUBLIC, {
  defaultGatewayId: 'C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV',
  gatewayIdEnvKey: 'THEGRAPH_BALANCER_ID',
});
// Curve: legacy hosted subgraph is dead and no public gateway deployment is consistently available.
// We bypass the subgraph layer entirely and query Curve's official REST API (api.curve.fi),
// which exposes the same data (pool address, coins with balance + decimals + symbol, USD TVL)
// across the active registries (main, crypto, factory, factory-crypto, factory-stable-ng).
// See `fetchCurveOfficialPools` / `toPoolFromCurve` below.
const CURVE_OFFICIAL_API_BASE = 'https://api.curve.fi/api/getPools/ethereum';
const CURVE_OFFICIAL_REGISTRIES = ['main', 'crypto', 'factory', 'factory-crypto', 'factory-stable-ng'] as const;

// Arbitrum-specific subgraphs — separate deployments required for cross-chain DEX diversity.
// IDs verified against gateway.thegraph.com with real Arbitrum token data (ARB, WETH, WBTC, USDC).
// UNI_V3_ARB: 3V7ZY6muhxaQL5qvntX1CFXJ32W7BxXZTGTwmpH5J4t3 (sourced from DeFiLlama, confirmed ARB+WETH pools present)
// SUSHI_ARB:  8yBXBTMfdhsoE5QCf7KnoPmQb7QAWtRzESfYjiCjGEM9 (SushiSwap V2 Arbitrum One, confirmed WETH+MAGIC+USDC pools present)
const UNI_V3_ARB_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-arbitrum-one';
const SUSHI_ARB_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-arbitrum';
const UNI_V3_ARB_SUBGRAPH = buildGraphEndpoint('THEGRAPH_UNI_V3_ARB', UNI_V3_ARB_SUBGRAPH_PUBLIC, {
  defaultGatewayId: '3V7ZY6muhxaQL5qvntX1CFXJ32W7BxXZTGTwmpH5J4t3',
  gatewayIdEnvKey: 'THEGRAPH_UNI_V3_ARB_ID',
});
const SUSHI_ARB_SUBGRAPH = buildGraphEndpoint('THEGRAPH_SUSHI_ARB', SUSHI_ARB_SUBGRAPH_PUBLIC, {
  defaultGatewayId: '8yBXBTMfdhsoE5QCf7KnoPmQb7QAWtRzESfYjiCjGEM9',
  gatewayIdEnvKey: 'THEGRAPH_SUSHI_ARB_ID',
});

// Base-specific subgraphs — Uniswap V3 + SushiSwap V2 on Base mainnet.
// UNI_V3_BASE: GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz (Uniswap V3 Base, verified on gateway.thegraph.com)
// SUSHI_BASE: QmQfYe5Ygg9A3mAiuBZYj5a64bDKLF4gF6sezfhgxKvb9y (SushiSwap V2 Base, verified live 2025)
const UNI_V3_BASE_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-base';
const UNI_V3_BASE_SUBGRAPH = buildGraphEndpoint('THEGRAPH_UNI_V3_BASE', UNI_V3_BASE_SUBGRAPH_PUBLIC, {
  defaultGatewayId: 'GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz',
  gatewayIdEnvKey: 'THEGRAPH_UNI_V3_BASE_ID',
});
const SUSHI_BASE_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-base';
const SUSHI_BASE_SUBGRAPH = buildGraphEndpoint('THEGRAPH_SUSHI_BASE', SUSHI_BASE_SUBGRAPH_PUBLIC, {
  defaultGatewayId: 'QmQfYe5Ygg9A3mAiuBZYj5a64bDKLF4gF6sezfhgxKvb9y',
  gatewayIdEnvKey: 'THEGRAPH_SUSHI_BASE_ID',
});

type NetworkName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'bsc';
type SourcePolicyMode = 'neutral' | 'prefer_subgraph' | 'prefer_external_raw';

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
  minNetEdgeBpsByNetwork: Partial<Record<NetworkName, number>>;
  executionRiskBufferUsdByNetwork: Partial<Record<NetworkName, number>>;
  adaptiveProfitPressureMultiplier: number;
  adaptiveProfitReliefMultiplier: number;
  adaptiveMinNetFloorFraction: number;
  maxSlippageBps: number;
  maxLiquidityUsageFraction: number;
  maxResults: number;
  loanAmountUsd: number;
  perNetworkLoanAmountUsd: Partial<Record<NetworkName, number>>;
  estimatedGasUsd: number;
  gasUnits: number;
  gasSafetyMultiplier: number;
  gasPriceGweiByNetwork: Partial<Record<NetworkName, number>>;
  nativeTokenUsdByNetwork: Partial<Record<NetworkName, number>>;
  enableDexScreenerFallback: boolean;
  enableGeckoFallback: boolean;
  enableCycleShadow: boolean;
  sourcePolicyMode: SourcePolicyMode;
  useExternalRawFeed: boolean;
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
  priceNative?: string;
  liquidity?: { usd?: number };
  baseToken?: { symbol?: string; address?: string };
  quoteToken?: { symbol?: string; address?: string };
}

interface GeckoSearchPool {
  id?: string;
  attributes?: Record<string, unknown>;
  relationships?: {
    network?: {
      data?: {
        id?: string;
      };
    };

    base_token?: {
      data?: {
        id?: string;
      };
    };
    quote_token?: {
      data?: {
        id?: string;
      };
    };
    dex?: {
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
  canonicalizationStats?: {
    totalPoolsSeen: number;
    mapped: number;
    droppedMissingSymbols: number;
    droppedUntrackablePair: number;
    droppedNonPositiveCanonicalPrice: number;
    bySource: {
      subgraph: number;
      dexscreener: number;
      gecko: number;
    };
  };
  sourcePolicy?: {
    mode: SourcePolicyMode;
    useExternalRawFeed: boolean;
    notes: string;
  };
  quoteFilterStats?: {
    dexscreenerOutliersDropped: number;
  };
  badQuoteDetails?: {
    reasons: {
      invalidPriceSet: number;
      nonPositiveOrInvalidCross: number;
      unreasonableSpread: number;
      unreasonableNearMissRoi: number;
    };
    sourceComposition: {
      subgraphOnly: number;
      fallbackOnly: number;
      mixed: number;
      subgraphDexscreener: number;
      subgraphGecko: number;
      dexscreenerOnly: number;
      geckoOnly: number;
      crossFallback: number;
      unknownRoute: number;
    };
    samples: Array<{
      tokenPair: string;
      reason: 'invalidPriceSet' | 'nonPositiveOrInvalidCross' | 'unreasonableSpread' | 'unreasonableNearMissRoi';
      buyDex?: Opportunity['buyDex'];
      sellDex?: Opportunity['sellDex'];
      buySource?: 'subgraph' | 'dexscreener' | 'gecko';
      sellSource?: 'subgraph' | 'dexscreener' | 'gecko';
      spread?: number;
    }>;
  };
  routeAlternativeInsights?: {
    inspectedPairs: number;
    samples: Array<{
      tokenPair: string;
      selected: {
        buyDex: Opportunity['buyDex'];
        sellDex: Opportunity['buyDex'];
        buySource: 'subgraph' | 'dexscreener' | 'gecko';
        sellSource: 'subgraph' | 'dexscreener' | 'gecko';
        spreadBps: number;
        minLiquidityUsd: number;
        score: number;
      };
      alternate?: {
        buyDex: Opportunity['buyDex'];
        sellDex: Opportunity['buyDex'];
        buySource: 'subgraph' | 'dexscreener' | 'gecko';
        sellSource: 'subgraph' | 'dexscreener' | 'gecko';
        spreadBps: number;
        minLiquidityUsd: number;
        score: number;
      };
      decisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
    }>;
  };
  policyDryRun?: {
    enabled: boolean;
    summary: {
      preferSubgraph: {
        differentFromSelected: number;
        selectedMixedExtreme: number;
        selectedSubgraphAnchored: number;
        medianFlipMarginScore: number;
        minFlipMarginScore: number;
        medianFlipMarginDistinctRouteScore: number;
        minFlipMarginDistinctRouteScore: number;
        medianFlipThresholdScore: number;
        minFlipThresholdScore: number;
        topTiePairs: number;
      };
      preferExternalRaw: {
        differentFromSelected: number;
        selectedMixedExtreme: number;
        selectedSubgraphAnchored: number;
        medianFlipMarginScore: number;
        minFlipMarginScore: number;
        medianFlipMarginDistinctRouteScore: number;
        minFlipMarginDistinctRouteScore: number;
        medianFlipThresholdScore: number;
        minFlipThresholdScore: number;
        topTiePairs: number;
      };
    };
    calibrationHints: {
      preferSubgraph: {
        easiestPairs: Array<{
          tokenPair: string;
          liveDecisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
          flipThresholdScore: number;
          marginToDistinctRouteScore: number;
          challenger?: {
            buyDex: Opportunity['buyDex'];
            sellDex: Opportunity['buyDex'];
            buySource: 'subgraph' | 'dexscreener' | 'gecko';
            sellSource: 'subgraph' | 'dexscreener' | 'gecko';
            decisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
            earlyGate: 'pass' | 'badQuotes' | 'spread';
            spreadPercent: number;
          };
        }>;
      };
      preferExternalRaw: {
        easiestPairs: Array<{
          tokenPair: string;
          liveDecisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
          flipThresholdScore: number;
          marginToDistinctRouteScore: number;
          challenger?: {
            buyDex: Opportunity['buyDex'];
            sellDex: Opportunity['buyDex'];
            buySource: 'subgraph' | 'dexscreener' | 'gecko';
            sellSource: 'subgraph' | 'dexscreener' | 'gecko';
            decisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
            earlyGate: 'pass' | 'badQuotes' | 'spread';
            spreadPercent: number;
          };
        }>;
      };
    };
    samples: Array<{
      tokenPair: string;
      liveDecisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
      live: {
        buyDex: Opportunity['buyDex'];
        sellDex: Opportunity['buyDex'];
        buySource: 'subgraph' | 'dexscreener' | 'gecko';
        sellSource: 'subgraph' | 'dexscreener' | 'gecko';
        spreadBps: number;
        score: number;
      };
      preferSubgraph?: {
        buyDex: Opportunity['buyDex'];
        sellDex: Opportunity['buyDex'];
        buySource: 'subgraph' | 'dexscreener' | 'gecko';
        sellSource: 'subgraph' | 'dexscreener' | 'gecko';
        spreadBps: number;
        score: number;
        marginToDistinctRouteScore: number;
        flipThresholdScore: number;
        challenger?: {
          buyDex: Opportunity['buyDex'];
          sellDex: Opportunity['buyDex'];
          buySource: 'subgraph' | 'dexscreener' | 'gecko';
          sellSource: 'subgraph' | 'dexscreener' | 'gecko';
          decisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
          earlyGate: 'pass' | 'badQuotes' | 'spread';
          spreadPercent: number;
        };
      };
      preferExternalRaw?: {
        buyDex: Opportunity['buyDex'];
        sellDex: Opportunity['buyDex'];
        buySource: 'subgraph' | 'dexscreener' | 'gecko';
        sellSource: 'subgraph' | 'dexscreener' | 'gecko';
        spreadBps: number;
        score: number;
        marginToDistinctRouteScore: number;
        flipThresholdScore: number;
        challenger?: {
          buyDex: Opportunity['buyDex'];
          sellDex: Opportunity['buyDex'];
          buySource: 'subgraph' | 'dexscreener' | 'gecko';
          sellSource: 'subgraph' | 'dexscreener' | 'gecko';
          decisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
          earlyGate: 'pass' | 'badQuotes' | 'spread';
          spreadPercent: number;
        };
      };
    }>;
  };
  fallbackPoolCounts?: {
    dexscreener: {
      uniV3: number;
      uniV2: number;
      sushi: number;
      balancer: number;
      curve: number;
      total: number;
    };
    gecko: {
      uniV3: number;
      uniV2: number;
      sushi: number;
      balancer: number;
      curve: number;
      total: number;
    };
  };
  fallbackSourcesEnabled?: {
    dexscreener: boolean;
    gecko: boolean;
  };
  subgraphFetchStats?: {
    uniswapV3: { status: 'ok' | 'failed'; entries: number; error?: string };
    uniswapV2: { status: 'ok' | 'failed'; entries: number; error?: string };
    sushiswap: { status: 'ok' | 'failed'; entries: number; error?: string };
    balancer: { status: 'ok' | 'failed'; entries: number; error?: string };
    curve: { status: 'ok' | 'failed'; entries: number; error?: string };
  };
  priorityPairSubgraphStats?: {
    targets: number;
    queries: number;
    responsesOk: number;
    errors: number;
    entriesAccepted: number;
  };
  dynamicPriorityStats?: {
    runs: number;
    samples: number;
    pairs: number;
    penalizedPairs: number;
  };
  fallbackFetchStats?: {
    dexscreener: {
      queries: number;
      responsesOk: number;
      errors: number;
      entriesSeen: number;
      entriesAccepted: number;
    };
    gecko: {
      queries: number;
      responsesOk: number;
      errors: number;
      entriesSeen: number;
      entriesAccepted: number;
      rejectionReasons?: {
        invalidNetworkMap: number;
        networkNotRequested: number;
        nonTrackablePair: number;
        priceParseFail: number;
        liquidityBelowMin: number;
        baseQuoteOrientationMismatch: number;
        orientationRecovered: number;
        inversePriceFail: number;
      };
    };
  };
  sourceHardening?: {
    autoDisableFailedSubgraphs: boolean;
    envDisabledDexes: string[];
    activeDisabledDexes: string[];
    droppedPoolCounts: {
      uniV3: number;
      uniV2: number;
      sushi: number;
      balancer: number;
      curve: number;
      total: number;
    };
    sourceReliabilityBps?: {
      subgraph: number;
      dexscreener: number;
      gecko: number;
    };
    sourceReliabilityWindowRuns?: number;
  };
  sameDexDetails?: {
    reasons: {
      insufficientQuotes: number;
      insufficientValidPrices: number;
      insufficientDexOverlap: number;
      noCrossDexPositiveSpread: number;
      missingBestPairEntries: number;
    };
    sourceComposition: {
      subgraphOnly: number;
      fallbackOnly: number;
      mixed: number;
    };
    samples: Array<{
      tokenPair: string;
      reason: 'insufficientQuotes' | 'insufficientValidPrices' | 'insufficientDexOverlap' | 'noCrossDexPositiveSpread' | 'missingBestPairEntries';
      quoteCount: number;
      dexes: string[];
      sources: Array<'subgraph' | 'dexscreener' | 'gecko'>;
    }>;
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
  routeMemory?: {
    loadedRoutes: number;
    suppressedByCooldown: number;
    penalizedByHistory: number;
    maxPenaltyUsd: number;
    suppressedSamples: Array<{
      routeKey: string;
      tokenPair: string;
      buyDex: Opportunity['buyDex'];
      sellDex: Opportunity['sellDex'];
      cooldownUntil?: string;
    }>;
    penalizedSamples: Array<{
      routeKey: string;
      tokenPair: string;
      buyDex: Opportunity['buyDex'];
      sellDex: Opportunity['sellDex'];
      avgRealizedNet: number;
      penaltyUsd: number;
    }>;
  };
  executionRiskDetails?: {
    reasons: {
      routeCooldown: number;
      noExecutableSize: number;
      payloadBuildFailed: number;
      realtimeQuoteVerification: number;
    };
    noExecutableByGate?: Record<NoExecutableReason, number>;
    samples: Array<{
      tokenPair: string;
      buyDex: Opportunity['buyDex'];
      sellDex: Opportunity['sellDex'];
      cause: 'routeCooldown' | 'noExecutableSize' | 'payloadBuildFailed' | 'realtimeQuoteVerification';
      detail?: string;
    }>;
  };
  cycleShadow?: {
    enabled: boolean;
    networksAnalyzed: number;
    testedTriangles: number;
    candidatePaths: number;
    topCycles: Array<{
      network: NetworkName;
      path: string;
      grossReturnBps: number;
      minLiquidityUsd: number;
      sources: string[];
    }>;
  };
  indexCache?: {
    enabled: boolean;
    requestedRows: number;
    acceptedRows: number;
    hitPairs: number;
    missPairs: number;
    stalePairs: number;
    fallbackFetches: number;
    upstreamCallsSaved: number;
    avgIndexedRowAgeMs: number;
    p90IndexedRowAgeMs: number;
  };
  ingestionHeartbeat?: {
    status: 'ok' | 'starved';
    networksRequested: number;
    pairKeys: number;
    usablePools: number;
    subgraphEntries: number;
    fallbackEntriesAccepted: number;
    subgraphSourcesOk: number;
    starvationReason?: string;
  };
}

interface RouteMemoryRecord {
  routeKey: string;
  avgRealizedNet: number;
  cooldownUntil?: string;
  failedExecutions: number;
  successfulExecutions: number;
}

interface RouteExecutionFeedbackRecord {
  routeKey: string;
  attempts: number;
  included: number;
  failed: number;
  simulationFailures: number;
  avgLatencyMs: number;
  successRate: number;
  penaltyUsd: number;
  reliefUsd: number;
}

interface IndexedQuotePoolLoadResult {
  uniV3Pools: Pool[];
  uniV2Pools: Pool[];
  sushiPools: Pool[];
  balancerPools: Pool[];
  curvePools: Pool[];
  stats: {
    enabled: boolean;
    requestedRows: number;
    acceptedRows: number;
    hitPairs: number;
    missPairs: number;
    stalePairs: number;
    fallbackFetches: number;
    upstreamCallsSaved: number;
    avgIndexedRowAgeMs: number;
    p90IndexedRowAgeMs: number;
  };
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

type NoExecutableReason =
  | 'noLiquidity'
  | 'noRawCross'
  | 'invalidLoanOrScale'
  | 'slippageExceeded'
  | 'noCrossAfterSlippage'
  | 'unreasonableSpread'
  | 'unrealisticRoi'
  | 'gasDominatesOrNonPositive';

interface ExecutionEvaluationResult {
  candidate: ExecutionCandidate | null;
  noExecutableReasons?: Record<NoExecutableReason, number>;
}

const NO_EXECUTABLE_REASON_KEYS: NoExecutableReason[] = [
  'noLiquidity',
  'noRawCross',
  'invalidLoanOrScale',
  'slippageExceeded',
  'noCrossAfterSlippage',
  'unreasonableSpread',
  'unrealisticRoi',
  'gasDominatesOrNonPositive',
];

const createNoExecutableReasonCounts = (): Record<NoExecutableReason, number> => ({
  noLiquidity: 0,
  noRawCross: 0,
  invalidLoanOrScale: 0,
  slippageExceeded: 0,
  noCrossAfterSlippage: 0,
  unreasonableSpread: 0,
  unrealisticRoi: 0,
  gasDominatesOrNonPositive: 0,
});

const topNoExecutableReason = (counts: Record<NoExecutableReason, number> | undefined): NoExecutableReason | undefined => {
  if (!counts) return undefined;
  let top: NoExecutableReason | undefined;
  let topCount = -1;
  for (const key of NO_EXECUTABLE_REASON_KEYS) {
    if ((counts[key] || 0) > topCount) {
      top = key;
      topCount = counts[key] || 0;
    }
  }
  return topCount > 0 ? top : undefined;
};

type TelemetryOpportunity = Opportunity & {
  scanRunId: string;
  candidateId: string;
  quoteTimestamp: string;
  dataSource: 'multi-source';
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_REST_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

const canAccessSupabaseRest = () => Boolean(SUPABASE_URL && SUPABASE_REST_KEY);

const buildRouteMemoryKey = (
  network: string,
  tokenPair: string,
  buyDex: Opportunity['buyDex'],
  sellDex: Opportunity['sellDex'],
): string => {
  const normalizedNetwork = String(network || 'unknown').toLowerCase();
  const normalizedPair = String(tokenPair || 'unknown').toLowerCase();
  const [dexA, dexB] = [String(buyDex || 'unknown').toLowerCase(), String(sellDex || 'unknown').toLowerCase()]
    .sort((a, b) => a.localeCompare(b));
  return `${normalizedNetwork}|${normalizedPair}|${dexA}|${dexB}`;
};

const loadRouteMemoryByKey = async (): Promise<Map<string, RouteMemoryRecord>> => {
  const map = new Map<string, RouteMemoryRecord>();
  if (!canAccessSupabaseRest()) return map;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/route_memory?select=route_key,avg_realized_net,cooldown_until,failed_executions,successful_executions`,
      {
        headers: {
          apikey: SUPABASE_REST_KEY,
          Authorization: `Bearer ${SUPABASE_REST_KEY}`,
          Accept: 'application/json',
        },
      },
    );

    if (!res.ok) return map;

    const rows = await res.json() as Array<Record<string, unknown>>;
    for (const row of rows || []) {
      const routeKey = String(row.route_key || '').trim().toLowerCase();
      if (!routeKey) continue;
      const avgRealizedNet = Number(row.avg_realized_net ?? 0);
      const failedExecutions = Number(row.failed_executions ?? 0);
      const successfulExecutions = Number(row.successful_executions ?? 0);
      const cooldownUntil = typeof row.cooldown_until === 'string' ? row.cooldown_until : undefined;
      map.set(routeKey, {
        routeKey,
        avgRealizedNet: Number.isFinite(avgRealizedNet) ? avgRealizedNet : 0,
        cooldownUntil,
        failedExecutions: Number.isFinite(failedExecutions) ? failedExecutions : 0,
        successfulExecutions: Number.isFinite(successfulExecutions) ? successfulExecutions : 0,
      });
    }
  } catch {
    // Best-effort enrichment.
  }

  return map;
};

const isDexName = (value: unknown): value is Opportunity['buyDex'] => {
  return value === 'Uniswap V3'
    || value === 'Uniswap V2'
    || value === 'SushiSwap'
    || value === 'Balancer'
    || value === 'Curve';
};

// Normalize fee-tier-labeled V3 dex names (e.g. "Uniswap V3 (500)") back to the canonical
// "Uniswap V3" used in Opportunity, DEX_ROUTERS, dexSwapFeeBps, etc.
const canonicalizeDex = (dex: string): Opportunity['buyDex'] => {
  if (dex.startsWith('Uniswap V3')) return 'Uniswap V3';
  if (isDexName(dex)) return dex;
  console.warn(`[canonicalizeDex] Unknown DEX name: "${dex}" — defaulting to Uniswap V3. Check subgraph data.`);
  return 'Uniswap V3';
};

const loadExecutionFeedbackByRoute = async (): Promise<Map<string, RouteExecutionFeedbackRecord>> => {
  const map = new Map<string, RouteExecutionFeedbackRecord>();
  if (!canAccessSupabaseRest()) return map;

  const limit = Math.max(20, Math.min(500, Math.round(parseNumberEnv(Deno.env.get('SCANNER_EXEC_FEEDBACK_WINDOW_ATTEMPTS'), 200))));

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/execution_attempts?select=included,failure_reason,latency_ms,metadata&order=submitted_at.desc&limit=${limit}`,
      {
        headers: {
          apikey: SUPABASE_REST_KEY,
          Authorization: `Bearer ${SUPABASE_REST_KEY}`,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) return map;

    const rows = await res.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return map;

    for (const row of rows) {
      const metadata = toObjectSafe(row.metadata);
      if (!metadata) continue;

      const network = String(metadata.network || '').trim().toLowerCase();
      const tokenPair = String(metadata.tokenPair || '').trim().toLowerCase();
      const buyDexRaw = metadata.buyDex;
      const sellDexRaw = metadata.sellDex;
      if (!network || !tokenPair || !isDexName(buyDexRaw) || !isDexName(sellDexRaw)) continue;

      const routeKey = buildRouteMemoryKey(network, tokenPair, buyDexRaw, sellDexRaw);
      const existing = map.get(routeKey) || {
        routeKey,
        attempts: 0,
        included: 0,
        failed: 0,
        simulationFailures: 0,
        avgLatencyMs: 0,
        successRate: 0,
        penaltyUsd: 0,
        reliefUsd: 0,
      };

      existing.attempts += 1;
      if (row.included === true) {
        existing.included += 1;
      } else if (row.included === false) {
        existing.failed += 1;
      }

      const failureReason = String(row.failure_reason || '').toLowerCase();
      if (failureReason.includes('simulation')) {
        existing.simulationFailures += 1;
      }

      const latencyMs = toNumberSafe(row.latency_ms, 0);
      if (latencyMs > 0) {
        existing.avgLatencyMs = existing.avgLatencyMs <= 0
          ? latencyMs
          : ((existing.avgLatencyMs * (existing.attempts - 1)) + latencyMs) / existing.attempts;
      }

      map.set(routeKey, existing);
    }

    for (const feedback of map.values()) {
      if (feedback.attempts <= 0) continue;
      feedback.successRate = feedback.included / feedback.attempts;
      const simulationFailRate = feedback.simulationFailures / feedback.attempts;

      // Require evidence before applying strong route-level adaptations.
      if (feedback.attempts >= 3) {
        const failPressure = Math.max(0, 0.62 - feedback.successRate);
        const simPressure = Math.max(0, simulationFailRate - 0.1);
        feedback.penaltyUsd = clampNumber((failPressure * 18) + (simPressure * 10), 0, 10);

        const successEdge = Math.max(0, feedback.successRate - 0.82);
        feedback.reliefUsd = clampNumber(successEdge * 8, 0, 3);
      }
    }
  } catch {
    // Best-effort enrichment.
  }

  return map;
};

const emptyIndexedQuotePoolLoadResult = (enabled = false): IndexedQuotePoolLoadResult => ({
  uniV3Pools: [],
  uniV2Pools: [],
  sushiPools: [],
  balancerPools: [],
  curvePools: [],
  stats: {
    enabled,
    requestedRows: 0,
    acceptedRows: 0,
    hitPairs: 0,
    missPairs: 0,
    stalePairs: 0,
    fallbackFetches: 0,
    upstreamCallsSaved: 0,
    avgIndexedRowAgeMs: 0,
    p90IndexedRowAgeMs: 0,
  },
});

const parseDexName = (value: unknown): Opportunity['buyDex'] | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('uniswap') && normalized.includes('v3')) return 'Uniswap V3';
  if (normalized.includes('uniswap') && normalized.includes('v2')) return 'Uniswap V2';
  if (normalized === 'uniswap' || normalized.startsWith('uniswap-')) return 'Uniswap V3';
  if (normalized.includes('sushi')) return 'SushiSwap';
  if (normalized.includes('balancer')) return 'Balancer';
  if (normalized.includes('curve')) return 'Curve';
  if (normalized === 'uniswap v3') return 'Uniswap V3';
  if (normalized === 'uniswap v2') return 'Uniswap V2';
  if (normalized === 'sushiswap') return 'SushiSwap';
  return null;
};

const toSourceType = (value: unknown): Pool['sourceType'] => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'dexscreener') return 'dexscreener';
  if (normalized === 'gecko') return 'gecko';
  return 'subgraph';
};

const routeIndexedPoolByDex = (
  dex: Opportunity['buyDex'],
  pool: Pool,
  sets: {
    uniV3Pools: Pool[];
    uniV2Pools: Pool[];
    sushiPools: Pool[];
    balancerPools: Pool[];
    curvePools: Pool[];
  },
) => {
  if (dex === 'Uniswap V3') sets.uniV3Pools.push(pool);
  else if (dex === 'Uniswap V2') sets.uniV2Pools.push(pool);
  else if (dex === 'SushiSwap') sets.sushiPools.push(pool);
  else if (dex === 'Balancer') sets.balancerPools.push(pool);
  else if (dex === 'Curve') sets.curvePools.push(pool);
};

const loadIndexedQuotePools = async (networks: string[]): Promise<IndexedQuotePoolLoadResult> => {
  const enabled = parseBooleanEnv(Deno.env.get('SCANNER_ENABLE_INDEX_READ_THROUGH'), true);
  if (!enabled || !canAccessSupabaseRest()) return emptyIndexedQuotePoolLoadResult(enabled);

  const ttlSeconds = Math.max(5, Math.min(300, Math.round(parseNumberEnv(Deno.env.get('SCANNER_INDEX_READ_THROUGH_TTL_SECONDS'), 30))));
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((network) => toNetworkName(CHAIN_MAP[network] || network));

  if (selectedNetworks.length === 0) return emptyIndexedQuotePoolLoadResult(enabled);

  const result = emptyIndexedQuotePoolLoadResult(enabled);

  try {
    const parseLooseNumber = (value: unknown): number => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const normalized = String(value ?? '').replace(/,/g, '').trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const splitPairSymbols = (pairText: string): [string, string] | null => {
      const normalized = String(pairText || '').trim();
      if (!normalized) return null;
      const delimiter = ['/', '-', '_'].find((candidate) => normalized.includes(candidate));
      if (delimiter) {
        const [left, right] = normalized.split(delimiter, 2);
        return [normalizeTokenSymbol(left), normalizeTokenSymbol(right)];
      }
      const byWhitespace = normalized.split(/\s+/).filter(Boolean);
      if (byWhitespace.length >= 2) {
        return [normalizeTokenSymbol(byWhitespace[0]), normalizeTokenSymbol(byWhitespace[1])];
      }
      return null;
    };

    const networkSet = Array.from(new Set(selectedNetworks.map((network) => network.toLowerCase())));
    const networkFilter = `(${networkSet.join(',')})`;
    const sinceIso = new Date(Date.now() - ttlSeconds * 1000).toISOString();

    const url = `${SUPABASE_URL}/rest/v1/quotes_index_latest`
      + `?select=network,token_pair,buy_dex,sell_dex,buy_price,sell_price,buy_liquidity_usd,sell_liquidity_usd,source,indexed_at`
      + `&network=in.${networkFilter}`
      + `&indexed_at=gte.${encodeURIComponent(sinceIso)}`
      + `&limit=1000`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_REST_KEY,
        Authorization: `Bearer ${SUPABASE_REST_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) return result;

    const rows = await response.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) return result;

    result.stats.requestedRows = rows.length;
    const pairHits = new Set<string>();
    const rowAges: number[] = [];

    for (const row of rows) {
      const network = toNetworkName(String(row.network || ''));
      const tokenPairRaw = String(row.token_pair || '').toLowerCase();
      const hasNetworkPrefix = tokenPairRaw.includes(':');
      const [pairNetworkPart, pairSymbolsRaw] = hasNetworkPrefix
        ? tokenPairRaw.split(':', 2)
        : ['', tokenPairRaw];
      const pairSymbols = pairSymbolsRaw || '';
      if (!pairSymbols) continue;
      const parsedPair = splitPairSymbols(pairSymbols);
      if (!parsedPair) continue;
      const [base, quote] = parsedPair;
      if (!base || !quote) continue;

      // Ensure row belongs to requested networks, even if token_pair network prefix drifts.
      if (!networkSet.includes(String(network).toLowerCase()) && !networkSet.includes(String(pairNetworkPart || '').toLowerCase())) {
        continue;
      }

      const buyDex = parseDexName(row.buy_dex);
      const sellDex = parseDexName(row.sell_dex);
      const buyPrice = parseLooseNumber(row.buy_price);
      const sellPrice = parseLooseNumber(row.sell_price);
      const buyLiquidityUsd = parseLooseNumber(row.buy_liquidity_usd);
      const sellLiquidityUsd = parseLooseNumber(row.sell_liquidity_usd);
      if (!buyDex || !sellDex || !Number.isFinite(buyPrice) || !Number.isFinite(sellPrice) || buyPrice <= 0 || sellPrice <= 0) {
        continue;
      }

      const indexedAt = Date.parse(String(row.indexed_at || ''));
      if (Number.isFinite(indexedAt)) {
        const ageMs = Math.max(0, Date.now() - indexedAt);
        rowAges.push(ageMs);
      }

      const sourceType = toSourceType(row.source);
      const buyPool: Pool = {
        token0: { symbol: base },
        token1: { symbol: quote },
        token0Price: String(1 / buyPrice),
        token1Price: String(buyPrice),
        reserveUSD: String(Math.max(0, buyLiquidityUsd)),
        network,
        poolAddress: `indexed:${network}:${base}/${quote}:${buyDex}:buy`,
        dex: buyDex,
        sourceType,
      };
      const sellPool: Pool = {
        token0: { symbol: base },
        token1: { symbol: quote },
        token0Price: String(1 / sellPrice),
        token1Price: String(sellPrice),
        reserveUSD: String(Math.max(0, sellLiquidityUsd)),
        network,
        poolAddress: `indexed:${network}:${base}/${quote}:${sellDex}:sell`,
        dex: sellDex,
        sourceType,
      };

      routeIndexedPoolByDex(buyDex, buyPool, result);
      routeIndexedPoolByDex(sellDex, sellPool, result);

      result.stats.acceptedRows += 1;
      pairHits.add(`${network}:${base}/${quote}`.toLowerCase());
    }

    result.stats.hitPairs = pairHits.size;
    result.stats.upstreamCallsSaved = pairHits.size;

    if (rowAges.length > 0) {
      rowAges.sort((a, b) => a - b);
      const totalAges = rowAges.reduce((sum, age) => sum + age, 0);
      result.stats.avgIndexedRowAgeMs = Math.round(totalAges / rowAges.length);
      result.stats.p90IndexedRowAgeMs = rowAges[Math.min(rowAges.length - 1, Math.floor(rowAges.length * 0.9))];
    }
  } catch {
    // Best-effort enrichment, never fail scanner.
  }

  return result;
};

const persistTelemetryRows = async (table: string, rows: Record<string, unknown>[]) => {
  if (!canAccessSupabaseRest() || rows.length === 0) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_REST_KEY,
        Authorization: `Bearer ${SUPABASE_REST_KEY}`,
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

const summarizeRejections = (diagnostics: ScanDiagnostics) => {
  const counts = new Map<string, number>();
  for (const sample of diagnostics.rejectionSamples) {
    counts.set(sample.reason, (counts.get(sample.reason) || 0) + 1);
  }

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const topRejectionReason = ranked.length > 0 ? ranked[0][0] : '';

  const topRejectedPairs = diagnostics.rejectionSamples.map((sample) => ({
    pair: sample.tokenPair,
    reason: sample.reason,
    buyDex: sample.buyDex,
    sellDex: sample.sellDex,
    spread: sample.spread,
    buyLiquidityUsd: sample.buyLiquidityUsd,
    sellLiquidityUsd: sample.sellLiquidityUsd,
    attemptedLoanAmount: sample.attemptedLoanAmount,
    buyImpactBps: sample.buyImpactBps,
    sellImpactBps: sample.sellImpactBps,
  }));

  return {
    topRejectionReason,
    topRejectedPairs,
  };
};

const parseNumberEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseNumberInput = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBooleanInput = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

const parseSourcePolicyMode = (value: unknown): SourcePolicyMode | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'neutral') return 'neutral';
  if (normalized === 'prefer_subgraph' || normalized === 'prefer-subgraph') return 'prefer_subgraph';
  if (normalized === 'prefer_external_raw' || normalized === 'prefer-external-raw') return 'prefer_external_raw';
  return undefined;
};

const extractEvmAddress = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const exact = raw.match(/^(0x[a-fA-F0-9]{40})$/);
  if (exact) return exact[1];
  const embedded = raw.match(/(0x[a-fA-F0-9]{40})/);
  return embedded ? embedded[1] : undefined;
};

const FP_SCALE = 10n ** 18n;
const USD_SCALE = 10n ** 6n;

const expandScientificNotation = (rawValue: string): string => {
  const match = rawValue.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) return rawValue;

  const sign = match[1] || '';
  const integerPart = match[2] || '0';
  const fractionalPart = match[3] || '';
  const exponent = Number(match[4] || '0');
  if (!Number.isFinite(exponent)) return rawValue;

  if (exponent >= 0) {
    if (exponent >= fractionalPart.length) {
      const zeros = '0'.repeat(exponent - fractionalPart.length);
      return `${sign}${integerPart}${fractionalPart}${zeros}`;
    }
    const whole = `${integerPart}${fractionalPart.slice(0, exponent)}`;
    const frac = fractionalPart.slice(exponent);
    return `${sign}${whole}.${frac}`;
  }

  const shift = Math.abs(exponent);
  if (shift >= integerPart.length) {
    const zeros = '0'.repeat(shift - integerPart.length);
    return `${sign}0.${zeros}${integerPart}${fractionalPart}`;
  }

  const split = integerPart.length - shift;
  const whole = integerPart.slice(0, split);
  const frac = `${integerPart.slice(split)}${fractionalPart}`;
  return `${sign}${whole}.${frac}`;
};

const decimalToFixed = (value: number | string, scale: bigint): bigint => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0n;
  const expandedRaw = raw.includes('e') || raw.includes('E')
    ? expandScientificNotation(raw)
    : raw;
  const sign = expandedRaw.startsWith('-') ? -1n : 1n;
  const normalized = expandedRaw.replace(/^[+-]/, '');
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

const dexSwapFeeBps: Record<Opportunity['buyDex'], number> = {
  'Uniswap V3': Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_SWAP_FEE_BPS_UNIV3'), 30))),
  'Uniswap V2': Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_SWAP_FEE_BPS_UNIV2'), 30))),
  'SushiSwap': Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_SWAP_FEE_BPS_SUSHI'), 30))),
  'Balancer': Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_SWAP_FEE_BPS_BALANCER'), 10))),
  'Curve': Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_SWAP_FEE_BPS_CURVE'), 4))),
};

const applySwapFee = (amount: number, feeBps: number): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const clampedFee = clampNumber(feeBps, 0, 9_500);
  return amount * ((10_000 - clampedFee) / 10_000);
};

const simulateVirtualCpmmRoundTrip = (
  buyPrice: number,
  sellPrice: number,
  buyLiquidityUsd: number,
  sellLiquidityUsd: number,
  loanAmountUsd: number,
  buyFeeBps: number,
  sellFeeBps: number,
): {
  grossProfitUsd: number;
  buyImpactBps: number;
  sellImpactBps: number;
} | null => {
  if (
    !Number.isFinite(buyPrice) || buyPrice <= 0 ||
    !Number.isFinite(sellPrice) || sellPrice <= 0 ||
    !Number.isFinite(buyLiquidityUsd) || buyLiquidityUsd <= 0 ||
    !Number.isFinite(sellLiquidityUsd) || sellLiquidityUsd <= 0 ||
    !Number.isFinite(loanAmountUsd) || loanAmountUsd <= 0
  ) {
    return null;
  }

  // Build virtual reserves from pool TVL and mid price (quote/base).
  const buyQuoteReserveUsd = buyLiquidityUsd * 0.5;
  const buyBaseReserve = buyQuoteReserveUsd / buyPrice;
  const sellQuoteReserveUsd = sellLiquidityUsd * 0.5;
  const sellBaseReserve = sellQuoteReserveUsd / sellPrice;
  if (buyQuoteReserveUsd <= 0 || buyBaseReserve <= 0 || sellQuoteReserveUsd <= 0 || sellBaseReserve <= 0) {
    return null;
  }

  const buyInputAfterFee = applySwapFee(loanAmountUsd, buyFeeBps);
  if (buyInputAfterFee <= 0) return null;

  // Swap quote -> base on buy pool.
  const baseOut = (buyBaseReserve * buyInputAfterFee) / (buyQuoteReserveUsd + buyInputAfterFee);
  if (!Number.isFinite(baseOut) || baseOut <= 0) return null;

  const buyExecPrice = loanAmountUsd / baseOut;
  const buyImpact = ((buyExecPrice / buyPrice) - 1) * 10_000;
  const buyImpactBps = clampNumber(Number.isFinite(buyImpact) ? buyImpact : 10_000, 0, 10_000);

  // Swap base -> quote on sell pool.
  const sellInputAfterFee = applySwapFee(baseOut, sellFeeBps);
  if (sellInputAfterFee <= 0) return null;
  const quoteOut = (sellQuoteReserveUsd * sellInputAfterFee) / (sellBaseReserve + sellInputAfterFee);
  if (!Number.isFinite(quoteOut) || quoteOut <= 0) return null;

  const sellExecPrice = quoteOut / baseOut;
  const sellImpact = ((sellPrice - sellExecPrice) / sellPrice) * 10_000;
  const sellImpactBps = clampNumber(Number.isFinite(sellImpact) ? sellImpact : 10_000, 0, 10_000);

  return {
    grossProfitUsd: quoteOut - loanAmountUsd,
    buyImpactBps,
    sellImpactBps,
  };
};

const dexPenaltyBps: Record<Opportunity['buyDex'], number> = {
  'Uniswap V3': Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_ROUTE_PENALTY_BPS_UNIV3'), 2))),
  'Uniswap V2': Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_ROUTE_PENALTY_BPS_UNIV2'), 4))),
  'SushiSwap': Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_ROUTE_PENALTY_BPS_SUSHI'), 4))),
  'Balancer': Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_ROUTE_PENALTY_BPS_BALANCER'), 2))),
  'Curve': Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_ROUTE_PENALTY_BPS_CURVE'), 1))),
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
  const detailed = evaluateSingleVolumeDetailed(
    buyPrice,
    sellPrice,
    buyLiquidityUsd,
    sellLiquidityUsd,
    buyDex,
    sellDex,
    network,
    config,
    executableLoanAmount,
  );
  return detailed.candidate;
};

const evaluateSingleVolumeDetailed = (
  buyPrice: number,
  sellPrice: number,
  buyLiquidityUsd: number,
  sellLiquidityUsd: number,
  buyDex: Opportunity['buyDex'],
  sellDex: Opportunity['sellDex'],
  network: NetworkName,
  config: ScannerConfig,
  executableLoanAmount: number,
): { candidate: ExecutionCandidate | null; reason: NoExecutableReason | null } => {
  if (!Number.isFinite(executableLoanAmount) || executableLoanAmount <= 0) {
    return { candidate: null, reason: 'invalidLoanOrScale' };
  }

  const buyPriceFixed = decimalToFixed(buyPrice, FP_SCALE);
  const sellPriceFixed = decimalToFixed(sellPrice, FP_SCALE);
  const loanFixed = decimalToFixed(executableLoanAmount, USD_SCALE);
  // Use the per-network loan cap as the baseline for gas scaling (not the global loanAmountUsd).
  // This prevents inflated gas multipliers when L2 loans are capped to $500-$1000.
  const networkLoanBaseline = config.perNetworkLoanAmountUsd?.[network] ?? config.loanAmountUsd;
  const configLoanFixed = decimalToFixed(networkLoanBaseline, USD_SCALE);
  if (buyPriceFixed <= 0n || sellPriceFixed <= 0n || loanFixed <= 0n || configLoanFixed <= 0n) {
    return { candidate: null, reason: 'invalidLoanOrScale' };
  }

  const buyFeeBps = dexSwapFeeBps[buyDex];
  const sellFeeBps = dexSwapFeeBps[sellDex];
  const cpmmRoundTrip = simulateVirtualCpmmRoundTrip(
    buyPrice,
    sellPrice,
    buyLiquidityUsd,
    sellLiquidityUsd,
    executableLoanAmount,
    buyFeeBps,
    sellFeeBps,
  );
  if (!cpmmRoundTrip) {
    return { candidate: null, reason: 'invalidLoanOrScale' };
  }

  const buyImpactBps = Math.round(cpmmRoundTrip.buyImpactBps);
  const sellImpactBps = Math.round(cpmmRoundTrip.sellImpactBps);
  const routePenaltyBps = dexPenaltyBps[buyDex] + dexPenaltyBps[sellDex];
  const estimatedSlippageBps = buyImpactBps + sellImpactBps + routePenaltyBps;

  if (buyImpactBps > config.maxSlippageBps || sellImpactBps > config.maxSlippageBps) {
    return { candidate: null, reason: 'slippageExceeded' };
  }

  const quotedBuyPrice = mulDiv(buyPriceFixed, BigInt(10_000 + buyImpactBps), 10_000n);
  const quotedSellPrice = mulDiv(sellPriceFixed, BigInt(10_000 - sellImpactBps), 10_000n);
  if (quotedBuyPrice <= 0n || quotedSellPrice <= 0n || quotedSellPrice <= quotedBuyPrice) {
    return { candidate: null, reason: 'noCrossAfterSlippage' };
  }

  const quotedSpreadFixed = mulDiv(quotedSellPrice - quotedBuyPrice, FP_SCALE, quotedBuyPrice);
  const maxSpreadFixed = decimalToFixed(MAX_REASONABLE_SPREAD_FRACTION, FP_SCALE);
  if (quotedSpreadFixed <= 0n || quotedSpreadFixed > maxSpreadFixed) {
    return { candidate: null, reason: 'unreasonableSpread' };
  }

  const grossProfitFixed = decimalToFixed(cpmmRoundTrip.grossProfitUsd, USD_SCALE);
  if (grossProfitFixed <= 0n) {
    return { candidate: null, reason: 'noCrossAfterSlippage' };
  }
  const routePenaltyCostFixed = mulDiv(loanFixed, BigInt(routePenaltyBps), 10_000n);

  // Gas cost scales inversely with trade-size ratio via deterministic sqrt(configLoan / loan)
  const loanRatioScaled = mulDiv(configLoanFixed, FP_SCALE, loanFixed);
  const gasMultiplierScaled = sqrtBigInt(loanRatioScaled * FP_SCALE);
  const baseGasFixed = decimalToFixed(estimateGasUsdForNetwork(network, config), USD_SCALE);
  const gasCostFixed = mulDiv(baseGasFixed, gasMultiplierScaled, FP_SCALE);

  const netProfitFixed = grossProfitFixed - routePenaltyCostFixed - gasCostFixed;
  const maxReasonableProfitFixed = mulDiv(loanFixed, decimalToFixed(MAX_REASONABLE_ROI_FRACTION, FP_SCALE), FP_SCALE);
  if (grossProfitFixed > maxReasonableProfitFixed || netProfitFixed > maxReasonableProfitFixed) {
    return { candidate: null, reason: 'unrealisticRoi' };
  }

  // Hard profitability gate: never allow candidates where gas dominates or net is non-positive.
  if (grossProfitFixed <= gasCostFixed || netProfitFixed <= 0n) {
    return { candidate: null, reason: 'gasDominatesOrNonPositive' };
  }

  const grossProfit = fixedToNumber(grossProfitFixed, USD_SCALE, 6);
  const gasCost = fixedToNumber(gasCostFixed, USD_SCALE, 6);
  const netProfit = fixedToNumber(netProfitFixed, USD_SCALE, 6);

  return {
    candidate: {
      executableLoanAmount,
      grossProfit,
      netProfit,
      gasCost,
      estimatedSlippageBps,
      buyImpactBps,
      sellImpactBps,
      routePenaltyBps,
    },
    reason: null,
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
): ExecutionEvaluationResult => {
  const noExecutableReasons = createNoExecutableReasonCounts();
  const buyLiquidityUsd = parsePoolLiquidity(buyPool);
  const sellLiquidityUsd = parsePoolLiquidity(sellPool);
  const executableLiquidityUsd = Math.min(buyLiquidityUsd, sellLiquidityUsd);
  if (executableLiquidityUsd <= 0) {
    noExecutableReasons.noLiquidity += 1;
    return { candidate: null, noExecutableReasons };
  }

  // Pre-check: verify prices cross (sellPrice > buyPrice) before volume search
  // Inspired by Flashbots simple-arbitrage crossed market detection
  if (sellPrice <= buyPrice) {
    noExecutableReasons.noRawCross += 1;
    return { candidate: null, noExecutableReasons };
  }

  let best: ExecutionCandidate | null = null;
  let prevCandidate: ExecutionCandidate | null = null;
  let prevVolume = 0;

  const networkLoanUsd = config.perNetworkLoanAmountUsd?.[network] ?? config.loanAmountUsd;
  for (const step of SIZE_STEPS) {
    const requestedLoanAmount = networkLoanUsd * step;
    const executableLoanAmount = Math.min(requestedLoanAmount, executableLiquidityUsd * config.maxLiquidityUsageFraction);

    const detailed = evaluateSingleVolumeDetailed(
      buyPrice, sellPrice, buyLiquidityUsd, sellLiquidityUsd,
      buyDex, sellDex, network, config, executableLoanAmount
    );
    const candidate = detailed.candidate;

    if (!candidate) {
      if (detailed.reason) {
        noExecutableReasons[detailed.reason] += 1;
      }
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

  return {
    candidate: best,
    noExecutableReasons: best ? undefined : noExecutableReasons,
  };
};

const buildCycleShadowDiagnostics = (
  quoteMaps: Array<{
    dex: Opportunity['buyDex'];
    map: Map<string, { price: number; pool: Pool }>;
  }>,
): ScanDiagnostics['cycleShadow'] => {
  type Edge = {
    to: string;
    rate: number;
    liquidityUsd: number;
    sourceDex: Opportunity['buyDex'];
    sourceType: 'subgraph' | 'dexscreener' | 'gecko';
  };

  const adjacency = new Map<string, Edge[]>();
  const tokenDegree = new Map<string, number>();
  const tokenLiquidity = new Map<string, number>();

  const pushEdge = (from: string, edge: Edge) => {
    if (!Number.isFinite(edge.rate) || edge.rate <= 0) return;
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push(edge);
    tokenDegree.set(from, (tokenDegree.get(from) || 0) + 1);
    tokenLiquidity.set(from, Math.max(tokenLiquidity.get(from) || 0, edge.liquidityUsd));
  };

  const seenPairs = new Set<string>();
  for (const { dex, map } of quoteMaps) {
    for (const [pairKey, quote] of map.entries()) {
      const [networkPart, symbols] = pairKey.split(':');
      if (!networkPart || !symbols) continue;
      const [base, quoteSymbol] = symbols.split('/').map((s) => normalizeTokenSymbol(s));
      if (!base || !quoteSymbol || base === quoteSymbol) continue;

      const price = Number(quote.price);
      if (!Number.isFinite(price) || price <= 0) continue;

      const liq = parsePoolLiquidity(quote.pool);
      if (!Number.isFinite(liq) || liq <= 0) continue;

      const sourceType = quote.pool.sourceType || 'subgraph';
      const net = toNetworkName(networkPart);
      const fromBase = `${net}:${base}`;
      const fromQuote = `${net}:${quoteSymbol}`;
      const pairId = `${net}:${base}/${quoteSymbol}:${dex}`;
      if (seenPairs.has(pairId)) continue;
      seenPairs.add(pairId);

      pushEdge(fromBase, {
        to: fromQuote,
        rate: price,
        liquidityUsd: liq,
        sourceDex: dex,
        sourceType,
      });
      pushEdge(fromQuote, {
        to: fromBase,
        rate: 1 / price,
        liquidityUsd: liq,
        sourceDex: dex,
        sourceType,
      });
    }
  }

  const tokensByNetwork = new Map<NetworkName, string[]>();
  for (const token of adjacency.keys()) {
    const [networkPart] = token.split(':');
    const network = toNetworkName(networkPart);
    if (!tokensByNetwork.has(network)) tokensByNetwork.set(network, []);
    tokensByNetwork.get(network)!.push(token);
  }

  const topCycles: NonNullable<ScanDiagnostics['cycleShadow']>['topCycles'] = [];
  let testedTriangles = 0;
  let candidatePaths = 0;

  for (const [network, tokens] of tokensByNetwork.entries()) {
    const ranked = [...tokens]
      .sort((a, b) => {
        const degreeDiff = (tokenDegree.get(b) || 0) - (tokenDegree.get(a) || 0);
        if (degreeDiff !== 0) return degreeDiff;
        return (tokenLiquidity.get(b) || 0) - (tokenLiquidity.get(a) || 0);
      })
      .slice(0, 28);

    for (const start of ranked) {
      const level1 = (adjacency.get(start) || [])
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .slice(0, 10);
      for (const e1 of level1) {
        if (e1.to === start) continue;
        const level2 = (adjacency.get(e1.to) || [])
          .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
          .slice(0, 10);
        for (const e2 of level2) {
          if (e2.to === start || e2.to === e1.to) continue;
          const level3 = adjacency.get(e2.to) || [];
          const backEdge = level3.find((e3) => e3.to === start);
          testedTriangles += 1;
          if (!backEdge) continue;
          const grossReturn = e1.rate * e2.rate * backEdge.rate;
          if (!Number.isFinite(grossReturn) || grossReturn <= 1) continue;
          candidatePaths += 1;

          const grossReturnBps = (grossReturn - 1) * 10_000;
          const minLiquidityUsd = Math.min(e1.liquidityUsd, e2.liquidityUsd, backEdge.liquidityUsd);
          const path = `${start.split(':')[1]}->${e1.to.split(':')[1]}->${e2.to.split(':')[1]}->${start.split(':')[1]}`;
          const sources = [e1.sourceDex, e2.sourceDex, backEdge.sourceDex].map((s) => String(s));

          if (grossReturnBps < 1) continue;
          topCycles.push({
            network,
            path,
            grossReturnBps,
            minLiquidityUsd,
            sources,
          });
        }
      }
    }
  }

  return {
    enabled: true,
    networksAnalyzed: tokensByNetwork.size,
    testedTriangles,
    candidatePaths,
    topCycles: topCycles
      .sort((a, b) => {
        if (b.grossReturnBps !== a.grossReturnBps) return b.grossReturnBps - a.grossReturnBps;
        return b.minLiquidityUsd - a.minLiquidityUsd;
      })
      .slice(0, 12)
      .map((c) => ({
        ...c,
        grossReturnBps: Number(c.grossReturnBps.toFixed(2)),
        minLiquidityUsd: Number(c.minLiquidityUsd.toFixed(0)),
      })),
  };
};

const buildCycleShadowWatchlist = (
  cycleShadow: NonNullable<ScanDiagnostics['cycleShadow']> | undefined,
  config: ScannerConfig,
): Opportunity[] => {
  if (!cycleShadow?.enabled || !Array.isArray(cycleShadow.topCycles) || cycleShadow.topCycles.length === 0) {
    return [];
  }

  const scoredCycles = cycleShadow.topCycles
    .map((cycle) => {
      const liquidityScore = Math.min(30, Math.log10(Math.max(1, cycle.minLiquidityUsd)) * 10);
      const grossReturnScore = Math.min(70, cycle.grossReturnBps * 2.5);
      const qualityScore = grossReturnScore + liquidityScore;
      return { cycle, qualityScore };
    })
    .filter(({ cycle, qualityScore }) => cycle.grossReturnBps >= 4 && cycle.minLiquidityUsd >= Math.max(50_000, config.minLiquidityUsd * 0.25) && qualityScore >= 42)
    .sort((left, right) => {
      if (right.qualityScore !== left.qualityScore) return right.qualityScore - left.qualityScore;
      if (right.cycle.grossReturnBps !== left.cycle.grossReturnBps) return right.cycle.grossReturnBps - left.cycle.grossReturnBps;
      return right.cycle.minLiquidityUsd - left.cycle.minLiquidityUsd;
    })
    .slice(0, 2);

  return scoredCycles.map(({ cycle }, index) => {
    const routeDexes = cycle.sources.filter((source): source is Opportunity['buyDex'] => (
      source === 'Uniswap V3'
      || source === 'Uniswap V2'
      || source === 'SushiSwap'
      || source === 'Balancer'
      || source === 'Curve'
    ));
    const primaryDex = routeDexes[0] ?? 'Uniswap V3';
    const terminalDex = routeDexes[routeDexes.length - 1] ?? primaryDex;
    const grossReturnFraction = Math.max(0, cycle.grossReturnBps / 10_000);
    const cappedShadowGross = Math.min(config.loanAmountUsd * grossReturnFraction, config.minNetProfitUsd * 0.5);
    const grossProfit = Number.isFinite(cappedShadowGross) ? cappedShadowGross : 0;
    const syntheticGasCost = Math.max(config.estimatedGasUsd, config.minNetProfitUsd);

    return {
      tokenPair: `CYCLE ${cycle.path}`,
      buyDex: primaryDex,
      sellDex: terminalDex,
      network: cycle.network,
      loanAmount: Math.max(500, Math.min(config.loanAmountUsd * 0.35, cycle.minLiquidityUsd * 0.08)),
      executableLoanAmount: 0,
      grossProfit,
      netProfit: -Math.max(config.minNetProfitUsd, syntheticGasCost),
      distanceToExecutableUsd: Math.max(config.minNetProfitUsd * 2, 25 + (index * 5)),
      gasCost: syntheticGasCost,
      confidenceScore: Math.min(55, Math.max(18, Math.round(cycle.grossReturnBps / 3))),
      confidenceTier: 'low',
      spread: (cycle.grossReturnBps / 100).toFixed(3),
      liquidity: cycle.minLiquidityUsd.toFixed(0),
      estimatedSlippageBps: 0,
      buyImpactBps: 0,
      sellImpactBps: 0,
      routePenaltyBps: Math.max(0, Math.round(100 - Math.min(100, cycle.grossReturnBps + (cycle.minLiquidityUsd / 100000)))),
      status: 'watchlist',
      quoteSources: ['subgraph'],
      mathDiagnostics: {
        reservesUsd: { buy: cycle.minLiquidityUsd, sell: cycle.minLiquidityUsd },
        expectedOutputUsd: 0,
        actualOutputUsd: 0,
        expectedGrossProfitUsd: grossProfit,
        actualGrossProfitUsd: 0,
        slippageFraction: 0,
        liquidityUsageFraction: 0,
        gasEstimateUsd: syntheticGasCost,
        passReason: `cycle shadow ${cycle.path} via ${cycle.sources.join(' -> ')} (quality ${Math.round(cycle.grossReturnBps + Math.min(30, Math.log10(Math.max(1, cycle.minLiquidityUsd)) * 10))})`,
      },
    };
  });
};

const buildScannerConfig = (body: Record<string, unknown>): ScannerConfig => {
  const envLoanAmountUsd = parseNumberEnv(Deno.env.get('SCANNER_LOAN_AMOUNT_USD'), 50_000);
  const bodyLoanAmountUsd = parseNumberInput(body.loanAmountUsd);
  // Per-network loan caps: L2 pools are much thinner than ETH mainnet.
  // At $8k loan, a $124k TVL Arbitrum pool has 6.5% impact >> 3% cap.
  // Default: ETH=$8k, ARB=$1k, Base=$500 (tuned for ~3% impact on $20k-$33k TVL pools)
  const bodyPerNetworkLoan = (body.perNetworkLoanAmountUsd && typeof body.perNetworkLoanAmountUsd === 'object')
    ? body.perNetworkLoanAmountUsd as Partial<Record<NetworkName, number>>
    : {};
  const bodyMinSpreadPercent = parseNumberInput(body.minSpreadPercent);
  const bodyMinLiquidityUsd = parseNumberInput(body.minLiquidityUsd);
  const bodyMinNetProfitUsd = parseNumberInput(body.minNetProfitUsd);
  const bodyAdaptiveProfitPressureMultiplier = parseNumberInput(body.adaptiveProfitPressureMultiplier);
  const bodyAdaptiveProfitReliefMultiplier = parseNumberInput(body.adaptiveProfitReliefMultiplier);
  const bodyAdaptiveMinNetFloorPercent = parseNumberInput(body.adaptiveMinNetFloorPercent);
  const bodyAdaptiveMinNetFloorFraction = parseNumberInput(body.adaptiveMinNetFloorFraction);
  const bodyMaxSlippageBps = parseNumberInput(body.maxSlippageBps)
    ?? (body.maxSlippagePercent != null
      ? Math.round((parseNumberInput(body.maxSlippagePercent) ?? 0) * 100)
      : undefined);
  const bodyMaxLiquidityUsagePercent = parseNumberInput(body.maxLiquidityUsagePercent);
  const bodyMaxLiquidityUsageFraction = parseNumberInput(body.maxLiquidityUsageFraction);
  const bodyMaxResults = parseNumberInput(body.maxResults);
  const bodyEstimatedGasUsd = parseNumberInput(body.estimatedGasUsd);
  const bodyGasUnits = parseNumberInput(body.gasUnits);
  const bodyGasSafetyMultiplier = parseNumberInput(body.gasSafetyMultiplier);
  const bodyEnableDexScreenerFallback = parseBooleanInput(
    body.enableDexScreener ?? body.enableDexScreenerFallback,
  );
  const bodyEnableGeckoFallback = parseBooleanInput(
    body.enableGecko ?? body.enableGeckoFallback,
  );
  const bodyEnableCycleShadow = parseBooleanInput(body.enableCycleShadow);
  const bodySourcePolicyMode = parseSourcePolicyMode(
    body.sourcePolicyMode ?? body.sourcePriorityMode,
  );
  const bodyUseExternalRawFeed = parseBooleanInput(
    body.useExternalRawFeed ?? body.externalRawDataEnabled,
  );

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

  const envMinNetEdgeBpsRaw = Deno.env.get('SCANNER_MIN_NET_EDGE_BPS_BY_NETWORK');
  let envMinNetEdgeBpsByNetwork: Partial<Record<NetworkName, number>> = {};
  if (envMinNetEdgeBpsRaw) {
    try {
      envMinNetEdgeBpsByNetwork = parseNetworkNumberMap(JSON.parse(envMinNetEdgeBpsRaw));
    } catch {
      envMinNetEdgeBpsByNetwork = {};
    }
  }
  const bodyMinNetEdgeBpsByNetwork = parseNetworkNumberMap((body.minNetEdgeBpsByNetwork ?? body.netEdgeBpsByNetwork) as unknown);

  const envExecutionRiskBufferRaw = Deno.env.get('SCANNER_EXECUTION_RISK_BUFFER_USD_BY_NETWORK');
  let envExecutionRiskBufferByNetwork: Partial<Record<NetworkName, number>> = {};
  if (envExecutionRiskBufferRaw) {
    try {
      envExecutionRiskBufferByNetwork = parseNetworkNumberMap(JSON.parse(envExecutionRiskBufferRaw));
    } catch {
      envExecutionRiskBufferByNetwork = {};
    }
  }
  const bodyExecutionRiskBufferByNetwork = parseNetworkNumberMap((body.executionRiskBufferUsdByNetwork ?? body.executionBufferUsdByNetwork) as unknown);

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

  const envAdaptiveMinNetFloorPercent = parseNumberEnv(
    Deno.env.get('SCANNER_MIN_NET_PROFIT_FLOOR_PERCENT'),
    60,
  );
  const normalizedAdaptiveMinNetFloorPercent = bodyAdaptiveMinNetFloorPercent
    ?? (Number.isFinite(bodyAdaptiveMinNetFloorFraction)
      ? (bodyAdaptiveMinNetFloorFraction as number) * 100
      : envAdaptiveMinNetFloorPercent);
  const adaptiveMinNetFloorFraction = Math.max(
    0,
    Math.min(1, normalizedAdaptiveMinNetFloorPercent / 100),
  );

  return {
    minSpreadPercent: bodyMinSpreadPercent ?? parseNumberEnv(Deno.env.get('SCANNER_MIN_SPREAD_PERCENT'), 0.075),
    minLiquidityUsd: bodyMinLiquidityUsd ?? parseNumberEnv(Deno.env.get('SCANNER_MIN_LIQUIDITY_USD'), 50_000),
    minNetProfitUsd: bodyMinNetProfitUsd ?? parseNumberEnv(Deno.env.get('SCANNER_MIN_NET_PROFIT_USD'), 10),
    minNetProfitUsdByNetwork: {
      ...envByNetwork,
      ...bodyByNetwork,
    },
    minNetEdgeBpsByNetwork: {
      ...DEFAULT_MIN_NET_EDGE_BPS_BY_NETWORK,
      ...envMinNetEdgeBpsByNetwork,
      ...bodyMinNetEdgeBpsByNetwork,
    },
    executionRiskBufferUsdByNetwork: {
      ...DEFAULT_EXECUTION_RISK_BUFFER_USD_BY_NETWORK,
      ...envExecutionRiskBufferByNetwork,
      ...bodyExecutionRiskBufferByNetwork,
    },
    adaptiveProfitPressureMultiplier: bodyAdaptiveProfitPressureMultiplier ?? parseNumberEnv(Deno.env.get('SCANNER_NET_PROFIT_GAS_MULTIPLIER'), 0.35),
    adaptiveProfitReliefMultiplier: bodyAdaptiveProfitReliefMultiplier ?? parseNumberEnv(Deno.env.get('SCANNER_NET_PROFIT_GAS_RELIEF_MULTIPLIER'), 0.25),
    adaptiveMinNetFloorFraction,
    maxSlippageBps: bodyMaxSlippageBps ?? parseNumberEnv(Deno.env.get('SCANNER_MAX_SLIPPAGE_BPS'), 300),
    maxLiquidityUsageFraction,
    maxResults: Math.max(1, Math.min(50, bodyMaxResults ?? parseNumberEnv(Deno.env.get('SCANNER_MAX_RESULTS'), 25))),
    loanAmountUsd: bodyLoanAmountUsd ?? envLoanAmountUsd,
    perNetworkLoanAmountUsd: {
      ethereum: bodyLoanAmountUsd ?? envLoanAmountUsd,
      arbitrum: bodyPerNetworkLoan.arbitrum ?? 1000,
      base: bodyPerNetworkLoan.base ?? 500,
      polygon: bodyPerNetworkLoan.polygon ?? 2000,
      bsc: bodyPerNetworkLoan.bsc ?? 2000,
      ...bodyPerNetworkLoan,
    },
    estimatedGasUsd: bodyEstimatedGasUsd ?? parseNumberEnv(Deno.env.get('SCANNER_ESTIMATED_GAS_USD'), 45),
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
    enableDexScreenerFallback: bodyEnableDexScreenerFallback
      ?? parseBooleanEnv(Deno.env.get('SCANNER_ENABLE_DEXSCREENER'), true),
    enableGeckoFallback: bodyEnableGeckoFallback
      ?? parseBooleanEnv(Deno.env.get('SCANNER_ENABLE_GECKO'), true),
    enableCycleShadow: bodyEnableCycleShadow
      ?? parseBooleanEnv(Deno.env.get('SCANNER_ENABLE_CYCLE_SHADOW'), true),
    sourcePolicyMode: bodySourcePolicyMode
      ?? parseSourcePolicyMode(Deno.env.get('SCANNER_SOURCE_POLICY_MODE'))
      ?? 'neutral',
    useExternalRawFeed: bodyUseExternalRawFeed
      ?? parseBooleanEnv(Deno.env.get('SCANNER_USE_EXTERNAL_RAW_FEED'), false),
  };
};

const fetchSubgraph = async (url: string, query: string) => {
  const timeoutMs = Math.max(
    2500,
    parseNumberEnv(Deno.env.get('SCANNER_SUBGRAPH_TIMEOUT_MS'), 12_000),
  );
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort('subgraph-timeout'), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Subgraph error ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Subgraph timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timerId);
  }
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

const parseCsvEnvSet = (value: string | undefined): Set<string> => {
  const raw = (value || '').trim();
  if (!raw) return new Set<string>();
  const values = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return new Set(values);
};

const DEX_ALIAS_TO_BUCKET: Record<string, 'uniV3' | 'uniV2' | 'sushi' | 'balancer' | 'curve'> = {
  uniswapv3: 'uniV3',
  uniswap_v3: 'uniV3',
  univ3: 'uniV3',
  uniswapv2: 'uniV2',
  uniswap_v2: 'uniV2',
  univ2: 'uniV2',
  sushiswap: 'sushi',
  sushi: 'sushi',
  balancer: 'balancer',
  curve: 'curve',
};

const resolveDisabledDexBuckets = (entries: Iterable<string>): Set<'uniV3' | 'uniV2' | 'sushi' | 'balancer' | 'curve'> => {
  const disabled = new Set<'uniV3' | 'uniV2' | 'sushi' | 'balancer' | 'curve'>();
  for (const entry of entries) {
    const normalized = entry.replace(/[^a-z0-9_]/g, '');
    const bucket = DEX_ALIAS_TO_BUCKET[normalized];
    if (bucket) disabled.add(bucket);
  }
  return disabled;
};

const evaluateScannerReadinessGates = async () => {
  const hasGraphKey = Boolean(Deno.env.get('THEGRAPH_API_KEY'));
  const graphConnectivity = await Promise.all([
    testSubgraphConnectivity('uniswapV3', UNI_V3_SUBGRAPH, UNI_V3_SUBGRAPH_PUBLIC),
    testSubgraphConnectivity('uniswapV2', UNI_V2_SUBGRAPH, UNI_V2_SUBGRAPH_PUBLIC),
    testSubgraphConnectivity('sushiswap', SUSHI_SUBGRAPH, SUSHI_SUBGRAPH_PUBLIC),
    testSubgraphConnectivity('balancer', BALANCER_SUBGRAPH, BALANCER_SUBGRAPH_PUBLIC),
    testCurveOfficialApiConnectivity(),
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
  pools(first: ${limit}, orderBy: volumeUSD, orderDirection: desc, where: { totalValueLockedUSD_gt: "100000", totalValueLockedUSD_lt: "10000000000" }) {
    id
    fee: feeTier
    token0 { symbol address: id }
    token1 { symbol address: id }
    token0Price
    token1Price
    liquidity
    reserveUSD: totalValueLockedUSD
  }
}`;

const topV2PairsQuery = (limit = 20) => `
{
  pairs(first: ${limit}, orderBy: reserveUSD, orderDirection: desc, where: { reserveUSD_gt: "10000", reserveUSD_lt: "10000000000" }) {
    id
    token0 { symbol address: id }
    token1 { symbol address: id }
    token0Price
    token1Price
    reserveUSD
  }
}`;

// Balancer V2 weighted/stable pool subgraph query.
// Fetches per-token balances and weights so the parser can compute real spot prices
// (previously this query returned only `tokensList`/`totalLiquidity`, which forced the
// parser to insert identity 1:1 prices and made every Balancer pair invisible to
// cross-DEX edge detection).
const topBalancerPoolsQuery = (limit = 100) => `
{
  pools(
    first: ${limit},
    orderBy: totalLiquidity,
    orderDirection: desc,
    where: {
      totalLiquidity_gt: "100000",
      poolType_in: ["Weighted", "Stable", "MetaStable", "ComposableStable", "LiquidityBootstrappingPool", "Investment"]
    }
  ) {
    id
    address
    poolType
    swapFee
    totalLiquidity
    tokens {
      address
      symbol
      decimals
      balance
      weight
    }
  }
}`;

const topCurvePoolsQuery_DEPRECATED = (limit = 20) => `
{
  pools(first: ${limit}, orderBy: cumulativeVolumeUSD, orderDirection: desc) {
    coins
    balances
    cumulativeVolumeUSD
  }
}`;
void topCurvePoolsQuery_DEPRECATED;  // retained only to document the old schema; queries go through fetchCurveOfficialPools().

const PRIORITY_PAIR_SUBGRAPH_LIMIT_PER_PAIR = Math.max(
  1,
  Math.round(parseNumberEnv(Deno.env.get('SCANNER_PRIORITY_PAIR_SUBGRAPH_LIMIT'), 8)),
);

// Per-network minimum pool TVL — keeps thin ETH V2 pools (which cause 1844bps slippage) out of the scan.
// Calculation: to stay under 3% slippage on $8k trade on a CPAMM, pool needs ≥ $8k/0.03 ≈ $267k TVL.
// ETH mainnet V2 pools are often far below this; raise the floor to filter them.
const PRIORITY_PAIR_SUBGRAPH_MIN_LIQUIDITY_USD_BY_NETWORK = {
  ethereum: Math.max(100_000, parseNumberEnv(Deno.env.get('SCANNER_ETH_MIN_LIQUIDITY_USD'), 100_000)),
  arbitrum: Math.max(20_000, parseNumberEnv(Deno.env.get('SCANNER_ARB_MIN_LIQUIDITY_USD'), 20_000)),
  base: Math.max(20_000, parseNumberEnv(Deno.env.get('SCANNER_BASE_MIN_LIQUIDITY_USD'), 20_000)),
};
const getMinPoolLiquidityUsd = (network: string): number =>
  (PRIORITY_PAIR_SUBGRAPH_MIN_LIQUIDITY_USD_BY_NETWORK as Record<string, number>)[network] ?? 50_000;
// Keep legacy constant for any fallback path that still references it
const PRIORITY_PAIR_SUBGRAPH_MIN_LIQUIDITY_USD = 50_000;

const priorityPairV3Query = (tokenA: string, tokenB: string, limit = PRIORITY_PAIR_SUBGRAPH_LIMIT_PER_PAIR) => `
{
  pools(first: ${limit}, orderBy: totalValueLockedUSD, orderDirection: desc, where: { token0_in: ["${tokenA}", "${tokenB}"], token1_in: ["${tokenA}", "${tokenB}"], totalValueLockedUSD_gt: "10000" }) {
    id
    fee: feeTier
    token0 { symbol address: id }
    token1 { symbol address: id }
    token0Price
    token1Price
    liquidity
    reserveUSD: totalValueLockedUSD
  }
}`;

const priorityPairV2Query = (tokenA: string, tokenB: string, minLiquidityUsd = 20_000, limit = PRIORITY_PAIR_SUBGRAPH_LIMIT_PER_PAIR) => `
{
  pairs(first: ${limit}, orderBy: reserveUSD, orderDirection: desc, where: { token0_in: ["${tokenA}", "${tokenB}"], token1_in: ["${tokenA}", "${tokenB}"], reserveUSD_gt: "${minLiquidityUsd}", reserveUSD_lt: "10000000000" }) {
    id
    token0 { symbol address: id }
    token1 { symbol address: id }
    token0Price
    token1Price
    reserveUSD
  }
}`;

type PriorityPairTarget = {
  network: NetworkName;
  baseSymbol: string;
  quoteSymbol: string;
  baseAddress: string;
  quoteAddress: string;
};

const buildPriorityPairTargets = (networks: string[]): PriorityPairTarget[] => {
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((n) => toNetworkName(CHAIN_MAP[n] || n));
  const priorityTermsByNetwork = buildPriorityTermsByNetwork(selectedNetworks);
  const targets: PriorityPairTarget[] = [];
  const seen = new Set<string>();

  for (const network of selectedNetworks) {
    const pairTerms = priorityTermsByNetwork[network] || [];
    for (const pairTerm of pairTerms) {
      const [tokenA, tokenB] = normalizeSearchTerm(pairTerm).split(' ');
      if (!tokenA || !tokenB) continue;
      const trackable = getTrackableBaseQuote(network, tokenA, tokenB);
      if (!trackable) continue;

      const baseAddress = lookupTokenAddress(network, trackable.base)?.toLowerCase();
      const quoteAddress = lookupTokenAddress(network, trackable.quote)?.toLowerCase();
      if (!baseAddress || !quoteAddress || baseAddress === quoteAddress) continue;

      const key = `${network}:${trackable.base}/${trackable.quote}:${baseAddress}:${quoteAddress}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        network,
        baseSymbol: trackable.base,
        quoteSymbol: trackable.quote,
        baseAddress,
        quoteAddress,
      });
    }
  }

  return targets;
};

const matchesPriorityTarget = (pool: Pool, target: PriorityPairTarget): boolean => {
  const token0Address = String(pool.token0?.address || '').toLowerCase();
  const token1Address = String(pool.token1?.address || '').toLowerCase();
  if (!token0Address || !token1Address) return false;
  return (
    (token0Address === target.baseAddress && token1Address === target.quoteAddress)
    || (token0Address === target.quoteAddress && token1Address === target.baseAddress)
  );
};

const fetchPriorityPairSubgraphPools = async (
  networks: string[],
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
) => {
  const targets = buildPriorityPairTargetsWithDynamic(networks, dynamicPriorityTermsByNetwork);

  const uniV3Pools: Pool[] = [];
  const uniV2Pools: Pool[] = [];
  const sushiPools: Pool[] = [];
  const balancerPools: Pool[] = [];
  const curvePools: Pool[] = [];

  const meta = {
    targets: targets.length,
    queries: 0,
    responsesOk: 0,
    errors: 0,
    entriesAccepted: 0,
  };

  if (targets.length === 0) {
    return { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools, meta };
  }

  // Run all target queries in parallel instead of sequentially
  const targetResults = await Promise.allSettled(targets.map(async (target) => {
    const minLiquidity = getMinPoolLiquidityUsd(target.network);
    const queryV3 = priorityPairV3Query(target.baseAddress, target.quoteAddress);
    const queryV2 = priorityPairV2Query(target.baseAddress, target.quoteAddress, minLiquidity);

    const isArbitrum = target.network === 'arbitrum';
    const isBase = target.network === 'base';
    const v3SubgraphPrimary = isArbitrum ? UNI_V3_ARB_SUBGRAPH : isBase ? UNI_V3_BASE_SUBGRAPH : UNI_V3_SUBGRAPH;
    const v3SubgraphFallback = isArbitrum ? UNI_V3_ARB_SUBGRAPH_PUBLIC : isBase ? UNI_V3_BASE_SUBGRAPH_PUBLIC : UNI_V3_SUBGRAPH_PUBLIC;
    const sushiSubgraphPrimary = isArbitrum ? SUSHI_ARB_SUBGRAPH : isBase ? SUSHI_BASE_SUBGRAPH : SUSHI_SUBGRAPH;
    const sushiSubgraphFallback = isArbitrum ? SUSHI_ARB_SUBGRAPH_PUBLIC : isBase ? SUSHI_BASE_SUBGRAPH_PUBLIC : SUSHI_SUBGRAPH_PUBLIC;

    const requests = [
      fetchSubgraphWithFallback(v3SubgraphPrimary, v3SubgraphFallback, queryV3),
      (isArbitrum || isBase)
        ? Promise.resolve({ pairs: [] })
        : fetchSubgraphWithFallback(UNI_V2_SUBGRAPH, UNI_V2_SUBGRAPH_PUBLIC, queryV2),
      fetchSubgraphWithFallback(sushiSubgraphPrimary, sushiSubgraphFallback, queryV2),
    ];

    meta.queries += requests.length;
    const results = await Promise.allSettled(requests);
    return { target, results };
  }));

  for (const settled of targetResults) {
    if (settled.status !== 'fulfilled') { meta.errors += 1; continue; }
    const { target, results } = settled.value;

    const v3 = results[0];
    if (v3.status === 'fulfilled') {
      meta.responsesOk += 1;
      const pools = ((v3.value as { pools?: Record<string, unknown>[] })?.pools || [])
        .map((pool) => ({ ...toPoolFromPair(pool, 'Uniswap V3'), network: target.network }))
        .filter((pool) => matchesPriorityTarget(pool, target))
        .filter((pool) => parsePoolLiquidity(pool) >= getMinPoolLiquidityUsd(target.network));
      for (const pool of pools) {
        upsertFallbackPool(uniV3Pools, pool);
        meta.entriesAccepted += 1;
      }
    } else {
      meta.errors += 1;
    }

    const v2 = results[1];
    if (v2.status === 'fulfilled') {
      meta.responsesOk += 1;
      const pools = ((v2.value as { pairs?: Record<string, unknown>[] })?.pairs || [])
        .map((pair) => ({ ...toPoolFromPair(pair, 'Uniswap V2'), network: target.network }))
        .filter((pool) => matchesPriorityTarget(pool, target))
        .filter((pool) => parsePoolLiquidity(pool) >= getMinPoolLiquidityUsd(target.network));
      for (const pool of pools) {
        upsertFallbackPool(uniV2Pools, pool);
        meta.entriesAccepted += 1;
      }
    } else {
      meta.errors += 1;
    }

    const sushi = results[2];
    if (sushi.status === 'fulfilled') {
      meta.responsesOk += 1;
      const pools = ((sushi.value as { pairs?: Record<string, unknown>[] })?.pairs || [])
        .map((pair) => ({ ...toPoolFromPair(pair, 'SushiSwap'), network: target.network }))
        .filter((pool) => matchesPriorityTarget(pool, target))
        .filter((pool) => parsePoolLiquidity(pool) >= getMinPoolLiquidityUsd(target.network));
      for (const pool of pools) {
        upsertFallbackPool(sushiPools, pool);
        meta.entriesAccepted += 1;
      }
    } else {
      meta.errors += 1;
    }
  }

  return { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools, meta };
};

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
    feeTier: pair.fee != null ? Number(pair.fee) : undefined,
    dex,
    sourceType: 'subgraph',
  };
};

// Balancer V2 emits one Pool per token pair within a multi-token pool, so a 3-token
// stable pool yields C(3,2)=3 distinct pairs (USDC/DAI, USDC/USDT, DAI/USDT, etc.).
//
// Spot-price math:
//   - Weighted (and LBP/Investment which are weighted variants):
//       token0Price = (B_b / W_b) / (B_a / W_a)
//       token1Price = (B_a / W_a) / (B_b / W_b)
//     Reference: Balancer V2 whitepaper section 3.3 ("SP_o^i = (B_i/W_i)/(B_o/W_o)");
//     for 50/50 weighted (== CPMM) this collapses to token0Price = B_b/B_a as expected.
//   - Stable / MetaStable / ComposableStable:
//       token0Price ≈ B_b / B_a (and inverse) — captures depeg signal accurately near peg.
//
// Subgraph balances are already decimal-adjusted (human-readable strings), so direct
// float math is safe at the precision needed for spread detection (~1 bp).
const toPoolFromBalancer = (pool: Record<string, unknown>): Pool[] => {
  const tokens = (pool.tokens as Array<Record<string, unknown>> | undefined) || [];
  if (tokens.length < 2) return [];

  const poolType = String(pool.poolType || 'Weighted');
  const isStable = poolType.includes('Stable');
  const swapFeeFraction = Number(pool.swapFee || 0);
  const feeTier = Math.round(Math.max(0, swapFeeFraction) * 1_000_000);
  const poolAddress = String(pool.address || pool.id || '');
  const reserveUSD = String(pool.totalLiquidity || '0');

  type ParsedTok = { address: string; symbol: string; balance: number; weight: number };
  const parsed: ParsedTok[] = [];
  for (const t of tokens) {
    const address = String(t.address || '').toLowerCase();
    const symbol = String(t.symbol || '');
    const balance = Number(t.balance || 0);
    // Stable pools have no per-token weight in the schema; treat them as equal-weighted
    // (the stable invariant cancels weights in the spot-price approximation we use).
    const weight = isStable ? 1 : Number(t.weight || 0);
    if (!address || balance <= 0 || (!isStable && weight <= 0)) continue;
    parsed.push({ address, symbol, balance, weight });
  }
  if (parsed.length < 2) return [];

  // Cap token count per pool so an N-token pool can't generate C(N,2) pathological pair counts.
  // 8 tokens => 28 pairs is plenty; the Vault rarely exceeds 8 anyway.
  const MAX_TOKENS_PER_POOL = 8;
  const limited = parsed.slice(0, MAX_TOKENS_PER_POOL);

  const out: Pool[] = [];
  for (let i = 0; i < limited.length; i++) {
    for (let j = i + 1; j < limited.length; j++) {
      const a = limited[i];
      const b = limited[j];
      // HONESTY GATE — skip stable/stable pairs from Balancer Stable / MetaStable /
      // ComposableStable pools for the same reason as Curve: stable invariant math means the
      // marginal price stays ≈1.0 across a wide range of imbalance, so balance ratios are wrong.
      // Weighted Balancer pools (50/50, 80/20 etc.) use proper CPMM-style math and are fine.
      if (isStable) {
        const aStable = STABLE_QUOTES.has(normalizeTokenSymbol(a.symbol));
        const bStable = STABLE_QUOTES.has(normalizeTokenSymbol(b.symbol));
        if (aStable && bStable) continue;
      }
      // Convention (matches Uniswap subgraph + downstream canonicalization at L~4504):
      //   token1Price = "token1 per token0" = reserves1/reserves0
      //   token0Price = "token0 per token1" = reserves0/reserves1
      // Where a=token0, b=token1.
      let token1PerToken0 = 0;
      let token0PerToken1 = 0;
      if (isStable) {
        token1PerToken0 = a.balance > 0 ? b.balance / a.balance : 0;
        token0PerToken1 = b.balance > 0 ? a.balance / b.balance : 0;
      } else {
        const ra = a.weight > 0 ? a.balance / a.weight : 0;
        const rb = b.weight > 0 ? b.balance / b.weight : 0;
        token1PerToken0 = ra > 0 ? rb / ra : 0;
        token0PerToken1 = rb > 0 ? ra / rb : 0;
      }
      if (!Number.isFinite(token1PerToken0) || !Number.isFinite(token0PerToken1) || token1PerToken0 <= 0 || token0PerToken1 <= 0) continue;
      out.push({
        token0: { symbol: a.symbol, address: a.address },
        token1: { symbol: b.symbol, address: b.address },
        token0Price: String(token0PerToken1),
        token1Price: String(token1PerToken0),
        reserveUSD,
        network: 'ethereum',
        poolAddress,
        feeTier: feeTier > 0 ? feeTier : undefined,
        dex: 'Balancer',
        sourceType: 'subgraph',
      });
    }
  }
  return out;
};

// Curve official REST API replacement for the dead curvefi/curve hosted subgraph.
// Returns a `{ pools: [...] }` shape so it slots into the existing Promise.allSettled flow,
// matching the contract `curveData?.pools`. Each entry already conforms to the input shape
// expected by `toPoolFromCurve`.
type CurveOfficialCoin = {
  address?: string;
  symbol?: string;
  decimals?: number | string;
  poolBalance?: string;
};
type CurveOfficialPool = {
  address?: string;
  name?: string;
  coins?: CurveOfficialCoin[];
  usdTotal?: number;
};

const fetchCurveOfficialPools = async (): Promise<{ pools: CurveOfficialPool[] }> => {
  const timeoutMs = Math.max(
    2500,
    parseNumberEnv(Deno.env.get('SCANNER_CURVE_API_TIMEOUT_MS'), 8_000),
  );
  const fetchOne = async (registry: string): Promise<CurveOfficialPool[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('curve-api-timeout'), timeoutMs);
    try {
      const res = await fetch(`${CURVE_OFFICIAL_API_BASE}/${registry}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Curve API ${registry} HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.success === false) throw new Error(`Curve API ${registry} returned success=false`);
      const data = json?.data?.poolData;
      return Array.isArray(data) ? (data as CurveOfficialPool[]) : [];
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Curve API ${registry} timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const results = await Promise.allSettled(CURVE_OFFICIAL_REGISTRIES.map(fetchOne));
  const pools: CurveOfficialPool[] = [];
  let ok = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      ok += 1;
      pools.push(...r.value);
    } else {
      console.warn(`Curve API registry fetch failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }
  if (ok === 0) {
    throw new Error(`Curve API: all ${CURVE_OFFICIAL_REGISTRIES.length} registries failed`);
  }
  return { pools };
};

const testCurveOfficialApiConnectivity = async () => {
  const detail = {
    name: 'curve',
    primaryUrl: `${CURVE_OFFICIAL_API_BASE}/main`,
    fallbackUrl: `${CURVE_OFFICIAL_API_BASE}/main`,
    usedSource: 'none' as 'primary' | 'fallback' | 'none',
    status: 'failed' as 'ok' | 'failed',
    error: '',
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('curve-probe-timeout'), 5_000);
  try {
    const res = await fetch(`${CURVE_OFFICIAL_API_BASE}/main`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Curve API HTTP ${res.status}`);
    detail.usedSource = 'primary';
    detail.status = 'ok';
    return detail;
  } catch (error) {
    detail.error = error instanceof Error ? error.message : 'Unknown Curve API error';
    return detail;
  } finally {
    clearTimeout(timer);
  }
};

// Emits one Pool per token pair from a Curve pool (so a 3-coin stableswap yields C(3,2)=3 pairs).
// `poolBalance` is a raw BigInt-as-string; we divide by 10^decimals to get the human-readable balance,
// then approximate the marginal spot price as balance_b/balance_a. This is exact for 50/50 CPMM
// behavior and a very tight approximation for stable/MetaPool/Tricrypto math near the pool's current
// state (which is all that matters for spread/edge detection).
//
// Quality gates:
// - Pools with usdTotal below CURVE_MIN_POOL_TVL_USD are skipped (abandoned factory pools produce
//   noise prices from negligible residual balances).
// - LP-token "coins" whose address equals the pool address itself are dropped (metapools list the
//   underlying basepool LP token as a coin which would create a phantom asset with garbage pricing).
const CURVE_MIN_POOL_TVL_USD = Math.max(
  0,
  parseNumberEnv(Deno.env.get('SCANNER_CURVE_MIN_POOL_TVL_USD'), 50_000),
);
const toPoolFromCurve = (pool: CurveOfficialPool): Pool[] => {
  const coins = pool.coins || [];
  if (coins.length < 2) return [];

  const poolAddress = String(pool.address || '').toLowerCase();
  const usdTotal = Number(pool.usdTotal ?? 0);
  if (!Number.isFinite(usdTotal) || usdTotal < CURVE_MIN_POOL_TVL_USD) return [];
  const reserveUSD = String(usdTotal);

  type ParsedCoin = { address: string; symbol: string; humanBalance: number };
  const parsed: ParsedCoin[] = [];
  for (const c of coins) {
    const address = String(c.address || '').toLowerCase();
    const symbol = String(c.symbol || '');
    const decimals = Number(c.decimals ?? 18);
    const raw = String(c.poolBalance || '0');
    if (!address || !raw || raw === '0') continue;
    // Skip LP-token coins (basepool LP listed inside metapool coins array).
    if (address === poolAddress) continue;
    let humanBalance: number;
    try {
      humanBalance = Number(raw) / Math.pow(10, Number.isFinite(decimals) ? decimals : 18);
    } catch {
      continue;
    }
    if (!Number.isFinite(humanBalance) || humanBalance <= 0) continue;
    parsed.push({ address, symbol, humanBalance });
  }
  if (parsed.length < 2) return [];

  const MAX_COINS_PER_POOL = 8;
  const limited = parsed.slice(0, MAX_COINS_PER_POOL);

  const out: Pool[] = [];
  for (let i = 0; i < limited.length; i++) {
    for (let j = i + 1; j < limited.length; j++) {
      const a = limited[i];
      const b = limited[j];
      // HONESTY GATE — skip stable/stable Curve pairs.
      // Curve stableswap invariant produces a marginal price ≈ 1.0 near peg even when the pool
      // is heavily imbalanced (e.g., 3pool with USDT 2.2× USDC still trades USDC/USDT ≈ 1.0001
      // due to high amplification A). A naive `balance/balance` ratio is wrong by orders of
      // magnitude for stable pools. Until a proper stableswap solver is wired in, emit no
      // Curve quote for stable/stable pairs — cross-DEX detection still works via the V3/V2/
      // Balancer/DexScreener legs. Non-stable pairs (Tricrypto WBTC/WETH, stable/crypto in
      // metapools, etc.) use the correct CPMM-style balance ratio.
      const aStable = STABLE_QUOTES.has(normalizeTokenSymbol(a.symbol));
      const bStable = STABLE_QUOTES.has(normalizeTokenSymbol(b.symbol));
      if (aStable && bStable) continue;
      // Convention (matches Uniswap subgraph + downstream canonicalization at L~4504):
      //   token1Price = "token1 per token0" = balance1/balance0
      //   token0Price = "token0 per token1" = balance0/balance1
      // Where a=token0, b=token1.
      const token1PerToken0 = b.humanBalance / a.humanBalance;
      const token0PerToken1 = a.humanBalance / b.humanBalance;
      if (!Number.isFinite(token1PerToken0) || !Number.isFinite(token0PerToken1) || token1PerToken0 <= 0 || token0PerToken1 <= 0) continue;
      out.push({
        token0: { symbol: a.symbol, address: a.address },
        token1: { symbol: b.symbol, address: b.address },
        token0Price: String(token0PerToken1),
        token1Price: String(token1PerToken0),
        reserveUSD,
        network: 'ethereum',
        poolAddress,
        dex: 'Curve',
        sourceType: 'subgraph',
      });
    }
  }
  return out;
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
  polygon: 0.044,   // $45×0.044 ≈ $2.00 — Base reality for L2 chains
  arbitrum: 0.067,  // $45×0.067 ≈ $3.00 — Arbitrum reality ($0.30/tx on fast L2)
  base: 0.044,      // $45×0.044 ≈ $2.00 — Base reality (low-fee OP-stack chain)
  bsc: 0.11,        // $45×0.11  ≈ $5.00 — BSC moderate gas
};

const DEFAULT_GAS_PRICE_GWEI_BY_NETWORK: Record<NetworkName, number> = {
  ethereum: 20,
  polygon: 60,
  arbitrum: 0.2,
  base: 0.2,
  bsc: 3,
};

const DEFAULT_NATIVE_TOKEN_USD_BY_NETWORK: Record<NetworkName, number> = {
  ethereum: 2600,
  polygon: 0.8,
  arbitrum: 2600,
  base: 2600,
  bsc: 600,
};

const DEFAULT_MIN_NET_EDGE_BPS_BY_NETWORK: Record<NetworkName, number> = {
  ethereum: 28,
  polygon: 18,
  arbitrum: 10,
  base: 10,
  bsc: 12,
};

const DEFAULT_EXECUTION_RISK_BUFFER_USD_BY_NETWORK: Record<NetworkName, number> = {
  ethereum: 5,
  polygon: 4,
  arbitrum: 1,
  base: 1,
  bsc: 1.5,
};

const GECKO_NETWORK_TO_APP: Record<string, NetworkName> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  polygon: 'polygon',
  matic: 'polygon',
  maticpos: 'polygon',
  polygon_pos: 'polygon',
  arbitrumone: 'arbitrum',
  arb: 'arbitrum',
  arbitrum: 'arbitrum',
  arbitrum_one: 'arbitrum',
  base: 'base',
  base_mainnet: 'base',
  bsc: 'bsc',
  binance_smart_chain: 'bsc',
};

const APP_NETWORK_TO_GECKO: Record<NetworkName, string> = {
  ethereum: 'eth',
  polygon: 'polygon_pos',
  arbitrum: 'arbitrum',
  base: 'base',
  bsc: 'bsc',
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
    'Uniswap V3': '0x2626664c2603336E57B271c5C0b26F421741e481',
    'Uniswap V2': '0x4752ba5DBc23f44D87826239FF86bbF073A9f58D',
    'SushiSwap': '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
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


const MIN_FALLBACK_LIQUIDITY_USD = parseNumberEnv(
  Deno.env.get('SCANNER_MIN_FALLBACK_LIQUIDITY_USD'),
  20_000,
);

const PRIORITY_FALLBACK_LIQUIDITY_FRACTION = Math.min(
  1,
  Math.max(0.1, parseNumberEnv(Deno.env.get('SCANNER_PRIORITY_FALLBACK_LIQUIDITY_FRACTION'), 0.4)),
);

const OVERLAP_PRIORITY_PAIR_TERMS_BY_NETWORK: Partial<Record<NetworkName, string[]>> = {
  ethereum: [
    // WETH pairs: V2 Uniswap + V3 Uniswap + SushiSwap (only major pairs with deep V2 TVL ≥$100k)
    'LINK WETH', 'WBTC WETH', 'AAVE WETH', 'UNI WETH', 'COMP WETH',
    'MKR WETH', 'LDO WETH', 'CRV WETH', 'SNX WETH', 'YFI WETH',
    'ENS WETH', 'RPL WETH', 'GRT WETH', 'BAL WETH', 'CVX WETH',
    'FXS WETH', 'DYDX WETH', '1INCH WETH', 'MATIC WETH', 'FET WETH',
    'PEPE WETH', 'SHIB WETH', 'FLOKI WETH',
    // V3 cross-fee-tier pairs (0.05% vs 0.3% vs 1%) — no V2 needed
    'WETH USDC', 'WETH USDT', 'WETH DAI',
    // Stablecoin pairs (only if V2 TVL is likely ≥$100k)
    'WBTC USDC', 'WBTC USDT',
    'LINK USDC', 'LINK USDT',
    'UNI USDC', 'AAVE USDC',
    'CRV USDC', 'SNX USDC',
    'LDO USDC', 'MKR USDC',
    'GRT USDC', 'ENS USDC',
  ],
  arbitrum: [
    // WETH pairs: exist on V3 + SushiSwap V2 for cross-DEX arb (gas ~$0.31/tx)
    'MAGIC WETH', 'ARB WETH', 'GMX WETH', 'PENDLE WETH',
    'RDNT WETH', 'LINK WETH', 'GRT WETH', 'JONES WETH',
    'WBTC WETH', 'UNI WETH', 'AAVE WETH', 'CRV WETH',
    'SNX WETH', 'BAL WETH', 'FXS WETH', 'COMP WETH',
    'YFI WETH', 'LDO WETH', 'SUSHI WETH', 'VELA WETH',
    // V3 cross-fee-tier (0.05% vs 0.3%)
    'WETH USDC', 'WETH USDT',
    // Stablecoin pairs
    'ARB USDC', 'GMX USDC',
    'MAGIC USDC', 'LINK USDC',
    'GRAIL USDC', 'DPX USDC',
    'ARB USDT', 'WBTC USDC',
    'PENDLE USDC', 'RDNT USDC',
  ],
  base: [
    // WETH pairs: highest-liquidity pools on Base Uniswap V3 + SushiSwap V2
    'WETH USDC', 'CBETH WETH', 'WETH USDT', 'WBTC WETH', 'DAI WETH',
    'BRETT WETH', 'DEGEN WETH', 'AERO WETH', 'VIRTUAL WETH',
    'TOSHI WETH', 'HIGHER WETH', 'WELL WETH',
    'USDC DAI', 'CBETH USDC',
  ],
  polygon: [
    'WMATIC USDC', 'WMATIC USDT',
    'LINK USDC', 'AAVE USDC', 'GHST USDC',
  ],
};

type PriorityTermsByNetwork = Partial<Record<NetworkName, string[]>>;

const normalizeSearchTerm = (term: string): string =>
  term.trim().replace(/[/\-_]/g, ' ').replace(/\s+/g, ' ').toUpperCase();

const buildPriorityTermsByNetwork = (
  selectedNetworks: NetworkName[],
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
): Record<NetworkName, string[]> => {
  const merged = {} as Record<NetworkName, string[]>;

  for (const network of selectedNetworks) {
    const staticTerms = OVERLAP_PRIORITY_PAIR_TERMS_BY_NETWORK[network] || [];
    const dynamicTerms = dynamicPriorityTermsByNetwork?.[network] || [];
    merged[network] = Array.from(
      new Set([...staticTerms, ...dynamicTerms].map((term) => normalizeSearchTerm(term)).filter(Boolean)),
    );
  }

  return merged;
};

const buildPrioritizedFallbackTerms = (
  selectedNetworks: NetworkName[],
  options?: { maxQueries?: number; priorityTermsByNetwork?: PriorityTermsByNetwork },
): string[] => {
  const terms: string[] = [];
  const seenTerms = new Set<string>();
  const maxQueries = options?.maxQueries && options.maxQueries > 0
    ? Math.floor(options.maxQueries)
    : Number.POSITIVE_INFINITY;

  const pushTerm = (raw: string) => {
    if (terms.length >= maxQueries) return;
    const normalized = normalizeSearchTerm(raw);
    if (!normalized || seenTerms.has(normalized)) return;
    seenTerms.add(normalized);
    terms.push(normalized);
  };

  const priorityTermsByNetwork = buildPriorityTermsByNetwork(selectedNetworks, options?.priorityTermsByNetwork);

  for (const network of selectedNetworks) {
    const priorityPairs = priorityTermsByNetwork[network] || [];
    for (const pairTerm of priorityPairs) {
      const [tokenA, tokenB] = pairTerm.split(' ');
      if (!tokenA || !tokenB || !isTrackablePair(network, tokenA, tokenB)) continue;
      pushTerm(pairTerm);
      pushTerm(`${tokenB} ${tokenA}`);
    }
  }

  const byNetwork = selectedNetworks.map((network) => {
    const networkTerms = SEARCH_TERMS_BY_NETWORK[network] || [];
    const normalizedTerms = Array.from(new Set(networkTerms.map((term) => normalizeSearchTerm(term))));
    return {
      pairTerms: normalizedTerms.filter((term) => term.includes(' ')),
      singleTokenTerms: normalizedTerms.filter((term) => !term.includes(' ')),
    };
  });

  let networkIndex = 0;
  while (terms.length < maxQueries) {
    let progressed = false;
    for (let i = 0; i < byNetwork.length; i += 1) {
      const bucket = byNetwork[(networkIndex + i) % byNetwork.length];
      const nextPairTerm = bucket.pairTerms.shift();
      if (nextPairTerm) {
        pushTerm(nextPairTerm);
        progressed = true;
      }
      const nextTokenTerm = bucket.singleTokenTerms.shift();
      if (nextTokenTerm && terms.length < maxQueries) {
        pushTerm(nextTokenTerm);
        progressed = true;
      }
      if (terms.length >= maxQueries) break;
    }
    if (!progressed) break;
    networkIndex += 1;
  }

  return terms;
};

const buildPriorityTermSet = (selectedNetworks: NetworkName[]): Set<string> => {
  const terms = new Set<string>();
  const priorityTermsByNetwork = buildPriorityTermsByNetwork(selectedNetworks);
  for (const network of selectedNetworks) {
    const pairTerms = priorityTermsByNetwork[network] || [];
    for (const pairTerm of pairTerms) {
      const normalized = normalizeSearchTerm(pairTerm);
      if (!normalized) continue;
      terms.add(normalized);
      const [left, right] = normalized.split(' ');
      if (left && right) terms.add(`${right} ${left}`);
    }
  }
  return terms;
};

const buildPriorityTermSetFromMap = (
  selectedNetworks: NetworkName[],
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
): Set<string> => {
  const terms = new Set<string>();
  const priorityTermsByNetwork = buildPriorityTermsByNetwork(selectedNetworks, dynamicPriorityTermsByNetwork);
  for (const network of selectedNetworks) {
    const pairTerms = priorityTermsByNetwork[network] || [];
    for (const pairTerm of pairTerms) {
      const normalized = normalizeSearchTerm(pairTerm);
      if (!normalized) continue;
      terms.add(normalized);
      const [left, right] = normalized.split(' ');
      if (left && right) terms.add(`${right} ${left}`);
    }
  }
  return terms;
};

const buildPriorityTokenAddresses = (
  selectedNetworks: NetworkName[],
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
): string[] => {
  const addresses = new Set<string>();
  const priorityTermsByNetwork = buildPriorityTermsByNetwork(selectedNetworks, dynamicPriorityTermsByNetwork);
  for (const network of selectedNetworks) {
    const pairTerms = priorityTermsByNetwork[network] || [];
    for (const pairTerm of pairTerms) {
      const [tokenA, tokenB] = normalizeSearchTerm(pairTerm).split(' ');
      if (!tokenA || !tokenB) continue;
      const trackable = getTrackableBaseQuote(network, tokenA, tokenB);
      if (!trackable) continue;
      const baseAddress = lookupTokenAddress(network, trackable.base);
      const quoteAddress = lookupTokenAddress(network, trackable.quote);
      if (baseAddress) addresses.add(baseAddress);
      if (quoteAddress) addresses.add(quoteAddress);
    }
  }
  return Array.from(addresses);
};

let priorityOverlapPairKeysCache: Set<string> | null = null;

const buildPriorityPairTargetsWithDynamic = (
  networks: string[],
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
): PriorityPairTarget[] => {
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((n) => toNetworkName(CHAIN_MAP[n] || n));
  const priorityTermsByNetwork = buildPriorityTermsByNetwork(selectedNetworks, dynamicPriorityTermsByNetwork);
  const targets: PriorityPairTarget[] = [];
  const seen = new Set<string>();

  for (const network of selectedNetworks) {
    const pairTerms = priorityTermsByNetwork[network] || [];
    for (const pairTerm of pairTerms) {
      const [tokenA, tokenB] = normalizeSearchTerm(pairTerm).split(' ');
      if (!tokenA || !tokenB) continue;
      const trackable = getTrackableBaseQuote(network, tokenA, tokenB);
      if (!trackable) continue;

      const baseAddress = lookupTokenAddress(network, trackable.base)?.toLowerCase();
      const quoteAddress = lookupTokenAddress(network, trackable.quote)?.toLowerCase();
      if (!baseAddress || !quoteAddress || baseAddress === quoteAddress) continue;

      const key = `${network}:${trackable.base}/${trackable.quote}:${baseAddress}:${quoteAddress}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        network,
        baseSymbol: trackable.base,
        quoteSymbol: trackable.quote,
        baseAddress,
        quoteAddress,
      });
    }
  }

  return targets;
};

const getPriorityOverlapPairKeys = (dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork): Set<string> => {
  if (dynamicPriorityTermsByNetwork) {
    const keys = new Set<string>();
    const targets = buildPriorityPairTargetsWithDynamic(['ethereum', 'polygon', 'arbitrum', 'base', 'bsc'], dynamicPriorityTermsByNetwork);
    for (const target of targets) {
      keys.add(`${target.network}:${target.baseSymbol}/${target.quoteSymbol}`);
    }
    return keys;
  }

  if (priorityOverlapPairKeysCache) return priorityOverlapPairKeysCache;

  const keys = new Set<string>();
  const networks: NetworkName[] = ['ethereum', 'polygon', 'arbitrum', 'base', 'bsc'];
  for (const network of networks) {
    const pairTerms = OVERLAP_PRIORITY_PAIR_TERMS_BY_NETWORK[network] || [];
    for (const pairTerm of pairTerms) {
      const [tokenA, tokenB] = normalizeSearchTerm(pairTerm).split(' ');
      if (!tokenA || !tokenB) continue;
      const trackable = getTrackableBaseQuote(network, tokenA, tokenB);
      if (!trackable) continue;
      keys.add(`${network}:${trackable.base}/${trackable.quote}`);
    }
  }

  priorityOverlapPairKeysCache = keys;
  return keys;
};

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
  // Note: no floor for low-gas networks (e.g. Arbitrum ~$0.31) to avoid false rejections.
  return config.estimatedGasUsd * NETWORK_GAS_MULTIPLIER[network];
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

// Static token address registry for enriching DexScreener/Gecko pools that lack on-chain addresses.
// These are canonical checksummed addresses for the most common tokens per network.
const KNOWN_TOKEN_ADDRESSES: Partial<Record<NetworkName, Record<string, string>>> = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    FRAX: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    MKR: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    CRV: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  polygon: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'USDC.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    MATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    LINK: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
    WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    CRV: '0x172370d5Cd63279eFa6d502DAB29171933a610AF',
    QUICK: '0x831753DD7087CaC61aB5644b308642cc1c33Dc13',
    GHST: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7',
    SAND: '0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683',
  },
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    'USDC(bridged)': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    LINK: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    GMX: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
    MAGIC: '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
    PENDLE: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    WETH: '0x4200000000000000000000000000000000000006',
    CBETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    AERO: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    LINK: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    WBTC: '0x0555E30da8f98308EeBD78F1251D2Abb99f8F78b',
    BRETT: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
    DEGEN: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
  },
};

// Look up a canonical token address for a given network + symbol (case-insensitive, strips wrapping W).
const lookupTokenAddress = (network: NetworkName, symbol: string): string | undefined => {
  const map = KNOWN_TOKEN_ADDRESSES[network];
  if (!map) return undefined;
  const upper = symbol.toUpperCase();
  return map[upper] ?? map[upper.replace(/^W/, '')] ?? undefined;
};

const SOURCE_RELIABILITY_BPS: Record<'subgraph' | 'dexscreener' | 'gecko', bigint> = {
  subgraph: 10_000n,
  dexscreener: 7_200n,
  gecko: 5_200n,
};

const clampUnit = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toObjectSafe = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return null;
};

const loadSourceReliabilityBps = async (): Promise<{
  subgraph: bigint;
  dexscreener: bigint;
  gecko: bigint;
  runCount: number;
}> => {
  const fallback = {
    subgraph: SOURCE_RELIABILITY_BPS.subgraph,
    dexscreener: SOURCE_RELIABILITY_BPS.dexscreener,
    gecko: SOURCE_RELIABILITY_BPS.gecko,
    runCount: 0,
  };

  if (!canAccessSupabaseRest()) return fallback;

  const windowSize = Math.max(5, Math.min(100, Math.round(parseNumberEnv(Deno.env.get('SCANNER_SOURCE_HEALTH_WINDOW_RUNS'), 30))));
  const decay = clampNumber(parseNumberEnv(Deno.env.get('SCANNER_SOURCE_HEALTH_DECAY'), 0.7), 0.1, 0.95);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scanner_runs?select=diagnostics&order=started_at.desc&limit=${windowSize}`,
      {
        headers: {
          apikey: SUPABASE_REST_KEY,
          Authorization: `Bearer ${SUPABASE_REST_KEY}`,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) return fallback;

    const rows = await res.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) return fallback;

    let subgraphHealth = Number(SOURCE_RELIABILITY_BPS.subgraph) / 10_000;
    let dexscreenerHealth = Number(SOURCE_RELIABILITY_BPS.dexscreener) / 10_000;
    let geckoHealth = Number(SOURCE_RELIABILITY_BPS.gecko) / 10_000;

    const orderedRows = [...rows].reverse();
    for (const row of orderedRows) {
      const diagnostics = toObjectSafe(row.diagnostics);
      if (!diagnostics) continue;

      const subgraphFetchStats = toObjectSafe(diagnostics.subgraphFetchStats);
      if (subgraphFetchStats) {
        const sourceKeys = ['uniswapV3', 'uniswapV2', 'sushiswap', 'balancer', 'curve'];
        let known = 0;
        let healthy = 0;
        for (const sourceKey of sourceKeys) {
          const source = toObjectSafe(subgraphFetchStats[sourceKey]);
          if (!source) continue;
          known += 1;
          if (String(source.status || '').toLowerCase() === 'ok') healthy += 1;
        }
        if (known > 0) {
          const sample = clampUnit(healthy / known, subgraphHealth);
          subgraphHealth = (decay * subgraphHealth) + ((1 - decay) * sample);
        }
      }

      const fallbackFetchStats = toObjectSafe(diagnostics.fallbackFetchStats);
      if (fallbackFetchStats) {
        const ds = toObjectSafe(fallbackFetchStats.dexscreener);
        if (ds) {
          const queries = Math.max(0, toNumberSafe(ds.queries, 0));
          const ok = Math.max(0, toNumberSafe(ds.responsesOk, 0));
          if (queries > 0) {
            const sample = clampUnit(ok / queries, dexscreenerHealth);
            dexscreenerHealth = (decay * dexscreenerHealth) + ((1 - decay) * sample);
          }
        }

        const gecko = toObjectSafe(fallbackFetchStats.gecko);
        if (gecko) {
          const queries = Math.max(0, toNumberSafe(gecko.queries, 0));
          const ok = Math.max(0, toNumberSafe(gecko.responsesOk, 0));
          if (queries > 0) {
            const sample = clampUnit(ok / queries, geckoHealth);
            geckoHealth = (decay * geckoHealth) + ((1 - decay) * sample);
          }
        }
      }
    }

    const toBps = (health: number, minBps: number, maxBps: number): bigint => {
      const unit = clampUnit(health, 0.5);
      const mapped = Math.round(minBps + ((maxBps - minBps) * unit));
      return BigInt(mapped);
    };

    return {
      subgraph: toBps(subgraphHealth, 7_000, 10_000),
      dexscreener: toBps(dexscreenerHealth, 4_000, 9_000),
      gecko: toBps(geckoHealth, 3_500, 8_000),
      runCount: rows.length,
    };
  } catch {
    return fallback;
  }
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
  quoteUsdPrice = 1, // 1 for stables (USDC/USDT); wethUsdPrice for WETH pairs
): {
  payload: Record<string, unknown> | null;
  error?: string;
} => {
  // Extract token addresses from pool objects
  // tokenPair format: "ethereum:TOKEN0/TOKEN1" where TOKEN1 is typically the quote (USDC/USDT/WETH)
  const parts = tokenPair.split('/');
  if (parts.length !== 2) {
    return { payload: null, error: 'Invalid tokenPair format' };
  }

  const token0Symbol = parts[0].split(':').pop() || '';
  const token1Symbol = parts[1];
  
  // Determine which token is the quote (asset to borrow) and which is the base (tokenB to arbitrage)
  const isQuoteToken0 = isStableQuote(token0Symbol);
  const isQuoteToken1 = isStableQuote(token1Symbol);
  const isWethToken0 = WETH_QUOTE_SYMBOLS.has(normalizeTokenSymbol(token0Symbol));
  const isWethToken1 = WETH_QUOTE_SYMBOLS.has(normalizeTokenSymbol(token1Symbol));

  // Accept stable quotes (USDC/USDT/DAI) or WETH as the borrowable asset.
  if (!isQuoteToken0 && !isQuoteToken1 && !isWethToken0 && !isWethToken1) {
    return { payload: null, error: 'No stable or WETH quote token found in pair' };
  }

  // Prefer stable over WETH as quote; if neither stable, use WETH side.
  const useToken0AsQuote = isQuoteToken0 || (!isQuoteToken1 && isWethToken0);

  // Asset to borrow is the quote; tokenB to arbitrage is the base
  const assetSymbol = useToken0AsQuote ? token0Symbol : token1Symbol;
  const tokenBSymbol = useToken0AsQuote ? token1Symbol : token0Symbol;

  const assetDecimals = getTokenDecimals(assetSymbol);
  const tokenBDecimals = getTokenDecimals(tokenBSymbol);

  const asset = (useToken0AsQuote ? buyPool.token0?.address || sellPool.token0?.address : buyPool.token1?.address || sellPool.token1?.address)
    || lookupTokenAddress(network, assetSymbol);
  const tokenB = (useToken0AsQuote ? buyPool.token1?.address || sellPool.token1?.address : buyPool.token0?.address || sellPool.token0?.address)
    || lookupTokenAddress(network, tokenBSymbol);

  if (!asset || !tokenB) {
    return { payload: null, error: 'Missing token addresses from pools' };
  }

  // For WETH pairs, executableLoanAmount is USD-denominated; convert to token units using quoteUsdPrice.
  // For stable pairs quoteUsdPrice=1 so no change.
  const safeQuoteUsdPrice = quoteUsdPrice > 0 ? quoteUsdPrice : 1;
  const assetAmount = formatTokenUnits(executableLoanAmount / safeQuoteUsdPrice, assetDecimals);
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

const getMinNetEdgeBpsForNetwork = (config: ScannerConfig, network: NetworkName): number => {
  const configured = config.minNetEdgeBpsByNetwork[network];
  if (Number.isFinite(configured) && Number(configured) >= 0) {
    return Number(configured);
  }
  return DEFAULT_MIN_NET_EDGE_BPS_BY_NETWORK[network];
};

const getExecutionRiskBufferUsdForNetwork = (config: ScannerConfig, network: NetworkName): number => {
  const configured = config.executionRiskBufferUsdByNetwork[network];
  if (Number.isFinite(configured) && Number(configured) >= 0) {
    return Number(configured);
  }
  return DEFAULT_EXECUTION_RISK_BUFFER_USD_BY_NETWORK[network];
};

const getRequiredActiveNetProfitUsd = (config: ScannerConfig, network: NetworkName): number => {
  const baseFixed = decimalToFixed(getMinNetProfitUsdForNetwork(config, network), USD_SCALE);
  const networkGasFixed = decimalToFixed(estimateGasUsdForNetwork(network, config), USD_SCALE);
  const baselineGasFixed = decimalToFixed(Math.max(1, config.estimatedGasUsd), USD_SCALE);
  const pressureMultiplierFixed = decimalToFixed(config.adaptiveProfitPressureMultiplier, FP_SCALE);
  const reliefMultiplierFixed = decimalToFixed(config.adaptiveProfitReliefMultiplier, FP_SCALE);
  const floorFractionFixed = decimalToFixed(config.adaptiveMinNetFloorFraction, FP_SCALE);

  const gasFactorFixed = baselineGasFixed > 0n
    ? mulDiv(networkGasFixed, FP_SCALE, baselineGasFixed)
    : FP_SCALE;

  let adaptiveThresholdFixed = baseFixed;
  if (gasFactorFixed > FP_SCALE) {
    const gasExcessFixed = gasFactorFixed - FP_SCALE;
    const adjustmentFixed = mulDiv(gasExcessFixed, pressureMultiplierFixed, FP_SCALE);
    adaptiveThresholdFixed = baseFixed + mulDiv(baseFixed, adjustmentFixed, FP_SCALE);
  } else if (gasFactorFixed < FP_SCALE) {
    const gasReliefFixed = FP_SCALE - gasFactorFixed;
    const reliefFixed = mulDiv(gasReliefFixed, reliefMultiplierFixed, FP_SCALE);
    const reliefAmountFixed = mulDiv(baseFixed, reliefFixed, FP_SCALE);
    const floorFixed = mulDiv(baseFixed, floorFractionFixed, FP_SCALE);
    const relievedFixed = baseFixed > reliefAmountFixed ? baseFixed - reliefAmountFixed : 0n;
    adaptiveThresholdFixed = relievedFixed > floorFixed ? relievedFixed : floorFixed;
  }

  const adaptiveThresholdUsd = fixedToNumber(adaptiveThresholdFixed > 0n ? adaptiveThresholdFixed : 0n, USD_SCALE, 6);
  return adaptiveThresholdUsd + getExecutionRiskBufferUsdForNetwork(config, network);
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
// WETH is treated as a secondary quote currency: TOKEN/WETH pairs (LINK/WETH, WBTC/WETH, etc.)
// are valid cross-DEX arb targets since they exist on V2 + V3 + SushiSwap simultaneously.
// Prices stored as WETH/TOKEN are later multiplied by WETH/USD price for USD-denominated CPMM math.
const WETH_QUOTE_SYMBOLS = new Set(['WETH', 'ETH']);
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

const parseGeckoPoolNameSymbols = (poolName: string): { baseSymbol: string; quoteSymbol: string } | null => {
  const name = String(poolName || '').trim();
  if (!name) return null;

  const pairSegment = name.split(/\s+\d/)[0];
  const parts = pairSegment.split('/').map((part) => normalizeTokenSymbol(part));
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { baseSymbol: parts[0], quoteSymbol: parts[1] };
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
  const leftWeth = WETH_QUOTE_SYMBOLS.has(left);
  const rightWeth = WETH_QUOTE_SYMBOLS.has(right);

  // TOKEN/WETH pairs: one side is WETH, the other is a known base token (not stable, not WETH again).
  // Price returned is raw "WETH per TOKEN"; multiplied by WETH/USD later for USD-denominated math.
  if ((leftWeth || rightWeth) && !(leftWeth && rightWeth) && !leftStable && !rightStable) {
    const base = leftWeth ? right : left;
    if (!CORE_BASE_TOKENS[network].has(base)) return null;
    return { base, quote: 'WETH' };
  }

  // STABLE/STABLE pairs (USDC/USDT, USDC/DAI, USDT/DAI): track for depeg arbitrage on Curve 3pool
  // and equivalent stable AMMs. We choose canonical ordering by sorting alphabetically so the same
  // pair always maps to one key regardless of token0/token1 ordering in the pool. The lexicographic
  // first stable becomes `base` (which is token0 in the pair key) — execution code at L3548 picks
  // token0 as the borrowable asset when both sides are stable, so this is a valid quote side.
  // Canonical price = "quote per base" ≈ 1.0 near peg; spread = depeg signal.
  if (leftStable && rightStable) {
    if (left === right) return null;
    const [base, quote] = left < right ? [left, right] : [right, left];
    return { base, quote };
  }

  if (leftStable === rightStable) return null;

  const base = leftStable ? right : left;
  const quote = leftStable ? left : right;
  if (!CORE_BASE_TOKENS[network].has(base)) return null;

  return { base, quote };
};

const isTrackablePair = (network: NetworkName, tokenA: string, tokenB: string): boolean => {
  return getTrackableBaseQuote(network, tokenA, tokenB) !== null;
};

const loadDynamicPriorityTermsByNetwork = async (networks: string[]): Promise<{
  termsByNetwork: PriorityTermsByNetwork;
  meta: {
    runs: number;
    samples: number;
    pairs: number;
    penalizedPairs: number;
  };
}> => {
  const termsByNetwork: PriorityTermsByNetwork = {};
  const selectedNetworks = new Set<NetworkName>(
    (networks.length > 0 ? networks : ['ethereum'])
      .map((n) => toNetworkName(CHAIN_MAP[n] || n)),
  );

  const meta = { runs: 0, samples: 0, pairs: 0, penalizedPairs: 0 };
  if (!canAccessSupabaseRest()) return { termsByNetwork, meta };

  const windowSize = Math.max(5, Math.min(60, Math.round(parseNumberEnv(Deno.env.get('SCANNER_DYNAMIC_PRIORITY_WINDOW_RUNS'), 20))));
  const perNetworkLimit = Math.max(2, Math.min(16, Math.round(parseNumberEnv(Deno.env.get('SCANNER_DYNAMIC_PRIORITY_PAIRS_PER_NETWORK'), 8))));
  const minNetScore = Math.max(0.5, Math.min(6, parseNumberEnv(Deno.env.get('SCANNER_DYNAMIC_PRIORITY_MIN_NET_SCORE'), 1.5)));

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scanner_runs?select=diagnostics&order=started_at.desc&limit=${windowSize}`,
      {
        headers: {
          apikey: SUPABASE_REST_KEY,
          Authorization: `Bearer ${SUPABASE_REST_KEY}`,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) return { termsByNetwork, meta };

    const rows = await res.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) return { termsByNetwork, meta };
    meta.runs = rows.length;

    const overlapScoresByNetwork = new Map<NetworkName, Map<string, number>>();
    const penaltyScoresByNetwork = new Map<NetworkName, Map<string, number>>();

    const addScore = (target: Map<NetworkName, Map<string, number>>, network: NetworkName, term: string, score: number) => {
      if (!selectedNetworks.has(network)) return;
      if (!target.has(network)) target.set(network, new Map<string, number>());
      const bucket = target.get(network)!;
      bucket.set(term, (bucket.get(term) || 0) + score);
    };

    const toTrackableTerm = (network: NetworkName, tokenPair: string): string | null => {
      const [, pairRaw] = tokenPair.split(':');
      if (!pairRaw) return null;
      const [left, right] = pairRaw.split('/').map((token) => normalizeTokenSymbol(token || ''));
      if (!left || !right || left === right || !isTrackablePair(network, left, right)) return null;
      const trackable = getTrackableBaseQuote(network, left, right);
      if (!trackable) return null;
      return normalizeSearchTerm(`${trackable.base} ${trackable.quote}`);
    };

    for (const row of rows) {
      const diagnostics = toObjectSafe(row.diagnostics);
      if (!diagnostics) continue;
      const sameDexDetails = toObjectSafe(diagnostics.sameDexDetails);
      if (!sameDexDetails) continue;
      const samples = Array.isArray(sameDexDetails.samples) ? sameDexDetails.samples : [];

      for (const sampleRaw of samples) {
        const sample = toObjectSafe(sampleRaw);
        if (!sample) continue;
        const reason = String(sample.reason || '');
        if (reason !== 'insufficientQuotes' && reason !== 'insufficientDexOverlap') continue;

        const tokenPair = String(sample.tokenPair || '');
        const [networkRaw] = tokenPair.split(':');
        if (!networkRaw) continue;
        const network = toNetworkName(networkRaw);
        if (!selectedNetworks.has(network)) continue;

        const term = toTrackableTerm(network, tokenPair);
        if (!term) continue;

        if (reason === 'insufficientQuotes') {
          addScore(penaltyScoresByNetwork, network, term, 3);
          meta.penalizedPairs += 1;
          continue;
        }

        // insufficientDexOverlap can still benefit from targeted enrichment in moderation.
        addScore(overlapScoresByNetwork, network, term, 1.5);
        meta.samples += 1;
      }

      const rejectionSamples = Array.isArray(diagnostics.rejectionSamples) ? diagnostics.rejectionSamples : [];
      for (const sampleRaw of rejectionSamples) {
        const sample = toObjectSafe(sampleRaw);
        if (!sample) continue;
        const reason = String(sample.reason || '');
        if (reason !== 'slippage' && reason !== 'executionRisk' && reason !== 'badQuotes' && reason !== 'sameDex') continue;

        const tokenPair = String(sample.tokenPair || '');
        const [networkRaw] = tokenPair.split(':');
        if (!networkRaw) continue;
        const network = toNetworkName(networkRaw);
        if (!selectedNetworks.has(network)) continue;

        const term = toTrackableTerm(network, tokenPair);
        if (!term) continue;

        const penalty = reason === 'slippage'
          ? 2.5
          : reason === 'executionRisk'
            ? 2
            : reason === 'sameDex'
              ? 2.5
            : 1.25;
        addScore(penaltyScoresByNetwork, network, term, penalty);
      }
    }

    for (const network of selectedNetworks) {
      const overlap = overlapScoresByNetwork.get(network) || new Map<string, number>();
      const penalties = penaltyScoresByNetwork.get(network) || new Map<string, number>();
      const scored = Array.from(overlap.entries())
        .map(([term, score]) => {
          const penalty = penalties.get(term) || 0;
          const netScore = score - penalty;
          if (penalty > 0) meta.penalizedPairs += 1;
          return { term, netScore, score, penalty };
        })
        .filter((entry) => entry.netScore >= minNetScore)
        .sort((a, b) => {
          if (b.netScore !== a.netScore) return b.netScore - a.netScore;
          if (b.score !== a.score) return b.score - a.score;
          return a.penalty - b.penalty;
        })
        .slice(0, perNetworkLimit)
        .map((entry) => entry.term);
      if (scored.length > 0) {
        termsByNetwork[network] = scored;
        meta.pairs += scored.length;
      }
    }
  } catch {
    // Best-effort dynamic adaptation.
  }

  return { termsByNetwork, meta };
};

const upsertFallbackPool = (
  target: Pool[],
  candidate: Pool,
) => {
  const candidateLiquidity = parsePoolLiquidity(candidate);
  const existingIndex = target.findIndex((pool) =>
    pool.network === candidate.network &&
    pool.token0.symbol === candidate.token0.symbol &&
    pool.token1.symbol === candidate.token1.symbol &&
    (pool.feeTier ?? 0) === (candidate.feeTier ?? 0),
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
  } else {
    // Keep unknown DEX sources instead of dropping them entirely.
    // This improves cross-DEX coverage when providers use uncommon dex names.
    upsertFallbackPool(buckets.uniV2Pools, pool);
  }
};

const mergeFallbackPools = (
  target: Pool[],
  additions: Pool[],
) => {
  for (const pool of additions) upsertFallbackPool(target, pool);
};

const fetchDexScreenerFallback = async (
  networks: string[],
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
) => {
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((n) => toNetworkName(CHAIN_MAP[n] || n));
  const allowedChains = new Set(selectedNetworks);
  const dexScreenerMaxQueries = Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_DEXSCREENER_MAX_QUERIES'), 60)));
  const dexScreenerTokenQueries = Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_DEXSCREENER_TOKEN_QUERIES'), 12)));
  const searchTerms = buildPrioritizedFallbackTerms(selectedNetworks, {
    maxQueries: dexScreenerMaxQueries,
    priorityTermsByNetwork: dynamicPriorityTermsByNetwork,
  });
  const priorityTermSet = buildPriorityTermSetFromMap(selectedNetworks, dynamicPriorityTermsByNetwork);
  const priorityTokenAddresses = buildPriorityTokenAddresses(selectedNetworks, dynamicPriorityTermsByNetwork)
    .slice(0, dexScreenerTokenQueries);

  const uniV3Pools: Pool[] = [];
  const uniV2Pools: Pool[] = [];
  const sushiPools: Pool[] = [];
  const balancerPools: Pool[] = [];
  const curvePools: Pool[] = [];
  const meta = {
    queries: 0,
    responsesOk: 0,
    errors: 0,
    entriesSeen: 0,
    entriesAccepted: 0,
  };

  const fetchTerm = async (term: string) => {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return { ok: false as const, term };
    const json = await res.json();
    return { ok: true as const, term, pairs: Array.isArray(json?.pairs) ? (json.pairs as DexScreenerPair[]) : [] };
  };

  const fetchByTokenAddress = async (address: string) => {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return { ok: false as const, address };
    const json = await res.json();
    return { ok: true as const, address, pairs: Array.isArray(json?.pairs) ? (json.pairs as DexScreenerPair[]) : [] };
  };

  const processPairs = (pairs: DexScreenerPair[], liquidityFloorFixed: bigint) => {
    meta.entriesSeen += pairs.length;

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
      let priceUsdFixed = decimalToFixed(String(pair.priceUsd || '0'), FP_SCALE);
      if (priceUsdFixed <= 0n) continue;

      const liquidityUsdFixed = decimalToFixed(String(pair.liquidity?.usd || 0), USD_SCALE);
      if (liquidityUsdFixed < liquidityFloorFixed) continue;

      const dexBase = normalizeTokenSymbol(baseSymbol);
      const dexQuote = normalizeTokenSymbol(quoteSymbol);
      const canonicalBase = normalizeTokenSymbol(base);
      const canonicalQuote = normalizeTokenSymbol(quote);

      const baseAddress = extractEvmAddress(pair.baseToken?.address);
      const quoteAddress = extractEvmAddress(pair.quoteToken?.address);

      let token0Address = baseAddress;
      let token1Address = quoteAddress;
      if (dexBase !== canonicalBase) {
        if (dexBase === canonicalQuote && dexQuote === canonicalBase) {
          const priceNativeFixed = decimalToFixed(String(pair.priceNative || '0'), FP_SCALE);
          if (priceNativeFixed <= 0n) continue;
          priceUsdFixed = mulDiv(priceUsdFixed, FP_SCALE, priceNativeFixed);
          token0Address = quoteAddress;
          token1Address = baseAddress;
        } else {
          continue;
        }
      }

      const token0PriceFixed = priceUsdFixed;
      const token1PriceFixed = mulDiv(FP_SCALE, FP_SCALE, token0PriceFixed);
      if (token1PriceFixed <= 0n) continue;

      const pool: Pool = {
        token0: { symbol: base, address: token0Address },
        token1: { symbol: quote, address: token1Address },
        token0Price: fixedToNumber(token0PriceFixed, FP_SCALE, 12).toString(),
        token1Price: fixedToNumber(token1PriceFixed, FP_SCALE, 12).toString(),
        reserveUSD: fixedToNumber(liquidityUsdFixed, USD_SCALE, 6).toString(),
        network,
        sourceType: 'dexscreener',
      };

      routePoolByDex(String(pair.dexId || ''), pool, { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools });
      meta.entriesAccepted += 1;
    }
  };

  const searchResults = await Promise.allSettled(searchTerms.map(fetchTerm));
  meta.queries += searchTerms.length;

  for (const result of searchResults) {
    if (result.status === 'rejected') {
      meta.errors += 1;
      continue;
    }
    if (!result.value.ok) {
      meta.errors += 1;
      continue;
    }
    const normalizedTerm = normalizeSearchTerm(result.value.term);
    const liquidityFloorUsd = priorityTermSet.has(normalizedTerm)
      ? MIN_FALLBACK_LIQUIDITY_USD * PRIORITY_FALLBACK_LIQUIDITY_FRACTION
      : MIN_FALLBACK_LIQUIDITY_USD;
    const liquidityFloorFixed = decimalToFixed(liquidityFloorUsd, USD_SCALE);
    meta.responsesOk += 1;
    processPairs(result.value.pairs, liquidityFloorFixed);
  }

  if (priorityTokenAddresses.length > 0) {
    const tokenResults = await Promise.allSettled(priorityTokenAddresses.map(fetchByTokenAddress));
    meta.queries += priorityTokenAddresses.length;
    const priorityLiquidityFloorFixed = decimalToFixed(
      MIN_FALLBACK_LIQUIDITY_USD * PRIORITY_FALLBACK_LIQUIDITY_FRACTION,
      USD_SCALE,
    );

    for (const result of tokenResults) {
      if (result.status === 'rejected') {
        meta.errors += 1;
        continue;
      }
      if (!result.value.ok) {
        meta.errors += 1;
        continue;
      }
      meta.responsesOk += 1;
      processPairs(result.value.pairs, priorityLiquidityFloorFixed);
    }
  }

  return { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools, meta };
};

const fetchGeckoTerminalFallback = async (
  networks: string[],
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
) => {
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((n) => toNetworkName(CHAIN_MAP[n] || n));
  const allowedChains = new Set(selectedNetworks);
  const geckoMaxQueries = Math.max(1, Math.round(parseNumberEnv(Deno.env.get('SCANNER_GECKO_MAX_QUERIES'), 30)));
  const geckoTokenQueries = Math.max(0, Math.round(parseNumberEnv(Deno.env.get('SCANNER_GECKO_TOKEN_QUERIES'), 12)));
  const geckoTerms = buildPrioritizedFallbackTerms(selectedNetworks, {
    maxQueries: geckoMaxQueries,
    priorityTermsByNetwork: dynamicPriorityTermsByNetwork,
  });
  const priorityTermSet = buildPriorityTermSetFromMap(selectedNetworks, dynamicPriorityTermsByNetwork);
  const priorityTokenAddresses = buildPriorityTokenAddresses(selectedNetworks, dynamicPriorityTermsByNetwork)
    .slice(0, geckoTokenQueries);

  const uniV3Pools: Pool[] = [];
  const uniV2Pools: Pool[] = [];
  const sushiPools: Pool[] = [];
  const balancerPools: Pool[] = [];
  const curvePools: Pool[] = [];
  const meta = {
    queries: 0,
    responsesOk: 0,
    errors: 0,
    entriesSeen: 0,
    entriesAccepted: 0,
    rejectionReasons: {
      invalidNetworkMap: 0,
      networkNotRequested: 0,
      nonTrackablePair: 0,
      priceParseFail: 0,
      liquidityBelowMin: 0,
      baseQuoteOrientationMismatch: 0,
      orientationRecovered: 0,
      inversePriceFail: 0,
    },
  };

  const processEntries = (entries: GeckoSearchPool[], liquidityFloorFixed: bigint) => {
    meta.entriesSeen += entries.length;
    for (const entry of entries) {
      const attrs = entry.attributes || {};
      const entryIdNetwork = typeof entry.id === 'string' && entry.id.includes('_')
        ? entry.id.split('_')[0]
        : '';
      const baseTokenId = String(entry.relationships?.base_token?.data?.id || '');
      const baseTokenNetwork = baseTokenId.includes('_') ? baseTokenId.split('_')[0] : '';
      const quoteTokenId = String(entry.relationships?.quote_token?.data?.id || '');
      const quoteTokenNetwork = quoteTokenId.includes('_') ? quoteTokenId.split('_')[0] : '';

      const networkRaw = String(
        attrs.network ||
        entry.relationships?.network?.data?.id ||
        entryIdNetwork ||
        baseTokenNetwork ||
        quoteTokenNetwork ||
        '',
      ).toLowerCase();

      const mappedNetwork = GECKO_NETWORK_TO_APP[networkRaw] || GECKO_NETWORK_TO_APP[networkRaw.replace(/-.*$/, '')];
      if (!mappedNetwork) {
        meta.rejectionReasons.invalidNetworkMap += 1;
        continue;
      }
      if (!allowedChains.has(mappedNetwork)) {
        meta.rejectionReasons.networkNotRequested += 1;
        continue;
      }

      const parsedFromName = parseGeckoPoolNameSymbols(String(attrs.name || ''));
      const baseSymbol = String(attrs.base_token_symbol || parsedFromName?.baseSymbol || '');
      const quoteSymbol = String(attrs.quote_token_symbol || parsedFromName?.quoteSymbol || '');
      const trackablePair = getTrackableBaseQuote(mappedNetwork, baseSymbol, quoteSymbol);
      if (!trackablePair) {
        meta.rejectionReasons.nonTrackablePair += 1;
        continue;
      }

      const { base, quote } = trackablePair;
      const canonicalBase = normalizeTokenSymbol(base);
      const canonicalQuote = normalizeTokenSymbol(quote);
      const geckoBase = normalizeTokenSymbol(baseSymbol);
      const geckoQuote = normalizeTokenSymbol(quoteSymbol);
      const geckoBaseAddress = extractEvmAddress(
        attrs.base_token_address ||
        attrs.base_token_contract_address ||
        baseTokenId,
      );
      const geckoQuoteAddress = extractEvmAddress(
        attrs.quote_token_address ||
        attrs.quote_token_contract_address ||
        quoteTokenId,
      );
      let token0Address = geckoBaseAddress;
      let token1Address = geckoQuoteAddress;

      let priceUsdFixed = decimalToFixed(String(attrs.base_token_price_usd || attrs.price_in_usd || attrs.price_usd || '0'), FP_SCALE);
      if (geckoBase !== canonicalBase) {
        if (geckoBase === canonicalQuote && geckoQuote === canonicalBase) {
          const recoveredPriceUsdFixed = decimalToFixed(String(attrs.quote_token_price_usd || '0'), FP_SCALE);
          if (recoveredPriceUsdFixed > 0n) {
            priceUsdFixed = recoveredPriceUsdFixed;
            token0Address = geckoQuoteAddress;
            token1Address = geckoBaseAddress;
            meta.rejectionReasons.orientationRecovered += 1;
          } else {
            meta.rejectionReasons.priceParseFail += 1;
            continue;
          }
        } else {
          meta.rejectionReasons.baseQuoteOrientationMismatch += 1;
          continue;
        }
      }

      if (priceUsdFixed <= 0n) {
        meta.rejectionReasons.priceParseFail += 1;
        continue;
      }

      const liquidityUsdFixed = decimalToFixed(String(attrs.reserve_in_usd || attrs.liquidity_usd || '0'), USD_SCALE);
      if (liquidityUsdFixed < liquidityFloorFixed) {
        meta.rejectionReasons.liquidityBelowMin += 1;
        continue;
      }

      const token0PriceFixed = priceUsdFixed;
      const token1PriceFixed = mulDiv(FP_SCALE, FP_SCALE, token0PriceFixed);
      if (token1PriceFixed <= 0n) {
        meta.rejectionReasons.inversePriceFail += 1;
        continue;
      }

      const pool: Pool = {
        token0: { symbol: base, address: token0Address },
        token1: { symbol: quote, address: token1Address },
        token0Price: fixedToNumber(token0PriceFixed, FP_SCALE, 12).toString(),
        token1Price: fixedToNumber(token1PriceFixed, FP_SCALE, 12).toString(),
        reserveUSD: fixedToNumber(liquidityUsdFixed, USD_SCALE, 6).toString(),
        network: mappedNetwork,
        sourceType: 'gecko',
      };

      const dexId = String(entry.relationships?.dex?.data?.id || '');
      routePoolByDex(String(attrs.dex_name || attrs.exchange_name || dexId || ''), pool, {
        uniV3Pools,
        uniV2Pools,
        sushiPools,
        balancerPools,
        curvePools,
      });
      meta.entriesAccepted += 1;
    }
  };

  for (const term of geckoTerms) {
    try {
      meta.queries += 1;
      const normalizedTerm = normalizeSearchTerm(term);
      const liquidityFloorUsd = priorityTermSet.has(normalizedTerm)
        ? MIN_FALLBACK_LIQUIDITY_USD * PRIORITY_FALLBACK_LIQUIDITY_FRACTION
        : MIN_FALLBACK_LIQUIDITY_USD;
      const liquidityFloorFixed = decimalToFixed(liquidityFloorUsd, USD_SCALE);
      const url = `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(term)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        meta.errors += 1;
        continue;
      }
      meta.responsesOk += 1;

      const json = await res.json();
      const entries: GeckoSearchPool[] = Array.isArray(json?.data) ? json.data : [];
      processEntries(entries, liquidityFloorFixed);
    } catch {
      // Best-effort fallback source.
      meta.errors += 1;
    }
  }

  if (priorityTokenAddresses.length > 0) {
    const priorityLiquidityFloorFixed = decimalToFixed(
      MIN_FALLBACK_LIQUIDITY_USD * PRIORITY_FALLBACK_LIQUIDITY_FRACTION,
      USD_SCALE,
    );

    for (const network of selectedNetworks) {
      const geckoNetwork = APP_NETWORK_TO_GECKO[network];
      for (const address of priorityTokenAddresses) {
        try {
          meta.queries += 1;
          const normalizedAddress = address.toLowerCase();
          const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(geckoNetwork)}/tokens/${encodeURIComponent(normalizedAddress)}/pools?page=1`;
          const res = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) {
            meta.errors += 1;
            continue;
          }
          meta.responsesOk += 1;
          const json = await res.json();
          const entries: GeckoSearchPool[] = Array.isArray(json?.data) ? json.data : [];
          processEntries(entries, priorityLiquidityFloorFixed);
        } catch {
          meta.errors += 1;
        }
      }
    }
  }

  return { uniV3Pools, uniV2Pools, sushiPools, balancerPools, curvePools, meta };
};

const findSpreads = (
  uniV3Pools: Pool[],
  uniV2Pools: Pool[],
  sushiPools: Pool[],
  balancerPools: Pool[],
  curvePools: Pool[],
  sourceReliabilityBps: Record<'subgraph' | 'dexscreener' | 'gecko', bigint>,
  config: ScannerConfig,
  routeMemoryByKey: Map<string, RouteMemoryRecord>,
  executionFeedbackByRoute: Map<string, RouteExecutionFeedbackRecord>,
  dynamicPriorityTermsByNetwork?: PriorityTermsByNetwork,
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
      ? quoteSources.reduce((sum, source) => sum + (sourceReliabilityBps[source] ?? 0n), 0n) / BigInt(quoteSources.length)
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

  const canonicalizationStats = {
    totalPoolsSeen: 0,
    mapped: 0,
    droppedMissingSymbols: 0,
    droppedUntrackablePair: 0,
    droppedNonPositiveCanonicalPrice: 0,
    bySource: {
      subgraph: 0,
      dexscreener: 0,
      gecko: 0,
    },
  };

  const mapPrice = (p: Pool) => {
    const sourceType = p.sourceType || 'subgraph';
    canonicalizationStats.totalPoolsSeen += 1;
    if (sourceType === 'subgraph') canonicalizationStats.bySource.subgraph += 1;
    if (sourceType === 'dexscreener') canonicalizationStats.bySource.dexscreener += 1;
    if (sourceType === 'gecko') canonicalizationStats.bySource.gecko += 1;

    const network = toNetworkName(p.network);
    const token0 = normalizeSymbol(p.token0.symbol || '');
    const token1 = normalizeSymbol(p.token1.symbol || '');
    if (!token0 || !token1) {
      canonicalizationStats.droppedMissingSymbols += 1;
      return { key: '', price: 0, pool: p, network };
    }

    const trackablePair = getTrackableBaseQuote(network, token0, token1);
    if (!trackablePair) {
      canonicalizationStats.droppedUntrackablePair += 1;
      return { key: '', price: 0, pool: p, network };
    }

    const key = `${network}:${trackablePair.base}/${trackablePair.quote}`;

    const baseMatchesToken0 = normalizeSymbol(p.token0.symbol || '') === normalizeSymbol(trackablePair.base);
    const quoteMatchesToken1 = normalizeSymbol(p.token1.symbol || '') === normalizeSymbol(trackablePair.quote);
    const baseMatchesToken1 = normalizeSymbol(p.token1.symbol || '') === normalizeSymbol(trackablePair.base);
    const quoteMatchesToken0 = normalizeSymbol(p.token0.symbol || '') === normalizeSymbol(trackablePair.quote);

    // Canonical price = "quote per base" (e.g., USD per MKR, WETH per LINK) so the CPMM
    // formula (buyBaseReserve = buyQuoteReserveUsd / price) produces correct token reserve sizes.
    // token0Price = token0 per token1 = "base per quote" → we need the inverse (token1Price).
    // token1Price = token1 per token0 = "quote per base" → correct for (base=token0, quote=token1).
    const canonicalPriceFixed = (baseMatchesToken0 && quoteMatchesToken1)
      ? decimalToFixed(p.token1Price || '0', FP_SCALE)  // quote per base: token1/token0
      : (baseMatchesToken1 && quoteMatchesToken0)
        ? decimalToFixed(p.token0Price || '0', FP_SCALE) // quote per base: token0/token1
        : 0n;

    if (canonicalPriceFixed <= 0n) {
      canonicalizationStats.droppedNonPositiveCanonicalPrice += 1;
      return { key: '', price: 0, pool: p, network };
    }

    const price = fixedToNumber(canonicalPriceFixed, FP_SCALE, 12);
    canonicalizationStats.mapped += 1;
    return { key, price, pool: p, network };
  };

  const uniV3Map = new Map<string, { price: number; pool: Pool }>();
  const uniV2Map = new Map<string, { price: number; pool: Pool }>();
  const sushiMap = new Map<string, { price: number; pool: Pool }>();
  const balancerMap = new Map<string, { price: number; pool: Pool }>();
  const curveMap = new Map<string, { price: number; pool: Pool }>();

  for (const p of uniV3Pools || []) {
    const { key, price, pool } = mapPrice(p);
    if (!key || price <= 0) continue;
    // Encode fee tier in map key so multiple fee tiers for the same pair coexist.
    const v3Key = pool.feeTier ? `${key}@${pool.feeTier}` : key;
    uniV3Map.set(v3Key, { price, pool });
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
    if (!key || price <= 0) continue;
    // Curve and Balancer can have many pools per canonical (base/quote) pair (e.g., 3pool +
    // factory-stable-ng metapools all expose USDC/USDT). Keep the highest-TVL pool so noisy
    // low-TVL pools can't clobber the canonical anchor.
    const existing = balancerMap.get(key);
    if (!existing || Number(pool.reserveUSD || 0) > Number(existing.pool.reserveUSD || 0)) {
      balancerMap.set(key, { price, pool });
    }
  }

  for (const p of curvePools || []) {
    const { key, price, pool } = mapPrice(p);
    if (!key || price <= 0) continue;
    const existing = curveMap.get(key);
    if (!existing || Number(pool.reserveUSD || 0) > Number(existing.pool.reserveUSD || 0)) {
      curveMap.set(key, { price, pool });
    }
  }

  // Normalize TOKEN/WETH prices from "WETH per TOKEN" to "USD per TOKEN" so the CPMM
  // simulation (which uses USD loan amounts and USD liquidity) computes correct slippage/profit.
  // Step 1: derive WETH/USD price from existing WETH/USDC (or WETH/USDT) V3/V2/Sushi entries.
  const wethUsdPriceArr: number[] = [];
  for (const map of [uniV3Map, uniV2Map, sushiMap]) {
    for (const [k, entry] of map) {
      const baseKey = k.includes('@') ? k.split('@')[0] : k;
      if (baseKey.endsWith(':WETH/USDC') || baseKey.endsWith(':WETH/USDT') || baseKey.endsWith(':WETH/DAI')) {
        if (entry.price > 100 && entry.price < 100_000) wethUsdPriceArr.push(entry.price);
      }
    }
  }
  const wethUsdPrice = (() => {
    if (wethUsdPriceArr.length === 0) return 3500; // fallback if WETH/stable not yet indexed
    const s = [...wethUsdPriceArr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  })();
  // Step 2: convert all TOKEN/WETH prices from "WETH per TOKEN" (quote per base) to "USD per TOKEN"
  // by multiplying by wethUsdPrice so the CPMM (USD loan amounts + USD liquidity) is correct.
  for (const map of [uniV3Map, uniV2Map, sushiMap, balancerMap, curveMap]) {
    for (const [k, entry] of map) {
      const baseKey = k.includes('@') ? k.split('@')[0] : k;
      if (baseKey.endsWith('/WETH')) {
        map.set(k, { ...entry, price: entry.price * wethUsdPrice });
      }
    }
  }

  const opps: Opportunity[] = [];
  const watchlist: Opportunity[] = [];
  const keys = new Set<string>([
    // Strip "@feeTier" suffix so each pair appears once even with multiple fee tiers.
    ...[...uniV3Map.keys()].map((k) => k.includes('@') ? k.split('@')[0] : k),
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
    canonicalizationStats,
    sourcePolicy: {
      mode: config.sourcePolicyMode,
      useExternalRawFeed: config.useExternalRawFeed,
      notes: config.useExternalRawFeed
        ? 'External raw feed mode is enabled by config (diagnostics scaffold only).'
        : 'External raw feed mode is disabled; current scanner behavior unchanged.',
    },
    quoteFilterStats: {
      dexscreenerOutliersDropped: 0,
    },
    badQuoteDetails: {
      reasons: {
        invalidPriceSet: 0,
        nonPositiveOrInvalidCross: 0,
        unreasonableSpread: 0,
        unreasonableNearMissRoi: 0,
      },
      sourceComposition: {
        subgraphOnly: 0,
        fallbackOnly: 0,
        mixed: 0,
        subgraphDexscreener: 0,
        subgraphGecko: 0,
        dexscreenerOnly: 0,
        geckoOnly: 0,
        crossFallback: 0,
        unknownRoute: 0,
      },
      samples: [],
    },
    routeAlternativeInsights: {
      inspectedPairs: 0,
      samples: [],
    },
    policyDryRun: {
      enabled: true,
      summary: {
        preferSubgraph: {
          differentFromSelected: 0,
          selectedMixedExtreme: 0,
          selectedSubgraphAnchored: 0,
          medianFlipMarginScore: 0,
          minFlipMarginScore: 0,
          medianFlipMarginDistinctRouteScore: 0,
          minFlipMarginDistinctRouteScore: 0,
          medianFlipThresholdScore: 0,
          minFlipThresholdScore: 0,
          topTiePairs: 0,
        },
        preferExternalRaw: {
          differentFromSelected: 0,
          selectedMixedExtreme: 0,
          selectedSubgraphAnchored: 0,
          medianFlipMarginScore: 0,
          minFlipMarginScore: 0,
          medianFlipMarginDistinctRouteScore: 0,
          minFlipMarginDistinctRouteScore: 0,
          medianFlipThresholdScore: 0,
          minFlipThresholdScore: 0,
          topTiePairs: 0,
        },
      },
      calibrationHints: {
        preferSubgraph: {
          easiestPairs: [],
        },
        preferExternalRaw: {
          easiestPairs: [],
        },
      },
      samples: [],
    },
    sameDexDetails: {
      reasons: {
        insufficientQuotes: 0,
        insufficientValidPrices: 0,
        insufficientDexOverlap: 0,
        noCrossDexPositiveSpread: 0,
        missingBestPairEntries: 0,
      },
      sourceComposition: {
        subgraphOnly: 0,
        fallbackOnly: 0,
        mixed: 0,
      },
      samples: [],
    },
    rejectionSamples: [],
    routeMemory: {
      loadedRoutes: routeMemoryByKey.size,
      suppressedByCooldown: 0,
      penalizedByHistory: 0,
      maxPenaltyUsd: 0,
      suppressedSamples: [],
      penalizedSamples: [],
    },
    executionRiskDetails: {
      reasons: {
        routeCooldown: 0,
        noExecutableSize: 0,
        payloadBuildFailed: 0,
        realtimeQuoteVerification: 0,
      },
      noExecutableByGate: createNoExecutableReasonCounts(),
      samples: [],
    },
    executionFeedback: {
      loadedRoutes: executionFeedbackByRoute.size,
      penalizedRoutes: 0,
      relievedRoutes: 0,
      maxPenaltyUsd: 0,
      maxReliefUsd: 0,
      samples: [],
    },
  };

  const recordSameDexDetail = (
    tokenPair: string,
    quotes: Array<{ dex: Opportunity['buyDex']; price: number; pool: Pool }>,
    reason: 'insufficientQuotes' | 'insufficientValidPrices' | 'insufficientDexOverlap' | 'noCrossDexPositiveSpread' | 'missingBestPairEntries',
  ) => {
    const sourceSet = new Set<'subgraph' | 'dexscreener' | 'gecko'>(
      quotes.map((q) => q.pool.sourceType || 'subgraph'),
    );

    if (sourceSet.size === 1 && sourceSet.has('subgraph')) {
      diagnostics.sameDexDetails!.sourceComposition.subgraphOnly += 1;
    } else if (sourceSet.size === 1) {
      diagnostics.sameDexDetails!.sourceComposition.fallbackOnly += 1;
    } else {
      diagnostics.sameDexDetails!.sourceComposition.mixed += 1;
    }

    diagnostics.sameDexDetails!.reasons[reason] += 1;
    if (diagnostics.sameDexDetails!.samples.length < 15) {
      diagnostics.sameDexDetails!.samples.push({
        tokenPair,
        reason,
        quoteCount: quotes.length,
        dexes: Array.from(new Set(quotes.map((q) => q.dex))),
        sources: Array.from(sourceSet),
      });
    }
  };

  const normalizeSourceType = (value: string | undefined): 'subgraph' | 'dexscreener' | 'gecko' => {
    if (value === 'dexscreener') return 'dexscreener';
    if (value === 'gecko') return 'gecko';
    return 'subgraph';
  };

  const recordBadQuoteDetail = (
    tokenPair: string,
    reason: 'invalidPriceSet' | 'nonPositiveOrInvalidCross' | 'unreasonableSpread' | 'unreasonableNearMissRoi',
    options?: {
      buyDex?: Opportunity['buyDex'];
      sellDex?: Opportunity['sellDex'];
      spread?: number;
      buySource?: string;
      sellSource?: string;
      quoteSources?: Array<string | undefined>;
    },
  ) => {
    const details = diagnostics.badQuoteDetails;
    if (!details) return;
    details.reasons[reason] += 1;

    const buySource = options?.buySource ? normalizeSourceType(options.buySource) : undefined;
    const sellSource = options?.sellSource ? normalizeSourceType(options.sellSource) : undefined;

    if (buySource && sellSource) {
      if (buySource === 'subgraph' && sellSource === 'subgraph') {
        details.sourceComposition.subgraphOnly += 1;
      } else if (buySource !== 'subgraph' && sellSource !== 'subgraph') {
        details.sourceComposition.fallbackOnly += 1;
      } else {
        details.sourceComposition.mixed += 1;
      }

      if ((buySource === 'subgraph' && sellSource === 'dexscreener') || (buySource === 'dexscreener' && sellSource === 'subgraph')) {
        details.sourceComposition.subgraphDexscreener += 1;
      } else if ((buySource === 'subgraph' && sellSource === 'gecko') || (buySource === 'gecko' && sellSource === 'subgraph')) {
        details.sourceComposition.subgraphGecko += 1;
      } else if (buySource === 'dexscreener' && sellSource === 'dexscreener') {
        details.sourceComposition.dexscreenerOnly += 1;
      } else if (buySource === 'gecko' && sellSource === 'gecko') {
        details.sourceComposition.geckoOnly += 1;
      } else if (buySource !== sellSource && buySource !== 'subgraph' && sellSource !== 'subgraph') {
        details.sourceComposition.crossFallback += 1;
      }
    } else {
      const quoteSources = (options?.quoteSources || []).map((source) => normalizeSourceType(source));
      if (quoteSources.length === 0) {
        details.sourceComposition.unknownRoute += 1;
      } else {
        const sourceSet = new Set(quoteSources);
        if (sourceSet.size === 1 && sourceSet.has('subgraph')) {
          details.sourceComposition.subgraphOnly += 1;
        } else if (sourceSet.size === 1) {
          details.sourceComposition.fallbackOnly += 1;
        } else {
          details.sourceComposition.mixed += 1;
        }
      }
    }

    if (details.samples.length < 12) {
      details.samples.push({
        tokenPair,
        reason,
        buyDex: options?.buyDex,
        sellDex: options?.sellDex,
        buySource,
        sellSource,
        spread: options?.spread,
      });
    }
  };

  const sourceComboTag = (
    buySource: 'subgraph' | 'dexscreener' | 'gecko',
    sellSource: 'subgraph' | 'dexscreener' | 'gecko',
    spreadBps: number,
  ): 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other' => {
    const mixed = buySource !== sellSource;
    if (mixed && ((buySource === 'subgraph' && sellSource === 'dexscreener') || (buySource === 'dexscreener' && sellSource === 'subgraph')) && spreadBps >= 2_000) {
      return 'selected_mixed_extreme';
    }
    if (mixed) return 'selected_mixed';
    if (buySource === 'subgraph' || sellSource === 'subgraph') return 'selected_subgraph_anchored';
    return 'selected_other';
  };

  const policyAdjustmentForRoute = (
    mode: SourcePolicyMode,
    useExternalRawFeed: boolean,
    buySource: 'subgraph' | 'dexscreener' | 'gecko',
    sellSource: 'subgraph' | 'dexscreener' | 'gecko',
  ): bigint => {
    const hasSubgraph = buySource === 'subgraph' || sellSource === 'subgraph';
    const fallbackOnly = !hasSubgraph;
    const mixed = buySource !== sellSource;
    const involvesGecko = buySource === 'gecko' || sellSource === 'gecko';

    if (mode === 'prefer_subgraph') {
      if (hasSubgraph && !mixed) return 400_000n;
      if (hasSubgraph) return 250_000n;
      return -300_000n;
    }

    if (mode === 'prefer_external_raw') {
      if (!useExternalRawFeed) return 0n;
      if (fallbackOnly && !mixed) return 450_000n;
      if (fallbackOnly) return 300_000n;
      if (mixed) return 100_000n;
      return -250_000n;
    }

    // Neutral mode still needs a light quality bias so noisy mixed-source routes do not
    // eclipse cleaner subgraph-anchored candidates before quote sanity checks run.
    if (hasSubgraph && !mixed) return 160_000n;
    if (hasSubgraph && mixed) return involvesGecko ? -240_000n : -120_000n;
    if (fallbackOnly && !mixed) return -180_000n;
    return -260_000n;
  };

  const selectRouteForPolicy = (
    routeCandidates: Array<{
      buy: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      sell: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      score: bigint;
      spreadBps: number;
      minLiquidityUsd: number;
      buySource: 'subgraph' | 'dexscreener' | 'gecko';
      sellSource: 'subgraph' | 'dexscreener' | 'gecko';
    }>,
    mode: SourcePolicyMode,
    useExternalRawFeed: boolean,
  ) => {
    let best: (typeof routeCandidates)[number] | undefined;
    let bestAdjusted: bigint | undefined;
    let secondBestAdjusted: bigint | undefined;

    for (const candidate of routeCandidates) {
      const adjusted = candidate.score + policyAdjustmentForRoute(
        mode,
        useExternalRawFeed,
        candidate.buySource,
        candidate.sellSource,
      );
      if (!best || bestAdjusted === undefined || adjusted > bestAdjusted) {
        if (bestAdjusted !== undefined) {
          secondBestAdjusted = bestAdjusted;
        }
        best = candidate;
        bestAdjusted = adjusted;
      } else if (secondBestAdjusted === undefined || adjusted > secondBestAdjusted) {
        secondBestAdjusted = adjusted;
      }
    }

    return best
      ? {
        candidate: best,
        adjustedScore: bestAdjusted ?? best.score,
        marginToNext: bestAdjusted !== undefined && secondBestAdjusted !== undefined
          ? bestAdjusted - secondBestAdjusted
          : 0n,
        topTieCount: bestAdjusted !== undefined
          ? routeCandidates.reduce((count, candidate) => {
            const adjusted = candidate.score + policyAdjustmentForRoute(
              mode,
              useExternalRawFeed,
              candidate.buySource,
              candidate.sellSource,
            );
            return adjusted === bestAdjusted ? count + 1 : count;
          }, 0)
          : 1,
        marginToNextDistinctRoute: bestAdjusted !== undefined
          ? (() => {
            const bestBuyDex = best.buy.dex;
            const bestSellDex = best.sell.dex;
            let bestDistinctAdjusted: bigint | undefined;
            for (const candidate of routeCandidates) {
              if (candidate.buy.dex === bestBuyDex && candidate.sell.dex === bestSellDex) continue;
              const adjusted = candidate.score + policyAdjustmentForRoute(
                mode,
                useExternalRawFeed,
                candidate.buySource,
                candidate.sellSource,
              );
              if (bestDistinctAdjusted === undefined || adjusted > bestDistinctAdjusted) {
                bestDistinctAdjusted = adjusted;
              }
            }
            if (bestDistinctAdjusted === undefined) return 0n;
            return bestAdjusted - bestDistinctAdjusted;
          })()
          : 0n,
        distinctChallenger: bestAdjusted !== undefined
          ? (() => {
            const bestBuyDex = best.buy.dex;
            const bestSellDex = best.sell.dex;
            let bestDistinctCandidate: (typeof routeCandidates)[number] | undefined;
            let bestDistinctAdjusted: bigint | undefined;
            for (const candidate of routeCandidates) {
              if (candidate.buy.dex === bestBuyDex && candidate.sell.dex === bestSellDex) continue;
              const adjusted = candidate.score + policyAdjustmentForRoute(
                mode,
                useExternalRawFeed,
                candidate.buySource,
                candidate.sellSource,
              );
              if (bestDistinctAdjusted === undefined || adjusted > bestDistinctAdjusted) {
                bestDistinctAdjusted = adjusted;
                bestDistinctCandidate = candidate;
              }
            }
            return bestDistinctCandidate;
          })()
          : undefined,
      }
      : null;
  };

  const evaluateRouteEarlyGate = (
    routeCandidate: {
      buy: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      sell: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      spreadBps: number;
      buySource: 'subgraph' | 'dexscreener' | 'gecko';
      sellSource: 'subgraph' | 'dexscreener' | 'gecko';
    },
  ): {
    earlyGate: 'pass' | 'badQuotes' | 'spread';
    spreadPercent: number;
    decisionTag: 'selected_mixed_extreme' | 'selected_mixed' | 'selected_subgraph_anchored' | 'selected_other';
  } => {
    const buyPriceFixed = decimalToFixed(routeCandidate.buy.price, FP_SCALE);
    const sellPriceFixed = decimalToFixed(routeCandidate.sell.price, FP_SCALE);
    if (buyPriceFixed <= 0n || sellPriceFixed <= buyPriceFixed) {
      return {
        earlyGate: 'badQuotes',
        spreadPercent: 0,
        decisionTag: sourceComboTag(routeCandidate.buySource, routeCandidate.sellSource, routeCandidate.spreadBps),
      };
    }

    const spreadFractionFixed = mulDiv(sellPriceFixed - buyPriceFixed, FP_SCALE, buyPriceFixed);
    const maxSpreadFixed = decimalToFixed(MAX_REASONABLE_SPREAD_FRACTION, FP_SCALE);
    const spreadPercent = fixedToNumber(mulDiv(spreadFractionFixed, 100n * FP_SCALE, FP_SCALE), FP_SCALE, 6);
    if (spreadFractionFixed <= 0n || spreadFractionFixed > maxSpreadFixed) {
      return {
        earlyGate: 'badQuotes',
        spreadPercent,
        decisionTag: sourceComboTag(routeCandidate.buySource, routeCandidate.sellSource, routeCandidate.spreadBps),
      };
    }

    const fallbackOnlyRoute = routeCandidate.buySource !== 'subgraph' && routeCandidate.sellSource !== 'subgraph';
    const sameFallbackSourceRoute = fallbackOnlyRoute && routeCandidate.buySource === routeCandidate.sellSource;
    const sourceAdjustedMinSpreadPercent = config.minSpreadPercent
      + (fallbackOnlyRoute ? 0.12 : 0)
      + (sameFallbackSourceRoute ? 0.08 : 0);

    return {
      earlyGate: spreadPercent < sourceAdjustedMinSpreadPercent ? 'spread' : 'pass',
      spreadPercent,
      decisionTag: sourceComboTag(routeCandidate.buySource, routeCandidate.sellSource, routeCandidate.spreadBps),
    };
  };

  const findBestRealtimeQuoteForDex = (
    targetDex: Opportunity['buyDex'],
    selectedPrice: number,
    pairQuotes: Array<{ dex: string; price: number; pool: Pool }>,
  ): { dex: Opportunity['buyDex']; price: number; pool: Pool } | null => {
    const matches = pairQuotes
      .filter((quote) => normalizeSourceType(quote.pool.sourceType) !== 'subgraph')
      .filter((quote) => canonicalizeDex(quote.dex) === targetDex)
      .sort((left, right) => {
        const liquidityDiff = parsePoolLiquidity(right.pool) - parsePoolLiquidity(left.pool);
        if (liquidityDiff !== 0) return liquidityDiff;
        return Math.abs(left.price - selectedPrice) - Math.abs(right.price - selectedPrice);
      });

    if (matches.length === 0) return null;
    const best = matches[0];
    return {
      dex: targetDex,
      price: best.price,
      pool: best.pool,
    };
  };

  const policyFlipMargins: {
    preferSubgraph: bigint[];
    preferExternalRaw: bigint[];
    preferSubgraphDistinctRoute: bigint[];
    preferExternalRawDistinctRoute: bigint[];
    preferSubgraphFlipThreshold: bigint[];
    preferExternalRawFlipThreshold: bigint[];
  } = {
    preferSubgraph: [],
    preferExternalRaw: [],
    preferSubgraphDistinctRoute: [],
    preferExternalRawDistinctRoute: [],
    preferSubgraphFlipThreshold: [],
    preferExternalRawFlipThreshold: [],
  };

  const flipThresholdFromMargin = (marginToDistinctRoute: bigint): bigint => (
    marginToDistinctRoute > 0n ? marginToDistinctRoute + 1n : 1n
  );

  for (const key of keys) {
    const quotes: Array<{ dex: string; price: number; pool: Pool }> = [];
    // Collect all V3 fee-tier entries for this pair (key "pairKey@feeTier" or "pairKey").
    const v3EntriesRaw = [...uniV3Map.entries()]
      .filter(([k]) => k === key || k.startsWith(`${key}@`))
      .map(([k, v]) => {
        const feeTier = k.includes('@') ? parseInt(k.split('@')[1] ?? '0', 10) : v.pool.feeTier;
        const effectiveDex = feeTier ? `Uniswap V3 (${feeTier})` : 'Uniswap V3';
        return { effectiveDex, price: v.price, pool: v.pool };
      });

    // Outlier rejection: drop V3 entries whose price deviates >1000x from the median.
    // Prevents scam/fake tokens (same symbol, different address) from creating fake spreads.
    const v3Entries = (() => {
      if (v3EntriesRaw.length < 2) return v3EntriesRaw;
      const sorted = [...v3EntriesRaw].sort((a, b) => a.price - b.price);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0
        ? sorted[mid].price
        : (sorted[mid - 1].price + sorted[mid].price) / 2;
      return v3EntriesRaw.filter((e) => {
        const ratio = e.price > median ? e.price / median : median / e.price;
        return ratio <= 1000;
      });
    })();
    for (const v3e of v3Entries) quotes.push({ dex: v3e.effectiveDex, price: v3e.price, pool: v3e.pool });
    const v2 = uniV2Map.get(key);
    const sushi = sushiMap.get(key);
    const balancer = balancerMap.get(key);
    const curve = curveMap.get(key);

    if (v2) quotes.push({ dex: 'Uniswap V2', price: v2.price, pool: v2.pool });
    if (sushi) quotes.push({ dex: 'SushiSwap', price: sushi.price, pool: sushi.pool });
    if (balancer) quotes.push({ dex: 'Balancer', price: balancer.price, pool: balancer.pool });
    if (curve) quotes.push({ dex: 'Curve', price: curve.price, pool: curve.pool });

    // Cross-DEX outlier rejection: if any quote's price is >1000x from median of all quotes,
    // it's a scam token or inverted price; drop the outlier quote(s).
    if (quotes.length >= 2) {
      const allPrices = quotes.map((q) => q.price).filter((p) => p > 0).sort((a, b) => a - b);
      const mid = Math.floor(allPrices.length / 2);
      const crossMedian = allPrices.length % 2 !== 0
        ? allPrices[mid]
        : (allPrices[mid - 1] + allPrices[mid]) / 2;
      quotes.splice(0, quotes.length, ...quotes.filter((q) => {
        if (q.price <= 0) return false;
        const ratio = q.price > crossMedian ? q.price / crossMedian : crossMedian / q.price;
        return ratio <= 1000;
      }));
    }

    for (const quote of quotes) {
      const source = quote.pool.sourceType || 'subgraph';
      if (source === 'subgraph') diagnostics.quoteSourceCounts.subgraph += 1;
      if (source === 'dexscreener') diagnostics.quoteSourceCounts.dexscreener += 1;
      if (source === 'gecko') diagnostics.quoteSourceCounts.gecko += 1;
    }
    if (quotes.length < 2) {
      diagnostics.droppedBySameDex++;
      recordSameDexDetail(key, quotes, 'insufficientQuotes');
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'sameDex' });
      continue;
    }

    const prices = quotes.map((q) => q.price).filter((p) => p > 0);
    if (prices.length < 2) {
      diagnostics.droppedBySameDex++;
      recordSameDexDetail(key, quotes, 'insufficientValidPrices');
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'sameDex' });
      continue;
    }

    const [networkPart] = key.split(':');
    const pairNetwork = toNetworkName(networkPart);
    const isPriorityOverlapPair = getPriorityOverlapPairKeys(dynamicPriorityTermsByNetwork).has(key);
    // Count distinct venues: different DEX names OR same DEX with different fee tiers (e.g. V3 0.05% vs 0.3%)
    const venueSet = new Set(quotes.map((quote) => {
      const dex = canonicalizeDex(quote.dex);
      const fee = quote.pool.feeTier ?? 0;
      return dex === 'Uniswap V3' ? `${dex}:${fee}` : dex;
    }));
    const dexCount = venueSet.size;
    const sourceSet = new Set(quotes.map((quote) => quote.pool.sourceType || 'subgraph'));
    const hasSubgraphAnchor = sourceSet.has('subgraph');
    const fallbackOnlySingleSource = !hasSubgraphAnchor && sourceSet.size === 1;
    const uniqueQuoteCount = quotes.length;
    const maxQuoteLiquidityUsd = Math.max(...quotes.map((quote) => parsePoolLiquidity(quote.pool)));
    const maxObservedPrice = Math.max(...prices);
    const minObservedPrice = Math.min(...prices);
    const quoteDispersionBps = minObservedPrice > 0
      ? ((maxObservedPrice - minObservedPrice) / minObservedPrice) * 10_000
      : Number.POSITIVE_INFINITY;
    const minQuotesRequired = isPriorityOverlapPair
      ? 2
      : (pairNetwork === 'ethereum' ? 3 : 2);
    const allowHighQualityAnchorBypass = !isPriorityOverlapPair
      && pairNetwork === 'ethereum'
      && uniqueQuoteCount >= 3
      && maxQuoteLiquidityUsd >= (config.minLiquidityUsd * 1.5)
      && quoteDispersionBps <= 120;
    const requireSubgraphAnchor = !isPriorityOverlapPair
      && pairNetwork === 'ethereum'
      && uniqueQuoteCount < 4
      && !allowHighQualityAnchorBypass;
    const allowPrioritySingleSourceOverlap = isPriorityOverlapPair && dexCount >= 2 && uniqueQuoteCount >= 2;
    const allowHighQualitySingleSourceOverlap = !isPriorityOverlapPair
      && pairNetwork === 'ethereum'
      && fallbackOnlySingleSource
      && dexCount >= 3
      && uniqueQuoteCount >= 3
      && maxQuoteLiquidityUsd >= (config.minLiquidityUsd * 2)
      && quoteDispersionBps <= 80;

    // Hard overlap-quality gate: avoid weak fallback-only same-source pair snapshots.
    if (
      dexCount < 2
      || (fallbackOnlySingleSource && !allowPrioritySingleSourceOverlap && !allowHighQualitySingleSourceOverlap)
      || uniqueQuoteCount < minQuotesRequired
      || (requireSubgraphAnchor && !hasSubgraphAnchor)
    ) {
      diagnostics.droppedBySameDex++;
      recordSameDexDetail(key, quotes, 'insufficientDexOverlap');
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'sameDex' });
      continue;
    }

    diagnostics.candidates++;

    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    if (minPrice <= 0) {
      diagnostics.droppedByBadQuotes++;
      recordBadQuoteDetail(key, 'invalidPriceSet', {
        quoteSources: quotes.map((q) => q.pool.sourceType),
      });
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
    const routeCandidates: Array<{
      buy: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      sell: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      score: bigint;
      spreadBps: number;
      minLiquidityUsd: number;
      buySource: 'subgraph' | 'dexscreener' | 'gecko';
      sellSource: 'subgraph' | 'dexscreener' | 'gecko';
    }> = [];
    const topRouteCandidates: Array<{
      buy: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      sell: { dex: Opportunity['buyDex']; price: number; pool: Pool };
      score: bigint;
      spreadBps: number;
      minLiquidityUsd: number;
      buySource: 'subgraph' | 'dexscreener' | 'gecko';
      sellSource: 'subgraph' | 'dexscreener' | 'gecko';
    }> = [];

    for (const buy of buys) {
      for (const sell of sells) {
        // Allow same-named DEX when fee tiers differ (e.g. Uniswap V3 0.05% vs 0.3%) — these are
        // fully separate liquidity pools and can diverge in price.
        const sameDexSameFee = buy.dex === sell.dex
          && (buy.pool.feeTier ?? 0) === (sell.pool.feeTier ?? 0);
        if (sameDexSameFee) continue;
        if (sell.price <= buy.price) continue;
        const buyLiquidity = parsePoolLiquidity(buy.pool);
        const sellLiquidity = parsePoolLiquidity(sell.pool);

        const buyPriceFixed = decimalToFixed(buy.price, FP_SCALE);
        const sellPriceFixed = decimalToFixed(sell.price, FP_SCALE);
        if (buyPriceFixed <= 0n || sellPriceFixed <= buyPriceFixed) continue;

        const spreadBps = mulDiv(sellPriceFixed - buyPriceFixed, 10_000n, buyPriceFixed);
        const cappedSpreadBpsForScore = spreadBps > 600n ? 600n : spreadBps;
        const liquidityFloorUsdFixed = decimalToFixed(Math.min(buyLiquidity, sellLiquidity), USD_SCALE);
        const liquidityCapUsdFixed = decimalToFixed(2_000_000, USD_SCALE);
        const cappedLiquidityFixed = liquidityFloorUsdFixed > liquidityCapUsdFixed ? liquidityCapUsdFixed : liquidityFloorUsdFixed;
        const liquidityBps = mulDiv(cappedLiquidityFixed, 10_000n, liquidityCapUsdFixed);

        const buySource = buy.pool.sourceType || 'subgraph';
        const sellSource = sell.pool.sourceType || 'subgraph';
        const sourceDiversityBonus = buySource === sellSource
          ? 0n
          : 900_000n;
        const subgraphAnchorBonus = (buySource === 'subgraph' || sellSource === 'subgraph')
          ? 150_000n
          : 0n;
        const fallbackOnlyPenalty = (buySource !== 'subgraph' && sellSource !== 'subgraph')
          ? 600_000n
          : 0n;
        const sameFallbackSourcePenalty = (buySource === sellSource && buySource !== 'subgraph')
          ? 900_000n
          : 0n;

        // Heavily prioritize spread, then use liquidity as deterministic tie-breaker.
        const score = cappedSpreadBpsForScore * 100_000n
          + liquidityBps
          + sourceDiversityBonus
          + subgraphAnchorBonus
          - fallbackOnlyPenalty
          - sameFallbackSourcePenalty;
        if (!bestPair || score > bestPair.score) {
          bestPair = { buy: { ...buy, dex: canonicalizeDex(buy.dex) }, sell: { ...sell, dex: canonicalizeDex(sell.dex) }, score };
        }

        const routeCandidate = {
          buy: { ...buy, dex: canonicalizeDex(buy.dex) },
          sell: { ...sell, dex: canonicalizeDex(sell.dex) },
          score,
          spreadBps: Number(spreadBps),
          minLiquidityUsd: Math.min(buyLiquidity, sellLiquidity),
          buySource: normalizeSourceType(buySource),
          sellSource: normalizeSourceType(sellSource),
        };

        routeCandidates.push(routeCandidate);
        topRouteCandidates.push(routeCandidate);
        topRouteCandidates.sort((a, b) => {
          if (a.score === b.score) return 0;
          return a.score > b.score ? -1 : 1;
        });
        if (topRouteCandidates.length > 2) {
          topRouteCandidates.length = 2;
        }
      }
    }

    if (topRouteCandidates.length > 0) {
      diagnostics.routeAlternativeInsights!.inspectedPairs += 1;
      if (diagnostics.routeAlternativeInsights!.samples.length < 12) {
        const selected = topRouteCandidates[0];
        const alternate = topRouteCandidates[1];
        diagnostics.routeAlternativeInsights!.samples.push({
          tokenPair: key,
          selected: {
            buyDex: selected.buy.dex,
            sellDex: selected.sell.dex,
            buySource: selected.buySource,
            sellSource: selected.sellSource,
            spreadBps: selected.spreadBps,
            minLiquidityUsd: selected.minLiquidityUsd,
            score: Number(selected.score),
          },
          alternate: alternate
            ? {
              buyDex: alternate.buy.dex,
              sellDex: alternate.sell.dex,
              buySource: alternate.buySource,
              sellSource: alternate.sellSource,
              spreadBps: alternate.spreadBps,
              minLiquidityUsd: alternate.minLiquidityUsd,
              score: Number(alternate.score),
            }
            : undefined,
          decisionTag: sourceComboTag(selected.buySource, selected.sellSource, selected.spreadBps),
        });
      }

      const live = topRouteCandidates[0];
      const preferSubgraph = selectRouteForPolicy(routeCandidates, 'prefer_subgraph', config.useExternalRawFeed);
      const preferExternalRaw = selectRouteForPolicy(routeCandidates, 'prefer_external_raw', config.useExternalRawFeed);

      if (preferSubgraph) {
        policyFlipMargins.preferSubgraph.push(preferSubgraph.marginToNext);
        policyFlipMargins.preferSubgraphDistinctRoute.push(preferSubgraph.marginToNextDistinctRoute);
        const preferSubgraphFlipThreshold = flipThresholdFromMargin(preferSubgraph.marginToNextDistinctRoute);
        policyFlipMargins.preferSubgraphFlipThreshold.push(preferSubgraphFlipThreshold);
        if (preferSubgraph.topTieCount > 1) {
          diagnostics.policyDryRun!.summary.preferSubgraph.topTiePairs += 1;
        }
        if (
          preferSubgraph.candidate.buy.dex !== live.buy.dex
          || preferSubgraph.candidate.sell.dex !== live.sell.dex
        ) {
          diagnostics.policyDryRun!.summary.preferSubgraph.differentFromSelected += 1;
        }
        const tag = sourceComboTag(
          preferSubgraph.candidate.buySource,
          preferSubgraph.candidate.sellSource,
          preferSubgraph.candidate.spreadBps,
        );
        if (tag === 'selected_mixed_extreme') diagnostics.policyDryRun!.summary.preferSubgraph.selectedMixedExtreme += 1;
        if (tag === 'selected_subgraph_anchored') diagnostics.policyDryRun!.summary.preferSubgraph.selectedSubgraphAnchored += 1;
      }

      if (preferExternalRaw) {
        policyFlipMargins.preferExternalRaw.push(preferExternalRaw.marginToNext);
        policyFlipMargins.preferExternalRawDistinctRoute.push(preferExternalRaw.marginToNextDistinctRoute);
        const preferExternalRawFlipThreshold = flipThresholdFromMargin(preferExternalRaw.marginToNextDistinctRoute);
        policyFlipMargins.preferExternalRawFlipThreshold.push(preferExternalRawFlipThreshold);
        if (preferExternalRaw.topTieCount > 1) {
          diagnostics.policyDryRun!.summary.preferExternalRaw.topTiePairs += 1;
        }
        if (
          preferExternalRaw.candidate.buy.dex !== live.buy.dex
          || preferExternalRaw.candidate.sell.dex !== live.sell.dex
        ) {
          diagnostics.policyDryRun!.summary.preferExternalRaw.differentFromSelected += 1;
        }
        const tag = sourceComboTag(
          preferExternalRaw.candidate.buySource,
          preferExternalRaw.candidate.sellSource,
          preferExternalRaw.candidate.spreadBps,
        );
        if (tag === 'selected_mixed_extreme') diagnostics.policyDryRun!.summary.preferExternalRaw.selectedMixedExtreme += 1;
        if (tag === 'selected_subgraph_anchored') diagnostics.policyDryRun!.summary.preferExternalRaw.selectedSubgraphAnchored += 1;
      }

      if (diagnostics.policyDryRun!.samples.length < 12) {
        const liveDecisionTag = sourceComboTag(live.buySource, live.sellSource, live.spreadBps);
        diagnostics.policyDryRun!.samples.push({
          tokenPair: key,
          liveDecisionTag,
          live: {
            buyDex: live.buy.dex,
            sellDex: live.sell.dex,
            buySource: live.buySource,
            sellSource: live.sellSource,
            spreadBps: live.spreadBps,
            score: Number(live.score),
          },
          preferSubgraph: preferSubgraph
            ? {
              buyDex: preferSubgraph.candidate.buy.dex,
              sellDex: preferSubgraph.candidate.sell.dex,
              buySource: preferSubgraph.candidate.buySource,
              sellSource: preferSubgraph.candidate.sellSource,
              spreadBps: preferSubgraph.candidate.spreadBps,
              score: Number(preferSubgraph.adjustedScore),
              marginToDistinctRouteScore: Number(preferSubgraph.marginToNextDistinctRoute),
              flipThresholdScore: Number(flipThresholdFromMargin(preferSubgraph.marginToNextDistinctRoute)),
              challenger: preferSubgraph.distinctChallenger
                ? {
                  buyDex: preferSubgraph.distinctChallenger.buy.dex,
                  sellDex: preferSubgraph.distinctChallenger.sell.dex,
                  buySource: preferSubgraph.distinctChallenger.buySource,
                  sellSource: preferSubgraph.distinctChallenger.sellSource,
                  ...evaluateRouteEarlyGate(preferSubgraph.distinctChallenger),
                }
                : undefined,
            }
            : undefined,
          preferExternalRaw: preferExternalRaw
            ? {
              buyDex: preferExternalRaw.candidate.buy.dex,
              sellDex: preferExternalRaw.candidate.sell.dex,
              buySource: preferExternalRaw.candidate.buySource,
              sellSource: preferExternalRaw.candidate.sellSource,
              spreadBps: preferExternalRaw.candidate.spreadBps,
              score: Number(preferExternalRaw.adjustedScore),
              marginToDistinctRouteScore: Number(preferExternalRaw.marginToNextDistinctRoute),
              flipThresholdScore: Number(flipThresholdFromMargin(preferExternalRaw.marginToNextDistinctRoute)),
              challenger: preferExternalRaw.distinctChallenger
                ? {
                  buyDex: preferExternalRaw.distinctChallenger.buy.dex,
                  sellDex: preferExternalRaw.distinctChallenger.sell.dex,
                  buySource: preferExternalRaw.distinctChallenger.buySource,
                  sellSource: preferExternalRaw.distinctChallenger.sellSource,
                  ...evaluateRouteEarlyGate(preferExternalRaw.distinctChallenger),
                }
                : undefined,
            }
            : undefined,
        });
      }
    }

    if (!bestPair) {
      diagnostics.droppedBySameDex++;
      recordSameDexDetail(key, quotes, 'noCrossDexPositiveSpread');
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'sameDex' });
      continue;
    }

    const buyEntry = bestPair.buy;
    const sellEntry = bestPair.sell;

    if (!buyEntry || !sellEntry) {
      diagnostics.droppedBySameDex++;
      recordSameDexDetail(key, quotes, 'missingBestPairEntries');
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'sameDex' });
      continue;
    }

    const sellPriceFixed = decimalToFixed(sellEntry.price, FP_SCALE);
    const buyPriceFixed = decimalToFixed(buyEntry.price, FP_SCALE);
    if (sellPriceFixed <= buyPriceFixed || buyPriceFixed <= 0n) {
      diagnostics.droppedByBadQuotes++;
      recordBadQuoteDetail(key, 'nonPositiveOrInvalidCross', {
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        spread: 0,
        buySource: buyEntry.pool.sourceType,
        sellSource: sellEntry.pool.sourceType,
      });
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'badQuotes', buyDex: buyEntry.dex, sellDex: sellEntry.dex, spread: 0 });
      continue;
    }

    const spreadFractionFixed = mulDiv(sellPriceFixed - buyPriceFixed, FP_SCALE, buyPriceFixed);
    const maxSpreadFixed = decimalToFixed(MAX_REASONABLE_SPREAD_FRACTION, FP_SCALE);
    if (spreadFractionFixed <= 0n || spreadFractionFixed > maxSpreadFixed) {
      diagnostics.droppedByBadQuotes++;
      recordBadQuoteDetail(key, 'unreasonableSpread', {
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        spread: fixedToNumber(mulDiv(spreadFractionFixed, 100n * FP_SCALE, FP_SCALE), FP_SCALE, 6),
        buySource: buyEntry.pool.sourceType,
        sellSource: sellEntry.pool.sourceType,
      });
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'badQuotes', buyDex: buyEntry.dex, sellDex: sellEntry.dex, spread: fixedToNumber(mulDiv(spreadFractionFixed, 100n * FP_SCALE, FP_SCALE), FP_SCALE, 6) });
      continue;
    }

    const spreadBps = mulDiv(spreadFractionFixed, 10_000n, FP_SCALE);
    const spread = Number(spreadBps) / 100;
    const buySource = buyEntry.pool.sourceType || 'subgraph';
    const sellSource = sellEntry.pool.sourceType || 'subgraph';
    const fallbackOnlyRoute = buySource !== 'subgraph' && sellSource !== 'subgraph';
    const sameFallbackSourceRoute = fallbackOnlyRoute && buySource === sellSource;
    const sourceAdjustedMinSpreadPercent = config.minSpreadPercent
      + (fallbackOnlyRoute ? 0.12 : 0)
      + (sameFallbackSourceRoute ? 0.08 : 0);

    if (spread < sourceAdjustedMinSpreadPercent) {
      diagnostics.droppedBySpread++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'spread', buyDex: buyEntry.dex, sellDex: sellEntry.dex, spread });
      continue;
    }

    const buyLiquidityUsd = parsePoolLiquidity(buyEntry.pool);
    const sellLiquidityUsd = parsePoolLiquidity(sellEntry.pool);
    const network = toNetworkName(buyEntry.pool.network || sellEntry.pool.network);

    // Gas-adjusted minimum spread gate: skip pairs whose spread can't realistically cover gas.
    // ETH mainnet gas ~$42 on $8k loan requires ≥0.55% gross spread just to break even.
    // L2s (gas ~$0.31) need only ≈0.005% — effectively no gate needed.
    const gasUsdForNetwork = estimateGasUsdForNetwork(network, config);
    const networkLoanForSpreadGate = config.perNetworkLoanAmountUsd?.[network] ?? config.loanAmountUsd;
    const gasAdjustedMinSpreadPercent = (gasUsdForNetwork / networkLoanForSpreadGate) * 100 * 1.4;
    if (spread < gasAdjustedMinSpreadPercent && gasAdjustedMinSpreadPercent > sourceAdjustedMinSpreadPercent) {
      diagnostics.droppedBySpread++;
      pushRejectionSample(diagnostics, { tokenPair: key, reason: 'spread', buyDex: buyEntry.dex, sellDex: sellEntry.dex, spread });
      continue;
    }
    const minNetProfitUsd = getRequiredActiveNetProfitUsd(config, network);
    const routeMemoryKey = buildRouteMemoryKey(network, key, buyEntry.dex, sellEntry.dex);
    const routeMemory = routeMemoryByKey.get(routeMemoryKey);
    const executionFeedback = executionFeedbackByRoute.get(routeMemoryKey);

    if (routeMemory?.cooldownUntil) {
      const cooldownUntilTs = Date.parse(routeMemory.cooldownUntil);
      if (Number.isFinite(cooldownUntilTs) && cooldownUntilTs > Date.now()) {
        diagnostics.routeMemory!.suppressedByCooldown += 1;
        if (diagnostics.routeMemory!.suppressedSamples.length < 5) {
          diagnostics.routeMemory!.suppressedSamples.push({
            routeKey: routeMemoryKey,
            tokenPair: key,
            buyDex: buyEntry.dex,
            sellDex: sellEntry.dex,
            cooldownUntil: routeMemory.cooldownUntil,
          });
        }
        diagnostics.droppedByExecutionRisk += 1;
        diagnostics.executionRiskDetails!.reasons.routeCooldown += 1;
        if (diagnostics.executionRiskDetails!.samples.length < 8) {
          diagnostics.executionRiskDetails!.samples.push({
            tokenPair: key,
            buyDex: buyEntry.dex,
            sellDex: sellEntry.dex,
            cause: 'routeCooldown',
            detail: routeMemory?.cooldownUntil,
          });
        }
        pushRejectionSample(diagnostics, {
          tokenPair: key,
          reason: 'executionRisk',
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
        });
        continue;
      }
    }

    const historicalPenaltyUsd = routeMemory && routeMemory.avgRealizedNet < 0
      ? Math.min(20, Math.abs(routeMemory.avgRealizedNet) * 0.35)
      : 0;
    if (historicalPenaltyUsd > 0) {
      diagnostics.routeMemory!.penalizedByHistory += 1;
      diagnostics.routeMemory!.maxPenaltyUsd = Math.max(diagnostics.routeMemory!.maxPenaltyUsd, historicalPenaltyUsd);
      if (diagnostics.routeMemory!.penalizedSamples.length < 5) {
        diagnostics.routeMemory!.penalizedSamples.push({
          routeKey: routeMemoryKey,
          tokenPair: key,
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
          avgRealizedNet: routeMemory?.avgRealizedNet ?? 0,
          penaltyUsd: historicalPenaltyUsd,
        });
      }
    }
    const executionPenaltyUsd = executionFeedback ? executionFeedback.penaltyUsd : 0;
    const executionReliefUsd = executionFeedback ? executionFeedback.reliefUsd : 0;

    if (executionFeedback && executionFeedback.attempts >= 3) {
      if (executionPenaltyUsd > 0) {
        diagnostics.executionFeedback!.penalizedRoutes += 1;
        diagnostics.executionFeedback!.maxPenaltyUsd = Math.max(diagnostics.executionFeedback!.maxPenaltyUsd, executionPenaltyUsd);
      }
      if (executionReliefUsd > 0) {
        diagnostics.executionFeedback!.relievedRoutes += 1;
        diagnostics.executionFeedback!.maxReliefUsd = Math.max(diagnostics.executionFeedback!.maxReliefUsd, executionReliefUsd);
      }
      if (diagnostics.executionFeedback!.samples.length < 8) {
        diagnostics.executionFeedback!.samples.push({
          routeKey: routeMemoryKey,
          successRate: executionFeedback.successRate,
          attempts: executionFeedback.attempts,
          penaltyUsd: executionPenaltyUsd,
          reliefUsd: executionReliefUsd,
        });
      }
    }

    const effectiveMinNetProfitUsd = Math.max(0, minNetProfitUsd + historicalPenaltyUsd + executionPenaltyUsd - executionReliefUsd);
    // Use the MINIMUM of the two trade-side pools — the thin side limits profitability
    const liquidityUsd = Math.min(buyLiquidityUsd, sellLiquidityUsd);
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

    const executionEvaluation = evaluateExecutionCandidate(
      buyEntry.price,
      sellEntry.price,
      buyEntry.pool,
      sellEntry.pool,
      buyEntry.dex,
      sellEntry.dex,
      network,
      config,
    );
    const executionCandidate = executionEvaluation.candidate;
    if (!executionCandidate) {
      const networkLoanUsd = config.perNetworkLoanAmountUsd?.[network] ?? config.loanAmountUsd;
      const requestedLoanAmount = Math.min(networkLoanUsd, Math.min(buyLiquidityUsd, sellLiquidityUsd) * config.maxLiquidityUsageFraction);
      const minNetEdgeBpsRequired = getMinNetEdgeBpsForNetwork(config, network);
      const minNetByEdgeRequestedLoan = (requestedLoanAmount * minNetEdgeBpsRequired) / 10_000;
      const effectiveRequiredNetRequestedLoan = Math.max(effectiveMinNetProfitUsd, minNetByEdgeRequestedLoan);
      const cpmmNearMiss = simulateVirtualCpmmRoundTrip(
        buyEntry.price,
        sellEntry.price,
        buyLiquidityUsd,
        sellLiquidityUsd,
        requestedLoanAmount,
        dexSwapFeeBps[buyEntry.dex],
        dexSwapFeeBps[sellEntry.dex],
      );
      const buyImpactBps = cpmmNearMiss ? Math.round(cpmmNearMiss.buyImpactBps) : estimateSlippageBps(requestedLoanAmount, buyLiquidityUsd);
      const sellImpactBps = cpmmNearMiss ? Math.round(cpmmNearMiss.sellImpactBps) : estimateSlippageBps(requestedLoanAmount, sellLiquidityUsd);
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
        const requestedLoanFixed = decimalToFixed(requestedLoanAmount, USD_SCALE);
        const gasCostFixed = decimalToFixed(estimateGasUsdForNetwork(network, config), USD_SCALE);

        const grossProfitFixed = cpmmNearMiss
          ? decimalToFixed(cpmmNearMiss.grossProfitUsd, USD_SCALE)
          : 0n;
        const nearMissNetProfitFixed = grossProfitFixed - mulDiv(requestedLoanFixed, BigInt(routePenaltyBps), 10_000n) - gasCostFixed;
        const maxReasonableProfitFixed = mulDiv(requestedLoanFixed, decimalToFixed(MAX_REASONABLE_ROI_FRACTION, FP_SCALE), FP_SCALE);
        if (grossProfitFixed > maxReasonableProfitFixed || nearMissNetProfitFixed > maxReasonableProfitFixed) {
          diagnostics.droppedByBadQuotes++;
          recordBadQuoteDetail(key, 'unreasonableNearMissRoi', {
            buyDex: buyEntry.dex,
            sellDex: sellEntry.dex,
            spread,
            buySource: buyEntry.pool.sourceType,
            sellSource: sellEntry.pool.sourceType,
          });
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
            distanceToExecutableUsd: Math.max(0, effectiveRequiredNetRequestedLoan - nearMissNetProfit),
            gasCost,
            confidenceScore: confidenceScoreDeterministic({
              base: 30,
              spreadBps,
              spreadMultiplier: 55,
              slippageBps: BigInt(buyImpactBps + sellImpactBps + routePenaltyBps),
              slippageDivisor: 7,
              minScore: 1,
              maxScore: 70,
            }),
            confidenceTier: 'low',
            spread: spread.toFixed(4),
            liquidity: liquidityUsd.toFixed(0),
            estimatedSlippageBps: buyImpactBps + sellImpactBps + routePenaltyBps,
            buyImpactBps,
            sellImpactBps,
            routePenaltyBps,
            quoteSources: [
              buyEntry.pool.sourceType || 'subgraph',
              sellEntry.pool.sourceType || 'subgraph',
            ],
            mathDiagnostics: buildMathDiagnostics({
              loanAmountUsd: requestedLoanAmount,
              spreadBps,
              grossProfitUsd: grossProfit,
              buyLiquidityUsd,
              sellLiquidityUsd,
              gasCostUsd: gasCost,
              passReason: 'watchlist-non-positive-net',
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
          distanceToExecutableUsd: Math.max(0, effectiveRequiredNetRequestedLoan - nearMissNetProfit),
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
      diagnostics.executionRiskDetails!.reasons.noExecutableSize += 1;
      if (executionEvaluation.noExecutableReasons) {
        for (const gate of NO_EXECUTABLE_REASON_KEYS) {
          diagnostics.executionRiskDetails!.noExecutableByGate![gate] += executionEvaluation.noExecutableReasons[gate] || 0;
        }
      }
      const dominantNoExecutableReason = topNoExecutableReason(executionEvaluation.noExecutableReasons);
      if (diagnostics.executionRiskDetails!.samples.length < 8) {
        diagnostics.executionRiskDetails!.samples.push({
          tokenPair: key,
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
          cause: 'noExecutableSize',
          detail: dominantNoExecutableReason,
        });
      }
      continue;
    }

    diagnostics.executionFeasible++;

    const minNetEdgeBpsRequired = getMinNetEdgeBpsForNetwork(config, network);
    const minNetByEdgeExecutionLoan = (executionCandidate.executableLoanAmount * minNetEdgeBpsRequired) / 10_000;
    const effectiveRequiredNetExecutionLoan = Math.max(effectiveMinNetProfitUsd, minNetByEdgeExecutionLoan);

    if (executionCandidate.netProfit < effectiveRequiredNetExecutionLoan) {
      if (executionCandidate.grossProfit <= executionCandidate.gasCost || executionCandidate.netProfit <= 0) {
        diagnostics.droppedByNetProfit++;
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
          distanceToExecutableUsd: Math.max(0, effectiveRequiredNetExecutionLoan - executionCandidate.netProfit),
          gasCost: executionCandidate.gasCost,
          confidenceScore: confidenceScoreDeterministic({
            base: 34,
            spreadBps,
            spreadMultiplier: 60,
            slippageBps: BigInt(executionCandidate.estimatedSlippageBps),
            slippageDivisor: 7,
            minScore: 1,
            maxScore: 70,
          }),
          confidenceTier: 'low',
          spread: spread.toFixed(4),
          liquidity: liquidityUsd.toFixed(0),
          estimatedSlippageBps: executionCandidate.estimatedSlippageBps,
          buyImpactBps: executionCandidate.buyImpactBps,
          sellImpactBps: executionCandidate.sellImpactBps,
          routePenaltyBps: executionCandidate.routePenaltyBps,
          quoteSources: [
            buyEntry.pool.sourceType || 'subgraph',
            sellEntry.pool.sourceType || 'subgraph',
          ],
          mathDiagnostics: buildMathDiagnostics({
            loanAmountUsd: executionCandidate.executableLoanAmount,
            spreadBps,
            grossProfitUsd: executionCandidate.grossProfit,
            buyLiquidityUsd,
            sellLiquidityUsd,
            gasCostUsd: executionCandidate.gasCost,
            passReason: 'watchlist-non-positive-net',
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
        distanceToExecutableUsd: Math.max(0, effectiveRequiredNetExecutionLoan - executionCandidate.netProfit),
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
    const finalOpportunityCandidate = hasFullRealtimeCoverage && realtimeVerificationCandidate
      ? realtimeVerificationCandidate
      : executionCandidate;
    const finalQuoteSources = hasFullRealtimeCoverage
      ? [
        buyVerificationEntry!.pool.sourceType || 'subgraph',
        sellVerificationEntry!.pool.sourceType || 'subgraph',
      ]
      : quoteSources;

    if (finalOpportunityCandidate.executableLoanAmount < config.loanAmountUsd) {
      diagnostics.sizeAdjusted++;
    }

    const confidenceScore = confidenceScoreDeterministic({
      base: 58,
      spreadBps,
      spreadMultiplier: 90,
      slippageBps: BigInt(finalOpportunityCandidate.estimatedSlippageBps),
      slippageDivisor: 5,
      minScore: 1,
      maxScore: 99,
      netProfitUsd: finalOpportunityCandidate.netProfit,
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

    const selectedBuySource = normalizeSourceType(buyEntry.pool.sourceType);
    const selectedSellSource = normalizeSourceType(sellEntry.pool.sourceType);
    const buyVerificationEntry = selectedBuySource !== 'subgraph'
      ? buyEntry
      : findBestRealtimeQuoteForDex(buyEntry.dex, buyEntry.price, quotes);
    const sellVerificationEntry = selectedSellSource !== 'subgraph'
      ? sellEntry
      : findBestRealtimeQuoteForDex(sellEntry.dex, sellEntry.price, quotes);
    const hasFullRealtimeCoverage = Boolean(buyVerificationEntry && sellVerificationEntry);
    const selectedHasRealtimeSource = selectedBuySource !== 'subgraph' || selectedSellSource !== 'subgraph';
    const realtimeCoverageCount = Number(Boolean(buyVerificationEntry)) + Number(Boolean(sellVerificationEntry));
    const requiresStrictRealtimeVerification = network === 'polygon' || !selectedHasRealtimeSource;
    const strongPartialRealtimeSignal = (
      !requiresStrictRealtimeVerification
      && selectedHasRealtimeSource
      && executionCandidate.netProfit >= Math.max(
        effectiveRequiredNetExecutionLoan * 1.6,
        effectiveRequiredNetExecutionLoan + Math.max(8, estimateGasUsdForNetwork(network, config)),
      )
      && liquidityUsd >= (config.minLiquidityUsd * (network === 'ethereum' ? 1.5 : 1.25))
      && spread >= (sourceAdjustedMinSpreadPercent + (network === 'ethereum' ? 0.15 : 0.08))
    );
    const realtimeVerification = hasFullRealtimeCoverage
      ? evaluateExecutionCandidate(
        buyVerificationEntry!.price,
        sellVerificationEntry!.price,
        buyVerificationEntry!.pool,
        sellVerificationEntry!.pool,
        buyEntry.dex,
        sellEntry.dex,
        network,
        config,
      )
      : { candidate: null, noExecutableReasons: undefined };
    const realtimeVerificationCandidate = realtimeVerification.candidate;
    const realtimeVerificationPassed = (
      (hasFullRealtimeCoverage
        && !!realtimeVerificationCandidate
        && realtimeVerificationCandidate.netProfit >= effectiveRequiredNetExecutionLoan)
      || strongPartialRealtimeSignal
    );

    if (!realtimeVerificationPassed) {
      diagnostics.droppedByExecutionRisk++;
      diagnostics.executionRiskDetails!.reasons.realtimeQuoteVerification += 1;
      if (diagnostics.executionRiskDetails!.samples.length < 8) {
        diagnostics.executionRiskDetails!.samples.push({
          tokenPair: key,
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
          cause: 'realtimeQuoteVerification',
          detail: hasFullRealtimeCoverage
            ? (
              realtimeVerificationCandidate
                ? `live-net-below-threshold:${realtimeVerificationCandidate.netProfit.toFixed(2)}`
                : 'live-route-not-executable'
            )
            : `live-coverage-${realtimeCoverageCount}-of-2`,
        });
      }
      pushRejectionSample(diagnostics, {
        tokenPair: key,
        reason: 'executionRisk',
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        spread,
      });

      const verificationCandidate = realtimeVerificationCandidate || executionCandidate;
      const verificationQuoteSources = hasFullRealtimeCoverage
        ? [
          buyVerificationEntry!.pool.sourceType || 'subgraph',
          sellVerificationEntry!.pool.sourceType || 'subgraph',
        ]
        : quoteSources;
      const verificationDistanceFloor = network === 'polygon'
        ? Math.max(30, effectiveRequiredNetExecutionLoan, config.minNetProfitUsd * 2)
        : Math.max(20, effectiveRequiredNetExecutionLoan, config.minNetProfitUsd * 1.5);

      diagnostics.watchlistCount++;
      watchlist.push({
        tokenPair: key,
        buyDex: buyEntry.dex,
        sellDex: sellEntry.dex,
        network,
        loanAmount: config.loanAmountUsd,
        executableLoanAmount: verificationCandidate.executableLoanAmount,
        grossProfit: verificationCandidate.grossProfit,
        netProfit: verificationCandidate.netProfit,
        distanceToExecutableUsd: Math.max(
          Math.max(0, effectiveRequiredNetExecutionLoan - verificationCandidate.netProfit),
          verificationDistanceFloor,
        ),
        gasCost: verificationCandidate.gasCost,
        confidenceScore: confidenceScoreDeterministic({
          base: 32,
          spreadBps,
          spreadMultiplier: 55,
          slippageBps: BigInt(verificationCandidate.estimatedSlippageBps),
          slippageDivisor: 6,
          minScore: 1,
          maxScore: 72,
        }),
        confidenceTier: strongPartialRealtimeSignal ? 'medium' : 'low',
        spread: spread.toFixed(4),
        liquidity: liquidityUsd.toFixed(0),
        estimatedSlippageBps: verificationCandidate.estimatedSlippageBps,
        buyImpactBps: verificationCandidate.buyImpactBps,
        sellImpactBps: verificationCandidate.sellImpactBps,
        routePenaltyBps: verificationCandidate.routePenaltyBps,
        quoteSources: verificationQuoteSources,
        status: 'watchlist',
        mathDiagnostics: buildMathDiagnostics({
          loanAmountUsd: verificationCandidate.executableLoanAmount,
          spreadBps,
          grossProfitUsd: verificationCandidate.grossProfit,
          buyLiquidityUsd,
          sellLiquidityUsd,
          gasCostUsd: verificationCandidate.gasCost,
          passReason: strongPartialRealtimeSignal
            ? 'watchlist-awaiting-full-live-verification'
            : 'watchlist-live-verification-blocked',
        }),
      });
      continue;
    }

    const { payload: executionPayload, error: executionPayloadError } = buildExecutionPayload(
      buyEntry.pool,
      sellEntry.pool,
      buyEntry.dex,
      sellEntry.dex,
      key,
      network,
      finalOpportunityCandidate.executableLoanAmount,
      finalOpportunityCandidate.grossProfit,
      finalOpportunityCandidate.netProfit,
      finalOpportunityCandidate.gasCost,
      finalOpportunityCandidate.estimatedSlippageBps,
      confidenceScore,
      hasFullRealtimeCoverage && buyVerificationEntry ? buyVerificationEntry.price : buyEntry.price,
      // For TOKEN/WETH pairs the loan is WETH; pass wethUsdPrice so the amount is correctly scaled.
      key.endsWith('/WETH') ? wethUsdPrice : 1,
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
      diagnostics.executionRiskDetails!.reasons.payloadBuildFailed += 1;
      if (diagnostics.executionRiskDetails!.samples.length < 8) {
        diagnostics.executionRiskDetails!.samples.push({
          tokenPair: key,
          buyDex: buyEntry.dex,
          sellDex: sellEntry.dex,
          cause: 'payloadBuildFailed',
          detail: executionPayloadError || undefined,
        });
      }
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
        distanceToExecutableUsd: Math.max(0, effectiveRequiredNetExecutionLoan - executionCandidate.netProfit),
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
      executableLoanAmount: finalOpportunityCandidate.executableLoanAmount,
      grossProfit: finalOpportunityCandidate.grossProfit,
      netProfit: finalOpportunityCandidate.netProfit,
      distanceToExecutableUsd: Math.max(0, minNetProfitUsd - finalOpportunityCandidate.netProfit),
      gasCost: finalOpportunityCandidate.gasCost,
      confidenceScore,
      confidenceTier,
      spread: spread.toFixed(4),
      liquidity: liquidityUsd.toFixed(0),
      estimatedSlippageBps: finalOpportunityCandidate.estimatedSlippageBps,
      buyImpactBps: finalOpportunityCandidate.buyImpactBps,
      sellImpactBps: finalOpportunityCandidate.sellImpactBps,
      routePenaltyBps: finalOpportunityCandidate.routePenaltyBps,
      quoteSources: finalQuoteSources,
      status: 'active',
      mathDiagnostics: buildMathDiagnostics({
        loanAmountUsd: finalOpportunityCandidate.executableLoanAmount,
        spreadBps,
        grossProfitUsd: finalOpportunityCandidate.grossProfit,
        buyLiquidityUsd,
        sellLiquidityUsd,
        gasCostUsd: finalOpportunityCandidate.gasCost,
        passReason: hasFullRealtimeCoverage
          ? 'active-profit-qualified-live-verified'
          : 'active-profit-qualified',
      }),
      executionPayload: executionPayload || undefined,
    });
  }

  const computePolicyMarginStats = (margins: bigint[]) => {
    if (margins.length === 0) return { median: 0, min: 0 };
    const sorted = [...margins].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? Number((sorted[mid - 1] + sorted[mid]) / 2n)
      : Number(sorted[mid]);
    const min = Number(sorted[0]);
    return { median, min };
  };

  {
    const subgraphStats = computePolicyMarginStats(policyFlipMargins.preferSubgraph);
    const externalRawStats = computePolicyMarginStats(policyFlipMargins.preferExternalRaw);
    const subgraphDistinctStats = computePolicyMarginStats(policyFlipMargins.preferSubgraphDistinctRoute);
    const externalRawDistinctStats = computePolicyMarginStats(policyFlipMargins.preferExternalRawDistinctRoute);
    const subgraphFlipThresholdStats = computePolicyMarginStats(policyFlipMargins.preferSubgraphFlipThreshold);
    const externalRawFlipThresholdStats = computePolicyMarginStats(policyFlipMargins.preferExternalRawFlipThreshold);
    diagnostics.policyDryRun!.summary.preferSubgraph.medianFlipMarginScore = subgraphStats.median;
    diagnostics.policyDryRun!.summary.preferSubgraph.minFlipMarginScore = subgraphStats.min;
    diagnostics.policyDryRun!.summary.preferSubgraph.medianFlipMarginDistinctRouteScore = subgraphDistinctStats.median;
    diagnostics.policyDryRun!.summary.preferSubgraph.minFlipMarginDistinctRouteScore = subgraphDistinctStats.min;
    diagnostics.policyDryRun!.summary.preferSubgraph.medianFlipThresholdScore = subgraphFlipThresholdStats.median;
    diagnostics.policyDryRun!.summary.preferSubgraph.minFlipThresholdScore = subgraphFlipThresholdStats.min;
    diagnostics.policyDryRun!.summary.preferExternalRaw.medianFlipMarginScore = externalRawStats.median;
    diagnostics.policyDryRun!.summary.preferExternalRaw.minFlipMarginScore = externalRawStats.min;
    diagnostics.policyDryRun!.summary.preferExternalRaw.medianFlipMarginDistinctRouteScore = externalRawDistinctStats.median;
    diagnostics.policyDryRun!.summary.preferExternalRaw.minFlipMarginDistinctRouteScore = externalRawDistinctStats.min;
    diagnostics.policyDryRun!.summary.preferExternalRaw.medianFlipThresholdScore = externalRawFlipThresholdStats.median;
    diagnostics.policyDryRun!.summary.preferExternalRaw.minFlipThresholdScore = externalRawFlipThresholdStats.min;

    const easiestSubgraphPairs = diagnostics.policyDryRun!.samples
      .filter((sample) => sample.preferSubgraph)
      .map((sample) => ({
        tokenPair: sample.tokenPair,
        liveDecisionTag: sample.liveDecisionTag,
        flipThresholdScore: sample.preferSubgraph!.flipThresholdScore,
        marginToDistinctRouteScore: sample.preferSubgraph!.marginToDistinctRouteScore,
        challenger: sample.preferSubgraph!.challenger,
      }))
      .sort((a, b) => a.flipThresholdScore - b.flipThresholdScore)
      .slice(0, 6);

    const easiestExternalRawPairs = diagnostics.policyDryRun!.samples
      .filter((sample) => sample.preferExternalRaw)
      .map((sample) => ({
        tokenPair: sample.tokenPair,
        liveDecisionTag: sample.liveDecisionTag,
        flipThresholdScore: sample.preferExternalRaw!.flipThresholdScore,
        marginToDistinctRouteScore: sample.preferExternalRaw!.marginToDistinctRouteScore,
        challenger: sample.preferExternalRaw!.challenger,
      }))
      .sort((a, b) => a.flipThresholdScore - b.flipThresholdScore)
      .slice(0, 6);

    diagnostics.policyDryRun!.calibrationHints.preferSubgraph.easiestPairs = easiestSubgraphPairs;
    diagnostics.policyDryRun!.calibrationHints.preferExternalRaw.easiestPairs = easiestExternalRawPairs;
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
  const selectedNetworks = (networks.length > 0 ? networks : ['ethereum'])
    .map((n) => toNetworkName(CHAIN_MAP[n] || n));
  const allowedNetworks = new Set<NetworkName>(selectedNetworks);

  // Parse feature toggles for market-data fallback sources.
  const enableDexScreener = config.enableDexScreenerFallback;
  const enableGecko = config.enableGeckoFallback;

  const dynamicPriority = await loadDynamicPriorityTermsByNetwork(networks);

  // Empty fallback structure for disabled sources.
  const emptyFallback = { uniV3Pools: [], uniV2Pools: [], sushiPools: [], balancerPools: [], curvePools: [] };

  // Run subgraph fetches (always) and conditionally enable market-data fallbacks.
  const [
    subgraphResults,
    arbSubgraphResults,
    prioritySubgraph,
    dexFallback,
    geckoFallback,
    indexedQuotePools,
    routeMemoryByKey,
    sourceReliability,
    executionFeedbackByRoute,
  ] = await Promise.all([
    Promise.allSettled([
      fetchSubgraphWithFallback(UNI_V3_SUBGRAPH, UNI_V3_SUBGRAPH_PUBLIC, topPairsQuery(200)),
      fetchSubgraphWithFallback(UNI_V2_SUBGRAPH, UNI_V2_SUBGRAPH_PUBLIC, topV2PairsQuery(200)),
      fetchSubgraphWithFallback(SUSHI_SUBGRAPH, SUSHI_SUBGRAPH_PUBLIC, topV2PairsQuery(200)),
      fetchSubgraphWithFallback(BALANCER_SUBGRAPH, BALANCER_SUBGRAPH_PUBLIC, topBalancerPoolsQuery(100)),
      fetchCurveOfficialPools(),
    ]),
    // Arbitrum-specific subgraphs: fetched only when Arbitrum is in the requested networks.
    networks.includes('arbitrum')
      ? Promise.allSettled([
          fetchSubgraphWithFallback(UNI_V3_ARB_SUBGRAPH, UNI_V3_ARB_SUBGRAPH_PUBLIC, topPairsQuery(200)),
          fetchSubgraphWithFallback(SUSHI_ARB_SUBGRAPH, SUSHI_ARB_SUBGRAPH_PUBLIC, topV2PairsQuery(200)),
        ])
      : Promise.resolve([] as PromiseSettledResult<unknown>[]),
    fetchPriorityPairSubgraphPools(networks, dynamicPriority.termsByNetwork),
    enableDexScreener ? fetchDexScreenerFallback(networks, dynamicPriority.termsByNetwork) : Promise.resolve(emptyFallback),
    enableGecko ? fetchGeckoTerminalFallback(networks, dynamicPriority.termsByNetwork) : Promise.resolve(emptyFallback),
    loadIndexedQuotePools(networks),
    loadRouteMemoryByKey(),
    loadSourceReliabilityBps(),
    loadExecutionFeedbackByRoute(),
  ]);

  const [uniV3Result, uniV2Result, sushiResult, balancerResult, curveResult] = subgraphResults;

  const autoDisableFailedSubgraphs = parseBooleanEnv(
    Deno.env.get('SCANNER_AUTO_DISABLE_FAILED_SUBGRAPHS'),
    true,
  );
  const envDisabledDexesRaw = parseCsvEnvSet(Deno.env.get('SCANNER_HARD_DISABLE_DEXES'));
  const disabledDexBuckets = resolveDisabledDexBuckets(envDisabledDexesRaw);

  if (autoDisableFailedSubgraphs) {
    if (uniV3Result.status === 'rejected') disabledDexBuckets.add('uniV3');
    if (uniV2Result.status === 'rejected') disabledDexBuckets.add('uniV2');
    if (sushiResult.status === 'rejected') disabledDexBuckets.add('sushi');
    if (balancerResult.status === 'rejected') disabledDexBuckets.add('balancer');
    if (curveResult.status === 'rejected') disabledDexBuckets.add('curve');
  }

  const settledError = (result: PromiseSettledResult<unknown>): string | undefined => {
    if (result.status !== 'rejected') return undefined;
    if (result.reason instanceof Error) return result.reason.message;
    try {
      return JSON.stringify(result.reason);
    } catch {
      return String(result.reason);
    }
  };

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
    .flatMap((pool: Record<string, unknown>) => toPoolFromBalancer(pool));
  const curvePools: Pool[] = (curveData?.pools || [])
    .flatMap((pool: CurveOfficialPool) => toPoolFromCurve(pool));

  // Process Arbitrum-specific subgraph results and tag pools with network='arbitrum'.
  const arbResults = (arbSubgraphResults as PromiseSettledResult<unknown>[]) || [];
  const uniV3ArbResult = arbResults[0];
  const sushiArbResult = arbResults[1];
  if (uniV3ArbResult?.status === 'fulfilled') {
    const arbData = uniV3ArbResult.value as { pools?: Record<string, unknown>[] };
    const arbPools: Pool[] = (arbData?.pools || []).map((pool) => ({ ...toPoolFromPair(pool, 'Uniswap V3'), network: 'arbitrum' as const }));
    for (const pool of arbPools) upsertFallbackPool(uniV3Pools, pool);
  } else if (uniV3ArbResult?.status === 'rejected') {
    console.error('Uniswap V3 Arbitrum subgraph fetch failed:', (uniV3ArbResult as PromiseRejectedResult).reason);
  }
  if (sushiArbResult?.status === 'fulfilled') {
    const arbData = sushiArbResult.value as { pairs?: Record<string, unknown>[] };
    const arbPools: Pool[] = (arbData?.pairs || []).map((pair) => ({ ...toPoolFromPair(pair, 'SushiSwap'), network: 'arbitrum' as const }));
    for (const pool of arbPools) upsertFallbackPool(sushiPools, pool);
  } else if (sushiArbResult?.status === 'rejected') {
    console.error('SushiSwap Arbitrum subgraph fetch failed:', (sushiArbResult as PromiseRejectedResult).reason);
  }

  const droppedPoolCounts = {
    uniV3: 0,
    uniV2: 0,
    sushi: 0,
    balancer: 0,
    curve: 0,
    total: 0,
  };

  const hardenDexPoolSet = (bucket: 'uniV3' | 'uniV2' | 'sushi' | 'balancer' | 'curve', pools: Pool[]): Pool[] => {
    if (!disabledDexBuckets.has(bucket)) return pools;
    droppedPoolCounts[bucket] += pools.length;
    droppedPoolCounts.total += pools.length;
    return [];
  };

  const hardenedUniV3Pools = hardenDexPoolSet('uniV3', uniV3Pools);
  const hardenedUniV2Pools = hardenDexPoolSet('uniV2', uniV2Pools);
  const hardenedSushiPools = hardenDexPoolSet('sushi', sushiPools);
  const hardenedBalancerPools = hardenDexPoolSet('balancer', balancerPools);
  const hardenedCurvePools = hardenDexPoolSet('curve', curvePools);

  // Enrich chronic overlap pairs with targeted subgraph pulls before fallback merging.
  mergeFallbackPools(hardenedUniV3Pools, hardenDexPoolSet('uniV3', prioritySubgraph.uniV3Pools));
  mergeFallbackPools(hardenedUniV2Pools, hardenDexPoolSet('uniV2', prioritySubgraph.uniV2Pools));
  mergeFallbackPools(hardenedSushiPools, hardenDexPoolSet('sushi', prioritySubgraph.sushiPools));

  // Enable index read-through so scanner reads pre-fetched quotes from indexer-refresh-fast.
  // Direct fallbacks remain available when explicitly enabled by request/env so the scanner
  // can recover cross-source overlap during thin sameDex regimes.
  const subgraphFailCount = subgraphResults.filter((r) => r.status === 'rejected').length;
  const subgraphStarved = subgraphFailCount >= 3;
  const effectiveEnableDexScreener = enableDexScreener;
  const effectiveEnableGecko = enableGecko;

  if (effectiveEnableDexScreener) {
    mergeFallbackPools(hardenedUniV3Pools, dexFallback.uniV3Pools);
    mergeFallbackPools(hardenedUniV2Pools, dexFallback.uniV2Pools);
    mergeFallbackPools(hardenedSushiPools, dexFallback.sushiPools);
    mergeFallbackPools(hardenedBalancerPools, dexFallback.balancerPools);
    mergeFallbackPools(hardenedCurvePools, dexFallback.curvePools);
  }

  if (effectiveEnableGecko) {
    mergeFallbackPools(hardenedUniV3Pools, geckoFallback.uniV3Pools);
    mergeFallbackPools(hardenedUniV2Pools, geckoFallback.uniV2Pools);
    mergeFallbackPools(hardenedSushiPools, geckoFallback.sushiPools);
    mergeFallbackPools(hardenedBalancerPools, geckoFallback.balancerPools);
    mergeFallbackPools(hardenedCurvePools, geckoFallback.curvePools);
  }

  if (indexedQuotePools.stats.enabled) {
    mergeFallbackPools(hardenedUniV3Pools, indexedQuotePools.uniV3Pools);
    mergeFallbackPools(hardenedUniV2Pools, indexedQuotePools.uniV2Pools);
    mergeFallbackPools(hardenedSushiPools, indexedQuotePools.sushiPools);
    mergeFallbackPools(hardenedBalancerPools, indexedQuotePools.balancerPools);
    mergeFallbackPools(hardenedCurvePools, indexedQuotePools.curvePools);
  }

  const filterPoolsByRequestedNetworks = (pools: Pool[]): Pool[] => {
    return pools.filter((pool) => allowedNetworks.has(toNetworkName(pool.network)));
  };

  const filteredUniV3Pools = filterPoolsByRequestedNetworks(hardenedUniV3Pools);
  const filteredUniV2Pools = filterPoolsByRequestedNetworks(hardenedUniV2Pools);
  const filteredSushiPools = filterPoolsByRequestedNetworks(hardenedSushiPools);
  const filteredBalancerPools = filterPoolsByRequestedNetworks(hardenedBalancerPools);
  const filteredCurvePools = filterPoolsByRequestedNetworks(hardenedCurvePools);

  const countFallbackPools = (source: { uniV3Pools: Pool[]; uniV2Pools: Pool[]; sushiPools: Pool[]; balancerPools: Pool[]; curvePools: Pool[] }) => {
    const uniV3 = source.uniV3Pools.length;
    const uniV2 = source.uniV2Pools.length;
    const sushi = source.sushiPools.length;
    const balancer = source.balancerPools.length;
    const curve = source.curvePools.length;
    return {
      uniV3,
      uniV2,
      sushi,
      balancer,
      curve,
      total: uniV3 + uniV2 + sushi + balancer + curve,
    };
  };

  const scanResult = findSpreads(
    filteredUniV3Pools,
    filteredUniV2Pools,
    filteredSushiPools,
    filteredBalancerPools,
    filteredCurvePools,
    {
      subgraph: sourceReliability.subgraph,
      dexscreener: sourceReliability.dexscreener,
      gecko: sourceReliability.gecko,
    },
    config,
    routeMemoryByKey,
    executionFeedbackByRoute,
    dynamicPriority.termsByNetwork,
  );
  scanResult.diagnostics.fallbackPoolCounts = {
    dexscreener: countFallbackPools(dexFallback),
    gecko: countFallbackPools(geckoFallback),
  };
  scanResult.diagnostics.fallbackSourcesEnabled = {
    dexscreener: effectiveEnableDexScreener,
    gecko: effectiveEnableGecko,
  };
  scanResult.diagnostics.indexCache = {
    ...indexedQuotePools.stats,
    missPairs: Math.max(0, scanResult.diagnostics.pairKeys - indexedQuotePools.stats.hitPairs),
    fallbackFetches: Math.max(
      indexedQuotePools.stats.fallbackFetches,
      scanResult.diagnostics.pairKeys - indexedQuotePools.stats.hitPairs,
    ),
  };
  scanResult.diagnostics.sourceHardening = {
    autoDisableFailedSubgraphs,
    envDisabledDexes: Array.from(envDisabledDexesRaw),
    activeDisabledDexes: Array.from(disabledDexBuckets),
    droppedPoolCounts,
    sourceReliabilityBps: {
      subgraph: Number(sourceReliability.subgraph),
      dexscreener: Number(sourceReliability.dexscreener),
      gecko: Number(sourceReliability.gecko),
    },
    sourceReliabilityWindowRuns: sourceReliability.runCount,
  };
  scanResult.diagnostics.subgraphFetchStats = {
    uniswapV3: {
      status: uniV3Result.status === 'fulfilled' ? 'ok' : 'failed',
      entries: Array.isArray((uniV3Data as { pools?: unknown[] })?.pools) ? (uniV3Data as { pools: unknown[] }).pools.length : 0,
      error: settledError(uniV3Result),
    },
    uniswapV2: {
      status: uniV2Result.status === 'fulfilled' ? 'ok' : 'failed',
      entries: Array.isArray((uniV2Data as { pairs?: unknown[] })?.pairs) ? (uniV2Data as { pairs: unknown[] }).pairs.length : 0,
      error: settledError(uniV2Result),
    },
    sushiswap: {
      status: sushiResult.status === 'fulfilled' ? 'ok' : 'failed',
      entries: Array.isArray((sushiData as { pairs?: unknown[] })?.pairs) ? (sushiData as { pairs: unknown[] }).pairs.length : 0,
      error: settledError(sushiResult),
    },
    balancer: {
      status: balancerResult.status === 'fulfilled' ? 'ok' : 'failed',
      entries: Array.isArray((balancerData as { pools?: unknown[] })?.pools) ? (balancerData as { pools: unknown[] }).pools.length : 0,
      error: settledError(balancerResult),
    },
    curve: {
      status: curveResult.status === 'fulfilled' ? 'ok' : 'failed',
      entries: Array.isArray((curveData as { pools?: unknown[] })?.pools) ? (curveData as { pools: unknown[] }).pools.length : 0,
      error: settledError(curveResult),
    },
  };
  scanResult.diagnostics.priorityPairSubgraphStats = {
    ...prioritySubgraph.meta,
  };
  scanResult.diagnostics.dynamicPriorityStats = {
    ...dynamicPriority.meta,
  };
  scanResult.diagnostics.fallbackFetchStats = {
    dexscreener: dexFallback.meta || {
      queries: 0,
      responsesOk: 0,
      errors: 0,
      entriesSeen: 0,
      entriesAccepted: 0,
    },
    gecko: geckoFallback.meta || {
      queries: 0,
      responsesOk: 0,
      errors: 0,
      entriesSeen: 0,
      entriesAccepted: 0,
      rejectionReasons: {
        invalidNetworkMap: 0,
        networkNotRequested: 0,
        nonTrackablePair: 0,
        priceParseFail: 0,
        liquidityBelowMin: 0,
        baseQuoteOrientationMismatch: 0,
        orientationRecovered: 0,
        inversePriceFail: 0,
      },
    },
  };

  const subgraphEntries =
    scanResult.diagnostics.subgraphFetchStats.uniswapV3.entries
    + scanResult.diagnostics.subgraphFetchStats.uniswapV2.entries
    + scanResult.diagnostics.subgraphFetchStats.sushiswap.entries
    + scanResult.diagnostics.subgraphFetchStats.balancer.entries
    + scanResult.diagnostics.subgraphFetchStats.curve.entries;
  const subgraphSourcesOk = [
    scanResult.diagnostics.subgraphFetchStats.uniswapV3,
    scanResult.diagnostics.subgraphFetchStats.uniswapV2,
    scanResult.diagnostics.subgraphFetchStats.sushiswap,
    scanResult.diagnostics.subgraphFetchStats.balancer,
    scanResult.diagnostics.subgraphFetchStats.curve,
  ].filter((source) => source.status === 'ok').length;
  const fallbackEntriesAccepted =
    (scanResult.diagnostics.fallbackFetchStats.dexscreener.entriesAccepted || 0)
    + (scanResult.diagnostics.fallbackFetchStats.gecko.entriesAccepted || 0);
  const usablePools =
    scanResult.diagnostics.poolCounts.uniV3
    + scanResult.diagnostics.poolCounts.uniV2
    + scanResult.diagnostics.poolCounts.sushi
    + scanResult.diagnostics.poolCounts.balancer
    + scanResult.diagnostics.poolCounts.curve;
  const dataStarved = scanResult.diagnostics.pairKeys === 0;

  scanResult.diagnostics.ingestionHeartbeat = {
    status: dataStarved ? 'starved' : 'ok',
    networksRequested: selectedNetworks.length,
    pairKeys: scanResult.diagnostics.pairKeys,
    usablePools,
    subgraphEntries,
    fallbackEntriesAccepted,
    subgraphSourcesOk,
    starvationReason: dataStarved
      ? subgraphStarved
        ? `No canonical pair keys formed. Subgraphs failed (${subgraphFailCount}/5 rejected); fallback sources were auto-enabled.`
        : 'No canonical pair keys were formed from current market-data snapshot.'
      : undefined,
  };

  return scanResult;
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
        ...summarizeRejections(diagnostics),
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

    const rejectionSummary = summarizeRejections(diagnostics);

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
          ...rejectionSummary,
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
