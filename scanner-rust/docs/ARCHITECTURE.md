# Architecture — Rust MEV Scanner

## Module Overview

```
scanner-rust/
├── src/
│   ├── main.rs         Entry point: tokio runtime, scan loop, metrics server
│   ├── config.rs       Environment-based configuration with validation
│   ├── scanner.rs      Bellman-Ford arbitrage detection + pool data fetching
│   ├── flashlight.rs   FlashLoanArbitrage contract integration layer
│   ├── executor.rs     Flashbots bundle construction and submission
│   └── metrics.rs      Prometheus metrics registry
├── contracts/
│   └── FlashLoanArbitrage.abi.json
├── docker/
│   └── prometheus.yml
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── Cargo.toml
```

## Key Design Decisions

### 1. Bellman-Ford for Arbitrage Detection

The scanner builds a directed exchange graph where:
- **Vertices** = tokens (USDC, WETH, WBTC, …)
- **Edges** = swap directions on a DEX with weight `−ln(rate × (1 − fee))`

A negative-weight cycle in this graph corresponds to a sequence of swaps that returns more value than started. Bellman-Ford detects these cycles in **O(V × E)** time.

For the 2-hop case (A → B → A across two DEXes), the math simplifies to:

```
arbitrage = (buyRate × sellRate × (1−feeA) × (1−feeB)) > 1
```

### 2. Deterministic Candidate IDs

Candidate IDs are generated using the same FNV-1a 32-bit hash algorithm as the TypeScript `createDeterministicCandidateId()` function in `supabase/functions/_shared/opportunity-contract.ts`. This ensures parity validation works when running both scanners side-by-side.

Seed format: `{scanRunId}|{network}|{tokenPair}|{buyDex}|{sellDex}|{status}`

### 3. Shadow Mode

`SCANNER_SHADOW_MODE=true` (default) lets you run the Rust scanner alongside the TypeScript scanner without risk. Opportunities are detected and logged at the same rate as live mode, but no bundles are submitted.

To validate parity:
1. Run both scanners on the same network
2. Compare opportunity counts and token pairs
3. Check that profit estimates are within 5% of each other

### 4. Flashbots Integration

Bundle signing follows the [Flashbots documentation](https://docs.flashbots.net/flashbots-auction/advanced/rpc-endpoint):
1. Serialise the JSON-RPC request body
2. Keccak256 hash the body bytes
3. Sign the hash with the Flashbots signer key
4. Include `X-Flashbots-Signature: {address}:{signature}` header

### 5. Contract Calldata Encoding

`flashlight.rs` manually ABI-encodes the `executeArbitrage` calldata without the `abigen!` macro. This avoids the need to regenerate Rust bindings every time the Solidity ABI changes, while still verifying the 4-byte selector at runtime.

Selector: `keccak256("executeArbitrage(address,uint256,address,address,address,bool,bool,uint24,uint24,uint256)")[..4]`

### 6. Prometheus Metrics

All key events are tracked:

| Metric | Type | Labels |
|--------|------|--------|
| `mev_scanner_opportunities_found_total` | counter | network, status |
| `mev_scanner_executions_attempted_total` | counter | network |
| `mev_scanner_executions_success_total` | counter | network |
| `mev_scanner_executions_failure_total` | counter | network, reason |
| `mev_scanner_shadow_executions_total` | counter | network |
| `mev_scanner_scan_cycles_total` | counter | — |
| `mev_scanner_last_scan_best_profit_usd` | gauge | — |

## Data Source Strategy

1. **The Graph** (preferred): Low-latency indexed pool data. Requires `THEGRAPH_API_KEY`.
2. **RPC fallback**: Direct on-chain calls to pool contracts when The Graph is unavailable or returns stale data. (Stub in current version; future work.)

## Opportunity Lifecycle

```
Pool data fetched
      │
      ▼
Graph built (tokens as vertices, swaps as edges)
      │
      ▼
Bellman-Ford: detect negative cycles
      │
      ▼
Cycle evaluation:
  ├─ spread_percent < min_spread_percent → discard
  ├─ net_profit < min_profit_usd        → watchlist
  └─ net_profit >= min_profit_usd       → active
      │
      ▼  (active only)
Quote freshness check (max_quote_age_ms)
      │
      ▼
Calldata encoding (flashlight.rs)
      │
      ▼
Bundle construction + signing (executor.rs)
      │
      ├── SHADOW MODE → log + metrics, no submission
      └── LIVE MODE   → POST to Flashbots relay
```
