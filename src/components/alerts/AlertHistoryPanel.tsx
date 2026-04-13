import React, { useState } from 'react';
import { AlertIncident, AlertTriggerType, AlertSeverity } from '@/types/alertSystem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { History, Search, Check, CheckCheck, Filter, AlertTriangle, Bell, Shield, DollarSign, Fuel } from 'lucide-react';

const severityColors: Record<AlertSeverity, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

const triggerIcons: Record<AlertTriggerType, React.ReactNode> = {
  price_threshold: <DollarSign className="w-4 h-4" />,
  profit_target: <Bell className="w-4 h-4" />,
  gas_price: <Fuel className="w-4 h-4" />,
  mev_detection: <Shield className="w-4 h-4" />,
  liquidity_change: <AlertTriangle className="w-4 h-4" />,
  spread_threshold: <Bell className="w-4 h-4" />,
  volume_spike: <Bell className="w-4 h-4" />,
  whale_movement: <Bell className="w-4 h-4" />,
};

interface Props {
  incidents: AlertIncident[];
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
}

export const AlertHistoryPanel: React.FC<Props> = ({ incidents, onAcknowledge, onAcknowledgeAll }) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<AlertTriggerType | 'all'>('all');

  const filtered = incidents.filter(inc => {
    if (search && !inc.message.toLowerCase().includes(search.toLowerCase()) && !inc.ruleName.toLowerCase().includes(search.toLowerCase())) return false;
    if (severityFilter !== 'all' && inc.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && inc.triggerType !== typeFilter) return false;
    return true;
  });

  const unacknowledged = filtered.filter(i => !i.acknowledged).length;

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />Alert History
          {unacknowledged > 0 && <Badge className="bg-red-500">{unacknowledged}</Badge>}
        </CardTitle>
        <Button onClick={onAcknowledgeAll} size="sm" variant="outline" disabled={unacknowledged === 0}>
          <CheckCheck className="w-4 h-4 mr-1" />Acknowledge All
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-gray-900 border-gray-600 text-white pl-9" placeholder="Search alerts..." />
          </div>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as AlertSeverity | 'all')} className="bg-gray-900 border border-gray-600 text-white rounded-md px-3">
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No alerts found</p>
          ) : filtered.map(inc => (
            <div key={inc.id} className={`p-3 rounded-lg border ${inc.acknowledged ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-900 border-cyan-500/30'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${severityColors[inc.severity]}`}>{triggerIcons[inc.triggerType]}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{inc.ruleName}</span>
                      <Badge className={severityColors[inc.severity]}>{inc.severity}</Badge>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">{inc.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>{formatTime(inc.createdAt)}</span>
                      <span>Channels: {inc.channels.length}</span>
                      {Object.entries(inc.deliveryStatus).map(([ch, st]) => (
                        <Badge key={ch} variant="outline" className={st === 'sent' ? 'text-green-400' : st === 'failed' ? 'text-red-400' : 'text-yellow-400'}>{ch}: {st}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                {!inc.acknowledged && (
                  <Button variant="ghost" size="sm" onClick={() => onAcknowledge(inc.id)}>
                    <Check className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
