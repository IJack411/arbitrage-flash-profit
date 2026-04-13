// User Alert Service - Syncs price alerts with user accounts
// Supports both Supabase cloud storage and local storage fallback

import { supabase, isSupabaseConfigured } from './supabase';
import { PriceAlert, priceAlertService } from './priceAlertService';

export interface UserAlertData {
  id: string;
  user_id: string;
  token_pair: string;
  target_price: number;
  condition: 'above' | 'below' | 'crosses';
  current_price: number | null;
  enabled: boolean;
  triggered_at: string | null;
  notified: boolean;
  repeat_alert: boolean;
  note: string | null;
  network: string;
  created_at: string;
  updated_at: string;
}

const LOCAL_USER_ALERTS_KEY = 'flash-arbitrage-user-alerts';

class UserAlertService {
  private userId: string | null = null;
  private syncInProgress = false;
  private lastSyncTime = 0;
  private syncInterval = 30000; // 30 seconds between syncs

  setUserId(userId: string | null) {
    this.userId = userId;
    if (userId) {
      this.syncFromCloud();
    }
  }

  getUserId(): string | null {
    return this.userId;
  }

  // Convert PriceAlert to database format
  private toDbFormat(alert: PriceAlert, userId: string): Omit<UserAlertData, 'id' | 'created_at' | 'updated_at'> {
    return {
      user_id: userId,
      token_pair: alert.tokenPair,
      target_price: alert.targetPrice,
      condition: alert.condition,
      current_price: alert.currentPrice,
      enabled: alert.enabled,
      triggered_at: alert.triggeredAt ? new Date(alert.triggeredAt).toISOString() : null,
      notified: alert.notified,
      repeat_alert: alert.repeatAlert,
      note: alert.note || null,
      network: alert.network,
    };
  }

  // Convert database format to PriceAlert
  private fromDbFormat(data: UserAlertData): PriceAlert {
    return {
      id: data.id,
      tokenPair: data.token_pair,
      targetPrice: data.target_price,
      condition: data.condition,
      currentPrice: data.current_price || 0,
      createdAt: new Date(data.created_at).getTime(),
      triggeredAt: data.triggered_at ? new Date(data.triggered_at).getTime() : null,
      enabled: data.enabled,
      notified: data.notified,
      repeatAlert: data.repeat_alert,
      note: data.note || '',
      network: data.network,
    };
  }

  // Sync alerts from cloud to local
  async syncFromCloud(): Promise<boolean> {
    if (!this.userId || this.syncInProgress) return false;
    
    const now = Date.now();
    if (now - this.lastSyncTime < this.syncInterval) return false;

    this.syncInProgress = true;
    this.lastSyncTime = now;

    try {
      if (!isSupabaseConfigured()) {
        // Load from local storage for this user
        const localData = localStorage.getItem(`${LOCAL_USER_ALERTS_KEY}-${this.userId}`);
        if (localData) {
          const alerts: PriceAlert[] = JSON.parse(localData);
          // Merge with existing alerts
          alerts.forEach(alert => {
            const existing = priceAlertService.getAlert(alert.id);
            if (!existing) {
              // Re-create the alert in the service
              priceAlertService.createAlert({
                tokenPair: alert.tokenPair,
                targetPrice: alert.targetPrice,
                condition: alert.condition,
                repeatAlert: alert.repeatAlert,
                note: alert.note,
                network: alert.network,
              });
            }
          });
        }
        return true;
      }

      // Fetch from Supabase
      const { data, error } = await supabase
        .from('user_price_alerts')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user alerts:', error);
        return false;
      }

      if (data && data.length > 0) {
        // Merge cloud alerts with local
        data.forEach((dbAlert: UserAlertData) => {
          const localAlert = priceAlertService.getAlert(dbAlert.id);
          if (!localAlert) {
            // Create in local service
            const alert = this.fromDbFormat(dbAlert);
            // Use internal method to add without triggering save
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (priceAlertService as any).alerts.set(alert.id, alert);
          }
        });
      }

      return true;
    } catch (error) {
      console.error('Error syncing from cloud:', error);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  // Sync local alerts to cloud
  async syncToCloud(): Promise<boolean> {
    if (!this.userId) return false;

    try {
      const alerts = priceAlertService.getAllAlerts();

      if (!isSupabaseConfigured()) {
        // Save to local storage
        localStorage.setItem(`${LOCAL_USER_ALERTS_KEY}-${this.userId}`, JSON.stringify(alerts));
        return true;
      }

      // Upsert to Supabase
      for (const alert of alerts) {
        const dbData = this.toDbFormat(alert, this.userId);
        
        const { error } = await supabase
          .from('user_price_alerts')
          .upsert({
            id: alert.id,
            ...dbData,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'id',
          });

        if (error) {
          console.error('Error upserting alert:', error);
        }
      }

      return true;
    } catch (error) {
      console.error('Error syncing to cloud:', error);
      return false;
    }
  }

  // Save a single alert to cloud
  async saveAlert(alert: PriceAlert): Promise<boolean> {
    if (!this.userId) return false;

    try {
      if (!isSupabaseConfigured()) {
        // Update local storage
        const alerts = priceAlertService.getAllAlerts();
        localStorage.setItem(`${LOCAL_USER_ALERTS_KEY}-${this.userId}`, JSON.stringify(alerts));
        return true;
      }

      const dbData = this.toDbFormat(alert, this.userId);
      
      const { error } = await supabase
        .from('user_price_alerts')
        .upsert({
          id: alert.id,
          ...dbData,
          created_at: new Date(alert.createdAt).toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (error) {
        console.error('Error saving alert:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error saving alert:', error);
      return false;
    }
  }

  // Delete an alert from cloud
  async deleteAlert(alertId: string): Promise<boolean> {
    if (!this.userId) return false;

    try {
      if (!isSupabaseConfigured()) {
        // Update local storage
        const alerts = priceAlertService.getAllAlerts().filter(a => a.id !== alertId);
        localStorage.setItem(`${LOCAL_USER_ALERTS_KEY}-${this.userId}`, JSON.stringify(alerts));
        return true;
      }

      const { error } = await supabase
        .from('user_price_alerts')
        .delete()
        .eq('id', alertId)
        .eq('user_id', this.userId);

      if (error) {
        console.error('Error deleting alert:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting alert:', error);
      return false;
    }
  }

  // Get all alerts for current user from cloud
  async getUserAlerts(): Promise<PriceAlert[]> {
    if (!this.userId) return [];

    try {
      if (!isSupabaseConfigured()) {
        const localData = localStorage.getItem(`${LOCAL_USER_ALERTS_KEY}-${this.userId}`);
        return localData ? JSON.parse(localData) : [];
      }

      const { data, error } = await supabase
        .from('user_price_alerts')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user alerts:', error);
        return [];
      }

      return (data || []).map((d: UserAlertData) => this.fromDbFormat(d));
    } catch (error) {
      console.error('Error getting user alerts:', error);
      return [];
    }
  }

  // Clear all user data (on logout)
  clearUserData() {
    this.userId = null;
    this.lastSyncTime = 0;
  }
}

export const userAlertService = new UserAlertService();
