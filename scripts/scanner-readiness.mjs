import { spawnSync } from 'node:child_process';

const steps = [];

const skipPreflight = String(process.env.READINESS_SKIP_PREFLIGHT || 'false').toLowerCase() === 'true';
const skipMathTests = String(process.env.READINESS_SKIP_MATH_TESTS || 'false').toLowerCase() === 'true';
const skipRuntimeProbe = String(process.env.READINESS_SKIP_RUNTIME_PROBE || 'false').toLowerCase() === 'true';

if (!skipPreflight) {
  steps.push({
    name: 'Live preflight',
    command: 'npm',
    args: ['run', 'trading:preflight'],
    required: true,
  });
}

if (!skipMathTests) {
  steps.push({
    name: 'Deterministic math tests',
    command: 'npm',
    args: ['run', 'test:math'],
    required: true,
  });
}

if (!skipRuntimeProbe) {
  steps.push({
    name: 'Scanner runtime probe',
    command: 'node',
    args: ['scripts/probe-scanner.mjs'],
    required: false,
  });
}

const skipIndexRolloutScore = String(process.env.READINESS_SKIP_INDEX_ROLLOUT_SCORE || 'false').toLowerCase() === 'true';
if (!skipIndexRolloutScore) {
  steps.push({
    name: 'Indexer rollout score',
    command: 'npm',
    args: ['run', 'scanner:indexer:rollout:score'],
    required: true,
  });
}

function runStep(step) {
  console.log(`\n=== ${step.name} ===`);
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  return {
    ...step,
    success: result.status === 0,
    code: result.status ?? 1,
  };
}

function main() {
  const results = steps.map(runStep);

  console.log('\n=== Scanner Readiness Summary ===');
  for (const result of results) {
    const marker = result.success ? 'PASS' : (result.required ? 'FAIL' : 'WARN');
    console.log(`${marker} ${result.name}${result.success ? '' : ` (exit ${result.code})`}`);
  }

  const requiredFailures = results.filter((result) => result.required && !result.success);
  if (requiredFailures.length > 0) {
    console.log('\nScanner readiness FAILED (required checks did not pass).');
    process.exit(1);
  }

  const optionalFailures = results.filter((result) => !result.required && !result.success);
  if (optionalFailures.length > 0) {
    console.log('\nScanner readiness PARTIAL: required checks passed, runtime probe has external issues.');
    process.exit(0);
  }

  console.log('\nScanner readiness PASSED: all checks are green.');
}

main();
