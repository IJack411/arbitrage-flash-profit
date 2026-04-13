
import { MarketData, WebhookChannel, MonitoringConfig, AlertQueueItem, EngineStatus, DeduplicationEntry } from '@/types/monitoringEngine';
import { AlertRule, AlertCondition } from '@/types/alertSystem';

class AlertMonitoringService {
  private config: MonitoringConfig = {
    evaluationIntervalMs: 5000,
    maxAlertsPerMinute: 30,
    deduplicationWindowMs: 60000,
    priorityQueueEnabled: true,
    websocketEnabled: true
  };
  
  private alertQueue: AlertQueueItem[] = [];
  private deduplicationCache: DeduplicationEntry[] = [];
  private alertsThisMinute = 0;
  private lastMinuteReset = Date.now();
  private listeners: ((data: MarketData) => void)[] = [];
  private statusListeners: ((status: EngineStatus) => void)[] = [];
  private ws: WebSocket | null = null;
  private intervalId: number | null = null;
  private isRunning = false;
  private evaluationCount = 0;
  private alertsToday = 0;
  private sentToday = 0;

  getStatus(): EngineStatus {
    return {
      isRunning: this.isRunning,
      lastEvaluationAt: Date.now(),
      evaluationsPerMinute: this.evaluationCount,
      alertsTriggeredToday: this.alertsToday,
      alertsSentToday: this.sentToday,
      queueLength: this.alertQueue.length,
      wsConnected: this.ws?.readyState === WebSocket.OPEN,
      rateLimitRemaining: this.config.maxAlertsPerMinute - this.alertsThisMinute
    };
  }

  updateConfig(config: Partial<MonitoringConfig>) {
    this.config = { ...this.config, ...config };
  }

  onMarketData(cb: (data: MarketData) => void) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  onStatusChange(cb: (status: EngineStatus) => void) {
    this.statusListeners.push(cb);
    return () => { this.statusListeners = this.statusListeners.filter(l => l !== cb); };
  }

  private notifyStatus() {
    const status = this.getStatus();
    this.statusListeners.forEach(cb => cb(status));
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.lastMinuteReset > 60000) {
      this.alertsThisMinute = 0;
      this.lastMinuteReset = now;
    }
    return this.alertsThisMinute < this.config.maxAlertsPerMinute;
  }

  private isDuplicate(ruleId: string, data: Record<string, unknown>): boolean {
    const hash = `${ruleId}-${JSON.stringify(data)}`;
    const now = Date.now();
    this.deduplicationCache = this.deduplicationCache.filter(e => now - e.timestamp < this.config.deduplicationWindowMs);
    if (this.deduplicationCache.some(e => e.hash === hash)) return true;
    this.deduplicationCache.push({ ruleId, hash, timestamp: now });
    return false;
  }

  evaluateCondition(cond: AlertCondition, data: MarketData): boolean {
    const fieldMap: Record<string, number> = {
      price: data.ethPrice, ethPrice: data.ethPrice, btcPrice: data.btcPrice,
      gasPrice: data.gasPrice, gas: data.gasPrice, mevRisk: data.mevRisk,
      spread: data.spread, volume: data.volume24h, liquidity: data.liquidityDepth
    };
    const val = fieldMap[cond.field] ?? 0;
    const target = Number(cond.value);
    switch (cond.operator) {
      case 'gt': return val > target;
      case 'lt': return val < target;
      case 'gte': return val >= target;
      case 'lte': return val <= target;
      case 'eq': return val === target;
      default: return false;
    }
  }

  queueAlert(rule: AlertRule, data: MarketData) {
    if (!this.checkRateLimit()) return;
    if (this.isDuplicate(rule.id, { type: rule.triggerType })) return;
    
    const priority = rule.severity === 'critical' ? 4 : rule.severity === 'high' ? 3 : rule.severity === 'medium' ? 2 : 1;
    const item: AlertQueueItem = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
      priority, message: `${rule.name} triggered`, data: { ...data },
      channels: rule.channels, createdAt: Date.now(), attempts: 0, status: 'pending'
    };
    
    this.alertQueue.push(item);
    if (this.config.priorityQueueEnabled) {
      this.alertQueue.sort((a, b) => b.priority - a.priority);
    }
    this.alertsThisMinute++;
    this.alertsToday++;
    this.notifyStatus();
  }

  getQueue() { return [...this.alertQueue]; }
  clearQueue() { this.alertQueue = []; this.notifyStatus(); }
}

export const alertMonitoringService = new AlertMonitoringService();
