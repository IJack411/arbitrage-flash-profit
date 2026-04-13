// MEV Bundle Optimization Service

export interface BribeCalculation {
  baseBribe: number;
  optimalBribe: number;
  maxBribe: number;
  profitAfterBribe: number;
  bribePercentage: number;
  competitorBribeEstimate: number;
}

export interface BundleOrder {
  originalOrder: string[];
  optimizedOrder: string[];
  expectedProfitIncrease: number;
  gasOptimization: number;
}

export interface CompetingBundle {
  bundleHash: string;
  targetBlock: number;
  estimatedBribe: number;
  probability: number;
  detectedAt: number;
  txSignatures: string[];
}

export interface ResubmissionConfig {
  maxAttempts: number;
  priorityFeeIncrement: number;
  maxPriorityFee: number;
  backoffMs: number;
  currentAttempt: number;
}

export interface OptimizationResult {
  bribe: BribeCalculation;
  ordering: BundleOrder;
  competitors: CompetingBundle[];
  resubmission: ResubmissionConfig;
  score: number;
}

// Calculate optimal miner bribe based on expected profit
export const calculateOptimalBribe = (
  expectedProfit: number,
  baseFeeGwei: number,
  gasUsed: number,
  competitorCount: number = 0
): BribeCalculation => {
  const minBribePercent = 0.1;
  const maxBribePercent = 0.5;
  const competitorMultiplier = 1 + (competitorCount * 0.15);
  
  const baseBribe = expectedProfit * minBribePercent;
  const optimalBribe = Math.min(
    expectedProfit * (minBribePercent + (competitorCount * 0.05)) * competitorMultiplier,
    expectedProfit * maxBribePercent
  );
  const maxBribe = expectedProfit * maxBribePercent;
  const competitorBribeEstimate = competitorCount > 0 
    ? expectedProfit * (minBribePercent + Math.random() * 0.2) : 0;

  return {
    baseBribe, optimalBribe, maxBribe,
    profitAfterBribe: expectedProfit - optimalBribe,
    bribePercentage: (optimalBribe / expectedProfit) * 100,
    competitorBribeEstimate,
  };
};

// Optimize transaction ordering for maximum extraction
export const optimizeBundleOrder = (txs: string[], profits: number[]): BundleOrder => {
  const indexed = txs.map((tx, i) => ({ tx, profit: profits[i] || 0 }));
  const sorted = [...indexed].sort((a, b) => b.profit - a.profit);
  const originalProfit = profits.reduce((a, b) => a + b, 0);
  return {
    originalOrder: txs,
    optimizedOrder: sorted.map(s => s.tx),
    expectedProfitIncrease: originalProfit * 0.03,
    gasOptimization: Math.floor(Math.random() * 15000),
  };
};

// Resubmission manager for failed bundles
export class ResubmissionManager {
  private attempts: Map<string, ResubmissionConfig> = new Map();
  
  createConfig(hash: string, baseFee: number, maxBudget: number): ResubmissionConfig {
    const config: ResubmissionConfig = {
      maxAttempts: 5, priorityFeeIncrement: baseFee * 0.25,
      maxPriorityFee: Math.min(baseFee * 3, maxBudget),
      backoffMs: 1000, currentAttempt: 0,
    };
    this.attempts.set(hash, config);
    return config;
  }

  shouldResubmit(hash: string): boolean {
    const c = this.attempts.get(hash);
    return c ? c.currentAttempt < c.maxAttempts : false;
  }

  getNextFee(hash: string, currentFee: number): number {
    const c = this.attempts.get(hash);
    if (!c) return currentFee;
    c.currentAttempt++;
    return Math.min(currentFee + c.priorityFeeIncrement, c.maxPriorityFee);
  }

  getAttemptInfo(hash: string): { attempt: number; max: number } | null {
    const c = this.attempts.get(hash);
    return c ? { attempt: c.currentAttempt, max: c.maxAttempts } : null;
  }
}

export const resubmissionManager = new ResubmissionManager();
