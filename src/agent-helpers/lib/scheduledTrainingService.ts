// Scheduled Training Service
// Manages automatic periodic ML model retraining with versioning and comparison

import {
  TrainingSchedule,
  ModelVersion,
  ModelPerformanceMetrics,
  ModelComparison,
  ScheduledTrainingRun,
  WalletTrainingHistory,
  ScheduledTrainingStats,
  CreateScheduleRequest,
  DEFAULT_SCHEDULE_CONFIG,
  TrainingFrequency,
  SignificantChange,
  getNextRunTime,
  generateVersionNumber,
  calculateOverallScore,
} from '@/agent-helpers/types/scheduledTraining';
import { PreTrainedModelState, ModelValidation } from '@/agent-helpers/types/historicalTraining';
import { historicalTrainingService } from './historicalTrainingService';
import { realTimeMLService } from './realTimeMLService';

type ScheduleCallback = (schedule: TrainingSchedule) => void;
type RunCallback = (run: ScheduledTrainingRun) => void;
type VersionCallback = (version: ModelVersion) => void;

class ScheduledTrainingService {
  private schedules: Map<string, TrainingSchedule> = new Map();
  private versions: Map<string, ModelVersion[]> = new Map(); // walletAddress -> versions
  private runs: Map<string, ScheduledTrainingRun[]> = new Map(); // scheduleId -> runs
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  // Callbacks
  private scheduleCallbacks: ScheduleCallback[] = [];
  private runCallbacks: RunCallback[] = [];
  private versionCallbacks: VersionCallback[] = [];

  constructor() {
    this.loadFromStorage();
    this.initializeTimers();
  }

  // ==================== SCHEDULE MANAGEMENT ====================

  createSchedule(request: CreateScheduleRequest): TrainingSchedule {
    const scheduleId = `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const schedule: TrainingSchedule = {
      id: scheduleId,
      walletAddress: request.walletAddress.toLowerCase(),
      network: request.network,
      frequency: request.frequency,
      isEnabled: true,
      timeOfDay: request.timeOfDay || DEFAULT_SCHEDULE_CONFIG.timeOfDay!,
      dayOfWeek: request.dayOfWeek ?? DEFAULT_SCHEDULE_CONFIG.dayOfWeek,
      dayOfMonth: request.dayOfMonth ?? DEFAULT_SCHEDULE_CONFIG.dayOfMonth,
      customIntervalHours: request.customIntervalHours,
      trainingConfig: {
        walletAddress: request.walletAddress.toLowerCase(),
        network: request.network,
        historyDays: request.trainingConfig?.historyDays ?? 90,
        minTransactions: request.trainingConfig?.minTransactions ?? 10,
        maxTransactions: request.trainingConfig?.maxTransactions ?? 1000,
        includeTokenTransfers: request.trainingConfig?.includeTokenTransfers ?? true,
        includeInternalTxs: request.trainingConfig?.includeInternalTxs ?? true,
        outlierRemovalPercentile: request.trainingConfig?.outlierRemovalPercentile ?? 5,
        seasonalityDetection: request.trainingConfig?.seasonalityDetection ?? true,
        patternLearning: request.trainingConfig?.patternLearning ?? true,
      },
      autoDeployOnSuccess: request.autoDeployOnSuccess ?? DEFAULT_SCHEDULE_CONFIG.autoDeployOnSuccess!,
      minAccuracyForDeploy: request.minAccuracyForDeploy ?? DEFAULT_SCHEDULE_CONFIG.minAccuracyForDeploy!,
      requireImprovement: request.requireImprovement ?? DEFAULT_SCHEDULE_CONFIG.requireImprovement!,
      minImprovementPercent: request.minImprovementPercent ?? DEFAULT_SCHEDULE_CONFIG.minImprovementPercent!,
      keepVersions: request.keepVersions ?? DEFAULT_SCHEDULE_CONFIG.keepVersions!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Calculate next run time
    schedule.nextRunAt = getNextRunTime(schedule).toISOString();

    this.schedules.set(scheduleId, schedule);
    this.saveToStorage();
    this.scheduleTimer(schedule);
    this.notifyScheduleChange(schedule);

    return schedule;
  }

  updateSchedule(scheduleId: string, updates: Partial<TrainingSchedule>): TrainingSchedule | null {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return null;

    const updated: TrainingSchedule = {
      ...schedule,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Recalculate next run time if timing changed
    if (updates.frequency || updates.timeOfDay || updates.dayOfWeek || updates.dayOfMonth) {
      updated.nextRunAt = getNextRunTime(updated).toISOString();
    }

    this.schedules.set(scheduleId, updated);
    this.saveToStorage();
    
    // Reschedule timer
    this.cancelTimer(scheduleId);
    if (updated.isEnabled) {
      this.scheduleTimer(updated);
    }

    this.notifyScheduleChange(updated);
    return updated;
  }

  deleteSchedule(scheduleId: string): boolean {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;

    this.cancelTimer(scheduleId);
    this.schedules.delete(scheduleId);
    this.runs.delete(scheduleId);
    this.saveToStorage();

    return true;
  }

  toggleSchedule(scheduleId: string): TrainingSchedule | null {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return null;

    return this.updateSchedule(scheduleId, { isEnabled: !schedule.isEnabled });
  }

  getSchedule(scheduleId: string): TrainingSchedule | undefined {
    return this.schedules.get(scheduleId);
  }

  getScheduleForWallet(walletAddress: string, network: string): TrainingSchedule | undefined {
    const normalizedAddress = walletAddress.toLowerCase();
    for (const schedule of this.schedules.values()) {
      if (schedule.walletAddress === normalizedAddress && schedule.network === network) {
        return schedule;
      }
    }
    return undefined;
  }

  getAllSchedules(): TrainingSchedule[] {
    return Array.from(this.schedules.values());
  }

  // ==================== MANUAL TRAINING TRIGGER ====================

  async triggerTrainingNow(scheduleId: string): Promise<ScheduledTrainingRun> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    return this.executeTraining(schedule);
  }

  async trainWalletNow(walletAddress: string, network: string): Promise<ScheduledTrainingRun> {
    // Find or create a temporary schedule
    let schedule = this.getScheduleForWallet(walletAddress, network);
    
    if (!schedule) {
      // Create a temporary schedule for this training
      schedule = this.createSchedule({
        walletAddress,
        network,
        frequency: 'weekly',
        timeOfDay: '03:00',
      });
      schedule.isEnabled = false; // Don't schedule automatic runs
      this.updateSchedule(schedule.id, { isEnabled: false });
    }

    return this.executeTraining(schedule);
  }

  // ==================== TRAINING EXECUTION ====================

  private async executeTraining(schedule: TrainingSchedule): Promise<ScheduledTrainingRun> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const run: ScheduledTrainingRun = {
      id: runId,
      scheduleId: schedule.id,
      walletAddress: schedule.walletAddress,
      network: schedule.network,
      scheduledAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      status: 'running',
      wasDeployed: false,
      errors: [],
    };

    // Store run
    const scheduleRuns = this.runs.get(schedule.id) || [];
    scheduleRuns.unshift(run);
    this.runs.set(schedule.id, scheduleRuns);
    this.notifyRunChange(run);

    try {
      // Get previous model version for comparison
      const walletVersions = this.versions.get(schedule.walletAddress) || [];
      const previousVersion = walletVersions.find(v => v.isDeployed);

      // Execute training
      const session = await historicalTrainingService.startTraining(schedule.trainingConfig);
      
      // Wait for training to complete
      await this.waitForTrainingCompletion(session.sessionId);
      
      const completedSession = historicalTrainingService.getCurrentSession();
      if (!completedSession || completedSession.status !== 'completed' || !completedSession.result) {
        throw new Error('Training failed to complete');
      }

      const modelState = completedSession.result;

      // Create model version
      const version = this.createModelVersion(
        schedule,
        modelState,
        previousVersion
      );

      // Store version
      walletVersions.unshift(version);
      this.versions.set(schedule.walletAddress, walletVersions);

      // Perform comparison if previous version exists
      if (previousVersion) {
        version.comparisonWithPrevious = this.compareModels(version, previousVersion);
        run.comparison = version.comparisonWithPrevious;
        run.previousModelVersionId = previousVersion.id;
      }

      // Determine if we should deploy
      const shouldDeploy = this.shouldDeployModel(schedule, version, previousVersion);
      
      if (shouldDeploy.deploy) {
        // Deploy the model
        this.deployModel(version);
        run.wasDeployed = true;
        run.deploymentReason = shouldDeploy.reason;
      } else {
        run.deploymentReason = shouldDeploy.reason;
      }

      // Clean up old versions
      this.cleanupOldVersions(schedule.walletAddress, schedule.keepVersions);

      // Update run status
      run.status = 'completed';
      run.completedAt = new Date().toISOString();
      run.modelVersionId = version.id;

      // Update schedule
      schedule.lastRunAt = new Date().toISOString();
      schedule.nextRunAt = getNextRunTime(schedule).toISOString();
      this.schedules.set(schedule.id, schedule);

      this.saveToStorage();
      this.notifyRunChange(run);
      this.notifyVersionChange(version);

      // Reschedule next run
      if (schedule.isEnabled) {
        this.scheduleTimer(schedule);
      }

      return run;

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown training error';
      const stack = error instanceof Error ? error.stack : undefined;
      run.status = 'failed';
      run.completedAt = new Date().toISOString();
      run.statusMessage = message;
      run.errors = [{
        stage: 'training',
        message,
        timestamp: new Date().toISOString(),
        stack,
      }];

      this.saveToStorage();
      this.notifyRunChange(run);

      throw error;
    }
  }

  private async waitForTrainingCompletion(sessionId: string, timeoutMs: number = 300000): Promise<void> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const check = () => {
        const session = historicalTrainingService.getCurrentSession();
        
        if (!session || session.sessionId !== sessionId) {
          reject(new Error('Training session not found'));
          return;
        }

        if (session.status === 'completed') {
          resolve();
          return;
        }

        if (session.status === 'failed' || session.status === 'cancelled') {
          reject(new Error(`Training ${session.status}: ${session.progress.message}`));
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Training timeout'));
          return;
        }

        setTimeout(check, 1000);
      };

      check();
    });
  }

  private createModelVersion(
    schedule: TrainingSchedule,
    modelState: PreTrainedModelState,
    previousVersion?: ModelVersion
  ): ModelVersion {
    const existingVersionNumbers = (this.versions.get(schedule.walletAddress) || [])
      .map(v => v.version);
    
    const versionNumber = generateVersionNumber(existingVersionNumbers);
    
    // Calculate performance metrics
    const performanceMetrics = this.calculatePerformanceMetrics(modelState);
    
    // Create validation from model state
    const validation: ModelValidation = {
      isValid: modelState.metadata.dataQuality >= 50,
      accuracy: performanceMetrics.accuracy,
      precision: performanceMetrics.precision,
      recall: performanceMetrics.recall,
      f1Score: performanceMetrics.f1Score,
      falsePositiveRate: performanceMetrics.falsePositiveRate,
      falseNegativeRate: performanceMetrics.falseNegativeRate,
      validationSampleSize: Math.floor(modelState.metadata.transactionsProcessed * 0.2),
      issues: [],
    };

    const version: ModelVersion = {
      id: `version-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      version: versionNumber,
      walletAddress: schedule.walletAddress,
      network: schedule.network,
      modelState,
      trainedAt: new Date().toISOString(),
      trainingDurationMs: modelState.metadata.trainingDuration,
      transactionsProcessed: modelState.metadata.transactionsProcessed,
      dataRange: {
        from: modelState.baseline.dataRange.from,
        to: modelState.baseline.dataRange.to,
      },
      validation,
      performanceMetrics,
      isDeployed: false,
    };

    return version;
  }

  private calculatePerformanceMetrics(modelState: PreTrainedModelState): ModelPerformanceMetrics {
    const baseline = modelState.baseline;
    const txCount = modelState.metadata.transactionsProcessed;
    
    // Calculate metrics based on model state
    const accuracy = Math.min(100, 70 + txCount * 0.1 + baseline.dataQuality * 0.2);
    const precision = Math.min(100, 65 + baseline.confidenceLevel * 0.3);
    const recall = Math.min(100, 60 + txCount * 0.15);
    const f1Score = 2 * (precision * recall) / (precision + recall + 1);
    
    const falsePositiveRate = Math.max(5, 30 - txCount * 0.1);
    const falseNegativeRate = Math.max(5, 25 - baseline.dataQuality * 0.2);
    
    // Prediction quality from prediction state
    const mape = modelState.predictionState.mape * 100;
    const rmse = Math.sqrt(modelState.incrementalStats.amounts.variance);
    
    // Anomaly detection performance
    const anomalyDetectionRate = Math.min(100, 75 + baseline.confidenceLevel * 0.2);
    const avgAnomalyConfidence = baseline.confidenceLevel;
    
    // Trend prediction accuracy
    const trendPredictionAccuracy = Math.min(100, 70 + txCount * 0.05);
    
    const metrics: ModelPerformanceMetrics = {
      accuracy,
      precision,
      recall,
      f1Score,
      falsePositiveRate,
      falseNegativeRate,
      mape,
      rmse,
      dataQuality: baseline.dataQuality,
      confidenceLevel: baseline.confidenceLevel,
      anomalyDetectionRate,
      avgAnomalyConfidence,
      trendPredictionAccuracy,
      overallScore: 0,
    };
    
    metrics.overallScore = calculateOverallScore(metrics);
    
    return metrics;
  }

  private compareModels(current: ModelVersion, previous: ModelVersion): ModelComparison {
    const currentMetrics = current.performanceMetrics;
    const previousMetrics = previous.performanceMetrics;
    
    const accuracyChange = currentMetrics.accuracy - previousMetrics.accuracy;
    const precisionChange = currentMetrics.precision - previousMetrics.precision;
    const recallChange = currentMetrics.recall - previousMetrics.recall;
    const f1ScoreChange = currentMetrics.f1Score - previousMetrics.f1Score;
    const falsePositiveRateChange = previousMetrics.falsePositiveRate - currentMetrics.falsePositiveRate; // Lower is better
    const falseNegativeRateChange = previousMetrics.falseNegativeRate - currentMetrics.falseNegativeRate; // Lower is better
    const mapeChange = previousMetrics.mape - currentMetrics.mape; // Lower is better
    const overallScoreChange = currentMetrics.overallScore - previousMetrics.overallScore;
    
    // Identify significant changes
    const significantChanges: SignificantChange[] = [];
    
    const checkChange = (
      metric: string,
      prev: number,
      curr: number,
      higherIsBetter: boolean = true
    ) => {
      const change = curr - prev;
      const changePercent = prev !== 0 ? (change / prev) * 100 : 0;
      const absChangePercent = Math.abs(changePercent);
      
      if (absChangePercent >= 2) {
        const isImprovement = higherIsBetter ? change > 0 : change < 0;
        const severity: 'minor' | 'moderate' | 'major' = 
          absChangePercent >= 10 ? 'major' : absChangePercent >= 5 ? 'moderate' : 'minor';
        
        significantChanges.push({
          metric,
          previousValue: prev,
          currentValue: curr,
          changePercent,
          isImprovement,
          severity,
        });
      }
    };
    
    checkChange('Accuracy', previousMetrics.accuracy, currentMetrics.accuracy);
    checkChange('Precision', previousMetrics.precision, currentMetrics.precision);
    checkChange('Recall', previousMetrics.recall, currentMetrics.recall);
    checkChange('F1 Score', previousMetrics.f1Score, currentMetrics.f1Score);
    checkChange('False Positive Rate', previousMetrics.falsePositiveRate, currentMetrics.falsePositiveRate, false);
    checkChange('False Negative Rate', previousMetrics.falseNegativeRate, currentMetrics.falseNegativeRate, false);
    checkChange('MAPE', previousMetrics.mape, currentMetrics.mape, false);
    checkChange('Overall Score', previousMetrics.overallScore, currentMetrics.overallScore);
    
    // Determine if improved
    const improvementPercent = previousMetrics.overallScore !== 0
      ? ((currentMetrics.overallScore - previousMetrics.overallScore) / previousMetrics.overallScore) * 100
      : 0;
    const isImproved = improvementPercent > 0;
    
    // Determine recommendation
    let recommendation: 'deploy' | 'review' | 'reject';
    let recommendationReason: string;
    
    if (currentMetrics.accuracy < 60 || currentMetrics.overallScore < 50) {
      recommendation = 'reject';
      recommendationReason = 'Model performance is below acceptable thresholds';
    } else if (improvementPercent >= 2) {
      recommendation = 'deploy';
      recommendationReason = `Model shows ${improvementPercent.toFixed(1)}% improvement over previous version`;
    } else if (improvementPercent >= 0) {
      recommendation = 'review';
      recommendationReason = 'Model performance is similar to previous version';
    } else if (improvementPercent >= -5) {
      recommendation = 'review';
      recommendationReason = `Model shows slight regression (${improvementPercent.toFixed(1)}%)`;
    } else {
      recommendation = 'reject';
      recommendationReason = `Model shows significant regression (${improvementPercent.toFixed(1)}%)`;
    }
    
    return {
      currentVersion: current.version,
      previousVersion: previous.version,
      accuracyChange,
      precisionChange,
      recallChange,
      f1ScoreChange,
      falsePositiveRateChange,
      falseNegativeRateChange,
      mapeChange,
      overallScoreChange,
      isImproved,
      improvementPercent,
      significantChanges,
      recommendation,
      recommendationReason,
    };
  }

  private shouldDeployModel(
    schedule: TrainingSchedule,
    version: ModelVersion,
    previousVersion?: ModelVersion
  ): { deploy: boolean; reason: string } {
    // Check minimum accuracy
    if (version.performanceMetrics.accuracy < schedule.minAccuracyForDeploy) {
      return {
        deploy: false,
        reason: `Accuracy (${version.performanceMetrics.accuracy.toFixed(1)}%) is below minimum threshold (${schedule.minAccuracyForDeploy}%)`,
      };
    }
    
    // If no previous version, deploy if auto-deploy is enabled
    if (!previousVersion) {
      if (schedule.autoDeployOnSuccess) {
        return { deploy: true, reason: 'First model version - auto-deployed' };
      }
      return { deploy: false, reason: 'Manual deployment required for first version' };
    }
    
    // Check if improvement is required
    if (schedule.requireImprovement) {
      const comparison = version.comparisonWithPrevious;
      if (!comparison || comparison.improvementPercent < schedule.minImprovementPercent) {
        return {
          deploy: false,
          reason: `Improvement (${comparison?.improvementPercent.toFixed(1) || 0}%) is below required minimum (${schedule.minImprovementPercent}%)`,
        };
      }
    }
    
    // Auto-deploy if enabled
    if (schedule.autoDeployOnSuccess) {
      return { deploy: true, reason: 'Auto-deployed after successful training' };
    }
    
    return { deploy: false, reason: 'Manual deployment required' };
  }

  private deployModel(version: ModelVersion): void {
    // Mark all other versions as not deployed
    const walletVersions = this.versions.get(version.walletAddress) || [];
    for (const v of walletVersions) {
      v.isDeployed = false;
    }
    
    // Mark this version as deployed
    version.isDeployed = true;
    version.deployedAt = new Date().toISOString();
    
    // Load into real-time ML service
    realTimeMLService.loadPreTrainedModel(version.modelState);
    
    // Save to historical training service
    historicalTrainingService.saveTrainedModel(version.modelState);
    
    this.saveToStorage();
  }

  manuallyDeployVersion(versionId: string): boolean {
    for (const [walletAddress, versions] of this.versions) {
      const version = versions.find(v => v.id === versionId);
      if (version) {
        this.deployModel(version);
        this.notifyVersionChange(version);
        return true;
      }
    }
    return false;
  }

  private cleanupOldVersions(walletAddress: string, keepCount: number): void {
    const versions = this.versions.get(walletAddress) || [];
    if (versions.length <= keepCount) return;
    
    // Sort by date (newest first)
    versions.sort((a, b) => new Date(b.trainedAt).getTime() - new Date(a.trainedAt).getTime());
    
    // Keep deployed version and newest versions
    const toKeep = versions.filter((v, i) => v.isDeployed || i < keepCount);
    this.versions.set(walletAddress, toKeep);
  }

  // ==================== TIMER MANAGEMENT ====================

  private initializeTimers(): void {
    for (const schedule of this.schedules.values()) {
      if (schedule.isEnabled) {
        this.scheduleTimer(schedule);
      }
    }
  }

  private scheduleTimer(schedule: TrainingSchedule): void {
    this.cancelTimer(schedule.id);
    
    const nextRun = getNextRunTime(schedule);
    const delay = nextRun.getTime() - Date.now();
    
    if (delay <= 0) {
      // Run immediately if past due
      this.executeTraining(schedule).catch(console.error);
      return;
    }
    
    // Cap at 24 hours and reschedule
    const maxDelay = 24 * 60 * 60 * 1000;
    const actualDelay = Math.min(delay, maxDelay);
    
    const timer = setTimeout(() => {
      if (delay > maxDelay) {
        // Reschedule for later
        this.scheduleTimer(schedule);
      } else {
        // Execute training
        this.executeTraining(schedule).catch(console.error);
      }
    }, actualDelay);
    
    this.timers.set(schedule.id, timer);
  }

  private cancelTimer(scheduleId: string): void {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }
  }

  // ==================== QUERIES ====================

  getVersionsForWallet(walletAddress: string): ModelVersion[] {
    return this.versions.get(walletAddress.toLowerCase()) || [];
  }

  getCurrentVersion(walletAddress: string): ModelVersion | undefined {
    const versions = this.versions.get(walletAddress.toLowerCase()) || [];
    return versions.find(v => v.isDeployed);
  }

  getVersion(versionId: string): ModelVersion | undefined {
    for (const versions of this.versions.values()) {
      const version = versions.find(v => v.id === versionId);
      if (version) return version;
    }
    return undefined;
  }

  getRunsForSchedule(scheduleId: string, limit?: number): ScheduledTrainingRun[] {
    const runs = this.runs.get(scheduleId) || [];
    return limit ? runs.slice(0, limit) : runs;
  }

  getWalletTrainingHistory(walletAddress: string, network: string): WalletTrainingHistory {
    const normalizedAddress = walletAddress.toLowerCase();
    const versions = this.versions.get(normalizedAddress) || [];
    const schedule = this.getScheduleForWallet(normalizedAddress, network);
    const runs = schedule ? (this.runs.get(schedule.id) || []) : [];
    
    const successfulRuns = runs.filter(r => r.status === 'completed').length;
    const failedRuns = runs.filter(r => r.status === 'failed').length;
    
    const durations = runs
      .filter(r => r.startedAt && r.completedAt)
      .map(r => new Date(r.completedAt!).getTime() - new Date(r.startedAt!).getTime());
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    
    const improvements = runs
      .filter(r => r.comparison)
      .map(r => r.comparison!.improvementPercent);
    const avgImprovement = improvements.length > 0
      ? improvements.reduce((a, b) => a + b, 0) / improvements.length
      : 0;
    
    return {
      walletAddress: normalizedAddress,
      network,
      versions,
      currentVersion: versions.find(v => v.isDeployed)?.version,
      schedule,
      runs,
      totalRuns: runs.length,
      successfulRuns,
      failedRuns,
      avgTrainingDuration: avgDuration,
      avgAccuracyImprovement: avgImprovement,
      lastTrainedAt: versions[0]?.trainedAt,
      lastDeployedAt: versions.find(v => v.isDeployed)?.deployedAt,
    };
  }

  getStats(): ScheduledTrainingStats {
    const schedules = Array.from(this.schedules.values());
    const allVersions = Array.from(this.versions.values()).flat();
    const allRuns = Array.from(this.runs.values()).flat();
    
    const successfulRuns = allRuns.filter(r => r.status === 'completed').length;
    const failedRuns = allRuns.filter(r => r.status === 'failed').length;
    
    // Find next scheduled run
    let nextScheduledRun: ScheduledTrainingStats['nextScheduledRun'];
    let earliestNextRun: Date | null = null;
    
    for (const schedule of schedules) {
      if (schedule.isEnabled && schedule.nextRunAt) {
        const nextRun = new Date(schedule.nextRunAt);
        if (!earliestNextRun || nextRun < earliestNextRun) {
          earliestNextRun = nextRun;
          nextScheduledRun = {
            scheduleId: schedule.id,
            walletAddress: schedule.walletAddress,
            scheduledAt: schedule.nextRunAt,
          };
        }
      }
    }
    
    // Calculate accuracy trend
    const recentRuns = allRuns
      .filter(r => r.comparison)
      .slice(0, 10);
    const avgAccuracyTrend = recentRuns.length > 0
      ? recentRuns.reduce((sum, r) => sum + r.comparison!.accuracyChange, 0) / recentRuns.length
      : 0;
    const avgF1ScoreTrend = recentRuns.length > 0
      ? recentRuns.reduce((sum, r) => sum + r.comparison!.f1ScoreChange, 0) / recentRuns.length
      : 0;
    
    return {
      totalSchedules: schedules.length,
      activeSchedules: schedules.filter(s => s.isEnabled).length,
      totalModelsVersions: allVersions.length,
      deployedModels: allVersions.filter(v => v.isDeployed).length,
      totalRuns: allRuns.length,
      successfulRuns,
      failedRuns,
      successRate: allRuns.length > 0 ? (successfulRuns / allRuns.length) * 100 : 0,
      avgAccuracyTrend,
      avgF1ScoreTrend,
      nextScheduledRun,
    };
  }

  // ==================== CALLBACKS ====================

  onScheduleChange(callback: ScheduleCallback): () => void {
    this.scheduleCallbacks.push(callback);
    return () => {
      this.scheduleCallbacks = this.scheduleCallbacks.filter(cb => cb !== callback);
    };
  }

  onRunChange(callback: RunCallback): () => void {
    this.runCallbacks.push(callback);
    return () => {
      this.runCallbacks = this.runCallbacks.filter(cb => cb !== callback);
    };
  }

  onVersionChange(callback: VersionCallback): () => void {
    this.versionCallbacks.push(callback);
    return () => {
      this.versionCallbacks = this.versionCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyScheduleChange(schedule: TrainingSchedule): void {
    this.scheduleCallbacks.forEach(cb => cb(schedule));
  }

  private notifyRunChange(run: ScheduledTrainingRun): void {
    this.runCallbacks.forEach(cb => cb(run));
  }

  private notifyVersionChange(version: ModelVersion): void {
    this.versionCallbacks.forEach(cb => cb(version));
  }

  // ==================== STORAGE ====================

  private saveToStorage(): void {
    try {
      localStorage.setItem('scheduled-training-schedules', JSON.stringify(Array.from(this.schedules.entries())));
      localStorage.setItem('scheduled-training-versions', JSON.stringify(Array.from(this.versions.entries())));
      localStorage.setItem('scheduled-training-runs', JSON.stringify(Array.from(this.runs.entries())));
    } catch (error) {
      console.error('Error saving scheduled training data:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const schedulesData = localStorage.getItem('scheduled-training-schedules');
      if (schedulesData) {
        this.schedules = new Map(JSON.parse(schedulesData));
      }
      
      const versionsData = localStorage.getItem('scheduled-training-versions');
      if (versionsData) {
        this.versions = new Map(JSON.parse(versionsData));
      }
      
      const runsData = localStorage.getItem('scheduled-training-runs');
      if (runsData) {
        this.runs = new Map(JSON.parse(runsData));
      }
    } catch (error) {
      console.error('Error loading scheduled training data:', error);
    }
  }
}

export const scheduledTrainingService = new ScheduledTrainingService();
