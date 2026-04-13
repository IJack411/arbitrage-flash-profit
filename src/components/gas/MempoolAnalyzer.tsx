import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MempoolState } from '@/lib/web3/advancedGasOptimizer';
import { Activity, Layers, Gauge } from 'lucide-react';

interface Props {
  mempool: MempoolState;
}

export const MempoolAnalyzer: React.FC<Props> = ({ mempool }) => {
  const getCongestionColor = (score: number) => {
    if (score < 30) return 'text-green-400';
    if (score < 60) return 'text-yellow-400';
    if (score < 80) return 'text-orange-400';
    return 'text-red-400';
  };

  const getCongestionBg = (score: number) => {
    if (score < 30) return 'bg-green-500';
    if (score < 60) return 'bg-yellow-500';
    if (score < 80) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-400" /> Mempool Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Layers className="h-3 w-3" /> Pending Txs
            </div>
            <div className="text-xl font-bold text-white">{mempool.pendingCount.toLocaleString()}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Gauge className="h-3 w-3" /> Congestion
            </div>
            <div className={`text-xl font-bold ${getCongestionColor(mempool.congestionScore)}`}>
              {mempool.congestionScore.toFixed(0)}%
            </div>
          </div>
        </div>

        <div>
          <div className="text-gray-400 text-xs mb-2">Congestion Level</div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getCongestionBg(mempool.congestionScore)} transition-all duration-500`}
              style={{ width: `${Math.min(100, mempool.congestionScore)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="text-gray-400 text-xs mb-2">Priority Fee Distribution (Gwei)</div>
          <div className="space-y-1">
            {mempool.priorityFeeDistribution.map((d) => (
              <div key={d.percentile} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">{d.percentile}%</span>
                <div className="flex-1 h-4 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00F0FF] to-purple-500"
                    style={{ width: `${(d.fee / 6) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-white font-mono w-12">{d.fee.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-1">Recommended for Fast Inclusion</div>
          <div className="text-lg font-bold text-[#00F0FF]">
            {mempool.priorityFeeDistribution[3]?.fee.toFixed(2)} Gwei
          </div>
          <div className="text-xs text-gray-500">75th percentile priority fee</div>
        </div>
      </CardContent>
    </Card>
  );
};
