# Trading Validation Runbook (100 Sim + 20–50 Micro Live)

This runbook helps you execute a disciplined go/no-go process before scaling capital.

## Important

- No strategy guarantees profit.
- Use only capital you can afford to lose.
- Validate net performance **after gas, slippage, failed tx cost, and fees**.

## Phase 1 — Simulation (Target: 100 trades)

### Goal (Micro Live)

Prove the strategy has positive expectancy and stable execution behavior.

### Setup

1. Ensure app and required backend functions are running.
2. Keep execution mode in simulation.
3. Record each trade in [templates/trade-log.csv](../templates/trade-log.csv).

### Minimum sample rules (Micro Live)

- At least 100 completed simulated trades.
- Include different market conditions (high/normal gas, volatile/quiet periods).
- Do not cherry-pick sessions.

### Go/No-Go thresholds (simulation)

- Trades: `>= 100`
- Win rate: `>= 55%`
- Average net profit/trade: `> 0`
- Profit factor (`gross wins / gross losses`): `>= 1.20`
- Max drawdown: `<= 15%` of simulation starting capital
- Failure rate (failed attempts): `<= 10%`

If any threshold fails, improve logic/risk controls and repeat simulation.

## Phase 2 — Micro Live (Target: 20–50 trades)

### Goal

Validate that real execution still performs after on-chain realities.

### Position sizing guidance

- Start very small (example: 0.5%–1% of planned live capital per trade).
- Keep strict daily loss cap.

### Minimum sample rules

- Start with 20 micro live trades.
- If metrics remain within thresholds, extend to 50.

### Go/No-Go thresholds (micro live)

- Trades: `>= 20` (then `>= 50` before scaling)
- Average net profit/trade: `> 0`
- Win rate: `>= 50%`
- Profit factor: `>= 1.10`
- Max drawdown: `<= 10%` of micro allocation
- Failure rate: `<= 12%`

If live results materially underperform simulation, pause scaling and diagnose latency/slippage/MEV/fee assumptions.

## Required discipline rules

- Hard stop on daily loss cap breach.
- Hard stop on 3 consecutive failed executions with unexplained errors.
- Do not increase size until thresholds pass.

## Logging workflow

1. Append each trade to [templates/trade-log.csv](templates/trade-log.csv).

Fast append command:

```bash
npm run trades:append -- sim success 12.5 1.1 0.2 0.1 11.1 1000 1011.1 note-here
```

Arguments:

- phase: `sim` or `micro`
- status: `success` or `failed`
- gross gas slippage fees net equityStart equityEnd: numeric values
- notes: optional text

Optional smoother flow (sync executed UI trades from Supabase into CSV):

```bash
npm run trades:sync -- --phase sim
```

For micro-live sync:

```bash
npm run trades:sync -- --phase micro
```

Notes:

- Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` or `.env.local`.
- Sync only appends completed statuses (`success` / `failed`) and skips duplicates by transaction hash.

1. Run:

```bash
npm run trades:evaluate -- templates/trade-log.csv sim
```

Quick progress snapshot:

```bash
npm run trades:summary
```

or for micro live:

```bash
npm run trades:evaluate -- templates/trade-log.csv micro
```

1. Review pass/fail output and only move forward when all gates pass.

## Suggested columns to log every trade

- Mode (`sim` or `micro`)
- Status (`success` or `failed`)
- Gross profit USD
- Gas cost USD
- Slippage cost USD
- Other fees USD
- Net profit USD
- Starting equity USD
- Ending equity USD

These are already included in [templates/trade-log.csv](templates/trade-log.csv).
