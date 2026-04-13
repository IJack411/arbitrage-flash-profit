-- =====================================================
-- Migration 005: Smart Contracts & Notification Preferences
-- =====================================================
-- Creates:
--   1. notification_preferences - User notification settings (required by migration 003)
--   2. smart_contracts - Deployed contract records
-- =====================================================

-- =====================================================
-- 1. notification_preferences
-- Stores per-user notification channel preferences
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',

    -- Email
    email_enabled BOOLEAN NOT NULL DEFAULT false,
    email_address TEXT,

    -- Discord
    discord_enabled BOOLEAN NOT NULL DEFAULT false,
    discord_webhook_url TEXT,

    -- Slack
    slack_enabled BOOLEAN NOT NULL DEFAULT false,
    slack_webhook_url TEXT,

    -- Telegram (columns also added by migration 003 via ALTER TABLE)
    telegram_enabled BOOLEAN NOT NULL DEFAULT false,
    telegram_chat_id TEXT,

    -- In-App
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    sound_enabled BOOLEAN NOT NULL DEFAULT true,

    -- Alert Types
    trade_alerts BOOLEAN NOT NULL DEFAULT true,
    price_alerts BOOLEAN NOT NULL DEFAULT true,
    system_alerts BOOLEAN NOT NULL DEFAULT true,
    security_alerts BOOLEAN NOT NULL DEFAULT true,
    performance_alerts BOOLEAN NOT NULL DEFAULT true,

    -- Thresholds
    min_profit_alert_usd DECIMAL(18, 2) NOT NULL DEFAULT 10.00,
    gas_spike_alert_gwei DECIMAL(10, 2) NOT NULL DEFAULT 100.00,

    -- Quiet Hours
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    quiet_hours_timezone TEXT DEFAULT 'UTC',

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);

-- Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow all access to notification_preferences" ON notification_preferences;
CREATE POLICY "Allow all access to notification_preferences" ON notification_preferences
    FOR ALL USING (true) WITH CHECK (true);

-- Default record
INSERT INTO notification_preferences (user_id)
VALUES ('default')
ON CONFLICT (user_id) DO NOTHING;


-- =====================================================
-- 2. smart_contracts
-- Stores deployed smart contract records
-- =====================================================
CREATE TABLE IF NOT EXISTS smart_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',

    -- Contract Info
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT 'ethereum',
    contract_type TEXT NOT NULL DEFAULT 'arbitrage',

    -- Contract Code
    abi JSONB,
    bytecode TEXT,
    source_code TEXT,

    -- Deployment Info
    deployer_address TEXT,
    deploy_tx_hash TEXT,
    deploy_block_number BIGINT,
    deploy_gas_used BIGINT,
    deploy_cost_eth DECIMAL(18, 8),

    -- Verification
    verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    etherscan_url TEXT,

    -- Configuration
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    flash_loan_provider TEXT,
    supported_dexes TEXT[],
    supported_tokens TEXT[],

    -- Metadata
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_smart_contracts_user ON smart_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_address ON smart_contracts(address);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_network ON smart_contracts(network);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_active ON smart_contracts(is_active);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_type ON smart_contracts(contract_type);

-- Enable RLS
ALTER TABLE smart_contracts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow all access to smart_contracts" ON smart_contracts;
CREATE POLICY "Allow all access to smart_contracts" ON smart_contracts
    FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_smart_contracts_updated_at ON smart_contracts;
CREATE TRIGGER update_smart_contracts_updated_at
    BEFORE UPDATE ON smart_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Note: update_updated_at_column() function is created in migration 004.
-- If running this migration standalone, create it first:
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
-- $$ language 'plpgsql';

-- Trigger for notification_preferences updated_at
DROP TRIGGER IF EXISTS update_notif_prefs_updated_at ON notification_preferences;
CREATE TRIGGER update_notif_prefs_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE smart_contracts IS 'Deployed smart contract records - stores addresses, ABIs, and deployment metadata';
COMMENT ON TABLE notification_preferences IS 'Per-user notification channel preferences and alert thresholds';
COMMENT ON COLUMN smart_contracts.is_primary IS 'Whether this is the primary contract used for execution';
COMMENT ON COLUMN smart_contracts.flash_loan_provider IS 'Associated flash loan provider address';
