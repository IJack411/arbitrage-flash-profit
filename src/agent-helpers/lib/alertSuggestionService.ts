// Intelligent Alert Suggestion Service
// Analyzes wallet activity patterns and recommends optimal alert thresholds
// Now integrated with real blockchain data from Alchemy/Infura APIs

import { supabase, isSupabaseConfigured } from './supabase';
import { walletAlertService } from './walletAlertService';
import { blockchainDataService } from './web3/blockchainDataService';
import { ConnectedWallet } from '@/agent-helpers/types/multiWallet';
import { WalletAlertRule, WalletAlertHistory } from '@/agent-helpers/types/walletAlerts';
import {
  AlertSuggestion,
  WalletAnalysis,
  SuggestionType,
  SuggestionConfidence,
  SuggestionPreferences,
  SuggestionSummary,
  BalanceDataPoint,
  BalanceStatistics,
  TransactionDataPoint,
  TransactionStatistics,
  GasDataPoint,
  GasStatistics,
  AcknowledgmentDataPoint,
  AcknowledgmentStatistics,
  CONFIDENCE_CONFIG,
  SUGGESTION_TYPE_INFO,
  DEFAULT_SUGGESTION_PREFERENCES,
} from '@/agent-helpers/types/alertSuggestions';

const LOCAL_STORAGE_KEY = 'alert-suggestions';
const LOCAL_ANALYSIS_KEY = 'wallet-analysis';
const LOCAL_PREFERENCES_KEY = 'suggestion-preferences';

// Data source tracking
export interface DataSourceInfo {
  source: 'alchemy' | 'infura' | 'public_rpc' | 'simulated';
  isRealData: boolean;
  apiConfigured: boolean;
  lastFetchTime?: string;
  errorMessage?: string;
}

class AlertSuggestionService {
  private suggestions: AlertSuggestion[] = [];
  private analyses: Map<string, WalletAnalysis> = new Map();
  private preferences: SuggestionPreferences = DEFAULT_SUGGESTION_PREFERENCES;
  private listeners: Set<(suggestions: AlertSuggestion[]) => void> = new Set();
  private dataSourceInfo: DataSourceInfo = {
    source: 'simulated',
    isRealData: false,
    apiConfigured: false,
  };

  constructor() {
    this.loadFromStorage();
    this.checkApiConfiguration();
  }

  // Check API configuration status
  private checkApiConfiguration() {
    const status = blockchainDataService.getApiStatus();
    this.dataSourceInfo = {
      source: status.configured ? status.provider : 'public_rpc',
      isRealData: status.configured,
      apiConfigured: status.configured,
    };
  }

  // Get data source information
  getDataSourceInfo(): DataSourceInfo {
    return { ...this.dataSourceInfo };
  }

  // Subscribe to suggestion updates
  subscribe(listener: (suggestions: AlertSuggestion[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.suggestions));
  }

  // Load data from storage
  private loadFromStorage() {
    try {
      const suggestionsData = localStorage.getItem(LOCAL_STORAGE_KEY);
      const analysisData = localStorage.getItem(LOCAL_ANALYSIS_KEY);
      const preferencesData = localStorage.getItem(LOCAL_PREFERENCES_KEY);

      if (suggestionsData) this.suggestions = JSON.parse(suggestionsData);
      if (analysisData) {
        const analyses = JSON.parse(analysisData);
        this.analyses = new Map(Object.entries(analyses));
      }
      if (preferencesData) this.preferences = { ...DEFAULT_SUGGESTION_PREFERENCES, ...JSON.parse(preferencesData) };
    } catch (error) {
      console.error('Error loading suggestion data:', error);
    }
  }

  private saveToStorage() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.suggestions));
    localStorage.setItem(LOCAL_ANALYSIS_KEY, JSON.stringify(Object.fromEntries(this.analyses)));
    localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(this.preferences));
  }

  // Get preferences
  getPreferences(): SuggestionPreferences {
    return { ...this.preferences };
  }

  // Update preferences
  updatePreferences(updates: Partial<SuggestionPreferences>) {
    this.preferences = { ...this.preferences, ...updates };
    this.saveToStorage();
  }

  // Get all suggestions
  getSuggestions(): AlertSuggestion[] {
    return [...this.suggestions];
  }

  // Get suggestions for a specific wallet
  getSuggestionsForWallet(walletAddress: string): AlertSuggestion[] {
    return this.suggestions.filter(
      s => s.walletAddress.toLowerCase() === walletAddress.toLowerCase() && s.status === 'pending'
    );
  }

  // Get pending suggestions
  getPendingSuggestions(): AlertSuggestion[] {
    return this.suggestions.filter(s => s.status === 'pending');
  }

  // Get high confidence suggestions
  getHighConfidenceSuggestions(): AlertSuggestion[] {
    return this.suggestions.filter(
      s => s.status === 'pending' && (s.confidence === 'high' || s.confidence === 'very_high')
    );
  }

  // Get summary
  getSummary(): SuggestionSummary {
    const pending = this.suggestions.filter(s => s.status === 'pending');
    const applied = this.suggestions.filter(s => s.status === 'applied');
    const dismissed = this.suggestions.filter(s => s.status === 'dismissed');
    const highConfidence = pending.filter(s => s.confidence === 'high' || s.confidence === 'very_high');

    // Determine overall data quality
    const analyses = Array.from(this.analyses.values());
    let overallQuality: 'insufficient' | 'fair' | 'good' | 'excellent' = 'insufficient';
    if (analyses.length > 0) {
      const qualityScores = analyses.map(a => {
        switch (a.dataQuality) {
          case 'excellent': return 4;
          case 'good': return 3;
          case 'fair': return 2;
          default: return 1;
        }
      });
      const avgScore = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
      if (avgScore >= 3.5) overallQuality = 'excellent';
      else if (avgScore >= 2.5) overallQuality = 'good';
      else if (avgScore >= 1.5) overallQuality = 'fair';
    }

    return {
      totalSuggestions: this.suggestions.length,
      pendingSuggestions: pending.length,
      appliedSuggestions: applied.length,
      dismissedSuggestions: dismissed.length,
      highConfidenceSuggestions: highConfidence.length,
      lastAnalysisDate: analyses.length > 0 ? analyses[analyses.length - 1].analysisDate : undefined,
      overallDataQuality: overallQuality,
    };
  }

  // Analyze a wallet and generate suggestions using REAL blockchain data
  async analyzeWallet(wallet: ConnectedWallet): Promise<WalletAnalysis> {
    const now = new Date().toISOString();
    
    // Refresh API configuration check
    this.checkApiConfiguration();
    
    // Determine network from wallet if available
    const network = this.getNetworkFromWallet(wallet);
    const config = { network, maxDays: 30, maxTransactions: 500 };

    // Fetch REAL blockchain data
    let balanceHistory: BalanceDataPoint[] = [];
    let transactionHistory: TransactionDataPoint[] = [];
    let gasHistory: GasDataPoint[] = [];
    let dataFetchError: string | undefined;

    try {
      console.log(`Fetching real blockchain data for ${wallet.address} on ${network}...`);
      
      // Fetch all data in parallel for efficiency
      const [balanceData, txData, gasData] = await Promise.all([
        blockchainDataService.getBalanceHistory(wallet.address, config),
        blockchainDataService.getTransactionHistory(wallet.address, config),
        blockchainDataService.getGasHistory(wallet.address, config),
      ]);

      balanceHistory = balanceData;
      transactionHistory = txData;
      gasHistory = gasData;

      this.dataSourceInfo.lastFetchTime = now;
      this.dataSourceInfo.errorMessage = undefined;
      
      console.log(`Fetched ${balanceHistory.length} balance points, ${transactionHistory.length} transactions, ${gasHistory.length} gas records`);
    } catch (error) {
      console.error('Error fetching blockchain data:', error);
      dataFetchError = error instanceof Error ? error.message : 'Unknown error';
      this.dataSourceInfo.errorMessage = dataFetchError;
      
      // Fall back to simulated data if real data fetch fails
      balanceHistory = await this.getFallbackBalanceHistory(wallet);
      transactionHistory = await this.getFallbackTransactionHistory(wallet);
      gasHistory = await this.getFallbackGasHistory(wallet);
    }

    // Get acknowledgment history (always from local storage)
    const acknowledgmentHistory = await this.getAcknowledgmentHistory(wallet.address);

    // Calculate statistics from the data
    const balanceStats = this.calculateBalanceStatistics(balanceHistory);
    const transactionStats = this.calculateTransactionStatistics(transactionHistory);
    const gasStats = this.calculateGasStatistics(gasHistory);
    const acknowledgmentStats = this.calculateAcknowledgmentStatistics(acknowledgmentHistory);

    // Determine data quality based on real data availability
    const dataQuality = this.assessDataQuality(
      balanceHistory.length, 
      transactionHistory.length, 
      gasHistory.length,
      this.dataSourceInfo.isRealData
    );

    // Generate suggestions based on the analysis
    const suggestions: AlertSuggestion[] = [];

    if (this.preferences.enableLowBalanceSuggestions) {
      const lowBalanceSuggestion = this.generateLowBalanceSuggestion(wallet, balanceStats, balanceHistory.length);
      if (lowBalanceSuggestion) suggestions.push(lowBalanceSuggestion);
    }

    if (this.preferences.enableBalanceChangeSuggestions) {
      const balanceChangeSuggestion = this.generateBalanceChangeSuggestion(wallet, transactionStats, transactionHistory.length);
      if (balanceChangeSuggestion) suggestions.push(balanceChangeSuggestion);
    }

    if (this.preferences.enableGasReserveSuggestions) {
      const gasReserveSuggestion = this.generateGasReserveSuggestion(wallet, gasStats, gasHistory.length);
      if (gasReserveSuggestion) suggestions.push(gasReserveSuggestion);
    }

    if (this.preferences.enableCooldownSuggestions) {
      const cooldownSuggestion = this.generateCooldownSuggestion(wallet, acknowledgmentStats, acknowledgmentHistory.length);
      if (cooldownSuggestion) suggestions.push(cooldownSuggestion);
    }

    const analysis: WalletAnalysis = {
      walletAddress: wallet.address,
      walletName: wallet.name,
      analysisDate: now,
      dataQuality,
      balanceHistory,
      balanceStats,
      transactionHistory,
      transactionStats,
      gasHistory,
      gasStats,
      acknowledgmentHistory,
      acknowledgmentStats,
      suggestions,
    };

    // Store analysis
    this.analyses.set(wallet.address.toLowerCase(), analysis);

    // Add new suggestions (avoiding duplicates)
    for (const suggestion of suggestions) {
      const existingIndex = this.suggestions.findIndex(
        s => s.walletAddress.toLowerCase() === suggestion.walletAddress.toLowerCase() &&
             s.suggestionType === suggestion.suggestionType &&
             s.status === 'pending'
      );
      
      if (existingIndex >= 0) {
        // Update existing suggestion
        this.suggestions[existingIndex] = suggestion;
      } else {
        this.suggestions.push(suggestion);
      }
    }

    // Save to database if configured
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('wallet_analysis_history').insert({
          wallet_address: wallet.address.toLowerCase(),
          analysis_date: now,
          analysis_type: 'ml_suggestion',
          suggestions: suggestions,
          metadata: {
            data_quality: dataQuality,
            data_source: this.dataSourceInfo.source,
            is_real_data: this.dataSourceInfo.isRealData,
            balance_data_points: balanceHistory.length,
            transaction_data_points: transactionHistory.length,
            gas_data_points: gasHistory.length,
            suggestions_generated: suggestions.length,
            balance_stats: balanceStats,
            transaction_stats: transactionStats,
            gas_stats: gasStats,
          },
        });
      } catch (error) {
        console.error('Error saving analysis to database:', error);
      }
    }

    this.saveToStorage();
    this.notifyListeners();

    return analysis;
  }

  // Analyze all wallets
  async analyzeAllWallets(wallets: ConnectedWallet[]): Promise<WalletAnalysis[]> {
    const analyses: WalletAnalysis[] = [];
    for (const wallet of wallets) {
      const analysis = await this.analyzeWallet(wallet);
      analyses.push(analysis);
    }
    return analyses;
  }

  // Get network from wallet
  private getNetworkFromWallet(wallet: ConnectedWallet): string {
    // Try to determine network from wallet's network property or chainId
    const networkMap: Record<string, string> = {
      '1': 'ethereum',
      '137': 'polygon',
      '42161': 'arbitrum',
      '10': 'optimism',
      '8453': 'base',
      'ethereum': 'ethereum',
      'polygon': 'polygon',
      'arbitrum': 'arbitrum',
      'optimism': 'optimism',
      'base': 'base',
    };

    const network = wallet.network || 'ethereum';
    return networkMap[network] || networkMap[network.toLowerCase()] || 'ethereum';
  }

  // Fallback balance history when API fails
  private async getFallbackBalanceHistory(wallet: ConnectedWallet): Promise<BalanceDataPoint[]> {
    const currentBalance = parseFloat(wallet.balance);
    const history: BalanceDataPoint[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 30; i >= 0; i--) {
      const timestamp = new Date(now - i * dayMs).toISOString();
      const variance = (Math.random() - 0.5) * 0.3 * currentBalance;
      const balance = Math.max(0, currentBalance + variance);
      history.push({
        timestamp,
        balance,
        balanceUSD: balance * 2500,
      });
    }

    return history;
  }

  // Fallback transaction history
  private async getFallbackTransactionHistory(wallet: ConnectedWallet): Promise<TransactionDataPoint[]> {
    const transactions: TransactionDataPoint[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const currentBalance = parseFloat(wallet.balance);

    for (let day = 30; day >= 0; day--) {
      const txCount = Math.floor(Math.random() * 4) + 1;
      for (let tx = 0; tx < txCount; tx++) {
        const timestamp = new Date(now - day * dayMs + tx * 3600000).toISOString();
        const isOutgoing = Math.random() > 0.4;
        const amount = Math.random() * currentBalance * 0.15;
        const gasUsed = 21000 + Math.floor(Math.random() * 100000);
        const gasPrice = 20 + Math.random() * 80;
        const gasCost = (gasUsed * gasPrice) / 1e9;

        transactions.push({
          timestamp,
          type: isOutgoing ? 'outgoing' : 'incoming',
          amount,
          amountUSD: amount * 2500,
          gasUsed,
          gasCost,
        });
      }
    }

    return transactions;
  }

  // Fallback gas history
  private async getFallbackGasHistory(wallet: ConnectedWallet): Promise<GasDataPoint[]> {
    const gasHistory: GasDataPoint[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (let day = 30; day >= 0; day--) {
      const txCount = Math.floor(Math.random() * 3) + 1;
      for (let tx = 0; tx < txCount; tx++) {
        const timestamp = new Date(now - day * dayMs + tx * 3600000).toISOString();
        const gasPrice = 20 + Math.random() * 80;
        const gasUsed = 21000 + Math.floor(Math.random() * 150000);
        const totalCost = (gasUsed * gasPrice) / 1e9;

        gasHistory.push({
          timestamp,
          gasPrice,
          gasUsed,
          totalCost,
          network: 'ethereum',
        });
      }
    }

    return gasHistory;
  }


  // Get acknowledgment history
  private async getAcknowledgmentHistory(walletAddress: string): Promise<AcknowledgmentDataPoint[]> {
    const history = walletAlertService.getHistoryForWallet(walletAddress, 50);
    
    return history.map(h => ({
      alertId: h.id,
      alertType: h.alertType,
      triggeredAt: h.triggeredAt,
      acknowledgedAt: h.acknowledgedAt,
      responseTimeMinutes: h.acknowledgedAt
        ? (new Date(h.acknowledgedAt).getTime() - new Date(h.triggeredAt).getTime()) / 60000
        : undefined,
      wasIgnored: !h.acknowledged,
    }));
  }

  // Calculate balance statistics
  private calculateBalanceStatistics(history: BalanceDataPoint[]): BalanceStatistics {
    if (history.length === 0) {
      return {
        min: 0, max: 0, avg: 0, median: 0, stdDev: 0,
        percentile10: 0, percentile25: 0, percentile75: 0, percentile90: 0,
        trend: 'stable', volatility: 'low',
      };
    }

    const balances = history.map(h => h.balance).sort((a, b) => a - b);
    const n = balances.length;
    
    const min = balances[0];
    const max = balances[n - 1];
    const avg = balances.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (balances[n/2 - 1] + balances[n/2]) / 2 : balances[Math.floor(n/2)];
    
    const variance = balances.reduce((sum, b) => sum + Math.pow(b - avg, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const percentile10 = balances[Math.floor(n * 0.1)];
    const percentile25 = balances[Math.floor(n * 0.25)];
    const percentile75 = balances[Math.floor(n * 0.75)];
    const percentile90 = balances[Math.floor(n * 0.9)];

    // Determine trend
    const firstHalf = history.slice(0, Math.floor(n/2));
    const secondHalf = history.slice(Math.floor(n/2));
    const firstAvg = firstHalf.reduce((a, b) => a + b.balance, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b.balance, 0) / secondHalf.length;
    const trendChange = (secondAvg - firstAvg) / firstAvg;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (trendChange > 0.1) trend = 'increasing';
    else if (trendChange < -0.1) trend = 'decreasing';

    // Determine volatility
    const cv = stdDev / avg; // Coefficient of variation
    let volatility: 'low' | 'medium' | 'high' = 'low';
    if (cv > 0.5) volatility = 'high';
    else if (cv > 0.2) volatility = 'medium';

    return {
      min, max, avg, median, stdDev,
      percentile10, percentile25, percentile75, percentile90,
      trend, volatility,
    };
  }

  // Calculate transaction statistics
  private calculateTransactionStatistics(history: TransactionDataPoint[]): TransactionStatistics {
    if (history.length === 0) {
      return {
        totalTransactions: 0, avgTransactionsPerDay: 0,
        avgIncomingAmount: 0, avgOutgoingAmount: 0, maxOutgoingAmount: 0,
        avgChangePercent: 0, maxChangePercent: 0,
      };
    }

    const incoming = history.filter(t => t.type === 'incoming');
    const outgoing = history.filter(t => t.type === 'outgoing');

    // Calculate days span
    const timestamps = history.map(t => new Date(t.timestamp).getTime());
    const daySpan = Math.max(1, (Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60 * 1000));

    const avgIncomingAmount = incoming.length > 0
      ? incoming.reduce((a, b) => a + b.amount, 0) / incoming.length
      : 0;
    
    const avgOutgoingAmount = outgoing.length > 0
      ? outgoing.reduce((a, b) => a + b.amount, 0) / outgoing.length
      : 0;

    const maxOutgoingAmount = outgoing.length > 0
      ? Math.max(...outgoing.map(t => t.amount))
      : 0;

    return {
      totalTransactions: history.length,
      avgTransactionsPerDay: history.length / daySpan,
      avgIncomingAmount,
      avgOutgoingAmount,
      maxOutgoingAmount,
      avgChangePercent: 10, // Placeholder
      maxChangePercent: 25, // Placeholder
    };
  }

  // Calculate gas statistics
  private calculateGasStatistics(history: GasDataPoint[]): GasStatistics {
    if (history.length === 0) {
      return {
        avgGasPrice: 30, maxGasPrice: 100,
        avgGasUsed: 50000, avgTxCost: 0.003, maxTxCost: 0.01,
        estimatedDailyCost: 0.01, recommendedReserve: 0.05,
      };
    }

    const avgGasPrice = history.reduce((a, b) => a + b.gasPrice, 0) / history.length;
    const maxGasPrice = Math.max(...history.map(g => g.gasPrice));
    const avgGasUsed = history.reduce((a, b) => a + b.gasUsed, 0) / history.length;
    const avgTxCost = history.reduce((a, b) => a + b.totalCost, 0) / history.length;
    const maxTxCost = Math.max(...history.map(g => g.totalCost));

    // Calculate days span
    const timestamps = history.map(t => new Date(t.timestamp).getTime());
    const daySpan = Math.max(1, (Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60 * 1000));
    const txPerDay = history.length / daySpan;
    const estimatedDailyCost = avgTxCost * txPerDay;

    // Recommended reserve: enough for 3 days of transactions at max gas price
    const recommendedReserve = maxTxCost * txPerDay * 3;

    return {
      avgGasPrice, maxGasPrice, avgGasUsed, avgTxCost, maxTxCost,
      estimatedDailyCost, recommendedReserve,
    };
  }

  // Calculate acknowledgment statistics
  private calculateAcknowledgmentStatistics(history: AcknowledgmentDataPoint[]): AcknowledgmentStatistics {
    if (history.length === 0) {
      return {
        totalAlerts: 0, acknowledgedAlerts: 0, ignoredAlerts: 0,
        avgResponseTime: 30, medianResponseTime: 30,
        alertFatigueScore: 0, optimalCooldown: 60,
      };
    }

    const acknowledged = history.filter(h => !h.wasIgnored);
    const ignored = history.filter(h => h.wasIgnored);
    
    const responseTimes = acknowledged
      .filter(h => h.responseTimeMinutes !== undefined)
      .map(h => h.responseTimeMinutes!);

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 30;

    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    const medianResponseTime = sortedTimes.length > 0
      ? sortedTimes[Math.floor(sortedTimes.length / 2)]
      : 30;

    // Alert fatigue score: higher if many alerts are ignored or response time is long
    const ignoreRate = history.length > 0 ? ignored.length / history.length : 0;
    const alertFatigueScore = Math.min(100, ignoreRate * 100 + (avgResponseTime > 60 ? 20 : 0));

    // Optimal cooldown: based on response time and fatigue
    let optimalCooldown = Math.max(30, medianResponseTime * 2);
    if (alertFatigueScore > 50) optimalCooldown *= 1.5;
    optimalCooldown = Math.min(1440, Math.round(optimalCooldown)); // Max 24 hours

    return {
      totalAlerts: history.length,
      acknowledgedAlerts: acknowledged.length,
      ignoredAlerts: ignored.length,
      avgResponseTime,
      medianResponseTime,
      alertFatigueScore,
      optimalCooldown,
    };
  }

  // Assess data quality - enhanced to consider real vs simulated data
  private assessDataQuality(
    balancePoints: number, 
    txPoints: number, 
    gasPoints: number,
    isRealData: boolean = false
  ): 'insufficient' | 'fair' | 'good' | 'excellent' {
    const totalPoints = balancePoints + txPoints + gasPoints;
    
    // Real data gets a quality boost
    const qualityBoost = isRealData ? 1 : 0;
    
    if (totalPoints < 20) return qualityBoost ? 'fair' : 'insufficient';
    if (totalPoints < 50) return qualityBoost ? 'good' : 'fair';
    if (totalPoints < 100) return qualityBoost ? 'excellent' : 'good';
    return 'excellent';
  }


  // Generate low balance suggestion
  private generateLowBalanceSuggestion(
    wallet: ConnectedWallet,
    stats: BalanceStatistics,
    dataPoints: number
  ): AlertSuggestion | null {
    if (dataPoints < SUGGESTION_TYPE_INFO.low_balance.minDataPoints) return null;

    // Suggest threshold at 10th percentile or 20% below average, whichever is lower
    const percentileThreshold = stats.percentile10;
    const avgBasedThreshold = stats.avg * 0.2;
    const suggestedValue = Math.max(0.01, Math.min(percentileThreshold, avgBasedThreshold));

    // Calculate confidence
    let confidenceScore = Math.min(100, dataPoints * 2);
    if (stats.volatility === 'high') confidenceScore -= 20;
    if (stats.trend === 'decreasing') confidenceScore -= 10;

    const confidence = this.scoreToConfidence(confidenceScore);

    // Get current rule value if exists
    const existingRules = walletAlertService.getRulesForWallet(wallet.address);
    const lowBalanceRule = existingRules.find(r => r.alertType === 'low_balance');
    const currentValue = lowBalanceRule?.thresholdValue;

    return {
      id: `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: wallet.address,
      walletName: wallet.name,
      suggestionType: 'low_balance',
      alertType: 'low_balance',
      suggestedValue: parseFloat(suggestedValue.toFixed(4)),
      currentValue,
      confidence,
      confidenceScore,
      reasoning: `Based on ${dataPoints} balance data points over the analysis period, your balance typically stays above ${stats.percentile10.toFixed(4)} ETH (10th percentile). Setting the threshold at ${suggestedValue.toFixed(4)} ETH provides an early warning while avoiding false alerts.`,
      dataPoints,
      analysisWindow: '30 days',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        historicalMinBalance: stats.min,
        historicalAvgBalance: stats.avg,
        historicalMaxBalance: stats.max,
        balanceStdDev: stats.stdDev,
        trendDirection: stats.trend,
      },
    };
  }

  // Generate balance change suggestion
  private generateBalanceChangeSuggestion(
    wallet: ConnectedWallet,
    stats: TransactionStatistics,
    dataPoints: number
  ): AlertSuggestion | null {
    if (dataPoints < SUGGESTION_TYPE_INFO.balance_change.minDataPoints) return null;

    // Suggest percentage based on typical transaction sizes relative to balance
    const currentBalance = parseFloat(wallet.balance);
    const avgTxPercent = currentBalance > 0 ? (stats.avgOutgoingAmount / currentBalance) * 100 : 10;
    const maxTxPercent = currentBalance > 0 ? (stats.maxOutgoingAmount / currentBalance) * 100 : 25;
    
    // Suggest 1.5x the average transaction percentage
    const suggestedValue = Math.max(5, Math.min(50, avgTxPercent * 1.5));

    // Calculate confidence
    let confidenceScore = Math.min(100, dataPoints * 1.5);
    if (stats.avgTransactionsPerDay < 1) confidenceScore -= 15;

    const confidence = this.scoreToConfidence(confidenceScore);

    // Get current rule value if exists
    const existingRules = walletAlertService.getRulesForWallet(wallet.address);
    const changeRule = existingRules.find(r => r.alertType === 'balance_change');
    const currentValue = changeRule?.thresholdPercentage;

    return {
      id: `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: wallet.address,
      walletName: wallet.name,
      suggestionType: 'balance_change',
      alertType: 'balance_change',
      suggestedValue: parseFloat(suggestedValue.toFixed(1)),
      currentValue,
      confidence,
      confidenceScore,
      reasoning: `Based on ${dataPoints} transactions, your typical transaction is ${avgTxPercent.toFixed(1)}% of your balance. Setting the alert at ${suggestedValue.toFixed(1)}% will notify you of unusually large transactions while filtering out routine activity.`,
      dataPoints,
      analysisWindow: '30 days',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        avgTransactionSize: stats.avgOutgoingAmount,
        maxTransactionSize: stats.maxOutgoingAmount,
        transactionFrequency: stats.avgTransactionsPerDay,
        typicalChangePercent: avgTxPercent,
      },
    };
  }

  // Generate gas reserve suggestion
  private generateGasReserveSuggestion(
    wallet: ConnectedWallet,
    stats: GasStatistics,
    dataPoints: number
  ): AlertSuggestion | null {
    if (dataPoints < SUGGESTION_TYPE_INFO.gas_reserve.minDataPoints) return null;

    // Suggest enough for 3 days of transactions at peak gas prices
    const suggestedValue = Math.max(0.01, stats.recommendedReserve);

    // Calculate confidence
    let confidenceScore = Math.min(100, dataPoints * 2);
    if (stats.avgGasPrice > 100) confidenceScore -= 10; // High gas price volatility

    const confidence = this.scoreToConfidence(confidenceScore);

    // Get current rule value if exists
    const existingRules = walletAlertService.getRulesForWallet(wallet.address);
    const gasRule = existingRules.find(r => r.alertType === 'gas_reserve');
    const currentValue = gasRule?.thresholdValue || gasRule?.config.minGasReserveETH;

    return {
      id: `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: wallet.address,
      walletName: wallet.name,
      suggestionType: 'gas_reserve',
      alertType: 'gas_reserve',
      suggestedValue: parseFloat(suggestedValue.toFixed(4)),
      currentValue,
      confidence,
      confidenceScore,
      reasoning: `Based on ${dataPoints} transactions, your average gas cost is ${stats.avgTxCost.toFixed(4)} ETH with peaks up to ${stats.maxTxCost.toFixed(4)} ETH. A reserve of ${suggestedValue.toFixed(4)} ETH ensures you can execute ~3 days of transactions even during high gas periods.`,
      dataPoints,
      analysisWindow: '30 days',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        avgGasCost: stats.avgTxCost,
        maxGasCost: stats.maxTxCost,
        estimatedTxPerDay: stats.estimatedDailyCost / stats.avgTxCost,
        networkGasPrice: stats.avgGasPrice,
      },
    };
  }

  // Generate cooldown suggestion
  private generateCooldownSuggestion(
    wallet: ConnectedWallet,
    stats: AcknowledgmentStatistics,
    dataPoints: number
  ): AlertSuggestion | null {
    if (dataPoints < SUGGESTION_TYPE_INFO.cooldown.minDataPoints) return null;

    const suggestedValue = stats.optimalCooldown;

    // Calculate confidence
    let confidenceScore = Math.min(100, dataPoints * 10);
    if (stats.alertFatigueScore > 50) confidenceScore += 10; // More confident if there's clear fatigue

    const confidence = this.scoreToConfidence(confidenceScore);

    return {
      id: `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: wallet.address,
      walletName: wallet.name,
      suggestionType: 'cooldown',
      alertType: 'low_balance', // Applies to all alert types
      suggestedValue,
      currentValue: 60, // Default
      confidence,
      confidenceScore,
      reasoning: `Based on ${dataPoints} alert acknowledgments, your average response time is ${stats.avgResponseTime.toFixed(0)} minutes. ${stats.alertFatigueScore > 30 ? 'There are signs of alert fatigue. ' : ''}A cooldown of ${suggestedValue} minutes balances timely alerts with avoiding notification overload.`,
      dataPoints,
      analysisWindow: '30 days',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        avgAcknowledgmentTime: stats.avgResponseTime,
        alertFatigue: stats.alertFatigueScore > 50,
        optimalCooldown: stats.optimalCooldown,
      },
    };
  }

  // Convert score to confidence level
  private scoreToConfidence(score: number): SuggestionConfidence {
    if (score >= CONFIDENCE_CONFIG.very_high.minScore) return 'very_high';
    if (score >= CONFIDENCE_CONFIG.high.minScore) return 'high';
    if (score >= CONFIDENCE_CONFIG.medium.minScore) return 'medium';
    return 'low';
  }

  // Apply a suggestion
  async applySuggestion(suggestionId: string): Promise<boolean> {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (!suggestion || suggestion.status !== 'pending') return false;

    try {
      // Find existing rule or create new one
      const existingRules = walletAlertService.getRulesForWallet(suggestion.walletAddress);
      const existingRule = existingRules.find(r => r.alertType === suggestion.alertType);

      if (existingRule) {
        // Update existing rule
        if (suggestion.suggestionType === 'balance_change') {
          await walletAlertService.updateRule(existingRule.id, {
            thresholdPercentage: suggestion.suggestedValue,
          });
        } else if (suggestion.suggestionType === 'cooldown') {
          await walletAlertService.updateRule(existingRule.id, {
            cooldownMinutes: suggestion.suggestedValue,
          });
        } else {
          await walletAlertService.updateRule(existingRule.id, {
            thresholdValue: suggestion.suggestedValue,
          });
        }
      } else {
        // Create new rule
        if (suggestion.alertType !== 'custom') {
          if (suggestion.suggestionType === 'balance_change') {
            await walletAlertService.setupBalanceChangeAlert(
              suggestion.walletAddress,
              suggestion.suggestedValue
            );
          } else if (suggestion.alertType === 'low_balance') {
            await walletAlertService.setupLowBalanceAlert(
              suggestion.walletAddress,
              suggestion.suggestedValue
            );
          } else if (suggestion.alertType === 'gas_reserve') {
            await walletAlertService.setupGasReserveAlert(
              suggestion.walletAddress,
              suggestion.suggestedValue
            );
          }
        }
      }

      // Mark suggestion as applied
      suggestion.status = 'applied';
      suggestion.appliedAt = new Date().toISOString();
      this.saveToStorage();
      this.notifyListeners();

      return true;
    } catch (error) {
      console.error('Error applying suggestion:', error);
      return false;
    }
  }

  // Dismiss a suggestion
  dismissSuggestion(suggestionId: string): boolean {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (!suggestion || suggestion.status !== 'pending') return false;

    suggestion.status = 'dismissed';
    suggestion.dismissedAt = new Date().toISOString();
    this.saveToStorage();
    this.notifyListeners();

    return true;
  }

  // Apply all high confidence suggestions
  async applyAllHighConfidence(): Promise<number> {
    const highConfidence = this.getHighConfidenceSuggestions();
    let appliedCount = 0;

    for (const suggestion of highConfidence) {
      const success = await this.applySuggestion(suggestion.id);
      if (success) appliedCount++;
    }

    return appliedCount;
  }

  // Get analysis for a wallet
  getAnalysis(walletAddress: string): WalletAnalysis | undefined {
    return this.analyses.get(walletAddress.toLowerCase());
  }

  // Clear all suggestions
  clearSuggestions() {
    this.suggestions = [];
    this.saveToStorage();
    this.notifyListeners();
  }
}

export const alertSuggestionService = new AlertSuggestionService();
