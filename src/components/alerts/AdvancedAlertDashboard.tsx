import React, { useState, useEffect } from 'react';
import { AlertRule, AlertChannel, AlertIncident, AlertAnalytics, AlertTriggerType, AlertSeverity } from '@/types/alertSystem';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { AlertRuleCard } from './AlertRuleCard';
import { AlertRuleForm } from './AlertRuleForm';
import { AlertChannelConfig } from './AlertChannelConfig';
import { AlertHistoryPanel } from './AlertHistoryPanel';
import { AlertAnalyticsPanel } from './AlertAnalyticsPanel';
import { Bell, Settings, History, BarChart3, Plus, Zap } from 'lucide-react';

const generateMockData = () => {
  const rules: AlertRule[] = [
    { id: 'r1', name: 'ETH Price Drop', description: 'Alert when ETH drops below $2000', triggerType: 'price_threshold', conditions: [{ field: 'price', operator: 'lt', value: 2000 }], severity: 'high', status: 'active', channels: ['ch1', 'ch2'], cooldownMinutes: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), triggeredCount: 12, lastTriggeredAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 'r2', name: 'High Profit Opportunity', description: 'Notify on 2%+ arbitrage opportunities', triggerType: 'profit_target', conditions: [{ field: 'profit', operator: 'gte', value: 2 }], severity: 'medium', status: 'active', channels: ['ch1'], cooldownMinutes: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), triggeredCount: 45, lastTriggeredAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 'r3', name: 'Gas Spike Alert', description: 'Alert when gas exceeds 100 gwei', triggerType: 'gas_price', conditions: [{ field: 'gasPrice', operator: 'gt', value: 100 }], severity: 'low', status: 'active', channels: ['ch1'], cooldownMinutes: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), triggeredCount: 8 },
    { id: 'r4', name: 'MEV Attack Detection', description: 'Detect potential sandwich attacks', triggerType: 'mev_detection', conditions: [{ field: 'mevRisk', operator: 'gt', value: 0.7 }], severity: 'critical', status: 'active', channels: ['ch1', 'ch2', 'ch3'], cooldownMinutes: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), triggeredCount: 3, lastTriggeredAt: new Date(Date.now() - 86400000).toISOString() },
  ];

  const channels: AlertChannel[] = [
    { id: 'ch1', name: 'In-App Notifications', type: 'in_app', enabled: true, config: {}, createdAt: new Date().toISOString() },
    { id: 'ch2', name: 'Trading Telegram', type: 'telegram', enabled: true, config: { botToken: '***', chatId: '-100123' }, createdAt: new Date().toISOString() },
    { id: 'ch3', name: 'Discord Alerts', type: 'discord', enabled: false, config: { webhookUrl: 'https://discord.com/api/webhooks/...' }, createdAt: new Date().toISOString() },
  ];

  const incidents: AlertIncident[] = Array.from({ length: 20 }, (_, i) => ({
    id: `inc${i}`, ruleId: rules[i % 4].id, ruleName: rules[i % 4].name, triggerType: rules[i % 4].triggerType,
    severity: rules[i % 4].severity, message: `Alert triggered: ${rules[i % 4].description}`,
    data: { value: Math.random() * 100 }, channels: rules[i % 4].channels,
    deliveryStatus: { 'in_app': 'sent', 'telegram': i % 3 === 0 ? 'failed' : 'sent' },
    acknowledged: i > 5, createdAt: new Date(Date.now() - i * 3600000).toISOString(),
  }));

  const analytics: AlertAnalytics = {
    totalAlerts: 156, avgAlertsPerDay: 12.3, responseRate: 0.78,
    alertsByType: { price_threshold: 45, profit_target: 62, gas_price: 28, mev_detection: 8, liquidity_change: 5, spread_threshold: 4, volume_spike: 3, whale_movement: 1 },
    alertsBySeverity: { low: 35, medium: 78, high: 32, critical: 11 },
    alertsByChannel: { in_app: 156, telegram: 89, discord: 12, email: 0, webhook: 0 },
    effectiveness: rules.map(r => ({ ruleId: r.id, totalTriggered: r.triggeredCount, truePositives: Math.floor(r.triggeredCount * 0.7), falsePositives: Math.floor(r.triggeredCount * 0.3), actionsTaken: Math.floor(r.triggeredCount * 0.5), avgResponseTime: 45 + Math.random() * 60, profitGenerated: Math.random() * 5000 })),
  };

  return { rules, channels, incidents, analytics };
};

export const AdvancedAlertDashboard: React.FC = () => {
  const [data, setData] = useState(generateMockData());
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>();

  const handleToggleRule = (id: string, enabled: boolean) => {
    setData(d => ({ ...d, rules: d.rules.map(r => r.id === id ? { ...r, status: enabled ? 'active' : 'paused' } : r) }));
  };

  const handleDeleteRule = (id: string) => {
    setData(d => ({ ...d, rules: d.rules.filter(r => r.id !== id) }));
  };

  const handleSaveRule = (rule: Partial<AlertRule>) => {
    if (editingRule) {
      setData(d => ({ ...d, rules: d.rules.map(r => r.id === editingRule.id ? { ...r, ...rule, updatedAt: new Date().toISOString() } : r) }));
    } else {
      const newRule: AlertRule = { ...rule as AlertRule, id: `r${Date.now()}`, status: 'active', triggeredCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setData(d => ({ ...d, rules: [...d.rules, newRule] }));
    }
    setShowForm(false);
    setEditingRule(undefined);
  };

  const handleAddChannel = (ch: Omit<AlertChannel, 'id' | 'createdAt'>) => {
    setData(d => ({ ...d, channels: [...d.channels, { ...ch, id: `ch${Date.now()}`, createdAt: new Date().toISOString() }] }));
  };

  const handleAcknowledge = (id: string) => {
    setData(d => ({ ...d, incidents: d.incidents.map(i => i.id === id ? { ...i, acknowledged: true, acknowledgedAt: new Date().toISOString() } : i) }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl"><Zap className="w-6 h-6 text-orange-400" /></div>
          <div><h2 className="text-2xl font-bold text-white">Advanced Alert System</h2><p className="text-slate-400">Configure triggers, channels, and monitor alert effectiveness</p></div>
        </div>
      </div>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList className="bg-gray-800 border-gray-700">
          <TabsTrigger value="rules" className="data-[state=active]:bg-gray-700"><Bell className="w-4 h-4 mr-2" />Alert Rules</TabsTrigger>
          <TabsTrigger value="channels" className="data-[state=active]:bg-gray-700"><Settings className="w-4 h-4 mr-2" />Channels</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-gray-700"><History className="w-4 h-4 mr-2" />History</TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-gray-700"><BarChart3 className="w-4 h-4 mr-2" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => { setEditingRule(undefined); setShowForm(true); }} className="bg-cyan-500 hover:bg-cyan-600"><Plus className="w-4 h-4 mr-2" />New Rule</Button></div>
          {showForm && <AlertRuleForm rule={editingRule} channels={data.channels.map(c => ({ id: c.id, name: c.name }))} onSave={handleSaveRule} onCancel={() => { setShowForm(false); setEditingRule(undefined); }} />}
          <div className="space-y-3">{data.rules.map(r => <AlertRuleCard key={r.id} rule={r} onToggle={handleToggleRule} onEdit={r => { setEditingRule(r); setShowForm(true); }} onDelete={handleDeleteRule} />)}</div>
        </TabsContent>

        <TabsContent value="channels"><AlertChannelConfig channels={data.channels} onAdd={handleAddChannel} onToggle={(id, e) => setData(d => ({ ...d, channels: d.channels.map(c => c.id === id ? { ...c, enabled: e } : c) }))} onDelete={id => setData(d => ({ ...d, channels: d.channels.filter(c => c.id !== id) }))} onTest={() => {}} /></TabsContent>
        <TabsContent value="history"><AlertHistoryPanel incidents={data.incidents} onAcknowledge={handleAcknowledge} onAcknowledgeAll={() => setData(d => ({ ...d, incidents: d.incidents.map(i => ({ ...i, acknowledged: true })) }))} /></TabsContent>
        <TabsContent value="analytics"><AlertAnalyticsPanel analytics={data.analytics} /></TabsContent>
      </Tabs>
    </div>
  );
};
