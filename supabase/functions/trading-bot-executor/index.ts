import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const BOT_CONTROL_PLANE_ENABLED = Deno.env.get('BOT_CONTROL_PLANE_ENABLED') !== 'false';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    })
  : null;

const walletRegex = /^0x[a-fA-F0-9]{40}$/;
const allowedStatuses = new Set(['running', 'stopped', 'paused', 'error']);
const allowedUpdateFields = new Set([
  'name',
  'min_profit_threshold',
  'max_gas_limit',
  'token_pairs',
  'enabled_networks',
  'enabled_dexes',
  'active_hours_start',
  'active_hours_end',
  'daily_trade_limit',
  'max_concurrent_trades',
  'cooldown_seconds',
  'max_position_size',
  'stop_loss_percentage',
  'daily_loss_limit',
]);

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const fail = (error: string, code: string, status = 400) =>
  new Response(JSON.stringify({ success: false, error, code }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const parseBody = async (req: Request): Promise<Record<string, unknown>> => {
  const parsed = await req.json().catch(() => ({}));
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
};

const parseWallet = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return walletRegex.test(value) ? value : null;
};

const sanitizeConfig = (config: Record<string, unknown>): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!allowedUpdateFields.has(key)) continue;
    patch[key] = value;
  }
  return patch;
};

const canTransition = (current: string, next: string): boolean => {
  if (current === next) return true;
  if (current === 'stopped') return next === 'running' || next === 'paused';
  if (current === 'running') return next === 'paused' || next === 'stopped';
  if (current === 'paused') return next === 'running' || next === 'stopped';
  if (current === 'error') return next === 'stopped';
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!BOT_CONTROL_PLANE_ENABLED) {
      return fail('Bot control plane is disabled', 'BOT_CONTROL_PLANE_DISABLED', 503);
    }
    if (!supabase) {
      return fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 'CONFIG_MISSING', 500);
    }

    const body = await parseBody(req);
    const action = typeof body.action === 'string' ? body.action : '';
    const wallet = parseWallet(body.wallet_address);

    if (action === 'list_bots' && !wallet) {
      // Allow caller bootstrap before wallet connect.
      return ok([]);
    }

    if (!wallet) {
      return fail('wallet_address is required and must be a valid address', 'VALIDATION_FAILED', 400);
    }

    if (action === 'list_bots') {
      const { data, error } = await supabase
        .from('trading_bots')
        .select('*')
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) return fail(error.message, 'DB_ERROR', 500);
      return ok(data ?? []);
    }

    if (action === 'get_bot') {
      const botId = typeof body.bot_id === 'string' ? body.bot_id : '';
      if (!botId) return fail('bot_id is required', 'VALIDATION_FAILED', 400);

      const { data, error } = await supabase
        .from('trading_bots')
        .select('*')
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) return fail(error.message, 'DB_ERROR', 500);
      if (!data) return fail('Bot not found', 'BOT_NOT_FOUND', 404);
      return ok(data);
    }

    if (action === 'create_bot') {
      const config = body.config && typeof body.config === 'object'
        ? sanitizeConfig(body.config as Record<string, unknown>)
        : null;

      if (!config || typeof config.name !== 'string' || !config.name.trim()) {
        return fail('config with a non-empty name is required', 'VALIDATION_FAILED', 400);
      }

      const insertPayload = {
        ...config,
        wallet_address: wallet,
        status: 'stopped',
        total_trades: 0,
        successful_trades: 0,
        total_profit: 0,
        total_gas_spent: 0,
        trades_today: 0,
        profit_today: 0,
      };

      const { data, error } = await supabase
        .from('trading_bots')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) return fail(error.message, 'DB_ERROR', 500);
      return ok(data, 201);
    }

    if (action === 'update_bot') {
      const botId = typeof body.bot_id === 'string' ? body.bot_id : '';
      const updatedAt = typeof body.updated_at === 'string' ? body.updated_at : '';
      const config = body.config && typeof body.config === 'object'
        ? sanitizeConfig(body.config as Record<string, unknown>)
        : {};

      if (!botId) return fail('bot_id is required', 'VALIDATION_FAILED', 400);
      if (!updatedAt) return fail('updated_at is required for optimistic concurrency', 'VALIDATION_FAILED', 400);
      if (Object.keys(config).length === 0) return fail('No valid config fields provided', 'VALIDATION_FAILED', 400);

      const { data: current, error: getError } = await supabase
        .from('trading_bots')
        .select('id, updated_at')
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .maybeSingle();

      if (getError) return fail(getError.message, 'DB_ERROR', 500);
      if (!current) return fail('Bot not found', 'BOT_NOT_FOUND', 404);
      if (current.updated_at !== updatedAt) return fail('Bot has been modified by another request', 'CONFLICT', 409);

      const { data, error } = await supabase
        .from('trading_bots')
        .update(config)
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .select('*')
        .single();

      if (error) return fail(error.message, 'DB_ERROR', 500);
      return ok(data);
    }

    if (action === 'set_bot_status') {
      const botId = typeof body.bot_id === 'string' ? body.bot_id : '';
      const updatedAt = typeof body.updated_at === 'string' ? body.updated_at : '';
      const status = typeof body.status === 'string' ? body.status : '';

      if (!botId) return fail('bot_id is required', 'VALIDATION_FAILED', 400);
      if (!updatedAt) return fail('updated_at is required for optimistic concurrency', 'VALIDATION_FAILED', 400);
      if (!allowedStatuses.has(status)) return fail('Invalid status', 'VALIDATION_FAILED', 400);

      const { data: current, error: getError } = await supabase
        .from('trading_bots')
        .select('id, status, updated_at')
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .maybeSingle();

      if (getError) return fail(getError.message, 'DB_ERROR', 500);
      if (!current) return fail('Bot not found', 'BOT_NOT_FOUND', 404);
      if (current.updated_at !== updatedAt) return fail('Bot has been modified by another request', 'CONFLICT', 409);
      if (!canTransition(current.status, status)) return fail('Invalid status transition', 'VALIDATION_FAILED', 400);

      const { data, error } = await supabase
        .from('trading_bots')
        .update({ status })
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .select('*')
        .single();

      if (error) return fail(error.message, 'DB_ERROR', 500);
      return ok(data);
    }

    if (action === 'delete_bot') {
      const botId = typeof body.bot_id === 'string' ? body.bot_id : '';
      if (!botId) return fail('bot_id is required', 'VALIDATION_FAILED', 400);

      const { data, error } = await supabase
        .from('trading_bots')
        .update({ deleted_at: new Date().toISOString(), status: 'stopped' })
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .select('id, deleted_at')
        .maybeSingle();

      if (error) return fail(error.message, 'DB_ERROR', 500);
      if (!data) return fail('Bot not found', 'BOT_NOT_FOUND', 404);
      return ok(data);
    }

    if (action === 'get_bot_logs') {
      const botId = typeof body.bot_id === 'string' ? body.bot_id : '';
      const limit = Math.max(1, Math.min(200, Number(body.limit ?? 100)));
      const offset = Math.max(0, Number(body.offset ?? 0));
      if (!botId) return fail('bot_id is required', 'VALIDATION_FAILED', 400);

      const { data: bot, error: botError } = await supabase
        .from('trading_bots')
        .select('id')
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .maybeSingle();

      if (botError) return fail(botError.message, 'DB_ERROR', 500);
      if (!bot) return fail('Bot not found', 'BOT_NOT_FOUND', 404);

      const { data, error } = await supabase
        .from('bot_execution_logs')
        .select('*')
        .eq('wallet_address', wallet)
        .eq('bot_id', botId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return fail(error.message, 'DB_ERROR', 500);
      return ok(data ?? []);
    }

    if (action === 'log_bot_execution') {
      const botId = typeof body.bot_id === 'string' ? body.bot_id : '';
      const status = typeof body.status === 'string' ? body.status : '';
      const logAction = typeof body.log_action === 'string' ? body.log_action : typeof body.action_name === 'string' ? body.action_name : '';
      if (!botId || !status || !logAction) {
        return fail('bot_id, log_action, and status are required', 'VALIDATION_FAILED', 400);
      }
      if (!['success', 'failed', 'skipped', 'pending'].includes(status)) {
        return fail('Invalid log status', 'VALIDATION_FAILED', 400);
      }

      const { data: bot, error: botError } = await supabase
        .from('trading_bots')
        .select('id')
        .eq('id', botId)
        .eq('wallet_address', wallet)
        .is('deleted_at', null)
        .maybeSingle();

      if (botError) return fail(botError.message, 'DB_ERROR', 500);
      if (!bot) return fail('Bot not found', 'BOT_NOT_FOUND', 404);

      const logPayload = {
        wallet_address: wallet,
        bot_id: botId,
        action: logAction,
        status,
        opportunity_id: typeof body.opportunity_id === 'string' ? body.opportunity_id : null,
        token_pair: typeof body.token_pair === 'string' ? body.token_pair : null,
        buy_dex: typeof body.buy_dex === 'string' ? body.buy_dex : null,
        sell_dex: typeof body.sell_dex === 'string' ? body.sell_dex : null,
        network: typeof body.network === 'string' ? body.network : null,
        loan_amount: typeof body.loan_amount === 'number' ? body.loan_amount : null,
        expected_profit: typeof body.expected_profit === 'number' ? body.expected_profit : null,
        actual_profit: typeof body.actual_profit === 'number' ? body.actual_profit : null,
        gas_cost: typeof body.gas_cost === 'number' ? body.gas_cost : null,
        transaction_hash: typeof body.transaction_hash === 'string' ? body.transaction_hash : null,
        block_number: typeof body.block_number === 'number' ? body.block_number : null,
        execution_time_ms: typeof body.execution_time_ms === 'number' ? body.execution_time_ms : null,
        error_message: typeof body.error_message === 'string' ? body.error_message : null,
        error_code: typeof body.error_code === 'string' ? body.error_code : null,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      };

      const { data, error } = await supabase
        .from('bot_execution_logs')
        .insert(logPayload)
        .select('*')
        .single();

      if (error) return fail(error.message, 'DB_ERROR', 500);
      return ok(data, 201);
    }

    return fail(`Unsupported action: ${action || 'none'}`, 'ACTION_UNSUPPORTED', 400);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unknown error', 'UNHANDLED', 500);
  }
});
