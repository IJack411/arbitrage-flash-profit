#!/usr/bin/env node
'use strict';

/**
 * realtime-server-experimental.cjs
 *
 * Experimental real-time Arbitrum arbitrage scanner with multi-endpoint RPC
 * failover so the process survives Alchemy quota exhaustion (HTTP 429) or
 * individual endpoint DNS/SSL failures.
 *
 * Key environment flags:
 *   EXP_RPC_URL              – highest-priority RPC override
 *   EXP_OFFLINE_SMOKE_TEST   – skip all network I/O; just validate code paths
 *   EXP_SKIP_STARTUP_SANITY  – skip the startup sanity-check phase
 *   EXP_MAX_SCANS            – stop after N scans (default: unlimited)
 *   EXP_BENCH                – emit per-scan timing lines
 *   EXP_DRY_RUN              – scan only; never submit transactions
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnvFallbacks() {
  for (const file of ['.env', 'supabase/.env.local']) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = parseDotEnv(fs.readFileSync(p, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (!(k in process.env)) process.env[k] = v;
      }
    } catch (_) { /* ignore read errors */ }
  }
}

loadEnvFallbacks();

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

function boolFlag(name, def = false) {
  const v = (process.env[name] || '').trim().toLowerCase();
  if (v === '') return def;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

const OFFLINE_SMOKE  = boolFlag('EXP_OFFLINE_SMOKE_TEST');
const SKIP_SANITY    = boolFlag('EXP_SKIP_STARTUP_SANITY');
const DRY_RUN        = boolFlag('EXP_DRY_RUN', true);   // default true — safe
const BENCH          = boolFlag('EXP_BENCH');
const MAX_SCANS      = parseInt(process.env.EXP_MAX_SCANS || '0', 10) || Infinity;
const SCAN_INTERVAL  = parseInt(process.env.EXP_SCAN_INTERVAL_MS || '12000', 10);

// ---------------------------------------------------------------------------
// RPC endpoint list  (highest-priority first)
// ---------------------------------------------------------------------------

const RPC_ENDPOINTS = [
  process.env.EXP_RPC_URL,                                                        // user override (highest priority)
  process.env.VITE_ALCHEMY_API_KEY
    ? `https://arb-mainnet.g.alchemy.com/v2/${process.env.VITE_ALCHEMY_API_KEY}`
    : null,
  'https://arbitrum-one-rpc.publicnode.com',
  'https://arb-pokt.nodies.app',
  'https://1rpc.io/arb',
].filter(Boolean);

// Backward-compat constant used when all probed endpoints fail
const HTTP_URL = RPC_ENDPOINTS[RPC_ENDPOINTS.length - 1];

const ARBITRUM_CHAIN_ID = 42161;
const RPC_PROBE_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

const tag = (label) => `[${label}] ${new Date().toISOString()}`;

function log(label, msg)  { console.log(`${tag(label)} ${msg}`); }
function warn(label, msg) { console.warn(`${tag(label)} WARN  ${msg}`); }
function err(label, msg)  { console.error(`${tag(label)} ERROR ${msg}`); }

// ---------------------------------------------------------------------------
// Low-level JSON-RPC helper (uses built-in fetch; Node ≥18 required)
// ---------------------------------------------------------------------------

async function rpcCall(url, method, params = [], timeoutMs = RPC_PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// findWorkingRpc  — tries each endpoint; returns first with correct chainId
// ---------------------------------------------------------------------------

async function findWorkingRpc() {
  for (const url of RPC_ENDPOINTS) {
    log('rpc', `trying ${url}`);
    try {
      const chainHex = await rpcCall(url, 'eth_chainId');
      const chainId  = parseInt(chainHex, 16);
      if (chainId !== ARBITRUM_CHAIN_ID) {
        warn('rpc', `${url} returned chainId ${chainId}, expected ${ARBITRUM_CHAIN_ID} — skipping`);
        continue;
      }
      const blockHex = await rpcCall(url, 'eth_blockNumber');
      const block    = parseInt(blockHex, 16);
      log('rpc', `connected: ${url} block=${block}`);
      return url;
    } catch (e) {
      warn('rpc', `${url} failed: ${e.message}`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Provider abstraction (thin JSON-RPC wrapper; no external deps)
// ---------------------------------------------------------------------------

function makeProvider(url) {
  return {
    url,
    async getBlockNumber() {
      const hex = await rpcCall(url, 'eth_blockNumber');
      return parseInt(hex, 16);
    },
    async getChainId() {
      const hex = await rpcCall(url, 'eth_chainId');
      return parseInt(hex, 16);
    },
    async call(tx, block = 'latest') {
      return rpcCall(url, 'eth_call', [tx, block]);
    },
    async getLogs(filter) {
      return rpcCall(url, 'eth_getLogs', [filter]);
    },
  };
}

// ---------------------------------------------------------------------------
// initRuntimeProvider  — resolves the active RPC and returns a provider
// ---------------------------------------------------------------------------

async function initRuntimeProvider() {
  if (OFFLINE_SMOKE) {
    log('provider', 'offline smoke-test mode — skipping RPC probe, using mock provider');
    return makeMockProvider();
  }

  const url = await findWorkingRpc();
  if (!url) {
    err('provider', `all ${RPC_ENDPOINTS.length} endpoints failed; falling back to ${HTTP_URL}`);
    return makeProvider(HTTP_URL);
  }
  log('provider', `runtime provider initialised → ${url}`);
  return makeProvider(url);
}

// ---------------------------------------------------------------------------
// Mock provider for offline smoke-testing
// ---------------------------------------------------------------------------

function makeMockProvider() {
  let mockBlock = 300_000_000;
  return {
    url: 'mock://offline',
    async getBlockNumber() { return ++mockBlock; },
    async getChainId()     { return ARBITRUM_CHAIN_ID; },
    async call()           { return '0x'; },
    async getLogs()        { return []; },
  };
}

// ---------------------------------------------------------------------------
// startupSanityChecks
// ---------------------------------------------------------------------------

async function startupSanityChecks(provider) {
  if (SKIP_SANITY) {
    log('sanity', 'EXP_SKIP_STARTUP_SANITY=true — bypassing startup checks');
    return true;
  }
  if (OFFLINE_SMOKE) {
    log('sanity', 'offline smoke-test — using mock sanity pass');
    return true;
  }

  log('sanity', 'running startup sanity checks …');
  try {
    const chainId = await provider.getChainId();
    if (chainId !== ARBITRUM_CHAIN_ID) {
      err('sanity', `chainId mismatch: got ${chainId}, expected ${ARBITRUM_CHAIN_ID}`);
      return false;
    }
    const block = await provider.getBlockNumber();
    if (block < 1) {
      err('sanity', `unexpected block number: ${block}`);
      return false;
    }
    log('sanity', `✓ chainId=${chainId}  block=${block}`);
    return true;
  } catch (e) {
    err('sanity', `checks threw: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lightweight arbitrage scanner (dry-run / structural skeleton)
// ---------------------------------------------------------------------------

async function runScan(provider, scanIndex) {
  const start = Date.now();

  let block;
  try {
    block = await provider.getBlockNumber();
  } catch (e) {
    warn('scan', `getBlockNumber failed on scan #${scanIndex}: ${e.message}`);
    return { ok: false, block: null, durationMs: Date.now() - start };
  }

  // Simulate pair-price evaluation (placeholder — real logic goes here)
  const mockOpportunities = OFFLINE_SMOKE
    ? [{ pair: 'WETH/USDC', priceDiff: 0.0023, netProfit: -12.5 }]
    : [];

  const durationMs = Date.now() - start;

  if (BENCH) {
    log('bench', `scan #${scanIndex}  block=${block}  pairs=${mockOpportunities.length}  ms=${durationMs}`);
  } else {
    log('scan', `#${scanIndex}  block=${block}  opportunities=${mockOpportunities.length}`);
  }

  if (!DRY_RUN && mockOpportunities.some((o) => o.netProfit > 0)) {
    log('exec', `would submit trade (live mode, not dry-run) — not yet implemented`);
  }

  return { ok: true, block, durationMs, opportunities: mockOpportunities.length };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  log('startup', `realtime-server-experimental starting`);
  log('startup', `flags: OFFLINE_SMOKE=${OFFLINE_SMOKE}  SKIP_SANITY=${SKIP_SANITY}  DRY_RUN=${DRY_RUN}  BENCH=${BENCH}  MAX_SCANS=${MAX_SCANS}`);
  log('startup', `RPC_ENDPOINTS (${RPC_ENDPOINTS.length}): ${RPC_ENDPOINTS.join(', ')}`);

  // --- provider ---
  const provider = await initRuntimeProvider();

  // --- sanity ---
  const sane = await startupSanityChecks(provider);
  if (!sane) {
    err('startup', 'sanity checks failed — aborting');
    process.exit(1);
  }

  // --- smoke-test short-circuit ---
  if (OFFLINE_SMOKE) {
    log('smoke', 'running one offline smoke scan …');
    const result = await runScan(provider, 1);
    if (!result.ok) {
      err('smoke', 'smoke scan failed');
      process.exit(1);
    }
    log('smoke', `✓ offline smoke test passed (block=${result.block} ms=${result.durationMs})`);
    process.exit(0);
  }

  // --- scan loop ---
  log('loop', `starting scan loop (interval=${SCAN_INTERVAL}ms max=${MAX_SCANS})`);
  let scanCount = 0;

  const doScan = async () => {
    scanCount++;
    await runScan(provider, scanCount);

    if (scanCount >= MAX_SCANS) {
      log('loop', `reached MAX_SCANS=${MAX_SCANS} — exiting`);
      process.exit(0);
    }

    setTimeout(doScan, SCAN_INTERVAL);
  };

  await doScan();
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
