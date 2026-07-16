export const CANONICAL_OPPORTUNITY_VERSION = 'scanner-opportunity-v1';

export const OPPORTUNITY_REASON_CODES = {
  activeExecutionReady: 'active_execution_ready',
  watchlistNetProfitBelowThreshold: 'watchlist_net_profit_below_threshold',
  watchlistRealtimeVerificationBlocked: 'watchlist_realtime_verification_blocked',
  watchlistPartialRealtimeSignal: 'watchlist_partial_realtime_signal',
  watchlistPayloadRisk: 'watchlist_execution_payload_risk',
  watchlistPersistencePending: 'watchlist_persistence_pending',
  executionParityMismatch: 'execution_quote_parity_mismatch',
  executionQuoteStale: 'execution_quote_stale',
  executionBoundaryInvalid: 'execution_boundary_invalid',
  readinessGatesFailed: 'readiness_gates_failed',
} as const;

export type OpportunityReasonCode = typeof OPPORTUNITY_REASON_CODES[keyof typeof OPPORTUNITY_REASON_CODES];

export const ALERT_REASON_CODES = {
  alert: 'scanner_alert',
  precheck: 'scanner_precheck',
  precheckStreak: 'scanner_precheck_streak',
  warm: 'scanner_warm',
  connectivity: 'scanner_connectivity',
  dataHeartbeat: 'scanner_data_heartbeat',
  noAlert: 'scanner_no_alert',
} as const;

export type AlertReasonCode = typeof ALERT_REASON_CODES[keyof typeof ALERT_REASON_CODES];

export interface QuoteParityPayload {
  version: typeof CANONICAL_OPPORTUNITY_VERSION;
  routeKey: string;
  quoteTimestamp: string;
  quoteTokenUsdPrice: number;
  buyPrice: number;
  expectedBuyTokenAmount: string;
  amountBMin: string;
  tokenBDecimals: number;
  slippageBps: number;
  sourceQualityBps: number;
  persistenceCount: number;
  minRequiredPersistence: number;
  sourceFlags: {
    hasSubgraph: boolean;
    fallbackOnly: boolean;
    sameFallbackSource: boolean;
  };
}

export interface CanonicalExecutionPayload {
  asset: string;
  amount: string;
  routerA: string;
  routerB: string;
  tokenB: string;
  routerAisV3: boolean;
  routerBisV3: boolean;
  feeA: number;
  feeB: number;
  amountBMin: string;
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  network: string;
  predictedGrossProfit: number;
  predictedNetProfit: number;
  estimatedGasCost: number;
  estimatedSlippageBps: number;
  scanTimestamp: string;
  confidenceScore: number;
  quote: QuoteParityPayload;
}

export interface CanonicalOpportunity {
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  network: string;
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
  quoteSources: string[];
  scanRunId: string;
  candidateId: string;
  quoteTimestamp: string;
  dataSource: 'multi-source';
  reasonCode: OpportunityReasonCode;
  executionPayload?: CanonicalExecutionPayload;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const decimalToScaledBigInt = (value: number, decimals: number): bigint => {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  const fixed = value.toFixed(Math.max(0, decimals));
  const [whole, fraction = ''] = fixed.split('.');
  return BigInt(`${whole}${fraction.padEnd(decimals, '0').slice(0, decimals)}`);
};

const scaleAmount = (value: bigint, fromDecimals: number, toDecimals: number): bigint => {
  if (fromDecimals === toDecimals) return value;
  if (toDecimals > fromDecimals) return value * (10n ** BigInt(toDecimals - fromDecimals));
  return value / (10n ** BigInt(fromDecimals - toDecimals));
};

const hash32 = (value: string, seed: number): number => {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const formatDeterministicUuid = (hex: string): string => {
  const normalized = hex.padEnd(32, '0').slice(0, 32).split('');
  normalized[12] = '5';
  normalized[16] = ['8', '9', 'a', 'b'][Number.parseInt(normalized[16] || '0', 16) % 4];
  return [
    normalized.slice(0, 8).join(''),
    normalized.slice(8, 12).join(''),
    normalized.slice(12, 16).join(''),
    normalized.slice(16, 20).join(''),
    normalized.slice(20, 32).join(''),
  ].join('-');
};

export const buildRouteKey = (
  network: string,
  tokenPair: string,
  buyDex: string,
  sellDex: string,
): string => {
  const normalizedNetwork = String(network || '').trim().toLowerCase();
  const normalizedPair = String(tokenPair || '').trim().toLowerCase();
  const normalizedBuyDex = String(buyDex || '').trim().toLowerCase();
  const normalizedSellDex = String(sellDex || '').trim().toLowerCase();
  return `${normalizedNetwork}|${normalizedPair}|${normalizedBuyDex}|${normalizedSellDex}`;
};

export const createDeterministicCandidateId = (
  scanRunId: string,
  routeKey: string,
  status: string,
): string => {
  const seed = `${scanRunId}|${routeKey}|${status}`;
  const hex = [
    hash32(seed, 0).toString(16).padStart(8, '0'),
    hash32(seed, 1).toString(16).padStart(8, '0'),
    hash32(seed, 2).toString(16).padStart(8, '0'),
    hash32(seed, 3).toString(16).padStart(8, '0'),
  ].join('');
  return formatDeterministicUuid(hex);
};

export const deriveAssetAmountFromQuote = (
  loanAmountUsd: number,
  quoteTokenUsdPrice: number,
  assetDecimals: number,
): bigint => {
  const normalizedQuoteUsdPrice = Number.isFinite(quoteTokenUsdPrice) && quoteTokenUsdPrice > 0 ? quoteTokenUsdPrice : 1;
  const quoteAmount = loanAmountUsd / normalizedQuoteUsdPrice;
  return decimalToScaledBigInt(quoteAmount, Math.max(0, assetDecimals));
};

export const deriveAmountBMinFromQuote = ({
  loanAmountUsd,
  quoteTokenUsdPrice,
  buyPrice,
  estimatedSlippageBps,
  tokenBDecimals,
}: {
  loanAmountUsd: number;
  quoteTokenUsdPrice?: number;
  buyPrice: number;
  estimatedSlippageBps: number;
  tokenBDecimals: number;
}): bigint => {
  const normalizedQuoteUsdPrice = Number.isFinite(quoteTokenUsdPrice) && Number(quoteTokenUsdPrice) > 0
    ? Number(quoteTokenUsdPrice)
    : 1;
  if (!Number.isFinite(loanAmountUsd) || loanAmountUsd <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0) return 0n;
  const quoteBudgetUsd = loanAmountUsd / normalizedQuoteUsdPrice;
  const quoteBudgetScaled = decimalToScaledBigInt(quoteBudgetUsd, 6);
  const buyPriceScaled = decimalToScaledBigInt(buyPrice, 6);
  if (quoteBudgetScaled <= 0n || buyPriceScaled <= 0n) return 0n;
  const expectedTokenAmount = (quoteBudgetScaled * 1_000_000n) / buyPriceScaled;
  const slippageBufferBps = BigInt(10_000 + Math.max(0, Math.round(estimatedSlippageBps)) + 200);
  const minTokenAmount = (expectedTokenAmount * 10_000n) / slippageBufferBps;
  return scaleAmount(minTokenAmount, 6, Math.max(0, tokenBDecimals));
};

export const evaluateSourceQualityPenalty = ({
  sourceQualityBps,
  fallbackOnly,
  sameFallbackSource,
  persistenceCount,
  minRequiredPersistence,
}: {
  sourceQualityBps: number;
  fallbackOnly: boolean;
  sameFallbackSource: boolean;
  persistenceCount: number;
  minRequiredPersistence: number;
}): number => {
  let penalty = 0;
  if (Number.isFinite(sourceQualityBps) && sourceQualityBps < 8_500) {
    penalty += Math.min(28, Math.ceil((8_500 - sourceQualityBps) / 125));
  }
  if (fallbackOnly) penalty += 12;
  if (sameFallbackSource) penalty += 8;
  if (minRequiredPersistence > persistenceCount) {
    penalty += Math.min(24, (minRequiredPersistence - persistenceCount) * 8);
  }
  return penalty;
};

export const shouldPromoteOpportunity = ({
  persistenceCount,
  minRequiredPersistence,
}: {
  persistenceCount: number;
  minRequiredPersistence: number;
}): boolean => persistenceCount >= Math.max(1, minRequiredPersistence);

export const validateOpportunityParity = (
  opportunity: unknown,
  options?: { maxQuoteAgeMs?: number },
): { ok: true; value: CanonicalOpportunity } | { ok: false; errors: string[] } => {
  const maxQuoteAgeMs = Math.max(0, options?.maxQuoteAgeMs ?? 0);
  const errors: string[] = [];
  if (!isPlainObject(opportunity)) {
    return { ok: false, errors: ['opportunity must be an object'] };
  }

  const value = opportunity as Record<string, unknown>;
  const scanRunId = typeof value.scanRunId === 'string' ? value.scanRunId : '';
  const candidateId = typeof value.candidateId === 'string' ? value.candidateId : '';
  const quoteTimestamp = typeof value.quoteTimestamp === 'string' ? value.quoteTimestamp : '';
  const status = value.status;
  const reasonCode = value.reasonCode;
  const executionPayload = isPlainObject(value.executionPayload) ? value.executionPayload : null;

  if (!scanRunId) errors.push('scanRunId missing');
  if (!candidateId) errors.push('candidateId missing');
  if (!quoteTimestamp) errors.push('quoteTimestamp missing');
  if (status !== 'active' && status !== 'watchlist') errors.push('status invalid');
  if (typeof reasonCode !== 'string' || !Object.values(OPPORTUNITY_REASON_CODES).includes(reasonCode as OpportunityReasonCode)) {
    errors.push('reasonCode invalid');
  }

  const parsedQuoteTs = Date.parse(quoteTimestamp);
  if (!Number.isFinite(parsedQuoteTs)) {
    errors.push('quoteTimestamp invalid');
  } else if (maxQuoteAgeMs > 0 && (Date.now() - parsedQuoteTs) > maxQuoteAgeMs) {
    errors.push(OPPORTUNITY_REASON_CODES.executionQuoteStale);
  }

  if (executionPayload) {
    const quote = isPlainObject(executionPayload.quote) ? executionPayload.quote : null;
    if (!quote) {
      errors.push('executionPayload.quote missing');
    } else {
      const loanAmount = toFiniteNumber(value.executableLoanAmount);
      const buyPrice = toFiniteNumber(quote.buyPrice);
      const quoteTokenUsdPrice = toFiniteNumber(quote.quoteTokenUsdPrice);
      const slippageBps = toFiniteNumber(quote.slippageBps);
      const expectedAmountBMin = deriveAmountBMinFromQuote({
        loanAmountUsd: loanAmount ?? 0,
        quoteTokenUsdPrice: quoteTokenUsdPrice ?? 1,
        buyPrice: buyPrice ?? 0,
        estimatedSlippageBps: slippageBps ?? 0,
        tokenBDecimals: Math.max(0, Math.round(toFiniteNumber(quote.tokenBDecimals) ?? 0)),
      }).toString();
      const actualAmountBMin = executionPayload.amountBMin;
      if (typeof quote.amountBMin !== 'string' || quote.amountBMin !== actualAmountBMin) {
        errors.push('executionPayload amountBMin mismatch');
      }
      if (expectedAmountBMin === '0') {
        errors.push('executionPayload derived amountBMin invalid');
      } else if (String(actualAmountBMin) !== expectedAmountBMin) {
        errors.push(OPPORTUNITY_REASON_CODES.executionParityMismatch);
      }
      if (quote.quoteTimestamp !== quoteTimestamp) {
        errors.push('executionPayload quoteTimestamp mismatch');
      }
      if (executionPayload.tokenPair !== value.tokenPair) {
        errors.push('executionPayload tokenPair mismatch');
      }
      if (executionPayload.buyDex !== value.buyDex || executionPayload.sellDex !== value.sellDex) {
        errors.push('executionPayload route mismatch');
      }
      if (executionPayload.network !== value.network) {
        errors.push('executionPayload network mismatch');
      }
      const predictedNetProfit = toFiniteNumber(executionPayload.predictedNetProfit);
      const opportunityNetProfit = toFiniteNumber(value.netProfit);
      if (predictedNetProfit === null || opportunityNetProfit === null || Math.abs(predictedNetProfit - opportunityNetProfit) > 0.01) {
        errors.push('executionPayload netProfit mismatch');
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: value as CanonicalOpportunity };
};

export const buildAlertMetadata = (reasonCode: AlertReasonCode, detail: Record<string, unknown> = {}) => ({
  reasonCode,
  ...detail,
});

export const evaluateReadinessGateDecision = ({
  hasGraphKey,
  healthySources,
  minHealthySources,
  fallbackSources,
  maxFallbackSources,
}: {
  hasGraphKey: boolean;
  healthySources: number;
  minHealthySources: number;
  fallbackSources: number;
  maxFallbackSources: number;
}) => ({
  pass: hasGraphKey && healthySources >= minHealthySources && fallbackSources <= maxFallbackSources,
  hasGraphKey,
  healthySources,
  fallbackSources,
  thresholds: {
    minHealthySources,
    maxFallbackSources,
  },
});

export const classifySimulationGate = (simulationResult: Record<string, unknown> | null | undefined) => {
  if (!simulationResult) return { reject: true, reason: 'simulation_missing', detail: 'Simulation result missing' };
  if ('error' in simulationResult && simulationResult.error) {
    const message = typeof simulationResult.error === 'object' && simulationResult.error && 'message' in simulationResult.error
      ? String((simulationResult.error as { message?: unknown }).message || 'Bundle simulation returned error')
      : 'Bundle simulation returned error';
    return { reject: true, reason: 'simulation_failed', detail: message };
  }
  if ('firstRevert' in simulationResult && simulationResult.firstRevert !== undefined) {
    return {
      reject: true,
      reason: 'simulation_reverted',
      detail: `Transaction reverted: ${JSON.stringify(simulationResult.firstRevert)}`,
    };
  }
  return { reject: false, reason: 'simulation_ok', detail: null };
};
