// metrics.rs — Prometheus metrics for the MEV scanner.

use prometheus::{
    Gauge, IntCounter, IntCounterVec, Opts, Registry,
};
use std::sync::Arc;
use tracing::warn;

/// Shared Prometheus metrics registry.
#[derive(Clone)]
pub struct Metrics {
    inner: Arc<MetricsInner>,
}

struct MetricsInner {
    pub opportunities_found: IntCounterVec,
    pub executions_attempted: IntCounterVec,
    pub executions_success: IntCounterVec,
    pub executions_failure: IntCounterVec,
    pub shadow_executions: IntCounterVec,
    pub scan_cycles_total: IntCounter,
    pub last_scan_profit_usd: Gauge,
    pub registry: Registry,
}

impl Metrics {
    pub fn new() -> Self {
        let registry = Registry::new();

        let opportunities_found = IntCounterVec::new(
            Opts::new("mev_scanner_opportunities_found_total", "Total opportunities detected"),
            &["network", "status"],
        )
        .expect("metric creation failed");

        let executions_attempted = IntCounterVec::new(
            Opts::new("mev_scanner_executions_attempted_total", "Total execution attempts"),
            &["network"],
        )
        .expect("metric creation failed");

        let executions_success = IntCounterVec::new(
            Opts::new("mev_scanner_executions_success_total", "Successful bundle submissions"),
            &["network"],
        )
        .expect("metric creation failed");

        let executions_failure = IntCounterVec::new(
            Opts::new("mev_scanner_executions_failure_total", "Failed execution attempts"),
            &["network", "reason"],
        )
        .expect("metric creation failed");

        let shadow_executions = IntCounterVec::new(
            Opts::new(
                "mev_scanner_shadow_executions_total",
                "Executions in shadow mode (not submitted)",
            ),
            &["network"],
        )
        .expect("metric creation failed");

        let scan_cycles_total = IntCounter::new(
            "mev_scanner_scan_cycles_total",
            "Total scan cycles completed",
        )
        .expect("metric creation failed");

        let last_scan_profit_usd = Gauge::new(
            "mev_scanner_last_scan_best_profit_usd",
            "Best net profit found in last scan cycle (USD)",
        )
        .expect("metric creation failed");

        macro_rules! register {
            ($registry:expr, $metric:expr) => {
                if let Err(e) = $registry.register(Box::new($metric.clone())) {
                    warn!("Failed to register metric: {e}");
                }
            };
        }

        register!(registry, opportunities_found);
        register!(registry, executions_attempted);
        register!(registry, executions_success);
        register!(registry, executions_failure);
        register!(registry, shadow_executions);
        register!(registry, scan_cycles_total);
        register!(registry, last_scan_profit_usd);

        Self {
            inner: Arc::new(MetricsInner {
                opportunities_found,
                executions_attempted,
                executions_success,
                executions_failure,
                shadow_executions,
                scan_cycles_total,
                last_scan_profit_usd,
                registry,
            }),
        }
    }

    pub fn record_opportunity(&self, network: &str, status: &str) {
        self.inner
            .opportunities_found
            .with_label_values(&[network, status])
            .inc();
    }

    pub fn record_execution_attempt(&self, network: &str) {
        self.inner
            .executions_attempted
            .with_label_values(&[network])
            .inc();
    }

    pub fn record_execution_success(&self, network: &str) {
        self.inner
            .executions_success
            .with_label_values(&[network])
            .inc();
    }

    pub fn record_execution_failure(&self, network: &str, reason: &str) {
        self.inner
            .executions_failure
            .with_label_values(&[network, reason])
            .inc();
    }

    pub fn record_shadow_execution(&self, network: &str) {
        self.inner
            .shadow_executions
            .with_label_values(&[network])
            .inc();
    }

    pub fn record_scan_cycle(&self) {
        self.inner.scan_cycles_total.inc();
    }

    pub fn set_last_scan_profit(&self, profit_usd: f64) {
        self.inner.last_scan_profit_usd.set(profit_usd);
    }

    /// Render all registered metrics in Prometheus text format.
    pub fn render(&self) -> String {
        use prometheus::Encoder;
        let encoder = prometheus::TextEncoder::new();
        let mut buf = Vec::new();
        let metric_families = self.inner.registry.gather();
        encoder.encode(&metric_families, &mut buf).unwrap_or(());
        String::from_utf8(buf).unwrap_or_default()
    }
}
