import fs from 'node:fs';
import { parseCsv } from './csv-utils.mjs';

function parseArgs(argv) {
  const args = { file: 'templates/trade-log.csv', phase: 'sim' };
  const positional = [];
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--file' && argv[index + 1]) args.file = argv[++index];
    else if (item === '--phase' && argv[index + 1]) args.phase = argv[++index];
    else positional.push(item);
  }

  if (positional[0]) args.file = positional[0];
  if (positional[1]) args.phase = positional[1];

  return args;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeMetrics(rows) {
  const total = rows.length;
  const successRows = rows.filter((row) => row.status === 'success');
  const failedRows = rows.filter((row) => row.status === 'failed');

  const netByTrade = rows.map((row) => numberValue(row.net_profit_usd));
  const grossWins = netByTrade.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLossAbs = Math.abs(netByTrade.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));

  const avgNet = total > 0 ? netByTrade.reduce((sum, value) => sum + value, 0) / total : 0;
  const winRate = total > 0 ? (successRows.length / total) * 100 : 0;
  const failureRate = total > 0 ? (failedRows.length / total) * 100 : 0;
  const profitFactor = grossLossAbs > 0 ? grossWins / grossLossAbs : grossWins > 0 ? Number.POSITIVE_INFINITY : 0;

  const equitySeries = rows
    .map((row) => numberValue(row.equity_end_usd))
    .filter((value) => Number.isFinite(value) && value > 0);

  let peak = equitySeries[0] ?? 0;
  let maxDrawdownPct = 0;
  equitySeries.forEach((equity) => {
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const drawdown = ((peak - equity) / peak) * 100;
      if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
    }
  });

  return {
    total,
    winRate,
    failureRate,
    avgNet,
    profitFactor,
    maxDrawdownPct,
  };
}

function getThresholds(phase) {
  if (phase === 'micro') {
    return {
      minTrades: 20,
      minWinRate: 50,
      minAvgNet: 0,
      minProfitFactor: 1.1,
      maxDrawdownPct: 10,
      maxFailureRate: 12,
    };
  }

  return {
    minTrades: 100,
    minWinRate: 55,
    minAvgNet: 0,
    minProfitFactor: 1.2,
    maxDrawdownPct: 15,
    maxFailureRate: 10,
  };
}

function evaluate(metrics, thresholds) {
  const checks = [
    ['Trades', metrics.total >= thresholds.minTrades, `${metrics.total} >= ${thresholds.minTrades}`],
    ['Win rate', metrics.winRate >= thresholds.minWinRate, `${metrics.winRate.toFixed(2)}% >= ${thresholds.minWinRate}%`],
    ['Avg net/trade', metrics.avgNet > thresholds.minAvgNet, `${metrics.avgNet.toFixed(4)} > ${thresholds.minAvgNet}`],
    ['Profit factor', metrics.profitFactor >= thresholds.minProfitFactor, `${Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(3) : 'Infinity'} >= ${thresholds.minProfitFactor}`],
    ['Max drawdown', metrics.maxDrawdownPct <= thresholds.maxDrawdownPct, `${metrics.maxDrawdownPct.toFixed(2)}% <= ${thresholds.maxDrawdownPct}%`],
    ['Failure rate', metrics.failureRate <= thresholds.maxFailureRate, `${metrics.failureRate.toFixed(2)}% <= ${thresholds.maxFailureRate}%`],
  ];

  const pass = checks.every(([, ok]) => ok);
  return { pass, checks };
}

function main() {
  const { file, phase } = parseArgs(process.argv);
  if (!fs.existsSync(file)) {
    console.error(`Missing file: ${file}`);
    process.exit(1);
  }

  const content = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(content)
    .filter((row) => (row.phase || '').toLowerCase() === phase.toLowerCase());

  if (rows.length === 0) {
    console.error(`No rows found for phase='${phase}' in ${file}`);
    process.exit(1);
  }

  const metrics = computeMetrics(rows);
  const thresholds = getThresholds(phase.toLowerCase());
  const result = evaluate(metrics, thresholds);

  console.log(`Phase: ${phase}`);
  console.log(`Trades: ${metrics.total}`);
  console.log(`Win rate: ${metrics.winRate.toFixed(2)}%`);
  console.log(`Failure rate: ${metrics.failureRate.toFixed(2)}%`);
  console.log(`Avg net/trade: ${metrics.avgNet.toFixed(4)}`);
  console.log(`Profit factor: ${Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(3) : 'Infinity'}`);
  console.log(`Max drawdown: ${metrics.maxDrawdownPct.toFixed(2)}%`);
  console.log('--- Checks ---');
  result.checks.forEach(([label, ok, detail]) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`);
  });

  if (!result.pass) {
    process.exit(2);
  }
}

main();
