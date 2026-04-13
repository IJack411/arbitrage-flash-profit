import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { GripVertical, X } from 'lucide-react';
import { ConditionBlock as IConditionBlock, ConditionOperator } from '@/types/strategyBuilder';

interface Props {
  block: IConditionBlock;
  onUpdate: (block: IConditionBlock) => void;
  onRemove: (id: string) => void;
  draggable?: boolean;
}

const operatorLabels: Record<ConditionOperator, string> = {
  gt: '>', lt: '<', eq: '=', gte: '>=', lte: '<=', between: 'between'
};

const typeIcons: Record<string, string> = {
  price_threshold: '💰', profit_minimum: '📈', gas_limit: '⛽',
  time_window: '⏰', volume_threshold: '📊', liquidity_check: '💧',
  spread_minimum: '↔️', slippage_limit: '📉'
};

export const ConditionBlockComponent: React.FC<Props> = ({ block, onUpdate, onRemove, draggable = true }) => {
  return (
    <Card className="p-3 bg-slate-800/50 border-slate-700 hover:border-purple-500/50 transition-all">
      <div className="flex items-center gap-2">
        {draggable && (
          <div className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300">
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        <span className="text-lg">{typeIcons[block.type]}</span>
        <span className="text-sm text-slate-300 flex-1">{block.label}</span>
        <Switch
          checked={block.enabled}
          onCheckedChange={(enabled) => onUpdate({ ...block, enabled })}
          className="scale-75"
        />
        <button onClick={() => onRemove(block.id)} className="text-slate-500 hover:text-red-400">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Select
          value={block.operator}
          onValueChange={(op) => onUpdate({ ...block, operator: op as ConditionOperator })}
        >
          <SelectTrigger className="w-20 h-8 text-xs bg-slate-900/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(operatorLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          value={block.value}
          onChange={(e) => onUpdate({ ...block, value: parseFloat(e.target.value) || 0 })}
          className="h-8 text-xs bg-slate-900/50 flex-1"
        />
        {block.operator === 'between' && (
          <>
            <span className="text-slate-500 text-xs">to</span>
            <Input
              type="number"
              value={block.value2 || 0}
              onChange={(e) => onUpdate({ ...block, value2: parseFloat(e.target.value) || 0 })}
              className="h-8 text-xs bg-slate-900/50 flex-1"
            />
          </>
        )}
      </div>
    </Card>
  );
};
