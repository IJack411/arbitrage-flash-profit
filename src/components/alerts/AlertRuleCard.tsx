import React from 'react';
import { AlertRule, AlertTriggerType } from '@/types/alertSystem';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Trash2, Edit, Activity, DollarSign, Fuel, Shield, Droplets, BarChart3, Waves, Fish } from 'lucide-react';

const triggerIcons: Record<AlertTriggerType, React.ReactNode> = {
  price_threshold: <DollarSign className="w-4 h-4" />,
  profit_target: <Activity className="w-4 h-4" />,
  gas_price: <Fuel className="w-4 h-4" />,
  mev_detection: <Shield className="w-4 h-4" />,
  liquidity_change: <Droplets className="w-4 h-4" />,
  spread_threshold: <BarChart3 className="w-4 h-4" />,
  volume_spike: <Waves className="w-4 h-4" />,
  whale_movement: <Fish className="w-4 h-4" />,
};

const severityColors = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
};

interface Props {
  rule: AlertRule;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (rule: AlertRule) => void;
  onDelete: (id: string) => void;
}

export const AlertRuleCard: React.FC<Props> = ({ rule, onToggle, onEdit, onDelete }) => {
  const isActive = rule.status === 'active';

  return (
    <Card className="bg-gray-800/50 border-gray-700 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-700 text-gray-500'}`}>
            {triggerIcons[rule.triggerType]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium">{rule.name}</h4>
              <Badge className={severityColors[rule.severity]}>{rule.severity}</Badge>
            </div>
            <p className="text-gray-400 text-sm mt-1">{rule.description}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span>Triggered: {rule.triggeredCount}x</span>
              {rule.lastTriggeredAt && (
                <span>Last: {new Date(rule.lastTriggeredAt).toLocaleDateString()}</span>
              )}
              <span>Cooldown: {rule.cooldownMinutes}m</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={(c) => onToggle(rule.id, c)} />
          <Button variant="ghost" size="sm" onClick={() => onEdit(rule)}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(rule.id)} className="text-red-400 hover:text-red-300">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
