
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WebhookChannel } from '@/types/monitoringEngine';
import { Webhook, Plus, Trash2, TestTube, CheckCircle, XCircle, Info } from 'lucide-react';

interface Props {
  channels: WebhookChannel[];
  onAdd: (channel: Omit<WebhookChannel, 'id'>) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
}

export const WebhookChannelSetup: React.FC<Props> = ({ channels, onAdd, onToggle, onDelete, onTest }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'discord' as const, webhookUrl: '' });

  const handleSubmit = () => {
    if (form.name && form.webhookUrl) {
      onAdd({ ...form, enabled: true });
      setForm({ name: '', type: 'discord', webhookUrl: '' });
      setShowForm(false);
    }
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = { discord: '🎮', telegram: '📱', slack: '💬', email: '📧', custom: '🔗' };
    return icons[type] || '🔗';
  };

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Webhook className="w-5 h-5 text-green-400" />
            Notification Channels
          </CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Channel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-400 mt-0.5" />
          <div className="text-sm text-blue-300">
            <strong>No API keys needed!</strong> Just paste your webhook URL from Discord, Telegram, or any service.
          </div>
        </div>

        {showForm && (
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My Discord Alerts" className="bg-gray-900" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as 'discord' | 'telegram' | 'slack' | 'email' | 'custom' })}>
                  <SelectTrigger className="bg-gray-900"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discord">Discord Webhook</SelectItem>
                    <SelectItem value="telegram">Telegram Bot</SelectItem>
                    <SelectItem value="slack">Slack Webhook</SelectItem>
                    <SelectItem value="email">Email Service</SelectItem>
                    <SelectItem value="custom">Custom Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input value={form.webhookUrl} onChange={e => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://discord.com/api/webhooks/..." className="bg-gray-900" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Add Channel</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {channels.map(ch => (
            <div key={ch.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getTypeIcon(ch.type)}</span>
                <div>
                  <div className="font-medium text-white">{ch.name}</div>
                  <div className="text-xs text-gray-400 truncate max-w-[200px]">{ch.webhookUrl}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ch.testStatus && (
                  <Badge className={ch.testStatus === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                    {ch.testStatus === 'success' ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {ch.testStatus}
                  </Badge>
                )}
                <Button size="sm" variant="ghost" onClick={() => onTest(ch.id)}><TestTube className="w-4 h-4" /></Button>
                <Switch checked={ch.enabled} onCheckedChange={e => onToggle(ch.id, e)} />
                <Button size="sm" variant="ghost" onClick={() => onDelete(ch.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
