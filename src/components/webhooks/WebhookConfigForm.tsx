import React, { useState } from 'react';
import { Webhook } from '@/lib/webhookService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare, Hash, Send, Globe, Plus, X } from 'lucide-react';

interface Props {
  webhook?: Webhook;
  onSave: (data: Partial<Webhook>) => void;
  onCancel: () => void;
}

const platformIcons = {
  discord: <MessageSquare className="h-4 w-4" />,
  slack: <Hash className="h-4 w-4" />,
  telegram: <Send className="h-4 w-4" />,
  custom: <Globe className="h-4 w-4" />
};

const eventTypes = [
  { id: 'opportunity', label: 'New Opportunity', desc: 'When profitable arbitrage is found' },
  { id: 'execution', label: 'Trade Executed', desc: 'When a trade completes' },
  { id: 'warning', label: 'Warnings', desc: 'Risk alerts and warnings' },
  { id: 'info', label: 'Info Updates', desc: 'General status updates' }
];

export const WebhookConfigForm: React.FC<Props> = ({ webhook, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: webhook?.name || '',
    url: webhook?.url || '',
    platform: webhook?.platform || 'discord',
    is_active: webhook?.is_active ?? true,
    min_profit_threshold: webhook?.min_profit_threshold || 0,
    events: webhook?.events || ['opportunity', 'execution'],
    secret_key: webhook?.secret_key || '',
    custom_headers: webhook?.custom_headers || {}
  });
  const [headerKey, setHeaderKey] = useState('');
  const [headerVal, setHeaderVal] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const toggleEvent = (eventId: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(eventId) 
        ? f.events.filter(e => e !== eventId)
        : [...f.events, eventId]
    }));
  };

  const addHeader = () => {
    if (headerKey && headerVal) {
      setForm(f => ({ ...f, custom_headers: { ...f.custom_headers, [headerKey]: headerVal } }));
      setHeaderKey(''); setHeaderVal('');
    }
  };

  const removeHeader = (key: string) => {
    const { [key]: _, ...rest } = form.custom_headers;
    setForm(f => ({ ...f, custom_headers: rest }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Webhook Name</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Discord Alert" required className="bg-gray-900 border-gray-700" />
        </div>
        <div className="space-y-2">
          <Label>Platform</Label>
          <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v as Webhook['platform'] }))}>
            <SelectTrigger className="bg-gray-900 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(platformIcons).map(([k, icon]) => (
                <SelectItem key={k} value={k}><span className="flex items-center gap-2">{icon} {k.charAt(0).toUpperCase() + k.slice(1)}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Webhook URL</Label>
        <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://discord.com/api/webhooks/..." required className="bg-gray-900 border-gray-700" />
      </div>

      <div className="space-y-2">
        <Label>Min Profit Threshold ($)</Label>
        <Input type="number" value={form.min_profit_threshold} onChange={e => setForm(f => ({ ...f, min_profit_threshold: parseFloat(e.target.value) || 0 }))} className="bg-gray-900 border-gray-700" />
      </div>

      <div className="space-y-3">
        <Label>Events to Notify</Label>
        <div className="grid grid-cols-2 gap-3">
          {eventTypes.map(evt => (
            <label key={evt.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.events.includes(evt.id) ? 'border-cyan-500 bg-cyan-500/10' : 'border-gray-700 bg-gray-900'}`}>
              <Checkbox checked={form.events.includes(evt.id)} onCheckedChange={() => toggleEvent(evt.id)} />
              <div><div className="text-white text-sm font-medium">{evt.label}</div><div className="text-gray-400 text-xs">{evt.desc}</div></div>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Secret Key (Optional)</Label>
        <Input type="password" value={form.secret_key} onChange={e => setForm(f => ({ ...f, secret_key: e.target.value }))} placeholder="For signature verification" className="bg-gray-900 border-gray-700" />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
          <Label>Active</Label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" className="bg-cyan-500 hover:bg-cyan-600">Save Webhook</Button>
        </div>
      </div>
    </form>
  );
};
