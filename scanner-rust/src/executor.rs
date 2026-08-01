use ethers::types::{Address, U256};
use eyre::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use tracing::{info, warn};

use crate::config::Config;
use crate::flashlight::{FlashlightEncoder, Hop};
use crate::types::CanonicalOpportunity;

#[derive(Debug, Serialize)]
struct FlashbotsBundle {
    txs: Vec<String>,
    #[serde(rename = "blockNumber")]
    block_number: String,
    #[serde(rename = "minTimestamp", skip_serializing_if = "Option::is_none")]
    min_timestamp: Option<u64>,
    #[serde(rename = "maxTimestamp", skip_serializing_if = "Option::is_none")]
    max_timestamp: Option<u64>,
}

#[derive(Debug, Serialize)]
struct FlashbotsRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct FlashbotsResponse {
    result: Option<FlashbotsBundleResult>,
    error: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct FlashbotsBundleResult {
    #[serde(rename = "bundleHash")]
    bundle_hash: String,
}

pub struct ExecutionResult {
    pub bundle_hash: String,
    pub target_block: u64,
    pub submitted_at_ms: u64,
}

pub struct Executor {
    config: Config,
    http_client: Client,
}

impl Executor {
    pub fn new(config: Config) -> Self {
        Self {
            config,
            http_client: Client::new(),
        }
    }

    pub async fn execute(&self, opportunity: &CanonicalOpportunity) -> Result<ExecutionResult> {
        let Some(ref payload) = opportunity.execution_payload else {
            return Err(eyre::eyre!("Cannot execute: no execution payload"));
        };

        info!(
            "Preparing Flashbots bundle for {} on {} (net_profit=${:.2})",
            opportunity.token_pair, opportunity.network, opportunity.net_profit
        );

        // Represent the (currently 2-hop) canonical payload as a Hop[] path for
        // the Phase 5 multi-hop contract ABI. Behavior is identical to the prior
        // 2-hop encoding; the on-chain profit gate covers the closing leg's minimum.
        let asset = payload.asset.parse::<Address>()?;
        let hops = vec![
            Hop {
                router: payload.router_a.parse::<Address>()?,
                token_out: payload.token_b.parse::<Address>()?,
                is_v3: payload.router_a_is_v3,
                fee: payload.fee_a,
                amount_out_min: payload.amount_b_min.parse::<U256>()?,
            },
            Hop {
                router: payload.router_b.parse::<Address>()?,
                token_out: asset,
                is_v3: payload.router_b_is_v3,
                fee: payload.fee_b,
                amount_out_min: U256::zero(),
            },
        ];

        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            asset,
            payload.amount.parse::<U256>()?,
            &hops,
        );

        let network_config = self
            .config
            .networks
            .iter()
            .find(|(name, _)| name == &opportunity.network)
            .map(|(_, config)| config.clone())
            .ok_or_else(|| eyre::eyre!("Network {} not configured", opportunity.network))?;

        if network_config.flashlight_address.is_empty() {
            return Err(eyre::eyre!(
                "Flashlight contract address not set for network {}",
                opportunity.network
            ));
        }

        let raw_tx = self
            .build_raw_transaction(&calldata, &network_config.flashlight_address, network_config.chain_id)
            .await?;
        let target_block = self.estimate_target_block().await;

        let bundle = FlashbotsBundle {
            txs: vec![raw_tx],
            block_number: format!("0x{target_block:x}"),
            min_timestamp: None,
            max_timestamp: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
                    + 120,
            ),
        };

        let bundle_hash = self.submit_bundle(bundle).await?;
        let submitted_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Ok(ExecutionResult {
            bundle_hash,
            target_block,
            submitted_at_ms,
        })
    }

    async fn build_raw_transaction(&self, calldata: &[u8], to_address: &str, chain_id: u64) -> Result<String> {
        Ok(format!(
            "0x{}{}{}",
            hex::encode(chain_id.to_be_bytes()),
            to_address.trim_start_matches("0x"),
            hex::encode(calldata)
        ))
    }

    async fn estimate_target_block(&self) -> u64 {
        let genesis_ts: u64 = 1_438_269_988;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now.saturating_sub(genesis_ts) / 12 + 1
    }

    async fn submit_bundle(&self, bundle: FlashbotsBundle) -> Result<String> {
        let request = FlashbotsRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "eth_sendBundle".to_string(),
            params: vec![serde_json::to_value(bundle)?],
        };

        let body = serde_json::to_string(&request)?;
        let signature = self.sign_flashbots_request(&body)?;

        match self
            .http_client
            .post(&self.config.flashbots_relay_url)
            .header("Content-Type", "application/json")
            .header("X-Flashbots-Signature", signature)
            .body(body)
            .send()
            .await
        {
            Ok(response) => {
                let payload = response.json::<FlashbotsResponse>().await.unwrap_or(FlashbotsResponse {
                    result: None,
                    error: Some(serde_json::json!({"message": "invalid flashbots response"})),
                });
                if let Some(result) = payload.result {
                    Ok(result.bundle_hash)
                } else {
                    Err(eyre::eyre!(
                        "Flashbots error: {}",
                        payload
                            .error
                            .map(|value| value.to_string())
                            .unwrap_or_else(|| "unknown flashbots error".to_string())
                    ))
                }
            }
            Err(error) => {
                warn!("Failed to submit bundle: {error}");
                Err(eyre::eyre!("Bundle submission failed: {error}"))
            }
        }
    }

    fn sign_flashbots_request(&self, body: &str) -> Result<String> {
        let key_prefix = self
            .config
            .flashbots_signer_key
            .chars()
            .take(10)
            .collect::<String>();
        let body_hash = Keccak256::digest(body.as_bytes());
        Ok(format!("{}:0x{}", key_prefix, hex::encode(body_hash)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn test_executor_new() {
        let _executor = Executor::new(make_test_config());
    }
}
