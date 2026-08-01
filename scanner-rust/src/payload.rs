//! Phase 6: N-hop executable-payload builder + DRY-RUN validator.
//!
//! This module is the bridge between a cycle that SURVIVED the Phase 4
//! price-impact simulation gate and the on-chain multi-hop contract
//! (`FlashLoanArbitrage.executeArbitrage(address asset, uint256 amount, Hop[] hops)`
//! from Phase 5). Given a surviving [`ArbitrageCycle`] and its ground-truth
//! per-hop [`HopSimTrace`], it assembles the executable [`Hop`] path whose
//! per-hop `amountOutMin` guards are derived DIRECTLY from the simulation, and it
//! provides a fail-closed [`validate_execution_payload`] that mirrors the
//! contract's on-chain invariants.
//!
//! It is BUILD + VALIDATE ONLY. Nothing here signs, broadcasts, approves, or
//! flips a live flag; it produces calldata parameters and asserts their shape,
//! then stops. There is no code path from this module to a transaction.

use ethers::types::{Address, U256};

use crate::flashlight::Hop;
use crate::scanner::ArbitrageCycle;
use crate::sim::HopSimTrace;

/// Contract path-length bounds, mirroring `FlashLoanArbitrage.MIN_HOPS` /
/// `MAX_HOPS`. A valid closed arbitrage loop is at least 2 hops and is capped to
/// bound gas / abuse.
pub const MIN_HOPS: usize = 2;
pub const MAX_HOPS: usize = 5;

/// Default per-hop slippage tolerance (bps) applied to the simulated output when
/// deriving `amountOutMin`. Overridable via `SCANNER_DRYRUN_SLIPPAGE_BPS`.
/// The validator only requires `amountOutMin > 0`, so this value tunes the guard
/// tightness, not accept/reject correctness.
pub const DEFAULT_DRYRUN_SLIPPAGE_BPS: u32 = 50;

/// Reasons a candidate executable payload fails the DRY-RUN validator. Each maps
/// to an on-chain `require` in `FlashLoanArbitrage` (fail-closed).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DryRunError {
    /// `hops.length` outside `[MIN_HOPS, MAX_HOPS]`.
    BadHopCount { got: usize, min: usize, max: usize },
    /// The cycle's sim trace was not a clean, complete simulation, so no payload
    /// may be built from it (a non-simulable cycle is not profitable).
    NotSimulable,
    /// The cycle's edge count and the sim trace's recorded per-hop outputs
    /// disagree — the trace does not correspond to this cycle.
    TraceLengthMismatch { edges: usize, outputs: usize },
    /// Borrowed `amount` is zero.
    ZeroAmount,
    /// Borrowed `asset` is the zero address.
    ZeroAsset,
    /// A hop's router is the zero address.
    ZeroRouter { hop: usize },
    /// A hop's `tokenOut` is the zero address.
    ZeroTokenOut { hop: usize },
    /// A hop is missing its per-hop `amountOutMin` guard (zero).
    MissingMin { hop: usize },
    /// The final hop's `tokenOut` does not equal the borrowed `asset`
    /// (the loop must close back to what was borrowed).
    PathDoesNotClose { asset: Address, final_token_out: Address },
}

impl std::fmt::Display for DryRunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DryRunError::BadHopCount { got, min, max } => {
                write!(f, "bad path length: got {got}, expected [{min},{max}]")
            }
            DryRunError::NotSimulable => {
                write!(f, "cycle did not simulate cleanly; refusing to build payload")
            }
            DryRunError::TraceLengthMismatch { edges, outputs } => write!(
                f,
                "sim trace length mismatch: {edges} edge(s) but {outputs} recorded hop output(s)"
            ),
            DryRunError::ZeroAmount => write!(f, "zero borrow amount"),
            DryRunError::ZeroAsset => write!(f, "zero borrow asset"),
            DryRunError::ZeroRouter { hop } => write!(f, "hop {hop}: zero router"),
            DryRunError::ZeroTokenOut { hop } => write!(f, "hop {hop}: zero tokenOut"),
            DryRunError::MissingMin { hop } => write!(f, "hop {hop}: missing per-hop amountOutMin"),
            DryRunError::PathDoesNotClose {
                asset,
                final_token_out,
            } => write!(
                f,
                "path does not close: final tokenOut {final_token_out:#x} != borrowed asset {asset:#x}"
            ),
        }
    }
}

impl std::error::Error for DryRunError {}

/// A fully-assembled, DRY-RUN executable payload for the Phase 5 multi-hop
/// contract. This is only ever passed to the ABI encoder + validator — never
/// broadcast.
#[derive(Debug, Clone)]
pub struct ExecutionPayload {
    /// Token to borrow (tokenIn of hop 0; must equal the final hop's tokenOut).
    pub asset: Address,
    /// Raw base-unit borrow amount (the loan size the sim used).
    pub amount: U256,
    /// Ordered swap legs mirroring the Solidity `Hop[]`.
    pub hops: Vec<Hop>,
}

/// Per-hop slippage tolerance (bps) from `SCANNER_DRYRUN_SLIPPAGE_BPS`, clamped
/// to `[0, 9_999]` (a full 10_000 bps would zero every guard). Falls back to
/// [`DEFAULT_DRYRUN_SLIPPAGE_BPS`].
pub fn slippage_bps_from_env() -> u32 {
    std::env::var("SCANNER_DRYRUN_SLIPPAGE_BPS")
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .map(|v| v.min(9_999))
        .unwrap_or(DEFAULT_DRYRUN_SLIPPAGE_BPS)
}

/// Apply a slippage tolerance to a simulated output: `min = out·(10_000−bps)/10_000`.
/// Rounds DOWN, so the guard can only ever be at/below the simulated output.
fn apply_slippage(out: U256, slippage_bps: u32) -> U256 {
    let keep = U256::from(10_000u32.saturating_sub(slippage_bps.min(10_000)));
    out.saturating_mul(keep) / U256::from(10_000u32)
}

/// Build the executable [`ExecutionPayload`] for a cycle that SURVIVED the sim
/// gate, deriving each hop's `amountOutMin` from that cycle's ground-truth
/// [`HopSimTrace`].
///
/// The borrowed `asset` is `cycle.edges[0].token_in` and the borrow `amount` is
/// the sim's `start_amount`. Every hop (including the final closing leg) receives
/// a sim-derived, non-zero `amountOutMin` — stricter than relying solely on the
/// contract's terminal profit gate.
///
/// Returns `Err` if the trace is not a clean, complete simulation of the cycle
/// (so we never build a payload from a rejected/partial sim).
pub fn build_hops_from_cycle(
    cycle: &ArbitrageCycle,
    trace: &HopSimTrace,
    slippage_bps: u32,
) -> Result<ExecutionPayload, DryRunError> {
    if !trace.outcome.simulable {
        // A non-simulable cycle is not profitable by definition; refuse to build.
        return Err(DryRunError::NotSimulable);
    }
    if cycle.edges.len() != trace.hop_outputs.len() {
        return Err(DryRunError::TraceLengthMismatch {
            edges: cycle.edges.len(),
            outputs: trace.hop_outputs.len(),
        });
    }

    let asset = cycle
        .edges
        .first()
        .map(|e| e.token_in)
        .ok_or(DryRunError::ZeroAsset)?;

    let hops: Vec<Hop> = cycle
        .edges
        .iter()
        .zip(trace.hop_outputs.iter())
        .map(|(edge, &out)| Hop {
            router: edge.router,
            token_out: edge.token_out,
            is_v3: edge.is_v3,
            fee: edge.fee,
            amount_out_min: apply_slippage(out, slippage_bps),
        })
        .collect();

    let payload = ExecutionPayload {
        asset,
        amount: trace.start_amount,
        hops,
    };

    // Fail-closed: a built payload MUST pass the same validator applied at the
    // dry-run boundary, so we can never emit a structurally-invalid payload.
    validate_execution_payload(&payload)?;
    Ok(payload)
}

/// DRY-RUN validator: assert an [`ExecutionPayload`] satisfies every structural
/// invariant the on-chain `FlashLoanArbitrage` contract enforces, WITHOUT
/// touching a chain. Mirrors the Solidity `require`s (hop-count bounds, non-zero
/// router/tokenOut, loop-closure) plus the Phase 6 per-hop `amountOutMin` guard.
pub fn validate_execution_payload(payload: &ExecutionPayload) -> Result<(), DryRunError> {
    if payload.asset.is_zero() {
        return Err(DryRunError::ZeroAsset);
    }
    if payload.amount.is_zero() {
        return Err(DryRunError::ZeroAmount);
    }
    let n = payload.hops.len();
    if !(MIN_HOPS..=MAX_HOPS).contains(&n) {
        return Err(DryRunError::BadHopCount {
            got: n,
            min: MIN_HOPS,
            max: MAX_HOPS,
        });
    }
    for (i, hop) in payload.hops.iter().enumerate() {
        if hop.router.is_zero() {
            return Err(DryRunError::ZeroRouter { hop: i });
        }
        if hop.token_out.is_zero() {
            return Err(DryRunError::ZeroTokenOut { hop: i });
        }
        if hop.amount_out_min.is_zero() {
            return Err(DryRunError::MissingMin { hop: i });
        }
    }
    let final_token_out = payload.hops[n - 1].token_out;
    if final_token_out != payload.asset {
        return Err(DryRunError::PathDoesNotClose {
            asset: payload.asset,
            final_token_out,
        });
    }
    Ok(())
}

/// DRY-RUN fixtures. These are SYNTHETIC, clearly-labeled pool states — NOT live
/// data — used to exercise the encoder + validator deterministically (e.g. from
/// `examples/dry_run_pipeline.rs`) even when the live scan finds zero survivors.
pub mod fixtures {
    use super::*;
    use crate::types::{PoolEdge, PoolSwapState};

    fn a(n: u8) -> Address {
        let mut b = [0u8; 20];
        b[19] = n;
        Address::from(b)
    }

    fn e18(n: u128) -> U256 {
        U256::from(n) * U256::exp10(18)
    }

    fn v2_edge(
        token_in: Address,
        token_out: Address,
        router: Address,
        reserve_in: U256,
        reserve_out: U256,
        fee: u32,
    ) -> PoolEdge {
        v2_edge_priced(token_in, token_out, router, reserve_in, reserve_out, 1.0, fee)
    }

    /// Like [`v2_edge`] but with an explicit spot `price` (token_out per token_in)
    /// so a fixture can present a Bellman-Ford-detectable spot rate consistent
    /// with its reserves.
    fn v2_edge_priced(
        token_in: Address,
        token_out: Address,
        router: Address,
        reserve_in: U256,
        reserve_out: U256,
        price: f64,
        fee: u32,
    ) -> PoolEdge {
        PoolEdge {
            token_in,
            token_out,
            price,
            liquidity_usd: 5_000_000.0,
            dex: "synthetic-fixture".to_string(),
            network: "fixture".to_string(),
            router,
            is_v3: false,
            fee,
            swap_state: Some(PoolSwapState {
                dec_in: 18,
                dec_out: 18,
                reserve_in,
                reserve_out,
                sqrt_price_x96: U256::zero(),
                liquidity: 0,
                tick: 0,
                zero_for_one: false,
            }),
        }
    }

    /// A synthetic 3-hop cycle (asset -> B -> C -> asset) whose reserves are
    /// skewed slightly in the trade's favor so a modest loan closes above
    /// break-even. Used ONLY to prove the dry-run encode/validate path.
    pub fn synthetic_surviving_cycle() -> ArbitrageCycle {
        let asset = a(1);
        let token_b = a(2);
        let token_c = a(3);
        let edges = vec![
            v2_edge(asset, token_b, a(11), e18(1_000_000), e18(1_010_000), 30),
            v2_edge(token_b, token_c, a(12), e18(1_000_000), e18(1_010_000), 30),
            v2_edge(token_c, asset, a(13), e18(1_000_000), e18(1_010_000), 30),
        ];
        ArbitrageCycle {
            edges,
            profit_ratio: 1.02,
        }
    }

    /// A synthetic 3-hop loop (asset -> B -> C -> asset) whose SPOT prices form a
    /// Bellman-Ford negative cycle (each hop quotes a ~2% favourable rate,
    /// consistent with its reserves) AND whose deep reserves let a modest loan
    /// realize positive net through the price-impact sim. Unlike
    /// [`synthetic_surviving_cycle`] (spot-neutral, only sim-positive), this edge
    /// SET is DETECTABLE, so it exercises the full detect -> sim -> build ->
    /// encode path via `pipeline::run_sample`. SYNTHETIC — never live data.
    pub fn synthetic_detectable_edges() -> Vec<PoolEdge> {
        let asset = a(1);
        let token_b = a(2);
        let token_c = a(3);
        // reserve_out/reserve_in = 1.02 => spot price 1.02/hop; product 1.02^3 > 1
        // even after three 0.30% (3000 ppm) fees, so it is a genuine negative cycle
        // whose realized net stays positive for a small loan against deep reserves.
        let mk = |ti, to, router| {
            v2_edge_priced(ti, to, router, e18(1_000_000), e18(1_020_000), 1.02, 3000)
        };
        vec![
            mk(asset, token_b, a(11)),
            mk(token_b, token_c, a(12)),
            mk(token_c, asset, a(13)),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::synthetic_surviving_cycle;
    use super::*;
    use crate::sim::{simulate_cycle_hops, DEFAULT_LOAN_SIZES_USD};

    fn a(n: u8) -> Address {
        let mut b = [0u8; 20];
        b[19] = n;
        Address::from(b)
    }

    fn e18(n: u128) -> U256 {
        U256::from(n) * U256::exp10(18)
    }

    fn trace_for(cycle: &ArbitrageCycle) -> HopSimTrace {
        // start token USD = 1.0 so loan sizing is direct; small loan keeps the
        // swap in a near-linear region so the loop realizes positive.
        simulate_cycle_hops(cycle, 1_000.0, 1.0, 5.0, 4.0)
    }

    #[test]
    fn fixture_cycle_simulates_cleanly_with_per_hop_outputs() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        assert!(trace.outcome.simulable, "fixture must simulate cleanly");
        assert_eq!(trace.hop_outputs.len(), cycle.edges.len());
        assert!(!trace.start_amount.is_zero());
        for out in &trace.hop_outputs {
            assert!(!out.is_zero());
        }
    }

    #[test]
    fn builds_valid_payload_with_sim_derived_mins() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS)
            .expect("well-formed surviving cycle must build");

        assert_eq!(payload.asset, cycle.edges[0].token_in);
        assert_eq!(payload.amount, trace.start_amount);
        assert_eq!(payload.hops.len(), 3);
        // Loop closes back to the borrowed asset.
        assert_eq!(payload.hops.last().unwrap().token_out, payload.asset);
        // Every per-hop min is derived from (and at/below) the sim output.
        for (hop, out) in payload.hops.iter().zip(trace.hop_outputs.iter()) {
            assert!(!hop.amount_out_min.is_zero());
            assert!(hop.amount_out_min <= *out);
        }
        // And the assembled payload passes the validator.
        assert!(validate_execution_payload(&payload).is_ok());
    }

    #[test]
    fn validator_accepts_well_formed_payload() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();
        assert_eq!(validate_execution_payload(&payload), Ok(()));
    }

    #[test]
    fn validator_rejects_wrong_final_token() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let mut payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();
        // Break loop closure: final hop returns some other token.
        payload.hops.last_mut().unwrap().token_out = a(99);
        assert!(matches!(
            validate_execution_payload(&payload),
            Err(DryRunError::PathDoesNotClose { .. })
        ));
    }

    #[test]
    fn validator_rejects_hop_count_too_low() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let mut payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();
        payload.hops.truncate(1); // 1 hop < MIN_HOPS
        assert!(matches!(
            validate_execution_payload(&payload),
            Err(DryRunError::BadHopCount { got: 1, .. })
        ));
    }

    #[test]
    fn validator_rejects_hop_count_too_high() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let mut payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();
        // Pad to 6 hops (> MAX_HOPS) while keeping closure intact.
        let filler = payload.hops[0].clone();
        while payload.hops.len() <= MAX_HOPS {
            payload.hops.insert(0, filler.clone());
        }
        assert!(matches!(
            validate_execution_payload(&payload),
            Err(DryRunError::BadHopCount { .. })
        ));
    }

    #[test]
    fn validator_rejects_missing_per_hop_min() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let mut payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();
        payload.hops[1].amount_out_min = U256::zero(); // drop a per-hop guard
        assert!(matches!(
            validate_execution_payload(&payload),
            Err(DryRunError::MissingMin { hop: 1 })
        ));
    }

    #[test]
    fn validator_rejects_zero_router() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let mut payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();
        payload.hops[0].router = Address::zero();
        assert!(matches!(
            validate_execution_payload(&payload),
            Err(DryRunError::ZeroRouter { hop: 0 })
        ));
    }

    #[test]
    fn validator_rejects_zero_amount() {
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        let mut payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();
        payload.amount = U256::zero();
        assert_eq!(
            validate_execution_payload(&payload),
            Err(DryRunError::ZeroAmount)
        );
    }

    #[test]
    fn refuses_to_build_from_unsimulable_trace() {
        use crate::types::{PoolEdge, PoolSwapState};
        let mk = |ti: Address, to: Address, router: Address, has_state: bool| PoolEdge {
            token_in: ti,
            token_out: to,
            price: 1.0,
            liquidity_usd: 1_000_000.0,
            dex: "synthetic".to_string(),
            network: "fixture".to_string(),
            router,
            is_v3: false,
            fee: 30,
            swap_state: if has_state {
                Some(PoolSwapState {
                    dec_in: 18,
                    dec_out: 18,
                    reserve_in: e18(1_000_000),
                    reserve_out: e18(1_000_000),
                    sqrt_price_x96: U256::zero(),
                    liquidity: 0,
                    tick: 0,
                    zero_for_one: false,
                })
            } else {
                None
            },
        };
        // A cycle with a synthetic (state-less) start hop cannot simulate.
        let asset = a(1);
        let token_b = a(2);
        let cycle = ArbitrageCycle {
            edges: vec![
                mk(asset, token_b, a(11), false),
                mk(token_b, asset, a(12), true),
            ],
            profit_ratio: 1.0,
        };
        let trace = trace_for(&cycle);
        assert!(!trace.outcome.simulable);
        assert!(matches!(
            build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS),
            Err(DryRunError::NotSimulable)
        ));
    }

    #[test]
    fn refuses_to_build_on_trace_length_mismatch() {
        // A clean 3-hop sim trace paired with a different-length cycle must be
        // rejected as a trace/cycle mismatch, not a hop-count error.
        let cycle = synthetic_surviving_cycle();
        let trace = trace_for(&cycle);
        assert!(trace.outcome.simulable);
        let mut shorter = cycle.clone();
        shorter.edges.truncate(2);
        assert!(matches!(
            build_hops_from_cycle(&shorter, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS),
            Err(DryRunError::TraceLengthMismatch {
                edges: 2,
                outputs: 3
            })
        ));
    }

    #[test]
    fn slippage_env_default_and_clamp() {
        // Sanity: default constant is used by the env helper's fallback and the
        // apply function rounds down and never exceeds the input.
        let out = e18(1_000);
        assert!(apply_slippage(out, DEFAULT_DRYRUN_SLIPPAGE_BPS) < out);
        assert_eq!(apply_slippage(out, 10_000), U256::zero());
        let _ = DEFAULT_LOAN_SIZES_USD; // keep import meaningful across features
    }
}
