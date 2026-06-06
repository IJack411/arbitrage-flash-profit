-- =====================================================
-- Migration 007: Route Memory + Pair Performance View
-- =====================================================

CREATE TABLE IF NOT EXISTS route_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_key TEXT NOT NULL UNIQUE,
    network TEXT NOT NULL,
    token_pair TEXT NOT NULL,
    buy_dex TEXT NOT NULL,
    sell_dex TEXT NOT NULL,
    normalized_dex_pair TEXT NOT NULL,
    total_executions INTEGER NOT NULL DEFAULT 0,
    successful_executions INTEGER NOT NULL DEFAULT 0,
    failed_executions INTEGER NOT NULL DEFAULT 0,
    cumulative_realized_net NUMERIC(24, 8) NOT NULL DEFAULT 0,
    avg_realized_net NUMERIC(24, 8) NOT NULL DEFAULT 0,
    last_realized_net NUMERIC(24, 8),
    cooldown_until TIMESTAMPTZ,
    last_executed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_memory_network_pair ON route_memory(network, token_pair);
CREATE INDEX IF NOT EXISTS idx_route_memory_cooldown ON route_memory(cooldown_until);
CREATE INDEX IF NOT EXISTS idx_route_memory_avg_realized ON route_memory(avg_realized_net DESC);

ALTER TABLE route_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to route_memory" ON route_memory;
CREATE POLICY "Allow all access to route_memory" ON route_memory
    FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW v_pair_performance AS
SELECT
    network,
    token_pair,
    COUNT(*) AS routes,
    SUM(total_executions) AS total_executions,
    SUM(successful_executions) AS successful_executions,
    SUM(failed_executions) AS failed_executions,
    CASE
        WHEN SUM(total_executions) = 0 THEN 0
        ELSE ROUND((SUM(successful_executions)::numeric / SUM(total_executions)::numeric) * 100, 2)
    END AS success_rate_pct,
    ROUND(AVG(avg_realized_net), 6) AS avg_route_realized_net,
    ROUND(SUM(cumulative_realized_net), 6) AS cumulative_realized_net
FROM route_memory
GROUP BY network, token_pair;

COMMENT ON TABLE route_memory IS 'Route-level execution memory used for cooldown and realized-edge scoring.';
COMMENT ON VIEW v_pair_performance IS 'Pair and network level realized performance aggregates from route_memory.';
