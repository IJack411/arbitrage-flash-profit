import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EquityPoint } from '@/types/analytics';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  data: EquityPoint[];
  initialCapital: number;
}

export const EquityCurveChart: React.FC<Props> = ({ data, initialCapital }) => {
  if (data.length === 0) return null;
  
  const maxEquity = Math.max(...data.map(d => d.equity));
  const minEquity = Math.min(...data.map(d => d.equity));
  const range = maxEquity - minEquity || 1;
  const currentEquity = data[data.length - 1]?.equity || initialCapital;
  const totalReturn = ((currentEquity - initialCapital) / initialCapital) * 100;
  const isPositive = totalReturn >= 0;
  
  const points = data.map((point, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((point.equity - minEquity) / range) * 80 - 10;
    return `${x},${y}`;
  }).join(' ');

  const drawdownPoints = data.map((point, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (point.drawdownPercent / 50) * 30;
    return `${x},${y}`;
  }).join(' ');

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            {isPositive ? <TrendingUp className="h-5 w-5 text-green-400" /> : <TrendingDown className="h-5 w-5 text-red-400" />}
            Equity Curve
          </CardTitle>
          <div className="text-right">
            <p className={`text-2xl font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              ${currentEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className={`text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-64">
          <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity="0.3" />
                <stop offset="100%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(y => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#374151" strokeWidth="0.2" />
            ))}
            {/* Equity area */}
            <polygon points={`0,100 ${points} 100,100`} fill="url(#equityGradient)" />
            {/* Equity line */}
            <polyline points={points} fill="none" stroke={isPositive ? '#22c55e' : '#ef4444'} strokeWidth="0.5" />
            {/* Drawdown area */}
            <polyline points={drawdownPoints} fill="none" stroke="#f59e0b" strokeWidth="0.3" strokeDasharray="1,1" />
          </svg>
          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 px-2">
            <span>{data[0]?.timestamp.toLocaleDateString()}</span>
            <span>{data[data.length - 1]?.timestamp.toLocaleDateString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-700">
          <div className="text-center">
            <p className="text-gray-400 text-xs">Initial</p>
            <p className="text-white font-medium">${initialCapital.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-xs">Peak</p>
            <p className="text-green-400 font-medium">${maxEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-xs">Trough</p>
            <p className="text-red-400 font-medium">${minEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-xs">Current</p>
            <p className="text-[#00F0FF] font-medium">${currentEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
