//! Phase 3: live Arbitrum multi-DEX pool data feed.
//!
//! This module discovers and reads REAL, CURRENT pool state from Arbitrum
//! mainnet and turns it into the [`PoolEdge`] values consumed by the fee-aware
//! Bellman-Ford scanner. It intentionally does NOT touch the arbitrage math or
//! the simulator — it only produces honest, human-unit prices.
//!
//! ## Price derivation
//! * **Uniswap V3** pools expose `slot0().sqrtPriceX96`. The raw ratio is
//!   `(sqrtPriceX96 / 2^96)^2 = amount_token1_raw / amount_token0_raw`. We then
//!   convert to human units with the `10^(dec0 - dec1)` decimal factor so the
//!   value is `token1_human` received per `token0_human` supplied.
//! * **UniswapV2 / SushiSwap** pools expose `getReserves()`. The marginal price
//!   `token0 -> token1` is `(reserve1 / reserve0) * 10^(dec0 - dec1)` in human
//!   units. The pool swap fee (0.30% = 3000 ppm) is carried separately in
//!   [`PoolEdge::fee`] and applied by the fee-aware edge weights, so it is NOT
//!   baked into `price` here.
//!
//! Both V3 and canonical V2 factories sort a pair's tokens by ascending address,
//! so `token0 = min(addr)` and `token1 = max(addr)`. We rely on that ordering
//! (documented and asserted by discovery) instead of spending extra RPC calls on
//! `token0()`/`token1()`.

use std::time::Duration;

use ethers::types::{Address, U256};
use serde_json::Value;
use tracing::{debug, info, warn};

use crate::types::{PoolEdge, PoolSwapState};

/// A verified Arbitrum token with its canonical address and ERC-20 decimals.
#[derive(Debug, Clone, Copy)]
pub struct TokenInfo {
    pub symbol: &'static str,
    pub address: Address,
    pub decimals: u8,
}

/// Uniswap V3 factory (identical address across all chains it is deployed on).
pub const UNISWAP_V3_FACTORY: &str = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
/// SushiSwap (UniswapV2-style constant-product) factory on Arbitrum.
pub const SUSHISWAP_V2_FACTORY: &str = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";

/// Function selectors (first 4 bytes of keccak256 of the signature).
const SEL_GET_POOL: [u8; 4] = [0x16, 0x98, 0xee, 0x82]; // getPool(address,address,uint24)
const SEL_GET_PAIR: [u8; 4] = [0xe6, 0xa4, 0x39, 0x05]; // getPair(address,address)
const SEL_SLOT0: [u8; 4] = [0x38, 0x50, 0xc7, 0xbd]; // slot0()
const SEL_GET_RESERVES: [u8; 4] = [0x09, 0x02, 0xf1, 0xac]; // getReserves()
const SEL_BALANCE_OF: [u8; 4] = [0x70, 0xa0, 0x82, 0x31]; // balanceOf(address)
const SEL_LIQUIDITY: [u8; 4] = [0x1a, 0x68, 0x65, 0x02]; // liquidity()

/// Default minimum pool liquidity (USD) below which a pool is treated as dust
/// and skipped, so near-empty/stale pools cannot manufacture fake spreads.
/// Overridable via `SCANNER_MIN_POOL_LIQUIDITY_USD`.
pub const DEFAULT_MIN_POOL_LIQUIDITY_USD: f64 = 5_000.0;

/// If more than this fraction of a discovery or state/balance batch fails, the
/// RPC is treated as degraded/throttled and the fetch fails closed rather than
/// building a partial graph (which would let the dust guard go inert).
pub const MAX_BATCH_FAILURE_FRACTION: f64 = 0.20;

/// Uniswap V3 fee tiers we probe, in hundredths-of-a-bip (ppm).
pub const V3_FEE_TIERS: [u32; 3] = [500, 3000, 10000];
/// Canonical UniswapV2/SushiSwap swap fee in ppm (0.30%).
pub const V2_FEE_PPM: u32 = 3000;

fn addr(s: &str) -> Address {
    s.parse().expect("hardcoded address is valid")
}

/// The verified Arbitrum token registry. Only canonical, well-known addresses
/// are included; an unknown/guessed address would fabricate garbage prices.
pub fn arbitrum_tokens() -> Vec<TokenInfo> {
    vec![
        TokenInfo { symbol: "WETH", address: addr("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"), decimals: 18 },
        TokenInfo { symbol: "USDC", address: addr("0xaf88d065e77c8cC2239327C5EDb3A432268e5831"), decimals: 6 },
        TokenInfo { symbol: "USDCe", address: addr("0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"), decimals: 6 },
        TokenInfo { symbol: "USDT", address: addr("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"), decimals: 6 },
        TokenInfo { symbol: "ARB", address: addr("0x912CE59144191C1204E64559FE8253a0e49E6548"), decimals: 18 },
        TokenInfo { symbol: "WBTC", address: addr("0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"), decimals: 8 },
        TokenInfo { symbol: "GMX", address: addr("0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"), decimals: 18 },
        TokenInfo { symbol: "PENDLE", address: addr("0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8"), decimals: 18 },
        TokenInfo { symbol: "MAGIC", address: addr("0x539bdE0d7Dbd336b79148AA742883198BBF60342"), decimals: 18 },
        TokenInfo { symbol: "RDNT", address: addr("0x3082CC23568eA640225c2467653dB90e9250AaA0"), decimals: 18 },
        TokenInfo { symbol: "DAI", address: addr("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1"), decimals: 18 },
    ]
}

/// Look up a token's decimals from the registry.
pub fn decimals_of(token: Address, registry: &[TokenInfo]) -> Option<u8> {
    registry.iter().find(|t| t.address == token).map(|t| t.decimals)
}

/// USD-pegged stablecoins in the registry, each valued at $1 as the anchor for
/// deriving live USD prices of the other tokens.
fn stable_symbols() -> [&'static str; 4] {
    ["USDC", "USDCe", "USDT", "DAI"]
}

fn is_stable(symbol: &str) -> bool {
    stable_symbols().contains(&symbol)
}

/// Convert a raw token amount to human units using its decimals.
fn to_human(raw: U256, decimals: u8) -> f64 {
    u256_to_f64(raw) / 10f64.powi(decimals as i32)
}

/// Derive a live USD price for every token by anchoring stablecoins at $1 and
/// relaxing outward across the observed edge prices (`token1_per_token0` in
/// human units). Returns a map keyed by token address.
///
/// For an edge `A -> B` with human price `p` (B per A), `usd(A) = p * usd(B)`.
/// We iterate until no new token gets priced (bounded by token count).
fn derive_usd_prices(
    tokens: &[TokenInfo],
    edges: &[(Address, Address, f64)],
) -> std::collections::HashMap<Address, f64> {
    use std::collections::HashMap;
    let mut usd: HashMap<Address, f64> = HashMap::new();
    for t in tokens {
        if is_stable(t.symbol) {
            usd.insert(t.address, 1.0);
        }
    }
    // Relaxation: at most `tokens.len()` passes guarantees full propagation.
    for _ in 0..tokens.len() {
        let mut changed = false;
        for (a, b, price_b_per_a) in edges {
            if !is_price_plausible(*price_b_per_a) {
                continue;
            }
            if let Some(usd_b) = usd.get(b).copied() {
                let candidate = price_b_per_a * usd_b;
                if is_price_plausible(candidate) && !usd.contains_key(a) {
                    usd.insert(*a, candidate);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    usd
}

/// Convert a `U256` to `f64` losslessly enough for pricing (via decimal string).
fn u256_to_f64(v: U256) -> f64 {
    v.to_string().parse::<f64>().unwrap_or(f64::INFINITY)
}

/// Uniswap V3 human price of `token1` per `token0` from `sqrtPriceX96`.
///
/// `raw = (sqrtPriceX96 / 2^96)^2 = amount1_raw / amount0_raw`, then scaled by
/// `10^(dec0 - dec1)` into human units.
pub fn v3_price_token1_per_token0(sqrt_price_x96: U256, dec0: u8, dec1: u8) -> f64 {
    let sqrt = u256_to_f64(sqrt_price_x96);
    let q96 = 2f64.powi(96);
    let ratio = sqrt / q96;
    let raw = ratio * ratio; // amount1_raw / amount0_raw
    let decimal_factor = 10f64.powi(dec0 as i32 - dec1 as i32);
    raw * decimal_factor
}

/// UniswapV2/Sushi human price of `token1` per `token0` from reserves.
///
/// `price = (reserve1 / reserve0) * 10^(dec0 - dec1)` in human units. The swap
/// fee is NOT applied here (it is carried in `PoolEdge::fee`).
pub fn v2_price_token1_per_token0(reserve0: U256, reserve1: U256, dec0: u8, dec1: u8) -> f64 {
    let r0 = u256_to_f64(reserve0);
    let r1 = u256_to_f64(reserve1);
    if r0 <= 0.0 {
        return 0.0;
    }
    let decimal_factor = 10f64.powi(dec0 as i32 - dec1 as i32);
    (r1 / r0) * decimal_factor
}

/// A price is "plausible" if finite, strictly positive, and within a wide sane
/// band. Values outside this band almost always signal a decimals/ordering bug
/// (the exact class of bug that fabricates fake huge spreads).
pub fn is_price_plausible(price: f64) -> bool {
    price.is_finite() && price > 1e-15 && price < 1e15
}

/// USD valuation of a pool's liquidity from whichever legs are USD-anchored.
///
/// A balanced AMM pool holds ~equal value per side, so when only one leg is
/// priceable we double that leg's value as an estimate of the whole. When
/// NEITHER leg is USD-anchored the pool is unvaluable and this returns `NaN`,
/// which the fail-closed liquidity gate then rejects.
fn value_pool_liquidity_usd(
    usd0: Option<f64>,
    usd1: Option<f64>,
    human0: f64,
    human1: f64,
) -> f64 {
    match (usd0, usd1) {
        (Some(u0), Some(u1)) => human0 * u0 + human1 * u1,
        (Some(u0), None) => human0 * u0 * 2.0,
        (None, Some(u1)) => human1 * u1 * 2.0,
        (None, None) => f64::NAN,
    }
}

/// Fail-closed liquidity gate: a pool passes ONLY if its USD liquidity is
/// provably finite and at or above the floor. `NaN` (unvaluable) and any
/// sub-threshold value both fail, so a degraded/throttled RPC that cannot value
/// pools produces "no data" rather than a dust-filled mirage graph.
fn passes_liquidity_gate(liquidity_usd: f64, min_liquidity_usd: f64) -> bool {
    liquidity_usd >= min_liquidity_usd
}

/// Static metadata shared by both directional edges of a pool, including the raw
/// integer swap state the Phase 4 simulator needs to model price impact.
struct EdgeMeta<'a> {
    liquidity_usd: f64,
    dex: &'a str,
    is_v3: bool,
    fee: u32,
    router: Address,
    /// Decimals of `token0` / `token1` (the canonical, address-sorted ordering).
    dec0: u8,
    dec1: u8,
    /// V2 raw reserves of `token0` / `token1`; zero for V3.
    reserve0: U256,
    reserve1: U256,
    /// V3 concentrated-liquidity state; defaults for V2.
    sqrt_price_x96: U256,
    liquidity: u128,
    tick: i32,
}

/// Build both directional edges for a pool given the `token1`-per-`token0`
/// human price. Returns `None` if either direction is implausible.
fn build_bidirectional_edges(
    token0: Address,
    token1: Address,
    price1_per_0: f64,
    meta: &EdgeMeta<'_>,
) -> Option<[PoolEdge; 2]> {
    let EdgeMeta {
        liquidity_usd,
        dex,
        is_v3,
        fee,
        router,
        dec0,
        dec1,
        reserve0,
        reserve1,
        sqrt_price_x96,
        liquidity,
        tick,
    } = *meta;
    if !is_price_plausible(price1_per_0) {
        warn!(
            "Skipping {dex} pool {token0:#x}/{token1:#x}: implausible price {price1_per_0:e} (decimals/ordering guard)"
        );
        return None;
    }
    let price0_per_1 = 1.0 / price1_per_0;
    if !is_price_plausible(price0_per_1) {
        warn!(
            "Skipping {dex} pool {token0:#x}/{token1:#x}: implausible inverse price {price0_per_1:e}"
        );
        return None;
    }

    // Forward hop sells token0 for token1 (price DOWN) => zero_for_one = true.
    let forward_state = PoolSwapState {
        dec_in: dec0,
        dec_out: dec1,
        reserve_in: reserve0,
        reserve_out: reserve1,
        sqrt_price_x96,
        liquidity,
        tick,
        zero_for_one: true,
    };
    // Backward hop sells token1 for token0 (price UP) => zero_for_one = false.
    let backward_state = PoolSwapState {
        dec_in: dec1,
        dec_out: dec0,
        reserve_in: reserve1,
        reserve_out: reserve0,
        sqrt_price_x96,
        liquidity,
        tick,
        zero_for_one: false,
    };

    let forward = PoolEdge {
        token_in: token0,
        token_out: token1,
        price: price1_per_0,
        liquidity_usd,
        dex: dex.to_string(),
        network: "arbitrum".to_string(),
        router,
        is_v3,
        fee,
        swap_state: Some(forward_state),
    };
    let backward = PoolEdge {
        token_in: token1,
        token_out: token0,
        price: price0_per_1,
        liquidity_usd,
        dex: dex.to_string(),
        network: "arbitrum".to_string(),
        router,
        is_v3,
        fee,
        swap_state: Some(backward_state),
    };
    Some([forward, backward])
}

// ---------------------------------------------------------------------------
// Resilient JSON-RPC client
// ---------------------------------------------------------------------------

/// A small JSON-RPC client with a request timeout and a bounded retry loop,
/// tuned for a rate-limited free RPC tier. Uses JSON-RPC batch arrays to fold
/// many `eth_call`s into a single HTTP request.
pub struct RpcClient {
    url: String,
    http: reqwest::Client,
    retries: usize,
}

/// One `eth_call` target: contract address + ABI-encoded calldata, tagged with
/// a caller-chosen key so batched results can be matched back.
#[derive(Debug, Clone)]
pub struct Call {
    pub key: usize,
    pub to: Address,
    pub data: Vec<u8>,
}

impl RpcClient {
    pub fn new(url: String, timeout: Duration, retries: usize) -> eyre::Result<Self> {
        let http = reqwest::Client::builder().timeout(timeout).build()?;
        Ok(Self { url, http, retries })
    }

    fn encode_call(to: Address, data: &[u8]) -> Value {
        serde_json::json!({
            "to": format!("{to:#x}"),
            "data": format!("0x{}", hex::encode(data)),
        })
    }

    /// Execute a batch of `eth_call`s. Returns a vector of `(key, result_bytes)`
    /// for every call that returned non-empty data. Missing/failed calls are
    /// simply omitted (they are treated as "pool absent").
    pub async fn batch_eth_call(&self, calls: &[Call]) -> eyre::Result<Vec<(usize, Vec<u8>)>> {
        if calls.is_empty() {
            return Ok(Vec::new());
        }

        let batch: Vec<Value> = calls
            .iter()
            .map(|c| {
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": c.key,
                    "method": "eth_call",
                    "params": [Self::encode_call(c.to, &c.data), "latest"],
                })
            })
            .collect();

        let body = Value::Array(batch);
        let mut last_err = None;

        for attempt in 0..=self.retries {
            match self.post(&body).await {
                Ok(resp) => return Ok(Self::parse_batch(resp)),
                Err(e) => {
                    warn!("RPC batch attempt {} failed: {e}", attempt + 1);
                    last_err = Some(e);
                    // Small backoff for rate limits.
                    tokio::time::sleep(Duration::from_millis(400 * (attempt as u64 + 1))).await;
                }
            }
        }

        Err(last_err.unwrap_or_else(|| eyre::eyre!("RPC batch failed with no error")))
    }

    async fn post(&self, body: &Value) -> eyre::Result<Value> {
        let resp = self.http.post(&self.url).json(body).send().await?;
        let status = resp.status();
        let text = resp.text().await?;
        if !status.is_success() {
            return Err(eyre::eyre!("RPC HTTP {status}: {}", truncate(&text, 200)));
        }
        let json: Value = serde_json::from_str(&text)
            .map_err(|e| eyre::eyre!("RPC bad JSON: {e}: {}", truncate(&text, 200)))?;
        Ok(json)
    }

    fn parse_batch(resp: Value) -> Vec<(usize, Vec<u8>)> {
        let mut out = Vec::new();
        let entries = match resp {
            Value::Array(a) => a,
            other => vec![other],
        };
        for entry in entries {
            let id = entry.get("id").and_then(|v| v.as_u64()).map(|v| v as usize);
            let result = entry.get("result").and_then(|v| v.as_str());
            if let (Some(id), Some(result)) = (id, result) {
                if let Some(bytes) = decode_hex(result) {
                    if !bytes.is_empty() {
                        out.push((id, bytes));
                    }
                }
            } else if let Some(err) = entry.get("error") {
                debug!("RPC call error for id {:?}: {err}", id);
            }
        }
        out
    }

    /// Fetch the latest block number as a liveness/health check.
    pub async fn block_number(&self) -> eyre::Result<u64> {
        let body = serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []
        });
        let resp = self.post(&body).await?;
        let hex = resp
            .get("result")
            .and_then(|v| v.as_str())
            .ok_or_else(|| eyre::eyre!("eth_blockNumber returned no result"))?;
        let n = u64::from_str_radix(hex.trim_start_matches("0x"), 16)?;
        Ok(n)
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

fn decode_hex(s: &str) -> Option<Vec<u8>> {
    let s = s.trim_start_matches("0x");
    hex::decode(s).ok()
}

// ---------------------------------------------------------------------------
// ABI encoding helpers (minimal, no external ABI crate needed)
// ---------------------------------------------------------------------------

fn encode_address(a: Address) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[12..].copy_from_slice(a.as_bytes());
    out
}

fn encode_uint24(v: u32) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[29] = (v >> 16) as u8;
    out[30] = (v >> 8) as u8;
    out[31] = v as u8;
    out
}

fn calldata_get_pool(token_a: Address, token_b: Address, fee: u32) -> Vec<u8> {
    let mut data = Vec::with_capacity(4 + 96);
    data.extend_from_slice(&SEL_GET_POOL);
    data.extend_from_slice(&encode_address(token_a));
    data.extend_from_slice(&encode_address(token_b));
    data.extend_from_slice(&encode_uint24(fee));
    data
}

fn calldata_get_pair(token_a: Address, token_b: Address) -> Vec<u8> {
    let mut data = Vec::with_capacity(4 + 64);
    data.extend_from_slice(&SEL_GET_PAIR);
    data.extend_from_slice(&encode_address(token_a));
    data.extend_from_slice(&encode_address(token_b));
    data
}

fn calldata_balance_of(holder: Address) -> Vec<u8> {
    let mut data = Vec::with_capacity(4 + 32);
    data.extend_from_slice(&SEL_BALANCE_OF);
    data.extend_from_slice(&encode_address(holder));
    data
}

/// Decode a single uint256 return word.
fn decode_uint256(bytes: &[u8]) -> Option<U256> {
    if bytes.len() < 32 {
        return None;
    }
    Some(U256::from_big_endian(&bytes[0..32]))
}

/// Decode a 32-byte-aligned address from an ABI return word.
fn decode_address(bytes: &[u8]) -> Option<Address> {
    if bytes.len() < 32 {
        return None;
    }
    Some(Address::from_slice(&bytes[12..32]))
}

/// Decode `slot0()` into `(sqrtPriceX96, tick)`. The second 32-byte word holds
/// the current `int24` tick, sign-extended to 256 bits, so we read the low three
/// bytes and sign-extend from bit 23.
fn decode_slot0_sqrt_price_and_tick(bytes: &[u8]) -> Option<(U256, i32)> {
    if bytes.len() < 64 {
        return None;
    }
    let sqrt = U256::from_big_endian(&bytes[0..32]);
    let w1 = &bytes[32..64];
    let mut tick =
        ((w1[29] as i32) << 16) | ((w1[30] as i32) << 8) | (w1[31] as i32);
    if tick & 0x0080_0000 != 0 {
        // Negative int24: sign-extend into the upper bits of the i32.
        tick |= !0x00FF_FFFFi32;
    }
    Some((sqrt, tick))
}

/// Decode a `uint128` return word (e.g. `liquidity()`), taking the low 128 bits.
fn decode_uint128(bytes: &[u8]) -> Option<u128> {
    decode_uint256(bytes).map(|v| v.low_u128())
}

/// Decode `getReserves()` -> (reserve0 uint112, reserve1 uint112, ...).
fn decode_reserves(bytes: &[u8]) -> Option<(U256, U256)> {
    if bytes.len() < 64 {
        return None;
    }
    let r0 = U256::from_big_endian(&bytes[0..32]);
    let r1 = U256::from_big_endian(&bytes[32..64]);
    Some((r0, r1))
}

// ---------------------------------------------------------------------------
// Discovery + state read
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct PoolCandidate {
    token0: Address,
    token1: Address,
    dec0: u8,
    dec1: u8,
    is_v3: bool,
    fee: u32,
    dex: String,
    factory: Address,
}

/// Sort a pair by ascending address to match on-chain `token0`/`token1`.
fn sorted_pair(a: TokenInfo, b: TokenInfo) -> (TokenInfo, TokenInfo) {
    if a.address < b.address {
        (a, b)
    } else {
        (b, a)
    }
}

/// Fetch a full set of live Arbitrum pool edges across Uniswap V3 (500/3000/
/// 10000 tiers) and SushiSwap V2 for the registered token universe.
pub async fn fetch_arbitrum_pools(rpc_url: &str) -> eyre::Result<Vec<PoolEdge>> {
    Ok(fetch_arbitrum_pools_with_usd(rpc_url).await?.0)
}

/// Like [`fetch_arbitrum_pools`] but also returns the derived per-token USD price
/// map (stablecoins anchored at $1, relaxed across observed edge prices). Phase 4
/// uses this map to size a USD flash-loan into the start token's raw base units
/// before running the price-impact simulator.
pub async fn fetch_arbitrum_pools_with_usd(
    rpc_url: &str,
) -> eyre::Result<(Vec<PoolEdge>, std::collections::HashMap<Address, f64>)> {
    let (edges, usd_prices, _block) = fetch_arbitrum_pools_with_usd_at_block(rpc_url).await?;
    Ok((edges, usd_prices))
}

/// Like [`fetch_arbitrum_pools_with_usd`] but also returns the Arbitrum block
/// number the pool state was read at, so a caller (e.g. the Phase 7 multi-block
/// sampler) can report each sample's block honestly. This is the canonical
/// implementation; the two-tuple variant above simply drops the block.
pub async fn fetch_arbitrum_pools_with_usd_at_block(
    rpc_url: &str,
) -> eyre::Result<(Vec<PoolEdge>, std::collections::HashMap<Address, f64>, u64)> {
    let client = RpcClient::new(rpc_url.to_string(), Duration::from_secs(15), 2)?;

    // Liveness check first so failures are clear and early.
    let block = client.block_number().await?;
    info!("Connected to Arbitrum RPC at block {block}");

    let tokens = arbitrum_tokens();
    let v3_factory = addr(UNISWAP_V3_FACTORY);
    let sushi_factory = addr(SUSHISWAP_V2_FACTORY);

    // 1) Build discovery candidates for every unordered token pair.
    let mut candidates: Vec<PoolCandidate> = Vec::new();
    for i in 0..tokens.len() {
        for j in (i + 1)..tokens.len() {
            let (t0, t1) = sorted_pair(tokens[i], tokens[j]);
            for fee in V3_FEE_TIERS {
                candidates.push(PoolCandidate {
                    token0: t0.address,
                    token1: t1.address,
                    dec0: t0.decimals,
                    dec1: t1.decimals,
                    is_v3: true,
                    fee,
                    dex: "uniswap-v3".to_string(),
                    factory: v3_factory,
                });
            }
            candidates.push(PoolCandidate {
                token0: t0.address,
                token1: t1.address,
                dec0: t0.decimals,
                dec1: t1.decimals,
                is_v3: false,
                fee: V2_FEE_PPM,
                dex: "sushiswap".to_string(),
                factory: sushi_factory,
            });
        }
    }

    // 2) Discover pool addresses via factory getPool/getPair (batched).
    let discovery_calls: Vec<Call> = candidates
        .iter()
        .enumerate()
        .map(|(idx, c)| Call {
            key: idx,
            to: c.factory,
            data: if c.is_v3 {
                calldata_get_pool(c.token0, c.token1, c.fee)
            } else {
                calldata_get_pair(c.token0, c.token1)
            },
        })
        .collect();

    let (discovery_results, discovery_failed) = batch_in_chunks(&client, &discovery_calls, 40).await;
    if !discovery_calls.is_empty()
        && discovery_failed as f64 / discovery_calls.len() as f64 > MAX_BATCH_FAILURE_FRACTION
    {
        return Err(eyre::eyre!(
            "Aborting: {}/{} pool-discovery calls failed (> {:.0}%); RPC appears degraded/throttled. \
             Refusing to build a partial pool graph.",
            discovery_failed,
            discovery_calls.len(),
            MAX_BATCH_FAILURE_FRACTION * 100.0
        ));
    }

    // idx -> pool address
    let mut pools: Vec<(PoolCandidate, Address)> = Vec::new();
    for (idx, bytes) in discovery_results {
        if let Some(pool_addr) = decode_address(&bytes) {
            if pool_addr != Address::zero() {
                pools.push((candidates[idx].clone(), pool_addr));
            }
        }
    }
    info!(
        "Discovered {} live pools out of {} probed pair/venue combinations",
        pools.len(),
        candidates.len()
    );

    // 3) Read state for each discovered pool (batched). Per pool we issue THREE
    //    calls, keyed `idx*3 + {0,1,2}`:
    //      +0: price   (slot0 for V3, getReserves for V2)
    //      +1: balanceOf(pool) on token0  -> real on-chain reserve of token0
    //      +2: balanceOf(pool) on token1  -> real on-chain reserve of token1
    //      +3: liquidity() (V3 only)      -> in-range L for concentrated swap math
    //    Balances let us value pool liquidity in USD and skip dust pools whose
    //    stale marginal price would otherwise manufacture fake spreads. The
    //    stride-4 keying leaves the +3 slot unused for V2 pools.
    let mut state_calls: Vec<Call> = Vec::with_capacity(pools.len() * 4);
    for (idx, (c, pool_addr)) in pools.iter().enumerate() {
        state_calls.push(Call {
            key: idx * 4,
            to: *pool_addr,
            data: if c.is_v3 {
                SEL_SLOT0.to_vec()
            } else {
                SEL_GET_RESERVES.to_vec()
            },
        });
        state_calls.push(Call {
            key: idx * 4 + 1,
            to: c.token0,
            data: calldata_balance_of(*pool_addr),
        });
        state_calls.push(Call {
            key: idx * 4 + 2,
            to: c.token1,
            data: calldata_balance_of(*pool_addr),
        });
        if c.is_v3 {
            state_calls.push(Call {
                key: idx * 4 + 3,
                to: *pool_addr,
                data: SEL_LIQUIDITY.to_vec(),
            });
        }
    }

    let (state_results, state_failed) = batch_in_chunks(&client, &state_calls, 60).await;
    if !state_calls.is_empty()
        && state_failed as f64 / state_calls.len() as f64 > MAX_BATCH_FAILURE_FRACTION
    {
        return Err(eyre::eyre!(
            "Aborting: {}/{} pool state/balance calls failed (> {:.0}%); RPC appears degraded/throttled. \
             Refusing to build a partial pool graph (this is exactly the condition that let the dust \
             guard go inert and surface mirage cycles).",
            state_failed,
            state_calls.len(),
            MAX_BATCH_FAILURE_FRACTION * 100.0
        ));
    }

    // Fold results back per pool index.
    let mut price_bytes: std::collections::HashMap<usize, Vec<u8>> = std::collections::HashMap::new();
    let mut bal0: std::collections::HashMap<usize, U256> = std::collections::HashMap::new();
    let mut bal1: std::collections::HashMap<usize, U256> = std::collections::HashMap::new();
    let mut v3_liquidity: std::collections::HashMap<usize, u128> = std::collections::HashMap::new();
    for (key, bytes) in state_results {
        match key % 4 {
            0 => {
                price_bytes.insert(key / 4, bytes);
            }
            1 => {
                if let Some(v) = decode_uint256(&bytes) {
                    bal0.insert(key / 4, v);
                }
            }
            2 => {
                if let Some(v) = decode_uint256(&bytes) {
                    bal1.insert(key / 4, v);
                }
            }
            _ => {
                if let Some(v) = decode_uint128(&bytes) {
                    v3_liquidity.insert(key / 4, v);
                }
            }
        }
    }

    // 4) Compute each pool's `token1_per_token0` price + human reserves + the raw
    //    integer swap state (V2 reserves / V3 sqrtPrice+L+tick) the simulator needs.
    struct PricedPool {
        candidate: PoolCandidate,
        pool_addr: Address,
        price1_per_0: f64,
        human0: f64,
        human1: f64,
        /// V2 raw reserves (reserve0, reserve1); zero for V3.
        reserve0: U256,
        reserve1: U256,
        /// V3 concentrated-liquidity state; defaults for V2.
        sqrt_price_x96: U256,
        liquidity: u128,
        tick: i32,
    }
    let mut priced: Vec<PricedPool> = Vec::new();
    for (idx, (candidate, pool_addr)) in pools.iter().enumerate() {
        let Some(bytes) = price_bytes.get(&idx) else { continue };
        let mut reserve0 = U256::zero();
        let mut reserve1 = U256::zero();
        let mut sqrt_price_x96 = U256::zero();
        let mut liquidity = 0u128;
        let mut tick = 0i32;
        let price1_per_0 = if candidate.is_v3 {
            match decode_slot0_sqrt_price_and_tick(bytes) {
                Some((sqrt, tk)) => {
                    // A V3 pool with no in-range liquidity cannot be simulated; a
                    // missing liquidity() read must NOT be treated as zero and let
                    // through, so require it to have decoded.
                    let Some(l) = v3_liquidity.get(&idx).copied() else {
                        debug!(
                            "Skipping {} pool {:#x}/{:#x}: missing liquidity() result (degraded RPC)",
                            candidate.dex, candidate.token0, candidate.token1
                        );
                        continue;
                    };
                    sqrt_price_x96 = sqrt;
                    liquidity = l;
                    tick = tk;
                    v3_price_token1_per_token0(sqrt, candidate.dec0, candidate.dec1)
                }
                None => continue,
            }
        } else {
            match decode_reserves(bytes) {
                Some((r0, r1)) => {
                    reserve0 = r0;
                    reserve1 = r1;
                    v2_price_token1_per_token0(r0, r1, candidate.dec0, candidate.dec1)
                }
                None => continue,
            }
        };
        if !is_price_plausible(price1_per_0) {
            warn!(
                "Skipping {} pool {:#x}/{:#x}: implausible price {price1_per_0:e} (decimals/ordering guard)",
                candidate.dex, candidate.token0, candidate.token1
            );
            continue;
        }
        // Require BOTH balance reads to have decoded. A dropped balanceOf on a
        // degraded RPC must NOT be silently treated as a zero reserve — skip the
        // pool so it can never be valued (and emitted) from partial data.
        let (Some(raw0), Some(raw1)) = (bal0.get(&idx), bal1.get(&idx)) else {
            debug!(
                "Skipping {} pool {:#x}/{:#x}: missing balanceOf result(s) (degraded RPC)",
                candidate.dex, candidate.token0, candidate.token1
            );
            continue;
        };
        let human0 = to_human(*raw0, candidate.dec0);
        let human1 = to_human(*raw1, candidate.dec1);
        priced.push(PricedPool {
            candidate: candidate.clone(),
            pool_addr: *pool_addr,
            price1_per_0,
            human0,
            human1,
            reserve0,
            reserve1,
            sqrt_price_x96,
            liquidity,
            tick,
        });
    }

    // 5) Derive live USD prices for every token from stablecoin anchors, using
    //    the observed edge prices (both directions).
    let mut price_edges: Vec<(Address, Address, f64)> = Vec::new();
    for p in &priced {
        price_edges.push((p.candidate.token0, p.candidate.token1, p.price1_per_0));
        price_edges.push((p.candidate.token1, p.candidate.token0, 1.0 / p.price1_per_0));
    }
    let usd_prices = derive_usd_prices(&tokens, &price_edges);

    let min_liquidity_usd = std::env::var("SCANNER_MIN_POOL_LIQUIDITY_USD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_MIN_POOL_LIQUIDITY_USD);

    // 6) Build bidirectional edges, valuing liquidity and skipping dust pools.
    let mut edges: Vec<PoolEdge> = Vec::new();
    let mut priced_pools = 0usize;
    let mut skipped_dust = 0usize;
    let mut unpriced_liquidity = 0usize;
    for p in &priced {
        let usd0 = usd_prices.get(&p.candidate.token0).copied();
        let usd1 = usd_prices.get(&p.candidate.token1).copied();
        if usd0.is_none() && usd1.is_none() {
            unpriced_liquidity += 1;
        }
        // Liquidity in USD from whichever legs we can value; NaN when neither
        // leg is USD-anchored (cannot value -> must fail closed below).
        let liquidity_usd = value_pool_liquidity_usd(usd0, usd1, p.human0, p.human1);

        // FAIL CLOSED: skip anything not provably at or above the floor. NaN
        // (unvaluable / no USD-anchored leg) and any sub-threshold value are
        // both excluded, so a degraded RPC cannot let dust/mirage pools through.
        if !passes_liquidity_gate(liquidity_usd, min_liquidity_usd) {
            skipped_dust += 1;
            debug!(
                "Skipping {} pool {:#x}/{:#x}: liquidity {} not >= ${:.0} (fail-closed)",
                p.candidate.dex,
                p.candidate.token0,
                p.candidate.token1,
                if liquidity_usd.is_finite() {
                    format!("${liquidity_usd:.2}")
                } else {
                    "unvaluable".to_string()
                },
                min_liquidity_usd
            );
            continue;
        }

        if let Some(pair) = build_bidirectional_edges(
            p.candidate.token0,
            p.candidate.token1,
            p.price1_per_0,
            &EdgeMeta {
                liquidity_usd,
                dex: &p.candidate.dex,
                is_v3: p.candidate.is_v3,
                fee: p.candidate.fee,
                router: p.pool_addr,
                dec0: p.candidate.dec0,
                dec1: p.candidate.dec1,
                reserve0: p.reserve0,
                reserve1: p.reserve1,
                sqrt_price_x96: p.sqrt_price_x96,
                liquidity: p.liquidity,
                tick: p.tick,
            },
        ) {
            priced_pools += 1;
            edges.extend(pair);
        }
    }

    info!(
        "Built {} directional edges from {} pools (fail-closed: skipped {} dust/unvaluable pools not >= ${:.0}; {} of those had no USD-anchored leg)",
        edges.len(),
        priced_pools,
        skipped_dust,
        min_liquidity_usd,
        unpriced_liquidity
    );

    Ok((edges, usd_prices, block))
}

/// Split a large set of calls into fixed-size batches to stay friendly with
/// rate limits and payload-size limits. Chunks run sequentially (modest
/// concurrency) to avoid hammering a free RPC tier.
///
/// Returns the decoded results alongside the number of individual calls that
/// belonged to a chunk that failed outright — callers use that count to detect
/// a degraded/throttled RPC and fail closed rather than emitting a graph built
/// from partial data.
async fn batch_in_chunks(
    client: &RpcClient,
    calls: &[Call],
    chunk_size: usize,
) -> (Vec<(usize, Vec<u8>)>, usize) {
    let mut out = Vec::new();
    let mut failed_calls = 0usize;
    for chunk in calls.chunks(chunk_size) {
        match client.batch_eth_call(chunk).await {
            Ok(mut results) => out.append(&mut results),
            Err(e) => {
                failed_calls += chunk.len();
                warn!("Batch chunk failed (skipping {} calls): {e}", chunk.len());
            }
        }
    }
    (out, failed_calls)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q96() -> f64 {
        2f64.powi(96)
    }

    #[test]
    fn v3_price_equal_decimals_unit() {
        // sqrtPriceX96 == 2^96 encodes raw price 1.0; equal decimals -> 1.0.
        let sqrt = U256::from_big_endian(&{
            let mut b = [0u8; 32];
            U256::from(2u64).pow(U256::from(96)).to_big_endian(&mut b);
            b
        });
        let p = v3_price_token1_per_token0(sqrt, 18, 18);
        assert!((p - 1.0).abs() < 1e-9, "expected 1.0, got {p}");
    }

    #[test]
    fn v3_price_encodes_four() {
        // sqrtPriceX96 = 2 * 2^96 -> raw ratio 2, squared = 4.0 (equal decimals).
        let sqrt = U256::from(2u64) * U256::from(2u64).pow(U256::from(96));
        let p = v3_price_token1_per_token0(sqrt, 18, 18);
        assert!((p - 4.0).abs() < 1e-6, "expected 4.0, got {p}");
    }

    #[test]
    fn v3_price_applies_decimal_factor() {
        // Same raw ratio 1.0, but token0 has 6 decimals and token1 has 18.
        // Human price = 1.0 * 10^(6-18) = 1e-12.
        let sqrt = U256::from(2u64).pow(U256::from(96));
        let p = v3_price_token1_per_token0(sqrt, 6, 18);
        assert!((p - 1e-12).abs() < 1e-24, "expected 1e-12, got {p:e}");
    }

    #[test]
    fn v3_realistic_weth_usdc_ordering() {
        // Construct a sqrtPriceX96 for a raw ratio, then confirm the decimal
        // adjustment yields a human WETH price near 3000 when token0=USDC(6),
        // token1=WETH(18): we want token1_per_token0 (WETH per USDC) ~= 1/3000,
        // so raw = (1/3000) * 10^(18-6) = 1e12/3000.
        let target_human = 1.0f64 / 3000.0; // WETH per USDC
        let raw = target_human * 10f64.powi(18 - 6); // undo the 10^(dec0-dec1) factor
        let sqrt_ratio = raw.sqrt();
        let sqrt_price = sqrt_ratio * q96();
        let sqrt = U256::from((sqrt_price) as u128);
        let p = v3_price_token1_per_token0(sqrt, 6, 18);
        // Within 0.1% of the intended human price.
        assert!((p - target_human).abs() / target_human < 1e-3, "got {p:e}");
    }

    #[test]
    fn v2_price_equal_decimals() {
        // reserve0=1000, reserve1=2000, equal decimals -> price01=2, price10=0.5.
        let p01 = v2_price_token1_per_token0(U256::from(1000u64), U256::from(2000u64), 18, 18);
        assert!((p01 - 2.0).abs() < 1e-9, "got {p01}");
        let p10 = v2_price_token1_per_token0(U256::from(2000u64), U256::from(1000u64), 18, 18);
        assert!((p10 - 0.5).abs() < 1e-9, "got {p10}");
    }

    #[test]
    fn v2_price_applies_decimals() {
        // token0 = USDC (6 dec) reserve 1000 USDC = 1e9 raw.
        // token1 = WETH (18 dec) reserve 1 WETH  = 1e18 raw.
        // price token0->token1 (WETH per USDC) = (1e18/1e9)*10^(6-18) = 1e-3.
        let r0 = U256::from(1_000_000_000u64); // 1e9
        let r1 = U256::exp10(18); // 1e18
        let p01 = v2_price_token1_per_token0(r0, r1, 6, 18);
        assert!((p01 - 1e-3).abs() < 1e-9, "expected 1e-3, got {p01:e}");
        // Inverse: USDC per WETH = 1000.
        let p10 = v2_price_token1_per_token0(r1, r0, 18, 6);
        assert!((p10 - 1000.0).abs() < 1e-6, "expected 1000, got {p10}");
    }

    #[test]
    fn plausibility_guard_rejects_extremes() {
        assert!(is_price_plausible(1.0));
        assert!(is_price_plausible(3000.0));
        assert!(is_price_plausible(1.0 / 3000.0));
        assert!(!is_price_plausible(0.0));
        assert!(!is_price_plausible(-1.0));
        assert!(!is_price_plausible(f64::NAN));
        assert!(!is_price_plausible(f64::INFINITY));
        assert!(!is_price_plausible(1e20));
        assert!(!is_price_plausible(1e-20));
    }

    #[test]
    fn bidirectional_edges_are_reciprocal() {
        let t0 = addr("0x0000000000000000000000000000000000000001");
        let t1 = addr("0x0000000000000000000000000000000000000002");
        let pair = build_bidirectional_edges(
            t0,
            t1,
            2000.0,
            &EdgeMeta {
                liquidity_usd: 0.0,
                dex: "uniswap-v3",
                is_v3: true,
                fee: 500,
                router: Address::zero(),
                dec0: 18,
                dec1: 6,
                reserve0: U256::zero(),
                reserve1: U256::zero(),
                sqrt_price_x96: U256::zero(),
                liquidity: 0,
                tick: 0,
            },
        )
        .expect("plausible");
        assert_eq!(pair[0].token_in, t0);
        assert_eq!(pair[0].token_out, t1);
        assert!((pair[0].price - 2000.0).abs() < 1e-9);
        assert_eq!(pair[1].token_in, t1);
        assert_eq!(pair[1].token_out, t0);
        assert!((pair[1].price - 1.0 / 2000.0).abs() < 1e-12);
        // Swap state is populated and direction-correct.
        let fwd = pair[0].swap_state.as_ref().unwrap();
        let bwd = pair[1].swap_state.as_ref().unwrap();
        assert!(fwd.zero_for_one);
        assert!(!bwd.zero_for_one);
        assert_eq!(fwd.dec_in, 18);
        assert_eq!(bwd.dec_in, 6);
    }

    #[test]
    fn encode_uint24_layout() {
        let e = encode_uint24(3000);
        assert_eq!(e[29], 0x00);
        assert_eq!(e[30], 0x0b);
        assert_eq!(e[31], 0xb8); // 3000 = 0x0BB8
    }

    #[test]
    fn sorted_pair_orders_by_address() {
        let a = TokenInfo { symbol: "A", address: addr("0x0000000000000000000000000000000000000002"), decimals: 18 };
        let b = TokenInfo { symbol: "B", address: addr("0x0000000000000000000000000000000000000001"), decimals: 6 };
        let (t0, t1) = sorted_pair(a, b);
        assert_eq!(t0.symbol, "B");
        assert_eq!(t1.symbol, "A");
    }

    #[test]
    fn to_human_applies_decimals() {
        // 1 WBTC = 1e8 raw at 8 decimals.
        assert!((to_human(U256::from(100_000_000u64), 8) - 1.0).abs() < 1e-9);
        // 1 USDC = 1e6 raw at 6 decimals.
        assert!((to_human(U256::from(1_000_000u64), 6) - 1.0).abs() < 1e-9);
        // 1 DAI = 1e18 raw at 18 decimals.
        assert!((to_human(U256::exp10(18), 18) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn derive_usd_prices_propagates_from_stables() {
        let weth = TokenInfo { symbol: "WETH", address: addr("0x0000000000000000000000000000000000000010"), decimals: 18 };
        let usdc = TokenInfo { symbol: "USDC", address: addr("0x0000000000000000000000000000000000000020"), decimals: 6 };
        let arb = TokenInfo { symbol: "ARB", address: addr("0x0000000000000000000000000000000000000030"), decimals: 18 };
        let tokens = vec![weth, usdc, arb];

        // Edge prices are token_out per token_in (human units):
        //   WETH -> USDC at 3000 USDC/WETH  => usd(WETH) = 3000 * 1 = 3000
        //   ARB  -> WETH at 0.0005 WETH/ARB => usd(ARB)  = 0.0005 * 3000 = 1.5
        let edges = vec![
            (weth.address, usdc.address, 3000.0),
            (usdc.address, weth.address, 1.0 / 3000.0),
            (arb.address, weth.address, 0.0005),
            (weth.address, arb.address, 1.0 / 0.0005),
        ];
        let usd = derive_usd_prices(&tokens, &edges);
        assert!((usd[&usdc.address] - 1.0).abs() < 1e-9);
        assert!((usd[&weth.address] - 3000.0).abs() < 1e-6, "got {}", usd[&weth.address]);
        assert!((usd[&arb.address] - 1.5).abs() < 1e-6, "got {}", usd[&arb.address]);
    }

    #[test]
    fn is_stable_recognizes_registry_stables() {
        assert!(is_stable("USDC"));
        assert!(is_stable("USDCe"));
        assert!(is_stable("USDT"));
        assert!(is_stable("DAI"));
        assert!(!is_stable("WETH"));
        assert!(!is_stable("WBTC"));
    }

    #[test]
    fn registry_has_expected_decimals() {
        let t = arbitrum_tokens();
        let d = |sym: &str| t.iter().find(|x| x.symbol == sym).unwrap().decimals;
        assert_eq!(d("USDC"), 6);
        assert_eq!(d("USDCe"), 6);
        assert_eq!(d("USDT"), 6);
        assert_eq!(d("WBTC"), 8);
        assert_eq!(d("WETH"), 18);
        assert_eq!(d("DAI"), 18);
        assert_eq!(d("ARB"), 18);
    }

    #[test]
    fn liquidity_gate_excludes_unvaluable_nan() {
        // FAIL CLOSED: a pool we cannot value (no USD-anchored leg -> NaN) must
        // be rejected, never passed. This is the degraded-RPC mirage guard.
        let liq = value_pool_liquidity_usd(None, None, 1_000.0, 1_000.0);
        assert!(liq.is_nan(), "no USD-anchored leg must yield NaN");
        assert!(
            !passes_liquidity_gate(liq, DEFAULT_MIN_POOL_LIQUIDITY_USD),
            "unvaluable/NaN liquidity must be excluded (fail-closed)"
        );
        // Explicit NaN also fails the gate directly.
        assert!(!passes_liquidity_gate(f64::NAN, DEFAULT_MIN_POOL_LIQUIDITY_USD));
    }

    #[test]
    fn liquidity_gate_excludes_below_threshold() {
        // A genuinely valued but sub-threshold (dust) pool is excluded.
        let liq = value_pool_liquidity_usd(Some(1.0), Some(1.0), 10.0, 10.0);
        assert!((liq - 20.0).abs() < 1e-9);
        assert!(
            !passes_liquidity_gate(liq, DEFAULT_MIN_POOL_LIQUIDITY_USD),
            "finite liquidity below the floor must be excluded"
        );
    }

    #[test]
    fn liquidity_gate_admits_at_or_above_threshold() {
        // At/above the floor a valuable pool passes; single-leg valuation doubles.
        let both = value_pool_liquidity_usd(Some(1.0), Some(2000.0), 5_000.0, 5.0);
        assert!((both - 15_000.0).abs() < 1e-9);
        assert!(passes_liquidity_gate(both, DEFAULT_MIN_POOL_LIQUIDITY_USD));

        let one_leg = value_pool_liquidity_usd(Some(1.0), None, 4_000.0, 1.5);
        assert!((one_leg - 8_000.0).abs() < 1e-9, "single priceable leg doubles");
        assert!(passes_liquidity_gate(one_leg, DEFAULT_MIN_POOL_LIQUIDITY_USD));

        // Exactly at the floor passes (>=).
        assert!(passes_liquidity_gate(
            DEFAULT_MIN_POOL_LIQUIDITY_USD,
            DEFAULT_MIN_POOL_LIQUIDITY_USD
        ));
    }
}
