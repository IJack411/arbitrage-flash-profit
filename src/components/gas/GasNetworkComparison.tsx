import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NetworkGasComparison } from '@/lib/web3/advancedGasOptimizer';
import { Globe, ArrowRight, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface Props {
  comparisons: NetworkGasComparison[];
  onSelectNetwork: (network: string) => void;
}

export const GasNetworkComparison: React.FC<Props> = ({ comparisons, onSelectNetwork }) => {
  const getRecommendationBadge = (rec: string) => {
    const styles = {
      execute_now: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle, label: 'Execute Now' },
      wait: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: Clock, label: 'Wait' },
      urgent: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: AlertTriangle, label: 'High Gas' },
    }[rec] || { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: Clock, label: rec };
    const Icon = styles.icon;
    return (
      <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${styles.bg} ${styles.text}`}>
        <Icon className="h-3 w-3" /> {styles.label}
      </span>
    );
  };

  const getPercentileColor = (p: number) => {
    if (p < 30) return 'text-green-400';
    if (p < 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-400" /> Multi-Network Gas Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {comparisons.map((c) => (
            <div
              key={c.network}
              onClick={() => onSelectNetwork(c.network)}
              className="p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-850 transition-colors border border-gray-700 hover:border-[#00F0FF]/50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium capitalize">{c.network}</span>
                {getRecommendationBadge(c.recommendation)}
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-gray-400 text-xs">Current</div>
                  <div className="text-white font-mono">{c.currentBaseFee.toFixed(2)} Gwei</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">24h Avg</div>
                  <div className="text-gray-300 font-mono">{c.avgBaseFee24h.toFixed(2)} Gwei</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Percentile</div>
                  <div className={`font-mono ${getPercentileColor(c.percentile)}`}>{c.percentile.toFixed(0)}%</div>
                </div>
              </div>
              {c.estimatedSavingsPercent > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
                  <ArrowRight className="h-3 w-3" /> Save up to {c.estimatedSavingsPercent.toFixed(1)}% by waiting
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
