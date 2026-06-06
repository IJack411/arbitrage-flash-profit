// Centralized config for networks and tokens used by both backend and frontend
// WETH/* pairs removed — too competitive, spreads captured in milliseconds by HFT bots.
// Focus on mid-cap volatile tokens with genuine cross-DEX price discrepancies.

export type NetworkName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'bsc';

export const CORE_BASE_TOKENS: Record<NetworkName, Set<string>> = {
  ethereum: new Set(['WBTC', 'LINK', 'UNI', 'AAVE', 'CRV', 'SNX', 'LDO', 'MKR', 'COMP', 'RPL']),
  polygon: new Set(['WMATIC', 'MATIC', 'LINK', 'AAVE', 'GHST', 'CRV', 'SAND', 'QUICK', 'BAL', 'DQUICK']),
  arbitrum: new Set(['ARB', 'GMX', 'MAGIC', 'LINK', 'RDNT', 'GRAIL', 'DPX', 'PENDLE', 'GNS']),
  base: new Set(['LINK', 'AERO', 'DEGEN', 'BRETT', 'TOSHI', 'DACKIE', 'BALD']),
  bsc: new Set(['WBNB', 'BNB', 'CAKE', 'XVS', 'ALPACA', 'MDX', 'BAKE']),
};

export const SEARCH_TERMS_BY_NETWORK: Record<NetworkName, string[]> = {
  ethereum: [
    // Mid-cap DeFi tokens — real cross-DEX spreads exist here
    'WBTC USDC', 'WBTC USDT',
    'LINK USDC', 'LINK USDT',
    'UNI USDC', 'AAVE USDC',
    'CRV USDC', 'SNX USDC',
    'LDO USDC', 'MKR USDC',
    'COMP USDC', 'RPL USDC',
    'DAI USDC', 'USDC USDT',
    'WBTC', 'LINK', 'UNI', 'AAVE', 'CRV',
  ],
  polygon: [
    'WMATIC USDC', 'WMATIC USDT',
    'LINK USDC', 'AAVE USDC',
    'GHST USDC', 'CRV USDC',
    'SAND USDC', 'QUICK USDC',
    'BAL USDC', 'DQUICK USDC',
    'DAI USDC', 'USDC USDT',
    'WMATIC', 'GHST', 'SAND', 'QUICK',
  ],
  arbitrum: [
    // Native Arbitrum ecosystem tokens — volatile, less contested
    'ARB USDC', 'GMX USDC',
    'MAGIC USDC', 'LINK USDC',
    'RDNT USDC', 'GRAIL USDC',
    'DPX USDC', 'PENDLE USDC',
    'GNS USDC',
    'DAI USDC', 'USDC USDT',
    'ARB', 'GMX', 'GRAIL', 'DPX', 'MAGIC',
  ],
  base: [
    // Base-native tokens — newer ecosystem, wider spreads
    'LINK USDC', 'AERO USDC',
    'DEGEN USDC', 'BRETT USDC',
    'TOSHI USDC', 'DACKIE USDC',
    'BALD USDC',
    'USDC USDT',
    'AERO', 'DEGEN', 'BRETT', 'TOSHI',
  ],
  bsc: [
    'WBNB USDT', 'WBNB USDC',
    'CAKE USDT', 'XVS USDT',
    'ALPACA USDT', 'MDX USDT',
    'BAKE USDT',
    'USDC USDT',
    'WBNB', 'CAKE', 'ALPACA',
  ],
};

export const isNetworkName = (value: string): value is NetworkName => {
  return value === 'ethereum' || value === 'polygon' || value === 'arbitrum' || value === 'base' || value === 'bsc';
};
