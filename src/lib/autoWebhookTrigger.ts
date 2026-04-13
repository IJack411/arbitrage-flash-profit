import { webhookService } from './webhookService';
import { notificationService } from './notificationService';
import { ArbitrageOpportunity } from '@/types/arbitrage';

export interface WebhookTriggerConfig {
  enabled: boolean;
  userId: string;
  minProfitThreshold: number;
  events: {
    opportunityFound: boolean;
    tradeExecuted: boolean;
    tradeFailed: boolean;
    circuitBreakerTriggered: boolean;
    highProfitAlert: boolean;
  };
}

interface ExecutedTrade {
  tokenPair: string;
  netProfit: number;
  txHash: string;
  network: string;
}

interface FailedTradeOpportunity {
  tokenPair: string;
  network: string;
}

const DEFAULT_CONFIG: WebhookTriggerConfig = {
  enabled: true,
  userId: '',
  minProfitThreshold: 100,
  events: {
    opportunityFound: true,
    tradeExecuted: true,
    tradeFailed: true,
    circuitBreakerTriggered: true,
    highProfitAlert: true,
  },
};

class AutoWebhookTrigger {
  private config: WebhookTriggerConfig = DEFAULT_CONFIG;

  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    const saved = localStorage.getItem('webhook_trigger_config');
    if (saved) this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  }

  saveConfig(config: Partial<WebhookTriggerConfig>) {
    this.config = { ...this.config, ...config };
    localStorage.setItem('webhook_trigger_config', JSON.stringify(this.config));
  }

  getConfig() {
    return this.config;
  }

  setUserId(userId: string) {
    this.config.userId = userId;
  }

  async triggerOpportunityFound(opportunities: ArbitrageOpportunity[]) {
    if (!this.config.enabled || !this.config.events.opportunityFound) return;
    if (!this.config.userId) return;

    const highValue = opportunities.filter(o => o.netProfit >= this.config.minProfitThreshold);
    if (highValue.length === 0) return;

    const payload = {
      event: 'opportunity_found',
      count: highValue.length,
      topOpportunity: {
        tokenPair: highValue[0].tokenPair,
        profit: highValue[0].netProfit,
        network: highValue[0].network,
        buyDex: highValue[0].buyDex,
        sellDex: highValue[0].sellDex,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      await webhookService.triggerWebhooks(this.config.userId, 'opportunity_found', payload);
      
      // Also send in-app notification
      await notificationService.sendNotification({
        type: 'opportunity',
        title: `${highValue.length} High-Value Opportunities`,
        message: `Top: ${highValue[0].tokenPair} - $${highValue[0].netProfit.toFixed(2)} profit`,
        profitAmount: highValue[0].netProfit,
        network: highValue[0].network,
        tokenPair: highValue[0].tokenPair,
      });
    } catch (e) {
      console.error('Failed to trigger webhooks:', e);
    }
  }

  async triggerTradeExecuted(trade: ExecutedTrade) {
    if (!this.config.enabled || !this.config.events.tradeExecuted) return;
    if (!this.config.userId) return;

    const payload = {
      event: 'trade_executed',
      trade: {
        tokenPair: trade.tokenPair,
        profit: trade.netProfit,
        txHash: trade.txHash,
        network: trade.network,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      await webhookService.triggerWebhooks(this.config.userId, 'trade_executed', payload);
    } catch (e) {
      console.error('Failed to trigger webhooks:', e);
    }
  }

  async triggerTradeFailed(error: string, opportunity: FailedTradeOpportunity) {
    if (!this.config.enabled || !this.config.events.tradeFailed) return;
    if (!this.config.userId) return;

    const payload = {
      event: 'trade_failed',
      error,
      opportunity: {
        tokenPair: opportunity.tokenPair,
        network: opportunity.network,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      await webhookService.triggerWebhooks(this.config.userId, 'trade_failed', payload);
    } catch (e) {
      console.error('Failed to trigger webhooks:', e);
    }
  }

  async triggerCircuitBreaker(reason: string) {
    if (!this.config.enabled || !this.config.events.circuitBreakerTriggered) return;
    if (!this.config.userId) return;

    const payload = {
      event: 'circuit_breaker_triggered',
      reason,
      timestamp: new Date().toISOString(),
    };

    try {
      await webhookService.triggerWebhooks(this.config.userId, 'circuit_breaker', payload);
    } catch (e) {
      console.error('Failed to trigger webhooks:', e);
    }
  }

  async triggerAgentSuggestion(agent: string, title: string, message: string, suggestionId?: string) {
    await notificationService.sendNotification({
      type: 'info',
      title: `[${agent}] ${title}`,
      message: message,
      suggestionId,
    });
  }
}

export const autoWebhookTrigger = new AutoWebhookTrigger();
