import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, BarChart2 } from 'lucide-react';

type TxStatus = 'success' | 'failed';

interface PerformanceTx {
  timestamp: number;
  status: TxStatus;
  netProfit: number;
  gasCost: number;
}

interface AdvancedPerformanceProps {
  transactions: PerformanceTx[];
}

const getBarHeightClass = (heightPct: number): string => {
  if (heightPct >= 95) return 'h-[95%]';
  if (heightPct >= 85) return 'h-[85%]';
  if (heightPct >= 75) return 'h-[75%]';
  if (heightPct >= 65) return 'h-[65%]';
  if (heightPct >= 55) return 'h-[55%]';
  if (heightPct >= 45) return 'h-[45%]';
  if (heightPct >= 35) return 'h-[35%]';
  if (heightPct >= 25) return 'h-[25%]';
  if (heightPct >= 15) return 'h-[15%]';
  return 'h-[5%]';
};

export const AdvancedPerformance: React.FC<AdvancedPerformanceProps> = ({ transactions }) => {
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  const filterByTimeframe = (txs: PerformanceTx[]) => {
    const now = Date.now();
    const ranges = { '24h': 86400000, '7d': 604800000, '30d': 2592000000, 'all': Infinity };
    return txs.filter(tx => now - tx.timestamp < ranges[timeframe]);
  };

  const filtered = filterByTimeframe(transactions);
  const successful = filtered.filter(tx => tx.status === 'success');
  const failed = filtered.filter(tx => tx.status === 'failed');

  const totalProfit = successful.reduce((sum, tx) => sum + tx.netProfit, 0);
  const totalGas = filtered.reduce((sum, tx) => sum + tx.gasCost, 0);
  const avgProfit = successful.length ? totalProfit / successful.length : 0;
  const winRate = filtered.length ? (successful.length / filtered.length) * 100 : 0;

  // Calculate streaks
  let currentStreak = 0, maxWinStreak = 0, maxLoseStreak = 0, tempStreak = 0;
  for (const tx of filtered.sort((a, b) => b.timestamp - a.timestamp)) {
    if (tx.status === 'success') {
      if (tempStreak >= 0) tempStreak++;
      else { maxLoseStreak = Math.max(maxLoseStreak, Math.abs(tempStreak)); tempStreak = 1; }
    } else {
      if (tempStreak <= 0) tempStreak--;
      else { maxWinStreak = Math.max(maxWinStreak, tempStreak); tempStreak = -1; }
    }
    if (currentStreak === 0) currentStreak = tempStreak;
  }
  maxWinStreak = Math.max(maxWinStreak, tempStreak > 0 ? tempStreak : 0);
  maxLoseStreak = Math.max(maxLoseStreak, tempStreak < 0 ? Math.abs(tempStreak) : 0);

  // Daily P&L for chart
  const dailyPnL: { date: string; profit: number }[] = [];
  const grouped = filtered.reduce((acc, tx) => {
    const date = new Date(tx.timestamp).toLocaleDateString();
    acc[date] = (acc[date] || 0) + (tx.status === 'success' ? tx.netProfit : -tx.gasCost);
    return acc;
  }, {} as Record<string, number>);
  Object.entries(grouped).forEach(([date, profit]) => dailyPnL.push({ date, profit }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-[#00F0FF]" />
          Performance Analytics
        </h3>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {(['24h', '7d', '30d', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTimeframe(t)}
              className={`px-3 py-1 rounded text-sm ${timeframe === t ? 'bg-[#00F0FF] text-gray-900' : 'text-gray-400'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={DollarSign} label="Total P&L" value={`$${totalProfit.toFixed(2)}`} color={totalProfit >= 0 ? 'text-[#00FF88]' : 'text-red-400'} />
        <MetricCard icon={Activity} label="Win Rate" value={`${winRate.toFixed(1)}%`} color="text-[#00F0FF]" />
        <MetricCard icon={TrendingUp} label="Win Streak" value={`${maxWinStreak}`} color="text-[#00FF88]" subtext={`Current: ${currentStreak > 0 ? currentStreak : 0}`} />
        <MetricCard icon={TrendingDown} label="Lose Streak" value={`${maxLoseStreak}`} color="text-red-400" subtext={`Current: ${currentStreak < 0 ? Math.abs(currentStreak) : 0}`} />
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h4 className="text-gray-400 text-sm mb-3">Daily P&L</h4>
        <div className="h-32 flex items-end gap-1">
          {dailyPnL.slice(-14).map((d, i) => {
            const maxAbs = Math.max(...dailyPnL.map(x => Math.abs(x.profit)), 1);
            const height = (Math.abs(d.profit) / maxAbs) * 100;
            const heightClass = getBarHeightClass(height);
            return (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div className={`w-full rounded-t ${d.profit >= 0 ? 'bg-[#00FF88]' : 'bg-red-500'} ${heightClass}`} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Avg Profit/Trade</p>
          <p className="text-[#00FF88] font-mono font-bold">${avgProfit.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Total Gas Spent</p>
          <p className="text-red-400 font-mono font-bold">${totalGas.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Net ROI</p>
          <p className={`font-mono font-bold ${totalProfit - totalGas >= 0 ? 'text-[#00FF88]' : 'text-red-400'}`}>
            {totalGas > 0 ? (((totalProfit - totalGas) / totalGas) * 100).toFixed(1) : 0}%
          </p>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ElementType; label: string; value: string; color: string; subtext?: string }> = ({ icon: Icon, label, value, color, subtext }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
    <div className="flex items-center gap-2 mb-1">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-gray-400 text-xs">{label}</span>
    </div>
    <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
    {subtext && <p className="text-gray-500 text-xs">{subtext}</p>}
  </div>
);
