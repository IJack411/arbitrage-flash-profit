import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConditionBlockComponent } from './ConditionBlock';
import { EntryRule, ExitRule, ConditionBlock } from '@/types/strategyBuilder';
import { Plus, LogIn, LogOut } from 'lucide-react';

interface Props {
  type: 'entry' | 'exit';
  rules: (EntryRule | ExitRule)[];
  onUpdateRules: (rules: (EntryRule | ExitRule)[]) => void;
}

export const RuleBuilder: React.FC<Props> = ({ type, rules, onUpdateRules }) => {
  const addRule = () => {
    const newRule: EntryRule | ExitRule = {
      id: `rule-${Date.now()}`,
      conditions: [],
      logic: 'AND'
    };
    onUpdateRules([...rules, newRule]);
  };

  const updateRule = (ruleId: string, updates: Partial<EntryRule | ExitRule>) => {
    onUpdateRules(rules.map(r => r.id === ruleId ? { ...r, ...updates } : r));
  };

  const removeRule = (ruleId: string) => {
    onUpdateRules(rules.filter(r => r.id !== ruleId));
  };

  const updateCondition = (ruleId: string, block: ConditionBlock) => {
    onUpdateRules(rules.map(r => {
      if (r.id !== ruleId) return r;
      return { ...r, conditions: r.conditions.map(c => c.id === block.id ? block : c) };
    }));
  };

  const removeCondition = (ruleId: string, conditionId: string) => {
    onUpdateRules(rules.map(r => {
      if (r.id !== ruleId) return r;
      return { ...r, conditions: r.conditions.filter(c => c.id !== conditionId) };
    }));
  };

  const isEntry = type === 'entry';
  const Icon = isEntry ? LogIn : LogOut;
  const color = isEntry ? 'green' : 'red';

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className={`w-4 h-4 text-${color}-400`} />
            <span className="text-slate-300">{isEntry ? 'Entry' : 'Exit'} Rules</span>
            <Badge variant="outline" className="text-xs">{rules.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addRule} className="h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No rules defined. Add a rule to get started.</p>
        ) : (
          rules.map((rule, idx) => (
            <div key={rule.id} className={`p-3 rounded-lg border ${isEntry ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Rule {idx + 1}</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => updateRule(rule.id, { logic: rule.logic === 'AND' ? 'OR' : 'AND' })}
                    className="h-6 text-xs"
                  >
                    {rule.logic}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeRule(rule.id)} className="h-6 text-xs text-red-400">
                    Remove
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {rule.conditions.map(c => (
                  <ConditionBlockComponent
                    key={c.id}
                    block={c}
                    onUpdate={(b) => updateCondition(rule.id, b)}
                    onRemove={(id) => removeCondition(rule.id, id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
