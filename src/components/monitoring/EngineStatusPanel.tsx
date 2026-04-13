
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EngineStatus } from '@/types/monitoringEngine';
import { Cpu, Wifi, Clock, AlertTriangle, Send, Gauge } from 'lucide-react';

interface Props {
  status: EngineStatus;
  maxAlertsPerMinute: number;
}

export const EngineStatusPanel: React.FC<Props> = ({ status, maxAlertsPerMinute }) => {
  const rateLimitUsed = ((maxAlertsPerMinute - status.rateLimitRemaining) / maxAlertsPerMinute) * 100;

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cpu className="w-5 h-5 text-purple-400" />
          Engine Status
          <Badge 
            variant={status.isRunning ? 'default' : 'secondary'} 
            className={status.isRunning ? 'bg-green-500/20 text-green-400' : ''}
          >
            {status.isRunning ? 'RUNNING' : 'STOPPED'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Wifi className={`w-4 h-4 ${status.wsConnected ? 'text-green-400' : 'text-red-400'}`} />
              WebSocket
            </div>
            <div className="text-lg font-semibold text-white">
              {status.wsConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4" />
              Evaluations/min
            </div>
            <div className="text-lg font-semibold text-white">
              {status.evaluationsPerMinute}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              Alerts Today
            </div>
            <div className="text-lg font-semibold text-white">
              {status.alertsTriggeredToday}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Send className="w-4 h-4 text-cyan-400" />
              Sent Today
            </div>
            <div className="text-lg font-semibold text-white">
              {status.alertsSentToday}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-400">
              <Gauge className="w-4 h-4" />
              Rate Limit Usage
            </span>
            <span className="text-white">{status.rateLimitRemaining}/{maxAlertsPerMinute}</span>
          </div>
          <Progress value={rateLimitUsed} className="h-2" />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <span className="text-sm text-gray-400">Queue Length</span>
          <Badge variant="outline" className={status.queueLength > 10 ? 'border-yellow-500 text-yellow-400' : ''}>
            {status.queueLength} pending
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};
