import React, { useState } from 'react';
import { AlertRule, AlertTriggerType, AlertSeverity, AlertCondition } from '@/types/alertSystem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

const triggerTypes: { value: AlertTriggerType; label: string }[] = [
  { value: 'price_threshold', label: 'Price Threshold' },
  { value: 'profit_target', label: 'Profit Target' },
  { value: 'gas_price', label: 'Gas Price Alert' },
  { value: 'mev_detection', label: 'MEV Detection' },
  { value: 'liquidity_change', label: 'Liquidity Change' },
  { value: 'spread_threshold', label: 'Spread Threshold' },
  { value: 'volume_spike', label: 'Volume Spike' },
  { value: 'whale_movement', label: 'Whale Movement' },
];

interface Props {
  rule?: AlertRule;
  channels: { id: string; name: string }[];
  onSave: (rule: Partial<AlertRule>) => void;
  onCancel: () => void;
}

export const AlertRuleForm: React.FC<Props> = ({ rule, channels, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    triggerType: rule?.triggerType || 'price_threshold' as AlertTriggerType,
    severity: rule?.severity || 'medium' as AlertSeverity,
    cooldownMinutes: rule?.cooldownMinutes || 5,
    selectedChannels: rule?.channels || [],
    conditions: rule?.conditions || [{ field: 'value', operator: 'gt' as const, value: 0 }],
  });

  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { field: 'value', operator: 'gt' as const, value: 0 }] });
  };

  const removeCondition = (idx: number) => {
    setForm({ ...form, conditions: form.conditions.filter((_, i) => i !== idx) });
  };

  const updateCondition = (idx: number, updates: Partial<AlertCondition>) => {
    const newConds = [...form.conditions];
    newConds[idx] = { ...newConds[idx], ...updates };
    setForm({ ...form, conditions: newConds });
  };

  const handleSubmit = () => {
    onSave({
      ...rule,
      name: form.name,
      description: form.description,
      triggerType: form.triggerType,
      severity: form.severity,
      cooldownMinutes: form.cooldownMinutes,
      channels: form.selectedChannels,
      conditions: form.conditions,
    });
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader><CardTitle className="text-white">{rule ? 'Edit' : 'Create'} Alert Rule</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-gray-300">Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-gray-900 border-gray-600 text-white" placeholder="Alert name" /></div>
          <div><Label className="text-gray-300">Trigger Type</Label>
            <Select value={form.triggerType} onValueChange={v => setForm({ ...form, triggerType: v as AlertTriggerType })}>
              <SelectTrigger className="bg-gray-900 border-gray-600 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>{triggerTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        <div><Label className="text-gray-300">Description</Label>
          <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-gray-900 border-gray-600 text-white" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-gray-300">Severity</Label>
            <Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v as AlertSeverity })}>
              <SelectTrigger className="bg-gray-900 border-gray-600 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>{['low', 'medium', 'high', 'critical'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label className="text-gray-300">Cooldown (min)</Label>
            <Input type="number" value={form.cooldownMinutes} onChange={e => setForm({ ...form, cooldownMinutes: +e.target.value })} className="bg-gray-900 border-gray-600 text-white" /></div>
        </div>
        <div><Label className="text-gray-300 mb-2 block">Conditions</Label>
          {form.conditions.map((c, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <Input value={c.field} onChange={e => updateCondition(i, { field: e.target.value })} className="bg-gray-900 border-gray-600 text-white w-32" placeholder="Field" />
              <Select value={c.operator} onValueChange={v => updateCondition(i, { operator: v as AlertCondition['operator'] })}>
                <SelectTrigger className="bg-gray-900 border-gray-600 text-white w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{['gt', 'lt', 'eq', 'gte', 'lte'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" value={c.value as number} onChange={e => updateCondition(i, { value: +e.target.value })} className="bg-gray-900 border-gray-600 text-white flex-1" />
              <Button variant="ghost" size="sm" onClick={() => removeCondition(i)}><X className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addCondition} className="mt-2"><Plus className="w-4 h-4 mr-1" />Add Condition</Button>
        </div>
        <div className="flex gap-2 pt-4">
          <Button onClick={handleSubmit} className="bg-cyan-500 hover:bg-cyan-600">Save Rule</Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
};
