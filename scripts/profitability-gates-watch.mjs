import { spawnSync } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function runGateCommand() {
  return spawnSync('node', ['scripts/profitability-gates.mjs'], {
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: process.env,
  });
}

async function main() {
  const runOnce = process.argv.includes('--once');

  const maxChecks = runOnce
    ? 1
    : Math.max(1, Math.round(numberFromEnv('PROFIT_GATE_WATCH_MAX_CHECKS', 24)));
  const intervalMs = Math.max(30_000, Math.round(numberFromEnv('PROFIT_GATE_WATCH_INTERVAL_MS', 300_000)));
  const stopOnGo = boolFromEnv('PROFIT_GATE_WATCH_STOP_ON_GO', true);

  let passed = 0;
  let failed = 0;

  console.log(`[${new Date().toISOString()}] gate-watch start maxChecks=${maxChecks} intervalMs=${intervalMs} stopOnGo=${stopOnGo}`);

  for (let i = 1; i <= maxChecks; i += 1) {
    console.log(`\n--- Gate Check ${i}/${maxChecks} @ ${new Date().toISOString()} ---`);
    const result = runGateCommand();
    const exitCode = typeof result.status === 'number' ? result.status : 1;

    if (exitCode === 0) {
      passed += 1;
      console.log(`Gate check ${i} result=GO`);
      if (stopOnGo) {
        console.log('Stopping watch because GO was reached.');
        break;
      }
    } else {
      failed += 1;
      console.log(`Gate check ${i} result=NO-GO (exit=${exitCode})`);
    }

    if (i < maxChecks) {
      await sleep(intervalMs);
    }
  }

  console.log('\n=== Gate Watch Summary ===');
  console.log(`passed_checks=${passed}`);
  console.log(`failed_checks=${failed}`);

  if (passed === 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
