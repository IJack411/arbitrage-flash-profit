// executor.rs — Flashbots bundle construction and submission.
//
// Flow:
//   1. Receive a validated `Opportunity` from the scanner.
//   2. Encode `executeArbitrage` calldata via `flashlight.rs`.
//   3. Build a Flashbots bundle (single transaction).
//   4. Sign the bundle request with the Flashbots signer key.
//   5. POST to the Flashbots relay.
//   6. Log result + update Prometheus metrics.

use anyhow::{bail, Context, Result};
use chrono::Utc;
use ethers::{
    signers::{LocalWallet, Signer},
    types::{Address, Bytes, U256, U64},
    utils::keccak256,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tracing::{error, info, warn};

use crate::config::Config;
use crate::flashlight::ExecuteArbitrageParams;
use crate::metrics::Metrics;
use crate::scanner::Opportunity;

// ── Bundle structures ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleTransaction {
    /// Raw signed transaction bytes (hex-encoded with 0x prefix).
    signed_transaction: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FlashbotsBundleRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: Vec<FlashbotsBundleParams>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FlashbotsBundleParams {
    txs: Vec<String>,
    block_number: String,
    min_timestamp: Option<u64>,
    max_timestamp: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlashbotsBundleResponse {
    #[serde(default)]
    result: Option<BundleResult>,
    #[serde(default)]
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleResult {
    bundle_hash: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
}

// ── Execution result ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ExecutionAttempt {
    pub opportunity_id: String,
    pub scan_run_id: String,
    pub candidate_id: String,
    pub network: String,
    pub token_pair: String,
    pub bundle_hash: Option<String>,
    pub target_block: Option<u64>,
    pub shadow_mode: bool,
    pub success: bool,
    pub failure_reason: Option<String>,
    pub submitted_at: String,
    pub net_profit_usd: f64,
}

// ── Executor ──────────────────────────────────────────────────────────────────

pub struct Executor {
    config: Config,
    http: Client,
    signer_wallet: LocalWallet,
    executor_wallet: LocalWallet,
    metrics: Metrics,
}

impl Executor {
    pub fn new(config: Config, metrics: Metrics) -> Result<Self> {
        let signer_key = strip_0x(&config.flashbots_signer_private_key);
        let signer_wallet = signer_key
            .parse::<LocalWallet>()
            .context("Failed to parse FLASHBOTS_SIGNER_PRIVATE_KEY")?;

        let exec_key = strip_0x(&config.scanner_private_key);
        let executor_wallet = exec_key
            .parse::<LocalWallet>()
            .context("Failed to parse SCANNER_PRIVATE_KEY")?;

        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        Ok(Self {
            config,
            http,
            signer_wallet,
            executor_wallet,
            metrics,
        })
    }

    /// Attempt to execute an opportunity via Flashbots.
    /// In shadow mode the bundle is constructed and validated but NOT submitted.
    pub async fn execute(&self, opp: &Opportunity, current_block: u64) -> ExecutionAttempt {
        let now = Utc::now().to_rfc3339();
        let target_block = current_block + 1;

        let mut attempt = ExecutionAttempt {
            opportunity_id: format!("{}:{}", opp.scan_run_id, opp.candidate_id),
            scan_run_id: opp.scan_run_id.clone(),
            candidate_id: opp.candidate_id.clone(),
            network: opp.network.clone(),
            token_pair: opp.token_pair.clone(),
            bundle_hash: None,
            target_block: Some(target_block),
            shadow_mode: self.config.shadow_mode,
            success: false,
            failure_reason: None,
            submitted_at: now,
            net_profit_usd: opp.net_profit_usd,
        };

        // ── Validate quote freshness ──────────────────────────────────────────
        if let Err(e) = self.validate_quote_freshness(opp) {
            attempt.failure_reason = Some(e.to_string());
            self.metrics.record_execution_failure(&opp.network, "stale_quote");
            warn!(
                candidate_id = %opp.candidate_id,
                reason = %e,
                "Skipping stale opportunity"
            );
            return attempt;
        }

        // ── Build calldata ────────────────────────────────────────────────────
        let params = match ExecuteArbitrageParams::from_opportunity(opp) {
            Ok(p) => p,
            Err(e) => {
                attempt.failure_reason = Some(format!("calldata_build_failed: {e}"));
                self.metrics.record_execution_failure(&opp.network, "calldata_error");
                error!(error = %e, "Failed to build executeArbitrage calldata");
                return attempt;
            }
        };

        let calldata: Bytes = params.encode_calldata();

        if self.config.shadow_mode {
            info!(
                candidate_id = %opp.candidate_id,
                net_profit_usd = opp.net_profit_usd,
                calldata_len = calldata.len(),
                "SHADOW MODE: bundle would be submitted (not sending)"
            );
            attempt.success = true;
            attempt.bundle_hash = Some(format!(
                "shadow:{}:{}",
                opp.candidate_id,
                target_block
            ));
            self.metrics.record_shadow_execution(&opp.network);
            return attempt;
        }

        // ── Build and submit bundle ───────────────────────────────────────────
        match self.submit_bundle(opp, calldata, target_block).await {
            Ok(bundle_hash) => {
                info!(
                    candidate_id = %opp.candidate_id,
                    bundle_hash = %bundle_hash,
                    target_block,
                    "Bundle submitted"
                );
                attempt.success = true;
                attempt.bundle_hash = Some(bundle_hash);
                self.metrics.record_execution_success(&opp.network);
            }
            Err(e) => {
                error!(
                    candidate_id = %opp.candidate_id,
                    error = %e,
                    "Bundle submission failed"
                );
                attempt.failure_reason = Some(e.to_string());
                self.metrics.record_execution_failure(&opp.network, "submission_error");
            }
        }

        attempt
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn validate_quote_freshness(&self, opp: &Opportunity) -> Result<()> {
        let quote_ts = chrono::DateTime::parse_from_rfc3339(&opp.quote_timestamp)
            .context("Invalid quoteTimestamp")?;
        let age_ms = (Utc::now() - quote_ts.with_timezone(&Utc))
            .num_milliseconds()
            .max(0) as u64;
        if age_ms > self.config.max_quote_age_ms {
            bail!(
                "execution_quote_stale: quote is {age_ms}ms old (max {}ms)",
                self.config.max_quote_age_ms
            );
        }
        Ok(())
    }

    async fn submit_bundle(
        &self,
        opp: &Opportunity,
        calldata: Bytes,
        target_block: u64,
    ) -> Result<String> {
        // Build the raw signed transaction.
        let raw_tx = self
            .build_signed_transaction(opp, calldata, target_block)
            .await?;

        let block_number_hex = format!("0x{target_block:x}");
        let bundle_params = FlashbotsBundleParams {
            txs: vec![hex::encode(&raw_tx)],
            block_number: block_number_hex,
            min_timestamp: None,
            max_timestamp: Some(
                (Utc::now().timestamp() as u64)
                    + (self.config.max_quote_age_ms / 1_000).max(30),
            ),
        };

        let request = FlashbotsBundleRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "eth_sendBundle".to_string(),
            params: vec![bundle_params],
        };

        // Sign the Flashbots request body.
        let body_bytes = serde_json::to_vec(&request)?;
        let body_hash = keccak256(&body_bytes);
        let signature = self
            .signer_wallet
            .sign_message(body_hash.as_ref())
            .await?;
        let signer_address = self.signer_wallet.address();
        let flashbots_signature = format!("{signer_address:#x}:{signature}");

        let resp: FlashbotsBundleResponse = self
            .http
            .post(&self.config.flashbots_relay_url)
            .header("X-Flashbots-Signature", flashbots_signature)
            .json(&request)
            .send()
            .await
            .context("HTTP request to Flashbots relay failed")?
            .json()
            .await
            .context("Failed to parse Flashbots relay response")?;

        if let Some(err) = resp.error {
            bail!("Flashbots relay error {}: {}", err.code, err.message);
        }

        let bundle_hash = resp
            .result
            .and_then(|r| r.bundle_hash)
            .unwrap_or_else(|| format!("unknown:{}", opp.candidate_id));

        Ok(bundle_hash)
    }

    /// Build a raw EIP-1559 signed transaction targeting the Flashlight contract.
    async fn build_signed_transaction(
        &self,
        opp: &Opportunity,
        calldata: Bytes,
        _target_block: u64,
    ) -> Result<Vec<u8>> {
        use ethers::types::transaction::eip2718::TypedTransaction;
        use ethers::types::transaction::eip1559::Eip1559TransactionRequest;

        let contract_addr =
            Address::from_str(&self.config.flashlight_contract_address)
                .context("Invalid FLASHLIGHT_CONTRACT_ADDRESS")?;

        let nonce = self
            .get_nonce()
            .await
            .unwrap_or(U256::zero());

        // Conservative gas estimate. In production this would use eth_estimateGas.
        let gas_limit = U256::from(400_000u64);

        let tx: TypedTransaction = Eip1559TransactionRequest {
            to: Some(contract_addr.into()),
            data: Some(calldata),
            gas: Some(gas_limit),
            nonce: Some(nonce),
            value: Some(U256::zero()),
            max_fee_per_gas: Some(U256::from(
                (net_max_fee_gwei(opp, &self.config) * 1e9) as u64,
            )),
            max_priority_fee_per_gas: Some(U256::from(1_000_000_000u64)), // 1 gwei tip
            chain_id: Some(U64::from(chain_id_for_network(&opp.network))),
            ..Default::default()
        }
        .into();

        let sig = self.executor_wallet.sign_transaction(&tx).await?;
        let raw = tx.rlp_signed(&sig);
        Ok(raw.to_vec())
    }

    async fn get_nonce(&self) -> Result<U256> {
        // In production, this would call eth_getTransactionCount via the provider.
        // Returning 0 as a stub that works for test/simulation environments.
        Ok(U256::zero())
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn strip_0x(s: &str) -> &str {
    s.strip_prefix("0x").unwrap_or(s)
}

fn chain_id_for_network(network: &str) -> u64 {
    match network {
        "ethereum" => 1,
        "arbitrum" => 42161,
        "base" => 8453,
        "polygon" => 137,
        _ => 1,
    }
}

fn net_max_fee_gwei(opp: &Opportunity, config: &Config) -> f64 {
    config
        .networks
        .iter()
        .find(|n| n.network.as_str() == opp.network)
        .map(|n| n.max_gas_gwei)
        .unwrap_or(100.0)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_id_known_networks() {
        assert_eq!(chain_id_for_network("ethereum"), 1);
        assert_eq!(chain_id_for_network("arbitrum"), 42161);
        assert_eq!(chain_id_for_network("base"), 8453);
        assert_eq!(chain_id_for_network("polygon"), 137);
    }

    #[test]
    fn chain_id_unknown_defaults_to_mainnet() {
        assert_eq!(chain_id_for_network("foonet"), 1);
    }

    #[test]
    fn strip_0x_removes_prefix() {
        assert_eq!(strip_0x("0xdeadbeef"), "deadbeef");
        assert_eq!(strip_0x("deadbeef"), "deadbeef");
    }
}
