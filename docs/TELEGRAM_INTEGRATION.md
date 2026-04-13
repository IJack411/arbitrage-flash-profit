# Telegram Bot Integration

This document describes how to set up and deploy the Telegram bot integration for price alerts.

## Overview

The Telegram integration allows users to receive price alerts and security notifications directly in their Telegram app. The integration consists of:

1. **Frontend Service** (`src/lib/telegramService.ts`) - Handles account linking and notification sending
2. **UI Components** (`src/components/auth/TelegramSetup.tsx`) - User interface for linking Telegram accounts
3. **Supabase Edge Function** - Sends notifications via Telegram Bot API
4. **Database Table** - Stores linked Telegram accounts

## Setup Instructions

### 1. Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Save the bot token (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Optionally, customize your bot with `/setdescription`, `/setabouttext`, and `/setuserpic`

### 2. Configure Environment Variables

Add the following to your Supabase project secrets:

```bash
# In Supabase Dashboard > Settings > Edge Functions > Secrets
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 3. Create Database Table

Run this SQL migration in your Supabase SQL Editor:

```sql
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

-- Create index for faster lookups
CREATE INDEX idx_telegram_links_user_id ON telegram_links(user_id);
CREATE INDEX idx_telegram_links_chat_id ON telegram_links(chat_id);

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
```

### 4. Deploy Edge Function

Create a new edge function called `send-telegram-notification`:

```typescript
// supabase/functions/send-telegram-notification/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface TelegramNotificationPayload {
  chatId: string;
  alertType: 'price_alert' | 'security' | 'system';
  data: {
    tokenPair?: string;
    targetPrice?: number;
    currentPrice?: number;
    condition?: string;
    percentChange?: number;
    message?: string;
    userName?: string;
    timestamp?: string;
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatPrice(price: number): string {
  if (price < 0.00001) return price.toExponential(4);
  if (price < 0.01) return price.toFixed(8);
  if (price < 1) return price.toFixed(6);
  if (price < 100) return price.toFixed(4);
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatPercentChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function buildMessage(payload: TelegramNotificationPayload): string {
  const { alertType, data } = payload;
  const timestamp = data.timestamp 
    ? new Date(data.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  switch (alertType) {
    case 'price_alert': {
      const conditionEmoji = data.condition === 'above' ? '📈' : data.condition === 'below' ? '📉' : '🔄';
      const conditionText = data.condition === 'above' ? 'crossed above' : 
                           data.condition === 'below' ? 'crossed below' : 'crossed';
      
      return `${conditionEmoji} *Price Alert Triggered*

*${data.tokenPair}* has ${conditionText} your target price!

💰 *Target Price:* $${formatPrice(data.targetPrice || 0)}
📊 *Current Price:* $${formatPrice(data.currentPrice || 0)}
${data.percentChange !== undefined ? `📈 *Change:* ${formatPercentChange(data.percentChange)}` : ''}

⏰ ${timestamp}

_Flash Arbitrage Bot_`;
    }

    case 'security': {
      return `🔐 *Security Alert*

${data.message || 'A security event occurred on your account.'}

${data.userName ? `👤 Account: ${data.userName}` : ''}
⏰ ${timestamp}

_If this wasn't you, please secure your account immediately._

_Flash Arbitrage Bot_`;
    }

    case 'system': {
      return `⚙️ *System Notification*

${data.message || 'System update'}

⏰ ${timestamp}

_Flash Arbitrage Bot_`;
    }

    default:
      return `📢 *Notification*

${data.message || 'You have a new notification.'}

⏰ ${timestamp}

_Flash Arbitrage Bot_`;
  }
}

async function sendTelegramMessage(chatId: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'Telegram bot token not configured' };
  }

  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Telegram API error:', result);
      return { success: false, error: result.description || 'Failed to send message' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: TelegramNotificationPayload = await req.json();

    if (!payload.chatId) {
      return new Response(
        JSON.stringify({ error: 'Missing chatId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.alertType) {
      return new Response(
        JSON.stringify({ error: 'Missing alertType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const message = buildMessage(payload);
    const result = await sendTelegramMessage(payload.chatId, message);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Notification sent successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

Deploy using Supabase CLI:

```bash
supabase functions deploy send-telegram-notification
```

### 5. (Optional) Create Webhook Handler for Bot Commands

For a full production setup, create another edge function to handle incoming Telegram bot commands (like `/link` and `/start`):

```typescript
// supabase/functions/telegram-webhook/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  try {
    const update = await req.json();
    
    if (!update.message) {
      return new Response('OK');
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || '';
    const username = update.message.from?.username;

    // Handle /start command
    if (text.startsWith('/start')) {
      const linkCode = text.split(' ')[1];
      if (linkCode) {
        // User clicked a deep link with code
        await handleLinkCode(chatId, linkCode, username);
      } else {
        await sendMessage(chatId, `Welcome to Flash Arbitrage Bot! 🚀

To link your account:
1. Go to your profile settings in the app
2. Click "Link Telegram Account"
3. Send the link code here

Or use: /link YOUR_CODE`);
      }
      return new Response('OK');
    }

    // Handle /link command
    if (text.startsWith('/link')) {
      const linkCode = text.split(' ')[1];
      if (!linkCode) {
        await sendMessage(chatId, 'Please provide your link code: /link YOUR_CODE');
        return new Response('OK');
      }
      await handleLinkCode(chatId, linkCode, username);
      return new Response('OK');
    }

    // Handle /unlink command
    if (text === '/unlink') {
      await handleUnlink(chatId);
      return new Response('OK');
    }

    // Handle /status command
    if (text === '/status') {
      await handleStatus(chatId);
      return new Response('OK');
    }

    // Default response
    await sendMessage(chatId, `Available commands:
/link CODE - Link your account
/unlink - Unlink your account
/status - Check link status`);

    return new Response('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK');
  }
});

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function handleLinkCode(chatId: number, linkCode: string, username?: string) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  // Here you would verify the link code against pending codes
  // For now, we'll just store the link
  
  const { error } = await supabase
    .from('telegram_links')
    .upsert({
      chat_id: chatId.toString(),
      telegram_username: username,
      link_code: linkCode,
      linked_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });

  if (error) {
    await sendMessage(chatId, '❌ Failed to link account. Please try again.');
    return;
  }

  await sendMessage(chatId, `✅ *Account Linked Successfully!*

You will now receive:
• Price alert notifications
• Security alerts
• System notifications

Use /unlink to disconnect your account.`);
}

async function handleUnlink(chatId: number) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  const { error } = await supabase
    .from('telegram_links')
    .delete()
    .eq('chat_id', chatId.toString());

  if (error) {
    await sendMessage(chatId, '❌ Failed to unlink account.');
    return;
  }

  await sendMessage(chatId, '✅ Account unlinked successfully. You will no longer receive notifications.');
}

async function handleStatus(chatId: number) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data } = await supabase
    .from('telegram_links')
    .select('*')
    .eq('chat_id', chatId.toString())
    .single();

  if (data) {
    await sendMessage(chatId, `✅ *Account Status: Linked*

Linked since: ${new Date(data.linked_at).toLocaleDateString()}`);
  } else {
    await sendMessage(chatId, '❌ *Account Status: Not Linked*\n\nUse /link CODE to link your account.');
  }
}
```

Set up the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/telegram-webhook"
```

## Usage

### Linking Account

1. User goes to Profile > Alerts tab
2. Clicks "Link Telegram Account"
3. Generates a unique link code
4. Opens Telegram and sends `/link CODE` to the bot
5. Account is linked and user can enable/disable Telegram notifications

### Receiving Notifications

Once linked, users will receive:

- **Price Alerts**: When a price alert is triggered
- **Security Alerts**: When 2FA is enabled/disabled, suspicious login, etc.
- **System Notifications**: Important system updates

### Notification Format

Price alerts appear like:
```
📈 Price Alert Triggered

BTC/USDT has crossed above your target price!

💰 Target Price: $45,000.00
📊 Current Price: $45,123.45
📈 Change: +0.27%

⏰ Dec 21, 2024, 10:00 PM

Flash Arbitrage Bot
```

## Demo Mode

For testing without a real Telegram bot:

1. Click "Demo Mode (Skip Bot)" during setup
2. Account will be linked locally
3. Notifications will be logged to console instead of sent to Telegram

## Troubleshooting

### Bot not responding
- Verify bot token is correct
- Check if webhook is set up properly
- Review edge function logs in Supabase dashboard

### Notifications not sending
- Verify user has Telegram enabled in notification preferences
- Check if chat_id is stored correctly
- Review edge function invocation logs

### Link code expired
- Codes expire after 10 minutes
- Generate a new code and try again
