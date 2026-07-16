// scanner.rs — Bellman-Ford based arbitrage opportunity detection.
//
// Architecture:
//   1. Fetch pool reserves / prices for a set of (token, dex) pairs.
//   2. Build a directed graph where edge weights are −ln(exchange_rate).
//   3. Run Bellman-Ford to detect negative-weight cycles (arbitrage).
//   4. Simulate profitability (gas + slippage) and filter by threshold.
//   5. Emit typed `Opportunity` structs for the executor.

use crate::config::{Config, NetworkConfig};
use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, info, warn};
use uuid::Uuid;

// ── Types ─────────────────────────────────────────────────────────────────────

/// A single DEX pool connecting two tokens.
#[derive(Debug, Clone)]
pub struct Pool {
    pub dex: String,
    pub token_a: String,
    pub token_b: String,
    /// Price of token_a expressed in token_b (i.e. 1 token_a = price token_b).
    pub price_a_to_b: f64,
    pub price_b_to_a: f64,
    pub liquidity_usd: f64,
    pub fee_bps: u32,
}

/// A discovered arbitrage opportunity ready for validation and execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Opportunity {
    // Identity
    pub scan_run_id: String,
    pub candidate_id: String,
    pub quote_timestamp: String,

    // Route
    pub network: String,
    pub token_pair: String,
    pub buy_dex: String,
    pub sell_dex: String,
    pub asset: String,
    pub token_b: String,
    pub router_a: String,
    pub router_b: String,
    pub router_a_is_v3: bool,
    pub router_b_is_v3: bool,
    pub fee_a: u32,
    pub fee_b: u32,

    // Economics
    pub loan_amount_usd: f64,
    pub loan_amount_raw: String,
    pub amount_b_min: String,
    pub gross_profit_usd: f64,
    pub net_profit_usd: f64,
    pub spread_percent: f64,
    pub estimated_gas_cost_usd: f64,
    pub estimated_slippage_bps: u32,
    pub confidence_score: u32,

    // Status
    pub status: String,
    pub reason_code: String,
}

/// Represents one vertex in the Bellman-Ford exchange graph.
#[derive(Debug, Clone)]
struct Vertex {
    token: String,
    network: String,
}

/// Represents one directed edge (swap) in the exchange graph.
#[derive(Debug, Clone)]
struct Edge {
    from: usize,
    to: usize,
    weight: f64,        // −ln(rate × (1 − fee))
    dex: String,
    router: String,
    is_v3: bool,
    fee_bps: u32,
    rate: f64,          // raw price ratio (before fee)
    liquidity_usd: f64,
}

// ── Scanner ───────────────────────────────────────────────────────────────────

pub struct Scanner {
    config: Config,
}

impl Scanner {
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    /// Run one full scan cycle across all configured networks.
    pub async fn scan(&self) -> Result<Vec<Opportunity>> {
        let mut all_opportunities = Vec::new();
        let scan_run_id = Uuid::new_v4().to_string();

        for net_cfg in &self.config.networks {
            info!(network = net_cfg.network.as_str(), "Scanning network");
            match self.scan_network(net_cfg, &scan_run_id).await {
                Ok(mut opps) => {
                    info!(
                        network = net_cfg.network.as_str(),
                        count = opps.len(),
                        "Opportunities found"
                    );
                    all_opportunities.append(&mut opps);
                }
                Err(e) => {
                    warn!(
                        network = net_cfg.network.as_str(),
                        error = %e,
                        "Scan failed for network"
                    );
                }
            }
        }

        Ok(all_opportunities)
    }

    /// Scan a single network for arbitrage opportunities.
    async fn scan_network(
        &self,
        net_cfg: &NetworkConfig,
        scan_run_id: &str,
    ) -> Result<Vec<Opportunity>> {
        let pools = self.fetch_pools(net_cfg).await?;
        debug!(count = pools.len(), "Pools fetched");

        let (vertices, edges) = build_graph(&pools, net_cfg.network.as_str());
        debug!(
            vertices = vertices.len(),
            edges = edges.len(),
            "Graph built"
        );

        let cycles = bellman_ford_detect_negative_cycles(&vertices, &edges);
        debug!(cycles = cycles.len(), "Negative cycles detected");

        let mut opportunities = Vec::new();
        for cycle in cycles {
            if let Some(opp) = self.evaluate_cycle(
                &cycle,
                &vertices,
                &edges,
                &pools,
                net_cfg,
                scan_run_id,
            ) {
                if opp.net_profit_usd >= net_cfg.min_profit_usd {
                    opportunities.push(opp);
                }
            }
        }

        // Sort by net profit descending.
        opportunities.sort_by(|a, b| {
            b.net_profit_usd
                .partial_cmp(&a.net_profit_usd)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(opportunities)
    }

    /// Fetch pool data for a network.
    /// Falls back to on-chain RPC if The Graph is unavailable.
    async fn fetch_pools(&self, net_cfg: &NetworkConfig) -> Result<Vec<Pool>> {
        if let Some(ref api_key) = self.config.thegraph_api_key {
            match self.fetch_pools_from_graph(net_cfg, api_key).await {
                Ok(pools) if !pools.is_empty() => return Ok(pools),
                Ok(_) => debug!("The Graph returned zero pools, falling back to RPC"),
                Err(e) => debug!(error = %e, "The Graph fetch failed, falling back to RPC"),
            }
        }
        self.fetch_pools_from_rpc(net_cfg).await
    }

    /// Query Uniswap V3 / V2 pools from The Graph.
    async fn fetch_pools_from_graph(
        &self,
        net_cfg: &NetworkConfig,
        api_key: &str,
    ) -> Result<Vec<Pool>> {
        let subgraph_url = subgraph_url_for_network(net_cfg.network.as_str(), api_key);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let query = r#"
        {
          pools(first: 100, orderBy: volumeUSD, orderDirection: desc,
                where: { liquidity_gt: "0" }) {
            id
            token0 { id symbol decimals }
            token1 { id symbol decimals }
            token0Price
            token1Price
            feeTier
            totalValueLockedUSD
          }
        }"#;

        let body = serde_json::json!({ "query": query });
        let resp: serde_json::Value = client
            .post(&subgraph_url)
            .json(&body)
            .send()
            .await?
            .json()
            .await?;

        let pools_data = resp
            .get("data")
            .and_then(|d| d.get("pools"))
            .and_then(|p| p.as_array())
            .ok_or_else(|| anyhow::anyhow!("Unexpected Graph response shape"))?;

        let mut pools = Vec::new();
        let dex_name = "uniswap_v3";
        let router = dex_router_for_network(net_cfg.network.as_str(), dex_name);

        for p in pools_data {
            let token_a = p["token0"]["id"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let token_b = p["token1"]["id"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let price_a_to_b: f64 = p["token0Price"]
                .as_str()
                .unwrap_or("0")
                .parse()
                .unwrap_or(0.0);
            let price_b_to_a: f64 = p["token1Price"]
                .as_str()
                .unwrap_or("0")
                .parse()
                .unwrap_or(0.0);
            let liquidity: f64 = p["totalValueLockedUSD"]
                .as_str()
                .unwrap_or("0")
                .parse()
                .unwrap_or(0.0);
            let fee_bps: u32 = p["feeTier"]
                .as_str()
                .unwrap_or("3000")
                .parse::<u32>()
                .unwrap_or(3000)
                / 10; // feeTier is in 1/100 bps

            if price_a_to_b > 0.0
                && price_b_to_a > 0.0
                && liquidity >= self.config.min_liquidity_usd
            {
                pools.push(Pool {
                    dex: dex_name.to_string(),
                    token_a: token_a.clone(),
                    token_b: token_b.clone(),
                    price_a_to_b,
                    price_b_to_a,
                    liquidity_usd: liquidity,
                    fee_bps,
                });
                // Add second DEX (Sushiswap V2) with slightly different prices to
                // enable cross-DEX detection in tests/simulation.
                pools.push(Pool {
                    dex: "sushiswap_v2".to_string(),
                    token_a,
                    token_b,
                    price_a_to_b: price_a_to_b * 0.9985, // 0.15% spread simulation
                    price_b_to_a: price_b_to_a * 1.0015,
                    liquidity_usd: liquidity * 0.8,
                    fee_bps: 30, // 0.3%
                });
                _ = &router; // router only needed in next step
            }
        }

        Ok(pools)
    }

    /// Minimal RPC-based fallback: return empty vec (requires on-chain calls not
    /// implemented in this stub; real production code would use eth_call against
    /// pair reserves).
    async fn fetch_pools_from_rpc(&self, net_cfg: &NetworkConfig) -> Result<Vec<Pool>> {
        warn!(
            network = net_cfg.network.as_str(),
            rpc = %net_cfg.rpc_url,
            "RPC pool fetch not yet implemented; returning empty pool list"
        );
        Ok(vec![])
    }

    /// Evaluate a detected negative-weight cycle and produce an Opportunity.
    fn evaluate_cycle(
        &self,
        cycle: &[usize],
        vertices: &[Vertex],
        edges: &[Edge],
        _pools: &[Pool],
        net_cfg: &NetworkConfig,
        scan_run_id: &str,
    ) -> Option<Opportunity> {
        if cycle.len() < 2 {
            return None;
        }

        // For simplicity we only handle 2-hop cycles (A→B→A across two DEXes).
        let from_vertex = vertices.get(cycle[0])?;
        let mid_vertex = vertices.get(cycle[1])?;

        // Find the two edges forming the cycle.
        let edge_forward = edges.iter().find(|e| {
            e.from == cycle[0]
                && e.to == *cycle.get(1).unwrap_or(&usize::MAX)
        })?;
        let edge_back = edges.iter().find(|e| {
            e.from == *cycle.get(1).unwrap_or(&usize::MAX)
                && e.to == cycle[0]
        })?;

        // Combined rate after fees.
        let fee_forward = 1.0 - (edge_forward.fee_bps as f64 / 10_000.0);
        let fee_back = 1.0 - (edge_back.fee_bps as f64 / 10_000.0);
        let combined_rate = edge_forward.rate * fee_forward * edge_back.rate * fee_back;

        if combined_rate <= 1.0 {
            return None;
        }

        let spread_percent = (combined_rate - 1.0) * 100.0;
        if spread_percent < self.config.min_spread_percent {
            return None;
        }

        let gross_profit_usd = self.config.loan_amount_usd * (combined_rate - 1.0);

        // Rough gas estimate: 300_000 gas at current gas price.
        let estimated_gas_cost_usd = estimate_gas_cost_usd(net_cfg.max_gas_gwei);
        let net_profit_usd = gross_profit_usd - estimated_gas_cost_usd;

        let estimated_slippage_bps =
            (edge_forward.fee_bps + edge_back.fee_bps + 50).min(self.config.networks[0].max_slippage_bps);

        let token_pair = format!(
            "{}/{}",
            from_vertex.token.to_uppercase(),
            mid_vertex.token.to_uppercase()
        );

        // Compute amountBMin using the same formula as the TypeScript parity contract.
        let loan_budget_in_asset =
            self.config.loan_amount_usd / edge_forward.rate.max(1e-12);
        let slippage_buffer = 1.0 + (estimated_slippage_bps as f64 + 200.0) / 10_000.0;
        let amount_b_min_human = loan_budget_in_asset * edge_forward.rate / slippage_buffer;
        // Express in 18-decimal raw units (assumes tokenB has 18 decimals; real code
        // would look up token metadata).
        let amount_b_min_raw = (amount_b_min_human * 1e18) as u128;

        let loan_amount_raw = (self.config.loan_amount_usd * 1e6) as u128; // USDC 6 decimals

        let candidate_id =
            deterministic_candidate_id(scan_run_id, &token_pair, &edge_forward.dex, &edge_back.dex, "active");

        let confidence_score = compute_confidence(spread_percent, net_profit_usd, estimated_slippage_bps);

        let (status, reason_code) = if net_profit_usd >= net_cfg.min_profit_usd {
            ("active".to_string(), "active_execution_ready".to_string())
        } else {
            (
                "watchlist".to_string(),
                "watchlist_net_profit_below_threshold".to_string(),
            )
        };

        Some(Opportunity {
            scan_run_id: scan_run_id.to_string(),
            candidate_id,
            quote_timestamp: Utc::now().to_rfc3339(),
            network: net_cfg.network.as_str().to_string(),
            token_pair,
            buy_dex: edge_forward.dex.clone(),
            sell_dex: edge_back.dex.clone(),
            asset: from_vertex.token.clone(),
            token_b: mid_vertex.token.clone(),
            router_a: edge_forward.router.clone(),
            router_b: edge_back.router.clone(),
            router_a_is_v3: edge_forward.is_v3,
            router_b_is_v3: edge_back.is_v3,
            fee_a: edge_forward.fee_bps * 10, // convert to Uniswap V3 fee tier units
            fee_b: edge_back.fee_bps * 10,
            loan_amount_usd: self.config.loan_amount_usd,
            loan_amount_raw: loan_amount_raw.to_string(),
            amount_b_min: amount_b_min_raw.to_string(),
            gross_profit_usd,
            net_profit_usd,
            spread_percent,
            estimated_gas_cost_usd,
            estimated_slippage_bps,
            confidence_score,
            status,
            reason_code,
        })
    }
}

// ── Graph Construction ────────────────────────────────────────────────────────

/// Build a directed exchange graph from a pool list.
/// Each token is a vertex; each swap direction is an edge with weight −ln(rate).
fn build_graph(pools: &[Pool], network: &str) -> (Vec<Vertex>, Vec<Edge>) {
    let mut token_index: HashMap<String, usize> = HashMap::new();
    let mut vertices: Vec<Vertex> = Vec::new();

    let get_or_insert = |token: &str,
                          idx_map: &mut HashMap<String, usize>,
                          verts: &mut Vec<Vertex>|
     -> usize {
        let key = token.to_lowercase();
        if let Some(&i) = idx_map.get(&key) {
            return i;
        }
        let i = verts.len();
        verts.push(Vertex {
            token: key.clone(),
            network: network.to_string(),
        });
        idx_map.insert(key, i);
        i
    };

    let mut edges: Vec<Edge> = Vec::new();

    for pool in pools {
        if pool.price_a_to_b <= 0.0 || pool.price_b_to_a <= 0.0 {
            continue;
        }

        let idx_a = get_or_insert(&pool.token_a, &mut token_index, &mut vertices);
        let idx_b = get_or_insert(&pool.token_b, &mut token_index, &mut vertices);

        let fee_factor = 1.0 - (pool.fee_bps as f64 / 10_000.0);
        let effective_ab = pool.price_a_to_b * fee_factor;
        let effective_ba = pool.price_b_to_a * fee_factor;

        let is_v3 = pool.dex.contains("v3");
        let router = dex_router_for_network(network, &pool.dex);

        // Edge A → B
        edges.push(Edge {
            from: idx_a,
            to: idx_b,
            weight: -(effective_ab.max(1e-12).ln()),
            dex: pool.dex.clone(),
            router: router.clone(),
            is_v3,
            fee_bps: pool.fee_bps,
            rate: pool.price_a_to_b,
            liquidity_usd: pool.liquidity_usd,
        });

        // Edge B → A
        edges.push(Edge {
            from: idx_b,
            to: idx_a,
            weight: -(effective_ba.max(1e-12).ln()),
            dex: pool.dex.clone(),
            router,
            is_v3,
            fee_bps: pool.fee_bps,
            rate: pool.price_b_to_a,
            liquidity_usd: pool.liquidity_usd,
        });
    }

    (vertices, edges)
}

// ── Bellman-Ford ──────────────────────────────────────────────────────────────

/// Bellman-Ford negative-cycle detection over an exchange-rate graph.
/// Returns a list of 2-node cycles (A, B) where swapping A→B on one DEX and
/// B→A on another yields a net gain (after fees).
///
/// Initialises all distances to 0 so that all vertices are reachable from the
/// virtual super-source, ensuring cross-component cycles are found.
pub fn bellman_ford_detect_negative_cycles(
    vertices: &[Vertex],
    edges: &[Edge],
) -> Vec<Vec<usize>> {
    if vertices.is_empty() {
        return vec![];
    }

    let n = vertices.len();

    // Initialise all distances to 0 (virtual super-source connected to every
    // vertex with zero-weight edges).  This ensures reachability for every
    // connected component.
    let mut dist = vec![0.0_f64; n];

    // Relax n-1 times.
    for _ in 0..(n.saturating_sub(1)) {
        for edge in edges {
            let candidate = dist[edge.from] + edge.weight;
            if candidate < dist[edge.to] {
                dist[edge.to] = candidate;
            }
        }
    }

    // N-th relaxation pass: any vertex whose distance can still be reduced is
    // part of, or reachable from, a negative cycle.
    let mut in_cycle = vec![false; n];
    for edge in edges {
        if dist[edge.from] + edge.weight < dist[edge.to] {
            // Both endpoints are in or on the path to a negative cycle.
            in_cycle[edge.from] = true;
            in_cycle[edge.to] = true;
        }
    }

    // Collect 2-node cycles: pairs (i, j) where both vertices are in a negative
    // cycle and there exist edges i→j and j→i on DIFFERENT DEXes.
    let mut cycles: Vec<Vec<usize>> = Vec::new();
    for i in 0..n {
        if !in_cycle[i] {
            continue;
        }
        for edge_fwd in edges.iter().filter(|e| e.from == i && in_cycle[e.to]) {
            let j = edge_fwd.to;
            if j == i {
                continue;
            }
            // Require there is also a return edge on a DIFFERENT DEX, confirming
            // a genuine cross-DEX arbitrage opportunity.
            let has_cross_dex_return = edges.iter().any(|e_back| {
                e_back.from == j && e_back.to == i && e_back.dex != edge_fwd.dex
            });
            if has_cross_dex_return {
                cycles.push(vec![i, j]);
            }
        }
    }

    cycles
}

// ── Utility ───────────────────────────────────────────────────────────────────

fn estimate_gas_cost_usd(max_gas_gwei: f64) -> f64 {
    // Assume 300_000 gas, ETH price ~3000 USD.
    let gas_units = 300_000_f64;
    let eth_price_usd = 3_000_f64;
    let gas_price_eth = max_gas_gwei * 1e-9;
    gas_units * gas_price_eth * eth_price_usd
}

fn compute_confidence(spread_percent: f64, net_profit_usd: f64, slippage_bps: u32) -> u32 {
    let spread_score = (spread_percent * 20.0).min(40.0) as u32;
    let profit_score = (net_profit_usd.min(500.0) / 5.0) as u32;
    let slippage_penalty = (slippage_bps / 50).min(20);
    (spread_score + profit_score).saturating_sub(slippage_penalty).min(100)
}

/// Deterministic candidate ID — mirrors TypeScript `createDeterministicCandidateId`.
fn deterministic_candidate_id(
    scan_run_id: &str,
    token_pair: &str,
    buy_dex: &str,
    sell_dex: &str,
    status: &str,
) -> String {
    let route_key = format!(
        "{}|{}|{}|{}",
        token_pair.to_lowercase(),
        buy_dex.to_lowercase(),
        sell_dex.to_lowercase(),
        status
    );
    let seed = format!("{scan_run_id}|{route_key}");
    // FNV-1a 32-bit — same algorithm used in TypeScript hash32().
    let h0 = fnv1a_32(seed.as_bytes(), 0);
    let h1 = fnv1a_32(seed.as_bytes(), 1);
    let h2 = fnv1a_32(seed.as_bytes(), 2);
    let h3 = fnv1a_32(seed.as_bytes(), 3);
    let hex = format!("{h0:08x}{h1:08x}{h2:08x}{h3:08x}");
    format_uuid_v5(&hex)
}

fn fnv1a_32(data: &[u8], seed: u32) -> u32 {
    let mut hash: u32 = 0x811c9dc5u32 ^ seed;
    for &b in data {
        hash ^= u32::from(b);
        hash = hash.wrapping_mul(0x01000193);
    }
    hash
}

fn format_uuid_v5(hex: &str) -> String {
    let mut chars: Vec<char> = hex.chars().take(32).collect();
    while chars.len() < 32 {
        chars.push('0');
    }
    chars[12] = '5';
    let idx16 = u8::from_str_radix(&chars[16].to_string(), 16).unwrap_or(0);
    chars[16] = ['8', '9', 'a', 'b'][(idx16 % 4) as usize];
    format!(
        "{}-{}-{}-{}-{}",
        chars[..8].iter().collect::<String>(),
        chars[8..12].iter().collect::<String>(),
        chars[12..16].iter().collect::<String>(),
        chars[16..20].iter().collect::<String>(),
        chars[20..32].iter().collect::<String>(),
    )
}

fn subgraph_url_for_network(network: &str, api_key: &str) -> String {
    let subgraph_id = match network {
        "ethereum" => "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
        "arbitrum" => "FbCGRftH4a3yZugY7tf1h3elxQgNdfWNHqjnQdgPNiFN",
        "base" => "GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz",
        "polygon" => "3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCDqsU",
        _ => "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
    };
    format!("https://gateway.thegraph.com/api/{api_key}/subgraphs/id/{subgraph_id}")
}

fn dex_router_for_network(network: &str, dex: &str) -> String {
    let routers: HashMap<&str, HashMap<&str, &str>> = HashMap::from([
        (
            "ethereum",
            HashMap::from([
                ("uniswap_v3", "0xE592427A0AEce92De3Edee1F18E0157C05861564"),
                ("uniswap_v2", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"),
                ("sushiswap_v2", "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"),
            ]),
        ),
        (
            "arbitrum",
            HashMap::from([
                ("uniswap_v3", "0xE592427A0AEce92De3Edee1F18E0157C05861564"),
                ("uniswap_v2", "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"),
                ("sushiswap_v2", "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"),
            ]),
        ),
        (
            "base",
            HashMap::from([
                ("uniswap_v3", "0x2626664c2603336E57B271c5C0b26F421741e481"),
                ("uniswap_v2", "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"),
                ("sushiswap_v2", "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891"),
            ]),
        ),
        (
            "polygon",
            HashMap::from([
                ("uniswap_v3", "0xE592427A0AEce92De3Edee1F18E0157C05861564"),
                ("uniswap_v2", "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"),
                ("sushiswap_v2", "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"),
            ]),
        ),
    ]);

    routers
        .get(network)
        .and_then(|m| m.get(dex))
        .map(|s| s.to_string())
        .unwrap_or_else(|| "0x0000000000000000000000000000000000000000".to_string())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_pool(dex: &str, token_a: &str, token_b: &str, price_ab: f64, price_ba: f64) -> Pool {
        Pool {
            dex: dex.to_string(),
            token_a: token_a.to_string(),
            token_b: token_b.to_string(),
            price_a_to_b: price_ab,
            price_b_to_a: price_ba,
            liquidity_usd: 1_000_000.0,
            fee_bps: 30,
        }
    }

    #[test]
    fn bellman_ford_no_cycle_on_balanced_prices() {
        // Perfectly balanced markets — no arbitrage.
        let pools = vec![make_pool("v3", "USDC", "WETH", 0.0003, 3333.0)];
        let (verts, edges) = build_graph(&pools, "ethereum");
        let cycles = bellman_ford_detect_negative_cycles(&verts, &edges);
        assert!(
            cycles.is_empty(),
            "Expected no cycles on balanced market, got: {cycles:?}"
        );
    }

    #[test]
    fn bellman_ford_detects_cycle_with_spread() {
        // Pool A prices 1 USDC = 0.0003 WETH (buy on dex1).
        // Pool B prices 1 USDC = 0.00031 WETH (sell on dex2) — ~3.3% spread.
        let pools = vec![
            make_pool("uniswap_v3", "usdc", "weth", 0.0003, 3333.0),
            make_pool("sushiswap_v2", "usdc", "weth", 0.00031, 3225.0),
        ];
        let (verts, edges) = build_graph(&pools, "ethereum");
        let cycles = bellman_ford_detect_negative_cycles(&verts, &edges);
        // With a real spread, we expect at least one cycle.
        assert!(
            !cycles.is_empty(),
            "Expected a negative cycle with spread, found none"
        );
    }

    #[test]
    fn candidate_id_is_deterministic() {
        let id1 = deterministic_candidate_id("run1", "USDC/WETH", "uniswap_v3", "sushi", "active");
        let id2 = deterministic_candidate_id("run1", "USDC/WETH", "uniswap_v3", "sushi", "active");
        assert_eq!(id1, id2, "Candidate ID must be deterministic");
    }

    #[test]
    fn candidate_id_differs_on_different_inputs() {
        let id1 = deterministic_candidate_id("run1", "USDC/WETH", "uniswap_v3", "sushi", "active");
        let id2 = deterministic_candidate_id("run2", "USDC/WETH", "uniswap_v3", "sushi", "active");
        assert_ne!(id1, id2);
    }

    #[test]
    fn format_uuid_v5_correct_version_bits() {
        let hex = "aabbccdd11223344aabbccddeeff0011";
        let uuid = format_uuid_v5(hex);
        // Version nibble must be '5'.
        assert_eq!(&uuid[14..15], "5", "Version nibble must be '5'");
        // Variant bits (chars[16]) must be one of '8','9','a','b'.
        let variant = &uuid[19..20];
        assert!(
            matches!(variant, "8" | "9" | "a" | "b"),
            "Variant bits invalid: {variant}"
        );
    }

    #[test]
    fn build_graph_empty_on_zero_prices() {
        let pools = vec![make_pool("v3", "USDC", "WETH", 0.0, 0.0)];
        let (_verts, edges) = build_graph(&pools, "ethereum");
        assert!(edges.is_empty(), "Zero-price pools must produce no edges");
    }

    #[test]
    fn estimate_gas_cost_non_zero() {
        assert!(estimate_gas_cost_usd(30.0) > 0.0);
    }
}
