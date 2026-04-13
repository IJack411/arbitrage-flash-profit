// MEV Protection Service - Sandwich Detection, Simulation, Slippage Protection
import { SandwichAttack, MempoolTx, SimulationResult, SlippageConfig, ProtectionConfig, MempoolStats } from '@/types/mevProtection';

const DEX_ROUTERS: Record<string, string> = {
  '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D': 'Uniswap V2',
  '0xE592427A0AEce92De3Edee1F18E0157C05861564': 'Uniswap V3',
  '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F': 'SushiSwap',
  '0x1111111254fb6c44bAC0beD2854e76F90643097d': '1inch',
};

const SWAP_METHODS: Record<string, string> = {
  '0x38ed1739': 'swapExactTokensForTokens',
  '0x7ff36ab5': 'swapExactETHForTokens',
  '0x18cbafe5': 'swapExactTokensForETH',
  '0x5c11d795': 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
  '0xfb3bdb41': 'swapETHForExactTokens',
};

export const detectSandwichAttack = (txs: MempoolTx[], targetTx: MempoolTx): SandwichAttack | null => {
  const methodId = targetTx.data?.slice(0, 10);
  if (!SWAP_METHODS[methodId]) return null;

  const sameDex = txs.filter(tx => tx.to === targetTx.to && tx.hash !== targetTx.hash);
  const frontrun = sameDex.find(tx => tx.gasPrice > targetTx.gasPrice * 1.1 && tx.timestamp <= targetTx.timestamp);
  const backrun = sameDex.find(tx => tx.gasPrice < targetTx.gasPrice && tx.timestamp > targetTx.timestamp && tx.from === frontrun?.from);

  if (frontrun && backrun) {
    const profit = (frontrun.gasPrice - backrun.gasPrice) * 21000 / 1e9;
    return {
      id: `sandwich-${Date.now()}`,
      frontrunTx: frontrun, victimTx: targetTx, backrunTx: backrun,
      attackerAddress: frontrun.from,
      estimatedProfit: profit,
      targetToken: 'Unknown',
      targetDex: DEX_ROUTERS[targetTx.to] || 'Unknown DEX',
      detectedAt: Date.now(),
      riskLevel: profit > 100 ? 'critical' : profit > 50 ? 'high' : profit > 10 ? 'medium' : 'low',
      status: 'detected',
    };
  }
  return null;
};

export const simulateTransaction = async (tx: Partial<MempoolTx>): Promise<SimulationResult> => {
  await new Promise(r => setTimeout(r, 500));
  const success = Math.random() > 0.15;
  const gasUsed = 150000 + Math.floor(Math.random() * 100000);
  return {
    success, gasUsed,
    effectiveGasPrice: 30 + Math.random() * 20,
    returnValue: success ? '0x1' : '0x0',
    revertReason: success ? undefined : 'Insufficient output amount',
    logs: success ? [{ address: tx.to || '', topics: ['0xd78ad95f'], data: '0x', decoded: { name: 'Swap', args: {} } }] : [],
    stateChanges: success ? [{ address: tx.to || '', slot: '0x0', before: '0x100', after: '0x150' }] : [],
    profitEstimate: success ? 20 + Math.random() * 80 : 0,
    slippageImpact: 0.1 + Math.random() * 2,
  };
};

export const calculateDynamicSlippage = (volatility: number, liquidity: number, tradeSize: number): number => {
  const base = 0.5;
  const volAdj = volatility * 0.1;
  const liqAdj = Math.max(0, (tradeSize / liquidity) * 100);
  return Math.min(5, base + volAdj + liqAdj);
};

export const getMempoolStats = (): MempoolStats => {
  const pending = 5000 + Math.floor(Math.random() * 45000);
  const suspicious = Math.floor(pending * 0.02);
  return {
    pendingTxCount: pending,
    avgGasPrice: 25 + Math.random() * 50,
    highPriorityCount: Math.floor(pending * 0.1),
    suspiciousTxCount: suspicious,
    lastBlockTxs: 150 + Math.floor(Math.random() * 100),
    congestionLevel: pending > 40000 ? 'extreme' : pending > 25000 ? 'high' : pending > 10000 ? 'medium' : 'low',
  };
};

export const generateMockMempoolTxs = (count: number): MempoolTx[] => {
  const methods = Object.keys(SWAP_METHODS);
  const dexes = Object.keys(DEX_ROUTERS);
  return Array.from({ length: count }, (_, i) => ({
    hash: `0x${Math.random().toString(16).substr(2, 64)}`,
    from: `0x${Math.random().toString(16).substr(2, 40)}`,
    to: dexes[Math.floor(Math.random() * dexes.length)],
    value: (Math.random() * 10).toFixed(4),
    gasPrice: 20 + Math.random() * 100,
    maxPriorityFee: 1 + Math.random() * 10,
    maxFeePerGas: 30 + Math.random() * 100,
    nonce: Math.floor(Math.random() * 1000),
    data: `${methods[Math.floor(Math.random() * methods.length)]}${Math.random().toString(16).substr(2, 56)}`,
    timestamp: Date.now() - Math.random() * 60000,
    methodId: methods[Math.floor(Math.random() * methods.length)],
    decodedMethod: SWAP_METHODS[methods[Math.floor(Math.random() * methods.length)]],
  }));
};

export const defaultProtectionConfig: ProtectionConfig = {
  enabled: true, useFlashbotsProtect: true, privateMempool: true,
  maxGasPrice: 200, sandwichDetection: true, frontrunProtection: true, backrunProtection: true,
  slippage: { maxSlippage: 1, dynamicSlippage: true, volatilityAdjustment: true, minOutput: 0, deadline: 1200 },
};
