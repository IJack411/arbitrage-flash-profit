import fs from 'node:fs';
import path from 'node:path';
import { isPlaceholder, isEvmAddress, KNOWN_DEV_CONTRACT_ADDRESSES } from './lib/address-safety.mjs';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const SUPABASE_ENV_PATH = path.join(ROOT, 'supabase', '.env.local');

const REQUIRED_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_ALCHEMY_API_KEY',
  'VITE_ARBITRAGE_CONTRACT_ADDRESS',
  'VITE_FLASH_LOAN_PROVIDER_ADDRESS',
];

function parseDotEnv(fileText) {
  const result = {};
  const lines = fileText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function resolveEnvValue(primaryEnv, secondaryEnv, key) {
  const primary = primaryEnv[key];
  if (primary !== undefined && primary !== '') return primary;
  return secondaryEnv[key];
}

function run() {
  const failures = [];
  const warnings = [];

  if (!fs.existsSync(ENV_PATH)) {
    console.error(`Missing .env file at ${ENV_PATH}`);
    process.exit(1);
  }

  const envText = fs.readFileSync(ENV_PATH, 'utf8');
  const env = parseDotEnv(envText);
  const supabaseEnv = fs.existsSync(SUPABASE_ENV_PATH)
    ? parseDotEnv(fs.readFileSync(SUPABASE_ENV_PATH, 'utf8'))
    : {};

  printSection('Environment Checks');

  for (const key of REQUIRED_ENV) {
    const value = env[key];
    if (!value) {
      failures.push(`${key} is missing`);
      continue;
    }

    if (isPlaceholder(value)) {
      failures.push(`${key} still contains a placeholder value`);
      continue;
    }

    console.log(`PASS ${key}`);
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
    failures.push('VITE_SUPABASE_URL must look like https://<project>.supabase.co');
  }

  const arbContract = env.VITE_ARBITRAGE_CONTRACT_ADDRESS || '';
  if (arbContract) {
    if (!isEvmAddress(arbContract)) {
      failures.push('VITE_ARBITRAGE_CONTRACT_ADDRESS is not a valid EVM address');
    } else if (KNOWN_DEV_CONTRACT_ADDRESSES.has(arbContract.toLowerCase())) {
      failures.push('VITE_ARBITRAGE_CONTRACT_ADDRESS is a known local test deployment address');
    }
  }

  const flashLoanProvider = env.VITE_FLASH_LOAN_PROVIDER_ADDRESS || '';
  if (flashLoanProvider && !isEvmAddress(flashLoanProvider)) {
    failures.push('VITE_FLASH_LOAN_PROVIDER_ADDRESS is not a valid EVM address');
  }

  const liveTradingEnabled = String(env.VITE_LIVE_TRADING_ENABLED || '').toLowerCase() === 'true';
  if (!liveTradingEnabled) {
    failures.push('VITE_LIVE_TRADING_ENABLED must be true for live trading (set only after all checks pass)');
  }

  const recommended = {
    LIVE_MAX_SLIPPAGE_PERCENT: '2.0',
    LIVE_MAX_LOAN_USD: '25000',
    LIVE_MIN_NET_PROFIT_USD: '25',
    LIVE_MAX_GAS_TO_PROFIT_RATIO: '0.4',
  };

  printSection('Recommended Live Risk Caps');
  for (const [key, defaultValue] of Object.entries(recommended)) {
    const value = env[key];
    if (!value) {
      warnings.push(`${key} not set (recommended default ${defaultValue})`);
      continue;
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      warnings.push(`${key} should be a positive number (current: ${value})`);
    } else {
      console.log(`PASS ${key}=${value}`);
    }
  }

  const maxSlippage = Number(env.LIVE_MAX_SLIPPAGE_PERCENT || '2');
  if (Number.isFinite(maxSlippage) && maxSlippage > 3.0) {
    failures.push('LIVE_MAX_SLIPPAGE_PERCENT is too high for initial production rollout (must be <= 3.0)');
  }

  const maxLoan = Number(env.LIVE_MAX_LOAN_USD || '25000');
  if (Number.isFinite(maxLoan) && maxLoan > 50000) {
    failures.push('LIVE_MAX_LOAN_USD is too high for initial production rollout (must be <= 50000)');
  }

  const minNetProfit = Number(env.LIVE_MIN_NET_PROFIT_USD || '25');
  if (Number.isFinite(minNetProfit) && minNetProfit < 10) {
    failures.push('LIVE_MIN_NET_PROFIT_USD is too low for production (must be >= 10)');
  }

  const maxGasToProfit = Number(env.LIVE_MAX_GAS_TO_PROFIT_RATIO || '0.4');
  if (Number.isFinite(maxGasToProfit) && maxGasToProfit > 0.6) {
    failures.push('LIVE_MAX_GAS_TO_PROFIT_RATIO is too permissive (must be <= 0.6)');
  }

  printSection('Scanner Production Gates');

  const graphApiKey = resolveEnvValue(env, supabaseEnv, 'THEGRAPH_API_KEY');
  if (!graphApiKey) {
    failures.push('THEGRAPH_API_KEY is missing (required for scanner production readiness)');
  } else if (isPlaceholder(graphApiKey)) {
    failures.push('THEGRAPH_API_KEY still contains a placeholder value');
  } else {
    console.log('PASS THEGRAPH_API_KEY');
  }

  const scannerGatesEnabled = parseBoolean(resolveEnvValue(env, supabaseEnv, 'SCANNER_ENFORCE_READINESS_GATES'), false);
  if (!scannerGatesEnabled) {
    failures.push('SCANNER_ENFORCE_READINESS_GATES must be true before production live trading');
  } else {
    console.log('PASS SCANNER_ENFORCE_READINESS_GATES=true');
  }

  const minHealthySourcesRaw = resolveEnvValue(env, supabaseEnv, 'SCANNER_MIN_GRAPH_SOURCES_HEALTHY') || '3';
  const minHealthySources = Number(minHealthySourcesRaw);
  if (!Number.isFinite(minHealthySources) || minHealthySources < 3) {
    failures.push('SCANNER_MIN_GRAPH_SOURCES_HEALTHY must be a number >= 3');
  } else {
    console.log(`PASS SCANNER_MIN_GRAPH_SOURCES_HEALTHY=${minHealthySources}`);
  }

  const maxFallbackSourcesRaw = resolveEnvValue(env, supabaseEnv, 'SCANNER_MAX_GRAPH_FALLBACK_SOURCES') || '2';
  const maxFallbackSources = Number(maxFallbackSourcesRaw);
  if (!Number.isFinite(maxFallbackSources) || maxFallbackSources < 0 || maxFallbackSources > 2) {
    failures.push('SCANNER_MAX_GRAPH_FALLBACK_SOURCES must be between 0 and 2 for initial production rollout');
  } else {
    console.log(`PASS SCANNER_MAX_GRAPH_FALLBACK_SOURCES=${maxFallbackSources}`);
  }

  if (!fs.existsSync(SUPABASE_ENV_PATH)) {
    warnings.push('supabase/.env.local not found; relying on root .env values only. For local edge testing, create supabase/.env.local from supabase/.env.local.example');
  }

  printSection('Result');

  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.log('Failures:');
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    console.log('\nPreflight FAILED. Live trading must remain blocked.');
    process.exit(1);
  }

  console.log('Preflight PASSED. Environment is ready for guarded live trading.');
}

run();
