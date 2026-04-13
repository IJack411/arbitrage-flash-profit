
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarketData } from '@/types/monitoringEngine';
import { TrendingUp, TrendingDown, Fuel, Activity, Layers } from 'lucide-react';

interface Props {
  data: MarketData;
  previousData?: MarketData;
}

interface PriceCardProps {
  label: string;
  value: number | string;
  change: number;
  prefix?: string;
  suffix?: string;
}

export const MarketDataFeed: React.FC<Props> = ({ data, previousData }) => {
  const getPriceChange = (current: number, previous?: number) => {
    if (!previous) return 0;
    return ((current - previous) / previous) * 100;
  };

  const ethChange = getPriceChange(data.ethPrice, previousData?.ethPrice);
  const btcChange = getPriceChange(data.btcPrice, previousData?.btcPrice);
  const gasChange = getPriceChange(data.gasPrice, previousData?.gasPrice);

  const PriceCard = ({ label, value, change, prefix = '$', suffix = '' }: PriceCardProps) => (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{label}</span>
        {change !== 0 && (
          <Badge variant={change > 0 ? 'default' : 'destructive'} className="text-xs">
            {change > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {Math.abs(change).toFixed(2)}%
          </Badge>
        )}
      </div>
      <div className="text-2xl font-bold text-white">
        {prefix}{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}{suffix}
      </div>
    </div>
  );

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5 text-cyan-400" />
          Live Market Data
          <Badge variant="outline" className="ml-auto animate-pulse bg-green-500/20 text-green-400 border-green-500/50">
            LIVE
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <PriceCard label="ETH Price" value={data.ethPrice} change={ethChange} />
          <PriceCard label="BTC Price" value={data.btcPrice} change={btcChange} />
          <PriceCard label="Gas Price" value={data.gasPrice} change={gasChange} prefix="" suffix=" gwei" />
          <PriceCard label="MEV Risk" value={(data.mevRisk * 100).toFixed(1)} change={0} prefix="" suffix="%" />
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <Layers className="w-4 h-4" />
            Block: {data.blockNumber.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Fuel className="w-4 h-4" />
            Priority: {data.gasPriorityFee.toFixed(1)} gwei
          </span>
          <span className="ml-auto">
            Updated: {new Date(data.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
