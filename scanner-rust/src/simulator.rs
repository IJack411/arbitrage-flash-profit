use ethers::types::{Address, U256};
use eyre::{eyre, Result};
use revm::{
    db::InMemoryDB,
    primitives::{
        AccountInfo, Address as RevmAddress, Bytecode, Bytes as RevmBytes, ExecutionResult,
        TransactTo, U256 as RevmU256,
    },
    EVM,
};
use tracing::{debug, warn};

use crate::config::Config;
use crate::flashlight::FlashlightEncoder;
use crate::types::{CanonicalOpportunity, SimulationResult};

pub struct Simulator {
    config: Config,
}

impl Simulator {
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    pub async fn simulate(&self, opportunity: &CanonicalOpportunity) -> Result<SimulationResult> {
        let Some(ref payload) = opportunity.execution_payload else {
            return Ok(SimulationResult {
                success: false,
                gas_used: 0,
                profit_usd: 0.0,
                revert_reason: Some("No execution payload".to_string()),
            });
        };

        debug!(
            "Simulating opportunity: {} on {}",
            opportunity.token_pair, opportunity.network
        );
        debug!(
            "Simulation config: min_net_profit_usd={}",
            self.config.min_net_profit_usd
        );

        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            payload.asset.parse::<Address>().unwrap_or_default(),
            payload.amount.parse::<U256>().unwrap_or_default(),
            payload.router_a.parse::<Address>().unwrap_or_default(),
            payload.router_b.parse::<Address>().unwrap_or_default(),
            payload.token_b.parse::<Address>().unwrap_or_default(),
            payload.router_a_is_v3,
            payload.router_b_is_v3,
            payload.fee_a,
            payload.fee_b,
            payload.amount_b_min.parse::<U256>().unwrap_or_default(),
        );

        match self.run_local_simulation(&calldata).await {
            Ok(result) => Ok(result),
            Err(error) => {
                warn!("Simulation error: {error}");
                Ok(SimulationResult {
                    success: false,
                    gas_used: 0,
                    profit_usd: 0.0,
                    revert_reason: Some(error.to_string()),
                })
            }
        }
    }

    async fn run_local_simulation(
        &self,
        calldata: &[u8],
    ) -> Result<SimulationResult> {
        let mut db = InMemoryDB::default();
        let contract_addr =
            RevmAddress::from([0xDE, 0xAD, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
        let caller_addr =
            RevmAddress::from([0xCA, 0xFE, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

        db.insert_account_info(
            caller_addr,
            AccountInfo {
                balance: RevmU256::from(10_u128.pow(20)),
                nonce: 0,
                code_hash: revm::primitives::KECCAK_EMPTY,
                code: None,
            },
        );

        let stub_bytecode = Bytecode::new_raw(RevmBytes::from_static(&[0x00]));
        let code_hash = revm::primitives::keccak256(stub_bytecode.bytes());
        db.insert_account_info(
            contract_addr,
            AccountInfo {
                balance: RevmU256::ZERO,
                nonce: 1,
                code_hash,
                code: Some(stub_bytecode),
            },
        );

        let mut evm = EVM::new();
        evm.database(db);
        evm.env.tx.caller = caller_addr;
        evm.env.tx.transact_to = TransactTo::Call(contract_addr);
        evm.env.tx.data = RevmBytes::copy_from_slice(calldata);
        evm.env.tx.value = RevmU256::ZERO;
        evm.env.tx.gas_limit = 500_000;
        evm.env.tx.gas_price = RevmU256::from(30_000_000_000_u64);

        let result = evm
            .transact_commit()
            .map_err(|err| eyre!("EVM error: {err:?}"))?;

        match result {
            ExecutionResult::Success { gas_used, .. } => Ok(SimulationResult {
                success: true,
                gas_used,
                // IMPORTANT: this revm harness only proves the calldata is
                // *executable* (gas/plumbing); it does NOT execute the real DEX
                // swaps and therefore cannot derive economic profit. Emitting
                // `opportunity.net_profit` here would be a PASS-THROUGH of the
                // detector's zero-impact prediction (a mirage). We report `0.0`
                // so no unvalidated predicted profit can leak downstream — the
                // ground-truth economic gate is the sequential price-impact
                // simulation in `crate::sim` (Phase 4).
                profit_usd: 0.0,
                revert_reason: None,
            }),
            ExecutionResult::Revert { output, gas_used } => Ok(SimulationResult {
                success: false,
                gas_used,
                profit_usd: 0.0,
                revert_reason: Some(decode_revert_reason(&output)),
            }),
            ExecutionResult::Halt { reason, gas_used } => Ok(SimulationResult {
                success: false,
                gas_used,
                profit_usd: 0.0,
                revert_reason: Some(format!("Halt: {reason:?}")),
            }),
        }
    }
}

fn decode_revert_reason(output: &RevmBytes) -> String {
    if output.len() >= 68 && output[0..4] == [0x08, 0xc3, 0x79, 0xa0] {
        if let Ok(decoded) = String::from_utf8(output[68..].to_vec()) {
            let trimmed = decoded.trim_matches(char::from(0));
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    hex::encode(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
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
    async fn test_simulation_reports_no_passthrough_profit() {
        // The revm harness proves executability only; it must NOT pass the
        // detector's predicted profit through. On success, profit is reported as
        // exactly 0.0 — economic validation is the analytic sim gate (crate::sim).
        let simulator = Simulator::new(make_test_config());
        let result = simulator
            .simulate(&make_test_opportunity())
            .await
            .expect("Simulation should not error");
        assert!(result.success);
        assert_eq!(result.profit_usd, 0.0);
    }

    #[tokio::test]
    async fn test_simulation_no_payload_fails_gracefully() {
        let simulator = Simulator::new(make_test_config());
        let mut opportunity = make_test_opportunity();
        opportunity.execution_payload = None;
        let result = simulator.simulate(&opportunity).await.expect("Should not panic");
        assert!(!result.success);
        assert!(result.revert_reason.is_some());
    }
}
