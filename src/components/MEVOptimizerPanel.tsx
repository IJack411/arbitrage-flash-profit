import React, { useState, useEffect } from 'react';
import { Calculator, Zap, TrendingUp, ArrowUpDown, RotateCcw } from 'lucide-react';
import { calculateOptimalBribe, optimizeBundleOrder, BribeCalculation, BundleOrder, resubmissionManager } from '@/lib/web3/mevOptimizer';

interface Props {
  expectedProfit: number;
  transactions?: string[];
  onBribeChange: (bribe: number) => void;
  onOrderChange?: (order: string[]) => void;
}

export const MEVOptimizerPanel: React.FC<Props> = ({ expectedProfit, transactions = [], onBribeChange, onOrderChange }) => {
  const [bribeCalc, setBribeCalc] = useState<BribeCalculation | null>(null);
  const [bundleOrder, setBundleOrder] = useState<BundleOrder | null>(null);
  const [customBribe, setCustomBribe] = useState<number>(0);
  const [competitorCount, setCompetitorCount] = useState(0);
  const [resubmitEnabled, setResubmitEnabled] = useState(true);
  const [maxResubmits, setMaxResubmits] = useState(5);

  useEffect(() => {
    const calc = calculateOptimalBribe(expectedProfit, 30, 250000, competitorCount);
    setBribeCalc(calc);
    setCustomBribe(calc.optimalBribe);
    onBribeChange(calc.optimalBribe);
  }, [expectedProfit, competitorCount, onBribeChange]);

  const optimizeOrder = () => {
    if (transactions.length === 0) return;
    const profits = transactions.map(() => Math.random() * 50 + 10);
    const order = optimizeBundleOrder(transactions, profits);
    setBundleOrder(order);
    onOrderChange?.(order.optimizedOrder);
  };

  if (!bribeCalc) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-5 w-5 text-[#00F0FF]" />
        <h3 className="text-white font-semibold">MEV Bundle Optimizer</h3>
      </div>

      {/* Bribe Calculator */}
      <div className="bg-gray-900 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-yellow-400" />
          <span className="text-white text-sm font-medium">Bribe Calculator</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-gray-400 text-xs">Expected Profit</label>
            <div className="text-green-400 font-bold">${expectedProfit.toFixed(2)}</div>
          </div>
          <div>
            <label className="text-gray-400 text-xs">Competitors</label>
            <input type="number" value={competitorCount} onChange={e => setCompetitorCount(Number(e.target.value))}
              title="Number of competing bundles"
              className="w-full bg-gray-700 border border-gray-600 text-white px-2 py-1 rounded text-sm" min={0} max={10} />
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">Base (10%)</span><span className="text-white">${bribeCalc.baseBribe.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-[#00F0FF]">Optimal</span><span className="text-[#00F0FF] font-bold">${bribeCalc.optimalBribe.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Max (50%)</span><span className="text-white">${bribeCalc.maxBribe.toFixed(2)}</span></div>
        </div>
        <input type="range" min={bribeCalc.baseBribe} max={bribeCalc.maxBribe} step={0.01} value={customBribe}
          title="Custom bribe value"
          onChange={e => { setCustomBribe(Number(e.target.value)); onBribeChange(Number(e.target.value)); }}
          className="w-full accent-[#00F0FF] mt-3" />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>Min</span><span className="text-[#00F0FF]">${customBribe.toFixed(2)}</span><span>Max</span>
        </div>
      </div>

      {/* Bundle Ordering */}
      <div className="bg-gray-900 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-purple-400" />
            <span className="text-white text-sm font-medium">Bundle Ordering</span>
          </div>
          <button onClick={optimizeOrder} className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded hover:bg-purple-500/30">
            Optimize
          </button>
        </div>
        {bundleOrder && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Profit Increase</span><span className="text-green-400">+${bundleOrder.expectedProfitIncrease.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Gas Saved</span><span className="text-green-400">{bundleOrder.gasOptimization.toLocaleString()}</span></div>
          </div>
        )}
      </div>

      {/* Resubmission Settings */}
      <div className="bg-gray-900 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-orange-400" />
            <span className="text-white text-sm font-medium">Auto-Resubmit</span>
          </div>
          <button onClick={() => setResubmitEnabled(!resubmitEnabled)}
            className={`text-xs px-2 py-1 rounded ${resubmitEnabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
            {resubmitEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">Max Attempts:</span>
          <input type="number" value={maxResubmits} onChange={e => setMaxResubmits(Number(e.target.value))}
            title="Maximum resubmission attempts"
            className="w-16 bg-gray-700 border border-gray-600 text-white px-2 py-1 rounded text-sm" min={1} max={10} />
        </div>
      </div>

      {/* Profit Summary */}
      <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Net Profit After Bribe</span>
          <span className="text-green-400 font-bold text-lg">${(expectedProfit - customBribe).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
