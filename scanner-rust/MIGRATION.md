# Migration Guide

## From TypeScript scanner logic
- Canonical payloads preserve camelCase serialization.
- Execution payload fields map directly to `FlashLoanArbitrage.executeArbitrage` arguments.
- Candidate IDs now use deterministic SHA-256 hashes.
- Local simulation is handled by `revm` instead of JS-based dry-runs.

## Rollout
1. Configure RPC URLs and contract addresses.
2. Validate canonical JSON against downstream Supabase consumers.
3. Run `cargo test` in CI.
4. Run scanner in dry-run mode first.
5. Enable live signing and Flashbots execution after key management review.
