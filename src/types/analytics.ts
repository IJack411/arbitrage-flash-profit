export interface TradeRecord {
  id: string;
  timestamp: Date;
  strategyId: string;
  strategyName: string;
  tokenPair: string;
  entryPrice: number;
  exitPrice: number;
  amount: number;
  profit: number;
  profitPercent: number;
  gasCost: number;
  netProfit: number;
  duration: number;
  network: string;
  status: 'win' | 'loss' | 'breakeven';
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
  drawdown: number;
  drawdownPercent: number;
}

export interface DrawdownPeriod {
  startDate: Date;
  endDate: Date | null;
  peakEquity: number;
  troughEquity: number;
  drawdownPercent: number;
  duration: number;
  recovered: boolean;
}

export interface StreakData {
  type: 'win' | 'loss';
  count: number;
  startDate: Date;
  endDate: Date;
  totalProfit: number;
}

export interface RiskMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  avgDrawdown: number;
  volatility: number;
  var95: number;
  var99: number;
  beta: number;
  alpha: number;
}

export interface StrategyPerformance {
  strategyId: string;
  strategyName: string;
  totalTrades: number;
  winRate: number;
  totalProfit: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  riskMetrics: RiskMetrics;
  equityCurve: EquityPoint[];
  drawdowns: DrawdownPeriod[];
  streaks: StreakData[];
  trades: TradeRecord[];
}

export interface BenchmarkData {
  name: string;
  returns: number[];
  timestamps: Date[];
  totalReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface ComparisonResult {
  strategy: StrategyPerformance;
  benchmarks: BenchmarkData[];
  correlations: { [key: string]: number };
  outperformance: { [key: string]: number };
}
