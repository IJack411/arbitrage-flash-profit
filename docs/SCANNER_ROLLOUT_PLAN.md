# Scanner Rollout Plan (Production-Grade Opportunity Capture)

## Purpose

Build a scanner and executor stack that finds more executable opportunities, converts more opportunities into filled trades, and continuously improves from live outcomes.

This plan is designed for the current architecture in this repository:

- Scanner: `supabase/functions/scan-arbitrage-opportunities/index.ts`
- Executor: `supabase/functions/flashbots-executor/index.ts`
- Schedulers: `supabase/functions/cron-scheduler-24-7/index.ts`, `supabase/functions/scheduler-trigger/index.ts`
- Live trading orchestration: `src/components/bots/LiveTradingPanel.tsx`

## Why this plan

The strongest open-source systems combine:

- Fast event loops and broad connector coverage (Hummingbot)
- Rigorous research, replay/backtesting, and parameter optimization discipline (Freqtrade)

Your codebase already has strong filtering and diagnostics. The main gap is execution realism, latency, and closed-loop calibration.

## Success Metrics (North Star + Guardrails)

Track these as first-class KPIs every day:

1. Opportunity-to-fill conversion rate
2. Median detection-to-submit latency (ms)
3. Predicted vs realized net profit error (MAE)
4. Revert/failure rate by network and route
5. Net PnL after gas + failed tx cost
6. Share of fills from non-Ethereum networks

Target progression:

- Week 1: Baseline instrumentation complete, zero unknown failure reasons
- Week 2: MAE improves by 30% vs baseline
- Week 3: Conversion rate improves by 20% vs baseline
- Week 4: Non-Ethereum live execution contributes at least 15% of successful fills

## Phase 0 (Days 1-3): Baseline Instrumentation

### Objective

Create complete observability from candidate to execution outcome.

### Changes

1. Add scanner emission IDs and run IDs
- File: `supabase/functions/scan-arbitrage-opportunities/index.ts`
- Add fields per candidate/opportunity:
  - `scanRunId`
  - `candidateId`
  - `quoteTimestamp`
  - `dataSource` (subgraph, dexscreener, gecko)

2. Add execution telemetry
- File: `supabase/functions/flashbots-executor/index.ts`
- Log fields:
  - `scanRunId`, `candidateId`
  - block number at submission
  - target block
  - simulated output
  - signed bundle hash
  - inclusion status and reason on failure

3. Add scheduler telemetry
- File: `supabase/functions/cron-scheduler-24-7/index.ts`
- Include:
  - trigger reason (cron/manual)
  - scan start/end
  - API source failure counts

### Data model (new tables)

1. `scanner_runs`
- `id` (uuid)
- `started_at`, `ended_at`
- `networks` (jsonb)
- `config` (jsonb)
- `pool_counts` (jsonb)
- `diagnostics` (jsonb)

2. `scanner_candidates`
- `id` (uuid)
- `scan_run_id`
- `token_pair`, `network`, `buy_dex`, `sell_dex`
- `spread`, `liquidity_usd`, `estimated_slippage_bps`
- `gross_profit`, `predicted_net_profit`
- `status` (active/watchlist/rejected)
- `reject_reason`

3. `execution_attempts`
- `id` (uuid)
- `candidate_id`
- `submitted_at`
- `target_block`
- `bundle_hash`
- `included` (bool)
- `failure_reason`
- `realized_net_profit`
- `latency_ms`

### Exit criteria

- At least 48 hours of complete candidate and execution telemetry
- Less than 1% events with missing reason fields

## Phase 1 (Days 4-10): Quote and Execution Parity

### Objective

Ensure scanner economics match real on-chain execution behavior.

### Changes

1. Replace minOut heuristic with route-quote-derived minOut
- File: `supabase/functions/flashbots-executor/index.ts`
- Current implementation derives minOut from `opportunity.netProfit` in USD terms.
- Replace with deterministic quote path:
  - route quote for amountIn
  - derive expected tokenOut amount
  - apply slippage bound to tokenOut
  - set minOut in token units

2. Add pre-submit simulation gate
- File: `supabase/functions/flashbots-executor/index.ts`
- Simulate transaction call before bundle submission.
- Reject when simulation fails or expected tokenOut < minOut.

3. Align scanner pricing assumptions with executor
- Files:
  - `supabase/functions/scan-arbitrage-opportunities/index.ts`
  - `supabase/functions/flashbots-executor/index.ts`
- Share common route fee and gas assumptions.
- Add versioned economics object attached to each candidate.

### Exit criteria

- Predicted-vs-realized net MAE reduced by at least 30%
- Reverts due to output/amount mismatch reduced by at least 50%

## Phase 2 (Days 11-17): Latency and Trigger Architecture

### Objective

Move from periodic snapshot scanning to event-driven scanning.

### Changes

1. Keep cron fallback but reduce dependency
- File: `supabase/functions/cron-scheduler-24-7/index.ts`
- Maintain cron but treat as safety net.
- Tune schedule expression from default 5 minutes to a tighter fallback interval only after event triggers are stable.

2. Add event triggers for scan scheduling
- New function suggested: `supabase/functions/event-driven-scan-trigger/index.ts`
- Trigger scan from:
  - major pool reserve update events
  - gas regime change
  - sudden spread anomalies from market feeds

3. Add debounce and per-pair cooldown
- File: `supabase/functions/scan-arbitrage-opportunities/index.ts`
- Prevent duplicate submissions during noisy windows.

### Exit criteria

- Median detection-to-submit latency down by at least 40%
- Duplicate execution attempts down by at least 25%

## Phase 3 (Days 18-24): Multi-Network Live Parity

### Objective

Remove Ethereum-only live bottleneck.

### Changes

1. Implement live execution paths for Base and Arbitrum
- Files:
  - `supabase/functions/flashbots-executor/index.ts`
  - `src/components/bots/LiveTradingPanel.tsx`
- Current UI warns that Base/Arbitrum remain demo-only in live mode.
- Add network-specific relays/routes and config validation before live enable.

2. Add network-specific risk profiles
- File: `supabase/functions/scan-arbitrage-opportunities/index.ts`
- Keep per-network values for:
  - min net profit
  - max slippage
  - gas multiplier
  - max liquidity usage fraction

### Exit criteria

- At least 15% of successful live fills from non-Ethereum networks
- No increase in overall failure rate beyond 10% relative

## Phase 4 (Days 25-30): Closed-Loop Learning and Auto-Tuning

### Objective

Continuously tune thresholds and ranking using realized outcomes.

### Changes

1. Add candidate ranking model
- File: `supabase/functions/scan-arbitrage-opportunities/index.ts`
- Rank by expected value after:
  - slippage risk
  - inclusion risk
  - route failure history
  - latency decay

2. Add nightly parameter tuner job
- New function suggested: `supabase/functions/scanner-parameter-tuner/index.ts`
- Tune:
  - `minNetProfitUsdByNetwork`
  - `maxSlippageBps`
  - max liquidity usage
- Constraints:
  - never disable safety limits
  - only move within bounded ranges per day

3. Add promotion gates
- File: `docs/TRADING_VALIDATION_RUNBOOK.md`
- Add a section for scanner model promotion criteria tied to MAE, conversion, and failure rates.

### Exit criteria

- 7-day rolling net PnL positive after all costs
- Stability of conversion and MAE metrics for at least 5 consecutive days

## Immediate Implementation Backlog (Start Now)

Priority P0:

1. Add `scanRunId` and `candidateId` to scanner response and logs
2. Add execution attempt logging with failure reason taxonomy
3. Replace executor minOut calculation with quote-derived token output
4. Add pre-submit simulation gate

Priority P1:

1. Event-driven scan trigger function
2. Pair-level cooldown and duplicate suppression
3. Base and Arbitrum live route support

Priority P2:

1. Ranking model
2. Nightly tuner
3. Automated regression report (daily)

## Risk Controls

Hard stops:

1. Pause live mode if failure rate exceeds 20% over last 50 attempts
2. Pause network if realized net profit < 0 for 3 consecutive days
3. Roll back new risk settings automatically if MAE worsens by 25%+ day-over-day

## Definition of Done (Month 1)

1. Instrumented and queryable full candidate-to-fill pipeline
2. Quote/execution parity in place
3. Event-driven triggering active with cron fallback
4. Multi-network live parity implemented
5. Closed-loop tuning active with safety constraints
6. Daily dashboard and weekly decision review process established
