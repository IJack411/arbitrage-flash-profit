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
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_network ON opportunities(network);
CREATE INDEX IF NOT EXISTS idx_opp_created ON opportunities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at DESC);


ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'opportunities' AND policyname = 'Public read opportunities') THEN
        EXECUTE 'DROP POLICY "Public read opportunities" ON public.opportunities';
    END IF;
END $$;
CREATE POLICY "Public read opportunities" ON public.opportunities FOR SELECT TO anon USING (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'opportunities' AND policyname = 'Auth read opportunities') THEN
        EXECUTE 'DROP POLICY "Auth read opportunities" ON public.opportunities';
    END IF;
END $$;
CREATE POLICY "Auth read opportunities" ON public.opportunities FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'opportunities' AND policyname = 'Auth insert opportunities') THEN
        EXECUTE 'DROP POLICY "Auth insert opportunities" ON public.opportunities';
    END IF;
END $$;
CREATE POLICY "Auth insert opportunities" ON public.opportunities FOR INSERT TO authenticated WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'opportunities' AND policyname = 'Anon insert opportunities') THEN
        EXECUTE 'DROP POLICY "Anon insert opportunities" ON public.opportunities';
    END IF;
END $$;
CREATE POLICY "Anon insert opportunities" ON public.opportunities FOR INSERT TO anon WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'Users read own transactions') THEN
        EXECUTE 'DROP POLICY "Users read own transactions" ON public.transactions';
    END IF;
END $$;
CREATE POLICY "Users read own transactions" ON public.transactions FOR SELECT USING (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'Users insert transactions') THEN
        EXECUTE 'DROP POLICY "Users insert transactions" ON public.transactions';
    END IF;
END $$;
CREATE POLICY "Users insert transactions" ON public.transactions FOR INSERT WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'Users read own settings') THEN
        EXECUTE 'DROP POLICY "Users read own settings" ON public.user_settings';
    END IF;
END $$;
CREATE POLICY "Users read own settings" ON public.user_settings FOR SELECT USING (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'Users manage own settings') THEN
        EXECUTE 'DROP POLICY "Users manage own settings" ON public.user_settings';
    END IF;
END $$;
CREATE POLICY "Users manage own settings" ON public.user_settings FOR ALL USING (true);
