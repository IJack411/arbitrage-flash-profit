//! Phase 4 detection + simulation-gate live dry run.
//!
//! Pipeline: fetch REAL Arbitrum multi-DEX pool state (reusing the Phase 3 feed)
//! -> fee-aware Bellman-Ford proposes candidate cycles on ZERO-IMPACT spot prices
//! -> the Phase 4 price-impact SIMULATION GATE (`mev_scanner::sim`) executes each
//! cycle's swaps hop-by-hop against real reserves / concentrated liquidity, sweeps
//! several loan sizes, and keeps only cycles whose REALIZED net (from the
//! simulation, never the detector's prediction) is positive.
//!
//! It is detection + simulation ONLY: it never signs, broadcasts, approves, or
//! flips any live flag, and cannot send a transaction. A result of ZERO survivors
//! is the honest, expected outcome most of the time — spot spreads are mirages
//! that price impact erases.
//!
//! Run with an RPC configured, e.g.:
//!   $env:ALCHEMY_API_KEY='<key>'; cargo run --example sim_gate_scan
//! or SCANNER_RPC_URL / ARBITRUM_RPC_URL. Loan sweep and per-hop gas are
//! configurable via SCANNER_SIM_LOAN_SIZES_USD and SCANNER_SIM_GAS_USD_PER_HOP.

use mev_scanner::config::resolve_arbitrum_rpc_url;
use mev_scanner::pools::fetch_arbitrum_pools_with_usd;
use mev_scanner::scanner::bellman_ford_detect_cycles;
use mev_scanner::sim::{
    gas_usd_per_hop_from_env, loan_sizes_from_env, simulate_cycle_best, start_token_usd,
};

#[tokio::main]
async fn main() -> eyre::Result<()> {
    let rpc_url = resolve_arbitrum_rpc_url().ok_or_else(|| {
        eyre::eyre!("No RPC: set ALCHEMY_API_KEY, SCANNER_RPC_URL, or ARBITRUM_RPC_URL")
    })?;

    println!("== Phase 4 live detection + price-impact SIM GATE (NO execution, NO broadcast) ==");

    let (edges, usd_prices) = fetch_arbitrum_pools_with_usd(&rpc_url).await?;
    println!("Loaded {} directional pool edges from live Arbitrum", edges.len());

    let cycles = bellman_ford_detect_cycles(&edges);
    println!(
        "Bellman-Ford PROPOSED {} fee-aware negative cycle(s) on zero-impact spot prices",
        cycles.len()
    );

    let aave_bps = 5.0;
    let loan_sizes = loan_sizes_from_env();
    let gas_per_hop = gas_usd_per_hop_from_env();
    println!(
        "Sim gate: loan sweep {:?} USD, gas ${:.2}/hop, Aave {aave_bps}bps",
        loan_sizes, gas_per_hop
    );
    println!("---");

    let mut survived = 0usize;
    let mut rejected_unsimulable = 0usize;
    let mut rejected_negative = 0usize;

    for (i, cycle) in cycles.iter().enumerate() {
        let Some(first) = cycle.edges.first() else { continue };
        let path: Vec<String> = cycle.edges.iter().map(|e| e.dex.clone()).collect();
        let hops = cycle.edges.len();

        // USD price of the loop's start token, for sizing the loan.
        let Some(price) = start_token_usd(&usd_prices, first.token_in) else {
            rejected_unsimulable += 1;
            if i < 10 {
                println!(
                    "  REJECT #{i} hops={hops} spot_ratio={:.6}: no USD price for start token {:#x} via [{}]",
                    cycle.profit_ratio, first.token_in, path.join(" -> ")
                );
            }
            continue;
        };

        match simulate_cycle_best(cycle, price, aave_bps, &loan_sizes, gas_per_hop) {
            Some(best) if best.survives(0.0) => {
                survived += 1;
                println!(
                    "  SURVIVED #{i} hops={hops} best_loan=${:.0} realized_ratio={:.8} realized_net=${:.2} via [{}]",
                    best.loan_usd, best.realized_ratio, best.net.net_profit_usd, path.join(" -> ")
                );
                for (j, e) in cycle.edges.iter().enumerate() {
                    println!(
                        "        leg{j}: {} {:#x}->{:#x} fee_ppm={} v3={} liq_usd=${:.0}",
                        e.dex, e.token_in, e.token_out, e.fee, e.is_v3, e.liquidity_usd
                    );
                }
            }
            Some(best) => {
                if best.simulable {
                    rejected_negative += 1;
                } else {
                    rejected_unsimulable += 1;
                }
                if i < 10 {
                    println!(
                        "  REJECT #{i} hops={hops} spot_ratio={:.6} -> realized_net=${:.2} ({}) via [{}]",
                        cycle.profit_ratio,
                        best.net.net_profit_usd,
                        best.reject_reason.as_deref().unwrap_or("simulated net <= 0"),
                        path.join(" -> ")
                    );
                }
            }
            None => {
                rejected_unsimulable += 1;
            }
        }
    }

    println!("---");
    println!(
        "GATE RESULT: proposed={} | survived={} | rejected_negative={} | rejected_unsimulable={}",
        cycles.len(),
        survived,
        rejected_negative,
        rejected_unsimulable
    );
    if survived == 0 {
        println!(
            "ZERO survivors: every spot cycle collapsed once REAL price impact was simulated. \
             This is an HONEST, valid result — the detector's spreads were mirages. \
             Nothing was executed or broadcast."
        );
    } else {
        println!(
            "{survived} cycle(s) survived the price-impact sim with positive REALIZED net \
             (from simulation, not prediction). Still detection-only: nothing was executed."
        );
    }
    Ok(())
}
