import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, CheckCircle, XCircle, Loader2, Zap, Fuel, TrendingUp } from 'lucide-react';
import { SimulationResult } from '@/types/mevProtection';
import { simulateTransaction } from '@/lib/web3/mevProtectionService';

export const TransactionSimulator: React.FC = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [txData, setTxData] = useState({ to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', value: '1', data: '0x38ed1739' });

  const runSimulation = async () => {
    setIsSimulating(true);
    setResult(null);
    const sim = await simulateTransaction({ to: txData.to, value: txData.value, data: txData.data });
    setResult(sim);
    setIsSimulating(false);
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Play className="h-4 w-4 text-purple-400" /> Transaction Simulator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-gray-400 text-xs">Target Contract</Label>
            <Input value={txData.to} onChange={e => setTxData(p => ({ ...p, to: e.target.value }))} className="bg-gray-900 border-gray-700 text-white text-xs h-8 font-mono" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Value (ETH)</Label>
            <Input value={txData.value} onChange={e => setTxData(p => ({ ...p, value: e.target.value }))} className="bg-gray-900 border-gray-700 text-white text-xs h-8" />
          </div>
        </div>
        <div>
          <Label className="text-gray-400 text-xs">Calldata</Label>
          <Input value={txData.data} onChange={e => setTxData(p => ({ ...p, data: e.target.value }))} className="bg-gray-900 border-gray-700 text-white text-xs h-8 font-mono" />
        </div>
        <button onClick={runSimulation} disabled={isSimulating} className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-gray-700 text-white py-2 rounded-lg flex items-center justify-center gap-2">
          {isSimulating ? <><Loader2 className="h-4 w-4 animate-spin" /> Simulating...</> : <><Play className="h-4 w-4" /> Simulate Transaction</>}
        </button>

        {result && (
          <div className={`rounded-lg p-4 border ${result.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-3">
              {result.success ? <CheckCircle className="h-5 w-5 text-green-400" /> : <XCircle className="h-5 w-5 text-red-400" />}
              <span className={`font-medium ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                {result.success ? 'Simulation Successful' : 'Simulation Failed'}
              </span>
            </div>
            {result.revertReason && <div className="text-red-400 text-sm mb-3 bg-red-500/10 p-2 rounded">Revert: {result.revertReason}</div>}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 rounded p-2">
                <div className="flex items-center gap-1 text-gray-400 text-xs mb-1"><Fuel className="h-3 w-3" /> Gas Used</div>
                <div className="text-white font-medium">{result.gasUsed.toLocaleString()}</div>
              </div>
              <div className="bg-gray-900 rounded p-2">
                <div className="flex items-center gap-1 text-gray-400 text-xs mb-1"><Zap className="h-3 w-3" /> Gas Price</div>
                <div className="text-white font-medium">{result.effectiveGasPrice.toFixed(1)} Gwei</div>
              </div>
              <div className="bg-gray-900 rounded p-2">
                <div className="flex items-center gap-1 text-gray-400 text-xs mb-1"><TrendingUp className="h-3 w-3" /> Est. Profit</div>
                <div className="text-green-400 font-medium">${result.profitEstimate.toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-3 text-xs">
              <span className="text-gray-400">Slippage Impact: </span>
              <span className={result.slippageImpact > 1 ? 'text-yellow-400' : 'text-green-400'}>{result.slippageImpact.toFixed(2)}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
