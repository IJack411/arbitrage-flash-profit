# 🚀 Production Setup Guide - Flash Loan Arbitrage Bot

## Quick Start (10 Minutes)

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create account
2. Click "New Project" → Choose organization → Name it
3. Wait for project to initialize (~2 minutes)

### Step 2: Get Your Credentials
1. Go to **Settings** → **API**
2. Copy **Project URL** (e.g., `https://abc123.supabase.co`)
3. Copy **anon public** key (starts with `eyJ...`)
4. Copy **Project Reference ID** from URL (the `abc123` part)

### Step 3: Configure Environment
```bash
cp .env.example .env
```
Edit `.env`:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 4: Run Database Migrations
In Supabase Dashboard → **SQL Editor**:
1. Run `supabase/migrations/000_RUN_ALL_MIGRATIONS.sql` (recommended, complete schema)
2. Verify success output and table creation before proceeding

### Step 5: Deploy Edge Functions
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all required functions used by this app
supabase functions deploy scan-arbitrage-opportunities
supabase functions deploy flashbots-executor
supabase functions deploy trading-signals
supabase functions deploy send-alert-email
supabase functions deploy send-telegram-notification
supabase functions deploy totp-2fa
supabase functions deploy webhook-retry-processor
supabase functions deploy cron-scheduler-24-7
supabase functions deploy scheduler-trigger
supabase functions deploy trading-bot-executor
```

### Step 6: Add API Keys (Required for Real Data)
In Supabase Dashboard → **Edge Functions** → **Secrets**:
```
INFURA_API_KEY=your_infura_key
ALCHEMY_API_KEY=your_alchemy_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
FLASHBOTS_SIGNER_PRIVATE_KEY=your_flashbots_private_key
RESEND_API_KEY=your_email_provider_key
```

Get free API keys:
- **Infura**: [infura.io](https://infura.io) - 100k requests/day free
- **Alchemy**: [alchemy.com](https://alchemy.com) - 300M compute units/month free

### Step 7: Start the App
```bash
npm install
npm run dev
```

### Step 8: Local Edge Function Development (Optional)
Use this when you want to test function behavior locally before cloud deploy.

```bash
# From project root, initialize local Supabase stack
supabase start

# Copy local function env template
cp supabase/.env.local.example supabase/.env.local

# Serve all functions locally
supabase functions serve --env-file supabase/.env.local
```

Local invoke URL format:

```bash
http://127.0.0.1:54321/functions/v1/<function-name>
```

Shortcut npm scripts:

```bash
npm run supabase:dev
npm run supabase:start
npm run supabase:env:init
npm run supabase:functions:serve
npm run supabase:functions:deploy:all
npm run supabase:stop
```

Then edit `supabase/.env.local` with your real secret values.

---

## Verify Everything Works

1. **Check Setup Tab**: Go to the "Setup" tab in the app to see system status
2. **Test Scanner**: Click "Manual Scan" to test the edge function
3. **Connect Wallet**: Connect MetaMask to enable live trading
4. **Start in Simulation**: Always test in simulation mode first

---

## Deploy to Production

### Option A: Vercel (Recommended)
```bash
npm run build
npx vercel deploy
```

### Option B: Netlify
```bash
npm run build
# Drag /dist folder to netlify.com
```

---

## ⚠️ Before Live Trading

1. **Test on Testnet First** (Goerli/Sepolia)
2. **Start Small** ($100-500)
3. **Set Stop Losses** in Strategy Config
4. **Monitor First 24 Hours** closely
5. **Enable Simulation Mode** until confident

---

## Checklist

- [ ] Supabase project created
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Edge functions deployed
- [ ] API keys added (Infura/Alchemy)
- [ ] Wallet connected (MetaMask)
- [ ] Test scan completed
- [ ] Simulation mode tested
- [ ] Small live test executed

---

## Detailed Go-Live Checklist

Use this list as the final launch gate. Do not move to the next section until all checks in the current section are complete.

### 1) Readiness Gate

- [ ] `npm install` completed with no dependency errors
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Setup tab shows healthy status for core services
- [ ] Pre-launch validation components report pass status

### 2) Data + Execution Infrastructure

- [ ] Supabase migrations verified (all required tables present)
- [ ] Required edge functions deployed and responding
- [ ] RPC providers configured with fallback (Infura + Alchemy)
- [ ] Telegram and email alert functions tested with real destination
- [ ] Scheduler and retry processor functions tested

### 3) Security + Secrets

- [ ] All production secrets set in Supabase Edge Function secrets
- [ ] No secrets exposed in frontend environment variables beyond public anon key
- [ ] Flashbots signer key and API keys rotated for production use
- [ ] Wallet used for execution has minimal required funds and scoped permissions

### 4) Strategy + Risk Controls

- [ ] Max position size configured
- [ ] Max gas per trade configured
- [ ] Slippage cap configured
- [ ] Daily loss cap configured
- [ ] Cooldown after consecutive losses configured
- [ ] Emergency stop tested and confirmed functional

### 5) Validation Thresholds (Must Pass)

Simulation gate (from runbook):
- [ ] At least 100 simulated trades logged
- [ ] Win rate >= 55%
- [ ] Average net profit/trade > 0
- [ ] Profit factor >= 1.20
- [ ] Max drawdown <= 15%
- [ ] Failure rate <= 10%

Micro-live gate (before scaling):
- [ ] At least 20 micro-live trades completed (target 50 before scaling)
- [ ] Win rate >= 50%
- [ ] Average net profit/trade > 0
- [ ] Profit factor >= 1.10
- [ ] Max drawdown <= 10%
- [ ] Failure rate <= 12%

### 6) Logging + Monitoring

- [ ] Trade log entries are captured for every simulated and live trade
- [ ] `npm run trades:summary` produces expected output
- [ ] Alert routing configured by severity (info/warn/critical)
- [ ] Monitoring dashboard checked for latency, failure rate, and PnL visibility

### 7) Automated Rollout Healthcheck (Host Scheduler)

- [ ] `npm run scanner:indexer:healthcheck` passes manually
- [ ] Install Windows scheduled task: `npm run ops:healthcheck:schedule:install`
- [ ] Verify task status: `npm run ops:healthcheck:schedule:status`
- [ ] Confirm log updates in `logs/scheduler/indexer-healthcheck.log`

Optional management commands:
- Dry run task creation: `npm run ops:healthcheck:schedule:dry-run`
- Remove scheduled task: `npm run ops:healthcheck:schedule:remove`

### 8) Automated Full Readiness Check (Host Scheduler)

- [ ] `npm run scanner:readiness:healthcheck` passes manually
- [ ] Install readiness scheduler: `npm run ops:readiness:schedule:install`
- [ ] Verify readiness task status: `npm run ops:readiness:schedule:status`
- [ ] Confirm log updates in `logs/scheduler/scanner-readiness-healthcheck.log`

Optional management commands:
- Dry run task creation: `npm run ops:readiness:schedule:dry-run`
- Remove scheduled task: `npm run ops:readiness:schedule:remove`

Unified operator summary:
- `npm run ops:schedule:summary`

Automation gate commands:
- Human-readable strict gate (non-zero exit on unhealthy): `npm run ops:schedule:gate`
- Machine-readable strict gate with JSON payload: `npm run ops:schedule:gate:json`

---

## 72-Hour Staged Rollout Checklist

### Window A: Hour 0-8 (Controlled Start)

- [ ] Keep capital allocation at minimum level
- [ ] Enable strictest risk caps
- [ ] Run only during selected, higher-liquidity sessions
- [ ] Verify all alerts are received in real time
- [ ] Pause immediately on 3 unexplained failed executions

### Window B: Hour 8-24 (Stability Check)

- [ ] Review win rate, net profit/trade, and failure rate every 4 hours
- [ ] Compare realized gas/slippage against assumptions
- [ ] Confirm no unexplained transaction delays or stuck execution paths
- [ ] Keep size unchanged unless all metrics remain within thresholds

### Window C: Hour 24-48 (Conservative Scale)

- [ ] Increase allocation by a small increment only if Window A+B are green
- [ ] Re-run trade evaluation against micro-live thresholds
- [ ] Keep emergency stop and loss caps unchanged
- [ ] Validate that higher load does not degrade execution quality

### Window D: Hour 48-72 (Go/No-Go Decision)

- [ ] Evaluate total rollout sample performance
- [ ] Confirm threshold compliance remains stable
- [ ] Decide one: maintain, scale incrementally, or rollback to simulation
- [ ] Document final decision and rationale in ops notes

---

## Incident Triggers (Immediate Pause)

- [ ] Daily loss cap breached
- [ ] 3 consecutive unexplained failed executions
- [ ] Sustained RPC instability with no healthy fallback
- [ ] Alerting system outage during live execution
- [ ] Material deviation from expected slippage/gas behavior

---

## Simple Launch Sheet (Do This In Order)

### Step 1: Confirm Build Health

- [ ] `npm run lint`
- [ ] `npm run build`

### Step 2: Confirm Backend Health

- [ ] Migrations already applied
- [ ] Edge functions deployed and responding
- [ ] RPC fallback configured (Infura + Alchemy)

### Step 3: Confirm Risk Controls

- [ ] Max position size set
- [ ] Max gas per trade set
- [ ] Slippage cap set
- [ ] Daily loss cap set
- [ ] Emergency stop tested

### Step 4: Confirm Performance Gates

- [ ] Simulation gate passed (100 trades)
- [ ] Micro-live gate passed (20+ trades, target 50)
- [ ] `npm run trades:summary` reviewed

### Step 5: Start Small (First 24 Hours)

- [ ] Minimum capital only
- [ ] Check metrics every 4 hours
- [ ] Keep size unchanged if any metric weakens

### Step 6: Scale Carefully (24-72 Hours)

- [ ] Increase size by small increments only
- [ ] Re-check micro-live thresholds before each increase
- [ ] Pause immediately on any incident trigger

### Quick Daily Go/No-Go

Go:
- [ ] No incident triggers
- [ ] Net profit/trade remains positive
- [ ] Failure rate remains within threshold

No-Go:
- [ ] Any incident trigger hit
- [ ] Failure rate spikes
- [ ] Live execution quality degrades (latency/slippage)

---

## Opportunity Precheck Controls

Use PRECHECK for early warning when runs are close to trigger thresholds, without changing strict ALERT requirements.

Scout-side thresholds:
- `ALERT_PRECHECK_TOP_WATCH_NET_MIN` (default `-5`)
- `ALERT_PRECHECK_TOP_DISTANCE_MAX` (default `20`)
- `ALERT_PRECHECK_BAD_QUOTES_MAX` (default `1`)
- Optional strict precheck exit: set `ALERT_STRICT_EXIT=true` and `ALERT_PRECHECK_STRICT_EXIT=true` (exit code `14`)

Watch-loop controls:
- `OPPORTUNITY_WATCH_NOTIFY_ON_PRECHECK` (default `true`)
- `OPPORTUNITY_WATCH_STOP_ON_PRECHECK` (default `false`)
- `OPPORTUNITY_WATCH_STRICT_PRECHECK_EXIT` (default `false`, exit code `14` if precheck seen)
- `OPPORTUNITY_WATCH_PRECHECK_STREAK_MIN` (default `2`, escalates message label to `PRECHECK_STREAK_ALERT`)
- `OPPORTUNITY_WATCH_PRECHECK_NOTIFY_COOLDOWN_MS` (default `600000`, precheck notification cooldown)
- `OPPORTUNITY_WATCH_ALERT_LATCH_FILE` (default `benchmark-results/high-quality-alert-latest.json`, overwritten on each strict ALERT)
- `OPPORTUNITY_WATCH_ALERT_HISTORY_FILE` (default `benchmark-results/high-quality-alert-history.jsonl`, append-only strict ALERT history)

Scheduler runner defaults (`scripts/run-opportunity-watch.ps1`):
- PRECHECK notifications enabled by default
- STOP_ON_PRECHECK disabled by default
- STRICT_PRECHECK_EXIT disabled by default
- `ALERT_PRECHECK_TOP_DISTANCE_MAX` overridden to `22` for scheduler runs (strict ALERT threshold remains unchanged)

---

## Today Only Checklist (10 Lines)

- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Confirm edge functions are healthy
- [ ] Confirm RPC fallback is active
- [ ] Confirm risk caps are set (size, gas, slippage, daily loss)
- [ ] Confirm emergency stop works
- [ ] Confirm simulation thresholds passed
- [ ] Start micro-live with minimum capital
- [ ] Check metrics every 4 hours today
- [ ] Pause immediately if any incident trigger is hit
