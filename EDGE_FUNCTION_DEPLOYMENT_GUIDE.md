# Complete Edge Function Deployment Guide

## Your Supabase Project Details

- **Project URL**: `https://ujhsrxinfcycjtulpvqk.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c`
- **Project Ref**: `ujhsrxinfcycjtulpvqk`

---

## Step 1: Install Supabase CLI

```bash
# Install globally
npm install -g supabase

# Verify installation
supabase --version
```

---

## Step 2: Login and Link Project

```bash
# Login to Supabase (opens browser)
supabase login

# Link to your project
supabase link --project-ref ujhsrxinfcycjtulpvqk
```

---

## Step 3: Set Your API Secrets

Go to **Supabase Dashboard** → **Settings** → **Edge Functions** → **Secrets**

Or use CLI:

```bash
# REQUIRED: Add your Alchemy API key
supabase secrets set ALCHEMY_API_KEY=your_alchemy_api_key_here

# OPTIONAL: Add Infura as backup
supabase secrets set INFURA_API_KEY=your_infura_api_key_here

# OPTIONAL: For Telegram notifications
supabase secrets set TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# OPTIONAL: For Flashbots execution (advanced)
supabase secrets set FLASHBOTS_SIGNER_PRIVATE_KEY=your_private_key
```

### Where to Get API Keys:

| Service | URL | Free Tier |
|---------|-----|-----------|
| **Alchemy** | https://dashboard.alchemy.com | 300M compute units/month |
| **Infura** | https://infura.io | 100k requests/day |
| **Telegram** | @BotFather on Telegram | Free |

---

## Step 4: Create Edge Functions

### 4.1 Arbitrage Scanner Function

```bash
supabase functions new scan-arbitrage-opportunities
```

Copy this code to `supabase/functions/scan-arbitrage-opportunities/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { ethers } from 'https://esm.sh/ethers@6.9.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const NETWORK_CONFIG = {
  ethereum: {
    rpc: (infura, alchemy) => alchemy ? `https://eth-mainnet.g.alchemy.com/v2/${alchemy}` : infura ? `https://mainnet.infura.io/v3/${infura}` : 'https://eth.llamarpc.com',
    dexes: [
      { name: 'Uniswap V2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' },
      { name: 'SushiSwap', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac', router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F' }
    ],
    tokens: [
      { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
      { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
      { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI' }
    ]
  },
  polygon: {
    rpc: (infura, alchemy) => alchemy ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemy}` : infura ? `https://polygon-mainnet.infura.io/v3/${infura}` : 'https://polygon-rpc.com',
    dexes: [
      { name: 'QuickSwap', factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff' },
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506' }
    ],
    tokens: [
      { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC' },
      { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC' },
      { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH' }
    ]
  },
  arbitrum: {
    rpc: (infura, alchemy) => alchemy ? `https://arb-mainnet.g.alchemy.com/v2/${alchemy}` : infura ? `https://arbitrum-mainnet.infura.io/v3/${infura}` : 'https://arb1.arbitrum.io/rpc',
    dexes: [
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506' },
      { name: 'Camelot', factory: '0x6EcCab422D763aC031210895C81787E87B43A652', router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d' }
    ],
    tokens: [
      { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
      { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', symbol: 'USDC' },
      { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT' }
    ]
  }
};

const PAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)'];
const FACTORY_ABI = ['function getPair(address,address) view returns (address)'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { networks = ['ethereum'], test = false } = await req.json().catch(() => ({}));
    
    if (test) {
      const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
      const infuraKey = Deno.env.get('INFURA_API_KEY');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Edge function is running',
        hasAlchemyKey: !!alchemyKey,
        hasInfuraKey: !!infuraKey,
        timestamp: new Date().toISOString()
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const infuraKey = Deno.env.get('INFURA_API_KEY');
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    
    const allOpportunities = [];

    for (const network of networks) {
      const config = NETWORK_CONFIG[network];
      if (!config) continue;

      const provider = new ethers.JsonRpcProvider(config.rpc(infuraKey, alchemyKey));
      const gasPrice = await provider.getFeeData();
      const gasCostWei = (gasPrice.gasPrice || 30000000000n) * 250000n;
      const gasCostEth = Number(gasCostWei) / 1e18;

      for (let i = 0; i < config.tokens.length; i++) {
        for (let j = i + 1; j < config.tokens.length; j++) {
          const token0 = config.tokens[i], token1 = config.tokens[j];
          const prices = [];

          for (const dex of config.dexes) {
            try {
              const factory = new ethers.Contract(dex.factory, FACTORY_ABI, provider);
              const pairAddr = await factory.getPair(token0.address, token1.address);
              if (pairAddr === '0x0000000000000000000000000000000000000000') continue;

              const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
              const [r0, r1] = await pair.getReserves();
              const pt0 = await pair.token0();
              const price = pt0.toLowerCase() === token0.address.toLowerCase() ? Number(r1) / Number(r0) : Number(r0) / Number(r1);
              prices.push({ dex: dex.name, price, router: dex.router, liquidity: Math.min(Number(r0), Number(r1)) / 1e18 });
            } catch (e) { console.error(`${dex.name} error:`, e); }
          }

          if (prices.length >= 2) {
            prices.sort((a, b) => a.price - b.price);
            const buy = prices[0], sell = prices[prices.length - 1];
            const priceDiff = ((sell.price - buy.price) / buy.price) * 100;

            if (priceDiff > 0.5) {
              const profit = (10 * priceDiff / 100) - gasCostEth - 0.03;
              if (profit > 0) {
                allOpportunities.push({
                  token_pair: `${token0.symbol}/${token1.symbol}`, buy_dex: buy.dex, sell_dex: sell.dex,
                  price_difference: priceDiff.toFixed(4), profit_percentage: priceDiff.toFixed(4),
                  estimated_profit: profit.toFixed(6), loan_amount: '10.00', gas_cost: gasCostEth.toFixed(6),
                  buy_price: buy.price.toFixed(8), sell_price: sell.price.toFixed(8),
                  liquidity: (buy.liquidity + sell.liquidity).toFixed(2),
                  confidence_score: priceDiff > 2 ? 'high' : priceDiff > 1 ? 'medium' : 'low',
                  token0_address: token0.address, token1_address: token1.address,
                  buy_router: buy.router, sell_router: sell.router,
                  network, status: 'active', created_at: new Date().toISOString()
                });
              }
            }
          }
        }
      }
    }

    if (allOpportunities.length > 0) {
      await supabase.from('opportunities').insert(allOpportunities);
    }

    return new Response(JSON.stringify({ success: true, networks, found: allOpportunities.length, opportunities: allOpportunities.slice(0, 10) }), 
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
```

### 4.2 Price Alert Webhook Function

```bash
supabase functions new price-alert-webhook
```

Copy this code to `supabase/functions/price-alert-webhook/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendDiscordWebhook(url, alert) {
  const conditionEmoji = alert.condition === 'above' ? '📈' : alert.condition === 'below' ? '📉' : '🔄';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: `${conditionEmoji} Price Alert Triggered`,
        color: alert.condition === 'above' ? 0x00ff00 : 0xff0000,
        fields: [
          { name: 'Token Pair', value: alert.token_pair, inline: true },
          { name: 'Target Price', value: `$${alert.target_price}`, inline: true },
          { name: 'Current Price', value: `$${alert.current_price}`, inline: true },
        ],
        timestamp: alert.triggered_at,
        footer: { text: 'Flash Arbitrage Bot' }
      }]
    })
  });
  return response.ok;
}

async function sendSlackWebhook(url, alert) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '🔔 Price Alert Triggered' } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Token Pair:*\n${alert.token_pair}` },
          { type: 'mrkdwn', text: `*Target:*\n$${alert.target_price}` },
          { type: 'mrkdwn', text: `*Current:*\n$${alert.current_price}` },
        ]}
      ]
    })
  });
  return response.ok;
}

async function sendTelegramNotification(chatId, alert) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) return false;

  const message = `🔔 *Price Alert Triggered*\n\n*${alert.token_pair}*\nTarget: $${alert.target_price}\nCurrent: $${alert.current_price}`;
  
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
  });
  return response.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { alert, channels } = await req.json();
    if (!alert) throw new Error('Missing alert data');

    const results = {};
    if (channels?.discord) results.discord = await sendDiscordWebhook(channels.discord, alert);
    if (channels?.slack) results.slack = await sendSlackWebhook(channels.slack, alert);
    if (channels?.telegram_chat_id) results.telegram = await sendTelegramNotification(channels.telegram_chat_id, alert);

    return new Response(JSON.stringify({ success: true, results }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

### 4.3 Trading Signals Function

```bash
supabase functions new trading-signals
```

Copy this code to `supabase/functions/trading-signals/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendSignalWebhooks(signal, webhooks) {
  const results = {};
  const severityEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };

  if (webhooks.discord) {
    try {
      const response = await fetch(webhooks.discord, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `${severityEmoji[signal.severity]} Trading Signal`,
            color: signal.severity === 'critical' ? 0xff0000 : 0x00ff00,
            fields: [
              { name: 'Type', value: signal.type, inline: true },
              { name: 'Token Pair', value: signal.token_pair, inline: true },
              { name: 'Profit', value: `${signal.data.profit_percentage}%`, inline: true },
            ],
            timestamp: signal.timestamp,
          }]
        })
      });
      results.discord = response.ok;
    } catch (e) { results.discord = false; }
  }

  if (webhooks.telegram_chat_id) {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (botToken) {
      try {
        const message = `${severityEmoji[signal.severity]} *Trading Signal*\n\n*${signal.token_pair}*\nProfit: ${signal.data.profit_percentage}%`;
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: webhooks.telegram_chat_id, text: message, parse_mode: 'Markdown' }),
        });
        results.telegram = response.ok;
      } catch (e) { results.telegram = false; }
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, opportunity, webhooks } = await req.json().catch(() => ({}));

    if (action === 'analyze' && opportunity) {
      const profitPercentage = parseFloat(opportunity.profit_percentage);
      let severity = 'low';
      if (profitPercentage > 2) severity = 'critical';
      else if (profitPercentage > 1) severity = 'high';
      else if (profitPercentage > 0.7) severity = 'medium';

      const signal = {
        type: 'arbitrage',
        severity,
        token_pair: opportunity.token_pair,
        network: opportunity.network,
        data: opportunity,
        timestamp: new Date().toISOString(),
      };

      if (webhooks) {
        const results = await sendSignalWebhooks(signal, webhooks);
        return new Response(JSON.stringify({ success: true, signal, webhookResults: results }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, signal }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'test-webhooks' && webhooks) {
      const testSignal = {
        type: 'arbitrage',
        severity: 'medium',
        token_pair: 'WETH/USDC',
        network: 'ethereum',
        data: { profit_percentage: 1.25, message: 'Test signal' },
        timestamp: new Date().toISOString(),
      };
      const results = await sendSignalWebhooks(testSignal, webhooks);
      return new Response(JSON.stringify({ success: true, message: 'Test sent', results }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, actions: ['analyze', 'test-webhooks'] }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

---

## Step 5: Deploy All Functions

```bash
# Deploy all functions at once
supabase functions deploy scan-arbitrage-opportunities
supabase functions deploy price-alert-webhook
supabase functions deploy trading-signals

# Or deploy all in one command
supabase functions deploy
```

---

## Step 6: Test Your Deployment

### Test Scanner Connection
```bash
curl -X POST 'https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/scan-arbitrage-opportunities' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c' \
  -H 'Content-Type: application/json' \
  -d '{"test": true}'
```

### Run Full Scan
```bash
curl -X POST 'https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/scan-arbitrage-opportunities' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c' \
  -H 'Content-Type: application/json' \
  -d '{"networks": ["ethereum", "polygon", "arbitrum"]}'
```

### Test Price Alert Webhook
```bash
curl -X POST 'https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/price-alert-webhook' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c' \
  -H 'Content-Type: application/json' \
  -d '{
    "alert": {
      "id": "test-123",
      "token_pair": "ETH/USDC",
      "target_price": 2500,
      "current_price": 2510,
      "condition": "above",
      "triggered_at": "2024-12-28T22:00:00Z"
    },
    "channels": {
      "discord": "YOUR_DISCORD_WEBHOOK_URL"
    }
  }'
```

### Test Trading Signals
```bash
curl -X POST 'https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/trading-signals' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c' \
  -H 'Content-Type: application/json' \
  -d '{"action": "test-webhooks", "webhooks": {"discord": "YOUR_DISCORD_WEBHOOK_URL"}}'
```

---

## Step 7: Configure Webhook Endpoints

### Discord Webhook
1. Go to your Discord server
2. Server Settings → Integrations → Webhooks
3. Create New Webhook
4. Copy the webhook URL

### Slack Webhook
1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. Features → Incoming Webhooks → Activate
4. Add New Webhook to Workspace
5. Copy the webhook URL

### Telegram Bot
1. Message @BotFather on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token
4. Add to Supabase secrets: `supabase secrets set TELEGRAM_BOT_TOKEN=your_token`

---

## Troubleshooting

### Function not found
```bash
# Check if function is deployed
supabase functions list

# Redeploy
supabase functions deploy scan-arbitrage-opportunities
```

### API key not working
```bash
# Verify secrets are set
supabase secrets list

# Update secret
supabase secrets set ALCHEMY_API_KEY=new_key_here
```

### CORS errors
The functions include CORS headers. If you still see errors, check browser console for details.

### Rate limits
- Alchemy free tier: 300M compute units/month
- Infura free tier: 100k requests/day
- Consider upgrading for production use

---

## Database Tables (Run in SQL Editor)

```sql
-- Opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_pair TEXT NOT NULL,
  buy_dex TEXT NOT NULL,
  sell_dex TEXT NOT NULL,
  price_difference TEXT,
  profit_percentage TEXT,
  estimated_profit TEXT,
  loan_amount TEXT,
  gas_cost TEXT,
  buy_price TEXT,
  sell_price TEXT,
  liquidity TEXT,
  confidence_score TEXT,
  token0_address TEXT,
  token1_address TEXT,
  buy_router TEXT,
  sell_router TEXT,
  network TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert history table
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id TEXT,
  user_id UUID,
  token_pair TEXT,
  condition TEXT,
  target_price NUMERIC,
  triggered_price NUMERIC,
  channels_notified TEXT[],
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trading signals table
CREATE TABLE IF NOT EXISTS trading_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT,
  severity TEXT,
  token_pair TEXT,
  network TEXT,
  data JSONB,
  webhook_results JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Quick Reference

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `scan-arbitrage-opportunities` | `/functions/v1/scan-arbitrage-opportunities` | Scan DEXs for arbitrage |
| `price-alert-webhook` | `/functions/v1/price-alert-webhook` | Send price alerts |
| `trading-signals` | `/functions/v1/trading-signals` | Analyze & broadcast signals |

**Your Base URL**: `https://ujhsrxinfcycjtulpvqk.supabase.co`
