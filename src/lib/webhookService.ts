import { supabase } from './supabase';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Webhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  platform: 'discord' | 'slack' | 'telegram' | 'custom';
  is_active: boolean;
  min_profit_threshold: number;
  events: string[];
  custom_headers: Record<string, string>;
  payload_template: JsonValue;
  secret_key?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  payload: JsonValue;
  attempt_count: number;
  max_attempts: number;
  last_error?: string;
  status: 'pending' | 'success' | 'failed' | 'exhausted';
  created_at: string;
}

export const webhookService = {
  async getWebhooks(userId: string): Promise<Webhook[]> {
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createWebhook(webhook: Partial<Webhook>): Promise<Webhook> {
    const { data, error } = await supabase
      .from('webhooks')
      .insert(webhook)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook> {
    const { data, error } = await supabase
      .from('webhooks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteWebhook(id: string): Promise<void> {
    const { error } = await supabase.from('webhooks').delete().eq('id', id);
    if (error) throw error;
  },

  async getDeliveryHistory(webhookId: string): Promise<WebhookDelivery[]> {
    const { data, error } = await supabase
      .from('webhook_retry_queue')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  },

  async testWebhook(webhook: Partial<Webhook>): Promise<{ success: boolean; message: string }> {
    const { data, error } = await supabase.functions.invoke('webhook-retry-processor', {
      body: { action: 'test', webhook }
    });
    if (error) throw error;
    return data;
  },

  async triggerWebhooks(userId: string, event: string, payload: JsonValue): Promise<void> {
    await supabase.functions.invoke('webhook-retry-processor', {
      body: { action: 'trigger', userId, event, payload }
    });
  }
};
