// Centralized config for networks and tokens used by both backend and frontend

export type NetworkName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'bsc';

export const CORE_BASE_TOKENS: Record<NetworkName, Set<string>> = {
  ethereum: new Set(['WETH', 'ETH', 'LINK', 'UNI', 'AAVE', 'LDO', 'CRV', 'FRAX', 'MKR', 'ENS', 'SNX', 'COMP']),
  polygon: new Set(['WMATIC', 'MATIC', 'WETH', 'ETH', 'LINK', 'AAVE', 'GHST', 'CRV', 'SAND', 'QUICK']),
  arbitrum: new Set(['WETH', 'ETH', 'ARB', 'GMX', 'MAGIC', 'LINK', 'RDNT', 'GRAIL', 'DPX']),
  base: new Set(['WETH', 'ETH', 'LINK', 'AERO', 'DEGEN', 'BRETT', 'TOSHI', 'DACKIE']),
  bsc: new Set(['WBNB', 'BNB', 'ETH', 'CAKE', 'XVS', 'ALPACA', 'MDX']),
};

export const SEARCH_TERMS_BY_NETWORK: Record<NetworkName, string[]> = {
  ethereum: [
    'WETH USDC', 'WETH USDT', 'LINK USDC', 'UNI USDC', 'AAVE USDC', 'LDO USDC', 'CRV USDC', 'DAI USDC', 'USDC USDT',
    'MKR USDC', 'ENS USDC', 'SNX USDC', 'COMP USDC',
    'WETH', 'LINK', 'MKR', 'ENS', 'SNX', 'COMP'
  ],
  polygon: [
    'WMATIC USDC', 'WMATIC USDT', 'WETH USDC', 'LINK USDC', 'AAVE USDC', 'GHST USDC', 'DAI USDC', 'USDC USDT',
    'SAND USDC', 'QUICK USDC',
    'WMATIC', 'WETH', 'GHST', 'SAND', 'QUICK'
  ],
  arbitrum: [
    'WETH USDC', 'WETH USDT', 'ARB USDC', 'GMX USDC', 'MAGIC USDC', 'LINK USDC', 'DAI USDC', 'USDC USDT',
    'GRAIL USDC', 'DPX USDC',
    'ARB', 'WETH', 'GRAIL', 'DPX'
  ],
  base: [
    'WETH USDC', 'WETH USDT', 'LINK USDC', 'AERO USDC', 'DEGEN USDC', 'USDC USDT',
    'TOSHI USDC', 'DACKIE USDC',
    'WETH', 'AERO', 'TOSHI', 'DACKIE'
  ],
  bsc: [
    'WBNB USDT', 'WBNB USDC', 'ETH USDT', 'CAKE USDT', 'USDC USDT',
    'ALPACA USDT', 'MDX USDT',
    'WBNB', 'ALPACA', 'MDX'
  ],
};

export const isNetworkName = (value: string): value is NetworkName => {
  return value === 'ethereum' || value === 'polygon' || value === 'arbitrum' || value === 'base' || value === 'bsc';
};
