use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::net::TcpListener;
use tracing::{error, info, warn};

use mev_scanner::config::Config;
use mev_scanner::executor::Executor;
use mev_scanner::scanner::Scanner;
use mev_scanner::simulator::Simulator;
use mev_scanner::telemetry::{Metrics, Telemetry};
use mev_scanner::types::OpportunityStatus;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let log_format = std::env::var("LOG_FORMAT").unwrap_or_else(|_| "json".to_string());
    if log_format == "json" {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "info".into()),
            )
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "info".into()),
            )
            .init();
    }

    info!("Starting MEV Scanner v{}", env!("CARGO_PKG_VERSION"));

    let config = Config::from_env().map_err(|error| {
        error!("Failed to load config: {error}");
        error
    })?;

    info!(
        "Config loaded: {} networks, min_profit=${}, scan_interval={}s",
        config.networks.len(),
        config.min_net_profit_usd,
        config.scan_interval_secs,
    );

    let metrics = Arc::new(Metrics::new()?);
    let telemetry = Arc::new(Telemetry::new(
        metrics.clone(),
        config.supabase_url.clone(),
        config.supabase_service_role_key.clone(),
        config.enable_supabase_telemetry,
    ));

    if config.enable_prometheus {
        let metrics_clone = metrics.clone();
        let port = config.prometheus_port;
        tokio::spawn(async move {
            if let Err(error) = serve_metrics(metrics_clone, port).await {
                error!("Metrics server error: {error}");
            }
        });
        info!(
            "Prometheus metrics endpoint: http://0.0.0.0:{}/metrics",
            config.prometheus_port
        );
    }

    let scanner = Scanner::new(config.clone()).await?;
    info!("Scanner initialized. Starting main loop.");

    loop {
        let scan_start = Instant::now();

        let pools = match scanner.fetch_pools().await {
            Ok(pools) => pools,
            Err(error) => {
                error!("Failed to fetch pools: {error}");
                tokio::time::sleep(Duration::from_secs(config.scan_interval_secs)).await;
                continue;
            }
        };

        let opportunities = match scanner.detect_arbitrage(&pools) {
            Ok(opportunities) => opportunities,
            Err(error) => {
                error!("Arbitrage detection failed: {error}");
                tokio::time::sleep(Duration::from_secs(config.scan_interval_secs)).await;
                continue;
            }
        };

        let profitable_count = opportunities
            .iter()
            .filter(|opportunity| opportunity.status == OpportunityStatus::Active)
            .count();
        let duration_ms = scan_start.elapsed().as_millis() as u64;
        let scan_run_id = opportunities
            .first()
            .map(|opportunity| opportunity.scan_run_id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        telemetry
            .log_scan_completed(&scan_run_id, opportunities.len(), profitable_count, duration_ms)
            .await;

        for opportunity in &opportunities {
            if opportunity.status != OpportunityStatus::Active {
                continue;
            }

            let simulator = Simulator::new(config.clone());
            let simulation = match simulator.simulate(opportunity).await {
                Ok(result) => result,
                Err(error) => {
                    warn!("Simulation error for {}: {error}", opportunity.token_pair);
                    continue;
                }
            };

            if !simulation.success {
                warn!(
                    "Simulation failed for {}: {:?}",
                    opportunity.token_pair, simulation.revert_reason
                );
                continue;
            }

            if simulation.profit_usd < config.min_net_profit_usd {
                info!(
                    "Post-simulation profit ${:.2} below threshold ${:.2} for {}",
                    simulation.profit_usd, config.min_net_profit_usd, opportunity.token_pair
                );
                continue;
            }

            let executor = Executor::new(config.clone());
            match executor.execute(opportunity).await {
                Ok(result) => {
                    info!(
                        "Bundle submitted: hash={} target_block={} submitted_at_ms={}",
                        result.bundle_hash, result.target_block, result.submitted_at_ms
                    );
                    telemetry
                        .log_execution_attempt(
                            &opportunity.scan_run_id,
                            &opportunity.candidate_id,
                            Some(&result.bundle_hash),
                            true,
                            simulation.profit_usd,
                            None,
                        )
                        .await;
                }
                Err(error) => {
                    error!("Execution failed for {}: {error}", opportunity.token_pair);
                    telemetry
                        .log_execution_attempt(
                            &opportunity.scan_run_id,
                            &opportunity.candidate_id,
                            None,
                            false,
                            0.0,
                            Some(&error.to_string()),
                        )
                        .await;
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(config.scan_interval_secs)).await;
    }
}

async fn serve_metrics(
    metrics: Arc<Metrics>,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use tokio::io::AsyncWriteExt;

    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr).await?;
    info!("Metrics server listening on {addr}");

    loop {
        let (mut stream, _) = listener.accept().await?;
        let metrics = metrics.clone();
        tokio::spawn(async move {
            let body = metrics.render();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4\r\nContent-Length: {}\r\n\r\n{}",
                body.len(), body
            );
            let _ = stream.write_all(response.as_bytes()).await;
        });
    }
}
