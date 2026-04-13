/**
 * Fee Collection Service
 * Manages platform fees for arbitrage trades
 */

export interface FeeConfig {
  // Fee wallet address where platform fees are sent
  feeWalletAddress: string;
  // Percentage fee on profitable trades (e.g., 0.5 = 0.5%)
  tradeFeePercent: number;
  // Minimum fee in USD
  minFeeUSD: number;
  // Maximum fee in USD (cap)
  maxFeeUSD: number;
  // Fee on flash loan profits
  flashLoanFeePercent: number;
  // Subscription tiers that reduce fees
  subscriptionDiscounts: {
    basic: number;    // e.g., 0.1 = 10% discount
    pro: number;      // e.g., 0.25 = 25% discount
    enterprise: number; // e.g., 0.5 = 50% discount
  };
  // Whether fees are enabled
  enabled: boolean;
}

export interface FeeCalculation {
  grossProfit: number;
  feeAmount: number;
  netProfit: number;
  feePercent: number;
  feeWallet: string;
}

export interface FeeTransaction {
  id: string;
  tradeId: string;
  walletAddress: string;
  feeAmount: number;
  feeCurrency: string;
  feeWallet: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
}

// Default fee configuration
const DEFAULT_FEE_CONFIG: FeeConfig = {
  feeWalletAddress: '', // Must be set by platform owner
  tradeFeePercent: 0.5, // 0.5% of profits
  minFeeUSD: 0.50, // Minimum $0.50 fee
  maxFeeUSD: 100, // Maximum $100 fee per trade
  flashLoanFeePercent: 0.3, // 0.3% on flash loan profits
  subscriptionDiscounts: {
    basic: 0.1,
    pro: 0.25,
    enterprise: 0.5,
  },
  enabled: true,
};

class FeeService {
  private config: FeeConfig;
  private feeHistory: FeeTransaction[] = [];
  private totalFeesCollected: number = 0;

  constructor() {
    // Load config from localStorage or use defaults
    const savedConfig = localStorage.getItem('platform_fee_config');
    if (savedConfig) {
      try {
        this.config = { ...DEFAULT_FEE_CONFIG, ...JSON.parse(savedConfig) };
      } catch {
        this.config = { ...DEFAULT_FEE_CONFIG };
      }
    } else {
      this.config = { ...DEFAULT_FEE_CONFIG };
    }

    // Load fee history
    const savedHistory = localStorage.getItem('fee_history');
    if (savedHistory) {
      try {
        this.feeHistory = JSON.parse(savedHistory);
        this.totalFeesCollected = this.feeHistory
          .filter(f => f.status === 'completed')
          .reduce((sum, f) => sum + f.feeAmount, 0);
      } catch {
        this.feeHistory = [];
      }
    }
  }

  /**
   * Configure the fee wallet address
   */
  setFeeWallet(address: string): void {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('Invalid Ethereum address format');
    }
    this.config.feeWalletAddress = address;
    this.saveConfig();
  }

  /**
   * Get current fee wallet address
   */
  getFeeWallet(): string {
    return this.config.feeWalletAddress;
  }

  /**
   * Update fee configuration
   */
  updateConfig(updates: Partial<FeeConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Get current fee configuration
   */
  getConfig(): FeeConfig {
    return { ...this.config };
  }

  /**
   * Calculate fee for a trade
   */
  calculateFee(
    grossProfit: number,
    subscriptionTier?: 'basic' | 'pro' | 'enterprise'
  ): FeeCalculation {
    if (!this.config.enabled || grossProfit <= 0) {
      return {
        grossProfit,
        feeAmount: 0,
        netProfit: grossProfit,
        feePercent: 0,
        feeWallet: this.config.feeWalletAddress,
      };
    }

    // Calculate base fee
    let feePercent = this.config.tradeFeePercent;

    // Apply subscription discount
    if (subscriptionTier && this.config.subscriptionDiscounts[subscriptionTier]) {
      const discount = this.config.subscriptionDiscounts[subscriptionTier];
      feePercent = feePercent * (1 - discount);
    }

    // Calculate fee amount
    let feeAmount = grossProfit * (feePercent / 100);

    // Apply min/max caps
    feeAmount = Math.max(feeAmount, this.config.minFeeUSD);
    feeAmount = Math.min(feeAmount, this.config.maxFeeUSD);

    // Ensure fee doesn't exceed profit
    feeAmount = Math.min(feeAmount, grossProfit * 0.5); // Max 50% of profit

    return {
      grossProfit,
      feeAmount: Math.round(feeAmount * 100) / 100, // Round to 2 decimals
      netProfit: Math.round((grossProfit - feeAmount) * 100) / 100,
      feePercent,
      feeWallet: this.config.feeWalletAddress,
    };
  }

  /**
   * Calculate flash loan specific fee
   */
  calculateFlashLoanFee(
    loanAmount: number,
    profit: number,
    subscriptionTier?: 'basic' | 'pro' | 'enterprise'
  ): FeeCalculation {
    if (!this.config.enabled || profit <= 0) {
      return {
        grossProfit: profit,
        feeAmount: 0,
        netProfit: profit,
        feePercent: 0,
        feeWallet: this.config.feeWalletAddress,
      };
    }

    let feePercent = this.config.flashLoanFeePercent;

    // Apply subscription discount
    if (subscriptionTier && this.config.subscriptionDiscounts[subscriptionTier]) {
      const discount = this.config.subscriptionDiscounts[subscriptionTier];
      feePercent = feePercent * (1 - discount);
    }

    // Fee is based on profit, not loan amount
    let feeAmount = profit * (feePercent / 100);

    // Apply caps
    feeAmount = Math.max(feeAmount, this.config.minFeeUSD);
    feeAmount = Math.min(feeAmount, this.config.maxFeeUSD);
    feeAmount = Math.min(feeAmount, profit * 0.5);

    return {
      grossProfit: profit,
      feeAmount: Math.round(feeAmount * 100) / 100,
      netProfit: Math.round((profit - feeAmount) * 100) / 100,
      feePercent,
      feeWallet: this.config.feeWalletAddress,
    };
  }

  /**
   * Record a fee transaction
   */
  recordFeeTransaction(
    tradeId: string,
    walletAddress: string,
    feeAmount: number,
    feeCurrency: string = 'USD'
  ): FeeTransaction {
    const transaction: FeeTransaction = {
      id: `fee-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tradeId,
      walletAddress,
      feeAmount,
      feeCurrency,
      feeWallet: this.config.feeWalletAddress,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    this.feeHistory.unshift(transaction);
    this.saveFeeHistory();

    return transaction;
  }

  /**
   * Update fee transaction status
   */
  updateFeeTransaction(
    id: string,
    status: 'completed' | 'failed',
    txHash?: string
  ): void {
    const transaction = this.feeHistory.find(f => f.id === id);
    if (transaction) {
      transaction.status = status;
      if (txHash) transaction.txHash = txHash;
      
      if (status === 'completed') {
        this.totalFeesCollected += transaction.feeAmount;
      }
      
      this.saveFeeHistory();
    }
  }

  /**
   * Get fee history
   */
  getFeeHistory(limit: number = 100): FeeTransaction[] {
    return this.feeHistory.slice(0, limit);
  }

  /**
   * Get total fees collected
   */
  getTotalFeesCollected(): number {
    return this.totalFeesCollected;
  }

  /**
   * Get fee statistics
   */
  getStats(): {
    totalCollected: number;
    pendingFees: number;
    completedTransactions: number;
    failedTransactions: number;
    averageFee: number;
  } {
    const completed = this.feeHistory.filter(f => f.status === 'completed');
    const pending = this.feeHistory.filter(f => f.status === 'pending');
    const failed = this.feeHistory.filter(f => f.status === 'failed');

    return {
      totalCollected: this.totalFeesCollected,
      pendingFees: pending.reduce((sum, f) => sum + f.feeAmount, 0),
      completedTransactions: completed.length,
      failedTransactions: failed.length,
      averageFee: completed.length > 0 
        ? this.totalFeesCollected / completed.length 
        : 0,
    };
  }

  /**
   * Check if fee wallet is configured
   */
  isFeeWalletConfigured(): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(this.config.feeWalletAddress);
  }

  /**
   * Enable/disable fee collection
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.saveConfig();
  }

  private saveConfig(): void {
    localStorage.setItem('platform_fee_config', JSON.stringify(this.config));
  }

  private saveFeeHistory(): void {
    // Keep only last 1000 transactions
    if (this.feeHistory.length > 1000) {
      this.feeHistory = this.feeHistory.slice(0, 1000);
    }
    localStorage.setItem('fee_history', JSON.stringify(this.feeHistory));
  }
}

// Export singleton instance
export const feeService = new FeeService();
