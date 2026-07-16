# Troubleshooting

## Startup Errors

### `Required environment variable FLASHLIGHT_CONTRACT_ADDRESS is not set`

Copy `.env.example` to `.env` and fill in all required fields.

```bash
cp .env.example .env
```

### `SCANNER_PRIVATE_KEY must be a 32-byte hex private key`

Private keys must be exactly 64 hex characters (32 bytes), optionally prefixed with `0x`.

### `SCANNER_NETWORKS resolved to no valid networks`

Check that `SCANNER_NETWORKS` contains at least one of: `ethereum`, `arbitrum`, `base`, `polygon`.

### `ARBITRUM_RPC_URL or ETHEREUM_RPC_URL must be set`

Set the RPC URL for each network you've listed in `SCANNER_NETWORKS`.

---

## Scan Issues

### Scanner finds zero opportunities

1. Check `THEGRAPH_API_KEY` is set and valid.
2. Lower thresholds for testing:
   ```env
   SCANNER_MIN_NET_PROFIT_USD=1
   SCANNER_MIN_SPREAD_PERCENT=0.01
   SCANNER_MIN_LIQUIDITY_USD=10000
   ```
3. Check The Graph subgraph status for your network at https://thegraph.com/explorer.
4. Enable debug logging: `RUST_LOG=debug`.

### Opportunities detected but never executed

1. Verify `SCANNER_SHADOW_MODE=false` for live mode.
2. Check that your scanner wallet is an authorised caller:
   ```solidity
   FlashLoanArbitrage.authorizedCallers(YOUR_WALLET_ADDRESS) // must return true
   ```
3. Inspect failure reasons in logs (`failure_reason` field).

---

## Bundle Submission Errors

### `Flashbots relay error -32000: ...`

Common causes:
- Bundle targets a past block → reduce `SCANNER_POLL_INTERVAL_MS`.
- Nonce conflict → only one pending transaction per wallet at a time.
- Simulation reverted → opportunity was detected but conditions changed; increase `SCANNER_MIN_SPREAD_PERCENT`.

### `execution_quote_stale: quote is XXms old`

Reduce `SCANNER_POLL_INTERVAL_MS` or increase `SCANNER_MAX_QUOTE_AGE_MS`.

### `Invalid amountBMin`

The `amountBMin` calculation failed. Check that pool prices returned by The Graph are non-zero.

---

## Docker Issues

### Container exits immediately

Check logs:
```bash
docker-compose logs mev-scanner
```

Missing `.env` file is the most common cause.

### Cannot reach metrics endpoint

Verify port 9090 is not in use:
```bash
lsof -i :9090
```

---

## Getting Help

1. Enable debug logging: `RUST_LOG=debug cargo run --release`
2. Check Prometheus metrics at http://localhost:9090/metrics for counters.
3. Open a GitHub Issue with the full log output.
