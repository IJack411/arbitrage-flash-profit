
export interface MarketData {
  ethPrice: number;
  btcPrice: number;
  gasPrice: number;
  gasPriorityFee: number;
  blockNumber: number;
  mevRisk: number;
  liquidityDepth: number;
  spread: number;
  volume24h: number;
  timestamp: number;
}

export interface WebhookChannel {
  id: string;
  name: string;
  type: 'discord' | 'telegram' | 'email' | 'slack' | 'custom';
  webhookUrl: string;
  enabled: boolean;
  lastTestedAt?: string;
  testStatus?: 'success' | 'failed';
}

export interface MonitoringConfig {
  evaluationIntervalMs: number;
  maxAlertsPerMinute: number;
  deduplicationWindowMs: number;
  priorityQueueEnabled: boolean;
  websocketEnabled: boolean;
}

export interface AlertQueueItem {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority: number;
  message: string;
  data: Record<string, unknown>;
  channels: string[];
  createdAt: number;
  attempts: number;
  status: 'pending' | 'sending' | 'sent' | 'failed';
}

export interface EngineStatus {
  isRunning: boolean;
  lastEvaluationAt: number;
  evaluationsPerMinute: number;
  alertsTriggeredToday: number;
  alertsSentToday: number;
  queueLength: number;
  wsConnected: boolean;
  rateLimitRemaining: number;
}

export interface DeduplicationEntry {
  ruleId: string;
  hash: string;
  timestamp: number;
}
