// Alert Service for Arbitrage Opportunity Notifications

export interface AlertConfig {
  id: string;
  pair: string;
  type: 'spread' | 'price' | 'opportunity';
  threshold: number;
  direction: 'above' | 'below';
  enabled: boolean;
  sound: boolean;
  createdAt: number;
}

export interface Alert {
  id: string;
  configId: string;
  pair: string;
  type: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  read: boolean;
}

type AlertCallback = (alert: Alert) => void;

class AlertService {
  private configs: Map<string, AlertConfig> = new Map();
  private alerts: Alert[] = [];
  private subscribers: Set<AlertCallback> = new Set();
  private maxAlerts = 100;
  private cooldowns: Map<string, number> = new Map();
  private cooldownMs = 30000; // 30 second cooldown per config

  addConfig(config: Omit<AlertConfig, 'id' | 'createdAt'>): AlertConfig {
    const newConfig: AlertConfig = {
      ...config,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };
    this.configs.set(newConfig.id, newConfig);
    this.saveToStorage();
    return newConfig;
  }

  updateConfig(id: string, updates: Partial<AlertConfig>) {
    const config = this.configs.get(id);
    if (config) {
      this.configs.set(id, { ...config, ...updates });
      this.saveToStorage();
    }
  }

  removeConfig(id: string) {
    this.configs.delete(id);
    this.saveToStorage();
  }

  getConfigs(): AlertConfig[] {
    return Array.from(this.configs.values());
  }

  checkSpread(pair: string, spread: number) {
    this.configs.forEach(config => {
      if (!config.enabled || config.type !== 'spread' || config.pair !== pair) return;
      if (this.isOnCooldown(config.id)) return;
      
      const triggered = config.direction === 'above' 
        ? spread >= config.threshold 
        : spread <= config.threshold;
      
      if (triggered) {
        this.triggerAlert(config, spread, `${pair} spread ${config.direction} ${config.threshold}%: ${spread.toFixed(3)}%`);
      }
    });
  }

  checkPrice(pair: string, price: number) {
    this.configs.forEach(config => {
      if (!config.enabled || config.type !== 'price' || config.pair !== pair) return;
      if (this.isOnCooldown(config.id)) return;
      
      const triggered = config.direction === 'above' 
        ? price >= config.threshold 
        : price <= config.threshold;
      
      if (triggered) {
        this.triggerAlert(config, price, `${pair} price ${config.direction} $${config.threshold}: $${price.toFixed(2)}`);
      }
    });
  }

  checkOpportunity(pair: string, profitPercent: number) {
    this.configs.forEach(config => {
      if (!config.enabled || config.type !== 'opportunity') return;
      if (this.isOnCooldown(config.id)) return;
      
      if (profitPercent >= config.threshold) {
        this.triggerAlert(config, profitPercent, `Arbitrage opportunity: ${pair} with ${profitPercent.toFixed(2)}% profit`);
      }
    });
  }

  private isOnCooldown(configId: string): boolean {
    const lastTrigger = this.cooldowns.get(configId);
    return lastTrigger ? Date.now() - lastTrigger < this.cooldownMs : false;
  }

  private triggerAlert(config: AlertConfig, value: number, message: string) {
    const alert: Alert = {
      id: `alert-${Date.now()}`,
      configId: config.id,
      pair: config.pair,
      type: config.type,
      message, value,
      threshold: config.threshold,
      timestamp: Date.now(),
      read: false,
    };
    
    this.alerts.unshift(alert);
    if (this.alerts.length > this.maxAlerts) this.alerts.pop();
    
    this.cooldowns.set(config.id, Date.now());
    this.notifySubscribers(alert);
    
    if (config.sound) this.playSound();
  }

  private playSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0cQYzf7qVnFgA/mN/upWcWAD+Y3+6lZxYAP5jf7qVnFgA=');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (e) {
      // Ignore audio errors
    }
  }

  subscribe(callback: AlertCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(alert: Alert) {
    this.subscribers.forEach(cb => cb(alert));
  }

  getAlerts(): Alert[] {
    return this.alerts;
  }

  markRead(id: string) {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) alert.read = true;
  }

  clearAlerts() {
    this.alerts = [];
  }

  private saveToStorage() {
    try {
      localStorage.setItem('alertConfigs', JSON.stringify(Array.from(this.configs.entries())));
    } catch (e) {
      // Ignore storage errors
    }
  }

  loadFromStorage() {
    try {
      const data = localStorage.getItem('alertConfigs');
      if (data) {
        const entries = JSON.parse(data);
        this.configs = new Map(entries);
      }
    } catch (e) {
      // Ignore storage errors
    }
  }
}

export const alertService = new AlertService();
alertService.loadFromStorage();
