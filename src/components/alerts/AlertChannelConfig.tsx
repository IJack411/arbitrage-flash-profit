import React, { useState } from 'react';
import { AlertChannel, ChannelType } from '@/types/alertSystem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bell, Mail, MessageCircle, Send, Webhook, Plus, Trash2, TestTube, Check, X } from 'lucide-react';

const channelIcons: Record<ChannelType, React.ReactNode> = {
  in_app: <Bell className="w-5 h-5" />,
  email: <Mail className="w-5 h-5" />,
  telegram: <Send className="w-5 h-5" />,
  discord: <MessageCircle className="w-5 h-5" />,
  webhook: <Webhook className="w-5 h-5" />,
};

const channelColors: Record<ChannelType, string> = {
  in_app: 'bg-purple-500/20 text-purple-400',
  email: 'bg-blue-500/20 text-blue-400',
  telegram: 'bg-cyan-500/20 text-cyan-400',
  discord: 'bg-indigo-500/20 text-indigo-400',
  webhook: 'bg-green-500/20 text-green-400',
};

interface Props {
  channels: AlertChannel[];
  onAdd: (channel: Omit<AlertChannel, 'id' | 'createdAt'>) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
}

export const AlertChannelConfig: React.FC<Props> = ({ channels, onAdd, onToggle, onDelete, onTest }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'in_app' as ChannelType, webhookUrl: '', botToken: '', chatId: '' });
  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'success' | 'failed'>>({});

  const handleAdd = () => {
    const config: Record<string, string> = {};
    if (form.type === 'webhook' || form.type === 'email') config.url = form.webhookUrl;
    if (form.type === 'telegram') { config.botToken = form.botToken; config.chatId = form.chatId; }
    if (form.type === 'discord') config.webhookUrl = form.webhookUrl;
    onAdd({ name: form.name, type: form.type, enabled: true, config });
    setForm({ name: '', type: 'in_app', webhookUrl: '', botToken: '', chatId: '' });
    setShowForm(false);
  };

  const handleTest = async (id: string) => {
    setTestStatus({ ...testStatus, [id]: 'testing' });
    onTest(id);
    setTimeout(() => setTestStatus({ ...testStatus, [id]: Math.random() > 0.2 ? 'success' : 'failed' }), 1500);
  };

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white flex items-center gap-2"><Webhook className="w-5 h-5 text-cyan-400" />Delivery Channels</CardTitle>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="bg-cyan-500 hover:bg-cyan-600"><Plus className="w-4 h-4 mr-1" />Add Channel</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-gray-400 text-sm">Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-gray-800 border-gray-600 text-white" placeholder="Channel name" /></div>
              <div><Label className="text-gray-400 text-sm">Type</Label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as ChannelType })} className="w-full bg-gray-800 border border-gray-600 text-white rounded-md px-3 py-2">
                  <option value="in_app">In-App</option><option value="email">Email (Webhook)</option><option value="telegram">Telegram</option><option value="discord">Discord</option><option value="webhook">Custom Webhook</option>
                </select></div>
            </div>
            {(form.type === 'webhook' || form.type === 'discord' || form.type === 'email') && (
              <div><Label className="text-gray-400 text-sm">Webhook URL</Label><Input value={form.webhookUrl} onChange={e => setForm({ ...form, webhookUrl: e.target.value })} className="bg-gray-800 border-gray-600 text-white" placeholder="https://..." /></div>
            )}
            {form.type === 'telegram' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-400 text-sm">Bot Token</Label><Input value={form.botToken} onChange={e => setForm({ ...form, botToken: e.target.value })} className="bg-gray-800 border-gray-600 text-white" /></div>
                <div><Label className="text-gray-400 text-sm">Chat ID</Label><Input value={form.chatId} onChange={e => setForm({ ...form, chatId: e.target.value })} className="bg-gray-800 border-gray-600 text-white" /></div>
              </div>
            )}
            <div className="flex gap-2"><Button onClick={handleAdd} size="sm" className="bg-green-500 hover:bg-green-600">Save</Button><Button onClick={() => setShowForm(false)} variant="outline" size="sm">Cancel</Button></div>
          </div>
        )}
        <div className="space-y-2">
          {channels.map(ch => (
            <div key={ch.id} className="flex items-center justify-between bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${channelColors[ch.type]}`}>{channelIcons[ch.type]}</div>
                <div><div className="text-white font-medium">{ch.name}</div><Badge variant="outline" className="text-xs">{ch.type}</Badge></div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleTest(ch.id)} disabled={testStatus[ch.id] === 'testing'}>
                  {testStatus[ch.id] === 'testing' ? <span className="animate-spin">⟳</span> : testStatus[ch.id] === 'success' ? <Check className="w-4 h-4 text-green-400" /> : testStatus[ch.id] === 'failed' ? <X className="w-4 h-4 text-red-400" /> : <TestTube className="w-4 h-4" />}
                </Button>
                <Switch checked={ch.enabled} onCheckedChange={c => onToggle(ch.id, c)} />
                <Button variant="ghost" size="sm" onClick={() => onDelete(ch.id)} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
          {channels.length === 0 && <p className="text-gray-500 text-center py-4">No channels configured</p>}
        </div>
      </CardContent>
    </Card>
  );
};
