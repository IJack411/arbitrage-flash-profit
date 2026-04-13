/**
 * Admin Alert Service
 * Real-time notification system for critical platform events
 */

export type AlertType = 
  | 'system_health'
  | 'high_risk_wallet'
  | 'unusual_trading'
  | 'fee_collection_failed'
  | 'security_breach'
  | 'service_degraded'
  | 'user_flagged'
  | 'threshold_exceeded';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AdminAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  isRead: boolean;
  isDismissed: boolean;
  source: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface AlertThreshold {
  id: string;
  type: AlertType;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
  unit: string;
  severity: AlertSeverity;
  cooldownMinutes: number; // Prevent alert spam
}

export interface AlertConfig {
  thresholds: AlertThreshold[];
  notificationPreferences: {
    soundEnabled: boolean;
    browserNotifications: boolean;
    emailAlerts: boolean;
    slackWebhook?: string;
    discordWebhook?: string;
  };
  autoRefreshInterval: number; // in seconds
}

type AlertListener = (alerts: AdminAlert[]) => void;

class AdminAlertService {
  private alerts: AdminAlert[] = [];
  private config: AlertConfig;
  private listeners: Set<AlertListener> = new Set();
  private lastAlertTimes: Map<AlertType, number> = new Map();
  private simulationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = this.getDefaultConfig();
    this.loadMockAlerts();
    this.startAlertSimulation();
  }

  private getDefaultConfig(): AlertConfig {
    return {
      thresholds: [
        {
          id: 'th-1',
          type: 'system_health',
          name: 'CPU Usage',
          description: 'Alert when CPU usage exceeds threshold',
          enabled: true,
          threshold: 80,
          unit: '%',
          severity: 'warning',
          cooldownMinutes: 5,
        },
        {
          id: 'th-2',
          type: 'system_health',
          name: 'Memory Usage',
          description: 'Alert when memory usage exceeds threshold',
          enabled: true,
          threshold: 85,
          unit: '%',
          severity: 'warning',
          cooldownMinutes: 5,
        },
        {
          id: 'th-3',
          type: 'system_health',
          name: 'Error Rate',
          description: 'Alert when error rate exceeds threshold',
          enabled: true,
          threshold: 5,
          unit: '%',
          severity: 'critical',
          cooldownMinutes: 2,
        },
        {
          id: 'th-4',
          type: 'high_risk_wallet',
          name: 'Risk Score',
          description: 'Alert when wallet risk score exceeds threshold',
          enabled: true,
          threshold: 75,
          unit: 'score',
          severity: 'warning',
          cooldownMinutes: 10,
        },
        {
          id: 'th-5',
          type: 'unusual_trading',
          name: 'Volume Spike',
          description: 'Alert when trading volume spikes above normal',
          enabled: true,
          threshold: 300,
          unit: '% of avg',
          severity: 'warning',
          cooldownMinutes: 15,
        },
        {
          id: 'th-6',
          type: 'unusual_trading',
          name: 'Failed Trades',
          description: 'Alert when consecutive failed trades exceed threshold',
          enabled: true,
          threshold: 5,
          unit: 'trades',
          severity: 'critical',
          cooldownMinutes: 5,
        },
        {
          id: 'th-7',
          type: 'fee_collection_failed',
          name: 'Fee Failures',
          description: 'Alert when fee collection failures exceed threshold',
          enabled: true,
          threshold: 3,
          unit: 'failures',
          severity: 'critical',
          cooldownMinutes: 5,
        },
        {
          id: 'th-8',
          type: 'service_degraded',
          name: 'Service Latency',
          description: 'Alert when service latency exceeds threshold',
          enabled: true,
          threshold: 500,
          unit: 'ms',
          severity: 'warning',
          cooldownMinutes: 3,
        },
        {
          id: 'th-9',
          type: 'security_breach',
          name: 'Failed Logins',
          description: 'Alert on multiple failed login attempts',
          enabled: true,
          threshold: 5,
          unit: 'attempts',
          severity: 'critical',
          cooldownMinutes: 1,
        },
        {
          id: 'th-10',
          type: 'user_flagged',
          name: 'Suspicious Activity',
          description: 'Alert when user activity is flagged as suspicious',
          enabled: true,
          threshold: 1,
          unit: 'events',
          severity: 'warning',
          cooldownMinutes: 10,
        },
      ],
      notificationPreferences: {
        soundEnabled: true,
        browserNotifications: true,
        emailAlerts: false,
      },
      autoRefreshInterval: 30,
    };
  }

  private loadMockAlerts(): void {
    const now = Date.now();
    
    this.alerts = [
      {
        id: 'alert-1',
        type: 'system_health',
        severity: 'warning',
        title: 'High Memory Usage Detected',
        message: 'Memory usage has reached 87%, exceeding the 85% threshold.',
        details: { currentUsage: 87, threshold: 85, service: 'API Gateway' },
        timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
        isRead: false,
        isDismissed: false,
        source: 'System Monitor',
        actionUrl: '/admin?tab=health',
        actionLabel: 'View System Health',
      },
      {
        id: 'alert-2',
        type: 'high_risk_wallet',
        severity: 'critical',
        title: 'High-Risk Wallet Detected',
        message: 'Wallet 0x7a3b...9f2c has been flagged with a risk score of 92.',
        details: { walletAddress: '0x7a3b...9f2c', riskScore: 92, reason: 'Unusual transaction patterns' },
        timestamp: new Date(now - 12 * 60 * 1000).toISOString(),
        isRead: false,
        isDismissed: false,
        source: 'Risk Engine',
        actionUrl: '/admin?tab=wallets',
        actionLabel: 'Review Wallet',
      },
      {
        id: 'alert-3',
        type: 'unusual_trading',
        severity: 'warning',
        title: 'Trading Volume Spike',
        message: 'Trading volume is 450% above the 24-hour average.',
        details: { currentVolume: 2500000, avgVolume: 555555, percentIncrease: 450 },
        timestamp: new Date(now - 25 * 60 * 1000).toISOString(),
        isRead: true,
        isDismissed: false,
        source: 'Trading Monitor',
        actionUrl: '/admin?tab=overview',
        actionLabel: 'View Trading Stats',
      },
      {
        id: 'alert-4',
        type: 'fee_collection_failed',
        severity: 'critical',
        title: 'Fee Collection Failure',
        message: '5 consecutive fee collection attempts have failed for wallet 0x1234...5678.',
        details: { walletAddress: '0x1234...5678', failedAttempts: 5, totalMissedFees: 125.50 },
        timestamp: new Date(now - 45 * 60 * 1000).toISOString(),
        isRead: true,
        isDismissed: false,
        source: 'Fee Collector',
        actionUrl: '/admin?tab=fees',
        actionLabel: 'View Fee Details',
      },
      {
        id: 'alert-5',
        type: 'service_degraded',
        severity: 'warning',
        title: 'Blockchain RPC Latency High',
        message: 'Ethereum RPC latency has increased to 650ms, above the 500ms threshold.',
        details: { service: 'Blockchain RPC', currentLatency: 650, threshold: 500 },
        timestamp: new Date(now - 60 * 60 * 1000).toISOString(),
        isRead: true,
        isDismissed: true,
        source: 'Service Monitor',
        actionUrl: '/admin?tab=health',
        actionLabel: 'View Services',
      },
      {
        id: 'alert-6',
        type: 'security_breach',
        severity: 'critical',
        title: 'Multiple Failed Login Attempts',
        message: '8 failed login attempts detected from IP 192.168.1.100.',
        details: { ipAddress: '192.168.1.100', attempts: 8, targetAccount: 'admin@platform.com' },
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        isRead: true,
        isDismissed: false,
        source: 'Security Monitor',
        actionUrl: '/admin?tab=users',
        actionLabel: 'View Security Logs',
      },
      {
        id: 'alert-7',
        type: 'unusual_trading',
        severity: 'info',
        title: 'New Trading Record',
        message: 'Platform achieved new daily trading volume record of $5.2M.',
        details: { volume: 5200000, previousRecord: 4800000 },
        timestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        isRead: true,
        isDismissed: false,
        source: 'Analytics',
      },
      {
        id: 'alert-8',
        type: 'user_flagged',
        severity: 'warning',
        title: 'User Activity Flagged',
        message: 'User user42@example.com has been flagged for suspicious withdrawal patterns.',
        details: { userId: 'user-42', reason: 'Rapid consecutive withdrawals', amount: 15000 },
        timestamp: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
        isRead: true,
        isDismissed: false,
        source: 'Fraud Detection',
        actionUrl: '/admin?tab=users',
        actionLabel: 'Review User',
      },
    ];
  }

  private startAlertSimulation(): void {
    // Simulate new alerts coming in periodically
    this.simulationInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        this.generateRandomAlert();
      }
    }, 30000); // Check every 30 seconds
  }

  private generateRandomAlert(): void {
    const alertTypes: { type: AlertType; severity: AlertSeverity; title: string; message: string }[] = [
      {
        type: 'system_health',
        severity: 'warning',
        title: 'CPU Usage Elevated',
        message: `CPU usage has reached ${75 + Math.floor(Math.random() * 15)}%, approaching threshold.`,
      },
      {
        type: 'high_risk_wallet',
        severity: 'warning',
        title: 'Wallet Risk Score Increased',
        message: `Wallet 0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 4)} risk score increased to ${70 + Math.floor(Math.random() * 25)}.`,
      },
      {
        type: 'unusual_trading',
        severity: 'info',
        title: 'Trading Activity Spike',
        message: `Trading volume increased by ${150 + Math.floor(Math.random() * 200)}% in the last hour.`,
      },
      {
        type: 'service_degraded',
        severity: 'warning',
        title: 'Service Response Time Increased',
        message: `Price Feed service latency increased to ${400 + Math.floor(Math.random() * 300)}ms.`,
      },
    ];

    const randomAlert = alertTypes[Math.floor(Math.random() * alertTypes.length)];
    
    // Check cooldown
    const lastTime = this.lastAlertTimes.get(randomAlert.type);
    const threshold = this.config.thresholds.find(t => t.type === randomAlert.type);
    if (lastTime && threshold) {
      const cooldownMs = threshold.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastTime < cooldownMs) {
        return; // Still in cooldown
      }
    }

    const newAlert: AdminAlert = {
      id: `alert-${Date.now()}`,
      type: randomAlert.type,
      severity: randomAlert.severity,
      title: randomAlert.title,
      message: randomAlert.message,
      timestamp: new Date().toISOString(),
      isRead: false,
      isDismissed: false,
      source: 'System Monitor',
    };

    this.alerts.unshift(newAlert);
    this.lastAlertTimes.set(randomAlert.type, Date.now());
    this.notifyListeners();
    this.playNotificationSound();
    this.showBrowserNotification(newAlert);
  }

  private playNotificationSound(): void {
    if (this.config.notificationPreferences.soundEnabled) {
      // Create a simple beep sound
      try {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return;
        const audioContext = new AudioContextCtor();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        setTimeout(() => oscillator.stop(), 150);
      } catch (e) {
        // Audio not supported
      }
    }
  }

  private showBrowserNotification(alert: AdminAlert): void {
    if (this.config.notificationPreferences.browserNotifications && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(alert.title, {
          body: alert.message,
          icon: '/favicon.ico',
          tag: alert.id,
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getActiveAlerts()));
  }

  // Public API
  subscribe(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAlerts(): AdminAlert[] {
    return [...this.alerts];
  }

  getActiveAlerts(): AdminAlert[] {
    return this.alerts.filter(a => !a.isDismissed);
  }

  getUnreadAlerts(): AdminAlert[] {
    return this.alerts.filter(a => !a.isRead && !a.isDismissed);
  }

  getUnreadCount(): number {
    return this.getUnreadAlerts().length;
  }

  getAlertsByType(type: AlertType): AdminAlert[] {
    return this.alerts.filter(a => a.type === type);
  }

  getAlertsBySeverity(severity: AlertSeverity): AdminAlert[] {
    return this.alerts.filter(a => a.severity === severity);
  }

  markAsRead(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.isRead = true;
      this.notifyListeners();
    }
  }

  markAllAsRead(): void {
    this.alerts.forEach(a => a.isRead = true);
    this.notifyListeners();
  }

  dismissAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.isDismissed = true;
      this.notifyListeners();
    }
  }

  dismissAllAlerts(): void {
    this.alerts.forEach(a => a.isDismissed = true);
    this.notifyListeners();
  }

  // Trigger alerts manually (for testing or external events)
  triggerAlert(alert: Omit<AdminAlert, 'id' | 'timestamp' | 'isRead' | 'isDismissed'>): AdminAlert {
    const newAlert: AdminAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      isRead: false,
      isDismissed: false,
    };

    this.alerts.unshift(newAlert);
    this.notifyListeners();
    this.playNotificationSound();
    this.showBrowserNotification(newAlert);

    return newAlert;
  }

  // Configuration
  getConfig(): AlertConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getThresholds(): AlertThreshold[] {
    return [...this.config.thresholds];
  }

  updateThreshold(thresholdId: string, updates: Partial<AlertThreshold>): void {
    const threshold = this.config.thresholds.find(t => t.id === thresholdId);
    if (threshold) {
      Object.assign(threshold, updates);
    }
  }

  toggleThreshold(thresholdId: string, enabled: boolean): void {
    const threshold = this.config.thresholds.find(t => t.id === thresholdId);
    if (threshold) {
      threshold.enabled = enabled;
    }
  }

  updateNotificationPreferences(prefs: Partial<AlertConfig['notificationPreferences']>): void {
    this.config.notificationPreferences = {
      ...this.config.notificationPreferences,
      ...prefs,
    };
  }

  requestBrowserNotificationPermission(): Promise<NotificationPermission> {
    if ('Notification' in window) {
      return Notification.requestPermission();
    }
    return Promise.resolve('denied' as NotificationPermission);
  }

  // Cleanup
  destroy(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }
    this.listeners.clear();
  }
}

// Export singleton instance
export const adminAlertService = new AdminAlertService();
