import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StrategyPerformance, BenchmarkData } from '@/types/analytics';
import { BarChart2, Check, Plus, X } from 'lucide-react';

interface Props {
  strategies: StrategyPerformance[];
  benchmarks: BenchmarkData[];
}

export const StrategyComparison: React.FC<Props> = ({ strategies, benchmarks }) => {
  const [selected, setSelected] = useState<string[]>(strategies.slice(0, 2).map(s => s.strategyId));
  const [showBenchmarks, setShowBenchmarks] = useState<string[]>(['ETH', 'BTC']);

  const toggleStrategy = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleBenchmark = (name: string) => {
    setShowBenchmarks(prev => prev.includes(name) ? prev.filter(b => b !== name) : [...prev, name]);
  };

  const selectedStrategies = strategies.filter(s => selected.includes(s.strategyId));
  const selectedBenchmarks = benchmarks.filter(b => showBenchmarks.includes(b.name));

  const allItems = [
    ...selectedStrategies.map(s => ({ name: s.strategyName, return: s.totalProfit, sharpe: s.riskMetrics.sharpeRatio, vol: s.riskMetrics.volatility, type: 'strategy' })),
    ...selectedBenchmarks.map(b => ({ name: b.name, return: b.totalReturn, sharpe: b.sharpeRatio, vol: b.volatility, type: 'benchmark' }))
  ];

  const maxReturn = Math.max(...allItems.map(i => Math.abs(i.return)), 1);

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-[#00F0FF]" />
          Strategy Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Selection */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-gray-400 text-sm">Strategies:</span>
          {strategies.map(s => (
            <button
              key={s.strategyId}
              onClick={() => toggleStrategy(s.strategyId)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                selected.includes(s.strategyId) ? 'bg-[#00F0FF] text-gray-900' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {selected.includes(s.strategyId) ? <Check className="h-3 w-3 inline mr-1" /> : <Plus className="h-3 w-3 inline mr-1" />}
              {s.strategyName}
            </button>
          ))}
          <span className="text-gray-400 text-sm ml-4">Benchmarks:</span>
          {benchmarks.map(b => (
            <button
              key={b.name}
              onClick={() => toggleBenchmark(b.name)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                showBenchmarks.includes(b.name) ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {showBenchmarks.includes(b.name) ? <Check className="h-3 w-3 inline mr-1" /> : <Plus className="h-3 w-3 inline mr-1" />}
              {b.name}
            </button>
          ))}
        </div>

        {/* Comparison Chart */}
        <div className="space-y-3 mb-6">
          {allItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-32 text-sm truncate">
                <span className={item.type === 'strategy' ? 'text-[#00F0FF]' : 'text-purple-400'}>{item.name}</span>
              </div>
              <div className="flex-1 h-6 bg-gray-700 rounded-full overflow-hidden relative">
                <div
                  className={`h-full ${item.return >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${(Math.abs(item.return) / maxReturn) * 100}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                  {item.return >= 0 ? '+' : ''}{item.return.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Metrics Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 py-2">Metric</th>
                {allItems.map((item, i) => (
                  <th key={i} className={`text-right py-2 ${item.type === 'strategy' ? 'text-[#00F0FF]' : 'text-purple-400'}`}>
                    {item.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-700/50">
                <td className="text-gray-400 py-2">Return</td>
                {allItems.map((item, i) => (
                  <td key={i} className={`text-right py-2 font-medium ${item.return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {item.return >= 0 ? '+' : ''}{item.return.toFixed(2)}%
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="text-gray-400 py-2">Sharpe</td>
                {allItems.map((item, i) => (
                  <td key={i} className="text-right py-2 text-white">{item.sharpe.toFixed(2)}</td>
                ))}
              </tr>
              <tr>
                <td className="text-gray-400 py-2">Volatility</td>
                {allItems.map((item, i) => (
                  <td key={i} className="text-right py-2 text-white">{item.vol.toFixed(2)}%</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
