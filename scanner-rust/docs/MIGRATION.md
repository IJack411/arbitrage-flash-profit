# Migration Guide — TypeScript Scanner → Rust Scanner

## Overview

This guide explains how to run the Rust scanner alongside the TypeScript Supabase Edge Function scanner, validate parity, and switch execution to Rust.

## Phase 1 — Parallel Shadow Mode (Recommended First Step)

Run both scanners simultaneously with the Rust scanner in shadow mode.

### 1.1 Keep TypeScript scanner running

No changes needed to the existing Supabase Edge Functions.

### 1.2 Start Rust scanner in shadow mode

```bash
cd scanner-rust
cp .env.example .env
# Edit .env: fill required fields, set SCANNER_SHADOW_MODE=true
cargo run --release
```

### 1.3 Compare outputs

Monitor both scanners and compare:

| Metric | Expected |
|--------|----------|
| Token pairs detected | Same pairs within 1 scan cycle |
| Opportunity count/hour | Rust ≥ TypeScript (Rust scans faster) |
| Net profit estimates | Within ±5% of each other |
| Candidate IDs | Different (different `scanRunId`s) but deterministic within each run |

---

## Phase 2 — Rust Scanner Live Mode

Once shadow-mode parity is confirmed (≥ 24 hours of matching data):

### 2.1 Authorise the scanner wallet on-chain

```bash
# Using hardhat console or cast
cast send $FLASHLIGHT_CONTRACT_ADDRESS \
  "setAuthorizedCaller(address,bool)" \
  $SCANNER_WALLET_ADDRESS true \
  --private-key $OWNER_PRIVATE_KEY \
  --rpc-url $ARBITRUM_RPC_URL
```

### 2.2 Switch to live mode

In `scanner-rust/.env`:
```env
SCANNER_SHADOW_MODE=false
```

Restart:
```bash
docker-compose restart mev-scanner
```

### 2.3 Monitor first executions

Watch logs and Prometheus metrics for the first few bundles. Verify:
- `mev_scanner_executions_success_total` increments
- No `execution_quote_stale` or `calldata_error` failures

---

## Phase 3 — Disable TypeScript Scanner (Optional)

Once the Rust scanner is stable in live mode for ≥ 48 hours:

1. Undeploy or disable the TypeScript `scan-arbitrage-opportunities` Edge Function.
2. The Rust scanner takes over as the sole scanner.

---

## Rollback Procedure

If the Rust scanner produces incorrect results or fails:

1. Set `SCANNER_SHADOW_MODE=true` immediately:
   ```bash
   docker-compose stop mev-scanner
   # Edit .env
   docker-compose start mev-scanner
   ```

2. The TypeScript scanner continues executing as before (it was never disabled in Phase 1/2).

3. Revoke the Rust scanner wallet's authorisation if needed:
   ```bash
   cast send $FLASHLIGHT_CONTRACT_ADDRESS \
     "setAuthorizedCaller(address,bool)" \
     $SCANNER_WALLET_ADDRESS false \
     --private-key $OWNER_PRIVATE_KEY
   ```

---

## Parity Validation Checklist

- [ ] Both scanners detect the same token pairs (USDC/WETH, WETH/WBTC, etc.)
- [ ] Profit estimates within ±5% for the same opportunity
- [ ] No false positives (opportunities that revert on execution)
- [ ] Rust scanner cycle rate ≥ TypeScript scanner rate
- [ ] No stale-quote rejections in Rust scanner logs
- [ ] Prometheus metrics updating as expected

---

## Configuration Mapping

| TypeScript env var | Rust env var | Notes |
|-------------------|--------------|-------|
| `SCANNER_MIN_NET_PROFIT_USD` | `SCANNER_MIN_NET_PROFIT_USD` | Same |
| `SCANNER_MIN_SPREAD_PERCENT` | `SCANNER_MIN_SPREAD_PERCENT` | Same |
| `SCANNER_MIN_LIQUIDITY_USD` | `SCANNER_MIN_LIQUIDITY_USD` | Same |
| `SCANNER_LOAN_AMOUNT_USD` | `SCANNER_LOAN_AMOUNT_USD` | Same |
| `THEGRAPH_API_KEY` | `THEGRAPH_API_KEY` | Same |
| `FLASHBOTS_RELAY_URL` | `FLASHBOTS_RELAY_URL` | Same |
| `EXEC_MAX_QUOTE_AGE_MS` | `SCANNER_MAX_QUOTE_AGE_MS` | Renamed |
| `FLASHBOTS_SIGNER_PRIVATE_KEY` | `FLASHBOTS_SIGNER_PRIVATE_KEY` | Same |
| N/A | `SCANNER_SHADOW_MODE` | New in Rust |
| N/A | `SCANNER_NETWORKS` | New in Rust (replaces per-function config) |
