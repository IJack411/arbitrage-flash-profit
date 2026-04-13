import React from 'react';
import { TrendingDown, TrendingUp, AlertTriangle, Shield } from 'lucide-react';

interface RiskMetricsProps {
  metrics: {
    currentDrawdown: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winStreak: number;
    loseStreak: number;
    riskScore: number;
    exposurePercent: number;
    dailyPnL: number;
  };
}

export const RiskMetrics: React.FC<RiskMetricsProps> = ({ metrics }) => {
  const getRiskColor = (score: number) => {
    if (score < 30) return 'text-green-400';
    if (score < 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="h-4 w-4 text-red-400" />
          <p className="text-gray-400 text-sm">Current Drawdown</p>
        </div>
        <p className="text-red-400 text-xl font-bold font-mono">-{metrics.currentDrawdown.toFixed(2)}%</p>
        <p className="text-gray-500 text-xs mt-1">Max: -{metrics.maxDrawdown.toFixed(2)}%</p>
      </div>
      
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-[#00F0FF]" />
          <p className="text-gray-400 text-sm">Sharpe Ratio</p>
        </div>
        <p className="text-[#00F0FF] text-xl font-bold font-mono">{metrics.sharpeRatio.toFixed(2)}</p>
        <p className="text-gray-500 text-xs mt-1">Risk-adjusted return</p>
      </div>
      
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <p className="text-gray-400 text-sm">Exposure</p>
        </div>
        <p className="text-yellow-400 text-xl font-bold font-mono">{metrics.exposurePercent.toFixed(1)}%</p>
        <p className="text-gray-500 text-xs mt-1">Of total capital</p>
      </div>
      
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className={`h-4 w-4 ${getRiskColor(metrics.riskScore)}`} />
          <p className="text-gray-400 text-sm">Risk Score</p>
        </div>
        <p className={`text-xl font-bold font-mono ${getRiskColor(metrics.riskScore)}`}>{metrics.riskScore}/100</p>
        <p className="text-gray-500 text-xs mt-1">{metrics.riskScore < 30 ? 'Low' : metrics.riskScore < 60 ? 'Medium' : 'High'} Risk</p>
      </div>
    </div>
  );
};
