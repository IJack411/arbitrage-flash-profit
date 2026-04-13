// Machine Learning Analytics Service
// Provides time-series analysis, anomaly detection, balance prediction, and security threat detection

import {
  TimeSeriesPoint,
  MovingAverageResult,
  TrendAnalysis,
  TrendDirection,
  ChangePoint,
  SeasonalityPattern,
  AnomalyDetectionResult,
  DetectedAnomaly,
  AnomalyType,
  AnomalyScore,
  BaselineStatistics,
  AnomalyThresholds,
  BalancePrediction,
  PredictedBalance,
  PredictionWarning,
  PredictionMetrics,
  SecurityThreatAnalysis,
  SecurityThreat,
  ThreatType,
  ThreatLevel,
  RiskFactor,
  SecurityRecommendation,
  SpendingPatternAnalysis,
  DailyPattern,
  WeeklyPattern,
  SpendingCategory,
  UnusualPattern,
  ProjectedSpending,
  ProactiveAlertRecommendation,
  RecommendationBasis,
  MLAnalysisSummary,
  MLModelConfig,
  DEFAULT_ML_CONFIG,
} from '@/types/mlAnalytics';
import {
  BalanceDataPoint,
  TransactionDataPoint,
  GasDataPoint,
} from '@/types/alertSuggestions';

class MLAnalyticsService {
  private config: MLModelConfig = DEFAULT_ML_CONFIG;
  private modelCache: Map<string, MLAnalysisSummary> = new Map();

  // Update configuration
  updateConfig(newConfig: Partial<MLModelConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  // ==================== TIME SERIES ANALYSIS ====================

  // Calculate moving averages
  calculateMovingAverages(data: number[], period: number = 7): MovingAverageResult {
    const sma: number[] = [];
    const ema: number[] = [];
    const wma: number[] = [];

    // Simple Moving Average
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sma.push(data[i]);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
    }

    // Exponential Moving Average
    const multiplier = 2 / (period + 1);
    ema.push(data[0]);
    for (let i = 1; i < data.length; i++) {
      ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }

    // Weighted Moving Average
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        wma.push(data[i]);
      } else {
        let weightedSum = 0;
        let weightSum = 0;
        for (let j = 0; j < period; j++) {
          const weight = period - j;
          weightedSum += data[i - j] * weight;
          weightSum += weight;
        }
        wma.push(weightedSum / weightSum);
      }
    }

    return { sma, ema, wma, period };
  }

  // Perform linear regression
  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
    const n = x.length;
    if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    const ssTotal = y.reduce((acc, yi) => acc + Math.pow(yi - meanY, 2), 0);
    const ssResidual = y.reduce((acc, yi, i) => acc + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
    const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    return { slope, intercept, rSquared: Math.max(0, rSquared) };
  }

  // Detect change points using CUSUM algorithm
  private detectChangePoints(data: number[]): ChangePoint[] {
    const changePoints: ChangePoint[] = [];
    if (data.length < 10) return changePoints;

    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const stdDev = Math.sqrt(data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length);
    const threshold = stdDev * 2;

    let cusumPos = 0;
    let cusumNeg = 0;
    const k = stdDev * 0.5; // Slack parameter

    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      cusumPos = Math.max(0, cusumPos + diff - k);
      cusumNeg = Math.min(0, cusumNeg + diff + k);

      if (cusumPos > threshold) {
        changePoints.push({
          timestamp: i,
          type: 'increase',
          magnitude: cusumPos / stdDev,
          confidence: Math.min(1, cusumPos / (threshold * 2)),
        });
        cusumPos = 0;
      }

      if (cusumNeg < -threshold) {
        changePoints.push({
          timestamp: i,
          type: 'decrease',
          magnitude: Math.abs(cusumNeg) / stdDev,
          confidence: Math.min(1, Math.abs(cusumNeg) / (threshold * 2)),
        });
        cusumNeg = 0;
      }
    }

    return changePoints;
  }

  // Detect seasonality using autocorrelation
  private detectSeasonality(data: number[]): SeasonalityPattern | undefined {
    if (data.length < 48) return undefined; // Need at least 2 days of hourly data

    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
    
    if (variance === 0) return undefined;

    // Check for daily seasonality (24 hours)
    const maxLag = Math.min(168, Math.floor(data.length / 2)); // Up to 1 week
    const autocorrelations: number[] = [];

    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < data.length - lag; i++) {
        sum += (data[i] - mean) * (data[i + lag] - mean);
      }
      autocorrelations.push(sum / ((data.length - lag) * variance));
    }

    // Find peak autocorrelation (excluding lag 0)
    let maxCorr = 0;
    let bestPeriod = 0;
    
    // Check common periods: 24h, 12h, 168h (weekly)
    const periodsToCheck = [24, 12, 168, 48, 72];
    for (const period of periodsToCheck) {
      if (period < autocorrelations.length && autocorrelations[period - 1] > maxCorr) {
        maxCorr = autocorrelations[period - 1];
        bestPeriod = period;
      }
    }

    if (maxCorr > 0.3) { // Significant correlation threshold
      return {
        detected: true,
        period: bestPeriod,
        amplitude: Math.sqrt(variance) * maxCorr,
        phase: 0, // Simplified
        confidence: maxCorr,
      };
    }

    return undefined;
  }

  // Analyze time series trend
  analyzeTrend(balanceHistory: BalanceDataPoint[]): TrendAnalysis {
    if (balanceHistory.length < 3) {
      return {
        direction: 'stable',
        slope: 0,
        rSquared: 0,
        volatility: 0,
        momentum: 0,
        acceleration: 0,
        changePoints: [],
      };
    }

    const values = balanceHistory.map(b => b.balance);
    const timestamps = balanceHistory.map((_, i) => i);

    // Linear regression for overall trend
    const { slope, rSquared } = this.linearRegression(timestamps, values);

    // Calculate volatility (standard deviation of returns)
    const returns: number[] = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] !== 0) {
        returns.push((values[i] - values[i - 1]) / values[i - 1]);
      }
    }
    const volatility = returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length)
      : 0;

    // Calculate momentum (rate of change over recent period)
    const recentPeriod = Math.min(7, Math.floor(values.length / 3));
    const recentValues = values.slice(-recentPeriod);
    const momentum = recentValues.length > 1
      ? (recentValues[recentValues.length - 1] - recentValues[0]) / recentValues[0]
      : 0;

    // Calculate acceleration (change in momentum)
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const firstMomentum = firstHalf.length > 1
      ? (firstHalf[firstHalf.length - 1] - firstHalf[0]) / Math.max(0.0001, firstHalf[0])
      : 0;
    const secondMomentum = secondHalf.length > 1
      ? (secondHalf[secondHalf.length - 1] - secondHalf[0]) / Math.max(0.0001, secondHalf[0])
      : 0;
    const acceleration = secondMomentum - firstMomentum;

    // Determine trend direction
    let direction: TrendDirection = 'stable';
    const normalizedSlope = slope / Math.max(0.0001, values[0]);
    if (normalizedSlope > 0.05) direction = 'strongly_increasing';
    else if (normalizedSlope > 0.01) direction = 'increasing';
    else if (normalizedSlope < -0.05) direction = 'strongly_decreasing';
    else if (normalizedSlope < -0.01) direction = 'decreasing';

    // Detect change points and seasonality
    const changePoints = this.detectChangePoints(values);
    const seasonality = this.detectSeasonality(values);

    return {
      direction,
      slope,
      rSquared,
      volatility,
      momentum,
      acceleration,
      seasonality,
      changePoints,
    };
  }

  // ==================== ANOMALY DETECTION ====================

  // Calculate baseline statistics
  private calculateBaselineStats(data: number[]): BaselineStatistics {
    if (data.length === 0) {
      return {
        mean: 0, median: 0, stdDev: 0, iqr: 0, q1: 0, q3: 0, skewness: 0, kurtosis: 0,
      };
    }

    const sorted = [...data].sort((a, b) => a - b);
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
    
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    // Skewness
    const skewness = stdDev === 0 ? 0 :
      data.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 3), 0) / n;

    // Kurtosis
    const kurtosis = stdDev === 0 ? 0 :
      data.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 4), 0) / n - 3;

    return { mean, median, stdDev, iqr, q1, q3, skewness, kurtosis };
  }

  // Calculate Z-score
  private calculateZScore(value: number, mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  // Calculate isolation score (simplified isolation forest)
  private calculateIsolationScore(value: number, data: number[]): number {
    if (data.length < 2) return 0;

    const sorted = [...data].sort((a, b) => a - b);
    const rank = sorted.findIndex(v => v >= value);
    const normalizedRank = rank / data.length;

    // Score based on how far from median (0.5)
    const distanceFromMedian = Math.abs(normalizedRank - 0.5) * 2;
    return distanceFromMedian;
  }

  // Calculate Mahalanobis distance (simplified for 1D)
  private calculateMahalanobisDistance(value: number, mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    return Math.abs(value - mean) / stdDev;
  }

  // Detect anomalies in transaction data
  detectAnomalies(
    transactions: TransactionDataPoint[],
    balanceHistory: BalanceDataPoint[]
  ): AnomalyDetectionResult {
    const anomalies: DetectedAnomaly[] = [];
    
    if (transactions.length < this.config.anomalyDetection.minSamplesForTraining) {
      return {
        anomalies: [],
        anomalyRate: 0,
        baselineStats: this.calculateBaselineStats([]),
        thresholds: {
          zScoreThreshold: this.config.anomalyDetection.zScoreThreshold,
          isolationThreshold: 0.8,
          percentileThreshold: 95,
          adaptiveThreshold: this.config.anomalyDetection.zScoreThreshold,
        },
        modelConfidence: 0,
      };
    }

    // Calculate baseline statistics for amounts
    const outgoingAmounts = transactions
      .filter(t => t.type === 'outgoing')
      .map(t => t.amount);
    const baselineStats = this.calculateBaselineStats(outgoingAmounts);

    // Analyze transaction timing
    const hourCounts = new Array(24).fill(0);
    transactions.forEach(t => {
      const hour = new Date(t.timestamp).getHours();
      hourCounts[hour]++;
    });
    const avgHourCount = hourCounts.reduce((a, b) => a + b, 0) / 24;

    // Detect anomalies
    transactions.forEach((tx, index) => {
      const anomalyScores: { type: AnomalyType; score: number; description: string }[] = [];

      // Check for unusual amount
      if (tx.type === 'outgoing' && outgoingAmounts.length > 5) {
        const zScore = this.calculateZScore(tx.amount, baselineStats.mean, baselineStats.stdDev);
        if (Math.abs(zScore) > this.config.anomalyDetection.zScoreThreshold) {
          anomalyScores.push({
            type: 'unusual_amount',
            score: Math.min(100, Math.abs(zScore) * 20),
            description: `Transaction amount (${tx.amount.toFixed(4)} ETH) is ${Math.abs(zScore).toFixed(1)} standard deviations from average`,
          });
        }
      }

      // Check for unusual timing
      const txHour = new Date(tx.timestamp).getHours();
      if (hourCounts[txHour] < avgHourCount * 0.2 && avgHourCount > 1) {
        anomalyScores.push({
          type: 'unusual_time',
          score: 40,
          description: `Transaction at ${txHour}:00 is unusual - only ${hourCounts[txHour]} transactions typically occur at this hour`,
        });
      }

      // Check for rapid drain pattern
      if (tx.type === 'outgoing' && balanceHistory.length > 1) {
        const recentBalance = balanceHistory.slice(-24);
        if (recentBalance.length > 1) {
          const balanceChange = (recentBalance[0].balance - recentBalance[recentBalance.length - 1].balance) / recentBalance[0].balance;
          if (balanceChange > this.config.security.rapidDrainThreshold / 100) {
            anomalyScores.push({
              type: 'rapid_drain',
              score: Math.min(100, balanceChange * 200),
              description: `Balance decreased by ${(balanceChange * 100).toFixed(1)}% in the last 24 hours`,
            });
          }
        }
      }

      // Create anomaly record if any scores exceed threshold
      if (anomalyScores.length > 0) {
        const maxScore = Math.max(...anomalyScores.map(a => a.score));
        const primaryAnomaly = anomalyScores.find(a => a.score === maxScore)!;

        anomalies.push({
          id: `anomaly-${index}-${Date.now()}`,
          timestamp: tx.timestamp,
          type: primaryAnomaly.type,
          value: tx.amount,
          expectedValue: baselineStats.mean,
          deviation: this.calculateZScore(tx.amount, baselineStats.mean, baselineStats.stdDev),
          severity: maxScore,
          description: primaryAnomaly.description,
          suggestedAction: this.getSuggestedAction(primaryAnomaly.type, maxScore),
        });
      }
    });

    // Calculate adaptive threshold
    const adaptiveThreshold = this.config.anomalyDetection.adaptiveThreshold
      ? Math.max(2, this.config.anomalyDetection.zScoreThreshold * (1 + baselineStats.kurtosis * 0.1))
      : this.config.anomalyDetection.zScoreThreshold;

    return {
      anomalies,
      anomalyRate: transactions.length > 0 ? (anomalies.length / transactions.length) * 100 : 0,
      baselineStats,
      thresholds: {
        zScoreThreshold: this.config.anomalyDetection.zScoreThreshold,
        isolationThreshold: 0.8,
        percentileThreshold: 95,
        adaptiveThreshold,
      },
      modelConfidence: Math.min(100, transactions.length * 2),
    };
  }

  private getSuggestedAction(type: AnomalyType, severity: number): string {
    const actions: Record<AnomalyType, string> = {
      unusual_amount: severity > 70 
        ? 'Review transaction immediately and verify authorization'
        : 'Monitor for similar transactions',
      unusual_time: 'Verify this transaction was intentional',
      unusual_frequency: 'Check for automated or scripted transactions',
      unusual_recipient: 'Verify recipient address before future transactions',
      rapid_drain: 'Immediately review all recent transactions and consider pausing activity',
      suspicious_pattern: 'Review transaction history and consider enhanced security measures',
    };
    return actions[type];
  }

  // ==================== BALANCE PREDICTION ====================

  // Predict future balances
  predictBalance(
    balanceHistory: BalanceDataPoint[],
    transactions: TransactionDataPoint[],
    forecastHours: number = 168
  ): BalancePrediction {
    const warnings: PredictionWarning[] = [];
    
    if (balanceHistory.length < 7) {
      return {
        predictions: [],
        confidence: 'very_low',
        confidenceInterval: 50,
        modelType: 'linear_regression',
        metrics: { mape: 100, rmse: 0, mae: 0, r2: 0 },
        warnings: [{
          type: 'insufficient_funds',
          message: 'Insufficient data for reliable predictions',
          severity: 'low',
        }],
      };
    }

    const values = balanceHistory.map(b => b.balance);
    const timestamps = balanceHistory.map((_, i) => i);

    // Linear regression prediction
    const { slope, intercept, rSquared } = this.linearRegression(timestamps, values);

    // Exponential smoothing prediction
    const alpha = this.config.trendAnalysis.smoothingFactor;
    let smoothed = values[0];
    for (let i = 1; i < values.length; i++) {
      smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }

    // Calculate prediction error metrics
    const residuals = values.map((v, i) => v - (slope * i + intercept));
    const mae = residuals.reduce((sum, r) => sum + Math.abs(r), 0) / residuals.length;
    const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length);
    const mape = values.reduce((sum, v, i) => sum + Math.abs(residuals[i] / Math.max(0.0001, v)), 0) / values.length * 100;

    // Generate predictions
    const predictions: PredictedBalance[] = [];
    const currentBalance = values[values.length - 1];
    const lastTimestamp = new Date(balanceHistory[balanceHistory.length - 1].timestamp).getTime();
    const hourMs = 60 * 60 * 1000;

    // Ensemble prediction weights
    const weights = this.config.prediction.ensembleWeights;

    for (let h = 1; h <= forecastHours; h++) {
      const futureIndex = values.length + h;
      
      // Linear regression prediction
      const linearPred = slope * futureIndex + intercept;
      
      // Exponential smoothing (assumes continuation of last smoothed value with trend)
      const expPred = smoothed + slope * h;
      
      // Moving average prediction (assumes recent average continues)
      const recentAvg = values.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, values.length);
      const maPred = recentAvg + slope * h;

      // Ensemble prediction
      const predicted = 
        weights.linearRegression * linearPred +
        weights.exponentialSmoothing * expPred +
        weights.movingAverage * maPred;

      // Confidence interval based on RMSE
      const confidenceMultiplier = 1.96; // 95% confidence
      const uncertainty = rmse * Math.sqrt(1 + h / values.length) * confidenceMultiplier;

      predictions.push({
        timestamp: new Date(lastTimestamp + h * hourMs).toISOString(),
        predicted: Math.max(0, predicted),
        lowerBound: Math.max(0, predicted - uncertainty),
        upperBound: predicted + uncertainty,
        confidence: Math.max(0, 100 - h * 0.5), // Confidence decreases over time
      });
    }

    // Check for warnings
    const finalPrediction = predictions[predictions.length - 1];
    
    if (finalPrediction.predicted < currentBalance * 0.1) {
      warnings.push({
        type: 'low_balance',
        message: `Balance predicted to drop to ${finalPrediction.predicted.toFixed(4)} ETH`,
        predictedDate: finalPrediction.timestamp,
        severity: 'high',
        suggestedThreshold: finalPrediction.predicted * 1.5,
      });
    }

    if (slope < -currentBalance * 0.01) {
      warnings.push({
        type: 'rapid_decline',
        message: `Balance declining at ${(Math.abs(slope) / currentBalance * 100).toFixed(1)}% per period`,
        severity: slope < -currentBalance * 0.05 ? 'high' : 'medium',
      });
    }

    // Determine confidence level
    let confidence: 'very_low' | 'low' | 'medium' | 'high' | 'very_high' = 'medium';
    if (rSquared > 0.8 && mape < 10) confidence = 'very_high';
    else if (rSquared > 0.6 && mape < 20) confidence = 'high';
    else if (rSquared > 0.4 && mape < 40) confidence = 'medium';
    else if (rSquared > 0.2) confidence = 'low';
    else confidence = 'very_low';

    return {
      predictions,
      confidence,
      confidenceInterval: 95,
      modelType: 'ensemble',
      metrics: { mape, rmse, mae, r2: rSquared },
      warnings,
    };
  }

  // ==================== SECURITY THREAT DETECTION ====================

  // Analyze security threats
  analyzeSecurityThreats(
    transactions: TransactionDataPoint[],
    balanceHistory: BalanceDataPoint[],
    anomalies: DetectedAnomaly[]
  ): SecurityThreatAnalysis {
    const threats: SecurityThreat[] = [];
    const riskFactors: RiskFactor[] = [];
    const recommendations: SecurityRecommendation[] = [];

    // Analyze rapid drain threat
    if (balanceHistory.length > 24) {
      const recentBalance = balanceHistory.slice(-24);
      const balanceChange = (recentBalance[0].balance - recentBalance[recentBalance.length - 1].balance) / Math.max(0.0001, recentBalance[0].balance);
      
      if (balanceChange > 0.1) {
        threats.push({
          id: `threat-rapid-drain-${Date.now()}`,
          type: 'rapid_drain',
          severity: balanceChange > 0.5 ? 'critical' : balanceChange > 0.3 ? 'high' : 'medium',
          score: Math.min(100, balanceChange * 200),
          description: `Balance decreased by ${(balanceChange * 100).toFixed(1)}% in the last 24 hours`,
          evidence: [{
            timestamp: new Date().toISOString(),
            type: 'balance_change',
            description: `From ${recentBalance[0].balance.toFixed(4)} to ${recentBalance[recentBalance.length - 1].balance.toFixed(4)} ETH`,
            data: { startBalance: recentBalance[0].balance, endBalance: recentBalance[recentBalance.length - 1].balance },
          }],
          firstDetected: new Date().toISOString(),
          lastOccurrence: new Date().toISOString(),
          occurrenceCount: 1,
          mitigationStatus: 'unaddressed',
        });
      }

      riskFactors.push({
        factor: 'Balance Stability',
        score: Math.min(100, balanceChange * 200),
        weight: 0.3,
        description: `Balance change rate: ${(balanceChange * 100).toFixed(1)}%`,
        trend: balanceChange > 0.05 ? 'worsening' : balanceChange < 0.01 ? 'improving' : 'stable',
      });
    }

    // Analyze transaction frequency
    if (transactions.length > 0) {
      const recentTx = transactions.filter(t => {
        const txTime = new Date(t.timestamp).getTime();
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return txTime > dayAgo;
      });

      const avgDailyTx = transactions.length / Math.max(1, this.getDaysSpan(transactions));
      
      if (recentTx.length > avgDailyTx * 3) {
        threats.push({
          id: `threat-high-freq-${Date.now()}`,
          type: 'high_frequency',
          severity: recentTx.length > avgDailyTx * 5 ? 'high' : 'medium',
          score: Math.min(100, (recentTx.length / avgDailyTx) * 20),
          description: `Unusually high transaction frequency: ${recentTx.length} transactions in last 24h vs ${avgDailyTx.toFixed(1)} average`,
          evidence: [{
            timestamp: new Date().toISOString(),
            type: 'frequency_spike',
            description: `${recentTx.length} transactions detected`,
            data: { recentCount: recentTx.length, averageDaily: avgDailyTx },
          }],
          firstDetected: new Date().toISOString(),
          lastOccurrence: new Date().toISOString(),
          occurrenceCount: 1,
          mitigationStatus: 'unaddressed',
        });
      }

      riskFactors.push({
        factor: 'Transaction Frequency',
        score: Math.min(100, (recentTx.length / Math.max(1, avgDailyTx)) * 20),
        weight: 0.2,
        description: `${recentTx.length} transactions in last 24h`,
        trend: recentTx.length > avgDailyTx * 2 ? 'worsening' : 'stable',
      });
    }

    // Analyze large transfers
    const outgoingTx = transactions.filter(t => t.type === 'outgoing');
    if (outgoingTx.length > 5) {
      const amounts = outgoingTx.map(t => t.amount);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const largeTransfers = outgoingTx.filter(t => t.amount > avgAmount * this.config.security.unusualAmountMultiplier);

      if (largeTransfers.length > 0) {
        threats.push({
          id: `threat-large-transfer-${Date.now()}`,
          type: 'large_transfer',
          severity: largeTransfers.some(t => t.amount > avgAmount * 5) ? 'high' : 'medium',
          score: Math.min(100, largeTransfers.length * 25),
          description: `${largeTransfers.length} unusually large transfers detected`,
          evidence: largeTransfers.slice(0, 3).map(t => ({
            timestamp: t.timestamp,
            type: 'large_amount',
            description: `Transfer of ${t.amount.toFixed(4)} ETH (${(t.amount / avgAmount).toFixed(1)}x average)`,
            data: { amount: t.amount, average: avgAmount },
          })),
          firstDetected: largeTransfers[0].timestamp,
          lastOccurrence: largeTransfers[largeTransfers.length - 1].timestamp,
          occurrenceCount: largeTransfers.length,
          mitigationStatus: 'unaddressed',
        });
      }

      riskFactors.push({
        factor: 'Transfer Size',
        score: Math.min(100, largeTransfers.length * 25),
        weight: 0.25,
        description: `${largeTransfers.length} large transfers detected`,
        trend: largeTransfers.length > 2 ? 'worsening' : 'stable',
      });
    }

    // Add anomaly-based risk factor
    const highSeverityAnomalies = anomalies.filter(a => a.severity > 60);
    riskFactors.push({
      factor: 'Anomaly Detection',
      score: Math.min(100, highSeverityAnomalies.length * 15),
      weight: 0.25,
      description: `${highSeverityAnomalies.length} high-severity anomalies detected`,
      trend: highSeverityAnomalies.length > 3 ? 'worsening' : 'stable',
    });

    // Calculate overall threat score
    const threatScore = riskFactors.reduce((sum, rf) => sum + rf.score * rf.weight, 0);

    // Determine threat level
    let overallThreatLevel: ThreatLevel = 'none';
    if (threatScore >= 80) overallThreatLevel = 'critical';
    else if (threatScore >= 60) overallThreatLevel = 'high';
    else if (threatScore >= 40) overallThreatLevel = 'medium';
    else if (threatScore >= 20) overallThreatLevel = 'low';

    // Generate recommendations
    if (threatScore > 60) {
      recommendations.push({
        priority: 'high',
        type: 'immediate_action',
        title: 'Review Recent Activity',
        description: 'High threat score detected. Review all recent transactions immediately.',
        suggestedAction: 'Pause automated transactions and verify all recent activity',
        relatedThreat: threats[0]?.id,
      });
    }

    if (threats.some(t => t.type === 'rapid_drain')) {
      recommendations.push({
        priority: 'critical',
        type: 'alert_config',
        title: 'Lower Balance Alert Threshold',
        description: 'Rapid balance drain detected. Consider lowering your low balance alert threshold.',
        suggestedAction: 'Set low balance alert to trigger earlier',
      });
    }

    if (anomalies.length > 5) {
      recommendations.push({
        priority: 'medium',
        type: 'alert_config',
        title: 'Enable Anomaly Alerts',
        description: 'Multiple anomalies detected. Consider enabling real-time anomaly alerts.',
        suggestedAction: 'Configure alerts for unusual transaction patterns',
      });
    }

    return {
      overallThreatLevel,
      threatScore,
      detectedThreats: threats,
      riskFactors,
      recommendations,
      lastAnalysis: new Date().toISOString(),
    };
  }

  private getDaysSpan(transactions: TransactionDataPoint[]): number {
    if (transactions.length < 2) return 1;
    const timestamps = transactions.map(t => new Date(t.timestamp).getTime());
    const span = Math.max(...timestamps) - Math.min(...timestamps);
    return Math.max(1, span / (24 * 60 * 60 * 1000));
  }

  // ==================== SPENDING PATTERN ANALYSIS ====================

  analyzeSpendingPatterns(transactions: TransactionDataPoint[]): SpendingPatternAnalysis {
    const outgoing = transactions.filter(t => t.type === 'outgoing');

    // Daily pattern (hourly distribution)
    const hourlyDistribution = new Array(24).fill(0);
    outgoing.forEach(t => {
      const hour = new Date(t.timestamp).getHours();
      hourlyDistribution[hour] += t.amount;
    });

    const avgPerHour = hourlyDistribution.reduce((a, b) => a + b, 0) / 24;
    const peakHours = hourlyDistribution
      .map((v, i) => ({ hour: i, value: v }))
      .filter(h => h.value > avgPerHour * 1.5)
      .map(h => h.hour);
    const quietHours = hourlyDistribution
      .map((v, i) => ({ hour: i, value: v }))
      .filter(h => h.value < avgPerHour * 0.3)
      .map(h => h.hour);

    const dailyPattern: DailyPattern = {
      hourlyDistribution,
      peakHours,
      quietHours,
      averagePerHour: avgPerHour,
    };

    // Weekly pattern
    const dailyDistribution = new Array(7).fill(0);
    outgoing.forEach(t => {
      const day = new Date(t.timestamp).getDay();
      dailyDistribution[day] += t.amount;
    });

    const avgPerDay = dailyDistribution.reduce((a, b) => a + b, 0) / 7;
    const peakDays = dailyDistribution
      .map((v, i) => ({ day: i, value: v }))
      .filter(d => d.value > avgPerDay * 1.3)
      .map(d => d.day);

    const weekendSpending = dailyDistribution[0] + dailyDistribution[6];
    const weekdaySpending = dailyDistribution.slice(1, 6).reduce((a, b) => a + b, 0);

    const weeklyPattern: WeeklyPattern = {
      dailyDistribution,
      peakDays,
      averagePerDay: avgPerDay,
      weekendVsWeekday: weekdaySpending > 0 ? weekendSpending / weekdaySpending : 0,
    };

    // Projected spending
    const totalSpending = outgoing.reduce((sum, t) => sum + t.amount, 0);
    const daysSpan = this.getDaysSpan(transactions);
    const dailyAvg = totalSpending / daysSpan;

    // Trend analysis for spending
    const spendingByDay: number[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    const startTime = Math.min(...transactions.map(t => new Date(t.timestamp).getTime()));
    
    for (let d = 0; d < daysSpan; d++) {
      const dayStart = startTime + d * dayMs;
      const dayEnd = dayStart + dayMs;
      const daySpending = outgoing
        .filter(t => {
          const time = new Date(t.timestamp).getTime();
          return time >= dayStart && time < dayEnd;
        })
        .reduce((sum, t) => sum + t.amount, 0);
      spendingByDay.push(daySpending);
    }

    const { slope } = this.linearRegression(
      spendingByDay.map((_, i) => i),
      spendingByDay
    );

    let spendingTrend: TrendDirection = 'stable';
    const normalizedSlope = dailyAvg > 0 ? slope / dailyAvg : 0;
    if (normalizedSlope > 0.1) spendingTrend = 'strongly_increasing';
    else if (normalizedSlope > 0.03) spendingTrend = 'increasing';
    else if (normalizedSlope < -0.1) spendingTrend = 'strongly_decreasing';
    else if (normalizedSlope < -0.03) spendingTrend = 'decreasing';

    const projectedSpending: ProjectedSpending = {
      daily: dailyAvg,
      weekly: dailyAvg * 7,
      monthly: dailyAvg * 30,
      confidence: Math.min(100, transactions.length * 2),
      trend: spendingTrend,
    };

    // Detect unusual patterns
    const unusualPatterns: UnusualPattern[] = [];
    
    // Check for spending spikes
    spendingByDay.forEach((spending, i) => {
      if (spending > dailyAvg * 3 && dailyAvg > 0) {
        unusualPatterns.push({
          id: `pattern-spike-${i}`,
          type: 'amount_spike',
          description: `Spending spike of ${spending.toFixed(4)} ETH (${(spending / dailyAvg).toFixed(1)}x average)`,
          startTime: new Date(startTime + i * dayMs).toISOString(),
          severity: Math.min(100, (spending / dailyAvg) * 20),
          affectedTransactions: outgoing.filter(t => {
            const time = new Date(t.timestamp).getTime();
            return time >= startTime + i * dayMs && time < startTime + (i + 1) * dayMs;
          }).length,
        });
      }
    });

    return {
      dailyPattern,
      weeklyPattern,
      categoryBreakdown: [], // Would need contract analysis for categories
      unusualPatterns,
      projectedSpending,
    };
  }

  // ==================== PROACTIVE RECOMMENDATIONS ====================

  generateProactiveRecommendations(
    trendAnalysis: TrendAnalysis,
    anomalyResult: AnomalyDetectionResult,
    prediction: BalancePrediction,
    securityAnalysis: SecurityThreatAnalysis,
    spendingPatterns: SpendingPatternAnalysis,
    currentBalance: number
  ): ProactiveAlertRecommendation[] {
    const recommendations: ProactiveAlertRecommendation[] = [];

    // Recommendation based on trend analysis
    if (trendAnalysis.direction === 'strongly_decreasing' || trendAnalysis.direction === 'decreasing') {
      const suggestedThreshold = currentBalance * 0.3;
      recommendations.push({
        id: `rec-trend-${Date.now()}`,
        type: 'threshold_adjustment',
        priority: trendAnalysis.direction === 'strongly_decreasing' ? 'high' : 'medium',
        title: 'Adjust Low Balance Threshold',
        description: `Your balance is ${trendAnalysis.direction.replace('_', ' ')}. Consider setting a higher low balance alert threshold.`,
        reasoning: `Based on trend analysis showing ${(Math.abs(trendAnalysis.slope) / currentBalance * 100).toFixed(1)}% decline rate`,
        basedOn: [{
          type: 'trend_analysis',
          confidence: trendAnalysis.rSquared * 100,
          dataPoints: 30,
          summary: `R² = ${trendAnalysis.rSquared.toFixed(2)}, Slope = ${trendAnalysis.slope.toFixed(6)}`,
        }],
        suggestedConfig: {
          alertType: 'low_balance',
          thresholdValue: suggestedThreshold,
        },
        expectedImpact: {
          falsePositiveReduction: 0,
          detectionImprovement: 30,
          responseTimeImprovement: 60,
          securityScoreImpact: 10,
        },
        createdAt: new Date().toISOString(),
      });
    }

    // Recommendation based on anomaly detection
    if (anomalyResult.anomalyRate > 10) {
      recommendations.push({
        id: `rec-anomaly-${Date.now()}`,
        type: 'new_alert',
        priority: anomalyResult.anomalyRate > 20 ? 'high' : 'medium',
        title: 'Enable Anomaly Detection Alerts',
        description: `${anomalyResult.anomalyRate.toFixed(1)}% of your transactions are flagged as anomalous. Enable real-time anomaly alerts.`,
        reasoning: `High anomaly rate detected with ${anomalyResult.anomalies.length} anomalous transactions`,
        basedOn: [{
          type: 'anomaly_detection',
          confidence: anomalyResult.modelConfidence,
          dataPoints: anomalyResult.anomalies.length,
          summary: `Anomaly rate: ${anomalyResult.anomalyRate.toFixed(1)}%`,
        }],
        suggestedConfig: {
          alertType: 'balance_change',
          thresholdPercentage: 15,
        },
        expectedImpact: {
          falsePositiveReduction: -10,
          detectionImprovement: 50,
          responseTimeImprovement: 30,
          securityScoreImpact: 20,
        },
        createdAt: new Date().toISOString(),
      });
    }

    // Recommendation based on prediction warnings
    prediction.warnings.forEach((warning, i) => {
      if (warning.severity === 'high' || warning.severity === 'medium') {
        recommendations.push({
          id: `rec-prediction-${i}-${Date.now()}`,
          type: 'threshold_adjustment',
          priority: warning.severity === 'high' ? 'high' : 'medium',
          title: `Predicted ${warning.type.replace('_', ' ')}`,
          description: warning.message,
          reasoning: `Balance prediction model (${prediction.confidence} confidence) forecasts potential issue`,
          basedOn: [{
            type: 'prediction',
            confidence: prediction.confidence === 'very_high' ? 95 : prediction.confidence === 'high' ? 80 : 60,
            dataPoints: prediction.predictions.length,
            summary: `MAPE: ${prediction.metrics.mape.toFixed(1)}%, R²: ${prediction.metrics.r2.toFixed(2)}`,
          }],
          suggestedConfig: warning.suggestedThreshold ? {
            alertType: 'low_balance',
            thresholdValue: warning.suggestedThreshold,
          } : undefined,
          expectedImpact: {
            falsePositiveReduction: 0,
            detectionImprovement: 40,
            responseTimeImprovement: 120,
            securityScoreImpact: 15,
          },
          createdAt: new Date().toISOString(),
          expiresAt: warning.predictedDate,
        });
      }
    });

    // Recommendation based on security threats
    if (securityAnalysis.threatScore > 40) {
      recommendations.push({
        id: `rec-security-${Date.now()}`,
        type: 'new_alert',
        priority: securityAnalysis.overallThreatLevel === 'critical' ? 'critical' : 
                  securityAnalysis.overallThreatLevel === 'high' ? 'high' : 'medium',
        title: 'Enhanced Security Monitoring',
        description: `Threat score of ${securityAnalysis.threatScore.toFixed(0)} detected. Enable enhanced security alerts.`,
        reasoning: `${securityAnalysis.detectedThreats.length} security threats identified`,
        basedOn: [{
          type: 'security_threat',
          confidence: 85,
          dataPoints: securityAnalysis.detectedThreats.length,
          summary: `Threat level: ${securityAnalysis.overallThreatLevel}`,
        }],
        suggestedConfig: {
          alertType: 'balance_change',
          thresholdPercentage: 10,
          cooldownMinutes: 15,
        },
        expectedImpact: {
          falsePositiveReduction: -5,
          detectionImprovement: 60,
          responseTimeImprovement: 45,
          securityScoreImpact: 30,
        },
        createdAt: new Date().toISOString(),
      });
    }

    // Recommendation based on spending patterns
    if (spendingPatterns.projectedSpending.trend === 'strongly_increasing') {
      recommendations.push({
        id: `rec-spending-${Date.now()}`,
        type: 'threshold_adjustment',
        priority: 'medium',
        title: 'Adjust for Increased Spending',
        description: 'Your spending is trending upward. Consider adjusting alert thresholds to match new patterns.',
        reasoning: `Projected daily spending: ${spendingPatterns.projectedSpending.daily.toFixed(4)} ETH`,
        basedOn: [{
          type: 'pattern_analysis',
          confidence: spendingPatterns.projectedSpending.confidence,
          dataPoints: 30,
          summary: `Spending trend: ${spendingPatterns.projectedSpending.trend}`,
        }],
        suggestedConfig: {
          alertType: 'balance_change',
          thresholdPercentage: Math.min(50, (spendingPatterns.projectedSpending.daily / currentBalance) * 100 * 2),
        },
        expectedImpact: {
          falsePositiveReduction: 30,
          detectionImprovement: 10,
          responseTimeImprovement: 0,
          securityScoreImpact: 5,
        },
        createdAt: new Date().toISOString(),
      });
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  // ==================== FULL ANALYSIS ====================

  performFullAnalysis(
    walletAddress: string,
    balanceHistory: BalanceDataPoint[],
    transactions: TransactionDataPoint[],
    gasHistory: GasDataPoint[]
  ): MLAnalysisSummary {
    const currentBalance = balanceHistory.length > 0 
      ? balanceHistory[balanceHistory.length - 1].balance 
      : 0;

    // Perform all analyses
    const trendAnalysis = this.analyzeTrend(balanceHistory);
    const anomalyDetection = this.detectAnomalies(transactions, balanceHistory);
    const balancePrediction = this.predictBalance(balanceHistory, transactions);
    const securityAnalysis = this.analyzeSecurityThreats(transactions, balanceHistory, anomalyDetection.anomalies);
    const spendingPatterns = this.analyzeSpendingPatterns(transactions);

    // Generate proactive recommendations
    const proactiveRecommendations = this.generateProactiveRecommendations(
      trendAnalysis,
      anomalyDetection,
      balancePrediction,
      securityAnalysis,
      spendingPatterns,
      currentBalance
    );

    // Determine data quality
    const totalPoints = balanceHistory.length + transactions.length + gasHistory.length;
    let dataQuality: 'insufficient' | 'fair' | 'good' | 'excellent' = 'insufficient';
    if (totalPoints >= 200) dataQuality = 'excellent';
    else if (totalPoints >= 100) dataQuality = 'good';
    else if (totalPoints >= 30) dataQuality = 'fair';

    // Calculate time range
    const allTimestamps = [
      ...balanceHistory.map(b => new Date(b.timestamp).getTime()),
      ...transactions.map(t => new Date(t.timestamp).getTime()),
    ];
    const startTime = allTimestamps.length > 0 ? Math.min(...allTimestamps) : Date.now();
    const endTime = allTimestamps.length > 0 ? Math.max(...allTimestamps) : Date.now();

    const summary: MLAnalysisSummary = {
      walletAddress,
      analysisTimestamp: new Date().toISOString(),
      dataQuality,
      dataPointsAnalyzed: totalPoints,
      timeRangeAnalyzed: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
        durationHours: (endTime - startTime) / (60 * 60 * 1000),
      },
      trendAnalysis,
      anomalyDetection,
      balancePrediction,
      securityAnalysis,
      spendingPatterns,
      proactiveRecommendations,
      modelPerformance: {
        lastTrainingDate: new Date().toISOString(),
        accuracy: balancePrediction.metrics.r2 * 100,
        precision: 100 - balancePrediction.metrics.mape,
        recall: anomalyDetection.modelConfidence,
      },
    };

    // Cache the result
    this.modelCache.set(walletAddress.toLowerCase(), summary);

    return summary;
  }

  // Get cached analysis
  getCachedAnalysis(walletAddress: string): MLAnalysisSummary | undefined {
    return this.modelCache.get(walletAddress.toLowerCase());
  }

  // Clear cache
  clearCache() {
    this.modelCache.clear();
  }
}

export const mlAnalyticsService = new MLAnalyticsService();
