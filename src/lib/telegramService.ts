// Telegram Bot Integration Service
// Handles account linking, chat ID storage, and notification sending via Telegram Bot API

import { supabase, isSupabaseConfigured } from './supabase';

export interface TelegramLinkStatus {
  isLinked: boolean;
  chatId: string | null;
  username: string | null;
  linkedAt: string | null;
}

export interface TelegramNotificationPayload {
  chatId: string;
  alertType: 'price_alert' | 'security' | 'system';
  data: {
    tokenPair?: string;
    targetPrice?: number;
    currentPrice?: number;
    condition?: string;
    percentChange?: number;
    message?: string;
    userName?: string;
    timestamp?: string;
  };
}

const LOCAL_TELEGRAM_KEY = 'flash-arbitrage-telegram';
const LINK_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

// Bot configuration
const BOT_USERNAME = 'FlashArbitragePriceBot'; // Replace with actual bot username

class TelegramService {
  private userId: string | null = null;
  private linkStatus: TelegramLinkStatus = {
    isLinked: false,
    chatId: null,
    username: null,
    linkedAt: null,
  };
  private pendingLinkCode: { code: string; expiresAt: number } | null = null;

  setUserId(userId: string | null) {
    this.userId = userId;
    if (userId) {
      this.loadLinkStatus();
    } else {
      this.linkStatus = {
        isLinked: false,
        chatId: null,
        username: null,
        linkedAt: null,
      };
      this.pendingLinkCode = null;
    }
  }

  async loadLinkStatus(): Promise<TelegramLinkStatus> {
    if (!this.userId) {
      return this.linkStatus;
    }

    try {
      if (!isSupabaseConfigured()) {
        // Load from local storage
        const stored = localStorage.getItem(`${LOCAL_TELEGRAM_KEY}-${this.userId}`);
        if (stored) {
          this.linkStatus = JSON.parse(stored);
        }
        return this.linkStatus;
      }

      // Load from Supabase
      const { data, error } = await supabase
        .from('telegram_links')
        .select('*')
        .eq('user_id', this.userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading Telegram link status:', error);
      }

      if (data) {
        this.linkStatus = {
          isLinked: true,
          chatId: data.chat_id,
          username: data.telegram_username,
          linkedAt: data.linked_at,
        };
      }

      return this.linkStatus;
    } catch (error) {
      console.error('Error in loadLinkStatus:', error);
      return this.linkStatus;
    }
  }

  getLinkStatus(): TelegramLinkStatus {
    return this.linkStatus;
  }

  getBotUsername(): string {
    return BOT_USERNAME;
  }

  getBotLink(): string {
    return `https://t.me/${BOT_USERNAME}`;
  }

  // Generate a unique linking code for the user
  generateLinkCode(): string {
    const code = this.generateRandomCode(8);
    this.pendingLinkCode = {
      code,
      expiresAt: Date.now() + LINK_CODE_EXPIRY,
    };

    // Store pending code in local storage for persistence
    if (this.userId) {
      localStorage.setItem(
        `${LOCAL_TELEGRAM_KEY}-pending-${this.userId}`,
        JSON.stringify(this.pendingLinkCode)
      );
    }

    return code;
  }

  getPendingLinkCode(): { code: string; expiresAt: number } | null {
    if (!this.userId) return null;

    // Check if we have a stored pending code
    const stored = localStorage.getItem(`${LOCAL_TELEGRAM_KEY}-pending-${this.userId}`);
    if (stored) {
      const pending = JSON.parse(stored);
      if (pending.expiresAt > Date.now()) {
        this.pendingLinkCode = pending;
        return pending;
      } else {
        // Code expired, remove it
        localStorage.removeItem(`${LOCAL_TELEGRAM_KEY}-pending-${this.userId}`);
        this.pendingLinkCode = null;
      }
    }

    return this.pendingLinkCode;
  }

  // Verify the link code (called when user confirms they've sent the code to the bot)
  async verifyLinkCode(code: string, chatId: string, username?: string): Promise<{ success: boolean; message: string }> {
    if (!this.userId) {
      return { success: false, message: 'User not authenticated' };
    }

    const pending = this.getPendingLinkCode();
    if (!pending) {
      return { success: false, message: 'No pending link code found. Please generate a new code.' };
    }

    if (pending.expiresAt < Date.now()) {
      return { success: false, message: 'Link code has expired. Please generate a new code.' };
    }

    if (pending.code !== code) {
      return { success: false, message: 'Invalid link code' };
    }

    // Code is valid, save the link
    try {
      const linkData: TelegramLinkStatus = {
        isLinked: true,
        chatId,
        username: username || null,
        linkedAt: new Date().toISOString(),
      };

      if (!isSupabaseConfigured()) {
        // Save to local storage
        localStorage.setItem(`${LOCAL_TELEGRAM_KEY}-${this.userId}`, JSON.stringify(linkData));
      } else {
        // Save to Supabase
        const { error } = await supabase
          .from('telegram_links')
          .upsert({
            user_id: this.userId,
            chat_id: chatId,
            telegram_username: username,
            link_code: code,
            linked_at: linkData.linkedAt,
          }, { onConflict: 'user_id' });

        if (error) {
          console.error('Error saving Telegram link:', error);
          return { success: false, message: 'Failed to save Telegram link' };
        }
      }

      // Clear pending code
      localStorage.removeItem(`${LOCAL_TELEGRAM_KEY}-pending-${this.userId}`);
      this.pendingLinkCode = null;

      this.linkStatus = linkData;
      return { success: true, message: 'Telegram account linked successfully!' };
    } catch (error) {
      console.error('Error in verifyLinkCode:', error);
      return { success: false, message: 'An error occurred while linking your account' };
    }
  }

  // Simulate link verification for demo mode (when Supabase is not configured)
  async simulateLinkVerification(chatId: string, username?: string): Promise<{ success: boolean; message: string }> {
    if (!this.userId) {
      return { success: false, message: 'User not authenticated' };
    }

    const pending = this.getPendingLinkCode();
    if (!pending) {
      return { success: false, message: 'No pending link code found. Please generate a new code.' };
    }

    // In demo mode, we simulate successful verification
    const linkData: TelegramLinkStatus = {
      isLinked: true,
      chatId,
      username: username || 'demo_user',
      linkedAt: new Date().toISOString(),
    };

    localStorage.setItem(`${LOCAL_TELEGRAM_KEY}-${this.userId}`, JSON.stringify(linkData));
    localStorage.removeItem(`${LOCAL_TELEGRAM_KEY}-pending-${this.userId}`);
    this.pendingLinkCode = null;
    this.linkStatus = linkData;

    return { success: true, message: 'Telegram account linked successfully!' };
  }

  // Unlink Telegram account
  async unlinkAccount(): Promise<{ success: boolean; message: string }> {
    if (!this.userId) {
      return { success: false, message: 'User not authenticated' };
    }

    try {
      if (!isSupabaseConfigured()) {
        localStorage.removeItem(`${LOCAL_TELEGRAM_KEY}-${this.userId}`);
      } else {
        const { error } = await supabase
          .from('telegram_links')
          .delete()
          .eq('user_id', this.userId);

        if (error) {
          console.error('Error unlinking Telegram:', error);
          return { success: false, message: 'Failed to unlink Telegram account' };
        }
      }

      this.linkStatus = {
        isLinked: false,
        chatId: null,
        username: null,
        linkedAt: null,
      };

      return { success: true, message: 'Telegram account unlinked successfully' };
    } catch (error) {
      console.error('Error in unlinkAccount:', error);
      return { success: false, message: 'An error occurred while unlinking your account' };
    }
  }

  // Send notification via Telegram
  async sendNotification(payload: Omit<TelegramNotificationPayload, 'chatId'>): Promise<boolean> {
    if (!this.linkStatus.isLinked || !this.linkStatus.chatId) {
      console.log('Telegram not linked, skipping notification');
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
        body: {
          ...payload,
          chatId: this.linkStatus.chatId,
        },
      });

      if (error) {
        console.error('Error sending Telegram notification:', error);
        return false;
      }

      console.log('Telegram notification sent:', data);
      return true;
    } catch (error) {
      console.error('Error invoking Telegram function:', error);
      // In demo mode, just log the notification
      console.log('Demo mode - Telegram notification would be sent:', payload);
      return true;
    }
  }

  // Send price alert notification
  async sendPriceAlert(alertData: {
    tokenPair: string;
    targetPrice: number;
    currentPrice: number;
    condition: string;
    percentChange?: number;
  }): Promise<boolean> {
    return this.sendNotification({
      alertType: 'price_alert',
      data: {
        ...alertData,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Send security alert notification
  async sendSecurityAlert(message: string, userName?: string): Promise<boolean> {
    return this.sendNotification({
      alertType: 'security',
      data: {
        message,
        userName,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Send system notification
  async sendSystemNotification(message: string): Promise<boolean> {
    return this.sendNotification({
      alertType: 'system',
      data: {
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private generateRandomCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters like 0, O, 1, I
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  clearUserData() {
    if (this.userId) {
      localStorage.removeItem(`${LOCAL_TELEGRAM_KEY}-${this.userId}`);
      localStorage.removeItem(`${LOCAL_TELEGRAM_KEY}-pending-${this.userId}`);
    }
    this.linkStatus = {
      isLinked: false,
      chatId: null,
      username: null,
      linkedAt: null,
    };
    this.pendingLinkCode = null;
    this.userId = null;
  }
}

export const telegramService = new TelegramService();
