// Gas Optimization Engine for multi-chain arbitrage

export interface GasPrice {
  network: string;
  baseFee: number;
  priorityFee: number;
  maxFee: number;
  timestamp: number;
  blockNumber: number;
}

export interface GasHistory {
  network: string;
  prices: GasPrice[];
  avgBaseFee: number;
  avgPriorityFee: number;
  minBaseFee: number;
  maxBaseFee: number;
}

export interface ExecutionWindow {
  network: string;
  optimalTime: Date;
  expectedBaseFee: number;
  expectedPriorityFee: number;
  confidence: number;
  savings: number;
}

export interface CongestionLevel {
  network: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  utilizationPercent: number;
  pendingTxCount: number;
  recommendedPriorityFee: number;
}

export interface TransactionTiming {
  scheduledTime: Date;
  network: string;
  expectedGas: number;
  estimatedSavings: number;
  status: 'scheduled' | 'pending' | 'executed' | 'cancelled';
}

const generateGasHistory = (network: string, hours: number = 24): GasPrice[] => {
  const prices: GasPrice[] = [];
  const now = Date.now();
  const base = network === 'ethereum' ? 30 : network === 'polygon' ? 0.03 : network === 'arbitrum' ? 0.1 : 5;
  
  for (let i = hours * 12; i >= 0; i--) {
    const hour = new Date(now - i * 5 * 60000).getHours();
    const dayFactor = hour >= 14 && hour <= 22 ? 1.5 : hour >= 2 && hour <= 8 ? 0.6 : 1;
    const rand = 0.8 + Math.random() * 0.4;
    const baseFee = base * dayFactor * rand;
    
    prices.push({
      network, baseFee, priorityFee: baseFee * 0.1 * rand, maxFee: baseFee * 1.25,
      timestamp: now - i * 5 * 60000, blockNumber: 18000000 - i * 25,
    });
  }
  return prices;
};

export const getGasHistory = (network: string): GasHistory => {
  const prices = generateGasHistory(network);
  const fees = prices.map(p => p.baseFee);
  return {
    network, prices,
    avgBaseFee: fees.reduce((a, b) => a + b, 0) / fees.length,
    avgPriorityFee: prices.reduce((a, b) => a + b.priorityFee, 0) / prices.length,
    minBaseFee: Math.min(...fees), maxBaseFee: Math.max(...fees),
  };
};

export const getCurrentGasPrice = (network: string): GasPrice => {
  return getGasHistory(network).prices.slice(-1)[0];
};

export const getCongestionLevel = (network: string): CongestionLevel => {
  const current = getCurrentGasPrice(network);
  const history = getGasHistory(network);
  const ratio = current.baseFee / history.avgBaseFee;
  
  const level = ratio > 2 ? 'critical' : ratio > 1.5 ? 'high' : ratio > 1 ? 'medium' : 'low';
  
  return {
    network, level,
    utilizationPercent: Math.min(95, ratio * 50),
    pendingTxCount: Math.floor(Math.random() * 50000) + 10000,
    recommendedPriorityFee: current.priorityFee * (ratio > 1.5 ? 2 : ratio > 1 ? 1.5 : 1),
  };
};

export const calculateOptimalGas = (network: string, urgency: 'low' | 'medium' | 'high') => {
  const current = getCurrentGasPrice(network);
  const congestion = getCongestionLevel(network);
  const uMult = { low: 0.9, medium: 1.1, high: 1.5 }[urgency];
  const cMult = { low: 1, medium: 1.2, high: 1.5, critical: 2 }[congestion.level];
  const maxPriorityFeePerGas = current.priorityFee * uMult * cMult;
  const maxFeePerGas = current.baseFee * 1.25 + maxPriorityFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas, estimatedCost: maxFeePerGas * 21000 / 1e9 };
};

export const scheduleTransaction = (network: string, maxWaitHours: number = 6): TransactionTiming => {
  const history = getGasHistory(network);
  const current = getCurrentGasPrice(network);
  let bestTime = new Date();
  let lowestGas = current.baseFee;
  
  for (let h = 1; h <= maxWaitHours; h++) {
    const hour = (new Date().getHours() + h) % 24;
    const factor = hour >= 2 && hour <= 8 ? 0.7 : hour >= 14 && hour <= 22 ? 1.3 : 1;
    const expected = history.avgBaseFee * factor;
    if (expected < lowestGas) { lowestGas = expected; bestTime = new Date(Date.now() + h * 3600000); }
  }
  
  return {
    scheduledTime: bestTime, network, expectedGas: lowestGas,
    estimatedSavings: Math.max(0, ((current.baseFee - lowestGas) / current.baseFee) * 100),
    status: 'scheduled',
  };
};
