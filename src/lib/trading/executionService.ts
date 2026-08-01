import { supabase } from '@/lib/supabase';

/**
 * One swap leg of a multi-hop arbitrage path. Field names, order, and types
 * mirror the on-chain Solidity struct
 * `FlashLoanArbitrage.Hop { address router; address tokenOut; bool isV3; uint24 fee; uint256 amountOutMin; }`
 * and the Rust `flashlight::Hop`. Phase 6 N-hop representation.
 */
export interface CanonicalHop {
  router: string;
  tokenOut: string;
  isV3: boolean;
  fee: number;
  amountOutMin: string;
}

export interface CanonicalExecutionPayload {
  version: 'v1';
  network: string;
  contractCall: {
    method: 'executeArbitrage';
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
    /**
     * Phase 6 (optional): N-hop route mirroring the on-chain `Hop[]` and the Rust
     * encoder. When present it is the authoritative executable path; the 2-hop
     * fields above map to a 2-element `hops[]`. Execution remains disabled.
     */
    hops?: CanonicalHop[];
  };
  metadata?: Record<string, unknown>;
}

export interface ExecutableTrade {
  id: string;
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  network: string;
  loanAmount: number;
  expectedProfit: number;
  gasCost: number;
  confidence: number;
  executionPayload?: CanonicalExecutionPayload;
}

interface OpportunityLike {
  id?: string;
  tokenPair?: string;
  token_pair?: string;
  buyDex?: string;
  buy_dex?: string;
  sellDex?: string;
  sell_dex?: string;
  network?: string;
  loanAmount?: number;
  loan_amount?: number;
  executableLoanAmount?: number;
  netProfit?: number;
  estimated_profit?: number;
  expectedProfit?: number;
  gasCost?: number;
  gas_cost?: number;
  confidenceScore?: number;
  confidence_score?: number;
  confidence?: number;
  executionPayload?: CanonicalExecutionPayload;
  execution_payload?: CanonicalExecutionPayload;
}

interface ExecuteTradeRequest {
  trade: ExecutableTrade;
  account?: string | null;
  contractAddress?: string;
  maxSlippagePercent: number;
  executionMetadata?: Record<string, unknown>;
}

export interface ExecuteTradeResult {
  success: boolean;
  status: 'submitted';
  actualProfit: number;
  gasCost: number;
  txHash: string;
  bundleHash?: string;
  message: string;
}

const LIVE_SUPPORTED_NETWORKS = new Set(['ethereum', 'base', 'arbitrum']);
const KNOWN_DEV_CONTRACT_ADDRESSES = new Set([
  '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512', // common local hardhat deploy address
  '0x5fbdb2315678afecb367f032d93f642f64180aa3', // common local hardhat deploy address
]);

const getEnvNumber = (key: string, fallback: number): number => {
  const raw = import.meta.env[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const LIVE_MAX_SLIPPAGE_PERCENT = getEnvNumber('LIVE_MAX_SLIPPAGE_PERCENT', 3.0);
const LIVE_MAX_LOAN_USD = getEnvNumber('LIVE_MAX_LOAN_USD', 25000);
const LIVE_MIN_NET_PROFIT_USD = getEnvNumber('LIVE_MIN_NET_PROFIT_USD', 3);
const LIVE_MAX_GAS_TO_PROFIT_RATIO = getEnvNumber('LIVE_MAX_GAS_TO_PROFIT_RATIO', 0.6);
const LIVE_PROFIT_BUFFER_FRACTION = Math.max(0, Math.min(0.8, getEnvNumber('LIVE_PROFIT_BUFFER_PERCENT', 15) / 100));
const LIVE_GAS_BUFFER_FRACTION = Math.max(0, Math.min(1, getEnvNumber('LIVE_GAS_BUFFER_PERCENT', 20) / 100));
const LIVE_SLIPPAGE_BUFFER_PERCENT = Math.max(0, getEnvNumber('LIVE_SLIPPAGE_BUFFER_PERCENT', 0));
const LIVE_MIN_BUFFERED_NET_USD = getEnvNumber('LIVE_MIN_BUFFERED_NET_USD', 2);
const LIVE_CIRCUIT_BREAKER_ENABLED = String(import.meta.env.VITE_LIVE_CIRCUIT_BREAKER_ENABLED || 'true').toLowerCase() !== 'false';
const LIVE_CIRCUIT_BREAKER_CONSECUTIVE_LOSSES = Math.max(1, Math.round(getEnvNumber('LIVE_CIRCUIT_BREAKER_CONSECUTIVE_LOSSES', 3)));
const LIVE_CIRCUIT_BREAKER_DAILY_LOSS_USD = Math.max(1, getEnvNumber('LIVE_CIRCUIT_BREAKER_DAILY_LOSS_USD', 250));
const LIVE_CIRCUIT_BREAKER_COOLDOWN_MINUTES = Math.max(5, Math.round(getEnvNumber('LIVE_CIRCUIT_BREAKER_COOLDOWN_MINUTES', 60)));

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

const ROUTE_MEMORY_COOLDOWN_MS = 10 * 60 * 1000;

const buildRouteMemoryKey = (trade: ExecutableTrade): string => {
  const network = String(trade.network || 'unknown').toLowerCase();
  const tokenPair = String(trade.tokenPair || 'unknown').toLowerCase();
  const [dexA, dexB] = [String(trade.buyDex || 'unknown').toLowerCase(), String(trade.sellDex || 'unknown').toLowerCase()]
    .sort((a, b) => a.localeCompare(b));
  return `${network}|${tokenPair}|${dexA}|${dexB}`;
};

const persistRouteMemory = async (
  trade: ExecutableTrade,
  payload: {
    status: 'submitted' | 'failed';
    actualProfit?: number;
    errorMessage?: string;
  },
) => {
  const routeKey = buildRouteMemoryKey(trade);
  const normalizedDexPair = [trade.buyDex, trade.sellDex]
    .map((value) => String(value || 'unknown').toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .join('|');

  const realizedNet = payload.status === 'failed'
    ? -Math.max(0, trade.gasCost || 0)
    : Number.isFinite(Number(payload.actualProfit))
      ? Number(payload.actualProfit)
      : Number(trade.expectedProfit || 0);

  const wasSuccessful = payload.status !== 'failed';

  try {
    const { data: existingRows, error: fetchError } = await supabase
      .from('route_memory')
      .select('id,total_executions,successful_executions,failed_executions,cumulative_realized_net')
      .eq('route_key', routeKey)
      .limit(1);

    if (fetchError) throw fetchError;

    const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
    const totalExecutions = Number(existing?.total_executions ?? 0) + 1;
    const successfulExecutions = Number(existing?.successful_executions ?? 0) + (wasSuccessful ? 1 : 0);
    const failedExecutions = Number(existing?.failed_executions ?? 0) + (wasSuccessful ? 0 : 1);
    const cumulativeRealizedNet = Number(existing?.cumulative_realized_net ?? 0) + realizedNet;
    const avgRealizedNet = totalExecutions > 0 ? cumulativeRealizedNet / totalExecutions : 0;
    const cooldownUntil = realizedNet < 0
      ? new Date(Date.now() + ROUTE_MEMORY_COOLDOWN_MS).toISOString()
      : null;

    const upsertPayload = {
      id: existing?.id,
      route_key: routeKey,
      network: trade.network,
      token_pair: trade.tokenPair,
      buy_dex: trade.buyDex,
      sell_dex: trade.sellDex,
      normalized_dex_pair: normalizedDexPair,
      total_executions: totalExecutions,
      successful_executions: successfulExecutions,
      failed_executions: failedExecutions,
      cumulative_realized_net: cumulativeRealizedNet,
      avg_realized_net: avgRealizedNet,
      last_realized_net: realizedNet,
      cooldown_until: cooldownUntil,
      last_executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        lastStatus: payload.status,
        lastError: payload.errorMessage ?? null,
      },
    };

    const { error: upsertError } = await supabase
      .from('route_memory')
      .upsert(upsertPayload, { onConflict: 'route_key' });

    if (upsertError) throw upsertError;
  } catch (error) {
    console.warn('Failed to persist route memory', error);
  }
};

interface CircuitBreakerState {
  id?: string;
  user_id: string;
  is_tripped: boolean;
  consecutive_losses: number;
  daily_loss: number;
  daily_trades: number;
  daily_successful_trades: number;
  daily_failed_trades: number;
  last_reset_date: string;
  tripped_at?: string | null;
  trip_reason?: string | null;
  trip_type?: string | null;
  cooldown_until?: string | null;
  cooldown_minutes?: number;
  total_trips?: number;
  last_trip_at?: string | null;
  last_trip_reason?: string | null;
}

const getTodayIsoDate = (): string => new Date().toISOString().slice(0, 10);

const getOrCreateCircuitBreakerState = async (): Promise<CircuitBreakerState | null> => {
  try {
    const { data, error } = await supabase
      .from('circuit_breaker_state')
      .select('*')
      .eq('user_id', 'default')
      .limit(1);

    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) {
      return data[0] as CircuitBreakerState;
    }

    const baseState: CircuitBreakerState = {
      user_id: 'default',
      is_tripped: false,
      consecutive_losses: 0,
      daily_loss: 0,
      daily_trades: 0,
      daily_successful_trades: 0,
      daily_failed_trades: 0,
      last_reset_date: getTodayIsoDate(),
      cooldown_minutes: LIVE_CIRCUIT_BREAKER_COOLDOWN_MINUTES,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('circuit_breaker_state')
      .upsert(baseState, { onConflict: 'user_id' })
      .select('*')
      .limit(1);

    if (insertError) throw insertError;
    return Array.isArray(inserted) && inserted.length > 0
      ? inserted[0] as CircuitBreakerState
      : baseState;
  } catch (error) {
    console.warn('Failed to read circuit breaker state', error);
    return null;
  }
};

const persistCircuitBreakerState = async (state: CircuitBreakerState) => {
  try {
    await supabase
      .from('circuit_breaker_state')
      .upsert({
        ...state,
        cooldown_minutes: state.cooldown_minutes ?? LIVE_CIRCUIT_BREAKER_COOLDOWN_MINUTES,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  } catch (error) {
    console.warn('Failed to persist circuit breaker state', error);
  }
};

const enforceLiveCircuitBreaker = async (): Promise<string | null> => {
  if (!LIVE_CIRCUIT_BREAKER_ENABLED) return null;

  const state = await getOrCreateCircuitBreakerState();
  if (!state) return null;

  const today = getTodayIsoDate();
  if (state.last_reset_date !== today) {
    state.last_reset_date = today;
    state.daily_loss = 0;
    state.daily_trades = 0;
    state.daily_successful_trades = 0;
    state.daily_failed_trades = 0;
    state.consecutive_losses = 0;
  }

  if (state.is_tripped) {
    const cooldownUntilTs = state.cooldown_until ? Date.parse(state.cooldown_until) : NaN;
    if (Number.isFinite(cooldownUntilTs) && cooldownUntilTs > Date.now()) {
      const minsLeft = Math.max(1, Math.ceil((cooldownUntilTs - Date.now()) / 60000));
      await persistCircuitBreakerState(state);
      return `Live trade blocked: circuit breaker is active (${minsLeft}m remaining). Reason: ${state.trip_reason || 'safety threshold reached'}.`;
    }

    state.is_tripped = false;
    state.tripped_at = null;
    state.trip_reason = null;
    state.trip_type = null;
    state.cooldown_until = null;
    state.consecutive_losses = 0;
  }

  await persistCircuitBreakerState(state);
  return null;
};

const updateLiveCircuitBreakerAfterExecution = async (
  payload: {
    status: 'submitted' | 'failed';
    actualProfit?: number;
  },
  fallbackGasCost: number,
) => {
  if (!LIVE_CIRCUIT_BREAKER_ENABLED) return;

  const state = await getOrCreateCircuitBreakerState();
  if (!state) return;

  const today = getTodayIsoDate();
  if (state.last_reset_date !== today) {
    state.last_reset_date = today;
    state.daily_loss = 0;
    state.daily_trades = 0;
    state.daily_successful_trades = 0;
    state.daily_failed_trades = 0;
    state.consecutive_losses = 0;
  }

  state.daily_trades = Number(state.daily_trades || 0) + 1;
  const realizedNet = Number.isFinite(Number(payload.actualProfit))
    ? Number(payload.actualProfit)
    : -Math.max(0, fallbackGasCost || 0);
  const isLoss = payload.status === 'failed' || realizedNet < 0;

  if (isLoss) {
    state.consecutive_losses = Number(state.consecutive_losses || 0) + 1;
    state.daily_failed_trades = Number(state.daily_failed_trades || 0) + 1;
    state.daily_loss = Number(state.daily_loss || 0) + Math.abs(realizedNet);
  } else {
    state.consecutive_losses = 0;
    state.daily_successful_trades = Number(state.daily_successful_trades || 0) + 1;
  }

  const shouldTripByConsecutiveLosses = state.consecutive_losses >= LIVE_CIRCUIT_BREAKER_CONSECUTIVE_LOSSES;
  const shouldTripByDailyLoss = Number(state.daily_loss || 0) >= LIVE_CIRCUIT_BREAKER_DAILY_LOSS_USD;

  if (shouldTripByConsecutiveLosses || shouldTripByDailyLoss) {
    state.is_tripped = true;
    state.tripped_at = new Date().toISOString();
    state.trip_type = shouldTripByConsecutiveLosses ? 'consecutive_losses' : 'daily_loss';
    state.trip_reason = shouldTripByConsecutiveLosses
      ? `Reached ${state.consecutive_losses} consecutive losses`
      : `Daily loss reached $${Number(state.daily_loss || 0).toFixed(2)}`;
    state.cooldown_minutes = LIVE_CIRCUIT_BREAKER_COOLDOWN_MINUTES;
    state.cooldown_until = new Date(Date.now() + LIVE_CIRCUIT_BREAKER_COOLDOWN_MINUTES * 60 * 1000).toISOString();
    state.total_trips = Number(state.total_trips || 0) + 1;
    state.last_trip_at = state.tripped_at;
    state.last_trip_reason = state.trip_reason;
  }

  await persistCircuitBreakerState(state);
};

const persistExecutionLog = async (
  trade: ExecutableTrade,
  payload: {
    status: 'submitted' | 'failed';
    actualProfit?: number;
    txHash?: string;
    bundleHash?: string;
    errorMessage?: string;
    rawResponse?: unknown;
    metadata?: Record<string, unknown>;
  },
) => {
  try {
    await supabase.from('trade_execution_logs').insert({
      user_id: 'default',
      opportunity_id: trade.id,
      token_pair: trade.tokenPair,
      buy_dex: trade.buyDex,
      sell_dex: trade.sellDex,
      network: trade.network,
      loan_amount: trade.loanAmount,
      estimated_profit: trade.expectedProfit,
      expected_profit: trade.expectedProfit,
      actual_profit: payload.actualProfit ?? null,
      gas_cost: trade.gasCost,
      slippage_tolerance: null,
      tx_hash: payload.txHash ?? null,
      flashbots_bundle_hash: payload.bundleHash ?? null,
      status: payload.status,
      execution_mode: 'live',
      error_message: payload.errorMessage ?? null,
      failure_reason: payload.status === 'failed' ? payload.errorMessage ?? 'Execution failed' : null,
      executed_at: new Date().toISOString(),
      metadata: {
        confidence: trade.confidence,
        ...payload.metadata,
      },
      raw_response: payload.rawResponse ?? null,
    });

    await persistRouteMemory(trade, {
      status: payload.status,
      actualProfit: payload.actualProfit,
      errorMessage: payload.errorMessage,
    });

    await updateLiveCircuitBreakerAfterExecution(
      {
        status: payload.status,
        actualProfit: payload.actualProfit,
      },
      trade.gasCost,
    );
  } catch (error) {
    console.warn('Failed to persist trade execution log', error);
  }
};

export const supportsLiveExecution = (network: string): boolean => {
  return LIVE_SUPPORTED_NETWORKS.has((network || '').toLowerCase());
};

export const getLiveExecutionBlocker = (
  trade: Pick<ExecutableTrade, 'network'>,
  account?: string | null,
  contractAddress?: string,
): string | null => {
  const isLiveTradingArmed = String(import.meta.env.VITE_LIVE_TRADING_ENABLED || '').toLowerCase() === 'true';

  if (!isLiveTradingArmed) {
    return 'Live trading is disarmed. Set VITE_LIVE_TRADING_ENABLED=true after passing preflight checks.';
  }

  if (!account) return 'Connect a wallet before sending live trades.';
  if (!contractAddress) return 'Configure your arbitrage contract address before enabling live execution.';
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) return 'Configured contract address is not a valid EVM address.';
  if (KNOWN_DEV_CONTRACT_ADDRESSES.has(contractAddress.toLowerCase())) {
    return 'Configured contract address looks like a local test deployment. Set your real mainnet contract address before live trading.';
  }
  if (!supportsLiveExecution(trade.network)) {
    return `Live execution is currently wired for Ethereum mainnet only. ${trade.network} is not yet supported for live trades.`;
  }
  return null;
};

export const getLiveCircuitBreakerStatus = async (): Promise<{
  active: boolean;
  reason?: string;
  cooldownUntil?: string;
  minutesRemaining?: number;
}> => {
  if (!LIVE_CIRCUIT_BREAKER_ENABLED) {
    return { active: false };
  }

  const state = await getOrCreateCircuitBreakerState();
  if (!state || !state.is_tripped) {
    return { active: false };
  }

  const cooldownUntilTs = state.cooldown_until ? Date.parse(state.cooldown_until) : NaN;
  if (!Number.isFinite(cooldownUntilTs) || cooldownUntilTs <= Date.now()) {
    return { active: false };
  }

  const minutesRemaining = Math.max(1, Math.ceil((cooldownUntilTs - Date.now()) / 60000));
  return {
    active: true,
    reason: state.trip_reason || 'safety threshold reached',
    cooldownUntil: state.cooldown_until || undefined,
    minutesRemaining,
  };
};

export const resetLiveCircuitBreaker = async (): Promise<void> => {
  const state = await getOrCreateCircuitBreakerState();
  if (!state) return;

  state.is_tripped = false;
  state.tripped_at = null;
  state.trip_reason = null;
  state.trip_type = null;
  state.cooldown_until = null;
  state.consecutive_losses = 0;
  await persistCircuitBreakerState(state);
};

export const normalizeOpportunityToTrade = (
  opportunity: OpportunityLike,
  fallbackLoanAmount: number,
): ExecutableTrade => {
  const loanAmount = opportunity.executableLoanAmount || opportunity.loanAmount || opportunity.loan_amount || fallbackLoanAmount;
  let expectedProfit = opportunity.netProfit || opportunity.estimated_profit || opportunity.expectedProfit || 0;

  // Sanity cap: profit cannot exceed loan amount (>100% return is a data error)
  if (Math.abs(expectedProfit) > loanAmount) {
    console.warn(`[normalizeOpportunityToTrade] Profit $${expectedProfit} exceeds loan $${loanAmount} — clamping to 0 (data error)`);
    expectedProfit = 0;
  }

  return {
    id: opportunity.id || `trade-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tokenPair: opportunity.tokenPair || opportunity.token_pair || 'WETH/USDC',
    buyDex: opportunity.buyDex || opportunity.buy_dex || 'Uniswap V3',
    sellDex: opportunity.sellDex || opportunity.sell_dex || 'SushiSwap',
    network: opportunity.network || 'ethereum',
    loanAmount,
    expectedProfit,
    gasCost: opportunity.gasCost || opportunity.gas_cost || 0,
    confidence: opportunity.confidenceScore || opportunity.confidence_score || opportunity.confidence || 0,
    executionPayload: opportunity.executionPayload || opportunity.execution_payload,
  };
};

export const executeArbitrageTrade = async ({
  trade,
  account,
  contractAddress,
  maxSlippagePercent,
  executionMetadata,
}: ExecuteTradeRequest): Promise<ExecuteTradeResult> => {
  const routeNetwork = trade.executionPayload?.network || trade.network;
  const mergeExecutionMetadata = (metadata?: Record<string, unknown>) => ({
    ...(executionMetadata ?? {}),
    ...(metadata ?? {}),
  });

  const circuitBreakerBlocker = await enforceLiveCircuitBreaker();
  if (circuitBreakerBlocker) {
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage: circuitBreakerBlocker,
      metadata: mergeExecutionMetadata({ blocked: true, reason: 'circuit_breaker_active' }),
    });
    throw new Error(circuitBreakerBlocker);
  }

  const blocker = getLiveExecutionBlocker({ network: routeNetwork }, account, contractAddress);
  if (blocker) {
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage: blocker,
      metadata: mergeExecutionMetadata({ blocked: true }),
    });
    throw new Error(blocker);
  }

  const effectiveMaxSlippagePercent = Math.max(0.1, LIVE_MAX_SLIPPAGE_PERCENT - LIVE_SLIPPAGE_BUFFER_PERCENT);
  if (maxSlippagePercent > effectiveMaxSlippagePercent) {
    const riskBlocker = `Live trade blocked: max slippage is above buffered cap ${effectiveMaxSlippagePercent.toFixed(2)}% (base ${LIVE_MAX_SLIPPAGE_PERCENT.toFixed(2)}%, buffer ${LIVE_SLIPPAGE_BUFFER_PERCENT.toFixed(2)}%).`;
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage: riskBlocker,
      metadata: mergeExecutionMetadata({
        blocked: true,
        reason: 'slippage_cap',
        slippageCapPercent: LIVE_MAX_SLIPPAGE_PERCENT,
        slippageBufferPercent: LIVE_SLIPPAGE_BUFFER_PERCENT,
        effectiveMaxSlippagePercent,
      }),
    });
    throw new Error(riskBlocker);
  }

  if (trade.loanAmount > LIVE_MAX_LOAN_USD) {
    const riskBlocker = `Live trade blocked: loan amount exceeds $${Math.round(LIVE_MAX_LOAN_USD).toLocaleString()} safety cap. Increase only after stable live results.`;
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage: riskBlocker,
      metadata: mergeExecutionMetadata({ blocked: true, reason: 'loan_cap' }),
    });
    throw new Error(riskBlocker);
  }

  if (trade.expectedProfit < LIVE_MIN_NET_PROFIT_USD) {
    const riskBlocker = `Live trade blocked: expected net profit is below $${LIVE_MIN_NET_PROFIT_USD.toFixed(2)} minimum live threshold.`;
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage: riskBlocker,
      metadata: mergeExecutionMetadata({ blocked: true, reason: 'profit_floor' }),
    });
    throw new Error(riskBlocker);
  }

  const bufferedExpectedNet = (trade.expectedProfit * (1 - LIVE_PROFIT_BUFFER_FRACTION))
    - (trade.gasCost * LIVE_GAS_BUFFER_FRACTION);
  if (bufferedExpectedNet < LIVE_MIN_BUFFERED_NET_USD) {
    const riskBlocker = `Live trade blocked: buffered net profit $${bufferedExpectedNet.toFixed(2)} is below minimum $${LIVE_MIN_BUFFERED_NET_USD.toFixed(2)} (profit buffer ${(LIVE_PROFIT_BUFFER_FRACTION * 100).toFixed(0)}%, gas buffer ${(LIVE_GAS_BUFFER_FRACTION * 100).toFixed(0)}%).`;
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage: riskBlocker,
      metadata: mergeExecutionMetadata({
        blocked: true,
        reason: 'buffered_net_floor',
        bufferedExpectedNet,
        minBufferedNetUsd: LIVE_MIN_BUFFERED_NET_USD,
        profitBufferFraction: LIVE_PROFIT_BUFFER_FRACTION,
        gasBufferFraction: LIVE_GAS_BUFFER_FRACTION,
      }),
    });
    throw new Error(riskBlocker);
  }

  if (trade.gasCost > trade.expectedProfit * LIVE_MAX_GAS_TO_PROFIT_RATIO) {
    const riskBlocker = `Live trade blocked: gas cost is too high relative to expected net profit (ratio cap ${LIVE_MAX_GAS_TO_PROFIT_RATIO}).`;
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage: riskBlocker,
      metadata: mergeExecutionMetadata({ blocked: true, reason: 'gas_efficiency' }),
    });
    throw new Error(riskBlocker);
  }

  try {
    const { data, error } = await supabase.functions.invoke('flashbots-executor', {
      body: {
        action: 'execute-arbitrage',
        params: {
          opportunity: {
            tokenPair: trade.tokenPair,
            buyDex: trade.buyDex,
            sellDex: trade.sellDex,
            network: routeNetwork,
            loanAmount: trade.loanAmount,
            expectedProfit: trade.expectedProfit,
            executionPayload: trade.executionPayload ?? null,
          },
          walletAddress: account,
          contractAddress,
          maxSlippage: maxSlippagePercent,
        },
      },
    });

    if (error) throw error;

    const actualProfit = roundToCents(Number(data?.actualProfit ?? trade.expectedProfit));
    const txHashCandidate = typeof data?.txHash === 'string' && data.txHash.length > 0
      ? data.txHash
      : typeof data?.bundleHash === 'string' && data.bundleHash.length > 0
        ? data.bundleHash
        : null;
    if (!txHashCandidate) {
      throw new Error('flashbots-executor returned no txHash or bundleHash; refusing to record a live submission with a fabricated hash.');
    }

    const result: ExecuteTradeResult = {
      success: true,
      status: 'submitted',
      actualProfit,
      gasCost: trade.gasCost,
      txHash: txHashCandidate,
      bundleHash: typeof data?.bundleHash === 'string' ? data.bundleHash : undefined,
      message: 'Live trade submitted to the execution backend.',
    };

    await persistExecutionLog(trade, {
      status: 'submitted',
      actualProfit,
      txHash: result.txHash,
      bundleHash: result.bundleHash,
      rawResponse: data,
      metadata: mergeExecutionMetadata({ liveSubmission: true }),
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Live execution failed';
    await persistExecutionLog(trade, {
      status: 'failed',
      errorMessage,
      metadata: mergeExecutionMetadata({ liveSubmission: true }),
    });
    throw error instanceof Error ? error : new Error(errorMessage);
  }
};