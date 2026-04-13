import React, { useMemo } from 'react';
import { LineChart, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { OraclePrice } from '@/types/oracle';

interface Props {
  history: OraclePrice[];
  pair: string;
}

const sourceColors: Record<string, string> = {
  chainlink: '#3B82F6',
  pyth: '#A855F7',
  band: '#22C55E',
  dex: '#F97316',
};

export const OraclePriceHistory: React.FC<Props> = ({ history, pair }) => {
  const chartData = useMemo(() => {
    if (history.length === 0) return { points: [], stats: null };
    
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const prices = sorted.map(h => h.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const latest = prices[prices.length - 1];
    const first = prices[0];
    const change = ((latest - first) / first) * 100;
    
    return {
      points: sorted,
      stats: { high, low, latest, change, count: sorted.length },
    };
  }, [history]);

  const { points, stats } = chartData;

  if (!stats || points.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <LineChart className="h-5 w-5 text-[#00F0FF]" />
          <h3 className="text-white font-semibold">Price History</h3>
        </div>
        <div className="text-center py-8 text-gray-500">No historical data available</div>
      </div>
    );
  }

  const priceRange = stats.high - stats.low || 1;
  const chartHeight = 120;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-[#00F0FF]" />
          <h3 className="text-white font-semibold">{pair} Price History</h3>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="text-gray-400 text-sm">{stats.count} data points</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900 rounded-lg p-2">
          <div className="text-gray-400 text-xs">Latest</div>
          <div className="text-white font-semibold">${stats.latest.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <div className="text-gray-400 text-xs">24h High</div>
          <div className="text-green-400 font-semibold">${stats.high.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <div className="text-gray-400 text-xs">24h Low</div>
          <div className="text-red-400 font-semibold">${stats.low.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <div className="text-gray-400 text-xs">Change</div>
          <div className={`font-semibold flex items-center gap-1 ${stats.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {stats.change.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Simple SVG Chart */}
      <div className="relative" style={{ height: chartHeight }}>
        <svg width="100%" height={chartHeight} className="overflow-visible">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
            <line key={ratio} x1="0" y1={ratio * chartHeight} x2="100%" y2={ratio * chartHeight} stroke="#374151" strokeWidth="1" strokeDasharray="4" />
          ))}
          
          {/* Price lines by source */}
          {['chainlink', 'pyth', 'band'].map(source => {
            const sourcePoints = points.filter(p => p.source === source);
            if (sourcePoints.length < 2) return null;
            
            const pathData = sourcePoints.map((p, i) => {
              const x = (i / (sourcePoints.length - 1)) * 100;
              const y = chartHeight - ((p.price - stats.low) / priceRange) * chartHeight;
              return `${i === 0 ? 'M' : 'L'} ${x}% ${y}`;
            }).join(' ');
            
            return (
              <path key={source} d={pathData} fill="none" stroke={sourceColors[source]} strokeWidth="2" opacity="0.8" />
            );
          })}
        </svg>
        
        {/* Y-axis labels */}
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500">
          <span>${stats.high.toFixed(0)}</span>
          <span>${((stats.high + stats.low) / 2).toFixed(0)}</span>
          <span>${stats.low.toFixed(0)}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-700">
        {Object.entries(sourceColors).map(([source, color]) => (
          <div key={source} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-gray-400 text-xs capitalize">{source}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
