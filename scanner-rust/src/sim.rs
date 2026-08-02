//! Phase 4: real sequential price-impact swap simulation gate.
//!
//! Bellman-Ford (`scanner.rs`) finds arbitrage cycles on **marginal / spot**
//! prices, i.e. it assumes a trade of *any* size executes at the zero-impact
//! rate. That is a mirage: every hop moves the pool it trades through, the impact
//! compounds around the loop, and a cycle that looks `+0.28%` at the margin is
//! almost always **negative** once a real loan size is actually pushed through.
//!
//! This module is the ground-truth **reject gate** that runs AFTER the detector.
//! Given a proposed [`ArbitrageCycle`] and a loan size, it SIMULATES executing
//! the actual swaps hop-by-hop against the REAL, current on-chain pool state
//! captured in each edge's [`PoolSwapState`]: each hop's true output (after price
//! impact + the pool's swap fee) becomes the next hop's input. The realized loop
//! output vs input yields the realized gross, from which the Aave premium and gas
//! are subtracted to get the realized NET. A cycle survives ONLY if its
//! *simulated* net is strictly positive (and at/above `min_net`). The surviving
//! number always comes from the simulation — never from the detector's guess.
//!
//! It is DETECTION / SIMULATION ONLY. Nothing here signs, broadcasts, approves,
//! or flips a live flag; it cannot send a transaction.
//!
//! ## Swap math fidelity
//! * **UniswapV2 / Sushi** — EXACT constant-product-with-fee:
//!   `out = (in·(1−fee)·reserve_out) / (reserve_in + in·(1−fee))`, using the real
//!   `getReserves()` reserves. Integer arithmetic, no drift.
//! * **Uniswap V3** — EXACT concentrated-liquidity swap math that walks the swap
//!   TICK-BY-TICK across initialized-tick boundaries, exactly as the real pool
//!   does (Uniswap `SwapMath.computeSwapStep` + `TickMath` + `TickBitmap` +
//!   `Tick.cross`), using the real `slot0().sqrtPriceX96`, in-range `liquidity()`,
//!   current `tick`, and — for the cross-tick walk — the initialized ticks and
//!   their `liquidityNet` fetched into [`PoolSwapState::cross_tick`]. At every
//!   initialized-tick crossing the in-range liquidity `L` is updated by the tick's
//!   `liquidityNet` (added moving up / `oneForZero`, subtracted moving down /
//!   `zeroForOne`), so a trade that spans multiple tick-spacing intervals produces
//!   an EXACT output instead of being rejected. All Q64.96 / 512-bit `mulDiv`
//!   math rounds conservatively (output DOWN, input UP).
//!
//!   The walk is BOUNDED and FAIL-CLOSED at the new frontier: if a swap would
//!   cross more initialized ticks than [`MAX_TICK_CROSSINGS`], leave the fetched
//!   tick window, hit zero in-range liquidity, use an unknown fee tier, or
//!   overflow, the hop is **REJECTED** (unsimulable) rather than extrapolated past
//!   verified state. When no cross-tick data is present (V2 pools, or a V3 state
//!   captured without it) the V3 path keeps the earlier behaviour: exact WITHIN
//!   the current tick-spacing interval, fail-closed on any boundary crossing. This
//!   always biases strictly toward rejecting; the gate never invents output beyond
//!   what it can prove.

use std::collections::HashMap;

use ethers::types::{Address, U256, U512};
use tracing::debug;

use crate::scanner::{compute_net_profit, ArbitrageCycle, NetProfitBreakdown};
use crate::types::PoolSwapState;

/// Default candidate loan sizes (USD) swept by [`simulate_cycle_best`]. Price
/// impact makes realized profit NON-monotonic in size, so we try several and keep
/// the best realized-net. Overridable via `SCANNER_SIM_LOAN_SIZES_USD` (a
/// comma-separated list, e.g. `"1000,5000,25000"`).
pub const DEFAULT_LOAN_SIZES_USD: [f64; 6] = [1_000.0, 5_000.0, 10_000.0, 25_000.0, 50_000.0, 100_000.0];

/// Default per-hop gas estimate (USD) when `SCANNER_SIM_GAS_USD_PER_HOP` is unset.
pub const DEFAULT_GAS_USD_PER_HOP: f64 = 4.0;

/// Outcome of simulating one cycle at one loan size.
#[derive(Debug, Clone)]
pub struct HopSimOutcome {
    /// The loan size (USD) this outcome was simulated at.
    pub loan_usd: f64,
    /// Realized round-trip output/input ratio from the sequential simulation
    /// (`1.0` == break-even before fixed costs). Comes ONLY from executed swaps.
    pub realized_ratio: f64,
    /// Full economic breakdown at `loan_usd` using the realized ratio.
    pub net: NetProfitBreakdown,
    /// Whether the cycle was fully simulable (every hop had usable state and no
    /// V3 hop exceeded its tick-spacing interval). A rejected/unsimulable cycle
    /// is NOT profitable by definition.
    pub simulable: bool,
    /// Human-readable reason the cycle was rejected/unsimulable, if any.
    pub reject_reason: Option<String>,
}

impl HopSimOutcome {
    /// A cycle survives the gate iff it simulated cleanly AND its realized net is
    /// strictly above `min_net_usd`.
    pub fn survives(&self, min_net_usd: f64) -> bool {
        self.simulable && self.net.net_profit_usd > min_net_usd
    }
}

/// Parse the loan-size sweep from `SCANNER_SIM_LOAN_SIZES_USD`, falling back to
/// [`DEFAULT_LOAN_SIZES_USD`]. Non-positive / unparseable entries are dropped.
pub fn loan_sizes_from_env() -> Vec<f64> {
    match std::env::var("SCANNER_SIM_LOAN_SIZES_USD") {
        Ok(raw) => {
            let parsed: Vec<f64> = raw
                .split(',')
                .filter_map(|s| s.trim().parse::<f64>().ok())
                .filter(|v| v.is_finite() && *v > 0.0)
                .collect();
            if parsed.is_empty() {
                DEFAULT_LOAN_SIZES_USD.to_vec()
            } else {
                parsed
            }
        }
        Err(_) => DEFAULT_LOAN_SIZES_USD.to_vec(),
    }
}

/// Per-hop gas estimate (USD) from `SCANNER_SIM_GAS_USD_PER_HOP`, else default.
pub fn gas_usd_per_hop_from_env() -> f64 {
    std::env::var("SCANNER_SIM_GAS_USD_PER_HOP")
        .ok()
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v >= 0.0)
        .unwrap_or(DEFAULT_GAS_USD_PER_HOP)
}

/// Sweep several loan sizes and return the outcome with the best realized net.
///
/// `start_token_usd` is the USD price of the cycle's start token (`edges[0]
/// .token_in`), used only to size a USD loan into raw base units — the profit
/// RATIO itself is unit-less (start token in vs start token out). Gas is scaled
/// by the number of hops. Returns `None` only if the cycle is structurally
/// unusable (empty, or missing start-token state).
pub fn simulate_cycle_best(
    cycle: &ArbitrageCycle,
    start_token_usd: f64,
    aave_premium_bps: f64,
    loan_sizes_usd: &[f64],
    gas_usd_per_hop: f64,
) -> Option<HopSimOutcome> {
    if cycle.edges.is_empty() {
        return None;
    }
    let hops = cycle.edges.len() as f64;
    let gas_usd = gas_usd_per_hop * hops;

    let mut best: Option<HopSimOutcome> = None;
    for &loan_usd in loan_sizes_usd {
        let outcome = simulate_cycle(cycle, loan_usd, start_token_usd, aave_premium_bps, gas_usd);
        let replace = match &best {
            None => true,
            Some(b) => outcome.net.net_profit_usd > b.net.net_profit_usd,
        };
        if replace {
            best = Some(outcome);
        }
    }
    best
}

/// Full per-hop trace of simulating one cycle at one loan size. Carries the raw
/// input the loop started with and each hop's raw output (so a caller can derive
/// per-hop `amountOutMin` guards from the ground-truth simulation), plus the
/// economic [`HopSimOutcome`]. On any reject, `hop_outputs` holds only the hops
/// that simulated cleanly before the failure and `outcome.simulable == false`.
#[derive(Debug, Clone)]
pub struct HopSimTrace {
    /// Raw base-unit amount fed into hop 0 (the borrowed asset / loan size).
    pub start_amount: U256,
    /// Raw base-unit output of each successfully simulated hop, in order. The
    /// last entry (when the whole loop simulated) is the final loop output,
    /// denominated back in the start token.
    pub hop_outputs: Vec<U256>,
    /// Economic outcome derived from the realized loop ratio.
    pub outcome: HopSimOutcome,
}

/// Simulate one cycle at one loan size against the real captured pool state.
pub fn simulate_cycle(
    cycle: &ArbitrageCycle,
    loan_usd: f64,
    start_token_usd: f64,
    aave_premium_bps: f64,
    gas_cost_usd: f64,
) -> HopSimOutcome {
    simulate_cycle_hops(cycle, loan_usd, start_token_usd, aave_premium_bps, gas_cost_usd).outcome
}

/// Simulate one cycle at one loan size and return the full per-hop [`HopSimTrace`].
///
/// This is the ground-truth executor: the realized ratio (and therefore the
/// surviving net) comes ONLY from the executed swaps, and the per-hop outputs it
/// records are what Phase 6's payload builder turns into per-hop `amountOutMin`
/// guards. It is SIMULATION ONLY — nothing here signs or broadcasts.
pub fn simulate_cycle_hops(
    cycle: &ArbitrageCycle,
    loan_usd: f64,
    start_token_usd: f64,
    aave_premium_bps: f64,
    gas_cost_usd: f64,
) -> HopSimTrace {
    let reject = |start: U256, outputs: Vec<U256>, reason: String| HopSimTrace {
        start_amount: start,
        hop_outputs: outputs,
        outcome: HopSimOutcome {
            loan_usd,
            realized_ratio: 0.0,
            net: compute_net_profit(0.0, loan_usd, aave_premium_bps, gas_cost_usd),
            simulable: false,
            reject_reason: Some(reason),
        },
    };

    let Some(first) = cycle.edges.first() else {
        return reject(U256::zero(), Vec::new(), "empty cycle".to_string());
    };
    let Some(first_state) = first.swap_state.as_ref() else {
        return reject(
            U256::zero(),
            Vec::new(),
            "start hop has no on-chain swap state (synthetic pool)".to_string(),
        );
    };
    if !(start_token_usd.is_finite() && start_token_usd > 0.0) {
        return reject(
            U256::zero(),
            Vec::new(),
            format!("no USD price for start token {:#x}", first.token_in),
        );
    }

    // Size the USD loan into the start token's raw base units.
    let dec_in = first_state.dec_in;
    let amount_in_human = loan_usd / start_token_usd;
    let Some(mut amount) = human_to_raw(amount_in_human, dec_in) else {
        return reject(
            U256::zero(),
            Vec::new(),
            "loan size overflows start-token base units".to_string(),
        );
    };
    if amount.is_zero() {
        return reject(
            U256::zero(),
            Vec::new(),
            "loan rounds to zero start-token base units".to_string(),
        );
    }
    let start_amount = amount;
    let mut hop_outputs: Vec<U256> = Vec::with_capacity(cycle.edges.len());

    // Execute each hop sequentially; each output feeds the next input.
    for (i, edge) in cycle.edges.iter().enumerate() {
        let Some(state) = edge.swap_state.as_ref() else {
            return reject(
                start_amount,
                hop_outputs,
                format!("hop {i} ({}) has no on-chain swap state", edge.dex),
            );
        };
        let out = if edge.is_v3 {
            v3_amount_out(state, amount, edge.fee)
        } else {
            v2_amount_out(amount, state.reserve_in, state.reserve_out, edge.fee)
        };
        match out {
            Some(o) if !o.is_zero() => {
                amount = o;
                hop_outputs.push(o);
            }
            Some(_) => {
                return reject(
                    start_amount,
                    hop_outputs,
                    format!("hop {i} ({}) produced zero output", edge.dex),
                )
            }
            None => {
                return reject(
                    start_amount,
                    hop_outputs,
                    format!(
                        "hop {i} ({}) unsimulable/rejected (V3 tick-interval exceeded or overflow)",
                        edge.dex
                    ),
                )
            }
        }
    }

    // Realized loop ratio = start-token out / start-token in (unit-less).
    let realized_ratio = ratio_f64(amount, start_amount);
    let net = compute_net_profit(realized_ratio, loan_usd, aave_premium_bps, gas_cost_usd);
    debug!(
        "sim cycle hops={} loan=${:.0} realized_ratio={:.8} net=${:.2}",
        cycle.edges.len(),
        loan_usd,
        realized_ratio,
        net.net_profit_usd
    );
    HopSimTrace {
        start_amount,
        hop_outputs,
        outcome: HopSimOutcome {
            loan_usd,
            realized_ratio,
            net,
            simulable: true,
            reject_reason: None,
        },
    }
}

// ---------------------------------------------------------------------------
// UniswapV2 constant-product-with-fee (EXACT)
// ---------------------------------------------------------------------------

/// Exact UniswapV2/Sushi output: `out = (in·(1−fee)·R_out)/(R_in + in·(1−fee))`.
/// Returns `None` on empty reserves or arithmetic overflow (fail toward reject).
pub fn v2_amount_out(
    amount_in: U256,
    reserve_in: U256,
    reserve_out: U256,
    fee_ppm: u32,
) -> Option<U256> {
    if amount_in.is_zero() || reserve_in.is_zero() || reserve_out.is_zero() {
        return None;
    }
    let fee_num = U256::from(1_000_000u32.checked_sub(fee_ppm)?);
    // Use 512-bit intermediates so large loans against deep pools can't overflow.
    let amount_in_with_fee = to512(amount_in) * to512(fee_num);
    let numerator = amount_in_with_fee * to512(reserve_out);
    let denominator = to512(reserve_in) * to512(U256::from(1_000_000u32)) + amount_in_with_fee;
    if denominator.is_zero() {
        return None;
    }
    from512(numerator / denominator)
}

// ---------------------------------------------------------------------------
// Uniswap V3 concentrated-liquidity — FULL cross-tick swap simulation (Phase 8)
// ---------------------------------------------------------------------------

/// Maximum number of initialized ticks a single V3 hop may cross before the
/// simulator FAILS CLOSED (returns `None` => `unsimulable`). A swap that would
/// cross more boundaries than this is refused rather than walked across an
/// unbounded (and unfetched) portion of the curve — the anti-mirage discipline
/// applied at the cross-tick frontier. Crossing this many ticks also implies very
/// large price impact, so such a trade is essentially never the profitable size.
pub const MAX_TICK_CROSSINGS: u32 = 512;

/// Exact Uniswap V3 output for `amount_in` of the hop's input token, walking the
/// swap TICK-BY-TICK across initialized-tick boundaries exactly as the real pool
/// does (Uniswap `SwapMath.computeSwapStep` + `Tick.cross` + `TickBitmap`).
///
/// * With [`PoolSwapState::cross_tick`] data present, the swap may cross
///   initialized ticks: at each crossing the in-range liquidity `L` is updated by
///   the tick's `liquidityNet` (added moving up / `oneForZero`, subtracted moving
///   down / `zeroForOne`), so a multi-interval trade produces an EXACT output.
/// * Without cross-tick data it behaves exactly as before: exact WITHIN the
///   current tick-spacing interval, and FAIL-CLOSED (`None`) if the trade would
///   leave that interval.
///
/// Every rounding choice is conservative (output DOWN, input UP), and the walk is
/// bounded: exceeding [`MAX_TICK_CROSSINGS`], leaving the fetched tick window,
/// hitting zero in-range liquidity with input remaining, an unknown fee tier, or
/// any overflow all return `None` (unsimulable) rather than extrapolate.
pub fn v3_amount_out(state: &PoolSwapState, amount_in: U256, fee_ppm: u32) -> Option<U256> {
    if amount_in.is_zero() || state.liquidity == 0 || state.sqrt_price_x96.is_zero() {
        return None;
    }
    // Unknown fee tier => unknown tick spacing => cannot locate tick boundaries.
    let spacing = tick_spacing(fee_ppm)?;

    // The window of ticks we may traverse. With fetched cross-tick data this is
    // the range that data is COMPLETE over; without it, we trust only the current
    // tick-spacing interval (any crossing beyond it fails closed, as in Phase 4).
    let (window_lo, window_hi) = match &state.cross_tick {
        Some(ct) => ct.window,
        None => interval_bounds(state.tick, spacing),
    };
    // A sane window must contain the current tick, else the captured state is bogus.
    if window_lo > window_hi || state.tick < window_lo || state.tick > window_hi {
        return None;
    }

    let mut liquidity = state.liquidity;
    let mut sqrt_cur = state.sqrt_price_x96;
    let mut current_tick = state.tick;
    let mut remaining = amount_in;
    let mut total_out = U256::zero();
    let mut crossings: u32 = 0;

    while !remaining.is_zero() {
        // No in-range liquidity to price against and input still remains: refuse
        // to walk a liquidity gap we cannot quote across (fail closed).
        if liquidity == 0 {
            return None;
        }

        let (mut tick_next, mut initialized) =
            next_initialized_tick_within_one_word(current_tick, spacing, state.zero_for_one, state);

        // Clamp the step target to the fetched window. Reaching this clamped edge
        // with input still remaining means the swap would leave verified state, so
        // we FAIL CLOSED rather than extrapolate past what we fetched.
        let at_window_edge = if state.zero_for_one {
            if tick_next <= window_lo {
                tick_next = window_lo;
                initialized = false;
                true
            } else {
                false
            }
        } else if tick_next >= window_hi {
            tick_next = window_hi;
            initialized = false;
            true
        } else {
            false
        };

        let target_sqrt = get_sqrt_ratio_at_tick(tick_next)?;
        let step = compute_swap_step(sqrt_cur, target_sqrt, liquidity, remaining, fee_ppm)?;

        // Consume input (swap amount + fee) and accumulate output (rounded DOWN).
        let consumed = step.amount_in.checked_add(step.fee_amount)?;
        remaining = remaining.checked_sub(consumed)?;
        total_out = total_out.checked_add(step.amount_out)?;
        sqrt_cur = step.sqrt_next;

        if sqrt_cur == target_sqrt {
            // Reached the target tick / window edge exactly.
            if at_window_edge {
                if !remaining.is_zero() {
                    return None; // would leave the fetched window with input left
                }
                break; // consumed exactly at the verified edge — done, exact
            }
            if initialized {
                crossings += 1;
                if crossings > MAX_TICK_CROSSINGS {
                    return None;
                }
                let net = tick_liquidity_net(state, tick_next)?;
                liquidity = apply_liquidity_net(liquidity, net, state.zero_for_one)?;
            }
            current_tick = if state.zero_for_one { tick_next - 1 } else { tick_next };
        } else {
            // All input consumed within this constant-liquidity region — done.
            break;
        }
    }

    if total_out.is_zero() {
        return None;
    }
    Some(total_out)
}

/// Uniswap `getNextSqrtPriceFromAmount0RoundingUp` (add=true): selling token0,
/// price moves DOWN. `sqrtQ = (L·2^96·sqrtP) / (L·2^96 + amount·sqrtP)`, round up.
fn next_sqrt_from_amount0_in(sqrt_p: U256, liquidity: U256, amount: U256) -> Option<U256> {
    if amount.is_zero() {
        return Some(sqrt_p);
    }
    let q96 = U512::one() << 96u32;
    let numerator1 = to512(liquidity) * q96; // L << 96
    let product = to512(amount) * to512(sqrt_p);
    let denominator = numerator1 + product;
    if denominator.is_zero() {
        return None;
    }
    let numerator = numerator1 * to512(sqrt_p);
    let mut q = numerator / denominator;
    if numerator % denominator != U512::zero() {
        q += U512::one(); // round up
    }
    from512(q)
}

/// Uniswap `getNextSqrtPriceFromAmount1RoundingDown` (add=true): selling token1,
/// price moves UP. `sqrtQ = sqrtP + (amount·2^96)/L`, quotient rounded down.
fn next_sqrt_from_amount1_in(sqrt_p: U256, liquidity: U256, amount: U256) -> Option<U256> {
    if liquidity.is_zero() {
        return None;
    }
    let q96 = U512::one() << 96u32;
    let quotient = (to512(amount) * q96) / to512(liquidity);
    from512(to512(sqrt_p) + quotient)
}

/// Uniswap `getNextSqrtPriceFromInput`: next sqrt price after an exact-input
/// amount in the given direction (round toward a conservative next price).
fn next_sqrt_from_input(
    sqrt_p: U256,
    liquidity: U256,
    amount_in: U256,
    zero_for_one: bool,
) -> Option<U256> {
    if zero_for_one {
        next_sqrt_from_amount0_in(sqrt_p, liquidity, amount_in)
    } else {
        next_sqrt_from_amount1_in(sqrt_p, liquidity, amount_in)
    }
}

/// `mulDiv(a, b, denom)` in 512-bit, rounded DOWN. `None` on zero denom / overflow.
fn mul_div(a: U256, b: U256, denom: U256) -> Option<U256> {
    if denom.is_zero() {
        return None;
    }
    from512(to512(a) * to512(b) / to512(denom))
}

/// `mulDivRoundingUp(a, b, denom)` in 512-bit. `None` on zero denom / overflow.
fn mul_div_rounding_up(a: U256, b: U256, denom: U256) -> Option<U256> {
    if denom.is_zero() {
        return None;
    }
    let num = to512(a) * to512(b);
    let d = to512(denom);
    let mut q = num / d;
    if num % d != U512::zero() {
        q += U512::one();
    }
    from512(q)
}

/// Uniswap `SqrtPriceMath.getAmount0Delta` with explicit rounding. `roundUp` is
/// used for amount-IN (bias the pool's favour), `false` for amount-OUT.
fn get_amount0_delta(sqrt_a: U256, sqrt_b: U256, liquidity: U256, round_up: bool) -> Option<U256> {
    let (a, b) = if sqrt_a > sqrt_b { (sqrt_b, sqrt_a) } else { (sqrt_a, sqrt_b) };
    if a.is_zero() {
        return None;
    }
    let q96 = U512::one() << 96u32;
    let numerator1 = to512(liquidity) * q96; // L << 96
    let numerator2 = to512(b) - to512(a);
    if round_up {
        // divRoundingUp(mulDivRoundingUp(numerator1, numerator2, b), a)
        let n = numerator1 * numerator2;
        let db = to512(b);
        let mut inner = n / db;
        if n % db != U512::zero() {
            inner += U512::one();
        }
        let da = to512(a);
        let mut q = inner / da;
        if inner % da != U512::zero() {
            q += U512::one();
        }
        from512(q)
    } else {
        let t = (numerator1 * numerator2) / to512(b);
        from512(t / to512(a))
    }
}

/// Uniswap `SqrtPriceMath.getAmount1Delta` with explicit rounding.
fn get_amount1_delta(sqrt_a: U256, sqrt_b: U256, liquidity: U256, round_up: bool) -> Option<U256> {
    let (a, b) = if sqrt_a > sqrt_b { (sqrt_b, sqrt_a) } else { (sqrt_a, sqrt_b) };
    let q96 = U512::one() << 96u32;
    let num = to512(liquidity) * (to512(b) - to512(a));
    if round_up {
        let mut q = num / q96;
        if num % q96 != U512::zero() {
            q += U512::one();
        }
        from512(q)
    } else {
        from512(num / q96)
    }
}

/// One Uniswap `SwapMath.computeSwapStep` result (exact-input): the next sqrt
/// price, the swap input consumed (excl. fee), the output produced, and the fee.
struct SwapStep {
    sqrt_next: U256,
    amount_in: U256,
    amount_out: U256,
    fee_amount: U256,
}

/// Uniswap `SwapMath.computeSwapStep` for the exact-INPUT case: swap from
/// `sqrt_cur` toward `sqrt_target` bounded by `amount_remaining` (which INCLUDES
/// the fee). Input is rounded UP and output DOWN, matching the pool. `None` on any
/// overflow / degenerate fee.
fn compute_swap_step(
    sqrt_cur: U256,
    sqrt_target: U256,
    liquidity: u128,
    amount_remaining: U256,
    fee_ppm: u32,
) -> Option<SwapStep> {
    let zero_for_one = sqrt_cur >= sqrt_target;
    let l = U256::from(liquidity);
    let million = U256::from(1_000_000u32);
    let fee = U256::from(fee_ppm);
    let fee_complement = million.checked_sub(fee)?; // (1e6 - fee); guards huge fee

    // amountRemainingLessFee = mulDiv(amountRemaining, 1e6 - fee, 1e6) (round DOWN).
    let amount_remaining_less_fee = mul_div(amount_remaining, fee_complement, million)?;

    // amountIn required to move all the way to the target (round UP).
    let mut amount_in = if zero_for_one {
        get_amount0_delta(sqrt_target, sqrt_cur, l, true)?
    } else {
        get_amount1_delta(sqrt_cur, sqrt_target, l, true)?
    };

    let sqrt_next = if amount_remaining_less_fee >= amount_in {
        sqrt_target // enough input to reach the boundary
    } else {
        next_sqrt_from_input(sqrt_cur, l, amount_remaining_less_fee, zero_for_one)?
    };

    let is_max = sqrt_next == sqrt_target;

    let amount_out;
    if zero_for_one {
        if !is_max {
            amount_in = get_amount0_delta(sqrt_next, sqrt_cur, l, true)?;
        }
        amount_out = get_amount1_delta(sqrt_next, sqrt_cur, l, false)?;
    } else {
        if !is_max {
            amount_in = get_amount1_delta(sqrt_cur, sqrt_next, l, true)?;
        }
        amount_out = get_amount0_delta(sqrt_cur, sqrt_next, l, false)?;
    }

    // Fee: if we didn't reach the target, the whole remaining-minus-swapped is the
    // fee; otherwise the exact fee on the swapped input (rounded UP).
    let fee_amount = if !is_max {
        amount_remaining.checked_sub(amount_in)?
    } else {
        mul_div_rounding_up(amount_in, fee, fee_complement)?
    };

    Some(SwapStep { sqrt_next, amount_in, amount_out, fee_amount })
}

/// Uniswap `TickMath.getSqrtRatioAtTick`: the EXACT Q64.96 sqrt price at `tick`
/// via the canonical fixed-point magic-constant expansion (no floating point).
/// `None` for a tick outside `[MIN_TICK, MAX_TICK]` or on overflow.
fn get_sqrt_ratio_at_tick(tick: i32) -> Option<U256> {
    const MIN_TICK: i32 = -887272;
    const MAX_TICK: i32 = 887272;
    if !(MIN_TICK..=MAX_TICK).contains(&tick) {
        return None;
    }
    let abs_tick = tick.unsigned_abs();

    // `ratio` is a Q128.128 fixed-point number held in a U512 so the intermediate
    // `ratio * magic` (up to ~2^257) cannot overflow before the `>> 128`.
    let m = |v: u128| to512(U256::from(v));
    let mut ratio: U512 = if abs_tick & 0x1 != 0 {
        m(0xfffcb933bd6fad37aa2d162d1a594001)
    } else {
        U512::one() << 128u32
    };
    let magics: [(u32, u128); 19] = [
        (0x2, 0xfff97272373d413259a46990580e213a),
        (0x4, 0xfff2e50f5f656932ef12357cf3c7fdcc),
        (0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0),
        (0x10, 0xffcb9843d60f6159c9db58835c926644),
        (0x20, 0xff973b41fa98c081472e6896dfb254c0),
        (0x40, 0xff2ea16466c96a3843ec78b326b52861),
        (0x80, 0xfe5dee046a99a2a811c461f1969c3053),
        (0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4),
        (0x200, 0xf987a7253ac413176f2b074cf7815e54),
        (0x400, 0xf3392b0822b70005940c7a398e4b70f3),
        (0x800, 0xe7159475a2c29b7443b29c7fa6e889d9),
        (0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825),
        (0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5),
        (0x4000, 0x70d869a156d2a1b890bb3df62baf32f7),
        (0x8000, 0x31be135f97d08fd981231505542fcfa6),
        (0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9),
        (0x20000, 0x5d6af8dedb81196699c329225ee604),
        (0x40000, 0x2216e584f5fa1ea926041bedfe98),
        (0x80000, 0x48a170391f7dc42444e8fa2),
    ];
    for (bit, mag) in magics {
        if abs_tick & bit != 0 {
            ratio = (ratio * m(mag)) >> 128u32;
        }
    }

    if tick > 0 {
        // type(uint256).max / ratio
        let u256_max: U512 = (U512::one() << 256u32) - U512::one();
        ratio = u256_max / ratio;
    }

    // Q128.128 -> Q128.96 (sqrtPriceX96), rounding UP.
    let shifted = ratio >> 32u32;
    let rem = ratio % (U512::one() << 32u32);
    let sqrt = if rem.is_zero() { shifted } else { shifted + U512::one() };
    from512(sqrt)
}

/// `(wordPos, bitPos)` of a compressed tick, matching Uniswap `TickBitmap.position`
/// (`wordPos = compressed >> 8`, `bitPos = compressed % 256`) using Euclidean
/// division so negative compressed ticks map correctly (`bitPos` in `0..=255`).
fn position(compressed: i32) -> (i32, u8) {
    (compressed.div_euclid(256), compressed.rem_euclid(256) as u8)
}

/// Uniswap `TickBitmap.nextInitializedTickWithinOneWord`: the next initialized
/// tick in the direction of travel, searched WITHIN the current bitmap word, or
/// that word's boundary tick (uninitialized) if none. Faithfully reproduces the
/// per-word stepping so cross-tick output matches the pool exactly (incl. the
/// per-word rounding of amounts). The initialized-tick set comes from the hop's
/// [`PoolSwapState::cross_tick`] (empty when none was fetched).
fn next_initialized_tick_within_one_word(
    tick: i32,
    spacing: i32,
    zero_for_one: bool,
    state: &PoolSwapState,
) -> (i32, bool) {
    let ticks: &[crate::types::V3Tick] = match &state.cross_tick {
        Some(ct) => &ct.ticks,
        None => &[],
    };
    let compressed = tick.div_euclid(spacing);
    if zero_for_one {
        // lte search: greatest initialized tick in [word_low, current] (incl. current).
        let (word_pos, bit_pos) = position(compressed);
        let mut best: Option<i32> = None;
        for t in ticks {
            let c = t.index.div_euclid(spacing);
            let (wp, bp) = position(c);
            if wp == word_pos && bp <= bit_pos && best.is_none_or(|b| c > b) {
                best = Some(c);
            }
        }
        match best {
            Some(c) => (c * spacing, true),
            None => ((compressed - bit_pos as i32) * spacing, false),
        }
    } else {
        // gt search from (compressed + 1): least initialized tick in that word.
        let compressed1 = compressed + 1;
        let (word_pos, bit_pos) = position(compressed1);
        let mut best: Option<i32> = None;
        for t in ticks {
            let c = t.index.div_euclid(spacing);
            let (wp, bp) = position(c);
            if wp == word_pos && bp >= bit_pos && best.is_none_or(|b| c < b) {
                best = Some(c);
            }
        }
        match best {
            Some(c) => (c * spacing, true),
            None => ((compressed1 + (255 - bit_pos as i32)) * spacing, false),
        }
    }
}

/// The `liquidityNet` of an initialized tick from the hop's fetched cross-tick
/// data, or `None` (fail closed) if it is missing.
fn tick_liquidity_net(state: &PoolSwapState, index: i32) -> Option<i128> {
    let ct = state.cross_tick.as_ref()?;
    ct.ticks.iter().find(|t| t.index == index).map(|t| t.liquidity_net)
}

/// Uniswap `LiquidityMath.addDelta`: `x + y` where `y` may be negative, checked to
/// stay within `u128`. `None` on under/overflow (fail closed).
fn add_delta(x: u128, y: i128) -> Option<u128> {
    if y < 0 {
        x.checked_sub(y.unsigned_abs())
    } else {
        x.checked_add(y as u128)
    }
}

/// Apply a crossed tick's `liquidityNet` to in-range liquidity: added when moving
/// UP (`oneForZero`), subtracted when moving DOWN (`zeroForOne`).
fn apply_liquidity_net(liquidity: u128, net: i128, zero_for_one: bool) -> Option<u128> {
    let delta = if zero_for_one { net.checked_neg()? } else { net };
    add_delta(liquidity, delta)
}

/// Canonical Uniswap V3 tick spacing per fee tier (ppm). Unknown tiers reject.
fn tick_spacing(fee_ppm: u32) -> Option<i32> {
    match fee_ppm {
        100 => Some(1),
        500 => Some(10),
        3000 => Some(60),
        10000 => Some(200),
        _ => None,
    }
}

/// The `[lower, upper]` tick bounds of the spacing interval containing `tick`
/// (floor division toward negative infinity so negative ticks are handled). Used
/// as the fail-closed window when a hop carries no fetched cross-tick data.
fn interval_bounds(tick: i32, spacing: i32) -> (i32, i32) {
    let lower = (tick.div_euclid(spacing)) * spacing;
    (lower, lower + spacing)
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

fn to512(v: U256) -> U512 {
    let mut b = [0u8; 32];
    v.to_big_endian(&mut b);
    U512::from_big_endian(&b)
}

/// Narrow a `U512` back to `U256`, returning `None` if it does not fit (overflow
/// => reject rather than wrap).
fn from512(v: U512) -> Option<U256> {
    let mut b = [0u8; 64];
    v.to_big_endian(&mut b);
    if b[0..32].iter().any(|&x| x != 0) {
        return None;
    }
    Some(U256::from_big_endian(&b[32..64]))
}

/// Convert a non-negative human amount to raw base units (`·10^decimals`).
fn human_to_raw(human: f64, decimals: u8) -> Option<U256> {
    if !human.is_finite() || human < 0.0 {
        return None;
    }
    let scaled = human * 10f64.powi(decimals as i32);
    u256_from_f64(scaled)
}

/// Convert a finite, non-negative `f64` to `U256` (truncating the fraction).
fn u256_from_f64(x: f64) -> Option<U256> {
    if !x.is_finite() || x < 0.0 {
        return None;
    }
    if x < 1.0 {
        return Some(U256::zero());
    }
    // `{:.0}` renders the integer part in full decimal with no exponent.
    let s = format!("{x:.0}");
    U256::from_dec_str(&s).ok()
}

/// Ratio `numerator / denominator` as `f64` via decimal strings (enough precision
/// for economic decisions; both values are the SAME token so units cancel).
fn ratio_f64(numerator: U256, denominator: U256) -> f64 {
    if denominator.is_zero() {
        return 0.0;
    }
    let n = numerator.to_string().parse::<f64>().unwrap_or(f64::INFINITY);
    let d = denominator.to_string().parse::<f64>().unwrap_or(f64::INFINITY);
    if d == 0.0 {
        0.0
    } else {
        n / d
    }
}

/// Look up a token's USD price from a derived price map (helper for callers).
pub fn start_token_usd(prices: &HashMap<Address, f64>, token: Address) -> Option<f64> {
    prices.get(&token).copied().filter(|v| v.is_finite() && *v > 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{PoolEdge, V3CrossTickData, V3Tick};

    const Q96_STR: &str = "79228162514264337593543950336"; // 2^96

    fn q96() -> U256 {
        U256::from_dec_str(Q96_STR).unwrap()
    }

    fn addr(n: u8) -> Address {
        let mut b = [0u8; 20];
        b[19] = n;
        Address::from(b)
    }

    #[allow(clippy::too_many_arguments)]
    fn v2_edge(
        token_in: u8,
        token_out: u8,
        dec_in: u8,
        dec_out: u8,
        reserve_in: U256,
        reserve_out: U256,
        fee: u32,
        zero_for_one: bool,
    ) -> PoolEdge {
        PoolEdge {
            token_in: addr(token_in),
            token_out: addr(token_out),
            price: 1.0,
            liquidity_usd: 1_000_000.0,
            dex: "sushiswap".to_string(),
            network: "arbitrum".to_string(),
            router: Address::zero(),
            is_v3: false,
            fee,
            swap_state: Some(PoolSwapState {
                dec_in,
                dec_out,
                reserve_in,
                reserve_out,
                sqrt_price_x96: U256::zero(),
                liquidity: 0,
                tick: 0,
                zero_for_one,
                cross_tick: None,
            }),
        }
    }

    fn e18(n: u128) -> U256 {
        U256::from(n) * U256::exp10(18)
    }

    #[allow(clippy::too_many_arguments)]
    fn v3_edge(
        token_in: u8,
        token_out: u8,
        sqrt_price_x96: U256,
        liquidity: u128,
        tick: i32,
        zero_for_one: bool,
        fee: u32,
    ) -> PoolEdge {
        PoolEdge {
            token_in: addr(token_in),
            token_out: addr(token_out),
            price: 1.0,
            liquidity_usd: 1_000_000.0,
            dex: "uniswap_v3".to_string(),
            network: "arbitrum".to_string(),
            router: Address::zero(),
            is_v3: true,
            fee,
            swap_state: Some(PoolSwapState {
                dec_in: 18,
                dec_out: 18,
                reserve_in: U256::zero(),
                reserve_out: U256::zero(),
                sqrt_price_x96,
                liquidity,
                tick,
                zero_for_one,
                cross_tick: None,
            }),
        }
    }

    // ---- V2 known-answer (independent Python reference) ----

    #[test]
    fn v2_known_answer() {
        // in=1e18, reserves 1000e18 / 2000e18, fee 0.30% (3000 ppm).
        let out = v2_amount_out(e18(1), e18(1000), e18(2000), 3000).unwrap();
        assert_eq!(out, U256::from_dec_str("1992013962079806432").unwrap());

        // in=0.5e18, reserves 1000e18 / 1000e18, fee 0.30%.
        let out2 = v2_amount_out(
            U256::from(5u64) * U256::exp10(17),
            e18(1000),
            e18(1000),
            3000,
        )
        .unwrap();
        assert_eq!(out2, U256::from_dec_str("498251621566649025").unwrap());
    }

    #[test]
    fn v2_rejects_empty_reserves() {
        assert!(v2_amount_out(e18(1), U256::zero(), e18(1000), 3000).is_none());
        assert!(v2_amount_out(e18(1), e18(1000), U256::zero(), 3000).is_none());
        assert!(v2_amount_out(U256::zero(), e18(1000), e18(1000), 3000).is_none());
    }

    // ---- V3 known-answer (independent Python reference) ----

    fn v3_state(zero_for_one: bool, tick: i32) -> PoolSwapState {
        PoolSwapState {
            dec_in: 18,
            dec_out: 18,
            reserve_in: U256::zero(),
            reserve_out: U256::zero(),
            sqrt_price_x96: q96(), // price 1.0 (tick 0)
            liquidity: 10u128.pow(18),
            tick,
            zero_for_one,
            cross_tick: None,
        }
    }

    #[test]
    fn v3_known_answer_one_for_zero() {
        // token1 in, price UP. tick 0, spacing 200 (fee 10000) => room to tick 200.
        let st = v3_state(false, 0);
        let out = v3_amount_out(&st, e18(1) / U256::from(1000u64), 10000).unwrap(); // 1e15
        assert_eq!(out, U256::from_dec_str("989020869339354").unwrap());
    }

    #[test]
    fn v3_known_answer_zero_for_one() {
        // token0 in, price DOWN. tick -100, spacing 200 => interval [-200,0], room down.
        let st = v3_state(true, -100);
        let out = v3_amount_out(&st, e18(1) / U256::from(1000u64), 10000).unwrap(); // 1e15
        assert_eq!(out, U256::from_dec_str("989020869339354").unwrap());
    }

    #[test]
    fn v3_without_tick_data_rejects_immediate_boundary_cross() {
        // With NO fetched cross-tick data the simulator preserves the Phase-4
        // fail-closed contract: at exactly tick 0 a zeroForOne (price-down) trade
        // immediately leaves the [0,10] interval (fee 500 => spacing 10), so ANY
        // size must be rejected rather than extrapolated across the boundary.
        let st = v3_state(true, 0);
        assert!(st.cross_tick.is_none());
        assert!(v3_amount_out(&st, e18(1) / U256::from(1000u64), 500).is_none());
    }

    #[test]
    fn v3_without_tick_data_fails_closed_on_crossing() {
        // Without fetched ticks, a huge oneForZero trade that would blow past the
        // interval boundary still fails closed (unsimulable) — never extrapolated.
        let st = v3_state(false, 0);
        assert!(st.cross_tick.is_none());
        assert!(v3_amount_out(&st, e18(1_000_000), 10000).is_none());
    }

    #[test]
    fn v3_rejects_zero_liquidity() {
        let mut st = v3_state(false, 0);
        st.liquidity = 0;
        assert!(v3_amount_out(&st, e18(1), 10000).is_none());
    }

    // ---- V3 cross-tick simulation (Phase 8) ----

    fn tick(index: i32, liquidity_net: i128) -> V3Tick {
        V3Tick { index, liquidity_net }
    }

    /// A V3 swap state priced exactly at `start_tick`, carrying fetched cross-tick
    /// data (`ticks` + `window`) so `v3_amount_out` walks the full tick-by-tick path.
    fn v3_ct_state_at(
        zero_for_one: bool,
        start_tick: i32,
        liquidity: u128,
        ticks: Vec<V3Tick>,
        window: (i32, i32),
    ) -> PoolSwapState {
        PoolSwapState {
            dec_in: 18,
            dec_out: 18,
            reserve_in: U256::zero(),
            reserve_out: U256::zero(),
            sqrt_price_x96: get_sqrt_ratio_at_tick(start_tick).unwrap(),
            liquidity,
            tick: start_tick,
            zero_for_one,
            cross_tick: Some(V3CrossTickData { ticks, window }),
        }
    }

    // A generous window that no test trade below approaches.
    const WIDE: (i32, i32) = (-887220, 887220);

    #[test]
    fn get_sqrt_ratio_at_tick_matches_uniswap() {
        // Exact TickMath values, independently cross-checked against Uniswap v3-core.
        let cases: [(i32, &str); 11] = [
            (0, "79228162514264337593543950336"),
            (1, "79232123823359799118286999568"),
            (-1, "79224201403219477170569942574"),
            (60, "79466191966197645195421774833"),
            (-60, "78990846045029531151608375686"),
            (200, "80024378775772204256025656563"),
            (-200, "78439868342809377387252074393"),
            (100, "79625275426524748796330556128"),
            (-100, "78833030112140176575862854579"),
            (887272, "1461446703485210103287273052203988822378723970342"),
            (-887272, "4295128739"),
        ];
        for (t, s) in cases {
            assert_eq!(
                get_sqrt_ratio_at_tick(t).unwrap(),
                U256::from_dec_str(s).unwrap(),
                "tick {t}"
            );
        }
        // Out-of-range ticks reject (fail closed).
        assert!(get_sqrt_ratio_at_tick(887273).is_none());
        assert!(get_sqrt_ratio_at_tick(-887273).is_none());
    }

    #[test]
    fn v3_cross_tick_kat_one_for_zero() {
        // Scenario A: oneForZero (price UP), spacing 60 (fee 3000), start tick 0,
        // L=1e18, ticks {60:+5e17, 120:-3e17}. Known answers cross-checked against
        // the independent Python Uniswap reference.
        let ticks = || vec![tick(60, 5 * 10i128.pow(17)), tick(120, -(3 * 10i128.pow(17)))];
        let cases: [(u128, &str); 4] = [
            (10_000_000_000_000_000, "9886449480982393"),
            (500_000_000_000_000_000, "352338614345963796"),
            (1_000_000_000_000_000_000, "544767158188428096"),
            (3_000_000_000_000_000_000, "856678574807346701"),
        ];
        for (amt, out) in cases {
            let st = v3_ct_state_at(false, 0, e18(1).as_u128(), ticks(), WIDE);
            assert_eq!(
                v3_amount_out(&st, U256::from(amt), 3000).unwrap(),
                U256::from_dec_str(out).unwrap(),
                "amountIn {amt}"
            );
        }
    }

    #[test]
    fn v3_cross_tick_kat_zero_for_one() {
        // Scenario B: zeroForOne (price DOWN), mirror of A. ticks {-60:+3e17, -120:-1e17}.
        let ticks = || vec![tick(-60, 3 * 10i128.pow(17)), tick(-120, -(10i128.pow(17)))];
        let cases: [(u128, &str); 4] = [
            (10_000_000_000_000_000, "9855398687342715"),
            (500_000_000_000_000_000, "307310315878921086"),
            (1_000_000_000_000_000_000, "444091920673925690"),
            (3_000_000_000_000_000_000, "631466201270807105"),
        ];
        for (amt, out) in cases {
            let st = v3_ct_state_at(true, 0, e18(1).as_u128(), ticks(), WIDE);
            assert_eq!(
                v3_amount_out(&st, U256::from(amt), 3000).unwrap(),
                U256::from_dec_str(out).unwrap(),
                "amountIn {amt}"
            );
        }
    }

    #[test]
    fn v3_cross_tick_liquidity_net_changes_output() {
        // The SAME 1e18 oneForZero trade crossing tick 60: a positive liquidityNet
        // there (deeper book past the boundary) yields strictly MORE output than a
        // zero-net control — proving L is actually updated at the crossing.
        let with_net = v3_ct_state_at(false, 0, e18(1).as_u128(), vec![tick(60, 5 * 10i128.pow(17))], WIDE);
        let zero_net = v3_ct_state_at(false, 0, e18(1).as_u128(), vec![tick(60, 0)], WIDE);
        let out_with = v3_amount_out(&with_net, e18(1), 3000).unwrap();
        let out_zero = v3_amount_out(&zero_net, e18(1), 3000).unwrap();
        assert_eq!(out_with, U256::from_dec_str("597962782999462392").unwrap());
        assert_eq!(out_zero, U256::from_dec_str("499248873309964946").unwrap());
        assert!(out_with > out_zero, "added liquidityNet must increase output");
    }

    /// The OLD Phase-4 within-interval-only output formula, kept verbatim so the
    /// new cross-tick path can be asserted IDENTICAL to it inside one interval.
    fn within_interval_reference(state: &PoolSwapState, amount_in: U256, fee_ppm: u32) -> Option<U256> {
        if amount_in.is_zero() || state.liquidity == 0 || state.sqrt_price_x96.is_zero() {
            return None;
        }
        let liquidity = U256::from(state.liquidity);
        let sqrt_p = state.sqrt_price_x96;
        let fee_num = U256::from(1_000_000u32.checked_sub(fee_ppm)?);
        let amount_in_after_fee =
            from512(to512(amount_in) * to512(fee_num) / to512(U256::from(1_000_000u32)))?;
        if amount_in_after_fee.is_zero() {
            return None;
        }
        let sqrt_next = if state.zero_for_one {
            next_sqrt_from_amount0_in(sqrt_p, liquidity, amount_in_after_fee)?
        } else {
            next_sqrt_from_amount1_in(sqrt_p, liquidity, amount_in_after_fee)?
        };
        let spacing = tick_spacing(fee_ppm)?;
        let (lower, upper) = interval_bounds(state.tick, spacing);
        if state.zero_for_one {
            if sqrt_next < get_sqrt_ratio_at_tick(lower)? {
                return None;
            }
            get_amount1_delta(sqrt_next, sqrt_p, liquidity, false)
        } else {
            if sqrt_next > get_sqrt_ratio_at_tick(upper)? {
                return None;
            }
            get_amount0_delta(sqrt_p, sqrt_next, liquidity, false)
        }
    }

    #[test]
    fn v3_within_interval_equivalence_new_vs_old() {
        // A small trade that stays within one interval must yield IDENTICAL output
        // via the new cross-tick path (both None and fetched-window flavours) and
        // the old within-interval formula. Start mid-interval (tick 100, spacing
        // 200) so the trade never reaches a boundary in either direction.
        let small = e18(1) / U256::from(1000u64); // 1e15
        for &zfo in &[true, false] {
            // cross_tick = None: Phase-4 path routed through the new code.
            let mut st_none = v3_ct_state_at(zfo, 100, e18(1).as_u128(), vec![], (-887200, 887200));
            st_none.cross_tick = None;
            let old = within_interval_reference(&st_none, small, 10000).unwrap();
            let new_none = v3_amount_out(&st_none, small, 10000).unwrap();
            assert_eq!(new_none, old, "None-path equivalence (zfo={zfo})");

            // cross_tick = Some(wide window, no nearby ticks): same within-interval output.
            let st_ct = v3_ct_state_at(zfo, 100, e18(1).as_u128(), vec![], (-887200, 887200));
            let new_ct = v3_amount_out(&st_ct, small, 10000).unwrap();
            assert_eq!(new_ct, old, "cross-tick-path equivalence (zfo={zfo})");
        }
    }

    #[test]
    fn cross_tick_data_makes_boundary_crossing_simulable() {
        // The core Phase-8 win: a trade sized to cross tick 60. WITHOUT fetched
        // ticks the sim fail-closes (unsimulable, exactly as Phase 4 did); WITH the
        // fetched ticks it simulates the crossing exactly (matches the KAT).
        let amt = e18(1);
        let mut none_state = v3_ct_state_at(false, 0, e18(1).as_u128(), vec![], WIDE);
        none_state.cross_tick = None;
        assert!(
            v3_amount_out(&none_state, amt, 3000).is_none(),
            "without tick data a boundary-crossing trade must fail closed"
        );
        let ct_state = v3_ct_state_at(
            false,
            0,
            e18(1).as_u128(),
            vec![tick(60, 5 * 10i128.pow(17)), tick(120, -(3 * 10i128.pow(17)))],
            WIDE,
        );
        assert_eq!(
            v3_amount_out(&ct_state, amt, 3000).unwrap(),
            U256::from_dec_str("544767158188428096").unwrap(),
            "with tick data the crossing simulates exactly"
        );
    }

    #[test]
    fn v3_trade_leaving_fetched_window_fails_closed() {
        // A huge oneForZero trade with a TINY fetched window must fail closed
        // (unsimulable) — never extrapolated past the state we actually fetched.
        let st = v3_ct_state_at(false, 0, e18(1).as_u128(), vec![], (-60, 60));
        assert!(v3_amount_out(&st, e18(1000), 3000).is_none());
    }

    #[test]
    fn v3_exceeding_max_tick_crossings_fails_closed() {
        // 600 initialized ticks (spacing 1, fee 100); a trade large enough to cross
        // more than MAX_TICK_CROSSINGS of them must fail closed rather than walk an
        // unbounded portion of the curve.
        const { assert!(MAX_TICK_CROSSINGS < 600) };
        let ticks: Vec<V3Tick> = (1..=600).map(|i| tick(i, 0)).collect();
        let st = v3_ct_state_at(false, 0, e18(1).as_u128(), ticks, (-887200, 887200));
        assert!(v3_amount_out(&st, e18(1), 100).is_none());
    }

    /// Build a V3 `PoolEdge` carrying fetched cross-tick data, for cycle-level tests.
    #[allow(clippy::too_many_arguments)]
    fn v3_edge_ct(
        token_in: u8,
        token_out: u8,
        start_tick: i32,
        liquidity: u128,
        zero_for_one: bool,
        fee: u32,
        ticks: Vec<V3Tick>,
        window: (i32, i32),
    ) -> PoolEdge {
        let mut e = v3_edge(
            token_in,
            token_out,
            get_sqrt_ratio_at_tick(start_tick).unwrap(),
            liquidity,
            start_tick,
            zero_for_one,
            fee,
        );
        if let Some(s) = e.swap_state.as_mut() {
            s.cross_tick = Some(V3CrossTickData { ticks, window });
        }
        e
    }

    #[test]
    fn anti_mirage_cross_tick_hop_simulable_but_rejected_negative() {
        // A 2-hop cycle whose V3 leg CROSSES an initialized tick at the simulated
        // loan size. Pre-Phase-8 this cycle was rejected_unsimulable purely for the
        // crossing; now it is fully simulated — and honest cross-tick price impact
        // (liquidity HALVES past tick 60) drags the spot-positive loop NET-NEGATIVE,
        // so it must be simulable (=> rejected_negative), not a survivor.
        let v3_hop = v3_edge_ct(
            1,
            2,
            0,
            10u128.pow(19),           // L = 1e19
            false,                    // oneForZero (price up)
            10000,                    // 1% fee
            vec![tick(60, -(5 * 10i128.pow(18)))], // liquidity halves after tick 60
            WIDE,
        );
        // Deep, fee-free V2 hop back with a +1.5% marginal edge (the mirage source).
        let deep = U256::exp10(30);
        let deep_plus = deep * U256::from(1015u64) / U256::from(1000u64);
        let v2_hop = v2_edge(2, 1, 18, 18, deep, deep_plus, 0, true);

        let cycle = ArbitrageCycle {
            edges: vec![v3_hop, v2_hop],
            profit_ratio: 1.00485, // detector's zero-impact (mirage) view
        };
        assert!(cycle.profit_ratio > 1.0, "spot view must look profitable");

        // Confirm the V3 hop actually crosses tick 60 at this loan (0.5e18 raw),
        // i.e. this really exercises the cross-tick path, not within-interval math.
        let st = cycle.edges[0].swap_state.as_ref().unwrap();
        let loan_raw = U256::from(5u64) * U256::exp10(17);
        let crossed = {
            let mut none_state = st.clone();
            none_state.cross_tick = None;
            v3_amount_out(&none_state, loan_raw, 10000).is_none()
        };
        assert!(crossed, "loan must be large enough to cross the tick (else test is vacuous)");

        let outcome = simulate_cycle(&cycle, 0.5, 1.0, 5.0, 0.0);
        assert!(
            outcome.simulable,
            "cross-tick hop must now be SIMULABLE (not unsimulable): {:?}",
            outcome.reject_reason
        );
        assert!(
            outcome.realized_ratio < 1.0,
            "cross-tick impact must drag realized ratio below 1.0, got {}",
            outcome.realized_ratio
        );
        assert!(!outcome.survives(0.0), "net-negative cross-tick cycle must NOT survive");
    }

    // ---- multi-hop sequential composition ----

    #[test]
    fn multi_hop_composition_matches_manual_chain() {
        // 3 V2 hops A->B->C->A; sequential sim output must equal manual chaining.
        let e1 = v2_edge(1, 2, 18, 18, e18(1000), e18(1200), 3000, true);
        let e2 = v2_edge(2, 3, 18, 18, e18(2000), e18(1800), 3000, true);
        let e3 = v2_edge(3, 1, 18, 18, e18(1500), e18(1600), 3000, true);

        let start = e18(10);
        let a = v2_amount_out(start, e18(1000), e18(1200), 3000).unwrap();
        let b = v2_amount_out(a, e18(2000), e18(1800), 3000).unwrap();
        let c = v2_amount_out(b, e18(1500), e18(1600), 3000).unwrap();

        let cycle = ArbitrageCycle {
            edges: vec![e1, e2, e3],
            profit_ratio: 1.05,
        };
        // start_token_usd=1, dec 18 => loan_usd 10 -> 10e18 raw == `start`.
        let outcome = simulate_cycle(&cycle, 10.0, 1.0, 0.0, 0.0);
        assert!(outcome.simulable);
        // realized_ratio == c / start.
        let expected_ratio = ratio_f64(c, start);
        assert!((outcome.realized_ratio - expected_ratio).abs() < 1e-9);
    }

    // ---- THE ANTI-MIRAGE TEST ----

    #[test]
    fn anti_mirage_spot_positive_cycle_rejected_under_impact() {
        // Two pools, each with a ~+0.1% marginal edge, so the detector's spot
        // round-trip ratio (~1.002) looks POSITIVE at zero impact. But pushing a
        // real loan (~10% of each pool) through them compounds price impact and
        // the REALIZED loop returns LESS than it borrowed => must be rejected.
        let a_to_b = v2_edge(1, 2, 18, 18, e18(1_000_000), e18(1_001_000), 0, true);
        let b_to_a = v2_edge(2, 1, 18, 18, e18(1_000_000), e18(1_001_000), 0, true);
        let cycle = ArbitrageCycle {
            edges: vec![a_to_b, b_to_a],
            profit_ratio: 1.002, // detector's zero-impact (mirage) view
        };

        // Sanity: at spot the cycle looks profitable.
        assert!(cycle.profit_ratio > 1.0);

        // Loan ~10% of the pool => heavy impact.
        let outcome = simulate_cycle(&cycle, 100_000.0, 1.0, 5.0, 0.0);
        assert!(outcome.simulable, "cycle is fully simulable, just unprofitable");
        assert!(
            outcome.realized_ratio < 1.0,
            "impact must drag realized ratio below 1.0, got {}",
            outcome.realized_ratio
        );
        assert!(
            outcome.net.net_profit_usd < 0.0,
            "realized net must be negative, got {}",
            outcome.net.net_profit_usd
        );
        assert!(!outcome.survives(0.0), "mirage must NOT survive the gate");
    }

    // ---- THE V3 ANTI-MIRAGE TEST (within-tick price impact, not boundary reject) ----

    #[test]
    fn anti_mirage_v3_hop_dragged_net_negative_by_within_tick_impact() {
        // A 2-hop cycle A->B->A that is spot-positive on marginal prices but is
        // dragged NET-NEGATIVE once REAL within-tick V3 price impact is applied.
        // Hop 1 is a UniswapV3 hop (fee 1%, price 1.0, tick 0, spacing 200 => the
        // trade stays inside the [0,200] interval, so this exercises the exact V3
        // swap MATH, not the boundary/zero-liquidity rejection paths). Hop 2 is a
        // deep, fee-free V2 pool supplying a +1.5% marginal edge.
        //
        // Spot (zero-impact) marginal round trip ~ 0.99 * 1.015 = 1.00485 > 1 (mirage),
        // but the V3 hop's within-tick impact on a ~0.5-token loan cuts its realized
        // output enough that the realized loop returns LESS than it borrowed.
        let q96 = q96();
        // Hop 1: V3, one_for_zero (price up), price 1.0, L shallow enough to move.
        let v3_hop = v3_edge(1, 2, q96, 6 * 10u128.pow(19), 0, false, 10000);
        // Hop 2: V2, fee 0, deep pool, marginal A per B = 1.015.
        let deep = U256::exp10(30);
        let deep_plus = deep * U256::from(1015u64) / U256::from(1000u64);
        let v2_hop = v2_edge(2, 1, 18, 18, deep, deep_plus, 0, true);

        let cycle = ArbitrageCycle {
            edges: vec![v3_hop, v2_hop],
            profit_ratio: 1.00485, // detector's zero-impact (mirage) view
        };
        assert!(cycle.profit_ratio > 1.0, "spot view must look profitable");

        // loan_usd 0.5, start_token_usd 1.0, dec 18 => 0.5e18 raw start amount.
        let outcome = simulate_cycle(&cycle, 0.5, 1.0, 5.0, 0.0);
        assert!(
            outcome.simulable,
            "V3 hop must stay INSIDE its tick interval (exercise the math, not reject): {:?}",
            outcome.reject_reason
        );
        assert!(
            outcome.realized_ratio < 1.0,
            "within-tick V3 impact must drag realized ratio below 1.0, got {}",
            outcome.realized_ratio
        );
        assert!(
            outcome.net.net_profit_usd < 0.0,
            "realized net must be negative, got {}",
            outcome.net.net_profit_usd
        );
        assert!(!outcome.survives(0.0), "V3 mirage must NOT survive the gate");
    }

    #[test]
    fn genuine_edge_with_negligible_impact_survives() {
        // Deep pools (1e12 units) + a real +1% edge each way + a tiny loan => impact
        // is negligible and the cycle legitimately survives the gate.
        let big = U256::from(10u64).pow(12.into()) * U256::exp10(18);
        let bigger = big + big / U256::from(100u64); // +1%
        let a_to_b = v2_edge(1, 2, 18, 18, big, bigger, 0, true);
        let b_to_a = v2_edge(2, 1, 18, 18, big, bigger, 0, true);
        let cycle = ArbitrageCycle {
            edges: vec![a_to_b, b_to_a],
            profit_ratio: 1.0201,
        };
        let outcome = simulate_cycle(&cycle, 1_000.0, 1.0, 0.0, 0.0);
        assert!(outcome.simulable);
        assert!(
            outcome.realized_ratio > 1.0,
            "negligible-impact genuine edge should stay positive, got {}",
            outcome.realized_ratio
        );
        assert!(outcome.survives(0.0));
    }

    #[test]
    fn synthetic_pool_without_state_is_rejected() {
        let mut edge = v2_edge(1, 2, 18, 18, e18(1000), e18(1000), 3000, true);
        edge.swap_state = None;
        let cycle = ArbitrageCycle { edges: vec![edge], profit_ratio: 1.01 };
        let outcome = simulate_cycle(&cycle, 1_000.0, 1.0, 0.0, 0.0);
        assert!(!outcome.simulable);
        assert!(outcome.reject_reason.is_some());
    }

    // ---- loan-size sweep ----

    #[test]
    fn best_of_sweep_picks_highest_net() {
        // Bigger loans incur more impact; on a genuine edge the best net is at a
        // finite size, and simulate_cycle_best must return the max-net outcome.
        let r = e18(1_000_000);
        let r_plus = r + r / U256::from(200u64); // +0.5% edge each hop
        let a_to_b = v2_edge(1, 2, 18, 18, r, r_plus, 0, true);
        let b_to_a = v2_edge(2, 1, 18, 18, r, r_plus, 0, true);
        let cycle = ArbitrageCycle {
            edges: vec![a_to_b, b_to_a],
            profit_ratio: 1.01,
        };
        let sizes = [1_000.0, 10_000.0, 100_000.0, 500_000.0];
        let best = simulate_cycle_best(&cycle, 1.0, 0.0, &sizes, 0.0).unwrap();
        for &s in &sizes {
            let o = simulate_cycle(&cycle, s, 1.0, 0.0, 0.0);
            assert!(best.net.net_profit_usd >= o.net.net_profit_usd);
        }
    }

    #[test]
    fn loan_sizes_env_parsing_falls_back() {
        // Defaults when unset are non-empty and positive.
        let sizes = loan_sizes_from_env();
        assert!(!sizes.is_empty());
        assert!(sizes.iter().all(|v| *v > 0.0));
    }

    #[test]
    fn u256_from_f64_roundtrips_small_and_large() {
        assert_eq!(u256_from_f64(0.4).unwrap(), U256::zero());
        assert_eq!(u256_from_f64(5.0).unwrap(), U256::from(5u64));
        // Large value truncates the f64 exactly (1e24 is not exactly representable
        // as f64, so we expect its nearest f64 integer value).
        assert_eq!(
            u256_from_f64(1e24).unwrap(),
            U256::from_dec_str("999999999999999983222784").unwrap()
        );
        assert!(u256_from_f64(-1.0).is_none());
        assert!(u256_from_f64(f64::INFINITY).is_none());
    }
}

