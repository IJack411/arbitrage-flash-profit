import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { NETWORKS } from '../lib/web3/config';
import { Wallet, ChevronDown, AlertCircle, X } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export const WalletConnect: React.FC = () => {
  const { 
    wallet, 
    connecting, 
    error, 
    walletAvailable,
    connectWallet, 
    disconnectWallet, 
    switchNetwork,
    clearError 
  } = useWeb3();
  const [selectedNetwork, setSelectedNetwork] = useState<keyof typeof NETWORKS>('ethereum');
  const [showError, setShowError] = useState(false);

  // Show error notification when error changes
  useEffect(() => {
    if (error) {
      setShowError(true);
      // Auto-hide after 5 seconds
      const timeout = setTimeout(() => {
        setShowError(false);
        clearError();
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [error, clearError]);

  const handleNetworkChange = async (network: keyof typeof NETWORKS) => {
    setSelectedNetwork(network);
    if (wallet) {
      await switchNetwork(NETWORKS[network].chainId);
    }
  };

  const handleConnect = async () => {
    if (!walletAvailable) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    await connectWallet();
  };

  const dismissError = () => {
    setShowError(false);
    clearError();
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="relative flex items-center gap-3">
      {/* Error notification */}
      {showError && error && (
        <div className="absolute top-full right-0 mt-2 z-50 bg-red-900/90 border border-red-700 rounded-lg px-4 py-3 flex items-center gap-3 min-w-[300px] shadow-lg">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <span className="text-red-200 text-sm flex-1">{error}</span>
          <button aria-label="Dismiss wallet error" title="Dismiss" onClick={dismissError} className="text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="bg-gray-800 border-gray-700 text-white">
            {NETWORKS[selectedNetwork].name} <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-gray-800 border-gray-700">
          {Object.entries(NETWORKS).map(([key, net]) => (
            <DropdownMenuItem
              key={key}
              onClick={() => handleNetworkChange(key as keyof typeof NETWORKS)}
              className="text-white hover:bg-gray-700"
            >
              {net.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {wallet ? (
        <div className="flex items-center gap-2">
          <div className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg">
            <span className="text-[#00FF88] font-mono text-sm">
              {parseFloat(wallet.balance).toFixed(4)} {NETWORKS[selectedNetwork].currency}
            </span>
          </div>
          <Button variant="outline" className="bg-gray-800 border-gray-700 text-white">
            <Wallet className="mr-2 h-4 w-4" />
            {formatAddress(wallet.address)}
          </Button>
          <Button onClick={() => void disconnectWallet()} variant="destructive">
            Disconnect
          </Button>
        </div>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={handleConnect} 
                disabled={connecting} 
                className="bg-[#00F0FF] hover:bg-[#00d4e6] text-gray-900"
              >
                <Wallet className="mr-2 h-4 w-4" />
                {connecting ? 'Connecting...' : 'Connect Wallet'}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-gray-800 border-gray-700 text-white">
              <p>Connect your MetaMask wallet</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};
