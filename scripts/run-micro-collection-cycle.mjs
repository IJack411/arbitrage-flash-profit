import { spawnSync } from 'node:child_process';

const defaults = {
  COLLECT_NETWORK: 'ethereum',
  COLLECT_MAX_CYCLES: '40',
  COLLECT_MAX_ATTEMPTS: '12',
  COLLECT_INTERVAL_MS: '30000',
  COLLECT_REQUIRE_ACTIVE: 'true',
  COLLECT_LOAN_USD: '2000',
  COLLECT_ESTIMATED_GAS_USD: '6',
  COLLECT_MIN_NET_PROFIT_USD: '20',
  COLLECT_MAX_SLIPPAGE_BPS: '55',
  COLLECT_MIN_CONFIDENCE_SCORE: '45',
  COLLECT_MAX_GAS_TO_NET_RATIO: '0.45',
  COLLECT_ADAPTIVE_ENABLED: 'true',
  COLLECT_ADAPTIVE_NO_CANDIDATE_STREAK: '3',
  COLLECT_ADAPTIVE_MIN_NET_STEP: '2',
  COLLECT_ADAPTIVE_MIN_NET_FLOOR: '12',
  COLLECT_ADAPTIVE_CONF_STEP: '3',
  COLLECT_ADAPTIVE_CONF_FLOOR: '32',
  COLLECT_ADAPTIVE_GAS_RATIO_STEP: '0.05',
  COLLECT_ADAPTIVE_GAS_RATIO_CAP: '0.65',
  COLLECT_ADAPTIVE_SLIPPAGE_STEP: '5',
  COLLECT_ADAPTIVE_SLIPPAGE_CAP: '75',
  PROFIT_GATE_WINDOW_ATTEMPTS: '500',
  PROFIT_GATE_WINDOW_SCANNER_RUNS: '100',
};

function setDefaultEnv() {
  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function runNodeScript(scriptPath, args = []) {
  return spawnSync('node', [scriptPath, ...args], {
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: process.env,
  });
}

function main() {
  const scanOnly = process.argv.includes('--scan-only');

  setDefaultEnv();

  console.log(`[${new Date().toISOString()}] micro-collection cycle start scanOnly=${scanOnly}`);
  console.log(
    `network=${process.env.COLLECT_NETWORK} cycles=${process.env.COLLECT_MAX_CYCLES} attempts=${process.env.COLLECT_MAX_ATTEMPTS}`,
  );
  console.log(
    `quality=minNet:${process.env.COLLECT_MIN_NET_PROFIT_USD} minConfidence:${process.env.COLLECT_MIN_CONFIDENCE_SCORE} maxGasToNet:${process.env.COLLECT_MAX_GAS_TO_NET_RATIO}`,
  );

  const collectArgs = ['scripts/collect-execution-samples.mjs'];
  if (scanOnly) collectArgs.push('--scan-only');

  const collectResult = runNodeScript(collectArgs[0], collectArgs.slice(1));
  const collectCode = typeof collectResult.status === 'number' ? collectResult.status : 1;

  if (collectCode !== 0) {
    console.error(`Collection phase failed with exit code ${collectCode}.`);
    process.exit(collectCode);
  }

  const gateResult = runNodeScript('scripts/profitability-gates.mjs');
  const gateCode = typeof gateResult.status === 'number' ? gateResult.status : 1;

  if (gateCode === 0) {
    console.log('Micro-collection cycle result: GO');
    process.exit(0);
  }

  console.log('Micro-collection cycle result: NO-GO (more evidence collection needed).');
  process.exit(1);
}

main();
