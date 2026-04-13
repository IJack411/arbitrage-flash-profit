import React, { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useWeb3 } from '@/contexts/Web3Context';
import { getContractAddresses } from '@/lib/web3/config';
import {
  executeArbitrageTrade,
  getLiveExecutionBlocker,
  normalizeOpportunityToTrade,
  supportsLiveExecution,
} from '@/lib/trading/executionService';
import { 
  Play, 
  Pause, 
  Zap, 
  TrendingUp, 
  Activity, 
  CheckCircle, 
  XCircle,
  DollarSign,
  Clock,
  RefreshCw,
  Rocket,
  Shield,
  Settings2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Gauge,
  TrendingDown,
  Ban,
  RotateCcw,
  Info,
  Wallet,
  Eye,
  EyeOff,
} from 'lucide-react';
import { LiveTradingConfirmationModal } from './LiveTradingConfirmationModal';
import { EmergencyStopButton } from './EmergencyStopButton';
import { WalletBalanceMonitor } from './wallet/WalletBalanceMonitor';

interface ExecutedTrade {
  tokenPair: string;
  network: string;
  success: boolean;
  profit: number;
  slippage?: number;
  txHash: string;
  bundleHash?: string;
}

interface SafetyConfig {
  minProfitThreshold: number;
  maxPositionSize: number;
  maxSlippagePercent: number;
  maxGasPriceGwei: number;
  maxDailyTrades: number;
  maxDailyLoss: number;
  circuitBreakerEnabled: boolean;
  circuitBreakerLossThreshold: number;
  circuitBreakerConsecutiveLosses: number;
  flashbotsEnabled: boolean;
  executionMode: 'simulation' | 'live';
  // New safety fields
  walletBalanceCheckEnabled: boolean;
  minWalletBalanceEth: number;
  autoFallbackToSimulation: boolean;
  fallbackBalanceThresholdEth: number;
  txConfirmationMonitoring: boolean;
  txConfirmationTimeoutSeconds: number;
  liveTradingAcknowledged: boolean;
  liveTradingAcknowledgedAt: string | null;
  lastWalletBalanceEth: number | null;
  lastWalletBalanceCheckAt: string | null;
  // Emergency stop fields
  emergencyStopActive: boolean;
  emergencyStopTriggeredAt: string | null;
  emergencyStopReason: string | null;
}

interface CircuitBreakerState {
  isTripped: boolean;
  trippedAt: string | null;
  tripReason: string | null;
  consecutiveLosses: number;
  dailyLoss: number;
  dailyTrades: number;
  lastResetDate: string;
}

interface AutoPilotStats {
  totalScans: number;
  totalTrades: number;
  successfulTrades: number;
  totalProfit: number;
  totalLoss: number;
  lastScanTime: Date | null;
  isRunning: boolean;
}

export const AutoPilotDashboard: React.FC = () => {
  const { toast } = useToast();
  const { account } = useWeb3();
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };
  const [isAutoPilotOn, setIsAutoPilotOn] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [stats, setStats] = useState<AutoPilotStats>({
    totalScans: 0,
    totalTrades: 0,
    successfulTrades: 0,
    totalProfit: 0,
    totalLoss: 0,
    lastScanTime: null,
    isRunning: false,
  });
  const [recentTrades, setRecentTrades] = useState<ExecutedTrade[]>([]);
  const [scanInterval, setScanInterval] = useState<NodeJS.Timeout | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSafetyPanel, setShowSafetyPanel] = useState(false);
  const [selectedNetworks, setSelectedNetworks] = useState(['ethereum', 'arbitrum', 'base', 'polygon']);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showLiveTradingModal, setShowLiveTradingModal] = useState(false);
  const [showWalletBalance, setShowWalletBalance] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState(0);
  
  // Safety configuration state
  const [safetyConfig, setSafetyConfig] = useState<SafetyConfig>({
    minProfitThreshold: 0.5,
    maxPositionSize: 2000,
    maxSlippagePercent: 5.0,
    maxGasPriceGwei: 100,
    maxDailyTrades: 50,
    maxDailyLoss: 500,
    circuitBreakerEnabled: true,
    circuitBreakerLossThreshold: 200,
    circuitBreakerConsecutiveLosses: 3,
    flashbotsEnabled: true,
    executionMode: 'simulation',
    // New safety fields
    walletBalanceCheckEnabled: true,
    minWalletBalanceEth: 0.1,
    autoFallbackToSimulation: true,
    fallbackBalanceThresholdEth: 0.05,
    txConfirmationMonitoring: true,
    txConfirmationTimeoutSeconds: 120,
    liveTradingAcknowledged: false,
    liveTradingAcknowledgedAt: null,
    lastWalletBalanceEth: null,
    lastWalletBalanceCheckAt: null,
    // Emergency stop fields
    emergencyStopActive: false,
    emergencyStopTriggeredAt: null,
    emergencyStopReason: null,
  });

  // Circuit breaker state
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerState>({
    isTripped: false,
    trippedAt: null,
    tripReason: null,
    consecutiveLosses: 0,
    dailyLoss: 0,
    dailyTrades: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
  });


  // Load safety configuration from database
  const loadSafetyConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('auto_trade_config')
        .select('*')
        .eq('user_id', 'default')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSafetyConfig({
          minProfitThreshold: parseFloat(data.min_profit_threshold) || 0.5,
          maxPositionSize: parseFloat(data.max_position_size) || 2000,
          maxSlippagePercent: parseFloat(data.max_slippage_percent) || 5.0,
          maxGasPriceGwei: parseFloat(data.max_gas_price_gwei) || 100,
          maxDailyTrades: data.max_daily_trades || 50,
          maxDailyLoss: parseFloat(data.max_daily_loss) || 500,
          circuitBreakerEnabled: data.circuit_breaker_enabled ?? true,
          circuitBreakerLossThreshold: parseFloat(data.circuit_breaker_loss_threshold) || 200,
          circuitBreakerConsecutiveLosses: data.circuit_breaker_consecutive_losses || 3,
          flashbotsEnabled: data.flashbots_enabled ?? true,
          executionMode: data.execution_mode || 'simulation',
          // New safety fields
          walletBalanceCheckEnabled: data.wallet_balance_check_enabled ?? true,
          minWalletBalanceEth: parseFloat(data.min_wallet_balance_eth) || 0.1,
          autoFallbackToSimulation: data.auto_fallback_to_simulation ?? true,
          fallbackBalanceThresholdEth: parseFloat(data.fallback_balance_threshold_eth) || 0.05,
          txConfirmationMonitoring: data.tx_confirmation_monitoring ?? true,
          txConfirmationTimeoutSeconds: data.tx_confirmation_timeout_seconds || 120,
          liveTradingAcknowledged: data.live_trading_acknowledged ?? false,
          liveTradingAcknowledgedAt: data.live_trading_acknowledged_at || null,
          lastWalletBalanceEth: data.last_wallet_balance_eth ? parseFloat(data.last_wallet_balance_eth) : null,
          lastWalletBalanceCheckAt: data.last_wallet_balance_check_at || null,
          // Emergency stop fields
          emergencyStopActive: data.emergency_stop_active ?? false,
          emergencyStopTriggeredAt: data.emergency_stop_triggered_at || null,
          emergencyStopReason: data.emergency_stop_reason || null,
        });
      }
    } catch (error) {
      console.error('Failed to load safety config:', error);
    }
  }, []);

  // Load circuit breaker state
  const loadCircuitBreakerState = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('user_id', 'default')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setCircuitBreaker({
          isTripped: data.is_tripped,
          trippedAt: data.tripped_at,
          tripReason: data.trip_reason,
          consecutiveLosses: data.consecutive_losses || 0,
          dailyLoss: parseFloat(data.daily_loss) || 0,
          dailyTrades: data.daily_trades || 0,
          lastResetDate: data.last_reset_date,
        });
      }
    } catch (error) {
      console.error('Failed to load circuit breaker state:', error);
    }
  }, []);

  // Handle emergency stop callback - MUST be defined AFTER loadSafetyConfig and loadCircuitBreakerState
  const handleEmergencyStop = useCallback(() => {
    // Stop auto-pilot if running
    if (isAutoPilotOn) {
      setIsAutoPilotOn(false);
      setStats(prev => ({ ...prev, isRunning: false }));
      if (scanInterval) {
        clearInterval(scanInterval);
        setScanInterval(null);
      }
    }

    // Update local state to reflect emergency stop
    setCircuitBreaker(prev => ({
      ...prev,
      isTripped: true,
      trippedAt: new Date().toISOString(),
      tripReason: 'Emergency Stop triggered',
    }));

    setSafetyConfig(prev => ({
      ...prev,
      executionMode: 'simulation',
      emergencyStopActive: true,
      emergencyStopTriggeredAt: new Date().toISOString(),
    }));

    // Reload states from database
    loadSafetyConfig();
    loadCircuitBreakerState();
  }, [isAutoPilotOn, scanInterval, loadSafetyConfig, loadCircuitBreakerState]);



  // Handle live trading mode switch with confirmation
  const handleExecutionModeChange = (mode: 'simulation' | 'live') => {
    if (mode === 'live' && !safetyConfig.liveTradingAcknowledged) {
      setShowLiveTradingModal(true);
    } else {
      setSafetyConfig(prev => ({ ...prev, executionMode: mode }));
    }
  };

  // Handle live trading confirmation
  const handleLiveTradingConfirm = async () => {
    try {
      const { error } = await supabase
        .from('auto_trade_config')
        .upsert({
          user_id: 'default',
          execution_mode: 'live',
          live_trading_acknowledged: true,
          live_trading_acknowledged_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setSafetyConfig(prev => ({
        ...prev,
        executionMode: 'live',
        liveTradingAcknowledged: true,
        liveTradingAcknowledgedAt: new Date().toISOString(),
      }));

      setShowLiveTradingModal(false);

      toast({
        title: 'Live Trading Enabled',
        description: 'You have acknowledged the risks. Live trading is now active.',
        duration: 5000,
      });
    } catch (error: unknown) {
      toast({
        title: 'Failed to Enable Live Trading',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  // Save safety configuration
  const saveSafetyConfig = async () => {
    setIsSavingConfig(true);
    try {
      const { error } = await supabase
        .from('auto_trade_config')
        .upsert({
          user_id: 'default',
          min_profit_threshold: safetyConfig.minProfitThreshold,
          max_position_size: safetyConfig.maxPositionSize,
          max_slippage_percent: safetyConfig.maxSlippagePercent,
          max_gas_price_gwei: safetyConfig.maxGasPriceGwei,
          max_daily_trades: safetyConfig.maxDailyTrades,
          max_daily_loss: safetyConfig.maxDailyLoss,
          circuit_breaker_enabled: safetyConfig.circuitBreakerEnabled,
          circuit_breaker_loss_threshold: safetyConfig.circuitBreakerLossThreshold,
          circuit_breaker_consecutive_losses: safetyConfig.circuitBreakerConsecutiveLosses,
          flashbots_enabled: safetyConfig.flashbotsEnabled,
          execution_mode: safetyConfig.executionMode,
          // New safety fields
          wallet_balance_check_enabled: safetyConfig.walletBalanceCheckEnabled,
          min_wallet_balance_eth: safetyConfig.minWalletBalanceEth,
          auto_fallback_to_simulation: safetyConfig.autoFallbackToSimulation,
          fallback_balance_threshold_eth: safetyConfig.fallbackBalanceThresholdEth,
          tx_confirmation_monitoring: safetyConfig.txConfirmationMonitoring,
          tx_confirmation_timeout_seconds: safetyConfig.txConfirmationTimeoutSeconds,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Your safety configuration has been updated.',
        duration: 3000,
      });
    } catch (error: unknown) {
      toast({
        title: 'Save Failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsSavingConfig(false);
    }
  };


  // Reset circuit breaker
  const resetCircuitBreaker = async () => {
    try {
      const { error } = await supabase
        .from('circuit_breaker_state')
        .upsert({
          user_id: 'default',
          is_tripped: false,
          tripped_at: null,
          trip_reason: null,
          consecutive_losses: 0,
          daily_loss: 0,
          daily_trades: 0,
          last_reset_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setCircuitBreaker({
        isTripped: false,
        trippedAt: null,
        tripReason: null,
        consecutiveLosses: 0,
        dailyLoss: 0,
        dailyTrades: 0,
        lastResetDate: new Date().toISOString().split('T')[0],
      });

      toast({
        title: 'Circuit Breaker Reset',
        description: 'Trading can now resume.',
        duration: 3000,
      });
    } catch (error: unknown) {
      toast({
        title: 'Reset Failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  // Load recent trades from database
  const loadRecentTrades = useCallback(async () => {

    try {
      const { data, error } = await supabase
        .from('trade_execution_logs')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(20);

      if (error) {
        // Table might not exist yet - this is okay
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('trade_execution_logs table not yet created');
          return;
        }
        throw error;
      }

      // Ensure data is an array before mapping
      if (data && Array.isArray(data) && data.length > 0) {
        const trades: ExecutedTrade[] = data.map(t => ({
          tokenPair: t.token_pair || 'Unknown',
          network: t.network || 'unknown',
          success: t.status === 'success',
          profit: parseFloat(t.actual_profit) || 0,
          slippage: t.slippage_actual ? parseFloat(t.slippage_actual) : undefined,
          txHash: t.tx_hash || '0x...',
          bundleHash: t.flashbots_bundle_hash,
        }));
        setRecentTrades(trades);

        // Update stats from database
        const successful = data.filter(t => t.status === 'success');
        const failed = data.filter(t => t.status !== 'success');
        setStats(prev => ({
          ...prev,
          totalTrades: data.length,
          successfulTrades: successful.length,
          totalProfit: successful.reduce((sum, t) => sum + (parseFloat(t.actual_profit) || 0), 0),
          totalLoss: failed.reduce((sum, t) => sum + Math.abs(parseFloat(t.actual_profit || '0') || 0), 0),
        }));
      }
    } catch (error) {
      console.error('Failed to load trades:', error);
    }
  }, []);


  useEffect(() => {
    loadSafetyConfig();
    loadCircuitBreakerState();
    loadRecentTrades();
  }, [loadSafetyConfig, loadCircuitBreakerState, loadRecentTrades]);

  // Stop auto-pilot
  const stopAutoPilot = useCallback(() => {
    setIsAutoPilotOn(false);
    setStats(prev => ({ ...prev, isRunning: false }));
    
    if (scanInterval) {
      clearInterval(scanInterval);
      setScanInterval(null);
    }
    
    toast({
      title: 'Auto-Pilot Stopped',
      description: 'Bot has stopped scanning.',
      duration: 3000,
    });
  }, [scanInterval, toast]);

  // Run a single scan with auto-execute
  const runScan = useCallback(async () => {
    if (circuitBreaker.isTripped && safetyConfig.circuitBreakerEnabled) {
      toast({
        title: 'Circuit Breaker Active',
        description: `Trading halted: ${circuitBreaker.tripReason}`,
        variant: 'destructive',
      });
      return;
    }

    setIsScanning(true);
    
    try {
      if (!isSupabaseConfigured()) {
        setStats(prev => ({
          ...prev,
          totalScans: prev.totalScans + 1,
          lastScanTime: new Date(),
        }));

        toast({
          title: 'Backend Required',
          description: 'Supabase is not configured. Auto-pilot scan aborted with no simulated trades.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      const executionMode = safetyConfig.executionMode === 'live' ? 'live' : 'demo';
      const scanNetworks = executionMode === 'live'
        ? selectedNetworks.filter(supportsLiveExecution)
        : selectedNetworks;

      if (scanNetworks.length === 0) {
        toast({
          title: 'No Live-Compatible Networks Selected',
          description: 'The current live executor is wired for Ethereum mainnet only. Keep Base and Arbitrum in demo mode.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: {
          networks: scanNetworks,
          loanAmountUsd: safetyConfig.maxPositionSize,
          minNetProfitUsd: safetyConfig.minProfitThreshold,
          perNetworkMinNetProfitUsd: Object.fromEntries(scanNetworks.map((network) => [network, safetyConfig.minProfitThreshold])),
          minLiquidityUsd: 20000,
          minSpreadPercent: 0.01,
          maxSlippageBps: Math.max(1, Math.round(safetyConfig.maxSlippagePercent * 100)),
          maxLiquidityUsagePercent: 35,
          estimatedGasUsd: executionMode === 'live' ? 6 : 3,
          maxResults: 10,
        },
      });

      if (error) throw error;

      // Check if circuit breaker was tripped
      if (data?.circuitBreaker?.isTripped) {
        setCircuitBreaker(data.circuitBreaker);
        if (isAutoPilotOn) {
          stopAutoPilot();
          toast({
            title: 'Circuit Breaker Tripped!',
            description: data.circuitBreaker.tripReason,
            variant: 'destructive',
            duration: 10000,
          });
        }
        return;
      }

      if (data?.success) {
        setStats(prev => ({
          ...prev,
          totalScans: prev.totalScans + 1,
          lastScanTime: new Date(),
        }));

        // Update circuit breaker state
        if (data.circuitBreaker) {
          setCircuitBreaker(data.circuitBreaker);
        }

        // If trades were executed, update the UI
        const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : [];
        const executableTrades = opportunities
          .map((opportunity) => normalizeOpportunityToTrade(opportunity, safetyConfig.maxPositionSize))
          .filter((trade) => trade.expectedProfit >= safetyConfig.minProfitThreshold)
          .slice(0, 3);

        if (executableTrades.length === 0) {
          const watchlistCount = Number(data?.watchlistCount ?? 0);
          toast({
            title: 'Scan Complete',
            description: `Found ${data?.found ?? 0} executable opportunities and ${watchlistCount} watchlist candidates. None met the auto-trade threshold of $${safetyConfig.minProfitThreshold}.`,
            duration: 3500,
          });
          return;
        }

        const contractAddress = getContractAddresses().arbitrageContract;
        const executedTrades: ExecutedTrade[] = [];
        let tradesAttempted = 0;
        let tradesSuccessful = 0;
        let totalProfit = 0;
        let totalLoss = 0;
        const blockedTrades: string[] = [];

        for (const trade of executableTrades) {
          if (executionMode === 'live') {
            const blocker = getLiveExecutionBlocker(trade, account, contractAddress);
            if (blocker) {
              blockedTrades.push(`${trade.tokenPair}: ${blocker}`);
              continue;
            }
          }

          tradesAttempted += 1;

          try {
            const result = await executeArbitrageTrade({
              trade,
              mode: executionMode,
              account,
              contractAddress,
              maxSlippagePercent: safetyConfig.maxSlippagePercent,
            });

            tradesSuccessful += 1;
            totalProfit += result.actualProfit;
            executedTrades.push({
              tokenPair: trade.tokenPair,
              network: trade.network,
              success: true,
              profit: result.actualProfit,
              slippage: safetyConfig.maxSlippagePercent,
              txHash: result.txHash,
              bundleHash: result.bundleHash,
            });
          } catch (error: unknown) {
            const message = getErrorMessage(error);
            totalLoss += Math.max(0, trade.expectedProfit);
            executedTrades.push({
              tokenPair: trade.tokenPair,
              network: trade.network,
              success: false,
              profit: -Math.max(0, trade.expectedProfit),
              slippage: safetyConfig.maxSlippagePercent,
              txHash: `failed-${trade.id}`,
            });
            console.error('Auto-pilot execution failed:', message);
          }
        }

        if (executedTrades.length > 0) {
          setRecentTrades(prev => [...executedTrades, ...prev].slice(0, 20));
          setStats(prev => ({
            ...prev,
            totalTrades: prev.totalTrades + tradesAttempted,
            successfulTrades: prev.successfulTrades + tradesSuccessful,
            totalProfit: prev.totalProfit + totalProfit,
            totalLoss: prev.totalLoss + totalLoss,
          }));
          await loadRecentTrades();
        }

        if (blockedTrades.length > 0 && executedTrades.length === 0) {
          toast({
            title: 'Auto-Pilot Blocked',
            description: blockedTrades[0],
            variant: 'destructive',
            duration: 5000,
          });
          return;
        }

        const modeLabel = executionMode === 'live' ? 'LIVE' : 'DEMO';
        toast({
          title: `${modeLabel} Auto-Pilot ${tradesSuccessful}/${tradesAttempted} Trades`,
          description: `Profit: $${totalProfit.toFixed(2)} | Loss: $${totalLoss.toFixed(2)}${blockedTrades.length > 0 ? ` | Blocked: ${blockedTrades.length}` : ''}`,
          duration: 5000,
        });
      }
    } catch (error: unknown) {
      console.error('Scan failed:', error);
      toast({
        title: 'Scan Failed',
        description: getErrorMessage(error) || 'Check your connection',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  }, [selectedNetworks, safetyConfig, circuitBreaker, isAutoPilotOn, toast, stopAutoPilot, account, loadRecentTrades]);

  // Start auto-pilot
  const startAutoPilot = useCallback(() => {
    if (circuitBreaker.isTripped && safetyConfig.circuitBreakerEnabled) {
      toast({
        title: 'Cannot Start',
        description: 'Circuit breaker is active. Reset it first.',
        variant: 'destructive',
      });
      return;
    }

    if (safetyConfig.executionMode === 'live') {
      if (!account) {
        toast({
          title: 'Wallet Required',
          description: 'Connect a wallet before starting live auto-pilot.',
          variant: 'destructive',
        });
        return;
      }

      if (!getContractAddresses().arbitrageContract) {
        toast({
          title: 'Contract Required',
          description: 'Configure your arbitrage contract before starting live auto-pilot.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsAutoPilotOn(true);
    setStats(prev => ({ ...prev, isRunning: true }));
    
    // Run immediately
    runScan();
    
    // Then run every 30 seconds
    const interval = setInterval(runScan, 30000);
    setScanInterval(interval);
    
    const mode = safetyConfig.executionMode === 'live' ? 'LIVE MODE' : 'Simulation Mode';
    const mode = safetyConfig.executionMode === 'live' ? 'LIVE MODE' : 'Demo Mode';
    toast({
      title: `Auto-Pilot Activated (${mode})`,
      description: `Bot scanning every 30s. Min profit: $${safetyConfig.minProfitThreshold}`,
      duration: 5000,
    });
  }, [runScan, toast, circuitBreaker, safetyConfig, account]);
                      Demo (Safe)

  /*
  // Stop auto-pilot
  const stopAutoPilot = useCallback(() => {
    setIsAutoPilotOn(false);
    setStats(prev => ({ ...prev, isRunning: false }));
    
    if (scanInterval) {
      clearInterval(scanInterval);
      setScanInterval(null);
    }
    
    toast({
      title: 'Auto-Pilot Stopped',
      description: 'Bot has stopped scanning.',
      duration: 3000,
    });
  }, [scanInterval, toast]);
  */
 
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanInterval) clearInterval(scanInterval);
    };
  }, [scanInterval]);

  const successRate = stats.totalTrades > 0 
    ? ((stats.successfulTrades / stats.totalTrades) * 100).toFixed(1) 
    : '0.0';

  const netProfit = stats.totalProfit - stats.totalLoss;

  return (
    <div className="space-y-6">
      {/* Circuit Breaker Alert */}
      {circuitBreaker.isTripped && (
        <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-red-400 font-bold text-lg">Circuit Breaker Tripped!</h3>
            <p className="text-gray-300 mt-1">{circuitBreaker.tripReason}</p>
            <p className="text-gray-400 text-sm mt-2">
              Tripped at: {circuitBreaker.trippedAt ? new Date(circuitBreaker.trippedAt).toLocaleString() : 'Unknown'}
            </p>
          </div>
          <button
            onClick={resetCircuitBreaker}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      )}

      {/* Hero Section */}
      <div className={`bg-gradient-to-r ${
        safetyConfig.executionMode === 'live' 
          ? 'from-red-900/50 to-orange-900/50 border-red-500/30' 
          : 'from-green-900/50 to-emerald-900/50 border-green-500/30'
      } border rounded-xl p-6`}>
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${
              isAutoPilotOn 
                ? safetyConfig.executionMode === 'live' 
                  ? 'bg-red-500 animate-pulse' 
                  : 'bg-green-500 animate-pulse' 
                : 'bg-gray-700'
            }`}>
              <Rocket className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white">Auto-Pilot Mode</h2>
                {safetyConfig.executionMode === 'live' && (
                  <span className="px-3 py-1 bg-red-500 text-white text-sm font-bold rounded-full animate-pulse">
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-gray-400">
                {isAutoPilotOn 
                  ? `Bot actively trading (${safetyConfig.executionMode === 'live' ? 'REAL MONEY' : 'Demo'})`
                  : 'Click Start to begin automatic trading'}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 justify-end mt-4 sm:mt-0">
            <button
              onClick={() => setShowSafetyPanel(!showSafetyPanel)}
              className={`p-2 rounded-lg transition-colors ${
                showSafetyPanel ? 'bg-yellow-500 text-black' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
              }`}
              title="Safety Settings"
            >
              <Shield className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-colors ${
                showSettings ? 'bg-blue-500 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
              }`}
              title="Trade Settings"
            >
              <Settings2 className="h-5 w-5" />
            </button>
            
            {!isAutoPilotOn ? (
              <button
                onClick={startAutoPilot}
                disabled={isScanning || (circuitBreaker.isTripped && safetyConfig.circuitBreakerEnabled)}
                className={`flex items-center gap-2 px-6 py-3 font-bold rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
                  safetyConfig.executionMode === 'live'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                <Play className="h-5 w-5" />
                Start Auto-Pilot
              </button>
            ) : (
              <button
                onClick={stopAutoPilot}
                className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition-all whitespace-nowrap"
              >
                <Pause className="h-5 w-5" />
                Stop
              </button>
            )}
            
            {/* Emergency Stop Button */}
            <EmergencyStopButton
              isAutoPilotRunning={isAutoPilotOn}
              executionMode={safetyConfig.executionMode}
              onEmergencyStop={handleEmergencyStop}
              walletBalance={safetyConfig.lastWalletBalanceEth}
              pendingTransactions={pendingTransactions}
            />
          </div>
        </div>


        {/* Emergency Stop Active Banner */}
        {safetyConfig.emergencyStopActive && (
          <div className="bg-red-500/20 border-2 border-red-500 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/30 rounded-lg">
                <Ban className="h-6 w-6 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-red-400 font-bold text-lg">Emergency Stop Active</h3>
                <p className="text-gray-300 text-sm">
                  Trading has been halted. {safetyConfig.emergencyStopReason || 'Emergency stop was triggered.'}
                </p>
                {safetyConfig.emergencyStopTriggeredAt && (
                  <p className="text-gray-500 text-xs mt-1">
                    Triggered at: {new Date(safetyConfig.emergencyStopTriggeredAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={async () => {
                  try {
                    await supabase
                      .from('auto_trade_config')
                      .update({
                        emergency_stop_active: false,
                        emergency_stop_triggered_at: null,
                        emergency_stop_reason: null,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('user_id', 'default');
                    
                    setSafetyConfig(prev => ({
                      ...prev,
                      emergencyStopActive: false,
                      emergencyStopTriggeredAt: null,
                      emergencyStopReason: null,
                    }));
                    
                    toast({
                      title: 'Emergency Stop Cleared',
                      description: 'You can now resume trading operations.',
                    });
                  } catch (error) {
                    console.error('Failed to clear emergency stop:', error);
                  }
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              >
                Clear Emergency Stop
              </button>
            </div>
          </div>
        )}

        {/* Safety Settings Panel */}
        {showSafetyPanel && (
          <div className="bg-gray-800/70 rounded-lg p-5 mb-6 border border-yellow-500/30">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-yellow-400" />
              <h3 className="text-white font-semibold">Safety Configuration</h3>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Execution Mode */}
              <div className="col-span-full">
                <label className="text-gray-400 text-sm block mb-2">Execution Mode</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleExecutionModeChange('simulation')}
                    className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                      safetyConfig.executionMode === 'simulation'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck className="h-5 w-5" />
                      Simulation (Safe)
                    </div>
                  </button>
                  <button
                    onClick={() => handleExecutionModeChange('live')}
                    className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                      safetyConfig.executionMode === 'live'
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Live Trading (Real Money)
                    </div>
                  </button>
                </div>
              </div>

              {/* Min Profit Threshold */}
              <div>
                <label className="text-gray-400 text-sm block mb-2">
                  Min Profit Threshold ($)
                  <Info className="h-3 w-3 inline ml-1 text-gray-500" title="Only execute trades with profit above this amount" />
                </label>
                <input
                  type="number"
                  title="Minimum profit threshold"
                  value={safetyConfig.minProfitThreshold}
                  onChange={(e) => setSafetyConfig(prev => ({ ...prev, minProfitThreshold: Number(e.target.value) }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  min="0"
                  step="10"
                />
              </div>

              {/* Max Position Size */}
              <div>
                <label className="text-gray-400 text-sm block mb-2">Max Position Size ($)</label>
                <input
                  type="number"
                  title="Maximum position size"
                  value={safetyConfig.maxPositionSize}
                  onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxPositionSize: Number(e.target.value) }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  min="1000"
                  step="1000"
                />
              </div>

              {/* Max Slippage */}
              <div>
                <label className="text-gray-400 text-sm block mb-2">Max Slippage (%)</label>
                <input
                  type="number"
                  title="Maximum slippage percent"
                  value={safetyConfig.maxSlippagePercent}
                  onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxSlippagePercent: Number(e.target.value) }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  min="0.1"
                  max="5"
                  step="0.1"
                />
              </div>

              {/* Max Gas Price */}
              <div>
                <label className="text-gray-400 text-sm block mb-2">Max Gas Price (Gwei)</label>
                <input
                  type="number"
                  title="Maximum gas price"
                  value={safetyConfig.maxGasPriceGwei}
                  onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxGasPriceGwei: Number(e.target.value) }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  min="10"
                  step="10"
                />
              </div>

              {/* Max Daily Trades */}
              <div>
                <label className="text-gray-400 text-sm block mb-2">Max Daily Trades</label>
                <input
                  type="number"
                  title="Maximum daily trades"
                  value={safetyConfig.maxDailyTrades}
                  onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxDailyTrades: Number(e.target.value) }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  min="1"
                  step="5"
                />
              </div>

              {/* Max Daily Loss */}
              <div>
                <label className="text-gray-400 text-sm block mb-2">Max Daily Loss ($)</label>
                <input
                  type="number"
                  title="Maximum daily loss"
                  value={safetyConfig.maxDailyLoss}
                  onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxDailyLoss: Number(e.target.value) }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  min="50"
                  step="50"
                />
              </div>
            </div>



            {/* Circuit Breaker Settings */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-red-400" />
                  <h4 className="text-white font-medium">Circuit Breaker</h4>
                </div>
                <button
                  onClick={() => setSafetyConfig(prev => ({ ...prev, circuitBreakerEnabled: !prev.circuitBreakerEnabled }))}
                  className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${
                    safetyConfig.circuitBreakerEnabled
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {safetyConfig.circuitBreakerEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {safetyConfig.circuitBreakerEnabled && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Loss Threshold to Trip ($)</label>
                    <input
                      type="number"
                      title="Circuit breaker loss threshold"
                      value={safetyConfig.circuitBreakerLossThreshold}
                      onChange={(e) => setSafetyConfig(prev => ({ ...prev, circuitBreakerLossThreshold: Number(e.target.value) }))}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                      min="50"
                      step="50"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Consecutive Losses to Trip</label>
                    <input
                      type="number"
                      title="Circuit breaker consecutive losses"
                      value={safetyConfig.circuitBreakerConsecutiveLosses}
                      onChange={(e) => setSafetyConfig(prev => ({ ...prev, circuitBreakerConsecutiveLosses: Number(e.target.value) }))}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                      min="1"
                      max="10"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={saveSafetyConfig}
                disabled={isSavingConfig}
                className="flex items-center gap-2 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isSavingConfig ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Save Safety Settings
              </button>
            </div>
          </div>
        )}

        {/* Trade Settings Panel */}
        {showSettings && (
          <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">Trade Settings</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm block mb-2">Networks to Scan</label>
                <div className="flex flex-wrap gap-2">
                  {['ethereum', 'polygon', 'arbitrum', 'optimism'].map(network => (
                    <button
                      key={network}
                      onClick={() => {
                        if (selectedNetworks.includes(network)) {
                          setSelectedNetworks(prev => prev.filter(n => n !== network));
                        } else {
                          setSelectedNetworks(prev => [...prev, network]);
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-sm capitalize ${
                        selectedNetworks.includes(network)
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {network}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-2">Flashbots Protection</label>
                <button
                  onClick={() => setSafetyConfig(prev => ({ ...prev, flashbotsEnabled: !prev.flashbotsEnabled }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    safetyConfig.flashbotsEnabled
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {safetyConfig.flashbotsEnabled ? 'Flashbots Enabled' : 'Flashbots Disabled'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Indicators */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            isAutoPilotOn 
              ? safetyConfig.executionMode === 'live'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400' 
              : 'bg-gray-700/50 text-gray-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isAutoPilotOn 
                ? safetyConfig.executionMode === 'live'
                  ? 'bg-red-400 animate-pulse'
                  : 'bg-green-400 animate-pulse' 
                : 'bg-gray-500'
            }`} />
            {isAutoPilotOn ? 'ACTIVE' : 'INACTIVE'}
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            safetyConfig.circuitBreakerEnabled
              ? circuitBreaker.isTripped
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400'
              : 'bg-gray-700/50 text-gray-400'
          }`}>
            <Shield className="h-4 w-4" />
            {safetyConfig.circuitBreakerEnabled 
              ? circuitBreaker.isTripped ? 'CB Tripped' : 'CB Active'
              : 'CB Disabled'}
          </div>
          
          {isScanning && (
            <div className="flex items-center gap-2 text-[#00F0FF]">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Scanning...
            </div>
          )}
          
          {stats.lastScanTime && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Clock className="h-4 w-4" />
              Last scan: {stats.lastScanTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Circuit Breaker Status */}
      {safetyConfig.circuitBreakerEnabled && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-yellow-400" />
              <h3 className="text-white font-semibold">Circuit Breaker Status</h3>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              circuitBreaker.isTripped
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400'
            }`}>
              {circuitBreaker.isTripped ? 'TRIPPED' : 'NORMAL'}
            </span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-400 text-xs mb-1">Consecutive Losses</p>
              <p className={`text-xl font-bold ${
                circuitBreaker.consecutiveLosses >= safetyConfig.circuitBreakerConsecutiveLosses - 1
                  ? 'text-red-400'
                  : 'text-white'
              }`}>
                {circuitBreaker.consecutiveLosses} / {safetyConfig.circuitBreakerConsecutiveLosses}
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-400 text-xs mb-1">Daily Loss</p>
              <p className={`text-xl font-bold ${
                circuitBreaker.dailyLoss >= safetyConfig.circuitBreakerLossThreshold * 0.8
                  ? 'text-red-400'
                  : 'text-white'
              }`}>
                ${circuitBreaker.dailyLoss.toFixed(2)}
              </p>
              <p className="text-gray-500 text-xs">/ ${safetyConfig.circuitBreakerLossThreshold}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-400 text-xs mb-1">Daily Trades</p>
              <p className={`text-xl font-bold ${
                circuitBreaker.dailyTrades >= safetyConfig.maxDailyTrades * 0.8
                  ? 'text-yellow-400'
                  : 'text-white'
              }`}>
                {circuitBreaker.dailyTrades} / {safetyConfig.maxDailyTrades}
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-400 text-xs mb-1">Last Reset</p>
              <p className="text-white text-sm font-medium">
                {circuitBreaker.lastResetDate}
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Wallet Balance Monitor and Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Wallet Balance Monitor Widget */}
        <div className="lg:col-span-1">
          <WalletBalanceMonitor
            minBalanceThreshold={safetyConfig.minWalletBalanceEth}
            refreshIntervalSeconds={30}
            showChart={true}
            compact={false}
            onLowBalance={(balance, threshold) => {
              toast({
                title: 'Low Balance Alert',
                description: `Wallet balance (${balance.toFixed(4)} ETH) is below threshold (${threshold} ETH). Consider adding funds.`,
                variant: 'destructive',
                duration: 10000,
              });
            }}
          />
        </div>
        
        {/* Stats Grid */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
              <span className="text-gray-400 text-sm">Total Scans</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalScans}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Zap className="h-5 w-5 text-purple-400" />
              </div>
              <span className="text-gray-400 text-sm">Trades</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalTrades}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
              <span className="text-gray-400 text-sm">Success Rate</span>
            </div>
            <p className="text-2xl font-bold text-white">{successRate}%</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-400" />
              </div>
              <span className="text-gray-400 text-sm">Total Profit</span>
            </div>
            <p className="text-2xl font-bold text-green-400">${stats.totalProfit.toFixed(2)}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <TrendingDown className="h-5 w-5 text-yellow-400" />
              </div>
              <span className="text-gray-400 text-sm">Net P/L</span>
            </div>
            <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {netProfit >= 0 ? '+' : ''}{netProfit.toFixed(2)}
            </p>
          </div>
        </div>
      </div>


      {/* Mode Notice */}
      <div className={`border rounded-xl p-4 flex items-start gap-3 ${
        safetyConfig.executionMode === 'live'
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-yellow-500/10 border-yellow-500/30'
      }`}>
        {safetyConfig.executionMode === 'live' ? (
          <>
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
            <div>
              <h3 className="text-red-400 font-semibold">Live Trading Mode Active</h3>
              <p className="text-gray-400 text-sm mt-1">
                Real money is being used for trades. Ensure you have sufficient funds and understand the risks.
                Circuit breaker is {safetyConfig.circuitBreakerEnabled ? 'enabled' : 'DISABLED'} - 
                max daily loss: ${safetyConfig.maxDailyLoss}.
              </p>
            </div>
          </>
        ) : (
          <>
            <Shield className="h-5 w-5 text-yellow-400 mt-0.5" />
            <div>
              <h3 className="text-yellow-400 font-semibold">Simulation Mode Active</h3>
              <p className="text-gray-400 text-sm mt-1">
                All trades are simulated - no real money is being used. This mode lets you see how the bot performs 
                Trades are executed in demo mode against live market data. No real money is used until you switch to Live Mode.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Recent Trades */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Recent Executed Trades</h3>
          <button
            onClick={loadRecentTrades}
            title="Refresh recent trades"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        
        {recentTrades.length > 0 ? (
          <div className="divide-y divide-gray-700">
            {recentTrades.map((trade, index) => (
              <div key={index} className="p-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-4">
                  {trade.success ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-400" />
                  )}
                  <div>
                    <p className="text-white font-medium">{trade.tokenPair}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-gray-400 text-sm capitalize">{trade.network}</p>
                      {trade.slippage !== undefined && (
                        <span className="text-gray-500 text-xs">
                          Slippage: {trade.slippage.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${trade.success ? 'text-green-400' : 'text-red-400'}`}>
                    {trade.success ? `+$${trade.profit.toFixed(2)}` : `-$${Math.abs(trade.profit).toFixed(2)}`}
                  </p>
                  <p className="text-gray-500 text-xs font-mono">{trade.txHash.slice(0, 10)}...</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <Activity className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No trades executed yet</p>
            <p className="text-gray-500 text-sm mt-1">Start Auto-Pilot to begin trading</p>
          </div>
        )}
      </div>

      {/* Live Trading Confirmation Modal */}
      <LiveTradingConfirmationModal
        isOpen={showLiveTradingModal}
        onClose={() => setShowLiveTradingModal(false)}
        onConfirm={handleLiveTradingConfirm}
        currentBalance={safetyConfig.lastWalletBalanceEth ?? undefined}
        minBalanceRequired={safetyConfig.minWalletBalanceEth}
        maxDailyLoss={safetyConfig.maxDailyLoss}
        circuitBreakerEnabled={safetyConfig.circuitBreakerEnabled}
      />
    </div>
  );
};
