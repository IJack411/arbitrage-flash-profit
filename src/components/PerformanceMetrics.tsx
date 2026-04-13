import React from 'react';

interface Props {
  metrics: {
    totalProfit: number;
    totalTrades: number;
    successRate: number;
    avgProfit: number;
    totalGasCost: number;
    volume24h: number;
  };
}

export const PerformanceMetrics: React.FC<Props> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-gray-400 text-sm mb-1">Total Profit</p>
        <p className="text-[#00FF88] text-2xl font-bold font-mono">${metrics.totalProfit.toLocaleString()}</p>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-gray-400 text-sm mb-1">Total Trades</p>
        <p className="text-white text-2xl font-bold font-mono">{metrics.totalTrades}</p>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-gray-400 text-sm mb-1">Success Rate</p>
        <p className="text-[#00F0FF] text-2xl font-bold font-mono">{metrics.successRate}%</p>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-gray-400 text-sm mb-1">Avg Profit</p>
        <p className="text-[#00FF88] text-2xl font-bold font-mono">${metrics.avgProfit.toFixed(2)}</p>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-gray-400 text-sm mb-1">Gas Spent</p>
        <p className="text-red-400 text-2xl font-bold font-mono">${metrics.totalGasCost.toFixed(2)}</p>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-gray-400 text-sm mb-1">24h Volume</p>
        <p className="text-white text-2xl font-bold font-mono">${metrics.volume24h.toLocaleString()}</p>
      </div>
    </div>
  );
};
