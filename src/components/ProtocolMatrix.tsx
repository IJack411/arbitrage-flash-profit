import React, { useState } from 'react';
import { dexLogos } from '../data/dexAssets';

interface PriceData {
  pair: string;
  prices: Record<string, number>;
}

export const ProtocolMatrix: React.FC = () => {
  const [sortBy, setSortBy] = useState<'pair' | 'spread'>('spread');
  
  const priceData: PriceData[] = [
    { pair: 'ETH/USDT', prices: { Uniswap: 2450.23, SushiSwap: 2448.15, PancakeSwap: 2452.80, Curve: 2449.50 } },
    { pair: 'BTC/USDT', prices: { Uniswap: 43250.00, SushiSwap: 43280.50, PancakeSwap: 43245.20, Curve: 43260.00 } },
    { pair: 'BNB/USDT', prices: { Uniswap: 315.40, SushiSwap: 316.20, PancakeSwap: 314.80, Curve: 315.90 } },
    { pair: 'MATIC/USDT', prices: { Uniswap: 0.85, SushiSwap: 0.86, PancakeSwap: 0.84, Curve: 0.85 } },
    { pair: 'LINK/USDT', prices: { Uniswap: 14.52, SushiSwap: 14.48, PancakeSwap: 14.55, Curve: 14.50 } },
    { pair: 'UNI/USDT', prices: { Uniswap: 6.78, SushiSwap: 6.82, PancakeSwap: 6.75, Curve: 6.80 } },
    { pair: 'AAVE/USDT', prices: { Uniswap: 92.30, SushiSwap: 92.50, PancakeSwap: 92.15, Curve: 92.40 } },
    { pair: 'CRV/USDT', prices: { Uniswap: 1.05, SushiSwap: 1.06, PancakeSwap: 1.04, Curve: 1.05 } },
  ];

  const dexNames = ['Uniswap', 'SushiSwap', 'PancakeSwap', 'Curve'];

  const getSpread = (prices: Record<string, number>) => {
    const values = Object.values(prices);
    return ((Math.max(...values) - Math.min(...values)) / Math.min(...values) * 100);
  };

  const sortedData = [...priceData].sort((a, b) => {
    if (sortBy === 'spread') {
      return getSpread(b.prices) - getSpread(a.prices);
    }
    return a.pair.localeCompare(b.pair);
  });

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-white text-xl font-bold">Protocol Price Matrix</h2>
        <select
          title="Sort protocol matrix"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'pair' | 'spread')}
          className="bg-gray-900 border border-gray-700 text-white px-3 py-1 rounded text-sm"
        >
          <option value="spread">Sort by Spread</option>
          <option value="pair">Sort by Pair</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="text-left text-gray-400 text-xs font-medium p-3">Pair</th>
              {dexNames.map(dex => (
                <th key={dex} className="text-center text-gray-400 text-xs font-medium p-3">
                  <div className="flex items-center justify-center gap-2">
                    <img src={dexLogos[dex]} alt={dex} className="w-4 h-4 rounded-full" />
                    {dex}
                  </div>
                </th>
              ))}
              <th className="text-right text-gray-400 text-xs font-medium p-3">Spread</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((data) => {
              const spread = getSpread(data.prices);
              return (
                <tr key={data.pair} className="border-t border-gray-700 hover:bg-gray-750 transition-colors">
                  <td className="p-3 text-white font-mono text-sm font-bold">{data.pair}</td>
                  {dexNames.map(dex => (
                    <td key={dex} className="p-3 text-gray-300 font-mono text-sm text-center">
                      ${data.prices[dex].toFixed(2)}
                    </td>
                  ))}
                  <td className="p-3 text-right">
                    <span className={`font-mono text-sm font-bold ${spread > 0.3 ? 'text-[#00FF88]' : 'text-gray-400'}`}>
                      {spread.toFixed(3)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
