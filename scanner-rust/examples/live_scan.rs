//! Phase 3 detection-only live dry run.
//!
//! Fetches REAL Arbitrum multi-DEX pool state and runs the fee-aware
//! Bellman-Ford detector. It NEVER touches the executor, never signs, never
//! broadcasts, and never flips any live flag — it only reads chain state and
//! prints what the detector finds (net-positive opportunities, if any, plus the
//! best near-misses for insight).
//!
//! Run with an RPC configured, e.g.:
//!   $env:ALCHEMY_API_KEY='<key>'; cargo run --example live_scan
//! or SCANNER_RPC_URL / ARBITRUM_RPC_URL.

use mev_scanner::config::resolve_arbitrum_rpc_url;
use mev_scanner::pools::fetch_arbitrum_pools;
use mev_scanner::scanner::{bellman_ford_detect_cycles, compute_net_profit};

#[tokio::main]
async fn main() -> eyre::Result<()> {
    let rpc_url = resolve_arbitrum_rpc_url()
        .ok_or_else(|| eyre::eyre!("No RPC: set ALCHEMY_API_KEY, SCANNER_RPC_URL, or ARBITRUM_RPC_URL"))?;

    println!("== Phase 3 live detection-only dry run (NO execution, NO broadcast) ==");
    let edges = fetch_arbitrum_pools(&rpc_url).await?;
    println!("Loaded {} directional pool edges from live Arbitrum", edges.len());
    let with_liq = edges.iter().filter(|e| e.liquidity_usd > 0.0).count();
    let max_liq = edges.iter().map(|e| e.liquidity_usd).fold(0.0_f64, f64::max);
    println!(
        "  liquidity coverage: {with_liq}/{} edges have liq_usd>0 (max=${:.0})",
        edges.len(), max_liq
    );

    // Raw fee-aware cycles (net of swap fees, gross of fixed costs).
    let mut cycles = bellman_ford_detect_cycles(&edges);
    println!("Bellman-Ford found {} fee-aware negative cycle(s)", cycles.len());

    // Fixed-cost assumptions for the net check (same defaults as the scanner).
    let loan_usd = 10_000.0;
    let aave_bps = 5.0;
    let gas_usd = 12.0;

    // Sort best-first by profit ratio.
    cycles.sort_by(|a, b| b.profit_ratio.partial_cmp(&a.profit_ratio).unwrap());

    let mut net_positive = 0;
    for (i, c) in cycles.iter().enumerate() {
        let net = compute_net_profit(c.profit_ratio, loan_usd, aave_bps, gas_usd);
        let path: Vec<String> = c
            .edges
            .iter()
            .map(|e| e.dex.to_string())
            .collect();
        let hops = c.edges.len();
        if net.net_profit_usd > 0.0 {
            net_positive += 1;
            println!(
                "  NET+  #{i} ratio={:.6} hops={hops} net=${:.2} via [{}]",
                c.profit_ratio, net.net_profit_usd, path.join(" -> ")
            );
            for (j, e) in c.edges.iter().enumerate() {
                println!(
                    "        leg{j}: {} {}->{} price={:.10} fee_ppm={} v3={} liq_usd=${:.0}",
                    e.dex, e.token_in, e.token_out, e.price, e.fee, e.is_v3, e.liquidity_usd
                );
            }
        } else if i < 10 {
            println!(
                "  near  #{i} ratio={:.6} hops={hops} net=${:.2} (gross=${:.2}) via [{}]",
                c.profit_ratio, net.net_profit_usd, net.gross_after_swap_fees_usd, path.join(" -> ")
            );
        }
    }

    println!("---");
    println!(
        "NOTE: liquidity_usd is derived from on-chain balances valued against \
         stablecoin anchors, and pools below SCANNER_MIN_POOL_LIQUIDITY_USD are \
         skipped as dust. The net check still assumes a ${loan_usd} loan trades \
         at ZERO price impact, so any cycle below is UNVALIDATED — real \
         sequential price-impact validation is Phase 4 (revm sim = ground truth). \
         DO NOT trust or trade these."
    );
    if net_positive == 0 {
        println!(
            "RESULT: ZERO net-positive multi-hop opportunities on live Arbitrum \
             (loan=${loan_usd}, Aave {aave_bps}bps, gas ${gas_usd}). Honest expected outcome."
        );
    } else {
        println!("RESULT: {net_positive} UNVALIDATED cycle(s) detected (see NOTE) — treat as mirages until Phase 4 revm sim confirms.");
    }
    Ok(())
}
