use ethers::types::Address;
use serde::{Deserialize, Serialize};

pub const CANONICAL_OPPORTUNITY_VERSION: &str = "scanner-opportunity-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteParityPayload {
    pub version: String,
    pub route_key: String,
    pub quote_timestamp: String,
    pub quote_token_usd_price: f64,
    pub buy_price: f64,
    pub expected_buy_token_amount: String,
    pub amount_b_min: String,
    pub token_b_decimals: u32,
    pub slippage_bps: u32,
    pub source_quality_bps: u32,
    pub persistence_count: u32,
    pub min_required_persistence: u32,
    pub source_flags: SourceFlags,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFlags {
    pub has_subgraph: bool,
    pub fallback_only: bool,
    pub same_fallback_source: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalExecutionPayload {
    pub asset: String,
    pub amount: String,
    pub router_a: String,
    pub router_b: String,
    pub token_b: String,
    pub router_a_is_v3: bool,
    pub router_b_is_v3: bool,
    pub fee_a: u32,
    pub fee_b: u32,
    pub amount_b_min: String,
    pub token_pair: String,
    pub buy_dex: String,
    pub sell_dex: String,
    pub network: String,
    pub predicted_gross_profit: f64,
    pub predicted_net_profit: f64,
    pub estimated_gas_cost: f64,
    pub estimated_slippage_bps: u32,
    pub scan_timestamp: String,
    pub confidence_score: f64,
    pub quote: QuoteParityPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalOpportunity {
    pub token_pair: String,
    pub buy_dex: String,
    pub sell_dex: String,
    pub network: String,
    pub loan_amount: f64,
    pub executable_loan_amount: f64,
    pub gross_profit: f64,
    pub net_profit: f64,
    pub distance_to_executable_usd: f64,
    pub gas_cost: f64,
    pub confidence_score: f64,
    pub confidence_tier: ConfidenceTier,
    pub spread: String,
    pub liquidity: String,
    pub estimated_slippage_bps: u32,
    pub buy_impact_bps: u32,
    pub sell_impact_bps: u32,
    pub route_penalty_bps: u32,
    pub status: OpportunityStatus,
    pub quote_sources: Vec<String>,
    pub scan_run_id: String,
    pub candidate_id: String,
    pub quote_timestamp: String,
    pub data_source: String,
    pub reason_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_payload: Option<CanonicalExecutionPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ConfidenceTier {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum OpportunityStatus {
    Active,
    Watchlist,
}

#[derive(Debug, Clone)]
pub struct PoolEdge {
    pub token_in: Address,
    pub token_out: Address,
    pub price: f64,
    pub liquidity_usd: f64,
    pub dex: String,
    pub network: String,
    pub router: Address,
    pub is_v3: bool,
    pub fee: u32,
}

#[derive(Debug, Clone)]
pub struct SimulationResult {
    pub success: bool,
    pub gas_used: u64,
    pub profit_usd: f64,
    pub revert_reason: Option<String>,
}
