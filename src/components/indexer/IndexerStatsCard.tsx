import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Database, Zap, Clock } from 'lucide-react';
import { IndexerStats } from '@/lib/web3/indexerService';

interface IndexerStatsCardProps {
  stats: IndexerStats;
}

export const IndexerStatsCard: React.FC<IndexerStatsCardProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-400" />
            Queries/sec
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">
            {stats.queriesPerSecond.toFixed(1)}
          </div>
          <div className="text-xs text-gray-500">Real-time throughput</div>
        </CardContent>
      </Card>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-400" />
            Cache Hit Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">
            {stats.cacheHitRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Data from cache</div>
        </CardContent>
      </Card>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-400" />
            Avg Latency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">
            {stats.avgLatency.toFixed(0)}ms
          </div>
          <div className="text-xs text-gray-500">Query response time</div>
        </CardContent>
      </Card>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">
            {stats.activeConnections}
          </div>
          <div className="text-xs text-gray-500">Active data sources</div>
        </CardContent>
      </Card>
    </div>
  );
};
