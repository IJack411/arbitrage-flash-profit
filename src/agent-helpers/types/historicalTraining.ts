// Historical Data Training Types
// Types for pre-training ML models with historical blockchain data

import { IncrementalStats, IncrementalTrendState, IncrementalPredictionState } from './realTimeML';
import { AnomalyType, ThreatLevel, TrendDirection } from './mlAnalytics';

// Training data source configuration
export interface TrainingDataSource {
  provider: 'alchemy' | 'infura' | 'public';
  network: string;
  chainId: number;
  apiConfigured: boolean;
}

// Historical transaction for training
export interface HistoricalTransaction {
  hash: string;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string;
  value: number;
  valueUSD: number;
  gasUsed: number;
  gasPrice: number;
  gasCost: number;
  type: 'incoming' | 'outgoing';
  category: 'external' | 'internal' | 'erc20' | 'erc721' | 'erc1155';
  tokenSymbol?: string;
  tokenAddress?: string;
}

// Training configuration
export interface TrainingConfig {
  walletAddress: string;
  network: string;
  historyDays: number;           // How many days of history to fetch
  minTransactions: number;       // Minimum transactions required for training
  maxTransactions: number;       // Maximum transactions to process
  includeTokenTransfers: boolean;
  includeInternalTxs: boolean;
  outlierRemovalPercentile: number;  // Remove top/bottom N% as outliers
  seasonalityDetection: boolean;
  patternLearning: boolean;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  walletAddress: '',
  network: 'ethereum',
  historyDays: 90,
  minTransactions: 10,
  maxTransactions: 1000,
  includeTokenTransfers: true,
  includeInternalTxs: true,
  outlierRemovalPercentile: 5,
  seasonalityDetection: true,
  patternLearning: true,
};

// Training progress tracking
export interface TrainingProgress {
  stage: TrainingStage;
  currentStep: number;
  totalSteps: number;
  percentComplete: number;
  message: string;
  startedAt: string;
  estimatedCompletion?: string;
  errors: TrainingError[];
}

export type TrainingStage = 
  | 'initializing'
  | 'fetching_transactions'
  | 'fetching_balances'
  | 'preprocessing'
  | 'computing_statistics'
  | 'detecting_patterns'
  | 'building_baselines'
  | 'training_models'
  | 'validating'
  | 'complete'
  | 'failed';

export interface TrainingError {
  stage: TrainingStage;
  message: string;
  timestamp: string;
  recoverable: boolean;
}

// Learned spending patterns
export interface LearnedSpendingPattern {
  // Hourly distribution (0-23)
  hourlyDistribution: number[];
  peakHours: number[];
  quietHours: number[];
  
  // Daily distribution (0-6, Sunday = 0)
  dailyDistribution: number[];
  peakDays: number[];
  quietDays: number[];
  
  // Monthly patterns
  monthlyDistribution: number[];
  
  // Transaction frequency
  avgTransactionsPerDay: number;
  avgTransactionsPerWeek: number;
  transactionFrequencyStdDev: number;
  
  // Amount patterns
  typicalAmountRanges: AmountRange[];
  largeTransactionThreshold: number;
  smallTransactionThreshold: number;
  
  // Recipient patterns
  frequentRecipients: RecipientPattern[];
  newRecipientFrequency: number;
  
  // Gas usage patterns
  avgGasUsed: number;
  avgGasPrice: number;
  gasUsageStdDev: number;
}

export interface AmountRange {
  min: number;
  max: number;
  frequency: number;  // Percentage of transactions in this range
  label: string;      // e.g., "micro", "small", "medium", "large", "whale"
}

export interface RecipientPattern {
  address: string;
  transactionCount: number;
  totalValue: number;
  avgValue: number;
  lastInteraction: string;
  label?: string;     // Contract name if known
}

// Baseline statistics for anomaly detection
export interface TrainedBaseline {
  // Core statistics
  transactionAmounts: BaselineStats;
  gasUsage: BaselineStats;
  transactionFrequency: BaselineStats;
  balanceChanges: BaselineStats;
  
  // Distribution statistics
  amountPercentiles: PercentileStats;
  gasPercentiles: PercentileStats;
  
  // Time-based baselines
  hourlyBaselines: Map<number, BaselineStats>;  // Hour -> stats
  dailyBaselines: Map<number, BaselineStats>;   // Day of week -> stats
  
  // Adaptive thresholds
  anomalyThresholds: AnomalyThresholds;
  
  // Confidence metrics
  sampleSize: number;
  dataQuality: number;  // 0-100
  confidenceLevel: number;  // 0-100
  
  // Metadata
  trainedAt: string;
  dataRange: {
    from: string;
    to: string;
    transactionCount: number;
  };
}

export interface BaselineStats {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  iqr: number;  // Interquartile range
  mad: number;  // Median absolute deviation
}

export interface PercentileStats {
  p1: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface AnomalyThresholds {
  // Amount thresholds
  unusualAmountLow: number;
  unusualAmountHigh: number;
  extremeAmountLow: number;
  extremeAmountHigh: number;
  
  // Frequency thresholds
  highFrequencyThreshold: number;  // Transactions per hour
  rapidBurstThreshold: number;     // Transactions per minute
  
  // Balance thresholds
  rapidDrainThreshold: number;     // Percentage drop
  significantChangeThreshold: number;
  
  // Time-based thresholds
  unusualHourPenalty: number;      // Extra weight for unusual hours
  unusualDayPenalty: number;
  
  // Gas thresholds
  highGasThreshold: number;
  extremeGasThreshold: number;
}

// Seasonality detection results
export interface SeasonalityAnalysis {
  hasHourlySeasonality: boolean;
  hasDailySeasonality: boolean;
  hasWeeklySeasonality: boolean;
  hasMonthlySeasonality: boolean;
  
  hourlyPattern?: SeasonalPattern;
  dailyPattern?: SeasonalPattern;
  weeklyPattern?: SeasonalPattern;
  monthlyPattern?: SeasonalPattern;
  
  dominantPeriod?: number;  // In hours
  seasonalStrength: number;  // 0-1
}

export interface SeasonalPattern {
  period: number;
  amplitude: number;
  phase: number;
  strength: number;
  indices: number[];  // Seasonal indices for each period
}

// Pre-trained model state (to be loaded into real-time service)
export interface PreTrainedModelState {
  walletAddress: string;
  network: string;
  
  // Incremental stats (pre-populated)
  incrementalStats: {
    amounts: IncrementalStats;
    gasUsage: IncrementalStats;
    frequency: IncrementalStats;
  };
  
  // Trend state (pre-initialized)
  trendState: IncrementalTrendState;
  
  // Prediction state (pre-trained)
  predictionState: IncrementalPredictionState;
  
  // Learned patterns
  spendingPatterns: LearnedSpendingPattern;
  
  // Baseline for anomaly detection
  baseline: TrainedBaseline;
  
  // Seasonality
  seasonality: SeasonalityAnalysis;
  
  // Model metadata
  metadata: {
    trainedAt: string;
    trainingDuration: number;  // ms
    transactionsProcessed: number;
    dataQuality: number;
    modelVersion: string;
  };
}

// Training session
export interface TrainingSession {
  sessionId: string;
  config: TrainingConfig;
  progress: TrainingProgress;
  result?: PreTrainedModelState;
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

// Training history
export interface TrainingHistory {
  sessions: TrainingSession[];
  lastSuccessfulTraining?: string;
  totalTrainingSessions: number;
  averageTrainingDuration: number;
}

// Validation results
export interface ModelValidation {
  isValid: boolean;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  validationSampleSize: number;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: 'warning' | 'error';
  message: string;
  recommendation: string;
}

// Training callbacks
export type TrainingProgressCallback = (progress: TrainingProgress) => void;
export type TrainingCompleteCallback = (result: PreTrainedModelState) => void;
export type TrainingErrorCallback = (error: TrainingError) => void;

// Network configurations for training
export const TRAINING_NETWORKS: Record<string, {
  chainId: number;
  name: string;
  currency: string;
  blockTime: number;  // Average block time in seconds
  maxHistoryDays: number;
}> = {
  ethereum: { chainId: 1, name: 'Ethereum', currency: 'ETH', blockTime: 12, maxHistoryDays: 365 },
  polygon: { chainId: 137, name: 'Polygon', currency: 'MATIC', blockTime: 2, maxHistoryDays: 180 },
  arbitrum: { chainId: 42161, name: 'Arbitrum', currency: 'ETH', blockTime: 0.25, maxHistoryDays: 180 },
  optimism: { chainId: 10, name: 'Optimism', currency: 'ETH', blockTime: 2, maxHistoryDays: 180 },
  base: { chainId: 8453, name: 'Base', currency: 'ETH', blockTime: 2, maxHistoryDays: 90 },
};

// Training stage display info
export const TRAINING_STAGE_INFO: Record<TrainingStage, {
  label: string;
  description: string;
  icon: string;
}> = {
  initializing: {
    label: 'Initializing',
    description: 'Setting up training environment',
    icon: 'Settings',
  },
  fetching_transactions: {
    label: 'Fetching Transactions',
    description: 'Retrieving historical transaction data from blockchain',
    icon: 'Download',
  },
  fetching_balances: {
    label: 'Fetching Balances',
    description: 'Reconstructing historical balance data',
    icon: 'Wallet',
  },
  preprocessing: {
    label: 'Preprocessing',
    description: 'Cleaning and normalizing transaction data',
    icon: 'Filter',
  },
  computing_statistics: {
    label: 'Computing Statistics',
    description: 'Calculating baseline statistics and distributions',
    icon: 'BarChart',
  },
  detecting_patterns: {
    label: 'Detecting Patterns',
    description: 'Identifying spending patterns and seasonality',
    icon: 'TrendingUp',
  },
  building_baselines: {
    label: 'Building Baselines',
    description: 'Establishing anomaly detection thresholds',
    icon: 'Target',
  },
  training_models: {
    label: 'Training Models',
    description: 'Training prediction and trend models',
    icon: 'Brain',
  },
  validating: {
    label: 'Validating',
    description: 'Validating model accuracy and performance',
    icon: 'CheckCircle',
  },
  complete: {
    label: 'Complete',
    description: 'Training completed successfully',
    icon: 'Check',
  },
  failed: {
    label: 'Failed',
    description: 'Training failed due to errors',
    icon: 'XCircle',
  },
};
