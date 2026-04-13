-- ================================================================
--  FLASH ARBITRAGE BOT - COMPLETE DATABASE SETUP
-- ================================================================
--  
--  HOW TO USE:
--  1. Go to your Supabase Dashboard: https://supabase.com/dashboard
--  2. Select your project
--  3. Click "SQL Editor" in the left sidebar
--  4. Click "+ New query"
--  5. Paste this ENTIRE file
--  6. Click "Run" (or Ctrl+Enter / Cmd+Enter)
--  7. You should see "Success. No rows returned" - that means it worked!
--  This creates ALL tables in the correct order:
--    - governance_audit_logs    (audit trail)
--    - opportunities            (arbitrage opportunities)
--    - transactions             (executed transactions)
--    - user_settings            (per-wallet settings)
--    - notification_preferences (alert channels)
--    - smart_contracts          (deployed contracts)
--    - telegram_links           (Telegram integration)
--    - scheduler_24_7_config    (24/7 bot config)
--    - scheduler_24_7_logs      (scan execution logs)
--    - scheduler_daily_stats    (daily performance)
--    - smart_mode_config        (dynamic scan frequency)
--    - market_conditions_history(market snapshots)
--    - trade_execution_logs     (trade audit trail)
--    - circuit_breaker_state    (safety mechanism)
--    - auto_trade_config        (risk management)
--    - external_cron_services   (webhook triggers)
--    - daily_trade_stats        (trade-level daily stats)
--    - user_profiles            (auth user profiles)
--    - user_2fa                 (two-factor auth)
--    - user_price_alerts        (price alert rules)
--    - wallet_alert_rules       (wallet monitoring rules)
--    - wallet_alert_history     (wallet alert log)
--    - wallet_balance_history   (balance tracking)
--    - wallet_analysis_history  (ML analysis log)
--    - webhooks                 (webhook configs)
--    - webhook_retry_queue      (webhook delivery log)
--    - emergency_stop_logs      (emergency stop audit)
--    - scheduler_jobs           (legacy scheduler)
--    - scheduler_logs           (legacy scheduler logs)
--
--  SAFE TO RE-RUN: Uses IF NOT EXISTS and ON CONFLICT everywhere.
--  Total: 28 tables + 3 views



-- ================================================================
-- MIGRATION 001: Governance Audit Logs
-- ================================================================

CREATE TABLE IF NOT EXISTS governance_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    action_category VARCHAR(30) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    entity_name VARCHAR(255) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    previous_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_action_type ON governance_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_action_category ON governance_audit_logs(action_category);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON governance_audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON governance_audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON governance_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON governance_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_category_date ON governance_audit_logs(action_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_date ON governance_audit_logs(user_id, created_at DESC);

ALTER TABLE governance_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'governance_audit_logs' AND policyname = 'Allow read access to audit logs') THEN
    CREATE POLICY "Allow read access to audit logs" ON governance_audit_logs FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'governance_audit_logs' AND policyname = 'Allow insert access to audit logs') THEN
    CREATE POLICY "Allow insert access to audit logs" ON governance_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'governance_audit_logs' AND policyname = 'Allow anonymous read access') THEN
    CREATE POLICY "Allow anonymous read access" ON governance_audit_logs FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'governance_audit_logs' AND policyname = 'Allow anonymous insert access') THEN
    CREATE POLICY "Allow anonymous insert access" ON governance_audit_logs FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE governance_audit_logs IS 'Stores audit trail for all governance actions';


-- ================================================================
-- MIGRATION 002: Arbitrage Core Tables
-- ================================================================

-- Opportunities
CREATE TABLE IF NOT EXISTS opportunities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token_pair VARCHAR(50) NOT NULL,
    buy_dex VARCHAR(50) NOT NULL,
    sell_dex VARCHAR(50) NOT NULL,
    buy_price DECIMAL(30, 18) NOT NULL,
    sell_price DECIMAL(30, 18) NOT NULL,
    profit_percentage DECIMAL(10, 4) NOT NULL,
    estimated_profit DECIMAL(30, 18) NOT NULL,
    loan_amount DECIMAL(30, 18) NOT NULL,
    gas_cost DECIMAL(30, 18) NOT NULL,
    liquidity DECIMAL(30, 18) DEFAULT 0,
    confidence_score INTEGER DEFAULT 50,
    network VARCHAR(20) DEFAULT 'ethereum',
    status VARCHAR(20) DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    token_pair VARCHAR(50) NOT NULL,
    buy_dex VARCHAR(50) NOT NULL,
    sell_dex VARCHAR(50) NOT NULL,
    loan_amount DECIMAL(30, 18) NOT NULL,
    profit DECIMAL(30, 18) NOT NULL,
    gas_used DECIMAL(30, 18) NOT NULL,
    transaction_hash VARCHAR(66),
    status VARCHAR(20) DEFAULT 'pending',
    network VARCHAR(20) DEFAULT 'ethereum',
    execution_time INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- User Settings
CREATE TABLE IF NOT EXISTS user_settings (
    wallet_address VARCHAR(42) PRIMARY KEY,
    min_profit_percentage DECIMAL(10, 4) DEFAULT 0.5,
    max_gas_price DECIMAL(30, 18) DEFAULT 100,
    max_loan_amount DECIMAL(30, 18) DEFAULT 50000,
    auto_execute BOOLEAN DEFAULT false,
    enabled_networks TEXT[] DEFAULT ARRAY['ethereum'],
    enabled_dexes TEXT[] DEFAULT ARRAY['Uniswap', 'SushiSwap'],
    slippage_tolerance DECIMAL(5, 2) DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_network ON opportunities(network);
CREATE INDEX IF NOT EXISTS idx_opp_created ON opportunities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at DESC);

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'opportunities' AND policyname = 'Public read opportunities') THEN
    CREATE POLICY "Public read opportunities" ON opportunities FOR SELECT TO anon USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'opportunities' AND policyname = 'Auth read opportunities') THEN
    CREATE POLICY "Auth read opportunities" ON opportunities FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'opportunities' AND policyname = 'Auth insert opportunities') THEN
    CREATE POLICY "Auth insert opportunities" ON opportunities FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'opportunities' AND policyname = 'Anon insert opportunities') THEN
    CREATE POLICY "Anon insert opportunities" ON opportunities FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users read own transactions') THEN
    CREATE POLICY "Users read own transactions" ON transactions FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users insert transactions') THEN
    CREATE POLICY "Users insert transactions" ON transactions FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users read own settings') THEN
    CREATE POLICY "Users read own settings" ON user_settings FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users manage own settings') THEN
    CREATE POLICY "Users manage own settings" ON user_settings FOR ALL USING (true);
  END IF;
END $$;


-- ================================================================
-- MIGRATION 005 (run BEFORE 003 because 003 depends on notification_preferences)
-- Smart Contracts & Notification Preferences
-- ================================================================

-- Notification Preferences (must exist before migration 003 tries to ALTER it)
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    email_enabled BOOLEAN NOT NULL DEFAULT false,
    email_address TEXT,
    discord_enabled BOOLEAN NOT NULL DEFAULT false,
    discord_webhook_url TEXT,
    slack_enabled BOOLEAN NOT NULL DEFAULT false,
    slack_webhook_url TEXT,
    telegram_enabled BOOLEAN NOT NULL DEFAULT false,
    telegram_chat_id TEXT,
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    sound_enabled BOOLEAN NOT NULL DEFAULT true,
    trade_alerts BOOLEAN NOT NULL DEFAULT true,
    price_alerts BOOLEAN NOT NULL DEFAULT true,
    system_alerts BOOLEAN NOT NULL DEFAULT true,
    security_alerts BOOLEAN NOT NULL DEFAULT true,
    performance_alerts BOOLEAN NOT NULL DEFAULT true,
    min_profit_alert_usd DECIMAL(18, 2) NOT NULL DEFAULT 10.00,
    gas_spike_alert_gwei DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    quiet_hours_timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to notification_preferences" ON notification_preferences;
CREATE POLICY "Allow all access to notification_preferences" ON notification_preferences
    FOR ALL USING (true) WITH CHECK (true);

INSERT INTO notification_preferences (user_id)
VALUES ('default')
ON CONFLICT (user_id) DO NOTHING;

-- Smart Contracts
CREATE TABLE IF NOT EXISTS smart_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT 'ethereum',
    contract_type TEXT NOT NULL DEFAULT 'arbitrage',
    abi JSONB,
    bytecode TEXT,
    source_code TEXT,
    deployer_address TEXT,
    deploy_tx_hash TEXT,
    deploy_block_number BIGINT,
    deploy_gas_used BIGINT,
    deploy_cost_eth DECIMAL(18, 8),
    verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    etherscan_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    flash_loan_provider TEXT,
    supported_dexes TEXT[],
    supported_tokens TEXT[],
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smart_contracts_user ON smart_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_address ON smart_contracts(address);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_network ON smart_contracts(network);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_active ON smart_contracts(is_active);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_type ON smart_contracts(contract_type);

ALTER TABLE smart_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to smart_contracts" ON smart_contracts;
CREATE POLICY "Allow all access to smart_contracts" ON smart_contracts
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE smart_contracts IS 'Deployed smart contract records - addresses, ABIs, deployment metadata';
COMMENT ON TABLE notification_preferences IS 'Per-user notification channel preferences and alert thresholds';


-- ================================================================
-- MIGRATION 003: Telegram Links
-- ================================================================

CREATE TABLE IF NOT EXISTS telegram_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Use TEXT user_id instead of UUID FK to auth.users for flexibility
    -- (works whether or not Supabase Auth is configured)
    user_id TEXT NOT NULL DEFAULT 'default',
    chat_id TEXT NOT NULL,
    telegram_username TEXT,
    link_code TEXT,
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraints if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_links_user_id_key'
  ) THEN
    ALTER TABLE telegram_links ADD CONSTRAINT telegram_links_user_id_key UNIQUE (user_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_links_chat_id_key'
  ) THEN
    ALTER TABLE telegram_links ADD CONSTRAINT telegram_links_chat_id_key UNIQUE (chat_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_telegram_links_user_id ON telegram_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_chat_id ON telegram_links(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_link_code ON telegram_links(link_code);

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to telegram_links" ON telegram_links;
CREATE POLICY "Allow all access to telegram_links" ON telegram_links
    FOR ALL USING (true) WITH CHECK (true);

-- Add telegram columns to notification_preferences if they don't exist
-- (they should already exist from the CREATE TABLE above, but just in case)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_preferences' 
    AND column_name = 'telegram_enabled'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_enabled BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_preferences' 
    AND column_name = 'telegram_chat_id'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_chat_id TEXT;
  END IF;
END $$;

-- Trigger for updated_at on telegram_links
CREATE OR REPLACE FUNCTION update_telegram_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS telegram_links_updated_at ON telegram_links;
CREATE TRIGGER telegram_links_updated_at
  BEFORE UPDATE ON telegram_links
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_links_updated_at();

COMMENT ON TABLE telegram_links IS 'Stores linked Telegram accounts for notification delivery';


-- ================================================================
-- MIGRATION 004: 24/7 Scheduler & Smart Mode Tables
-- ================================================================

-- Generic updated_at function (used by many tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. scheduler_24_7_config
CREATE TABLE IF NOT EXISTS scheduler_24_7_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    scan_interval_minutes INTEGER NOT NULL DEFAULT 5,
    auto_execute_trades BOOLEAN NOT NULL DEFAULT true,
    min_profit_threshold DECIMAL(18, 2) NOT NULL DEFAULT 50.00,
    networks TEXT[] NOT NULL DEFAULT ARRAY['ethereum', 'polygon', 'arbitrum'],
    flash_loan_amount DECIMAL(18, 2) NOT NULL DEFAULT 10000.00,
    last_cron_run_at TIMESTAMPTZ,
    next_scheduled_run_at TIMESTAMPTZ,
    total_scans_24h INTEGER NOT NULL DEFAULT 0,
    total_opportunities_24h INTEGER NOT NULL DEFAULT 0,
    total_trades_24h INTEGER NOT NULL DEFAULT 0,
    total_profit_24h DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss_24h DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_scans_lifetime INTEGER NOT NULL DEFAULT 0,
    total_trades_lifetime INTEGER NOT NULL DEFAULT 0,
    total_profit_lifetime DECIMAL(18, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. scheduler_24_7_logs
CREATE TABLE IF NOT EXISTS scheduler_24_7_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    scan_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scan_type TEXT DEFAULT 'scheduled' CHECK (scan_type IN ('scheduled', 'manual', 'smart_mode')),
    opportunities_found INTEGER NOT NULL DEFAULT 0,
    trades_executed INTEGER NOT NULL DEFAULT 0,
    trades_successful INTEGER NOT NULL DEFAULT 0,
    trades_failed INTEGER NOT NULL DEFAULT 0,
    total_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    net_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    networks_scanned TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    gas_prices_gwei JSONB,
    circuit_breaker_tripped BOOLEAN NOT NULL DEFAULT false,
    circuit_breaker_reason TEXT,
    smart_mode_enabled BOOLEAN NOT NULL DEFAULT false,
    smart_mode_interval INTEGER,
    market_conditions JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped', 'partial')),
    error_message TEXT,
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. scheduler_daily_stats
CREATE TABLE IF NOT EXISTS scheduler_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_scans INTEGER NOT NULL DEFAULT 0,
    successful_scans INTEGER NOT NULL DEFAULT 0,
    failed_scans INTEGER NOT NULL DEFAULT 0,
    skipped_scans INTEGER NOT NULL DEFAULT 0,
    total_opportunities INTEGER NOT NULL DEFAULT 0,
    avg_opportunities_per_scan DECIMAL(10, 2) NOT NULL DEFAULT 0,
    best_opportunity_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_trades_executed INTEGER NOT NULL DEFAULT 0,
    total_trades_successful INTEGER NOT NULL DEFAULT 0,
    total_trades_failed INTEGER NOT NULL DEFAULT 0,
    win_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
    total_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    net_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_gas_spent DECIMAL(18, 4) NOT NULL DEFAULT 0,
    avg_profit_per_trade DECIMAL(18, 4) NOT NULL DEFAULT 0,
    avg_execution_time_ms INTEGER NOT NULL DEFAULT 0,
    max_execution_time_ms INTEGER NOT NULL DEFAULT 0,
    min_execution_time_ms INTEGER NOT NULL DEFAULT 0,
    circuit_breaker_trips INTEGER NOT NULL DEFAULT 0,
    high_gas_skips INTEGER NOT NULL DEFAULT 0,
    uptime_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    total_runtime_minutes INTEGER NOT NULL DEFAULT 0,
    network_stats JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- 4. smart_mode_config
CREATE TABLE IF NOT EXISTS smart_mode_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    base_interval_minutes INTEGER NOT NULL DEFAULT 5,
    min_interval_minutes INTEGER NOT NULL DEFAULT 1,
    max_interval_minutes INTEGER NOT NULL DEFAULT 30,
    current_interval_minutes INTEGER NOT NULL DEFAULT 5,
    gas_low_threshold INTEGER NOT NULL DEFAULT 20,
    gas_medium_threshold INTEGER NOT NULL DEFAULT 50,
    gas_high_threshold INTEGER NOT NULL DEFAULT 100,
    gas_critical_threshold INTEGER NOT NULL DEFAULT 200,
    volatility_low_threshold DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
    volatility_medium_threshold DECIMAL(5, 2) NOT NULL DEFAULT 2.00,
    volatility_high_threshold DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
    volatility_extreme_threshold DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    high_gas_interval_multiplier DECIMAL(3, 1) NOT NULL DEFAULT 2.0,
    high_volatility_interval_divisor DECIMAL(3, 1) NOT NULL DEFAULT 2.0,
    low_activity_interval_multiplier DECIMAL(3, 1) NOT NULL DEFAULT 1.5,
    last_gas_price_gwei DECIMAL(10, 2) NOT NULL DEFAULT 0,
    last_volatility_percent DECIMAL(10, 4) NOT NULL DEFAULT 0,
    last_market_check_at TIMESTAMPTZ,
    current_market_state TEXT DEFAULT 'normal' CHECK (current_market_state IN ('low_activity', 'normal', 'high_opportunity', 'high_gas', 'extreme')),
    avg_gas_24h DECIMAL(10, 2) NOT NULL DEFAULT 0,
    avg_volatility_24h DECIMAL(10, 4) NOT NULL DEFAULT 0,
    avg_opportunities_24h DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 5. market_conditions_history
CREATE TABLE IF NOT EXISTS market_conditions_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ethereum_gas_gwei DECIMAL(10, 2),
    polygon_gas_gwei DECIMAL(10, 2),
    arbitrum_gas_gwei DECIMAL(10, 2),
    optimism_gas_gwei DECIMAL(10, 2),
    bsc_gas_gwei DECIMAL(10, 2),
    avalanche_gas_gwei DECIMAL(10, 2),
    base_gas_gwei DECIMAL(10, 2),
    avg_gas_gwei DECIMAL(10, 2) NOT NULL DEFAULT 0,
    eth_price_usd DECIMAL(18, 2),
    eth_price_change_1h DECIMAL(10, 4),
    eth_price_change_24h DECIMAL(10, 4),
    eth_volume_24h DECIMAL(24, 2),
    btc_price_usd DECIMAL(18, 2),
    btc_price_change_1h DECIMAL(10, 4),
    btc_price_change_24h DECIMAL(10, 4),
    overall_volatility_score DECIMAL(10, 4) NOT NULL DEFAULT 0,
    eth_volatility DECIMAL(10, 4),
    btc_volatility DECIMAL(10, 4),
    recommended_interval_minutes INTEGER NOT NULL DEFAULT 5,
    reason TEXT,
    market_state TEXT DEFAULT 'normal',
    fear_greed_index INTEGER,
    defi_tvl_change_24h DECIMAL(10, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. trade_execution_logs
CREATE TABLE IF NOT EXISTS trade_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    opportunity_id TEXT,
    scheduler_log_id UUID,
    token_pair TEXT NOT NULL,
    buy_dex TEXT NOT NULL,
    sell_dex TEXT NOT NULL,
    network TEXT NOT NULL,
    loan_amount DECIMAL(18, 4) NOT NULL DEFAULT 0,
    buy_price DECIMAL(24, 8),
    sell_price DECIMAL(24, 8),
    estimated_profit DECIMAL(18, 4),
    expected_profit DECIMAL(18, 4),
    actual_profit DECIMAL(18, 4),
    profit_difference DECIMAL(18, 4),
    slippage_expected DECIMAL(10, 4),
    slippage_actual DECIMAL(10, 4),
    slippage_tolerance DECIMAL(10, 4),
    gas_cost DECIMAL(18, 4),
    gas_used BIGINT,
    gas_price_gwei DECIMAL(10, 2),
    gas_limit BIGINT,
    tx_hash TEXT,
    block_number BIGINT,
    flashbots_bundle_hash TEXT,
    bundle_index INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'simulated', 'submitted', 'included', 'success', 'failed', 'reverted', 'timeout')),
    failure_reason TEXT,
    error_message TEXT,
    revert_reason TEXT,
    execution_mode TEXT NOT NULL DEFAULT 'simulation' CHECK (execution_mode IN ('simulation', 'live', 'paper')),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata JSONB,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. circuit_breaker_state
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    is_tripped BOOLEAN NOT NULL DEFAULT false,
    tripped_at TIMESTAMPTZ,
    trip_reason TEXT,
    trip_type TEXT CHECK (trip_type IN ('consecutive_losses', 'daily_loss', 'daily_trades', 'manual', 'error', 'gas_spike')),
    consecutive_losses INTEGER NOT NULL DEFAULT 0,
    max_consecutive_losses INTEGER NOT NULL DEFAULT 0,
    daily_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    weekly_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    daily_trades INTEGER NOT NULL DEFAULT 0,
    daily_successful_trades INTEGER NOT NULL DEFAULT 0,
    daily_failed_trades INTEGER NOT NULL DEFAULT 0,
    last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_reset_at TIMESTAMPTZ,
    auto_reset_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_reset_hours INTEGER NOT NULL DEFAULT 24,
    total_trips INTEGER NOT NULL DEFAULT 0,
    last_trip_at TIMESTAMPTZ,
    last_trip_reason TEXT,
    cooldown_until TIMESTAMPTZ,
    cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 8. auto_trade_config
CREATE TABLE IF NOT EXISTS auto_trade_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    min_profit_threshold DECIMAL(18, 2) NOT NULL DEFAULT 50.00,
    min_profit_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
    target_profit_threshold DECIMAL(18, 2) NOT NULL DEFAULT 100.00,
    max_position_size DECIMAL(18, 2) NOT NULL DEFAULT 50000.00,
    min_position_size DECIMAL(18, 2) NOT NULL DEFAULT 1000.00,
    max_total_exposure DECIMAL(18, 2) NOT NULL DEFAULT 100000.00,
    max_slippage_percent DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
    slippage_buffer_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
    max_gas_price_gwei DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
    gas_price_buffer_percent DECIMAL(5, 2) NOT NULL DEFAULT 20.00,
    priority_fee_gwei DECIMAL(10, 2) NOT NULL DEFAULT 2.00,
    max_daily_trades INTEGER NOT NULL DEFAULT 50,
    max_daily_loss DECIMAL(18, 2) NOT NULL DEFAULT 500.00,
    max_daily_profit_target DECIMAL(18, 2) NOT NULL DEFAULT 5000.00,
    circuit_breaker_enabled BOOLEAN NOT NULL DEFAULT true,
    circuit_breaker_loss_threshold DECIMAL(18, 2) NOT NULL DEFAULT 200.00,
    circuit_breaker_consecutive_losses INTEGER NOT NULL DEFAULT 3,
    circuit_breaker_cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    flashbots_enabled BOOLEAN NOT NULL DEFAULT true,
    flashbots_max_block_delay INTEGER NOT NULL DEFAULT 2,
    private_tx_enabled BOOLEAN NOT NULL DEFAULT true,
    execution_mode TEXT NOT NULL DEFAULT 'simulation' CHECK (execution_mode IN ('simulation', 'live', 'paper')),
    require_confirmation BOOLEAN NOT NULL DEFAULT false,
    auto_compound BOOLEAN NOT NULL DEFAULT false,
    max_concurrent_trades INTEGER NOT NULL DEFAULT 3,
    min_liquidity_usd DECIMAL(18, 2) NOT NULL DEFAULT 50000.00,
    min_confidence_score INTEGER NOT NULL DEFAULT 70,
    enabled_networks TEXT[] NOT NULL DEFAULT ARRAY['ethereum', 'polygon', 'arbitrum'],
    preferred_dexes TEXT[] NOT NULL DEFAULT ARRAY['uniswap', 'sushiswap', 'curve'],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 9. external_cron_services
CREATE TABLE IF NOT EXISTS external_cron_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    service_name TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'webhook' CHECK (service_type IN ('webhook', 'cron-job.org', 'easycron', 'uptime-robot', 'github-actions', 'custom')),
    service_url TEXT,
    webhook_url TEXT,
    api_key_hash TEXT,
    secret_hash TEXT,
    auth_header TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    interval_minutes INTEGER NOT NULL DEFAULT 5,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    cron_expression TEXT,
    last_ping_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_response_time_ms INTEGER,
    total_pings INTEGER NOT NULL DEFAULT 0,
    successful_pings INTEGER NOT NULL DEFAULT 0,
    failed_pings INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    uptime_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. daily_trade_stats
CREATE TABLE IF NOT EXISTS daily_trade_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_trades INTEGER NOT NULL DEFAULT 0,
    successful_trades INTEGER NOT NULL DEFAULT 0,
    failed_trades INTEGER NOT NULL DEFAULT 0,
    total_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    net_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_gas_spent DECIMAL(18, 4) NOT NULL DEFAULT 0,
    avg_profit_per_trade DECIMAL(18, 4) NOT NULL DEFAULT 0,
    avg_slippage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    best_trade_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    worst_trade_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    network_breakdown JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, date)
);


-- ================================================================
-- ALL INDEXES (for migration 004 tables)
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_scheduler_config_user ON scheduler_24_7_config(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_config_enabled ON scheduler_24_7_config(is_enabled);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_user ON scheduler_24_7_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_created_at ON scheduler_24_7_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_scan_timestamp ON scheduler_24_7_logs(scan_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_status ON scheduler_24_7_logs(status);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_user_date ON scheduler_24_7_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user ON scheduler_daily_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON scheduler_daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON scheduler_daily_stats(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_smart_mode_user ON smart_mode_config(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_mode_enabled ON smart_mode_config(is_enabled);
CREATE INDEX IF NOT EXISTS idx_market_history_user ON market_conditions_history(user_id);
CREATE INDEX IF NOT EXISTS idx_market_history_timestamp ON market_conditions_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_market_history_user_timestamp ON market_conditions_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trade_logs_user ON trade_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_executed_at ON trade_execution_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_logs_status ON trade_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_trade_logs_network ON trade_execution_logs(network);
CREATE INDEX IF NOT EXISTS idx_trade_logs_tx_hash ON trade_execution_logs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_trade_logs_token_pair ON trade_execution_logs(token_pair);
CREATE INDEX IF NOT EXISTS idx_trade_logs_opportunity ON trade_execution_logs(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_user_date ON trade_execution_logs(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_user ON circuit_breaker_state(user_id);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_tripped ON circuit_breaker_state(is_tripped);
CREATE INDEX IF NOT EXISTS idx_auto_trade_user ON auto_trade_config(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_trade_mode ON auto_trade_config(execution_mode);
CREATE INDEX IF NOT EXISTS idx_cron_services_user ON external_cron_services(user_id);
CREATE INDEX IF NOT EXISTS idx_cron_services_active ON external_cron_services(is_active);
CREATE INDEX IF NOT EXISTS idx_cron_services_type ON external_cron_services(service_type);
CREATE INDEX IF NOT EXISTS idx_daily_trade_stats_user ON daily_trade_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_trade_stats_date ON daily_trade_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_trade_stats_user_date ON daily_trade_stats(user_id, date DESC);


-- ================================================================
-- ENABLE RLS ON ALL MIGRATION 004 TABLES
-- ================================================================

ALTER TABLE scheduler_24_7_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_24_7_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_mode_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_conditions_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_trade_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_cron_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_trade_stats ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- RLS POLICIES FOR MIGRATION 004 TABLES
-- ================================================================

DROP POLICY IF EXISTS "Allow all access to scheduler_24_7_config" ON scheduler_24_7_config;
CREATE POLICY "Allow all access to scheduler_24_7_config" ON scheduler_24_7_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to scheduler_24_7_logs" ON scheduler_24_7_logs;
CREATE POLICY "Allow all access to scheduler_24_7_logs" ON scheduler_24_7_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to scheduler_daily_stats" ON scheduler_daily_stats;
CREATE POLICY "Allow all access to scheduler_daily_stats" ON scheduler_daily_stats FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to smart_mode_config" ON smart_mode_config;
CREATE POLICY "Allow all access to smart_mode_config" ON smart_mode_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to market_conditions_history" ON market_conditions_history;
CREATE POLICY "Allow all access to market_conditions_history" ON market_conditions_history FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to trade_execution_logs" ON trade_execution_logs;
CREATE POLICY "Allow all access to trade_execution_logs" ON trade_execution_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to circuit_breaker_state" ON circuit_breaker_state;
CREATE POLICY "Allow all access to circuit_breaker_state" ON circuit_breaker_state FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to auto_trade_config" ON auto_trade_config;
CREATE POLICY "Allow all access to auto_trade_config" ON auto_trade_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to external_cron_services" ON external_cron_services;
CREATE POLICY "Allow all access to external_cron_services" ON external_cron_services FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to daily_trade_stats" ON daily_trade_stats;
CREATE POLICY "Allow all access to daily_trade_stats" ON daily_trade_stats FOR ALL USING (true) WITH CHECK (true);


-- ================================================================
-- INSERT DEFAULT CONFIGURATION RECORDS
-- ================================================================

INSERT INTO scheduler_24_7_config (user_id, is_enabled, scan_interval_minutes, auto_execute_trades, min_profit_threshold, networks, flash_loan_amount)
VALUES ('default', false, 5, true, 50.00, ARRAY['ethereum', 'polygon', 'arbitrum'], 10000.00)
ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW();

INSERT INTO smart_mode_config (user_id, is_enabled, base_interval_minutes, min_interval_minutes, max_interval_minutes, gas_low_threshold, gas_medium_threshold, gas_high_threshold, gas_critical_threshold, volatility_low_threshold, volatility_medium_threshold, volatility_high_threshold, volatility_extreme_threshold, high_gas_interval_multiplier, high_volatility_interval_divisor)
VALUES ('default', false, 5, 1, 30, 20, 50, 100, 200, 0.50, 2.00, 5.00, 10.00, 2.0, 2.0)
ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW();

INSERT INTO circuit_breaker_state (user_id, is_tripped, consecutive_losses, daily_loss, daily_trades, last_reset_date, auto_reset_enabled, auto_reset_hours, cooldown_minutes)
VALUES ('default', false, 0, 0, 0, CURRENT_DATE, true, 24, 60)
ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW();

INSERT INTO auto_trade_config (user_id, min_profit_threshold, min_profit_percentage, target_profit_threshold, max_position_size, min_position_size, max_total_exposure, max_slippage_percent, slippage_buffer_percent, max_gas_price_gwei, gas_price_buffer_percent, priority_fee_gwei, max_daily_trades, max_daily_loss, max_daily_profit_target, circuit_breaker_enabled, circuit_breaker_loss_threshold, circuit_breaker_consecutive_losses, circuit_breaker_cooldown_minutes, flashbots_enabled, flashbots_max_block_delay, private_tx_enabled, execution_mode, require_confirmation, auto_compound, max_concurrent_trades, min_liquidity_usd, min_confidence_score, enabled_networks, preferred_dexes)
VALUES ('default', 50.00, 0.50, 100.00, 50000.00, 1000.00, 100000.00, 1.00, 0.50, 100.00, 20.00, 2.00, 50, 500.00, 5000.00, true, 200.00, 3, 60, true, 2, true, 'simulation', false, false, 3, 50000.00, 70, ARRAY['ethereum', 'polygon', 'arbitrum'], ARRAY['uniswap', 'sushiswap', 'curve'])
ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW();


-- ================================================================
-- TRIGGERS FOR AUTOMATIC updated_at
-- ================================================================

DROP TRIGGER IF EXISTS update_scheduler_config_updated_at ON scheduler_24_7_config;
CREATE TRIGGER update_scheduler_config_updated_at BEFORE UPDATE ON scheduler_24_7_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_smart_mode_config_updated_at ON smart_mode_config;
CREATE TRIGGER update_smart_mode_config_updated_at BEFORE UPDATE ON smart_mode_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_circuit_breaker_updated_at ON circuit_breaker_state;
CREATE TRIGGER update_circuit_breaker_updated_at BEFORE UPDATE ON circuit_breaker_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auto_trade_config_updated_at ON auto_trade_config;
CREATE TRIGGER update_auto_trade_config_updated_at BEFORE UPDATE ON auto_trade_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_stats_updated_at ON scheduler_daily_stats;
CREATE TRIGGER update_daily_stats_updated_at BEFORE UPDATE ON scheduler_daily_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_external_cron_updated_at ON external_cron_services;
CREATE TRIGGER update_external_cron_updated_at BEFORE UPDATE ON external_cron_services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_trade_stats_updated_at ON daily_trade_stats;
CREATE TRIGGER update_daily_trade_stats_updated_at BEFORE UPDATE ON daily_trade_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_smart_contracts_updated_at ON smart_contracts;
CREATE TRIGGER update_smart_contracts_updated_at BEFORE UPDATE ON smart_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notif_prefs_updated_at ON notification_preferences;
CREATE TRIGGER update_notif_prefs_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ================================================================
-- VIEWS FOR COMMON QUERIES
-- ================================================================

CREATE OR REPLACE VIEW v_recent_scheduler_activity AS
SELECT 
    l.id, l.scan_timestamp, l.opportunities_found, l.trades_executed,
    l.trades_successful, l.total_profit, l.total_loss, l.net_profit,
    l.execution_time_ms, l.status, l.circuit_breaker_tripped,
    l.smart_mode_enabled, c.is_enabled as scheduler_enabled,
    c.scan_interval_minutes, s.is_enabled as smart_mode_config_enabled,
    s.current_interval_minutes as smart_mode_interval
FROM scheduler_24_7_logs l
LEFT JOIN scheduler_24_7_config c ON l.user_id = c.user_id
LEFT JOIN smart_mode_config s ON l.user_id = s.user_id
ORDER BY l.scan_timestamp DESC
LIMIT 100;

CREATE OR REPLACE VIEW v_daily_performance AS
SELECT 
    date, total_scans, total_opportunities, total_trades_executed,
    total_trades_successful,
    CASE WHEN total_trades_executed > 0 
        THEN ROUND((total_trades_successful::DECIMAL / total_trades_executed) * 100, 2)
        ELSE 0 END as win_rate,
    total_profit, total_loss, net_profit, total_gas_spent,
    circuit_breaker_trips, uptime_percentage
FROM scheduler_daily_stats
WHERE user_id = 'default'
ORDER BY date DESC
LIMIT 30;

CREATE OR REPLACE VIEW v_recent_trades AS
SELECT 
    id, token_pair, buy_dex, sell_dex, network, loan_amount,
    estimated_profit, actual_profit, slippage_actual, gas_cost,
    status, execution_mode, tx_hash, executed_at
FROM trade_execution_logs
WHERE user_id = 'default'
ORDER BY executed_at DESC
LIMIT 50;


-- ================================================================
-- TABLE COMMENTS
-- ================================================================

COMMENT ON TABLE scheduler_24_7_config IS 'Main configuration for 24/7 automated trading bot';
COMMENT ON TABLE scheduler_24_7_logs IS 'Logs for each scan execution by the 24/7 scheduler';
COMMENT ON TABLE scheduler_daily_stats IS 'Daily aggregated performance statistics';
COMMENT ON TABLE smart_mode_config IS 'Configuration for Smart Mode dynamic scan frequency';
COMMENT ON TABLE market_conditions_history IS 'Historical market data snapshots for Smart Mode';
COMMENT ON TABLE trade_execution_logs IS 'Detailed log of every trade attempted or executed';
COMMENT ON TABLE circuit_breaker_state IS 'Safety circuit breaker state tracking';
COMMENT ON TABLE auto_trade_config IS 'User-configurable safety limits for auto-trading';
COMMENT ON TABLE external_cron_services IS 'Registered external cron services for webhook triggers';
COMMENT ON TABLE daily_trade_stats IS 'Daily aggregated trade statistics';
COMMENT ON VIEW v_recent_scheduler_activity IS 'Recent scheduler activity with config status';
COMMENT ON VIEW v_daily_performance IS 'Daily performance summary for the last 30 days';
COMMENT ON VIEW v_recent_trades IS 'Recent trade executions for history display';


-- ================================================================
-- ADDITIONAL TABLES (referenced in app code, needed for full functionality)
-- ================================================================

-- 11. user_profiles (used by AuthContext for user profile data)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY,
    display_name TEXT,
    avatar_url TEXT,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    last_sign_in TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON user_profiles(id);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to user_profiles" ON user_profiles;
CREATE POLICY "Allow all access to user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 12. user_2fa (used by twoFactorAuthService)
CREATE TABLE IF NOT EXISTS user_2fa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    secret TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    backup_codes TEXT[],
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_2fa_user ON user_2fa(user_id);
ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to user_2fa" ON user_2fa;
CREATE POLICY "Allow all access to user_2fa" ON user_2fa FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_2fa_updated_at ON user_2fa;
CREATE TRIGGER update_user_2fa_updated_at BEFORE UPDATE ON user_2fa FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 13. user_price_alerts (used by userAlertService)
CREATE TABLE IF NOT EXISTS user_price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    token_id TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    token_name TEXT,
    alert_type TEXT NOT NULL DEFAULT 'price_above' CHECK (alert_type IN ('price_above', 'price_below', 'percent_change', 'volume_spike')),
    target_value DECIMAL(24, 8) NOT NULL,
    current_value DECIMAL(24, 8),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_triggered BOOLEAN NOT NULL DEFAULT false,
    triggered_at TIMESTAMPTZ,
    notification_channels TEXT[] DEFAULT ARRAY['in_app'],
    repeat_alert BOOLEAN NOT NULL DEFAULT false,
    cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON user_price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_token ON user_price_alerts(token_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON user_price_alerts(is_active);
ALTER TABLE user_price_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to user_price_alerts" ON user_price_alerts;
CREATE POLICY "Allow all access to user_price_alerts" ON user_price_alerts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_user_price_alerts_updated_at ON user_price_alerts;
CREATE TRIGGER update_user_price_alerts_updated_at BEFORE UPDATE ON user_price_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. wallet_alert_rules (used by walletAlertService)
CREATE TABLE IF NOT EXISTS wallet_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    rule_type TEXT NOT NULL DEFAULT 'balance_change' CHECK (rule_type IN ('balance_change', 'large_transfer', 'token_approval', 'contract_interaction', 'gas_spike')),
    threshold DECIMAL(24, 8),
    comparison TEXT DEFAULT 'greater_than' CHECK (comparison IN ('greater_than', 'less_than', 'equals', 'percent_change')),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    notification_channels TEXT[] DEFAULT ARRAY['in_app'],
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    cooldown_minutes INTEGER NOT NULL DEFAULT 30,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_rules_user ON wallet_alert_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_rules_wallet ON wallet_alert_rules(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_rules_enabled ON wallet_alert_rules(is_enabled);
ALTER TABLE wallet_alert_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to wallet_alert_rules" ON wallet_alert_rules;
CREATE POLICY "Allow all access to wallet_alert_rules" ON wallet_alert_rules FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_wallet_alert_rules_updated_at ON wallet_alert_rules;
CREATE TRIGGER update_wallet_alert_rules_updated_at BEFORE UPDATE ON wallet_alert_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 15. wallet_alert_history (used by walletAlertService)
CREATE TABLE IF NOT EXISTS wallet_alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES wallet_alert_rules(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    details JSONB,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_history_user ON wallet_alert_history(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_history_rule ON wallet_alert_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_wallet_history_triggered ON wallet_alert_history(triggered_at DESC);
ALTER TABLE wallet_alert_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to wallet_alert_history" ON wallet_alert_history;
CREATE POLICY "Allow all access to wallet_alert_history" ON wallet_alert_history FOR ALL USING (true) WITH CHECK (true);

-- 16. wallet_balance_history (used by WalletBalanceMonitor)
CREATE TABLE IF NOT EXISTS wallet_balance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    balance_eth DECIMAL(24, 8) NOT NULL DEFAULT 0,
    balance_usd DECIMAL(18, 2),
    network TEXT NOT NULL DEFAULT 'ethereum',
    token_balances JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_history_wallet ON wallet_balance_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_balance_history_recorded ON wallet_balance_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_history_wallet_time ON wallet_balance_history(wallet_address, recorded_at DESC);
ALTER TABLE wallet_balance_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to wallet_balance_history" ON wallet_balance_history;
CREATE POLICY "Allow all access to wallet_balance_history" ON wallet_balance_history FOR ALL USING (true) WITH CHECK (true);

-- 17. wallet_analysis_history (used by alertSuggestionService ML)
CREATE TABLE IF NOT EXISTS wallet_analysis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    analysis_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analysis_type TEXT DEFAULT 'ml_suggestion',
    risk_score DECIMAL(5, 2),
    suggestions JSONB,
    patterns_detected JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_history_wallet ON wallet_analysis_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_analysis_history_date ON wallet_analysis_history(analysis_date DESC);
ALTER TABLE wallet_analysis_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to wallet_analysis_history" ON wallet_analysis_history;
CREATE POLICY "Allow all access to wallet_analysis_history" ON wallet_analysis_history FOR ALL USING (true) WITH CHECK (true);

-- 18. webhooks (used by webhookService)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'custom' CHECK (platform IN ('discord', 'slack', 'telegram', 'custom')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_profit_threshold DECIMAL(18, 2) NOT NULL DEFAULT 0,
    events TEXT[] DEFAULT ARRAY['trade_executed', 'opportunity_found'],
    custom_headers JSONB DEFAULT '{}',
    payload_template JSONB,
    secret_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to webhooks" ON webhooks;
CREATE POLICY "Allow all access to webhooks" ON webhooks FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 19. webhook_retry_queue (used by webhookService delivery history)
CREATE TABLE IF NOT EXISTS webhook_retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'exhausted')),
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_webhook ON webhook_retry_queue(webhook_id);
CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON webhook_retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_retry_queue_created ON webhook_retry_queue(created_at DESC);
ALTER TABLE webhook_retry_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to webhook_retry_queue" ON webhook_retry_queue;
CREATE POLICY "Allow all access to webhook_retry_queue" ON webhook_retry_queue FOR ALL USING (true) WITH CHECK (true);

-- 20. emergency_stop_logs (used by EmergencyStopButton)
CREATE TABLE IF NOT EXISTS emergency_stop_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    reason TEXT,
    stopped_services TEXT[],
    circuit_breaker_tripped BOOLEAN NOT NULL DEFAULT true,
    execution_mode_before TEXT,
    execution_mode_after TEXT DEFAULT 'simulation',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_logs_user ON emergency_stop_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_created ON emergency_stop_logs(created_at DESC);
ALTER TABLE emergency_stop_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to emergency_stop_logs" ON emergency_stop_logs;
CREATE POLICY "Allow all access to emergency_stop_logs" ON emergency_stop_logs FOR ALL USING (true) WITH CHECK (true);

-- 21. scheduler_jobs (legacy scheduler - used by SchedulerDashboard)
CREATE TABLE IF NOT EXISTS scheduler_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    job_name TEXT NOT NULL,
    job_type TEXT NOT NULL DEFAULT 'arbitrage-scanner',
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    interval_minutes INTEGER NOT NULL DEFAULT 5,
    cron_expression TEXT,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_user ON scheduler_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_enabled ON scheduler_jobs(is_enabled);
ALTER TABLE scheduler_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to scheduler_jobs" ON scheduler_jobs;
CREATE POLICY "Allow all access to scheduler_jobs" ON scheduler_jobs FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_scheduler_jobs_updated_at ON scheduler_jobs;
CREATE TRIGGER update_scheduler_jobs_updated_at BEFORE UPDATE ON scheduler_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 22. scheduler_logs (legacy scheduler logs - used by SchedulerDashboard)
CREATE TABLE IF NOT EXISTS scheduler_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES scheduler_jobs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL DEFAULT 'default',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
    opportunities_found INTEGER NOT NULL DEFAULT 0,
    trades_executed INTEGER NOT NULL DEFAULT 0,
    profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_logs_job ON scheduler_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_user2 ON scheduler_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_created2 ON scheduler_logs(created_at DESC);
ALTER TABLE scheduler_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to scheduler_logs" ON scheduler_logs;
CREATE POLICY "Allow all access to scheduler_logs" ON scheduler_logs FOR ALL USING (true) WITH CHECK (true);


-- ================================================================
-- VERIFICATION QUERY
-- Run this separately after the migration to verify all tables exist
-- ================================================================
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- ORDER BY table_name;
--
-- Expected tables (28):
--   auto_trade_config
--   circuit_breaker_state
--   daily_trade_stats
--   emergency_stop_logs
--   external_cron_services
--   governance_audit_logs
--   market_conditions_history
--   notification_preferences
--   opportunities
--   scheduler_24_7_config
--   scheduler_24_7_logs
--   scheduler_daily_stats
--   scheduler_jobs
--   scheduler_logs
--   smart_contracts
--   smart_mode_config
--   telegram_links
--   trade_execution_logs
--   transactions
--   user_2fa
--   user_price_alerts
--   user_profiles
--   user_settings
--   wallet_alert_history
--   wallet_alert_rules
--   wallet_analysis_history
--   wallet_balance_history
--   webhook_retry_queue
--   webhooks


-- ================================================================
-- MIGRATION 029: Trading Bot Control Plane (Phase 2)
-- ================================================================

CREATE TABLE IF NOT EXISTS trading_bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(42) NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'paused', 'error')),

    min_profit_threshold DECIMAL(18, 2) NOT NULL,
    max_gas_limit DECIMAL(18, 2) NOT NULL,
    token_pairs TEXT[] NOT NULL,
    enabled_networks TEXT[] NOT NULL,
    enabled_dexes TEXT[] NOT NULL,

    active_hours_start INTEGER NOT NULL,
    active_hours_end INTEGER NOT NULL,
    daily_trade_limit INTEGER NOT NULL,
    max_concurrent_trades INTEGER NOT NULL,
    cooldown_seconds INTEGER NOT NULL,

    max_position_size DECIMAL(18, 2) NOT NULL,
    stop_loss_percentage DECIMAL(10, 4) NOT NULL,
    daily_loss_limit DECIMAL(18, 2) NOT NULL,

    total_trades INTEGER NOT NULL DEFAULT 0,
    successful_trades INTEGER NOT NULL DEFAULT 0,
    total_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_gas_spent DECIMAL(18, 4) NOT NULL DEFAULT 0,
    trades_today INTEGER NOT NULL DEFAULT 0,
    profit_today DECIMAL(18, 4) NOT NULL DEFAULT 0,

    last_execution_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_bots_wallet ON trading_bots(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trading_bots_wallet_active ON trading_bots(wallet_address, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trading_bots_created ON trading_bots(created_at DESC);

ALTER TABLE trading_bots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to trading_bots" ON trading_bots;
CREATE POLICY "Allow all access to trading_bots" ON trading_bots FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS bot_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(42) NOT NULL,
    bot_id UUID NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,

    action TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'pending')),
    opportunity_id TEXT,
    token_pair TEXT,
    buy_dex TEXT,
    sell_dex TEXT,
    network TEXT,
    loan_amount DECIMAL(18, 4),
    expected_profit DECIMAL(18, 4),
    actual_profit DECIMAL(18, 4),
    gas_cost DECIMAL(18, 4),
    transaction_hash TEXT,
    block_number BIGINT,
    execution_time_ms INTEGER,
    error_message TEXT,
    error_code TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_execution_logs_wallet_bot_created
  ON bot_execution_logs(wallet_address, bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_execution_logs_status ON bot_execution_logs(status);

ALTER TABLE bot_execution_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to bot_execution_logs" ON bot_execution_logs;
CREATE POLICY "Allow all access to bot_execution_logs" ON bot_execution_logs FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trading_bots_set_updated_at'
  ) THEN
    CREATE TRIGGER trading_bots_set_updated_at
    BEFORE UPDATE ON trading_bots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ================================================================
-- ALL DONE! Your database is fully set up with all 28 tables.
-- ================================================================
