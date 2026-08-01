//! Phase 7 whole-pipeline integration test.
//!
//! Drives the reusable `pipeline::run_sample` orchestration (Bellman-Ford ->
//! price-impact sim gate -> build -> validate -> encode) end to end over
//! SYNTHETIC, deterministic pool snapshots — no RPC, no network, nothing signed
//! or broadcast. Proves both that a genuinely profitable synthetic cycle surfaces
//! as an encodable survivor, and that an all-negative snapshot honestly yields
//! ZERO survivors (anti-mirage).

use std::collections::HashMap;

use ethers::types::{Address, U256};

use mev_scanner::payload::fixtures::synthetic_detectable_edges;
use mev_scanner::pipeline::{run_sample, PipelineParams};
use mev_scanner::types::{PoolEdge, PoolSwapState};

/// Phase 5 multi-hop selector for `executeArbitrage(address,uint256,Hop[])`.
const EXPECTED_SELECTOR: [u8; 4] = [0xcf, 0xaa, 0x93, 0x16];

fn a(n: u8) -> Address {
    let mut b = [0u8; 20];
    b[19] = n;
    Address::from(b)
}

fn e18(n: u128) -> U256 {
    U256::from(n) * U256::exp10(18)
}

/// Deterministic params so the test never depends on ambient env vars.
fn test_params() -> PipelineParams {
    PipelineParams {
        aave_bps: 5.0,
        loan_sizes_usd: vec![1_000.0, 5_000.0],
        gas_usd_per_hop: 4.0,
        slippage_bps: 50,
    }
}

fn v2_edge(
    token_in: Address,
    token_out: Address,
    router: Address,
    reserve_in: U256,
    reserve_out: U256,
) -> PoolEdge {
    PoolEdge {
        token_in,
        token_out,
        price: 1.0,
        liquidity_usd: 5_000_000.0,
        dex: "synthetic".to_string(),
        network: "fixture".to_string(),
        router,
        is_v3: false,
        fee: 30,
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

#[test]
fn whole_pipeline_surfaces_encodable_survivor_over_synthetic_fixture() {
    let edges = synthetic_detectable_edges();
    let asset = edges[0].token_in;

    let mut usd_prices = HashMap::new();
    // Price every token in the loop: the detected cycle may start at any rotation,
    // and the live feed prices all tokens. The USD value only sizes the loan; the
    // realized ratio is unit-less.
    usd_prices.insert(asset, 1.0);
    usd_prices.insert(a(2), 1.0);
    usd_prices.insert(a(3), 1.0);

    let report = run_sample(&edges, &usd_prices, None, &test_params());

    // Detection proposed the cycle and the sim gate let it survive.
    assert!(report.cycles_proposed >= 1, "detector must propose the fixture cycle");
    assert!(report.survived >= 1, "the profitable fixture cycle must survive");
    assert_eq!(report.survivors.len(), report.survived);

    let s = &report.survivors[0];
    // Realized net comes from the sim and must be strictly positive.
    assert!(s.realized_net_usd > 0.0, "survivor realized net must be > 0");
    assert!(s.realized_ratio > 1.0, "survivor realized ratio must exceed 1.0");

    // Route closes back to the borrowed asset.
    assert_eq!(*s.token_path.first().unwrap(), s.asset);
    assert_eq!(*s.token_path.last().unwrap(), s.asset);
    assert_eq!(s.hops, 3);
    assert_eq!(s.token_path.len(), s.hops + 1);

    // Encoded calldata matches the Phase 5 multi-hop ABI exactly.
    assert_eq!(s.selector, EXPECTED_SELECTOR, "selector must be 0xcfaa9316");
    let expected_len = 4 + 96 + 32 + s.hops * 160;
    assert_eq!(s.calldata_len, expected_len);

    // Every per-hop min is present (non-zero).
    assert_eq!(s.amount_out_mins.len(), s.hops);
    for min in &s.amount_out_mins {
        assert!(!min.is_zero(), "per-hop amountOutMin must be present");
    }

    // Coverage: the priced start token is reflected honestly.
    assert!(report.edges_priceable >= 1);
    assert!(report.coverage_pct() > 0.0);
}

#[test]
fn all_negative_snapshot_yields_zero_survivors() {
    // A closed 2-hop loop with symmetric reserves: after both 0.30% fees the
    // round trip is a guaranteed loss, so nothing may survive the sim gate.
    let asset = a(1);
    let token_b = a(2);
    let edges = vec![
        v2_edge(asset, token_b, a(11), e18(1_000_000), e18(1_000_000)),
        v2_edge(token_b, asset, a(12), e18(1_000_000), e18(1_000_000)),
    ];

    let mut usd_prices = HashMap::new();
    usd_prices.insert(asset, 1.0);

    let report = run_sample(&edges, &usd_prices, None, &test_params());

    assert_eq!(report.survived, 0, "a fee-losing loop must not survive");
    assert!(report.survivors.is_empty());
    // The block is None for a synthetic snapshot.
    assert!(report.block.is_none());
    assert_eq!(report.edges_loaded, 2);
}
