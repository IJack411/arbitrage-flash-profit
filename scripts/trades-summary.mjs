import fs from 'node:fs';
import { parseCsv } from './csv-utils.mjs';

const file = process.argv[2] || 'templates/trade-log.csv';

function countPhase(rows, phase) {
  return rows.filter((row) => (row.phase || '').toLowerCase() === phase).length;
}

if (!fs.existsSync(file)) {
  console.error(`Missing file: ${file}`);
  process.exit(1);
}

const content = fs.readFileSync(file, 'utf8');
const rows = parseCsv(content);

const simCount = countPhase(rows, 'sim');
const microCount = countPhase(rows, 'micro');

const simTarget = 100;
const microMin = 20;
const microMax = 50;

const simRemaining = Math.max(simTarget - simCount, 0);
const microMinRemaining = Math.max(microMin - microCount, 0);
const microMaxRemaining = Math.max(microMax - microCount, 0);

console.log('Trading Progress Summary');
console.log('------------------------');
console.log(`Total logged trades: ${rows.length}`);
console.log('');
console.log(`Simulation: ${simCount}/${simTarget} (${simRemaining} remaining)`);
console.log(`Micro Live: ${microCount}/${microMin}-${microMax} (${microMinRemaining} to minimum, ${microMaxRemaining} to full sample)`);

if (simCount < simTarget) {
  console.log('');
  console.log('Next gate: complete simulation sample first.');
} else if (microCount < microMin) {
  console.log('');
  console.log('Next gate: complete minimum micro-live sample (20 trades).');
} else if (microCount < microMax) {
  console.log('');
  console.log('Next gate: extend micro-live sample to 50 before scaling.');
} else {
  console.log('');
  console.log('Sample-size gates met. Run trades:evaluate for final metric pass/fail.');
}
