// Machine Learning Analytics Types for Alert Suggestion System

export type TrendDirection = 'strongly_increasing' | 'increasing' | 'stable' | 'decreasing' | 'strongly_decreasing';
export type AnomalyType = 'unusual_amount' | 'unusual_time' | 'unusual_frequency' | 'unusual_recipient' | 'rapid_drain' | 'suspicious_pattern';
export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type PredictionConfidence = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

// Time Series Analysis
export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  predicted?: boolean;
}

export interface MovingAverageResult {
  sma: number[];  // Simple Moving Average
  ema: number[];  // Exponential Moving Average
  wma: number[];  // Weighted Moving Average
  period: number;
}

export interface TrendAnalysis {
  direction: TrendDirection;
  slope: number;
  rSquared: number;  // Coefficient of determination (0-1)
  volatility: number;  // Standard deviation of residuals
  momentum: number;  // Rate of change
  acceleration: number;  // Second derivative
  seasonality?: SeasonalityPattern;
  changePoints: ChangePoint[];
}

export interface SeasonalityPattern {
  detected: boolean;
  period: number;  // In hours
  amplitude: number;
  phase: number;
  confidence: number;
}

export interface ChangePoint {
  timestamp: number;
  type: 'increase' | 'decrease' | 'volatility_change';
  magnitude: number;
  confidence: number;
}

// Anomaly Detection
export interface AnomalyScore {
  timestamp: number;
  value: number;
  zScore: number;
  isolationScore: number;  // 0-1, higher = more anomalous
  mahalanobisDistance: number;
  isAnomaly: boolean;
  anomalyType?: AnomalyType;
  severity: number;  // 0-100
}

export interface AnomalyDetectionResult {
  anomalies: DetectedAnomaly[];
  anomalyRate: number;  // Percentage of anomalous points
  baselineStats: BaselineStatistics;
  thresholds: AnomalyThresholds;
  modelConfidence: number;
}

export interface DetectedAnomaly {
  id: string;
  timestamp: string;
  type: AnomalyType;
  value: number;
  expectedValue: number;
  deviation: number;  // How many standard deviations from expected
  severity: number;  // 0-100
  description: string;
  relatedTransactions?: string[];
  suggestedAction?: string;
}

export interface BaselineStatistics {
  mean: number;
  median: number;
  stdDev: number;
  iqr: number;  // Interquartile range
  q1: number;
  q3: number;
  skewness: number;
  kurtosis: number;
}

export interface AnomalyThresholds {
  zScoreThreshold: number;
  isolationThreshold: number;
  percentileThreshold: number;
  adaptiveThreshold: number;
}

// Balance Prediction
export interface BalancePrediction {
  predictions: PredictedBalance[];
  confidence: PredictionConfidence;
  confidenceInterval: number;  // Percentage (e.g., 95%)
  modelType: PredictionModelType;
  metrics: PredictionMetrics;
  warnings: PredictionWarning[];
}

export interface PredictedBalance {
  timestamp: string;
  predicted: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export type PredictionModelType = 'linear_regression' | 'exponential_smoothing' | 'arima' | 'ensemble';

export interface PredictionMetrics {
  mape: number;  // Mean Absolute Percentage Error
  rmse: number;  // Root Mean Square Error
  mae: number;   // Mean Absolute Error
  r2: number;    // R-squared
}

export interface PredictionWarning {
  type: 'low_balance' | 'rapid_decline' | 'high_volatility' | 'insufficient_funds';
  message: string;
  predictedDate?: string;
  severity: ThreatLevel;
  suggestedThreshold?: number;
}

// Security Threat Detection
export interface SecurityThreatAnalysis {
  overallThreatLevel: ThreatLevel;
  threatScore: number;  // 0-100
  detectedThreats: SecurityThreat[];
  riskFactors: RiskFactor[];
  recommendations: SecurityRecommendation[];
  lastAnalysis: string;
}

export interface SecurityThreat {
  id: string;
  type: ThreatType;
  severity: ThreatLevel;
  score: number;  // 0-100
  description: string;
  evidence: ThreatEvidence[];
  firstDetected: string;
  lastOccurrence: string;
  occurrenceCount: number;
  mitigationStatus: 'unaddressed' | 'monitoring' | 'mitigated';
}

export type ThreatType = 
  | 'rapid_drain'           // Balance draining quickly
  | 'unusual_recipient'     // New or suspicious recipient
  | 'unusual_timing'        // Transactions at unusual times
  | 'high_frequency'        // Abnormally high transaction frequency
  | 'large_transfer'        // Unusually large transfers
  | 'dust_attack'           // Small incoming transactions (potential tracking)
  | 'contract_interaction'  // Interaction with suspicious contracts
  | 'front_running'         // Potential front-running detected
  | 'phishing_pattern'      // Pattern matching known phishing
  | 'compromised_key';      // Signs of compromised private key

export interface ThreatEvidence {
  timestamp: string;
  type: string;
  description: string;
  data: Record<string, unknown>;
}

export interface RiskFactor {
  factor: string;
  score: number;  // 0-100
  weight: number;  // Importance weight
  description: string;
  trend: 'improving' | 'stable' | 'worsening';
}

export interface SecurityRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'alert_config' | 'security_practice' | 'immediate_action';
  title: string;
  description: string;
  suggestedAction: string;
  relatedThreat?: string;
}

// Spending Pattern Analysis
export interface SpendingPatternAnalysis {
  dailyPattern: DailyPattern;
  weeklyPattern: WeeklyPattern;
  categoryBreakdown: SpendingCategory[];
  unusualPatterns: UnusualPattern[];
  projectedSpending: ProjectedSpending;
}

export interface DailyPattern {
  hourlyDistribution: number[];  // 24 hours
  peakHours: number[];
  quietHours: number[];
  averagePerHour: number;
}

export interface WeeklyPattern {
  dailyDistribution: number[];  // 7 days (0 = Sunday)
  peakDays: number[];
  averagePerDay: number;
  weekendVsWeekday: number;  // Ratio
}

export interface SpendingCategory {
  category: string;
  amount: number;
  percentage: number;
  transactionCount: number;
  averageAmount: number;
  trend: TrendDirection;
}

export interface UnusualPattern {
  id: string;
  type: 'frequency_spike' | 'amount_spike' | 'timing_anomaly' | 'recipient_cluster';
  description: string;
  startTime: string;
  endTime?: string;
  severity: number;
  affectedTransactions: number;
}

export interface ProjectedSpending {
  daily: number;
  weekly: number;
  monthly: number;
  confidence: number;
  trend: TrendDirection;
}

// ML Model Configuration
export interface MLModelConfig {
  anomalyDetection: {
    zScoreThreshold: number;
    isolationContamination: number;
    minSamplesForTraining: number;
    adaptiveThreshold: boolean;
  };
  trendAnalysis: {
    shortTermWindow: number;  // In hours
    longTermWindow: number;
    smoothingFactor: number;
    seasonalityDetection: boolean;
  };
  prediction: {
    forecastHorizon: number;  // In hours
    confidenceLevel: number;
    ensembleWeights: {
      linearRegression: number;
      exponentialSmoothing: number;
      movingAverage: number;
    };
  };
  security: {
    threatScoreThreshold: number;
    rapidDrainThreshold: number;  // Percentage per hour
    unusualAmountMultiplier: number;
    newRecipientRiskScore: number;
  };
}

export const DEFAULT_ML_CONFIG: MLModelConfig = {
  anomalyDetection: {
    zScoreThreshold: 2.5,
    isolationContamination: 0.1,
    minSamplesForTraining: 30,
    adaptiveThreshold: true,
  },
  trendAnalysis: {
    shortTermWindow: 24,
    longTermWindow: 168,  // 7 days
    smoothingFactor: 0.3,
    seasonalityDetection: true,
  },
  prediction: {
    forecastHorizon: 168,  // 7 days
    confidenceLevel: 0.95,
    ensembleWeights: {
      linearRegression: 0.4,
      exponentialSmoothing: 0.35,
      movingAverage: 0.25,
    },
  },
  security: {
    threatScoreThreshold: 60,
    rapidDrainThreshold: 10,
    unusualAmountMultiplier: 3,
    newRecipientRiskScore: 30,
  },
};

// Proactive Alert Recommendations
export interface ProactiveAlertRecommendation {
  id: string;
  type: 'threshold_adjustment' | 'new_alert' | 'alert_removal' | 'timing_optimization';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  reasoning: string;
  basedOn: RecommendationBasis[];
  suggestedConfig: Partial<AlertConfigSuggestion>;
  expectedImpact: ExpectedImpact;
  createdAt: string;
  expiresAt?: string;
}

export interface RecommendationBasis {
  type: 'trend_analysis' | 'anomaly_detection' | 'prediction' | 'security_threat' | 'pattern_analysis';
  confidence: number;
  dataPoints: number;
  summary: string;
}

export interface AlertConfigSuggestion {
  alertType: string;
  thresholdValue?: number;
  thresholdPercentage?: number;
  cooldownMinutes?: number;
  severity?: string;
  channels?: string[];
}

export interface ExpectedImpact {
  falsePositiveReduction: number;  // Percentage
  detectionImprovement: number;  // Percentage
  responseTimeImprovement: number;  // Minutes
  securityScoreImpact: number;  // Points
}

// ML Analysis Summary
export interface MLAnalysisSummary {
  walletAddress: string;
  analysisTimestamp: string;
  dataQuality: 'insufficient' | 'fair' | 'good' | 'excellent';
  dataPointsAnalyzed: number;
  timeRangeAnalyzed: {
    start: string;
    end: string;
    durationHours: number;
  };
  trendAnalysis: TrendAnalysis;
  anomalyDetection: AnomalyDetectionResult;
  balancePrediction: BalancePrediction;
  securityAnalysis: SecurityThreatAnalysis;
  spendingPatterns: SpendingPatternAnalysis;
  proactiveRecommendations: ProactiveAlertRecommendation[];
  modelPerformance: {
    lastTrainingDate: string;
    accuracy: number;
    precision: number;
    recall: number;
  };
}

// Threat Level Configuration
export const THREAT_LEVEL_CONFIG: Record<ThreatLevel, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  minScore: number;
}> = {
  none: {
    label: 'No Threats',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    icon: 'Shield',
    minScore: 0,
  },
  low: {
    label: 'Low Risk',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: 'Info',
    minScore: 20,
  },
  medium: {
    label: 'Medium Risk',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    icon: 'AlertTriangle',
    minScore: 40,
  },
  high: {
    label: 'High Risk',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    icon: 'AlertCircle',
    minScore: 60,
  },
  critical: {
    label: 'Critical',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: 'XCircle',
    minScore: 80,
  },
};

export const ANOMALY_TYPE_INFO: Record<AnomalyType, {
  label: string;
  description: string;
  icon: string;
  defaultSeverity: number;
}> = {
  unusual_amount: {
    label: 'Unusual Amount',
    description: 'Transaction amount significantly deviates from normal patterns',
    icon: 'DollarSign',
    defaultSeverity: 60,
  },
  unusual_time: {
    label: 'Unusual Timing',
    description: 'Transaction occurred at an unusual time based on historical patterns',
    icon: 'Clock',
    defaultSeverity: 40,
  },
  unusual_frequency: {
    label: 'Unusual Frequency',
    description: 'Transaction frequency is abnormally high or low',
    icon: 'Activity',
    defaultSeverity: 50,
  },
  unusual_recipient: {
    label: 'New Recipient',
    description: 'Transaction to a previously unseen address',
    icon: 'UserX',
    defaultSeverity: 30,
  },
  rapid_drain: {
    label: 'Rapid Drain',
    description: 'Balance is being depleted at an unusually fast rate',
    icon: 'TrendingDown',
    defaultSeverity: 80,
  },
  suspicious_pattern: {
    label: 'Suspicious Pattern',
    description: 'Transaction pattern matches known suspicious behavior',
    icon: 'AlertOctagon',
    defaultSeverity: 70,
  },
};
