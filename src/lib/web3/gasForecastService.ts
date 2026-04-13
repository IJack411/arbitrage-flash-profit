// EIP-1559 Gas Forecasting Service

import { GasHistory, ExecutionWindow, getGasHistory, getCurrentGasPrice } from './gasOptimizer';

export interface BaseFeePredict {
  network: string;
  currentBaseFee: number;
  predictions: { time: Date; baseFee: number; confidence: number }[];
  trend: 'rising' | 'falling' | 'stable';
  volatility: number;
}

export interface PriorityFeeStrategy {
  network: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  recommendedFee: number;
  expectedWaitBlocks: number;
  expectedWaitSeconds: number;
}

export const predictBaseFee = (network: string, hoursAhead: number = 6): BaseFeePredict => {
  const history = getGasHistory(network);
  const current = getCurrentGasPrice(network);
  const recent = history.prices.slice(-48);
  
  const firstHalf = recent.slice(0, 24).reduce((a, b) => a + b.baseFee, 0) / 24;
  const secondHalf = recent.slice(24).reduce((a, b) => a + b.baseFee, 0) / 24;
  const ratio = secondHalf / firstHalf;
  const trend = ratio > 1.1 ? 'rising' : ratio < 0.9 ? 'falling' : 'stable';
  
  const mean = history.avgBaseFee;
  const variance = recent.reduce((sum, p) => sum + Math.pow(p.baseFee - mean, 2), 0) / recent.length;
  const volatility = Math.sqrt(variance) / mean;
  
  const predictions: BaseFeePredict['predictions'] = [];
  for (let h = 1; h <= hoursAhead; h++) {
    const hour = (new Date().getHours() + h) % 24;
    const dayFactor = hour >= 14 && hour <= 22 ? 1.3 : hour >= 2 && hour <= 8 ? 0.7 : 1;
    const trendFactor = trend === 'rising' ? 1 + (0.02 * h) : trend === 'falling' ? 1 - (0.02 * h) : 1;
    const predicted = current.baseFee * dayFactor * trendFactor;
    const confidence = Math.max(0.5, 0.95 - (h * 0.05) - (volatility * 0.3));
    predictions.push({ time: new Date(Date.now() + h * 3600000), baseFee: predicted, confidence });
  }
  
  return { network, currentBaseFee: current.baseFee, predictions, trend, volatility };
};

export const findOptimalWindow = (network: string): ExecutionWindow => {
  const forecast = predictBaseFee(network, 12);
  const current = getCurrentGasPrice(network);
  const optimal = forecast.predictions.reduce((min, p) => p.baseFee < min.baseFee ? p : min);
  const savings = ((current.baseFee - optimal.baseFee) / current.baseFee) * 100;
  
  return {
    network,
    optimalTime: optimal.time,
    expectedBaseFee: optimal.baseFee,
    expectedPriorityFee: optimal.baseFee * 0.1,
    confidence: optimal.confidence,
    savings: Math.max(0, savings),
  };
};

export const getPriorityFeeStrategy = (network: string, urgency: PriorityFeeStrategy['urgency']): PriorityFeeStrategy => {
  const current = getCurrentGasPrice(network);
  const mult = { low: 0.8, medium: 1, high: 1.5, urgent: 2.5 }[urgency];
  const wait = { low: 10, medium: 3, high: 1, urgent: 0 }[urgency];
  const blockTime = network === 'ethereum' ? 12 : network === 'polygon' ? 2 : 0.3;
  
  return {
    network, urgency,
    recommendedFee: current.priorityFee * mult,
    expectedWaitBlocks: wait,
    expectedWaitSeconds: wait * blockTime,
  };
};

export const getOptimalWindowsAllNetworks = (): ExecutionWindow[] => {
  return ['ethereum', 'polygon', 'arbitrum', 'bsc'].map(findOptimalWindow);
};
