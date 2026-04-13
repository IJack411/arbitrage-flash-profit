export type ConditionType = 
  | 'price_threshold' 
  | 'profit_minimum' 
  | 'gas_limit' 
  | 'time_window' 
  | 'volume_threshold'
  | 'liquidity_check'
  | 'spread_minimum'
  | 'slippage_limit';

export type ConditionOperator = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';

export interface ConditionBlock {
  id: string;
  type: ConditionType;
  operator: ConditionOperator;
  value: number;
  value2?: number;
  enabled: boolean;
  label: string;
}

export interface EntryRule {
  id: string;
  conditions: ConditionBlock[];
  logic: 'AND' | 'OR';
}

export interface ExitRule {
  id: string;
  conditions: ConditionBlock[];
  logic: 'AND' | 'OR';
}

export interface RiskParameters {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxConcurrentTrades: number;
  cooldownPeriod: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  entryRules: EntryRule[];
  exitRules: ExitRule[];
  riskParameters: RiskParameters;
  networks: string[];
  tokens: string[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  author?: string;
  version: string;
}

export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  tradingFees: number;
  slippage: number;
}

export interface BacktestTrade {
  id: string;
  timestamp: Date;
  type: 'entry' | 'exit';
  price: number;
  amount: number;
  profit: number;
  gasUsed: number;
}

export interface BacktestResult {
  strategyId: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalProfit: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  trades: BacktestTrade[];
}

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>;
  downloads: number;
  rating: number;
}
