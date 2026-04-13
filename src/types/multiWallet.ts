import { ethers } from 'ethers';

export type WalletConnectionType = 'metamask' | 'walletconnect' | 'coinbase' | 'trust';

export type TradingStrategy = 'dex-arbitrage' | 'flash-loans' | 'cross-chain' | 'mev-protection' | 'sandwich-detection' | 'custom';

export type NetworkDesignation = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc' | 'optimism' | 'avalanche' | 'base' | 'all';

export interface WalletStrategyConfig {
  strategy: TradingStrategy;
  isEnabled: boolean;
  priority: number;
  maxAllocation: number; // Percentage of wallet balance
  riskLevel: 'low' | 'medium' | 'high';
}

export interface WalletNetworkConfig {
  network: NetworkDesignation;
  isEnabled: boolean;
  gasLimitMultiplier: number;
  priorityFeeGwei: number;
}

export interface ConnectedWallet {
  id: string;
  address: string;
  name: string;
  connectionType: WalletConnectionType;
  chainId: number;
  balance: string;
  balanceUSD: number;
  tokens: TokenBalance[];
  isActive: boolean;
  isPrimary: boolean;
  groupId?: string;
  tradingLimits: WalletTradingLimits;
  allocatedBots: string[];
  provider?: ethers.BrowserProvider;
  signer?: ethers.Signer;
  connectedAt: string;
  lastActivity?: string;
  // New fields for strategy and network designation
  strategyConfigs?: WalletStrategyConfig[];
  networkConfigs?: WalletNetworkConfig[];
  designatedPurpose?: 'trading' | 'holding' | 'testing' | 'gas-reserve';
  tags?: string[];
  notes?: string;
}

export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  balanceUSD: number;
  decimals: number;
  logoUrl?: string;
}

export interface WalletTradingLimits {
  maxDailyTrades: number;
  maxTradeSize: number;
  maxDailyVolume: number;
  maxConcurrentTrades: number;
  allowedNetworks: string[];
  allowedDexes: string[];
  stopLossPercentage: number;
  dailyLossLimit: number;
  isEnabled: boolean;
}

export interface WalletGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  walletIds: string[];
  sharedLimits?: WalletTradingLimits;
  createdAt: string;
  // New fields for group-level strategy designation
  defaultStrategy?: TradingStrategy;
  defaultNetworks?: NetworkDesignation[];
}

export interface PortfolioSummary {
  totalBalanceUSD: number;
  totalWallets: number;
  activeWallets: number;
  totalTokens: number;
  networkBreakdown: { network: string; balanceUSD: number; percentage: number }[];
  tokenBreakdown: { symbol: string; balanceUSD: number; percentage: number }[];
  dailyChange: number;
  dailyChangePercentage: number;
}

export interface WalletBotAllocation {
  walletId: string;
  botId: string;
  allocatedAmount: number;
  maxTradesPerDay: number;
  isActive: boolean;
}

export interface WalletPerformanceMetrics {
  walletId: string;
  totalPnL: number;
  totalPnLPercentage: number;
  tradesExecuted: number;
  successfulTrades: number;
  failedTrades: number;
  winRate: number;
  avgTradeSize: number;
  avgProfit: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  sharpeRatio: number;
  maxDrawdown: number;
  lastUpdated: string;
}

export const DEFAULT_TRADING_LIMITS: WalletTradingLimits = {
  maxDailyTrades: 50,
  maxTradeSize: 10000,
  maxDailyVolume: 100000,
  maxConcurrentTrades: 3,
  allowedNetworks: ['ethereum', 'polygon', 'arbitrum', 'bsc'],
  allowedDexes: ['uniswap', 'sushiswap', 'pancakeswap', 'curve'],
  stopLossPercentage: 5,
  dailyLossLimit: 500,
  isEnabled: true,
};

export const DEFAULT_STRATEGY_CONFIGS: WalletStrategyConfig[] = [
  { strategy: 'dex-arbitrage', isEnabled: true, priority: 1, maxAllocation: 30, riskLevel: 'medium' },
  { strategy: 'flash-loans', isEnabled: false, priority: 2, maxAllocation: 20, riskLevel: 'high' },
  { strategy: 'cross-chain', isEnabled: true, priority: 3, maxAllocation: 25, riskLevel: 'medium' },
  { strategy: 'mev-protection', isEnabled: true, priority: 4, maxAllocation: 15, riskLevel: 'low' },
  { strategy: 'sandwich-detection', isEnabled: false, priority: 5, maxAllocation: 10, riskLevel: 'high' },
];

export const DEFAULT_NETWORK_CONFIGS: WalletNetworkConfig[] = [
  { network: 'ethereum', isEnabled: true, gasLimitMultiplier: 1.2, priorityFeeGwei: 2 },
  { network: 'polygon', isEnabled: true, gasLimitMultiplier: 1.1, priorityFeeGwei: 30 },
  { network: 'arbitrum', isEnabled: true, gasLimitMultiplier: 1.1, priorityFeeGwei: 0.1 },
  { network: 'bsc', isEnabled: true, gasLimitMultiplier: 1.1, priorityFeeGwei: 3 },
  { network: 'optimism', isEnabled: false, gasLimitMultiplier: 1.1, priorityFeeGwei: 0.001 },
  { network: 'avalanche', isEnabled: false, gasLimitMultiplier: 1.2, priorityFeeGwei: 25 },
  { network: 'base', isEnabled: false, gasLimitMultiplier: 1.1, priorityFeeGwei: 0.001 },
];

export const WALLET_COLORS = [
  '#00F0FF', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE'
];

export const CONNECTION_TYPES: { type: WalletConnectionType; name: string; icon: string }[] = [
  { type: 'metamask', name: 'MetaMask', icon: '🦊' },
  { type: 'walletconnect', name: 'WalletConnect', icon: '🔗' },
  { type: 'coinbase', name: 'Coinbase Wallet', icon: '💰' },
  { type: 'trust', name: 'Trust Wallet', icon: '🛡️' },
];

export const STRATEGY_INFO: Record<TradingStrategy, { name: string; description: string; riskLevel: string }> = {
  'dex-arbitrage': { 
    name: 'DEX Arbitrage', 
    description: 'Exploit price differences between decentralized exchanges',
    riskLevel: 'Medium'
  },
  'flash-loans': { 
    name: 'Flash Loans', 
    description: 'Leverage uncollateralized loans for arbitrage opportunities',
    riskLevel: 'High'
  },
  'cross-chain': { 
    name: 'Cross-Chain Arbitrage', 
    description: 'Arbitrage across different blockchain networks',
    riskLevel: 'Medium'
  },
  'mev-protection': { 
    name: 'MEV Protection', 
    description: 'Protect transactions from front-running and sandwich attacks',
    riskLevel: 'Low'
  },
  'sandwich-detection': { 
    name: 'Sandwich Detection', 
    description: 'Detect and avoid sandwich attack opportunities',
    riskLevel: 'High'
  },
  'custom': { 
    name: 'Custom Strategy', 
    description: 'User-defined trading strategy',
    riskLevel: 'Variable'
  },
};

export const NETWORK_INFO: Record<NetworkDesignation, { name: string; chainId: number; color: string }> = {
  'ethereum': { name: 'Ethereum', chainId: 1, color: '#627EEA' },
  'polygon': { name: 'Polygon', chainId: 137, color: '#8247E5' },
  'arbitrum': { name: 'Arbitrum', chainId: 42161, color: '#28A0F0' },
  'bsc': { name: 'BNB Chain', chainId: 56, color: '#F0B90B' },
  'optimism': { name: 'Optimism', chainId: 10, color: '#FF0420' },
  'avalanche': { name: 'Avalanche', chainId: 43114, color: '#E84142' },
  'base': { name: 'Base', chainId: 8453, color: '#0052FF' },
  'all': { name: 'All Networks', chainId: 0, color: '#00F0FF' },
};
