use std::sync::Arc;

use prometheus::{Encoder, Gauge, Histogram, HistogramOpts, IntCounter, Opts, Registry, TextEncoder};
use tracing::info;

#[derive(Clone)]
pub struct Metrics {
    pub opportunities_detected_total: IntCounter,
    pub opportunities_profitable: IntCounter,
    pub executions_attempted_total: IntCounter,
    pub executions_succeeded_total: IntCounter,
    pub scan_duration_ms: Histogram,
    pub gas_price_gwei: Gauge,
    pub profit_per_execution_usd: Histogram,
    registry: Registry,
}

impl Metrics {
    pub fn new() -> eyre::Result<Self> {
        let registry = Registry::new();
        let opportunities_detected_total = IntCounter::with_opts(Opts::new(
            "opportunities_detected_total",
            "Total arbitrage opportunities detected",
        ))?;
        let opportunities_profitable = IntCounter::with_opts(Opts::new(
            "opportunities_profitable",
            "Opportunities passing profitability threshold",
        ))?;
        let executions_attempted_total = IntCounter::with_opts(Opts::new(
            "executions_attempted_total",
            "Total bundle submissions attempted",
        ))?;
        let executions_succeeded_total = IntCounter::with_opts(Opts::new(
            "executions_succeeded_total",
            "Total bundle submissions succeeded",
        ))?;
        let scan_duration_ms = Histogram::with_opts(
            HistogramOpts::new(
                "scan_duration_ms",
                "Duration of each scan cycle in milliseconds",
            )
            .buckets(vec![10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0]),
        )?;
        let gas_price_gwei = Gauge::with_opts(Opts::new(
            "gas_price_gwei",
            "Current network gas price in gwei",
        ))?;
        let profit_per_execution_usd = Histogram::with_opts(
            HistogramOpts::new(
                "profit_per_execution_usd",
                "Net profit per execution in USD",
            )
            .buckets(vec![0.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0]),
        )?;

        registry.register(Box::new(opportunities_detected_total.clone()))?;
        registry.register(Box::new(opportunities_profitable.clone()))?;
        registry.register(Box::new(executions_attempted_total.clone()))?;
        registry.register(Box::new(executions_succeeded_total.clone()))?;
        registry.register(Box::new(scan_duration_ms.clone()))?;
        registry.register(Box::new(gas_price_gwei.clone()))?;
        registry.register(Box::new(profit_per_execution_usd.clone()))?;

        Ok(Self {
            opportunities_detected_total,
            opportunities_profitable,
            executions_attempted_total,
            executions_succeeded_total,
            scan_duration_ms,
            gas_price_gwei,
            profit_per_execution_usd,
            registry,
        })
    }

    pub fn render(&self) -> String {
        let encoder = TextEncoder::new();
        let metric_families = self.registry.gather();
        let mut buffer = Vec::new();
        encoder.encode(&metric_families, &mut buffer).unwrap_or_default();
        String::from_utf8(buffer).unwrap_or_default()
    }
}

pub struct Telemetry {
    pub metrics: Arc<Metrics>,
    supabase_url: Option<String>,
    supabase_key: Option<String>,
    enable_supabase: bool,
    http_client: reqwest::Client,
}

impl Telemetry {
    pub fn new(
        metrics: Arc<Metrics>,
        supabase_url: Option<String>,
        supabase_key: Option<String>,
        enable_supabase: bool,
    ) -> Self {
        Self {
            metrics,
            supabase_url,
            supabase_key,
            enable_supabase,
            http_client: reqwest::Client::new(),
        }
    }

    pub async fn log_scan_completed(
        &self,
        scan_run_id: &str,
        opportunities_found: usize,
        profitable: usize,
        duration_ms: u64,
    ) {
        self.metrics
            .opportunities_detected_total
            .inc_by(opportunities_found as u64);
        self.metrics
            .opportunities_profitable
            .inc_by(profitable as u64);
        self.metrics.scan_duration_ms.observe(duration_ms as f64);

        info!(
            scan_run_id = scan_run_id,
            opportunities = opportunities_found,
            profitable = profitable,
            duration_ms = duration_ms,
            "Scan cycle completed"
        );

        if self.enable_supabase {
            let _ = self
                .persist_scan_event(scan_run_id, opportunities_found, profitable, duration_ms)
                .await;
        }
    }

    pub async fn log_execution_attempt(
        &self,
        scan_run_id: &str,
        candidate_id: &str,
        bundle_hash: Option<&str>,
        success: bool,
        profit_usd: f64,
        failure_reason: Option<&str>,
    ) {
        self.metrics.executions_attempted_total.inc();
        if success {
            self.metrics.executions_succeeded_total.inc();
            self.metrics.profit_per_execution_usd.observe(profit_usd);
        }

        info!(
            scan_run_id = scan_run_id,
            candidate_id = candidate_id,
            bundle_hash = bundle_hash.unwrap_or("none"),
            success = success,
            profit_usd = profit_usd,
            failure_reason = failure_reason.unwrap_or("none"),
            "Execution attempt logged"
        );
    }

    async fn persist_scan_event(
        &self,
        scan_run_id: &str,
        opportunities: usize,
        profitable: usize,
        duration_ms: u64,
    ) -> eyre::Result<()> {
        let url = self
            .supabase_url
            .as_deref()
            .ok_or_else(|| eyre::eyre!("No Supabase URL"))?;
        let key = self
            .supabase_key
            .as_deref()
            .ok_or_else(|| eyre::eyre!("No Supabase key"))?;

        let body = serde_json::json!({
            "scan_run_id": scan_run_id,
            "opportunities_found": opportunities,
            "profitable_count": profitable,
            "duration_ms": duration_ms,
            "created_at": chrono::Utc::now().to_rfc3339(),
        });

        let _ = self
            .http_client
            .post(format!("{url}/rest/v1/scan_events"))
            .header("apikey", key)
            .header("Authorization", format!("******"))
            .json(&body)
            .send()
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_creation() {
        let metrics = Metrics::new().expect("Metrics should initialize");
        metrics.opportunities_detected_total.inc();
        assert_eq!(metrics.opportunities_detected_total.get(), 1);
    }

    #[test]
    fn test_metrics_render() {
        let metrics = Metrics::new().expect("Metrics should initialize");
        metrics.opportunities_detected_total.inc_by(5);
        let rendered = metrics.render();
        assert!(rendered.contains("opportunities_detected_total"));
    }

    #[test]
    fn test_all_metrics_increment() {
        let metrics = Metrics::new().expect("Metrics should initialize");
        metrics.opportunities_detected_total.inc();
        metrics.opportunities_profitable.inc();
        metrics.executions_attempted_total.inc();
        metrics.executions_succeeded_total.inc();
        metrics.scan_duration_ms.observe(42.0);
        metrics.gas_price_gwei.set(30.0);
        metrics.profit_per_execution_usd.observe(25.0);

        assert_eq!(metrics.opportunities_detected_total.get(), 1);
        assert_eq!(metrics.opportunities_profitable.get(), 1);
        assert_eq!(metrics.executions_attempted_total.get(), 1);
        assert_eq!(metrics.executions_succeeded_total.get(), 1);
    }
}
