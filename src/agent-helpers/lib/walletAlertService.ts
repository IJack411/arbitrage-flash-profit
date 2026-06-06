// Wallet Alert Service - Manages alert rules, monitoring, and notifications

import { supabase, isSupabaseConfigured } from './supabase';
import { telegramService } from './telegramService';
import {
  WalletAlertRule,
  WalletAlertHistory,
  WalletAlertSummary,
  AlertNotification,
  CreateAlertRuleInput,
  UpdateAlertRuleInput,
  AlertType,
  AlertSeverity,
  NotificationChannel,
  ALERT_TYPE_PRESETS,
  SEVERITY_CONFIG,
} from '@/agent-helpers/types/walletAlerts';
import { ConnectedWallet } from '@/agent-helpers/types/multiWallet';

const LOCAL_STORAGE_KEY = 'wallet-alert-rules';
const LOCAL_HISTORY_KEY = 'wallet-alert-history';
const LOCAL_NOTIFICATIONS_KEY = 'wallet-alert-notifications';

interface DbWalletAlertRuleRow {
  id: string;
  user_id: string;
  wallet_address: string;
  wallet_group_id?: string;
  alert_type: AlertType;
  is_enabled: boolean;
  threshold_value?: number;
  threshold_percentage?: number;
  comparison_operator: string;
  notification_channels: NotificationChannel[];
  cooldown_minutes: number;
  last_triggered_at?: string;
  trigger_count: number;
  created_at: string;
  updated_at: string;
  config?: WalletAlertRule['config'];
}

interface DbWalletAlertHistoryRow {
  id: string;
  rule_id: string;
  wallet_address: string;
  alert_type: AlertType;
  triggered_at: string;
  current_value: number;
  threshold_value: number;
  message: string;
  notification_sent: boolean;
  notification_channels: NotificationChannel[];
  acknowledged: boolean;
  acknowledged_at?: string;
  metadata?: WalletAlertHistory['metadata'];
}

class WalletAlertService {
  private userId: string = 'local-user';
  private supabasePersistenceDisabled = false;
  private rules: WalletAlertRule[] = [];
  private history: WalletAlertHistory[] = [];
  private notifications: AlertNotification[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(notifications: AlertNotification[]) => void> = new Set();
  private walletBalanceCache: Map<string, { balance: number; timestamp: number }> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private isValidUuid(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveSupabaseUserId(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id;
      return this.isValidUuid(id) ? id : null;
    } catch {
      return null;
    }
  }

  private shouldUseSupabasePersistence(): boolean {
    return isSupabaseConfigured() && !this.supabasePersistenceDisabled && this.isValidUuid(this.userId);
  }

  private disableSupabasePersistence(reason: unknown) {
    if (!this.supabasePersistenceDisabled) {
      console.warn('Disabling wallet alert Supabase persistence. Falling back to local storage.', reason);
    }
    this.supabasePersistenceDisabled = true;
  }

  setUserId(userId: string) {
    this.userId = userId;
    this.loadFromStorage();
  }

  // Subscribe to notification updates
  subscribe(listener: (notifications: AlertNotification[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.notifications));
  }

  // Load data from storage
  private async loadFromStorage() {
    try {
      if (isSupabaseConfigured()) {
        const resolvedUserId = await this.resolveSupabaseUserId();
        if (!resolvedUserId) {
          this.loadFromLocalStorage();
          return;
        }
        this.userId = resolvedUserId;
        await this.loadFromSupabase();
      } else {
        this.loadFromLocalStorage();
      }
    } catch (error) {
      console.error('Error loading alert data:', error);
      this.loadFromLocalStorage();
    }
  }

  private loadFromLocalStorage() {
    const rulesData = localStorage.getItem(`${LOCAL_STORAGE_KEY}-${this.userId}`);
    const historyData = localStorage.getItem(`${LOCAL_HISTORY_KEY}-${this.userId}`);
    const notificationsData = localStorage.getItem(`${LOCAL_NOTIFICATIONS_KEY}-${this.userId}`);

    if (rulesData) this.rules = JSON.parse(rulesData);
    if (historyData) this.history = JSON.parse(historyData);
    if (notificationsData) this.notifications = JSON.parse(notificationsData);
  }

  private async loadFromSupabase() {
    if (!this.isValidUuid(this.userId)) {
      this.loadFromLocalStorage();
      return;
    }

    const { data: rulesData } = await supabase
      .from('wallet_alert_rules')
      .select('*')
      .eq('user_id', this.userId);

    if (rulesData) {
      this.rules = rulesData.map(this.mapDbRuleToRule);
    }

    const { data: historyData } = await supabase
      .from('wallet_alert_history')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(100);

    if (historyData) {
      this.history = historyData.map(this.mapDbHistoryToHistory);
    }

    // Load notifications from local storage (they're ephemeral)
    const notificationsData = localStorage.getItem(`${LOCAL_NOTIFICATIONS_KEY}-${this.userId}`);
    if (notificationsData) this.notifications = JSON.parse(notificationsData);
  }

  private saveToStorage() {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}-${this.userId}`, JSON.stringify(this.rules));
    localStorage.setItem(`${LOCAL_HISTORY_KEY}-${this.userId}`, JSON.stringify(this.history));
    localStorage.setItem(`${LOCAL_NOTIFICATIONS_KEY}-${this.userId}`, JSON.stringify(this.notifications));
  }

  // Map database row to rule object
  private mapDbRuleToRule(row: DbWalletAlertRuleRow): WalletAlertRule {
    return {
      id: row.id,
      userId: row.user_id,
      walletAddress: row.wallet_address,
      walletGroupId: row.wallet_group_id,
      alertType: row.alert_type,
      isEnabled: row.is_enabled,
      thresholdValue: row.threshold_value,
      thresholdPercentage: row.threshold_percentage,
      comparisonOperator: row.comparison_operator,
      notificationChannels: row.notification_channels,
      cooldownMinutes: row.cooldown_minutes,
      lastTriggeredAt: row.last_triggered_at,
      triggerCount: row.trigger_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      config: row.config || {},
    };
  }

  private mapDbHistoryToHistory(row: DbWalletAlertHistoryRow): WalletAlertHistory {
    return {
      id: row.id,
      ruleId: row.rule_id,
      walletAddress: row.wallet_address,
      alertType: row.alert_type,
      triggeredAt: row.triggered_at,
      currentValue: row.current_value,
      thresholdValue: row.threshold_value,
      message: row.message,
      notificationSent: row.notification_sent,
      notificationChannels: row.notification_channels,
      acknowledged: row.acknowledged,
      acknowledgedAt: row.acknowledged_at,
      metadata: row.metadata || {},
    };
  }

  // CRUD Operations for Alert Rules
  async createRule(input: CreateAlertRuleInput): Promise<WalletAlertRule> {
    const preset = ALERT_TYPE_PRESETS[input.alertType];
    const now = new Date().toISOString();

    const newRule: WalletAlertRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: this.userId,
      walletAddress: input.walletAddress,
      walletGroupId: input.walletGroupId,
      alertType: input.alertType,
      isEnabled: true,
      thresholdValue: input.thresholdValue ?? preset.defaultThreshold,
      thresholdPercentage: input.thresholdPercentage,
      comparisonOperator: input.comparisonOperator || preset.defaultOperator,
      notificationChannels: input.notificationChannels || ['in_app'],
      cooldownMinutes: input.cooldownMinutes ?? 60,
      triggerCount: 0,
      createdAt: now,
      updatedAt: now,
      config: {
        severity: preset.defaultSeverity,
        ...input.config,
      },
    };

    if (this.shouldUseSupabasePersistence()) {
      try {
        const { data, error } = await supabase
          .from('wallet_alert_rules')
          .insert({
            user_id: newRule.userId,
            wallet_address: newRule.walletAddress,
            wallet_group_id: newRule.walletGroupId,
            alert_type: newRule.alertType,
            is_enabled: newRule.isEnabled,
            threshold_value: newRule.thresholdValue,
            threshold_percentage: newRule.thresholdPercentage,
            comparison_operator: newRule.comparisonOperator,
            notification_channels: newRule.notificationChannels,
            cooldown_minutes: newRule.cooldownMinutes,
            config: newRule.config,
          })
          .select()
          .single();

        if (error) {
          this.disableSupabasePersistence(error);
        } else if (data) {
          newRule.id = data.id;
        }
      } catch (error) {
        this.disableSupabasePersistence(error);
      }
    }

    this.rules.push(newRule);
    this.saveToStorage();
    return newRule;
  }

  async updateRule(ruleId: string, input: UpdateAlertRuleInput): Promise<WalletAlertRule | null> {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return null;

    const updatedRule: WalletAlertRule = {
      ...this.rules[index],
      ...input,
      config: { ...this.rules[index].config, ...input.config },
      updatedAt: new Date().toISOString(),
    };

    if (this.shouldUseSupabasePersistence()) {
      try {
        const { error } = await supabase
          .from('wallet_alert_rules')
          .update({
            is_enabled: updatedRule.isEnabled,
            threshold_value: updatedRule.thresholdValue,
            threshold_percentage: updatedRule.thresholdPercentage,
            comparison_operator: updatedRule.comparisonOperator,
            notification_channels: updatedRule.notificationChannels,
            cooldown_minutes: updatedRule.cooldownMinutes,
            config: updatedRule.config,
            updated_at: updatedRule.updatedAt,
          })
          .eq('id', ruleId);

        if (error) this.disableSupabasePersistence(error);
      } catch (error) {
        this.disableSupabasePersistence(error);
      }
    }

    this.rules[index] = updatedRule;
    this.saveToStorage();
    return updatedRule;
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;

    if (this.shouldUseSupabasePersistence()) {
      try {
        const { error } = await supabase
          .from('wallet_alert_rules')
          .delete()
          .eq('id', ruleId);

        if (error) this.disableSupabasePersistence(error);
      } catch (error) {
        this.disableSupabasePersistence(error);
      }
    }

    this.rules.splice(index, 1);
    this.saveToStorage();
    return true;
  }

  async toggleRule(ruleId: string): Promise<WalletAlertRule | null> {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return null;

    return this.updateRule(ruleId, { isEnabled: !rule.isEnabled });
  }

  // Get rules
  getRules(): WalletAlertRule[] {
    return [...this.rules];
  }

  getRulesForWallet(walletAddress: string): WalletAlertRule[] {
    return this.rules.filter(r => 
      r.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
  }

  getRulesForGroup(groupId: string): WalletAlertRule[] {
    return this.rules.filter(r => r.walletGroupId === groupId);
  }

  // Get history
  getHistory(limit: number = 50): WalletAlertHistory[] {
    return this.history.slice(0, limit);
  }

  getHistoryForWallet(walletAddress: string, limit: number = 20): WalletAlertHistory[] {
    return this.history
      .filter(h => h.walletAddress.toLowerCase() === walletAddress.toLowerCase())
      .slice(0, limit);
  }

  // Get notifications
  getNotifications(): AlertNotification[] {
    return [...this.notifications];
  }

  getUnreadNotifications(): AlertNotification[] {
    return this.notifications.filter(n => !n.isRead);
  }

  markNotificationRead(notificationId: string) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.isRead = true;
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  markAllNotificationsRead() {
    this.notifications.forEach(n => n.isRead = true);
    this.saveToStorage();
    this.notifyListeners();
  }

  clearNotifications() {
    this.notifications = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  // Acknowledge alert
  async acknowledgeAlert(historyId: string): Promise<boolean> {
    const index = this.history.findIndex(h => h.id === historyId);
    if (index === -1) return false;

    this.history[index].acknowledged = true;
    this.history[index].acknowledgedAt = new Date().toISOString();

    if (this.shouldUseSupabasePersistence()) {
      try {
        const { error } = await supabase
          .from('wallet_alert_history')
          .update({
            acknowledged: true,
            acknowledged_at: this.history[index].acknowledgedAt,
          })
          .eq('id', historyId);

        if (error) this.disableSupabasePersistence(error);
      } catch (error) {
        this.disableSupabasePersistence(error);
      }
    }

    this.saveToStorage();
    return true;
  }

  // Get summary
  getSummary(): WalletAlertSummary {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const triggeredToday = this.history.filter(h => 
      new Date(h.triggeredAt) >= today
    ).length;

    const unacknowledged = this.history.filter(h => !h.acknowledged).length;

    const criticalAlerts = this.history.filter(h => 
      h.metadata.severity === 'critical' && !h.acknowledged
    ).length;

    const warningAlerts = this.history.filter(h => 
      h.metadata.severity === 'warning' && !h.acknowledged
    ).length;

    return {
      totalRules: this.rules.length,
      activeRules: this.rules.filter(r => r.isEnabled).length,
      triggeredToday,
      unacknowledged,
      criticalAlerts,
      warningAlerts,
      lastAlertTime: this.history[0]?.triggeredAt,
    };
  }

  // Monitoring - Check wallets against rules
  async checkWallet(wallet: ConnectedWallet): Promise<WalletAlertHistory[]> {
    const triggeredAlerts: WalletAlertHistory[] = [];
    const rules = this.getRulesForWallet(wallet.address);
    const currentBalance = parseFloat(wallet.balance);

    for (const rule of rules) {
      if (!rule.isEnabled) continue;

      // Check cooldown
      if (rule.lastTriggeredAt) {
        const lastTriggered = new Date(rule.lastTriggeredAt).getTime();
        const cooldownMs = rule.cooldownMinutes * 60 * 1000;
        if (Date.now() - lastTriggered < cooldownMs) continue;
      }

      let shouldTrigger = false;
      let message = '';
      let severity: AlertSeverity = rule.config.severity || 'warning';

      switch (rule.alertType) {
        case 'low_balance': {
          shouldTrigger = this.checkThreshold(currentBalance, rule.thresholdValue || 0, rule.comparisonOperator);
          if (shouldTrigger) {
            message = `Wallet balance (${currentBalance.toFixed(4)} ETH) is below threshold (${rule.thresholdValue} ETH)`;
            severity = 'critical';
          }
          break;
        }

        case 'balance_change': {
          const cached = this.walletBalanceCache.get(wallet.address.toLowerCase());
          if (cached) {
            const changePercent = ((currentBalance - cached.balance) / cached.balance) * 100;
            const thresholdPercent = rule.thresholdPercentage || 10;
            
            if (Math.abs(changePercent) >= thresholdPercent) {
              const direction = changePercent > 0 ? 'increased' : 'decreased';
              shouldTrigger = true;
              message = `Wallet balance ${direction} by ${Math.abs(changePercent).toFixed(2)}% (${cached.balance.toFixed(4)} → ${currentBalance.toFixed(4)} ETH)`;
              severity = changePercent < 0 ? 'warning' : 'info';
            }
          }
          break;
        }

        case 'gas_reserve': {
          const minGasReserve = rule.config.minGasReserveETH || rule.thresholdValue || 0.01;
          shouldTrigger = currentBalance < minGasReserve;
          if (shouldTrigger) {
            message = `Gas reserve (${currentBalance.toFixed(4)} ETH) is below minimum (${minGasReserve} ETH). Transactions may fail.`;
            severity = 'critical';
          }
          break;
        }
      }

      if (shouldTrigger) {
        const alertHistory = await this.triggerAlert(rule, wallet, currentBalance, message, severity);
        triggeredAlerts.push(alertHistory);
      }
    }

    // Update balance cache
    this.walletBalanceCache.set(wallet.address.toLowerCase(), {
      balance: currentBalance,
      timestamp: Date.now(),
    });

    return triggeredAlerts;
  }

  private checkThreshold(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  private async triggerAlert(
    rule: WalletAlertRule,
    wallet: ConnectedWallet,
    currentValue: number,
    message: string,
    severity: AlertSeverity
  ): Promise<WalletAlertHistory> {
    const now = new Date().toISOString();

    // Create history entry
    const historyEntry: WalletAlertHistory = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      walletAddress: wallet.address,
      alertType: rule.alertType,
      triggeredAt: now,
      currentValue,
      thresholdValue: rule.thresholdValue || 0,
      message,
      notificationSent: false,
      notificationChannels: rule.notificationChannels,
      acknowledged: false,
      metadata: {
        walletName: wallet.name,
        severity,
        chainId: wallet.chainId,
      },
    };

    // Save to database
    if (this.shouldUseSupabasePersistence()) {
      try {
        const { data, error } = await supabase
          .from('wallet_alert_history')
          .insert({
            rule_id: rule.id,
            wallet_address: wallet.address,
            alert_type: rule.alertType,
            current_value: currentValue,
            threshold_value: rule.thresholdValue,
            message,
            notification_channels: rule.notificationChannels,
            metadata: historyEntry.metadata,
          })
          .select()
          .single();

        if (error) {
          this.disableSupabasePersistence(error);
        } else if (data) {
          historyEntry.id = data.id;
        }

        if (!this.supabasePersistenceDisabled) {
          const { error: updateError } = await supabase
            .from('wallet_alert_rules')
            .update({
              last_triggered_at: now,
              trigger_count: rule.triggerCount + 1,
            })
            .eq('id', rule.id);

          if (updateError) this.disableSupabasePersistence(updateError);
        }
      } catch (error) {
        this.disableSupabasePersistence(error);
      }
    }

    // Update local state
    this.history.unshift(historyEntry);
    rule.lastTriggeredAt = now;
    rule.triggerCount++;

    // Create notification
    const notification: AlertNotification = {
      id: `notif-${Date.now()}`,
      alertHistoryId: historyEntry.id,
      title: this.getAlertTitle(rule.alertType, severity),
      message,
      severity,
      timestamp: now,
      walletAddress: wallet.address,
      walletName: wallet.name,
      alertType: rule.alertType,
      currentValue,
      thresholdValue: rule.thresholdValue || 0,
      isRead: false,
      actions: [
        { id: 'ack', label: 'Acknowledge', type: 'acknowledge' },
        { id: 'view', label: 'View Details', type: 'view' },
      ],
    };

    this.notifications.unshift(notification);
    this.saveToStorage();
    this.notifyListeners();

    // Send notifications
    await this.sendNotifications(rule, notification);

    return historyEntry;
  }

  private getAlertTitle(alertType: AlertType, severity: AlertSeverity): string {
    const severityLabel = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
    const typeLabels: Record<AlertType, string> = {
      low_balance: 'Low Balance Alert',
      balance_change: 'Balance Change Alert',
      gas_reserve: 'Gas Reserve Alert',
      custom: 'Custom Alert',
    };
    return `${severityLabel} ${typeLabels[alertType]}`;
  }

  private async sendNotifications(rule: WalletAlertRule, notification: AlertNotification) {
    for (const channel of rule.notificationChannels) {
      try {
        switch (channel) {
          case 'telegram':
            await this.sendTelegramNotification(notification);
            break;
          case 'in_app':
            // Already handled by adding to notifications array
            break;
          case 'webhook':
            // Webhook implementation would go here
            break;
        }
      } catch (error) {
        console.error(`Failed to send ${channel} notification:`, error);
      }
    }
  }

  private async sendTelegramNotification(notification: AlertNotification) {
    const linkStatus = telegramService.getLinkStatus();
    if (!linkStatus.isLinked) return;

    const message = `${notification.title}\n\n` +
      `Wallet: ${notification.walletName || notification.walletAddress.slice(0, 10)}...\n` +
      `${notification.message}\n\n` +
      `Current: ${notification.currentValue.toFixed(4)} ETH\n` +
      `Threshold: ${notification.thresholdValue.toFixed(4)} ETH`;

    await telegramService.sendSystemNotification(message);
  }

  // Start monitoring
  startMonitoring(wallets: ConnectedWallet[], intervalMs: number = 30000) {
    this.stopMonitoring();

    // Initial check
    wallets.forEach(wallet => this.checkWallet(wallet));

    // Set up interval
    this.monitoringInterval = setInterval(() => {
      wallets.forEach(wallet => this.checkWallet(wallet));
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Quick setup helpers
  async setupLowBalanceAlert(
    walletAddress: string,
    threshold: number = 0.1,
    channels: NotificationChannel[] = ['in_app']
  ): Promise<WalletAlertRule> {
    return this.createRule({
      walletAddress,
      alertType: 'low_balance',
      thresholdValue: threshold,
      comparisonOperator: 'lt',
      notificationChannels: channels,
      config: {
        name: 'Low Balance Alert',
        severity: 'critical',
      },
    });
  }

  async setupBalanceChangeAlert(
    walletAddress: string,
    percentageThreshold: number = 10,
    channels: NotificationChannel[] = ['in_app']
  ): Promise<WalletAlertRule> {
    return this.createRule({
      walletAddress,
      alertType: 'balance_change',
      thresholdPercentage: percentageThreshold,
      comparisonOperator: 'change',
      notificationChannels: channels,
      config: {
        name: 'Balance Change Alert',
        severity: 'warning',
        changeDirection: 'both',
      },
    });
  }

  async setupGasReserveAlert(
    walletAddress: string,
    minReserve: number = 0.01,
    channels: NotificationChannel[] = ['in_app']
  ): Promise<WalletAlertRule> {
    return this.createRule({
      walletAddress,
      alertType: 'gas_reserve',
      thresholdValue: minReserve,
      comparisonOperator: 'lt',
      notificationChannels: channels,
      config: {
        name: 'Gas Reserve Alert',
        severity: 'critical',
        minGasReserveETH: minReserve,
      },
    });
  }
}

export const walletAlertService = new WalletAlertService();
