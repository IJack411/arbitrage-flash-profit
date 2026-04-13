// Cross-chain arbitrage detection service
import { BRIDGE_CONFIGS, CROSS_CHAIN_TOKENS, estimateBridgeCost, getChainName } from './bridgeConfig';

export interface CrossChainOpportunity {
  id: string;
  token: string;
  sourceChain: number;
  destChain: number;
  sourceChainName: string;
  destChainName: string;
  sourceDex: string;
  destDex: string;
  buyPrice: number;
  sellPrice: number;
  bridge: string;
  bridgeFee: number;
  bridgeTime: number;
  slippage: number;
  gasCostSource: number;
  gasCostDest: number;
  totalCost: number;
  grossProfit: number;
  netProfit: number;
  profitPercentage: number;
  tradeAmount: number;
  confidenceScore: 'low' | 'medium' | 'high';
  timestamp: number;
  status: 'active' | 'executing' | 'completed' | 'failed';
}

export const calculateSlippage = (liquidity: number, tradeAmount: number): number => {
  const impactFactor = tradeAmount / liquidity;
  return Math.min(impactFactor * 100, 5);
};

export const calculateCrossChainProfit = (
  buyPrice: number,
  sellPrice: number,
  tradeAmount: number,
  bridgeFee: number,
  gasCostSource: number,
  gasCostDest: number,
  slippage: number
): { grossProfit: number; netProfit: number; profitPercentage: number } => {
  const grossProfit = (sellPrice - buyPrice) * tradeAmount;
  const slippageCost = grossProfit * (slippage / 100);
  const totalCost = bridgeFee + gasCostSource + gasCostDest + slippageCost;
  const netProfit = grossProfit - totalCost;
  const profitPercentage = (netProfit / (buyPrice * tradeAmount)) * 100;
  return { grossProfit, netProfit, profitPercentage };
};

export const findBestBridge = (sourceChain: number, destChain: number, amount: number) => {
  const bridges = Object.values(BRIDGE_CONFIGS).filter(
    b => b.supportedChains.includes(sourceChain) && b.supportedChains.includes(destChain)
  );
  if (bridges.length === 0) return null;
  return bridges.reduce((best, bridge) => {
    const cost = estimateBridgeCost(bridge, amount);
    const bestCost = estimateBridgeCost(best, amount);
    return cost < bestCost ? bridge : best;
  });
};

// Execute cross-chain arbitrage via edge function
export const executeCrossChainArbitrage = async (
  opportunity: CrossChainOpportunity,
  supabase: {
    functions: {
      invoke: (
        functionName: string,
        options: { body: unknown }
      ) => Promise<{ data: { bundleHash?: string } | null; error: { message?: string } | null }>;
    };
  }
): Promise<{ success: boolean; bundleHash?: string; error?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('flashbots-executor', {
      body: {
        action: 'execute-arbitrage',
        network: opportunity.sourceChainName.toLowerCase(),
        params: {
          opportunity,
          isCrossChain: true,
          bridge: opportunity.bridge,
        }
      }
    });
    
    if (error) throw error;
    return { success: true, bundleHash: data?.bundleHash };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
};
