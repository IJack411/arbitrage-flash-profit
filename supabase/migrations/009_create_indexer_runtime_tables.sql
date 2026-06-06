-- =====================================================
-- Migration 009: Indexer Runtime Tables
-- =====================================================
-- Lean Phase-1 indexer schema for production shadow rollout.

CREATE TABLE IF NOT EXISTS pools_index_latest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network TEXT NOT NULL,
    dex TEXT NOT NULL,
    pool_address TEXT NOT NULL,
    token0_symbol TEXT NOT NULL,
    token1_symbol TEXT NOT NULL,
    token0_address TEXT,
    token1_address TEXT,
    fee_tier INTEGER,
    liquidity_usd NUMERIC(24, 8) NOT NULL DEFAULT 0,
    token0_price NUMERIC(24, 12),
    token1_price NUMERIC(24, 12),
    source TEXT NOT NULL CHECK (source IN ('subgraph', 'dexscreener', 'gecko', 'rpc')),
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    freshness_ms INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (network, dex, pool_address)
);

CREATE TABLE IF NOT EXISTS quotes_index_latest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network TEXT NOT NULL,
    token_pair TEXT NOT NULL,
    buy_dex TEXT NOT NULL,
    sell_dex TEXT NOT NULL,
    buy_price NUMERIC(24, 12) NOT NULL,
    sell_price NUMERIC(24, 12) NOT NULL,
    spread_bps NUMERIC(12, 4) NOT NULL,
    buy_liquidity_usd NUMERIC(24, 8) NOT NULL DEFAULT 0,
    sell_liquidity_usd NUMERIC(24, 8) NOT NULL DEFAULT 0,
    source TEXT NOT NULL CHECK (source IN ('subgraph', 'dexscreener', 'gecko', 'rpc')),
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    freshness_ms INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (network, token_pair, buy_dex, sell_dex)
);

CREATE TABLE IF NOT EXISTS source_health_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL,
    network TEXT NOT NULL,
    success_rate_5m NUMERIC(8, 4) NOT NULL DEFAULT 0,
    p95_latency_ms INTEGER NOT NULL DEFAULT 0,
    error_rate_5m NUMERIC(8, 4) NOT NULL DEFAULT 0,
    last_ok_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (source_name, network)
);

CREATE TABLE IF NOT EXISTS route_stats_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_key TEXT NOT NULL UNIQUE,
    network TEXT NOT NULL,
    token_pair TEXT NOT NULL,
    buy_dex TEXT NOT NULL,
    sell_dex TEXT NOT NULL,
    attempts_24h INTEGER NOT NULL DEFAULT 0,
    included_24h INTEGER NOT NULL DEFAULT 0,
    failed_24h INTEGER NOT NULL DEFAULT 0,
    median_realized_net_24h NUMERIC(24, 8),
    p90_latency_ms_24h INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS hot_pairs_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network TEXT NOT NULL,
    token_pair TEXT NOT NULL,
    priority_score NUMERIC(12, 4) NOT NULL DEFAULT 0,
    reason TEXT,
    last_scanned_at TIMESTAMPTZ,
    next_refresh_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (network, token_pair)
);

CREATE TABLE IF NOT EXISTS scanner_rollout_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID REFERENCES scanner_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mode TEXT NOT NULL DEFAULT 'shadow',
    decision TEXT NOT NULL DEFAULT 'HOLD' CHECK (decision IN ('GO', 'HOLD', 'ROLLBACK')),
    scanner_duration_ms INTEGER,
    scanner_p90_duration_ms INTEGER,
    index_hit_rate NUMERIC(8, 4),
    index_stale_ratio NUMERIC(8, 4),
    fallback_fetches INTEGER NOT NULL DEFAULT 0,
    upstream_calls_saved INTEGER NOT NULL DEFAULT 0,
    bad_quotes_share NUMERIC(8, 4),
    execution_risk_share NUMERIC(8, 4),
    inclusion_rate NUMERIC(8, 4),
    resolved_attempts INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pools_latest_lookup ON pools_index_latest(network, dex, token0_symbol, token1_symbol, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_latest_lookup ON quotes_index_latest(network, token_pair, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_latest_refresh ON quotes_index_latest(indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_stats_lookup ON route_stats_index(route_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hot_pairs_refresh ON hot_pairs_queue(next_refresh_at ASC, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_metadata_gin ON quotes_index_latest USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_rollout_snapshots_created_at ON scanner_rollout_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rollout_snapshots_decision ON scanner_rollout_snapshots(decision);
CREATE INDEX IF NOT EXISTS idx_rollout_snapshots_scan_run ON scanner_rollout_snapshots(scan_run_id);

ALTER TABLE pools_index_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes_index_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_health_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stats_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_pairs_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanner_rollout_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to pools_index_latest" ON pools_index_latest;
CREATE POLICY "Allow all access to pools_index_latest" ON pools_index_latest FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to quotes_index_latest" ON quotes_index_latest;
CREATE POLICY "Allow all access to quotes_index_latest" ON quotes_index_latest FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to source_health_index" ON source_health_index;
CREATE POLICY "Allow all access to source_health_index" ON source_health_index FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to route_stats_index" ON route_stats_index;
CREATE POLICY "Allow all access to route_stats_index" ON route_stats_index FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hot_pairs_queue" ON hot_pairs_queue;
CREATE POLICY "Allow all access to hot_pairs_queue" ON hot_pairs_queue FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to scanner_rollout_snapshots" ON scanner_rollout_snapshots;
CREATE POLICY "Allow all access to scanner_rollout_snapshots" ON scanner_rollout_snapshots FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE pools_index_latest IS 'Latest indexed pool state for low-latency scanner reads.';
COMMENT ON TABLE quotes_index_latest IS 'Latest indexed cross-DEX quote state for scanner read-through cache.';
COMMENT ON TABLE source_health_index IS 'Short-window source reliability and latency health snapshots.';
COMMENT ON TABLE route_stats_index IS 'Route-level 24h aggregates for scoring and adaptive filtering.';
COMMENT ON TABLE hot_pairs_queue IS 'Priority queue for index refresh workers.';
COMMENT ON TABLE scanner_rollout_snapshots IS 'Production rollout snapshots for indexer cutover decisions.';
