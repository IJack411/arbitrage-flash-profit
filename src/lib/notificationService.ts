// Notification Service - Core functionality for alerts
export interface NotificationPreferences {
  pushEnabled: boolean;
  toastEnabled: boolean;
  soundEnabled: boolean;
  emailEnabled: boolean;
  emailAddress: string;
  minProfitThreshold: number;
  soundType: 'chime' | 'bell' | 'alert' | 'cash';
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
}

export interface ArbitrageNotification {
  id: string;
  type: 'opportunity' | 'execution' | 'warning' | 'info';
  title: string;
  message: string;
  opportunityId?: string;
  suggestionId?: string;
  profitAmount?: number;
  network?: string;
  tokenPair?: string;
  read: boolean;
  createdAt: Date;
}

type StoredNotification = Omit<ArbitrageNotification, 'createdAt'> & { createdAt: string };

const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  toastEnabled: true,
  soundEnabled: true,
  emailEnabled: false,
  emailAddress: '',
  minProfitThreshold: 100,
  soundType: 'chime',
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 8,
};

class NotificationService {
  private prefs: NotificationPreferences = DEFAULT_PREFS;
  private history: ArbitrageNotification[] = [];
  private audioContext: AudioContext | null = null;
  private listeners: Set<(n: ArbitrageNotification[]) => void> = new Set();

  constructor() {
    this.loadPreferences();
    this.loadHistory();
  }

  loadPreferences(): NotificationPreferences {
    const saved = localStorage.getItem('notification_prefs');
    if (saved) this.prefs = { ...DEFAULT_PREFS, ...JSON.parse(saved) };
    return this.prefs;
  }

  savePreferences(prefs: Partial<NotificationPreferences>) {
    this.prefs = { ...this.prefs, ...prefs };
    localStorage.setItem('notification_prefs', JSON.stringify(this.prefs));
  }

  getPreferences(): NotificationPreferences {
    return this.prefs;
  }

  loadHistory(): ArbitrageNotification[] {
    const saved = localStorage.getItem('notification_history');
    if (saved) this.history = JSON.parse(saved).map((n: StoredNotification) => ({
      ...n, createdAt: new Date(n.createdAt)
    }));
    return this.history;
  }

  private saveHistory() {
    const recent = this.history.slice(0, 100);
    localStorage.setItem('notification_history', JSON.stringify(recent));
  }

  subscribe(cb: (n: ArbitrageNotification[]) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.history));
  }

  isQuietHours(): boolean {
    if (!this.prefs.quietHoursEnabled) return false;
    const hour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = this.prefs;
    if (quietHoursStart > quietHoursEnd) {
      return hour >= quietHoursStart || hour < quietHoursEnd;
    }
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }

  async requestPushPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  getHistory(): ArbitrageNotification[] {
    return this.history;
  }

  getUnreadCount(): number {
    return this.history.filter(n => !n.read).length;
  }

  markAsRead(id: string) {
    const n = this.history.find(n => n.id === id);
    if (n) { n.read = true; this.saveHistory(); this.notify(); }
  }

  markAllAsRead() {
    this.history.forEach(n => n.read = true);
    this.saveHistory();
    this.notify();
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.notify();
  }

  async sendNotification(notification: Omit<ArbitrageNotification, 'id' | 'read' | 'createdAt'>) {
    if (notification.profitAmount && notification.profitAmount < this.prefs.minProfitThreshold) {
      return;
    }

    const fullNotification: ArbitrageNotification = {
      ...notification,
      id: crypto.randomUUID(),
      read: false,
      createdAt: new Date(),
    };

    this.history.unshift(fullNotification);
    this.saveHistory();
    this.notify();

    const isQuiet = this.isQuietHours();

    // Toast notification
    if (this.prefs.toastEnabled) {
      this.showToast(fullNotification);
    }

    // Sound alert
    if (this.prefs.soundEnabled && !isQuiet) {
      const { playSound } = await import('./notificationSounds');
      playSound(this.prefs.soundType);
    }

    // Push notification
    if (this.prefs.pushEnabled && !isQuiet && Notification.permission === 'granted') {
      this.showPushNotification(fullNotification);
    }

    return fullNotification;
  }

  private showToast(n: ArbitrageNotification) {
    const event = new CustomEvent('arbitrage-notification', { detail: n });
    window.dispatchEvent(event);
  }

  private showPushNotification(n: ArbitrageNotification) {
    const icon = n.type === 'opportunity' ? '💰' : n.type === 'warning' ? '⚠️' : 'ℹ️';
    new Notification(n.title, {
      body: n.message,
      icon: '/favicon.ico',
      tag: n.id,
      requireInteraction: n.type === 'opportunity',
    });
  }
}

export const notificationService = new NotificationService();
