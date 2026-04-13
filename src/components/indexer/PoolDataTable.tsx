import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PoolData } from '@/lib/web3/indexerService';
import { TrendingUp, Droplets } from 'lucide-react';

interface PoolDataTableProps {
  pools: PoolData[];
  loading?: boolean;
}

export const PoolDataTable: React.FC<PoolDataTableProps> = ({ pools, loading }) => {
  const formatNumber = (n: string | number) => {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const getFeeLabel = (fee?: number) => {
    if (!fee) return null;
    const feePercent = fee / 10000;
    return <Badge variant="outline" className="text-xs">{feePercent}%</Badge>;
  };

  if (loading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-[#00F0FF] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Fetching pool data from The Graph...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Droplets className="h-5 w-5 text-blue-400" />
          Top Liquidity Pools (Uniswap V3)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm border-b border-gray-700">
                <th className="text-left py-3 px-2">Pair</th>
                <th className="text-right py-3 px-2">Liquidity</th>
                <th className="text-right py-3 px-2">Volume 24h</th>
                <th className="text-right py-3 px-2">Price</th>
                <th className="text-right py-3 px-2">Fee</th>
              </tr>
            </thead>
            <tbody>
              {pools.slice(0, 10).map((pool, i) => (
                <tr key={pool.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-sm w-5">{i + 1}</span>
                      <span className="text-white font-medium">
                        {pool.token0.symbol}/{pool.token1.symbol}
                      </span>
                    </div>
                  </td>
                  <td className="text-right py-3 px-2 text-green-400 font-mono">
                    {formatNumber(pool.liquidity)}
                  </td>
                  <td className="text-right py-3 px-2 text-blue-400 font-mono">
                    {formatNumber(pool.volumeUSD)}
                  </td>
                  <td className="text-right py-3 px-2 text-white font-mono">
                    {parseFloat(pool.token0Price).toFixed(4)}
                  </td>
                  <td className="text-right py-3 px-2">
                    {getFeeLabel(pool.feeTier)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pools.length === 0 && (
          <p className="text-gray-500 text-center py-4">No pool data available. Configure The Graph API key.</p>
        )}
      </CardContent>
    </Card>
  );
};
