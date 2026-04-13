import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConditionPalette } from './ConditionPalette';
import { RuleBuilder } from './RuleBuilder';
import { RiskConfig } from './RiskConfig';
import { Strategy, ConditionType, ConditionBlock } from '@/types/strategyBuilder';
import { Layers, Zap } from 'lucide-react';

interface Props {
  strategy: Strategy;
  onUpdate: (strategy: Strategy) => void;
  selectedRuleType: 'entry' | 'exit';
  selectedRuleId: string | null;
}

export const StrategyCanvas: React.FC<Props> = ({ strategy, onUpdate, selectedRuleType, selectedRuleId }) => {
  const addConditionToRule = (type: ConditionType, label: string, defaultValue: number) => {
    if (!selectedRuleId) return;
    
    const newCondition: ConditionBlock = {
      id: `cond-${Date.now()}`,
      type,
      operator: 'gte',
      value: defaultValue,
      enabled: true,
      label
    };

    if (selectedRuleType === 'entry') {
      const updatedRules = strategy.entryRules.map(r => {
        if (r.id !== selectedRuleId) return r;
        return { ...r, conditions: [...r.conditions, newCondition] };
      });
      onUpdate({ ...strategy, entryRules: updatedRules });
    } else {
      const updatedRules = strategy.exitRules.map(r => {
        if (r.id !== selectedRuleId) return r;
        return { ...r, conditions: [...r.conditions, newCondition] };
      });
      onUpdate({ ...strategy, exitRules: updatedRules });
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3">
        <ConditionPalette onAddCondition={addConditionToRule} />
      </div>
      
      <div className="col-span-6 space-y-4">
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
                <Layers className="w-4 h-4 text-purple-400" />
                Strategy Details
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Active</span>
                <Switch
                  checked={strategy.isActive}
                  onCheckedChange={(isActive) => onUpdate({ ...strategy, isActive })}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={strategy.name}
              onChange={(e) => onUpdate({ ...strategy, name: e.target.value })}
              placeholder="Strategy Name"
              className="bg-slate-800/50 text-lg font-semibold"
            />
            <Textarea
              value={strategy.description}
              onChange={(e) => onUpdate({ ...strategy, description: e.target.value })}
              placeholder="Describe your strategy..."
              className="bg-slate-800/50 text-sm resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">v{strategy.version}</Badge>
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Zap className="w-3 h-3" /> {strategy.entryRules.length} Entry Rules
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {strategy.exitRules.length} Exit Rules
              </Badge>
            </div>
          </CardContent>
        </Card>

        <RuleBuilder
          type="entry"
          rules={strategy.entryRules}
          onUpdateRules={(rules) => onUpdate({ ...strategy, entryRules: rules })}
        />
        
        <RuleBuilder
          type="exit"
          rules={strategy.exitRules}
          onUpdateRules={(rules) => onUpdate({ ...strategy, exitRules: rules })}
        />
      </div>

      <div className="col-span-3">
        <RiskConfig
          params={strategy.riskParameters}
          onUpdate={(riskParameters) => onUpdate({ ...strategy, riskParameters })}
        />
      </div>
    </div>
  );
};
