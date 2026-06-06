import fs from 'node:fs';
import path from 'node:path';

const parseNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ratio = (value, min, max) => {
  if (!Number.isFinite(value) || max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
};

const readJsonLines = (filePath, maxRows) => {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxRows);

  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // Ignore malformed lines.
    }
  }
  return rows;
};

const stageFromMetrics = ({
  validSignalRate,
  activeMedian,
  warmRate,
  netMedian,
  distanceMedian,
  unreachableRate,
  starvedRate,
}) => {
  if (unreachableRate >= 0.35) return 'ENDPOINT_UNREACHABLE';
  if (starvedRate >= 0.6) return 'DATA_STARVED';
  if (validSignalRate < 0.4) return 'NO_SIGNAL';
  if (activeMedian >= 1) return 'LIVE_CANDIDATE';
  if (warmRate >= 0.3) return 'WARMING';
  if (netMedian !== null && distanceMedian !== null && netMedian >= -10 && distanceMedian <= 15) return 'CHECK_NOW';
  if (netMedian !== null && distanceMedian !== null && netMedian >= -20 && distanceMedian <= 35) return 'APPROACHING';
  return 'DISCOVERY';
};

const actionPlan = ({
  stage,
  validSignalRate,
  badQuotesMedian,
  netMedian,
  distanceMedian,
  unreachableRate,
  starvedRate,
}) => {
  const actions = [];

  if (stage === 'ENDPOINT_UNREACHABLE') {
    actions.push('Treat this as an availability incident: verify DNS/TLS reachability to Supabase edge endpoint and pause strategy tuning until endpoint health stabilizes.');
    actions.push('Keep connectivity alerts enabled and review scheduler logs to confirm outage windows and recovery time.');
  }

  if (stage === 'DATA_STARVED') {
    actions.push('Treat this as an ingestion incident: inspect scanner diagnostics (`ingestionHeartbeat`, `subgraphFetchStats`, `fallbackFetchStats`) before changing thresholds.');
    actions.push('Run one manual deep probe (`node scripts/probe-scanner.mjs`) and confirm pairKeys/candidates recover above zero before profitability experiments.');
  }

  if (stage === 'NO_SIGNAL') {
    actions.push('Signal quality exists but is below trigger level; iterate on execution economics and route viability rather than adding more profile variants.');
    actions.push('Use probe diagnostics to target the dominant rejection gate (net/slippage/risk/liquidity) and adjust one variable at a time.');
  }

  if (badQuotesMedian !== null && badQuotesMedian > 1) {
    actions.push('Prioritize quote-quality hygiene (source filtering and fallback policy) until median badQuotes is <= 1.');
  }

  if (netMedian !== null && netMedian < -10) {
    actions.push('Focus on execution economics (gas model and executable sizing) to move topWatch net toward >= -10.');
  }

  if (distanceMedian !== null && distanceMedian > 15) {
    actions.push('Focus on distance-to-executable reduction via tighter slippage/liquidity-aware sizing rather than route-policy churn.');
  }

  if (actions.length === 0) {
    actions.push('Maintain current profile set and monitor for ALERT transitions.');
  }

  if (unreachableRate > 0 && stage !== 'ENDPOINT_UNREACHABLE') {
    actions.push('Intermittent endpoint failures detected; keep connectivity watchdog active and investigate transient DNS/network instability.');
  }

  if (starvedRate > 0.2 && stage !== 'DATA_STARVED') {
    actions.push('Intermittent data-starvation detected; monitor pairKeys trend and verify ingestion heartbeat remains stable through the day.');
  }

  if (validSignalRate >= 0.4 && stage !== 'CHECK_NOW' && stage !== 'LIVE_CANDIDATE') {
    actions.push('Keep scheduler running and review this report trend every hour for directional movement.');
  }

  return actions;
};

const main = () => {
  const root = process.cwd();
  const historyPath = path.resolve(root, process.env.ALERT_SCOUT_HISTORY_FILE || 'benchmark-results/opportunity-scout-history.jsonl');
  const windowSize = Math.max(10, parseNumber(process.env.OPPORTUNITY_PROGRESS_WINDOW, 120));

  const rows = readJsonLines(historyPath, windowSize);
  if (rows.length === 0) {
    console.log('No scout history found. Run `npm run scanner:opportunity:scout` first.');
    process.exit(1);
  }

  const latest = rows[rows.length - 1] || {};
  const thresholds = latest.thresholds || {
    activeMin: 1,
    topWatchNetMin: -10,
    topWatchDistanceMax: 15,
    badQuotesMax: 1,
  };

  const alerts = rows.filter((r) => r.anyAlert === true).length;
  const prechecks = rows.filter((r) => r.precheckAlert === true).length;
  const warms = rows.filter((r) => r.warmAlert === true).length;
  const endpointUnreachableCount = rows.filter((r) => String(r?.endpointHealth?.status || '').toLowerCase() === 'unreachable').length;
  const dataStarvedCount = rows.filter((r) => String(r?.dataHeartbeat?.status || '').toLowerCase() === 'starved').length;

  const activeSeries = rows
    .map((r) => toFiniteOrNull(r?.bestProfile?.medians?.active))
    .filter((n) => Number.isFinite(n));
  const badQuotesSeries = rows
    .map((r) => toFiniteOrNull(r?.bestProfile?.medians?.badQuotes))
    .filter((n) => Number.isFinite(n));
  const netSeries = rows
    .map((r) => toFiniteOrNull(r?.bestProfile?.bestSeen?.topWatchNet))
    .filter((n) => Number.isFinite(n));
  const distanceSeries = rows
    .map((r) => toFiniteOrNull(r?.bestProfile?.bestSeen?.topDistance))
    .filter((n) => Number.isFinite(n));
  const closenessSeries = rows
    .map((r) => toFiniteOrNull(r?.bestProfile?.closenessScore))
    .filter((n) => Number.isFinite(n));

  const activeMedian = median(activeSeries);
  const badQuotesMedian = median(badQuotesSeries);
  const netMedian = median(netSeries);
  const distanceMedian = median(distanceSeries);
  const closenessMedian = median(closenessSeries);

  const validSignalRate = rows.length > 0 ? netSeries.length / rows.length : 0;
  const alertRate = rows.length > 0 ? alerts / rows.length : 0;
  const precheckRate = rows.length > 0 ? prechecks / rows.length : 0;
  const warmRate = rows.length > 0 ? warms / rows.length : 0;
  const unreachableRate = rows.length > 0 ? endpointUnreachableCount / rows.length : 0;
  const starvedRate = rows.length > 0 ? dataStarvedCount / rows.length : 0;

  const shortWindow = rows.slice(-Math.min(20, rows.length));
  const shortCloseness = shortWindow
    .map((r) => toFiniteOrNull(r?.bestProfile?.closenessScore))
    .filter((n) => Number.isFinite(n));
  const longWindow = rows.slice(-Math.min(80, rows.length));
  const longCloseness = longWindow
    .map((r) => toFiniteOrNull(r?.bestProfile?.closenessScore))
    .filter((n) => Number.isFinite(n));

  const shortMedian = median(shortCloseness);
  const longMedian = median(longCloseness);
  const trendDelta = (shortMedian !== null && longMedian !== null) ? shortMedian - longMedian : null;

  const signalComponent = 30 * clamp(validSignalRate, 0, 1);
  const netComponent = 25 * ratio(netMedian ?? -100, -50, thresholds.topWatchNetMin);
  const distanceComponent = 25 * ratio((thresholds.topWatchDistanceMax + 80) - (distanceMedian ?? 999), 0, 80);
  const hygieneComponent = 10 * ratio((thresholds.badQuotesMax + 5) - (badQuotesMedian ?? 99), 0, 5);
  const trendComponent = 10 * ratio((trendDelta ?? -20), -20, 20);

  const progressScore = Math.round(clamp(
    signalComponent + netComponent + distanceComponent + hygieneComponent + trendComponent,
    0,
    100,
  ));

  const stage = stageFromMetrics({
    validSignalRate,
    activeMedian: activeMedian ?? 0,
    warmRate,
    netMedian,
    distanceMedian,
    unreachableRate,
    starvedRate,
  });

  const actions = actionPlan({
    stage,
    validSignalRate,
    badQuotesMedian,
    netMedian,
    distanceMedian,
    unreachableRate,
    starvedRate,
  });

  console.log('=== Opportunity Progress Report ===');
  console.log(`history_file=${historyPath}`);
  console.log(`window_rows=${rows.length}`);
  console.log(`stage=${stage}`);
  console.log(`progress_score=${progressScore}/100`);
  console.log(`alert_rate=${(alertRate * 100).toFixed(1)}%`);
  console.log(`precheck_rate=${(precheckRate * 100).toFixed(1)}%`);
  console.log(`warm_rate=${(warmRate * 100).toFixed(1)}%`);
  console.log(`endpoint_unreachable_rate=${(unreachableRate * 100).toFixed(1)}%`);
  console.log(`data_starved_rate=${(starvedRate * 100).toFixed(1)}%`);
  console.log(`valid_signal_rate=${(validSignalRate * 100).toFixed(1)}%`);
  console.log(`active_median=${activeMedian ?? 'n/a'}`);
  console.log(`bad_quotes_median=${badQuotesMedian ?? 'n/a'}`);
  console.log(`top_watch_net_median=${netMedian ?? 'n/a'} (target >= ${thresholds.topWatchNetMin})`);
  console.log(`top_distance_median=${distanceMedian ?? 'n/a'} (target <= ${thresholds.topWatchDistanceMax})`);
  console.log(`closeness_median=${closenessMedian ?? 'n/a'}`);
  console.log(`trend_delta=${trendDelta ?? 'n/a'} (short-vs-long closeness)`);

  console.log('\n=== Score Breakdown ===');
  console.log(`signal=${signalComponent.toFixed(1)}/30`);
  console.log(`net_proximity=${netComponent.toFixed(1)}/25`);
  console.log(`distance_proximity=${distanceComponent.toFixed(1)}/25`);
  console.log(`hygiene=${hygieneComponent.toFixed(1)}/10`);
  console.log(`trend=${trendComponent.toFixed(1)}/10`);

  console.log('\n=== Recommended Actions ===');
  actions.forEach((action, idx) => {
    console.log(`${idx + 1}. ${action}`);
  });
};

main();
