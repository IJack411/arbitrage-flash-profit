
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertQueueItem } from '@/types/monitoringEngine';
import { ListOrdered, Trash2, Send, Clock, AlertCircle } from 'lucide-react';

interface Props {
  queue: AlertQueueItem[];
  onClear: () => void;
  onProcessItem: (id: string) => void;
}

const severityColors = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
};

const statusColors = {
  pending: 'bg-gray-500/20 text-gray-400',
  sending: 'bg-cyan-500/20 text-cyan-400',
  sent: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400'
};

export const AlertQueuePanel: React.FC<Props> = ({ queue, onClear, onProcessItem }) => {
  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListOrdered className="w-5 h-5 text-orange-400" />
            Priority Queue
            <Badge variant="outline">{queue.length}</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={queue.length === 0}>
            <Trash2 className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p>No alerts in queue</p>
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((item, idx) => (
                <div key={item.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-500">#{idx + 1}</span>
                      <div>
                        <div className="font-medium text-white text-sm">{item.ruleName}</div>
                        <div className="text-xs text-gray-400">{item.message}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={severityColors[item.severity]}>{item.severity}</Badge>
                      <Badge className={statusColors[item.status]}>{item.status}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </span>
                      <span>Priority: {item.priority}</span>
                      <span>Attempts: {item.attempts}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onProcessItem(item.id)}>
                      <Send className="w-3 h-3 mr-1" />
                      Send
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
