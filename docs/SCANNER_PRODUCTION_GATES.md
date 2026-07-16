# Scanner Production Gates

This document defines an enforceable go-live gate for the scanner based on Graph connectivity health.

## Purpose

Reduce production ambiguity by turning scanner readiness into objective pass/fail criteria.

## Runtime Gate Controls

Set these as Supabase Edge Function secrets (or in `supabase/.env.local` for local serve):

- `SCANNER_ENFORCE_READINESS_GATES`
- `SCANNER_MIN_GRAPH_SOURCES_HEALTHY`
- `SCANNER_MAX_GRAPH_FALLBACK_SOURCES`
- `SCANNER_ACTIVE_MIN_PERSISTENCE_OBSERVATIONS`
- `EXEC_MAX_QUOTE_AGE_MS`

Recommended starting values:

- `SCANNER_ENFORCE_READINESS_GATES=true` (after burn-in)
- `SCANNER_MIN_GRAPH_SOURCES_HEALTHY=3`
- `SCANNER_MAX_GRAPH_FALLBACK_SOURCES=2`
- `SCANNER_ACTIVE_MIN_PERSISTENCE_OBSERVATIONS=2`
- `EXEC_MAX_QUOTE_AGE_MS=90000`

## Gate Logic

Scanner readiness passes only when all conditions are true:

1. `THEGRAPH_API_KEY` is present
2. Healthy Graph sources >= `SCANNER_MIN_GRAPH_SOURCES_HEALTHY`
3. Fallback-used sources <= `SCANNER_MAX_GRAPH_FALLBACK_SOURCES`

If gates fail and enforcement is enabled, scanner returns HTTP 503 and no scan is executed.

## Runtime Audit Surface

Each live scanner response and persisted `scanner_runs.diagnostics` payload now includes:

- `readinessGates`
- `triggerReason`
- `sourceHardening.activeMinPersistenceObservations`
- `sourceHardening.persistenceRoutesObserved`

This makes gate state auditable for cron-triggered and manual scans.

## Rollback Procedure

1. Set `SCANNER_ENFORCE_READINESS_GATES=false` if upstream Graph reliability is the incident root cause.
2. If quote/execution parity is rejecting too aggressively, raise `EXEC_MAX_QUOTE_AGE_MS` temporarily and lower `SCANNER_ACTIVE_MIN_PERSISTENCE_OBSERVATIONS` to `1`.
3. Re-run `npm run scanner:readiness:full` and `node scripts/probe-scanner.mjs`.
4. Restore the stricter values after the upstream source outage is confirmed resolved.

## SLOs / Metrics to Monitor

- `readinessGates.pass` success rate
- `healthySources` and `fallbackSources` versus thresholds
- `execution_quote_parity_mismatch` and `execution_quote_stale` rejection counts
- `simulation_failed` / `simulation_reverted` rate
- scheduler `error_details.sourceFailureCounts`

## Operational Flow

1. During pre-production burn-in, keep `SCANNER_ENFORCE_READINESS_GATES=false`
2. Monitor test payload from `scan-arbitrage-opportunities` with `{ test: true }`
3. Validate stable gate pass rates for at least 24-48h
4. Enable `SCANNER_ENFORCE_READINESS_GATES=true`
5. Keep a rollback path: set the gate back to `false` if upstream outage is confirmed

## Ownership

- Connectivity/SLO owner: scanner platform maintainer
- Trading owner: execution policy maintainer
- Gate disable authority: on-call owner for scanner reliability
