import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import {
  ConnectedWallet,
  WalletGroup,
  WalletTradingLimits,
  PortfolioSummary,
  WalletConnectionType,
  WalletStrategyConfig,
  WalletNetworkConfig,
  TradingStrategy,
  NetworkDesignation,
  DEFAULT_TRADING_LIMITS,
  DEFAULT_STRATEGY_CONFIGS,
  DEFAULT_NETWORK_CONFIGS,
  WALLET_COLORS,
} from '@/types/multiWallet';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { WalletErrorDetails, WalletErrorInfo, createWalletErrorInfo } from '@/components/wallet/WalletErrorDetails';

// Standard EIP-1193 error codes
const WALLET_ERROR_CODES = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
  REQUEST_PENDING: -32002,
  CHAIN_NOT_ADDED: 4902,
};

// Helper to extract error code from various error formats
const extractErrorCode = (error: unknown): number | string | undefined => {
  if (!error) return undefined;
  
  const err = error as { code?: number; info?: { error?: { code?: number } } };
  
  if (err?.code !== undefined) return err.code;
  if (err?.info?.error?.code !== undefined) return err.info.error.code;
  
  return undefined;
};

// Helper to check if error is a user rejection
const isUserRejectionError = (error: unknown): boolean => {
  if (!error) return false;
  
  // Check for error code 4001 (standard EIP-1193 user rejection)
  const err = error as { code?: number; info?: { error?: { code?: number } }; message?: string };
  
  // Direct code check
  if (err?.code === WALLET_ERROR_CODES.USER_REJECTED) return true;
  
  // Nested code check (ethers.js v6 format)
  if (err?.info?.error?.code === WALLET_ERROR_CODES.USER_REJECTED) return true;
  
  // Message-based detection for ethers.js wrapped errors
  const message = err?.message || String(error);
  const lowerMessage = message.toLowerCase();
  
  return (
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied') ||
    lowerMessage.includes('rejected the request') ||
    lowerMessage.includes('user cancelled') ||
    lowerMessage.includes('user canceled') ||
    (lowerMessage.includes('action="requestaccess"') && lowerMessage.includes('reason="rejected"'))
  );
};

// Helper to check if request is already pending
const isRequestPendingError = (error: unknown): boolean => {
  if (!error) return false;
  
  const err = error as { code?: number; message?: string };
  
  if (err?.code === WALLET_ERROR_CODES.REQUEST_PENDING) return true;
  
  const message = err?.message || String(error);
  const lowerMessage = message.toLowerCase();
  
  return (
    lowerMessage.includes('already pending') ||
    lowerMessage.includes('request already pending') ||
    lowerMessage.includes('-32002')
  );
};

interface MultiWalletContextType {
  wallets: ConnectedWallet[];
  groups: WalletGroup[];
  activeWallet: ConnectedWallet | null;
  portfolio: PortfolioSummary | null;
  isConnecting: boolean;
  error: string | null;
  
  // Wallet operations
  connectWallet: (type: WalletConnectionType, name?: string) => Promise<void>;
  disconnectWallet: (walletId: string) => void;
  setActiveWallet: (walletId: string) => void;
  setPrimaryWallet: (walletId: string) => void;
  updateWalletName: (walletId: string, name: string) => void;
  updateTradingLimits: (walletId: string, limits: Partial<WalletTradingLimits>) => void;
  
  // Strategy and Network operations
  updateWalletStrategies: (walletId: string, strategies: WalletStrategyConfig[]) => void;
  updateWalletNetworks: (walletId: string, networks: WalletNetworkConfig[]) => void;
  setWalletPurpose: (walletId: string, purpose: ConnectedWallet['designatedPurpose']) => void;
  updateWalletTags: (walletId: string, tags: string[]) => void;
  updateWalletNotes: (walletId: string, notes: string) => void;
  getWalletsForStrategy: (strategy: TradingStrategy) => ConnectedWallet[];
  getWalletsForNetwork: (network: NetworkDesignation) => ConnectedWallet[];
  
  // Group operations
  createGroup: (name: string, description?: string) => void;
  deleteGroup: (groupId: string) => void;
  addWalletToGroup: (walletId: string, groupId: string) => void;
  removeWalletFromGroup: (walletId: string) => void;
  
  // Bot allocation
  allocateBot: (walletId: string, botId: string) => void;
  deallocateBot: (walletId: string, botId: string) => void;
  
  // Utility
  refreshBalances: () => Promise<void>;
  clearError: () => void;
}

const MultiWalletContext = createContext<MultiWalletContextType>({
  wallets: [],
  groups: [],
  activeWallet: null,
  portfolio: null,
  isConnecting: false,
  error: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  setActiveWallet: () => {},
  setPrimaryWallet: () => {},
  updateWalletName: () => {},
  updateTradingLimits: () => {},
  updateWalletStrategies: () => {},
  updateWalletNetworks: () => {},
  setWalletPurpose: () => {},
  updateWalletTags: () => {},
  updateWalletNotes: () => {},
  getWalletsForStrategy: () => [],
  getWalletsForNetwork: () => [],
  createGroup: () => {},
  deleteGroup: () => {},
  addWalletToGroup: () => {},
  removeWalletFromGroup: () => {},
  allocateBot: () => {},
  deallocateBot: () => {},
  refreshBalances: async () => {},
  clearError: () => {},
});

export const useMultiWallet = () => useContext(MultiWalletContext);

// Helper to get ethereum provider
const getEthereum = (): ethers.Eip1193Provider | null => {
  if (typeof window === 'undefined') return null;
  try {
    if (!('ethereum' in window)) return null;
    const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
    return (ethereum as ethers.Eip1193Provider) || null;
  } catch {
    return null;
  }
};

export const MultiWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wallets, setWallets] = useState<ConnectedWallet[]>([]);
  const [groups, setGroups] = useState<WalletGroup[]>([]);
  const [activeWallet, setActiveWalletState] = useState<ConnectedWallet | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Store the last connection params for retry
  const lastConnectionParamsRef = useRef<{ type: WalletConnectionType; name?: string } | null>(null);
  // Store the connectWallet function ref for retry
  const connectWalletRef = useRef<(type: WalletConnectionType, name?: string) => Promise<void>>();

  // Helper function to show error toast with retry button and expandable details
  const showErrorToastWithRetry = useCallback((title: string, errorInfo: WalletErrorInfo) => {
    toast({
      title,
      description: React.createElement(WalletErrorDetails, { error: errorInfo }),
      variant: 'destructive',
      duration: 15000, // Longer duration for error toasts with details
      action: React.createElement(ToastAction, {
        altText: 'Try again',
        onClick: () => {
          if (connectWalletRef.current && lastConnectionParamsRef.current) {
            connectWalletRef.current(
              lastConnectionParamsRef.current.type,
              lastConnectionParamsRef.current.name
            );
          }
        },
        children: 'Try Again'
      }),
    });
  }, [toast]);

  // Calculate portfolio summary whenever wallets change
  useEffect(() => {
    if (wallets.length === 0) {
      setPortfolio(null);
      return;
    }

    const totalBalanceUSD = wallets.reduce((sum, w) => sum + w.balanceUSD, 0);
    const networkMap = new Map<string, number>();
    const tokenMap = new Map<string, number>();

    wallets.forEach(wallet => {
      const network = getNetworkName(wallet.chainId);
      networkMap.set(network, (networkMap.get(network) || 0) + wallet.balanceUSD);
      
      wallet.tokens.forEach(token => {
        tokenMap.set(token.symbol, (tokenMap.get(token.symbol) || 0) + token.balanceUSD);
      });
    });

    setPortfolio({
      totalBalanceUSD,
      totalWallets: wallets.length,
      activeWallets: wallets.filter(w => w.isActive).length,
      totalTokens: tokenMap.size,
      networkBreakdown: Array.from(networkMap.entries()).map(([network, balanceUSD]) => ({
        network,
        balanceUSD,
        percentage: totalBalanceUSD > 0 ? (balanceUSD / totalBalanceUSD) * 100 : 0,
      })),
      tokenBreakdown: Array.from(tokenMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([symbol, balanceUSD]) => ({
          symbol,
          balanceUSD,
          percentage: totalBalanceUSD > 0 ? (balanceUSD / totalBalanceUSD) * 100 : 0,
        })),
      dailyChange: 0,
      dailyChangePercentage: 0,
    });
  }, [wallets]);

  const connectWallet = useCallback(async (type: WalletConnectionType, name?: string) => {
    setIsConnecting(true);
    setError(null);
    
    // Store connection params for potential retry
    lastConnectionParamsRef.current = { type, name };

    try {
      let address: string;
      let balance: string;
      let chainId: number;
      let provider: ethers.BrowserProvider | undefined;
      let signer: ethers.Signer | undefined;

      if (type === 'metamask') {
        const ethereum = getEthereum();
        if (!ethereum) {
          throw new Error('MetaMask not detected. Please install MetaMask.');
        }

        provider = new ethers.BrowserProvider(ethereum);
        await provider.send('eth_requestAccounts', []);
        signer = await provider.getSigner();
        address = await signer.getAddress();
        const balanceWei = await provider.getBalance(address);
        balance = ethers.formatEther(balanceWei);
        const network = await provider.getNetwork();
        chainId = Number(network.chainId);
      } else if (type === 'walletconnect') {
        // Simulate WalletConnect connection
        address = `0x${Math.random().toString(16).substr(2, 40)}`;
        balance = (Math.random() * 10).toFixed(4);
        chainId = 1;
      } else {
        // Simulate other wallet types
        address = `0x${Math.random().toString(16).substr(2, 40)}`;
        balance = (Math.random() * 10).toFixed(4);
        chainId = 1;
      }

      // Check if wallet already connected
      if (wallets.some(w => w.address.toLowerCase() === address.toLowerCase())) {
        throw new Error('This wallet is already connected.');
      }

      const ethPrice = 2500; // Mock ETH price
      const balanceUSD = parseFloat(balance) * ethPrice;

      const newWallet: ConnectedWallet = {
        id: `wallet-${Date.now()}`,
        address,
        name: name || `Wallet ${wallets.length + 1}`,
        connectionType: type,
        chainId,
        balance,
        balanceUSD,
        tokens: [
          {
            symbol: 'ETH',
            name: 'Ethereum',
            address: '0x0000000000000000000000000000000000000000',
            balance,
            balanceUSD,
            decimals: 18,
          },
          {
            symbol: 'USDT',
            name: 'Tether USD',
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            balance: (Math.random() * 10000).toFixed(2),
            balanceUSD: Math.random() * 10000,
            decimals: 6,
          },
          {
            symbol: 'USDC',
            name: 'USD Coin',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            balance: (Math.random() * 5000).toFixed(2),
            balanceUSD: Math.random() * 5000,
            decimals: 6,
          },
        ],
        isActive: true,
        isPrimary: wallets.length === 0,
        tradingLimits: { ...DEFAULT_TRADING_LIMITS },
        allocatedBots: [],
        provider,
        signer,
        connectedAt: new Date().toISOString(),
        // Initialize with default strategy and network configs
        strategyConfigs: [...DEFAULT_STRATEGY_CONFIGS],
        networkConfigs: [...DEFAULT_NETWORK_CONFIGS],
        designatedPurpose: 'trading',
        tags: [],
        notes: '',
      };

      setWallets(prev => [...prev, newWallet]);
      if (wallets.length === 0) {
        setActiveWalletState(newWallet);
      }

      toast({
        title: 'Wallet Connected',
        description: `Connected to ${address.slice(0, 6)}...${address.slice(-4)}`,
      });
    } catch (err: unknown) {
      // Handle user rejection gracefully - not an error, just user choice
      if (isUserRejectionError(err)) {
        toast({
          title: 'Connection Cancelled',
          description: 'You can connect your wallet anytime using the connect button.',
          variant: 'default',
        });
        // Don't set error state for user rejections
        return;
      }

      // Handle pending request
      if (isRequestPendingError(err)) {
        toast({
          title: 'Request Pending',
          description: 'Please check your wallet for a pending connection request.',
          variant: 'default',
        });
        setError('A connection request is already pending. Please check your wallet.');
        return;
      }

      // Handle other errors - show with retry button and expandable details
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      const errorInfo = createWalletErrorInfo(
        errorMessage,
        err,
        extractErrorCode(err)
      );
      showErrorToastWithRetry('Connection Failed', errorInfo);
    } finally {
      setIsConnecting(false);
    }
  }, [wallets, toast, showErrorToastWithRetry]);

  // Keep the ref updated with the latest connectWallet function
  useEffect(() => {
    connectWalletRef.current = connectWallet;
  }, [connectWallet]);

  const disconnectWallet = useCallback((walletId: string) => {
    setWallets(prev => {
      const updated = prev.filter(w => w.id !== walletId);
      if (activeWallet?.id === walletId) {
        setActiveWalletState(updated[0] || null);
      }
      return updated;
    });
  }, [activeWallet]);

  const setActiveWallet = useCallback((walletId: string) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (wallet) {
      setActiveWalletState(wallet);
    }
  }, [wallets]);

  const setPrimaryWallet = useCallback((walletId: string) => {
    setWallets(prev => prev.map(w => ({
      ...w,
      isPrimary: w.id === walletId,
    })));
  }, []);

  const updateWalletName = useCallback((walletId: string, name: string) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, name } : w
    ));
  }, []);

  const updateTradingLimits = useCallback((walletId: string, limits: Partial<WalletTradingLimits>) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId 
        ? { ...w, tradingLimits: { ...w.tradingLimits, ...limits } } 
        : w
    ));
  }, []);

  // New strategy and network management functions
  const updateWalletStrategies = useCallback((walletId: string, strategies: WalletStrategyConfig[]) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, strategyConfigs: strategies } : w
    ));
  }, []);

  const updateWalletNetworks = useCallback((walletId: string, networks: WalletNetworkConfig[]) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, networkConfigs: networks } : w
    ));
  }, []);

  const setWalletPurpose = useCallback((walletId: string, purpose: ConnectedWallet['designatedPurpose']) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, designatedPurpose: purpose } : w
    ));
  }, []);

  const updateWalletTags = useCallback((walletId: string, tags: string[]) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, tags } : w
    ));
  }, []);

  const updateWalletNotes = useCallback((walletId: string, notes: string) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, notes } : w
    ));
  }, []);

  const getWalletsForStrategy = useCallback((strategy: TradingStrategy): ConnectedWallet[] => {
    return wallets.filter(w => 
      w.strategyConfigs?.some(s => s.strategy === strategy && s.isEnabled)
    );
  }, [wallets]);

  const getWalletsForNetwork = useCallback((network: NetworkDesignation): ConnectedWallet[] => {
    if (network === 'all') return wallets;
    return wallets.filter(w => 
      w.networkConfigs?.some(n => n.network === network && n.isEnabled)
    );
  }, [wallets]);

  const createGroup = useCallback((name: string, description?: string) => {
    const newGroup: WalletGroup = {
      id: `group-${Date.now()}`,
      name,
      description,
      color: WALLET_COLORS[groups.length % WALLET_COLORS.length],
      walletIds: [],
      createdAt: new Date().toISOString(),
    };
    setGroups(prev => [...prev, newGroup]);
  }, [groups.length]);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setWallets(prev => prev.map(w => 
      w.groupId === groupId ? { ...w, groupId: undefined } : w
    ));
  }, []);

  const addWalletToGroup = useCallback((walletId: string, groupId: string) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, groupId } : w
    ));
    setGroups(prev => prev.map(g => 
      g.id === groupId 
        ? { ...g, walletIds: [...g.walletIds, walletId] }
        : g
    ));
  }, []);

  const removeWalletFromGroup = useCallback((walletId: string) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (wallet?.groupId) {
      setGroups(prev => prev.map(g => 
        g.id === wallet.groupId
          ? { ...g, walletIds: g.walletIds.filter(id => id !== walletId) }
          : g
      ));
    }
    setWallets(prev => prev.map(w => 
      w.id === walletId ? { ...w, groupId: undefined } : w
    ));
  }, [wallets]);

  const allocateBot = useCallback((walletId: string, botId: string) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId && !w.allocatedBots.includes(botId)
        ? { ...w, allocatedBots: [...w.allocatedBots, botId] }
        : w
    ));
  }, []);

  const deallocateBot = useCallback((walletId: string, botId: string) => {
    setWallets(prev => prev.map(w => 
      w.id === walletId
        ? { ...w, allocatedBots: w.allocatedBots.filter(id => id !== botId) }
        : w
    ));
  }, []);

  const refreshBalances = useCallback(async () => {
    // Refresh balances for all connected wallets
    const updatedWallets = await Promise.all(
      wallets.map(async (wallet) => {
        if (wallet.provider) {
          try {
            const balance = await wallet.provider.getBalance(wallet.address);
            const ethPrice = 2500;
            const balanceStr = ethers.formatEther(balance);
            return {
              ...wallet,
              balance: balanceStr,
              balanceUSD: parseFloat(balanceStr) * ethPrice,
            };
          } catch {
            return wallet;
          }
        }
        return wallet;
      })
    );
    setWallets(updatedWallets);
  }, [wallets]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <MultiWalletContext.Provider value={{
      wallets,
      groups,
      activeWallet,
      portfolio,
      isConnecting,
      error,
      connectWallet,
      disconnectWallet,
      setActiveWallet,
      setPrimaryWallet,
      updateWalletName,
      updateTradingLimits,
      updateWalletStrategies,
      updateWalletNetworks,
      setWalletPurpose,
      updateWalletTags,
      updateWalletNotes,
      getWalletsForStrategy,
      getWalletsForNetwork,
      createGroup,
      deleteGroup,
      addWalletToGroup,
      removeWalletFromGroup,
      allocateBot,
      deallocateBot,
      refreshBalances,
      clearError,
    }}>
      {children}
    </MultiWalletContext.Provider>
  );
};

function getNetworkName(chainId: number): string {
  const networks: Record<number, string> = {
    1: 'Ethereum',
    137: 'Polygon',
    42161: 'Arbitrum',
    56: 'BSC',
    10: 'Optimism',
    43114: 'Avalanche',
    8453: 'Base',
  };
  return networks[chainId] || `Chain ${chainId}`;
}
