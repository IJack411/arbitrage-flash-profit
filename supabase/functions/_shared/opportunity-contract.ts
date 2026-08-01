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
  // 'high' when the USD anchor was confirmed by a >=3-venue consensus; 'low' when
  // derived from fewer venues (unverified — downstream should treat with caution).
  quoteTokenUsdPriceConfidence?: UsdAnchorConfidence;
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
  /**
   * Phase 6: N-hop route representation, mirroring the on-chain Solidity
   * `FlashLoanArbitrage.Hop[]` and the Rust ABI encoder. When present it is the
   * authoritative executable path; the legacy 2-hop fields above are retained for
   * backward compatibility and map 1:1 to a 2-element `hops[]`
   * (asset→tokenB via routerA, then tokenB→asset via routerB).
   */
  hops?: CanonicalHop[];
}

/**
 * One swap leg of a multi-hop arbitrage path. Field names, order, and types
 * mirror the on-chain Solidity struct
 * `FlashLoanArbitrage.Hop { address router; address tokenOut; bool isV3; uint24 fee; uint256 amountOutMin; }`
 * and the Rust `flashlight::Hop`. `tokenIn` is implicit: hop 0 spends the
 * borrowed asset; hop i spends hop (i-1)'s `tokenOut`. The final hop's `tokenOut`
 * MUST equal the borrowed asset (the loop must close), enforced on-chain.
 */
export interface CanonicalHop {
  /** DEX router used for this hop. */
  router: string;
  /** Token received from this hop (the implicit tokenIn is the prior hop's tokenOut). */
  tokenOut: string;
  /** true = Uniswap V3 style (exactInputSingle); false = V2 style. */
  isV3: boolean;
  /** V3 fee tier (uint24). Ignored when isV3 === false. */
  fee: number;
  /** Per-hop slippage guard (minimum tokenOut for this hop), as a uint256 string. */
  amountOutMin: string;
}

/** Contract path-length bounds, mirroring `FlashLoanArbitrage.MIN_HOPS`/`MAX_HOPS`. */
export const MIN_HOPS = 2;
export const MAX_HOPS = 5;

/**
 * Aave V3 flash-loan premium (bps) the on-chain contract charges on the borrowed
 * principal. The closing leg must return at least principal + premium, so a
 * genuine per-hop floor for the closing leg is `amount·(10_000 + premium)/10_000`.
 */
export const AAVE_PREMIUM_BPS = 5;

/**
 * Default per-hop slippage tolerance (bps), mirroring the Rust
 * `payload::DEFAULT_DRYRUN_SLIPPAGE_BPS`, applied when deriving a per-hop
 * `amountOutMin` from an expected leg output.
 */
export const DEFAULT_DRYRUN_SLIPPAGE_BPS = 50;

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

export type UsdAnchorConfidence = 'high' | 'low';

export interface UsdAnchorVenueQuote {
  /** USD-denominated per-unit price quoted by this venue. */
  price: number;
  /** Pool depth in USD (reserveUSD). Higher = deeper = less slippage / least-slipped. */
  liquidityUsd?: number;
  /** Optional venue label, for diagnostics and tie-breaking only. */
  venue?: string;
}

export interface UsdAnchorResult {
  price: number;
  median: number;
  confidence: UsdAnchorConfidence;
  venueCount: number;
  consideredCount: number;
  droppedOutliers: number;
  anchorVenue?: string;
}

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Derive a token's USD reference price from the DEEPEST / least-slipped venue
 * across ALL available venues, guarded by a >=3-venue median consensus filter.
 *
 * Why: a token's USD reference (used for netProfit and USD thresholds, and
 * surfaced as quoteTokenUsdPrice) must NOT be anchored on a single venue. A
 * thin/stale pool — e.g. a near-empty Uniswap GRAIL pool quoting ~$1.55 when the
 * deepest venue (Camelot V3) quotes ~$43, a 28x error — would otherwise poison
 * the anchor and misfire USD thresholds.
 *
 * Algorithm:
 *  1. Keep only finite, positive prices.
 *  2. If >= minConsensusVenues quote, drop any venue whose price deviates from
 *     the median by more than outlierPct (default 3%). This kills uniformly
 *     stale single-venue quotes that a two-probe thin check cannot catch.
 *  3. Among survivors pick the DEEPEST (highest liquidityUsd) venue as the
 *     anchor; ties break toward the price nearest the median.
 *  4. Confidence is 'high' only when >= minConsensusVenues quoted; with fewer
 *     venues the price is flagged 'low' so downstream can see it is unverified
 *     (we do NOT silently trust a sub-consensus anchor).
 */
export const deriveUsdReferenceAnchor = (
  quotes: UsdAnchorVenueQuote[],
  options?: { outlierPct?: number; minConsensusVenues?: number },
): UsdAnchorResult | null => {
  const outlierPct = Number.isFinite(options?.outlierPct) && (options?.outlierPct as number) > 0
    ? (options?.outlierPct as number)
    : 3;
  const minConsensusVenues = Number.isFinite(options?.minConsensusVenues) && (options?.minConsensusVenues as number) >= 1
    ? Math.floor(options?.minConsensusVenues as number)
    : 3;

  const valid = (quotes || []).filter((q) => q && Number.isFinite(q.price) && q.price > 0);
  if (valid.length === 0) return null;

  const median = medianOf(valid.map((q) => q.price));

  let considered = valid;
  let droppedOutliers = 0;
  if (valid.length >= minConsensusVenues && median > 0) {
    const kept = valid.filter((q) => Math.abs(q.price - median) / median <= outlierPct / 100);
    // Only treat outliers as dropped when a consensus set actually survives; if every
    // venue deviates (pathological), fall back to all venues and report zero dropped.
    if (kept.length > 0) {
      considered = kept;
      droppedOutliers = valid.length - kept.length;
    }
  }

  const depthOf = (q: UsdAnchorVenueQuote): number => (Number.isFinite(q.liquidityUsd) ? (q.liquidityUsd as number) : 0);
  let anchor = considered[0];
  for (const q of considered) {
    if (depthOf(q) > depthOf(anchor)) {
      anchor = q;
    } else if (depthOf(q) === depthOf(anchor) && Math.abs(q.price - median) < Math.abs(anchor.price - median)) {
      anchor = q;
    }
  }

  return {
    price: anchor.price,
    median,
    confidence: valid.length >= minConsensusVenues ? 'high' : 'low',
    venueCount: valid.length,
    consideredCount: considered.length,
    droppedOutliers,
    anchorVenue: anchor.venue,
  };
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

// ── Phase 6: N-hop route helpers ────────────────────────────────────────────

const isZeroAddress = (value: string): boolean =>
  !value || /^0x0{40}$/i.test(String(value).trim());

const isPositiveUintString = (value: unknown): boolean => {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
};

/**
 * Derive a genuine, positive closing-leg `amountOutMin` for a payload that
 * borrows `amount`. The closing leg returns the borrowed asset and must at least
 * repay principal + Aave premium (the on-chain terminal profit gate), so the
 * floor is `amount·(10_000 + AAVE_PREMIUM_BPS)/10_000` (rounded up so the guard
 * never sits below the true repay obligation). Returns `'0'` only when `amount`
 * is not a positive uint — such a payload is independently invalid.
 */
export const deriveClosingLegMin = (amount: string): string => {
  if (!isPositiveUintString(amount)) return '0';
  const principal = BigInt(amount);
  const scale = BigInt(10_000 + AAVE_PREMIUM_BPS);
  // Round UP so the floor is >= principal + premium.
  return ((principal * scale + 9_999n) / 10_000n).toString();
};

/**
 * Map the legacy 2-hop canonical payload to a 2-element N-hop `CanonicalHop[]`:
 * asset→tokenB via routerA, then tokenB→asset via routerB. Field order/types
 * mirror the Solidity `Hop[]` and the Rust encoder. Like the Rust
 * `build_hops_from_cycle`, this NEVER emits a zero per-hop `amountOutMin`: the
 * buy leg carries the quote/sim-derived `amountBMin`, and the closing leg gets a
 * genuine positive floor (principal + Aave premium) so the result passes
 * `validateHopPath`. This is a pure representation change — it never executes
 * anything.
 */
export const buildHopsFromLegacyPayload = (
  payload: Pick<
    CanonicalExecutionPayload,
    | 'asset'
    | 'amount'
    | 'routerA'
    | 'routerB'
    | 'tokenB'
    | 'routerAisV3'
    | 'routerBisV3'
    | 'feeA'
    | 'feeB'
    | 'amountBMin'
  >,
): CanonicalHop[] => [
  {
    router: payload.routerA,
    tokenOut: payload.tokenB,
    isV3: payload.routerAisV3,
    fee: payload.feeA,
    // Buy leg carries the sim/quote-derived per-hop minimum.
    amountOutMin: payload.amountBMin,
  },
  {
    router: payload.routerB,
    tokenOut: payload.asset,
    isV3: payload.routerBisV3,
    fee: payload.feeB,
    // Closing leg floor = principal + Aave premium (a genuine >0 min consistent
    // with the on-chain terminal profit gate), mirroring the Rust builder which
    // never emits a zero per-hop min.
    amountOutMin: deriveClosingLegMin(payload.amount),
  },
];

export interface HopPathValidationInput {
  asset: string;
  amount: string;
  hops: CanonicalHop[];
}

/**
 * DRY-RUN validator for an N-hop route, mirroring the Rust
 * `payload::validate_execution_payload` and the on-chain `FlashLoanArbitrage`
 * invariants: hop count within [minHops, maxHops], non-zero borrow amount,
 * per-hop non-zero router/tokenOut AND a present (> 0) per-hop `amountOutMin`,
 * and loop-closure (final `tokenOut` === borrowed `asset`). Validation only; it
 * never signs or broadcasts.
 */
export const validateHopPath = (
  input: HopPathValidationInput,
  options?: { minHops?: number; maxHops?: number },
): { ok: true } | { ok: false; errors: string[] } => {
  const minHops = options?.minHops ?? MIN_HOPS;
  const maxHops = options?.maxHops ?? MAX_HOPS;
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['payload must be an object'] };
  }
  if (isZeroAddress(input.asset)) errors.push('zero borrow asset');
  if (!isPositiveUintString(input.amount)) errors.push('zero borrow amount');

  const hops = Array.isArray(input.hops) ? input.hops : [];
  if (hops.length < minHops || hops.length > maxHops) {
    errors.push(`bad path length: got ${hops.length}, expected [${minHops},${maxHops}]`);
  }

  hops.forEach((hop, i) => {
    if (!hop || typeof hop !== 'object') {
      errors.push(`hop ${i}: malformed`);
      return;
    }
    if (isZeroAddress(hop.router)) errors.push(`hop ${i}: zero router`);
    if (isZeroAddress(hop.tokenOut)) errors.push(`hop ${i}: zero tokenOut`);
    if (!isPositiveUintString(hop.amountOutMin)) errors.push(`hop ${i}: missing per-hop amountOutMin`);
  });

  if (hops.length > 0) {
    const finalTokenOut = hops[hops.length - 1]?.tokenOut;
    if (!isZeroAddress(input.asset) && String(finalTokenOut).toLowerCase() !== String(input.asset).toLowerCase()) {
      errors.push(`path does not close: final tokenOut ${finalTokenOut} != borrowed asset ${input.asset}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
};
