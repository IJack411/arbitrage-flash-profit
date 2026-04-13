
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MarketData, WebhookChannel, EngineStatus, AlertQueueItem, MonitoringConfig } from '@/types/monitoringEngine';
import { AlertRule } from '@/types/alertSystem';
import { MarketDataFeed } from './MarketDataFeed';
import { EngineStatusPanel } from './EngineStatusPanel';
import { AlertQueuePanel } from './AlertQueuePanel';
import { WebhookChannelSetup } from './WebhookChannelSetup';
import { RuleEvaluationLog } from './RuleEvaluationLog';
import { alertMonitoringService } from '@/lib/alertMonitoringService';
import { Play, Pause, Settings, Activity, Zap, RefreshCw } from 'lucide-react';

const generateMockMarketData = (): MarketData => ({
  ethPrice: 2000 + Math.random() * 500 - 250,
  btcPrice: 42000 + Math.random() * 2000 - 1000,
  gasPrice: 20 + Math.random() * 80,
  gasPriorityFee: 2 + Math.random() * 10,
  blockNumber: 18500000 + Math.floor(Math.random() * 1000),
  mevRisk: Math.random() * 0.5,
  liquidityDepth: 1000000 + Math.random() * 500000,
  spread: 0.001 + Math.random() * 0.005,
  volume24h: 50000000 + Math.random() * 20000000,
  timestamp: Date.now()
});

const defaultRules: AlertRule[] = [
  { id: 'r1', name: 'ETH Below $1900', description: 'ETH drops below $1900', triggerType: 'price_threshold', conditions: [{ field: 'ethPrice', operator: 'lt', value: 1900 }], severity: 'high', status: 'active', channels: [], cooldownMinutes: 5, createdAt: '', updatedAt: '', triggeredCount: 0 },
  { id: 'r2', name: 'Gas Above 80 Gwei', description: 'Gas price exceeds 80 gwei', triggerType: 'gas_price', conditions: [{ field: 'gasPrice', operator: 'gt', value: 80 }], severity: 'medium', status: 'active', channels: [], cooldownMinutes: 10, createdAt: '', updatedAt: '', triggeredCount: 0 },
  { id: 'r3', name: 'High MEV Risk', description: 'MEV risk above 40%', triggerType: 'mev_detection', conditions: [{ field: 'mevRisk', operator: 'gt', value: 0.4 }], severity: 'critical', status: 'active', channels: [], cooldownMinutes: 2, createdAt: '', updatedAt: '', triggeredCount: 0 },
];

export const MonitoringEngineDashboard: React.FC = () => {
  interface EvaluationLogEntry {
    id: string;
    timestamp: number;
    ruleName: string;
    ruleId: string;
    triggered: boolean;
    values: {
      ethPrice: string;
      gas: string;
    };
  }

  const [isRunning, setIsRunning] = useState(false);
  const [marketData, setMarketData] = useState<MarketData>(generateMockMarketData());
  const [prevData, setPrevData] = useState<MarketData | undefined>();
  const [rules, setRules] = useState<AlertRule[]>(defaultRules);
  const [channels, setChannels] = useState<WebhookChannel[]>([]);
  const [queue, setQueue] = useState<AlertQueueItem[]>([]);
  const [logs, setLogs] = useState<EvaluationLogEntry[]>([]);
  const [config, setConfig] = useState<MonitoringConfig>({
    evaluationIntervalMs: 5000,
    maxAlertsPerMinute: 30,
    deduplicationWindowMs: 60000,
    priorityQueueEnabled: true,
    websocketEnabled: true
  });
  const [status, setStatus] = useState<EngineStatus>({
    isRunning: false, lastEvaluationAt: 0, evaluationsPerMinute: 0,
    alertsTriggeredToday: 0, alertsSentToday: 0, queueLength: 0,
    wsConnected: false, rateLimitRemaining: 30
  });
  const intervalRef = useRef<number | null>(null);

  const evaluateRules = useCallback(() => {
    const newData = generateMockMarketData();
    setPrevData(marketData);
    setMarketData(newData);

    const newLogs: EvaluationLogEntry[] = [];
    rules.filter(r => r.status === 'active').forEach(rule => {
      const triggered = rule.conditions.every(c => alertMonitoringService.evaluateCondition(c, newData));
      newLogs.push({ id: `${Date.now()}-${rule.id}`, timestamp: Date.now(), ruleName: rule.name, ruleId: rule.id, triggered, values: { ethPrice: newData.ethPrice.toFixed(0), gas: newData.gasPrice.toFixed(1) } });
      if (triggered) alertMonitoringService.queueAlert(rule, newData);
    });

    setLogs(prev => [...newLogs, ...prev].slice(0, 100));
    setQueue(alertMonitoringService.getQueue());
    setStatus(s => ({ ...s, isRunning, lastEvaluationAt: Date.now(), evaluationsPerMinute: s.evaluationsPerMinute + 1, queueLength: alertMonitoringService.getQueue().length }));
  }, [marketData, rules, isRunning]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(evaluateRules, config.evaluationIntervalMs);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, config.evaluationIntervalMs, evaluateRules]);

  const handleAddChannel = (ch: Omit<WebhookChannel, 'id'>) => {
    setChannels(prev => [...prev, { ...ch, id: `ch-${Date.now()}` }]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
            <Activity className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Real-Time Alert Engine</h2>
            <p className="text-slate-400">Continuous market monitoring with instant notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={isRunning ? 'bg-green-500/20 text-green-400 border-green-500' : ''}>
            {isRunning ? 'Engine Running' : 'Engine Stopped'}
          </Badge>
          <Button onClick={() => setIsRunning(!isRunning)} className={isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}>
            {isRunning ? <><Pause className="w-4 h-4 mr-2" />Stop</> : <><Play className="w-4 h-4 mr-2" />Start</>}
          </Button>
        </div>
      </div>

      <MarketDataFeed data={marketData} previousData={prevData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EngineStatusPanel status={status} maxAlertsPerMinute={config.maxAlertsPerMinute} />
        <AlertQueuePanel queue={queue} onClear={() => { alertMonitoringService.clearQueue(); setQueue([]); }} onProcessItem={() => {}} />
      </div>

      <Tabs defaultValue="channels" className="space-y-4">
        <TabsList className="bg-gray-800"><TabsTrigger value="channels">Channels</TabsTrigger><TabsTrigger value="logs">Logs</TabsTrigger><TabsTrigger value="config">Config</TabsTrigger></TabsList>
        <TabsContent value="channels"><WebhookChannelSetup channels={channels} onAdd={handleAddChannel} onToggle={(id, e) => setChannels(ch => ch.map(c => c.id === id ? { ...c, enabled: e } : c))} onDelete={id => setChannels(ch => ch.filter(c => c.id !== id))} onTest={() => {}} /></TabsContent>
        <TabsContent value="logs"><RuleEvaluationLog logs={logs} /></TabsContent>
        <TabsContent value="config">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" />Engine Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2"><Label>Evaluation Interval: {config.evaluationIntervalMs}ms</Label><Slider value={[config.evaluationIntervalMs]} onValueChange={v => setConfig(c => ({ ...c, evaluationIntervalMs: v[0] }))} min={1000} max={30000} step={1000} /></div>
              <div className="space-y-2"><Label>Max Alerts/Minute: {config.maxAlertsPerMinute}</Label><Slider value={[config.maxAlertsPerMinute]} onValueChange={v => setConfig(c => ({ ...c, maxAlertsPerMinute: v[0] }))} min={5} max={100} step={5} /></div>
              <div className="flex items-center justify-between"><Label>Priority Queue</Label><Switch checked={config.priorityQueueEnabled} onCheckedChange={e => setConfig(c => ({ ...c, priorityQueueEnabled: e }))} /></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
