-- Migration: Create telegram_links table
-- Description: Stores linked Telegram accounts for notification delivery

-- Create telegram_links table
CREATE TABLE IF NOT EXISTS telegram_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  telegram_username TEXT,
  link_code TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(chat_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_links_user_id ON telegram_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_chat_id ON telegram_links(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_link_code ON telegram_links(link_code);

-- Enable RLS
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own telegram link"
  ON telegram_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own telegram link"
  ON telegram_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own telegram link"
  ON telegram_links FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own telegram link"
  ON telegram_links FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_telegram_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER telegram_links_updated_at
  BEFORE UPDATE ON telegram_links
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_links_updated_at();

-- Add telegram fields to notification_preferences if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_preferences' 
    AND column_name = 'telegram_enabled'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_enabled BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_preferences' 
    AND column_name = 'telegram_chat_id'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_chat_id TEXT;
  END IF;
END $$;

-- Comment on table
COMMENT ON TABLE telegram_links IS 'Stores linked Telegram accounts for notification delivery';
COMMENT ON COLUMN telegram_links.user_id IS 'Reference to the user who linked the account';
COMMENT ON COLUMN telegram_links.chat_id IS 'Telegram chat ID for sending messages';
COMMENT ON COLUMN telegram_links.telegram_username IS 'Telegram username (optional)';
COMMENT ON COLUMN telegram_links.link_code IS 'The code used to link the account';
COMMENT ON COLUMN telegram_links.linked_at IS 'When the account was linked';
