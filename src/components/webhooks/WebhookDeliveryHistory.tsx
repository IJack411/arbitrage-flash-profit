import React from 'react';
import { WebhookDelivery } from '@/lib/webhookService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  deliveries: WebhookDelivery[];
  webhookName: string;
  onClose: () => void;
  onRetry?: (id: string) => void;
  isLoading?: boolean;
}

const statusConfig = {
  success: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20', label: 'Delivered' },
  pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Pending' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Failed' },
  exhausted: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Exhausted' }
};

export const WebhookDeliveryHistory: React.FC<Props> = ({ deliveries, webhookName, onClose, onRetry, isLoading }) => {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-white font-semibold">Delivery History</h3>
          <p className="text-gray-400 text-sm">{webhookName}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Clock className="h-8 w-8 mb-2 opacity-50" />
            <p>No delivery history yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {deliveries.map(delivery => {
              const status = statusConfig[delivery.status] || statusConfig.pending;
              const StatusIcon = status.icon;
              
              return (
                <div key={delivery.id} className="p-4 hover:bg-gray-750">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${status.bg}`}>
                        <StatusIcon className={`h-4 w-4 ${status.color}`} />
                      </div>
                      <div>
                        <Badge variant="secondary" className={`${status.bg} ${status.color} border-0`}>
                          {status.label}
                        </Badge>
                        <p className="text-gray-500 text-xs mt-1">
                          {formatDistanceToNow(new Date(delivery.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400 text-xs">
                        Attempt {delivery.attempt_count}/{delivery.max_attempts}
                      </span>
                      {(delivery.status === 'failed' || delivery.status === 'exhausted') && onRetry && (
                        <Button size="sm" variant="ghost" onClick={() => onRetry(delivery.id)} className="ml-2 h-6 px-2">
                          <RefreshCw className="h-3 w-3 mr-1" /> Retry
                        </Button>
                      )}
                    </div>
                  </div>

                  {delivery.last_error && (
                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs">
                      {delivery.last_error}
                    </div>
                  )}

                  <details className="mt-2">
                    <summary className="text-gray-500 text-xs cursor-pointer hover:text-gray-400">
                      View Payload
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-400 overflow-x-auto">
                      {JSON.stringify(delivery.payload, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
