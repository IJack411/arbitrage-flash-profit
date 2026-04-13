import { supabase } from '@/lib/supabase';

export type TradeExecutionMode = 'demo' | 'live';

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
  mode: TradeExecutionMode;
  account?: string | null;
  contractAddress?: string;
  maxSlippagePercent: number;
}

export interface ExecuteTradeResult {
  success: boolean;
  mode: TradeExecutionMode;
  status: 'simulated' | 'submitted';
  actualProfit: number;
  gasCost: number;
  txHash: string;
  bundleHash?: string;
  message: string;
}

const LIVE_SUPPORTED_NETWORKS = new Set(['ethereum']);
const KNOWN_DEV_CONTRACT_ADDRESSES = new Set([
  '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512', // common local hardhat deploy address
  '0x5fbdb2315678afecb367f032d93f642f64180aa3', // common local hardhat deploy address
]);

const getEnvNumber = (key: string, fallback: number): number => {
  const raw = import.meta.env[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const LIVE_MAX_SLIPPAGE_PERCENT = getEnvNumber('LIVE_MAX_SLIPPAGE_PERCENT', 2.0);
const LIVE_MAX_LOAN_USD = getEnvNumber('LIVE_MAX_LOAN_USD', 25000);
const LIVE_MIN_NET_PROFIT_USD = getEnvNumber('LIVE_MIN_NET_PROFIT_USD', 25);
const LIVE_MAX_GAS_TO_PROFIT_RATIO = getEnvNumber('LIVE_MAX_GAS_TO_PROFIT_RATIO', 0.4);

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

const buildSyntheticTxHash = (prefix: string, seed: string): string => {
  const normalized = `${prefix}-${seed}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
  return `${prefix}-${normalized}`;
};

const persistExecutionLog = async (
  trade: ExecutableTrade,
  mode: TradeExecutionMode,
  payload: {
    status: 'simulated' | 'submitted' | 'failed';
    actualProfit?: number;
    txHash?: string;
    bundleHash?: string;
    errorMessage?: string;
    rawResponse?: unknown;
    metadata?: Record<string, unknown>;
  },
) => {
  const executionMode = mode === 'demo' ? 'simulation' : 'live';

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
      execution_mode: executionMode,
      error_message: payload.errorMessage ?? null,
      failure_reason: payload.status === 'failed' ? payload.errorMessage ?? 'Execution failed' : null,
      executed_at: new Date().toISOString(),
      metadata: {
        confidence: trade.confidence,
        ...payload.metadata,
      },
      raw_response: payload.rawResponse ?? null,
    });
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
    return `Live execution is currently wired for Ethereum mainnet only. ${trade.network} trades can still run in demo mode.`;
  }
  return null;
};

export const normalizeOpportunityToTrade = (
  opportunity: OpportunityLike,
  fallbackLoanAmount: number,
): ExecutableTrade => {
  return {
    id: opportunity.id || `trade-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tokenPair: opportunity.tokenPair || opportunity.token_pair || 'WETH/USDC',
    buyDex: opportunity.buyDex || opportunity.buy_dex || 'Uniswap V3',
    sellDex: opportunity.sellDex || opportunity.sell_dex || 'SushiSwap',
    network: opportunity.network || 'ethereum',
    loanAmount: opportunity.executableLoanAmount || opportunity.loanAmount || opportunity.loan_amount || fallbackLoanAmount,
    expectedProfit: opportunity.netProfit || opportunity.estimated_profit || opportunity.expectedProfit || 0,
    gasCost: opportunity.gasCost || opportunity.gas_cost || 0,
    confidence: opportunity.confidenceScore || opportunity.confidence_score || opportunity.confidence || 0,
    executionPayload: opportunity.executionPayload || opportunity.execution_payload,
  };
};

export const executeArbitrageTrade = async ({
  trade,
  mode,
  account,
  contractAddress,
  maxSlippagePercent,
}: ExecuteTradeRequest): Promise<ExecuteTradeResult> => {
  const routeNetwork = trade.executionPayload?.network || trade.network;

  if (mode === 'live') {
    const blocker = getLiveExecutionBlocker({ network: routeNetwork }, account, contractAddress);
    if (blocker) {
      await persistExecutionLog(trade, mode, {
        status: 'failed',
        errorMessage: blocker,
        metadata: { blocked: true },
      });
      throw new Error(blocker);
    }

    if (maxSlippagePercent > LIVE_MAX_SLIPPAGE_PERCENT) {
      const riskBlocker = `Live trade blocked: max slippage is above ${LIVE_MAX_SLIPPAGE_PERCENT.toFixed(2)}%. Use a tighter slippage cap for production.`;
      await persistExecutionLog(trade, mode, {
        status: 'failed',
        errorMessage: riskBlocker,
        metadata: { blocked: true, reason: 'slippage_cap' },
      });
      throw new Error(riskBlocker);
    }

    if (trade.loanAmount > LIVE_MAX_LOAN_USD) {
      const riskBlocker = `Live trade blocked: loan amount exceeds $${Math.round(LIVE_MAX_LOAN_USD).toLocaleString()} safety cap. Increase only after stable live results.`;
      await persistExecutionLog(trade, mode, {
        status: 'failed',
        errorMessage: riskBlocker,
        metadata: { blocked: true, reason: 'loan_cap' },
      });
      throw new Error(riskBlocker);
    }

    if (trade.expectedProfit < LIVE_MIN_NET_PROFIT_USD) {
      const riskBlocker = `Live trade blocked: expected net profit is below $${LIVE_MIN_NET_PROFIT_USD.toFixed(2)} minimum live threshold.`;
      await persistExecutionLog(trade, mode, {
        status: 'failed',
        errorMessage: riskBlocker,
        metadata: { blocked: true, reason: 'profit_floor' },
      });
      throw new Error(riskBlocker);
    }

    if (trade.gasCost > trade.expectedProfit * LIVE_MAX_GAS_TO_PROFIT_RATIO) {
      const riskBlocker = `Live trade blocked: gas cost is too high relative to expected net profit (ratio cap ${LIVE_MAX_GAS_TO_PROFIT_RATIO}).`;
      await persistExecutionLog(trade, mode, {
        status: 'failed',
        errorMessage: riskBlocker,
        metadata: { blocked: true, reason: 'gas_efficiency' },
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
      const txHash = typeof data?.txHash === 'string' && data.txHash.length > 0
        ? data.txHash
        : typeof data?.bundleHash === 'string' && data.bundleHash.length > 0
          ? data.bundleHash
          : buildSyntheticTxHash('live', trade.id);

      const result: ExecuteTradeResult = {
        success: true,
        mode,
        status: 'submitted',
        actualProfit,
        gasCost: trade.gasCost,
        txHash,
        bundleHash: typeof data?.bundleHash === 'string' ? data.bundleHash : undefined,
        message: 'Live trade submitted to the execution backend.',
      };

      await persistExecutionLog(trade, mode, {
        status: 'submitted',
        actualProfit,
        txHash: result.txHash,
        bundleHash: result.bundleHash,
        rawResponse: data,
        metadata: { liveSubmission: true },
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Live execution failed';
      await persistExecutionLog(trade, mode, {
        status: 'failed',
        errorMessage,
        metadata: { liveSubmission: true },
      });
      throw error instanceof Error ? error : new Error(errorMessage);
    }
  }

  const actualProfit = roundToCents(trade.expectedProfit);
  const txHash = buildSyntheticTxHash('demo', trade.id);
  const result: ExecuteTradeResult = {
    success: true,
    mode,
    status: 'simulated',
    actualProfit,
    gasCost: trade.gasCost,
    txHash,
    message: 'Demo execution recorded against live market data.',
  };

  await persistExecutionLog(trade, mode, {
    status: 'simulated',
    actualProfit,
    txHash,
    metadata: {
      simulatedFromRealOpportunity: true,
      maxSlippagePercent,
    },
  });

  return result;
};