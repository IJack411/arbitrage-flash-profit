import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BacktestResult } from '@/types/strategyBuilder';
import { TrendingUp, TrendingDown, Target, BarChart3, Award, AlertTriangle } from 'lucide-react';

interface Props {
  result: BacktestResult | null;
}

export const BacktestResults: React.FC<Props> = ({ result }) => {
  if (!result) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="py-8 text-center">
          <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Run a backtest to see results</p>
        </CardContent>
      </Card>
    );
  }

  const isProfitable = result.totalProfit > 0;

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          Backtest Results
          <Badge variant={isProfitable ? 'default' : 'destructive'} className="ml-auto">
            {isProfitable ? 'Profitable' : 'Loss'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-lg ${isProfitable ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-1">
              {isProfitable ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
              <span className="text-xs text-slate-400">Total Profit</span>
            </div>
            <p className={`text-lg font-bold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
              {isProfitable ? '+' : ''}{result.totalProfit.toFixed(4)} ETH
            </p>
          </div>
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400">Win Rate</span>
            </div>
            <p className="text-lg font-bold text-blue-400">{result.winRate.toFixed(1)}%</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded bg-slate-800/50 text-center">
            <p className="text-xs text-slate-500">Total Trades</p>
            <p className="text-sm font-semibold text-slate-300">{result.totalTrades}</p>
          </div>
          <div className="p-2 rounded bg-slate-800/50 text-center">
            <p className="text-xs text-slate-500">Winners</p>
            <p className="text-sm font-semibold text-green-400">{result.winningTrades}</p>
          </div>
          <div className="p-2 rounded bg-slate-800/50 text-center">
            <p className="text-xs text-slate-500">Losers</p>
            <p className="text-sm font-semibold text-red-400">{result.losingTrades}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 rounded bg-slate-800/50">
            <div className="flex items-center gap-1 mb-1">
              <Award className="w-3 h-3 text-yellow-400" />
              <span className="text-xs text-slate-500">Sharpe Ratio</span>
            </div>
            <p className="text-sm font-semibold text-slate-300">{result.sharpeRatio.toFixed(2)}</p>
          </div>
          <div className="p-2 rounded bg-slate-800/50">
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle className="w-3 h-3 text-orange-400" />
              <span className="text-xs text-slate-500">Max Drawdown</span>
            </div>
            <p className="text-sm font-semibold text-orange-400">{result.maxDrawdown.toFixed(2)}%</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-slate-800/30">
            <p className="text-[10px] text-slate-500">Avg Profit</p>
            <p className="text-xs text-green-400">+{result.avgProfit.toFixed(4)}</p>
          </div>
          <div className="p-2 rounded bg-slate-800/30">
            <p className="text-[10px] text-slate-500">Avg Loss</p>
            <p className="text-xs text-red-400">{result.avgLoss.toFixed(4)}</p>
          </div>
          <div className="p-2 rounded bg-slate-800/30">
            <p className="text-[10px] text-slate-500">Profit Factor</p>
            <p className="text-xs text-purple-400">{result.profitFactor.toFixed(2)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
