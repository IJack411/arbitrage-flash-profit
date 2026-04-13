import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { wsManager, PendingTx, MempoolStats } from '@/lib/web3/websocketManager';
import { Radio, Fuel, AlertTriangle, ArrowRightLeft } from 'lucide-react';

export const MempoolMonitor: React.FC = () => {
  const [recentTxs, setRecentTxs] = useState<PendingTx[]>([]);
  const [stats, setStats] = useState<MempoolStats>({ pendingCount: 0, avgGasPrice: 0, highValueTxs: 0, dexTxs: 0 });
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    if (!isMonitoring) return;
    
    const unsub = wsManager.subscribeMempool((tx) => {
      setRecentTxs(prev => [tx, ...prev].slice(0, 15));
      setStats(wsManager.getMempoolStats());
    });
    
    return unsub;
  }, [isMonitoring]);

  const isDexTx = (input: string) => input.startsWith('0x38ed1739') || input.startsWith('0x7ff36ab5');

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white flex items-center gap-2">
          <Radio className={`h-5 w-5 ${isMonitoring ? 'text-green-400 animate-pulse' : 'text-gray-400'}`} />
          Mempool Monitor
        </CardTitle>
        <button
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isMonitoring ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900'
          }`}
        >
          {isMonitoring ? 'Stop' : 'Start'} Monitoring
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-white">{stats.pendingCount}</div>
            <div className="text-xs text-gray-500">Pending Txs</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-yellow-400">{stats.avgGasPrice.toFixed(0)}</div>
            <div className="text-xs text-gray-500">Avg Gas (Gwei)</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-red-400">{stats.highValueTxs}</div>
            <div className="text-xs text-gray-500">High Value</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-blue-400">{stats.dexTxs}</div>
            <div className="text-xs text-gray-500">DEX Swaps</div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {recentTxs.map((tx, i) => (
            <div key={`${tx.hash}-${i}`} className="bg-gray-900 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isDexTx(tx.input) ? (
                  <ArrowRightLeft className="h-4 w-4 text-blue-400" />
                ) : parseFloat(tx.value) > 1 ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                ) : (
                  <Fuel className="h-4 w-4 text-gray-500" />
                )}
                <div>
                  <div className="text-white text-sm font-mono">{tx.hash.slice(0, 16)}...</div>
                  <div className="text-gray-500 text-xs">{tx.from.slice(0, 10)}...</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-white text-sm">{tx.value} ETH</div>
                <Badge variant="outline" className="text-xs">{tx.gasPrice} Gwei</Badge>
              </div>
            </div>
          ))}
          {recentTxs.length === 0 && (
            <p className="text-gray-500 text-center py-4">Start monitoring to see pending transactions</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
