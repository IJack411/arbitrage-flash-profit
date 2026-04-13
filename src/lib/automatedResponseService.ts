/**
 * Automated Response Service
 * Handles automatic actions when specific alerts trigger
 * Includes audit logging for all automated actions
 */

import { adminAlertService, AdminAlert, AlertType, AlertSeverity } from './adminAlertService';

export type ActionType = 
  | 'suspend_wallet'
  | 'pause_trading'
  | 'restrict_user'
  | 'scale_service'
  | 'enable_rate_limit'
  | 'block_ip'
  | 'notify_team'
  | 'create_incident'
  | 'rollback_config'
  | 'enable_maintenance';

export type ActionStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back';

export interface ResponseAction {
  id: string;
  type: ActionType;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  isReversible: boolean;
  reverseAction?: ActionType;
  cooldownMinutes: number;
  requiresApproval: boolean;
}

export interface ResponseRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  alertType: AlertType;
  severityThreshold: AlertSeverity;
  conditions: RuleCondition[];
  actions: ResponseAction[];
  createdAt: string;
  updatedAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

export interface RuleCondition {
  id: string;
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'not_equals';
  value: string | number | boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  ruleId: string;
  ruleName: string;
  alertId: string;
  alertType: AlertType;
  alertSeverity: AlertSeverity;
  actions: ExecutedAction[];
  status: 'success' | 'partial' | 'failed';
  triggeredBy: 'automated' | 'manual';
  operator?: string;
  notes?: string;
  rollbackAt?: string;
  rollbackBy?: string;
}

export interface ExecutedAction {
  id: string;
  actionType: ActionType;
  actionName: string;
  status: ActionStatus;
  startedAt: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
  targetEntity?: string;
  targetId?: string;
}

type AuditLogListener = (logs: AuditLogEntry[]) => void;
type RuleListener = (rules: ResponseRule[]) => void;

class AutomatedResponseService {
  private rules: ResponseRule[] = [];
  private auditLog: AuditLogEntry[] = [];
  private auditListeners: Set<AuditLogListener> = new Set();
  private ruleListeners: Set<RuleListener> = new Set();
  private lastActionTimes: Map<string, number> = new Map();
  private isEnabled: boolean = true;

  constructor() {
    this.loadDefaultRules();
    this.loadMockAuditLog();
    this.subscribeToAlerts();
  }

  private loadDefaultRules(): void {
    this.rules = [
      {
        id: 'rule-1',
        name: 'Auto-Suspend High-Risk Wallets',
        description: 'Automatically suspend wallets with risk scores above 90',
        enabled: true,
        alertType: 'high_risk_wallet',
        severityThreshold: 'critical',
        conditions: [
          { id: 'cond-1', field: 'riskScore', operator: 'greater_than', value: 90 }
        ],
        actions: [
          {
            id: 'action-1',
            type: 'suspend_wallet',
            name: 'Suspend Wallet',
            description: 'Immediately suspend the flagged wallet from all trading activities',
            parameters: { suspensionDuration: 24, notifyUser: true },
            isReversible: true,
            reverseAction: 'suspend_wallet',
            cooldownMinutes: 60,
            requiresApproval: false,
          },
          {
            id: 'action-2',
            type: 'notify_team',
            name: 'Notify Security Team',
            description: 'Send notification to security team via Slack',
            parameters: { channel: '#security-alerts', priority: 'high' },
            isReversible: false,
            cooldownMinutes: 5,
            requiresApproval: false,
          }
        ],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        lastTriggered: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        triggerCount: 15,
      },
      {
        id: 'rule-2',
        name: 'Pause Trading on Unusual Volume',
        description: 'Pause trading for users with volume spikes above 500%',
        enabled: true,
        alertType: 'unusual_trading',
        severityThreshold: 'warning',
        conditions: [
          { id: 'cond-2', field: 'percentIncrease', operator: 'greater_than', value: 500 }
        ],
        actions: [
          {
            id: 'action-3',
            type: 'pause_trading',
            name: 'Pause User Trading',
            description: 'Temporarily pause trading for the affected user',
            parameters: { pauseDuration: 30, allowWithdrawals: true },
            isReversible: true,
            reverseAction: 'pause_trading',
            cooldownMinutes: 30,
            requiresApproval: false,
          },
          {
            id: 'action-4',
            type: 'create_incident',
            name: 'Create Incident Ticket',
            description: 'Create an incident ticket for manual review',
            parameters: { priority: 'medium', assignTo: 'trading-team' },
            isReversible: false,
            cooldownMinutes: 15,
            requiresApproval: false,
          }
        ],
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        lastTriggered: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        triggerCount: 8,
      },
      {
        id: 'rule-3',
        name: 'Scale Services on Performance Degradation',
        description: 'Auto-scale services when latency exceeds thresholds',
        enabled: true,
        alertType: 'service_degraded',
        severityThreshold: 'warning',
        conditions: [
          { id: 'cond-3', field: 'currentLatency', operator: 'greater_than', value: 800 }
        ],
        actions: [
          {
            id: 'action-5',
            type: 'scale_service',
            name: 'Scale Up Service',
            description: 'Increase service replicas to handle load',
            parameters: { scaleBy: 2, maxReplicas: 10 },
            isReversible: true,
            reverseAction: 'scale_service',
            cooldownMinutes: 10,
            requiresApproval: false,
          }
        ],
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        triggerCount: 23,
      },
      {
        id: 'rule-4',
        name: 'Block IP on Security Breach',
        description: 'Block IP addresses with multiple failed login attempts',
        enabled: true,
        alertType: 'security_breach',
        severityThreshold: 'critical',
        conditions: [
          { id: 'cond-4', field: 'attempts', operator: 'greater_than', value: 5 }
        ],
        actions: [
          {
            id: 'action-6',
            type: 'block_ip',
            name: 'Block IP Address',
            description: 'Add IP to blocklist for 24 hours',
            parameters: { blockDuration: 24, logReason: true },
            isReversible: true,
            reverseAction: 'block_ip',
            cooldownMinutes: 5,
            requiresApproval: false,
          },
          {
            id: 'action-7',
            type: 'notify_team',
            name: 'Alert Security Team',
            description: 'Immediate notification to security team',
            parameters: { channel: '#security-critical', priority: 'urgent' },
            isReversible: false,
            cooldownMinutes: 1,
            requiresApproval: false,
          }
        ],
        createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        lastTriggered: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        triggerCount: 42,
      },
      {
        id: 'rule-5',
        name: 'Enable Rate Limiting on System Overload',
        description: 'Enable strict rate limiting when CPU usage is critical',
        enabled: false,
        alertType: 'system_health',
        severityThreshold: 'critical',
        conditions: [
          { id: 'cond-5', field: 'currentUsage', operator: 'greater_than', value: 95 }
        ],
        actions: [
          {
            id: 'action-8',
            type: 'enable_rate_limit',
            name: 'Enable Strict Rate Limiting',
            description: 'Reduce API rate limits to protect system stability',
            parameters: { limitReduction: 50, duration: 15 },
            isReversible: true,
            reverseAction: 'enable_rate_limit',
            cooldownMinutes: 15,
            requiresApproval: true,
          },
          {
            id: 'action-9',
            type: 'notify_team',
            name: 'Notify Operations Team',
            description: 'Alert ops team about system overload',
            parameters: { channel: '#ops-alerts', priority: 'critical' },
            isReversible: false,
            cooldownMinutes: 5,
            requiresApproval: false,
          }
        ],
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        triggerCount: 3,
      },
      {
        id: 'rule-6',
        name: 'Restrict User on Suspicious Activity',
        description: 'Restrict user access when flagged for suspicious behavior',
        enabled: true,
        alertType: 'user_flagged',
        severityThreshold: 'warning',
        conditions: [],
        actions: [
          {
            id: 'action-10',
            type: 'restrict_user',
            name: 'Restrict User Access',
            description: 'Limit user to view-only mode pending review',
            parameters: { restrictionLevel: 'view_only', notifyUser: true },
            isReversible: true,
            reverseAction: 'restrict_user',
            cooldownMinutes: 60,
            requiresApproval: false,
          },
          {
            id: 'action-11',
            type: 'create_incident',
            name: 'Create Review Ticket',
            description: 'Create ticket for compliance team review',
            parameters: { priority: 'high', assignTo: 'compliance-team' },
            isReversible: false,
            cooldownMinutes: 30,
            requiresApproval: false,
          }
        ],
        createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        lastTriggered: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        triggerCount: 11,
      },
    ];
  }

  private loadMockAuditLog(): void {
    const now = Date.now();
    
    this.auditLog = [
      {
        id: 'audit-1',
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        ruleId: 'rule-1',
        ruleName: 'Auto-Suspend High-Risk Wallets',
        alertId: 'alert-2',
        alertType: 'high_risk_wallet',
        alertSeverity: 'critical',
        actions: [
          {
            id: 'exec-1',
            actionType: 'suspend_wallet',
            actionName: 'Suspend Wallet',
            status: 'completed',
            startedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(now - 2 * 60 * 60 * 1000 + 1500).toISOString(),
            result: { walletAddress: '0x7a3b...9f2c', suspended: true },
            targetEntity: 'wallet',
            targetId: '0x7a3b...9f2c',
          },
          {
            id: 'exec-2',
            actionType: 'notify_team',
            actionName: 'Notify Security Team',
            status: 'completed',
            startedAt: new Date(now - 2 * 60 * 60 * 1000 + 1500).toISOString(),
            completedAt: new Date(now - 2 * 60 * 60 * 1000 + 2000).toISOString(),
            result: { notificationSent: true, channel: '#security-alerts' },
          }
        ],
        status: 'success',
        triggeredBy: 'automated',
      },
      {
        id: 'audit-2',
        timestamp: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
        ruleId: 'rule-2',
        ruleName: 'Pause Trading on Unusual Volume',
        alertId: 'alert-3',
        alertType: 'unusual_trading',
        alertSeverity: 'warning',
        actions: [
          {
            id: 'exec-3',
            actionType: 'pause_trading',
            actionName: 'Pause User Trading',
            status: 'completed',
            startedAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(now - 5 * 60 * 60 * 1000 + 800).toISOString(),
            result: { userId: 'user-123', tradingPaused: true },
            targetEntity: 'user',
            targetId: 'user-123',
          },
          {
            id: 'exec-4',
            actionType: 'create_incident',
            actionName: 'Create Incident Ticket',
            status: 'completed',
            startedAt: new Date(now - 5 * 60 * 60 * 1000 + 800).toISOString(),
            completedAt: new Date(now - 5 * 60 * 60 * 1000 + 1200).toISOString(),
            result: { ticketId: 'INC-2024-0542', priority: 'medium' },
          }
        ],
        status: 'success',
        triggeredBy: 'automated',
      },
      {
        id: 'audit-3',
        timestamp: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
        ruleId: 'rule-4',
        ruleName: 'Block IP on Security Breach',
        alertId: 'alert-6',
        alertType: 'security_breach',
        alertSeverity: 'critical',
        actions: [
          {
            id: 'exec-5',
            actionType: 'block_ip',
            actionName: 'Block IP Address',
            status: 'completed',
            startedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(now - 8 * 60 * 60 * 1000 + 500).toISOString(),
            result: { ipAddress: '192.168.1.100', blocked: true, duration: '24h' },
            targetEntity: 'ip',
            targetId: '192.168.1.100',
          },
          {
            id: 'exec-6',
            actionType: 'notify_team',
            actionName: 'Alert Security Team',
            status: 'completed',
            startedAt: new Date(now - 8 * 60 * 60 * 1000 + 500).toISOString(),
            completedAt: new Date(now - 8 * 60 * 60 * 1000 + 800).toISOString(),
            result: { notificationSent: true, channel: '#security-critical' },
          }
        ],
        status: 'success',
        triggeredBy: 'automated',
      },
      {
        id: 'audit-4',
        timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
        ruleId: 'rule-6',
        ruleName: 'Restrict User on Suspicious Activity',
        alertId: 'alert-8',
        alertType: 'user_flagged',
        alertSeverity: 'warning',
        actions: [
          {
            id: 'exec-7',
            actionType: 'restrict_user',
            actionName: 'Restrict User Access',
            status: 'completed',
            startedAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(now - 12 * 60 * 60 * 1000 + 600).toISOString(),
            result: { userId: 'user-42', restrictionLevel: 'view_only' },
            targetEntity: 'user',
            targetId: 'user-42',
          },
          {
            id: 'exec-8',
            actionType: 'create_incident',
            actionName: 'Create Review Ticket',
            status: 'failed',
            startedAt: new Date(now - 12 * 60 * 60 * 1000 + 600).toISOString(),
            completedAt: new Date(now - 12 * 60 * 60 * 1000 + 1000).toISOString(),
            error: 'Ticket system temporarily unavailable',
          }
        ],
        status: 'partial',
        triggeredBy: 'automated',
        notes: 'Ticket creation failed, manual follow-up required',
      },
      {
        id: 'audit-5',
        timestamp: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        ruleId: 'rule-3',
        ruleName: 'Scale Services on Performance Degradation',
        alertId: 'alert-service-1',
        alertType: 'service_degraded',
        alertSeverity: 'warning',
        actions: [
          {
            id: 'exec-9',
            actionType: 'scale_service',
            actionName: 'Scale Up Service',
            status: 'completed',
            startedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(now - 24 * 60 * 60 * 1000 + 15000).toISOString(),
            result: { service: 'api-gateway', previousReplicas: 3, newReplicas: 6 },
            targetEntity: 'service',
            targetId: 'api-gateway',
          }
        ],
        status: 'success',
        triggeredBy: 'automated',
        rollbackAt: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
        rollbackBy: 'admin@platform.com',
      },
      {
        id: 'audit-6',
        timestamp: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
        ruleId: 'rule-1',
        ruleName: 'Auto-Suspend High-Risk Wallets',
        alertId: 'alert-wallet-old',
        alertType: 'high_risk_wallet',
        alertSeverity: 'critical',
        actions: [
          {
            id: 'exec-10',
            actionType: 'suspend_wallet',
            actionName: 'Suspend Wallet',
            status: 'completed',
            startedAt: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(now - 36 * 60 * 60 * 1000 + 1200).toISOString(),
            result: { walletAddress: '0xabc1...def2', suspended: true },
            targetEntity: 'wallet',
            targetId: '0xabc1...def2',
          },
          {
            id: 'exec-11',
            actionType: 'notify_team',
            actionName: 'Notify Security Team',
            status: 'completed',
            startedAt: new Date(now - 36 * 60 * 60 * 1000 + 1200).toISOString(),
            completedAt: new Date(now - 36 * 60 * 60 * 1000 + 1800).toISOString(),
            result: { notificationSent: true },
          }
        ],
        status: 'success',
        triggeredBy: 'manual',
        operator: 'admin@platform.com',
      },
    ];
  }

  private subscribeToAlerts(): void {
    adminAlertService.subscribe((alerts) => {
      if (!this.isEnabled) return;
      
      // Check for new alerts that match our rules
      const recentAlerts = alerts.filter(
        a => new Date(a.timestamp).getTime() > Date.now() - 60000 && !a.isRead
      );
      
      for (const alert of recentAlerts) {
        this.evaluateRulesForAlert(alert);
      }
    });
  }

  private evaluateRulesForAlert(alert: AdminAlert): void {
    const matchingRules = this.rules.filter(rule => 
      rule.enabled && 
      rule.alertType === alert.type &&
      this.severityMeetsThreshold(alert.severity, rule.severityThreshold) &&
      this.evaluateConditions(rule.conditions, alert.details || {})
    );

    for (const rule of matchingRules) {
      // Check cooldown
      const lastTrigger = this.lastActionTimes.get(rule.id);
      const minCooldown = Math.min(...rule.actions.map(a => a.cooldownMinutes)) * 60 * 1000;
      
      if (lastTrigger && Date.now() - lastTrigger < minCooldown) {
        continue; // Still in cooldown
      }

      this.executeRule(rule, alert);
    }
  }

  private severityMeetsThreshold(alertSeverity: AlertSeverity, threshold: AlertSeverity): boolean {
    const severityOrder = { info: 0, warning: 1, critical: 2 };
    return severityOrder[alertSeverity] >= severityOrder[threshold];
  }

  private evaluateConditions(conditions: RuleCondition[], details: Record<string, unknown>): boolean {
    if (conditions.length === 0) return true;

    return conditions.every(condition => {
      const value = details[condition.field];
      if (value === undefined) return false;

      switch (condition.operator) {
        case 'equals':
          return value === condition.value;
        case 'not_equals':
          return value !== condition.value;
        case 'greater_than':
          return typeof value === 'number' && value > (condition.value as number);
        case 'less_than':
          return typeof value === 'number' && value < (condition.value as number);
        case 'contains':
          return typeof value === 'string' && value.includes(condition.value as string);
        default:
          return false;
      }
    });
  }

  private async executeRule(rule: ResponseRule, alert: AdminAlert): Promise<void> {
    const executedActions: ExecutedAction[] = [];
    let overallStatus: 'success' | 'partial' | 'failed' = 'success';

    for (const action of rule.actions) {
      if (action.requiresApproval) {
        // Skip actions requiring approval in automated mode
        continue;
      }

      const executedAction = await this.executeAction(action, alert);
      executedActions.push(executedAction);

      if (executedAction.status === 'failed') {
        overallStatus = executedActions.some(a => a.status === 'completed') ? 'partial' : 'failed';
      }
    }

    // Update rule stats
    rule.lastTriggered = new Date().toISOString();
    rule.triggerCount++;
    this.lastActionTimes.set(rule.id, Date.now());

    // Create audit log entry
    const auditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ruleId: rule.id,
      ruleName: rule.name,
      alertId: alert.id,
      alertType: alert.type,
      alertSeverity: alert.severity,
      actions: executedActions,
      status: overallStatus,
      triggeredBy: 'automated',
    };

    this.auditLog.unshift(auditEntry);
    this.notifyAuditListeners();
    this.notifyRuleListeners();
  }

  private async executeAction(action: ResponseAction, alert: AdminAlert): Promise<ExecutedAction> {
    const startedAt = new Date().toISOString();
    
    // Simulate action execution
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    const success = Math.random() > 0.1; // 90% success rate for simulation

    const executedAction: ExecutedAction = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      actionType: action.type,
      actionName: action.name,
      status: success ? 'completed' : 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
    };

    if (success) {
      executedAction.result = this.generateActionResult(action, alert);
      executedAction.targetEntity = this.getTargetEntity(action.type);
      executedAction.targetId = this.getTargetId(action.type, alert);
    } else {
      executedAction.error = 'Action execution failed: Service temporarily unavailable';
    }

    return executedAction;
  }

  private generateActionResult(action: ResponseAction, alert: AdminAlert): Record<string, unknown> {
    switch (action.type) {
      case 'suspend_wallet':
        return { walletAddress: alert.details?.walletAddress || '0x...', suspended: true };
      case 'pause_trading':
        return { userId: alert.details?.userId || 'user-xxx', tradingPaused: true };
      case 'restrict_user':
        return { userId: alert.details?.userId || 'user-xxx', restrictionLevel: action.parameters.restrictionLevel };
      case 'scale_service':
        return { service: alert.details?.service || 'api-gateway', scaled: true, newReplicas: action.parameters.scaleBy };
      case 'block_ip':
        return { ipAddress: alert.details?.ipAddress || '0.0.0.0', blocked: true };
      case 'notify_team':
        return { notificationSent: true, channel: action.parameters.channel };
      case 'create_incident':
        return { ticketId: `INC-${Date.now()}`, priority: action.parameters.priority };
      default:
        return { executed: true };
    }
  }

  private getTargetEntity(actionType: ActionType): string {
    switch (actionType) {
      case 'suspend_wallet': return 'wallet';
      case 'pause_trading':
      case 'restrict_user': return 'user';
      case 'scale_service': return 'service';
      case 'block_ip': return 'ip';
      default: return 'system';
    }
  }

  private getTargetId(actionType: ActionType, alert: AdminAlert): string {
    switch (actionType) {
      case 'suspend_wallet': return alert.details?.walletAddress || '';
      case 'pause_trading':
      case 'restrict_user': return alert.details?.userId || '';
      case 'scale_service': return alert.details?.service || '';
      case 'block_ip': return alert.details?.ipAddress || '';
      default: return '';
    }
  }

  private notifyAuditListeners(): void {
    this.auditListeners.forEach(listener => listener([...this.auditLog]));
  }

  private notifyRuleListeners(): void {
    this.ruleListeners.forEach(listener => listener([...this.rules]));
  }

  // Public API
  subscribeToAuditLog(listener: AuditLogListener): () => void {
    this.auditListeners.add(listener);
    return () => this.auditListeners.delete(listener);
  }

  subscribeToRules(listener: RuleListener): () => void {
    this.ruleListeners.add(listener);
    return () => this.ruleListeners.delete(listener);
  }

  getRules(): ResponseRule[] {
    return [...this.rules];
  }

  getRule(ruleId: string): ResponseRule | undefined {
    return this.rules.find(r => r.id === ruleId);
  }

  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  getAuditLogByRule(ruleId: string): AuditLogEntry[] {
    return this.auditLog.filter(entry => entry.ruleId === ruleId);
  }

  getAuditLogByAlertType(alertType: AlertType): AuditLogEntry[] {
    return this.auditLog.filter(entry => entry.alertType === alertType);
  }

  isAutomationEnabled(): boolean {
    return this.isEnabled;
  }

  setAutomationEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  toggleRule(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      rule.updatedAt = new Date().toISOString();
      this.notifyRuleListeners();
    }
  }

  updateRule(ruleId: string, updates: Partial<ResponseRule>): void {
    const ruleIndex = this.rules.findIndex(r => r.id === ruleId);
    if (ruleIndex !== -1) {
      this.rules[ruleIndex] = {
        ...this.rules[ruleIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.notifyRuleListeners();
    }
  }

  createRule(rule: Omit<ResponseRule, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): ResponseRule {
    const newRule: ResponseRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      triggerCount: 0,
    };
    this.rules.push(newRule);
    this.notifyRuleListeners();
    return newRule;
  }

  deleteRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
    this.notifyRuleListeners();
  }

  // Manual trigger for testing
  async manualTrigger(ruleId: string, alert: AdminAlert, operator: string): Promise<AuditLogEntry | null> {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return null;

    const executedActions: ExecutedAction[] = [];
    let overallStatus: 'success' | 'partial' | 'failed' = 'success';

    for (const action of rule.actions) {
      const executedAction = await this.executeAction(action, alert);
      executedActions.push(executedAction);

      if (executedAction.status === 'failed') {
        overallStatus = executedActions.some(a => a.status === 'completed') ? 'partial' : 'failed';
      }
    }

    const auditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ruleId: rule.id,
      ruleName: rule.name,
      alertId: alert.id,
      alertType: alert.type,
      alertSeverity: alert.severity,
      actions: executedActions,
      status: overallStatus,
      triggeredBy: 'manual',
      operator,
    };

    this.auditLog.unshift(auditEntry);
    this.notifyAuditListeners();

    return auditEntry;
  }

  // Rollback an action
  async rollbackAction(auditEntryId: string, operator: string): Promise<boolean> {
    const entry = this.auditLog.find(e => e.id === auditEntryId);
    if (!entry || entry.rollbackAt) return false;

    entry.rollbackAt = new Date().toISOString();
    entry.rollbackBy = operator;
    this.notifyAuditListeners();

    return true;
  }

  getActionTypeInfo(actionType: ActionType): { name: string; icon: string; color: string } {
    const actionInfo: Record<ActionType, { name: string; icon: string; color: string }> = {
      suspend_wallet: { name: 'Suspend Wallet', icon: 'Wallet', color: 'red' },
      pause_trading: { name: 'Pause Trading', icon: 'Pause', color: 'yellow' },
      restrict_user: { name: 'Restrict User', icon: 'UserX', color: 'orange' },
      scale_service: { name: 'Scale Service', icon: 'Server', color: 'blue' },
      enable_rate_limit: { name: 'Rate Limit', icon: 'Gauge', color: 'purple' },
      block_ip: { name: 'Block IP', icon: 'Shield', color: 'red' },
      notify_team: { name: 'Notify Team', icon: 'Bell', color: 'cyan' },
      create_incident: { name: 'Create Incident', icon: 'FileText', color: 'gray' },
      rollback_config: { name: 'Rollback Config', icon: 'RotateCcw', color: 'amber' },
      enable_maintenance: { name: 'Maintenance Mode', icon: 'Wrench', color: 'slate' },
    };
    return actionInfo[actionType];
  }
}

// Export singleton instance
export const automatedResponseService = new AutomatedResponseService();
