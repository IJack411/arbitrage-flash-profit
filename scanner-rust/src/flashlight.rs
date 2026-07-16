// flashlight.rs — Integration layer for the FlashLoanArbitrage (Flashlight) contract.
//
// Responsibilities:
//   • ABI-encode calldata for `executeArbitrage(...)`.
//   • Validate that the encoded payload matches the on-chain function selector.
//   • Provide helpers to decode the `ArbitrageExecuted` event log.

use anyhow::{bail, Result};
use ethers::{
    abi::{encode, Token},
    types::{Address, Bytes, Log, U256},
    utils::keccak256,
};
use std::str::FromStr;
use tracing::debug;

use crate::scanner::Opportunity;

// ── ABI selector ──────────────────────────────────────────────────────────────

/// Selector for `executeArbitrage(address,uint256,address,address,address,bool,bool,uint24,uint24,uint256)`.
/// Computed as keccak256 of the signature string, first 4 bytes.
const EXECUTE_ARBITRAGE_SELECTOR: &str = "executeArbitrage(address,uint256,address,address,address,bool,bool,uint24,uint24,uint256)";

/// `ArbitrageExecuted(address indexed,uint256,uint256,address indexed)` topic.
const ARBITRAGE_EXECUTED_TOPIC: &str =
    "ArbitrageExecuted(address,uint256,uint256,address)";

// ── Calldata builder ─────────────────────────────────────────────────────────

/// Parameters passed to `FlashLoanArbitrage.executeArbitrage`.
#[derive(Debug, Clone)]
pub struct ExecuteArbitrageParams {
    pub asset: Address,
    pub amount: U256,
    pub router_a: Address,
    pub router_b: Address,
    pub token_b: Address,
    pub router_a_is_v3: bool,
    pub router_b_is_v3: bool,
    pub fee_a: u32,
    pub fee_b: u32,
    pub amount_b_min: U256,
}

impl ExecuteArbitrageParams {
    /// Build from a scanner `Opportunity`.
    pub fn from_opportunity(opp: &Opportunity) -> Result<Self> {
        let asset = Address::from_str(&opp.asset)
            .map_err(|e| anyhow::anyhow!("Invalid asset address '{}': {e}", opp.asset))?;
        let token_b = Address::from_str(&opp.token_b)
            .map_err(|e| anyhow::anyhow!("Invalid tokenB address '{}': {e}", opp.token_b))?;
        let router_a = Address::from_str(&opp.router_a)
            .map_err(|e| anyhow::anyhow!("Invalid routerA address '{}': {e}", opp.router_a))?;
        let router_b = Address::from_str(&opp.router_b)
            .map_err(|e| anyhow::anyhow!("Invalid routerB address '{}': {e}", opp.router_b))?;

        let amount = U256::from_dec_str(&opp.loan_amount_raw)
            .map_err(|e| anyhow::anyhow!("Invalid loan amount '{}': {e}", opp.loan_amount_raw))?;
        let amount_b_min = U256::from_dec_str(&opp.amount_b_min)
            .map_err(|e| anyhow::anyhow!("Invalid amountBMin '{}': {e}", opp.amount_b_min))?;

        if amount.is_zero() {
            bail!("Loan amount must be > 0");
        }
        if asset == Address::zero() {
            bail!("Asset address is zero");
        }
        if router_a == Address::zero() || router_b == Address::zero() {
            bail!("Router address is zero");
        }
        if token_b == Address::zero() || token_b == asset {
            bail!("Invalid tokenB address");
        }

        Ok(Self {
            asset,
            amount,
            router_a,
            router_b,
            token_b,
            router_a_is_v3: opp.router_a_is_v3,
            router_b_is_v3: opp.router_b_is_v3,
            fee_a: opp.fee_a,
            fee_b: opp.fee_b,
            amount_b_min,
        })
    }

    /// ABI-encode the function calldata (selector + arguments).
    pub fn encode_calldata(&self) -> Bytes {
        let selector = &keccak256(EXECUTE_ARBITRAGE_SELECTOR.as_bytes())[..4];

        let tokens = vec![
            Token::Address(self.asset),
            Token::Uint(self.amount),
            Token::Address(self.router_a),
            Token::Address(self.router_b),
            Token::Address(self.token_b),
            Token::Bool(self.router_a_is_v3),
            Token::Bool(self.router_b_is_v3),
            Token::Uint(U256::from(self.fee_a)),
            Token::Uint(U256::from(self.fee_b)),
            Token::Uint(self.amount_b_min),
        ];

        let encoded_args = encode(&tokens);
        let calldata = [selector, &encoded_args].concat();

        debug!(
            asset = ?self.asset,
            amount = ?self.amount,
            calldata_len = calldata.len(),
            "Encoded executeArbitrage calldata"
        );

        Bytes::from(calldata)
    }
}

// ── Event decoder ─────────────────────────────────────────────────────────────

/// Decoded `ArbitrageExecuted` event.
#[derive(Debug, Clone)]
pub struct ArbitrageExecutedEvent {
    pub asset: Address,
    pub loan_amount: U256,
    pub profit: U256,
    pub initiator: Address,
    pub tx_hash: Option<[u8; 32]>,
}

/// Attempt to decode an Ethereum log as `ArbitrageExecuted`.
pub fn decode_arbitrage_executed_event(log: &Log) -> Result<ArbitrageExecutedEvent> {
    let expected_topic = keccak256(ARBITRAGE_EXECUTED_TOPIC.as_bytes());

    let first_topic = log
        .topics
        .first()
        .ok_or_else(|| anyhow::anyhow!("Log has no topics"))?;

    if first_topic.0 != expected_topic {
        bail!(
            "Log topic mismatch: expected {}, got {}",
            hex::encode(expected_topic),
            hex::encode(first_topic.0)
        );
    }

    // Indexed: asset (topic[1]), initiator (topic[3]).
    // Non-indexed in data: loanAmount, profit.
    let asset = {
        let raw = log
            .topics
            .get(1)
            .ok_or_else(|| anyhow::anyhow!("Missing asset topic"))?;
        Address::from_slice(&raw.0[12..])
    };
    let initiator = {
        let raw = log
            .topics
            .get(3)
            .unwrap_or_else(|| log.topics.last().expect("already checked len"));
        Address::from_slice(&raw.0[12..])
    };

    let data = &log.data.0;
    if data.len() < 64 {
        bail!("Log data too short to decode loanAmount and profit");
    }
    let loan_amount = U256::from_big_endian(&data[..32]);
    let profit = U256::from_big_endian(&data[32..64]);

    Ok(ArbitrageExecutedEvent {
        asset,
        loan_amount,
        profit,
        initiator,
        tx_hash: log.transaction_hash.map(|h| h.0),
    })
}

// ── Validation helpers ────────────────────────────────────────────────────────

/// Verify that the first 4 bytes of `calldata` match the expected selector.
pub fn verify_calldata_selector(calldata: &[u8]) -> bool {
    if calldata.len() < 4 {
        return false;
    }
    let expected_selector = &keccak256(EXECUTE_ARBITRAGE_SELECTOR.as_bytes())[..4];
    calldata[..4] == *expected_selector
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::Opportunity;

    fn dummy_opportunity() -> Opportunity {
        Opportunity {
            scan_run_id: "run-1".to_string(),
            candidate_id: "cand-1".to_string(),
            quote_timestamp: "2024-01-01T00:00:00Z".to_string(),
            network: "ethereum".to_string(),
            token_pair: "USDC/WETH".to_string(),
            buy_dex: "uniswap_v3".to_string(),
            sell_dex: "sushiswap_v2".to_string(),
            // Checksummed addresses
            asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".to_string(), // USDC
            token_b: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".to_string(), // WETH
            router_a: "0xE592427A0AEce92De3Edee1F18E0157C05861564".to_string(),
            router_b: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F".to_string(),
            router_a_is_v3: true,
            router_b_is_v3: false,
            fee_a: 3000,
            fee_b: 300,
            loan_amount_usd: 10_000.0,
            loan_amount_raw: "10000000000".to_string(), // 10,000 USDC (6 decimals → 10_000 * 1e6)
            amount_b_min: "2900000000000000000".to_string(), // ~2.9 WETH
            gross_profit_usd: 50.0,
            net_profit_usd: 35.0,
            spread_percent: 0.5,
            estimated_gas_cost_usd: 15.0,
            estimated_slippage_bps: 50,
            confidence_score: 72,
            status: "active".to_string(),
            reason_code: "active_execution_ready".to_string(),
        }
    }

    #[test]
    fn encode_calldata_correct_selector() {
        let opp = dummy_opportunity();
        let params = ExecuteArbitrageParams::from_opportunity(&opp).unwrap();
        let calldata = params.encode_calldata();
        assert!(
            verify_calldata_selector(&calldata),
            "Calldata selector mismatch"
        );
    }

    #[test]
    fn encode_calldata_minimum_length() {
        let opp = dummy_opportunity();
        let params = ExecuteArbitrageParams::from_opportunity(&opp).unwrap();
        let calldata = params.encode_calldata();
        // selector(4) + 10 params × 32 bytes each = 324 bytes minimum.
        assert!(
            calldata.len() >= 324,
            "Calldata too short: {} bytes",
            calldata.len()
        );
    }

    #[test]
    fn from_opportunity_validates_zero_amount() {
        let mut opp = dummy_opportunity();
        opp.loan_amount_raw = "0".to_string();
        assert!(ExecuteArbitrageParams::from_opportunity(&opp).is_err());
    }

    #[test]
    fn from_opportunity_validates_zero_asset() {
        let mut opp = dummy_opportunity();
        opp.asset = "0x0000000000000000000000000000000000000000".to_string();
        assert!(ExecuteArbitrageParams::from_opportunity(&opp).is_err());
    }

    #[test]
    fn from_opportunity_validates_same_token() {
        let mut opp = dummy_opportunity();
        opp.token_b = opp.asset.clone();
        assert!(ExecuteArbitrageParams::from_opportunity(&opp).is_err());
    }

    #[test]
    fn verify_calldata_selector_rejects_short_input() {
        assert!(!verify_calldata_selector(&[0u8; 3]));
    }
}
