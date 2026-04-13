// Lightweight learning engine — tracks patterns and recommends config changes
// Stores history locally in data/history.json, learns from it over time
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const HISTORY_FILE = join(DATA_DIR, 'history.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadHistory() {
  ensureDataDir();
  if (!existsSync(HISTORY_FILE)) return { scans: [], gasSnapshots: [], recommendations: [] };
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return { scans: [], gasSnapshots: [], recommendations: [] };
  }
}

function saveHistory(history) {
  ensureDataDir();
  // Keep last 2000 entries per category to avoid unbounded growth
  for (const key of ['scans', 'gasSnapshots', 'recommendations']) {
    if (Array.isArray(history[key]) && history[key].length > 2000) {
      history[key] = history[key].slice(-2000);
    }
  }
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

export function recordGasSnapshot(baseFeeGwei, priorityGwei, ethPriceUsd) {
  const history = loadHistory();
  history.gasSnapshots.push({
    ts: Date.now(),
    baseFeeGwei,
    priorityGwei,
    ethPriceUsd,
    hour: new Date().getUTCHours(),
    dayOfWeek: new Date().getUTCDay(),
  });
  saveHistory(history);
}

export function recordScanResult(opportunitiesFound, spreadsData) {
  const history = loadHistory();
  history.scans.push({
    ts: Date.now(),
    found: opportunitiesFound,
    spreads: spreadsData || [],
    hour: new Date().getUTCHours(),
    dayOfWeek: new Date().getUTCDay(),
  });
  saveHistory(history);
}

export function recordRecommendation(rec) {
  const history = loadHistory();
  history.recommendations.push({ ts: Date.now(), ...rec });
  saveHistory(history);
}

// ---------- Pattern Analysis ----------

export function analyzePatterns() {
  const history = loadHistory();
  const findings = [];

  // 1. Best hours analysis — when do we see the most opportunities?
  if (history.scans.length >= 20) {
    const hourBuckets = new Array(24).fill(0);
    const hourCounts = new Array(24).fill(0);
    for (const scan of history.scans) {
      hourBuckets[scan.hour] += scan.found;
      hourCounts[scan.hour]++;
    }
    const hourAvg = hourBuckets.map((total, i) => ({
      hour: i,
      avg: hourCounts[i] > 0 ? total / hourCounts[i] : 0,
      samples: hourCounts[i],
    })).filter(h => h.samples >= 2);

    const best = hourAvg.sort((a, b) => b.avg - a.avg)[0];
    const worst = hourAvg.sort((a, b) => a.avg - b.avg)[0];

    if (best && best.avg > 0) {
      findings.push({
        type: 'pattern',
        severity: 'recommendation',
        title: 'Best scanning window detected',
        detail: `UTC ${best.hour}:00 averages ${best.avg.toFixed(1)} opportunities/scan (${best.samples} samples). Worst: UTC ${worst.hour}:00 (${worst.avg.toFixed(1)} avg).`,
        action: `Consider increasing scan frequency during UTC ${best.hour}:00-${(best.hour + 2) % 24}:00 for better catch rate.`,
      });
    }
  }

  // 2. Gas pattern — cheapest times
  if (history.gasSnapshots.length >= 20) {
    const hourGas = new Array(24).fill(null).map(() => []);
    for (const snap of history.gasSnapshots) {
      hourGas[snap.hour].push(snap.baseFeeGwei);
    }
    const hourAvg = hourGas.map((fees, i) => ({
      hour: i,
      avg: fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : Infinity,
      samples: fees.length,
    })).filter(h => h.samples >= 2);

    const cheapest = hourAvg.sort((a, b) => a.avg - b.avg)[0];
    if (cheapest && cheapest.avg < Infinity) {
      findings.push({
        type: 'pattern',
        severity: 'info',
        title: 'Cheapest gas window',
        detail: `UTC ${cheapest.hour}:00 averages ${cheapest.avg.toFixed(1)} gwei (${cheapest.samples} samples).`,
        action: `Trades near UTC ${cheapest.hour}:00 save the most on gas.`,
      });
    }
  }

  // 3. Recommendation frequency — don't spam the same advice
  const recentRecs = history.recommendations.filter(r => Date.now() - r.ts < 24 * 60 * 60 * 1000);
  const recTypes = new Map();
  for (const r of recentRecs) {
    recTypes.set(r.type, (recTypes.get(r.type) || 0) + 1);
  }

  return { findings, recentRecTypes: recTypes, historySize: history.scans.length };
}

// ---------- Config Optimization ----------

export function suggestConfigChanges(currentGasCostUsd, scannerEstimatedGas) {
  const findings = [];
  const history = loadHistory();

  // Calculate rolling average gas cost from recent snapshots
  const recentGas = history.gasSnapshots.filter(s => Date.now() - s.ts < 6 * 60 * 60 * 1000);
  if (recentGas.length >= 3) {
    const avgBase = recentGas.reduce((s, g) => s + g.baseFeeGwei, 0) / recentGas.length;
    const avgEth = recentGas.reduce((s, g) => s + g.ethPriceUsd, 0) / recentGas.length;
    const avgCostUsd = (avgBase * 600_000) / 1e9 * avgEth;

    if (Math.abs(avgCostUsd - scannerEstimatedGas) / scannerEstimatedGas > 0.3) {
      findings.push({
        type: 'config_optimization',
        severity: 'recommendation',
        title: 'Scanner gas estimate is off',
        detail: `6h rolling avg gas cost: $${avgCostUsd.toFixed(2)}. Scanner uses: $${scannerEstimatedGas}. Difference: ${((avgCostUsd - scannerEstimatedGas) / scannerEstimatedGas * 100).toFixed(0)}%.`,
        action: `Set SCANNER_ESTIMATED_GAS_USD=${Math.ceil(avgCostUsd + 2)} for more accurate filtering.`,
      });
    }
  }

  // Check if loan size could be optimized
  const recentScans = history.scans.filter(s => Date.now() - s.ts < 24 * 60 * 60 * 1000);
  const narrowMisses = recentScans.filter(s =>
    s.spreads?.some?.(sp => sp.spread > 0.05 && sp.spread < 0.08)
  );
  if (narrowMisses.length > 3) {
    findings.push({
      type: 'config_optimization',
      severity: 'recommendation',
      title: 'Narrow misses detected',
      detail: `${narrowMisses.length} scans in 24h found spreads between 0.05-0.08% that were filtered out. With a larger flash loan, these could be profitable.`,
      action: `Consider increasing SCANNER_LOAN_AMOUNT_USD from 10000 to 25000-50000 to make thinner spreads worthwhile.`,
    });
  }

  return findings;
}
