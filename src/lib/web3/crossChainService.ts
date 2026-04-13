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

export const generateMockCrossChainOpportunities = (): CrossChainOpportunity[] => {
  const opportunities: CrossChainOpportunity[] = [];
  const chains = [1, 137, 42161, 56];
  const dexes: Record<number, string[]> = {
    1: ['Uniswap', 'SushiSwap'], 137: ['QuickSwap', 'SushiSwap'],
    42161: ['SushiSwap', 'Camelot'], 56: ['PancakeSwap', 'BiSwap'],
  };

  CROSS_CHAIN_TOKENS.forEach(token => {
    for (let i = 0; i < chains.length; i++) {
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        const src = chains[i], dest = chains[j];
        if (!token.addresses[src] || !token.addresses[dest]) continue;
        const bridge = findBestBridge(src, dest, 10000);
        if (!bridge) continue;
        const basePrice = token.symbol === 'WETH' ? 2000 : 1;
        const priceDiff = (Math.random() - 0.3) * 0.05;
        if (priceDiff <= 0.005) continue;
        const buyPrice = basePrice, sellPrice = basePrice * (1 + priceDiff);
        const tradeAmount = token.symbol === 'WETH' ? 5 : 10000;
        const bridgeFee = estimateBridgeCost(bridge, tradeAmount * buyPrice);
        const { grossProfit, netProfit, profitPercentage } = calculateCrossChainProfit(
          buyPrice, sellPrice, tradeAmount, bridgeFee, 15, 5, 0.3
        );
        if (netProfit > 0) {
          opportunities.push({
            id: `cc-${src}-${dest}-${token.symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            token: token.symbol, sourceChain: src, destChain: dest,
            sourceChainName: getChainName(src), destChainName: getChainName(dest),
            sourceDex: dexes[src][0], destDex: dexes[dest][0],
            buyPrice, sellPrice, bridge: bridge.name, bridgeFee,
            bridgeTime: bridge.estimatedTime, slippage: 0.3,
            gasCostSource: 15, gasCostDest: 5, totalCost: bridgeFee + 20,
            grossProfit, netProfit, profitPercentage, tradeAmount,
            confidenceScore: profitPercentage > 1 ? 'high' : profitPercentage > 0.5 ? 'medium' : 'low',
            timestamp: Date.now(), status: 'active',
          });
        }
      }
    }
  });
  return opportunities.sort((a, b) => b.netProfit - a.netProfit).slice(0, 10);
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
