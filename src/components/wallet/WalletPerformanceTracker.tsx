import React, { useState, useEffect } from 'react';
import { useMultiWallet } from '@/contexts/MultiWalletContext';
import { ConnectedWallet } from '@/types/multiWallet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Wallet,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Target,
} from 'lucide-react';

interface WalletPerformance {
  walletId: string;
  walletName: string;
  totalPnL: number;
  totalPnLPercentage: number;
  tradesExecuted: number;
  winRate: number;
  avgTradeSize: number;
  bestTrade: number;
  worstTrade: number;
  dailyPnL: { date: string; pnl: number; balance: number }[];
  strategyBreakdown: { strategy: string; pnl: number; trades: number }[];
}

interface WalletPerformanceTrackerProps {
  className?: string;
}

export const WalletPerformanceTracker: React.FC<WalletPerformanceTrackerProps> = ({
  className = '',
}) => {
  const { wallets, activeWallet, portfolio } = useMultiWallet();
  const [selectedWalletId, setSelectedWalletId] = useState<string | 'all'>('all');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [performanceData, setPerformanceData] = useState<Map<string, WalletPerformance>>(new Map());

  // Generate mock performance data for wallets
  useEffect(() => {
    const generatePerformanceData = (wallet: ConnectedWallet): WalletPerformance => {
      const seed = wallet.id.charCodeAt(wallet.id.length - 1);
      const baseMultiplier = (seed % 10) / 10;
      
      // Generate daily PnL data
      const days = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const dailyPnL = [];
      let runningBalance = wallet.balanceUSD * 0.8;
      
      for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dailyChange = (Math.random() - 0.45) * runningBalance * 0.05;
        runningBalance += dailyChange;
        dailyPnL.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          pnl: dailyChange,
          balance: runningBalance,
        });
      }

      const totalPnL = runningBalance - wallet.balanceUSD * 0.8;
      const tradesExecuted = Math.floor(50 + seed * 10);
      const winRate = 45 + (seed % 30);

      return {
        walletId: wallet.id,
        walletName: wallet.name,
        totalPnL,
        totalPnLPercentage: (totalPnL / (wallet.balanceUSD * 0.8)) * 100,
        tradesExecuted,
        winRate,
        avgTradeSize: wallet.balanceUSD * 0.02,
        bestTrade: wallet.balanceUSD * 0.1 * baseMultiplier,
        worstTrade: -wallet.balanceUSD * 0.05 * baseMultiplier,
        dailyPnL,
        strategyBreakdown: [
          { strategy: 'DEX Arbitrage', pnl: totalPnL * 0.4, trades: Math.floor(tradesExecuted * 0.35) },
          { strategy: 'Flash Loans', pnl: totalPnL * 0.3, trades: Math.floor(tradesExecuted * 0.25) },
          { strategy: 'Cross-Chain', pnl: totalPnL * 0.2, trades: Math.floor(tradesExecuted * 0.25) },
          { strategy: 'MEV Protection', pnl: totalPnL * 0.1, trades: Math.floor(tradesExecuted * 0.15) },
        ],
      };
    };

    const newData = new Map<string, WalletPerformance>();
    wallets.forEach(wallet => {
      newData.set(wallet.id, generatePerformanceData(wallet));
    });
    setPerformanceData(newData);
  }, [wallets, timeRange]);

  // Calculate aggregate performance
  const aggregatePerformance = React.useMemo(() => {
    if (performanceData.size === 0) return null;

    let totalPnL = 0;
    let totalTrades = 0;
    let totalWins = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;
    const strategyTotals = new Map<string, { pnl: number; trades: number }>();

    performanceData.forEach(perf => {
      totalPnL += perf.totalPnL;
      totalTrades += perf.tradesExecuted;
      totalWins += Math.floor(perf.tradesExecuted * (perf.winRate / 100));
      bestTrade = Math.max(bestTrade, perf.bestTrade);
      worstTrade = Math.min(worstTrade, perf.worstTrade);

      perf.strategyBreakdown.forEach(strat => {
        const existing = strategyTotals.get(strat.strategy) || { pnl: 0, trades: 0 };
        strategyTotals.set(strat.strategy, {
          pnl: existing.pnl + strat.pnl,
          trades: existing.trades + strat.trades,
        });
      });
    });

    return {
      totalPnL,
      totalPnLPercentage: portfolio ? (totalPnL / portfolio.totalBalanceUSD) * 100 : 0,
      totalTrades,
      winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
      bestTrade,
      worstTrade,
      strategyBreakdown: Array.from(strategyTotals.entries()).map(([strategy, data]) => ({
        strategy,
        ...data,
      })),
    };
  }, [performanceData, portfolio]);

  const selectedPerformance = selectedWalletId === 'all' 
    ? null 
    : performanceData.get(selectedWalletId);

  const displayPerformance = selectedWalletId === 'all' ? aggregatePerformance : selectedPerformance;

  // Combine daily PnL for aggregate view
  const chartData = React.useMemo(() => {
    if (selectedWalletId !== 'all' && selectedPerformance) {
      return selectedPerformance.dailyPnL;
    }

    // Aggregate all wallet data
    const aggregated = new Map<string, { pnl: number; balance: number }>();
    performanceData.forEach(perf => {
      perf.dailyPnL.forEach(day => {
        const existing = aggregated.get(day.date) || { pnl: 0, balance: 0 };
        aggregated.set(day.date, {
          pnl: existing.pnl + day.pnl,
          balance: existing.balance + day.balance,
        });
      });
    });

    return Array.from(aggregated.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }, [selectedWalletId, selectedPerformance, performanceData]);

  const COLORS = ['#00F0FF', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];

  if (wallets.length === 0) {
    return (
      <Card className={`bg-gray-800 border-gray-700 ${className}`}>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-16 w-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-xl font-semibold text-white mb-2">No Performance Data</h3>
          <p className="text-gray-400">Connect wallets to track their performance</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-[#00F0FF]" />
            Wallet Performance
          </h2>
          <p className="text-gray-400 mt-1">Track individual and aggregate wallet performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedWalletId} onValueChange={(v) => setSelectedWalletId(v as string)}>
            <SelectTrigger className="w-[180px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Select wallet" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all" className="text-white hover:bg-gray-700">
                All Wallets
              </SelectItem>
              {wallets.map(wallet => (
                <SelectItem key={wallet.id} value={wallet.id} className="text-white hover:bg-gray-700">
                  {wallet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as '24h' | '7d' | '30d' | 'all')}>
            <SelectTrigger className="w-[120px] bg-gray-700 border-gray-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="24h" className="text-white hover:bg-gray-700">24 Hours</SelectItem>
              <SelectItem value="7d" className="text-white hover:bg-gray-700">7 Days</SelectItem>
              <SelectItem value="30d" className="text-white hover:bg-gray-700">30 Days</SelectItem>
              <SelectItem value="all" className="text-white hover:bg-gray-700">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Performance Summary Cards */}
      {displayPerformance && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <DollarSign className="h-4 w-4" />
                Total P&L
              </div>
              <div className={`text-2xl font-bold ${displayPerformance.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {displayPerformance.totalPnL >= 0 ? '+' : ''}
                ${Math.abs(displayPerformance.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className={`text-sm flex items-center gap-1 ${displayPerformance.totalPnLPercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {displayPerformance.totalPnLPercentage >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {displayPerformance.totalPnLPercentage.toFixed(2)}%
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Activity className="h-4 w-4" />
                Trades
              </div>
              <div className="text-2xl font-bold text-white">
                {selectedWalletId === 'all' 
                  ? aggregatePerformance?.totalTrades 
                  : selectedPerformance?.tradesExecuted}
              </div>
              <div className="text-sm text-gray-500">
                {timeRange === '24h' ? 'Today' : timeRange === '7d' ? 'This week' : timeRange === '30d' ? 'This month' : 'All time'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Target className="h-4 w-4" />
                Win Rate
              </div>
              <div className="text-2xl font-bold text-[#00F0FF]">
                {(selectedWalletId === 'all' 
                  ? aggregatePerformance?.winRate 
                  : selectedPerformance?.winRate)?.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500">
                Success rate
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <TrendingUp className="h-4 w-4 text-green-400" />
                Best Trade
              </div>
              <div className="text-2xl font-bold text-green-400">
                +${(selectedWalletId === 'all' 
                  ? aggregatePerformance?.bestTrade 
                  : selectedPerformance?.bestTrade)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <TrendingDown className="h-4 w-4 text-red-400" />
                Worst Trade
              </div>
              <div className="text-2xl font-bold text-red-400">
                ${(selectedWalletId === 'all' 
                  ? aggregatePerformance?.worstTrade 
                  : selectedPerformance?.worstTrade)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Wallet className="h-4 w-4" />
                Wallets
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {selectedWalletId === 'all' ? wallets.length : 1}
              </div>
              <div className="text-sm text-gray-500">
                {selectedWalletId === 'all' ? 'Tracking' : 'Selected'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Balance/PnL Chart */}
        <Card className="bg-gray-800 border-gray-700 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#00F0FF]" />
              Balance History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00F0FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
                  <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#9CA3AF' }}
                    formatter={(value: number) => [`$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 'Balance']}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#00F0FF"
                    strokeWidth={2}
                    fill="url(#balanceGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Strategy Breakdown */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-purple-400" />
              Strategy Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={displayPerformance?.strategyBreakdown || []}
                    dataKey="pnl"
                    nameKey="strategy"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {(displayPerformance?.strategyBreakdown || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 'P&L']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {(displayPerformance?.strategyBreakdown || []).map((strat, index) => (
                <div key={strat.strategy} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-gray-300 text-sm">{strat.strategy}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-medium ${strat.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {strat.pnl >= 0 ? '+' : ''}${strat.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-gray-500 text-xs ml-2">({strat.trades} trades)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Individual Wallet Performance Table */}
      {selectedWalletId === 'all' && wallets.length > 1 && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#00F0FF]" />
              Individual Wallet Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Wallet</th>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Balance</th>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">P&L</th>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Trades</th>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Win Rate</th>
                    <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Best Trade</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map(wallet => {
                    const perf = performanceData.get(wallet.id);
                    return (
                      <tr key={wallet.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded bg-gray-700">
                              <Wallet className="h-4 w-4 text-[#00F0FF]" />
                            </div>
                            <div>
                              <div className="text-white font-medium">{wallet.name}</div>
                              <div className="text-gray-500 text-xs font-mono">
                                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="text-white font-medium">
                            ${wallet.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className={`font-medium ${(perf?.totalPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(perf?.totalPnL || 0) >= 0 ? '+' : ''}
                            ${Math.abs(perf?.totalPnL || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                          <div className={`text-xs ${(perf?.totalPnLPercentage || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(perf?.totalPnLPercentage || 0) >= 0 ? '+' : ''}{(perf?.totalPnLPercentage || 0).toFixed(2)}%
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-white">
                          {perf?.tradesExecuted || 0}
                        </td>
                        <td className="text-right py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`${
                              (perf?.winRate || 0) >= 60
                                ? 'border-green-500 text-green-400'
                                : (perf?.winRate || 0) >= 50
                                ? 'border-yellow-500 text-yellow-400'
                                : 'border-red-500 text-red-400'
                            }`}
                          >
                            {(perf?.winRate || 0).toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="text-right py-3 px-4 text-green-400">
                          +${(perf?.bestTrade || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
