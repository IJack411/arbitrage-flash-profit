use mev_scanner::config::Config;
use mev_scanner::simulator::Simulator;
use mev_scanner::types::{
    CanonicalExecutionPayload, CanonicalOpportunity, ConfidenceTier, OpportunityStatus,
    QuoteParityPayload, SourceFlags,
};

fn make_test_config() -> Config {
    Config {
        networks: vec![],
        scanner_private_key: "0x1".to_string(),
        flashbots_signer_key: "0x1".to_string(),
        flashbots_relay_url: "http://localhost".to_string(),
        flashbots_max_priority_fee_gwei: 3,
        flashbots_fee_multiplier: 1.15,
        loan_amount_usd: 10_000.0,
        min_net_profit_usd: 14.0,
        min_spread_percent: 0.075,
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

fn make_test_opportunity() -> CanonicalOpportunity {
    CanonicalOpportunity {
        token_pair: "WETH/USDC".to_string(),
        buy_dex: "uniswap-v3".to_string(),
        sell_dex: "sushiswap".to_string(),
        network: "ethereum".to_string(),
        loan_amount: 10_000.0,
        executable_loan_amount: 10_000.0,
        gross_profit: 25.0,
        net_profit: 13.0,
        distance_to_executable_usd: 0.0,
        gas_cost: 12.0,
        confidence_score: 75.0,
        confidence_tier: ConfidenceTier::High,
        spread: "0.25%".to_string(),
        liquidity: "$5000000".to_string(),
        estimated_slippage_bps: 30,
        buy_impact_bps: 5,
        sell_impact_bps: 5,
        route_penalty_bps: 0,
        status: OpportunityStatus::Active,
        quote_sources: vec!["rpc-fallback".to_string()],
        scan_run_id: "test-run-id".to_string(),
        candidate_id: "test-candidate".to_string(),
        quote_timestamp: "2024-01-01T00:00:00Z".to_string(),
        data_source: "multi-source".to_string(),
        reason_code: "active_execution_ready".to_string(),
        execution_payload: Some(CanonicalExecutionPayload {
            asset: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".to_string(),
            amount: "5000000000000000000".to_string(),
            router_a: "0xE592427A0AEce92De3Edee1F18E0157C05861564".to_string(),
            router_b: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F".to_string(),
            token_b: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".to_string(),
            router_a_is_v3: true,
            router_b_is_v3: false,
            fee_a: 500,
            fee_b: 3000,
            amount_b_min: "9990000000".to_string(),
            token_pair: "WETH/USDC".to_string(),
            buy_dex: "uniswap-v3".to_string(),
            sell_dex: "sushiswap".to_string(),
            network: "ethereum".to_string(),
            predicted_gross_profit: 25.0,
            predicted_net_profit: 13.0,
            estimated_gas_cost: 12.0,
            estimated_slippage_bps: 30,
            scan_timestamp: "2024-01-01T00:00:00Z".to_string(),
            confidence_score: 75.0,
            quote: QuoteParityPayload {
                version: "scanner-opportunity-v1".to_string(),
                route_key: "ethereum:WETH/USDC:abc123".to_string(),
                quote_timestamp: "2024-01-01T00:00:00Z".to_string(),
                quote_token_usd_price: 2000.0,
                buy_price: 2000.0,
                expected_buy_token_amount: "10000000000".to_string(),
                amount_b_min: "9990000000".to_string(),
                token_b_decimals: 6,
                slippage_bps: 30,
                source_quality_bps: 900,
                persistence_count: 3,
                min_required_persistence: 2,
                source_flags: SourceFlags {
                    has_subgraph: false,
                    fallback_only: true,
                    same_fallback_source: false,
                },
            },
        }),
    }
}

#[tokio::test]
async fn test_simulation_validates_profit() {
    let simulator = Simulator::new(make_test_config());
    let result = simulator.simulate(&make_test_opportunity()).await.unwrap();
    assert!(result.success);
    assert!(result.profit_usd >= 0.0);
}

#[tokio::test]
async fn test_simulation_no_payload_fails_gracefully() {
    let simulator = Simulator::new(make_test_config());
    let mut opportunity = make_test_opportunity();
    opportunity.execution_payload = None;
    let result = simulator.simulate(&opportunity).await.unwrap();
    assert!(!result.success);
    assert!(result.revert_reason.is_some());
}
