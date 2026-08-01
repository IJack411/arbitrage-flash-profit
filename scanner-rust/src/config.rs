use eyre::{eyre, Result};
use std::env;

#[derive(Debug, Clone)]
pub struct NetworkConfig {
    pub rpc_url: String,
    pub flashlight_address: String,
    pub aave_pool_address: String,
    pub chain_id: u64,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub networks: Vec<(String, NetworkConfig)>,
    pub scanner_private_key: String,
    pub flashbots_signer_key: String,
    pub flashbots_relay_url: String,
    pub flashbots_max_priority_fee_gwei: u64,
    pub flashbots_fee_multiplier: f64,
    pub loan_amount_usd: f64,
    pub min_net_profit_usd: f64,
    pub min_spread_percent: f64,
    pub max_slippage_bps: u32,
    pub scan_interval_secs: u64,
    pub thegraph_api_key: Option<String>,
    pub enable_graph_polling: bool,
    pub enable_rpc_fallback: bool,
    pub log_level: String,
    pub log_format: String,
    pub prometheus_port: u16,
    pub enable_prometheus: bool,
    pub supabase_url: Option<String>,
    pub supabase_service_role_key: Option<String>,
    pub enable_supabase_telemetry: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let _ = dotenv::dotenv();

        let mut networks = Vec::new();

        if let Ok(rpc) = env::var("ETHEREUM_RPC_URL") {
            if !rpc.is_empty() {
                networks.push((
                    "ethereum".to_string(),
                    NetworkConfig {
                        rpc_url: rpc,
                        flashlight_address: env::var("FLASHLIGHT_CONTRACT_ADDRESS_ETHEREUM")
                            .unwrap_or_default(),
                        aave_pool_address: env::var("AAVE_POOL_ADDRESS_ETHEREUM")
                            .unwrap_or_default(),
                        chain_id: 1,
                    },
                ));
            }
        }

        if let Ok(rpc) = env::var("ARBITRUM_RPC_URL") {
            if !rpc.is_empty() {
                networks.push((
                    "arbitrum".to_string(),
                    NetworkConfig {
                        rpc_url: rpc,
                        flashlight_address: env::var("FLASHLIGHT_CONTRACT_ADDRESS_ARBITRUM")
                            .unwrap_or_default(),
                        aave_pool_address: env::var("AAVE_POOL_ADDRESS_ARBITRUM")
                            .unwrap_or_default(),
                        chain_id: 42_161,
                    },
                ));
            }
        }

        if let Ok(rpc) = env::var("BASE_RPC_URL") {
            if !rpc.is_empty() {
                networks.push((
                    "base".to_string(),
                    NetworkConfig {
                        rpc_url: rpc,
                        flashlight_address: env::var("FLASHLIGHT_CONTRACT_ADDRESS_BASE")
                            .unwrap_or_default(),
                        aave_pool_address: env::var("AAVE_POOL_ADDRESS_BASE")
                            .unwrap_or_default(),
                        chain_id: 8453,
                    },
                ));
            }
        }

        if let Ok(rpc) = env::var("POLYGON_RPC_URL") {
            if !rpc.is_empty() {
                networks.push((
                    "polygon".to_string(),
                    NetworkConfig {
                        rpc_url: rpc,
                        flashlight_address: env::var("FLASHLIGHT_CONTRACT_ADDRESS_POLYGON")
                            .unwrap_or_default(),
                        aave_pool_address: env::var("AAVE_POOL_ADDRESS_POLYGON")
                            .unwrap_or_default(),
                        chain_id: 137,
                    },
                ));
            }
        }

        if networks.is_empty() {
            return Err(eyre!(
                "No RPC URLs configured. Set ETHEREUM_RPC_URL, ARBITRUM_RPC_URL, BASE_RPC_URL, or POLYGON_RPC_URL"
            ));
        }

        let scanner_private_key = env::var("SCANNER_PRIVATE_KEY").unwrap_or_else(|_| {
            "0x0000000000000000000000000000000000000000000000000000000000000001".to_string()
        });

        let flashbots_signer_key = env::var("FLASHBOTS_SIGNER_PRIVATE_KEY")
            .unwrap_or_else(|_| scanner_private_key.clone());

        Ok(Config {
            networks,
            scanner_private_key,
            flashbots_signer_key,
            flashbots_relay_url: env::var("FLASHBOTS_RELAY_URL")
                .unwrap_or_else(|_| "https://relay.flashbots.net".to_string()),
            flashbots_max_priority_fee_gwei: env::var("FLASHBOTS_MAX_PRIORITY_FEE_GWEI")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3),
            flashbots_fee_multiplier: env::var("FLASHBOTS_FEE_MULTIPLIER")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1.15),
            loan_amount_usd: env::var("SCANNER_LOAN_AMOUNT_USD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10_000.0),
            min_net_profit_usd: env::var("SCANNER_MIN_NET_PROFIT_USD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(14.0),
            min_spread_percent: env::var("SCANNER_MIN_SPREAD_PERCENT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.075),
            max_slippage_bps: env::var("SCANNER_MAX_SLIPPAGE_BPS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(40),
            scan_interval_secs: env::var("SCANNER_SCAN_INTERVAL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5),
            thegraph_api_key: env::var("THEGRAPH_API_KEY").ok(),
            enable_graph_polling: env::var("ENABLE_GRAPH_POLLING")
                .map(|v| v == "true")
                .unwrap_or(true),
            enable_rpc_fallback: env::var("ENABLE_RPC_FALLBACK")
                .map(|v| v == "true")
                .unwrap_or(true),
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            log_format: env::var("LOG_FORMAT").unwrap_or_else(|_| "json".to_string()),
            prometheus_port: env::var("PROMETHEUS_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(9090),
            enable_prometheus: env::var("ENABLE_PROMETHEUS")
                .map(|v| v == "true")
                .unwrap_or(true),
            supabase_url: env::var("SUPABASE_URL").ok(),
            supabase_service_role_key: env::var("SUPABASE_SERVICE_ROLE_KEY").ok(),
            enable_supabase_telemetry: env::var("ENABLE_SUPABASE_TELEMETRY")
                .map(|v| v == "true")
                .unwrap_or(false),
        })
    }

    pub fn validate_for_execution(&self) -> Result<()> {
        if self
            .scanner_private_key
            .starts_with("0x000000000000000000000000000000000000000000000000000000000000000")
        {
            return Err(eyre!("SCANNER_PRIVATE_KEY is not set to a real key"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn test_config_defaults() {
        let _guard = env_lock().lock().expect("env mutex poisoned");
        for key in [
            "ETHEREUM_RPC_URL",
            "ARBITRUM_RPC_URL",
            "BASE_RPC_URL",
            "POLYGON_RPC_URL",
            "SCANNER_LOAN_AMOUNT_USD",
            "SCANNER_MIN_NET_PROFIT_USD",
            "SCANNER_MAX_SLIPPAGE_BPS",
            "SCANNER_SCAN_INTERVAL_SECS",
        ] {
            env::remove_var(key);
        }

        env::set_var("ETHEREUM_RPC_URL", "http://localhost:8545");
        let config = Config::from_env().expect("Config should load with ETHEREUM_RPC_URL set");
        assert_eq!(config.min_net_profit_usd, 14.0);
        assert_eq!(config.max_slippage_bps, 40);
        assert_eq!(config.scan_interval_secs, 5);
        env::remove_var("ETHEREUM_RPC_URL");
    }
}
