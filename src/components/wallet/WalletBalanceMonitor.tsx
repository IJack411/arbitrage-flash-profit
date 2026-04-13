import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWeb3 } from '@/contexts/Web3Context';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  Wallet,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Activity,
  Settings,
  ChevronDown,
  ChevronUp,
  Zap,
  Eye,
  EyeOff,
  Bell,
  BellOff,
  History,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface BalanceHistoryEntry {
  timestamp: Date;
  balance: number;
  change: number;
}

interface WalletBalanceMonitorProps {
  minBalanceThreshold?: number;
  refreshIntervalSeconds?: number;
  showChart?: boolean;
  compact?: boolean;
  onBalanceChange?: (balance: number, previousBalance: number) => void;
  onLowBalance?: (balance: number, threshold: number) => void;
}

interface TooltipPayloadItem {
  value: number;
  payload: {
    fullTime: string;
  };
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

const NATIVE_SYMBOL_BY_CHAIN: Record<number, string> = {
  1: 'ETH',
  137: 'MATIC',
  56: 'BNB',
  42161: 'ETH',
  10: 'ETH',
  8453: 'ETH',
  43114: 'AVAX',
};

const APPROX_NATIVE_USD: Record<string, number> = {
  ETH: 2500,
  MATIC: 1,
  BNB: 600,
  AVAX: 40,
};

export const WalletBalanceMonitor: React.FC<WalletBalanceMonitorProps> = ({
  minBalanceThreshold = 0.02,
  refreshIntervalSeconds = 30,
  showChart = true,
  compact = false,
  onBalanceChange,
  onLowBalance,
}) => {
  const { wallet, connectWallet, walletAvailable } = useWeb3();
  const { toast } = useToast();
  
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [previousBalance, setPreviousBalance] = useState<number | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [customThreshold, setCustomThreshold] = useState(minBalanceThreshold);
  const [customInterval, setCustomInterval] = useState(refreshIntervalSeconds);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [showBalanceValue, setShowBalanceValue] = useState(true);
  const [isExpanded, setIsExpanded] = useState(!compact);

  const nativeSymbol = wallet?.chainId ? (NATIVE_SYMBOL_BY_CHAIN[wallet.chainId] || 'ETH') : 'ETH';
  const nativeUsd = APPROX_NATIVE_USD[nativeSymbol] || APPROX_NATIVE_USD.ETH;
  const balanceUsdApprox = currentBalance !== null ? currentBalance * nativeUsd : null;
  const thresholdUsdApprox = customThreshold * nativeUsd;
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousBalanceRef = useRef<number | null>(null);

  // Fetch current balance from wallet
  const fetchBalance = useCallback(async (showToast = false) => {
    if (!wallet?.provider || !wallet?.address) {
      return null;
    }

    setIsRefreshing(true);
    try {
      const balance = await wallet.provider.getBalance(wallet.address);
      const balanceEth = parseFloat((Number(balance) / 1e18).toFixed(6));
      
      const now = new Date();
      const prevBal = previousBalanceRef.current;
      const change = prevBal !== null ? balanceEth - prevBal : 0;
      
      // Update state
      setPreviousBalance(prevBal);
      setCurrentBalance(balanceEth);
      previousBalanceRef.current = balanceEth;
      setLastRefreshTime(now);
      
      // Add to history
      setBalanceHistory(prev => {
        const newEntry: BalanceHistoryEntry = {
          timestamp: now,
          balance: balanceEth,
          change,
        };
        // Keep last 60 entries (30 minutes at 30s intervals)
        const updated = [...prev, newEntry].slice(-60);
        return updated;
      });

      // Callback for balance change
      if (prevBal !== null && Math.abs(change) > 0.0001 && onBalanceChange) {
        onBalanceChange(balanceEth, prevBal);
      }

      // Check for low balance alert
      if (balanceEth < customThreshold && alertsEnabled) {
        if (onLowBalance) {
          onLowBalance(balanceEth, customThreshold);
        }
        
        if (showToast || (prevBal !== null && prevBal >= customThreshold)) {
          toast({
            title: 'Low Native Gas Balance Warning',
            description: `Gas token balance (${balanceEth.toFixed(4)} ${nativeSymbol}) is below threshold (${customThreshold} ${nativeSymbol}).`,
            variant: 'destructive',
            duration: 10000,
          });
        }
      }

      // Store in database for persistence
      try {
        await supabase
          .from('wallet_balance_history')
          .insert({
            wallet_address: wallet.address,
            balance_eth: balanceEth,
            recorded_at: now.toISOString(),
          });
      } catch (dbError) {
        // Silently fail - table might not exist
        console.debug('Could not store balance history:', dbError);
      }

      if (showToast) {
        toast({
          title: 'Balance Updated',
          description: `Current balance: ${balanceEth.toFixed(4)} ${nativeSymbol}`,
          duration: 3000,
        });
      }

      return balanceEth;
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      if (showToast) {
        toast({
          title: 'Balance Check Failed',
          description: 'Could not fetch wallet balance. Please try again.',
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, [wallet, customThreshold, alertsEnabled, onBalanceChange, onLowBalance, toast, nativeSymbol]);

  // Manual refresh
  const handleManualRefresh = useCallback(() => {
    fetchBalance(true);
  }, [fetchBalance]);

  // Setup auto-refresh
  useEffect(() => {
    if (autoRefreshEnabled && wallet?.address) {
      // Initial fetch
      fetchBalance();
      
      // Setup interval
      refreshIntervalRef.current = setInterval(() => {
        fetchBalance();
      }, customInterval * 1000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefreshEnabled, wallet?.address, customInterval, fetchBalance]);

  // Load historical data from database on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!wallet?.address) return;
      
      try {
        const { data, error } = await supabase
          .from('wallet_balance_history')
          .select('balance_eth, recorded_at')
          .eq('wallet_address', wallet.address)
          .order('recorded_at', { ascending: true })
          .limit(60);

        if (!error && data && data.length > 0) {
          const history: BalanceHistoryEntry[] = data.map((entry, index) => ({
            timestamp: new Date(entry.recorded_at),
            balance: parseFloat(entry.balance_eth),
            change: index > 0 ? parseFloat(entry.balance_eth) - parseFloat(data[index - 1].balance_eth) : 0,
          }));
          setBalanceHistory(history);
          
          // Set current balance from latest entry
          const latest = history[history.length - 1];
          setCurrentBalance(latest.balance);
          previousBalanceRef.current = latest.balance;
        }
      } catch (error) {
        console.debug('Could not load balance history:', error);
      }
    };

    loadHistory();
  }, [wallet?.address]);

  // Calculate stats
  const balanceChange24h = balanceHistory.length >= 2
    ? currentBalance! - balanceHistory[0].balance
    : 0;
  
  const balanceChangePercent = balanceHistory.length >= 2 && balanceHistory[0].balance > 0
    ? ((currentBalance! - balanceHistory[0].balance) / balanceHistory[0].balance) * 100
    : 0;

  const isLowBalance = currentBalance !== null && currentBalance < customThreshold;
  const isWarningBalance = currentBalance !== null && currentBalance < customThreshold * 1.5;

  // Chart data formatting
  const chartData = balanceHistory.map(entry => ({
    time: entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    balance: entry.balance,
    fullTime: entry.timestamp.toLocaleString(),
  }));

  // Custom tooltip for chart
  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg">
          <p className="text-gray-400 text-xs">{payload[0].payload.fullTime}</p>
          <p className="text-white font-semibold">
            {payload[0].value.toFixed(4)} ETH
          </p>
        </div>
      );
    }
    return null;
  };

  // If no wallet connected
  if (!wallet) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-gray-700 rounded-lg">
            <Wallet className="h-5 w-5 text-gray-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Wallet Balance Monitor</h3>
            <p className="text-gray-500 text-sm">Connect wallet to monitor balance</p>
          </div>
        </div>
        {walletAvailable ? (
          <button
            onClick={() => void connectWallet()}
            className="w-full py-2 bg-[#00F0FF] hover:bg-[#00d4e6] text-gray-900 font-semibold rounded-lg transition-colors"
          >
            Connect Wallet
          </button>
        ) : (
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg text-center transition-colors"
          >
            Install MetaMask
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 border rounded-xl overflow-hidden transition-all ${
      isLowBalance 
        ? 'border-red-500 shadow-lg shadow-red-500/20' 
        : isWarningBalance 
          ? 'border-yellow-500/50' 
          : 'border-gray-700'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isLowBalance 
                ? 'bg-red-500/20' 
                : isWarningBalance 
                  ? 'bg-yellow-500/20' 
                  : 'bg-green-500/20'
            }`}>
              <Wallet className={`h-5 w-5 ${
                isLowBalance 
                  ? 'text-red-400' 
                  : isWarningBalance 
                    ? 'text-yellow-400' 
                    : 'text-green-400'
              }`} />
            </div>
            <div>
              <h3 className="text-white font-semibold">Wallet Balance</h3>
              <p className="text-gray-500 text-xs font-mono">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBalanceValue(!showBalanceValue)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title={showBalanceValue ? 'Hide balance' : 'Show balance'}
            >
              {showBalanceValue ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-colors ${
                showSettings ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh balance"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            {!compact && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Balance Display */}
        <div className="mt-4">
          <div className="flex items-baseline gap-3">
            <span className={`text-3xl font-bold ${
              isLowBalance 
                ? 'text-red-400' 
                : isWarningBalance 
                  ? 'text-yellow-400' 
                  : 'text-white'
            }`}>
              {showBalanceValue 
                ? currentBalance !== null 
                  ? `${currentBalance.toFixed(4)} ${nativeSymbol}` 
                  : '---'
                : '••••••'
              }
            </span>
            {showBalanceValue && balanceUsdApprox !== null && (
              <span className="text-gray-400 text-sm">~${balanceUsdApprox.toFixed(2)} USD</span>
            )}
            {balanceChange24h !== 0 && showBalanceValue && (
              <span className={`flex items-center gap-1 text-sm ${
                balanceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {balanceChange24h >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {balanceChange24h >= 0 ? '+' : ''}{balanceChange24h.toFixed(4)} {nativeSymbol}
                ({balanceChangePercent >= 0 ? '+' : ''}{balanceChangePercent.toFixed(2)}%)
              </span>
            )}
          </div>
          
          {/* Low Balance Alert */}
          {isLowBalance && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-red-300 text-sm">
                Native gas balance below threshold ({customThreshold} {nativeSymbol}, ~${thresholdUsdApprox.toFixed(2)} USD)
              </span>
            </div>
          )}
          
          {/* Warning Balance Alert */}
          {!isLowBalance && isWarningBalance && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
              <span className="text-yellow-300 text-sm">
                Native gas balance approaching threshold
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-gray-900/50 border-b border-gray-700">
          <h4 className="text-white font-medium mb-3">Monitor Settings</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="min-gas-reserve-threshold" className="text-gray-400 text-xs block mb-1">Min Gas Reserve Threshold ({nativeSymbol})</label>
              <input
                id="min-gas-reserve-threshold"
                type="number"
                value={customThreshold}
                onChange={(e) => setCustomThreshold(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                step="0.01"
                min="0"
              />
              <p className="text-gray-500 text-xs mt-1">This checks native gas token only, not total wallet USD holdings.</p>
            </div>
            <div>
              <label htmlFor="refresh-interval-seconds" className="text-gray-400 text-xs block mb-1">Refresh Interval (seconds)</label>
              <input
                id="refresh-interval-seconds"
                type="number"
                value={customInterval}
                onChange={(e) => setCustomInterval(parseInt(e.target.value) || 30)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                step="5"
                min="5"
                max="300"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                autoRefreshEnabled 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              <Activity className="h-4 w-4" />
              Auto-refresh {autoRefreshEnabled ? 'On' : 'Off'}
            </button>
            
            <button
              onClick={() => setAlertsEnabled(!alertsEnabled)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                alertsEnabled 
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {alertsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              Alerts {alertsEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <>
          {/* Balance History Chart */}
          {showChart && chartData.length > 1 && (
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-400 text-sm">Balance History</span>
                </div>
                <span className="text-gray-500 text-xs">
                  Last {chartData.length} readings
                </span>
              </div>
              
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop 
                          offset="5%" 
                          stopColor={isLowBalance ? '#EF4444' : '#00F0FF'} 
                          stopOpacity={0.3}
                        />
                        <stop 
                          offset="95%" 
                          stopColor={isLowBalance ? '#EF4444' : '#00F0FF'} 
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="time" 
                      tick={{ fill: '#6B7280', fontSize: 10 }}
                      axisLine={{ stroke: '#374151' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      tick={{ fill: '#6B7280', fontSize: 10 }}
                      axisLine={{ stroke: '#374151' }}
                      tickLine={false}
                      domain={['auto', 'auto']}
                      tickFormatter={(value) => value.toFixed(2)}
                      width={45}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine 
                      y={customThreshold} 
                      stroke="#EF4444" 
                      strokeDasharray="3 3"
                      label={{ 
                        value: 'Min', 
                        fill: '#EF4444', 
                        fontSize: 10,
                        position: 'right'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke={isLowBalance ? '#EF4444' : '#00F0FF'}
                      strokeWidth={2}
                      fill="url(#balanceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="p-4 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Min (Session)</p>
              <p className="text-white font-semibold">
                {balanceHistory.length > 0 
                  ? Math.min(...balanceHistory.map(h => h.balance)).toFixed(4)
                  : '---'
                } {nativeSymbol}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Max (Session)</p>
              <p className="text-white font-semibold">
                {balanceHistory.length > 0 
                  ? Math.max(...balanceHistory.map(h => h.balance)).toFixed(4)
                  : '---'
                } {nativeSymbol}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-1">Threshold</p>
              <p className={`font-semibold ${isLowBalance ? 'text-red-400' : 'text-green-400'}`}>
                {customThreshold.toFixed(2)} {nativeSymbol}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Clock className="h-3 w-3" />
              {lastRefreshTime 
                ? `Updated ${lastRefreshTime.toLocaleTimeString()}`
                : 'Not yet updated'
              }
            </div>
            <div className="flex items-center gap-2">
              {autoRefreshEnabled && (
                <div className="flex items-center gap-1 text-green-400 text-xs">
                  <Zap className="h-3 w-3" />
                  Auto-refresh: {customInterval}s
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WalletBalanceMonitor;
