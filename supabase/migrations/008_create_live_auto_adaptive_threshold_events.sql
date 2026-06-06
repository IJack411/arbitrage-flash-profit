-- =====================================================
-- Migration 008: Live Auto Adaptive Threshold Events
-- =====================================================
-- Stores threshold tighten/relax/reset decisions so operators can
-- correlate adaptation behavior with realized execution outcomes.

CREATE TABLE IF NOT EXISTS live_auto_adaptive_threshold_events (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    occurred_at TIMESTAMPTZ NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'reset')),
    previous_threshold NUMERIC(18, 4) NOT NULL,
    next_threshold NUMERIC(18, 4) NOT NULL,
    quality_blocked INTEGER NOT NULL DEFAULT 0,
    considered INTEGER NOT NULL DEFAULT 0,
    transport_failures INTEGER NOT NULL DEFAULT 0,
    base_threshold NUMERIC(18, 4) NOT NULL DEFAULT 0,
    adaptive_offset NUMERIC(18, 4) NOT NULL DEFAULT 0,
    network TEXT NOT NULL DEFAULT 'ethereum',
    execution_mode TEXT NOT NULL DEFAULT 'live',
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_auto_adaptive_events_occurred_at
    ON live_auto_adaptive_threshold_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_auto_adaptive_events_direction
    ON live_auto_adaptive_threshold_events(direction);

ALTER TABLE live_auto_adaptive_threshold_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to live_auto_adaptive_threshold_events" ON live_auto_adaptive_threshold_events;
CREATE POLICY "Allow all access to live_auto_adaptive_threshold_events" ON live_auto_adaptive_threshold_events
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE live_auto_adaptive_threshold_events IS 'Adaptive threshold decisions produced by live auto execution quality controls';
