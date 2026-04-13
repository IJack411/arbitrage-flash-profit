import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Layers, Gauge, AlertTriangle, TrendingUp, Eye, RefreshCw } from 'lucide-react';
import { MempoolStats, MempoolTx } from '@/types/mevProtection';
import { getMempoolStats, generateMockMempoolTxs } from '@/lib/web3/mevProtectionService';

interface Props {
  onSuspiciousTx?: (tx: MempoolTx) => void;
}

export const MempoolMonitor: React.FC<Props> = ({ onSuspiciousTx }) => {
  const [stats, setStats] = useState<MempoolStats | null>(null);
  const [recentTxs, setRecentTxs] = useState<MempoolTx[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    const update = () => {
      setStats(getMempoolStats());
      setRecentTxs(generateMockMempoolTxs(10));
    };
    update();
    if (isMonitoring) {
      const interval = setInterval(update, 3000);
      return () => clearInterval(interval);
    }
  }, [isMonitoring]);

  const getCongestionColor = (level: string) => {
    const colors: Record<string, string> = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-orange-400', extreme: 'text-red-400' };
    return colors[level] || 'text-gray-400';
  };

  const getCongestionBg = (level: string) => {
    const colors: Record<string, string> = { low: 'bg-green-500', medium: 'bg-yellow-500', high: 'bg-orange-500', extreme: 'bg-red-500' };
    return colors[level] || 'bg-gray-500';
  };

  if (!stats) return null;

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-400" /> Real-Time Mempool Monitor
          </CardTitle>
          <button onClick={() => setIsMonitoring(!isMonitoring)} className={`px-3 py-1 rounded text-xs flex items-center gap-1 ${isMonitoring ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
            <Activity className={`h-3 w-3 ${isMonitoring ? 'animate-pulse' : ''}`} />
            {isMonitoring ? 'Live' : 'Paused'}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <Layers className="h-4 w-4 text-blue-400 mx-auto mb-1" />
            <div className="text-lg font-bold text-white">{stats.pendingTxCount.toLocaleString()}</div>
            <div className="text-xs text-gray-400">Pending Txs</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <Gauge className="h-4 w-4 text-purple-400 mx-auto mb-1" />
            <div className="text-lg font-bold text-white">{stats.avgGasPrice.toFixed(1)}</div>
            <div className="text-xs text-gray-400">Avg Gas (Gwei)</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <TrendingUp className="h-4 w-4 text-green-400 mx-auto mb-1" />
            <div className="text-lg font-bold text-white">{stats.highPriorityCount}</div>
            <div className="text-xs text-gray-400">High Priority</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <AlertTriangle className="h-4 w-4 text-red-400 mx-auto mb-1" />
            <div className="text-lg font-bold text-red-400">{stats.suspiciousTxCount}</div>
            <div className="text-xs text-gray-400">Suspicious</div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Network Congestion</span>
            <span className={`font-medium uppercase ${getCongestionColor(stats.congestionLevel)}`}>{stats.congestionLevel}</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full ${getCongestionBg(stats.congestionLevel)} transition-all`} style={{ width: `${Math.min(100, stats.pendingTxCount / 500)}%` }} />
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 mb-2">Recent Transactions</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {recentTxs.slice(0, 5).map(tx => (
              <div key={tx.hash} className="flex items-center justify-between bg-gray-900 rounded p-2 text-xs">
                <span className="text-gray-300 font-mono">{tx.hash.slice(0, 10)}...</span>
                <span className="text-gray-400">{tx.decodedMethod || 'Unknown'}</span>
                <span className={tx.gasPrice > 50 ? 'text-yellow-400' : 'text-green-400'}>{tx.gasPrice.toFixed(1)} Gwei</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
