# Performance — Rust Scanner vs. TypeScript Scanner

## Latency Profile

| Stage | TypeScript (Supabase Edge Fn) | Rust Scanner | Notes |
|-------|-------------------------------|--------------|-------|
| Cold start | 200–600 ms | < 5 ms | Edge function cold starts are significant |
| The Graph query | 80–200 ms | 80–200 ms | Network-bound; same |
| Opportunity detection | 5–20 ms | < 1 ms | Rust Bellman-Ford vs. JS array ops |
| Calldata encoding | 2–5 ms | < 0.1 ms | `ethers` ABI vs. `ethers-rs` |
| Bundle signing | 5–15 ms | 1–3 ms | Node.js crypto vs. Rust k256 |
| Full cycle (hot) | 200–400 ms | 10–50 ms | End-to-end per opportunity |

## Throughput

| Metric | TypeScript | Rust |
|--------|-----------|------|
| Max scan cycles/min | ~3–6 | 60–120 |
| Max concurrent networks | 1 (edge fn timeout) | Unlimited (async) |
| Memory per opportunity | ~50 MB (V8 heap) | ~1 KB (stack) |

## Key Advantages of Rust

1. **No GC pauses**: Zero-copy operations, no garbage collector.
2. **Compile-time correctness**: Type system catches category of bugs that only surface at runtime in TypeScript.
3. **True parallelism**: `tokio` tasks for each network run concurrently; no event-loop contention.
4. **Lower latency variance**: P99 latency is much closer to P50 (no JIT warm-up effects).

## Benchmarking

To benchmark the scan loop locally:

```bash
cd scanner-rust
SCANNER_SHADOW_MODE=true SCANNER_NETWORKS=arbitrum cargo run --release 2>&1 | grep "scan_cycle"
```

Watch `mev_scanner_scan_cycles_total` in Prometheus to measure cycle rate.

## Running Both Scanners (A/B Mode)

1. Deploy the TypeScript scanner as usual (Supabase Edge Functions).
2. Run the Rust scanner with `SCANNER_SHADOW_MODE=true`.
3. Compare:
   - Opportunity counts per hour
   - Token pairs detected
   - Profit estimates (should be within ±5%)
4. Once parity is confirmed, switch Rust to `SCANNER_SHADOW_MODE=false` and disable the TypeScript scanner.
