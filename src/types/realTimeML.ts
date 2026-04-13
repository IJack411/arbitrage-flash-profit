// Real-Time ML Monitoring Types

import { AnomalyType, ThreatLevel, TrendDirection } from './mlAnalytics';

// Sensitivity Levels
export type SensitivityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface SensitivityConfig {
  level: SensitivityLevel;
  anomalyThreshold: number;      // Z-score threshold
  alertCooldownMs: number;       // Minimum time between alerts
  minConfidence: number;         // Minimum confidence to trigger
  enabledAnomalyTypes: AnomalyType[];
  enabledThreatTypes: string[];
}

export const SENSITIVITY_PRESETS: Record<SensitivityLevel, SensitivityConfig> = {
  low: {
    level: 'low',
    anomalyThreshold: 3.5,
    alertCooldownMs: 30 * 60 * 1000, // 30 minutes
    minConfidence: 80,
    enabledAnomalyTypes: ['rapid_drain', 'suspicious_pattern'],
    enabledThreatTypes: ['rapid_drain', 'large_transfer'],
  },
  medium: {
    level: 'medium',
    anomalyThreshold: 2.5,
    alertCooldownMs: 15 * 60 * 1000, // 15 minutes
    minConfidence: 60,
    enabledAnomalyTypes: ['unusual_amount', 'rapid_drain', 'suspicious_pattern', 'unusual_frequency'],
    enabledThreatTypes: ['rapid_drain', 'large_transfer', 'high_frequency'],
  },
  high: {
    level: 'high',
    anomalyThreshold: 2.0,
    alertCooldownMs: 5 * 60 * 1000, // 5 minutes
    minConfidence: 40,
    enabledAnomalyTypes: ['unusual_amount', 'unusual_time', 'unusual_frequency', 'rapid_drain', 'suspicious_pattern'],
    enabledThreatTypes: ['rapid_drain', 'large_transfer', 'high_frequency', 'unusual_recipient'],
  },
  ultra: {
    level: 'ultra',
    anomalyThreshold: 1.5,
    alertCooldownMs: 60 * 1000, // 1 minute
    minConfidence: 20,
    enabledAnomalyTypes: ['unusual_amount', 'unusual_time', 'unusual_frequency', 'unusual_recipient', 'rapid_drain', 'suspicious_pattern'],
    enabledThreatTypes: ['rapid_drain', 'large_transfer', 'high_frequency', 'unusual_recipient', 'dust_attack'],
  },
};

// Real-time transaction
export interface RealTimeTransaction {
  id: string;
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  value: number;
  valueUSD: number;
  gasUsed: number;
  gasPrice: number;
  gasCost: number;
  type: 'incoming' | 'outgoing';
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
}

// Real-time anomaly detection result
export interface RealTimeAnomalyResult {
  transactionId: string;
  timestamp: string;
  isAnomaly: boolean;
  anomalyScore: number;        // 0-100
  anomalyType?: AnomalyType;
  zScore: number;
  isolationScore: number;
  confidence: number;
  description: string;
  suggestedAction?: string;
  triggeredAlert: boolean;
}

// Incremental statistics for real-time updates
export interface IncrementalStats {
  count: number;
  sum: number;
  sumSquares: number;
  min: number;
  max: number;
  mean: number;
  variance: number;
  stdDev: number;
  lastUpdated: string;
}

// Incremental trend state
export interface IncrementalTrendState {
  direction: TrendDirection;
  slope: number;
  momentum: number;
  volatility: number;
  lastValues: number[];        // Rolling window
  windowSize: number;
  sumX: number;
  sumY: number;
  sumXY: number;
  sumX2: number;
  n: number;
  lastUpdated: string;
}

// Incremental prediction state
export interface IncrementalPredictionState {
  emaValue: number;
  emaTrend: number;
  alpha: number;
  beta: number;
  lastPrediction: number;
  predictionError: number;
  mape: number;
  lastUpdated: string;
}

// Real-time monitoring state for a wallet
export interface WalletMonitoringState {
  walletAddress: string;
  isActive: boolean;
  lastTransaction?: RealTimeTransaction;
  lastAnomaly?: RealTimeAnomalyResult;
  currentRiskScore: number;     // 0-100
  threatLevel: ThreatLevel;
  activeAnomalies: RealTimeAnomalyResult[];
  recentTransactions: RealTimeTransaction[];
  incrementalStats: {
    amounts: IncrementalStats;
    gasUsage: IncrementalStats;
    frequency: IncrementalStats;
  };
  trendState: IncrementalTrendState;
  predictionState: IncrementalPredictionState;
  alertHistory: RealTimeAlert[];
  lastAlertTime?: string;
  startedAt: string;
  lastUpdated: string;
}

// Real-time alert
export interface RealTimeAlert {
  id: string;
  walletAddress: string;
  timestamp: string;
  type: 'anomaly' | 'threat' | 'prediction' | 'threshold';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  details: {
    anomalyScore?: number;
    riskScore?: number;
    transactionHash?: string;
    value?: number;
    threshold?: number;
    confidence?: number;
  };
  acknowledged: boolean;
  acknowledgedAt?: string;
}

// Monitoring session
export interface MonitoringSession {
  sessionId: string;
  startedAt: string;
  wallets: string[];
  sensitivityConfig: SensitivityConfig;
  totalTransactionsProcessed: number;
  totalAnomaliesDetected: number;
  totalAlertsTriggered: number;
  averageProcessingTimeMs: number;
  isActive: boolean;
}

// Real-time dashboard state
export interface RealTimeDashboardState {
  session: MonitoringSession | null;
  walletStates: Map<string, WalletMonitoringState>;
  globalRiskScore: number;
  recentAlerts: RealTimeAlert[];
  transactionStream: RealTimeTransaction[];
  anomalyStream: RealTimeAnomalyResult[];
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastHeartbeat: string;
}

// Event types for real-time updates
export type RealTimeEventType = 
  | 'transaction'
  | 'anomaly'
  | 'alert'
  | 'risk_update'
  | 'trend_update'
  | 'prediction_update'
  | 'connection_status';

export interface RealTimeEvent {
  type: RealTimeEventType;
  timestamp: string;
  walletAddress?: string;
  data: unknown;
}

// Callback types
export type TransactionCallback = (tx: RealTimeTransaction) => void;
export type AnomalyCallback = (result: RealTimeAnomalyResult) => void;
export type AlertCallback = (alert: RealTimeAlert) => void;
export type RiskUpdateCallback = (walletAddress: string, riskScore: number, threatLevel: ThreatLevel) => void;
export type EventCallback = (event: RealTimeEvent) => void;

// Configuration for real-time monitoring
export interface RealTimeMonitoringConfig {
  pollingIntervalMs: number;
  maxTransactionsInMemory: number;
  maxAlertsInMemory: number;
  enablePredictions: boolean;
  enableTrendUpdates: boolean;
  autoAcknowledgeAfterMs?: number;
  webhookUrl?: string;
  telegramEnabled: boolean;
}

export const DEFAULT_REALTIME_CONFIG: RealTimeMonitoringConfig = {
  pollingIntervalMs: 15000,      // 15 seconds
  maxTransactionsInMemory: 100,
  maxAlertsInMemory: 50,
  enablePredictions: true,
  enableTrendUpdates: true,
  autoAcknowledgeAfterMs: undefined,
  webhookUrl: undefined,
  telegramEnabled: false,
};

// Risk score thresholds
export const RISK_THRESHOLDS = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
};

// Helper to get threat level from risk score
export function getThreatLevelFromScore(score: number): ThreatLevel {
  if (score >= RISK_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.medium) return 'medium';
  if (score >= RISK_THRESHOLDS.low) return 'low';
  return 'none';
}

// Sensitivity level display config
export const SENSITIVITY_DISPLAY: Record<SensitivityLevel, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
}> = {
  low: {
    label: 'Low',
    description: 'Only critical anomalies trigger alerts',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  medium: {
    label: 'Medium',
    description: 'Balanced detection for most use cases',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  high: {
    label: 'High',
    description: 'Sensitive detection, may have more false positives',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
  ultra: {
    label: 'Ultra',
    description: 'Maximum sensitivity, alerts on any deviation',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
};
