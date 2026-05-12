-- =====================================================
-- Row Level Security (RLS) for governance_audit_logs
-- =====================================================
ALTER TABLE public.governance_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (idempotent)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Allow user to view own audit logs' AND tablename = 'governance_audit_logs'
    ) THEN
        EXECUTE 'DROP POLICY "Allow user to view own audit logs" ON public.governance_audit_logs';
    END IF;
END
$$;

-- Allow users to view their own audit logs
CREATE POLICY "Allow user to view own audit logs" ON public.governance_audit_logs
    FOR SELECT USING (user_id = auth.uid()::text);
-- =====================================================
-- Governance Audit Logs Table
-- =====================================================
-- This table stores all governance-related audit entries
-- including change requests, approvals, rejections, and
-- feature modifications for compliance reporting.
-- =====================================================

-- Create the governance_audit_logs table
CREATE TABLE IF NOT EXISTS public.governance_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Action information
    action_type VARCHAR(50) NOT NULL,
    action_category VARCHAR(30) NOT NULL,
    
    -- Entity being acted upon
    entity_type VARCHAR(30) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    entity_name VARCHAR(255) NOT NULL,
    
    -- User who performed the action
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    
    -- Action details
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    previous_state JSONB,
    new_state JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- Indexes for efficient querying
-- =====================================================

-- Index on action_type for filtering by action
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_action_type'
    ) THEN
        CREATE INDEX idx_audit_action_type ON public.governance_audit_logs(action_type);
    END IF;
END
$$;

-- Index on action_category for category filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_action_category'
    ) THEN
        CREATE INDEX idx_audit_action_category ON public.governance_audit_logs(action_category);
    END IF;
END
$$;

-- Index on entity_type for entity filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_entity_type'
    ) THEN
        CREATE INDEX idx_audit_entity_type ON public.governance_audit_logs(entity_type);
    END IF;
END
$$;

-- Index on entity_id for looking up specific entity history
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_entity_id'
    ) THEN
        CREATE INDEX idx_audit_entity_id ON public.governance_audit_logs(entity_id);
    END IF;
END
$$;

-- Index on user_id for user activity reports
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_user_id'
    ) THEN
        CREATE INDEX idx_audit_user_id ON public.governance_audit_logs(user_id);
    END IF;
END
$$;

-- Index on created_at for date range queries (descending for recent first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_created_at'
    ) THEN
        CREATE INDEX idx_audit_created_at ON public.governance_audit_logs(created_at DESC);
    END IF;
END
$$;

-- Composite index for common filter combinations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_category_date'
    ) THEN
        CREATE INDEX idx_audit_category_date ON public.governance_audit_logs(action_category, created_at DESC);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_audit_user_date ON public.governance_audit_logs(user_id, created_at DESC);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================


-- Enable RLS
ALTER TABLE public.governance_audit_logs ENABLE ROW LEVEL SECURITY;


DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to audit logs' AND tablename = 'governance_audit_logs' AND schemaname = 'public'
    ) THEN
        EXECUTE 'DROP POLICY "Allow read access to audit logs" ON public.governance_audit_logs';
    END IF;
END
$$;

CREATE POLICY "Allow read access to audit logs"
    ON public.governance_audit_logs
    FOR SELECT
    TO authenticated
    USING (true);


DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Allow insert access to audit logs' AND tablename = 'governance_audit_logs' AND schemaname = 'public'
    ) THEN
        EXECUTE 'DROP POLICY "Allow insert access to audit logs" ON public.governance_audit_logs';
    END IF;
END
$$;

CREATE POLICY "Allow insert access to audit logs"
    ON public.governance_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);


-- Policy: Allow anonymous users to read (for public dashboards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
            AND tablename = 'governance_audit_logs'
            AND policyname = 'Allow anonymous read access'
    ) THEN
        EXECUTE 'DROP POLICY "Allow anonymous read access" ON public.governance_audit_logs';
    END IF;
END
$$;

CREATE POLICY "Allow anonymous read access"
    ON public.governance_audit_logs
    FOR SELECT
    TO anon
    USING (true);


-- Policy: Allow anonymous users to insert (for unauthenticated logging)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
            AND tablename = 'governance_audit_logs'
            AND policyname = 'Allow anonymous insert access'
    ) THEN
        EXECUTE 'DROP POLICY "Allow anonymous insert access" ON public.governance_audit_logs';
    END IF;
END
$$;

CREATE POLICY "Allow anonymous insert access"
    ON public.governance_audit_logs
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE public.governance_audit_logs IS 'Stores audit trail for all governance actions';
COMMENT ON COLUMN public.governance_audit_logs.action_type IS 'Type of action: change_request_created, approved, rejected, etc.';
COMMENT ON COLUMN public.governance_audit_logs.action_category IS 'Category: change_request, feature, approval, compliance, user, system';
COMMENT ON COLUMN public.governance_audit_logs.entity_type IS 'Type of entity: change_request, feature, user, validation_rule, notification';
COMMENT ON COLUMN public.governance_audit_logs.metadata IS 'Additional action-specific data in JSON format';
COMMENT ON COLUMN public.governance_audit_logs.previous_state IS 'State before the action (for modifications)';
COMMENT ON COLUMN public.governance_audit_logs.new_state IS 'State after the action (for modifications)';
