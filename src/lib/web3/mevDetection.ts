// MEV Detection and Resubmission Service
import { CompetingBundle } from './mevOptimizer';

export interface MempoolTransaction {
  hash: string;
  to: string;
  value: string;
  gasPrice: number;
  maxPriorityFee: number;
  data: string;
  timestamp: number;
}

export interface DetectionResult {
  isCompeting: boolean;
  competitors: CompetingBundle[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: string;
}

// Detect competing bundles targeting same opportunity
export const detectCompetingBundles = (
  targetAddresses: string[],
  mempoolTxs: MempoolTransaction[]
): DetectionResult => {
  const competitors: CompetingBundle[] = [];
  const relevantTxs = mempoolTxs.filter(tx => 
    targetAddresses.some(addr => tx.to?.toLowerCase() === addr.toLowerCase())
  );

  const grouped = new Map<string, MempoolTransaction[]>();
  relevantTxs.forEach(tx => {
    const sig = tx.data?.slice(0, 10) || 'unknown';
    if (!grouped.has(sig)) grouped.set(sig, []);
    grouped.get(sig)!.push(tx);
  });

  grouped.forEach((txs, sig) => {
    if (txs.length > 0) {
      const avgGasPrice = txs.reduce((s, t) => s + t.gasPrice, 0) / txs.length;
      competitors.push({
        bundleHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        targetBlock: Math.floor(Date.now() / 12000),
        estimatedBribe: avgGasPrice * 21000 / 1e9,
        probability: Math.min(0.9, 0.3 + txs.length * 0.1),
        detectedAt: Date.now(),
        txSignatures: txs.map(t => t.hash),
      });
    }
  });

  const riskLevel = competitors.length === 0 ? 'low' 
    : competitors.length < 3 ? 'medium' 
    : competitors.length < 5 ? 'high' : 'critical';

  const actions: Record<string, string> = {
    low: 'Proceed with standard bribe',
    medium: 'Increase bribe by 20% above competitors',
    high: 'Consider 50% bribe increase or wait',
    critical: 'High competition - evaluate profitability',
  };

  return {
    isCompeting: competitors.length > 0,
    competitors,
    riskLevel,
    recommendedAction: actions[riskLevel],
  };
};


