import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, Pause, Square, Zap, Shield, AlertTriangle, TrendingUp, 
  Activity, Clock, DollarSign, Wallet, Settings, RefreshCw,
  CheckCircle, XCircle, Loader2, Radio, Power, Target
} from 'lucide-react';
import { useWeb3 } from '@/contexts/Web3Context';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { autoWebhookTrigger } from '@/lib/autoWebhookTrigger';
import { getContractAddresses } from '@/lib/web3/config';
import {
  type CanonicalExecutionPayload,
  executeArbitrageTrade,
  getLiveCircuitBreakerStatus,
  getLiveExecutionBlocker,
  normalizeOpportunityToTrade,
  resetLiveCircuitBreaker,
  supportsLiveExecution,
} from '@/lib/trading/executionService';

interface TradingState {
  mode: 'manual' | 'auto';
  status: 'idle' | 'scanning' | 'executing' | 'paused';
  executionMode: 'demo' | 'live';
  lastScan: Date | null;
  tradesExecuted: number;
  profitToday: number;
  gasSpentToday: number;
}

interface PendingTrade {
  id: string;
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  network: string;
  status?: 'active' | 'watchlist';
  distanceToExecutableUsd?: number;
  loanAmount: number;
  grossProfit: number;
  expectedProfit: number;
  gasCost: number;
  confidence: number;
  timestamp: number;
  loanAdjustmentReason?: string;
  executionPayload?: CanonicalExecutionPayload;
}

interface OpportunityLike {
  tokenPair?: string;
  token_pair?: string;
  buyDex?: string;
  buy_dex?: string;
  sellDex?: string;
  sell_dex?: string;
  network?: string;
  loanAmount?: number;
  loan_amount?: number;
  netProfit?: number;
  estimated_profit?: number;
  expectedProfit?: number;
  gasCost?: number;
  gas_cost?: number;
  confidenceScore?: number;
  confidence_score?: number;
  confidence?: number;
  executableLoanAmount?: number;
  confidenceTier?: 'high' | 'medium' | 'low';
  status?: 'active' | 'watchlist';
  distanceToExecutableUsd?: number;
  grossProfit?: number;
  spread?: string | number;
  quoteSources?: string[];
  quoteTimestamp?: string;
  buyImpactBps?: number;
  sellImpactBps?: number;
  routePenaltyBps?: number;
  mathDiagnostics?: {
    expectedOutputUsd?: number;
    actualOutputUsd?: number;
    expectedGrossProfitUsd?: number;
    actualGrossProfitUsd?: number;
    gasEstimateUsd?: number;
    slippageFraction?: number;
    liquidityUsageFraction?: number;
  };
  executionPayload?: CanonicalExecutionPayload;
  execution_payload?: CanonicalExecutionPayload;
}

interface ParsedServerScanPayload {
  opportunities: OpportunityLike[];
  watchlist: OpportunityLike[];
  diagnostics?: Record<string, unknown>;
  watchlistCount?: number;
}

interface CircuitBreakerUiState {
  active: boolean;
  reason: string | null;
  minutesRemaining: number | null;
  loading: boolean;
}

interface PairPerformanceRow {
  network: string;
  token_pair: string;
  routes: number;
  total_executions: number;
  success_rate_pct: number;
  avg_route_realized_net: number;
  cumulative_realized_net: number;
}

interface RecentExecutionLog {
  id: string;
  token_pair: string;
  network: string;
  buy_dex: string;
  sell_dex: string;
  status: 'simulated' | 'submitted' | 'failed';
  execution_mode: string;
  actual_profit: number | null;
  gas_cost: number | null;
  error_message: string | null;
  executed_at: string;
  tx_hash: string | null;
  metadata?: Record<string, unknown> | null;
}

interface RouteMemoryRow {
  id: string;
  route_key: string;
  network: string;
  token_pair: string;
  buy_dex: string;
  sell_dex: string;
  total_executions: number;
  avg_realized_net: number;
  last_realized_net: number | null;
  cooldown_until: string | null;
  last_executed_at: string | null;
}

interface LatestRouteMemoryDiagnostics {
  loadedRoutes: number;
  suppressedByCooldown: number;
  penalizedByHistory: number;
  maxPenaltyUsd: number;
  suppressedSamples: Array<{
    routeKey: string;
    tokenPair: string;
    buyDex: string;
    sellDex: string;
    cooldownUntil?: string;
  }>;
  penalizedSamples: Array<{
    routeKey: string;
    tokenPair: string;
    buyDex: string;
    sellDex: string;
    avgRealizedNet: number;
    penaltyUsd: number;
  }>;
}

interface LatestScanDiagnostics {
  pairKeys: number;
  candidates: number;
  executionFeasible: number;
  profitQualified: number;
  droppedBySlippage: number;
  droppedByNetProfit: number;
  droppedByExecutionRisk: number;
  droppedBySameDex: number;
  sameDexSubgraphOnly?: number;
  sameDexFallbackOnly?: number;
  sameDexMixedSources?: number;
  droppedBySpread: number;
  routeMemoryLoaded: number;
  routeCooldownSuppressed: number;
  routeHistoryPenalized: number;
  routeMaxPenaltyUsd: number;
  topReject: string;
  topDrop: string;
  topPair: string;
  consecutiveTransportFailures: number;
  transportBackoffRemainingMs: number;
  lastTransportFailureSource: string;
  lastTransportFailureReason: string;
}

interface ScanTransportHealth {
  consecutiveFailures: number;
  backoffRemainingMs: number;
  lastFailureSource: string;
  lastFailureReason: string;
}

interface TransportIncident {
  time: string;
  source: string;
  reason: string;
  streak: number;
  backoffMs: number;
}

interface LatestCycleShadowDiagnostics {
  enabled: boolean;
  networksAnalyzed: number;
  testedTriangles: number;
  candidatePaths: number;
  topCycles: Array<{
    network: string;
    path: string;
    grossReturnBps: number;
    minLiquidityUsd: number;
    sources: string[];
  }>;
}

interface LatestAutoSuppressionDiagnostics {
  considered: number;
  eligible: number;
  blockedByTransportGate: number;
  blockedByQualityGate: number;
  blockedByUnsupportedNetwork: number;
  blockedByThreshold: number;
}

interface AdaptiveThresholdTelemetryEvent {
  eventId: string;
  time: string;
  direction: 'up' | 'down' | 'reset';
  previousThreshold: number;
  nextThreshold: number;
  qualityBlocked: number;
  considered: number;
  transportFailures: number;
  reason: string;
  remoteSynced?: boolean;
}

type AdaptiveTelemetryRemoteStatus = 'unknown' | 'ready' | 'missing';

interface SpectrumRejectedSample {
  tokenPair: string;
  network: string;
  reason: string;
  expectedProfit: number;
  gasCost: number;
  loanAmount: number;
  status: 'active' | 'watchlist';
}

interface SpectrumDebugSnapshot {
  totalCandidates: number;
  queuedCandidates: number;
  rejectedNegativeNet: number;
  rejectedByMinProfit: number;
  rejectedByGas: number;
  rejectedByDemoCooldown: number;
  rejectedByDemoWatchlistGate: number;
  rejectedSamples: SpectrumRejectedSample[];
}

interface LiveReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail: string;
}

const PAIR_HISTORY_MIN_EXECUTIONS = 5;
const PAIR_HISTORY_MIN_SUCCESS_RATE_PCT = 35;
const PAIR_HISTORY_MIN_CUMULATIVE_NET_USD = -25;
const PAIR_HISTORY_SOFT_MIN_EXECUTIONS = 3;
const PAIR_HISTORY_SOFT_SUCCESS_RATE_PCT = 55;
const PAIR_HISTORY_SOFT_CUMULATIVE_NET_USD = 0;
const PAIR_HISTORY_MIN_LOAN_FACTOR = 0.4;
const LIQUIDITY_MIN_LOAN_FACTOR = 0.35;
const WETH_PAIR_PRIORITY_PENALTY = 18;
const SAME_DEX_REGIME_STREAK_TRIGGER = 4;
const SAME_DEX_REGIME_PAUSE_MS = 3 * 60 * 1000;
const ENABLE_LIVE_SAME_DEX_REGIME_PAUSE = false;
const LIVE_AUTO_QUALITY_MIN_SUCCESS_RATE_PCT = 50;
const LIVE_AUTO_QUALITY_MIN_CUMULATIVE_NET_USD = 0;

const buildRouteKey = (input: {
  network?: string;
  tokenPair?: string;
  token_pair?: string;
  buyDex?: string;
  buy_dex?: string;
  sellDex?: string;
  sell_dex?: string;
}): string => {
  const network = String(input.network ?? 'unknown').toLowerCase();
  const tokenPair = String(input.tokenPair ?? input.token_pair ?? 'unknown').toLowerCase();
  const buyDex = String(input.buyDex ?? input.buy_dex ?? 'unknown').toLowerCase();
  const sellDex = String(input.sellDex ?? input.sell_dex ?? 'unknown').toLowerCase();

  // Cooldown should cover both route directions for the same pair/network.
  const [dexA, dexB] = [buyDex, sellDex].sort((a, b) => a.localeCompare(b));
  return `${network}|${tokenPair}|${dexA}|${dexB}`;
};

const MAX_REASONABLE_SPREAD_PERCENT = 20;
const MAX_REASONABLE_ROI_FRACTION = 0.20;

const isReasonableOpportunity = (item: OpportunityLike): boolean => {
  const loan = Number(item.executableLoanAmount ?? item.loanAmount ?? item.loan_amount ?? 0);
  if (!Number.isFinite(loan) || loan <= 0) return false;

  const netProfit = Number(item.netProfit ?? item.expectedProfit ?? item.estimated_profit ?? Number.NEGATIVE_INFINITY);
  const grossProfit = Number(item.grossProfit ?? Number.NaN);
  const spreadValue = Number(item.spread ?? Number.NaN);

  const maxReasonableProfit = loan * MAX_REASONABLE_ROI_FRACTION;
  if (Number.isFinite(netProfit) && netProfit > maxReasonableProfit) return false;
  if (Number.isFinite(grossProfit) && grossProfit > maxReasonableProfit) return false;
  if (Number.isFinite(spreadValue) && spreadValue > MAX_REASONABLE_SPREAD_PERCENT) return false;

  return true;
};

const isWethPair = (tokenPair?: string): boolean => /(^|\W)weth(\W|$)/i.test(tokenPair ?? '');

const isCycleShadowOpportunity = (item: {
  tokenPair?: string;
  token_pair?: string;
}): boolean => {
  const tokenPair = String(item.tokenPair ?? item.token_pair ?? '');
  return /^CYCLE\s+/i.test(tokenPair);
};

const getOpportunityLiquidityUsd = (item: OpportunityLike): number | null => {
  const rawCandidates = [
    (item as Record<string, unknown>).liquidityUsd,
    (item as Record<string, unknown>).liquidity_usd,
    (item as Record<string, unknown>).maxInputLiquidityUsd,
    (item as Record<string, unknown>).max_input_liquidity_usd,
    (item as Record<string, unknown>).poolLiquidityUsd,
    (item as Record<string, unknown>).pool_liquidity_usd,
  ];

  for (const raw of rawCandidates) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
};

const getLiquidityLoanThrottle = (baseLoanAmount: number, liquidityUsd: number | null): {
  adjustedLoanAmount: number;
  reason: string;
} | null => {
  if (!Number.isFinite(baseLoanAmount) || baseLoanAmount <= 0 || !Number.isFinite(liquidityUsd ?? NaN)) {
    return null;
  }

  const liq = Number(liquidityUsd);
  let factor = 1;

  if (liq < 100000) {
    factor = LIQUIDITY_MIN_LOAN_FACTOR;
  } else if (liq < 250000) {
    factor = 0.5;
  } else if (liq < 750000) {
    factor = 0.65;
  } else if (liq < 2000000) {
    factor = 0.8;
  }

  if (factor >= 0.999) return null;

  const adjustedLoanAmount = Math.max(100, Math.round((baseLoanAmount * factor) / 100) * 100);
  if (adjustedLoanAmount >= baseLoanAmount) return null;

  return {
    adjustedLoanAmount,
    reason: `liquidity throttle (${Math.round(factor * 100)}% from ~$${Math.round(liq).toLocaleString()} liquidity)`,
  };
};

const estimateNetForLoanSize = (item: OpportunityLike, targetLoanUsd: number): number | null => {
  const currentLoan = Number(item.executableLoanAmount ?? item.loanAmount ?? item.loan_amount ?? 0);
  const currentNet = Number(item.netProfit ?? item.expectedProfit ?? item.estimated_profit ?? Number.NaN);
  const gasCost = Number(item.gasCost ?? item.gas_cost ?? Number.NaN);

  if (!Number.isFinite(currentLoan) || currentLoan <= 0) return null;
  if (!Number.isFinite(currentNet) || !Number.isFinite(gasCost)) return null;
  if (!Number.isFinite(targetLoanUsd) || targetLoanUsd <= 0) return null;

  const targetLoan = Math.max(100, targetLoanUsd);
  const preGasCurrent = currentNet + gasCost;
  const rawImpactBps = Number(item.buyImpactBps ?? 0)
    + Number(item.sellImpactBps ?? 0)
    + Number(item.routePenaltyBps ?? 0);
  const impactBps = Number.isFinite(rawImpactBps) ? Math.max(0, rawImpactBps) : 0;

  // Approximate pre-gas PnL as a*L - b*L^2 where b is inferred from observed impact at current size.
  if (impactBps > 0) {
    const b = impactBps / (10_000 * currentLoan);
    const a = (preGasCurrent + (b * currentLoan * currentLoan)) / currentLoan;
    const projectedPreGas = (a * targetLoan) - (b * targetLoan * targetLoan);
    return projectedPreGas - gasCost;
  }

  // Fallback to linear scaling when impact data is missing.
  const scaledPreGas = preGasCurrent * (targetLoan / currentLoan);
  return scaledPreGas - gasCost;
};

const buildSizeLadderSummary = (item: OpportunityLike): string | null => {
  const currentLoan = Number(item.executableLoanAmount ?? item.loanAmount ?? item.loan_amount ?? 0);
  if (!Number.isFinite(currentLoan) || currentLoan <= 0) return null;

  const loanTargets = [
    Math.max(100, Math.round((currentLoan * 0.25) / 100) * 100),
    Math.max(100, Math.round((currentLoan * 0.5) / 100) * 100),
    Math.max(100, Math.round(currentLoan / 100) * 100),
    Math.max(100, Math.round((currentLoan * 1.5) / 100) * 100),
  ];

  const dedupedTargets = Array.from(new Set(loanTargets));
  const points = dedupedTargets.map((loan) => {
    const net = estimateNetForLoanSize(item, loan);
    if (!Number.isFinite(net ?? NaN)) return null;
    return `$${loan.toLocaleString()}: ${net! >= 0 ? '+' : ''}$${net!.toFixed(2)}`;
  }).filter((point): point is string => Boolean(point));

  if (points.length === 0) return null;
  return points.join(' | ');
};

const buildQuoteAttributionSummary = (item: OpportunityLike): string | null => {
  const sources = Array.isArray(item.quoteSources)
    ? Array.from(new Set(item.quoteSources.map((source) => String(source).trim()).filter(Boolean)))
    : [];
  const sourceSummary = sources.length > 0 ? sources.join('+') : null;

  const quoteAgeMs = item.quoteTimestamp ? Date.now() - Date.parse(item.quoteTimestamp) : Number.NaN;
  const ageSummary = Number.isFinite(quoteAgeMs) && quoteAgeMs >= 0
    ? quoteAgeMs < 1_000
      ? `${Math.round(quoteAgeMs)}ms old`
      : `${(quoteAgeMs / 1_000).toFixed(1)}s old`
    : null;

  if (!sourceSummary && !ageSummary) return null;
  if (sourceSummary && ageSummary) return `${sourceSummary} | ${ageSummary}`;
  return sourceSummary ?? ageSummary;
};

const unwrapPayloadCandidates = (input: unknown, maxDepth = 6): Array<Record<string, unknown>> => {
  if (!input || typeof input !== 'object') return [];

  const queue: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }];
  const visited = new Set<object>();
  const out: Array<Record<string, unknown>> = [];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) continue;
    const { value, depth } = next;
    if (!value || typeof value !== 'object') continue;
    if (visited.has(value as object)) continue;

    visited.add(value as object);
    const record = value as Record<string, unknown>;
    out.push(record);

    if (depth >= maxDepth) continue;
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') {
        queue.push({ value: nested, depth: depth + 1 });
      }
    }
  }

  return out;
};

const parseServerScanPayload = (input: unknown): ParsedServerScanPayload | null => {
  const candidates = unwrapPayloadCandidates(input);

  for (const candidate of candidates) {
    if (Array.isArray(candidate.opportunities)) {
      const filteredOpportunities = (candidate.opportunities as OpportunityLike[]).filter(isReasonableOpportunity);
      const filteredWatchlist = (Array.isArray(candidate.watchlist) ? candidate.watchlist as OpportunityLike[] : []).filter(isReasonableOpportunity);
      return {
        opportunities: filteredOpportunities,
        watchlist: filteredWatchlist,
        diagnostics: candidate.diagnostics && typeof candidate.diagnostics === 'object'
          ? candidate.diagnostics as Record<string, unknown>
          : undefined,
        watchlistCount: Number(candidate.watchlistCount ?? candidate.watchlist_count ?? 0),
      };
    }

  }

  // Some wrappers place the actual payload under a deeper nested object,
  // so fall back to any object discovered in the breadth-first traversal.
  for (const candidate of candidates) {
    for (const nested of Object.values(candidate)) {
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const nestedCandidate = nested as Record<string, unknown>;
        if (Array.isArray(nestedCandidate.opportunities)) {
          const filteredOpportunities = (nestedCandidate.opportunities as OpportunityLike[]).filter(isReasonableOpportunity);
          const filteredWatchlist = (Array.isArray(nestedCandidate.watchlist) ? nestedCandidate.watchlist as OpportunityLike[] : []).filter(isReasonableOpportunity);
          return {
            opportunities: filteredOpportunities,
            watchlist: filteredWatchlist,
            diagnostics: nestedCandidate.diagnostics && typeof nestedCandidate.diagnostics === 'object'
              ? nestedCandidate.diagnostics as Record<string, unknown>
              : undefined,
            watchlistCount: Number(nestedCandidate.watchlistCount ?? nestedCandidate.watchlist_count ?? 0),
          };
        }
      }
    }
  }

  return null;
};

const extractServerErrorMessage = (input: unknown): string | null => {
  const candidates = unwrapPayloadCandidates(input);

  for (const candidate of candidates) {
    const nestedError = candidate.error && typeof candidate.error === 'object'
      ? candidate.error as { message?: unknown }
      : null;
    for (const raw of [candidate.error, candidate.message, nestedError?.message]) {
      if (typeof raw === 'string' && raw.trim().length > 0 && raw.trim().toLowerCase() !== 'null') {
        return raw.trim();
      }
    }
  }

  return null;
};

const DEMO_AUTO_MAX_DISTANCE_TO_EXECUTABLE_USD = 3;
const DEMO_PROMOTION_MAX_DISTANCE_TO_EXECUTABLE_USD = 12;
const DEMO_PROMOTION_MIN_NET_PROFIT_USD = 0;
const EDGE_SCAN_INVOKE_TIMEOUT_MS = 20_000;
const LOCAL_SCAN_TIMEOUT_MS = 20_000;
const SCAN_HARD_TIMEOUT_MS = 75_000;
const TRANSPORT_BACKOFF_BASE_MS = 4_000;
const TRANSPORT_BACKOFF_MAX_MS = 60_000;
const LIVE_AUTO_EXECUTION_TRANSPORT_BLOCK_STREAK = 3;
const LIVE_AUTO_ADAPTIVE_THRESHOLD_MIN_USD = 60;
const LIVE_AUTO_ADAPTIVE_THRESHOLD_MAX_USD = 220;
const LIVE_AUTO_ADAPTIVE_STEP_UP_USD = 10;
const LIVE_AUTO_ADAPTIVE_STEP_DOWN_USD = 5;
const LIVE_AUTO_ADAPTIVE_PRESSURE_MIN_BLOCKS = 2;
const LIVE_AUTO_ADAPTIVE_PRESSURE_MIN_RATIO = 0.45;
const LIVE_AUTO_ADAPTIVE_TIGHTEN_STREAK = 2;
const LIVE_AUTO_ADAPTIVE_RELAX_STREAK = 3;
const MIN_PROFIT_FLOOR_USD = 0;
const DEMO_REPEAT_LOSS_COOLDOWN_MS = 10 * 60 * 1000;
const DISCOVERY_SCAN_MAX_LOAN_USD = 400;
type ScannerProfileMode = 'discovery' | 'live';
type ExternalFeedStatus = 'off' | 'connecting' | 'connected' | 'error';

const PRESET_DEMO = { loanAmount: 600, minProfit: MIN_PROFIT_FLOOR_USD, maxSlippage: 7.0, estimatedGasUsd: 3, maxLiquidityUsagePercent: 35 };
const PRESET_REALISTIC = { loanAmount: 6000, minProfit: 15, maxSlippage: 2.0, estimatedGasUsd: 25, maxLiquidityUsagePercent: 20, autoExecuteThreshold: 90 };
const PRESET_FIRST_LIVE = {
  loanAmount: 10000,
  minProfit: 100,
  maxSlippage: 1.2,
  estimatedGasUsd: 12,
  maxLiquidityUsagePercent: 15,
  autoExecuteThreshold: 150,
};

const SETTINGS_STORAGE_KEY = 'live_trading_panel_settings_v3';
const SCANNER_PROFILE_STORAGE_KEY = 'live_trading_panel_scanner_profile_v1';
const EXTERNAL_SCANNER_FEED_ENABLED_STORAGE_KEY = 'live_trading_external_feed_enabled_v1';
const ADAPTIVE_TELEMETRY_STORAGE_KEY = 'live_auto_adaptive_threshold_events_v1';
const ADAPTIVE_TELEMETRY_TABLE = 'live_auto_adaptive_threshold_events';
const EXTERNAL_SCANNER_WS_URL = String(import.meta.env.VITE_EXTERNAL_SCANNER_WS_URL || '').trim();
const EXTERNAL_SCANNER_RECONNECT_MS = 3000;
const ADAPTIVE_PENDING_STALE_WARNING_MINUTES = 15;
const ADAPTIVE_PENDING_WARN_COOLDOWN_MS = 10 * 60 * 1000;
const LOG_THROTTLE_RULES: Array<{ id: string; pattern: RegExp; cooldownMs: number }> = [
  { id: 'sameDexPauseActive', pattern: /^⏸️ sameDex regime gate active:/, cooldownMs: 180_000 },
  { id: 'sameDexRegimeEngaged', pattern: /^⏸️ Regime gate engaged:/, cooldownMs: 180_000 },
  { id: 'tightMarketSameDexGuidance', pattern: /^🧭 Tight market guidance: limited cross-DEX overlap/, cooldownMs: 90_000 },
  { id: 'noProfitableSpreads', pattern: /^⏳ No profitable spreads found this cycle\./, cooldownMs: 60_000 },
  { id: 'topNearMiss', pattern: /^👀 Top near-miss:/, cooldownMs: 180_000 },
  { id: 'sizeLadder', pattern: /^📏 Size ladder \(est\):/, cooldownMs: 180_000 },
  { id: 'serverScanCompleted', pattern: /^ℹ️ Server scan completed:/, cooldownMs: 120_000 },
  { id: 'marketCondition', pattern: /^📉 Market condition:/, cooldownMs: 120_000 },
  { id: 'liveMultichainVisibility', pattern: /^🛰️ Live mode now scans all configured networks/, cooldownMs: 300_000 },
];

const createAdaptiveTelemetryEventId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `adaptive-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isTransientSupabaseError = (error: unknown): boolean => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';

  return /err_connection_closed|connection closed|failed to fetch|network|timeout|temporar/i.test(message);
};

async function withTransientRetry<T>(operation: () => PromiseLike<T> | T, maxAttempts = 3): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await Promise.resolve(operation());
    } catch (error) {
      lastError = error;
      if (!isTransientSupabaseError(error) || attempt >= maxAttempts) {
        break;
      }
      await sleep(150 * (2 ** (attempt - 1)));
    }
  }

  throw lastError;
}

const loadPersistedScannerProfile = (): ScannerProfileMode => {
  if (typeof window === 'undefined') return 'discovery';
  try {
    const raw = window.localStorage.getItem(SCANNER_PROFILE_STORAGE_KEY);
    return raw === 'live' ? 'live' : 'discovery';
  } catch {
    return 'discovery';
  }
};

const loadExternalFeedEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(EXTERNAL_SCANNER_FEED_ENABLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const extractExternalOpportunities = (payload: unknown): OpportunityLike[] => {
  if (Array.isArray(payload)) {
    return payload as OpportunityLike[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;

  if (Array.isArray(root.opportunities)) {
    return root.opportunities as OpportunityLike[];
  }

  if (Array.isArray(root.watchlist)) {
    return root.watchlist as OpportunityLike[];
  }

  if (root.data && typeof root.data === 'object') {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.opportunities)) {
      return data.opportunities as OpportunityLike[];
    }
    if (Array.isArray(data.watchlist)) {
      return data.watchlist as OpportunityLike[];
    }
  }

  if (root.opportunity && typeof root.opportunity === 'object') {
    return [root.opportunity as OpportunityLike];
  }

  return [];
};

const loadAdaptiveTelemetryEvents = (): AdaptiveThresholdTelemetryEvent[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(ADAPTIVE_TELEMETRY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((row, index) => {
        const item = row as Partial<AdaptiveThresholdTelemetryEvent>;
        const direction = item.direction === 'up' || item.direction === 'down' || item.direction === 'reset'
          ? item.direction
          : 'reset';
        const derivedId = typeof item.eventId === 'string' && item.eventId.length > 0
          ? item.eventId
          : `legacy-${item.time || index}-${direction}-${item.previousThreshold || 0}-${item.nextThreshold || 0}`;

        return {
          eventId: derivedId,
          time: typeof item.time === 'string' ? item.time : new Date().toISOString(),
          direction,
          previousThreshold: Number(item.previousThreshold ?? 0),
          nextThreshold: Number(item.nextThreshold ?? 0),
          qualityBlocked: Number(item.qualityBlocked ?? 0),
          considered: Number(item.considered ?? 0),
          transportFailures: Number(item.transportFailures ?? 0),
          reason: typeof item.reason === 'string' ? item.reason : 'adaptive update',
          remoteSynced: Boolean(item.remoteSynced),
        };
      })
      .filter((item) => Number.isFinite(item.previousThreshold) && Number.isFinite(item.nextThreshold))
      .slice(0, 50);
  } catch {
    return [];
  }
};

const loadPersistedSettings = (fallbackLoanAmount: number) => {
  const safeFallbackLoan = Number.isFinite(Number(fallbackLoanAmount)) && Number(fallbackLoanAmount) > 0
    ? Math.max(500, Math.min(12000, Number(fallbackLoanAmount)))
    : 8000;

  const defaults = {
    minProfit: 15,
    maxGas: 40,
    maxSlippage: 2.0,
    estimatedGasUsd: 25,
    maxLiquidityUsagePercent: 20,
    loanAmount: safeFallbackLoan,
    autoExecuteThreshold: 80,
    scanIntervalSeconds: 45,
    maxConcurrentTrades: 1,
    dailyLossLimit: 120,
    contractAddress: getContractAddresses().arbitrageContract,
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<typeof defaults>;
    const parsedLoanAmount = Number(parsed.loanAmount);
    const parsedMinProfit = Number(parsed.minProfit);
    const parsedSlippage = Number(parsed.maxSlippage);
    const parsedEstimatedGas = Number(parsed.estimatedGasUsd);

    // Migrate away from previously too-tight defaults that suppressed candidate flow.
    const looksLikeLegacyTightProfile =
      Number.isFinite(parsedLoanAmount) && parsedLoanAmount >= 25_000 &&
      Number.isFinite(parsedMinProfit) && parsedMinProfit >= 40 &&
      Number.isFinite(parsedSlippage) && parsedSlippage === 1.5 &&
      Number.isFinite(parsedEstimatedGas) && parsedEstimatedGas === 8;

    if (looksLikeLegacyTightProfile) {
      return defaults;
    }

    return {
      ...defaults,
      ...parsed,
      minProfit: Number.isFinite(parsedMinProfit)
        ? Math.max(MIN_PROFIT_FLOOR_USD, parsedMinProfit)
        : defaults.minProfit,
      loanAmount: Number.isFinite(parsedLoanAmount)
        ? Math.max(500, Math.min(15000, parsedLoanAmount))
        : defaults.loanAmount,
    };
  } catch {
    return defaults;
  }
};

interface LiveTradingPanelProps {
  leanMode?: boolean;
}

export const LiveTradingPanel: React.FC<LiveTradingPanelProps> = ({ leanMode = false }) => {
  const { account, wallet, services, connectWallet, connecting, walletAvailable } = useWeb3();
  const { strategySettings, updateStrategySettings } = useAppContext();
  const { toast } = useToast();
  
  const chainId = wallet?.chainId;
  const provider = wallet?.provider;
  
  const [tradingState, setTradingState] = useState<TradingState>({
    mode: 'manual',
    status: 'idle',
    executionMode: 'demo',
    lastScan: null,
    tradesExecuted: 0,
    profitToday: 0,
    gasSpentToday: 0
  });

  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([]);
  const [executingTradeId, setExecutingTradeId] = useState<string | null>(null);
  const [scanInterval, setScanInterval] = useState<NodeJS.Timeout | null>(null);
  const [continuousScanActive, setContinuousScanActive] = useState(false);
  const [externalFeedEnabled, setExternalFeedEnabled] = useState<boolean>(() => loadExternalFeedEnabled());
  const [externalFeedStatus, setExternalFeedStatus] = useState<ExternalFeedStatus>('off');
  const [externalFeedMessageCount, setExternalFeedMessageCount] = useState(0);
  const [externalFeedLastMessageAt, setExternalFeedLastMessageAt] = useState<number | null>(null);
  const [scannerProfile, setScannerProfile] = useState<ScannerProfileMode>(() => loadPersistedScannerProfile());
  const [circuitBreakerState, setCircuitBreakerState] = useState<CircuitBreakerUiState>({
    active: false,
    reason: null,
    minutesRemaining: null,
    loading: false,
  });
  const [pairPerformance, setPairPerformance] = useState<PairPerformanceRow[]>([]);
  const [pairPerformanceLoading, setPairPerformanceLoading] = useState(false);
  const [recentExecutionLogs, setRecentExecutionLogs] = useState<RecentExecutionLog[]>([]);
  const [recentExecutionLogsLoading, setRecentExecutionLogsLoading] = useState(false);
  const [routeMemoryRows, setRouteMemoryRows] = useState<RouteMemoryRow[]>([]);
  const [routeMemoryLoading, setRouteMemoryLoading] = useState(false);
  const [clearingRouteKey, setClearingRouteKey] = useState<string | null>(null);
  const [latestRouteMemoryDiagnostics, setLatestRouteMemoryDiagnostics] = useState<LatestRouteMemoryDiagnostics | null>(null);
  const [latestAutoSuppressionDiagnostics, setLatestAutoSuppressionDiagnostics] = useState<LatestAutoSuppressionDiagnostics | null>(null);
  const [latestScanDiagnostics, setLatestScanDiagnostics] = useState<LatestScanDiagnostics | null>(null);
  const [latestCycleShadowDiagnostics, setLatestCycleShadowDiagnostics] = useState<LatestCycleShadowDiagnostics | null>(null);
  const [scanTransportHealth, setScanTransportHealth] = useState<ScanTransportHealth>({
    consecutiveFailures: 0,
    backoffRemainingMs: 0,
    lastFailureSource: 'none',
    lastFailureReason: '',
  });
  const [transportIncidents, setTransportIncidents] = useState<TransportIncident[]>([]);
  const [liveAutoAdaptiveThresholdOffset, setLiveAutoAdaptiveThresholdOffset] = useState(0);
  const [adaptiveTelemetryEvents, setAdaptiveTelemetryEvents] = useState<AdaptiveThresholdTelemetryEvent[]>(() => loadAdaptiveTelemetryEvents());
  const [adaptiveTelemetryRemoteStatus, setAdaptiveTelemetryRemoteStatus] = useState<AdaptiveTelemetryRemoteStatus>('unknown');
  const [spectrumDebugEnabled, setSpectrumDebugEnabled] = useState(false);
  const [latestSpectrumSnapshot, setLatestSpectrumSnapshot] = useState<SpectrumDebugSnapshot | null>(null);
  const [sameDexPauseRemainingMs, setSameDexPauseRemainingMs] = useState(0);
  const continuousScanRef = useRef<NodeJS.Timeout | null>(null);
  const continuousLoopActiveRef = useRef(false);
  const scanInFlightRef = useRef(false);
  const sameDexDominantStreakRef = useRef(0);
  const sameDexPauseUntilRef = useRef<number>(0);
  const sameDexPauseLastLogRef = useRef<number>(0);
  const transportFailureStreakRef = useRef(0);
  const transportBackoffUntilRef = useRef(0);
  const transportLastFailureSourceRef = useRef('none');
  const transportLastFailureReasonRef = useRef('');
  const liveAutoAdaptiveTightenStreakRef = useRef(0);
  const liveAutoAdaptiveRelaxStreakRef = useRef(0);
  const adaptiveTelemetryMissingWarnedRef = useRef(false);
  const adaptiveTelemetryStaleWarnedAtRef = useRef(0);
  const inFlightTradeIdsRef = useRef<Set<string>>(new Set());
  const externalFeedSocketRef = useRef<WebSocket | null>(null);
  const externalFeedReconnectTimerRef = useRef<number | null>(null);
  const previousLoanRef = useRef<number | null>(null);
  const loanChangeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const demoLossCooldownRef = useRef<Record<string, number>>({});
  const logThrottleStateRef = useRef<Record<string, number>>({});
  const [scanLog, setScanLog] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'warn' | 'error' }>>([]);

  const routeMemoryByKey = useMemo(() => {
    const next = new Map<string, RouteMemoryRow>();
    for (const row of routeMemoryRows) {
      const key = String(row.route_key || '').trim().toLowerCase();
      if (key) next.set(key, row);
    }
    return next;
  }, [routeMemoryRows]);

  const formatRegimePauseCountdown = useCallback((remainingMs: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, []);

  const appendAdaptiveTelemetryEvent = useCallback((event: Omit<AdaptiveThresholdTelemetryEvent, 'eventId' | 'remoteSynced'> & {
    eventId?: string;
    remoteSynced?: boolean;
  }) => {
    const normalized: AdaptiveThresholdTelemetryEvent = {
      ...event,
      eventId: event.eventId || createAdaptiveTelemetryEventId(),
      remoteSynced: Boolean(event.remoteSynced),
    };
    setAdaptiveTelemetryEvents((prev) => [normalized, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADAPTIVE_TELEMETRY_STORAGE_KEY, JSON.stringify(adaptiveTelemetryEvents));
  }, [adaptiveTelemetryEvents]);

  useEffect(() => {
    const updateRemaining = () => {
      const remaining = Math.max(0, sameDexPauseUntilRef.current - Date.now());
      setSameDexPauseRemainingMs(remaining);
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setScanTransportHealth((prev) => {
        const remaining = Math.max(0, transportBackoffUntilRef.current - Date.now());
        if (remaining === prev.backoffRemainingMs) return prev;
        return {
          ...prev,
          backoffRemainingMs: remaining,
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleConnectWallet = useCallback(async () => {
    if (!walletAvailable) {
      const shouldDownload = window.confirm(
        "MetaMask wasn't detected in this browser context. If you're using VS Code's embedded browser, open localhost in your regular browser where MetaMask is installed. Click OK to download MetaMask, or Cancel to continue.",
      );
      if (shouldDownload) {
        window.open('https://metamask.io/download/', '_blank', 'noopener,noreferrer');
        return;
      }
    }

    await connectWallet();
  }, [walletAvailable, connectWallet]);

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const now = Date.now();
    const throttleRule = LOG_THROTTLE_RULES.find((rule) => rule.pattern.test(message));
    if (throttleRule) {
      const lastLoggedAt = logThrottleStateRef.current[throttleRule.id] ?? 0;
      if (now - lastLoggedAt < throttleRule.cooldownMs) {
        return;
      }
      logThrottleStateRef.current[throttleRule.id] = now;
    }

    const time = new Date().toLocaleTimeString();
    setScanLog(prev => [{ time, message, type }, ...prev].slice(0, 100));
  }, []);

  const syncTransportHealthState = useCallback(() => {
    const remaining = Math.max(0, transportBackoffUntilRef.current - Date.now());
    setScanTransportHealth({
      consecutiveFailures: transportFailureStreakRef.current,
      backoffRemainingMs: remaining,
      lastFailureSource: transportLastFailureSourceRef.current,
      lastFailureReason: transportLastFailureReasonRef.current,
    });
  }, []);

  const registerTransportFailure = useCallback((source: string, reason: string) => {
    const nextStreak = transportFailureStreakRef.current + 1;
    transportFailureStreakRef.current = nextStreak;
    transportLastFailureSourceRef.current = source;
    transportLastFailureReasonRef.current = reason;

    const backoffMs = Math.min(
      TRANSPORT_BACKOFF_MAX_MS,
      TRANSPORT_BACKOFF_BASE_MS * (2 ** Math.max(0, nextStreak - 1)),
    );
    transportBackoffUntilRef.current = Date.now() + backoffMs;
    const time = new Date().toLocaleTimeString();
    setTransportIncidents((prev) => [
      { time, source, reason, streak: nextStreak, backoffMs },
      ...prev,
    ].slice(0, 12));
    syncTransportHealthState();
    if (nextStreak === 1) {
      addLog(
        `🌐 Transport instability (${source}): ${reason}. Backing off server scan for ${Math.ceil(backoffMs / 1000)}s (streak ${nextStreak}).`,
        'info',
      );
    }
  }, [addLog, syncTransportHealthState]);

  const clearTransportFailures = useCallback((context: string) => {
    if (transportFailureStreakRef.current <= 0) return;
    transportFailureStreakRef.current = 0;
    transportBackoffUntilRef.current = 0;
    transportLastFailureSourceRef.current = 'none';
    transportLastFailureReasonRef.current = '';
    syncTransportHealthState();
    addLog(`✅ Transport recovered (${context}). Clearing server backoff.`, 'info');
  }, [addLog, syncTransportHealthState]);

  const refreshCircuitBreakerState = useCallback(async () => {
    if (tradingState.executionMode !== 'live') {
      setCircuitBreakerState({ active: false, reason: null, minutesRemaining: null, loading: false });
      return;
    }

    setCircuitBreakerState((prev) => ({ ...prev, loading: true }));
    try {
      const status = await getLiveCircuitBreakerStatus();
      setCircuitBreakerState({
        active: status.active,
        reason: status.reason || null,
        minutesRemaining: status.minutesRemaining ?? null,
        loading: false,
      });
    } catch {
      setCircuitBreakerState({ active: false, reason: null, minutesRemaining: null, loading: false });
    }
  }, [tradingState.executionMode]);

  const refreshPairPerformance = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setPairPerformance([]);
      return;
    }

    if (Date.now() < transportBackoffUntilRef.current) {
      return;
    }

    setPairPerformanceLoading(true);
    try {
      const { data, error } = await withTransientRetry(() => supabase
        .from('v_pair_performance')
        .select('network, token_pair, routes, total_executions, success_rate_pct, avg_route_realized_net, cumulative_realized_net')
        .order('cumulative_realized_net', { ascending: false })
        .limit(8));

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []).map((row) => ({
        network: String(row.network || 'unknown'),
        token_pair: String(row.token_pair || 'unknown'),
        routes: Number(row.routes || 0),
        total_executions: Number(row.total_executions || 0),
        success_rate_pct: Number(row.success_rate_pct || 0),
        avg_route_realized_net: Number(row.avg_route_realized_net || 0),
        cumulative_realized_net: Number(row.cumulative_realized_net || 0),
      }));

      setPairPerformance(rows);
      clearTransportFailures('pair performance refresh');
    } catch {
      registerTransportFailure('dashboard-pair-performance', 'v_pair_performance refresh failed');
      // Keep last good snapshot during transient outages.
    } finally {
      setPairPerformanceLoading(false);
    }
  }, [clearTransportFailures, registerTransportFailure]);

  const refreshRecentExecutionLogs = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setRecentExecutionLogs([]);
      return;
    }

    if (Date.now() < transportBackoffUntilRef.current) {
      return;
    }

    setRecentExecutionLogsLoading(true);
    try {
      const { data, error } = await withTransientRetry(() => supabase
        .from('trade_execution_logs')
        .select('id, token_pair, network, buy_dex, sell_dex, status, execution_mode, actual_profit, gas_cost, error_message, executed_at, tx_hash, metadata')
        .order('executed_at', { ascending: false })
        .limit(8));

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []).map((row) => ({
        id: String(row.id),
        token_pair: String(row.token_pair || 'unknown'),
        network: String(row.network || 'unknown'),
        buy_dex: String(row.buy_dex || 'unknown'),
        sell_dex: String(row.sell_dex || 'unknown'),
        status: (row.status || 'failed') as RecentExecutionLog['status'],
        execution_mode: String(row.execution_mode || 'unknown'),
        actual_profit: row.actual_profit == null ? null : Number(row.actual_profit),
        gas_cost: row.gas_cost == null ? null : Number(row.gas_cost),
        error_message: row.error_message == null ? null : String(row.error_message),
        executed_at: String(row.executed_at || new Date().toISOString()),
        tx_hash: row.tx_hash == null ? null : String(row.tx_hash),
        metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : null,
      }));

      setRecentExecutionLogs(rows);
      clearTransportFailures('recent execution logs refresh');
    } catch {
      registerTransportFailure('dashboard-recent-executions', 'trade_execution_logs refresh failed');
      // Keep last good snapshot during transient outages.
    } finally {
      setRecentExecutionLogsLoading(false);
    }
  }, [clearTransportFailures, registerTransportFailure]);

  const refreshRouteMemory = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setRouteMemoryRows([]);
      return;
    }

    if (Date.now() < transportBackoffUntilRef.current) {
      return;
    }

    setRouteMemoryLoading(true);
    try {
      const { data, error } = await withTransientRetry(() => supabase
        .from('route_memory')
        .select('id, route_key, network, token_pair, buy_dex, sell_dex, total_executions, avg_realized_net, last_realized_net, cooldown_until, last_executed_at')
        .order('last_executed_at', { ascending: false })
        .limit(10));

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []).map((row) => ({
        id: String(row.id),
        route_key: String(row.route_key || 'unknown'),
        network: String(row.network || 'unknown'),
        token_pair: String(row.token_pair || 'unknown'),
        buy_dex: String(row.buy_dex || 'unknown'),
        sell_dex: String(row.sell_dex || 'unknown'),
        total_executions: Number(row.total_executions || 0),
        avg_realized_net: Number(row.avg_realized_net || 0),
        last_realized_net: row.last_realized_net == null ? null : Number(row.last_realized_net),
        cooldown_until: row.cooldown_until == null ? null : String(row.cooldown_until),
        last_executed_at: row.last_executed_at == null ? null : String(row.last_executed_at),
      })).sort((left, right) => {
        const leftCooldown = left.cooldown_until ? Date.parse(left.cooldown_until) : NaN;
        const rightCooldown = right.cooldown_until ? Date.parse(right.cooldown_until) : NaN;
        const leftActive = Number.isFinite(leftCooldown) && leftCooldown > Date.now();
        const rightActive = Number.isFinite(rightCooldown) && rightCooldown > Date.now();
        if (leftActive !== rightActive) return leftActive ? -1 : 1;

        const leftExecuted = left.last_executed_at ? Date.parse(left.last_executed_at) : 0;
        const rightExecuted = right.last_executed_at ? Date.parse(right.last_executed_at) : 0;
        return rightExecuted - leftExecuted;
      });

      setRouteMemoryRows(rows);
      clearTransportFailures('route memory refresh');
    } catch {
      registerTransportFailure('dashboard-route-memory', 'route_memory refresh failed');
      // Keep last good snapshot during transient outages.
    } finally {
      setRouteMemoryLoading(false);
    }
  }, [clearTransportFailures, registerTransportFailure]);

  const clearRouteCooldown = useCallback(async (routeKey: string) => {
    setClearingRouteKey(routeKey);
    try {
      const { error } = await supabase
        .from('route_memory')
        .update({ cooldown_until: null, updated_at: new Date().toISOString() })
        .eq('route_key', routeKey);

      if (error) throw error;

      addLog(`🧹 Cleared route cooldown for ${routeKey}`, 'info');
      toast({
        title: 'Route Cooldown Cleared',
        description: routeKey,
      });
      await refreshRouteMemory();
    } catch {
      toast({
        title: 'Cooldown Clear Failed',
        description: routeKey,
        variant: 'destructive',
      });
    } finally {
      setClearingRouteKey(null);
    }
  }, [addLog, refreshRouteMemory, toast]);

  const clearAllRouteCooldowns = useCallback(async () => {
    const activeRouteKeys = routeMemoryRows
      .filter((row) => row.cooldown_until && Date.parse(row.cooldown_until) > Date.now())
      .map((row) => row.route_key);

    if (activeRouteKeys.length === 0) return;

    setClearingRouteKey('__all__');
    try {
      const { error } = await supabase
        .from('route_memory')
        .update({ cooldown_until: null, updated_at: new Date().toISOString() })
        .in('route_key', activeRouteKeys);

      if (error) throw error;

      addLog(`🧹 Cleared ${activeRouteKeys.length} active route cooldowns`, 'info');
      toast({
        title: 'All Route Cooldowns Cleared',
        description: `${activeRouteKeys.length} routes reset.`,
      });
      await refreshRouteMemory();
    } catch {
      toast({
        title: 'Bulk Cooldown Clear Failed',
        description: 'Unable to clear active route cooldowns.',
        variant: 'destructive',
      });
    } finally {
      setClearingRouteKey(null);
    }
  }, [addLog, refreshRouteMemory, routeMemoryRows, toast]);

  const refreshDailyExecutionSummary = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    if (Date.now() < transportBackoffUntilRef.current) {
      return;
    }

    try {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const { data, error } = await withTransientRetry(() => supabase
        .from('trade_execution_logs')
        .select('actual_profit, gas_cost, executed_at')
        .gte('executed_at', dayStart.toISOString())
        .limit(200));

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const tradesExecuted = rows.length;
      const profitToday = rows.reduce((sum, row) => sum + Number(row.actual_profit || 0), 0);
      const gasSpentToday = rows.reduce((sum, row) => sum + Number(row.gas_cost || 0), 0);

      setTradingState((prev) => ({
        ...prev,
        tradesExecuted,
        profitToday,
        gasSpentToday,
      }));
      clearTransportFailures('daily summary refresh');
    } catch {
      registerTransportFailure('dashboard-daily-summary', 'daily execution summary refresh failed');
      // Keep local optimistic counters when the summary query is unavailable.
    }
  }, [clearTransportFailures, registerTransportFailure]);

  const [settings, setSettings] = useState(() => loadPersistedSettings(strategySettings.loanSize || PRESET_DEMO.loanAmount));

  const setLoanAmount = useCallback((value: number) => {
    const normalizedValue = Math.max(100, Math.min(1000000, Number(value) || 100));
    setSettings((prev) => ({ ...prev, loanAmount: normalizedValue }));
    updateStrategySettings({ loanSize: normalizedValue });
  }, [updateStrategySettings]);

  const applyPreset = useCallback((preset: {
    loanAmount: number;
    minProfit: number;
    maxSlippage: number;
    estimatedGasUsd: number;
    maxLiquidityUsagePercent: number;
    autoExecuteThreshold?: number;
  }) => {
    setSettings((prev) => ({
      ...prev,
      loanAmount: preset.loanAmount,
      minProfit: Math.max(MIN_PROFIT_FLOOR_USD, preset.minProfit),
      maxSlippage: preset.maxSlippage,
      estimatedGasUsd: preset.estimatedGasUsd,
      maxLiquidityUsagePercent: preset.maxLiquidityUsagePercent,
      autoExecuteThreshold: preset.autoExecuteThreshold ?? prev.autoExecuteThreshold,
    }));
    updateStrategySettings({ loanSize: preset.loanAmount });
  }, [updateStrategySettings]);

  const switchScannerProfile = useCallback((profile: ScannerProfileMode) => {
    setScannerProfile(profile);
    const preset = profile === 'live' ? PRESET_REALISTIC : PRESET_DEMO;
    applyPreset(preset);
    addLog(
      profile === 'live'
        ? '🧭 Scanner profile switched to Live Discovery: tighter thresholds and Ethereum-focused scanning.'
        : '🧭 Scanner profile switched to Discovery: broader networks and permissive thresholds.',
      'info',
    );
  }, [applyPreset, addLog]);

  const liveExecutionBlocker = useMemo(
    () => getLiveExecutionBlocker({ network: 'ethereum' }, account, settings.contractAddress),
    [account, settings.contractAddress],
  );
  const liveTradingEnabledFlag = String(import.meta.env.VITE_LIVE_TRADING_ENABLED || '').toLowerCase() === 'true';
  const effectiveLiveSlippageCap = 1.75;
  const defaultContractAddress = useMemo(() => getContractAddresses().arbitrageContract, []);
  const effectiveAutoExecuteThreshold = useMemo(() => {
    const base = Math.max(0, Number(settings.autoExecuteThreshold) || 0);
    if (tradingState.executionMode !== 'live') {
      return base;
    }

    return Math.max(
      LIVE_AUTO_ADAPTIVE_THRESHOLD_MIN_USD,
      Math.min(LIVE_AUTO_ADAPTIVE_THRESHOLD_MAX_USD, base + liveAutoAdaptiveThresholdOffset),
    );
  }, [liveAutoAdaptiveThresholdOffset, settings.autoExecuteThreshold, tradingState.executionMode]);

  const adaptiveTelemetryPendingCount = useMemo(
    () => adaptiveTelemetryEvents.filter((event) => !event.remoteSynced).length,
    [adaptiveTelemetryEvents],
  );

  const adaptiveTelemetrySyncedCount = useMemo(
    () => adaptiveTelemetryEvents.filter((event) => event.remoteSynced).length,
    [adaptiveTelemetryEvents],
  );

  const adaptiveTelemetryOldestPendingMinutes = useMemo(() => {
    const pending = adaptiveTelemetryEvents
      .filter((event) => !event.remoteSynced)
      .map((event) => Date.parse(event.time))
      .filter((value) => Number.isFinite(value));

    if (pending.length === 0) return 0;
    const oldest = Math.min(...pending);
    return Math.max(0, Math.floor((Date.now() - oldest) / 60000));
  }, [adaptiveTelemetryEvents]);

  const telemetryRunbookHint = useMemo(() => {
    if (adaptiveTelemetryRemoteStatus === 'missing') {
      return 'Run migration 008 first, then use Queue Health Check (Query 6).';
    }
    if (adaptiveTelemetryPendingCount > 0) {
      return 'Use Queue Health Check (Query 6), then Recent Adaptive Events (Query 1).';
    }
    if (adaptiveTelemetrySyncedCount > 0) {
      return 'Start with Event Pressure Ratio (Query 2) and Link Adaptive Events to Trade Outcomes (Query 4).';
    }
    return 'Run a few live scans, then start with Recent Adaptive Events (Query 1).';
  }, [adaptiveTelemetryPendingCount, adaptiveTelemetryRemoteStatus, adaptiveTelemetrySyncedCount]);

  const adaptiveQuery6 = `select
  count(*) as total_rows,
  max(occurred_at) as latest_event_at,
  min(occurred_at) as earliest_event_at
from live_auto_adaptive_threshold_events;`;

  const adaptiveQuery1 = `select
  occurred_at,
  direction,
  previous_threshold,
  next_threshold,
  quality_blocked,
  considered,
  transport_failures,
  base_threshold,
  adaptive_offset,
  reason
from live_auto_adaptive_threshold_events
order by occurred_at desc
limit 200;`;

  const adaptiveQuery4 = `with event_windows as (
  select event_id, occurred_at, direction, occurred_at as window_start, occurred_at + interval '15 minutes' as window_end
  from live_auto_adaptive_threshold_events
)
select
  e.direction,
  count(t.id) as trades_in_window,
  avg(coalesce(t.actual_profit, 0)) as avg_trade_profit,
  avg(case when coalesce(t.actual_profit, 0) > 0 then 1 else 0 end)::numeric * 100 as win_rate_pct
from event_windows e
left join trade_execution_logs t
  on t.executed_at >= e.window_start
 and t.executed_at < e.window_end
group by e.direction
order by e.direction;`;

  const adaptiveAllQueries = `-- Query 1: Recent Adaptive Events\n${adaptiveQuery1}\n\n-- Query 6: Queue Health Check\n${adaptiveQuery6}\n\n-- Query 4: Adaptive Events vs Trade Outcomes (15m)\n${adaptiveQuery4}`;

  const copyTelemetryQuery = useCallback(async (label: string, query: string) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable in this browser context.');
      }
      await navigator.clipboard.writeText(query);
      addLog(`📋 Copied ${label} SQL to clipboard.`, 'success');
      toast({
        title: 'Query Copied',
        description: `${label} SQL copied to clipboard.`,
      });
    } catch {
      addLog(`⚠️ Unable to copy ${label} SQL.`, 'warn');
      toast({
        title: 'Copy Failed',
        description: `Unable to copy ${label} SQL in this browser context.`,
        variant: 'destructive',
      });
    }
  }, [addLog, toast]);

  const flushAdaptiveTelemetryEvents = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    if (Date.now() < transportBackoffUntilRef.current) return;
    if (adaptiveTelemetryRemoteStatus === 'missing') return;

    const unsynced = adaptiveTelemetryEvents.filter((event) => !event.remoteSynced).slice(0, 10);
    if (unsynced.length === 0) return;

    try {
      const payload = unsynced.map((event) => ({
        event_id: event.eventId,
        occurred_at: event.time,
        direction: event.direction,
        previous_threshold: event.previousThreshold,
        next_threshold: event.nextThreshold,
        quality_blocked: event.qualityBlocked,
        considered: event.considered,
        transport_failures: event.transportFailures,
        base_threshold: Math.max(0, Number(settings.autoExecuteThreshold) || 0),
        adaptive_offset: liveAutoAdaptiveThresholdOffset,
        network: 'ethereum',
        execution_mode: tradingState.executionMode,
        reason: event.reason,
        metadata: {
          source: 'live-trading-panel',
        },
      }));

      const { error } = await withTransientRetry(() => supabase
        .from(ADAPTIVE_TELEMETRY_TABLE)
        .upsert(payload, { onConflict: 'event_id', ignoreDuplicates: true }));

      if (error) throw error;

      if (adaptiveTelemetryRemoteStatus !== 'ready') {
        setAdaptiveTelemetryRemoteStatus('ready');
      }

      const syncedIds = new Set(unsynced.map((event) => event.eventId));
      setAdaptiveTelemetryEvents((prev) => prev.map((event) => (
        syncedIds.has(event.eventId)
          ? { ...event, remoteSynced: true }
          : event
      )));
      clearTransportFailures('adaptive telemetry flush');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
      if (/relation\s+"?live_auto_adaptive_threshold_events"?\s+does not exist|42p01/i.test(message)) {
        setAdaptiveTelemetryRemoteStatus('missing');
        if (!adaptiveTelemetryMissingWarnedRef.current) {
          adaptiveTelemetryMissingWarnedRef.current = true;
          addLog('🧩 Adaptive telemetry table is not deployed yet. Apply migration 008 to enable remote telemetry sync.', 'warn');
        }
        return;
      }
      registerTransportFailure('dashboard-adaptive-telemetry', 'adaptive threshold telemetry flush failed');
    }
  }, [adaptiveTelemetryEvents, adaptiveTelemetryRemoteStatus, addLog, clearTransportFailures, liveAutoAdaptiveThresholdOffset, registerTransportFailure, settings.autoExecuteThreshold, tradingState.executionMode]);

  useEffect(() => {
    void flushAdaptiveTelemetryEvents();
    const intervalId = window.setInterval(() => {
      void flushAdaptiveTelemetryEvents();
    }, 45_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [flushAdaptiveTelemetryEvents]);

  useEffect(() => {
    const stalePending = adaptiveTelemetryRemoteStatus === 'missing'
      && adaptiveTelemetryPendingCount > 0
      && adaptiveTelemetryOldestPendingMinutes >= ADAPTIVE_PENDING_STALE_WARNING_MINUTES;

    if (!stalePending) return;

    const now = Date.now();
    if (now - adaptiveTelemetryStaleWarnedAtRef.current < ADAPTIVE_PENDING_WARN_COOLDOWN_MS) {
      return;
    }

    adaptiveTelemetryStaleWarnedAtRef.current = now;
    addLog(
      `🧱 Adaptive telemetry pending for ${adaptiveTelemetryOldestPendingMinutes}m (${adaptiveTelemetryPendingCount} event${adaptiveTelemetryPendingCount === 1 ? '' : 's'}). Apply migration 008 to resume remote telemetry sync.`,
      'warn',
    );
  }, [adaptiveTelemetryOldestPendingMinutes, adaptiveTelemetryPendingCount, adaptiveTelemetryRemoteStatus, addLog]);

  const liveReadinessChecks = useMemo<LiveReadinessCheck[]>(() => {
    return [
      {
        id: 'wallet',
        label: 'Wallet connected',
        passed: Boolean(account),
        required: true,
        detail: account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : 'Current value: Not connected',
      },
      {
        id: 'contract',
        label: 'Contract configured',
        passed: !liveExecutionBlocker || !liveExecutionBlocker.toLowerCase().includes('contract'),
        required: true,
        detail: liveExecutionBlocker && liveExecutionBlocker.toLowerCase().includes('contract')
          ? `Current value: ${settings.contractAddress || 'empty'} • ${liveExecutionBlocker}`
          : `Current value: ${settings.contractAddress || 'empty'} • address format looks valid`,
      },
      {
        id: 'armed',
        label: 'Live trading armed',
        passed: !liveExecutionBlocker || !liveExecutionBlocker.toLowerCase().includes('disarmed'),
        required: true,
        detail: liveExecutionBlocker && liveExecutionBlocker.toLowerCase().includes('disarmed')
          ? `Current value: VITE_LIVE_TRADING_ENABLED=${String(import.meta.env.VITE_LIVE_TRADING_ENABLED || '(unset)')} • ${liveExecutionBlocker}`
          : `Current value: VITE_LIVE_TRADING_ENABLED=${liveTradingEnabledFlag}`,
      },
      {
        id: 'breaker',
        label: 'Circuit breaker clear',
        passed: !circuitBreakerState.active,
        required: true,
        detail: circuitBreakerState.active
          ? `${circuitBreakerState.reason || 'Safety threshold reached'} (${circuitBreakerState.minutesRemaining || 1}m remaining)`
          : 'No active live lock',
      },
      {
        id: 'profile',
        label: 'Scanner profile set to Live Discovery',
        passed: scannerProfile === 'live',
        required: false,
        detail: scannerProfile === 'live'
          ? 'Using live profile with multi-chain scan visibility (Ethereum-only live execution)'
          : 'Switch scanner profile to Live for production routing',
      },
      {
        id: 'slippage',
        label: 'Max slippage policy',
        passed: settings.maxSlippage <= effectiveLiveSlippageCap,
        required: true,
        detail: settings.maxSlippage <= effectiveLiveSlippageCap
          ? `Current value: ${settings.maxSlippage.toFixed(2)}% (cap ${effectiveLiveSlippageCap.toFixed(2)}%)`
          : `Current value: ${settings.maxSlippage.toFixed(2)}% > cap ${effectiveLiveSlippageCap.toFixed(2)}%`,
      },
    ];
  }, [account, circuitBreakerState.active, circuitBreakerState.minutesRemaining, circuitBreakerState.reason, liveExecutionBlocker, liveTradingEnabledFlag, scannerProfile, settings.contractAddress, settings.maxSlippage]);

  const liveReadinessBlockingReasons = useMemo(
    () => liveReadinessChecks.filter((check) => check.required && !check.passed).map((check) => `${check.label}: ${check.detail}`),
    [liveReadinessChecks],
  );

  const liveProductionReady = useMemo(
    () => liveReadinessChecks.every((check) => !check.required || check.passed),
    [liveReadinessChecks],
  );

  const getPairHistoryBlocker = useCallback((trade: Pick<PendingTrade, 'tokenPair' | 'network'>): string | null => {
    const network = String(trade.network || '').toLowerCase();
    const tokenPair = String(trade.tokenPair || '').toLowerCase();
    const row = pairPerformance.find((item) => (
      String(item.network || '').toLowerCase() === network
      && String(item.token_pair || '').toLowerCase() === tokenPair
    ));

    if (!row) return null;
    if (row.total_executions < PAIR_HISTORY_MIN_EXECUTIONS) return null;

    if (row.success_rate_pct < PAIR_HISTORY_MIN_SUCCESS_RATE_PCT) {
      return `Pair ${row.token_pair} is blocked: historical win rate ${row.success_rate_pct.toFixed(1)}% across ${row.total_executions} executions.`;
    }

    if (row.cumulative_realized_net < PAIR_HISTORY_MIN_CUMULATIVE_NET_USD) {
      return `Pair ${row.token_pair} is blocked: cumulative realized net $${row.cumulative_realized_net.toFixed(2)} across ${row.total_executions} executions.`;
    }

    return null;
  }, [pairPerformance]);

  const getPairHistoryThrottle = useCallback((trade: Pick<PendingTrade, 'tokenPair' | 'network' | 'loanAmount'>): {
    factor: number;
    adjustedLoanAmount: number;
    reason: string;
  } | null => {
    const network = String(trade.network || '').toLowerCase();
    const tokenPair = String(trade.tokenPair || '').toLowerCase();
    const row = pairPerformance.find((item) => (
      String(item.network || '').toLowerCase() === network
      && String(item.token_pair || '').toLowerCase() === tokenPair
    ));

    if (!row) return null;
    if (row.total_executions < PAIR_HISTORY_SOFT_MIN_EXECUTIONS) return null;
    if (row.total_executions >= PAIR_HISTORY_MIN_EXECUTIONS && getPairHistoryBlocker(trade)) return null;

    let factor = 1;
    const reasons: string[] = [];

    if (row.success_rate_pct < PAIR_HISTORY_SOFT_SUCCESS_RATE_PCT) {
      factor = Math.min(factor, Math.max(PAIR_HISTORY_MIN_LOAN_FACTOR, row.success_rate_pct / PAIR_HISTORY_SOFT_SUCCESS_RATE_PCT));
      reasons.push(`win rate ${row.success_rate_pct.toFixed(1)}%`);
    }

    if (row.cumulative_realized_net < PAIR_HISTORY_SOFT_CUMULATIVE_NET_USD) {
      const cumulativeNetFactor = Math.max(
        PAIR_HISTORY_MIN_LOAN_FACTOR,
        1 - Math.min(0.6, Math.abs(row.cumulative_realized_net) / 100),
      );
      factor = Math.min(factor, cumulativeNetFactor);
      reasons.push(`cum net $${row.cumulative_realized_net.toFixed(2)}`);
    }

    if (factor >= 0.999 || reasons.length === 0) return null;

    const adjustedLoanAmount = Math.max(100, Math.round((trade.loanAmount * factor) / 100) * 100);
    if (adjustedLoanAmount >= trade.loanAmount) return null;

    return {
      factor,
      adjustedLoanAmount,
      reason: reasons.join(' and '),
    };
  }, [getPairHistoryBlocker, pairPerformance]);

  const getPairExecutionPriority = useCallback((trade: Pick<PendingTrade, 'tokenPair' | 'network' | 'loanAmount'>): number => {
    const blocker = getPairHistoryBlocker(trade);
    if (blocker) return -1000;

    const throttle = getPairHistoryThrottle(trade);
    const network = String(trade.network || '').toLowerCase();
    const tokenPair = String(trade.tokenPair || '').toLowerCase();
    const row = pairPerformance.find((item) => (
      String(item.network || '').toLowerCase() === network
      && String(item.token_pair || '').toLowerCase() === tokenPair
    ));

    if (!row) {
      const defaultScore = throttle ? 40 * throttle.factor : 75;
      return defaultScore - (isWethPair(trade.tokenPair) ? WETH_PAIR_PRIORITY_PENALTY : 0);
    }

    const baseScore = row.success_rate_pct
      + Math.max(-25, Math.min(25, row.cumulative_realized_net))
      + Math.min(20, row.total_executions);

    const weightedScore = throttle ? baseScore * throttle.factor : baseScore + 25;
    return weightedScore - (isWethPair(trade.tokenPair) ? WETH_PAIR_PRIORITY_PENALTY : 0);
  }, [getPairHistoryBlocker, getPairHistoryThrottle, pairPerformance]);

  const getRouteMemoryPriorityAdjustment = useCallback((trade: Pick<PendingTrade, 'tokenPair' | 'network' | 'buyDex' | 'sellDex'>): number => {
    const routeKey = buildRouteKey(trade);
    const row = routeMemoryByKey.get(routeKey);
    if (!row) return 0;

    const cooldownActive = row.cooldown_until && Date.parse(row.cooldown_until) > Date.now();
    if (cooldownActive) return -250;

    let adjustment = 0;
    adjustment += Math.max(-30, Math.min(30, row.avg_realized_net * 2));

    if (row.total_executions > 0 && row.avg_realized_net > 0) {
      adjustment += Math.min(12, row.total_executions * 2);
    } else if (row.total_executions >= 3 && row.avg_realized_net < 0) {
      adjustment -= Math.min(12, row.total_executions * 2);
    }

    if (Number.isFinite(row.last_realized_net ?? NaN)) {
      adjustment += Math.max(-8, Math.min(8, Number(row.last_realized_net) / 2));
    }

    return adjustment;
  }, [routeMemoryByKey]);

  const getRouteMemorySummary = useCallback((trade: Pick<PendingTrade, 'tokenPair' | 'network' | 'buyDex' | 'sellDex'>): string | null => {
    const routeKey = buildRouteKey(trade);
    const row = routeMemoryByKey.get(routeKey);
    if (!row) return null;

    const cooldownActive = row.cooldown_until && Date.parse(row.cooldown_until) > Date.now();
    if (cooldownActive) {
      return `route cooldown until ${new Date(row.cooldown_until!).toLocaleTimeString()}`;
    }

    const avg = Number(row.avg_realized_net ?? 0);
    const last = Number(row.last_realized_net ?? NaN);
    const avgLabel = `${avg >= 0 ? '+' : ''}$${avg.toFixed(2)}`;
    const lastLabel = Number.isFinite(last) ? `, last ${last >= 0 ? '+' : ''}$${last.toFixed(2)}` : '';
    return `route avg ${avgLabel} over ${row.total_executions} exec${row.total_executions === 1 ? '' : 's'}${lastLabel}`;
  }, [routeMemoryByKey]);

  const getLiveAutoQualityBlocker = useCallback((trade: Pick<PendingTrade, 'tokenPair' | 'network'>): string | null => {
    const network = String(trade.network || '').toLowerCase();
    const tokenPair = String(trade.tokenPair || '').toLowerCase();
    const row = pairPerformance.find((item) => (
      String(item.network || '').toLowerCase() === network
      && String(item.token_pair || '').toLowerCase() === tokenPair
    ));

    if (!row) return null;
    if (row.total_executions < PAIR_HISTORY_SOFT_MIN_EXECUTIONS) return null;

    const transportUnstable = scanTransportHealth.consecutiveFailures > 0;
    const weakWinRate = row.success_rate_pct < LIVE_AUTO_QUALITY_MIN_SUCCESS_RATE_PCT;
    const weakCumNet = row.cumulative_realized_net < LIVE_AUTO_QUALITY_MIN_CUMULATIVE_NET_USD;

    if (transportUnstable && (weakWinRate || weakCumNet)) {
      return `Live auto quality gate: ${row.token_pair} has ${row.success_rate_pct.toFixed(1)}% win rate and cumulative net $${row.cumulative_realized_net.toFixed(2)} while transport is unstable.`;
    }

    return null;
  }, [pairPerformance, scanTransportHealth.consecutiveFailures]);

  const getScanQualityPriorityAdjustment = useCallback((trade: Pick<PendingTrade, 'tokenPair' | 'status' | 'confidence' | 'expectedProfit' | 'gasCost' | 'distanceToExecutableUsd'>): number => {
    let penalty = 0;

    if (isCycleShadowOpportunity(trade)) {
      penalty += 30;
    }

    const confidence = Number.isFinite(trade.confidence) ? trade.confidence : 0;
    if (confidence < 60) {
      penalty += 12;
    } else if (confidence < 75) {
      penalty += 6;
    }

    const expectedProfit = Number.isFinite(trade.expectedProfit) ? trade.expectedProfit : 0;
    const gasCost = Number.isFinite(trade.gasCost) ? Math.max(0, trade.gasCost) : 0;
    const grossBeforeGas = Math.max(1, expectedProfit + gasCost);
    const gasBurden = gasCost / grossBeforeGas;
    if (gasBurden > 0.75) {
      penalty += 16;
    } else if (gasBurden > 0.55) {
      penalty += 9;
    }

    const distanceToExecutableUsd = Number.isFinite(trade.distanceToExecutableUsd ?? NaN)
      ? Math.max(0, Number(trade.distanceToExecutableUsd))
      : 0;
    if (trade.status === 'watchlist' && distanceToExecutableUsd > DEMO_AUTO_MAX_DISTANCE_TO_EXECUTABLE_USD) {
      penalty += 8;
    }

    // Under transport instability, heavily penalize fragile edges to preserve execution reliability.
    const transportStreak = scanTransportHealth.consecutiveFailures;
    if (transportStreak > 0) {
      penalty += Math.min(18, transportStreak * 4);
      if (confidence < 70) penalty += 10;
      if (gasBurden > 0.6) penalty += 10;
      if (trade.status === 'watchlist') penalty += 8;
    }

    return -penalty;
  }, [scanTransportHealth.consecutiveFailures]);

  const handleFixSlippageCap = useCallback(() => {
    setSettings((prev) => ({ ...prev, maxSlippage: Math.min(prev.maxSlippage, effectiveLiveSlippageCap) }));
    toast({
      title: 'Slippage Updated',
      description: `Max slippage set to ${effectiveLiveSlippageCap.toFixed(2)}% live cap.`,
    });
  }, [effectiveLiveSlippageCap, toast]);

  const handleAutoTuneSettings = useCallback(() => {
    if (!latestScanDiagnostics) {
      toast({
        title: 'No Scan Diagnostics Yet',
        description: 'Run a single scan first so the tuner can read the current market regime.',
        variant: 'destructive',
      });
      return;
    }

    const sameDexDominant = latestScanDiagnostics.topDrop === 'sameDex'
      || latestScanDiagnostics.droppedBySameDex >= Math.max(3, latestScanDiagnostics.droppedByNetProfit, latestScanDiagnostics.droppedBySlippage, latestScanDiagnostics.droppedBySpread);
    const slippageDominant = latestScanDiagnostics.topDrop === 'slippage'
      || latestScanDiagnostics.droppedBySlippage >= Math.max(3, latestScanDiagnostics.droppedByNetProfit, latestScanDiagnostics.droppedBySameDex, latestScanDiagnostics.droppedBySpread);
    const netDominant = latestScanDiagnostics.topDrop === 'netProfit'
      || latestScanDiagnostics.droppedByNetProfit >= Math.max(3, latestScanDiagnostics.droppedBySlippage, latestScanDiagnostics.droppedBySameDex, latestScanDiagnostics.droppedBySpread);

    const targetLoan = sameDexDominant || slippageDominant || netDominant
      ? 400
      : 600;
    const targetSlippage = sameDexDominant
      ? 1.20
      : slippageDominant
        ? 1.20
        : 1.50;
    const targetLiquidity = sameDexDominant
      ? 10
      : 15;
    const targetMinProfit = netDominant
      ? Math.max(MIN_PROFIT_FLOOR_USD, 15)
      : Math.max(MIN_PROFIT_FLOOR_USD, 25);
    const targetMaxGas = 25;

    const nextSlippage = Math.min(targetSlippage, effectiveLiveSlippageCap);
    const alreadyApplied = scannerProfile === 'live'
      && settings.loanAmount === targetLoan
      && settings.minProfit === targetMinProfit
      && Math.abs(settings.maxSlippage - nextSlippage) < 0.001
      && settings.maxLiquidityUsagePercent === targetLiquidity
      && settings.maxGas === targetMaxGas;

    if (alreadyApplied) {
      addLog('🤖 Auto tuner already optimal for current diagnostics; no changes applied.', 'info');
      toast({
        title: 'Auto Tuner Already Applied',
        description: 'Current settings already match tuner recommendations.',
      });
      return;
    }

    setScannerProfile('live');
    setSettings((prev) => ({
      ...prev,
      loanAmount: targetLoan,
      minProfit: targetMinProfit,
      maxSlippage: nextSlippage,
      estimatedGasUsd: prev.estimatedGasUsd,
      maxLiquidityUsagePercent: targetLiquidity,
      maxGas: targetMaxGas,
    }));
    updateStrategySettings({ loanSize: targetLoan });

    const reason = sameDexDominant
      ? 'sameDex is dominant'
      : slippageDominant
        ? 'slippage is dominant'
        : netDominant
          ? 'net profit is dominant'
          : 'market is mixed';

    addLog(
      `🤖 Auto tuner applied (${reason}): loan=$${targetLoan}, slippage=${nextSlippage.toFixed(2)}%, liqUse=${targetLiquidity}%, minProfit=$${targetMinProfit}, maxGas=$${targetMaxGas}`,
      'warn',
    );
    toast({
      title: 'Auto Tuner Applied',
      description: `Loan $${targetLoan}, slippage ${nextSlippage.toFixed(2)}%, liquidity ${targetLiquidity}%`,
    });
  }, [addLog, effectiveLiveSlippageCap, latestScanDiagnostics, scannerProfile, settings.loanAmount, settings.maxGas, settings.maxLiquidityUsagePercent, settings.maxSlippage, settings.minProfit, toast, updateStrategySettings]);

  const handleFixContractAddress = useCallback(() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(defaultContractAddress || '')) {
      toast({
        title: 'No Valid Default Contract',
        description: 'Set a valid deployed mainnet arbitrage contract address in Quick Settings.',
        variant: 'destructive',
      });
      return;
    }
    setSettings((prev) => ({ ...prev, contractAddress: defaultContractAddress }));
    toast({
      title: 'Contract Address Filled',
      description: `Loaded detected contract: ${defaultContractAddress.slice(0, 10)}...`,
    });
  }, [defaultContractAddress, toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SCANNER_PROFILE_STORAGE_KEY, scannerProfile);
  }, [scannerProfile]);

  useEffect(() => {
    if (previousLoanRef.current === null) {
      previousLoanRef.current = settings.loanAmount;
      return;
    }

    if (previousLoanRef.current === settings.loanAmount) return;

    if (loanChangeDebounceRef.current) {
      clearTimeout(loanChangeDebounceRef.current);
    }

    // Debounce slider/input churn so we only clear/log once per adjustment burst.
    loanChangeDebounceRef.current = setTimeout(() => {
      setPendingTrades([]);
      addLog(`⚙️ Loan size updated to $${settings.loanAmount.toLocaleString()}. Pending opportunities cleared; run a fresh scan.`, 'info');
      previousLoanRef.current = settings.loanAmount;
      loanChangeDebounceRef.current = null;
    }, 500);

    return () => {
      if (loanChangeDebounceRef.current) {
        clearTimeout(loanChangeDebounceRef.current);
      }
    };
  }, [settings.loanAmount, addLog]);

  useEffect(() => () => {
    if (loanChangeDebounceRef.current) {
      clearTimeout(loanChangeDebounceRef.current);
    }
  }, []);

  useEffect(() => {
    if (tradingState.executionMode === 'live') return;
    const previousThreshold = Math.max(0, Number(settings.autoExecuteThreshold) || 0) + liveAutoAdaptiveThresholdOffset;
    const nextThreshold = Math.max(0, Number(settings.autoExecuteThreshold) || 0);
    if (Math.abs(liveAutoAdaptiveThresholdOffset) > 0.001) {
      appendAdaptiveTelemetryEvent({
        time: new Date().toISOString(),
        direction: 'reset',
        previousThreshold,
        nextThreshold,
        qualityBlocked: 0,
        considered: 0,
        transportFailures: scanTransportHealth.consecutiveFailures,
        reason: 'left live mode',
      });
    }
    setLiveAutoAdaptiveThresholdOffset(0);
    liveAutoAdaptiveTightenStreakRef.current = 0;
    liveAutoAdaptiveRelaxStreakRef.current = 0;
  }, [appendAdaptiveTelemetryEvent, liveAutoAdaptiveThresholdOffset, scanTransportHealth.consecutiveFailures, settings.autoExecuteThreshold, tradingState.executionMode]);

  useEffect(() => {
    void refreshCircuitBreakerState();
    if (tradingState.executionMode !== 'live') return;

    const intervalId = window.setInterval(() => {
      void refreshCircuitBreakerState();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [tradingState.executionMode, refreshCircuitBreakerState]);

  useEffect(() => {
    void refreshPairPerformance();
    const intervalId = window.setInterval(() => {
      void refreshPairPerformance();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshPairPerformance]);

  useEffect(() => {
    void refreshRecentExecutionLogs();
    const intervalId = window.setInterval(() => {
      void refreshRecentExecutionLogs();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshRecentExecutionLogs]);

  useEffect(() => {
    void refreshRouteMemory();
    const intervalId = window.setInterval(() => {
      void refreshRouteMemory();
    }, 45_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshRouteMemory]);

  useEffect(() => {
    void refreshDailyExecutionSummary();
    const intervalId = window.setInterval(() => {
      void refreshDailyExecutionSummary();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshDailyExecutionSummary]);

  // Auto-scan logic
  const scanForOpportunities = useCallback(async () => {
    if (scanInFlightRef.current) {
      return;
    }
    scanInFlightRef.current = true;

    if (tradingState.executionMode === 'live' && !account) {
      toast({
        title: 'Wallet Required',
        description: 'Connect your wallet before scanning in live mode.',
        variant: 'destructive'
      });
      scanInFlightRef.current = false;
      return;
    }

    if (tradingState.executionMode === 'live' && Date.now() < sameDexPauseUntilRef.current) {
      const now = Date.now();
      if (!leanMode && now - sameDexPauseLastLogRef.current > 30_000) {
        const remainingSec = Math.max(1, Math.ceil((sameDexPauseUntilRef.current - now) / 1000));
        addLog(`⏸️ sameDex regime gate active: pausing live scans for ${remainingSec}s to avoid overlap-starved cycles.`, 'info');
        sameDexPauseLastLogRef.current = now;
      }
      scanInFlightRef.current = false;
      return;
    }

    setTradingState(prev => ({ ...prev, status: 'scanning', lastScan: new Date() }));
    let scanWatchdogTimer: number | null = window.setTimeout(() => {
      if (!scanInFlightRef.current) return;
      scanInFlightRef.current = false;
      setTradingState((prev) => ({ ...prev, status: continuousScanActive ? 'scanning' : 'idle' }));
      registerTransportFailure('watchdog-timeout', `scan exceeded ${SCAN_HARD_TIMEOUT_MS}ms`);
    }, SCAN_HARD_TIMEOUT_MS);

    const activeScannerProfile: ScannerProfileMode = tradingState.executionMode === 'live' ? 'live' : scannerProfile;
    if (activeScannerProfile !== scannerProfile) {
      addLog('⚠️ Live execution mode detected; enforcing Live scanner profile for this scan.', 'warn');
    }
    const effectiveMinProfitUsd = Math.max(MIN_PROFIT_FLOOR_USD, settings.minProfit);
    const effectiveLoanAmount = activeScannerProfile === 'discovery'
      ? Math.min(settings.loanAmount, DISCOVERY_SCAN_MAX_LOAN_USD)
      : settings.loanAmount;
    addLog(
      `🔍 Starting scan [${activeScannerProfile.toUpperCase()}]: loan=$${effectiveLoanAmount.toLocaleString()} minProfit=$${effectiveMinProfitUsd} slip=${settings.maxSlippage.toFixed(1)}% gasEst=$${settings.estimatedGasUsd}(fallback) liqUse=${settings.maxLiquidityUsagePercent.toFixed(0)}%...`,
      'info',
    );
    if (activeScannerProfile === 'discovery' && effectiveLoanAmount !== settings.loanAmount) {
      addLog(
        `🛡️ Discovery scan loan capped to $${effectiveLoanAmount.toLocaleString()} from slider $${settings.loanAmount.toLocaleString()} for stability.`,
        'info',
      );
    }

    try {
      let opportunities: OpportunityLike[] = [];
      let serverScanSucceeded = false;
      let noResultSummary: {
        droppedBySlippage: number;
        droppedByExecutionRisk: number;
        droppedBySameDex: number;
        droppedByNetProfit: number;
        droppedBySpread: number;
        droppedByLiquidity: number;
        pairKeys: number;
        candidates: number;
      } | null = null;

      // 1) Try server-side scan (Edge Function)
      const supabaseConfigured = isSupabaseConfigured();
      const transportBackoffRemainingMs = Math.max(0, transportBackoffUntilRef.current - Date.now());
      if (!supabaseConfigured) {
        addLog('⚠️ Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Skipping server scan.', 'warn');
      }
      if (supabaseConfigured && transportBackoffRemainingMs > 0) {
        addLog(
          `🌐 Server transport backoff active (${Math.ceil(transportBackoffRemainingMs / 1000)}s remaining). Skipping edge call and using local fallback this cycle.`,
          'warn',
        );
      }

      if (supabaseConfigured && transportBackoffRemainingMs <= 0) {
        try {
        const scanNetworks = tradingState.executionMode === 'live'
          ? (['ethereum'] as const)
          : (['ethereum', 'arbitrum', 'base', 'polygon'] as const);
        const perNetworkMinNetProfitUsd = {
          ethereum: effectiveMinProfitUsd,
          arbitrum: effectiveMinProfitUsd,
          base: effectiveMinProfitUsd,
          polygon: effectiveMinProfitUsd,
        };

        addLog('🌐 Invoking server scan (Edge Function)...', 'info');
        if (tradingState.executionMode === 'live') {
          addLog('🛰️ Live mode scan narrowed to Ethereum to reduce noise and latency.', 'info');
        }
        const payload = {
          networks: scanNetworks,
          loanAmountUsd: effectiveLoanAmount,
          minNetProfitUsd: effectiveMinProfitUsd,
          perNetworkMinNetProfitUsd,
          enableDexScreener: true,
          enableGecko: activeScannerProfile !== 'live',
          minLiquidityUsd: activeScannerProfile === 'live' ? 60000 : 20000,
          minSpreadPercent: activeScannerProfile === 'live' ? 0.02 : 0.01,
          maxResults: 25,
          maxSlippageBps: Math.max(1, Math.round(settings.maxSlippage * 100)),
          maxLiquidityUsagePercent: settings.maxLiquidityUsagePercent,
          estimatedGasUsd: settings.estimatedGasUsd,
        };

        let data: unknown = null;
        let error: unknown = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const response = await withTransientRetry(async () => {
            const invokePromise = supabase.functions.invoke('scan-arbitrage-opportunities', { body: payload });
            let timeoutId: number | null = null;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = window.setTimeout(() => {
                reject(new Error(`scan-arbitrage-opportunities timeout after ${EDGE_SCAN_INVOKE_TIMEOUT_MS}ms`));
              }, EDGE_SCAN_INVOKE_TIMEOUT_MS);
            });
            try {
              return await Promise.race([invokePromise, timeoutPromise]);
            } finally {
              if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
              }
            }
          }, 1);
          data = response.data;
          error = response.error;

          if (!error) break;

          const message = error instanceof Error ? error.message : String(error);
          const isTransientNetworkError = /failed to fetch|fetch failed|network|connection closed|err_connection_closed/i.test(message);
          if (!isTransientNetworkError || attempt === 3) {
            throw error;
          }

          addLog(`🌐 Temporary scanner transport issue (attempt ${attempt}/3). Retrying quietly...`, 'warn');
          await new Promise((resolve) => setTimeout(resolve, attempt * 600));
        }

        if (error) throw error;
        const parsedServerPayload = parseServerScanPayload(data);
        if (parsedServerPayload) {
          clearTransportFailures('edge scan response parsed');
          const scanData = data as Record<string, unknown>;
          serverScanSucceeded = true;
          opportunities = parsedServerPayload.opportunities;
          const watchlist = parsedServerPayload.watchlist;

          if (opportunities.length > 0) {
            addLog(`✅ Server scan found ${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'}`, 'success');
          } else {
            const watchlistCount = watchlist.length > 0
              ? watchlist.length
              : Number(parsedServerPayload.watchlistCount ?? 0);
            addLog(
              `ℹ️ Server scan completed: 0 active spreads${watchlistCount > 0 ? `, ${watchlistCount} near-miss watchlist item${watchlistCount === 1 ? '' : 's'}` : ''}.`,
              'info',
            );

            if (tradingState.executionMode === 'demo' && watchlist.length > 0) {
              // Demo-only: promote plausible near-miss items to keep strategy testing visible in tight markets.
              const now = Date.now();
              let suppressedByCooldownAtPromotion = 0;
              let skippedCycleShadowAtPromotion = 0;
              const promotable = watchlist.filter((item) => {
                if (isCycleShadowOpportunity(item)) {
                  skippedCycleShadowAtPromotion += 1;
                  return false;
                }
                const cooldownKey = buildRouteKey(item);
                const cooldownUntil = demoLossCooldownRef.current[cooldownKey] ?? 0;
                if (cooldownUntil > now) {
                  suppressedByCooldownAtPromotion += 1;
                  return false;
                }
                const distanceToExecutableUsd = Number(item.distanceToExecutableUsd ?? Infinity);
                const netProfit = Number(item.netProfit ?? item.expectedProfit ?? item.estimated_profit ?? Number.NEGATIVE_INFINITY);
                return netProfit >= DEMO_PROMOTION_MIN_NET_PROFIT_USD
                  && distanceToExecutableUsd <= DEMO_PROMOTION_MAX_DISTANCE_TO_EXECUTABLE_USD;
              }).slice(0, 5);
              if (suppressedByCooldownAtPromotion > 0) {
                addLog(
                  `🧯 Cooldown gate: skipped ${suppressedByCooldownAtPromotion} watchlist near-miss opportunit${suppressedByCooldownAtPromotion === 1 ? 'y' : 'ies'} before demo promotion.`,
                  'info',
                );
              }
              if (skippedCycleShadowAtPromotion > 0) {
                addLog(
                  `🧭 Cycle-shadow diagnostics: retained ${skippedCycleShadowAtPromotion} cycle path${skippedCycleShadowAtPromotion === 1 ? '' : 's'} as watchlist-only (not demo-promoted).`,
                  'info',
                );
              }
              if (promotable.length > 0) {
                opportunities = promotable;
                addLog(
                  `🧪 Demo mode: promoted ${promotable.length} near-miss opportunit${promotable.length === 1 ? 'y' : 'ies'} for strategy testing.`,
                  'warn',
                );
              }
            }

            if (watchlist.length > 0) {
              const topWatch = watchlist[0];
              const watchNet = Number(topWatch.netProfit ?? 0);
              const watchDistance = Number(topWatch.distanceToExecutableUsd ?? 0);
              const watchLoan = Number(topWatch.executableLoanAmount ?? settings.loanAmount);
              const watchGas = Number(topWatch.gasCost ?? 0);
              const isCycleTop = isCycleShadowOpportunity(topWatch);
              const topThree = watchlist.slice(0, 3).map((item) => {
                const net = Number(item.netProfit ?? item.expectedProfit ?? 0);
                const gap = Math.max(0, Number(item.distanceToExecutableUsd ?? 0));
                const pair = item.tokenPair || 'Unknown';
                const cyclePrefix = isCycleShadowOpportunity(item) ? '[CYCLE] ' : '';
                return `${cyclePrefix}${pair} (Net $${net.toFixed(2)}, Need +$${gap.toFixed(2)})`;
              }).join(' | ');
              const gateBlocked = tradingState.executionMode === 'demo' && (
                watchNet < DEMO_PROMOTION_MIN_NET_PROFIT_USD ||
                watchDistance > DEMO_PROMOTION_MAX_DISTANCE_TO_EXECUTABLE_USD
              );
              const gasNote = watchGas > 0 ? ` | ActualGas $${watchGas.toFixed(2)}` : '';
              const quoteAttribution = buildQuoteAttributionSummary(topWatch as OpportunityLike);
              const quoteNote = quoteAttribution ? ` | Quotes ${quoteAttribution}` : '';
              const quoteSources = Array.isArray((topWatch as OpportunityLike).quoteSources)
                ? ((topWatch as OpportunityLike).quoteSources || []).map((source) => String(source))
                : [];
              const uniqueQuoteSources = Array.from(new Set(quoteSources));
              const fallbackOnlySameSource = uniqueQuoteSources.length === 1 && uniqueQuoteSources[0] !== 'subgraph';
              const sourceRiskNote = fallbackOnlySameSource ? ' | ⚠️ low-trust fallback-only same-source quotes' : '';

              addLog(
                `${isCycleTop ? '🧭 Top cycle-shadow' : '👀 Top near-miss'}: ${topWatch.tokenPair || 'Unknown'} | Net $${watchNet.toFixed(2)} | Need +$${Math.max(0, watchDistance).toFixed(2)} | ExecLoan $${Math.round(watchLoan).toLocaleString()}${gasNote}${quoteNote}${sourceRiskNote}${gateBlocked ? ` | demo gate blocked (needs net >= $${DEMO_PROMOTION_MIN_NET_PROFIT_USD.toFixed(2)} and distance <= $${DEMO_PROMOTION_MAX_DISTANCE_TO_EXECUTABLE_USD.toFixed(2)})` : ''}${topThree ? ` | Top 3: ${topThree}` : ''}`,
                'info',
              );

              const sizeLadderSummary = buildSizeLadderSummary(topWatch as OpportunityLike);
              if (sizeLadderSummary) {
                addLog(`📏 Size ladder (est): ${sizeLadderSummary}`, 'info');
              }
            }

            const diagnostics = parsedServerPayload.diagnostics;
            if (diagnostics) {
              const samples = Array.isArray(diagnostics.rejectionSamples)
                ? diagnostics.rejectionSamples as Array<Record<string, unknown>>
                : [];
              const reasonPriority: Record<string, number> = {
                netProfit: 1,
                slippage: 2,
                executionRisk: 3,
                liquidity: 4,
                spread: 5,
                sameDex: 6,
                badQuotes: 7,
              };
              const topSample = [...samples].sort((a, b) => {
                const aReason = typeof a.reason === 'string' ? a.reason : 'badQuotes';
                const bReason = typeof b.reason === 'string' ? b.reason : 'badQuotes';
                return (reasonPriority[aReason] ?? 99) - (reasonPriority[bReason] ?? 99);
              })[0];
              const topReason = typeof topSample?.reason === 'string' ? topSample.reason : 'none';
              const topPair = typeof topSample?.tokenPair === 'string' && topSample.tokenPair.length > 0
                ? topSample.tokenPair
                : 'n/a';

              const droppedByNet = Number(diagnostics.droppedByNetProfit ?? 0);
              const droppedBySlip = Number(diagnostics.droppedBySlippage ?? 0);
              const droppedByRisk = Number(diagnostics.droppedByExecutionRisk ?? 0);
              const droppedBySameDex = Number(diagnostics.droppedBySameDex ?? 0);
              const droppedBySpread = Number(diagnostics.droppedBySpread ?? 0);
              const droppedByLiquidity = Number(diagnostics.droppedByLiquidity ?? 0);
              noResultSummary = {
                droppedBySlippage: droppedBySlip,
                droppedByExecutionRisk: droppedByRisk,
                droppedBySameDex,
                droppedByNetProfit: droppedByNet,
                droppedBySpread,
                droppedByLiquidity,
                pairKeys: Number(diagnostics.pairKeys ?? 0),
                candidates: Number(diagnostics.candidates ?? 0),
              };
              const routeMemory = diagnostics.routeMemory && typeof diagnostics.routeMemory === 'object'
                ? diagnostics.routeMemory as Record<string, unknown>
                : null;
              const sameDexDetails = diagnostics.sameDexDetails && typeof diagnostics.sameDexDetails === 'object'
                ? diagnostics.sameDexDetails as Record<string, unknown>
                : null;
              const sameDexSourceComposition = sameDexDetails?.sourceComposition && typeof sameDexDetails.sourceComposition === 'object'
                ? sameDexDetails.sourceComposition as Record<string, unknown>
                : null;
              const cycleShadow = diagnostics.cycleShadow && typeof diagnostics.cycleShadow === 'object'
                ? diagnostics.cycleShadow as Record<string, unknown>
                : null;
              const routeMemoryLoaded = Number(routeMemory?.loadedRoutes ?? 0);
              const routeCooldownSuppressed = Number(routeMemory?.suppressedByCooldown ?? 0);
              const routeHistoryPenalized = Number(routeMemory?.penalizedByHistory ?? 0);
              const routeMaxPenaltyUsd = Number(routeMemory?.maxPenaltyUsd ?? 0);
              const suppressedSamples = Array.isArray(routeMemory?.suppressedSamples)
                ? routeMemory?.suppressedSamples as Array<Record<string, unknown>>
                : [];
              const penalizedSamples = Array.isArray(routeMemory?.penalizedSamples)
                ? routeMemory?.penalizedSamples as Array<Record<string, unknown>>
                : [];
              const cycleSamples = Array.isArray(cycleShadow?.topCycles)
                ? cycleShadow?.topCycles as Array<Record<string, unknown>>
                : [];

              const cycleNetworksAnalyzed = Number(cycleShadow?.networksAnalyzed ?? 0);
              const cycleTestedTriangles = Number(cycleShadow?.testedTriangles ?? 0);
              const cycleCandidatePaths = Number(cycleShadow?.candidatePaths ?? 0);
              const cycleTop = cycleSamples[0];
              const cycleTopPath = typeof cycleTop?.path === 'string' ? cycleTop.path : 'n/a';
              const cycleTopGrossBps = Number(cycleTop?.grossReturnBps ?? 0);
              const sameDexSubgraphOnly = Number(sameDexSourceComposition?.subgraphOnly ?? 0);
              const sameDexFallbackOnly = Number(sameDexSourceComposition?.fallbackOnly ?? 0);
              const sameDexMixedSources = Number(sameDexSourceComposition?.mixed ?? 0);

              setLatestRouteMemoryDiagnostics({
                loadedRoutes: routeMemoryLoaded,
                suppressedByCooldown: routeCooldownSuppressed,
                penalizedByHistory: routeHistoryPenalized,
                maxPenaltyUsd: routeMaxPenaltyUsd,
                suppressedSamples: suppressedSamples.map((sample) => ({
                  routeKey: String(sample.routeKey || 'unknown'),
                  tokenPair: String(sample.tokenPair || 'unknown'),
                  buyDex: String(sample.buyDex || 'unknown'),
                  sellDex: String(sample.sellDex || 'unknown'),
                  cooldownUntil: typeof sample.cooldownUntil === 'string' ? sample.cooldownUntil : undefined,
                })),
                penalizedSamples: penalizedSamples.map((sample) => ({
                  routeKey: String(sample.routeKey || 'unknown'),
                  tokenPair: String(sample.tokenPair || 'unknown'),
                  buyDex: String(sample.buyDex || 'unknown'),
                  sellDex: String(sample.sellDex || 'unknown'),
                  avgRealizedNet: Number(sample.avgRealizedNet ?? 0),
                  penaltyUsd: Number(sample.penaltyUsd ?? 0),
                })),
              });

              const dominantDropReason = [
                { reason: 'netProfit', count: droppedByNet },
                { reason: 'slippage', count: droppedBySlip },
                { reason: 'executionRisk', count: droppedByRisk },
                { reason: 'sameDex', count: droppedBySameDex },
                { reason: 'spread', count: droppedBySpread },
              ].sort((a, b) => b.count - a.count)[0] ?? { reason: 'none', count: 0 };

              // Always-visible market condition summary when no watchlist candidates exist
              if (watchlist.length === 0 && dominantDropReason.reason !== 'none') {
                const dominantLabel: Record<string, string> = {
                  sameDex: 'same-DEX routes dominate (no cross-DEX spread)',
                  slippage: 'slippage exceeds spread at current loan size',
                  netProfit: 'spread too thin to cover gas costs',
                  executionRisk: 'execution risk too high',
                  spread: 'spread below minimum threshold',
                };
                const gasHint = activeScannerProfile === 'live' ? ' | ETH gas ≈$26/tx, Arb ≈$0.30/tx' : '';
                const sameDexSourceHint = dominantDropReason.reason === 'sameDex'
                  ? ` | sameDex sources: subgraph=${sameDexSubgraphOnly} fallback=${sameDexFallbackOnly} mixed=${sameDexMixedSources}`
                  : '';
                addLog(
                  `📉 Market condition: dominant blocker = ${dominantDropReason.reason} (×${dominantDropReason.count}) — ${dominantLabel[dominantDropReason.reason] ?? dominantDropReason.reason} | pairs=${Number(diagnostics.pairKeys ?? 0)} cand=${Number(diagnostics.candidates ?? 0)}${gasHint}${sameDexSourceHint}`,
                  'warn',
                );
              }

              if (spectrumDebugEnabled) {
                addLog(
                  `📊 Diagnostics: keys=${Number(diagnostics.pairKeys ?? 0)} cand=${Number(diagnostics.candidates ?? 0)} feas=${Number(diagnostics.executionFeasible ?? 0)} pass=${Number(diagnostics.profitQualified ?? diagnostics.quoteValidated ?? 0)} slipDrop=${droppedBySlip} netDrop=${droppedByNet} riskDrop=${droppedByRisk} sameDexDrop=${droppedBySameDex} spreadDrop=${droppedBySpread} routeMemLoaded=${routeMemoryLoaded} routeCooldown=${routeCooldownSuppressed} routeHistPenalty=${routeHistoryPenalized} routeMaxPenalty=$${routeMaxPenaltyUsd.toFixed(2)} cycleTri=${cycleTestedTriangles} cycleCand=${cycleCandidatePaths} cycleTop=${cycleTopPath}@${cycleTopGrossBps.toFixed(2)}bps topReject=${topReason} topDrop=${dominantDropReason.reason} pair=${topPair}`,
                  'info',
                );
              }

              if (cycleShadow) {
                setLatestCycleShadowDiagnostics({
                  enabled: Boolean(cycleShadow.enabled),
                  networksAnalyzed: cycleNetworksAnalyzed,
                  testedTriangles: cycleTestedTriangles,
                  candidatePaths: cycleCandidatePaths,
                  topCycles: cycleSamples.slice(0, 6).map((sample) => ({
                    network: String(sample.network || 'unknown'),
                    path: String(sample.path || 'unknown'),
                    grossReturnBps: Number(sample.grossReturnBps ?? 0),
                    minLiquidityUsd: Number(sample.minLiquidityUsd ?? 0),
                    sources: Array.isArray(sample.sources)
                      ? (sample.sources as unknown[]).map((source) => String(source))
                      : [],
                  })),
                });
              }

              if (dominantDropReason.reason === 'sameDex' || droppedBySameDex >= Math.max(3, droppedByNet, droppedBySlip, droppedBySpread)) {
                sameDexDominantStreakRef.current += 1;
                if (spectrumDebugEnabled) {
                  addLog(
                    '🧭 Tight market guidance: limited cross-DEX overlap this cycle (sameDex) is dominant. Keep scanning; overlap is market-dependent and can change quickly.',
                    'info',
                  );
                }

                if (
                  ENABLE_LIVE_SAME_DEX_REGIME_PAUSE
                  &&
                  activeScannerProfile === 'live'
                  && sameDexDominantStreakRef.current >= SAME_DEX_REGIME_STREAK_TRIGGER
                  && Date.now() >= sameDexPauseUntilRef.current
                ) {
                  sameDexPauseUntilRef.current = Date.now() + SAME_DEX_REGIME_PAUSE_MS;
                  sameDexDominantStreakRef.current = 0;
                  addLog(
                    `⏸️ Regime gate engaged: sameDex dominated ${SAME_DEX_REGIME_STREAK_TRIGGER} consecutive live cycles. Pausing scans for ${Math.round(SAME_DEX_REGIME_PAUSE_MS / 60000)} minutes.`,
                    'warn',
                  );
                }
              } else if (dominantDropReason.reason === 'netProfit' || topReason === 'netProfit' || droppedByNet >= Math.max(3, droppedBySlip, droppedBySameDex, droppedBySpread)) {
                sameDexDominantStreakRef.current = 0;
                if (spectrumDebugEnabled) {
                  addLog(
                    '🧭 Tight market guidance: net profit is the main blocker. For demo, reduce loan size to find cleaner non-negative candidates; lowering min profit will not queue net-negative routes. For live safety, keep strict thresholds and wait for wider spreads.',
                    'info',
                  );
                }
              } else if (dominantDropReason.reason === 'slippage' || topReason === 'slippage' || droppedBySlip >= Math.max(3, droppedByNet, droppedBySameDex, droppedBySpread)) {
                sameDexDominantStreakRef.current = 0;
                if (spectrumDebugEnabled) {
                  addLog(
                    '🧭 Tight market guidance: slippage is dominant. Reduce loan size or lower max liquidity usage to improve execution feasibility.',
                    'info',
                  );
                }
              } else if (dominantDropReason.reason === 'spread' || topReason === 'spread' || droppedBySpread >= Math.max(3, droppedByNet, droppedBySlip, droppedBySameDex)) {
                sameDexDominantStreakRef.current = 0;
                if (spectrumDebugEnabled) {
                  addLog(
                    '🧭 Tight market guidance: spread quality is thin this cycle. Keep scanning and consider a smaller loan for demo to broaden executable pair coverage.',
                    'info',
                  );
                }
              } else {
                sameDexDominantStreakRef.current = 0;
              }

              setLatestScanDiagnostics({
                pairKeys: Number(diagnostics.pairKeys ?? 0),
                candidates: Number(diagnostics.candidates ?? 0),
                executionFeasible: Number(diagnostics.executionFeasible ?? 0),
                profitQualified: Number(diagnostics.profitQualified ?? diagnostics.quoteValidated ?? 0),
                droppedBySlippage: droppedBySlip,
                droppedByNetProfit: droppedByNet,
                droppedByExecutionRisk: droppedByRisk,
                droppedBySameDex,
                sameDexSubgraphOnly,
                sameDexFallbackOnly,
                sameDexMixedSources,
                droppedBySpread,
                routeMemoryLoaded,
                routeCooldownSuppressed,
                routeHistoryPenalized,
                routeMaxPenaltyUsd,
                topReject: topReason,
                topDrop: dominantDropReason.reason,
                topPair,
                consecutiveTransportFailures: transportFailureStreakRef.current,
                transportBackoffRemainingMs: Math.max(0, transportBackoffUntilRef.current - Date.now()),
                lastTransportFailureSource: transportLastFailureSourceRef.current,
                lastTransportFailureReason: transportLastFailureReasonRef.current,
              });
            }
          }
        } else {
          const payloadShape = data && typeof data === 'object'
            ? Object.keys(data as Record<string, unknown>).slice(0, 8).join(', ')
            : typeof data;
          const serverError = extractServerErrorMessage(data);
          const safeFetchFallbackLike =
            data &&
            typeof data === 'object' &&
            !Array.isArray(data) &&
            (data as Record<string, unknown>).data == null &&
            (data as Record<string, unknown>).error == null;

          if (safeFetchFallbackLike) {
            registerTransportFailure('edge-empty-payload', 'empty fallback payload from edge invoke');
            addLog('ℹ️ Server scan transport returned an empty fallback payload. This usually means a timeout or temporary network issue to Supabase.', 'info');
          } else if (serverError) {
            registerTransportFailure('edge-error-payload', serverError);
            addLog(`ℹ️ Server scan responded with error payload: ${serverError}. Falling back to local scan.`, 'info');
          } else {
            registerTransportFailure('edge-unsupported-payload', `unsupported payload shape: ${payloadShape || 'unknown'}`);
            addLog(`ℹ️ Server scan returned an unsupported payload shape (${payloadShape || 'unknown'}); falling back to local scan.`, 'info');
          }
        }
        } catch (edgeErr: unknown) {
          const message = edgeErr instanceof Error ? edgeErr.message : String(edgeErr);
          const lower = message.toLowerCase();
          const source = lower.includes('timeout')
            ? 'edge-timeout'
            : /failed to fetch|fetch failed|network|connection closed|err_connection_closed/i.test(message)
              ? 'edge-network'
              : 'edge-exception';
          registerTransportFailure(source, message);
          if (!/err_connection_closed/i.test(message)) {
            addLog(`ℹ️ Server scan error: ${message}`, 'info');
          }
        }
      }

      // 2) Fallback: local DexService scan (The Graph + RPC)
      if (opportunities.length === 0 && !serverScanSucceeded) {
        if (services?.dex) {
          try {
            addLog('📡 Querying The Graph locally for pool data...', 'info');
            let localTimeoutId: number | null = null;
            const localTimeoutPromise = new Promise<never>((_, reject) => {
              localTimeoutId = window.setTimeout(() => {
                reject(new Error(`Local scan timeout after ${LOCAL_SCAN_TIMEOUT_MS}ms`));
              }, LOCAL_SCAN_TIMEOUT_MS);
            });
            const localScanPromise = services.dex.scanOpportunities(['ethereum']);
            let localOpps: Awaited<ReturnType<typeof services.dex.scanOpportunities>>;
            try {
              localOpps = await Promise.race([localScanPromise, localTimeoutPromise]);
            } finally {
              if (localTimeoutId !== null) {
                window.clearTimeout(localTimeoutId);
              }
            }
            addLog(`✅ Local scan returned ${localOpps.length} opportunit${localOpps.length === 1 ? 'y' : 'ies'}`, localOpps.length > 0 ? 'success' : 'info');
            opportunities = localOpps;
          } catch (localErr: unknown) {
            const message = localErr instanceof Error ? localErr.message : String(localErr);
            const source = /timeout/i.test(message) ? 'local-timeout' : 'local-exception';
            registerTransportFailure(source, message);
            addLog(`⚠️ Local scan error: ${message}`, 'error');
          }
        } else {
          const scannerReadinessHint = account
            ? 'scanner service is still initializing'
            : 'wallet is not connected';
          addLog(`⚠️ DexService not ready — ${scannerReadinessHint}.`, 'warn');
        }
      }

      // Process results
      if (opportunities.length > 0) {
        type ThrottledTrade = ReturnType<typeof normalizeOpportunityToTrade> & { loanAdjustmentReason?: string };
        const candidateTrades: PendingTrade[] = opportunities.map((opp) => {
          const trade = normalizeOpportunityToTrade(opp, settings.loanAmount) as ThrottledTrade;
          const liquidityThrottle = getLiquidityLoanThrottle(trade.loanAmount, getOpportunityLiquidityUsd(opp));
          const liquidityLoanAmount = liquidityThrottle?.adjustedLoanAmount ?? trade.loanAmount;
          const liquidityRatio = Math.max(0.1, Math.min(1, liquidityLoanAmount / Math.max(1, trade.loanAmount)));

          const tradeAfterLiquidityThrottle: ThrottledTrade = liquidityThrottle
            ? {
              ...trade,
              loanAmount: liquidityLoanAmount,
              expectedProfit: trade.expectedProfit * liquidityRatio,
              loanAdjustmentReason: liquidityThrottle.reason,
            }
            : trade;

          const pairThrottle = getPairHistoryThrottle(tradeAfterLiquidityThrottle);
          const pairLoanAmount = pairThrottle?.adjustedLoanAmount ?? tradeAfterLiquidityThrottle.loanAmount;
          const pairRatio = Math.max(0.1, Math.min(1, pairLoanAmount / Math.max(1, tradeAfterLiquidityThrottle.loanAmount)));

          const adjustedTrade: ThrottledTrade = pairThrottle
            ? {
              ...tradeAfterLiquidityThrottle,
              loanAmount: pairLoanAmount,
              expectedProfit: tradeAfterLiquidityThrottle.expectedProfit * pairRatio,
              loanAdjustmentReason: tradeAfterLiquidityThrottle.loanAdjustmentReason
                ? `${tradeAfterLiquidityThrottle.loanAdjustmentReason}; pair throttle (${pairThrottle.reason})`
                : `pair throttle (${pairThrottle.reason})`,
            }
            : tradeAfterLiquidityThrottle;

          const grossProfit = Number(opp.grossProfit ?? (adjustedTrade.expectedProfit + adjustedTrade.gasCost));
          const sourceStatus = opp.status === 'watchlist' ? 'watchlist' : 'active';
          const distanceToExecutableUsd = Number(opp.distanceToExecutableUsd ?? 0);

          return {
            ...adjustedTrade,
            status: sourceStatus,
            distanceToExecutableUsd: Number.isFinite(distanceToExecutableUsd) ? Math.max(0, distanceToExecutableUsd) : 0,
            grossProfit: Number.isFinite(grossProfit) ? grossProfit : adjustedTrade.expectedProfit + adjustedTrade.gasCost,
            timestamp: Date.now(),
          };
        });

        let suppressedByDemoCooldown = 0;
        const now = Date.now();
        const rejectedSamples: SpectrumRejectedSample[] = [];
        let rejectedNegativeNet = 0;
        let rejectedByMinProfit = 0;
        let rejectedByGas = 0;
        let rejectedByDemoWatchlistGate = 0;
        let rejectedByDemoCooldown = 0;

        const recordRejectedSample = (trade: PendingTrade, reason: string) => {
          if (rejectedSamples.length >= 8) return;
          rejectedSamples.push({
            tokenPair: trade.tokenPair || 'Unknown',
            network: trade.network || 'unknown',
            reason,
            expectedProfit: trade.expectedProfit,
            gasCost: trade.gasCost,
            loanAmount: trade.loanAmount,
            status: trade.status === 'watchlist' ? 'watchlist' : 'active',
          });
        };

        const newTrades: PendingTrade[] = candidateTrades.filter((trade) => {
          const isDemoPromotedNearMiss = tradingState.executionMode === 'demo' && trade.status === 'watchlist';
          if (isDemoPromotedNearMiss) {
            const cooldownKey = buildRouteKey(trade);
            const cooldownUntil = demoLossCooldownRef.current[cooldownKey] ?? 0;
            if (cooldownUntil > now) {
              suppressedByDemoCooldown += 1;
              rejectedByDemoCooldown += 1;
              recordRejectedSample(trade, 'demo-cooldown');
              return false;
            }
            if (trade.expectedProfit < DEMO_PROMOTION_MIN_NET_PROFIT_USD) {
              rejectedByDemoWatchlistGate += 1;
              recordRejectedSample(trade, 'demo-watchlist-net');
              return false;
            }
            if (trade.gasCost > settings.maxGas) {
              rejectedByGas += 1;
              recordRejectedSample(trade, 'gas-cap');
              return false;
            }
            return true;
          }

          if (trade.expectedProfit < 0) {
            rejectedNegativeNet += 1;
            recordRejectedSample(trade, 'negative-net');
            return false;
          }
          if (trade.expectedProfit < settings.minProfit) {
            rejectedByMinProfit += 1;
            recordRejectedSample(trade, 'min-profit');
            return false;
          }
          if (trade.gasCost > settings.maxGas) {
            rejectedByGas += 1;
            recordRejectedSample(trade, 'gas-cap');
            return false;
          }
          return true;
        });

        setLatestSpectrumSnapshot({
          totalCandidates: candidateTrades.length,
          queuedCandidates: newTrades.length,
          rejectedNegativeNet,
          rejectedByMinProfit,
          rejectedByGas,
          rejectedByDemoCooldown,
          rejectedByDemoWatchlistGate,
          rejectedSamples,
        });

        const orderedNewTrades = tradingState.executionMode === 'live'
          ? [...newTrades].sort((left, right) => (
            (getPairExecutionPriority(right) + getRouteMemoryPriorityAdjustment(right) + getScanQualityPriorityAdjustment(right))
            - (getPairExecutionPriority(left) + getRouteMemoryPriorityAdjustment(left) + getScanQualityPriorityAdjustment(left))
          ))
          : newTrades;

        if (tradingState.executionMode === 'live' && orderedNewTrades.length > 0) {
          const qualityPenalized = orderedNewTrades.filter((trade) => getScanQualityPriorityAdjustment(trade) < 0).length;
          if (qualityPenalized > 0) {
            addLog(
              `🧪 Quality gate deprioritized ${qualityPenalized} fragile live candidate${qualityPenalized === 1 ? '' : 's'} (transport/gas/confidence risk).`,
              'info',
            );
          }
        }

        if (orderedNewTrades.length > 0) {
          const activeTrades = orderedNewTrades.filter((trade) => trade.status !== 'watchlist');
          if (activeTrades.length > 0) {
            autoWebhookTrigger.triggerAgentSuggestion(
              'Arbitrage Scout', 
              'Hot Opportunities Found', 
              `Found ${activeTrades.length} executable spread${activeTrades.length === 1 ? '' : 's'}. Top: ${activeTrades[0].tokenPair} ($${activeTrades[0].expectedProfit.toFixed(2)})`
            );
          }
        }

        if (suppressedByDemoCooldown > 0) {
          addLog(
            `🧯 Cooldown active: skipped ${suppressedByDemoCooldown} repeated demo near-miss opportunit${suppressedByDemoCooldown === 1 ? 'y' : 'ies'} after a recent losing demo execution.`,
            'info',
          );
        }

        for (const trade of orderedNewTrades) {
          const promotedTag = trade.status === 'watchlist'
            ? (isCycleShadowOpportunity(trade) ? ' [CYCLE SHADOW]' : ' [DEMO NEAR-MISS]')
            : '';
          const routeTag = getRouteMemorySummary(trade);
          const adjustmentParts = [trade.loanAdjustmentReason, routeTag].filter(Boolean);
          const adjustmentTag = adjustmentParts.length > 0 ? ` | ${adjustmentParts.join(' | ')}` : '';
          addLog(`💰 Opportunity${promotedTag}: ${trade.tokenPair || 'Unknown'} | ${trade.buyDex} → ${trade.sellDex} | ExecLoan: $${Math.round(trade.loanAmount).toLocaleString()} | Net: $${trade.expectedProfit.toFixed(2)}${adjustmentTag}`, trade.status === 'watchlist' ? 'warn' : 'success');
        }

        if (candidateTrades.length > 0 && orderedNewTrades.length === 0) {
          const hasNegativeNetCandidates = candidateTrades.some((trade) => trade.expectedProfit < 0);
          addLog(
            hasNegativeNetCandidates
              ? 'ℹ️ Candidates were found, but all remaining paths are net-negative after costs and were excluded.'
              : 'ℹ️ Candidates were found but filtered out by current thresholds (min profit / max gas).',
            'info',
          );
        }

        setPendingTrades((prev) => {
          const combined = [...orderedNewTrades, ...prev];
          const seenRouteKeys = new Set<string>();

          return combined.filter((trade) => {
            const routeKey = buildRouteKey(trade);
            if (seenRouteKeys.has(routeKey)) {
              return false;
            }
            seenRouteKeys.add(routeKey);
            return true;
          }).slice(0, 20);
        });
        toast({
          title: orderedNewTrades.length > 0 ? '🎯 Opportunities Ready' : 'No Executable Candidates',
          description: orderedNewTrades.length > 0
            ? `Queued ${orderedNewTrades.length} trade${orderedNewTrades.length === 1 ? '' : 's'} for review/execution.`
            : 'Candidates found, but none passed your execution thresholds.',
        });

        if (tradingState.mode === 'auto') {
          const liveAutoTransportBlocked = tradingState.executionMode === 'live'
            && scanTransportHealth.consecutiveFailures >= LIVE_AUTO_EXECUTION_TRANSPORT_BLOCK_STREAK;
          let blockedByQualityGate = 0;
          let blockedByUnsupportedNetwork = 0;
          let blockedByThreshold = 0;
          let firstQualityGateReason: string | null = null;
          if (liveAutoTransportBlocked) {
            addLog(
              `🛑 Live auto execution paused: transport failure streak ${scanTransportHealth.consecutiveFailures} reached block threshold ${LIVE_AUTO_EXECUTION_TRANSPORT_BLOCK_STREAK}. Manual review remains available.`,
              'warn',
            );
          }

          const autoTrades = orderedNewTrades.filter((t) => {
            if (liveAutoTransportBlocked) {
              return false;
            }
            if (tradingState.executionMode === 'live') {
              const qualityBlocker = getLiveAutoQualityBlocker(t);
              if (qualityBlocker) {
                blockedByQualityGate += 1;
                if (!firstQualityGateReason) {
                  firstQualityGateReason = qualityBlocker;
                }
                return false;
              }
            }
            if (tradingState.executionMode === 'live' && !supportsLiveExecution(t.executionPayload?.network || t.network)) {
              blockedByUnsupportedNetwork += 1;
              return false;
            }
            const isDemoPromotedNearMiss = tradingState.executionMode === 'demo' && t.status === 'watchlist';
            if (isDemoPromotedNearMiss) {
              const withinDemoDistance = (t.distanceToExecutableUsd ?? Infinity) <= DEMO_AUTO_MAX_DISTANCE_TO_EXECUTABLE_USD;
              if (!withinDemoDistance) {
                blockedByThreshold += 1;
              }
              return withinDemoDistance;
            }
            const meetsThreshold = t.expectedProfit >= effectiveAutoExecuteThreshold;
            if (!meetsThreshold) {
              blockedByThreshold += 1;
            }
            return meetsThreshold;
          });

          if (tradingState.executionMode === 'live' && blockedByQualityGate > 0) {
            const suffix = firstQualityGateReason ? ` Example: ${firstQualityGateReason}` : '';
            addLog(
              `🧱 Live auto quality gate withheld ${blockedByQualityGate} route${blockedByQualityGate === 1 ? '' : 's'} under transport instability.${suffix}`,
              'warn',
            );
          }

          setLatestAutoSuppressionDiagnostics({
            considered: orderedNewTrades.length,
            eligible: autoTrades.length,
            blockedByTransportGate: liveAutoTransportBlocked ? orderedNewTrades.length : 0,
            blockedByQualityGate,
            blockedByUnsupportedNetwork,
            blockedByThreshold,
          });

          if (tradingState.executionMode === 'live' && !liveAutoTransportBlocked && orderedNewTrades.length > 0) {
            const baseThreshold = Math.max(0, Number(settings.autoExecuteThreshold) || 0);
            const currentEffectiveThreshold = Math.max(
              LIVE_AUTO_ADAPTIVE_THRESHOLD_MIN_USD,
              Math.min(LIVE_AUTO_ADAPTIVE_THRESHOLD_MAX_USD, baseThreshold + liveAutoAdaptiveThresholdOffset),
            );
            const qualityPressureRatio = blockedByQualityGate / Math.max(1, orderedNewTrades.length);
            const shouldTighten = scanTransportHealth.consecutiveFailures > 0
              && blockedByQualityGate >= LIVE_AUTO_ADAPTIVE_PRESSURE_MIN_BLOCKS
              && qualityPressureRatio >= LIVE_AUTO_ADAPTIVE_PRESSURE_MIN_RATIO;

            if (shouldTighten) {
              liveAutoAdaptiveTightenStreakRef.current += 1;
              liveAutoAdaptiveRelaxStreakRef.current = 0;
              if (liveAutoAdaptiveTightenStreakRef.current >= LIVE_AUTO_ADAPTIVE_TIGHTEN_STREAK) {
                const nextEffectiveThreshold = Math.min(
                  LIVE_AUTO_ADAPTIVE_THRESHOLD_MAX_USD,
                  currentEffectiveThreshold + LIVE_AUTO_ADAPTIVE_STEP_UP_USD,
                );
                if (nextEffectiveThreshold > currentEffectiveThreshold) {
                  setLiveAutoAdaptiveThresholdOffset(nextEffectiveThreshold - baseThreshold);
                  appendAdaptiveTelemetryEvent({
                    time: new Date().toISOString(),
                    direction: 'up',
                    previousThreshold: currentEffectiveThreshold,
                    nextThreshold: nextEffectiveThreshold,
                    qualityBlocked: blockedByQualityGate,
                    considered: orderedNewTrades.length,
                    transportFailures: scanTransportHealth.consecutiveFailures,
                    reason: 'quality pressure during transport instability',
                  });
                  addLog(
                    `📈 Adaptive live threshold increased to $${nextEffectiveThreshold.toFixed(0)} after repeated quality pressure (${blockedByQualityGate}/${orderedNewTrades.length} blocked).`,
                    'warn',
                  );
                }
                liveAutoAdaptiveTightenStreakRef.current = 0;
              }
            } else {
              liveAutoAdaptiveTightenStreakRef.current = 0;
              const stableRecovery = scanTransportHealth.consecutiveFailures === 0 && blockedByQualityGate === 0;
              if (stableRecovery) {
                liveAutoAdaptiveRelaxStreakRef.current += 1;
                if (liveAutoAdaptiveRelaxStreakRef.current >= LIVE_AUTO_ADAPTIVE_RELAX_STREAK) {
                  const floorThreshold = Math.max(
                    LIVE_AUTO_ADAPTIVE_THRESHOLD_MIN_USD,
                    Math.min(LIVE_AUTO_ADAPTIVE_THRESHOLD_MAX_USD, baseThreshold),
                  );
                  const nextEffectiveThreshold = Math.max(
                    floorThreshold,
                    currentEffectiveThreshold - LIVE_AUTO_ADAPTIVE_STEP_DOWN_USD,
                  );
                  if (nextEffectiveThreshold < currentEffectiveThreshold) {
                    setLiveAutoAdaptiveThresholdOffset(nextEffectiveThreshold - baseThreshold);
                    appendAdaptiveTelemetryEvent({
                      time: new Date().toISOString(),
                      direction: 'down',
                      previousThreshold: currentEffectiveThreshold,
                      nextThreshold: nextEffectiveThreshold,
                      qualityBlocked: blockedByQualityGate,
                      considered: orderedNewTrades.length,
                      transportFailures: scanTransportHealth.consecutiveFailures,
                      reason: 'stable recovery scans',
                    });
                    addLog(
                      `📉 Adaptive live threshold relaxed to $${nextEffectiveThreshold.toFixed(0)} after stable scans.`,
                      'info',
                    );
                  }
                  liveAutoAdaptiveRelaxStreakRef.current = 0;
                }
              } else {
                liveAutoAdaptiveRelaxStreakRef.current = 0;
              }
            }
          }

          if (tradingState.executionMode === 'live') {
            const skippedForNetwork = orderedNewTrades.length - orderedNewTrades.filter((t) => supportsLiveExecution(t.executionPayload?.network || t.network)).length;
            if (skippedForNetwork > 0) {
              addLog(`🛡️ Live mode skipped ${skippedForNetwork} non-Ethereum opportunit${skippedForNetwork === 1 ? 'y' : 'ies'}.`, 'info');
            }
          }

          const prioritizedAutoTrades = tradingState.executionMode === 'live'
            ? [...autoTrades].sort((left, right) => (
              (getPairExecutionPriority(right) + getScanQualityPriorityAdjustment(right))
              - (getPairExecutionPriority(left) + getScanQualityPriorityAdjustment(left))
            ))
            : autoTrades;

          if (tradingState.executionMode === 'live' && prioritizedAutoTrades.length > 1) {
            addLog(`📊 Live auto mode prioritized ${prioritizedAutoTrades.length} candidate routes using realized pair performance.`, 'info');
          }

          for (const trade of prioritizedAutoTrades.slice(0, settings.maxConcurrentTrades)) {
            await executeTrade(trade);
          }
        } else {
          setLatestAutoSuppressionDiagnostics(null);
        }
      } else {
        setLatestAutoSuppressionDiagnostics(null);
        setLatestSpectrumSnapshot({
          totalCandidates: 0,
          queuedCandidates: 0,
          rejectedNegativeNet: 0,
          rejectedByMinProfit: 0,
          rejectedByGas: 0,
          rejectedByDemoCooldown: 0,
          rejectedByDemoWatchlistGate: 0,
          rejectedSamples: [],
        });
        const summary = noResultSummary;
        if (summary) {
          const blockers = [
            `slippage=${summary.droppedBySlippage}`,
            `executionRisk=${summary.droppedByExecutionRisk}`,
            `sameDex=${summary.droppedBySameDex}`,
            `net=${summary.droppedByNetProfit}`,
            `spread=${summary.droppedBySpread}`,
            `liquidity=${summary.droppedByLiquidity}`,
          ].join(', ');
          addLog(
            `⏳ No executable spreads this cycle (pairs=${summary.pairKeys}, candidates=${summary.candidates}). Blockers: ${blockers}.`,
            'info',
          );
        } else {
          addLog('⏳ No executable spreads this cycle.', 'info');
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ Scan error: ${message}`, 'error');
      console.error('Scan failed:', error);
    } finally {
      if (scanWatchdogTimer !== null) {
        window.clearTimeout(scanWatchdogTimer);
        scanWatchdogTimer = null;
      }
      scanInFlightRef.current = false;
      setTradingState(prev => ({ ...prev, status: continuousScanActive ? 'scanning' : 'idle' }));
    }
  }, [account, settings, scannerProfile, tradingState.mode, tradingState.executionMode, toast, services?.dex, continuousScanActive, addLog, getPairHistoryThrottle, registerTransportFailure, clearTransportFailures, getScanQualityPriorityAdjustment, effectiveAutoExecuteThreshold, liveAutoAdaptiveThresholdOffset, scanTransportHealth.consecutiveFailures, appendAdaptiveTelemetryEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Continuous scan: starts on trigger and runs forever until manually stopped
  const startContinuousScan = useCallback(() => {
    if (tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0) {
      const firstReason = liveReadinessBlockingReasons[0] || 'Live readiness checks failed.';
      toast({ title: 'Live Scanner Blocked', description: firstReason, variant: 'destructive' });
      addLog(`🚫 Live scanner blocked: ${firstReason}`, 'warn');
      return;
    }

    if (continuousLoopActiveRef.current || continuousScanRef.current) return; // already running
    continuousLoopActiveRef.current = true;
    setContinuousScanActive(true);
    setTradingState(prev => ({ ...prev, status: 'scanning' }));

    const runLoop = async () => {
      if (!continuousLoopActiveRef.current) return;
      await scanForOpportunities();
      if (!continuousLoopActiveRef.current) return;
      // Schedule next scan immediately after previous completes
      continuousScanRef.current = setTimeout(runLoop, settings.scanIntervalSeconds * 1000);
    };
    runLoop();

    toast({ title: '🔁 Continuous Scan Started', description: `Scanning every ${settings.scanIntervalSeconds}s until stopped.` });
  }, [addLog, liveReadinessBlockingReasons, scanForOpportunities, settings.scanIntervalSeconds, toast, tradingState.executionMode]);

  const stopContinuousScan = useCallback(() => {
    continuousLoopActiveRef.current = false;
    if (continuousScanRef.current) {
      clearTimeout(continuousScanRef.current);
      continuousScanRef.current = null;
    }
    setContinuousScanActive(false);
    setTradingState(prev => ({ ...prev, status: 'idle' }));
    toast({ title: '⏹ Scan Stopped', description: 'Continuous scanning has been halted.' });
  }, [toast]);

  const forceResetScanState = useCallback(() => {
    scanInFlightRef.current = false;
    setTradingState((prev) => ({ ...prev, status: continuousScanActive ? 'scanning' : 'idle' }));
    addLog('🛠️ Manual scanner reset applied. Scan state has been recovered.', 'warn');
    toast({
      title: 'Scanner State Reset',
      description: 'In-flight scan state was cleared. You can run a fresh scan now.',
    });
  }, [addLog, continuousScanActive, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      continuousLoopActiveRef.current = false;
      if (continuousScanRef.current) clearTimeout(continuousScanRef.current);
    };
  }, []);

  const executeTrade = async (trade: PendingTrade) => {
    if (inFlightTradeIdsRef.current.has(trade.id)) {
      addLog(`⏳ Ignored duplicate execution click for ${trade.tokenPair}; trade is already in flight.`, 'warn');
      return;
    }

    if (tradingState.executionMode === 'live') {
      const historyBlocker = getPairHistoryBlocker(trade);
      if (historyBlocker) {
        addLog(`🛑 ${historyBlocker}`, 'warn');
        toast({
          title: 'Live Trade Blocked By History',
          description: historyBlocker,
          variant: 'destructive',
        });
        return;
      }
    }

    const historyThrottle = tradingState.executionMode === 'live'
      ? getPairHistoryThrottle(trade)
      : null;
    const executionMetadata = historyThrottle
      ? {
          adaptiveSizingApplied: true,
          adaptiveLoanFactor: Number(historyThrottle.factor.toFixed(4)),
          originalLoanAmount: trade.loanAmount,
          adjustedLoanAmount: historyThrottle.adjustedLoanAmount,
          adaptiveSizingReason: historyThrottle.reason,
        }
      : undefined;
    const effectiveTrade = historyThrottle
      ? {
          ...trade,
          loanAmount: historyThrottle.adjustedLoanAmount,
          expectedProfit: Number((trade.expectedProfit * historyThrottle.factor).toFixed(2)),
          grossProfit: Number((trade.grossProfit * historyThrottle.factor).toFixed(2)),
        }
      : trade;

    if (effectiveTrade.expectedProfit <= MIN_PROFIT_FLOOR_USD) {
      addLog(
        `🚫 Blocked ${trade.tokenPair}: expected net $${effectiveTrade.expectedProfit.toFixed(2)} is not positive after policy checks.`,
        'warn',
      );
      toast({
        title: 'Trade Blocked By Profit Policy',
        description: 'Expected net profit must be positive to execute.',
        variant: 'destructive',
      });
      return;
    }

    if (historyThrottle) {
      addLog(
        `⚖️ Adaptive live sizing for ${trade.tokenPair}: loan reduced to $${historyThrottle.adjustedLoanAmount.toLocaleString()} (${Math.round(historyThrottle.factor * 100)}%) due to ${historyThrottle.reason}.`,
        'info',
      );
    }

    inFlightTradeIdsRef.current.add(trade.id);
    setExecutingTradeId(trade.id);
    setTradingState(prev => ({ ...prev, status: 'executing' }));

    try {
      const result = await executeArbitrageTrade({
        trade: effectiveTrade,
        mode: tradingState.executionMode,
        account,
        contractAddress: settings.contractAddress,
        maxSlippagePercent: settings.maxSlippage,
        executionMetadata,
      });

      // Update state
      setTradingState(prev => ({
        ...prev,
        tradesExecuted: prev.tradesExecuted + 1,
        profitToday: prev.profitToday + result.actualProfit,
        gasSpentToday: prev.gasSpentToday + trade.gasCost,
        status: tradingState.mode === 'auto' ? 'scanning' : 'idle'
      }));

      // Remove from pending
      setPendingTrades(prev => prev.filter(t => t.id !== trade.id));

      addLog(
        `${tradingState.executionMode === 'live' ? '🚀' : '🧪'} ${tradingState.executionMode === 'live' ? 'Live' : 'Demo'} execution: ${trade.tokenPair} | net=$${result.actualProfit.toFixed(2)} | ref=${result.txHash.slice(0, 18)}...`,
        'success',
      );

      if (tradingState.executionMode === 'demo' && result.actualProfit < 0) {
        const cooldownKey = buildRouteKey(trade);
        demoLossCooldownRef.current[cooldownKey] = Date.now() + DEMO_REPEAT_LOSS_COOLDOWN_MS;
        addLog(
          `🧯 Applied demo cooldown (${Math.round(DEMO_REPEAT_LOSS_COOLDOWN_MS / 60000)}m) for ${trade.tokenPair} ${trade.buyDex} → ${trade.sellDex} after negative execution.`,
          'info',
        );
      }

      toast({
        title: tradingState.executionMode === 'live' ? 'Live Trade Submitted' : 'Demo Trade Executed',
        description: `Net: $${result.actualProfit.toFixed(2)} | Ref: ${result.txHash.slice(0, 10)}...`
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      addLog(`❌ Execution failed for ${trade.tokenPair}: ${message}`, 'error');
      toast({
        title: 'Execution Failed',
        description: message,
        variant: 'destructive'
      });
      setTradingState(prev => ({ ...prev, status: tradingState.mode === 'auto' ? 'scanning' : 'idle' }));
    } finally {
      void refreshRecentExecutionLogs();
      void refreshDailyExecutionSummary();
      void refreshRouteMemory();
      inFlightTradeIdsRef.current.delete(trade.id);
      setExecutingTradeId(null);
    }
  };

  const setExecutionMode = async (mode: 'demo' | 'live') => {
    if (mode === 'live' && !account) {
      toast({
        title: 'Wallet Required',
        description: 'Connect your wallet (top-right or from this panel) to enable live trading',
        variant: 'destructive'
      });
      return;
    }

    if (mode === 'live') {
      const breaker = await getLiveCircuitBreakerStatus();
      setCircuitBreakerState({
        active: breaker.active,
        reason: breaker.reason || null,
        minutesRemaining: breaker.minutesRemaining ?? null,
        loading: false,
      });
      if (breaker.active) {
        toast({
          title: 'Live Mode Blocked by Circuit Breaker',
          description: `${breaker.reason || 'Safety threshold reached'} (${breaker.minutesRemaining || 1}m remaining).`,
          variant: 'destructive',
        });
        return;
      }
    }

    setTradingState(prev => ({ 
      ...prev, 
      executionMode: mode,
      status: prev.mode === 'auto' ? 'scanning' : 'idle'
    }));

    if (mode === 'live') {
      const blocker = getLiveExecutionBlocker({ network: 'ethereum' }, account, settings.contractAddress);
      if (blocker && blocker.includes('Configure your arbitrage contract address')) {
        toast({
          title: 'Live Mode Armed',
          description: 'Wallet is connected. Add your arbitrage contract address to submit live trades.',
        });
        return;
      }
    }

    toast({
      title: mode === 'live' ? 'Live Mode Enabled' : 'Demo Mode Enabled',
      description: mode === 'live'
        ? 'Live execution is armed. Supported trades will be submitted with real funds.'
        : 'Using real market data with simulated execution.'
    });
  };

  const handleCircuitBreakerReset = async () => {
    try {
      await resetLiveCircuitBreaker();
      await refreshCircuitBreakerState();
      toast({
        title: 'Circuit Breaker Reset',
        description: 'Live execution lock has been cleared for this operator profile.',
      });
    } catch {
      toast({
        title: 'Reset Failed',
        description: 'Unable to reset circuit breaker state. Check network and Supabase connectivity.',
        variant: 'destructive',
      });
    }
  };

  const toggleMode = (mode: 'manual' | 'auto') => {
    if (mode === 'auto' && tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0) {
      const firstReason = liveReadinessBlockingReasons[0] || 'Live readiness checks failed.';
      toast({
        title: 'Auto Mode Blocked',
        description: firstReason,
        variant: 'destructive',
      });
      addLog(`🚫 Auto mode blocked: ${firstReason}`, 'warn');
      return;
    }

    if (mode === 'manual' && continuousScanActive) {
      stopContinuousScan();
    }

    setTradingState(prev => ({ 
      ...prev, 
      mode,
      status: continuousScanActive ? 'scanning' : 'idle'
    }));
  };

  const togglePause = () => {
    setTradingState(prev => ({
      ...prev,
      status: prev.status === 'paused' ? (prev.mode === 'auto' ? 'scanning' : 'idle') : 'paused'
    }));
  };

  return (
    <div className="space-y-6">
      {/* Live Trading Status Bar */}
      <Card className={`border-2 transition-all ${tradingState.executionMode === 'live' ? 'bg-gradient-to-r from-red-900/30 to-gray-800 border-red-500' : 'bg-gradient-to-r from-blue-900/30 to-gray-800 border-blue-500'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${tradingState.executionMode === 'live' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                <Power className={`h-6 w-6 ${tradingState.executionMode === 'live' ? 'text-red-400' : 'text-blue-400'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-lg">
                    {tradingState.executionMode === 'live' ? 'LIVE EXECUTION MODE' : 'DEMO EXECUTION MODE'}
                  </h3>
                  <Badge className={adaptiveTelemetryRemoteStatus === 'ready'
                    ? 'bg-green-500/20 text-green-200 border border-green-500/50'
                    : adaptiveTelemetryRemoteStatus === 'missing'
                      ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/50'
                      : 'bg-gray-700/50 text-gray-200 border border-gray-600/60'}>
                    Telemetry {adaptiveTelemetryRemoteStatus}
                    {adaptiveTelemetryPendingCount > 0 ? ` • ${adaptiveTelemetryPendingCount} pending` : ''}
                  </Badge>
                  {tradingState.executionMode === 'live' && (
                    <Badge className={liveProductionReady
                      ? 'bg-green-500/20 text-green-200 border border-green-500/50'
                      : 'bg-red-500/20 text-red-200 border border-red-500/50'}>
                      {liveProductionReady ? 'Production Ready' : 'Not Ready'}
                    </Badge>
                  )}
                  {tradingState.executionMode === 'live' ? (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                  ) : (
                    <Badge className="bg-blue-500/20 text-blue-300 border border-blue-400/30">Real data, simulated fills</Badge>
                  )}
                  {tradingState.executionMode === 'live' && circuitBreakerState.loading && (
                    <Badge className="bg-gray-700/60 text-gray-200 border border-gray-500/60">Checking safety lock...</Badge>
                  )}
                  {tradingState.executionMode === 'live' && circuitBreakerState.active && (
                    <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-500/50">
                      Circuit Breaker: {circuitBreakerState.minutesRemaining || 1}m remaining
                    </Badge>
                  )}
                </div>
                <p className="text-gray-400 text-sm">
                  {tradingState.executionMode === 'live'
                    ? 'Real transactions will be executed with your connected wallet when the route is supported'
                    : 'Scanner uses live market data, but executions are recorded in demo mode'}
                </p>
                {adaptiveTelemetryPendingCount > 0 && (
                  <p className="text-gray-500 text-xs mt-1">
                    Adaptive telemetry queue: {adaptiveTelemetryPendingCount} pending, {adaptiveTelemetrySyncedCount} synced, oldest pending {adaptiveTelemetryOldestPendingMinutes}m.
                  </p>
                )}
                {tradingState.executionMode === 'live' && circuitBreakerState.active && (
                  <p className="text-yellow-300 text-xs mt-1">
                    {circuitBreakerState.reason || 'Safety threshold reached. Live execution is temporarily locked.'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right mr-4">
                <p className="text-gray-400 text-sm">Connected Wallet</p>
                <p className="text-white font-mono">
                  {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Not Connected'}
                </p>
              </div>
              {!account && (
                <Button
                  onClick={() => void handleConnectWallet()}
                  disabled={connecting}
                  className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-semibold"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4 mr-2" />
                      Connect Wallet
                    </>
                  )}
                </Button>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 p-1">
                <button
                  onClick={() => { void setExecutionMode('demo'); }}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    tradingState.executionMode === 'demo'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Demo
                </button>
                <button
                  onClick={() => { void setExecutionMode('live'); }}
                  disabled={circuitBreakerState.active || circuitBreakerState.loading}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    tradingState.executionMode === 'live'
                      ? 'bg-red-500 text-white'
                      : (circuitBreakerState.active || circuitBreakerState.loading)
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Live
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warning Banner for Live Mode */}
      {tradingState.executionMode === 'live' && (
        <Alert className="bg-yellow-900/30 border-yellow-500/50">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <AlertDescription className="text-yellow-200">
            <strong>Live Trading Warning:</strong> Real funds will be used. Ensure you understand the risks. 
            Current live executor is wired for Ethereum routes; Base and Arbitrum opportunities remain executable in demo mode until network-specific live routes are configured.
            {circuitBreakerState.active && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-yellow-100 text-xs">Circuit breaker is active.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { void handleCircuitBreakerReset(); }}
                  className="h-7 border-yellow-400/60 text-yellow-100 hover:bg-yellow-500/20"
                >
                  Reset Circuit Breaker
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {tradingState.executionMode === 'live' && (
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-cyan-300" />
              Live Readiness Checklist
              <Badge className={liveProductionReady
                ? 'bg-green-500/20 text-green-200 border border-green-500/50'
                : 'bg-red-500/20 text-red-200 border border-red-500/50'}>
                {liveProductionReady ? 'READY' : 'BLOCKED'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {liveReadinessChecks.map((check) => (
              <div key={check.id} className="flex items-start justify-between gap-3 rounded-md border border-gray-800 bg-black/30 p-2">
                <div>
                  <p className={`text-sm font-medium ${check.passed ? 'text-green-300' : (check.required ? 'text-red-300' : 'text-yellow-300')}`}>
                    {check.passed ? 'PASS' : (check.required ? 'BLOCKED' : 'RECOMMENDED')} • {check.label}
                  </p>
                  <p className="text-xs text-gray-400">{check.detail}</p>
                </div>
                {!check.required && (
                  <Badge className="bg-gray-700/50 text-gray-300 border border-gray-600/70">Optional</Badge>
                )}
              </div>
            ))}
            {liveReadinessBlockingReasons.length > 0 && (
              <div className="mt-2 space-y-2 rounded-md border border-red-800/40 bg-red-900/10 p-2">
                <p className="text-xs text-red-300">
                  Live scanning is locked until required checks pass.
                </p>
                <div className="space-y-2">
                  {liveReadinessChecks.filter((check) => check.required && !check.passed).map((check) => (
                    <div key={`fix-${check.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-800 bg-black/30 p-2">
                      <p className="text-xs text-gray-300">{check.label}</p>
                      <div className="flex items-center gap-2">
                        {check.id === 'wallet' && (
                          <Button size="sm" variant="outline" onClick={() => { void handleConnectWallet(); }} className="h-7 border-cyan-500/70 text-cyan-100 hover:bg-cyan-500/20">
                            Connect Wallet
                          </Button>
                        )}
                        {check.id === 'contract' && (
                          <Button size="sm" variant="outline" onClick={handleFixContractAddress} className="h-7 border-cyan-500/70 text-cyan-100 hover:bg-cyan-500/20">
                            Use Detected Contract
                          </Button>
                        )}
                        {check.id === 'slippage' && (
                          <Button size="sm" variant="outline" onClick={handleFixSlippageCap} className="h-7 border-cyan-500/70 text-cyan-100 hover:bg-cyan-500/20">
                            Apply Live Slippage Cap
                          </Button>
                        )}
                        {check.id === 'armed' && (
                          <span className="text-[11px] text-yellow-200">Set VITE_LIVE_TRADING_ENABLED=true and restart app</span>
                        )}
                        {check.id === 'breaker' && (
                          <Button size="sm" variant="outline" onClick={() => { void handleCircuitBreakerReset(); }} className="h-7 border-yellow-500/70 text-yellow-100 hover:bg-yellow-500/20">
                            Reset Breaker
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {scannerProfile !== 'live' && (
              <div className="mt-3 flex items-center justify-between rounded-md border border-cyan-700/40 bg-cyan-900/10 p-2">
                <p className="text-xs text-cyan-200">Recommended: use the Live scanner profile for production routes.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => switchScannerProfile('live')}
                  className="h-7 border-cyan-400/70 text-cyan-100 hover:bg-cyan-500/20"
                >
                  Switch To Live Profile
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Trading Mode Selection */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="h-5 w-5 text-[#00F0FF]" />
              Trading Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleMode('manual')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  tradingState.mode === 'manual'
                    ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <Wallet className="h-6 w-6 mx-auto mb-2" />
                <p className="font-semibold">Manual</p>
                <p className="text-xs opacity-70">Review & execute</p>
              </button>
              <button
                onClick={() => toggleMode('auto')}
                disabled={tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0}
                className={`p-4 rounded-lg border-2 transition-all ${
                  tradingState.mode === 'auto'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                    : (tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0)
                      ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <Zap className="h-6 w-6 mx-auto mb-2" />
                <p className="font-semibold">Auto 24/7</p>
                <p className="text-xs opacity-70">Fully automated</p>
              </button>
            </div>

            <div className="pt-4 border-t border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Status</span>
                <Badge className={`${
                  continuousScanActive ? 'bg-blue-500 animate-pulse' :
                  tradingState.status === 'executing' ? 'bg-green-500' :
                  tradingState.status === 'paused' ? 'bg-yellow-500' :
                  'bg-gray-600'
                }`}>
                  {continuousScanActive ? '⟳ SCANNING' : tradingState.status.toUpperCase()}
                </Badge>
              </div>

              {sameDexPauseRemainingMs > 0 && (
                <div className="rounded-md border border-yellow-500/50 bg-yellow-900/20 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-yellow-100 text-xs font-medium">Regime Gate Active</span>
                    <Badge className="bg-yellow-500/20 text-yellow-100 border border-yellow-500/60">
                      {formatRegimePauseCountdown(sameDexPauseRemainingMs)}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-yellow-200/90">
                    sameDex-dominant live regime detected; scan loop is temporarily paused to reduce low-quality cycles.
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-gray-400 text-sm">Loan Size</Label>
                  <span className="text-[#00F0FF] font-semibold text-sm">
                    ${settings.loanAmount.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={1000000}
                  step={100}
                  value={settings.loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                  className="w-full accent-[#00F0FF]"
                  aria-label="Loan size"
                />
              </div>

              {/* Primary: Start/Stop Continuous Scan */}
              {!continuousScanActive ? (
                <Button
                  onClick={startContinuousScan}
                  disabled={tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0}
                  className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-bold"
                >
                  <Play className="h-4 w-4 mr-2" /> Start Scanner
                </Button>
              ) : (
                <Button
                  onClick={stopContinuousScan}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  <Square className="h-4 w-4 mr-2" /> Stop Scanner
                </Button>
              )}

              {/* Secondary: Single scan or pause controls */}
              {tradingState.mode === 'auto' && (
                <Button
                  onClick={togglePause}
                  variant="outline"
                  className="w-full border-gray-600"
                >
                  {tradingState.status === 'paused' ? (
                    <><Play className="h-4 w-4 mr-2" /> Resume Auto</>
                  ) : (
                    <><Pause className="h-4 w-4 mr-2" /> Pause Auto</>
                  )}
                </Button>
              )}
              {tradingState.mode === 'manual' && (
                <Button
                  onClick={scanForOpportunities}
                  variant="outline"
                  className="w-full border-gray-600 text-gray-300"
                  disabled={tradingState.status === 'scanning' || (tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0)}
                >
                  {tradingState.status === 'scanning' ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Single Scan</>
                  )}
                </Button>
              )}

              {continuousScanActive && (
                <p className="text-xs text-blue-400 text-center animate-pulse">
                  🔁 Scanning every {settings.scanIntervalSeconds}s — running continuously
                </p>
              )}

              {tradingState.status === 'scanning' && (
                <Button
                  onClick={forceResetScanState}
                  variant="ghost"
                  className="w-full text-yellow-300 hover:text-yellow-200 hover:bg-yellow-900/20"
                >
                  <Power className="h-4 w-4 mr-2" /> Force Reset Scan State
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today's Performance */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Today's Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Trades</p>
                <p className="text-2xl font-bold text-white">{tradingState.tradesExecuted}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Net Profit</p>
                <p className="text-2xl font-bold text-green-400">
                  ${tradingState.profitToday.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Gas Spent</p>
                <p className="text-2xl font-bold text-orange-400">
                  ${tradingState.gasSpentToday.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Gross Before Gas</p>
                <p className={`text-2xl font-bold ${(tradingState.profitToday + tradingState.gasSpentToday) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${(tradingState.profitToday + tradingState.gasSpentToday).toFixed(2)}
                </p>
              </div>
            </div>
            
            {tradingState.lastScan && (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Clock className="h-4 w-4" />
                Last scan: {tradingState.lastScan.toLocaleTimeString()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Settings */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-400" />
              Quick Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scan presets */}
            <div className="flex gap-2">
              <button
                onClick={() => applyPreset(PRESET_DEMO)}
                className="flex-1 rounded px-3 py-1.5 text-xs font-semibold border border-yellow-500/60 text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                title="Permissive settings — shows activity in any market"
              >
                Practice Preset
              </button>
              <button
                onClick={() => applyPreset(PRESET_REALISTIC)}
                className="flex-1 rounded px-3 py-1.5 text-xs font-semibold border border-green-500/60 text-green-400 hover:bg-green-500/10 transition-colors"
                title="Real-world profitable thresholds"
              >
                Live Preset
              </button>
            </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => switchScannerProfile('discovery')}
                  className={`rounded px-3 py-1.5 text-xs font-semibold border transition-colors ${scannerProfile === 'discovery' ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10' : 'border-gray-600 text-gray-300 hover:bg-gray-700/50'}`}
                  title="Broader scan universe optimized for finding opportunities"
                >
                  Scanner: Discovery
                </button>
                <button
                  onClick={() => switchScannerProfile('live')}
                  className={`rounded px-3 py-1.5 text-xs font-semibold border transition-colors ${scannerProfile === 'live' ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10' : 'border-gray-600 text-gray-300 hover:bg-gray-700/50'}`}
                  title="Tighter scan constraints for live-grade candidates"
                >
                  Scanner: Live
                </button>
              </div>
              <Button
                onClick={handleAutoTuneSettings}
                variant="outline"
                className="w-full border-fuchsia-500/70 text-fuchsia-100 hover:bg-fuchsia-500/20"
                disabled={!latestScanDiagnostics}
                title="Auto-tune live settings from the most recent scan diagnostics"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Auto Tuner
              </Button>
              <div className="text-[11px] text-gray-400">
                Active scanner profile: <span className="text-gray-200 font-semibold">{scannerProfile === 'live' ? 'Live (multi-chain visibility, Ethereum-only execution, higher liquidity floor)' : 'Discovery (multi-chain, broader search)'}</span>
              </div>
              {!leanMode && (
                <button
                  onClick={() => setSpectrumDebugEnabled((prev) => !prev)}
                  className={`w-full rounded px-3 py-1.5 text-xs font-semibold border transition-colors ${spectrumDebugEnabled ? 'border-orange-400/80 text-orange-200 bg-orange-500/10' : 'border-gray-600 text-gray-300 hover:bg-gray-700/50'}`}
                  title="Show filter-spectrum diagnostics for candidate rejection reasons"
                >
                  Spectrum Debug: {spectrumDebugEnabled ? 'ON' : 'OFF'}
                </button>
              )}
            <button
              onClick={() => applyPreset(PRESET_FIRST_LIVE)}
              className="w-full rounded px-3 py-2 text-xs font-bold border border-red-500/70 text-red-300 hover:bg-red-500/10 transition-colors"
              title="First live trade profile: conservative 10k sizing, 1.2% max slippage, and tighter liquidity usage"
            >
              First Live (Conservative $100+ Net)
            </button>
            <div>
              <Label className="text-gray-400 text-sm">Min Profit ($)</Label>
              <Input
                type="number"
                min={MIN_PROFIT_FLOOR_USD}
                value={settings.minProfit}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setSettings((s) => ({
                    ...s,
                    minProfit: Number.isFinite(value) ? Math.max(MIN_PROFIT_FLOOR_USD, value) : MIN_PROFIT_FLOOR_USD,
                  }));
                }}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Gas Fallback Est. / Tx ($)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={settings.estimatedGasUsd}
                onChange={(e) => setSettings(s => ({ ...s, estimatedGasUsd: +e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
              <p className="text-[11px] text-gray-500 mt-1">Fallback only — scanner uses live gas price. Ethereum ≈ $25, Arbitrum ≈ $0.30</p>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Max Liquidity Usage (%)</Label>
              <Input
                type="number"
                min={1}
                max={95}
                step={1}
                value={settings.maxLiquidityUsagePercent}
                onChange={(e) => {
                  const value = Math.max(1, Math.min(95, Number(e.target.value) || 1));
                  setSettings(s => ({ ...s, maxLiquidityUsagePercent: value }));
                }}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Max Gas ($)</Label>
              <Input
                type="number"
                value={settings.maxGas}
                onChange={(e) => setSettings(s => ({ ...s, maxGas: +e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Loan Amount ($)</Label>
              <Input
                type="number"
                min={100}
                max={1000000}
                step={100}
                value={settings.loanAmount}
                onChange={(e) => setLoanAmount(Number(e.target.value))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Auto-Execute Threshold ($)</Label>
              <Input
                type="number"
                value={settings.autoExecuteThreshold}
                onChange={(e) => setSettings(s => ({ ...s, autoExecuteThreshold: +e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
                disabled={tradingState.mode === 'manual'}
              />
              {tradingState.executionMode === 'live' && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Effective live threshold: <span className="text-gray-200">${effectiveAutoExecuteThreshold.toFixed(0)}</span>
                  {Math.abs(liveAutoAdaptiveThresholdOffset) > 0.001 && (
                    <>
                      {' '}({liveAutoAdaptiveThresholdOffset > 0 ? '+' : ''}{liveAutoAdaptiveThresholdOffset.toFixed(0)} adaptive)
                    </>
                  )}
                </p>
              )}
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Contract Address</Label>
              <Input
                placeholder="0x..."
                value={settings.contractAddress}
                onChange={(e) => setSettings(s => ({ ...s, contractAddress: e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1 font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {!leanMode && spectrumDebugEnabled && (
        <Card className="bg-gray-900 border-orange-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-orange-300" />
              Spectrum Debug
              <Badge className="bg-orange-500/20 text-orange-100 border border-orange-500/50">
                {latestSpectrumSnapshot ? `${latestSpectrumSnapshot.queuedCandidates}/${latestSpectrumSnapshot.totalCandidates} queued` : 'No scan yet'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestSpectrumSnapshot ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded border border-gray-700 bg-black/30 p-2 text-gray-300">Negative net: <span className="text-red-300 font-semibold">{latestSpectrumSnapshot.rejectedNegativeNet}</span></div>
                  <div className="rounded border border-gray-700 bg-black/30 p-2 text-gray-300">Min profit: <span className="text-yellow-300 font-semibold">{latestSpectrumSnapshot.rejectedByMinProfit}</span></div>
                  <div className="rounded border border-gray-700 bg-black/30 p-2 text-gray-300">Gas cap: <span className="text-orange-300 font-semibold">{latestSpectrumSnapshot.rejectedByGas}</span></div>
                  <div className="rounded border border-gray-700 bg-black/30 p-2 text-gray-300">Demo gates: <span className="text-blue-300 font-semibold">{latestSpectrumSnapshot.rejectedByDemoCooldown + latestSpectrumSnapshot.rejectedByDemoWatchlistGate}</span></div>
                </div>
                {latestSpectrumSnapshot.rejectedSamples.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[11px] text-gray-400">Recent rejected samples</p>
                    {latestSpectrumSnapshot.rejectedSamples.slice(0, 5).map((sample, index) => (
                      <div key={`${sample.tokenPair}-${sample.reason}-${index}`} className="rounded border border-gray-800 bg-black/30 px-2 py-1 text-[11px] text-gray-300">
                        {sample.tokenPair} ({sample.network}) • {sample.reason} • Net ${sample.expectedProfit.toFixed(2)} • Gas ${sample.gasCost.toFixed(2)} • Loan ${Math.round(sample.loanAmount).toLocaleString()}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">No rejected samples captured in the latest cycle.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">Run a scan to populate rejection-spectrum diagnostics.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending Trades */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#00F0FF]" />
              Pending Opportunities ({pendingTrades.length})
            </CardTitle>
            <Button
              onClick={() => setPendingTrades([])}
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
            >
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pendingTrades.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No pending opportunities</p>
              <p className="text-sm">Scan for new arbitrage opportunities</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all"
                >
                  {isCycleShadowOpportunity(trade) && (
                    <div className="mb-3 rounded border border-cyan-700/40 bg-cyan-900/10 px-2 py-1 text-xs text-cyan-200">
                      Cycle-shadow diagnostics item (watchlist-only). This is surfaced for monitoring and not intended for direct execution.
                    </div>
                  )}
                  {tradingState.executionMode === 'live' && getPairHistoryBlocker(trade) && (
                    <div className="mb-3 rounded border border-red-700/40 bg-red-900/10 px-2 py-1 text-xs text-red-300">
                      {getPairHistoryBlocker(trade)}
                    </div>
                  )}
                  {tradingState.executionMode === 'live' && !getPairHistoryBlocker(trade) && getPairHistoryThrottle(trade) && (
                    <div className="mb-3 rounded border border-yellow-700/40 bg-yellow-900/10 px-2 py-1 text-xs text-yellow-200">
                      Adaptive sizing: loan will be reduced to ${getPairHistoryThrottle(trade)?.adjustedLoanAmount.toLocaleString()} due to {getPairHistoryThrottle(trade)?.reason}.
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{trade.tokenPair}</span>
                          {trade.status === 'watchlist' && (
                            <Badge variant="outline" className="text-xs border-yellow-500/60 text-yellow-300">
                              {isCycleShadowOpportunity(trade) ? 'cycle shadow' : 'demo near-miss'}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs capitalize">
                            {trade.network}
                          </Badge>
                        </div>
                        <p className="text-gray-400 text-sm">
                          {trade.buyDex} → {trade.sellDex}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`font-bold ${trade.expectedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>Net ${trade.expectedProfit.toFixed(2)}</p>
                        <p className="text-gray-500 text-sm">Gross ${trade.grossProfit.toFixed(2)} | Gas ${trade.gasCost.toFixed(2)}</p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-gray-400 text-sm">Confidence</p>
                        <p className={`font-bold ${trade.confidence >= 80 ? 'text-green-400' : trade.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {trade.confidence}%
                        </p>
                      </div>

                      {tradingState.mode === 'manual' && (
                        <Button
                          onClick={() => executeTrade(trade)}
                          disabled={
                            executingTradeId === trade.id
                            || isCycleShadowOpportunity(trade)
                            || (tradingState.executionMode === 'live' && (circuitBreakerState.active || circuitBreakerState.loading || Boolean(getPairHistoryBlocker(trade))))
                          }
                          className="bg-green-500 hover:bg-green-600 text-white"
                        >
                          {executingTradeId === trade.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isCycleShadowOpportunity(trade) ? (
                            <>Diagnostics Only</>
                          ) : (
                            <><Zap className="h-4 w-4 mr-1" /> {tradingState.executionMode === 'live' ? (getPairHistoryThrottle(trade) ? 'Execute Live (Throttled)' : 'Execute Live') : 'Execute Demo'}</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!leanMode && spectrumDebugEnabled && (
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-green-400" />
            Route Memory Performance
            {pairPerformanceLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pairPerformance.length === 0 ? (
            <p className="text-gray-500 text-sm">No route performance history yet. Execute trades to build pair-level performance memory.</p>
          ) : (
            <div className="space-y-2">
              {pairPerformance.map((row) => (
                <div
                  key={`${row.network}-${row.token_pair}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-black/30 p-3"
                >
                  <div>
                    <p className="text-white font-medium">{row.token_pair}</p>
                    <p className="text-xs text-gray-400">{row.network} • {row.routes} routes • {row.total_executions} executions</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${row.cumulative_realized_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      Cum Net ${row.cumulative_realized_net.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      Win {row.success_rate_pct.toFixed(1)}% • Avg ${row.avg_route_realized_net.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {!leanMode && spectrumDebugEnabled && (
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-yellow-300" />
              Route Cooldowns
              <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-500/40">
                {routeMemoryRows.filter((row) => row.cooldown_until && Date.parse(row.cooldown_until) > Date.now()).length} active
              </Badge>
              {routeMemoryLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            </CardTitle>
            {routeMemoryRows.some((row) => row.cooldown_until && Date.parse(row.cooldown_until) > Date.now()) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { void clearAllRouteCooldowns(); }}
                disabled={clearingRouteKey === '__all__'}
                className="h-7 border-yellow-500/60 text-yellow-100 hover:bg-yellow-500/20"
              >
                {clearingRouteKey === '__all__' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Clear All Active'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {routeMemoryRows.length === 0 ? (
            <p className="text-gray-500 text-sm">No route memory records yet. Executed trades will populate cooldown and realized-edge memory here.</p>
          ) : (
            <div className="space-y-2">
              {routeMemoryRows.map((row) => {
                const cooldownUntil = row.cooldown_until ? Date.parse(row.cooldown_until) : NaN;
                const cooldownActive = Number.isFinite(cooldownUntil) && cooldownUntil > Date.now();
                const cooldownMinutes = cooldownActive ? Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 60000)) : 0;

                return (
                  <div key={row.id} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{row.token_pair}</span>
                        <Badge variant="outline" className="text-xs capitalize">{row.network}</Badge>
                        <Badge className={cooldownActive ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/40' : 'bg-gray-700/30 text-gray-300 border border-gray-600/40'}>
                          {cooldownActive ? `Cooldown ${cooldownMinutes}m` : 'Ready'}
                        </Badge>
                      </div>
                      {cooldownActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void clearRouteCooldown(row.route_key); }}
                          disabled={clearingRouteKey === row.route_key}
                          className="h-7 border-yellow-500/60 text-yellow-100 hover:bg-yellow-500/20"
                        >
                          {clearingRouteKey === row.route_key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Clear Cooldown'}
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span>{row.buy_dex} → {row.sell_dex}</span>
                      <span>{row.total_executions} executions</span>
                      <span className={row.avg_realized_net >= 0 ? 'text-green-300' : 'text-red-300'}>
                        Avg ${row.avg_realized_net.toFixed(2)}
                      </span>
                      {row.last_realized_net != null && (
                        <span className={row.last_realized_net >= 0 ? 'text-green-300' : 'text-red-300'}>
                          Last ${row.last_realized_net.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {row.last_executed_at && (
                      <p className="mt-2 text-xs text-gray-500">Last executed {new Date(row.last_executed_at).toLocaleString()}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {!leanMode && spectrumDebugEnabled && (
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-orange-300" />
            Latest Scan Suppressions
            {latestRouteMemoryDiagnostics && (
              <Badge className="bg-orange-500/20 text-orange-200 border border-orange-500/40">
                {latestRouteMemoryDiagnostics.suppressedByCooldown} cooldown • {latestRouteMemoryDiagnostics.penalizedByHistory} penalized
              </Badge>
            )}
            {latestAutoSuppressionDiagnostics && (
              <Badge className="bg-blue-500/20 text-blue-200 border border-blue-500/40">
                auto {latestAutoSuppressionDiagnostics.eligible}/{latestAutoSuppressionDiagnostics.considered} eligible
              </Badge>
            )}
            {scanTransportHealth.consecutiveFailures > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-500/40">
                transport streak {scanTransportHealth.consecutiveFailures} • backoff {Math.max(0, Math.ceil(scanTransportHealth.backoffRemainingMs / 1000))}s
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!latestRouteMemoryDiagnostics ? (
            <p className="text-gray-500 text-sm">Run a scan to inspect which routes were suppressed or penalized this cycle.</p>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-gray-400">
                Loaded routes: <span className="text-gray-200">{latestRouteMemoryDiagnostics.loadedRoutes}</span> • Max penalty: <span className="text-gray-200">${latestRouteMemoryDiagnostics.maxPenaltyUsd.toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-400">
                Transport health: <span className="text-gray-200">{scanTransportHealth.consecutiveFailures} recent failure{scanTransportHealth.consecutiveFailures === 1 ? '' : 's'}</span>
                {' '}• Backoff: <span className="text-gray-200">{Math.max(0, Math.ceil(scanTransportHealth.backoffRemainingMs / 1000))}s</span>
                {' '}• Last source: <span className="text-gray-200">{scanTransportHealth.lastFailureSource}</span>
                {scanTransportHealth.lastFailureReason ? (
                  <>
                    {' '}• Last reason: <span className="text-gray-200">{scanTransportHealth.lastFailureReason}</span>
                  </>
                ) : null}
              </div>

              {latestAutoSuppressionDiagnostics && (
                <div className="text-xs text-gray-400">
                  Auto filters: <span className="text-gray-200">{latestAutoSuppressionDiagnostics.eligible}/{latestAutoSuppressionDiagnostics.considered} eligible</span>
                  {' '}• Effective threshold: <span className="text-gray-200">${effectiveAutoExecuteThreshold.toFixed(0)}</span>
                  {' '}• Transport gate: <span className="text-gray-200">{latestAutoSuppressionDiagnostics.blockedByTransportGate}</span>
                  {' '}• Quality gate: <span className="text-gray-200">{latestAutoSuppressionDiagnostics.blockedByQualityGate}</span>
                  {' '}• Unsupported network: <span className="text-gray-200">{latestAutoSuppressionDiagnostics.blockedByUnsupportedNetwork}</span>
                  {' '}• Threshold: <span className="text-gray-200">{latestAutoSuppressionDiagnostics.blockedByThreshold}</span>
                </div>
              )}

              {adaptiveTelemetryEvents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Adaptive threshold history
                    {' '}• <span className="text-gray-200">{adaptiveTelemetrySyncedCount} synced</span>
                    {' '}• <span className="text-gray-200">{adaptiveTelemetryPendingCount} pending</span>
                    {' '}• <span className="text-gray-200">remote {adaptiveTelemetryRemoteStatus}</span>
                    {' '}• <span className="text-gray-200">oldest pending {adaptiveTelemetryOldestPendingMinutes}m</span>
                  </p>
                  {adaptiveTelemetryEvents.slice(0, 5).map((event, index) => (
                    <div key={`${event.time}-${index}`} className="rounded-lg border border-cyan-900/40 bg-cyan-900/10 p-2 text-xs text-gray-300">
                      <span className="text-gray-200">{new Date(event.time).toLocaleString()}</span>
                      {' '}• <span className={event.direction === 'up' ? 'text-yellow-200' : event.direction === 'down' ? 'text-green-200' : 'text-gray-200'}>
                        {event.direction === 'up' ? 'Tighten' : event.direction === 'down' ? 'Relax' : 'Reset'}
                      </span>
                      {' '}• ${event.previousThreshold.toFixed(0)} → ${event.nextThreshold.toFixed(0)}
                      {' '}• quality {event.qualityBlocked}/{event.considered}
                      {' '}• failures {event.transportFailures}
                      {' '}• {event.remoteSynced ? 'synced' : 'pending'}
                      {' '}• {event.reason}
                    </div>
                  ))}
                </div>
              )}

              <details className="rounded-lg border border-cyan-800/40 bg-cyan-900/10 p-3">
                <summary className="cursor-pointer text-sm font-medium text-cyan-100">
                  Telemetry SQL Runbook
                </summary>
                <div className="mt-3 space-y-3 text-xs text-gray-300">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => { void copyTelemetryQuery('All Runbook Queries', adaptiveAllQueries); }}
                      className="h-7 border-cyan-500/60 text-cyan-100 hover:bg-cyan-500/20"
                    >
                      Copy All Queries
                    </Button>
                  </div>
                  <p>
                    Status hint: <span className="text-cyan-100">{telemetryRunbookHint}</span>
                  </p>
                  <p>
                    Full query guide: <span className="text-cyan-100">docs/ADAPTIVE_TELEMETRY_SQL.md</span>
                  </p>

                  {adaptiveTelemetryRemoteStatus === 'missing' && (
                    <div className="rounded border border-yellow-700/40 bg-yellow-900/10 p-2 text-yellow-100">
                      Remote telemetry table is missing. Apply migration file:
                      <div className="mt-1 font-mono text-[11px] text-yellow-50">supabase/migrations/008_create_live_auto_adaptive_threshold_events.sql</div>
                    </div>
                  )}

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-gray-200">Query 1: Recent Adaptive Events</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { void copyTelemetryQuery('Recent Adaptive Events', adaptiveQuery1); }}
                        className="h-7 border-cyan-500/60 text-cyan-100 hover:bg-cyan-500/20"
                      >
                        Copy Query
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded border border-gray-800 bg-black/40 p-2 text-[11px] text-gray-300">{adaptiveQuery1}</pre>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-gray-200">Query 6: Queue Health Check</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { void copyTelemetryQuery('Queue Health Check', adaptiveQuery6); }}
                        className="h-7 border-cyan-500/60 text-cyan-100 hover:bg-cyan-500/20"
                      >
                        Copy Query
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded border border-gray-800 bg-black/40 p-2 text-[11px] text-gray-300">{adaptiveQuery6}</pre>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-gray-200">Query 4: Adaptive Events vs Trade Outcomes (15m)</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { void copyTelemetryQuery('Adaptive Events vs Trade Outcomes', adaptiveQuery4); }}
                        className="h-7 border-cyan-500/60 text-cyan-100 hover:bg-cyan-500/20"
                      >
                        Copy Query
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded border border-gray-800 bg-black/40 p-2 text-[11px] text-gray-300">{adaptiveQuery4}</pre>
                  </div>
                </div>
              </details>

              {latestRouteMemoryDiagnostics.suppressedSamples.length > 0 ? (
                <div className="space-y-2">
                  {latestRouteMemoryDiagnostics.suppressedSamples.map((sample) => {
                    const storedRow = routeMemoryRows.find((row) => row.route_key === sample.routeKey);
                    return (
                      <div key={`suppressed-${sample.routeKey}`} className="rounded-lg border border-orange-800/40 bg-orange-900/10 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{sample.tokenPair}</span>
                            <Badge className="bg-orange-500/20 text-orange-200 border border-orange-500/40">Suppressed</Badge>
                          </div>
                          {storedRow?.cooldown_until && Date.parse(storedRow.cooldown_until) > Date.now() && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void clearRouteCooldown(sample.routeKey); }}
                              disabled={clearingRouteKey === sample.routeKey}
                              className="h-7 border-yellow-500/60 text-yellow-100 hover:bg-yellow-500/20"
                            >
                              {clearingRouteKey === sample.routeKey ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Clear Cooldown'}
                            </Button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-gray-300">{sample.buyDex} → {sample.sellDex}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          Cooldown until {sample.cooldownUntil ? new Date(sample.cooldownUntil).toLocaleString() : 'unknown'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No cooldown-suppressed routes in the latest scan.</p>
              )}

              {latestRouteMemoryDiagnostics.penalizedSamples.length > 0 && (
                <div className="space-y-2">
                  {latestRouteMemoryDiagnostics.penalizedSamples.map((sample) => (
                    <div key={`penalized-${sample.routeKey}`} className="rounded-lg border border-yellow-800/40 bg-yellow-900/10 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{sample.tokenPair}</span>
                        <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-500/40">Penalty</Badge>
                      </div>
                      <p className="mt-2 text-xs text-gray-300">{sample.buyDex} → {sample.sellDex}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Avg realized net ${sample.avgRealizedNet.toFixed(2)} • Penalty +${sample.penaltyUsd.toFixed(2)} required net
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {!leanMode && spectrumDebugEnabled && (
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-cyan-300" />
            Cycle Shadow (A→B→C→A)
            {latestCycleShadowDiagnostics && (
              <Badge className="bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
                {latestCycleShadowDiagnostics.candidatePaths} candidates / {latestCycleShadowDiagnostics.testedTriangles} tested
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!latestCycleShadowDiagnostics ? (
            <p className="text-gray-500 text-sm">Run a scan to inspect multi-hop triangle imbalance signals.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Networks analyzed: <span className="text-gray-200">{latestCycleShadowDiagnostics.networksAnalyzed}</span>
              </p>
              {latestCycleShadowDiagnostics.topCycles.length === 0 ? (
                <p className="text-sm text-gray-500">No positive triangle cycles detected in this scan window.</p>
              ) : (
                <div className="space-y-2">
                  {latestCycleShadowDiagnostics.topCycles.map((cycle, index) => (
                    <div key={`${cycle.network}-${cycle.path}-${index}`} className="rounded-lg border border-cyan-800/40 bg-cyan-900/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-white font-medium">{cycle.path}</span>
                        <Badge className="bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
                          {cycle.grossReturnBps.toFixed(2)} bps
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-300">
                        {cycle.network} • Min liquidity ${Math.round(cycle.minLiquidityUsd).toLocaleString()}
                      </p>
                      {cycle.sources.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500">Sources: {cycle.sources.join(' → ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-cyan-300" />
            Recent Executions
            {recentExecutionLogsLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentExecutionLogs.length === 0 ? (
            <p className="text-gray-500 text-sm">No execution history yet. Executed demo and live trades will appear here.</p>
          ) : (
            <div className="space-y-2">
              {recentExecutionLogs.map((log) => {
                const adaptiveSizingApplied = Boolean(log.metadata?.adaptiveSizingApplied);
                return (
                  <div key={log.id} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{log.token_pair}</span>
                        <Badge className={log.status === 'failed' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : log.status === 'submitted' ? 'bg-green-500/20 text-green-300 border border-green-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'}>
                          {log.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">{log.execution_mode}</Badge>
                        {adaptiveSizingApplied && (
                          <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-500/40">
                            Throttled {Math.round(Number(log.metadata?.adaptiveLoanFactor || 1) * 100)}%
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{new Date(log.executed_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span>{log.buy_dex} → {log.sell_dex}</span>
                      <span className="capitalize">{log.network}</span>
                      {log.actual_profit != null && (
                        <span className={log.actual_profit >= 0 ? 'text-green-300' : 'text-red-300'}>
                          Net ${log.actual_profit.toFixed(2)}
                        </span>
                      )}
                      {log.gas_cost != null && <span>Gas ${log.gas_cost.toFixed(2)}</span>}
                    </div>
                    {adaptiveSizingApplied && (
                      <p className="mt-2 text-xs text-yellow-200">
                        Adaptive sizing reduced loan from ${Number(log.metadata?.originalLoanAmount || 0).toLocaleString()} to ${Number(log.metadata?.adjustedLoanAmount || 0).toLocaleString()} due to {String(log.metadata?.adaptiveSizingReason || 'borderline pair history')}.
                      </p>
                    )}
                    {log.error_message && (
                      <p className="mt-2 text-xs text-red-300">{log.error_message}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!leanMode && (
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-yellow-300" />
              Transport Incident History
              <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-500/40">
                {transportIncidents.length} recent
              </Badge>
            </CardTitle>
            <button
              onClick={() => setTransportIncidents([])}
              className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded border border-gray-700"
            >
              Clear
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {transportIncidents.length === 0 ? (
            <p className="text-gray-500 text-sm">No transport incidents captured yet.</p>
          ) : (
            <div className="space-y-2">
              {transportIncidents.map((incident, index) => (
                <div key={`${incident.time}-${incident.source}-${index}`} className="rounded-lg border border-yellow-800/40 bg-yellow-900/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-200 text-xs">{incident.time}</span>
                      <Badge className="bg-yellow-500/20 text-yellow-100 border border-yellow-500/50">{incident.source}</Badge>
                    </div>
                    <span className="text-xs text-gray-300">streak {incident.streak} • backoff {Math.ceil(incident.backoffMs / 1000)}s</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-300">{incident.reason}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Scanner Output Log */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-[#00F0FF]" />
              Scanner Output Log
              {continuousScanActive && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
            </CardTitle>
            <button onClick={() => setScanLog([])} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded border border-gray-700">
              Clear
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="sticky top-0 z-10 mb-3 -mx-3 border-b border-gray-800 bg-gray-900/95 px-3 py-2 backdrop-blur flex flex-wrap gap-2">
            {!continuousScanActive ? (
              <Button
                onClick={startContinuousScan}
                disabled={tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0}
                className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-bold"
              >
                <Play className="h-4 w-4 mr-2" /> Start Scanner
              </Button>
            ) : (
              <Button
                onClick={stopContinuousScan}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                <Square className="h-4 w-4 mr-2" /> Stop Scanner
              </Button>
            )}
            {tradingState.mode === 'manual' && (
              <Button
                onClick={scanForOpportunities}
                variant="outline"
                className="border-gray-600 text-gray-300"
                disabled={tradingState.status === 'scanning' || (tradingState.executionMode === 'live' && liveReadinessBlockingReasons.length > 0)}
              >
                {tradingState.status === 'scanning' ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" /> Single Scan</>
                )}
              </Button>
            )}
          </div>
          <div className="bg-black rounded-lg p-3 h-48 md:h-64 lg:h-72 overflow-y-auto font-mono text-xs space-y-1">
            {scanLog.length === 0 ? (
              <p className="text-gray-600">Waiting for scan to start...</p>
            ) : (
              scanLog.map((entry, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-600 shrink-0">{entry.time}</span>
                  <span className={
                    entry.type === 'success' ? 'text-green-400' :
                    entry.type === 'error'   ? 'text-red-400' :
                    entry.type === 'warn'    ? 'text-yellow-400' :
                    'text-gray-300'
                  }>{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
