# Phase 2A Results (Latency and Data Freshness)

Date: 2026-05-12
Run artifact (API): benchmark-results/api-latency-1778603672745.json
Run artifact (Subgraph): benchmark-results/subgraph-latency-arbitrum-1778603513149.json

## API Benchmark Summary

| Scanner | Success | Error Rate | Mean (ms) | P50 (ms) | P95 (ms) | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1inch | 15/20 | 25% | 633 | 319 | 2993 | Intermittent network fetch failures, fast median, heavy tail |
| CoW Swap | 20/20 | 0% | 3657 | 3417 | 6663 | Stable responses but very high latency |
| Uniswap v3 (Graph) | 20/20 | 0% | 389 | 453 | 545 | Low variance and stable latency |
| Osmosis | 20/20 | 0% | 1042 | 628 | 3738 | Moderate median with large tail spikes |

Source lines:
- 1inch summary: benchmark-results/api-latency-1778603672745.json (summary block)
- CoW summary: benchmark-results/api-latency-1778603672745.json (summary block)
- Uniswap v3 summary: benchmark-results/api-latency-1778603672745.json (summary block)
- Osmosis summary: benchmark-results/api-latency-1778603672745.json (summary block)

## Subgraph Benchmark Summary

Current status: no successful responses for configured Part A endpoints.

Observed causes:
- Uniswap gateway requests returned auth error: missing authorization header.
- SushiSwap and Curve endpoints returned network fetch failed in this environment.

Interpretation:
- Part A currently reflects connectivity and auth gaps, not true indexing lag.
- Part B API timings are valid and can be used for comparative latency analysis.

## What This Means For Our Scanner

1. Your scanner is strong on risk gating and execution controls, but external quote/source reliability and latency variance are now confirmed as practical bottlenecks.
2. CoW route quality may be useful, but direct quote latency is likely too slow for many short-window opportunities without precomputation or asynchronous prefetch.
3. 1inch and Uniswap data paths are currently the best latency baseline candidates for production-first routing.

## Priority Next Steps

1. Phase 2B implementation: fee and slippage accuracy benchmark against modeled vs observed outcomes.
2. Add authenticated Graph configuration for Part A (The Graph API key) and rerun subgraph indexing tests.
3. Add endpoint fallback rotation and per-endpoint health scoring to scanner ingestion.
4. Add percentile-aware route selection (penalize high P95/P99 even when P50 is fast).

## Repro Command

npm run phase2a:benchmark
