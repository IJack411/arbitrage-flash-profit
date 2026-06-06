// Scheduled Training Types
// Types for automatic periodic ML model retraining with versioning and comparison

import { PreTrainedModelState, TrainingConfig, ModelValidation } from './historicalTraining';

// Training frequency options
export type TrainingFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

// Day of week for weekly schedules
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0

// Schedule configuration
export interface TrainingSchedule {
  id: string;
  walletAddress: string;
  network: string;
  frequency: TrainingFrequency;
  isEnabled: boolean;
  
  // Timing configuration
  timeOfDay: string; // HH:MM format (24-hour)
  dayOfWeek?: DayOfWeek; // For weekly schedules
  dayOfMonth?: number; // For monthly schedules (1-28)
  customIntervalHours?: number; // For custom frequency
  
  // Training configuration
  trainingConfig: TrainingConfig;
  
  // Auto-deployment settings
  autoDeployOnSuccess: boolean;
  minAccuracyForDeploy: number; // 0-100, minimum accuracy to auto-deploy
  requireImprovement: boolean; // Only deploy if better than current model
  minImprovementPercent: number; // Minimum improvement required (e.g., 2%)
  
  // Retention settings
  keepVersions: number; // How many model versions to keep
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

// Model version information
export interface ModelVersion {
  id: string;
  version: string; // Semantic versioning: major.minor.patch
  walletAddress: string;
  network: string;
  
  // Model state
  modelState: PreTrainedModelState;
  
  // Training metadata
  trainedAt: string;
  trainingDurationMs: number;
  transactionsProcessed: number;
  dataRange: {
    from: string;
    to: string;
  };
  
  // Performance metrics
  validation: ModelValidation;
  performanceMetrics: ModelPerformanceMetrics;
  
  // Deployment status
  isDeployed: boolean;
  deployedAt?: string;
  
  // Comparison with previous version
  comparisonWithPrevious?: ModelComparison;
  
  // Notes
  notes?: string;
  tags?: string[];
}

// Performance metrics for a model
export interface ModelPerformanceMetrics {
  // Accuracy metrics
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  
  // Error rates
  falsePositiveRate: number;
  falseNegativeRate: number;
  
  // Prediction quality
  mape: number; // Mean Absolute Percentage Error
  rmse: number; // Root Mean Square Error
  
  // Data quality
  dataQuality: number;
  confidenceLevel: number;
  
  // Anomaly detection performance
  anomalyDetectionRate: number;
  avgAnomalyConfidence: number;
  
  // Trend prediction accuracy
  trendPredictionAccuracy: number;
  
  // Overall score (weighted combination)
  overallScore: number;
}

// Comparison between two model versions
export interface ModelComparison {
  currentVersion: string;
  previousVersion: string;
  
  // Metric changes (positive = improvement)
  accuracyChange: number;
  precisionChange: number;
  recallChange: number;
  f1ScoreChange: number;
  falsePositiveRateChange: number; // Negative is better
  falseNegativeRateChange: number; // Negative is better
  mapeChange: number; // Negative is better
  overallScoreChange: number;
  
  // Summary
  isImproved: boolean;
  improvementPercent: number;
  significantChanges: SignificantChange[];
  recommendation: 'deploy' | 'review' | 'reject';
  recommendationReason: string;
}

export interface SignificantChange {
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  isImprovement: boolean;
  severity: 'minor' | 'moderate' | 'major';
}

// Scheduled training run record
export interface ScheduledTrainingRun {
  id: string;
  scheduleId: string;
  walletAddress: string;
  network: string;
  
  // Timing
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  
  // Status
  status: TrainingRunStatus;
  statusMessage?: string;
  
  // Results
  modelVersionId?: string;
  previousModelVersionId?: string;
  comparison?: ModelComparison;
  
  // Deployment
  wasDeployed: boolean;
  deploymentReason?: string;
  
  // Errors
  errors?: TrainingRunError[];
}

export type TrainingRunStatus = 
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface TrainingRunError {
  stage: string;
  message: string;
  timestamp: string;
  stack?: string;
}

// Training history for a wallet
export interface WalletTrainingHistory {
  walletAddress: string;
  network: string;
  
  // Model versions
  versions: ModelVersion[];
  currentVersion?: string;
  
  // Schedule
  schedule?: TrainingSchedule;
  
  // Run history
  runs: ScheduledTrainingRun[];
  
  // Statistics
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgTrainingDuration: number;
  avgAccuracyImprovement: number;
  
  // Last activity
  lastTrainedAt?: string;
  lastDeployedAt?: string;
}

// Global scheduled training statistics
export interface ScheduledTrainingStats {
  totalSchedules: number;
  activeSchedules: number;
  totalModelsVersions: number;
  deployedModels: number;
  
  // Run statistics
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  
  // Performance trends
  avgAccuracyTrend: number; // Positive = improving
  avgF1ScoreTrend: number;
  
  // Upcoming
  nextScheduledRun?: {
    scheduleId: string;
    walletAddress: string;
    scheduledAt: string;
  };
}

// Schedule creation/update request
export interface CreateScheduleRequest {
  walletAddress: string;
  network: string;
  frequency: TrainingFrequency;
  timeOfDay: string;
  dayOfWeek?: DayOfWeek;
  dayOfMonth?: number;
  customIntervalHours?: number;
  trainingConfig?: Partial<TrainingConfig>;
  autoDeployOnSuccess?: boolean;
  minAccuracyForDeploy?: number;
  requireImprovement?: boolean;
  minImprovementPercent?: number;
  keepVersions?: number;
}

// Default values
export const DEFAULT_SCHEDULE_CONFIG: Partial<TrainingSchedule> = {
  frequency: 'weekly',
  timeOfDay: '03:00', // 3 AM
  dayOfWeek: 0, // Sunday
  dayOfMonth: 1,
  autoDeployOnSuccess: true,
  minAccuracyForDeploy: 70,
  requireImprovement: false,
  minImprovementPercent: 2,
  keepVersions: 5,
  isEnabled: true,
};

// Frequency display info
export const FREQUENCY_INFO: Record<TrainingFrequency, {
  label: string;
  description: string;
  icon: string;
}> = {
  daily: {
    label: 'Daily',
    description: 'Train model every day at specified time',
    icon: 'Calendar',
  },
  weekly: {
    label: 'Weekly',
    description: 'Train model once per week on specified day',
    icon: 'CalendarDays',
  },
  biweekly: {
    label: 'Bi-weekly',
    description: 'Train model every two weeks',
    icon: 'CalendarRange',
  },
  monthly: {
    label: 'Monthly',
    description: 'Train model once per month on specified day',
    icon: 'CalendarClock',
  },
  custom: {
    label: 'Custom',
    description: 'Train model at custom interval',
    icon: 'Settings',
  },
};

// Day names for display
export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

// Helper functions
export function getNextRunTime(schedule: TrainingSchedule): Date {
  const now = new Date();
  const [hours, minutes] = schedule.timeOfDay.split(':').map(Number);
  
  let nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);
  
  // If time has passed today, start from tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  switch (schedule.frequency) {
    case 'daily':
      // Already set to next occurrence
      break;
      
    case 'weekly': {
      const targetDay = schedule.dayOfWeek ?? 0;
      while (nextRun.getDay() !== targetDay) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;
    }
      
    case 'biweekly': {
      const biweeklyTarget = schedule.dayOfWeek ?? 0;
      while (nextRun.getDay() !== biweeklyTarget) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      // If last run was less than 2 weeks ago, add 2 weeks
      if (schedule.lastRunAt) {
        const lastRun = new Date(schedule.lastRunAt);
        const twoWeeksLater = new Date(lastRun);
        twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
        if (nextRun < twoWeeksLater) {
          nextRun = twoWeeksLater;
          nextRun.setHours(hours, minutes, 0, 0);
        }
      }
      break;
    }
      
    case 'monthly': {
      const targetDate = schedule.dayOfMonth ?? 1;
      nextRun.setDate(targetDate);
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }
      break;
    }
      
    case 'custom': {
      if (schedule.lastRunAt && schedule.customIntervalHours) {
        const lastRun = new Date(schedule.lastRunAt);
        nextRun = new Date(lastRun.getTime() + schedule.customIntervalHours * 60 * 60 * 1000);
      }
      break;
    }
  }
  
  return nextRun;
}

export function formatNextRun(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays === 0) {
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `in ${diffMinutes} minutes`;
    }
    return `in ${diffHours} hours`;
  } else if (diffDays === 1) {
    return 'tomorrow';
  } else if (diffDays < 7) {
    return `in ${diffDays} days`;
  } else {
    return date.toLocaleDateString();
  }
}

export function generateVersionNumber(
  existingVersions: string[],
  isBreakingChange: boolean = false,
  isMinorChange: boolean = false
): string {
  if (existingVersions.length === 0) {
    return '1.0.0';
  }
  
  // Get latest version
  const sorted = existingVersions.sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
    const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
    if (aMajor !== bMajor) return bMajor - aMajor;
    if (aMinor !== bMinor) return bMinor - aMinor;
    return bPatch - aPatch;
  });
  
  const latest = sorted[0];
  const [major, minor, patch] = latest.split('.').map(Number);
  
  if (isBreakingChange) {
    return `${major + 1}.0.0`;
  } else if (isMinorChange) {
    return `${major}.${minor + 1}.0`;
  } else {
    return `${major}.${minor}.${patch + 1}`;
  }
}

export function calculateOverallScore(metrics: Partial<ModelPerformanceMetrics>): number {
  const weights = {
    accuracy: 0.2,
    precision: 0.15,
    recall: 0.15,
    f1Score: 0.2,
    dataQuality: 0.1,
    anomalyDetectionRate: 0.1,
    trendPredictionAccuracy: 0.1,
  };
  
  let score = 0;
  let totalWeight = 0;
  
  for (const [key, weight] of Object.entries(weights)) {
    const value = metrics[key as keyof ModelPerformanceMetrics];
    if (typeof value === 'number' && !isNaN(value)) {
      score += value * weight;
      totalWeight += weight;
    }
  }
  
  return totalWeight > 0 ? score / totalWeight : 0;
}
