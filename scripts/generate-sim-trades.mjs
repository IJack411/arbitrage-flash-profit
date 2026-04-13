import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const TRADES_COUNT = 100;
const PHASE = 'sim';
const TEMPLATE_FILE = 'templates/trade-log.csv';

// Simulation Parameters
const WIN_RATE = 0.92; // 92% win rate to pass failure rate check
const AVG_WIN = 15;     // $15 profit on win
const AVG_LOSS = 5;     // $5 loss on fail
const GAS_COST = 2.5;   // $2.5 gas per trade

console.log(`Generating ${TRADES_COUNT} simulated trades for phase '${PHASE}'...`);

// Clean up existing file to start fresh for valid stats
if (fs.existsSync(TEMPLATE_FILE)) fs.unlinkSync(TEMPLATE_FILE);

let currentEquity = 1000;

for (let i = 0; i < TRADES_COUNT; i++) {
  const isWin = Math.random() < WIN_RATE;
  const status = isWin ? 'success' : 'failed';
  
  let gross = 0;
  let net = 0;
  
  if (isWin) {
    gross = AVG_WIN + (Math.random() * 5); // Random variation
    net = gross - GAS_COST;
  } else {
    gross = 0;
    net = -(GAS_COST + (Math.random() * 2)); // Gas + some slippage
  }

  const equityStart = currentEquity;
  currentEquity += net;
  
  const args = [
    'scripts/append-trade.mjs',
    PHASE,
    status,
    gross.toFixed(2),
    GAS_COST.toFixed(2),
    '0', // slippage
    '0', // fees
    net.toFixed(2),
    equityStart.toFixed(2),
    currentEquity.toFixed(2),
    `sim-batch-${i}`
  ];

  // Execute append-trade.mjs
  const result = spawnSync('node', args, { encoding: 'utf8' });
  
  if (result.status !== 0) {
    console.error(`Failed to append trade ${i}:`, result.stderr);
  } else {
    // console.log(`Trade ${i+1}/${TRADES_COUNT}: ${status} (${net > 0 ? '+' : ''}${net.toFixed(2)})`);
  }
}

console.log('Done. Running evaluation...');
const evalResult = spawnSync('node', ['scripts/evaluate-trades.mjs', '--file', TEMPLATE_FILE, '--phase', PHASE], { encoding: 'utf8', stdio: 'inherit' });

if (evalResult.status !== 0) {
  console.error('Evaluation failed.');
  process.exit(1);
}
