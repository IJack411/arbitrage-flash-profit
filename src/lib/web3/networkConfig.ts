// Multi-chain network configuration for arbitrage scanning

export interface NetworkConfig {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  dexes: DexConfig[];
  tokens: TokenConfig[];
}

export interface DexConfig {
  name: string;
  factory: string;
  router: string;
  type: 'uniswap-v2' | 'uniswap-v3';
}

export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
}

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
  ethereum: {
    id: 'ethereum', name: 'Ethereum', chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    dexes: [
      { name: 'Uniswap V2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', type: 'uniswap-v2' },
      { name: 'SushiSwap', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac', router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', type: 'uniswap-v2' },
    ],
    tokens: [
      { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
      { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
      { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', decimals: 18 },
    ],
  },
  polygon: {
    id: 'polygon', name: 'Polygon', chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    dexes: [
      { name: 'QuickSwap', factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', type: 'uniswap-v2' },
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', type: 'uniswap-v2' },
    ],
    tokens: [
      { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC', decimals: 18 },
      { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC', decimals: 6 },
      { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', decimals: 18 },
    ],
  },
  arbitrum: {
    id: 'arbitrum', name: 'Arbitrum', chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    dexes: [
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', type: 'uniswap-v2' },
      { name: 'Camelot', factory: '0x6EcCab422D763aC031210895C81787E87B43A652', router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d', type: 'uniswap-v2' },
    ],
    tokens: [
      { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18 },
      { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', symbol: 'USDC', decimals: 6 },
      { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
    ],
  },
  bsc: {
    id: 'bsc', name: 'BNB Chain', chainId: 56,
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    dexes: [
      { name: 'PancakeSwap', factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', type: 'uniswap-v2' },
      { name: 'BiSwap', factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE', router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8', type: 'uniswap-v2' },
    ],
    tokens: [
      { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', decimals: 18 },
      { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18 },
      { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
    ],
  },
};

export const getNetworkConfig = (networkId: string): NetworkConfig | undefined => {
  return NETWORK_CONFIGS[networkId];
};

export const getAllNetworks = (): NetworkConfig[] => {
  return Object.values(NETWORK_CONFIGS);
};
