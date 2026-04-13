import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Layers } from 'lucide-react';
import { AggregatedPrice } from '@/types/oracle';

interface Props {
  aggregatedPrices: AggregatedPrice[];
  onSelectPair: (pair: string) => void;
  selectedPair: string;
}

const sourceColors: Record<string, string> = {
  chainlink: 'bg-blue-500',
  pyth: 'bg-purple-500',
  band: 'bg-green-500',
  dex: 'bg-orange-500',
};

export const PriceAggregator: React.FC<Props> = ({ aggregatedPrices, onSelectPair, selectedPair }) => {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-5 w-5 text-[#00F0FF]" />
        <h3 className="text-white font-semibold">Multi-Source Price Aggregation</h3>
      </div>

      <div className="space-y-3">
        {aggregatedPrices.map((agg) => {
          const isSelected = agg.pair === selectedPair;
          const isHighDeviation = agg.deviation > 1;
          
          return (
            <div
              key={agg.pair}
              onClick={() => onSelectPair(agg.pair)}
              className={`rounded-lg p-3 cursor-pointer transition-all ${
                isSelected ? 'bg-[#00F0FF]/10 border border-[#00F0FF]/50' : 'bg-gray-900 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{agg.pair}</span>
                  {agg.isValid ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  )}
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">${agg.aggregatedPrice.toFixed(2)}</div>
                  <div className="text-gray-400 text-xs">Median: ${agg.medianPrice.toFixed(2)}</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  {agg.sources.map((s, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${sourceColors[s.source] || 'bg-gray-500'}`} title={s.source} />
                  ))}
                  <span className="text-gray-400 ml-1">{agg.sources.length} sources</span>
                </div>
                <div className={`flex items-center gap-1 ${isHighDeviation ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {isHighDeviation ? <AlertTriangle className="h-3 w-3" /> : null}
                  <span>Dev: {agg.deviation.toFixed(3)}%</span>
                </div>
              </div>

              {isSelected && (
                <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-3 gap-2">
                  {agg.sources.map((s, i) => (
                    <div key={i} className="bg-gray-800 rounded p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <div className={`w-2 h-2 rounded-full ${sourceColors[s.source]}`} />
                        <span className="text-gray-400 text-xs capitalize">{s.source}</span>
                      </div>
                      <div className="text-white text-sm font-medium">${s.price.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
