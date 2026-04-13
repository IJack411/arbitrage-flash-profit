import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Server, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  Clock,
  Activity
} from 'lucide-react';
import { SystemHealth } from '@/lib/adminService';

interface SystemHealthPanelProps {
  health: SystemHealth;
  onRefresh: () => void;
}

export const SystemHealthPanel: React.FC<SystemHealthPanelProps> = ({ health, onRefresh }) => {
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      default:
        return <XCircle className="h-4 w-4 text-red-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      online: 'bg-green-500/20 text-green-400 border-green-500/30',
      healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
      degraded: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      offline: 'bg-red-500/20 text-red-400 border-red-500/30',
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return colors[status] || colors.offline;
  };

  const getLatencyColor = (latency: number): string => {
    if (latency < 50) return 'text-green-400';
    if (latency < 150) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* System Overview */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-[#00F0FF]" />
              System Overview
            </CardTitle>
            <Badge className={getStatusBadge(health.status)}>
              {health.status.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-300">Uptime</span>
            </div>
            <span className="text-white font-mono">{formatUptime(health.uptime)}</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-blue-400" />
                  <span className="text-gray-300 text-sm">CPU Usage</span>
                </div>
                <span className="text-white text-sm">{health.metrics.cpuUsage.toFixed(1)}%</span>
              </div>
              <Progress 
                value={health.metrics.cpuUsage} 
                className="h-2 bg-gray-700"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-purple-400" />
                  <span className="text-gray-300 text-sm">Memory Usage</span>
                </div>
                <span className="text-white text-sm">{health.metrics.memoryUsage.toFixed(1)}%</span>
              </div>
              <Progress 
                value={health.metrics.memoryUsage} 
                className="h-2 bg-gray-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 bg-gray-700/50 rounded-lg text-center">
              <Wifi className="h-5 w-5 text-[#00F0FF] mx-auto mb-1" />
              <p className="text-xl font-bold text-white">{health.metrics.activeConnections.toLocaleString()}</p>
              <p className="text-xs text-gray-400">Active Connections</p>
            </div>
            <div className="p-3 bg-gray-700/50 rounded-lg text-center">
              <Zap className="h-5 w-5 text-yellow-400 mx-auto mb-1" />
              <p className="text-xl font-bold text-white">{health.metrics.requestsPerMinute.toLocaleString()}</p>
              <p className="text-xs text-gray-400">Requests/min</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <span className="text-gray-300">Error Rate</span>
            <span className={`font-mono ${health.metrics.errorRate < 1 ? 'text-green-400' : 'text-red-400'}`}>
              {health.metrics.errorRate.toFixed(2)}%
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Services Status */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" />
              Services Status
            </CardTitle>
            <button
              onClick={onRefresh}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Last check: {new Date(health.lastCheck).toLocaleTimeString()}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {health.services.map((service, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(service.status)}
                  <span className="text-gray-300">{service.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-mono ${getLatencyColor(service.latency)}`}>
                    {service.latency}ms
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getStatusBadge(service.status)}`}
                  >
                    {service.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
