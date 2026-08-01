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
//! * **Uniswap V3** — EXACT concentrated-liquidity swap math **within the current
//!   tick-spacing interval** (Uniswap `SqrtPriceMath`, Q64.96, 512-bit `mulDiv`),
//!   using the real `slot0().sqrtPriceX96`, in-range `liquidity()`, and current
//!   tick. In-range liquidity `L` is constant across an entire tick-spacing
//!   interval (initialized ticks only ever sit on spacing multiples), so the math
//!   is exact for any trade that stays inside the current interval. Crossing to
//!   the next interval could change `L`, and we deliberately do NOT read the tick
//!   bitmap / `liquidityNet` in Phase 4 — so a hop whose trade would move the
//!   price past the current interval boundary is **REJECTED** outright rather than
//!   extrapolated. This biases strictly toward rejecting; the gate never invents
//!   output beyond what it can prove. (The interval boundary sqrt-price is derived
//!   from the tick via an `f64` `1.0001^tick` approximation used *only* as a
//!   guardrail threshold; the swap output itself is exact integer math.)

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

/// Simulate one cycle at one loan size against the real captured pool state.
pub fn simulate_cycle(
    cycle: &ArbitrageCycle,
    loan_usd: f64,
    start_token_usd: f64,
    aave_premium_bps: f64,
    gas_cost_usd: f64,
) -> HopSimOutcome {
    let reject = |reason: String| HopSimOutcome {
        loan_usd,
        realized_ratio: 0.0,
        net: compute_net_profit(0.0, loan_usd, aave_premium_bps, gas_cost_usd),
        simulable: false,
        reject_reason: Some(reason),
    };

    let Some(first) = cycle.edges.first() else {
        return reject("empty cycle".to_string());
    };
    let Some(first_state) = first.swap_state.as_ref() else {
        return reject("start hop has no on-chain swap state (synthetic pool)".to_string());
    };
    if !(start_token_usd.is_finite() && start_token_usd > 0.0) {
        return reject(format!("no USD price for start token {:#x}", first.token_in));
    }

    // Size the USD loan into the start token's raw base units.
    let dec_in = first_state.dec_in;
    let amount_in_human = loan_usd / start_token_usd;
    let Some(mut amount) = human_to_raw(amount_in_human, dec_in) else {
        return reject("loan size overflows start-token base units".to_string());
    };
    if amount.is_zero() {
        return reject("loan rounds to zero start-token base units".to_string());
    }
    let start_amount = amount;

    // Execute each hop sequentially; each output feeds the next input.
    for (i, edge) in cycle.edges.iter().enumerate() {
        let Some(state) = edge.swap_state.as_ref() else {
            return reject(format!("hop {i} ({}) has no on-chain swap state", edge.dex));
        };
        let out = if edge.is_v3 {
            v3_amount_out(state, amount, edge.fee)
        } else {
            v2_amount_out(amount, state.reserve_in, state.reserve_out, edge.fee)
        };
        match out {
            Some(o) if !o.is_zero() => amount = o,
            Some(_) => return reject(format!("hop {i} ({}) produced zero output", edge.dex)),
            None => {
                return reject(format!(
                    "hop {i} ({}) unsimulable/rejected (V3 tick-interval exceeded or overflow)",
                    edge.dex
                ))
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
    HopSimOutcome {
        loan_usd,
        realized_ratio,
        net,
        simulable: true,
        reject_reason: None,
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
// Uniswap V3 concentrated-liquidity (EXACT within the current tick interval)
// ---------------------------------------------------------------------------

/// Exact V3 output for a within-interval swap, or `None` if the trade would cross
/// the current tick-spacing interval boundary (rejected, never extrapolated) or
/// overflows / has no liquidity.
pub fn v3_amount_out(state: &PoolSwapState, amount_in: U256, fee_ppm: u32) -> Option<U256> {
    if amount_in.is_zero() || state.liquidity == 0 || state.sqrt_price_x96.is_zero() {
        return None;
    }
    let liquidity = U256::from(state.liquidity);
    let sqrt_p = state.sqrt_price_x96;

    // Deduct the swap fee from the input (round DOWN => slightly less in => safe).
    let fee_num = U256::from(1_000_000u32.checked_sub(fee_ppm)?);
    let amount_in_after_fee = from512(to512(amount_in) * to512(fee_num) / to512(U256::from(1_000_000u32)))?;
    if amount_in_after_fee.is_zero() {
        return None;
    }

    // Next sqrt price after consuming the (post-fee) input at constant L.
    let sqrt_next = if state.zero_for_one {
        next_sqrt_from_amount0_in(sqrt_p, liquidity, amount_in_after_fee)?
    } else {
        next_sqrt_from_amount1_in(sqrt_p, liquidity, amount_in_after_fee)?
    };

    // Tick-interval guardrail: reject if the price would leave the interval where
    // L is known-constant. We never trade past a boundary we haven't verified.
    let spacing = tick_spacing(fee_ppm)?;
    let (lower, upper) = interval_bounds(state.tick, spacing);
    if state.zero_for_one {
        // Price decreases; must not fall below the interval's lower sqrt bound.
        // Round the LOWER threshold UP so any f64 error can only make the guardrail
        // stricter (reject-leaning), never permissive.
        let lower_sqrt = sqrt_ratio_at_tick_x96(lower, BoundRound::Up)?;
        if sqrt_next < lower_sqrt {
            return None;
        }
    } else {
        // Price increases; must not rise above the interval's upper sqrt bound.
        // Round the UPPER threshold DOWN so any f64 error is likewise conservative.
        let upper_sqrt = sqrt_ratio_at_tick_x96(upper, BoundRound::Down)?;
        if sqrt_next > upper_sqrt {
            return None;
        }
    }

    // Output = the OTHER token's delta across [sqrt_p, sqrt_next], rounded DOWN.
    if state.zero_for_one {
        // token1 out
        get_amount1_delta(sqrt_next, sqrt_p, liquidity)
    } else {
        // token0 out
        get_amount0_delta(sqrt_p, sqrt_next, liquidity)
    }
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

/// Uniswap `getAmount0Delta` (rounded DOWN): `L·(sqrtB−sqrtA)·2^96 /(sqrtB·sqrtA)`.
fn get_amount0_delta(sqrt_a: U256, sqrt_b: U256, liquidity: U256) -> Option<U256> {
    let (a, b) = if sqrt_a > sqrt_b { (sqrt_b, sqrt_a) } else { (sqrt_a, sqrt_b) };
    if a.is_zero() {
        return None;
    }
    let q96 = U512::one() << 96u32;
    let numerator1 = to512(liquidity) * q96; // L << 96
    let numerator2 = to512(b) - to512(a);
    // (numerator1 * numerator2 / b) / a, rounded down.
    let t = (numerator1 * numerator2) / to512(b);
    from512(t / to512(a))
}

/// Uniswap `getAmount1Delta` (rounded DOWN): `L·(sqrtB−sqrtA)/2^96`.
fn get_amount1_delta(sqrt_a: U256, sqrt_b: U256, liquidity: U256) -> Option<U256> {
    let (a, b) = if sqrt_a > sqrt_b { (sqrt_b, sqrt_a) } else { (sqrt_a, sqrt_b) };
    let q96 = U512::one() << 96u32;
    let num = to512(liquidity) * (to512(b) - to512(a));
    from512(num / q96)
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
/// (floor division toward negative infinity so negative ticks are handled).
fn interval_bounds(tick: i32, spacing: i32) -> (i32, i32) {
    let lower = (tick.div_euclid(spacing)) * spacing;
    (lower, lower + spacing)
}

/// Rounding direction for the tick-interval guardrail threshold. We deliberately
/// round the lower bound UP and the upper bound DOWN so the (approximate) f64
/// boundary is always conservative — float error can only cause an over-rejection,
/// never a permissive over-estimate of output.
#[derive(Clone, Copy)]
enum BoundRound {
    Up,
    Down,
}

/// `sqrt(1.0001^tick) · 2^96` as a Q64.96 `U256`. Uses an `f64` `1.0001^tick`
/// approximation — this is used ONLY as the tick-interval guardrail threshold,
/// never in the exact swap-output math, and its ~1e-12 relative error is
/// negligible against the 1e-4 relative width of a single tick.
///
/// `round` biases the result one-sidedly: a small relative epsilon (comfortably
/// larger than the f64 error, yet far below one tick's width) nudges the lower
/// bound UP and the upper bound DOWN, guaranteeing the guardrail can only ever
/// reject-lean, never over-estimate output.
fn sqrt_ratio_at_tick_x96(tick: i32, round: BoundRound) -> Option<U256> {
    let ratio = 1.0001f64.powi(tick).sqrt();
    if !ratio.is_finite() || ratio <= 0.0 {
        return None;
    }
    // 1e-9 >> f64 rounding error (~1e-12 rel) yet << one tick's 1e-4 width.
    const EPS: f64 = 1e-9;
    let ratio = match round {
        BoundRound::Up => ratio * (1.0 + EPS),
        BoundRound::Down => ratio * (1.0 - EPS),
    };
    let x96 = ratio * 2f64.powi(96);
    u256_from_f64(x96)
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
    use crate::types::PoolEdge;

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
    fn v3_rejects_when_crossing_tick_interval() {
        // At exactly tick 0, a zeroForOne (price-down) trade immediately leaves the
        // [0,10] interval (fee 500 => spacing 10, lower bound == current price), so
        // ANY size must be rejected rather than extrapolated across the boundary.
        let st = v3_state(true, 0);
        assert!(v3_amount_out(&st, e18(1) / U256::from(1000u64), 500).is_none());
    }

    #[test]
    fn v3_rejects_large_trade_that_exits_interval() {
        // A huge oneForZero trade blows past the interval boundary => rejected.
        let st = v3_state(false, 0);
        assert!(v3_amount_out(&st, e18(1_000_000), 10000).is_none());
    }

    #[test]
    fn v3_rejects_zero_liquidity() {
        let mut st = v3_state(false, 0);
        st.liquidity = 0;
        assert!(v3_amount_out(&st, e18(1), 10000).is_none());
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

