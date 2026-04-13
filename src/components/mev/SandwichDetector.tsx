import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Shield, Eye, RefreshCw, Skull } from 'lucide-react';
import { SandwichAttack, MempoolTx } from '@/types/mevProtection';
import { detectSandwichAttack, generateMockMempoolTxs } from '@/lib/web3/mevProtectionService';

interface Props {
  onAttackDetected?: (attack: SandwichAttack) => void;
}

export const SandwichDetector: React.FC<Props> = ({ onAttackDetected }) => {
  const [attacks, setAttacks] = useState<SandwichAttack[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);

  const scanMempool = useCallback(async () => {
    setIsScanning(true);
    await new Promise(r => setTimeout(r, 800));
    const txs = generateMockMempoolTxs(50);
    const newAttacks: SandwichAttack[] = [];
    txs.slice(0, 10).forEach(tx => {
      if (Math.random() > 0.7) {
        const attack = detectSandwichAttack(txs, tx);
        if (attack) { newAttacks.push(attack); onAttackDetected?.(attack); }
      }
    });
    setAttacks(prev => [...newAttacks, ...prev].slice(0, 20));
    setIsScanning(false);
  }, [onAttackDetected]);

  useEffect(() => {
    if (autoScan) {
      const interval = setInterval(scanMempool, 5000);
      return () => clearInterval(interval);
    }
  }, [autoScan, scanMempool]);

  const getRiskColor = (risk: string) => {
    const colors: Record<string, string> = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-orange-400', critical: 'text-red-400' };
    return colors[risk] || 'text-gray-400';
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Skull className="h-4 w-4 text-red-400" /> Sandwich Attack Detector
          </CardTitle>
          <div className="flex gap-2">
            <button onClick={() => setAutoScan(!autoScan)} className={`px-2 py-1 rounded text-xs ${autoScan ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
              {autoScan ? 'Auto ON' : 'Auto OFF'}
            </button>
            <button onClick={scanMempool} disabled={isScanning} title="Scan mempool now" className="p-1 bg-gray-700 hover:bg-gray-600 rounded">
              <RefreshCw className={`h-4 w-4 text-gray-300 ${isScanning ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-80 overflow-y-auto">
        {attacks.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No sandwich attacks detected</p>
          </div>
        ) : attacks.map(attack => (
          <div key={attack.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${getRiskColor(attack.riskLevel)}`} />
                <span className={`text-xs font-medium uppercase ${getRiskColor(attack.riskLevel)}`}>{attack.riskLevel}</span>
              </div>
              <span className="text-xs text-gray-500">{new Date(attack.detectedAt).toLocaleTimeString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">DEX:</span> <span className="text-white">{attack.targetDex}</span></div>
              <div><span className="text-gray-500">Est. Profit:</span> <span className="text-red-400">${attack.estimatedProfit.toFixed(2)}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Attacker:</span> <span className="text-white font-mono">{attack.attackerAddress.slice(0, 10)}...</span></div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
