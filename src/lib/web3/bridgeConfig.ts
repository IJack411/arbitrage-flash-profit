// Bridge protocol configurations for cross-chain arbitrage

export interface BridgeConfig {
  name: string;
  id: string;
  supportedChains: number[];
  contractAddresses: Record<number, string>;
  estimatedTime: number; // in minutes
  baseFee: number; // in USD
  feePercentage: number; // percentage of transfer amount
}

export const BRIDGE_CONFIGS: Record<string, BridgeConfig> = {
  stargate: {
    name: 'Stargate Finance',
    id: 'stargate',
    supportedChains: [1, 137, 42161, 56, 43114, 10],
    contractAddresses: {
      1: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
      137: '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd',
      42161: '0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614',
      56: '0x4a364f8c717cAAD9A442737Eb7b8A55cc6cf18D8',
    },
    estimatedTime: 5,
    baseFee: 0.5,
    feePercentage: 0.06,
  },
  hop: {
    name: 'Hop Protocol',
    id: 'hop',
    supportedChains: [1, 137, 42161, 10, 100],
    contractAddresses: {
      1: '0xb8901acB165ed027E32754E0FFe830802919727f',
      137: '0x25D8039bB044dC227f741a9e381CA4cEAE2E6aE8',
      42161: '0x0e0E3d2C5c292161999474247956EF542caBF8dd',
    },
    estimatedTime: 10,
    baseFee: 0.3,
    feePercentage: 0.04,
  },
  across: {
    name: 'Across Protocol',
    id: 'across',
    supportedChains: [1, 137, 42161, 10],
    contractAddresses: {
      1: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
      137: '0x69B5c72837769eF1e7C164Abc6515DcFf217F920',
      42161: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
    },
    estimatedTime: 2,
    baseFee: 0.2,
    feePercentage: 0.05,
  },
};

export interface CrossChainToken {
  symbol: string;
  addresses: Record<number, string>;
  decimals: number;
}

export const CROSS_CHAIN_TOKENS: CrossChainToken[] = [
  {
    symbol: 'USDC',
    addresses: {
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    },
    decimals: 6,
  },
  {
    symbol: 'USDT',
    addresses: {
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      56: '0x55d398326f99059fF775485246999027B3197955',
    },
    decimals: 6,
  },
  {
    symbol: 'WETH',
    addresses: {
      1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
    decimals: 18,
  },
];

export const getChainName = (chainId: number): string => {
  const names: Record<number, string> = { 1: 'Ethereum', 137: 'Polygon', 42161: 'Arbitrum', 56: 'BSC', 10: 'Optimism' };
  return names[chainId] || 'Unknown';
};

export const estimateBridgeCost = (bridge: BridgeConfig, amount: number): number => {
  return bridge.baseFee + (amount * bridge.feePercentage / 100);
};
