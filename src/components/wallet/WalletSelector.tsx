import React, { useState } from 'react';
import { useMultiWallet } from '@/contexts/MultiWalletContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Wallet,
  ChevronDown,
  Star,
  Check,
  Plus,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface WalletSelectorProps {
  onConnectNew?: () => void;
  showBalance?: boolean;
  showPerformance?: boolean;
  compact?: boolean;
  className?: string;
}

export const WalletSelector: React.FC<WalletSelectorProps> = ({
  onConnectNew,
  showBalance = true,
  showPerformance = false,
  compact = false,
  className = '',
}) => {
  const {
    wallets,
    activeWallet,
    portfolio,
    setActiveWallet,
    refreshBalances,
    isConnecting,
  } = useMultiWallet();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshBalances();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'metamask':
        return <span className="text-sm">🦊</span>;
      case 'walletconnect':
        return <span className="text-sm">🔗</span>;
      case 'coinbase':
        return <span className="text-sm">💰</span>;
      case 'trust':
        return <span className="text-sm">🛡️</span>;
      default:
        return <Wallet className="h-4 w-4" />;
    }
  };

  // Mock performance data for demo
  const getWalletPerformance = (walletId: string) => {
    const seed = walletId.charCodeAt(walletId.length - 1);
    const change = ((seed % 20) - 10) / 10;
    return {
      change24h: change * 5,
      isPositive: change >= 0,
    };
  };

  if (wallets.length === 0) {
    return (
      <Button
        onClick={onConnectNew}
        className={`bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 ${className}`}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Connect Wallet
      </Button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`border-gray-600 bg-gray-800 hover:bg-gray-700 ${
              compact ? 'px-3' : 'min-w-[200px]'
            }`}
          >
            <div className="flex items-center gap-2 flex-1">
              {activeWallet && getConnectionIcon(activeWallet.connectionType)}
              <div className={`flex flex-col items-start ${compact ? 'hidden' : ''}`}>
                <span className="text-white text-sm font-medium flex items-center gap-1">
                  {activeWallet?.name || 'Select Wallet'}
                  {activeWallet?.isPrimary && (
                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                  )}
                </span>
                {showBalance && activeWallet && (
                  <span className="text-gray-400 text-xs">
                    ${activeWallet.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              {compact && activeWallet && (
                <span className="text-white text-sm">
                  {formatAddress(activeWallet.address)}
                </span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-gray-400 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="bg-gray-800 border-gray-700 min-w-[280px]"
          align="start"
        >
          <DropdownMenuLabel className="text-gray-400 text-xs uppercase tracking-wider">
            Connected Wallets ({wallets.length})
          </DropdownMenuLabel>
          
          {/* Aggregate Balance */}
          {portfolio && (
            <div className="px-2 py-2 border-b border-gray-700 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Total Balance</span>
                <span className="text-white font-semibold">
                  ${portfolio.totalBalanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              {portfolio.dailyChangePercentage !== undefined && (
                <div className={`flex items-center gap-1 text-xs mt-1 ${
                  portfolio.dailyChangePercentage >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {portfolio.dailyChangePercentage >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {portfolio.dailyChangePercentage >= 0 ? '+' : ''}
                  {portfolio.dailyChangePercentage.toFixed(2)}% (24h)
                </div>
              )}
            </div>
          )}

          {wallets.map((wallet) => {
            const isSelected = activeWallet?.id === wallet.id;
            const performance = showPerformance ? getWalletPerformance(wallet.id) : null;

            return (
              <DropdownMenuItem
                key={wallet.id}
                onClick={() => setActiveWallet(wallet.id)}
                className={`flex items-center justify-between py-3 px-2 cursor-pointer ${
                  isSelected ? 'bg-[#00F0FF]/10' : 'hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded ${isSelected ? 'bg-[#00F0FF]/20' : 'bg-gray-700'}`}>
                    {getConnectionIcon(wallet.connectionType)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{wallet.name}</span>
                      {wallet.isPrimary && (
                        <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                      )}
                      {isSelected && (
                        <Check className="h-3 w-3 text-[#00F0FF]" />
                      )}
                    </div>
                    <span className="text-gray-500 text-xs font-mono">
                      {formatAddress(wallet.address)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white text-sm font-medium">
                    ${wallet.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                  {performance && (
                    <div className={`text-xs flex items-center justify-end gap-1 ${
                      performance.isPositive ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {performance.isPositive ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {performance.isPositive ? '+' : ''}{performance.change24h.toFixed(2)}%
                    </div>
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator className="bg-gray-700" />
          
          <DropdownMenuItem
            onClick={handleRefresh}
            className="text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Balances
          </DropdownMenuItem>
          
          {onConnectNew && (
            <DropdownMenuItem
              onClick={onConnectNew}
              className="text-[#00F0FF] hover:bg-gray-700 cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Connect New Wallet
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick Stats Badge */}
      {!compact && portfolio && wallets.length > 1 && (
        <Badge variant="outline" className="border-gray-600 text-gray-400">
          <Activity className="h-3 w-3 mr-1" />
          {portfolio.activeWallets}/{portfolio.totalWallets} Active
        </Badge>
      )}
    </div>
  );
};
