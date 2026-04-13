// Advanced Gas Optimization Engine with EIP-1559 Predictions

export interface BlockData {
  number: number;
  baseFee: number;
  gasUsed: number;
  gasLimit: number;
  timestamp: number;
  utilization: number;
}

export interface MempoolState {
  network: string;
  pendingCount: number;
  queuedCount: number;
  avgPendingGas: number;
  priorityFeeDistribution: { percentile: number; fee: number }[];
  congestionScore: number;
}

export interface GasScheduleEntry {
  id: string;
  network: string;
  targetBaseFee: number;
  maxWaitMinutes: number;
  status: 'waiting' | 'ready' | 'executed' | 'expired';
  createdAt: Date;
  executeAt?: Date;
  actualBaseFee?: number;
}

export interface NetworkGasComparison {
  network: string;
  currentBaseFee: number;
  avgBaseFee24h: number;
  percentile: number;
  recommendation: 'execute_now' | 'wait' | 'urgent';
  estimatedSavingsPercent: number;
}

const blockCache: Record<string, BlockData[]> = {};

export const generateBlockHistory = (network: string, blocks: number = 100): BlockData[] => {
  if (blockCache[network]?.length === blocks) return blockCache[network];
  const base = { ethereum: 30, polygon: 0.03, arbitrum: 0.1, bsc: 5 }[network] || 30;
  const data: BlockData[] = [];
  const now = Date.now();
  
  for (let i = blocks; i >= 0; i--) {
    const hour = new Date(now - i * 12000).getHours();
    const dayFactor = hour >= 14 && hour <= 22 ? 1.4 : hour >= 2 && hour <= 8 ? 0.65 : 1;
    const utilization = 0.5 + Math.random() * 0.45;
    const baseFee = base * dayFactor * (0.85 + Math.random() * 0.3) * (utilization > 0.5 ? 1 + (utilization - 0.5) : 1);
    
    data.push({
      number: 18500000 - i,
      baseFee,
      gasUsed: Math.floor(15000000 * utilization),
      gasLimit: 15000000,
      timestamp: now - i * 12000,
      utilization,
    });
  }
  blockCache[network] = data;
  return data;
};

export const getMempoolState = (network: string): MempoolState => {
  const pending = Math.floor(5000 + Math.random() * 45000);
  const blocks = generateBlockHistory(network);
  const avgUtil = blocks.slice(-10).reduce((a, b) => a + b.utilization, 0) / 10;
  
  return {
    network,
    pendingCount: pending,
    queuedCount: Math.floor(pending * 0.3),
    avgPendingGas: blocks.slice(-1)[0]?.baseFee * (1 + Math.random() * 0.2) || 30,
    priorityFeeDistribution: [
      { percentile: 10, fee: 0.5 },
      { percentile: 25, fee: 1 },
      { percentile: 50, fee: 1.5 },
      { percentile: 75, fee: 2.5 },
      { percentile: 90, fee: 5 },
    ],
    congestionScore: Math.min(100, avgUtil * 100 + (pending / 500)),
  };
};

export const predictNextBlocks = (network: string, blocksAhead: number = 20): BlockData[] => {
  const history = generateBlockHistory(network);
  const recent = history.slice(-20);
  const avgUtil = recent.reduce((a, b) => a + b.utilization, 0) / recent.length;
  const lastBlock = recent[recent.length - 1];
  const predictions: BlockData[] = [];
  
  for (let i = 1; i <= blocksAhead; i++) {
    const targetUtil = avgUtil + (Math.random() - 0.5) * 0.1;
    const change = targetUtil > 0.5 ? 1.125 : 0.875;
    const prevFee = predictions[i - 2]?.baseFee || lastBlock.baseFee;
    const newFee = Math.max(prevFee * 0.875, Math.min(prevFee * 1.125, prevFee * change));
    
    predictions.push({
      number: lastBlock.number + i,
      baseFee: newFee,
      gasUsed: Math.floor(15000000 * targetUtil),
      gasLimit: 15000000,
      timestamp: lastBlock.timestamp + i * 12000,
      utilization: targetUtil,
    });
  }
  return predictions;
};

export const getNetworkComparison = (): NetworkGasComparison[] => {
  return ['ethereum', 'polygon', 'arbitrum', 'bsc'].map(network => {
    const blocks = generateBlockHistory(network);
    const current = blocks[blocks.length - 1].baseFee;
    const fees = blocks.map(b => b.baseFee).sort((a, b) => a - b);
    const avg = fees.reduce((a, b) => a + b, 0) / fees.length;
    const percentile = (fees.filter(f => f < current).length / fees.length) * 100;
    
    return {
      network,
      currentBaseFee: current,
      avgBaseFee24h: avg,
      percentile,
      recommendation: percentile < 30 ? 'execute_now' : percentile > 70 ? 'wait' : 'urgent',
      estimatedSavingsPercent: Math.max(0, ((avg - current) / avg) * 100),
    };
  });
};

export const getOptimalPriorityFee = (network: string, urgency: number): number => {
  const mempool = getMempoolState(network);
  const targetPercentile = Math.min(90, 50 + urgency * 40);
  const dist = mempool.priorityFeeDistribution;
  const lower = dist.find(d => d.percentile <= targetPercentile) || dist[0];
  const upper = dist.find(d => d.percentile >= targetPercentile) || dist[dist.length - 1];
  return (lower.fee + upper.fee) / 2;
};
