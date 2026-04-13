-- =============================================
-- Migration: Create 24/7 Scheduler and Smart Mode Tables
-- Version: 004
-- Description: Tables for automated 24/7 trading bot with Smart Mode
-- Created: 2026-01-25
-- Updated: 2026-01-25 - Added missing columns for edge function compatibility
-- =============================================

-- =============================================
-- DROP EXISTING TABLES (for clean migration)
-- =============================================
-- Uncomment these lines if you need to reset the tables
-- DROP TABLE IF EXISTS external_cron_services CASCADE;
-- DROP TABLE IF EXISTS auto_trade_config CASCADE;
-- DROP TABLE IF EXISTS circuit_breaker_state CASCADE;
-- DROP TABLE IF EXISTS trade_execution_logs CASCADE;
-- DROP TABLE IF EXISTS market_conditions_history CASCADE;
-- DROP TABLE IF EXISTS smart_mode_config CASCADE;
-- DROP TABLE IF EXISTS scheduler_daily_stats CASCADE;
-- DROP TABLE IF EXISTS scheduler_24_7_logs CASCADE;
-- DROP TABLE IF EXISTS scheduler_24_7_config CASCADE;

-- =============================================
-- 1. scheduler_24_7_config
-- Main configuration for 24/7 automated trading
-- Stores user settings for the automated trading bot
-- =============================================
CREATE TABLE IF NOT EXISTS scheduler_24_7_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    
    -- Core Settings
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    scan_interval_minutes INTEGER NOT NULL DEFAULT 5,
    auto_execute_trades BOOLEAN NOT NULL DEFAULT true,
    min_profit_threshold DECIMAL(18, 2) NOT NULL DEFAULT 50.00,
    networks TEXT[] NOT NULL DEFAULT ARRAY['ethereum', 'polygon', 'arbitrum'],
    flash_loan_amount DECIMAL(18, 2) NOT NULL DEFAULT 10000.00,
    
    -- Execution Tracking
    last_cron_run_at TIMESTAMPTZ,
    next_scheduled_run_at TIMESTAMPTZ,
    
    -- 24h Rolling Stats
    total_scans_24h INTEGER NOT NULL DEFAULT 0,
    total_opportunities_24h INTEGER NOT NULL DEFAULT 0,
    total_trades_24h INTEGER NOT NULL DEFAULT 0,
    total_profit_24h DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss_24h DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- Lifetime Stats
    total_scans_lifetime INTEGER NOT NULL DEFAULT 0,
    total_trades_lifetime INTEGER NOT NULL DEFAULT 0,
    total_profit_lifetime DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- =============================================
-- 2. scheduler_24_7_logs
-- Logs for each scan execution
-- Records every scan performed by the 24/7 scheduler
-- =============================================
CREATE TABLE IF NOT EXISTS scheduler_24_7_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    
    -- Scan Details
    scan_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scan_type TEXT DEFAULT 'scheduled' CHECK (scan_type IN ('scheduled', 'manual', 'smart_mode')),
    
    -- Results
    opportunities_found INTEGER NOT NULL DEFAULT 0,
    trades_executed INTEGER NOT NULL DEFAULT 0,
    trades_successful INTEGER NOT NULL DEFAULT 0,
    trades_failed INTEGER NOT NULL DEFAULT 0,
    total_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    net_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- Execution Details
    networks_scanned TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    gas_prices_gwei JSONB,
    
    -- Safety Status
    circuit_breaker_tripped BOOLEAN NOT NULL DEFAULT false,
    circuit_breaker_reason TEXT,
    
    -- Smart Mode Info
    smart_mode_enabled BOOLEAN NOT NULL DEFAULT false,
    smart_mode_interval INTEGER,
    market_conditions JSONB,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped', 'partial')),
    error_message TEXT,
    error_details JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 3. scheduler_daily_stats
-- Daily aggregated statistics
-- Aggregated performance metrics per day
-- =============================================
CREATE TABLE IF NOT EXISTS scheduler_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Scan Metrics
    total_scans INTEGER NOT NULL DEFAULT 0,
    successful_scans INTEGER NOT NULL DEFAULT 0,
    failed_scans INTEGER NOT NULL DEFAULT 0,
    skipped_scans INTEGER NOT NULL DEFAULT 0,
    
    -- Opportunity Metrics
    total_opportunities INTEGER NOT NULL DEFAULT 0,
    avg_opportunities_per_scan DECIMAL(10, 2) NOT NULL DEFAULT 0,
    best_opportunity_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- Trade Metrics
    total_trades_executed INTEGER NOT NULL DEFAULT 0,
    total_trades_successful INTEGER NOT NULL DEFAULT 0,
    total_trades_failed INTEGER NOT NULL DEFAULT 0,
    win_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
    
    -- Financial Metrics
    total_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    net_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_gas_spent DECIMAL(18, 4) NOT NULL DEFAULT 0,
    avg_profit_per_trade DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- Performance Metrics
    avg_execution_time_ms INTEGER NOT NULL DEFAULT 0,
    max_execution_time_ms INTEGER NOT NULL DEFAULT 0,
    min_execution_time_ms INTEGER NOT NULL DEFAULT 0,
    
    -- Safety Metrics
    circuit_breaker_trips INTEGER NOT NULL DEFAULT 0,
    high_gas_skips INTEGER NOT NULL DEFAULT 0,
    
    -- Uptime
    uptime_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    total_runtime_minutes INTEGER NOT NULL DEFAULT 0,
    
    -- Network Breakdown (JSONB for flexibility)
    network_stats JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

-- =============================================
-- 4. smart_mode_config
-- Smart mode configuration
-- Settings for dynamic scan frequency adjustment based on market conditions
-- =============================================
CREATE TABLE IF NOT EXISTS smart_mode_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    
    -- Enable/Disable
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Interval Settings
    base_interval_minutes INTEGER NOT NULL DEFAULT 5,
    min_interval_minutes INTEGER NOT NULL DEFAULT 1,
    max_interval_minutes INTEGER NOT NULL DEFAULT 30,
    current_interval_minutes INTEGER NOT NULL DEFAULT 5,
    
    -- Gas Thresholds (in Gwei)
    gas_low_threshold INTEGER NOT NULL DEFAULT 20,
    gas_medium_threshold INTEGER NOT NULL DEFAULT 50,
    gas_high_threshold INTEGER NOT NULL DEFAULT 100,
    gas_critical_threshold INTEGER NOT NULL DEFAULT 200,
    
    -- Volatility Thresholds (in %)
    volatility_low_threshold DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
    volatility_medium_threshold DECIMAL(5, 2) NOT NULL DEFAULT 2.00,
    volatility_high_threshold DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
    volatility_extreme_threshold DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    
    -- Adjustment Multipliers
    high_gas_interval_multiplier DECIMAL(3, 1) NOT NULL DEFAULT 2.0,
    high_volatility_interval_divisor DECIMAL(3, 1) NOT NULL DEFAULT 2.0,
    low_activity_interval_multiplier DECIMAL(3, 1) NOT NULL DEFAULT 1.5,
    
    -- Current Market State
    last_gas_price_gwei DECIMAL(10, 2) NOT NULL DEFAULT 0,
    last_volatility_percent DECIMAL(10, 4) NOT NULL DEFAULT 0,
    last_market_check_at TIMESTAMPTZ,
    current_market_state TEXT DEFAULT 'normal' CHECK (current_market_state IN ('low_activity', 'normal', 'high_opportunity', 'high_gas', 'extreme')),
    
    -- Historical Averages
    avg_gas_24h DECIMAL(10, 2) NOT NULL DEFAULT 0,
    avg_volatility_24h DECIMAL(10, 4) NOT NULL DEFAULT 0,
    avg_opportunities_24h DECIMAL(10, 2) NOT NULL DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- =============================================
-- 5. market_conditions_history
-- Historical market data for Smart Mode
-- Records market snapshots used by Smart Mode for decision making
-- =============================================
CREATE TABLE IF NOT EXISTS market_conditions_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Gas Prices by Network (in Gwei)
    ethereum_gas_gwei DECIMAL(10, 2),
    polygon_gas_gwei DECIMAL(10, 2),
    arbitrum_gas_gwei DECIMAL(10, 2),
    optimism_gas_gwei DECIMAL(10, 2),
    bsc_gas_gwei DECIMAL(10, 2),
    avalanche_gas_gwei DECIMAL(10, 2),
    base_gas_gwei DECIMAL(10, 2),
    avg_gas_gwei DECIMAL(10, 2) NOT NULL DEFAULT 0,
    
    -- ETH Price Data
    eth_price_usd DECIMAL(18, 2),
    eth_price_change_1h DECIMAL(10, 4),
    eth_price_change_24h DECIMAL(10, 4),
    eth_volume_24h DECIMAL(24, 2),
    
    -- BTC Price Data
    btc_price_usd DECIMAL(18, 2),
    btc_price_change_1h DECIMAL(10, 4),
    btc_price_change_24h DECIMAL(10, 4),
    
    -- Volatility Metrics
    overall_volatility_score DECIMAL(10, 4) NOT NULL DEFAULT 0,
    eth_volatility DECIMAL(10, 4),
    btc_volatility DECIMAL(10, 4),
    
    -- Smart Mode Decision
    recommended_interval_minutes INTEGER NOT NULL DEFAULT 5,
    reason TEXT,
    market_state TEXT DEFAULT 'normal',
    
    -- Additional Market Data
    fear_greed_index INTEGER,
    defi_tvl_change_24h DECIMAL(10, 4),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 6. trade_execution_logs
-- Individual trade execution records
-- Detailed log of every trade attempted or executed
-- =============================================
CREATE TABLE IF NOT EXISTS trade_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    
    -- Opportunity Reference
    opportunity_id TEXT,
    scheduler_log_id UUID REFERENCES scheduler_24_7_logs(id),
    
    -- Trade Details
    token_pair TEXT NOT NULL,
    buy_dex TEXT NOT NULL,
    sell_dex TEXT NOT NULL,
    network TEXT NOT NULL,
    
    -- Amounts
    loan_amount DECIMAL(18, 4) NOT NULL DEFAULT 0,
    buy_price DECIMAL(24, 8),
    sell_price DECIMAL(24, 8),
    
    -- Profit/Loss
    estimated_profit DECIMAL(18, 4),
    expected_profit DECIMAL(18, 4),
    actual_profit DECIMAL(18, 4),
    profit_difference DECIMAL(18, 4),
    
    -- Slippage
    slippage_expected DECIMAL(10, 4),
    slippage_actual DECIMAL(10, 4),
    slippage_tolerance DECIMAL(10, 4),
    
    -- Gas Details
    gas_cost DECIMAL(18, 4),
    gas_used BIGINT,
    gas_price_gwei DECIMAL(10, 2),
    gas_limit BIGINT,
    
    -- Transaction Details
    tx_hash TEXT,
    block_number BIGINT,
    flashbots_bundle_hash TEXT,
    bundle_index INTEGER,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'simulated', 'submitted', 'included', 'success', 'failed', 'reverted', 'timeout')),
    failure_reason TEXT,
    error_message TEXT,
    revert_reason TEXT,
    
    -- Execution Mode
    execution_mode TEXT NOT NULL DEFAULT 'simulation' CHECK (execution_mode IN ('simulation', 'live', 'paper')),
    
    -- Timestamps
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Additional Data
    metadata JSONB,
    raw_response JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 7. circuit_breaker_state
-- Circuit breaker status tracking
-- Tracks the state of the safety circuit breaker
-- =============================================
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    
    -- Current State
    is_tripped BOOLEAN NOT NULL DEFAULT false,
    tripped_at TIMESTAMPTZ,
    trip_reason TEXT,
    trip_type TEXT CHECK (trip_type IN ('consecutive_losses', 'daily_loss', 'daily_trades', 'manual', 'error', 'gas_spike')),
    
    -- Loss Tracking
    consecutive_losses INTEGER NOT NULL DEFAULT 0,
    max_consecutive_losses INTEGER NOT NULL DEFAULT 0,
    daily_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    weekly_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- Trade Tracking
    daily_trades INTEGER NOT NULL DEFAULT 0,
    daily_successful_trades INTEGER NOT NULL DEFAULT 0,
    daily_failed_trades INTEGER NOT NULL DEFAULT 0,
    
    -- Reset Tracking
    last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_reset_at TIMESTAMPTZ,
    auto_reset_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_reset_hours INTEGER NOT NULL DEFAULT 24,
    
    -- Historical
    total_trips INTEGER NOT NULL DEFAULT 0,
    last_trip_at TIMESTAMPTZ,
    last_trip_reason TEXT,
    
    -- Cooldown
    cooldown_until TIMESTAMPTZ,
    cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- =============================================
-- 8. auto_trade_config
-- Safety configuration for auto-trading
-- User-configurable safety limits and thresholds
-- =============================================
CREATE TABLE IF NOT EXISTS auto_trade_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    
    -- Profit Thresholds
    min_profit_threshold DECIMAL(18, 2) NOT NULL DEFAULT 50.00,
    min_profit_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
    target_profit_threshold DECIMAL(18, 2) NOT NULL DEFAULT 100.00,
    
    -- Position Limits
    max_position_size DECIMAL(18, 2) NOT NULL DEFAULT 50000.00,
    min_position_size DECIMAL(18, 2) NOT NULL DEFAULT 1000.00,
    max_total_exposure DECIMAL(18, 2) NOT NULL DEFAULT 100000.00,
    
    -- Slippage Settings
    max_slippage_percent DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
    slippage_buffer_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
    
    -- Gas Settings
    max_gas_price_gwei DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
    gas_price_buffer_percent DECIMAL(5, 2) NOT NULL DEFAULT 20.00,
    priority_fee_gwei DECIMAL(10, 2) NOT NULL DEFAULT 2.00,
    
    -- Daily Limits
    max_daily_trades INTEGER NOT NULL DEFAULT 50,
    max_daily_loss DECIMAL(18, 2) NOT NULL DEFAULT 500.00,
    max_daily_profit_target DECIMAL(18, 2) NOT NULL DEFAULT 5000.00,
    
    -- Circuit Breaker Settings
    circuit_breaker_enabled BOOLEAN NOT NULL DEFAULT true,
    circuit_breaker_loss_threshold DECIMAL(18, 2) NOT NULL DEFAULT 200.00,
    circuit_breaker_consecutive_losses INTEGER NOT NULL DEFAULT 3,
    circuit_breaker_cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    
    -- Flashbots Settings
    flashbots_enabled BOOLEAN NOT NULL DEFAULT true,
    flashbots_max_block_delay INTEGER NOT NULL DEFAULT 2,
    private_tx_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Execution Settings
    execution_mode TEXT NOT NULL DEFAULT 'simulation' CHECK (execution_mode IN ('simulation', 'live', 'paper')),
    require_confirmation BOOLEAN NOT NULL DEFAULT false,
    auto_compound BOOLEAN NOT NULL DEFAULT false,
    
    -- Risk Management
    max_concurrent_trades INTEGER NOT NULL DEFAULT 3,
    min_liquidity_usd DECIMAL(18, 2) NOT NULL DEFAULT 50000.00,
    min_confidence_score INTEGER NOT NULL DEFAULT 70,
    
    -- Network Preferences
    enabled_networks TEXT[] NOT NULL DEFAULT ARRAY['ethereum', 'polygon', 'arbitrum'],
    preferred_dexes TEXT[] NOT NULL DEFAULT ARRAY['uniswap', 'sushiswap', 'curve'],
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- =============================================
-- 9. external_cron_services
-- Registered external cron services
-- Tracks external services that trigger the scheduler webhook
-- =============================================
CREATE TABLE IF NOT EXISTS external_cron_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    
    -- Service Details
    service_name TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'webhook' CHECK (service_type IN ('webhook', 'cron-job.org', 'easycron', 'uptime-robot', 'github-actions', 'custom')),
    service_url TEXT,
    webhook_url TEXT,
    
    -- Authentication
    api_key_hash TEXT,
    secret_hash TEXT,
    auth_header TEXT,
    
    -- Configuration
    is_active BOOLEAN NOT NULL DEFAULT true,
    interval_minutes INTEGER NOT NULL DEFAULT 5,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    cron_expression TEXT,
    
    -- Health Tracking
    last_ping_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_response_time_ms INTEGER,
    
    -- Statistics
    total_pings INTEGER NOT NULL DEFAULT 0,
    successful_pings INTEGER NOT NULL DEFAULT 0,
    failed_pings INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    uptime_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    
    -- Error Tracking
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 10. daily_trade_stats (Additional table for trade-level daily stats)
-- Daily aggregated trade statistics
-- =============================================
CREATE TABLE IF NOT EXISTS daily_trade_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Trade Counts
    total_trades INTEGER NOT NULL DEFAULT 0,
    successful_trades INTEGER NOT NULL DEFAULT 0,
    failed_trades INTEGER NOT NULL DEFAULT 0,
    
    -- Financial
    total_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    net_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_gas_spent DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- Averages
    avg_profit_per_trade DECIMAL(18, 4) NOT NULL DEFAULT 0,
    avg_slippage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    
    -- Best/Worst
    best_trade_profit DECIMAL(18, 4) NOT NULL DEFAULT 0,
    worst_trade_loss DECIMAL(18, 4) NOT NULL DEFAULT 0,
    
    -- By Network (JSONB)
    network_breakdown JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

-- =============================================
-- Create Indexes for Performance
-- =============================================

-- Indexes for scheduler_24_7_config
CREATE INDEX IF NOT EXISTS idx_scheduler_config_user ON scheduler_24_7_config(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_config_enabled ON scheduler_24_7_config(is_enabled);

-- Indexes for scheduler_24_7_logs
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_user ON scheduler_24_7_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_created_at ON scheduler_24_7_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_scan_timestamp ON scheduler_24_7_logs(scan_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_status ON scheduler_24_7_logs(status);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_user_date ON scheduler_24_7_logs(user_id, created_at DESC);

-- Indexes for scheduler_daily_stats
CREATE INDEX IF NOT EXISTS idx_daily_stats_user ON scheduler_daily_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON scheduler_daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON scheduler_daily_stats(user_id, date DESC);

-- Indexes for smart_mode_config
CREATE INDEX IF NOT EXISTS idx_smart_mode_user ON smart_mode_config(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_mode_enabled ON smart_mode_config(is_enabled);

-- Indexes for market_conditions_history
CREATE INDEX IF NOT EXISTS idx_market_history_user ON market_conditions_history(user_id);
CREATE INDEX IF NOT EXISTS idx_market_history_timestamp ON market_conditions_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_market_history_user_timestamp ON market_conditions_history(user_id, timestamp DESC);

-- Indexes for trade_execution_logs
CREATE INDEX IF NOT EXISTS idx_trade_logs_user ON trade_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_executed_at ON trade_execution_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_logs_status ON trade_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_trade_logs_network ON trade_execution_logs(network);
CREATE INDEX IF NOT EXISTS idx_trade_logs_tx_hash ON trade_execution_logs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_trade_logs_token_pair ON trade_execution_logs(token_pair);
CREATE INDEX IF NOT EXISTS idx_trade_logs_opportunity ON trade_execution_logs(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_user_date ON trade_execution_logs(user_id, executed_at DESC);

-- Indexes for circuit_breaker_state
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_user ON circuit_breaker_state(user_id);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_tripped ON circuit_breaker_state(is_tripped);

-- Indexes for auto_trade_config
CREATE INDEX IF NOT EXISTS idx_auto_trade_user ON auto_trade_config(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_trade_mode ON auto_trade_config(execution_mode);

-- Indexes for external_cron_services
CREATE INDEX IF NOT EXISTS idx_cron_services_user ON external_cron_services(user_id);
CREATE INDEX IF NOT EXISTS idx_cron_services_active ON external_cron_services(is_active);
CREATE INDEX IF NOT EXISTS idx_cron_services_type ON external_cron_services(service_type);

-- Indexes for daily_trade_stats
CREATE INDEX IF NOT EXISTS idx_daily_trade_stats_user ON daily_trade_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_trade_stats_date ON daily_trade_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_trade_stats_user_date ON daily_trade_stats(user_id, date DESC);

-- =============================================
-- Enable Row Level Security (RLS)
-- =============================================

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

-- =============================================
-- Create RLS Policies
-- Note: These are permissive policies for development.
-- In production, replace with proper user-based authentication policies.
-- =============================================

-- scheduler_24_7_config policies
DROP POLICY IF EXISTS "Allow all access to scheduler_24_7_config" ON scheduler_24_7_config;
CREATE POLICY "Allow all access to scheduler_24_7_config" ON scheduler_24_7_config
    FOR ALL USING (true) WITH CHECK (true);

-- scheduler_24_7_logs policies
DROP POLICY IF EXISTS "Allow all access to scheduler_24_7_logs" ON scheduler_24_7_logs;
CREATE POLICY "Allow all access to scheduler_24_7_logs" ON scheduler_24_7_logs
    FOR ALL USING (true) WITH CHECK (true);

-- scheduler_daily_stats policies
DROP POLICY IF EXISTS "Allow all access to scheduler_daily_stats" ON scheduler_daily_stats;
CREATE POLICY "Allow all access to scheduler_daily_stats" ON scheduler_daily_stats
    FOR ALL USING (true) WITH CHECK (true);

-- smart_mode_config policies
DROP POLICY IF EXISTS "Allow all access to smart_mode_config" ON smart_mode_config;
CREATE POLICY "Allow all access to smart_mode_config" ON smart_mode_config
    FOR ALL USING (true) WITH CHECK (true);

-- market_conditions_history policies
DROP POLICY IF EXISTS "Allow all access to market_conditions_history" ON market_conditions_history;
CREATE POLICY "Allow all access to market_conditions_history" ON market_conditions_history
    FOR ALL USING (true) WITH CHECK (true);

-- trade_execution_logs policies
DROP POLICY IF EXISTS "Allow all access to trade_execution_logs" ON trade_execution_logs;
CREATE POLICY "Allow all access to trade_execution_logs" ON trade_execution_logs
    FOR ALL USING (true) WITH CHECK (true);

-- circuit_breaker_state policies
DROP POLICY IF EXISTS "Allow all access to circuit_breaker_state" ON circuit_breaker_state;
CREATE POLICY "Allow all access to circuit_breaker_state" ON circuit_breaker_state
    FOR ALL USING (true) WITH CHECK (true);

-- auto_trade_config policies
DROP POLICY IF EXISTS "Allow all access to auto_trade_config" ON auto_trade_config;
CREATE POLICY "Allow all access to auto_trade_config" ON auto_trade_config
    FOR ALL USING (true) WITH CHECK (true);

-- external_cron_services policies
DROP POLICY IF EXISTS "Allow all access to external_cron_services" ON external_cron_services;
CREATE POLICY "Allow all access to external_cron_services" ON external_cron_services
    FOR ALL USING (true) WITH CHECK (true);

-- daily_trade_stats policies
DROP POLICY IF EXISTS "Allow all access to daily_trade_stats" ON daily_trade_stats;
CREATE POLICY "Allow all access to daily_trade_stats" ON daily_trade_stats
    FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- Insert Default Configuration Records
-- =============================================

-- Default scheduler config
INSERT INTO scheduler_24_7_config (
    user_id, 
    is_enabled, 
    scan_interval_minutes, 
    auto_execute_trades, 
    min_profit_threshold, 
    networks, 
    flash_loan_amount
)
VALUES (
    'default', 
    false, 
    5, 
    true, 
    50.00, 
    ARRAY['ethereum', 'polygon', 'arbitrum'], 
    10000.00
)
ON CONFLICT (user_id) DO UPDATE SET
    updated_at = NOW();

-- Default smart mode config
INSERT INTO smart_mode_config (
    user_id, 
    is_enabled, 
    base_interval_minutes, 
    min_interval_minutes, 
    max_interval_minutes, 
    gas_low_threshold, 
    gas_medium_threshold, 
    gas_high_threshold,
    gas_critical_threshold,
    volatility_low_threshold, 
    volatility_medium_threshold, 
    volatility_high_threshold,
    volatility_extreme_threshold,
    high_gas_interval_multiplier,
    high_volatility_interval_divisor
)
VALUES (
    'default', 
    false, 
    5, 
    1, 
    30, 
    20, 
    50, 
    100,
    200,
    0.50, 
    2.00, 
    5.00,
    10.00,
    2.0,
    2.0
)
ON CONFLICT (user_id) DO UPDATE SET
    updated_at = NOW();

-- Default circuit breaker state
INSERT INTO circuit_breaker_state (
    user_id, 
    is_tripped, 
    consecutive_losses, 
    daily_loss, 
    daily_trades, 
    last_reset_date,
    auto_reset_enabled,
    auto_reset_hours,
    cooldown_minutes
)
VALUES (
    'default', 
    false, 
    0, 
    0, 
    0, 
    CURRENT_DATE,
    true,
    24,
    60
)
ON CONFLICT (user_id) DO UPDATE SET
    updated_at = NOW();

-- Default auto trade config
INSERT INTO auto_trade_config (
    user_id, 
    min_profit_threshold, 
    min_profit_percentage,
    target_profit_threshold,
    max_position_size,
    min_position_size,
    max_total_exposure,
    max_slippage_percent,
    slippage_buffer_percent,
    max_gas_price_gwei,
    gas_price_buffer_percent,
    priority_fee_gwei,
    max_daily_trades, 
    max_daily_loss,
    max_daily_profit_target,
    circuit_breaker_enabled, 
    circuit_breaker_loss_threshold, 
    circuit_breaker_consecutive_losses,
    circuit_breaker_cooldown_minutes,
    flashbots_enabled,
    flashbots_max_block_delay,
    private_tx_enabled,
    execution_mode,
    require_confirmation,
    auto_compound,
    max_concurrent_trades,
    min_liquidity_usd,
    min_confidence_score,
    enabled_networks,
    preferred_dexes
)
VALUES (
    'default', 
    50.00,
    0.50,
    100.00,
    50000.00,
    1000.00,
    100000.00,
    1.00,
    0.50,
    100.00,
    20.00,
    2.00,
    50, 
    500.00,
    5000.00,
    true, 
    200.00, 
    3,
    60,
    true,
    2,
    true,
    'simulation',
    false,
    false,
    3,
    50000.00,
    70,
    ARRAY['ethereum', 'polygon', 'arbitrum'],
    ARRAY['uniswap', 'sushiswap', 'curve']
)
ON CONFLICT (user_id) DO UPDATE SET
    updated_at = NOW();

-- =============================================
-- Create Functions for Automatic Updates
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic updated_at
DROP TRIGGER IF EXISTS update_scheduler_config_updated_at ON scheduler_24_7_config;
CREATE TRIGGER update_scheduler_config_updated_at
    BEFORE UPDATE ON scheduler_24_7_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_smart_mode_config_updated_at ON smart_mode_config;
CREATE TRIGGER update_smart_mode_config_updated_at
    BEFORE UPDATE ON smart_mode_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_circuit_breaker_updated_at ON circuit_breaker_state;
CREATE TRIGGER update_circuit_breaker_updated_at
    BEFORE UPDATE ON circuit_breaker_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auto_trade_config_updated_at ON auto_trade_config;
CREATE TRIGGER update_auto_trade_config_updated_at
    BEFORE UPDATE ON auto_trade_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_stats_updated_at ON scheduler_daily_stats;
CREATE TRIGGER update_daily_stats_updated_at
    BEFORE UPDATE ON scheduler_daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_external_cron_updated_at ON external_cron_services;
CREATE TRIGGER update_external_cron_updated_at
    BEFORE UPDATE ON external_cron_services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_trade_stats_updated_at ON daily_trade_stats;
CREATE TRIGGER update_daily_trade_stats_updated_at
    BEFORE UPDATE ON daily_trade_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Create Views for Common Queries
-- =============================================

-- View for recent scheduler activity
CREATE OR REPLACE VIEW v_recent_scheduler_activity AS
SELECT 
    l.id,
    l.scan_timestamp,
    l.opportunities_found,
    l.trades_executed,
    l.trades_successful,
    l.total_profit,
    l.total_loss,
    l.net_profit,
    l.execution_time_ms,
    l.status,
    l.circuit_breaker_tripped,
    l.smart_mode_enabled,
    c.is_enabled as scheduler_enabled,
    c.scan_interval_minutes,
    s.is_enabled as smart_mode_config_enabled,
    s.current_interval_minutes as smart_mode_interval
FROM scheduler_24_7_logs l
LEFT JOIN scheduler_24_7_config c ON l.user_id = c.user_id
LEFT JOIN smart_mode_config s ON l.user_id = s.user_id
ORDER BY l.scan_timestamp DESC
LIMIT 100;

-- View for daily performance summary
CREATE OR REPLACE VIEW v_daily_performance AS
SELECT 
    date,
    total_scans,
    total_opportunities,
    total_trades_executed,
    total_trades_successful,
    CASE WHEN total_trades_executed > 0 
        THEN ROUND((total_trades_successful::DECIMAL / total_trades_executed) * 100, 2)
        ELSE 0 
    END as win_rate,
    total_profit,
    total_loss,
    net_profit,
    total_gas_spent,
    circuit_breaker_trips,
    uptime_percentage
FROM scheduler_daily_stats
WHERE user_id = 'default'
ORDER BY date DESC
LIMIT 30;

-- View for recent trades
CREATE OR REPLACE VIEW v_recent_trades AS
SELECT 
    id,
    token_pair,
    buy_dex,
    sell_dex,
    network,
    loan_amount,
    estimated_profit,
    actual_profit,
    slippage_actual,
    gas_cost,
    status,
    execution_mode,
    tx_hash,
    executed_at
FROM trade_execution_logs
WHERE user_id = 'default'
ORDER BY executed_at DESC
LIMIT 50;

-- =============================================
-- Comments for Documentation
-- =============================================

COMMENT ON TABLE scheduler_24_7_config IS 'Main configuration for 24/7 automated trading bot - stores user settings and rolling stats';
COMMENT ON TABLE scheduler_24_7_logs IS 'Logs for each scan execution by the 24/7 scheduler - detailed execution records';
COMMENT ON TABLE scheduler_daily_stats IS 'Daily aggregated performance statistics - for analytics and reporting';
COMMENT ON TABLE smart_mode_config IS 'Configuration for Smart Mode dynamic scan frequency - market-adaptive settings';
COMMENT ON TABLE market_conditions_history IS 'Historical market data snapshots for Smart Mode - gas prices, volatility, prices';
COMMENT ON TABLE trade_execution_logs IS 'Detailed log of every trade attempted or executed - full audit trail';
COMMENT ON TABLE circuit_breaker_state IS 'Safety circuit breaker state tracking - loss prevention mechanism';
COMMENT ON TABLE auto_trade_config IS 'User-configurable safety limits for auto-trading - risk management settings';
COMMENT ON TABLE external_cron_services IS 'Registered external cron services for webhook triggers - 24/7 operation support';
COMMENT ON TABLE daily_trade_stats IS 'Daily aggregated trade statistics - trade-level performance metrics';

COMMENT ON VIEW v_recent_scheduler_activity IS 'Recent scheduler activity with config status - for dashboard display';
COMMENT ON VIEW v_daily_performance IS 'Daily performance summary for the last 30 days - for analytics';
COMMENT ON VIEW v_recent_trades IS 'Recent trade executions - for trade history display';
