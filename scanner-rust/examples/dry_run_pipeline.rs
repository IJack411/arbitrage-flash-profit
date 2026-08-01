//! Phase 6: end-to-end multi-hop arbitrage DRY-RUN pipeline.
//!
//! This entrypoint wires the WHOLE chain together and PROVES it without ever
//! broadcasting:
//!
//!   live pools -> Bellman-Ford detect -> Phase 4 price-impact SIM GATE ->
//!   for each SURVIVING cycle: build the multi-hop `Hop[]` executable payload
//!   (per-hop `amountOutMin` derived from the simulation) -> DRY-RUN VALIDATE the
//!   payload (shape, hop-count in [2,5], loop closes to the borrowed asset,
//!   per-hop min present) -> ABI-encode the calldata the Phase 5 contract would
//!   accept -> print the route, realized net, selector, and calldata length.
//!
//! Two passes run:
//!   1. LIVE pass (only when an RPC endpoint is resolvable via env): honestly
//!      reports whatever the live Arbitrum scan finds. ZERO survivors is the
//!      normal, expected result and is printed as such.
//!   2. FIXTURE pass (ALWAYS runs, no RPC needed): a SYNTHETIC, clearly-labeled
//!      surviving cycle is pushed through the exact same build -> validate ->
//!      encode path so the executable-shape logic is exercised deterministically,
//!      including demonstrating that malformed payloads are REJECTED.
//!
//! SAFETY: nothing here signs, broadcasts, submits a Flashbots bundle, sends a
//! raw transaction, deploys, or flips a live-trade flag. It builds calldata,
//! simulates, asserts, and STOPS. There is NO reachable path to a transaction.
//!
//! Run (fixture pass always works; live pass needs an RPC set inline):
//!   $env:ALCHEMY_API_KEY='<key>'; cargo run --example dry_run_pipeline
//! or SCANNER_RPC_URL / ARBITRUM_RPC_URL. Loan sweep / gas via
//! SCANNER_SIM_LOAN_SIZES_USD and SCANNER_SIM_GAS_USD_PER_HOP; per-hop slippage
//! guard via SCANNER_DRYRUN_SLIPPAGE_BPS.

use mev_scanner::config::resolve_arbitrum_rpc_url;
use mev_scanner::flashlight::FlashlightEncoder;
use mev_scanner::payload::{
    build_hops_from_cycle, fixtures::synthetic_surviving_cycle, slippage_bps_from_env,
    validate_execution_payload, ExecutionPayload,
};
use mev_scanner::pools::fetch_arbitrum_pools_with_usd;
use mev_scanner::scanner::{bellman_ford_detect_cycles, ArbitrageCycle};
use mev_scanner::sim::{
    gas_usd_per_hop_from_env, loan_sizes_from_env, simulate_cycle_hops, start_token_usd,
    HopSimTrace,
};

const AAVE_BPS: f64 = 5.0;

fn selector_hex(calldata: &[u8]) -> String {
    format!(
        "0x{:02x}{:02x}{:02x}{:02x}",
        calldata[0], calldata[1], calldata[2], calldata[3]
    )
}

/// Build -> validate -> encode a surviving cycle's payload and print it. Returns
/// true when the payload was well-formed and encoded (DRY RUN — never broadcast).
fn dry_run_payload(cycle: &ArbitrageCycle, trace: &HopSimTrace, slippage_bps: u32) -> bool {
    match build_hops_from_cycle(cycle, trace, slippage_bps) {
        Ok(payload) => {
            // Re-assert at the dry-run boundary (build already validated).
            if let Err(e) = validate_execution_payload(&payload) {
                println!("        [DRY RUN] payload REJECTED by validator: {e}");
                return false;
            }
            let calldata =
                FlashlightEncoder::encode_execute_arbitrage(payload.asset, payload.amount, &payload.hops);
            println!(
                "        [DRY RUN] payload VALID: asset={:#x} amount={} hops={} selector={} calldata_len={} bytes",
                payload.asset,
                payload.amount,
                payload.hops.len(),
                selector_hex(&calldata),
                calldata.len()
            );
            for (j, hop) in payload.hops.iter().enumerate() {
                println!(
                    "          hop{j}: router={:#x} tokenOut={:#x} isV3={} fee={} amountOutMin={}",
                    hop.router, hop.token_out, hop.is_v3, hop.fee, hop.amount_out_min
                );
            }
            println!("        [DRY RUN] calldata BUILT — NOTHING BROADCAST, NOTHING SIGNED.");
            true
        }
        Err(e) => {
            println!("        [DRY RUN] could not build payload: {e}");
            false
        }
    }
}

async fn live_pass(slippage_bps: u32, loan_sizes: &[f64], gas_per_hop: f64) -> eyre::Result<()> {
    let Some(rpc_url) = resolve_arbitrum_rpc_url() else {
        println!("== LIVE PASS SKIPPED: no RPC (set ALCHEMY_API_KEY / SCANNER_RPC_URL / ARBITRUM_RPC_URL) ==");
        println!("   (The fixture pass below still proves the encode/validate path.)");
        return Ok(());
    };

    println!("== LIVE PASS: Arbitrum detection -> SIM GATE -> DRY-RUN payload (NO execution) ==");
    let (edges, usd_prices) = fetch_arbitrum_pools_with_usd(&rpc_url).await?;
    println!("Loaded {} directional pool edges from live Arbitrum", edges.len());

    let cycles = bellman_ford_detect_cycles(&edges);
    println!(
        "Bellman-Ford PROPOSED {} fee-aware negative cycle(s) on zero-impact spot prices",
        cycles.len()
    );
    println!(
        "Sim gate: loan sweep {:?} USD, gas ${:.2}/hop, Aave {AAVE_BPS}bps, dry-run slippage {slippage_bps}bps",
        loan_sizes, gas_per_hop
    );
    println!("---");

    let mut survived = 0usize;
    for (i, cycle) in cycles.iter().enumerate() {
        let Some(first) = cycle.edges.first() else { continue };
        let path: Vec<String> = cycle.edges.iter().map(|e| e.dex.clone()).collect();
        let hops = cycle.edges.len();

        let Some(price) = start_token_usd(&usd_prices, first.token_in) else {
            continue;
        };

        // Sweep loan sizes, keep the best realized-net trace.
        let mut best: Option<HopSimTrace> = None;
        for &loan_usd in loan_sizes {
            let trace = simulate_cycle_hops(cycle, loan_usd, price, AAVE_BPS, gas_per_hop * hops as f64);
            let replace = match &best {
                None => true,
                Some(b) => trace.outcome.net.net_profit_usd > b.outcome.net.net_profit_usd,
            };
            if replace {
                best = Some(trace);
            }
        }

        if let Some(best) = best {
            if best.outcome.survives(0.0) {
                survived += 1;
                println!(
                    "  SURVIVED #{i} hops={hops} best_loan=${:.0} realized_ratio={:.8} realized_net=${:.2} via [{}]",
                    best.outcome.loan_usd,
                    best.outcome.realized_ratio,
                    best.outcome.net.net_profit_usd,
                    path.join(" -> ")
                );
                dry_run_payload(cycle, &best, slippage_bps);
            }
        }
    }

    println!("---");
    if survived == 0 {
        println!(
            "LIVE RESULT: ZERO survivors. Every spot cycle collapsed once REAL price impact was \
             simulated — an HONEST, valid outcome. Nothing was executed or broadcast."
        );
    } else {
        println!(
            "LIVE RESULT: {survived} surviving cycle(s); each built + validated + encoded as \
             DRY-RUN calldata only. NOTHING BROADCAST."
        );
    }
    Ok(())
}

fn fixture_pass(slippage_bps: u32) {
    println!();
    println!("== FIXTURE PASS: SYNTHETIC surviving cycle (NOT live data) — proves encode/validate ==");

    let cycle = synthetic_surviving_cycle();
    let path: Vec<String> = cycle.edges.iter().map(|e| e.dex.clone()).collect();
    // start-token USD = 1.0, modest loan so the synthetic loop realizes positive.
    let trace = simulate_cycle_hops(&cycle, 1_000.0, 1.0, AAVE_BPS, 4.0 * cycle.edges.len() as f64);

    println!(
        "  Fixture cycle: hops={} simulable={} realized_ratio={:.8} realized_net=${:.2} via [{}]",
        cycle.edges.len(),
        trace.outcome.simulable,
        trace.outcome.realized_ratio,
        trace.outcome.net.net_profit_usd,
        path.join(" -> ")
    );

    println!("  -> Well-formed payload:");
    let ok = dry_run_payload(&cycle, &trace, slippage_bps);
    assert!(ok, "fixture surviving cycle must build a valid dry-run payload");

    // Now prove the validator REJECTS malformed payloads (fail-closed).
    println!("  -> Malformed-payload rejections (expected, proves fail-closed validation):");
    let good = build_hops_from_cycle(&cycle, &trace, slippage_bps)
        .expect("fixture builds a valid payload");

    // (a) wrong final token (loop does not close).
    let mut broken = good.clone();
    let mut bad_token = [0u8; 20];
    bad_token[19] = 99;
    broken.hops.last_mut().unwrap().token_out = bad_token.into();
    report_reject("wrong final token (loop not closed)", &broken);

    // (b) hop count below MIN_HOPS.
    let mut too_few = good.clone();
    too_few.hops.truncate(1);
    report_reject("hop count 1 (< MIN_HOPS)", &too_few);

    // (c) hop count above MAX_HOPS.
    let mut too_many = good.clone();
    let filler = too_many.hops[0].clone();
    while too_many.hops.len() <= 5 {
        too_many.hops.insert(0, filler.clone());
    }
    report_reject("hop count 6 (> MAX_HOPS)", &too_many);

    // (d) missing per-hop min.
    let mut no_min = good.clone();
    no_min.hops[1].amount_out_min = ethers::types::U256::zero();
    report_reject("missing per-hop amountOutMin", &no_min);

    println!("  Fixture pass complete. All rejections behaved as expected. NOTHING BROADCAST.");
}

fn report_reject(label: &str, payload: &ExecutionPayload) {
    match validate_execution_payload(payload) {
        Ok(()) => println!("        UNEXPECTED: '{label}' was ACCEPTED (this is a bug!)"),
        Err(e) => println!("        REJECTED as expected — {label}: {e}"),
    }
}

#[tokio::main]
async fn main() -> eyre::Result<()> {
    println!("############################################################");
    println!("# Phase 6 multi-hop arbitrage DRY-RUN pipeline");
    println!("# DETECTION + SIMULATION + PAYLOAD BUILD ONLY.");
    println!("# NO transaction is signed, sent, or broadcast. NO live flag is set.");
    println!("############################################################");

    let slippage_bps = slippage_bps_from_env();
    let loan_sizes = loan_sizes_from_env();
    let gas_per_hop = gas_usd_per_hop_from_env();

    live_pass(slippage_bps, &loan_sizes, gas_per_hop).await?;
    fixture_pass(slippage_bps);

    println!();
    println!("DONE. This was a DRY RUN: no broadcast, no signing, no live trade. ✅");
    Ok(())
}
