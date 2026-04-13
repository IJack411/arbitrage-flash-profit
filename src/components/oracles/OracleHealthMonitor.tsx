import React from 'react';
import { Activity, AlertTriangle, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { OracleFeedHealth } from '@/types/oracle';

interface Props {
  healthData: OracleFeedHealth[];
}

const statusConfig = {
  healthy: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
  degraded: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  stale: { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  offline: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

export const OracleHealthMonitor: React.FC<Props> = ({ healthData }) => {
  const healthyCount = healthData.filter(h => h.status === 'healthy').length;
  const degradedCount = healthData.filter(h => h.status === 'degraded').length;
  const offlineCount = healthData.filter(h => h.status === 'offline' || h.status === 'stale').length;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#00F0FF]" />
          Oracle Health Monitor
        </h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-400">{healthyCount} Healthy</span>
          <span className="text-yellow-400">{degradedCount} Degraded</span>
          <span className="text-red-400">{offlineCount} Offline</span>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {healthData.map((feed) => {
          const config = statusConfig[feed.status];
          const StatusIcon = config.icon;
          const staleness = Math.floor((Date.now() - feed.lastUpdate) / 1000);
          
          return (
            <div key={feed.feedId} className={`${config.bg} rounded-lg p-3 border border-gray-700`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIcon className={`h-5 w-5 ${config.color}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{feed.pair}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{feed.source}</span>
                      {feed.isPrimary && (
                        <span className="text-xs px-2 py-0.5 rounded bg-[#00F0FF]/20 text-[#00F0FF]">Primary</span>
                      )}
                    </div>
                    <div className="text-gray-400 text-xs mt-0.5">
                      {feed.network} • Updated {staleness}s ago
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-gray-400 text-xs">
                    <Zap className="h-3 w-3" />
                    <span>{feed.latency}ms</span>
                  </div>
                  {feed.lastError && (
                    <div className="text-red-400 text-xs mt-1 max-w-32 truncate">{feed.lastError}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {healthData.length === 0 && (
          <div className="text-center text-gray-500 py-8">No oracle feeds configured</div>
        )}
      </div>
    </div>
  );
};
