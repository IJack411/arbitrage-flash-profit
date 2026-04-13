# Edge Functions Deployment Guide

## Quick Deploy Commands

Run these commands in your terminal to deploy the arbitrage scanner:

```bash
# Step 1: Install Supabase CLI
npm install -g supabase

# Step 2: Login to Supabase
supabase login

# Step 3: Link to your project (get project ref from Supabase Dashboard → Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Step 4: Create the edge function
supabase functions new scan-arbitrage-opportunities

# Step 5: Copy the code from EDGE_FUNCTION_CODE.md to:
# supabase/functions/scan-arbitrage-opportunities/index.ts

# Step 6: Set your API secrets
supabase secrets set INFURA_API_KEY=your_infura_api_key
# Optional: supabase secrets set ALCHEMY_API_KEY=your_alchemy_key

# Step 7: Deploy the function
supabase functions deploy scan-arbitrage-opportunities

# Step 8: Create flashbots executor (optional)
supabase functions new flashbots-executor
# Copy code from docs/EDGE_FUNCTION_PART2.md
supabase functions deploy flashbots-executor
```

## Test Your Deployment

```bash
# Test the scanner
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/scan-arbitrage-opportunities' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"test": true}'

# Run a full scan
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/scan-arbitrage-opportunities' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

## Get API Keys

1. **Infura**: https://infura.io - Create free account, create new project, copy API key
2. **Alchemy**: https://alchemy.com - Alternative RPC provider

## Troubleshooting

- **Function not found**: Make sure you deployed with `supabase functions deploy`
- **CORS errors**: The function includes CORS headers, check browser console
- **Rate limits**: Add rate limiting or use paid RPC plans for production
- **No opportunities found**: This is normal - arbitrage opportunities are rare and fleeting

## Local Development

```bash
# Start local Supabase
supabase start

# Serve functions locally with hot reload
supabase functions serve --env-file .env.local

# Create .env.local with:
# INFURA_API_KEY=your_key
# SUPABASE_URL=http://localhost:54321
# SUPABASE_SERVICE_ROLE_KEY=your_local_key
```
