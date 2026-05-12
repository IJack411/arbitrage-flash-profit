#!/usr/bin/env node

/**
 * Phase 2A: Latency & Data Freshness Benchmarking Harness
 * 
 * Runs three parallel benchmarking suites:
 * - Part A: Subgraph query latency (indexing lag)
 * - Part B: API response time benchmarking
 * - Part C: Order-book depth & staleness testing
 * 
 * Usage: node phase-2a-latency-benchmark.mjs [--part A|B|C|all] [--network arbitrum|ethereum]
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ARBITRUM_RPC = process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc';
const ETHEREUM_RPC = process.env.ETHEREUM_RPC || 'https://eth.rpc.blxrbdn.com';
const RESULTS_DIR = './benchmark-results';

// Ensure results directory exists (cross-platform)
mkdirSync(RESULTS_DIR, { recursive: true });

const LOG = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`),
};

// ============================================================================
// PART A: SUBGRAPH QUERY LATENCY TESTING
// ============================================================================

const SUBGRAPH_ENDPOINTS = {
  arbitrum: {
    'Uniswap V3': 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
    'SushiSwap': 'https://api.thegraph.com/subgraphs/name/sushiswap/arbitrum-exchange',
    'Curve': 'https://api.thegraph.com/subgraphs/name/convex-community/curve-arbitrum',
  },
  ethereum: {
    'Uniswap V3': 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
    'SushiSwap': 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange',
    'Curve': 'https://api.thegraph.com/subgraphs/name/curve-community/curve-ethereum',
  }
};

/**
 * Query a subgraph endpoint and measure response latency
 */
async function testSubgraphLatency(name, endpoint, query) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      timeout: 10000,
    });
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    if (!response.ok) {
      LOG.warn(`${name} returned status ${response.status}`);
      return { success: false, latency, statusCode: response.status, error: response.statusText };
    }
    
    const data = await response.json();
    
    if (data.errors) {
      LOG.warn(`${name} GraphQL error: ${data.errors[0]?.message}`);
      return { success: false, latency, error: data.errors[0]?.message };
    }
    
    return { success: true, latency, dataSize: JSON.stringify(data).length };
  } catch (error) {
    const endTime = Date.now();
    return { success: false, latency: endTime - startTime, error: error.message };
  }
}

/**
 * Run subgraph latency benchmarks
 */
async function runSubgraphBenchmarks(network = 'arbitrum') {
  LOG.info(`Starting Subgraph Latency Benchmarks (${network})`);
  
  const results = {
    benchmark_run: new Date().toISOString(),
    network,
    endpoints: {},
  };
  
  // Simple query to test indexing lag
  const query = `{
    pools(first: 5, orderBy: volumeUSD, orderDirection: desc) {
      id
      volumeUSD
      txCount
      createdAtTimestamp
    }
  }`;
  
  const endpoints = SUBGRAPH_ENDPOINTS[network];
  
  for (const [dex, endpoint] of Object.entries(endpoints)) {
    LOG.info(`Testing ${dex}...`);
    results.endpoints[dex] = { samples: [] };
    
    // Run 10 test queries per DEX
    for (let i = 0; i < 10; i++) {
      const result = await testSubgraphLatency(dex, endpoint, query);
      results.endpoints[dex].samples.push({
        test_id: i + 1,
        ...result,
        timestamp: new Date().toISOString(),
      });
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Calculate summary stats
    const samples = results.endpoints[dex].samples;
    const responseLatencies = samples
      .filter(s => typeof s.statusCode === 'number')
      .map(s => s.latency);
    const successLatencies = samples
      .filter(s => s.success)
      .map(s => s.latency);
    const networkFailures = samples.filter(s => !s.success && typeof s.statusCode !== 'number').length;
    const httpFailures = samples.filter(s => !s.success && typeof s.statusCode === 'number').length;
    const latencies = responseLatencies.length > 0 ? responseLatencies : successLatencies;
    
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      results.endpoints[dex].summary = {
        total_samples: samples.length,
        successful_samples: successLatencies.length,
        response_samples: responseLatencies.length,
        network_failures: networkFailures,
        http_failures: httpFailures,
        error_rate_percent: ((samples.length - successLatencies.length) / samples.length * 100).toFixed(2),
        mean_latency_ms: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        p50_latency_ms: latencies[Math.floor(latencies.length * 0.5)],
        p95_latency_ms: latencies[Math.floor(latencies.length * 0.95)],
        p99_latency_ms: latencies[Math.floor(latencies.length * 0.99)],
        min_latency_ms: latencies[0],
        max_latency_ms: latencies[latencies.length - 1],
      };
      
      LOG.info(`${dex} - Mean: ${results.endpoints[dex].summary.mean_latency_ms}ms, P95: ${results.endpoints[dex].summary.p95_latency_ms}ms`);
    }
  }
  
  const resultsFile = join(RESULTS_DIR, `subgraph-latency-${network}-${Date.now()}.json`);
  writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  LOG.info(`Subgraph latency results saved to ${resultsFile}`);
  
  return results;
}

// ============================================================================
// PART B: API RESPONSE TIME BENCHMARKING
// ============================================================================

const SCANNER_APIS = {
  '1inch': {
    endpoint: 'https://api.1inch.io/v5/42161/quote',
    params: {
      fromTokenAddress: '0x82af49447d8a07e3bd95bd0d56f313302c4033da', // WETH
      toTokenAddress: '0xFF970A61A04b1Ca14834A43f5dE4533eBDDB5CC8', // USDC.e (Arbitrum)
      amount: '1000000000000000000', // 1 WETH
      slippage: 1,
    },
    method: 'GET',
  },
  'CoW Swap': {
    endpoint: 'https://api.cow.fi/mainnet/api/v1/quote',
    params: {
      sellToken: '0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2',
      buyToken: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      from: '0x0000000000000000000000000000000000000001',
      receiver: '0x0000000000000000000000000000000000000001',
      sellAmountBeforeFee: '10000000000000000',
      kind: 'sell',
      appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    },
    method: 'POST',
  },
  'Uniswap v3': {
    endpoint: 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
    query: `{
      swaps(first: 1, orderBy: timestamp, orderDirection: desc) {
        id
        amount0
        amount1
        sqrtPriceX96
      }
    }`,
    method: 'SUBGRAPH',
  },
  'Osmosis': {
    endpoint: 'https://lcd.osmosis.zone',
    path: '/osmosis/gamm/v1beta1/pools',
    method: 'GET',
  },
};

/**
 * Benchmark API response time for a single request
 */
async function testAPILatency(scannerName, config) {
  const startTime = Date.now();
  
  try {
    let response;
    
    if (config.method === 'GET') {
      const url = new URL(config.endpoint);
      if (config.path) {
        url.pathname = `${url.pathname.replace(/\/$/, '')}${config.path.startsWith('/') ? config.path : `/${config.path}`}`;
      }
      Object.entries(config.params || {}).forEach(([k, v]) => {
        url.searchParams.append(k, v);
      });
      response = await fetch(url.toString(), { timeout: 15000 });
    } else if (config.method === 'POST') {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.params || {}),
        timeout: 15000,
      });
    } else if (config.method === 'SUBGRAPH') {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: config.query }),
        timeout: 15000,
      });
    }
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    if (!response.ok) {
      return {
        success: false,
        latency,
        statusCode: response.status,
        error: response.statusText,
      };
    }
    
    return {
      success: true,
      latency,
      statusCode: response.status,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      success: false,
      latency: endTime - startTime,
      error: error.message,
    };
  }
}

/**
 * Run API response time benchmarks
 */
async function runAPIBenchmarks() {
  LOG.info('Starting API Response Time Benchmarks');
  
  const results = {
    benchmark_run: new Date().toISOString(),
    scanners: {},
  };
  
  for (const [scannerName, config] of Object.entries(SCANNER_APIS)) {
    LOG.info(`Benchmarking ${scannerName}...`);
    results.scanners[scannerName] = { samples: [] };
    
    // Run 20 requests per scanner (reduced from 100 for initial phase)
    const requestCount = 20;
    for (let i = 0; i < requestCount; i++) {
      const result = await testAPILatency(scannerName, config);
      results.scanners[scannerName].samples.push({
        test_id: i + 1,
        ...result,
        timestamp: new Date().toISOString(),
      });
      
      // Delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Calculate summary stats
    const samples = results.scanners[scannerName].samples;
    const responseLatencies = samples
      .filter(s => typeof s.statusCode === 'number')
      .map(s => s.latency);
    const successLatencies = samples
      .filter(s => s.success)
      .map(s => s.latency);
    const networkFailures = samples.filter(s => !s.success && typeof s.statusCode !== 'number').length;
    const httpFailures = samples.filter(s => !s.success && typeof s.statusCode === 'number').length;
    const latencies = responseLatencies.length > 0 ? responseLatencies : successLatencies;
    
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      results.scanners[scannerName].summary = {
        total_samples: samples.length,
        successful_samples: successLatencies.length,
        response_samples: responseLatencies.length,
        network_failures: networkFailures,
        http_failures: httpFailures,
        error_rate_percent: ((requestCount - successLatencies.length) / requestCount * 100).toFixed(2),
        mean_latency_ms: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        p50_latency_ms: latencies[Math.floor(latencies.length * 0.5)],
        p95_latency_ms: latencies[Math.floor(latencies.length * 0.95)],
        p99_latency_ms: latencies[Math.floor(latencies.length * 0.99)],
        min_latency_ms: latencies[0],
        max_latency_ms: latencies[latencies.length - 1],
      };
      
      LOG.info(`${scannerName} - Mean: ${results.scanners[scannerName].summary.mean_latency_ms}ms, P95: ${results.scanners[scannerName].summary.p95_latency_ms}ms`);
    }
  }
  
  const resultsFile = join(RESULTS_DIR, `api-latency-${Date.now()}.json`);
  writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  LOG.info(`API latency results saved to ${resultsFile}`);
  
  return results;
}

// ============================================================================
// PART C: ORDER-BOOK DEPTH & STALENESS TESTING
// ============================================================================

/**
 * Placeholder for Part C implementation
 * In full implementation, this would query live Uniswap V3 ticks
 * and compare against scanner prices to estimate data age
 */
async function runStalenessBenchmarks() {
  LOG.info('Starting Staleness Benchmarks (placeholder)');
  LOG.warn('Part C implementation requires smart contract interaction - Phase 2B will handle this');
  
  return {
    benchmark_run: new Date().toISOString(),
    status: 'deferred_to_phase_2b',
    note: 'Order-book staleness testing requires contract interaction with fee/slippage modeling',
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let part = 'all';
  let network = 'arbitrum';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--part') part = args[i + 1];
    if (args[i] === '--network') network = args[i + 1];
  }
  
  LOG.info('='.repeat(70));
  LOG.info('Phase 2A: Latency & Data Freshness Benchmarking');
  LOG.info(`Network: ${network}, Part: ${part}`);
  LOG.info('='.repeat(70));
  
  try {
    if (part === 'all' || part === 'A') {
      await runSubgraphBenchmarks(network);
    }
    
    if (part === 'all' || part === 'B') {
      await runAPIBenchmarks();
    }
    
    if (part === 'all' || part === 'C') {
      await runStalenessBenchmarks();
    }
    
    LOG.info('='.repeat(70));
    LOG.info('Benchmarking complete! Results saved to ./benchmark-results/');
    LOG.info('='.repeat(70));
  } catch (error) {
    LOG.error(`Benchmarking failed: ${error.message}`);
    process.exit(1);
  }
}

main();
