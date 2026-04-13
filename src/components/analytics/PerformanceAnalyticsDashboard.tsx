import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EquityCurveChart } from './EquityCurveChart';
import { TradeAnalysisTable } from './TradeAnalysisTable';
import { RiskAdjustedMetrics } from './RiskAdjustedMetrics';
import { DrawdownAnalysis } from './DrawdownAnalysis';
import { StreakAnalysis } from './StreakAnalysis';
import { StrategyComparison } from './StrategyComparison';
import { AnalyticsService } from '@/lib/analyticsService';
import { TradeRecord, StrategyPerformance, BenchmarkData } from '@/types/analytics';
import { LineChart, Table, Shield, TrendingDown, Flame, BarChart2, RefreshCw } from 'lucide-react';

const generateMockTrades = (): TradeRecord[] => {
  const pairs = ['ETH/USDT', 'BTC/USDT', 'ARB/ETH', 'MATIC/USDT', 'LINK/ETH'];
  const strategies = ['Conservative', 'Aggressive', 'Balanced'];
  return Array.from({ length: 100 }, (_, i) => {
    const profit = (Math.random() - 0.4) * 200;
    const status = profit > 5 ? 'win' : profit < -5 ? 'loss' : 'breakeven';
    return {
      id: `trade-${i}`,
      timestamp: new Date(Date.now() - (100 - i) * 3600000 * 4),
      strategyId: `strat-${i % 3}`,
      strategyName: strategies[i % 3],
      tokenPair: pairs[i % pairs.length],
      entryPrice: 1800 + Math.random() * 200,
      exitPrice: 1800 + Math.random() * 200,
      amount: 1000 + Math.random() * 4000,
      profit,
      profitPercent: profit / 50,
      gasCost: 5 + Math.random() * 15,
      netProfit: profit - (5 + Math.random() * 15),
      duration: Math.floor(2 + Math.random() * 10),
      network: ['ethereum', 'arbitrum', 'polygon'][i % 3],
      status: status as 'win' | 'loss' | 'breakeven',
    };
  });
};

const generateBenchmarks = (): BenchmarkData[] => [
  { name: 'ETH', returns: [], timestamps: [], totalReturn: 45.2, volatility: 68.5, sharpeRatio: 0.85 },
  { name: 'BTC', returns: [], timestamps: [], totalReturn: 38.7, volatility: 52.3, sharpeRatio: 0.92 },
  { name: 'S&P 500', returns: [], timestamps: [], totalReturn: 12.4, volatility: 18.2, sharpeRatio: 0.68 },
];

export const PerformanceAnalyticsDashboard: React.FC = () => {
  const [trades, setTrades] = useState<TradeRecord[]>(generateMockTrades);
  const [initialCapital] = useState(10000);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const equityCurve = useMemo(() => AnalyticsService.calculateEquityCurve(trades, initialCapital), [trades, initialCapital]);
  const drawdowns = useMemo(() => AnalyticsService.calculateDrawdowns(equityCurve), [equityCurve]);
  const streaks = useMemo(() => AnalyticsService.calculateStreaks(trades), [trades]);
  const riskMetrics = useMemo(() => {
    const metrics = AnalyticsService.calculateRiskMetrics(trades);
    metrics.maxDrawdown = Math.max(...equityCurve.map(e => e.drawdownPercent));
    metrics.avgDrawdown = equityCurve.reduce((a, b) => a + b.drawdownPercent, 0) / equityCurve.length;
    return metrics;
  }, [trades, equityCurve]);

  const currentStreak = useMemo(() => {
    const sorted = [...trades].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (sorted.length === 0) return null;
    const type = sorted[0].status === 'win' ? 'win' : 'loss';
    let count = 0;
    for (const t of sorted) {
      if ((t.status === 'win' ? 'win' : 'loss') === type) count++;
      else break;
    }
    return { type, count };
  }, [trades]);

  const strategies: StrategyPerformance[] = useMemo(() => {
    const groups: { [key: string]: TradeRecord[] } = {};
    trades.forEach(t => { if (!groups[t.strategyId]) groups[t.strategyId] = []; groups[t.strategyId].push(t); });
    return Object.entries(groups).map(([id, tds]) => ({
      strategyId: id, strategyName: tds[0].strategyName, totalTrades: tds.length,
      winRate: tds.filter(t => t.status === 'win').length / tds.length * 100,
      totalProfit: tds.reduce((a, b) => a + b.netProfit, 0) / initialCapital * 100,
      avgProfit: tds.filter(t => t.netProfit > 0).reduce((a, b) => a + b.netProfit, 0) / tds.filter(t => t.netProfit > 0).length || 0,
      avgLoss: Math.abs(tds.filter(t => t.netProfit < 0).reduce((a, b) => a + b.netProfit, 0) / tds.filter(t => t.netProfit < 0).length) || 0,
      profitFactor: 1.5, expectancy: 25, riskMetrics, equityCurve: [], drawdowns: [], streaks: [], trades: tds,
    }));
  }, [trades, riskMetrics, initialCapital]);

  const refresh = () => { setIsRefreshing(true); setTimeout(() => { setTrades(generateMockTrades()); setIsRefreshing(false); }, 1000); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Performance Analytics</h2>
          <p className="text-gray-400">Comprehensive strategy performance analysis</p>
        </div>
        <button onClick={refresh} disabled={isRefreshing} className="flex items-center gap-2 px-4 py-2 bg-[#00F0FF] text-gray-900 rounded-lg font-medium hover:bg-[#00D0E0] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="overview"><LineChart className="h-4 w-4 mr-2" />Overview</TabsTrigger>
          <TabsTrigger value="trades"><Table className="h-4 w-4 mr-2" />Trades</TabsTrigger>
          <TabsTrigger value="risk"><Shield className="h-4 w-4 mr-2" />Risk</TabsTrigger>
          <TabsTrigger value="drawdown"><TrendingDown className="h-4 w-4 mr-2" />Drawdown</TabsTrigger>
          <TabsTrigger value="streaks"><Flame className="h-4 w-4 mr-2" />Streaks</TabsTrigger>
          <TabsTrigger value="compare"><BarChart2 className="h-4 w-4 mr-2" />Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><EquityCurveChart data={equityCurve} initialCapital={initialCapital} /></TabsContent>
        <TabsContent value="trades"><TradeAnalysisTable trades={trades} /></TabsContent>
        <TabsContent value="risk"><RiskAdjustedMetrics metrics={riskMetrics} /></TabsContent>
        <TabsContent value="drawdown"><DrawdownAnalysis drawdowns={drawdowns} maxDrawdown={riskMetrics.maxDrawdown} avgDrawdown={riskMetrics.avgDrawdown} /></TabsContent>
        <TabsContent value="streaks"><StreakAnalysis streaks={streaks} currentStreak={currentStreak} /></TabsContent>
        <TabsContent value="compare"><StrategyComparison strategies={strategies} benchmarks={generateBenchmarks()} /></TabsContent>
      </Tabs>
    </div>
  );
};
