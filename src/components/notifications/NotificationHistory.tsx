import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { History, Check, Trash2, TrendingUp, AlertTriangle, Info, DollarSign } from 'lucide-react';
import { ArbitrageNotification, notificationService } from '@/lib/notificationService';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  notifications: ArbitrageNotification[];
}

const typeIcons = {
  opportunity: TrendingUp,
  execution: DollarSign,
  warning: AlertTriangle,
  info: Info,
};

const typeColors = {
  opportunity: 'text-green-400 bg-green-400/10',
  execution: 'text-cyan-400 bg-cyan-400/10',
  warning: 'text-yellow-400 bg-yellow-400/10',
  info: 'text-blue-400 bg-blue-400/10',
};

export function NotificationHistory({ notifications }: Props) {
  const handleMarkRead = (id: string) => notificationService.markAsRead(id);
  const handleMarkAllRead = () => notificationService.markAllAsRead();
  const handleClear = () => notificationService.clearHistory();

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-purple-400" />
            Notification History
            {notifications.filter(n => !n.read).length > 0 && (
              <Badge variant="secondary" className="bg-red-500/20 text-red-400">
                {notifications.filter(n => !n.read).length} new
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleMarkAllRead}>
              <Check className="w-4 h-4 mr-1" /> Mark all read
            </Button>
            <Button size="sm" variant="ghost" onClick={handleClear} className="text-red-400">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {notifications.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No notifications yet
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(n => {
                const Icon = typeIcons[n.type];
                return (
                  <div
                    key={n.id}
                    onClick={() => handleMarkRead(n.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      n.read 
                        ? 'bg-slate-800/30 border-slate-700/50 opacity-60' 
                        : 'bg-slate-800/80 border-slate-600 hover:border-cyan-500/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${typeColors[n.type]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">{n.title}</span>
                          {!n.read && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                        </div>
                        <p className="text-sm text-slate-400 mt-0.5">{n.message}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          {n.profitAmount && (
                            <span className="text-green-400">${n.profitAmount.toFixed(2)}</span>
                          )}
                          {n.network && <Badge variant="outline" className="text-xs">{n.network}</Badge>}
                          {n.tokenPair && <span>{n.tokenPair}</span>}
                          <span>{formatDistanceToNow(n.createdAt, { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
