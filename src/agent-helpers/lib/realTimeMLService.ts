// Real-Time ML Monitoring Service
// Provides streaming anomaly detection, incremental trend updates, and real-time alerts

import {
  SensitivityConfig,
  SensitivityLevel,
  SENSITIVITY_PRESETS,
  RealTimeTransaction,
  RealTimeAnomalyResult,
  IncrementalStats,
  IncrementalTrendState,
  IncrementalPredictionState,
  WalletMonitoringState,
  RealTimeAlert,
  MonitoringSession,
  RealTimeMonitoringConfig,
  DEFAULT_REALTIME_CONFIG,
  TransactionCallback,
  AnomalyCallback,
  AlertCallback,
  RiskUpdateCallback,
  EventCallback,
  RealTimeEvent,
  getThreatLevelFromScore,
  RISK_THRESHOLDS,
} from '@/agent-helpers/types/realTimeML';
import { AnomalyType, ThreatLevel, TrendDirection } from '@/agent-helpers/types/mlAnalytics';
import { PreTrainedModelState } from '@/agent-helpers/types/historicalTraining';
import { blockchainDataService } from '@/lib/web3/blockchainDataService';



class RealTimeMLService {
  private config: RealTimeMonitoringConfig = DEFAULT_REALTIME_CONFIG;
  private sensitivityConfig: SensitivityConfig = SENSITIVITY_PRESETS.medium;
  private session: MonitoringSession | null = null;
  private walletStates: Map<string, WalletMonitoringState> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastKnownBalances: Map<string, number> = new Map();
  private lastKnownTxCounts: Map<string, number> = new Map();

  // Callbacks
  private transactionCallbacks: TransactionCallback[] = [];
  private anomalyCallbacks: AnomalyCallback[] = [];
  private alertCallbacks: AlertCallback[] = [];
  private riskUpdateCallbacks: RiskUpdateCallback[] = [];
  private eventCallbacks: EventCallback[] = [];

  // ==================== CONFIGURATION ====================

  updateConfig(config: Partial<RealTimeMonitoringConfig>) {
    this.config = { ...this.config, ...config };
  }

  setSensitivity(level: SensitivityLevel) {
    this.sensitivityConfig = SENSITIVITY_PRESETS[level];
    this.emitEvent({
      type: 'connection_status',
      timestamp: new Date().toISOString(),
      data: { sensitivityLevel: level },
    });
  }

  getSensitivity(): SensitivityConfig {
    return this.sensitivityConfig;
  }

  getCustomSensitivity(): SensitivityConfig {
    return { ...this.sensitivityConfig };
  }

  setCustomSensitivity(config: Partial<SensitivityConfig>) {
    this.sensitivityConfig = { ...this.sensitivityConfig, ...config };
  }

  // ==================== SESSION MANAGEMENT ====================

  startMonitoring(walletAddresses: string[]): MonitoringSession {
    // Stop any existing session
    this.stopMonitoring();

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.session = {
      sessionId,
      startedAt: new Date().toISOString(),
      wallets: walletAddresses,
      sensitivityConfig: this.sensitivityConfig,
      totalTransactionsProcessed: 0,
      totalAnomaliesDetected: 0,
      totalAlertsTriggered: 0,
      averageProcessingTimeMs: 0,
      isActive: true,
    };

    // Initialize wallet states
    for (const address of walletAddresses) {
      this.initializeWalletState(address);
      this.startPollingWallet(address);
    }

    this.emitEvent({
      type: 'connection_status',
      timestamp: new Date().toISOString(),
      data: { status: 'connected', sessionId },
    });

    return this.session;
  }

  stopMonitoring() {
    // Stop all polling
    for (const [address, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    if (this.session) {
      this.session.isActive = false;
    }

    this.emitEvent({
      type: 'connection_status',
      timestamp: new Date().toISOString(),
      data: { status: 'disconnected' },
    });
  }

  getSession(): MonitoringSession | null {
    return this.session;
  }

  isMonitoring(): boolean {
    return this.session?.isActive ?? false;
  }

  // ==================== WALLET STATE MANAGEMENT ====================

  private initializeWalletState(address: string) {
    const state: WalletMonitoringState = {
      walletAddress: address.toLowerCase(),
      isActive: true,
      currentRiskScore: 0,
      threatLevel: 'none',
      activeAnomalies: [],
      recentTransactions: [],
      incrementalStats: {
        amounts: this.createEmptyStats(),
        gasUsage: this.createEmptyStats(),
        frequency: this.createEmptyStats(),
      },
      trendState: this.createEmptyTrendState(),
      predictionState: this.createEmptyPredictionState(),
      alertHistory: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    this.walletStates.set(address.toLowerCase(), state);
  }

  private createEmptyStats(): IncrementalStats {
    return {
      count: 0,
      sum: 0,
      sumSquares: 0,
      min: Infinity,
      max: -Infinity,
      mean: 0,
      variance: 0,
      stdDev: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private createEmptyTrendState(): IncrementalTrendState {
    return {
      direction: 'stable',
      slope: 0,
      momentum: 0,
      volatility: 0,
      lastValues: [],
      windowSize: 20,
      sumX: 0,
      sumY: 0,
      sumXY: 0,
      sumX2: 0,
      n: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private createEmptyPredictionState(): IncrementalPredictionState {
    return {
      emaValue: 0,
      emaTrend: 0,
      alpha: 0.3,
      beta: 0.1,
      lastPrediction: 0,
      predictionError: 0,
      mape: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  getWalletState(address: string): WalletMonitoringState | undefined {
    return this.walletStates.get(address.toLowerCase());
  }

  getAllWalletStates(): WalletMonitoringState[] {
    return Array.from(this.walletStates.values());
  }

  // ==================== POLLING & TRANSACTION DETECTION ====================

  private startPollingWallet(address: string) {
    const poll = async () => {
      try {
        await this.checkForNewTransactions(address);
      } catch (error) {
        console.error(`Error polling wallet ${address}:`, error);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    const interval = setInterval(poll, this.config.pollingIntervalMs);
    this.pollingIntervals.set(address.toLowerCase(), interval);
  }

  private async checkForNewTransactions(address: string) {
    const normalizedAddress = address.toLowerCase();
    const state = this.walletStates.get(normalizedAddress);
    if (!state || !state.isActive) return;

    try {
      // Get current balance
      const currentBalance = await blockchainDataService.getCurrentBalance(address);
      const lastBalance = this.lastKnownBalances.get(normalizedAddress);

      // Detect balance change (potential transaction)
      if (lastBalance !== undefined && Math.abs(currentBalance - lastBalance) > 0.0001) {
        const balanceChange = currentBalance - lastBalance;
        const isOutgoing = balanceChange < 0;

        // Create synthetic transaction from balance change
        const tx: RealTimeTransaction = {
          id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          hash: `0x${Math.random().toString(16).substr(2, 64)}`,
          timestamp: new Date().toISOString(),
          from: isOutgoing ? address : 'unknown',
          to: isOutgoing ? 'unknown' : address,
          value: Math.abs(balanceChange),
          valueUSD: Math.abs(balanceChange) * 2500, // Approximate ETH price
          gasUsed: 21000,
          gasPrice: 30,
          gasCost: 0.00063,
          type: isOutgoing ? 'outgoing' : 'incoming',
          status: 'confirmed',
        };

        await this.processTransaction(normalizedAddress, tx);
      }

      this.lastKnownBalances.set(normalizedAddress, currentBalance);

      // Update state
      state.lastUpdated = new Date().toISOString();
    } catch (error) {
      console.error(`Error checking transactions for ${address}:`, error);
    }
  }

  // ==================== TRANSACTION PROCESSING ====================

  async processTransaction(walletAddress: string, tx: RealTimeTransaction): Promise<RealTimeAnomalyResult> {
    const startTime = performance.now();
    const normalizedAddress = walletAddress.toLowerCase();
    const state = this.walletStates.get(normalizedAddress);

    if (!state) {
      throw new Error(`Wallet ${walletAddress} is not being monitored`);
    }

    // Add to recent transactions
    state.recentTransactions.unshift(tx);
    if (state.recentTransactions.length > this.config.maxTransactionsInMemory) {
      state.recentTransactions.pop();
    }
    state.lastTransaction = tx;

    // Update incremental statistics
    this.updateIncrementalStats(state.incrementalStats.amounts, tx.value);
    this.updateIncrementalStats(state.incrementalStats.gasUsage, tx.gasUsed);

    // Update frequency stats (time since last transaction)
    if (state.recentTransactions.length > 1) {
      const prevTx = state.recentTransactions[1];
      const timeDiff = new Date(tx.timestamp).getTime() - new Date(prevTx.timestamp).getTime();
      this.updateIncrementalStats(state.incrementalStats.frequency, timeDiff / 1000); // in seconds
    }

    // Perform anomaly detection
    const anomalyResult = this.detectAnomaly(state, tx);

    // Update trend if enabled
    if (this.config.enableTrendUpdates) {
      this.updateTrendIncremental(state.trendState, tx.value);
    }

    // Update prediction if enabled
    if (this.config.enablePredictions) {
      this.updatePredictionIncremental(state.predictionState, tx.value);
    }

    // Calculate new risk score
    const newRiskScore = this.calculateRiskScore(state, anomalyResult);
    const oldRiskScore = state.currentRiskScore;
    state.currentRiskScore = newRiskScore;
    state.threatLevel = getThreatLevelFromScore(newRiskScore);

    // Handle anomaly
    if (anomalyResult.isAnomaly) {
      state.activeAnomalies.unshift(anomalyResult);
      if (state.activeAnomalies.length > 20) {
        state.activeAnomalies.pop();
      }
      state.lastAnomaly = anomalyResult;

      if (this.session) {
        this.session.totalAnomaliesDetected++;
      }

      // Emit anomaly event
      this.emitAnomaly(anomalyResult);

      // Check if we should trigger an alert
      if (this.shouldTriggerAlert(state, anomalyResult)) {
        const alert = this.createAlert(state, anomalyResult, tx);
        state.alertHistory.unshift(alert);
        if (state.alertHistory.length > this.config.maxAlertsInMemory) {
          state.alertHistory.pop();
        }
        state.lastAlertTime = alert.timestamp;

        if (this.session) {
          this.session.totalAlertsTriggered++;
        }

        this.emitAlert(alert);
      }
    }

    // Emit risk update if changed significantly
    if (Math.abs(newRiskScore - oldRiskScore) > 5) {
      this.emitRiskUpdate(normalizedAddress, newRiskScore, state.threatLevel);
    }

    // Update session stats
    if (this.session) {
      this.session.totalTransactionsProcessed++;
      const processingTime = performance.now() - startTime;
      this.session.averageProcessingTimeMs = 
        (this.session.averageProcessingTimeMs * (this.session.totalTransactionsProcessed - 1) + processingTime) /
        this.session.totalTransactionsProcessed;
    }

    // Emit transaction event
    this.emitTransaction(tx);

    state.lastUpdated = new Date().toISOString();
    return anomalyResult;
  }

  // ==================== INCREMENTAL STATISTICS ====================

  private updateIncrementalStats(stats: IncrementalStats, value: number) {
    stats.count++;
    stats.sum += value;
    stats.sumSquares += value * value;
    stats.min = Math.min(stats.min, value);
    stats.max = Math.max(stats.max, value);

    // Update mean
    stats.mean = stats.sum / stats.count;

    // Update variance using Welford's algorithm
    if (stats.count > 1) {
      stats.variance = (stats.sumSquares - (stats.sum * stats.sum) / stats.count) / (stats.count - 1);
      stats.stdDev = Math.sqrt(Math.max(0, stats.variance));
    }

    stats.lastUpdated = new Date().toISOString();
  }

  // ==================== INCREMENTAL TREND ANALYSIS ====================

  private updateTrendIncremental(trend: IncrementalTrendState, value: number) {
    // Add to rolling window
    trend.lastValues.push(value);
    if (trend.lastValues.length > trend.windowSize) {
      trend.lastValues.shift();
    }

    // Update regression sums
    trend.n++;
    const x = trend.n;
    trend.sumX += x;
    trend.sumY += value;
    trend.sumXY += x * value;
    trend.sumX2 += x * x;

    // Calculate slope using linear regression
    if (trend.n > 1) {
      const denominator = trend.n * trend.sumX2 - trend.sumX * trend.sumX;
      if (denominator !== 0) {
        trend.slope = (trend.n * trend.sumXY - trend.sumX * trend.sumY) / denominator;
      }
    }

    // Calculate momentum (recent rate of change)
    if (trend.lastValues.length >= 3) {
      const recent = trend.lastValues.slice(-3);
      trend.momentum = (recent[2] - recent[0]) / recent[0] || 0;
    }

    // Calculate volatility (standard deviation of recent values)
    if (trend.lastValues.length >= 5) {
      const mean = trend.lastValues.reduce((a, b) => a + b, 0) / trend.lastValues.length;
      const variance = trend.lastValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / trend.lastValues.length;
      trend.volatility = Math.sqrt(variance);
    }

    // Determine direction
    const normalizedSlope = trend.lastValues.length > 0 
      ? trend.slope / (trend.lastValues.reduce((a, b) => a + b, 0) / trend.lastValues.length || 1)
      : 0;

    if (normalizedSlope > 0.1) trend.direction = 'strongly_increasing';
    else if (normalizedSlope > 0.03) trend.direction = 'increasing';
    else if (normalizedSlope < -0.1) trend.direction = 'strongly_decreasing';
    else if (normalizedSlope < -0.03) trend.direction = 'decreasing';
    else trend.direction = 'stable';

    trend.lastUpdated = new Date().toISOString();

    // Emit trend update
    this.emitEvent({
      type: 'trend_update',
      timestamp: trend.lastUpdated,
      data: {
        direction: trend.direction,
        slope: trend.slope,
        momentum: trend.momentum,
        volatility: trend.volatility,
      },
    });
  }

  // ==================== INCREMENTAL PREDICTION ====================

  private updatePredictionIncremental(pred: IncrementalPredictionState, actualValue: number) {
    // Double exponential smoothing (Holt's method)
    if (pred.emaValue === 0) {
      // Initialize
      pred.emaValue = actualValue;
      pred.emaTrend = 0;
    } else {
      // Calculate prediction error
      pred.predictionError = actualValue - pred.lastPrediction;
      
      // Update MAPE
      if (actualValue !== 0) {
        const ape = Math.abs(pred.predictionError / actualValue);
        pred.mape = pred.mape * 0.9 + ape * 0.1; // Exponential moving average of APE
      }

      // Update level (EMA)
      const prevEma = pred.emaValue;
      pred.emaValue = pred.alpha * actualValue + (1 - pred.alpha) * (pred.emaValue + pred.emaTrend);

      // Update trend
      pred.emaTrend = pred.beta * (pred.emaValue - prevEma) + (1 - pred.beta) * pred.emaTrend;
    }

    // Make next prediction
    pred.lastPrediction = pred.emaValue + pred.emaTrend;
    pred.lastUpdated = new Date().toISOString();

    // Emit prediction update
    this.emitEvent({
      type: 'prediction_update',
      timestamp: pred.lastUpdated,
      data: {
        prediction: pred.lastPrediction,
        mape: pred.mape * 100,
        trend: pred.emaTrend,
      },
    });
  }

  // ==================== ANOMALY DETECTION ====================

  private detectAnomaly(state: WalletMonitoringState, tx: RealTimeTransaction): RealTimeAnomalyResult {
    const stats = state.incrementalStats.amounts;
    const config = this.sensitivityConfig;

    let isAnomaly = false;
    let anomalyScore = 0;
    let anomalyType: AnomalyType | undefined;
    let description = 'Normal transaction';
    let suggestedAction: string | undefined;

    // Calculate Z-score
    const zScore = stats.stdDev > 0 ? (tx.value - stats.mean) / stats.stdDev : 0;
    const absZScore = Math.abs(zScore);

    // Calculate isolation score (how far from median)
    const sortedValues = [...state.recentTransactions.map(t => t.value)].sort((a, b) => a - b);
    const medianIdx = Math.floor(sortedValues.length / 2);
    const median = sortedValues[medianIdx] || tx.value;
    const isolationScore = median > 0 ? Math.abs(tx.value - median) / median : 0;

    // Check for unusual amount
    if (absZScore > config.anomalyThreshold && config.enabledAnomalyTypes.includes('unusual_amount')) {
      isAnomaly = true;
      anomalyType = 'unusual_amount';
      anomalyScore = Math.min(100, absZScore * 20);
      description = `Transaction amount (${tx.value.toFixed(4)} ETH) is ${absZScore.toFixed(1)} standard deviations from average`;
      suggestedAction = anomalyScore > 70 
        ? 'Review transaction immediately and verify authorization'
        : 'Monitor for similar transactions';
    }

    // Check for unusual timing
    const txHour = new Date(tx.timestamp).getHours();
    const isUnusualTime = txHour >= 2 && txHour <= 5; // 2am-5am
    if (isUnusualTime && !isAnomaly && config.enabledAnomalyTypes.includes('unusual_time')) {
      isAnomaly = true;
      anomalyType = 'unusual_time';
      anomalyScore = 40;
      description = `Transaction at ${txHour}:00 is during unusual hours`;
      suggestedAction = 'Verify this transaction was intentional';
    }

    // Check for rapid transactions (frequency)
    if (state.recentTransactions.length >= 3) {
      const recentTimes = state.recentTransactions.slice(0, 3).map(t => new Date(t.timestamp).getTime());
      const avgGap = (recentTimes[0] - recentTimes[2]) / 2;
      if (avgGap < 60000 && config.enabledAnomalyTypes.includes('unusual_frequency')) { // Less than 1 minute average
        if (!isAnomaly || anomalyScore < 60) {
          isAnomaly = true;
          anomalyType = 'unusual_frequency';
          anomalyScore = Math.max(anomalyScore, 60);
          description = 'Unusually high transaction frequency detected';
          suggestedAction = 'Check for automated or scripted transactions';
        }
      }
    }

    // Check for rapid drain pattern
    if (tx.type === 'outgoing' && state.recentTransactions.length >= 5) {
      const recentOutgoing = state.recentTransactions
        .filter(t => t.type === 'outgoing')
        .slice(0, 5);
      const totalOutgoing = recentOutgoing.reduce((sum, t) => sum + t.value, 0);
      const firstBalance = state.recentTransactions[state.recentTransactions.length - 1]?.value || 0;
      
      if (firstBalance > 0 && totalOutgoing / firstBalance > 0.3 && config.enabledAnomalyTypes.includes('rapid_drain')) {
        isAnomaly = true;
        anomalyType = 'rapid_drain';
        anomalyScore = Math.max(anomalyScore, 80);
        description = `Rapid balance drain detected: ${(totalOutgoing / firstBalance * 100).toFixed(1)}% outflow`;
        suggestedAction = 'Immediately review all recent transactions and consider pausing activity';
      }
    }

    // Calculate confidence based on data quality
    const confidence = Math.min(100, stats.count * 5);

    const result: RealTimeAnomalyResult = {
      transactionId: tx.id,
      timestamp: new Date().toISOString(),
      isAnomaly,
      anomalyScore,
      anomalyType,
      zScore,
      isolationScore,
      confidence,
      description,
      suggestedAction,
      triggeredAlert: false, // Will be set later if alert is triggered
    };

    return result;
  }

  // ==================== RISK SCORE CALCULATION ====================

  private calculateRiskScore(state: WalletMonitoringState, latestAnomaly: RealTimeAnomalyResult): number {
    let score = 0;

    // Factor 1: Recent anomalies (40% weight)
    const recentAnomalies = state.activeAnomalies.filter(a => {
      const age = Date.now() - new Date(a.timestamp).getTime();
      return age < 3600000; // Last hour
    });
    const anomalyFactor = Math.min(40, recentAnomalies.length * 10);
    score += anomalyFactor;

    // Factor 2: Latest anomaly severity (30% weight)
    if (latestAnomaly.isAnomaly) {
      score += latestAnomaly.anomalyScore * 0.3;
    }

    // Factor 3: Trend direction (15% weight)
    const trendFactor = {
      'strongly_decreasing': 15,
      'decreasing': 10,
      'stable': 0,
      'increasing': -5,
      'strongly_increasing': -10,
    };
    score += trendFactor[state.trendState.direction] || 0;

    // Factor 4: Volatility (15% weight)
    const normalizedVolatility = state.incrementalStats.amounts.mean > 0
      ? state.trendState.volatility / state.incrementalStats.amounts.mean
      : 0;
    score += Math.min(15, normalizedVolatility * 50);

    return Math.max(0, Math.min(100, score));
  }

  // ==================== ALERT MANAGEMENT ====================

  private shouldTriggerAlert(state: WalletMonitoringState, anomaly: RealTimeAnomalyResult): boolean {
    const config = this.sensitivityConfig;

    // Check confidence threshold
    if (anomaly.confidence < config.minConfidence) {
      return false;
    }

    // Check anomaly type is enabled
    if (anomaly.anomalyType && !config.enabledAnomalyTypes.includes(anomaly.anomalyType)) {
      return false;
    }

    // Check cooldown
    if (state.lastAlertTime) {
      const timeSinceLastAlert = Date.now() - new Date(state.lastAlertTime).getTime();
      if (timeSinceLastAlert < config.alertCooldownMs) {
        return false;
      }
    }

    // Check anomaly score threshold
    return anomaly.anomalyScore >= (100 - config.anomalyThreshold * 20);
  }

  private createAlert(
    state: WalletMonitoringState,
    anomaly: RealTimeAnomalyResult,
    tx: RealTimeTransaction
  ): RealTimeAlert {
    const severity = anomaly.anomalyScore >= 70 ? 'critical' : anomaly.anomalyScore >= 40 ? 'warning' : 'info';

    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: state.walletAddress,
      timestamp: new Date().toISOString(),
      type: 'anomaly',
      severity,
      title: this.getAlertTitle(anomaly.anomalyType),
      message: anomaly.description,
      details: {
        anomalyScore: anomaly.anomalyScore,
        riskScore: state.currentRiskScore,
        transactionHash: tx.hash,
        value: tx.value,
        confidence: anomaly.confidence,
      },
      acknowledged: false,
    };
  }

  private getAlertTitle(type?: AnomalyType): string {
    const titles: Record<AnomalyType, string> = {
      unusual_amount: 'Unusual Transaction Amount',
      unusual_time: 'Unusual Transaction Timing',
      unusual_frequency: 'High Transaction Frequency',
      unusual_recipient: 'New Recipient Detected',
      rapid_drain: 'Rapid Balance Drain',
      suspicious_pattern: 'Suspicious Pattern Detected',
    };
    return type ? titles[type] : 'Anomaly Detected';
  }

  acknowledgeAlert(alertId: string, walletAddress: string) {
    const state = this.walletStates.get(walletAddress.toLowerCase());
    if (!state) return;

    const alert = state.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();
    }
  }

  getRecentAlerts(walletAddress?: string, limit: number = 20): RealTimeAlert[] {
    if (walletAddress) {
      const state = this.walletStates.get(walletAddress.toLowerCase());
      return state?.alertHistory.slice(0, limit) || [];
    }

    // Get alerts from all wallets
    const allAlerts: RealTimeAlert[] = [];
    for (const state of this.walletStates.values()) {
      allAlerts.push(...state.alertHistory);
    }
    return allAlerts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // ==================== CALLBACKS & EVENTS ====================

  onTransaction(callback: TransactionCallback): () => void {
    this.transactionCallbacks.push(callback);
    return () => {
      this.transactionCallbacks = this.transactionCallbacks.filter(cb => cb !== callback);
    };
  }

  onAnomaly(callback: AnomalyCallback): () => void {
    this.anomalyCallbacks.push(callback);
    return () => {
      this.anomalyCallbacks = this.anomalyCallbacks.filter(cb => cb !== callback);
    };
  }

  onAlert(callback: AlertCallback): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      this.alertCallbacks = this.alertCallbacks.filter(cb => cb !== callback);
    };
  }

  onRiskUpdate(callback: RiskUpdateCallback): () => void {
    this.riskUpdateCallbacks.push(callback);
    return () => {
      this.riskUpdateCallbacks = this.riskUpdateCallbacks.filter(cb => cb !== callback);
    };
  }

  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  private emitTransaction(tx: RealTimeTransaction) {
    this.transactionCallbacks.forEach(cb => cb(tx));
    this.emitEvent({ type: 'transaction', timestamp: tx.timestamp, data: tx });
  }

  private emitAnomaly(result: RealTimeAnomalyResult) {
    this.anomalyCallbacks.forEach(cb => cb(result));
    this.emitEvent({ type: 'anomaly', timestamp: result.timestamp, data: result });
  }

  private emitAlert(alert: RealTimeAlert) {
    this.alertCallbacks.forEach(cb => cb(alert));
    this.emitEvent({ type: 'alert', timestamp: alert.timestamp, walletAddress: alert.walletAddress, data: alert });
  }

  private emitRiskUpdate(walletAddress: string, riskScore: number, threatLevel: ThreatLevel) {
    this.riskUpdateCallbacks.forEach(cb => cb(walletAddress, riskScore, threatLevel));
    this.emitEvent({
      type: 'risk_update',
      timestamp: new Date().toISOString(),
      walletAddress,
      data: { riskScore, threatLevel },
    });
  }

  private emitEvent(event: RealTimeEvent) {
    this.eventCallbacks.forEach(cb => cb(event));
  }

  // ==================== MANUAL TRANSACTION INJECTION ====================

  async injectTransaction(walletAddress: string, tx: Partial<RealTimeTransaction>): Promise<RealTimeAnomalyResult> {
    const fullTx: RealTimeTransaction = {
      id: tx.id || `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      hash: tx.hash || `0x${Math.random().toString(16).substr(2, 64)}`,
      timestamp: tx.timestamp || new Date().toISOString(),
      from: tx.from || walletAddress,
      to: tx.to || 'unknown',
      value: tx.value || 0,
      valueUSD: tx.valueUSD || (tx.value || 0) * 2500,
      gasUsed: tx.gasUsed || 21000,
      gasPrice: tx.gasPrice || 30,
      gasCost: tx.gasCost || 0.00063,
      type: tx.type || 'outgoing',
      status: tx.status || 'confirmed',
      blockNumber: tx.blockNumber,
    };

    return this.processTransaction(walletAddress, fullTx);
  }

  // ==================== STATISTICS ====================

  getGlobalRiskScore(): number {
    const states = Array.from(this.walletStates.values());
    if (states.length === 0) return 0;

    const totalRisk = states.reduce((sum, state) => sum + state.currentRiskScore, 0);
    return totalRisk / states.length;
  }

  getStatistics(): {
    totalWallets: number;
    activeWallets: number;
    totalTransactions: number;
    totalAnomalies: number;
    totalAlerts: number;
    averageRiskScore: number;
    highRiskWallets: number;
  } {
    const states = Array.from(this.walletStates.values());
    
    return {
      totalWallets: states.length,
      activeWallets: states.filter(s => s.isActive).length,
      totalTransactions: this.session?.totalTransactionsProcessed || 0,
      totalAnomalies: this.session?.totalAnomaliesDetected || 0,
      totalAlerts: this.session?.totalAlertsTriggered || 0,
      averageRiskScore: this.getGlobalRiskScore(),
      highRiskWallets: states.filter(s => s.currentRiskScore >= RISK_THRESHOLDS.high).length,
    };
  }

  // ==================== PRE-TRAINED MODEL LOADING ====================

  /**
   * Load a pre-trained model state into a wallet's monitoring state.
   * This initializes the incremental statistics, trend state, and prediction state
   * with the values learned from historical data.
   */
  loadPreTrainedModel(preTrainedState: PreTrainedModelState): void {
    const address = preTrainedState.walletAddress.toLowerCase();
    
    // Get or create wallet state
    let state = this.walletStates.get(address);
    if (!state) {
      this.initializeWalletState(address);
      state = this.walletStates.get(address)!;
    }

    // Load pre-trained incremental statistics
    state.incrementalStats = {
      amounts: { ...preTrainedState.incrementalStats.amounts },
      gasUsage: { ...preTrainedState.incrementalStats.gasUsage },
      frequency: { ...preTrainedState.incrementalStats.frequency },
    };

    // Load pre-trained trend state
    state.trendState = { ...preTrainedState.trendState };

    // Load pre-trained prediction state
    state.predictionState = { ...preTrainedState.predictionState };

    // Mark as updated
    state.lastUpdated = new Date().toISOString();

    console.log(`Loaded pre-trained model for wallet ${address}`);
    console.log(`  - Transactions processed: ${preTrainedState.metadata.transactionsProcessed}`);
    console.log(`  - Data quality: ${preTrainedState.metadata.dataQuality}%`);
    console.log(`  - Model version: ${preTrainedState.metadata.modelVersion}`);

    // Emit event
    this.emitEvent({
      type: 'connection_status',
      timestamp: new Date().toISOString(),
      walletAddress: address,
      data: {
        event: 'model_loaded',
        transactionsProcessed: preTrainedState.metadata.transactionsProcessed,
        dataQuality: preTrainedState.metadata.dataQuality,
      },
    });
  }

  /**
   * Check if a wallet has a pre-trained model loaded
   */
  hasPreTrainedModel(walletAddress: string): boolean {
    const state = this.walletStates.get(walletAddress.toLowerCase());
    if (!state) return false;
    
    // A wallet has a pre-trained model if it has significant historical data
    return state.incrementalStats.amounts.count > 10;
  }

  /**
   * Get the training status for a wallet
   */
  getTrainingStatus(walletAddress: string): {
    hasPretrained: boolean;
    transactionCount: number;
    dataQuality: number;
    confidence: number;
  } {
    const state = this.walletStates.get(walletAddress.toLowerCase());
    if (!state) {
      return {
        hasPretrained: false,
        transactionCount: 0,
        dataQuality: 0,
        confidence: 0,
      };
    }

    const txCount = state.incrementalStats.amounts.count;
    const dataQuality = Math.min(100, txCount * 2);
    const confidence = Math.min(100, txCount * 5);

    return {
      hasPretrained: txCount > 10,
      transactionCount: txCount,
      dataQuality,
      confidence,
    };
  }

  /**
   * Start monitoring with pre-trained models
   */
  startMonitoringWithPretrainedModels(
    walletAddresses: string[],
    preTrainedModels: Map<string, PreTrainedModelState>
  ): MonitoringSession {
    // Start regular monitoring
    const session = this.startMonitoring(walletAddresses);

    // Load pre-trained models for wallets that have them
    for (const [address, model] of preTrainedModels) {
      if (walletAddresses.map(a => a.toLowerCase()).includes(address.toLowerCase())) {
        this.loadPreTrainedModel(model);
      }
    }

    return session;
  }
}

export const realTimeMLService = new RealTimeMLService();
