# COMPLETION_PLAN.md

## Executive Summary

The scanner/executor parity foundation is mostly in place at the edge-function layer (canonical opportunity contract, parity validation, rejection reason taxonomy, and scheduler diagnostics). The main completion risk is now **integration drift between frontend live execution and the executor boundary contract**.

---

## 1) Repository Architecture Audit

### Scanner System (current state)
- **Primary entry point:** `supabase/functions/scan-arbitrage-opportunities/index.ts:6946`
- **Core responsibilities:** source ingestion, opportunity scoring/ranking, readiness gates, canonical payload construction, candidate persistence
- **Key dependencies:**
  - Shared parity contract: `supabase/functions/_shared/opportunity-contract.ts`
  - Subgraph + fallback feeds in scanner function
  - Supabase REST persistence to `scanner_runs` and `scanner_candidates`
- **Current state:** mature and feature-rich; emits `scanRunId`, `candidateId`, `quoteTimestamp`, `reasonCode`, and `executionPayload` for active candidates (`index.ts:7031-7091`, `6492-6505`)

### Executor System (current state)
- **Primary entry point:** `supabase/functions/flashbots-executor/index.ts:220`
- **Core responsibilities:** boundary validation, policy gating, simulation gating, Flashbots/base submission, telemetry persistence
- **Key dependencies:**
  - Shared parity validator: `validateOpportunityParity` from `supabase/functions/_shared/opportunity-contract.ts`
  - `ethers`, `@flashbots/ethers-provider-bundle`
  - Supabase REST persistence to `execution_attempts`
- **Current state:** enforces stale/parity checks and candidate boundary integrity before execution (`index.ts:324-398`)

### Integration Layer & Data Contracts
- **Canonical contract:** `supabase/functions/_shared/opportunity-contract.ts`
  - `CanonicalOpportunity`, `CanonicalExecutionPayload`, `QuoteParityPayload`
  - reason code taxonomy and parity validator
- **On-chain contract interface:** `contracts/contracts/FlashLoanArbitrage.sol:135-146` (`executeArbitrage` 10-arg signature)
- **Frontend execution bridge:** `src/lib/trading/executionService.ts`
  - invokes `flashbots-executor` with reduced opportunity object (`executionService.ts:612-629`)

### Tests, Coverage, and Gaps
- **Parity/math tests (pass):**
  - `tests/deterministic-math.spec.ts` (7 passed)
  - `tests/scanner-opportunity-contract.spec.ts` (5 passed)
- **Contract tests present:** `contracts/test/FlashLoanArbitrage.test.js`
- **Coverage gap:** no true end-to-end automated test from scanner response fixture → executor edge function request/acceptance path.

### TODO/FIXME/Incomplete Inventory
- No `TODO`/`FIXME` markers found in src/supabase/scripts/contracts/tests/docs.
- Known incomplete operational prerequisites (documented/runtime): deployment/funding/keys still external prerequisites.

---

## 2) Parity System Deep Dive (6-item verification)

Source checklist: `docs/SCANNER_ROLLOUT_PLAN.md:253-260`.

1. **Run parity tests** — ✅ confirmed (`npm run test:math`, `npx playwright test tests/scanner-opportunity-contract.spec.ts`).
2. **Probe scanner** — ⚠️ script exists (`scripts/probe-scanner.mjs`) but not run in this sandbox due external/env dependency.
3. **`readinessGates` in response + diagnostics** — ✅ scanner response and persisted diagnostics include readiness gates (`scan-arbitrage-opportunities/index.ts:6966-6977`, `7064-7071`).
4. **Deterministic `candidateId` + `scanRunId` + `quoteTimestamp` + `reasonCode`** — ✅ emitted and persisted (`index.ts:7031-7052`, `7075-7091`, `6492`).
5. **Executor rejects stale/parity-broken payloads** — ✅ via `validateOpportunityParity` + failure reason mapping (`flashbots-executor/index.ts:324-350`) and test coverage (`tests/scanner-opportunity-contract.spec.ts:29-145`).
6. **Scheduler logs `triggerReason` + `sourceFailureCounts`** — ✅ in cron scheduler log payload (`cron-scheduler-24-7/index.ts:145-153`).

---

## 3) Gap & Risk Assessment

### Critical blockers (end-to-end)
1. **Frontend → executor payload contract mismatch**
   - `executionService` submits a reduced `opportunity` lacking canonical boundary fields required by `validateOpportunityParity` (e.g., `scanRunId`, `candidateId`, `quoteTimestamp`, `status`, canonical reason code).
   - Evidence: submit shape at `src/lib/trading/executionService.ts:616-624` vs validator requirements in `supabase/functions/_shared/opportunity-contract.ts:263-269`.
   - Impact: high risk of immediate boundary rejection in live execution.

2. **Network support drift between frontend and executor policy**
   - Frontend marks `arbitrum` as supported (`executionService.ts:77`), executor allows only `ethereum` and `base` (`flashbots-executor/index.ts:401-403`).
   - Impact: avoidable runtime rejection and operator confusion.

### High-risk parity/edge mismatches
- Legacy scheduler function `scheduler-trigger` is minimal and does not surface parity diagnostics (`supabase/functions/scheduler-trigger/index.ts`), while `cron-scheduler-24-7` does.
- No automated E2E fixture proving scanner candidate can be consumed by executor without contract drift.

### Configuration/setup/dependency risks
- Live mode still depends on external prerequisites (mainnet contract deployment, funded wallet, relay/RPC secrets).
- Lint baseline currently fails due missing directory scan (`npm run lint` fails on missing `test-results` directory).

### Technical debt
- Duplicate/parallel execution contract types in frontend (`src/types/execution.ts` vs `src/lib/trading/executionService.ts`) increase drift risk.

---

## 4) Prioritized Action Plan

## CRITICAL (must fix first)
- [ ] **Align frontend executor request with canonical scanner opportunity contract**  
  Files: `src/lib/trading/executionService.ts`, `supabase/functions/_shared/opportunity-contract.ts`  
  Effort: **3-6h**  
  Rationale: removes primary live execution rejection path.

- [ ] **Resolve network support mismatch (`arbitrum`) between frontend and executor**  
  Files: `src/lib/trading/executionService.ts:77`, `:438`; `supabase/functions/flashbots-executor/index.ts:401-403`  
  Effort: **0.5-1h**  
  Rationale: prevents deterministic runtime failures.

## HIGH (quick wins, <2h each)
- [ ] **Add integration test fixture: scanner-candidate payload accepted by executor boundary validator**  
  Files: `tests/scanner-opportunity-contract.spec.ts` (or new adjacent spec)  
  Effort: **1-2h**

- [ ] **Unify scheduler pathway documentation to prefer `cron-scheduler-24-7` for parity observability**  
  Files: `docs/SCANNER_ROLLOUT_PLAN.md`, `docs/SCANNER_PRODUCTION_GATES.md`  
  Effort: **0.5-1h**

- [ ] **Fix lint baseline glob/path handling for absent output dirs**  
  Files: `eslint.config.js` (or ignore patterns)  
  Effort: **0.5-1.5h**

## MEDIUM (2-8h structural)
- [ ] **Consolidate canonical execution/opportunity typings into one shared TS module used by frontend + edge functions**  
  Files: `src/types/execution.ts`, `src/lib/trading/executionService.ts`, shared contract references  
  Effort: **4-8h**

- [ ] **Add scanner fixture replay harness for regression/parity checks across config variants**  
  Files: `tests/`, optional `scripts/` harness  
  Effort: **4-8h**

## LOW (technical debt)
- [ ] **Reduce duplicate scheduler wrappers and stale docs**  
  Files: `supabase/functions/scheduler-trigger/index.ts`, docs set  
  Effort: **2-4h**

- [ ] **Expand observability dashboards/queries for rejection taxonomy trends**  
  Files: docs + SQL/report scripts  
  Effort: **2-6h**

---

## 5) Starting Point Recommendation

### Best first action
**Fix frontend → executor canonical payload handoff** (`src/lib/trading/executionService.ts`).

### Step-by-step
1. Ensure submitted `opportunity` preserves scanner canonical fields (`scanRunId`, `candidateId`, `quoteTimestamp`, `status`, `reasonCode`, canonical `executionPayload`).
2. Remove/avoid lossy remapping in live submission path.
3. Add/adjust test fixture to validate boundary acceptance with real scanner-shaped payload.
4. Re-run parity tests and targeted execution-path tests.

### Success criteria
- Executor no longer rejects valid scanner-origin payloads with `execution_boundary_invalid` for missing contract fields.
- Live execution request contains canonical IDs/timestamps/reason code end-to-end.
- Parity tests pass and boundary regression test passes.

### Validation approach
- Local: `npm run test:math` + `npx playwright test tests/scanner-opportunity-contract.spec.ts`
- Optional integration smoke: invoke executor with a captured scanner candidate fixture.

---

## 6) Deliverables Status

- [x] Completion and repair analysis completed
- [x] Six-item parity verification completed with evidence
- [x] Risk and blocker assessment completed
- [x] Prioritized CRITICAL/HIGH/MEDIUM/LOW roadmap completed
- [x] Starting-point recommendation and validation criteria completed
- [x] `COMPLETION_PLAN.md` created
- [ ] Optional CRITICAL/HIGH code fixes (deferred; ready for implementation)

---

## Current Validation Snapshot

- CI workflow runs checked via GitHub Actions API: latest completed run successful; no failed jobs in latest completed run.
- Local checks:
  - `npm run test:math` ✅
  - `npx playwright test tests/scanner-opportunity-contract.spec.ts` ✅
  - `npm run build` ✅
  - `npm run lint` ⚠️ baseline failure (`ENOENT ... /test-results`) appears pre-existing environment/config issue.
