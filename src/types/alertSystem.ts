// Advanced Alert System Types

export type AlertTriggerType = 
  | 'price_threshold'
  | 'profit_target'
  | 'gas_price'
  | 'mev_detection'
  | 'liquidity_change'
  | 'spread_threshold'
  | 'volume_spike'
  | 'whale_movement';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'active' | 'paused' | 'triggered' | 'expired';
export type ChannelType = 'in_app' | 'email' | 'telegram' | 'discord' | 'webhook';

export interface AlertCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains';
  value: number | string;
  unit?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  triggerType: AlertTriggerType;
  conditions: AlertCondition[];
  severity: AlertSeverity;
  status: AlertStatus;
  channels: string[];
  cooldownMinutes: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  triggeredCount: number;
  lastTriggeredAt?: string;
}

export interface AlertChannel {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  config: Record<string, string>;
  createdAt: string;
}

export interface AlertIncident {
  id: string;
  ruleId: string;
  ruleName: string;
  triggerType: AlertTriggerType;
  severity: AlertSeverity;
  message: string;
  data: Record<string, unknown>;
  channels: string[];
  deliveryStatus: Record<string, 'pending' | 'sent' | 'failed'>;
  acknowledged: boolean;
  acknowledgedAt?: string;
  createdAt: string;
}

export interface AlertEffectiveness {
  ruleId: string;
  totalTriggered: number;
  truePositives: number;
  falsePositives: number;
  actionsTaken: number;
  avgResponseTime: number;
  profitGenerated: number;
}

export interface AlertAnalytics {
  totalAlerts: number;
  alertsByType: Record<AlertTriggerType, number>;
  alertsBySeverity: Record<AlertSeverity, number>;
  alertsByChannel: Record<ChannelType, number>;
  avgAlertsPerDay: number;
  responseRate: number;
  effectiveness: AlertEffectiveness[];
}
