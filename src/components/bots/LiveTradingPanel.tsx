import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, Pause, Square, Zap, Shield, AlertTriangle, TrendingUp, 
  Activity, Clock, DollarSign, Wallet, Settings, RefreshCw,
  CheckCircle, XCircle, Loader2, Radio, Power, Target
} from 'lucide-react';
import { useWeb3 } from '@/contexts/Web3Context';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { autoWebhookTrigger } from '@/lib/autoWebhookTrigger';
import { getContractAddresses } from '@/lib/web3/config';
import {
  type CanonicalExecutionPayload,
  executeArbitrageTrade,
  getLiveExecutionBlocker,
  normalizeOpportunityToTrade,
  supportsLiveExecution,
} from '@/lib/trading/executionService';

interface TradingState {
  mode: 'manual' | 'auto';
  status: 'idle' | 'scanning' | 'executing' | 'paused';
  executionMode: 'demo' | 'live';
  lastScan: Date | null;
  tradesExecuted: number;
  profitToday: number;
  gasSpentToday: number;
}

interface PendingTrade {
  id: string;
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  network: string;
  status?: 'active' | 'watchlist';
  distanceToExecutableUsd?: number;
  loanAmount: number;
  grossProfit: number;
  expectedProfit: number;
  gasCost: number;
  confidence: number;
  timestamp: number;
  executionPayload?: CanonicalExecutionPayload;
}

interface OpportunityLike {
  tokenPair?: string;
  token_pair?: string;
  buyDex?: string;
  buy_dex?: string;
  sellDex?: string;
  sell_dex?: string;
  network?: string;
  loanAmount?: number;
  loan_amount?: number;
  netProfit?: number;
  estimated_profit?: number;
  expectedProfit?: number;
  gasCost?: number;
  gas_cost?: number;
  confidenceScore?: number;
  confidence_score?: number;
  confidence?: number;
  executableLoanAmount?: number;
  confidenceTier?: 'high' | 'medium' | 'low';
  status?: 'active' | 'watchlist';
  distanceToExecutableUsd?: number;
  grossProfit?: number;
  spread?: string | number;
  executionPayload?: CanonicalExecutionPayload;
  execution_payload?: CanonicalExecutionPayload;
}

interface ParsedServerScanPayload {
  opportunities: OpportunityLike[];
  watchlist: OpportunityLike[];
  diagnostics?: Record<string, unknown>;
  watchlistCount?: number;
}

const parseServerScanPayload = (input: unknown): ParsedServerScanPayload | null => {
  if (!input || typeof input !== 'object') return null;

  const root = input as Record<string, unknown>;

  const candidates: Array<Record<string, unknown>> = [root];
  if (root.data && typeof root.data === 'object') {
    candidates.push(root.data as Record<string, unknown>);
  }
  if (root.result && typeof root.result === 'object') {
    candidates.push(root.result as Record<string, unknown>);
  }

  for (const candidate of candidates) {
    if (Array.isArray(candidate.opportunities)) {
      return {
        opportunities: candidate.opportunities as OpportunityLike[],
        watchlist: Array.isArray(candidate.watchlist) ? candidate.watchlist as OpportunityLike[] : [],
        diagnostics: candidate.diagnostics && typeof candidate.diagnostics === 'object'
          ? candidate.diagnostics as Record<string, unknown>
          : undefined,
        watchlistCount: Number(candidate.watchlistCount ?? candidate.watchlist_count ?? 0),
      };
    }
  }

  return null;
};

const DEMO_AUTO_MAX_DISTANCE_TO_EXECUTABLE_USD = 3;

const SETTINGS_STORAGE_KEY = 'live_trading_panel_settings_v2';

const loadPersistedSettings = (fallbackLoanAmount: number) => {
  const safeFallbackLoan = Number.isFinite(Number(fallbackLoanAmount)) && Number(fallbackLoanAmount) > 0
    ? Math.max(500, Math.min(25000, Number(fallbackLoanAmount)))
    : 3000;

  const defaults = {
    minProfit: 40,
    maxGas: 40,
    maxSlippage: 1.5,
    estimatedGasUsd: 8,
    maxLiquidityUsagePercent: 20,
    loanAmount: safeFallbackLoan,
    autoExecuteThreshold: 80,
    scanIntervalSeconds: 45,
    maxConcurrentTrades: 1,
    dailyLossLimit: 120,
    contractAddress: getContractAddresses().arbitrageContract,
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<typeof defaults>;
    return {
      ...defaults,
      ...parsed,
      loanAmount: Number.isFinite(Number(parsed.loanAmount)) ? Number(parsed.loanAmount) : defaults.loanAmount,
    };
  } catch {
    return defaults;
  }
};

export const LiveTradingPanel: React.FC = () => {
  const { account, wallet, services, connectWallet, connecting, walletAvailable } = useWeb3();
  const { strategySettings, updateStrategySettings } = useAppContext();
  const { toast } = useToast();
  
  const chainId = wallet?.chainId;
  const provider = wallet?.provider;
  
  const [tradingState, setTradingState] = useState<TradingState>({
    mode: 'manual',
    status: 'idle',
    executionMode: 'demo',
    lastScan: null,
    tradesExecuted: 0,
    profitToday: 0,
    gasSpentToday: 0
  });

  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([]);
  const [executingTradeId, setExecutingTradeId] = useState<string | null>(null);
  const [scanInterval, setScanInterval] = useState<NodeJS.Timeout | null>(null);
  const [continuousScanActive, setContinuousScanActive] = useState(false);
  const continuousScanRef = useRef<NodeJS.Timeout | null>(null);
  const previousLoanRef = useRef<number | null>(null);
  const loanChangeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [scanLog, setScanLog] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'warn' | 'error' }>>([]);

  const handleConnectWallet = useCallback(async () => {
    if (!walletAvailable) {
      window.open('https://metamask.io/download/', '_blank', 'noopener,noreferrer');
      return;
    }

    await connectWallet();
  }, [walletAvailable, connectWallet]);

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setScanLog(prev => [{ time, message, type }, ...prev].slice(0, 100));
  }, []);

  // Settings
  const PRESET_DEMO = { loanAmount: 600, minProfit: -1, maxSlippage: 7.0, estimatedGasUsd: 3, maxLiquidityUsagePercent: 35 };
  const PRESET_REALISTIC = { loanAmount: 5000, minProfit: 60, maxSlippage: 1.5, estimatedGasUsd: 10, maxLiquidityUsagePercent: 20, autoExecuteThreshold: 90 };
  const PRESET_FIRST_LIVE = {
    loanAmount: 10000,
    minProfit: 100,
    maxSlippage: 1.2,
    estimatedGasUsd: 12,
    maxLiquidityUsagePercent: 15,
    autoExecuteThreshold: 150,
  };

  const [settings, setSettings] = useState(() => loadPersistedSettings(strategySettings.loanSize || PRESET_DEMO.loanAmount));

  const setLoanAmount = useCallback((value: number) => {
    const normalizedValue = Math.max(100, Math.min(1000000, Number(value) || 100));
    setSettings((prev) => ({ ...prev, loanAmount: normalizedValue }));
    updateStrategySettings({ loanSize: normalizedValue });
  }, [updateStrategySettings]);

  const applyPreset = useCallback((preset: {
    loanAmount: number;
    minProfit: number;
    maxSlippage: number;
    estimatedGasUsd: number;
    maxLiquidityUsagePercent: number;
    autoExecuteThreshold?: number;
  }) => {
    setSettings((prev) => ({
      ...prev,
      loanAmount: preset.loanAmount,
      minProfit: preset.minProfit,
      maxSlippage: preset.maxSlippage,
      estimatedGasUsd: preset.estimatedGasUsd,
      maxLiquidityUsagePercent: preset.maxLiquidityUsagePercent,
      autoExecuteThreshold: preset.autoExecuteThreshold ?? prev.autoExecuteThreshold,
    }));
    updateStrategySettings({ loanSize: preset.loanAmount });
  }, [updateStrategySettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (previousLoanRef.current === null) {
      previousLoanRef.current = settings.loanAmount;
      return;
    }

    if (previousLoanRef.current === settings.loanAmount) return;

    if (loanChangeDebounceRef.current) {
      clearTimeout(loanChangeDebounceRef.current);
    }

    // Debounce slider/input churn so we only clear/log once per adjustment burst.
    loanChangeDebounceRef.current = setTimeout(() => {
      setPendingTrades([]);
      addLog(`⚙️ Loan size updated to $${settings.loanAmount.toLocaleString()}. Pending opportunities cleared; run a fresh scan.`, 'info');
      previousLoanRef.current = settings.loanAmount;
      loanChangeDebounceRef.current = null;
    }, 500);

    return () => {
      if (loanChangeDebounceRef.current) {
        clearTimeout(loanChangeDebounceRef.current);
      }
    };
  }, [settings.loanAmount, addLog]);

  useEffect(() => () => {
    if (loanChangeDebounceRef.current) {
      clearTimeout(loanChangeDebounceRef.current);
    }
  }, []);

  // Auto-scan logic
  const scanForOpportunities = useCallback(async () => {
    if (!account) {
      toast({
        title: 'Wallet Required',
        description: 'Connect your wallet before scanning for opportunities.',
        variant: 'destructive'
      });
      return;
    }

    setTradingState(prev => ({ ...prev, status: 'scanning', lastScan: new Date() }));
    addLog(
      `🔍 Starting scan: loan=$${settings.loanAmount.toLocaleString()} minProfit=$${settings.minProfit} slip=${settings.maxSlippage.toFixed(1)}% gas=$${settings.estimatedGasUsd} liqUse=${settings.maxLiquidityUsagePercent.toFixed(0)}%...`,
      'info',
    );

    try {
      let opportunities: OpportunityLike[] = [];
      let serverScanSucceeded = false;

      // 1) Try server-side scan (Edge Function)
      try {
        const scanNetworks = tradingState.executionMode === 'live'
          ? ['ethereum'] as const
          : ['ethereum', 'arbitrum', 'base', 'polygon'] as const;
        const perNetworkMinNetProfitUsd = {
          ethereum: settings.minProfit,
          arbitrum: settings.minProfit,
          base: settings.minProfit,
          polygon: settings.minProfit,
        };

        addLog('🌐 Invoking server scan (Edge Function)...', 'info');
        const payload = {
          networks: scanNetworks,
          loanAmountUsd: settings.loanAmount,
          minNetProfitUsd: settings.minProfit,
          perNetworkMinNetProfitUsd,
          minLiquidityUsd: 20000,
          minSpreadPercent: 0.01,
          maxResults: 25,
          maxSlippageBps: Math.max(1, Math.round(settings.maxSlippage * 100)),
          maxLiquidityUsagePercent: settings.maxLiquidityUsagePercent,
          estimatedGasUsd: settings.estimatedGasUsd,
        };

        let data: unknown = null;
        let error: unknown = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const response = await supabase.functions.invoke('scan-arbitrage-opportunities', { body: payload });
          data = response.data;
          error = response.error;

          if (!error) break;

          const message = error instanceof Error ? error.message : String(error);
          const isTransientNetworkError = /failed to fetch|fetch failed|network|connection closed|err_connection_closed/i.test(message);
          if (!isTransientNetworkError || attempt === 3) {
            throw error;
          }

          addLog(`🌐 Transient server connection issue (attempt ${attempt}/3). Retrying...`, 'warn');
          await new Promise((resolve) => setTimeout(resolve, attempt * 600));
        }

        if (error) throw error;
        const parsedServerPayload = parseServerScanPayload(data);
        if (parsedServerPayload) {
          const scanData = data as Record<string, unknown>;
          serverScanSucceeded = true;
          opportunities = parsedServerPayload.opportunities;
          const watchlist = parsedServerPayload.watchlist;

          if (opportunities.length > 0) {
            addLog(`✅ Server scan found ${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'}`, 'success');
          } else {
            const watchlistCount = watchlist.length > 0
              ? watchlist.length
              : Number(parsedServerPayload.watchlistCount ?? 0);
            addLog(
              `ℹ️ Server scan completed: 0 active spreads${watchlistCount > 0 ? `, ${watchlistCount} near-miss watchlist item${watchlistCount === 1 ? '' : 's'}` : ''}.`,
              'info',
            );

            if (tradingState.executionMode === 'demo' && watchlist.length > 0) {
              // Only promote near-miss items that are genuinely close to profitability (within $0.50)
              const promotable = watchlist.filter((item) => {
                const distanceToExecutableUsd = Number(item.distanceToExecutableUsd ?? Infinity);
                const netProfit = Number(item.netProfit ?? item.expectedProfit ?? item.estimated_profit ?? Number.NEGATIVE_INFINITY);
                // Very strict: only promote if net is already profitable OR extremely close to it (<$0.50 away)
                return netProfit > -0.50 && distanceToExecutableUsd <= 10;
              }).slice(0, 5);
              if (promotable.length > 0) {
                opportunities = promotable;
                addLog(
                  `🧪 Demo mode: promoted ${promotable.length} near-miss opportunit${promotable.length === 1 ? 'y' : 'ies'} for strategy testing.`,
                  'warn',
                );
              }
            }

            if (watchlist.length > 0) {
              const topWatch = watchlist[0];
              const watchNet = Number(topWatch.netProfit ?? 0);
              const watchDistance = Number(topWatch.distanceToExecutableUsd ?? 0);
              const watchLoan = Number(topWatch.executableLoanAmount ?? settings.loanAmount);
              addLog(
                `👀 Top near-miss: ${topWatch.tokenPair || 'Unknown'} | Net $${watchNet.toFixed(2)} | Need +$${Math.max(0, watchDistance).toFixed(2)} | ExecLoan $${Math.round(watchLoan).toLocaleString()}`,
                'info',
              );
            }

            const diagnostics = parsedServerPayload.diagnostics;
            if (diagnostics) {
              const samples = Array.isArray(diagnostics.rejectionSamples)
                ? diagnostics.rejectionSamples as Array<Record<string, unknown>>
                : [];
              const reasonPriority: Record<string, number> = {
                netProfit: 1,
                slippage: 2,
                executionRisk: 3,
                liquidity: 4,
                spread: 5,
                sameDex: 6,
                badQuotes: 7,
              };
              const topSample = [...samples].sort((a, b) => {
                const aReason = typeof a.reason === 'string' ? a.reason : 'badQuotes';
                const bReason = typeof b.reason === 'string' ? b.reason : 'badQuotes';
                return (reasonPriority[aReason] ?? 99) - (reasonPriority[bReason] ?? 99);
              })[0];
              const topReason = typeof topSample?.reason === 'string' ? topSample.reason : 'none';
              const topPair = typeof topSample?.tokenPair === 'string' && topSample.tokenPair.length > 0
                ? topSample.tokenPair
                : 'n/a';
              addLog(
                `📊 Diagnostics: keys=${Number(diagnostics.pairKeys ?? 0)} cand=${Number(diagnostics.candidates ?? 0)} feas=${Number(diagnostics.executionFeasible ?? 0)} pass=${Number(diagnostics.profitQualified ?? diagnostics.quoteValidated ?? 0)} slipDrop=${Number(diagnostics.droppedBySlippage ?? 0)} netDrop=${Number(diagnostics.droppedByNetProfit ?? 0)} riskDrop=${Number(diagnostics.droppedByExecutionRisk ?? 0)} topReject=${topReason} pair=${topPair}`,
                'info',
              );
            }
          }
        } else {
          const payloadShape = data && typeof data === 'object'
            ? Object.keys(data as Record<string, unknown>).slice(0, 8).join(', ')
            : typeof data;
          const serverError = data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)
            ? String((data as Record<string, unknown>).error)
            : null;
          if (serverError) {
            addLog(`⚠️ Server scan responded with error payload: ${serverError}. Falling back to local scan.`, 'warn');
          } else {
            addLog(`⚠️ Server scan returned an unsupported payload shape (${payloadShape || 'unknown'}); falling back to local scan.`, 'warn');
          }
        }
      } catch (edgeErr: unknown) {
        const message = edgeErr instanceof Error ? edgeErr.message : String(edgeErr);
        addLog(`⚠️ Server scan error: ${message}`, 'warn');
      }

      // 2) Fallback: local DexService scan (The Graph + RPC)
      if (opportunities.length === 0 && !serverScanSucceeded) {
        if (services?.dex) {
          try {
            addLog('📡 Querying The Graph locally for pool data...', 'info');
            const localOpps = await services.dex.scanOpportunities(['ethereum']);
            addLog(`✅ Local scan returned ${localOpps.length} opportunit${localOpps.length === 1 ? 'y' : 'ies'}`, localOpps.length > 0 ? 'success' : 'info');
            opportunities = localOpps;
          } catch (localErr: unknown) {
            const message = localErr instanceof Error ? localErr.message : String(localErr);
            addLog(`⚠️ Local scan error: ${message}`, 'error');
          }
        } else {
          addLog('⚠️ DexService not ready — wallet may not be connected', 'warn');
        }
      }

      // Process results
      if (opportunities.length > 0) {
        const candidateTrades: PendingTrade[] = opportunities.map((opp) => {
          const trade = normalizeOpportunityToTrade(opp, settings.loanAmount);
          const grossProfit = Number(opp.grossProfit ?? (trade.expectedProfit + trade.gasCost));
          const sourceStatus = opp.status === 'watchlist' ? 'watchlist' : 'active';
          const distanceToExecutableUsd = Number(opp.distanceToExecutableUsd ?? 0);
          return {
            ...trade,
            status: sourceStatus,
            distanceToExecutableUsd: Number.isFinite(distanceToExecutableUsd) ? Math.max(0, distanceToExecutableUsd) : 0,
            grossProfit: Number.isFinite(grossProfit) ? grossProfit : trade.expectedProfit + trade.gasCost,
            timestamp: Date.now(),
          };
        });

        const newTrades: PendingTrade[] = candidateTrades.filter((trade) => {
          const isDemoPromotedNearMiss = tradingState.executionMode === 'demo' && trade.status === 'watchlist';
          if (trade.expectedProfit < 0) return false;
          if (isDemoPromotedNearMiss) return trade.gasCost <= settings.maxGas;
          return trade.expectedProfit >= settings.minProfit && trade.gasCost <= settings.maxGas;
        });

        if (newTrades.length > 0) {
          autoWebhookTrigger.triggerAgentSuggestion(
            'Arbitrage Scout', 
            'Hot Opportunities Found', 
            `Found ${newTrades.length} executable spreads. Top: ${newTrades[0].tokenPair} ($${newTrades[0].expectedProfit.toFixed(2)})`
          );
        }

        for (const trade of newTrades) {
          const promotedTag = trade.status === 'watchlist' ? ' [DEMO NEAR-MISS]' : '';
          addLog(`💰 Opportunity${promotedTag}: ${trade.tokenPair || 'Unknown'} | ${trade.buyDex} → ${trade.sellDex} | ExecLoan: $${Math.round(trade.loanAmount).toLocaleString()} | Net: $${trade.expectedProfit.toFixed(2)}`, trade.status === 'watchlist' ? 'warn' : 'success');
        }

        if (candidateTrades.length > 0 && newTrades.length === 0) {
          const hasNegativeNetCandidates = candidateTrades.some((trade) => trade.expectedProfit < 0);
          addLog(
            hasNegativeNetCandidates
              ? 'ℹ️ Candidates were found, but all remaining paths are net-negative after costs and were excluded.'
              : 'ℹ️ Candidates were found but filtered out by current thresholds (min profit / max gas).',
            'info',
          );
        }

        setPendingTrades(prev => [...newTrades, ...prev].slice(0, 20));
        toast({
          title: newTrades.length > 0 ? '🎯 Opportunities Ready' : 'No Executable Candidates',
          description: newTrades.length > 0
            ? `Queued ${newTrades.length} trade${newTrades.length === 1 ? '' : 's'} for review/execution.`
            : 'Candidates found, but none passed your execution thresholds.',
        });

        if (tradingState.mode === 'auto') {
          const autoTrades = newTrades.filter((t) => {
            if (tradingState.executionMode === 'live' && !supportsLiveExecution(t.executionPayload?.network || t.network)) {
              return false;
            }
            const isDemoPromotedNearMiss = tradingState.executionMode === 'demo' && t.status === 'watchlist';
            if (isDemoPromotedNearMiss) {
              return (t.distanceToExecutableUsd ?? Infinity) <= DEMO_AUTO_MAX_DISTANCE_TO_EXECUTABLE_USD;
            }
            return t.expectedProfit >= settings.autoExecuteThreshold;
          });

          if (tradingState.executionMode === 'live') {
            const skippedForNetwork = newTrades.length - newTrades.filter((t) => supportsLiveExecution(t.executionPayload?.network || t.network)).length;
            if (skippedForNetwork > 0) {
              addLog(`🛡️ Live mode skipped ${skippedForNetwork} non-Ethereum opportunit${skippedForNetwork === 1 ? 'y' : 'ies'}.`, 'info');
            }
          }

          for (const trade of autoTrades.slice(0, settings.maxConcurrentTrades)) {
            await executeTrade(trade);
          }
        }
      } else {
        addLog('⏳ No profitable spreads found this cycle. Markets are tight.', 'info');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ Scan error: ${message}`, 'error');
      console.error('Scan failed:', error);
    } finally {
      setTradingState(prev => ({ ...prev, status: continuousScanActive ? 'scanning' : 'idle' }));
    }
  }, [account, settings, tradingState.mode, tradingState.executionMode, toast, services?.dex, continuousScanActive, addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Continuous scan: starts on trigger and runs forever until manually stopped
  const startContinuousScan = useCallback(() => {
    if (continuousScanRef.current) return; // already running
    setContinuousScanActive(true);
    setTradingState(prev => ({ ...prev, status: 'scanning' }));

    const runLoop = async () => {
      await scanForOpportunities();
      // Schedule next scan immediately after previous completes
      continuousScanRef.current = setTimeout(runLoop, settings.scanIntervalSeconds * 1000);
    };
    runLoop();

    toast({ title: '🔁 Continuous Scan Started', description: `Scanning every ${settings.scanIntervalSeconds}s until stopped.` });
  }, [scanForOpportunities, settings.scanIntervalSeconds, toast]);

  const stopContinuousScan = useCallback(() => {
    if (continuousScanRef.current) {
      clearTimeout(continuousScanRef.current);
      continuousScanRef.current = null;
    }
    setContinuousScanActive(false);
    setTradingState(prev => ({ ...prev, status: 'idle' }));
    toast({ title: '⏹ Scan Stopped', description: 'Continuous scanning has been halted.' });
  }, [toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (continuousScanRef.current) clearTimeout(continuousScanRef.current);
    };
  }, []);

  // Legacy auto-scan (for auto mode + isLive)
  useEffect(() => {
    if (tradingState.mode === 'auto' && tradingState.status !== 'paused' && !continuousScanActive) {
      startContinuousScan();
    }
  }, [tradingState.mode, tradingState.executionMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const executeTrade = async (trade: PendingTrade) => {
    setExecutingTradeId(trade.id);
    setTradingState(prev => ({ ...prev, status: 'executing' }));

    try {
      const result = await executeArbitrageTrade({
        trade,
        mode: tradingState.executionMode,
        account,
        contractAddress: settings.contractAddress,
        maxSlippagePercent: settings.maxSlippage,
      });

      // Update state
      setTradingState(prev => ({
        ...prev,
        tradesExecuted: prev.tradesExecuted + 1,
        profitToday: prev.profitToday + result.actualProfit,
        gasSpentToday: prev.gasSpentToday + trade.gasCost,
        status: tradingState.mode === 'auto' ? 'scanning' : 'idle'
      }));

      // Remove from pending
      setPendingTrades(prev => prev.filter(t => t.id !== trade.id));

      addLog(
        `${tradingState.executionMode === 'live' ? '🚀' : '🧪'} ${tradingState.executionMode === 'live' ? 'Live' : 'Demo'} execution: ${trade.tokenPair} | net=$${result.actualProfit.toFixed(2)} | ref=${result.txHash.slice(0, 18)}...`,
        'success',
      );

      toast({
        title: tradingState.executionMode === 'live' ? 'Live Trade Submitted' : 'Demo Trade Executed',
        description: `Net: $${result.actualProfit.toFixed(2)} | Ref: ${result.txHash.slice(0, 10)}...`
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      addLog(`❌ Execution failed for ${trade.tokenPair}: ${message}`, 'error');
      toast({
        title: 'Execution Failed',
        description: message,
        variant: 'destructive'
      });
      setTradingState(prev => ({ ...prev, status: tradingState.mode === 'auto' ? 'scanning' : 'idle' }));
    } finally {
      setExecutingTradeId(null);
    }
  };

  const setExecutionMode = (mode: 'demo' | 'live') => {
    if (mode === 'live' && !account) {
      toast({
        title: 'Wallet Required',
        description: 'Connect your wallet (top-right or from this panel) to enable live trading',
        variant: 'destructive'
      });
      return;
    }

    setTradingState(prev => ({ 
      ...prev, 
      executionMode: mode,
      status: prev.mode === 'auto' ? 'scanning' : 'idle'
    }));

    if (mode === 'live') {
      const blocker = getLiveExecutionBlocker({ network: 'ethereum' }, account, settings.contractAddress);
      if (blocker && blocker.includes('Configure your arbitrage contract address')) {
        toast({
          title: 'Live Mode Armed',
          description: 'Wallet is connected. Add your arbitrage contract address to submit live trades.',
        });
        return;
      }
    }

    toast({
      title: mode === 'live' ? 'Live Mode Enabled' : 'Demo Mode Enabled',
      description: mode === 'live'
        ? 'Live execution is armed. Supported trades will be submitted with real funds.'
        : 'Using real market data with simulated execution.'
    });
  };

  const toggleMode = (mode: 'manual' | 'auto') => {
    setTradingState(prev => ({ 
      ...prev, 
      mode,
      status: mode === 'auto' ? 'scanning' : 'idle'
    }));
  };

  const togglePause = () => {
    setTradingState(prev => ({
      ...prev,
      status: prev.status === 'paused' ? (prev.mode === 'auto' ? 'scanning' : 'idle') : 'paused'
    }));
  };

  return (
    <div className="space-y-6">
      {/* Live Trading Status Bar */}
      <Card className={`border-2 transition-all ${tradingState.executionMode === 'live' ? 'bg-gradient-to-r from-red-900/30 to-gray-800 border-red-500' : 'bg-gradient-to-r from-blue-900/30 to-gray-800 border-blue-500'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${tradingState.executionMode === 'live' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                <Power className={`h-6 w-6 ${tradingState.executionMode === 'live' ? 'text-red-400' : 'text-blue-400'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-lg">
                    {tradingState.executionMode === 'live' ? 'LIVE EXECUTION MODE' : 'DEMO EXECUTION MODE'}
                  </h3>
                  {tradingState.executionMode === 'live' ? (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                  ) : (
                    <Badge className="bg-blue-500/20 text-blue-300 border border-blue-400/30">Real data, simulated fills</Badge>
                  )}
                </div>
                <p className="text-gray-400 text-sm">
                  {tradingState.executionMode === 'live'
                    ? 'Real transactions will be executed with your connected wallet when the route is supported'
                    : 'Scanner uses live market data, but executions are recorded in demo mode'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right mr-4">
                <p className="text-gray-400 text-sm">Connected Wallet</p>
                <p className="text-white font-mono">
                  {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Not Connected'}
                </p>
              </div>
              {!account && (
                <Button
                  onClick={() => void handleConnectWallet()}
                  disabled={connecting}
                  className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-semibold"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4 mr-2" />
                      Connect Wallet
                    </>
                  )}
                </Button>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 p-1">
                <button
                  onClick={() => setExecutionMode('demo')}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    tradingState.executionMode === 'demo'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Demo
                </button>
                <button
                  onClick={() => setExecutionMode('live')}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    tradingState.executionMode === 'live'
                      ? 'bg-red-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Live
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warning Banner for Live Mode */}
      {tradingState.executionMode === 'live' && (
        <Alert className="bg-yellow-900/30 border-yellow-500/50">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <AlertDescription className="text-yellow-200">
            <strong>Live Trading Warning:</strong> Real funds will be used. Ensure you understand the risks. 
            Current live executor is wired for Ethereum routes; Base and Arbitrum opportunities remain executable in demo mode until network-specific live routes are configured.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Trading Mode Selection */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="h-5 w-5 text-[#00F0FF]" />
              Trading Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleMode('manual')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  tradingState.mode === 'manual'
                    ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <Wallet className="h-6 w-6 mx-auto mb-2" />
                <p className="font-semibold">Manual</p>
                <p className="text-xs opacity-70">Review & execute</p>
              </button>
              <button
                onClick={() => toggleMode('auto')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  tradingState.mode === 'auto'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <Zap className="h-6 w-6 mx-auto mb-2" />
                <p className="font-semibold">Auto 24/7</p>
                <p className="text-xs opacity-70">Fully automated</p>
              </button>
            </div>

            <div className="pt-4 border-t border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Status</span>
                <Badge className={`${
                  continuousScanActive ? 'bg-blue-500 animate-pulse' :
                  tradingState.status === 'executing' ? 'bg-green-500' :
                  tradingState.status === 'paused' ? 'bg-yellow-500' :
                  'bg-gray-600'
                }`}>
                  {continuousScanActive ? '⟳ SCANNING' : tradingState.status.toUpperCase()}
                </Badge>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-gray-400 text-sm">Loan Size</Label>
                  <span className="text-[#00F0FF] font-semibold text-sm">
                    ${settings.loanAmount.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={1000000}
                  step={100}
                  value={settings.loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                  className="w-full accent-[#00F0FF]"
                  aria-label="Loan size"
                />
              </div>

              {/* Primary: Start/Stop Continuous Scan */}
              {!continuousScanActive ? (
                <Button
                  onClick={startContinuousScan}
                  className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-bold"
                >
                  <Play className="h-4 w-4 mr-2" /> Start Scanner
                </Button>
              ) : (
                <Button
                  onClick={stopContinuousScan}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  <Square className="h-4 w-4 mr-2" /> Stop Scanner
                </Button>
              )}

              {/* Secondary: Single scan or pause controls */}
              {tradingState.mode === 'auto' && (
                <Button
                  onClick={togglePause}
                  variant="outline"
                  className="w-full border-gray-600"
                >
                  {tradingState.status === 'paused' ? (
                    <><Play className="h-4 w-4 mr-2" /> Resume Auto</>
                  ) : (
                    <><Pause className="h-4 w-4 mr-2" /> Pause Auto</>
                  )}
                </Button>
              )}
              {tradingState.mode === 'manual' && (
                <Button
                  onClick={scanForOpportunities}
                  variant="outline"
                  className="w-full border-gray-600 text-gray-300"
                  disabled={tradingState.status === 'scanning'}
                >
                  {tradingState.status === 'scanning' ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Single Scan</>
                  )}
                </Button>
              )}

              {continuousScanActive && (
                <p className="text-xs text-blue-400 text-center animate-pulse">
                  🔁 Scanning every {settings.scanIntervalSeconds}s — running continuously
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today's Performance */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Today's Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Trades</p>
                <p className="text-2xl font-bold text-white">{tradingState.tradesExecuted}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Net Profit</p>
                <p className="text-2xl font-bold text-green-400">
                  ${tradingState.profitToday.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Gas Spent</p>
                <p className="text-2xl font-bold text-orange-400">
                  ${tradingState.gasSpentToday.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Gross Before Gas</p>
                <p className={`text-2xl font-bold ${(tradingState.profitToday + tradingState.gasSpentToday) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${(tradingState.profitToday + tradingState.gasSpentToday).toFixed(2)}
                </p>
              </div>
            </div>
            
            {tradingState.lastScan && (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Clock className="h-4 w-4" />
                Last scan: {tradingState.lastScan.toLocaleTimeString()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Settings */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-400" />
              Quick Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scan presets */}
            <div className="flex gap-2">
              <button
                onClick={() => applyPreset(PRESET_DEMO)}
                className="flex-1 rounded px-3 py-1.5 text-xs font-semibold border border-yellow-500/60 text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                title="Permissive settings — shows activity in any market"
              >
                Practice Preset
              </button>
              <button
                onClick={() => applyPreset(PRESET_REALISTIC)}
                className="flex-1 rounded px-3 py-1.5 text-xs font-semibold border border-green-500/60 text-green-400 hover:bg-green-500/10 transition-colors"
                title="Real-world profitable thresholds"
              >
                Live Preset
              </button>
            </div>
            <button
              onClick={() => applyPreset(PRESET_FIRST_LIVE)}
              className="w-full rounded px-3 py-2 text-xs font-bold border border-red-500/70 text-red-300 hover:bg-red-500/10 transition-colors"
              title="First live trade profile: conservative 10k sizing, 1.2% max slippage, and tighter liquidity usage"
            >
              First Live (Conservative $100+ Net)
            </button>
            <div>
              <Label className="text-gray-400 text-sm">Min Profit ($)</Label>
              <Input
                type="number"
                value={settings.minProfit}
                onChange={(e) => setSettings(s => ({ ...s, minProfit: +e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Est. Gas / Tx ($)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={settings.estimatedGasUsd}
                onChange={(e) => setSettings(s => ({ ...s, estimatedGasUsd: +e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Max Liquidity Usage (%)</Label>
              <Input
                type="number"
                min={1}
                max={95}
                step={1}
                value={settings.maxLiquidityUsagePercent}
                onChange={(e) => {
                  const value = Math.max(1, Math.min(95, Number(e.target.value) || 1));
                  setSettings(s => ({ ...s, maxLiquidityUsagePercent: value }));
                }}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Max Gas ($)</Label>
              <Input
                type="number"
                value={settings.maxGas}
                onChange={(e) => setSettings(s => ({ ...s, maxGas: +e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Loan Amount ($)</Label>
              <Input
                type="number"
                min={100}
                max={1000000}
                step={100}
                value={settings.loanAmount}
                onChange={(e) => setLoanAmount(Number(e.target.value))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Auto-Execute Threshold ($)</Label>
              <Input
                type="number"
                value={settings.autoExecuteThreshold}
                onChange={(e) => setSettings(s => ({ ...s, autoExecuteThreshold: +e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1"
                disabled={tradingState.mode === 'manual'}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Contract Address</Label>
              <Input
                placeholder="0x..."
                value={settings.contractAddress}
                onChange={(e) => setSettings(s => ({ ...s, contractAddress: e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white mt-1 font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Trades */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#00F0FF]" />
              Pending Opportunities ({pendingTrades.length})
            </CardTitle>
            <Button
              onClick={() => setPendingTrades([])}
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
            >
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pendingTrades.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No pending opportunities</p>
              <p className="text-sm">Scan for new arbitrage opportunities</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{trade.tokenPair}</span>
                          {trade.status === 'watchlist' && (
                            <Badge variant="outline" className="text-xs border-yellow-500/60 text-yellow-300">
                              demo near-miss
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs capitalize">
                            {trade.network}
                          </Badge>
                        </div>
                        <p className="text-gray-400 text-sm">
                          {trade.buyDex} → {trade.sellDex}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`font-bold ${trade.expectedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>Net ${trade.expectedProfit.toFixed(2)}</p>
                        <p className="text-gray-500 text-sm">Gross ${trade.grossProfit.toFixed(2)} | Gas ${trade.gasCost.toFixed(2)}</p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-gray-400 text-sm">Confidence</p>
                        <p className={`font-bold ${trade.confidence >= 80 ? 'text-green-400' : trade.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {trade.confidence}%
                        </p>
                      </div>

                      {tradingState.mode === 'manual' && (
                        <Button
                          onClick={() => executeTrade(trade)}
                          disabled={executingTradeId === trade.id}
                          className="bg-green-500 hover:bg-green-600 text-white"
                        >
                          {executingTradeId === trade.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <><Zap className="h-4 w-4 mr-1" /> {tradingState.executionMode === 'live' ? 'Execute Live' : 'Execute Demo'}</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scanner Output Log */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-[#00F0FF]" />
              Scanner Output Log
              {continuousScanActive && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
            </CardTitle>
            <button onClick={() => setScanLog([])} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded border border-gray-700">
              Clear
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-black rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs space-y-1">
            {scanLog.length === 0 ? (
              <p className="text-gray-600">Waiting for scan to start...</p>
            ) : (
              scanLog.map((entry, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-600 shrink-0">{entry.time}</span>
                  <span className={
                    entry.type === 'success' ? 'text-green-400' :
                    entry.type === 'error'   ? 'text-red-400' :
                    entry.type === 'warn'    ? 'text-yellow-400' :
                    'text-gray-300'
                  }>{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
