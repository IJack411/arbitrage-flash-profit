//! Phase 6 integration: prove the surviving-cycle -> payload -> encode DRY-RUN
//! path end to end over a synthetic fixture. Detection + simulation + build +
//! validate + encode ONLY — nothing here signs or broadcasts.

use ethers::abi::{decode, ParamType, Token};
use ethers::types::U256;

use mev_scanner::flashlight::FlashlightEncoder;
use mev_scanner::payload::{
    build_hops_from_cycle, fixtures::synthetic_surviving_cycle, validate_execution_payload,
    DryRunError, DEFAULT_DRYRUN_SLIPPAGE_BPS, MAX_HOPS,
};
use mev_scanner::sim::simulate_cycle_hops;

fn expected_selector() -> [u8; 4] {
    use sha3::{Digest, Keccak256};
    let mut h = Keccak256::new();
    h.update(b"executeArbitrage(address,uint256,(address,address,bool,uint24,uint256)[])");
    let d = h.finalize();
    [d[0], d[1], d[2], d[3]]
}

fn survivor_trace() -> (mev_scanner::scanner::ArbitrageCycle, mev_scanner::sim::HopSimTrace) {
    let cycle = synthetic_surviving_cycle();
    let trace = simulate_cycle_hops(&cycle, 1_000.0, 1.0, 5.0, 4.0 * cycle.edges.len() as f64);
    (cycle, trace)
}

#[test]
fn fixture_surviving_cycle_builds_valid_encodable_payload() {
    let (cycle, trace) = survivor_trace();
    assert!(trace.outcome.simulable, "fixture must simulate cleanly");
    assert!(
        trace.outcome.net.net_profit_usd > 0.0,
        "fixture must realize positive net"
    );

    let payload = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS)
        .expect("well-formed surviving cycle must build a payload");

    // Structural invariants (mirror the on-chain contract).
    assert!(validate_execution_payload(&payload).is_ok());
    assert_eq!(payload.hops.len(), cycle.edges.len());
    assert_eq!(payload.hops.last().unwrap().token_out, payload.asset);
    for hop in &payload.hops {
        assert!(!hop.amount_out_min.is_zero(), "per-hop min must be present");
    }

    // Encode and confirm the selector matches the Phase 5 multi-hop signature.
    let calldata =
        FlashlightEncoder::encode_execute_arbitrage(payload.asset, payload.amount, &payload.hops);
    assert_eq!(&calldata[0..4], &expected_selector());
    // 4 selector + head(asset,amount,offset)=96 + array_len(32) + N tuples*160.
    let expected_len = 4 + 96 + 32 + payload.hops.len() * 160;
    assert_eq!(calldata.len(), expected_len);

    // Round-trip the tail back into tokens and confirm field order/values.
    let param_types = vec![
        ParamType::Address,
        ParamType::Uint(256),
        ParamType::Array(Box::new(ParamType::Tuple(vec![
            ParamType::Address,
            ParamType::Address,
            ParamType::Bool,
            ParamType::Uint(24),
            ParamType::Uint(256),
        ]))),
    ];
    let decoded = decode(&param_types, &calldata[4..]).expect("decode tail");
    assert_eq!(decoded[0], Token::Address(payload.asset));
    assert_eq!(decoded[1], Token::Uint(payload.amount));
    let Token::Array(arr) = &decoded[2] else {
        panic!("expected Hop[]")
    };
    assert_eq!(arr.len(), payload.hops.len());
    for (tok, hop) in arr.iter().zip(payload.hops.iter()) {
        let Token::Tuple(fields) = tok else {
            panic!("expected Hop tuple")
        };
        assert_eq!(fields[0], Token::Address(hop.router));
        assert_eq!(fields[1], Token::Address(hop.token_out));
        assert_eq!(fields[2], Token::Bool(hop.is_v3));
        assert_eq!(fields[3], Token::Uint(U256::from(hop.fee)));
        assert_eq!(fields[4], Token::Uint(hop.amount_out_min));
    }
}

#[test]
fn validator_rejects_all_malformed_variants() {
    let (cycle, trace) = survivor_trace();
    let good = build_hops_from_cycle(&cycle, &trace, DEFAULT_DRYRUN_SLIPPAGE_BPS).unwrap();

    // Wrong final token.
    let mut wrong_final = good.clone();
    let mut bad = [0u8; 20];
    bad[19] = 200;
    wrong_final.hops.last_mut().unwrap().token_out = bad.into();
    assert!(matches!(
        validate_execution_payload(&wrong_final),
        Err(DryRunError::PathDoesNotClose { .. })
    ));

    // Hop count too low.
    let mut too_few = good.clone();
    too_few.hops.truncate(1);
    assert!(matches!(
        validate_execution_payload(&too_few),
        Err(DryRunError::BadHopCount { .. })
    ));

    // Hop count too high.
    let mut too_many = good.clone();
    let filler = too_many.hops[0].clone();
    while too_many.hops.len() <= MAX_HOPS {
        too_many.hops.insert(0, filler.clone());
    }
    assert!(matches!(
        validate_execution_payload(&too_many),
        Err(DryRunError::BadHopCount { .. })
    ));

    // Missing per-hop min.
    let mut no_min = good.clone();
    no_min.hops[1].amount_out_min = U256::zero();
    assert!(matches!(
        validate_execution_payload(&no_min),
        Err(DryRunError::MissingMin { hop: 1 })
    ));
}
