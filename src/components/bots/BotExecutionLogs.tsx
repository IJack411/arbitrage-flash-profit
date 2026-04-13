import React from 'react';
import { BotExecutionLog } from '@/types/tradingBot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ExternalLink, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

interface BotExecutionLogsProps {
  logs: BotExecutionLog[];
  botName: string;
  onClose: () => void;
}

export const BotExecutionLogs: React.FC<BotExecutionLogsProps> = ({ logs, botName, onClose }) => {
  const statusIcons = {
    success: <CheckCircle className="h-4 w-4 text-green-400" />,
    failed: <XCircle className="h-4 w-4 text-red-400" />,
    skipped: <AlertCircle className="h-4 w-4 text-yellow-400" />,
    pending: <Clock className="h-4 w-4 text-blue-400 animate-pulse" />
  };

  const statusColors = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    skipped: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-white">Execution Logs - {botName}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No execution logs yet</p>
              <p className="text-sm text-gray-500 mt-1">Logs will appear here when the bot executes trades</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {statusIcons[log.status]}
                      <Badge className={statusColors[log.status]}>
                        {log.status.toUpperCase()}
                      </Badge>
                      <span className="text-gray-400 text-sm">{log.action}</span>
                    </div>
                    <span className="text-gray-500 text-xs">{formatTime(log.created_at)}</span>
                  </div>
                  
                  {log.token_pair && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge variant="outline" className="text-xs border-gray-600 text-gray-300">
                        {log.token_pair}
                      </Badge>
                      {log.network && (
                        <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-400">
                          {log.network}
                        </Badge>
                      )}
                      {log.buy_dex && log.sell_dex && (
                        <span className="text-xs text-gray-400">
                          {log.buy_dex} → {log.sell_dex}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {log.actual_profit !== undefined && (
                      <div>
                        <span className="text-gray-500">Profit:</span>
                        <span className={`ml-1 ${log.actual_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${log.actual_profit.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {log.gas_cost !== undefined && (
                      <div>
                        <span className="text-gray-500">Gas:</span>
                        <span className="ml-1 text-orange-400">${log.gas_cost.toFixed(2)}</span>
                      </div>
                    )}
                    {log.execution_time_ms && (
                      <div>
                        <span className="text-gray-500">Time:</span>
                        <span className="ml-1 text-gray-300">{log.execution_time_ms}ms</span>
                      </div>
                    )}
                  </div>

                  {log.error_message && (
                    <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded p-2">
                      {log.error_message}
                    </div>
                  )}

                  {log.transaction_hash && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
                        {log.transaction_hash}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 px-2">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
