// main.rs — MEV arbitrage scanner entry point.
//
// Starts:
//   • A Prometheus /metrics HTTP endpoint on `METRICS_PORT` (default 9090).
//   • A scan loop that detects cross-DEX arbitrage opportunities.
//   • An executor that submits Flashbots bundles (or runs in shadow mode).

mod config;
mod executor;
mod flashlight;
mod metrics;
mod scanner;

use anyhow::Result;
use axum::{routing::get, Router};
use std::net::SocketAddr;
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use config::Config;
use executor::Executor;
use metrics::Metrics;
use scanner::Scanner;

#[tokio::main]
async fn main() -> Result<()> {
    // ── Load configuration ────────────────────────────────────────────────────
    let config = Config::from_env().map_err(|e| {
        eprintln!("Configuration error: {e}");
        e
    })?;

    // ── Logging ───────────────────────────────────────────────────────────────
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&config.log_level));

    if config.log_json {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(fmt::layer().json())
            .init();
    } else {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(fmt::layer())
            .init();
    }

    info!(
        version = env!("CARGO_PKG_VERSION"),
        shadow_mode = config.shadow_mode,
        networks = ?config.networks.iter().map(|n| n.network.as_str()).collect::<Vec<_>>(),
        "MEV scanner starting"
    );

    // ── Metrics ───────────────────────────────────────────────────────────────
    let metrics = Metrics::new();
    let metrics_clone = metrics.clone();

    let metrics_port = config.metrics_port;
    tokio::spawn(async move {
        start_metrics_server(metrics_clone, metrics_port).await;
    });

    // ── Executor ──────────────────────────────────────────────────────────────
    let executor = Executor::new(config.clone(), metrics.clone())?;

    // ── Scanner ───────────────────────────────────────────────────────────────
    let scanner = Scanner::new(config.clone());

    let poll_interval = Duration::from_millis(config.poll_interval_ms);
    let mut tick = interval(poll_interval);
    let mut current_block: u64 = 0;

    loop {
        tick.tick().await;
        current_block += 1;

        metrics.record_scan_cycle();

        let opportunities = match scanner.scan().await {
            Ok(opps) => opps,
            Err(e) => {
                error!(error = %e, "Scan cycle failed");
                continue;
            }
        };

        let best_profit = opportunities
            .iter()
            .map(|o| o.net_profit_usd)
            .fold(0.0_f64, f64::max);
        metrics.set_last_scan_profit(best_profit);

        for opp in &opportunities {
            metrics.record_opportunity(&opp.network, &opp.status);

            if opp.status != "active" {
                continue;
            }

            info!(
                candidate_id = %opp.candidate_id,
                token_pair = %opp.token_pair,
                network = %opp.network,
                net_profit_usd = opp.net_profit_usd,
                spread_percent = opp.spread_percent,
                buy_dex = %opp.buy_dex,
                sell_dex = %opp.sell_dex,
                shadow_mode = config.shadow_mode,
                "Active opportunity detected"
            );

            metrics.record_execution_attempt(&opp.network);
            let attempt = executor.execute(opp, current_block).await;

            if attempt.success {
                info!(
                    bundle_hash = ?attempt.bundle_hash,
                    shadow_mode = attempt.shadow_mode,
                    "Execution attempt succeeded"
                );
            } else {
                warn!(
                    failure_reason = ?attempt.failure_reason,
                    "Execution attempt failed"
                );
            }
        }
    }
}

// ── Metrics HTTP server ───────────────────────────────────────────────────────

async fn start_metrics_server(metrics: Metrics, port: u16) {
    let app = Router::new().route(
        "/metrics",
        get(move || {
            let m = metrics.clone();
            async move { m.render() }
        }),
    );

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(addr = %addr, "Prometheus metrics server listening");

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            error!(error = %e, "Failed to bind metrics server");
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        error!(error = %e, "Metrics server error");
    }
}
