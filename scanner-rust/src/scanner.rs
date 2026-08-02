use std::collections::{HashMap, HashSet};

use chrono::Utc;
use ethers::types::Address;
use ethers::utils::to_checksum;
use sha2::{Digest, Sha256};
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::config::Config;
use crate::types::{
    CanonicalExecutionPayload, CanonicalOpportunity, ConfidenceTier, OpportunityStatus,
    PoolEdge, QuoteParityPayload, SourceFlags, CANONICAL_OPPORTUNITY_VERSION,
};

type NodeId = usize;

#[derive(Debug, Clone)]
struct GraphEdge {
    from: NodeId,
    to: NodeId,
    weight: f64,
    pool: PoolEdge,
}

#[derive(Debug, Clone)]
pub struct ArbitrageCycle {
    pub edges: Vec<PoolEdge>,
    /// Round-trip output/input ratio for the cycle. Because edge weights are
    /// fee-aware (`-ln(price * (1 - fee))`), this ratio is already NET of every
    /// per-hop DEX swap fee, but still GROSS of the fixed costs (Aave premium +
    /// gas) that are applied later by [`compute_net_profit`].
    pub profit_ratio: f64,
}

/// Breakdown of a cycle's economics once the fixed costs that a per-hop
/// multiplicative fee cannot capture are applied.
#[derive(Debug, Clone, Copy)]
pub struct NetProfitBreakdown {
    /// Profit after per-hop DEX swap fees, before fixed costs (USD).
    pub gross_after_swap_fees_usd: f64,
    /// Aave flash-loan premium charged on the borrowed amount (USD).
    pub aave_premium_usd: f64,
    /// Estimated fixed gas cost (USD).
    pub gas_cost_usd: f64,
    /// Final net profit = gross_after_swap_fees - aave_premium - gas (USD).
    pub net_profit_usd: f64,
}

/// Applies the fixed costs a per-hop swap fee cannot express — the Aave
/// flash-loan premium (charged on the borrowed principal) and estimated gas —
/// to a cycle whose `profit_ratio` is already net of swap fees.
///
/// `net = loan * (profit_ratio - 1) - loan * aave_premium_bps/10_000 - gas`.
pub fn compute_net_profit(
    profit_ratio: f64,
    loan_usd: f64,
    aave_premium_bps: f64,
    gas_cost_usd: f64,
) -> NetProfitBreakdown {
    let gross_after_swap_fees_usd = loan_usd * (profit_ratio - 1.0);
    let aave_premium_usd = loan_usd * (aave_premium_bps / 10_000.0);
    let net_profit_usd = gross_after_swap_fees_usd - aave_premium_usd - gas_cost_usd;
    NetProfitBreakdown {
        gross_after_swap_fees_usd,
        aave_premium_usd,
        gas_cost_usd,
        net_profit_usd,
    }
}

pub struct Scanner {
    config: Config,
}

impl Scanner {
    pub async fn new(config: Config) -> eyre::Result<Self> {
        info!("Initializing MEV Scanner");
        Ok(Self { config })
    }

    /// Fetch the current pool graph. Phase 3 prefers a LIVE Arbitrum multi-DEX
    /// feed whenever an RPC endpoint is resolvable (from the `arbitrum` network
    /// config, or `SCANNER_RPC_URL` / `ARBITRUM_RPC_URL` / `ALCHEMY_API_KEY`).
    /// When no endpoint is configured it falls back to clearly-labeled synthetic
    /// demo pools rather than crashing — no RPC key is ever hardcoded.
    pub async fn fetch_pools(&self) -> eyre::Result<Vec<PoolEdge>> {
        let rpc_url = self
            .config
            .networks
            .iter()
            .find(|(name, _)| name == "arbitrum")
            .map(|(_, net)| net.rpc_url.clone())
            .or_else(crate::config::resolve_arbitrum_rpc_url);

        match rpc_url {
            Some(url) => {
                info!("Fetching LIVE Arbitrum pool state via configured RPC");
                crate::pools::fetch_arbitrum_pools(&url).await
            }
            None => {
                warn!(
                    "No Arbitrum RPC configured (set SCANNER_RPC_URL, ARBITRUM_RPC_URL, or ALCHEMY_API_KEY); \
                     falling back to SYNTHETIC demo pools — this is NOT live data"
                );
                Ok(self.fetch_synthetic_pools())
            }
        }
    }

    fn fetch_synthetic_pools(&self) -> Vec<PoolEdge> {
        let weth: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".parse().unwrap_or_default();
        let usdc: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".parse().unwrap_or_default();
        let usdt: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7".parse().unwrap_or_default();
        let uni_v3: Address = "0xE592427A0AEce92De3Edee1F18E0157C05861564".parse().unwrap_or_default();
        let sushi_v2: Address = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F".parse().unwrap_or_default();
        let curve_router: Address = "0x1111111254EEB25477B68fb85Ed929f73A960582".parse().unwrap_or_default();

        vec![
            PoolEdge {
                token_in: weth,
                token_out: usdc,
                price: 2000.0,
                liquidity_usd: 5_000_000.0,
                dex: "uniswap-v3".to_string(),
                network: "ethereum".to_string(),
                router: uni_v3,
                is_v3: true,
                fee: 500,
                swap_state: None,
            },
            PoolEdge {
                token_in: usdc,
                token_out: weth,
                price: 1.0 / 1970.0,
                liquidity_usd: 3_500_000.0,
                dex: "sushiswap".to_string(),
                network: "ethereum".to_string(),
                router: sushi_v2,
                is_v3: false,
                fee: 3000,
                swap_state: None,
            },
            PoolEdge {
                token_in: usdc,
                token_out: usdt,
                price: 1.0001,
                liquidity_usd: 10_000_000.0,
                dex: "uniswap-v3".to_string(),
                network: "ethereum".to_string(),
                router: uni_v3,
                is_v3: true,
                fee: 100,
                swap_state: None,
            },
            PoolEdge {
                token_in: usdt,
                token_out: usdc,
                price: 0.9998,
                liquidity_usd: 8_000_000.0,
                dex: "curve".to_string(),
                network: "ethereum".to_string(),
                router: curve_router,
                is_v3: false,
                fee: 0,
                swap_state: None,
            },
        ]
    }

    pub fn detect_arbitrage(&self, pools: &[PoolEdge]) -> eyre::Result<Vec<CanonicalOpportunity>> {
        info!("Running Bellman-Ford arbitrage detection on {} pool edges", pools.len());

        let cycles = bellman_ford_detect_cycles(pools);
        let scan_run_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let mut opportunities = Vec::new();

        for cycle in cycles {
            if cycle.edges.len() < 2 {
                continue;
            }

            let first = &cycle.edges[0];
            let last = cycle.edges.last().expect("cycle has last edge");
            let asset_price = infer_usd_price(first.token_in);
            let asset_decimals = infer_decimals(first.token_in);
            let token_b_decimals = infer_decimals(first.token_out);

            let loan_usd = self.config.loan_amount_usd;
            // `profit_ratio` is already net of per-hop swap fees; apply the
            // fixed costs (Aave premium on the borrowed principal + gas) here as
            // the final net-profit gate before an opportunity is emitted.
            let net = compute_net_profit(
                cycle.profit_ratio,
                loan_usd,
                self.config.aave_premium_bps,
                self.config.gas_cost_usd,
            );
            let gross_profit_usd = net.gross_after_swap_fees_usd;
            let aave_premium_usd = net.aave_premium_usd;
            let gas_cost_usd = net.gas_cost_usd;
            let net_profit_usd = net.net_profit_usd;

            if net_profit_usd <= 0.0 {
                debug!(
                    "Cycle discarded: net profit {:.4} <= 0 after swap fees, Aave premium ({:.4}) and gas ({:.4})",
                    net_profit_usd, aave_premium_usd, gas_cost_usd
                );
                continue;
            }

            let spread_bps = ((cycle.profit_ratio - 1.0) * 10_000.0).max(0.0) as u32;
            let spread_pct = (cycle.profit_ratio - 1.0) * 100.0;
            let (status, reason_code) = if net_profit_usd >= self.config.min_net_profit_usd
                && spread_pct >= self.config.min_spread_percent
            {
                (OpportunityStatus::Active, "active_execution_ready".to_string())
            } else {
                (
                    OpportunityStatus::Watchlist,
                    "watchlist_net_profit_below_threshold".to_string(),
                )
            };

            let token_pair = format!(
                "{}/{}",
                format_address(first.token_in),
                format_address(first.token_out)
            );
            let buy_dex = first.buy_dex();
            let sell_dex = last.sell_dex();
            let confidence_score = calculate_confidence_score(gross_profit_usd, spread_bps);
            let confidence_tier = match confidence_score {
                s if s >= 70.0 => ConfidenceTier::High,
                s if s >= 40.0 => ConfidenceTier::Medium,
                _ => ConfidenceTier::Low,
            };
            let candidate_id = build_candidate_id(&token_pair, &buy_dex, &sell_dex, &first.network);
            let route_key = format!("{}:{}:{}", first.network, token_pair, candidate_id);

            let loan_amount_asset = if asset_price > 0.0 { loan_usd / asset_price } else { 0.0 };
            let expected_buy_token_amount = loan_amount_asset * first.price;
            let amount_b_min_float = expected_buy_token_amount * 0.999;

            let quote = QuoteParityPayload {
                version: CANONICAL_OPPORTUNITY_VERSION.to_string(),
                route_key,
                quote_timestamp: now.clone(),
                quote_token_usd_price: asset_price,
                buy_price: first.price,
                expected_buy_token_amount: format_token_amount(expected_buy_token_amount, token_b_decimals),
                amount_b_min: format_token_amount(amount_b_min_float, token_b_decimals),
                token_b_decimals: token_b_decimals as u32,
                slippage_bps: 10,
                source_quality_bps: 900,
                persistence_count: 1,
                min_required_persistence: 2,
                source_flags: SourceFlags {
                    has_subgraph: false,
                    fallback_only: true,
                    same_fallback_source: false,
                },
            };

            let execution_payload = if status == OpportunityStatus::Active {
                Some(CanonicalExecutionPayload {
                    asset: format_address_checksummed(first.token_in),
                    amount: format_token_amount(loan_amount_asset, asset_decimals),
                    router_a: format_address_checksummed(first.router),
                    router_b: format_address_checksummed(last.router),
                    token_b: format_address_checksummed(first.token_out),
                    router_a_is_v3: first.is_v3,
                    router_b_is_v3: last.is_v3,
                    fee_a: first.fee,
                    fee_b: last.fee,
                    amount_b_min: format_token_amount(amount_b_min_float, token_b_decimals),
                    token_pair: token_pair.clone(),
                    buy_dex: buy_dex.clone(),
                    sell_dex: sell_dex.clone(),
                    network: first.network.clone(),
                    predicted_gross_profit: gross_profit_usd,
                    predicted_net_profit: net_profit_usd,
                    estimated_gas_cost: gas_cost_usd,
                    estimated_slippage_bps: 10,
                    scan_timestamp: now.clone(),
                    confidence_score,
                    quote,
                })
            } else {
                None
            };

            opportunities.push(CanonicalOpportunity {
                token_pair,
                buy_dex,
                sell_dex,
                network: first.network.clone(),
                loan_amount: loan_usd,
                executable_loan_amount: loan_usd,
                gross_profit: gross_profit_usd,
                net_profit: net_profit_usd,
                distance_to_executable_usd: if net_profit_usd >= self.config.min_net_profit_usd {
                    0.0
                } else {
                    self.config.min_net_profit_usd - net_profit_usd
                },
                gas_cost: gas_cost_usd,
                confidence_score,
                confidence_tier,
                spread: format!("{spread_pct:.2}%"),
                liquidity: format!("${:.0}", first.liquidity_usd),
                estimated_slippage_bps: 10,
                buy_impact_bps: 5,
                sell_impact_bps: 5,
                route_penalty_bps: 0,
                status,
                quote_sources: vec!["rpc-fallback".to_string()],
                scan_run_id: scan_run_id.clone(),
                candidate_id,
                quote_timestamp: now.clone(),
                data_source: "multi-source".to_string(),
                reason_code,
                execution_payload,
            });
        }

        info!(
            "Detected {} opportunities ({} active)",
            opportunities.len(),
            opportunities
                .iter()
                .filter(|o| o.status == OpportunityStatus::Active)
                .count()
        );

        Ok(opportunities)
    }
}

pub fn bellman_ford_detect_cycles(pools: &[PoolEdge]) -> Vec<ArbitrageCycle> {
    if pools.is_empty() {
        return Vec::new();
    }

    let mut token_index: HashMap<[u8; 20], NodeId> = HashMap::new();
    let mut tokens: Vec<Address> = Vec::new();

    for pool in pools {
        let in_key: [u8; 20] = pool.token_in.into();
        let out_key: [u8; 20] = pool.token_out.into();
        if let std::collections::hash_map::Entry::Vacant(entry) = token_index.entry(in_key) {
            entry.insert(tokens.len());
            tokens.push(pool.token_in);
        }
        if let std::collections::hash_map::Entry::Vacant(entry) = token_index.entry(out_key) {
            entry.insert(tokens.len());
            tokens.push(pool.token_out);
        }
    }

    let edges: Vec<GraphEdge> = pools
        .iter()
        .filter(|p| p.price.is_finite() && p.price > 0.0)
        .filter_map(|pool| {
            // Fee-aware edge weight: the effective output of a hop is
            // `price * (1 - fee)`, so the log-weight becomes
            // `-ln(price * (1 - fee))` (== `-ln(price) - ln(1 - fee)`).
            // A negative cycle in this space is therefore gross-of-fixed-costs
            // but already NET of every per-hop DEX swap fee.
            let effective_price = pool.effective_price();
            if !effective_price.is_finite() || effective_price <= 0.0 {
                return None;
            }
            Some(GraphEdge {
                from: *token_index
                    .get(&<[u8; 20]>::from(pool.token_in))
                    .expect("known token_in"),
                to: *token_index
                    .get(&<[u8; 20]>::from(pool.token_out))
                    .expect("known token_out"),
                weight: -effective_price.ln(),
                pool: pool.clone(),
            })
        })
        .collect();

    let n = tokens.len();
    let mut cycles = Vec::new();
    for source in 0..n {
        if let Some(cycle) = run_bellman_ford(&edges, n, source) {
            cycles.push(cycle);
        }
    }
    dedup_cycles(cycles)
}

fn run_bellman_ford(edges: &[GraphEdge], n: usize, source: NodeId) -> Option<ArbitrageCycle> {
    if n == 0 {
        return None;
    }

    let mut dist = vec![f64::INFINITY; n];
    let mut predecessor: Vec<Option<usize>> = vec![None; n];
    dist[source] = 0.0;

    for _ in 0..n.saturating_sub(1) {
        let mut updated = false;
        for (idx, edge) in edges.iter().enumerate() {
            if dist[edge.from].is_finite() && dist[edge.from] + edge.weight < dist[edge.to] - 1e-12 {
                dist[edge.to] = dist[edge.from] + edge.weight;
                predecessor[edge.to] = Some(idx);
                updated = true;
            }
        }
        if !updated {
            break;
        }
    }

    let mut cycle_vertex = None;
    for (idx, edge) in edges.iter().enumerate() {
        if dist[edge.from].is_finite() && dist[edge.from] + edge.weight < dist[edge.to] - 1e-12 {
            predecessor[edge.to] = Some(idx);
            cycle_vertex = Some(edge.to);
            break;
        }
    }

    let mut vertex = cycle_vertex?;
    for _ in 0..n {
        let pred_idx = predecessor[vertex]?;
        vertex = edges[pred_idx].from;
    }

    let cycle_start = vertex;
    let mut current = cycle_start;
    let mut cycle_edges_rev = Vec::new();
    let mut total_log_weight = 0.0;

    loop {
        let pred_idx = predecessor[current]?;
        let edge = &edges[pred_idx];
        total_log_weight += edge.weight;
        cycle_edges_rev.push(edge.pool.clone());
        current = edge.from;
        if current == cycle_start {
            break;
        }
        if cycle_edges_rev.len() > n {
            return None;
        }
    }

    cycle_edges_rev.reverse();
    let profit_ratio = (-total_log_weight).exp();
    if !profit_ratio.is_finite() || profit_ratio <= 1.0 {
        return None;
    }

    Some(ArbitrageCycle {
        edges: cycle_edges_rev,
        profit_ratio,
    })
}

fn dedup_cycles(cycles: Vec<ArbitrageCycle>) -> Vec<ArbitrageCycle> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();

    for cycle in cycles {
        let key = canonical_cycle_key(&cycle);
        if seen.insert(key) {
            deduped.push(cycle);
        }
    }

    deduped
}

fn canonical_cycle_key(cycle: &ArbitrageCycle) -> String {
    if cycle.edges.is_empty() {
        return String::new();
    }

    let parts: Vec<String> = cycle
        .edges
        .iter()
        .map(|edge| format!("{}:{}:{}", format_address(edge.token_in), format_address(edge.token_out), edge.dex))
        .collect();

    let mut best = None::<String>;
    for offset in 0..parts.len() {
        let rotated = (0..parts.len())
            .map(|idx| parts[(idx + offset) % parts.len()].clone())
            .collect::<Vec<_>>()
            .join("->");
        if best.as_ref().map(|b| rotated < *b).unwrap_or(true) {
            best = Some(rotated);
        }
    }
    best.unwrap_or_default()
}

fn format_address(addr: Address) -> String {
    format!("{addr:#x}")
}

fn format_address_checksummed(addr: Address) -> String {
    to_checksum(&addr, None)
}

fn format_token_amount(amount: f64, decimals: u8) -> String {
    if !amount.is_finite() || amount <= 0.0 {
        return "0".to_string();
    }
    let factor = 10_f64.powi(decimals as i32);
    let scaled = (amount * factor).round();
    if scaled <= 0.0 {
        "0".to_string()
    } else if scaled >= u128::MAX as f64 {
        u128::MAX.to_string()
    } else {
        (scaled as u128).to_string()
    }
}

fn calculate_confidence_score(gross_profit_usd: f64, spread_bps: u32) -> f64 {
    let profit_score = (gross_profit_usd / 100.0).clamp(0.0, 50.0);
    let spread_score = (spread_bps as f64 / 100.0).clamp(0.0, 50.0);
    (profit_score + spread_score).clamp(0.0, 100.0)
}

fn build_candidate_id(token_pair: &str, buy_dex: &str, sell_dex: &str, network: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{network}:{token_pair}:{buy_dex}:{sell_dex}"));
    let result = hasher.finalize();
    hex::encode(result)[..32].to_string()
}

fn infer_usd_price(token: Address) -> f64 {
    // Stablecoins (both mainnet and Arbitrum) are ~$1. Non-stable tokens fall
    // back to 1.0 — this only sizes the (detection-only) execution payload and
    // does NOT feed the Bellman-Ford cycle math, which uses PoolEdge.price.
    match format!("{token:#x}").to_lowercase().as_str() {
        // Ethereum mainnet
        "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2" => 2000.0, // WETH (mainnet demo)
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" => 1.0,   // USDC (mainnet)
        "0xdac17f958d2ee523a2206206994597c13d831ec7" => 1.0,   // USDT (mainnet)
        // Arbitrum stablecoins
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831" => 1.0, // USDC (native)
        "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8" => 1.0, // USDC.e
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" => 1.0, // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1" => 1.0, // DAI
        _ => 1.0,
    }
}

fn infer_decimals(token: Address) -> u8 {
    // Prefer the verified Arbitrum registry; fall back to mainnet stablecoins
    // and a sane 18-decimal default.
    if let Some(d) = crate::pools::decimals_of(token, &crate::pools::arbitrum_tokens()) {
        return d;
    }
    match format!("{token:#x}").to_lowercase().as_str() {
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" => 6, // USDC (mainnet)
        "0xdac17f958d2ee523a2206206994597c13d831ec7" => 6, // USDT (mainnet)
        _ => 18,
    }
}

impl PoolEdge {
    pub fn buy_dex(&self) -> String {
        self.dex.clone()
    }

    pub fn sell_dex(&self) -> String {
        self.dex.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_edge(from: Address, to: Address, price: f64, dex: &str) -> PoolEdge {
        PoolEdge {
            token_in: from,
            token_out: to,
            price,
            liquidity_usd: 1_000_000.0,
            dex: dex.to_string(),
            network: "ethereum".to_string(),
            router: Address::zero(),
            is_v3: false,
            fee: 3000,
            swap_state: None,
        }
    }

    #[test]
    fn test_bellman_ford_detects_positive_cycle() {
        let a: Address = "0x0000000000000000000000000000000000000001".parse().unwrap();
        let b: Address = "0x0000000000000000000000000000000000000002".parse().unwrap();
        let pools = vec![
            make_edge(a, b, 1.01, "uniswap-v3"),
            make_edge(b, a, 1.005, "sushiswap"),
        ];
        let cycles = bellman_ford_detect_cycles(&pools);
        assert!(!cycles.is_empty());
        assert!(cycles[0].profit_ratio > 1.0);
    }

    #[test]
    fn test_no_cycle_returns_empty() {
        let a: Address = "0x0000000000000000000000000000000000000001".parse().unwrap();
        let b: Address = "0x0000000000000000000000000000000000000002".parse().unwrap();
        let c: Address = "0x0000000000000000000000000000000000000003".parse().unwrap();
        let pools = vec![
            make_edge(a, b, 0.99, "dex1"),
            make_edge(b, c, 0.99, "dex2"),
            make_edge(c, a, 0.99, "dex3"),
        ];
        let cycles = bellman_ford_detect_cycles(&pools);
        assert!(cycles.is_empty());
    }

    #[test]
    fn test_three_hop_cycle() {
        let a: Address = "0x0000000000000000000000000000000000000001".parse().unwrap();
        let b: Address = "0x0000000000000000000000000000000000000002".parse().unwrap();
        let c: Address = "0x0000000000000000000000000000000000000003".parse().unwrap();
        let pools = vec![
            make_edge(a, b, 1.02, "dex1"),
            make_edge(b, c, 1.02, "dex2"),
            make_edge(c, a, 0.985, "dex3"),
        ];
        let cycles = bellman_ford_detect_cycles(&pools);
        assert!(!cycles.is_empty());
    }

    #[test]
    fn test_empty_pools_returns_empty() {
        assert!(bellman_ford_detect_cycles(&[]).is_empty());
    }

    #[test]
    fn test_single_edge_no_cycle() {
        let a: Address = "0x0000000000000000000000000000000000000001".parse().unwrap();
        let b: Address = "0x0000000000000000000000000000000000000002".parse().unwrap();
        let pools = vec![make_edge(a, b, 2.0, "dex1")];
        assert!(bellman_ford_detect_cycles(&pools).is_empty());
    }

    // ---- Phase 2: fee-awareness tests ----

    fn make_edge_fee(from: Address, to: Address, price: f64, fee: u32) -> PoolEdge {
        PoolEdge {
            token_in: from,
            token_out: to,
            price,
            liquidity_usd: 1_000_000.0,
            dex: format!("dex-{fee}"),
            network: "ethereum".to_string(),
            router: Address::zero(),
            is_v3: false,
            fee,
            swap_state: None,
        }
    }

    fn fee_test_config() -> Config {
        Config {
            networks: vec![],
            scanner_private_key: "0x1".to_string(),
            flashbots_signer_key: "0x1".to_string(),
            flashbots_relay_url: "http://localhost".to_string(),
            flashbots_max_priority_fee_gwei: 3,
            flashbots_fee_multiplier: 1.15,
            loan_amount_usd: 10_000.0,
            min_net_profit_usd: 14.0,
            min_spread_percent: 0.0,
            aave_premium_bps: 5.0,
            gas_cost_usd: 12.0,
            max_slippage_bps: 40,
            scan_interval_secs: 5,
            thegraph_api_key: None,
            enable_graph_polling: false,
            enable_rpc_fallback: true,
            log_level: "info".to_string(),
            log_format: "json".to_string(),
            prometheus_port: 9090,
            enable_prometheus: false,
            supabase_url: None,
            supabase_service_role_key: None,
            enable_supabase_telemetry: false,
        }
    }

    fn addr(n: u8) -> Address {
        let mut bytes = [0u8; 20];
        bytes[19] = n;
        Address::from(bytes)
    }

    #[test]
    fn test_fee_fraction_conversion() {
        // Uniswap-V3 style parts-per-million -> plain fraction.
        assert!((make_edge_fee(addr(1), addr(2), 1.0, 3000).fee_fraction() - 0.003).abs() < 1e-12);
        assert!((make_edge_fee(addr(1), addr(2), 1.0, 500).fee_fraction() - 0.0005).abs() < 1e-12);
        assert!((make_edge_fee(addr(1), addr(2), 1.0, 0).fee_fraction()).abs() < 1e-12);
        // effective_price applies (1 - fee).
        let e = make_edge_fee(addr(1), addr(2), 2000.0, 3000);
        assert!((e.effective_price() - 2000.0 * 0.997).abs() < 1e-9);
    }

    #[test]
    fn test_compute_net_profit_math() {
        // gross = 10_000 * (1.01 - 1) = 100; aave = 10_000 * 5/10_000 = 5; gas = 12.
        let breakdown = compute_net_profit(1.01, 10_000.0, 5.0, 12.0);
        assert!((breakdown.gross_after_swap_fees_usd - 100.0).abs() < 1e-9);
        assert!((breakdown.aave_premium_usd - 5.0).abs() < 1e-9);
        assert!((breakdown.gas_cost_usd - 12.0).abs() < 1e-9);
        assert!((breakdown.net_profit_usd - 83.0).abs() < 1e-9);
    }

    /// (a) A cycle whose RAW/gross product > 1 but which becomes <= 1 after swap
    /// fees must NOT be detected as a negative cycle.
    #[test]
    fn test_gross_positive_but_fee_negative_is_not_detected() {
        let a = addr(1);
        let b = addr(2);
        // Raw round-trip product = 1.004 * 1.0 = 1.004 (> 1, a gross-positive lead).
        let raw = 1.004_f64;
        assert!(raw > 1.0, "precondition: raw product must be gross-positive");

        // With 0.30% fee on each hop the effective product is
        // 1.004 * 0.997 * 0.997 = 0.99798 < 1 -> no arbitrage.
        let priced = vec![
            make_edge_fee(a, b, 1.004, 3000),
            make_edge_fee(b, a, 1.0, 3000),
        ];
        assert!(
            bellman_ford_detect_cycles(&priced).is_empty(),
            "fee-aware scanner must reject a cycle that is only gross-positive"
        );

        // Sanity check: the SAME prices with zero fees WOULD be detected,
        // proving the rejection above is caused by the fee-aware weights.
        let free = vec![
            make_edge_fee(a, b, 1.004, 0),
            make_edge_fee(b, a, 1.0, 0),
        ];
        let free_cycles = bellman_ford_detect_cycles(&free);
        assert_eq!(free_cycles.len(), 1);
        assert!(free_cycles[0].profit_ratio > 1.0);
    }

    /// (b) A cycle still positive after swap fees but negative after the Aave
    /// premium + gas must NOT be reported as an opportunity.
    #[test]
    fn test_positive_after_fees_but_negative_after_fixed_costs_is_not_reported() {
        let a = addr(1);
        let b = addr(2);
        // Zero-fee hops so the after-swap-fee ratio is exactly 1.001 (> 1, so it
        // IS a detected cycle), but gross = 10_000 * 0.001 = $10, which is less
        // than the $5 Aave premium + $12 gas = $17 fixed cost.
        let pools = vec![
            make_edge_fee(a, b, 1.001, 0),
            make_edge_fee(b, a, 1.0, 0),
        ];
        let cycles = bellman_ford_detect_cycles(&pools);
        assert_eq!(cycles.len(), 1, "cycle survives swap fees and is detected");
        assert!((cycles[0].profit_ratio - 1.001).abs() < 1e-6);

        let net = compute_net_profit(cycles[0].profit_ratio, 10_000.0, 5.0, 12.0);
        assert!(net.gross_after_swap_fees_usd > 0.0, "gross-after-fees is positive");
        assert!(net.net_profit_usd < 0.0, "net must be negative after Aave premium + gas");

        // End-to-end: detect_arbitrage must emit no opportunity for this cycle.
        let scanner = Scanner { config: fee_test_config() };
        let opportunities = scanner.detect_arbitrage(&pools).expect("detect ok");
        assert!(
            opportunities.is_empty(),
            "net-negative cycle must not be reported, got {} opportunities",
            opportunities.len()
        );
    }

    /// (c) A genuinely net-positive cycle IS reported as an Active opportunity.
    #[test]
    fn test_net_positive_cycle_is_reported() {
        let a = addr(1);
        let b = addr(2);
        // After-swap-fee ratio 1.01 -> gross $100 - $5 Aave - $12 gas = $83 net.
        let pools = vec![
            make_edge_fee(a, b, 1.01, 0),
            make_edge_fee(b, a, 1.0, 0),
        ];
        let cycles = bellman_ford_detect_cycles(&pools);
        assert_eq!(cycles.len(), 1);
        assert!((cycles[0].profit_ratio - 1.01).abs() < 1e-6);

        let net = compute_net_profit(cycles[0].profit_ratio, 10_000.0, 5.0, 12.0);
        assert!((net.net_profit_usd - 83.0).abs() < 1e-6);

        let scanner = Scanner { config: fee_test_config() };
        let opportunities = scanner.detect_arbitrage(&pools).expect("detect ok");
        assert_eq!(opportunities.len(), 1, "net-positive cycle must be reported");
        let opp = &opportunities[0];
        assert!((opp.net_profit - 83.0).abs() < 1e-6);
        assert!((opp.gross_profit - 100.0).abs() < 1e-6);
        assert!((opp.gas_cost - 12.0).abs() < 1e-9);
        assert_eq!(opp.status, OpportunityStatus::Active);
    }
}
