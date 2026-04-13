-- =====================================================
-- Governance Audit Logs Table
-- =====================================================
-- This table stores all governance-related audit entries
-- including change requests, approvals, rejections, and
-- feature modifications for compliance reporting.
-- =====================================================

-- Create the governance_audit_logs table
CREATE TABLE IF NOT EXISTS governance_audit_logs (
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
CREATE INDEX idx_audit_action_type ON governance_audit_logs(action_type);

-- Index on action_category for category filtering
CREATE INDEX idx_audit_action_category ON governance_audit_logs(action_category);

-- Index on entity_type for entity filtering
CREATE INDEX idx_audit_entity_type ON governance_audit_logs(entity_type);

-- Index on entity_id for looking up specific entity history
CREATE INDEX idx_audit_entity_id ON governance_audit_logs(entity_id);

-- Index on user_id for user activity reports
CREATE INDEX idx_audit_user_id ON governance_audit_logs(user_id);

-- Index on created_at for date range queries (descending for recent first)
CREATE INDEX idx_audit_created_at ON governance_audit_logs(created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX idx_audit_category_date ON governance_audit_logs(action_category, created_at DESC);

-- Composite index for user activity by date
CREATE INDEX idx_audit_user_date ON governance_audit_logs(user_id, created_at DESC);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE governance_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all audit logs
CREATE POLICY "Allow read access to audit logs"
    ON governance_audit_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Allow authenticated users to insert audit logs
CREATE POLICY "Allow insert access to audit logs"
    ON governance_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Allow anonymous users to read (for public dashboards)
CREATE POLICY "Allow anonymous read access"
    ON governance_audit_logs
    FOR SELECT
    TO anon
    USING (true);

-- Policy: Allow anonymous users to insert (for unauthenticated logging)
CREATE POLICY "Allow anonymous insert access"
    ON governance_audit_logs
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE governance_audit_logs IS 'Stores audit trail for all governance actions';
COMMENT ON COLUMN governance_audit_logs.action_type IS 'Type of action: change_request_created, approved, rejected, etc.';
COMMENT ON COLUMN governance_audit_logs.action_category IS 'Category: change_request, feature, approval, compliance, user, system';
COMMENT ON COLUMN governance_audit_logs.entity_type IS 'Type of entity: change_request, feature, user, validation_rule, notification';
COMMENT ON COLUMN governance_audit_logs.metadata IS 'Additional action-specific data in JSON format';
COMMENT ON COLUMN governance_audit_logs.previous_state IS 'State before the action (for modifications)';
COMMENT ON COLUMN governance_audit_logs.new_state IS 'State after the action (for modifications)';
