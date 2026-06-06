// Intelligent Alert Suggestion System Types

import { AlertType, AlertSeverity, NotificationChannel } from './walletAlerts';

export type SuggestionType = 'low_balance' | 'balance_change' | 'gas_reserve' | 'cooldown';
export type SuggestionConfidence = 'low' | 'medium' | 'high' | 'very_high';
export type SuggestionStatus = 'pending' | 'applied' | 'dismissed' | 'expired';

export interface AlertSuggestion {
  id: string;
  walletAddress: string;
  walletName?: string;
  suggestionType: SuggestionType;
  alertType: AlertType;
  suggestedValue: number;
  currentValue?: number;
  confidence: SuggestionConfidence;
  confidenceScore: number; // 0-100
  reasoning: string;
  dataPoints: number;
  analysisWindow: string; // e.g., "30 days", "7 days"
  status: SuggestionStatus;
  createdAt: string;
  appliedAt?: string;
  dismissedAt?: string;
  metadata: SuggestionMetadata;
}

export interface SuggestionMetadata {
  // For low balance suggestions
  historicalMinBalance?: number;
  historicalAvgBalance?: number;
  historicalMaxBalance?: number;
  balanceStdDev?: number;
  
  // For balance change suggestions
  avgTransactionSize?: number;
  maxTransactionSize?: number;
  transactionFrequency?: number; // per day
  typicalChangePercent?: number;
  
  // For gas reserve suggestions
  avgGasCost?: number;
  maxGasCost?: number;
  estimatedTxPerDay?: number;
  networkGasPrice?: number;
  
  // For cooldown suggestions
  avgAcknowledgmentTime?: number; // in minutes
  alertFatigue?: boolean;
  optimalCooldown?: number;
  
  // Analysis details
  sampleSize?: number;
  outlierCount?: number;
  trendDirection?: 'increasing' | 'decreasing' | 'stable';
}

export interface WalletAnalysis {
  walletAddress: string;
  walletName?: string;
  analysisDate: string;
  dataQuality: 'insufficient' | 'fair' | 'good' | 'excellent';
  
  // Balance analysis
  balanceHistory: BalanceDataPoint[];
  balanceStats: BalanceStatistics;
  
  // Transaction analysis
  transactionHistory: TransactionDataPoint[];
  transactionStats: TransactionStatistics;
  
  // Gas analysis
  gasHistory: GasDataPoint[];
  gasStats: GasStatistics;
  
  // Acknowledgment analysis
  acknowledgmentHistory: AcknowledgmentDataPoint[];
  acknowledgmentStats: AcknowledgmentStatistics;
  
  // Generated suggestions
  suggestions: AlertSuggestion[];
}

export interface BalanceDataPoint {
  timestamp: string;
  balance: number;
  balanceUSD: number;
}

export interface BalanceStatistics {
  min: number;
  max: number;
  avg: number;
  median: number;
  stdDev: number;
  percentile10: number;
  percentile25: number;
  percentile75: number;
  percentile90: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  volatility: 'low' | 'medium' | 'high';
}

export interface TransactionDataPoint {
  timestamp: string;
  type: 'incoming' | 'outgoing';
  amount: number;
  amountUSD: number;
  gasUsed: number;
  gasCost: number;
}

export interface TransactionStatistics {
  totalTransactions: number;
  avgTransactionsPerDay: number;
  avgIncomingAmount: number;
  avgOutgoingAmount: number;
  maxOutgoingAmount: number;
  avgChangePercent: number;
  maxChangePercent: number;
}

export interface GasDataPoint {
  timestamp: string;
  gasPrice: number;
  gasUsed: number;
  totalCost: number;
  network: string;
}

export interface GasStatistics {
  avgGasPrice: number;
  maxGasPrice: number;
  avgGasUsed: number;
  avgTxCost: number;
  maxTxCost: number;
  estimatedDailyCost: number;
  recommendedReserve: number;
}

export interface AcknowledgmentDataPoint {
  alertId: string;
  alertType: AlertType;
  triggeredAt: string;
  acknowledgedAt?: string;
  responseTimeMinutes?: number;
  wasIgnored: boolean;
}

export interface AcknowledgmentStatistics {
  totalAlerts: number;
  acknowledgedAlerts: number;
  ignoredAlerts: number;
  avgResponseTime: number;
  medianResponseTime: number;
  alertFatigueScore: number; // 0-100, higher = more fatigue
  optimalCooldown: number;
}

export interface SuggestionPreferences {
  autoApply: boolean;
  minConfidence: SuggestionConfidence;
  preferredChannels: NotificationChannel[];
  analysisFrequency: 'daily' | 'weekly' | 'manual';
  enableLowBalanceSuggestions: boolean;
  enableBalanceChangeSuggestions: boolean;
  enableGasReserveSuggestions: boolean;
  enableCooldownSuggestions: boolean;
}

export interface SuggestionSummary {
  totalSuggestions: number;
  pendingSuggestions: number;
  appliedSuggestions: number;
  dismissedSuggestions: number;
  highConfidenceSuggestions: number;
  lastAnalysisDate?: string;
  nextAnalysisDate?: string;
  overallDataQuality: 'insufficient' | 'fair' | 'good' | 'excellent';
}

export const CONFIDENCE_CONFIG: Record<SuggestionConfidence, {
  label: string;
  color: string;
  bgColor: string;
  minScore: number;
  description: string;
}> = {
  low: {
    label: 'Low Confidence',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    minScore: 0,
    description: 'Limited data available. Suggestion may not be accurate.',
  },
  medium: {
    label: 'Medium Confidence',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    minScore: 40,
    description: 'Moderate data available. Suggestion is reasonably reliable.',
  },
  high: {
    label: 'High Confidence',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    minScore: 70,
    description: 'Good amount of data. Suggestion is reliable.',
  },
  very_high: {
    label: 'Very High Confidence',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    minScore: 90,
    description: 'Excellent data quality. Suggestion is highly reliable.',
  },
};

export const SUGGESTION_TYPE_INFO: Record<SuggestionType, {
  name: string;
  description: string;
  icon: string;
  minDataPoints: number;
}> = {
  low_balance: {
    name: 'Low Balance Threshold',
    description: 'Optimal threshold based on historical balance patterns',
    icon: 'AlertTriangle',
    minDataPoints: 10,
  },
  balance_change: {
    name: 'Balance Change Percentage',
    description: 'Recommended percentage based on typical transaction sizes',
    icon: 'TrendingDown',
    minDataPoints: 20,
  },
  gas_reserve: {
    name: 'Gas Reserve Minimum',
    description: 'Minimum gas reserve based on transaction patterns',
    icon: 'Fuel',
    minDataPoints: 15,
  },
  cooldown: {
    name: 'Cooldown Period',
    description: 'Optimal cooldown based on acknowledgment patterns',
    icon: 'Clock',
    minDataPoints: 5,
  },
};

export const DEFAULT_SUGGESTION_PREFERENCES: SuggestionPreferences = {
  autoApply: false,
  minConfidence: 'medium',
  preferredChannels: ['in_app'],
  analysisFrequency: 'weekly',
  enableLowBalanceSuggestions: true,
  enableBalanceChangeSuggestions: true,
  enableGasReserveSuggestions: true,
  enableCooldownSuggestions: true,
};
