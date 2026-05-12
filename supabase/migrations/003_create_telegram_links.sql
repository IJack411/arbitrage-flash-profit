-- =====================================================
-- Migration 003: Telegram Links Table & Policies
-- =====================================================
-- Creates:
--   1. telegram_links - Links user accounts to Telegram chat IDs
--   2. RLS policies for secure access
-- =====================================================

-- 1. telegram_links Table
CREATE TABLE IF NOT EXISTS public.telegram_links (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id TEXT NOT NULL,
	telegram_chat_id TEXT NOT NULL,
	linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(user_id, telegram_chat_id)
);

-- 2. Indexes
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'idx_telegram_links_user_id'
	) THEN
		CREATE INDEX idx_telegram_links_user_id ON public.telegram_links(user_id);
	END IF;
END
$$;

-- 3. Row Level Security (RLS)
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_policies WHERE policyname = 'Allow user to manage own telegram links' AND tablename = 'telegram_links'
	) THEN
		EXECUTE 'DROP POLICY "Allow user to manage own telegram links" ON public.telegram_links';
	END IF;
END
$$;

-- Allow users to manage their own telegram links
CREATE POLICY "Allow user to manage own telegram links" ON public.telegram_links
	USING (user_id = auth.uid()::text)
	WITH CHECK (user_id = auth.uid()::text);
