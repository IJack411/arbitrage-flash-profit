import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Users, 
  Wallet, 
  TrendingUp, 
  DollarSign, 
  Activity, 
  BarChart3,
  ArrowUp,
  ArrowDown 
} from 'lucide-react';
import { PlatformStats } from '@/lib/adminService';

interface PlatformStatsCardProps {
  stats: PlatformStats;
}

export const PlatformStatsCard: React.FC<PlatformStatsCardProps> = ({ stats }) => {
  const statItems = [
    {
      label: 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      subValue: `${stats.activeUsers24h} active today`,
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      change: stats.newUsersToday,
      changeLabel: 'new today',
    },
    {
      label: 'Connected Wallets',
      value: stats.totalWallets.toLocaleString(),
      subValue: `${stats.activeWallets} active`,
      icon: Wallet,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Total Trades',
      value: stats.totalTrades.toLocaleString(),
      subValue: `${stats.trades24h.toLocaleString()} in 24h`,
      icon: Activity,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Trading Volume',
      value: `$${(stats.totalVolume / 1000000).toFixed(2)}M`,
      subValue: `$${(stats.volume24h / 1000).toFixed(0)}K in 24h`,
      icon: BarChart3,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
    {
      label: 'Platform Fees',
      value: `$${stats.totalFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      subValue: `$${stats.fees24h.toFixed(2)} in 24h`,
      icon: DollarSign,
      color: 'text-[#00F0FF]',
      bgColor: 'bg-[#00F0FF]/10',
    },
    {
      label: 'Success Rate',
      value: `${stats.successRate.toFixed(1)}%`,
      subValue: `Avg trade: $${stats.avgTradeSize.toFixed(0)}`,
      icon: TrendingUp,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statItems.map((item, index) => (
        <Card key={index} className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              {item.change !== undefined && (
                <div className="flex items-center gap-1 text-xs text-green-400">
                  <ArrowUp className="h-3 w-3" />
                  +{item.change}
                </div>
              )}
            </div>
            <p className="text-2xl font-bold text-white">{item.value}</p>
            <p className="text-xs text-gray-400 mt-1">{item.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.subValue}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
