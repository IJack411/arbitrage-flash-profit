import React, { useState, useEffect, useCallback } from 'react';
import { Calculator, Percent, DollarSign, Scale } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface PositionSizerProps {
  capital: number;
  onSizeChange: (size: number) => void;
}

export const PositionSizer: React.FC<PositionSizerProps> = ({ capital, onSizeChange }) => {
  const [method, setMethod] = useState<'fixed' | 'percent' | 'kelly'>('percent');
  const [fixedAmount, setFixedAmount] = useState(1000);
  const [percentRisk, setPercentRisk] = useState(2);
  const [winRate, setWinRate] = useState(65);
  const [avgWin, setAvgWin] = useState(150);
  const [avgLoss, setAvgLoss] = useState(80);

  const calculateKelly = useCallback(() => {
    const p = winRate / 100;
    const b = avgWin / avgLoss;
    const kelly = (p * b - (1 - p)) / b;
    return Math.max(0, Math.min(kelly * 0.5, 0.25)); // Half-Kelly, max 25%
  }, [winRate, avgWin, avgLoss]);

  const getPositionSize = useCallback(() => {
    switch (method) {
      case 'fixed': return fixedAmount;
      case 'percent': return capital * (percentRisk / 100);
      case 'kelly': return capital * calculateKelly();
      default: return 0;
    }
  }, [method, fixedAmount, capital, percentRisk, calculateKelly]);

  useEffect(() => {
    onSizeChange(getPositionSize());
  }, [getPositionSize, onSizeChange]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="h-5 w-5 text-[#00F0FF]" />
        <h3 className="text-white font-semibold">Position Sizing</h3>
      </div>

      <div className="flex gap-2 mb-4">
        {(['fixed', 'percent', 'kelly'] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)}
            className={`px-3 py-1.5 rounded text-sm capitalize ${method === m ? 'bg-[#00F0FF] text-gray-900' : 'bg-gray-700 text-gray-300'}`}>
            {m === 'kelly' ? 'Kelly Criterion' : m}
          </button>
        ))}
      </div>

      {method === 'fixed' && (
        <div>
          <label className="text-gray-400 text-sm flex items-center gap-1"><DollarSign className="h-3 w-3" /> Fixed Amount</label>
          <input type="number" value={fixedAmount} onChange={(e) => setFixedAmount(+e.target.value)}
            title="Fixed position amount"
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white mt-1" />
        </div>
      )}

      {method === 'percent' && (
        <div>
          <label className="text-gray-400 text-sm flex items-center gap-1"><Percent className="h-3 w-3" /> Risk Per Trade: {percentRisk}%</label>
          <Slider value={[percentRisk]} onValueChange={([v]) => setPercentRisk(v)} min={0.5} max={10} step={0.5} className="mt-2" />
        </div>
      )}

      {method === 'kelly' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-gray-400 text-xs">Win Rate %</label>
              <input type="number" value={winRate} onChange={(e) => setWinRate(+e.target.value)}
                title="Win rate percentage"
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
            </div>
            <div>
              <label className="text-gray-400 text-xs">Avg Win $</label>
              <input type="number" value={avgWin} onChange={(e) => setAvgWin(+e.target.value)}
                title="Average winning trade amount"
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
            </div>
            <div>
              <label className="text-gray-400 text-xs">Avg Loss $</label>
              <input type="number" value={avgLoss} onChange={(e) => setAvgLoss(+e.target.value)}
                title="Average losing trade amount"
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
            </div>
          </div>
          <p className="text-gray-500 text-xs">Using Half-Kelly for conservative sizing</p>
        </div>
      )}

      <div className="mt-4 p-3 bg-gray-900 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Recommended Size:</span>
          <span className="text-[#00FF88] text-xl font-bold font-mono">${getPositionSize().toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <p className="text-gray-500 text-xs mt-1">{((getPositionSize() / capital) * 100).toFixed(1)}% of capital</p>
      </div>
    </div>
  );
};
