# Arbitrage Flash Profit System — Completion & Repair Plan

## Scope
This document assesses the current scanner + executor system, verifies scanner→executor parity boundaries, and defines a prioritized completion/repair plan.

---

## 1) Current State Assessment

### Scanner System (status: **implemented, production-like, operationally gated**)

**Architecture & implementation evidence**
- Scanner edge function entrypoint and orchestration:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:6946`
- Canonical contract import and shared reason codes:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:8`
- Canonical execution payload build path:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:3603`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:3709`
- Active/watchlist output with reason codes + payload attachment:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:6471`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:6492`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:6504`
- Telemetry persistence (`scanner_runs`, `scanner_candidates`):
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:7055`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:7075`

**Test coverage evidence**
- Contract/parity helper tests exist:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/tests/scanner-opportunity-contract.spec.ts:16`
- Deterministic math tests exist:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/tests/deterministic-math.spec.ts`

### Executor System (status: **implemented, policy-gated, partially network-limited**)

**Architecture & implementation evidence**
- Executor edge function entrypoint:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:220`
- Shared boundary validation + reason code mapping:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:324`
- Canonical payload parsing to on-chain args:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:189`
- ABI signature aligned to smart contract:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:217`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/contracts/contracts/FlashLoanArbitrage.sol:135`
- Telemetry persistence (`execution_attempts`) and candidate boundary checks:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:20`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:376`

**Test coverage evidence**
- No dedicated tests found for `supabase/functions/flashbots-executor/index.ts` behavior.
- Contract tests cover Solidity-level guards and execution path shape:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/contracts/test/FlashLoanArbitrage.test.js:152`

### Integration points & data flow

1. Scanner produces canonical opportunities + execution payload (`executionPayload`) and persists candidate rows.
2. Clients/automation submit selected opportunity to executor:
   - Frontend service invocation:
     - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/src/lib/trading/executionService.ts:612`
   - Automation loop invocation:
     - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/scripts/auto-trade-loop.mjs:101`
3. Executor validates parity and candidate boundary, then submits Base tx or Ethereum Flashbots bundle.
4. Executor writes execution telemetry to `execution_attempts`.

### Known issues / incomplete implementation signals

- Runtime readiness blockers are explicitly documented in ops script output text (deployment/funding/keys/env):
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/scripts/observe-system.mjs:66`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/scripts/observe-system.mjs:69`
- Telemetry tables use permissive `FOR ALL USING (true)` RLS policies (security hardening debt):
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/migrations/006_create_scanner_telemetry_tables.sql:79`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/migrations/006_create_scanner_telemetry_tables.sql:85`

---

## 2) Parity Verification (scanner → executor)

## ✅ Aligned
- Shared contract and reason codes are centralized and reused in scanner + executor:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/_shared/opportunity-contract.ts:1`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/scan-arbitrage-opportunities/index.ts:8`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:3`
- `validateOpportunityParity` is enforced at execution boundary:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:324`
- Payload fields map to exact Solidity signature:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:570`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/contracts/contracts/FlashLoanArbitrage.sol:135`
- Parity/staleness mismatch tests exist:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/tests/scanner-opportunity-contract.spec.ts:29`

## ⚠️ Mismatches / inconsistencies

### 1. Network support parity mismatch (**critical blocker**)
- Frontend execution allows `arbitrum`:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/src/lib/trading/executionService.ts:77`
- Scanner/automation may scan/select `arbitrum`:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/scripts/auto-trade-loop.mjs:27`
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/cron-scheduler-24-7/index.ts:184`
- Executor rejects anything outside `ethereum` and `base`:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/supabase/functions/flashbots-executor/index.ts:401`

**Impact**: Opportunities can be surfaced and selected for networks that cannot execute, breaking end-to-end parity.

### 2. Type contract duplication/drift risk (**medium**) 
- Unused/parallel payload type in frontend:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/src/types/execution.ts:25`
- Different payload interface in execution service:
  - `/home/runner/work/arbitrage-flash-profit/arbitrage-flash-profit/src/lib/trading/executionService.ts:3`

**Impact**: Long-term schema drift risk between scanner payload and frontend typing.

### 3. Parity test scope gap (**medium**) 
- Existing parity tests focus on helper validation only.
- No integration tests asserting scanner output is accepted by executor handler across supported/unsupported networks.

---

## 3) Prioritized Action Plan

### Quick Wins (1–2h each)
1. **Align network filtering at source**
   - Ensure UI/auto-trade only submit opportunities for executor-supported networks (currently `ethereum`, `base`).
   - Success: no `unsupported_network` execution failures for scanner-selected trades.
2. **Add explicit executor network capability to scanner response metadata**
   - Include `executable: boolean` or `executorSupportedNetwork: boolean` in opportunity payload.
   - Success: clients can hide/disable unexecutable opportunities.
3. **Add focused parity test for unsupported network rejection contract**
   - Test expected failure path and reason code mapping.

### Blockers (must fix for reliable end-to-end)
1. **Scanner/executor network parity mismatch** (above) — prevents deterministic end-to-end functionality.
2. **No executor integration tests** for boundary + payload acceptance path.

### Medium-term (4–8h)
1. **Unify payload types into single source of truth**
   - Re-export from shared contract schema where possible.
2. **Add E2E scanner→executor contract test harness** (mock execution path).
3. **Harden telemetry access policies**
   - Replace permissive `Allow all access` policies with service-role/internal-only model.

### Long-term (technical debt/architecture)
1. **Formal schema versioning and compatibility tests** for scanner payloads.
2. **Network capability registry** consumed by scanner, UI, and executor to eliminate config drift.
3. **Execution replay/forensics toolkit** from `scanner_candidates` + `execution_attempts` linkage.

---

## 4) Starting Point Recommendation

## **Start with network parity alignment (scanner/client filtering vs executor support).**

**Why this first**
- It is the highest impact, lowest effort fix.
- It removes a direct runtime failure mode (`unsupported_network`) that breaks trust in “ready” opportunities.
- It unlocks meaningful executor telemetry by reducing avoidable rejects.

**Success criteria**
- Any surfaced “executable” opportunity is accepted by executor network gate.
- `execution_attempts.failure_reason = unsupported_network` drops to zero for normal scanner-driven execution.
- A regression test guards this contract.

**Estimated effort**: 1–2 hours.

---

## 5) Before/After Context (for first recommended action)

- **Before**:
  - Scanner/clients can produce/select `arbitrum` opportunities.
  - Executor rejects `arbitrum` with `Unsupported network for execution`.
- **After**:
  - Scanner/client selection and executor accepted networks are consistent.
  - Only executable networks are sent for live execution.

---

## 6) Progress Tracking Checklist

- [ ] Align scanner/client network filtering with executor-supported networks
- [ ] Add parity metadata flag for executability at scanner output boundary
- [ ] Add/extend tests for network parity and rejection reason paths
- [ ] Run lint/test/build and verify no regressions
- [ ] Harden telemetry RLS policies for production posture
- [ ] Consolidate payload typing to a single canonical schema source

---

## Validation snapshot captured during this assessment
- `npm run lint` (passes with existing warnings only)
- `npm run test:math` (pass)
- `npm run build` (pass)
