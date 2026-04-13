import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseCsv } from './csv-utils.mjs';

const USAGE = `Usage:
  npm run trades:sync -- [--phase sim|micro] [--file templates/trade-log.csv] [--limit 100] [--wallet 0x...] [--since 2026-03-01T00:00:00Z]

Examples:
  npm run trades:sync -- --phase sim
  npm run trades:sync -- --phase micro --limit 50
  npm run trades:sync -- --wallet 0xabc123... --since 2026-03-05T00:00:00Z
`;

function parseArgs(argv) {
  const args = {
    phase: 'sim',
    file: 'templates/trade-log.csv',
    limit: 100,
    wallet: '',
    since: '',
  };
  const positional = [];

  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--help' || item === '-h') {
      args.help = true;
      continue;
    }
    if (item === '--phase' && argv[index + 1]) args.phase = argv[++index];
    else if (item === '--file' && argv[index + 1]) args.file = argv[++index];
    else if (item === '--limit' && argv[index + 1]) args.limit = Number(argv[++index]);
    else if (item === '--wallet' && argv[index + 1]) args.wallet = argv[++index];
    else if (item === '--since' && argv[index + 1]) args.since = argv[++index];
    else positional.push(item);
  }

  if (positional[0] && ['sim', 'micro'].includes(positional[0])) {
    args.phase = positional[0];
  }

  return args;
}

function readEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const content = fs.readFileSync(path, 'utf8');
  const result = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const separator = trimmed.indexOf('=');
    if (separator < 0) return;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  });

  return result;
}

function getEnv(key, loadedEnv) {
  return process.env[key] || loadedEnv[key] || '';
}

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

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['success', 'included', 'confirmed'].includes(normalized)) return 'success';
  if (['failed', 'reverted', 'timeout', 'error'].includes(normalized)) return 'failed';
  return '';
}

function parseExistingSyncKeys(rows) {
  const keys = new Set();
  rows.forEach((row) => {
    const notes = row.notes || '';
    const match = notes.match(/sync_key=([^\s]+)/);
    if (match?.[1]) keys.add(match[1]);
  });
  return keys;
}

function makeSyncKey(tx) {
  const hash = String(tx.transaction_hash || '').trim();
  if (hash) return `tx:${hash}`;

  const createdAt = String(tx.created_at || '');
  const tokenPair = String(tx.token_pair || 'unknown').replace(/\s+/g, '_');
  const profit = safeNumber(tx.profit).toFixed(6);
  return `row:${createdAt}:${tokenPair}:${profit}`;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!['sim', 'micro'].includes(args.phase)) {
    console.error(`Invalid phase '${args.phase}'. Use 'sim' or 'micro'.`);
    process.exit(1);
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    console.error(`Invalid --limit value: ${args.limit}`);
    process.exit(1);
  }

  const loadedEnv = {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
  };

  const supabaseUrl = getEnv('VITE_SUPABASE_URL', loadedEnv);
  const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY', loadedEnv);

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (.env/.env.local).');
    process.exit(1);
  }

  ensureHeader(args.file);

  const existingRows = parseCsv(fs.readFileSync(args.file, 'utf8'));
  const existingSyncKeys = parseExistingSyncKeys(existingRows);
  let currentEquity = existingRows.length > 0
    ? safeNumber(existingRows[existingRows.length - 1].equity_end_usd)
    : 1000;

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('transactions')
    .select('created_at,token_pair,profit,gas_used,status,transaction_hash,wallet_address,network')
    .order('created_at', { ascending: true })
    .limit(args.limit);

  if (args.wallet) query = query.eq('wallet_address', args.wallet);
  if (args.since) query = query.gte('created_at', args.since);

  const { data, error } = await query;
  if (error) {
    console.error(`Supabase query failed: ${error.message}`);
    process.exit(1);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    console.log('No transactions found to sync.');
    process.exit(0);
  }

  const linesToAppend = [];
  let skippedExisting = 0;
  let skippedPending = 0;

  rows.forEach((tx) => {
    const normalizedStatus = mapStatus(tx.status);
    if (!normalizedStatus) {
      skippedPending += 1;
      return;
    }

    const syncKey = makeSyncKey(tx);
    if (existingSyncKeys.has(syncKey)) {
      skippedExisting += 1;
      return;
    }

    const net = safeNumber(tx.profit);
    const gas = Math.abs(safeNumber(tx.gas_used));
    const gross = Math.max(net + gas, 0);
    const equityStart = currentEquity;
    const equityEnd = equityStart + net;
    currentEquity = equityEnd;

    const noteParts = [
      'synced-from-ui',
      `sync_key=${syncKey}`,
      `tx=${tx.transaction_hash || 'n/a'}`,
      `network=${tx.network || 'unknown'}`,
      `wallet=${tx.wallet_address || 'n/a'}`,
      `src_status=${tx.status || 'n/a'}`,
      `pair=${(tx.token_pair || 'unknown').replace(/\s+/g, '_')}`,
    ];

    const line = [
      tx.created_at || new Date().toISOString(),
      args.phase,
      args.phase,
      normalizedStatus,
      gross.toFixed(6),
      gas.toFixed(6),
      '0.000000',
      '0.000000',
      net.toFixed(6),
      equityStart.toFixed(6),
      equityEnd.toFixed(6),
      noteParts.join(' '),
    ].map(csvEscape).join(',');

    linesToAppend.push(line);
    existingSyncKeys.add(syncKey);
  });

  if (linesToAppend.length === 0) {
    console.log(`No new completed transactions to append. Skipped existing: ${skippedExisting}. Skipped non-final statuses: ${skippedPending}.`);
    process.exit(0);
  }

  fs.appendFileSync(args.file, `${linesToAppend.join('\n')}\n`, 'utf8');

  console.log(`Synced ${linesToAppend.length} trade(s) into ${args.file}.`);
  console.log(`Skipped existing: ${skippedExisting}. Skipped non-final statuses: ${skippedPending}.`);
  console.log(`Phase used: ${args.phase}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
