import React from 'react';
import { Webhook } from '@/lib/webhookService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Hash, Send, Globe, Edit2, Trash2, PlayCircle, History, ExternalLink } from 'lucide-react';

interface Props {
  webhook: Webhook;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggle: (active: boolean) => void;
  onViewHistory: () => void;
  isTesting?: boolean;
}

const platformConfig = {
  discord: { icon: MessageSquare, color: 'bg-indigo-500', label: 'Discord' },
  slack: { icon: Hash, color: 'bg-green-500', label: 'Slack' },
  telegram: { icon: Send, color: 'bg-blue-500', label: 'Telegram' },
  custom: { icon: Globe, color: 'bg-purple-500', label: 'Custom API' }
};

export const WebhookCard: React.FC<Props> = ({ webhook, onEdit, onDelete, onTest, onToggle, onViewHistory, isTesting }) => {
  const platform = platformConfig[webhook.platform] || platformConfig.custom;
  const Icon = platform.icon;

  return (
    <div className={`bg-gray-800 border rounded-xl p-5 transition-all ${webhook.is_active ? 'border-gray-700' : 'border-gray-800 opacity-60'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${platform.color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold">{webhook.name}</h3>
            <p className="text-gray-400 text-sm">{platform.label}</p>
          </div>
        </div>
        <Switch checked={webhook.is_active} onCheckedChange={onToggle} />
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="truncate max-w-[250px]">{webhook.url}</span>
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          {webhook.events.map(event => (
            <Badge key={event} variant="secondary" className="text-xs bg-gray-700 text-gray-300">
              {event}
            </Badge>
          ))}
        </div>

        {webhook.min_profit_threshold > 0 && (
          <div className="text-xs text-gray-500">
            Min profit: ${webhook.min_profit_threshold.toFixed(2)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-gray-700">
        <Button size="sm" variant="outline" onClick={onTest} disabled={isTesting} className="flex-1 border-gray-600">
          <PlayCircle className={`h-4 w-4 mr-1.5 ${isTesting ? 'animate-spin' : ''}`} />
          {isTesting ? 'Testing...' : 'Test'}
        </Button>
        <Button size="sm" variant="outline" onClick={onViewHistory} className="border-gray-600">
          <History className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit} className="border-gray-600">
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete} className="border-gray-600 hover:bg-red-500/20 hover:border-red-500">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
