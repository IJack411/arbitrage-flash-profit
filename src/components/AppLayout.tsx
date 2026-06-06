import React, { useState, useEffect, useCallback } from 'react';
import { WalletConnect } from './WalletConnect';
import { OpportunityCard } from './OpportunityCard';
import { PerformanceMetrics } from './PerformanceMetrics';
import { StrategyConfig } from './StrategyConfig';
import { TransactionHistory } from './TransactionHistory';
import { ProtocolMatrix } from './ProtocolMatrix';
import { HowItWorks } from './HowItWorks';
import { ApiSettings } from './ApiSettings';
import { SmartContractDeployer } from './SmartContractDeployer';

import { ProductionReadiness } from './ProductionReadiness';
import { EdgeFunctionDeployer } from './EdgeFunctionDeployer';
import { NetworkSelector } from './NetworkSelector';
import { CrossChainArbitrage } from './CrossChainArbitrage';

import { GasOptimizerPanel } from './GasOptimizerPanel';
import { NotificationCenter } from './notifications/NotificationCenter';
import { WebhookManager } from './webhooks/WebhookManager';
import { RiskManagementPanel } from './risk/RiskManagementPanel';

import { TradingBotManager } from './bots/TradingBotManager';
import { LiveTradingPanel } from './bots/LiveTradingPanel';
import { OracleDashboard } from './oracles/OracleDashboard';

import { StrategyBuilderDashboard } from './strategy/StrategyBuilderDashboard';

import { IndexerDashboard } from './IndexerDashboard';
import { MasterFlashLoanSlider } from './MasterFlashLoanSlider';
import { PriceAlertDashboard } from './priceAlerts/PriceAlertDashboard';
import { AuthModal } from './auth/AuthModal';
import { UserProfileModal } from './auth/UserProfileModal';
import { MultiWalletManager } from '../agent-helpers/components/wallet/MultiWalletManager';
import { AdminDashboard } from './admin/AdminDashboard';
import { ConnectionDiagnostics } from './ConnectionDiagnostics';
import { PreLaunchTestSuite } from './PreLaunchTestSuite';
import { SchedulerDashboard } from './scheduler/SchedulerDashboard';
import { Scheduler24x7Dashboard } from './scheduler/Scheduler24x7Dashboard';
import { AutoPilotDashboard } from './AutoPilotDashboard';

import { ArbitrageOpportunity, Transaction } from '../types/arbitrage';
import { useAppContext } from '../contexts/AppContext';
import { useWeb3 } from '../contexts/Web3Context';
import { useAuth } from '../contexts/AuthContext';
import { Settings, RefreshCw, Activity, Shield, Cloud, ArrowLeftRight, Fuel, Bell, Webhook, AlertTriangle, Bot, Database, Layers, Server, BellRing, User, LogIn, Play, FileCode, Wallet, ShieldCheck, Stethoscope, Rocket, Clock, Plane, Power } from 'lucide-react';

import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { saveTransaction } from '@/lib/supabaseService';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notificationService, ArbitrageNotification } from '@/lib/notificationService';
import { autoWebhookTrigger } from '@/lib/autoWebhookTrigger';
import { Badge } from '@/components/ui/badge';
import { priceAlertService } from '@/lib/priceAlertService';
import { userAlertService } from '@/lib/userAlertService';
import { getContractAddresses, isContractConfigured } from '@/lib/web3/config';


interface ScanDiagnosticsView {
  pairKeys: number;
  candidates: number;
  droppedBySpread: number;
  droppedByLiquidity: number;
  droppedBySlippage: number;
  droppedByNetProfit: number;
  droppedByExecutionRisk: number;
  quoteValidated: number;
  sizeAdjusted: number;
  watchlistCount?: number;
  rejectionSamples?: Array<{
    tokenPair: string;
    reason: string;
    buyDex?: string;
    sellDex?: string;
    spread?: number;
    attemptedLoanAmount?: number;
  }>;
}














export const AppLayout: React.FC = () => {
  const { strategySettings, updateStrategySettings, opportunities: dbOpportunities, transactions: dbTransactions, loadOpportunities, loadTransactions, syncSettings } = useAppContext();

  const { account } = useWeb3();
  const { user, profile, isAuthenticated, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'all' | 'profitable'>('all');
  const [sortBy, setSortBy] = useState<'profit' | 'time'>('profit');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [scanInterval, setScanInterval] = useState<NodeJS.Timeout | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionMode, setExecutionMode] = useState<'simulation' | 'live'>('simulation');
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>(['ethereum', 'arbitrum', 'base', 'polygon']);
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [lastScanDiagnostics, setLastScanDiagnostics] = useState<ScanDiagnosticsView | null>(null);
  const [watchlistOpportunities, setWatchlistOpportunities] = useState<ArbitrageOpportunity[]>([]);
  
  // Auto-scan debounce for loan amount slider
  const autoScanTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const normalizeOpportunity = useCallback((raw: Partial<ArbitrageOpportunity>, fallbackId: string): ArbitrageOpportunity => {
    const estimatedProfit = Number(raw.estimatedProfit ?? raw.estimated_profit ?? raw.profitUSD ?? raw.netProfit ?? 0);
    const gasCost = Number(raw.gasCost ?? raw.gas_cost ?? 0);
    const confidenceScore = Number(raw.confidenceScore ?? raw.confidence_score ?? 0);
    const profitPercentage = Number(raw.profitPercentage ?? raw.profit_percentage ?? raw.spread ?? 0);

    return {
      id: String(raw.id ?? fallbackId),
      tokenPair: String(raw.tokenPair ?? raw.token_pair ?? 'Unknown'),
      buyDex: String(raw.buyDex ?? raw.buy_dex ?? 'Unknown'),
      sellDex: String(raw.sellDex ?? raw.sell_dex ?? 'Unknown'),
      buyPrice: Number(raw.buyPrice ?? raw.buy_price ?? 0),
      sellPrice: Number(raw.sellPrice ?? raw.sell_price ?? 0),
      profitPercentage,
      estimatedProfit,
      loanAmount: Number(raw.loanAmount ?? raw.loan_amount ?? 0),
      executableLoanAmount: Number(raw.executableLoanAmount ?? raw.loanAmount ?? raw.loan_amount ?? 0),
      grossProfit: Number(raw.grossProfit ?? estimatedProfit),
      distanceToExecutableUsd: Number(raw.distanceToExecutableUsd ?? Math.max(0, strategySettings.minProfit - Number(raw.netProfit ?? estimatedProfit - gasCost))),
      gasCost,
      liquidity: Number(raw.liquidity ?? 0),
      confidenceScore,
      confidenceTier: raw.confidenceTier === 'high' || raw.confidenceTier === 'medium' || raw.confidenceTier === 'low'
        ? raw.confidenceTier
        : undefined,
      network: typeof raw.network === 'string' ? raw.network : 'ethereum',
      timestamp: new Date((raw.created_at as string | number | Date | undefined) ?? Date.now()).getTime(),
      profitUSD: estimatedProfit,
      netProfit: Number(raw.netProfit ?? estimatedProfit - gasCost),
      estimatedSlippageBps: Number(raw.estimatedSlippageBps ?? 0),
      buyImpactBps: Number(raw.buyImpactBps ?? 0),
      sellImpactBps: Number(raw.sellImpactBps ?? 0),
      routePenaltyBps: Number(raw.routePenaltyBps ?? 0),
      status: raw.status === 'watchlist' ? 'watchlist' : 'active',
    };
  }, [strategySettings.minProfit]);

  // Sync user alerts when authenticated
  useEffect(() => {
    if (user) {
      userAlertService.setUserId(user.id);
      userAlertService.syncFromCloud();
    } else {
      userAlertService.clearUserData();
    }
  }, [user]);


  useEffect(() => {
    const handleNotification = (e: CustomEvent<ArbitrageNotification>) => {
      const n = e.detail;
      toast({
        title: n.title,
        description: n.message,
        duration: 5000,
      });
    };
    window.addEventListener('arbitrage-notification', handleNotification as EventListener);
    
    // Subscribe to notification updates
    const unsub = notificationService.subscribe(() => {
      setUnreadNotifications(notificationService.getUnreadCount());
    });
    setUnreadNotifications(notificationService.getUnreadCount());
    
    return () => {
      window.removeEventListener('arbitrage-notification', handleNotification as EventListener);
      unsub();
    };
  }, [toast]);

  // Load data from Supabase on mount

  useEffect(() => {
    loadOpportunities();
    loadTransactions(account || undefined);
    
    if (account) {
      syncSettings(account);
    }
  }, [account, loadOpportunities, loadTransactions, syncSettings]);

  // Use backend data only; do not inject simulated opportunities into live flow.
  useEffect(() => {
    if (dbOpportunities.length > 0) {
      const mappedOpps = dbOpportunities.map((opp, index) => normalizeOpportunity(opp, `db-${index}`));
      setOpportunities(mappedOpps);
    } else {
      setOpportunities([]);
    }
  }, [dbOpportunities, normalizeOpportunity]);

  useEffect(() => {
    if (dbTransactions.length > 0) {
      setTransactions(dbTransactions);
    } else {
      setTransactions([]);
    }
  }, [dbTransactions]);

  const scanForOpportunities = useCallback(async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: {
          networks: selectedNetworks,
          loanAmountUsd: strategySettings.loanSize,
          minNetProfitUsd: strategySettings.minProfit,
          maxSlippageBps: Math.max(1, Math.round(strategySettings.slippage * 100)),
          estimatedGasUsd: strategySettings.maxGas,
        }
      });
      if (error) throw error;
      if (data?.success) {
        const directOpportunities = Array.isArray(data.opportunities)
          ? data.opportunities.map((opp: Record<string, unknown>, index: number) => normalizeOpportunity(opp, `scan-${Date.now()}-${index}`))
          : [];
        const directWatchlist = Array.isArray(data.watchlist)
          ? data.watchlist.map((opp: Record<string, unknown>, index: number) => normalizeOpportunity(opp, `watch-${Date.now()}-${index}`))
          : [];

        setOpportunities(directOpportunities);
        setWatchlistOpportunities(directWatchlist);
        setLastScanDiagnostics(data.diagnostics ?? null);
        setLastScanTime(new Date());
        toast({
          title: 'Scan Complete',
          description: `Found ${data.found} executable opportunities and ${data.watchlistCount ?? directWatchlist.length} watchlist candidates.`,
          duration: 3500,
        });
      }
    } catch (error) {
      console.error('Scan failed:', error);
      setLastScanDiagnostics(null);
      setWatchlistOpportunities([]);
      setLastScanTime(new Date());
      toast({
        title: "Scan Failed",
        description: "No opportunities loaded. Check edge function, RPC, and API configuration.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsScanning(false);
    }
  }, [selectedNetworks, strategySettings, normalizeOpportunity, toast]);

  const startAutoScan = () => {
    scanForOpportunities();
    const interval = setInterval(() => scanForOpportunities(), 30000);
    setScanInterval(interval);
  };

  const stopAutoScan = () => {
    if (scanInterval) { clearInterval(scanInterval); setScanInterval(null); }
  };

  useEffect(() => {
    return () => { if (scanInterval) clearInterval(scanInterval); };
  }, [scanInterval]);

  // Auto-scan when loan amount changes (debounced to avoid excessive API calls)
  useEffect(() => {
    if (autoScanTimeoutRef.current) {
      clearTimeout(autoScanTimeoutRef.current);
    }
    
    // Only auto-scan if we have previous results (user is actively using the app)
    // and if auto-scan interval is active
    if (opportunities.length > 0 && scanInterval) {
      autoScanTimeoutRef.current = setTimeout(() => {
        console.log(`Auto-rescanning due to loan amount change: $${strategySettings.loanSize}`);
        // Use the latest scanForOpportunities function
        (async () => {
          setIsScanning(true);
          try {
            const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
              body: {
                networks: selectedNetworks,
                loanAmountUsd: strategySettings.loanSize,
                minNetProfitUsd: strategySettings.minProfit,
                maxSlippageBps: Math.max(1, Math.round(strategySettings.slippage * 100)),
                estimatedGasUsd: strategySettings.maxGas,
              }
            });
            if (error) throw error;
            if (data?.success) {
              const directOpportunities = Array.isArray(data.opportunities)
                ? data.opportunities.map((opp: Record<string, unknown>, index: number) => normalizeOpportunity(opp, `scan-${Date.now()}-${index}`))
                : [];
              const directWatchlist = Array.isArray(data.watchlist)
                ? data.watchlist.map((opp: Record<string, unknown>, index: number) => normalizeOpportunity(opp, `watch-${Date.now()}-${index}`))
                : [];

              setOpportunities(directOpportunities);
              setWatchlistOpportunities(directWatchlist);
              setLastScanDiagnostics(data.diagnostics ?? null);
              setLastScanTime(new Date());
            }
          } catch (error) {
            console.error('Auto-scan failed:', error);
          } finally {
            setIsScanning(false);
          }
        })();
      }, 1500); // Debounce for 1.5 seconds to avoid rapid-fire scans while slider is dragging
    }
    
    return () => {
      if (autoScanTimeoutRef.current) clearTimeout(autoScanTimeoutRef.current);
    };
  }, [strategySettings.loanSize, scanInterval, opportunities.length, selectedNetworks, strategySettings.minProfit, strategySettings.slippage, strategySettings.maxGas, normalizeOpportunity]);



  const handleExecute = async (id: string) => {
    const opp = opportunities.find(o => o.id === id);
    if (!opp) return;

    setIsExecuting(true);
    const startedAt = Date.now();
    
    try {
      if (executionMode === 'live' && account) {
        // Get configured contract addresses
        const contractAddresses = getContractAddresses();
        
        if (!contractAddresses.arbitrageContract) {
          toast({
            title: "Contract Not Configured",
            description: "Go to the Contracts tab and enter your deployed contract address first.",
            variant: "destructive",
          });
          setIsExecuting(false);
          return;
        }

        // Execute via Flashbots
        const { data, error } = await supabase.functions.invoke('flashbots-executor', {
          body: {
            action: 'execute-arbitrage',
            params: {
              opportunity: opp,
              contractAddress: contractAddresses.arbitrageContract,
              providerAddress: contractAddresses.flashLoanProvider,
              network: contractAddresses.network,
            }
          }
        });

        if (error) throw error;

        toast({
          title: "Arbitrage Executed",
          description: `Bundle submitted: ${data.bundleHash?.slice(0, 10)}...`,
        });

        const executionTime = Math.max(0.1, (Date.now() - startedAt) / 1000);
        const txHash = typeof data.bundleHash === 'string' && data.bundleHash.length > 0
          ? data.bundleHash
          : `pending-${opp.id}-${Date.now()}`;

        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          tokenPair: opp.tokenPair,
          dexPair: `${opp.buyDex} → ${opp.sellDex}`,
          entryPrice: opp.buyPrice,
          exitPrice: opp.sellPrice,
          profitUSD: opp.profitUSD,
          gasCost: opp.gasCost,
          netProfit: opp.netProfit,
          executionTime,
          timestamp: Date.now(),
          txHash,
          status: 'pending',
        };

        await saveTransaction({
          wallet_address: account,
          token_pair: opp.tokenPair,
          buy_dex: opp.buyDex,
          sell_dex: opp.sellDex,
          loan_amount: opp.loanAmount,
          profit: opp.netProfit,
          gas_used: opp.gasCost,
          transaction_hash: newTx.txHash,
          status: newTx.status,
          network: opp.network || 'ethereum',
          execution_time: Math.round(newTx.executionTime * 1000),
        });

        await loadTransactions(account);
        setTransactions(prev => [newTx, ...prev]);
        setOpportunities(prev => prev.filter(o => o.id !== id));
      } else {
        toast({
          title: "Dry Run Only",
          description: "Simulation mode does not submit trades or create synthetic transactions.",
          duration: 4000,
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Execution Failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };



  // Filter opportunities based on strategy settings and network
  const filteredOpps = opportunities
    .filter(opp => {
      if (opp.netProfit < strategySettings.minProfit) return false;
      if (opp.gasCost > strategySettings.maxGas) return false;
      const buyDexEnabled = strategySettings.enabledDexes[opp.buyDex] ?? true;
      const sellDexEnabled = strategySettings.enabledDexes[opp.sellDex] ?? true;
      if (!buyDexEnabled || !sellDexEnabled) return false;
      if (filter === 'profitable' && opp.netProfit <= 0) return false;
      if (networkFilter !== 'all' && opp.network !== networkFilter) return false;
      return true;
    })
    .sort((a, b) => sortBy === 'profit' ? b.netProfit - a.netProfit : b.timestamp - a.timestamp);


  const metrics = {
    totalProfit: transactions.reduce((sum, tx) => sum + (tx.status === 'success' ? tx.netProfit : 0), 0),
    totalTrades: transactions.length,
    successRate: Math.round((transactions.filter(tx => tx.status === 'success').length / transactions.length) * 100),
    avgProfit: transactions.reduce((sum, tx) => sum + tx.netProfit, 0) / transactions.length,
    totalGasCost: transactions.reduce((sum, tx) => sum + tx.gasCost, 0),
    volume24h: strategySettings.loanSize * 2.5, // Estimated based on loan size
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Hero Section */}
      <div 
        className="relative bg-[url('https://d64gsuwffb70l.cloudfront.net/68fab8b62fdba3666cc6398d_1761261803012_602d4789.webp')] bg-cover bg-center py-20"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/80 via-gray-900/90 to-gray-900"></div>
        <div className="relative max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-5xl font-bold text-white mb-2">
                Flash Loan <span className="text-[#00F0FF]">Arbitrage Bot</span>
              </h1>
              <p className="text-gray-400 text-lg">Automated DeFi arbitrage across multiple DEXes</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Auth Button */}
              {isAuthenticated ? (
                <button
                  onClick={() => setShowProfileModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00F0FF] to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                    {(profile?.displayName || profile?.email || 'U')[0].toUpperCase()}
                  </div>
                  <span className="text-gray-300 group-hover:text-white hidden sm:inline">
                    {profile?.displayName || profile?.email?.split('@')[0] || 'User'}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium rounded-lg transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              )}
              
              <Dialog>
                <DialogTrigger asChild>
                  <button title="Open API settings" className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors group">
                    <Settings className="h-5 w-5 text-gray-400 group-hover:text-[#00F0FF]" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">API Settings</DialogTitle>
                  </DialogHeader>
                  <ApiSettings />
                </DialogContent>

              </Dialog>
              <WalletConnect />
            </div>
          </div>

          <PerformanceMetrics metrics={metrics} />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Execution Mode Toggle */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Shield className={`h-5 w-5 ${executionMode === 'simulation' ? 'text-yellow-400' : 'text-green-400'}`} />
              <div>
                <h3 className="text-white font-semibold">Execution Mode</h3>
                <p className="text-gray-400 text-sm">
                  {executionMode === 'simulation' 
                    ? 'Running in simulation mode - no real transactions' 
                    : 'LIVE MODE - Real transactions will be executed'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1">
              <button
                onClick={() => setExecutionMode('simulation')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  executionMode === 'simulation' 
                    ? 'bg-yellow-500 text-gray-900 font-medium' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Simulation
              </button>
              <button
                onClick={() => setExecutionMode('live')}
                disabled={!account}
                className={`px-4 py-2 rounded-md transition-colors ${
                  executionMode === 'live' 
                    ? 'bg-green-500 text-white font-medium' 
                    : 'text-gray-400 hover:text-white disabled:opacity-50'
                }`}
              >
                Live Trading
              </button>
            </div>
          </div>
        </div>
        {/* Deployment & Configuration Tabs */}
        <Tabs defaultValue="autopilot" className="space-y-4">
          <TabsList className="bg-gray-800 border border-gray-700 flex-wrap">
            <TabsTrigger value="autopilot" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              <Plane className="h-4 w-4 mr-2" />
              Auto-Pilot
            </TabsTrigger>
            <TabsTrigger value="live-trading" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              <Play className="h-4 w-4 mr-2" />
              Live Trading
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="data-[state=active]:bg-gray-700">
              <Activity className="h-4 w-4 mr-2" />
              Opportunities
            </TabsTrigger>
            <TabsTrigger value="trading-bots" className="data-[state=active]:bg-gray-700">
              <Bot className="h-4 w-4 mr-2" />
              Trading Bots
            </TabsTrigger>
            <TabsTrigger value="contracts" className="data-[state=active]:bg-gray-700">
              <FileCode className="h-4 w-4 mr-2" />
              Contracts
            </TabsTrigger>
            <TabsTrigger value="gas" className="data-[state=active]:bg-gray-700">
              <Fuel className="h-4 w-4 mr-2" />
              Gas
            </TabsTrigger>
            <TabsTrigger value="cross-chain" className="data-[state=active]:bg-gray-700">
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Cross-Chain
            </TabsTrigger>
            <TabsTrigger value="deploy-functions" className="data-[state=active]:bg-gray-700">
              <Cloud className="h-4 w-4 mr-2" />
              Deploy
            </TabsTrigger>
            <TabsTrigger value="strategy" className="data-[state=active]:bg-gray-700">
              <Settings className="h-4 w-4 mr-2" />
              Strategy
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-gray-700 relative">
              <Bell className="h-4 w-4 mr-2" />
              Alerts
              {unreadNotifications > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="data-[state=active]:bg-gray-700">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="risk" className="data-[state=active]:bg-gray-700">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Risk
            </TabsTrigger>
            <TabsTrigger value="oracles" className="data-[state=active]:bg-gray-700">
              <Database className="h-4 w-4 mr-2" />
              Oracles
            </TabsTrigger>
            <TabsTrigger value="strategy-builder" className="data-[state=active]:bg-gray-700">
              <Layers className="h-4 w-4 mr-2" />
              Strategy Builder
            </TabsTrigger>
            <TabsTrigger value="indexer" className="data-[state=active]:bg-gray-700">
              <Server className="h-4 w-4 mr-2" />
              Indexer
            </TabsTrigger>
            <TabsTrigger value="price-alerts" className="data-[state=active]:bg-gray-700">
              <BellRing className="h-4 w-4 mr-2" />
              Price Alerts
            </TabsTrigger>
            <TabsTrigger value="wallets" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
              <Wallet className="h-4 w-4 mr-2" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="admin" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Admin
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
              <Stethoscope className="h-4 w-4 mr-2" />
              Diagnostics
            </TabsTrigger>
            <TabsTrigger value="prelaunch" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              <Rocket className="h-4 w-4 mr-2" />
              Pre-Launch
            </TabsTrigger>
            <TabsTrigger value="scheduler" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
              <Clock className="h-4 w-4 mr-2" />
              Scheduler
            </TabsTrigger>
            <TabsTrigger value="scheduler-24-7" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              <Power className="h-4 w-4 mr-2" />
              24/7 Mode
            </TabsTrigger>
          </TabsList>






          {/* Auto-Pilot Tab - NEW PRIMARY TAB */}
          <TabsContent value="autopilot" className="space-y-4">
            <AutoPilotDashboard />
          </TabsContent>

          {/* Live Trading Tab */}
          <TabsContent value="live-trading" className="space-y-4">
            <MasterFlashLoanSlider 
              totalValue={strategySettings.loanSize} 
              onTotalChange={(newSize) => updateStrategySettings({ loanSize: newSize })}
              min={0}
              max={1000000}
            />
            <LiveTradingPanel />
          </TabsContent>



          <TabsContent value="opportunities" className="space-y-4">
            <NetworkSelector selectedNetworks={selectedNetworks} onNetworksChange={setSelectedNetworks} />
            
            <MasterFlashLoanSlider 
              totalValue={strategySettings.loanSize} 
              onTotalChange={(newSize) => updateStrategySettings({ loanSize: newSize })}
              min={0}
              max={1000000}
            />

            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-white text-2xl font-bold">Live Opportunities</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    {scanInterval ? (
                      <span className="flex items-center gap-2">
                        <Activity className="h-3 w-3 text-green-400 animate-pulse" />
                        Auto-scanning {selectedNetworks.join(', ')}
                      </span>
                    ) : `Showing ${filteredOpps.length} opportunities`}
                  </p>
                </div>
                {lastScanTime && <div className="text-xs text-gray-500">Last: {lastScanTime.toLocaleTimeString()}</div>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {!scanInterval ? (
                  <button onClick={startAutoScan} disabled={isScanning} className="bg-[#00F0FF] hover:bg-[#00D0E0] disabled:bg-gray-700 text-gray-900 font-medium px-4 py-2 rounded-lg flex items-center gap-2">
                    <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
                    {isScanning ? 'Scanning...' : 'Start Scan'}
                  </button>
                ) : (
                  <button onClick={stopAutoScan} className="bg-red-500 hover:bg-red-600 text-white font-medium px-4 py-2 rounded-lg flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Stop
                  </button>
                )}
                <button title="Scan now" onClick={scanForOpportunities} disabled={isScanning} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-2 rounded-lg">
                  <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
                </button>
                <select title="Filter by network" value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)} className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm">
                  <option value="all">All Networks</option>
                  <option value="ethereum">Ethereum</option>
                  <option value="polygon">Polygon</option>
                  <option value="arbitrum">Arbitrum</option>
                  <option value="bsc">BSC</option>
                </select>
                <select title="Filter opportunities" value={filter} onChange={(e) => setFilter(e.target.value === 'profitable' ? 'profitable' : 'all')} className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm">
                  <option value="all">All</option>
                  <option value="profitable">Profitable</option>
                </select>
                <select title="Sort opportunities" value={sortBy} onChange={(e) => setSortBy(e.target.value === 'time' ? 'time' : 'profit')} className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm">
                  <option value="profit">By Profit</option>
                  <option value="time">By Time</option>
                </select>
              </div>
            </div>
            {lastScanDiagnostics && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-white font-semibold">Scanner Diagnostics</h3>
                    <p className="text-gray-400 text-sm">Live funnel from the latest production scan.</p>
                  </div>
                  <div className="flex gap-2 flex-wrap text-xs">
                    <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">Pairs {lastScanDiagnostics.pairKeys}</Badge>
                    <Badge variant="outline" className="border-blue-500/40 text-blue-300">Candidates {lastScanDiagnostics.candidates}</Badge>
                    <Badge variant="outline" className="border-green-500/40 text-green-300">Validated {lastScanDiagnostics.quoteValidated}</Badge>
                    <Badge variant="outline" className="border-yellow-500/40 text-yellow-300">Size Adjusted {lastScanDiagnostics.sizeAdjusted}</Badge>
                    <Badge variant="outline" className="border-orange-500/40 text-orange-300">Watchlist {lastScanDiagnostics.watchlistCount ?? 0}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div className="bg-gray-900 rounded-md p-3"><div className="text-gray-400">Spread</div><div className="text-white font-semibold">{lastScanDiagnostics.droppedBySpread}</div></div>
                  <div className="bg-gray-900 rounded-md p-3"><div className="text-gray-400">Liquidity</div><div className="text-white font-semibold">{lastScanDiagnostics.droppedByLiquidity}</div></div>
                  <div className="bg-gray-900 rounded-md p-3"><div className="text-gray-400">Slippage</div><div className="text-white font-semibold">{lastScanDiagnostics.droppedBySlippage}</div></div>
                  <div className="bg-gray-900 rounded-md p-3"><div className="text-gray-400">Net Profit</div><div className="text-white font-semibold">{lastScanDiagnostics.droppedByNetProfit}</div></div>
                  <div className="bg-gray-900 rounded-md p-3"><div className="text-gray-400">Execution Risk</div><div className="text-white font-semibold">{lastScanDiagnostics.droppedByExecutionRisk}</div></div>
                </div>
                {Array.isArray(lastScanDiagnostics.rejectionSamples) && lastScanDiagnostics.rejectionSamples.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-white">Recent Rejections</div>
                    <div className="grid gap-2">
                      {lastScanDiagnostics.rejectionSamples.slice(0, 3).map((sample, index) => (
                        <div key={`${sample.tokenPair}-${index}`} className="bg-gray-900 rounded-md p-3 text-sm flex justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-white font-medium">{sample.tokenPair}</div>
                            <div className="text-gray-400">{sample.buyDex && sample.sellDex ? `${sample.buyDex} → ${sample.sellDex}` : 'Insufficient quote coverage'}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-amber-300 uppercase tracking-wide text-xs">{sample.reason}</div>
                            <div className="text-gray-400">Spread {Number(sample.spread ?? 0).toFixed(3)}% {sample.attemptedLoanAmount ? `| Size $${Number(sample.attemptedLoanAmount).toFixed(0)}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {watchlistOpportunities.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                <div>
                  <h3 className="text-white font-semibold">Watchlist Near Misses</h3>
                  <p className="text-gray-400 text-sm">Pairs with clean execution shape that missed the profit threshold in the latest scan.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {watchlistOpportunities.slice(0, 4).map((opp) => (
                    <div key={opp.id} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="text-white font-medium">{opp.tokenPair}</div>
                          <div className="text-gray-400 text-sm">{opp.buyDex} → {opp.sellDex}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="border-orange-500/40 text-orange-300">WATCHLIST</Badge>
                          {Number(opp.distanceToExecutableUsd ?? 0) <= 15 && (
                            <Badge variant="outline" className="border-green-500/40 text-green-300">NEAR BREAK-EVEN</Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-gray-400">Net</div>
                          <div className={`${opp.netProfit >= 0 ? 'text-green-300' : 'text-orange-300'} font-semibold`}>${opp.netProfit.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Exec Size</div>
                          <div className="text-white font-semibold">${(opp.executableLoanAmount ?? opp.loanAmount).toFixed(0)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Spread</div>
                          <div className="text-white font-semibold">{Number(opp.profitPercentage ?? 0).toFixed(3)}%</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Risk</div>
                          <div className="text-white font-semibold">{Number(opp.estimatedSlippageBps ?? 0).toFixed(0)} bps</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Need</div>
                          <div className="text-amber-300 font-semibold">+${Number(opp.distanceToExecutableUsd ?? 0).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Network</div>
                          <div className="text-white font-semibold">{String(opp.network ?? 'ethereum').toUpperCase()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOpps.map(opp => (
                <OpportunityCard key={opp.id} opportunity={opp} onExecute={handleExecute} disabled={isExecuting} />
              ))}
            </div>
            {filteredOpps.length === 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
                <p className="text-gray-400">No opportunities match your current strategy settings.</p>
                <p className="text-gray-500 text-sm mt-2">Try adjusting your filters or strategy configuration.</p>
              </div>
            )}
            <ProtocolMatrix />
          </TabsContent>

          <TabsContent value="trading-bots" className="space-y-4">
            <TradingBotManager />
          </TabsContent>

          <TabsContent value="contracts" className="space-y-4">
            <SmartContractDeployer />
          </TabsContent>

          <TabsContent value="gas" className="space-y-4">
            <GasOptimizerPanel />
          </TabsContent>

          <TabsContent value="cross-chain" className="space-y-4">
            <CrossChainArbitrage />
          </TabsContent>

          <TabsContent value="deploy-functions" className="space-y-4">
            <EdgeFunctionDeployer />
          </TabsContent>

          <TabsContent value="strategy" className="space-y-4">
            <StrategyConfig />
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <WebhookManager />
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <RiskManagementPanel />
          </TabsContent>

          <TabsContent value="oracles" className="space-y-4">
            <OracleDashboard />
          </TabsContent>

          <TabsContent value="strategy-builder" className="space-y-4">
            <StrategyBuilderDashboard />
          </TabsContent>

          <TabsContent value="indexer" className="space-y-4">
            <IndexerDashboard />
          </TabsContent>

          <TabsContent value="price-alerts" className="space-y-4">
            <PriceAlertDashboard />
          </TabsContent>

          <TabsContent value="wallets" className="space-y-4">
            <MultiWalletManager />
          </TabsContent>

          <TabsContent value="admin" className="space-y-4">
            <AdminDashboard />
          </TabsContent>

          <TabsContent value="diagnostics" className="space-y-4">
            <ConnectionDiagnostics />
          </TabsContent>

          <TabsContent value="prelaunch" className="space-y-4">
            <PreLaunchTestSuite />
          </TabsContent>

          <TabsContent value="scheduler" className="space-y-4">
            <SchedulerDashboard />
          </TabsContent>

          <TabsContent value="scheduler-24-7" className="space-y-4">
            <Scheduler24x7Dashboard />
          </TabsContent>
        </Tabs>









        {/* Transaction History */}
        <TransactionHistory transactions={transactions} />

        {/* How It Works */}
        <HowItWorks />
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-white font-bold mb-3">Flash Arbitrage</h3>
              <p className="text-gray-400 text-sm">Advanced DeFi arbitrage platform for professional traders.</p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-3">Resources</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-[#00F0FF]">Documentation</a></li>
                <li><a href="#" className="hover:text-[#00F0FF]">API</a></li>
                <li><a href="#" className="hover:text-[#00F0FF]">Tutorials</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-3">Community</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-[#00F0FF]">Discord</a></li>
                <li><a href="#" className="hover:text-[#00F0FF]">Twitter</a></li>
                <li><a href="#" className="hover:text-[#00F0FF]">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-3">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-[#00F0FF]">Terms</a></li>
                <li><a href="#" className="hover:text-[#00F0FF]">Privacy</a></li>
                <li><a href="#" className="hover:text-[#00F0FF]">Disclaimer</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-6 text-center text-gray-400 text-sm">
            © 2025 Flash Arbitrage Bot. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Auth Modals */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
      <UserProfileModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
      />
    </div>
  );
};
