// User Notification Preferences Service
// Manages email notification settings and preferences for price alerts

import { supabase, isSupabaseConfigured } from './supabase';

export interface NotificationPreferences {
  userId: string;
  emailNotifications: boolean;
  emailAddress: string;
  priceAlertEmails: boolean;
  securityAlertEmails: boolean;
  marketingEmails: boolean;
  dailyDigest: boolean;
  digestTime: string; // HH:MM format
  alertThreshold: 'all' | 'important' | 'critical';
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:MM format
  quietHoursEnd: string; // HH:MM format
  telegramEnabled: boolean;
  telegramChatId: string | null;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailNotificationPayload {
  to: string;
  subject: string;
  alertType: 'price_alert' | 'security' | 'welcome' | '2fa_enabled' | '2fa_disabled';
  data: {
    tokenPair?: string;
    targetPrice?: number;
    currentPrice?: number;
    condition?: string;
    userName?: string;
    timestamp?: string;
    backupCodes?: string[];
  };
}

const LOCAL_PREFERENCES_KEY = 'flash-arbitrage-notification-preferences';
const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId' | 'createdAt' | 'updatedAt'> = {
  emailNotifications: true,
  emailAddress: '',
  priceAlertEmails: true,
  securityAlertEmails: true,
  marketingEmails: false,
  dailyDigest: false,
  digestTime: '09:00',
  alertThreshold: 'all',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  telegramEnabled: false,
  telegramChatId: null,
  webhookEnabled: false,
  webhookUrl: null,
};

class NotificationPreferencesService {
  private preferences: NotificationPreferences | null = null;
  private userId: string | null = null;

  setUserId(userId: string | null, email?: string) {
    this.userId = userId;
    if (userId) {
      this.loadPreferences(email);
    } else {
      this.preferences = null;
    }
  }

  async loadPreferences(email?: string): Promise<NotificationPreferences | null> {
    if (!this.userId) return null;

    try {
      if (!isSupabaseConfigured()) {
        // Load from local storage
        const stored = localStorage.getItem(`${LOCAL_PREFERENCES_KEY}-${this.userId}`);
        if (stored) {
          this.preferences = JSON.parse(stored);
        } else {
          // Create default preferences
          this.preferences = {
            ...DEFAULT_PREFERENCES,
            userId: this.userId,
            emailAddress: email || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          this.saveToLocalStorage();
        }
        return this.preferences;
      }

      // Load from Supabase
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', this.userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading notification preferences:', error);
      }

      if (data) {
        this.preferences = this.fromDbFormat(data);
      } else {
        // Create default preferences
        this.preferences = {
          ...DEFAULT_PREFERENCES,
          userId: this.userId,
          emailAddress: email || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await this.savePreferences(this.preferences);
      }

      return this.preferences;
    } catch (error) {
      console.error('Error in loadPreferences:', error);
      return null;
    }
  }

  getPreferences(): NotificationPreferences | null {
    return this.preferences;
  }

  async savePreferences(prefs: Partial<NotificationPreferences>): Promise<boolean> {
    if (!this.userId) return false;

    try {
      const updatedPrefs: NotificationPreferences = {
        ...DEFAULT_PREFERENCES,
        ...this.preferences,
        ...prefs,
        userId: this.userId,
        updatedAt: new Date().toISOString(),
        createdAt: this.preferences?.createdAt || new Date().toISOString(),
      };

      this.preferences = updatedPrefs;

      if (!isSupabaseConfigured()) {
        this.saveToLocalStorage();
        return true;
      }

      const { error } = await supabase
        .from('notification_preferences')
        .upsert(this.toDbFormat(updatedPrefs), { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving notification preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in savePreferences:', error);
      return false;
    }
  }

  async updateEmailSettings(settings: {
    emailNotifications?: boolean;
    emailAddress?: string;
    priceAlertEmails?: boolean;
    securityAlertEmails?: boolean;
    marketingEmails?: boolean;
  }): Promise<boolean> {
    return this.savePreferences(settings);
  }

  async updateDigestSettings(settings: {
    dailyDigest?: boolean;
    digestTime?: string;
  }): Promise<boolean> {
    return this.savePreferences(settings);
  }

  async updateQuietHours(settings: {
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }): Promise<boolean> {
    return this.savePreferences(settings);
  }

  async updateAlertThreshold(threshold: 'all' | 'important' | 'critical'): Promise<boolean> {
    return this.savePreferences({ alertThreshold: threshold });
  }

  // Check if we should send a notification based on preferences
  shouldSendNotification(type: 'price_alert' | 'security' | 'marketing'): boolean {
    if (!this.preferences) return false;
    if (!this.preferences.emailNotifications) return false;

    // Check quiet hours
    if (this.preferences.quietHoursEnabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const start = this.preferences.quietHoursStart;
      const end = this.preferences.quietHoursEnd;

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (start > end) {
        if (currentTime >= start || currentTime < end) {
          return false;
        }
      } else {
        if (currentTime >= start && currentTime < end) {
          return false;
        }
      }
    }

    switch (type) {
      case 'price_alert':
        return this.preferences.priceAlertEmails;
      case 'security':
        return this.preferences.securityAlertEmails;
      case 'marketing':
        return this.preferences.marketingEmails;
      default:
        return true;
    }
  }

  // Send email notification via edge function
  async sendEmailNotification(payload: EmailNotificationPayload): Promise<boolean> {
    if (!this.preferences) return false;
    
    // Check if we should send based on preferences
    const notificationType = payload.alertType === 'price_alert' ? 'price_alert' : 
                            payload.alertType.includes('2fa') || payload.alertType === 'security' ? 'security' : 
                            'marketing';
    
    if (!this.shouldSendNotification(notificationType)) {
      console.log('Notification blocked by user preferences');
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-alert-email', {
        body: {
          ...payload,
          to: payload.to || this.preferences.emailAddress,
        },
      });

      if (error) {
        console.error('Error sending email notification:', error);
        return false;
      }

      console.log('Email notification sent:', data);
      return true;
    } catch (error) {
      console.error('Error invoking email function:', error);
      // In demo mode, just log the notification
      console.log('Demo mode - Email would be sent:', payload);
      return true;
    }
  }

  // Send price alert email
  async sendPriceAlertEmail(alertData: {
    tokenPair: string;
    targetPrice: number;
    currentPrice: number;
    condition: string;
    userName?: string;
  }): Promise<boolean> {
    return this.sendEmailNotification({
      to: this.preferences?.emailAddress || '',
      subject: `Price Alert: ${alertData.tokenPair} - Target Reached!`,
      alertType: 'price_alert',
      data: {
        ...alertData,
        timestamp: new Date().toLocaleString(),
      },
    });
  }

  // Send security alert email (2FA enabled/disabled)
  async sendSecurityAlertEmail(alertType: '2fa_enabled' | '2fa_disabled', data: {
    userName?: string;
    backupCodes?: string[];
  }): Promise<boolean> {
    return this.sendEmailNotification({
      to: this.preferences?.emailAddress || '',
      subject: alertType === '2fa_enabled' 
        ? 'Two-Factor Authentication Enabled' 
        : 'Two-Factor Authentication Disabled',
      alertType,
      data: {
        ...data,
        timestamp: new Date().toLocaleString(),
      },
    });
  }

  // Send welcome email
  async sendWelcomeEmail(userName: string, email: string): Promise<boolean> {
    return this.sendEmailNotification({
      to: email,
      subject: 'Welcome to Flash Arbitrage Bot!',
      alertType: 'welcome',
      data: {
        userName,
        timestamp: new Date().toLocaleString(),
      },
    });
  }

  private saveToLocalStorage() {
    if (this.preferences && this.userId) {
      localStorage.setItem(
        `${LOCAL_PREFERENCES_KEY}-${this.userId}`,
        JSON.stringify(this.preferences)
      );
    }
  }

  private toDbFormat(prefs: NotificationPreferences): Record<string, unknown> {
    return {
      user_id: prefs.userId,
      email_notifications: prefs.emailNotifications,
      email_address: prefs.emailAddress,
      price_alert_emails: prefs.priceAlertEmails,
      security_alert_emails: prefs.securityAlertEmails,
      marketing_emails: prefs.marketingEmails,
      daily_digest: prefs.dailyDigest,
      digest_time: prefs.digestTime,
      alert_threshold: prefs.alertThreshold,
      quiet_hours_enabled: prefs.quietHoursEnabled,
      quiet_hours_start: prefs.quietHoursStart,
      quiet_hours_end: prefs.quietHoursEnd,
      telegram_enabled: prefs.telegramEnabled,
      telegram_chat_id: prefs.telegramChatId,
      webhook_enabled: prefs.webhookEnabled,
      webhook_url: prefs.webhookUrl,
      created_at: prefs.createdAt,
      updated_at: prefs.updatedAt,
    };
  }

  private fromDbFormat(data: Record<string, unknown>): NotificationPreferences {
    return {
      userId: data.user_id as string,
      emailNotifications: data.email_notifications as boolean,
      emailAddress: data.email_address as string,
      priceAlertEmails: data.price_alert_emails as boolean,
      securityAlertEmails: data.security_alert_emails as boolean,
      marketingEmails: data.marketing_emails as boolean,
      dailyDigest: data.daily_digest as boolean,
      digestTime: data.digest_time as string,
      alertThreshold: data.alert_threshold as 'all' | 'important' | 'critical',
      quietHoursEnabled: data.quiet_hours_enabled as boolean,
      quietHoursStart: data.quiet_hours_start as string,
      quietHoursEnd: data.quiet_hours_end as string,
      telegramEnabled: data.telegram_enabled as boolean,
      telegramChatId: data.telegram_chat_id as string | null,
      webhookEnabled: data.webhook_enabled as boolean,
      webhookUrl: data.webhook_url as string | null,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  clearUserData() {
    if (this.userId) {
      localStorage.removeItem(`${LOCAL_PREFERENCES_KEY}-${this.userId}`);
    }
    this.preferences = null;
    this.userId = null;
  }
}

export const notificationPreferencesService = new NotificationPreferencesService();
