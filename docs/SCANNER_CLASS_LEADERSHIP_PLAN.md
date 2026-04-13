# Scanner Class Leadership Plan

## Goal
Evolve the scanner from profitable-opportunity detection to class-leading execution quality, resilience, and signal precision.

## Implemented Now
- Composite ranking for scan results in `scan-arbitrage-opportunities`:
  - Prioritizes opportunities using a weighted score combining:
    - Net profit normalized by per-network threshold
    - Confidence score
    - Liquidity depth
    - Slippage penalty
    - Watchlist distance-to-executable penalty
- Result: higher quality top-of-list opportunities and fewer unstable candidates bubbling to the top.

## Next 5 Upgrades (High Impact)
1. Adaptive Threshold Engine
- Replace static `minNetProfitUsd` with regime-aware thresholds using volatility and gas pressure.
- Inputs: rolling realized volatility, median gas by network, slippage distribution.

2. Source Reliability Weighting
- Track source quality scores for subgraph/fallback feeds and down-rank stale or noisy sources.
- Persist source health in telemetry and inject into opportunity ranking.

3. Multi-Horizon Signal Confirmation
- Require short-horizon and medium-horizon spread persistence before marking `active`.
- Reduces one-tick false positives.

4. Execution Risk Model v2
- Train a post-filter score from telemetry outcomes (`scanner_candidates` -> execution result).
- Add a predicted success probability to ranking and minimum pass threshold.

5. Precision Backtesting Harness
- Add replay tests over historical snapshots to measure precision/recall of scanner settings.
- Optimize for net executable profit, not just gross opportunity count.

## Metrics to Track Weekly
- Active-to-watchlist conversion rate
- Median predicted vs realized slippage gap
- % of top-5 opportunities that remain executable after 5/15/30s
- Net profit per executed trade after gas and route penalties
- False-positive rate by network and by DEX pair

## Rollout Pattern
1. Shadow mode: compute new score alongside old sorting.
2. Compare decision deltas and realized outcomes.
3. Promote new ranking to default after threshold validation.
4. Keep feature flag fallback for rapid rollback.
