# Flash Loan ↔ Scanner Connection Checklist

Use this checklist to connect scanner output to `FlashLoanArbitrage` execution safely.

## 1) Pick One Live Network First

- [ ] Choose one of the currently supported execution networks: `ethereum` or `base`
- [ ] Set `AUTO_NETWORKS` to the same single network while validating (example: `ethereum`)
- [ ] Confirm scanner opportunities for that network include `status: "active"` and `executionPayload`

> Note: `flashbots-executor` currently rejects unsupported execution networks.

## 2) Deploy FlashLoanArbitrage

From `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/contracts`:

```bash
npm install
npm run compile
npm run deploy:base      # or deploy:mainnet
```

After deploy, copy:

- `VITE_ARBITRAGE_CONTRACT_ADDRESS`
- `VITE_FLASH_LOAN_PROVIDER_ADDRESS`

Set in root `.env`:

- [ ] `VITE_ARBITRAGE_CONTRACT_ADDRESS=...`
- [ ] `AUTO_CONTRACT_ADDRESS=...`

## 3) Authorize the Execution Wallet

The execution signer must be owner or approved by `setAuthorizedCaller`.

From `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/contracts`:

```bash
CONTRACT_ADDRESS=0x... CALLER_ADDRESS=0x... npm run authorize:base
# revoke if needed:
# CONTRACT_ADDRESS=0x... CALLER_ADDRESS=0x... AUTHORIZED=false npm run authorize:base
```

Checklist:

- [ ] Execution wallet address is known and correct
- [ ] `authorizedCallers(executionWallet)` is `true`

## 4) Configure Executor + Scanner Environment

Set required secrets/environment values for `flashbots-executor`:

- [ ] `PRIVATE_KEY` (execution wallet signer)
- [ ] `FLASHBOTS_RELAY_SIGNING_KEY` (dedicated relay auth key)
- [ ] `ETHEREUM_RPC_URL` and/or `BASE_RPC_URL` for chosen network
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `THEGRAPH_API_KEY`

Recommended scanner safety:

- [ ] `SCANNER_ENFORCE_READINESS_GATES=true` (after burn-in)
- [ ] `SCANNER_MIN_GRAPH_SOURCES_HEALTHY>=3`
- [ ] `SCANNER_MAX_GRAPH_FALLBACK_SOURCES<=2`

## 5) Verify Payload Contract Before Live

- [ ] Run scanner and confirm active opportunities include:
  - `scanRunId`
  - `candidateId`
  - `quoteTimestamp`
  - full `executionPayload` (asset, amount, routers, tokenB, fees, amountBMin)
- [ ] Confirm no parity or staleness failures in executor logs

## 6) Dry-Mode Connection Test

From `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit`:

```bash
AUTO_TRADE_MODE=dry npm run auto:trade
```

- [ ] Scanner returns active opportunities
- [ ] Auto-trade loop selects eligible candidate
- [ ] Executor accepts payload and reaches simulation/bundle path
- [ ] No `execution_quote_stale`, `execution_quote_parity_mismatch`, or `invalid_execution_payload`

## 7) Controlled End-to-End Rehearsal

- [ ] First run on local/fork where possible
- [ ] Switch to live mode with conservative loan size and tighter slippage
- [ ] Execute one small notional trade on chosen network
- [ ] Confirm execution attempt record includes `scan_run_id`, `candidate_id`, `bundle_hash`, `included`, and metadata

## 8) Post-Execution Monitoring + Tightening

- [ ] Track failure reason counts: unsupported network, stale quote, payload mismatch, simulation revert
- [ ] Review realized net vs predicted net
- [ ] Tighten thresholds only after stable successful runs:
  - loan size
  - max slippage
  - min net profit
  - gas-to-profit ratio
