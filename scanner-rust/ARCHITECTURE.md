# Architecture

## Components
- `config.rs`: environment-driven runtime configuration (incl. `resolve_arbitrum_rpc_url`)
- `scanner.rs`: pool graph construction and fee-aware Bellman-Ford cycle detection
- `pools.rs`: live Arbitrum multi-DEX pool feed (Phase 3) + USD price map + block number
- `sim.rs`: Phase 4 analytic price-impact SIMULATION gate (V2 exact; V3 exact within-tick, boundary => reject)
- `payload.rs`: Phase 6 N-hop executable-payload builder + fail-closed DRY-RUN validator + synthetic fixtures
- `flashlight.rs`: ABI encoding for the Phase 5 `executeArbitrage(address,uint256,Hop[])` contract
- `pipeline.rs`: Phase 7 reusable end-to-end `run_sample` orchestration + honest metrics
- `types.rs`: canonical JSON payloads shared with Supabase/TypeScript
- `simulator.rs`: local `revm` preflight simulation
- `executor.rs`: Flashbots bundle assembly and relay submission (EXECUTION DISABLED)
- `telemetry.rs`: Prometheus counters/histograms and optional Supabase writes

## Multi-hop dry-run flow (Phases 1–7)
The multi-hop / triangular arbitrage pipeline is detection + simulation + payload
build ONLY — it never signs or broadcasts (execution stays disabled):
1. Fetch live Arbitrum pool state + USD prices + block (`pools.rs`).
2. Fee-aware Bellman-Ford proposes negative cycles on zero-impact spot prices (`scanner.rs`).
3. Price-impact SIM gate sweeps loan sizes and keeps only cycles whose REALIZED
   net (from the simulation, never the detector's guess) is positive (`sim.rs`).
4. For each survivor, build the `Hop[]` payload with sim-derived per-hop
   `amountOutMin` (`payload.rs::build_hops_from_cycle`).
5. Fail-closed DRY-RUN validate the payload (`payload.rs::validate_execution_payload`).
6. ABI-encode the `executeArbitrage` calldata (`flashlight.rs`) and STOP.

`pipeline.rs::run_sample` performs steps 2–6 over one already-fetched snapshot and
returns honest per-stage metrics. The capstone example
`examples/multi_hop_pipeline.rs` samples this across several live blocks plus an
always-on synthetic fixture; `tests/pipeline_integration_tests.rs` exercises it
deterministically with no RPC. See `README.md` for run commands.

## Legacy single-shot flow
1. Load config and logging.
2. Fetch pool quotes.
3. Convert pools into weighted graph edges.
4. Detect negative cycles.
5. Build canonical opportunities.
6. Simulate active opportunities.
7. Submit execution bundles.
8. Emit metrics and telemetry.

