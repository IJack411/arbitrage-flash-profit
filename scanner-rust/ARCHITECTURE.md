# Architecture

## Components
- `config.rs`: environment-driven runtime configuration
- `scanner.rs`: pool graph construction and Bellman-Ford cycle detection
- `types.rs`: canonical JSON payloads shared with Supabase/TypeScript
- `simulator.rs`: local `revm` preflight simulation
- `executor.rs`: Flashbots bundle assembly and relay submission
- `telemetry.rs`: Prometheus counters/histograms and optional Supabase writes
- `flashlight.rs`: ABI encoding helpers for contract calls

## Flow
1. Load config and logging.
2. Fetch pool quotes.
3. Convert pools into weighted graph edges.
4. Detect negative cycles.
5. Build canonical opportunities.
6. Simulate active opportunities.
7. Submit execution bundles.
8. Emit metrics and telemetry.
