import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RiskMetrics } from '@/types/analytics';
import { Shield, TrendingUp, AlertTriangle, Target } from 'lucide-react';

interface Props {
  metrics: RiskMetrics;
}

export const RiskAdjustedMetrics: React.FC<Props> = ({ metrics }) => {
  const getRatingColor = (value: number, thresholds: [number, number]) => {
    if (value >= thresholds[1]) return 'text-green-400';
    if (value >= thresholds[0]) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getRatingBg = (value: number, thresholds: [number, number]) => {
    if (value >= thresholds[1]) return 'bg-green-500/20';
    if (value >= thresholds[0]) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  const MetricCard = ({ icon: Icon, label, value, format, thresholds, description }: {
    icon: React.ElementType; label: string; value: number; format: string; thresholds: [number, number]; description: string;
  }) => (
    <div className={`p-4 rounded-lg ${getRatingBg(value, thresholds)}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${getRatingColor(value, thresholds)}`} />
        <span className="text-gray-400 text-sm">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${getRatingColor(value, thresholds)}`}>
        {format === 'ratio' ? value.toFixed(2) : format === 'percent' ? `${value.toFixed(2)}%` : value.toFixed(2)}
      </p>
      <p className="text-gray-500 text-xs mt-1">{description}</p>
    </div>
  );

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#00F0FF]" />
          Risk-Adjusted Returns
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={TrendingUp}
            label="Sharpe Ratio"
            value={metrics.sharpeRatio}
            format="ratio"
            thresholds={[1, 2]}
            description="Risk-adjusted return"
          />
          <MetricCard
            icon={Target}
            label="Sortino Ratio"
            value={metrics.sortinoRatio}
            format="ratio"
            thresholds={[1.5, 2.5]}
            description="Downside risk-adjusted"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Max Drawdown"
            value={-metrics.maxDrawdown}
            format="percent"
            thresholds={[-20, -10]}
            description="Largest peak-to-trough"
          />
          <MetricCard
            icon={Shield}
            label="Volatility"
            value={metrics.volatility}
            format="percent"
            thresholds={[30, 15]}
            description="Annualized std dev"
          />
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="bg-gray-700/50 p-3 rounded-lg">
            <p className="text-gray-400 text-xs">VaR (95%)</p>
            <p className="text-red-400 font-bold">{metrics.var95.toFixed(2)}%</p>
          </div>
          <div className="bg-gray-700/50 p-3 rounded-lg">
            <p className="text-gray-400 text-xs">VaR (99%)</p>
            <p className="text-red-400 font-bold">{metrics.var99.toFixed(2)}%</p>
          </div>
          <div className="bg-gray-700/50 p-3 rounded-lg">
            <p className="text-gray-400 text-xs">Alpha</p>
            <p className={`font-bold ${metrics.alpha >= 0 ? 'text-green-400' : 'text-red-400'}`}>{metrics.alpha.toFixed(2)}%</p>
          </div>
          <div className="bg-gray-700/50 p-3 rounded-lg">
            <p className="text-gray-400 text-xs">Beta</p>
            <p className="text-white font-bold">{metrics.beta.toFixed(2)}</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-700/30 rounded-lg">
          <h4 className="text-white text-sm font-medium mb-2">Interpretation Guide</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="text-green-400">Sharpe {'>'} 2:</span> <span className="text-gray-400">Excellent</span></div>
            <div><span className="text-yellow-400">Sharpe 1-2:</span> <span className="text-gray-400">Good</span></div>
            <div><span className="text-red-400">Sharpe {'<'} 1:</span> <span className="text-gray-400">Poor</span></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
