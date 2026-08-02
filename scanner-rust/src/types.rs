use ethers::types::{Address, U256};
use serde::{Deserialize, Serialize};

pub const CANONICAL_OPPORTUNITY_VERSION: &str = "scanner-opportunity-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteParityPayload {
    pub version: String,
    pub route_key: String,
    pub quote_timestamp: String,
    pub quote_token_usd_price: f64,
    pub buy_price: f64,
    pub expected_buy_token_amount: String,
    pub amount_b_min: String,
    pub token_b_decimals: u32,
    pub slippage_bps: u32,
    pub source_quality_bps: u32,
    pub persistence_count: u32,
    pub min_required_persistence: u32,
    pub source_flags: SourceFlags,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFlags {
    pub has_subgraph: bool,
    pub fallback_only: bool,
    pub same_fallback_source: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalExecutionPayload {
    pub asset: String,
    pub amount: String,
    pub router_a: String,
    pub router_b: String,
    pub token_b: String,
    pub router_a_is_v3: bool,
    pub router_b_is_v3: bool,
    pub fee_a: u32,
    pub fee_b: u32,
    pub amount_b_min: String,
    pub token_pair: String,
    pub buy_dex: String,
    pub sell_dex: String,
    pub network: String,
    pub predicted_gross_profit: f64,
    pub predicted_net_profit: f64,
    pub estimated_gas_cost: f64,
    pub estimated_slippage_bps: u32,
    pub scan_timestamp: String,
    pub confidence_score: f64,
    pub quote: QuoteParityPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalOpportunity {
    pub token_pair: String,
    pub buy_dex: String,
    pub sell_dex: String,
    pub network: String,
    pub loan_amount: f64,
    pub executable_loan_amount: f64,
    pub gross_profit: f64,
    pub net_profit: f64,
    pub distance_to_executable_usd: f64,
    pub gas_cost: f64,
    pub confidence_score: f64,
    pub confidence_tier: ConfidenceTier,
    pub spread: String,
    pub liquidity: String,
    pub estimated_slippage_bps: u32,
    pub buy_impact_bps: u32,
    pub sell_impact_bps: u32,
    pub route_penalty_bps: u32,
    pub status: OpportunityStatus,
    pub quote_sources: Vec<String>,
    pub scan_run_id: String,
    pub candidate_id: String,
    pub quote_timestamp: String,
    pub data_source: String,
    pub reason_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_payload: Option<CanonicalExecutionPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ConfidenceTier {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum OpportunityStatus {
    Active,
    Watchlist,
}

#[derive(Debug, Clone)]
pub struct PoolEdge {
    pub token_in: Address,
    pub token_out: Address,
    pub price: f64,
    pub liquidity_usd: f64,
    pub dex: String,
    pub network: String,
    pub router: Address,
    pub is_v3: bool,
    /// Swap fee stored in Uniswap-V3 style hundredths-of-a-bip (parts per million).
    /// Examples: 100 = 0.01%, 500 = 0.05%, 3000 = 0.30%, 10000 = 1.00%.
    /// UniV2/Sushi style 0.30% pools use 3000; a zero-fee synthetic hop uses 0.
    pub fee: u32,
    /// Raw, integer on-chain pool state needed to SIMULATE a real swap through
    /// this hop (constant-product for V2, concentrated-liquidity for V3). This is
    /// what Phase 4's price-impact simulator consumes; the marginal [`price`]
    /// above is only the zero-impact spot rate used by Bellman-Ford. `None` for
    /// synthetic/demo pools that carry no executable state.
    pub swap_state: Option<PoolSwapState>,
}

/// Raw integer pool state for one directional hop, captured at a single block.
///
/// All amounts are RAW base units (i.e. already scaled by the token's decimals),
/// exactly as returned on-chain, so the simulator can do exact integer AMM math
/// without floating-point drift. `dec_in`/`dec_out` are retained so a caller can
/// convert to/from human units when sizing a loan.
#[derive(Debug, Clone)]
pub struct PoolSwapState {
    /// ERC-20 decimals of `token_in` / `token_out`.
    pub dec_in: u8,
    pub dec_out: u8,
    /// UniswapV2/Sushi: raw reserves of `token_in` and `token_out` in this pool
    /// (constant-product `x*y=k`). Unused (zero) for V3.
    pub reserve_in: U256,
    pub reserve_out: U256,
    /// Uniswap V3: current `slot0().sqrtPriceX96` (Q64.96, `token1` per `token0`),
    /// in-range `liquidity()` (L), and current `slot0().tick`. Unused for V2.
    pub sqrt_price_x96: U256,
    pub liquidity: u128,
    pub tick: i32,
    /// True when this directional hop sells `token0` for `token1` (price moves
    /// DOWN), i.e. `token_in` is the pool's lower-address token. Derived from the
    /// canonical `token0 < token1` factory ordering.
    pub zero_for_one: bool,
    /// Phase 8: optional Uniswap V3 cross-tick data (the initialized ticks around
    /// the current tick with their `liquidityNet`, plus the tick window that data
    /// is COMPLETE over). When present, the simulator walks a swap tick-by-tick —
    /// updating in-range `liquidity` at each initialized-tick crossing exactly as
    /// the real pool does — instead of fail-closing at the first interval
    /// boundary. When `None` (V2 pools, or a V3 state captured without tick data),
    /// the simulator keeps the Phase-4 behaviour: exact WITHIN the current
    /// tick-spacing interval, fail-closed (unsimulable) on any boundary crossing.
    pub cross_tick: Option<V3CrossTickData>,
}

/// One initialized Uniswap V3 tick within a fetched window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct V3Tick {
    /// The tick index (always a multiple of the pool's tick spacing).
    pub index: i32,
    /// The tick's raw on-chain `liquidityNet` (int128), i.e. the signed change in
    /// in-range liquidity applied when the tick is crossed moving in the
    /// INCREASING-price (`oneForZero`) direction. Crossing in the decreasing
    /// (`zeroForOne`) direction applies the negation, matching Uniswap's
    /// `SwapMath`/`Tick.cross` sign convention.
    pub liquidity_net: i128,
}

/// The bounded set of initialized ticks the cross-tick V3 simulator may walk for
/// one hop, plus the tick window that set is guaranteed COMPLETE over (derived
/// from the fetched `tickBitmap` words). A swap whose price would leave `window`
/// (or that would cross more ticks than the simulator's bound) fails closed
/// (`unsimulable`) rather than extrapolate past unfetched state — preserving the
/// anti-mirage discipline at the new frontier.
#[derive(Debug, Clone)]
pub struct V3CrossTickData {
    /// Initialized ticks, ascending by `index`, each carrying `liquidity_net`.
    pub ticks: Vec<V3Tick>,
    /// Inclusive `[lower, upper]` tick range the `ticks` set is complete over.
    pub window: (i32, i32),
}

impl PoolEdge {
    /// Returns the swap fee as a plain fraction of the traded amount
    /// (e.g. `fee = 3000` -> `0.003`). The effective output of a hop is
    /// `price * (1 - fee_fraction())`. Clamped to `[0, 1]` for safety.
    pub fn fee_fraction(&self) -> f64 {
        (self.fee as f64 / 1_000_000.0).clamp(0.0, 1.0)
    }

    /// Effective (fee-adjusted) exchange rate for this hop: the amount of
    /// `token_out` actually received per unit of `token_in` after the pool's
    /// swap fee is deducted.
    pub fn effective_price(&self) -> f64 {
        self.price * (1.0 - self.fee_fraction())
    }
}

#[derive(Debug, Clone)]
pub struct SimulationResult {
    pub success: bool,
    pub gas_used: u64,
    pub profit_usd: f64,
    pub revert_reason: Option<String>,
}
