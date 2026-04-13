import fs from 'node:fs';

const USAGE = `Usage:
  npm run trades:append -- <phase> <status> <gross> <gas> <slippage> <fees> <net> <equityStart> <equityEnd> [notes...]

Examples:
  npm run trades:append -- sim success 12.5 1.1 0.2 0.1 11.1 1000 1011.1 test-run
  npm run trades:append -- micro failed 0 2.4 0 0 -2.4 500 497.6 rpc-timeout
`;

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function ensureHeader(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(filePath.substring(0, filePath.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(
      filePath,
      'timestamp,phase,mode,status,gross_profit_usd,gas_cost_usd,slippage_cost_usd,other_fees_usd,net_profit_usd,equity_start_usd,equity_end_usd,notes\n',
      'utf8',
    );
  }
}

function toNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${label}: ${value}`);
  }
  return parsed;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.length < 9) {
    console.error('Missing required arguments.');
    console.log(USAGE);
    process.exit(1);
  }

  const [phase, status, gross, gas, slippage, fees, net, equityStart, equityEnd, ...notesParts] = args;

  if (!['sim', 'micro'].includes(phase)) {
    throw new Error(`phase must be 'sim' or 'micro', received: ${phase}`);
  }

  if (!['success', 'failed'].includes(status)) {
    throw new Error(`status must be 'success' or 'failed', received: ${status}`);
  }

  const row = {
    timestamp: new Date().toISOString(),
    phase,
    mode: phase,
    status,
    gross_profit_usd: toNumber(gross, 'gross').toFixed(6),
    gas_cost_usd: toNumber(gas, 'gas').toFixed(6),
    slippage_cost_usd: toNumber(slippage, 'slippage').toFixed(6),
    other_fees_usd: toNumber(fees, 'fees').toFixed(6),
    net_profit_usd: toNumber(net, 'net').toFixed(6),
    equity_start_usd: toNumber(equityStart, 'equityStart').toFixed(6),
    equity_end_usd: toNumber(equityEnd, 'equityEnd').toFixed(6),
    notes: notesParts.join(' '),
  };

  const filePath = 'templates/trade-log.csv';
  ensureHeader(filePath);

  const line = [
    row.timestamp,
    row.phase,
    row.mode,
    row.status,
    row.gross_profit_usd,
    row.gas_cost_usd,
    row.slippage_cost_usd,
    row.other_fees_usd,
    row.net_profit_usd,
    row.equity_start_usd,
    row.equity_end_usd,
    row.notes,
  ].map(csvEscape).join(',');

  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
  console.log(`Appended trade to ${filePath}`);
}

main();
