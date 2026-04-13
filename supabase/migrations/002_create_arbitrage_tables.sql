-- =====================================================
-- Arbitrage Bot Core Tables
-- =====================================================

-- Opportunities Table
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

-- Transactions Table
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

-- User Settings Table
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

-- Indexes
CREATE INDEX idx_opp_status ON opportunities(status);
CREATE INDEX idx_opp_network ON opportunities(network);
CREATE INDEX idx_opp_created ON opportunities(created_at DESC);
CREATE INDEX idx_tx_wallet ON transactions(wallet_address);
CREATE INDEX idx_tx_status ON transactions(status);
CREATE INDEX idx_tx_created ON transactions(created_at DESC);

-- Enable RLS
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for opportunities (public read)
CREATE POLICY "Public read opportunities" ON opportunities FOR SELECT TO anon USING (true);
CREATE POLICY "Auth read opportunities" ON opportunities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert opportunities" ON opportunities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon insert opportunities" ON opportunities FOR INSERT TO anon WITH CHECK (true);

-- RLS Policies for transactions (user-specific)
CREATE POLICY "Users read own transactions" ON transactions FOR SELECT USING (true);
CREATE POLICY "Users insert transactions" ON transactions FOR INSERT WITH CHECK (true);

-- RLS Policies for user_settings
CREATE POLICY "Users read own settings" ON user_settings FOR SELECT USING (true);
CREATE POLICY "Users manage own settings" ON user_settings FOR ALL USING (true);
