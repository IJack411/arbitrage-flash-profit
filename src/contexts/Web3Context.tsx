import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import { walletService, WalletInfo, WalletConnectionError } from '../lib/web3/walletService';
import { FlashLoanService } from '../lib/web3/flashLoanService';
import { DexService } from '../lib/web3/dexService';
import { TransactionService } from '../lib/web3/transactionService';
import { FlashbotsService } from '../lib/web3/flashbotsService';
import { IndexerService } from '../lib/web3/indexerService';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { WalletErrorDetails, WalletErrorInfo, createWalletErrorInfo } from '@/components/wallet/WalletErrorDetails';

// Helper to check if an error is from wallet extension conflicts
const isExtensionConflictError = (error: unknown): boolean => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('cannot redefine property: ethereum') ||
    lowerMessage.includes('cannot redefine property: solana') ||
    lowerMessage.includes('chrome-extension://') ||
    lowerMessage.includes('moz-extension://') ||
    lowerMessage.includes('evmask')
  );
};

const isEmbeddedBrowserRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = (window.navigator?.userAgent || '').toLowerCase();
  return ua.includes('vscode') || ua.includes('electron');
};

interface Web3ContextType {
  wallet: WalletInfo | null;
  account: string | null; // Backward compatibility alias for wallet?.address
  connecting: boolean;
  error: string | null;
  walletAvailable: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchNetwork: (chainId: number) => Promise<void>;
  clearError: () => void;
  services: {
    flashLoan?: FlashLoanService;
    dex?: DexService;
    transaction?: TransactionService;
    flashbots?: FlashbotsService;
    indexer?: IndexerService;
  };
}

const Web3Context = createContext<Web3ContextType>({
  wallet: null,
  account: null,
  connecting: false,
  error: null,
  walletAvailable: false,
  connectWallet: async () => {},
  disconnectWallet: async () => {},
  switchNetwork: async () => {},
  clearError: () => {},
  services: {},
});

export const useWeb3 = () => useContext(Web3Context);

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [services, setServices] = useState<Web3ContextType['services']>({});
  const { toast } = useToast();
  
  // Use ref to store the latest connectWallet function for retry
  const connectWalletRef = useRef<() => Promise<void>>();

  // Backward compatibility: derive account from wallet
  const account = useMemo(() => wallet?.address || null, [wallet]);

  // Check wallet availability on mount with a delay to let extensions initialize
  useEffect(() => {
    let mounted = true;
    
    const checkWallet = () => {
      if (!mounted) return;
      
      try {
        const available = walletService.isWalletAvailable();
        setWalletAvailable(available);
      } catch (err) {
        // Suppress extension conflict errors silently
        if (!isExtensionConflictError(err)) {
          console.warn('Error checking wallet availability:', err);
        }
        setWalletAvailable(false);
      }
    };

    // Delay initial check to let extensions finish fighting over window.ethereum
    const initialTimeout = setTimeout(checkWallet, 100);

    // Check again after extensions have had more time to settle
    const secondTimeout = setTimeout(checkWallet, 1000);
    
    // Final check after 2 seconds
    const finalTimeout = setTimeout(checkWallet, 2000);

    const handleProviderAnnouncement = () => checkWallet();

    if (typeof window !== 'undefined') {
      window.addEventListener('ethereum#initialized', handleProviderAnnouncement as EventListener);
      window.addEventListener('eip6963:announceProvider', handleProviderAnnouncement as EventListener);

      try {
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      } catch {
        // Ignore browsers without custom event support
      }
    }

    return () => {
      mounted = false;
      clearTimeout(initialTimeout);
      clearTimeout(secondTimeout);
      clearTimeout(finalTimeout);
      if (typeof window !== 'undefined') {
        window.removeEventListener('ethereum#initialized', handleProviderAnnouncement as EventListener);
        window.removeEventListener('eip6963:announceProvider', handleProviderAnnouncement as EventListener);
      }
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

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
          if (connectWalletRef.current) {
            connectWalletRef.current();
          }
        },
        children: 'Try Again'
      }),
    });
  }, [toast]);

  const connectWallet = useCallback(async () => {
    setConnecting(true);
    setError(null);
    
    try {
      const info = await walletService.connectMetaMask();
      setWallet(info);
      
      setServices({
        flashLoan: new FlashLoanService(info.provider, info.signer),
        dex: new DexService(info.provider),
        transaction: new TransactionService(info.provider, info.signer),
        flashbots: new FlashbotsService(info.provider, info.signer),
        indexer: new IndexerService(info.provider),
      });

      // Show success toast
      toast({
        title: 'Wallet Connected',
        description: `Connected to ${info.address.slice(0, 6)}...${info.address.slice(-4)}`,
      });
    } catch (err: unknown) {
      // Handle WalletConnectionError with specific types
      if (err instanceof WalletConnectionError) {
        // User rejection is not an error - just inform the user gently
        if (err.isUserRejection) {
          toast({
            title: 'Connection Cancelled',
            description: 'You can connect your wallet anytime using the connect button.',
            variant: 'default',
          });
          // Don't set error state for user rejections - it's a normal user action
          return;
        }

        // Request pending - inform user to check wallet
        if (err.isRequestPending) {
          toast({
            title: 'Request Pending',
            description: 'Please check your wallet for a pending connection request.',
            variant: 'default',
          });
          setError(err.message);
          return;
        }

        // Extension conflict - silent ignore
        if (err.isExtensionConflict) {
          return;
        }

        // Other wallet errors - show with retry button and expandable details
        const enhancedMessage = err.message.includes('No injected wallet detected') && isEmbeddedBrowserRuntime()
          ? `${err.message} If you are in the VS Code embedded browser, open localhost in your regular browser where MetaMask is installed.`
          : err.message;

        setError(enhancedMessage);
        const errorInfo = createWalletErrorInfo(
          enhancedMessage,
          err.originalError,
          err.errorCode
        );
        showErrorToastWithRetry('Connection Failed', errorInfo);
        return;
      }

      // Suppress extension conflict errors
      if (isExtensionConflictError(err)) {
        return;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      const errorInfo = createWalletErrorInfo(errorMessage, err);
      showErrorToastWithRetry('Connection Failed', errorInfo);
    } finally {
      setConnecting(false);
    }
  }, [toast, showErrorToastWithRetry]);

  // Keep the ref updated with the latest connectWallet function
  useEffect(() => {
    connectWalletRef.current = connectWallet;
  }, [connectWallet]);

  const disconnectWallet = useCallback(async () => {
    await walletService.disconnect();
    setWallet(null);
    setServices({});
    setError(null);
    toast({
      title: 'Wallet Disconnected',
      description: 'Your wallet has been disconnected.',
    });
  }, [toast]);

  const switchNetwork = useCallback(async (chainId: number) => {
    setError(null);
    try {
      await walletService.switchNetwork(chainId);
      toast({
        title: 'Network Switched',
        description: 'Successfully switched to the new network.',
      });
    } catch (err: unknown) {
      // Handle WalletConnectionError
      if (err instanceof WalletConnectionError) {
        if (err.isUserRejection) {
          toast({
            title: 'Switch Cancelled',
            description: 'Network switch was cancelled.',
            variant: 'default',
          });
          return;
        }

        if (err.isExtensionConflict) {
          return;
        }

        setError(err.message);
        const errorInfo = createWalletErrorInfo(
          err.message,
          err.originalError,
          err.errorCode
        );
        toast({
          title: 'Network Switch Failed',
          description: React.createElement(WalletErrorDetails, { error: errorInfo }),
          variant: 'destructive',
          duration: 15000,
        });
        return;
      }

      // Suppress extension conflict errors
      if (isExtensionConflictError(err)) {
        return;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch network';
      setError(errorMessage);
      const errorInfo = createWalletErrorInfo(errorMessage, err);
      toast({
        title: 'Network Switch Failed',
        description: React.createElement(WalletErrorDetails, { error: errorInfo }),
        variant: 'destructive',
        duration: 15000,
      });
    }
  }, [toast]);

  return (
    <Web3Context.Provider value={{ 
      wallet,
      account,
      connecting, 
      error,
      walletAvailable,
      connectWallet, 
      disconnectWallet, 
      switchNetwork,
      clearError,
      services 
    }}>
      {children}
    </Web3Context.Provider>
  );
};
