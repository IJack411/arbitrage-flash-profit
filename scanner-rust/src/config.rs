// config.rs — Environment-based configuration for the MEV scanner.

use anyhow::{bail, Context, Result};
use std::env;
use std::str::FromStr;

/// Networks supported by the scanner.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Network {
    Ethereum,
    Arbitrum,
    Base,
    Polygon,
}

impl Network {
    pub fn as_str(&self) -> &'static str {
        match self {
            Network::Ethereum => "ethereum",
            Network::Arbitrum => "arbitrum",
            Network::Base => "base",
            Network::Polygon => "polygon",
        }
    }

    /// Default Aave V3 pool address for the network.
    pub fn default_aave_pool(&self) -> &'static str {
        match self {
            Network::Ethereum => "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
            Network::Arbitrum => "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            Network::Base => "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
            Network::Polygon => "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        }
    }
}

impl FromStr for Network {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "ethereum" | "mainnet" | "eth" => Ok(Network::Ethereum),
            "arbitrum" | "arb" => Ok(Network::Arbitrum),
            "base" => Ok(Network::Base),
            "polygon" | "matic" => Ok(Network::Polygon),
            other => bail!("Unknown network: {other}"),
        }
    }
}

/// Per-network tuning parameters.
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    pub network: Network,
    pub rpc_url: String,
    pub min_profit_usd: f64,
    pub max_slippage_bps: u32,
    pub max_gas_gwei: f64,
}

/// Global scanner configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    // ── Network ──────────────────────────────────────────────────────────────
    pub networks: Vec<NetworkConfig>,

    // ── Contract addresses ───────────────────────────────────────────────────
    /// Deployed FlashLoanArbitrage contract address.
    pub flashlight_contract_address: String,
    /// Aave V3 Pool address (overrides default for chosen network).
    pub aave_pool_address: Option<String>,

    // ── Keys ─────────────────────────────────────────────────────────────────
    /// Private key for signing and submitting transactions.
    pub scanner_private_key: String,
    /// Private key used to sign Flashbots bundle requests.
    pub flashbots_signer_private_key: String,

    // ── Flashbots ────────────────────────────────────────────────────────────
    pub flashbots_relay_url: String,

    // ── Data sources ─────────────────────────────────────────────────────────
    pub thegraph_api_key: Option<String>,

    // ── Scanner tuning ───────────────────────────────────────────────────────
    /// Loan size in USD used for each flash loan.
    pub loan_amount_usd: f64,
    /// Global minimum net profit threshold in USD.
    pub min_net_profit_usd: f64,
    /// Minimum spread percent to consider an opportunity.
    pub min_spread_percent: f64,
    /// Minimum pool liquidity in USD.
    pub min_liquidity_usd: f64,
    /// Maximum allowed quote age in milliseconds before it is considered stale.
    pub max_quote_age_ms: u64,
    /// How many block cycles to poll per iteration.
    pub poll_interval_ms: u64,

    // ── Metrics server ───────────────────────────────────────────────────────
    pub metrics_port: u16,

    // ── Execution mode ───────────────────────────────────────────────────────
    /// When true the scanner detects and logs opportunities but does NOT
    /// submit Flashbots bundles. Useful for shadow-mode A/B testing.
    pub shadow_mode: bool,

    // ── Logging ──────────────────────────────────────────────────────────────
    pub log_level: String,
    pub log_json: bool,
}

impl Config {
    /// Load configuration from the process environment.
    /// Sensitive fields (private keys) are validated for presence but never logged.
    pub fn from_env() -> Result<Self> {
        let _ = dotenvy::dotenv(); // ignore error if .env absent

        // ── Required fields ──────────────────────────────────────────────────
        let flashlight_contract_address = required("FLASHLIGHT_CONTRACT_ADDRESS")?;
        let scanner_private_key = required("SCANNER_PRIVATE_KEY")?;
        let flashbots_signer_private_key = required("FLASHBOTS_SIGNER_PRIVATE_KEY")?;

        // Validate keys look like 0x-prefixed hex (rudimentary).
        validate_private_key(&scanner_private_key, "SCANNER_PRIVATE_KEY")?;
        validate_private_key(
            &flashbots_signer_private_key,
            "FLASHBOTS_SIGNER_PRIVATE_KEY",
        )?;
        validate_eth_address(&flashlight_contract_address, "FLASHLIGHT_CONTRACT_ADDRESS")?;

        // ── Networks ─────────────────────────────────────────────────────────
        let mut networks = Vec::new();

        let network_list: Vec<Network> = env::var("SCANNER_NETWORKS")
            .unwrap_or_else(|_| "arbitrum".to_string())
            .split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();

        for net in &network_list {
            let rpc_env = format!(
                "{}_RPC_URL",
                net.as_str().to_uppercase().replace('-', "_")
            );
            let rpc_url = env::var(&rpc_env).or_else(|_| {
                env::var("ETHEREUM_RPC_URL").context(format!(
                    "{rpc_env} or ETHEREUM_RPC_URL must be set for network {}",
                    net.as_str()
                ))
            })?;

            let min_profit_prefix = format!(
                "SCANNER_{}_MIN_NET_PROFIT_USD",
                net.as_str().to_uppercase()
            );
            let min_profit_usd = parse_f64_env(&min_profit_prefix)
                .unwrap_or_else(|| parse_f64_env("SCANNER_MIN_NET_PROFIT_USD").unwrap_or(10.0));

            let max_slippage_bps = parse_u32_env(&format!(
                "SCANNER_{}_MAX_SLIPPAGE_BPS",
                net.as_str().to_uppercase()
            ))
            .unwrap_or_else(|| parse_u32_env("SCANNER_MAX_SLIPPAGE_BPS").unwrap_or(300));

            let max_gas_gwei = parse_f64_env(&format!(
                "SCANNER_{}_MAX_GAS_GWEI",
                net.as_str().to_uppercase()
            ))
            .unwrap_or_else(|| parse_f64_env("SCANNER_MAX_GAS_GWEI").unwrap_or(100.0));

            networks.push(NetworkConfig {
                network: net.clone(),
                rpc_url,
                min_profit_usd,
                max_slippage_bps,
                max_gas_gwei,
            });
        }

        if networks.is_empty() {
            bail!("SCANNER_NETWORKS resolved to no valid networks");
        }

        Ok(Config {
            networks,
            flashlight_contract_address,
            aave_pool_address: env::var("AAVE_POOL_ADDRESS").ok(),
            scanner_private_key,
            flashbots_signer_private_key,
            flashbots_relay_url: env::var("FLASHBOTS_RELAY_URL")
                .unwrap_or_else(|_| "https://relay.flashbots.net".to_string()),
            thegraph_api_key: env::var("THEGRAPH_API_KEY").ok(),
            loan_amount_usd: parse_f64_env("SCANNER_LOAN_AMOUNT_USD").unwrap_or(10_000.0),
            min_net_profit_usd: parse_f64_env("SCANNER_MIN_NET_PROFIT_USD").unwrap_or(10.0),
            min_spread_percent: parse_f64_env("SCANNER_MIN_SPREAD_PERCENT").unwrap_or(0.05),
            min_liquidity_usd: parse_f64_env("SCANNER_MIN_LIQUIDITY_USD").unwrap_or(50_000.0),
            max_quote_age_ms: parse_u64_env("SCANNER_MAX_QUOTE_AGE_MS").unwrap_or(60_000),
            poll_interval_ms: parse_u64_env("SCANNER_POLL_INTERVAL_MS").unwrap_or(5_000),
            metrics_port: parse_u16_env("METRICS_PORT").unwrap_or(9090),
            shadow_mode: env::var("SCANNER_SHADOW_MODE")
                .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
                .unwrap_or(true), // safe default: shadow mode on
            log_level: env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
            log_json: env::var("LOG_JSON")
                .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
                .unwrap_or(false),
        })
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn required(key: &str) -> Result<String> {
    env::var(key).with_context(|| format!("Required environment variable {key} is not set"))
}

fn parse_f64_env(key: &str) -> Option<f64> {
    env::var(key).ok()?.parse().ok()
}

fn parse_u32_env(key: &str) -> Option<u32> {
    env::var(key).ok()?.parse().ok()
}

fn parse_u64_env(key: &str) -> Option<u64> {
    env::var(key).ok()?.parse().ok()
}

fn parse_u16_env(key: &str) -> Option<u16> {
    env::var(key).ok()?.parse().ok()
}

fn validate_private_key(key: &str, name: &str) -> Result<()> {
    let stripped = key.strip_prefix("0x").unwrap_or(key);
    if stripped.len() != 64 || !stripped.chars().all(|c| c.is_ascii_hexdigit()) {
        bail!("{name} must be a 32-byte hex private key (64 hex chars, optionally 0x-prefixed)");
    }
    Ok(())
}

fn validate_eth_address(addr: &str, name: &str) -> Result<()> {
    let stripped = addr.strip_prefix("0x").unwrap_or(addr);
    if stripped.len() != 40 || !stripped.chars().all(|c| c.is_ascii_hexdigit()) {
        bail!("{name} must be a 20-byte Ethereum address (40 hex chars, 0x-prefixed)");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_from_str_roundtrip() {
        assert_eq!("ethereum".parse::<Network>().unwrap(), Network::Ethereum);
        assert_eq!("arbitrum".parse::<Network>().unwrap(), Network::Arbitrum);
        assert_eq!("base".parse::<Network>().unwrap(), Network::Base);
        assert_eq!("polygon".parse::<Network>().unwrap(), Network::Polygon);
    }

    #[test]
    fn network_from_str_aliases() {
        assert_eq!("mainnet".parse::<Network>().unwrap(), Network::Ethereum);
        assert_eq!("arb".parse::<Network>().unwrap(), Network::Arbitrum);
        assert_eq!("matic".parse::<Network>().unwrap(), Network::Polygon);
    }

    #[test]
    fn network_from_str_unknown() {
        assert!("foonet".parse::<Network>().is_err());
    }

    #[test]
    fn validate_private_key_ok() {
        let good_key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        assert!(validate_private_key(good_key, "TEST_KEY").is_ok());
    }

    #[test]
    fn validate_private_key_bad() {
        assert!(validate_private_key("tooshort", "TEST_KEY").is_err());
    }

    #[test]
    fn validate_eth_address_ok() {
        assert!(validate_eth_address(
            "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
            "TEST_ADDR"
        )
        .is_ok());
    }

    #[test]
    fn validate_eth_address_bad() {
        assert!(validate_eth_address("0xdeadbeef", "TEST_ADDR").is_err());
    }
}
