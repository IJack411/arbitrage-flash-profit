// Wallet Balance Alert System Types

export type AlertType = 'low_balance' | 'balance_change' | 'gas_reserve' | 'custom';
export type ComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'change';
export type NotificationChannel = 'in_app' | 'telegram' | 'email' | 'webhook';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'triggered' | 'acknowledged' | 'resolved' | 'disabled';

export interface WalletAlertRule {
  id: string;
  userId: string;
  walletAddress: string;
  walletGroupId?: string;
  walletName?: string;
  alertType: AlertType;
  isEnabled: boolean;
  thresholdValue?: number;
  thresholdPercentage?: number;
  comparisonOperator: ComparisonOperator;
  notificationChannels: NotificationChannel[];
  cooldownMinutes: number;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
  config: AlertRuleConfig;
}

export interface AlertRuleConfig {
  name?: string;
  description?: string;
  severity?: AlertSeverity;
  // For balance change alerts
  changeDirection?: 'increase' | 'decrease' | 'both';
  changeTimeWindowMinutes?: number;
  // For gas reserve alerts
  minGasReserveETH?: number;
  estimatedTxCost?: number;
  // For custom alerts
  customCondition?: string;
  // Notification settings
  repeatNotification?: boolean;
  maxNotificationsPerDay?: number;
  quietHoursStart?: string; // HH:MM format
  quietHoursEnd?: string;
  // Network specific
  networks?: string[];
}

export interface WalletAlertHistory {
  id: string;
  ruleId: string;
  walletAddress: string;
  alertType: AlertType;
  triggeredAt: string;
  currentValue: number;
  thresholdValue: number;
  message: string;
  notificationSent: boolean;
  notificationChannels: NotificationChannel[];
  acknowledged: boolean;
  acknowledgedAt?: string;
  metadata: AlertMetadata;
}

export interface AlertMetadata {
  walletName?: string;
  previousBalance?: number;
  balanceChange?: number;
  balanceChangePercent?: number;
  networkName?: string;
  chainId?: number;
  gasPrice?: number;
  severity?: AlertSeverity;
  triggeredBy?: string;
}

export interface WalletAlertSummary {
  totalRules: number;
  activeRules: number;
  triggeredToday: number;
  unacknowledged: number;
  criticalAlerts: number;
  warningAlerts: number;
  lastAlertTime?: string;
}

export interface AlertNotification {
  id: string;
  alertHistoryId: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp: string;
  walletAddress: string;
  walletName?: string;
  alertType: AlertType;
  currentValue: number;
  thresholdValue: number;
  isRead: boolean;
  actions?: AlertAction[];
}

export interface AlertAction {
  id: string;
  label: string;
  type: 'acknowledge' | 'snooze' | 'disable' | 'view' | 'custom';
  payload?: Record<string, unknown>;
}

export interface CreateAlertRuleInput {
  walletAddress: string;
  walletGroupId?: string;
  alertType: AlertType;
  thresholdValue?: number;
  thresholdPercentage?: number;
  comparisonOperator: ComparisonOperator;
  notificationChannels: NotificationChannel[];
  cooldownMinutes?: number;
  config?: Partial<AlertRuleConfig>;
}

export interface UpdateAlertRuleInput {
  isEnabled?: boolean;
  thresholdValue?: number;
  thresholdPercentage?: number;
  comparisonOperator?: ComparisonOperator;
  notificationChannels?: NotificationChannel[];
  cooldownMinutes?: number;
  config?: Partial<AlertRuleConfig>;
}

// Alert type presets for easy configuration
export const ALERT_TYPE_PRESETS: Record<AlertType, { 
  name: string; 
  description: string; 
  icon: string;
  defaultThreshold?: number;
  defaultOperator: ComparisonOperator;
  defaultSeverity: AlertSeverity;
}> = {
  low_balance: {
    name: 'Low Balance',
    description: 'Alert when wallet balance falls below a threshold',
    icon: 'AlertTriangle',
    defaultThreshold: 0.1,
    defaultOperator: 'lt',
    defaultSeverity: 'critical',
  },
  balance_change: {
    name: 'Balance Change',
    description: 'Alert on significant balance changes',
    icon: 'TrendingDown',
    defaultThreshold: 10,
    defaultOperator: 'change',
    defaultSeverity: 'warning',
  },
  gas_reserve: {
    name: 'Gas Reserve Low',
    description: 'Alert when gas reserves are insufficient for transactions',
    icon: 'Fuel',
    defaultThreshold: 0.01,
    defaultOperator: 'lt',
    defaultSeverity: 'warning',
  },
  custom: {
    name: 'Custom Alert',
    description: 'Create a custom alert with your own conditions',
    icon: 'Settings',
    defaultOperator: 'lt',
    defaultSeverity: 'info',
  },
};

export const SEVERITY_CONFIG: Record<AlertSeverity, {
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  info: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    label: 'Info',
  },
  warning: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    label: 'Warning',
  },
  critical: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    label: 'Critical',
  },
};

export const NOTIFICATION_CHANNEL_CONFIG: Record<NotificationChannel, {
  name: string;
  icon: string;
  description: string;
  requiresSetup: boolean;
}> = {
  in_app: {
    name: 'In-App',
    icon: 'Bell',
    description: 'Receive notifications within the application',
    requiresSetup: false,
  },
  telegram: {
    name: 'Telegram',
    icon: 'Send',
    description: 'Receive notifications via Telegram bot',
    requiresSetup: true,
  },
  email: {
    name: 'Email',
    icon: 'Mail',
    description: 'Receive notifications via email',
    requiresSetup: true,
  },
  webhook: {
    name: 'Webhook',
    icon: 'Globe',
    description: 'Send notifications to a custom webhook URL',
    requiresSetup: true,
  },
};
