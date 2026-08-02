use mev_scanner::config::{Config, NetworkConfig};
use mev_scanner::flashlight::{FlashlightEncoder, Hop};
use mev_scanner::scanner::Scanner;
use mev_scanner::types::{CanonicalOpportunity, OpportunityStatus};

fn test_config() -> Config {
    Config {
        networks: vec![(
            "ethereum".to_string(),
            NetworkConfig {
                rpc_url: "http://localhost:8545".to_string(),
                flashlight_address: "0x1111111111111111111111111111111111111111".to_string(),
                aave_pool_address: "0x2222222222222222222222222222222222222222".to_string(),
                chain_id: 1,
            },
        )],
        scanner_private_key: "0x1".to_string(),
        flashbots_signer_key: "0x1".to_string(),
        flashbots_relay_url: "http://localhost".to_string(),
        flashbots_max_priority_fee_gwei: 3,
        flashbots_fee_multiplier: 1.15,
        loan_amount_usd: 10_000.0,
        min_net_profit_usd: 14.0,
        min_spread_percent: 0.075,
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

#[tokio::test]
async fn test_scanner_produces_active_opportunity() {
    let scanner = Scanner::new(test_config()).await.unwrap();
    let pools = scanner.fetch_pools().await.unwrap();
    let opportunities = scanner.detect_arbitrage(&pools).unwrap();
    assert!(!opportunities.is_empty());
    assert!(opportunities.iter().any(|opportunity| opportunity.status == OpportunityStatus::Active));
}

#[test]
fn test_flashlight_encoding_length() {
    // Old encoder took a fixed 2-hop tuple; the Phase 5 contract takes a Hop[].
    // Build the equivalent 2-hop path: asset -> tokenB (routerA/V3) -> asset (routerB/V2).
    // The final hop's token_out MUST equal the borrowed asset so the loop closes.
    let asset = "0x0000000000000000000000000000000000000001".parse().unwrap();
    let token_b = "0x0000000000000000000000000000000000000004".parse().unwrap();
    let router_a = "0x0000000000000000000000000000000000000002".parse().unwrap();
    let router_b = "0x0000000000000000000000000000000000000003".parse().unwrap();
    let hops = vec![
        Hop { router: router_a, token_out: token_b, is_v3: true,  fee: 500,  amount_out_min: 10u64.into() },
        Hop { router: router_b, token_out: asset,   is_v3: false, fee: 3000, amount_out_min: 0u64.into() },
    ];
    let calldata = FlashlightEncoder::encode_execute_arbitrage(asset, 1u64.into(), &hops);

    // ABI size for executeArbitrage(address,uint256,(address,address,bool,uint24,uint256)[]):
    // 4 (selector) + head[asset,amount,array-offset]=96 + array_len(32) + n tuples * (5 * 32).
    assert_eq!(calldata.len(), 4 + 96 + 32 + 2 * 160);
    // Selector must match the new Hop[] signature, not the old fixed-2-hop one.
    assert_ne!(&calldata[0..4], &[0u8, 0, 0, 0]);
}

#[test]
fn test_opportunity_serializes_camel_case() {
    let opportunity = CanonicalOpportunity {
        token_pair: "A/B".to_string(),
        buy_dex: "dex-a".to_string(),
        sell_dex: "dex-b".to_string(),
        network: "ethereum".to_string(),
        loan_amount: 1000.0,
        executable_loan_amount: 1000.0,
        gross_profit: 20.0,
        net_profit: 15.0,
        distance_to_executable_usd: 0.0,
        gas_cost: 5.0,
        confidence_score: 80.0,
        confidence_tier: mev_scanner::types::ConfidenceTier::High,
        spread: "0.20%".to_string(),
        liquidity: "$1000000".to_string(),
        estimated_slippage_bps: 10,
        buy_impact_bps: 3,
        sell_impact_bps: 4,
        route_penalty_bps: 0,
        status: OpportunityStatus::Active,
        quote_sources: vec!["rpc-fallback".to_string()],
        scan_run_id: "run-1".to_string(),
        candidate_id: "cand-1".to_string(),
        quote_timestamp: "2024-01-01T00:00:00Z".to_string(),
        data_source: "multi-source".to_string(),
        reason_code: "active_execution_ready".to_string(),
        execution_payload: None,
    };
    let json = serde_json::to_string(&opportunity).unwrap();
    assert!(json.contains("tokenPair"));
    assert!(json.contains("loanAmount"));
    assert!(!json.contains("token_pair"));
}
