export interface ArbitrageOpportunity {
  token_pair?: string;
  buy_dex?: string;
  sell_dex?: string;
  buy_price?: string | number;
  sell_price?: string | number;
  profit_percentage?: string | number;
  estimated_profit?: string | number;
  loan_amount?: string | number;
  gas_cost?: string | number;
  confidence_score?: number;
  created_at?: string | number | Date;
  id: string;
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent?: number;
  profitPercentage?: number;
  profitUSD: number;
  gasCost: number;
  netProfit: number;
  loanAmount: number;
  timestamp: number;
  status: 'active' | 'watchlist' | 'executed' | 'expired';
  network?: string;
  confidenceScore?: number;
  confidenceTier?: 'high' | 'medium' | 'low';
  liquidity?: number;
  estimatedProfit?: number;
  spread?: string | number;
  executableLoanAmount?: number;
  grossProfit?: number;
  distanceToExecutableUsd?: number;
  estimatedSlippageBps?: number;
  buyImpactBps?: number;
  sellImpactBps?: number;
  routePenaltyBps?: number;
}


export interface Transaction {
  id: string;
  tokenPair: string;
  dexPair: string;
  entryPrice: number;
  exitPrice: number;
  profitUSD: number;
  gasCost: number;
  netProfit: number;
  executionTime: number;
  timestamp: number;
  txHash: string;
  status: 'success' | 'failed' | 'pending';
}

export interface PerformanceMetrics {
  totalProfit: number;
  totalTrades: number;
  successRate: number;
  avgProfit: number;
  totalGasCost: number;
  volume24h: number;
}

export interface DEX {
  name: string;
  logo: string;
  enabled: boolean;
}
