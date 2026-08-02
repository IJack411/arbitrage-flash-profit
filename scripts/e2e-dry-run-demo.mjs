// End-to-end DRY-RUN demonstration of the full arbitrage pipeline.
//
//   discovery candidate  ->  on-chain re-quote (execution-grade)
//                        ->  gates (realtime verification / net / slippage / venue)
//                        ->  REAL executeArbitrage calldata
//                        ->  simulated (dry-run) submission   [NEVER broadcast]
//
// Two paths:
//   1. REAL candidate  — a genuine USDC/WETH round trip re-quoted on-chain right now.
//                        Usually BLOCKED (no live-consistent positive edge on majors);
//                        this proves the honest, correct behaviour.
//   2. SYNTHETIC demo  — a clearly-labelled DRY_RUN_DEMO candidate with injected quotes
//                        so the pipeline fires end-to-end (gate PASS -> calldata ->
//                        simulated submit). Exercises the REAL gate + REAL ABI encoding;
//                        only the quote numbers are synthetic. Enabled with
//                        DRY_RUN_DEMO=true and HARD-REFUSED if any live flag is on.
//
// Usage:
//   node scripts/e2e-dry-run-demo.mjs                 # real candidate only
//   DRY_RUN_DEMO=true node scripts/e2e-dry-run-demo.mjs   # real + synthetic

import { ethers } from 'ethers';
import { bridgeCandidate } from './discovery-execution-bridge.mjs';
import { ROUTERS } from './lib/arb-constants.mjs';
import { sanitizeContractAddress } from './lib/address-safety.mjs';

const RPCS = [
  process.env.EXP_RPC_URL,
  process.env.VITE_ALCHEMY_API_KEY ? `https://arb-mainnet.g.alchemy.com/v2/${process.env.VITE_ALCHEMY_API_KEY}` : null,
  'https://arb-pokt.nodies.app',
  'https://arbitrum-one-rpc.publicnode.com',
  'https://1rpc.io/arb',
].filter(Boolean);

const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

const CONTRACT = sanitizeContractAddress(
  process.env.EXP_CONTRACT_ADDRESS
  || process.env.AUTO_CONTRACT_ADDRESS
  || process.env.VITE_ARBITRAGE_CONTRACT_ADDRESS,
) || '0x1aF90750615653db3b800f960aDAA79Ce2A25963';

const WALLET = process.env.AUTO_WALLET_ADDRESS || null;

// Live-flag detection — must all be off for any dry-run / synthetic path.
const liveFlags = {
  allowLive: String(process.env.EXP_ALLOW_LIVE_TRADING || '').toLowerCase() === 'true',
  expLive: String(process.env.EXP_LIVE_TRADING || '').toLowerCase() === 'true',
  autoLive: String(process.env.AUTO_TRADE_MODE || '').toLowerCase() === 'live',
};
const anyLive = liveFlags.allowLive || liveFlags.expLive || liveFlags.autoLive;

async function connectProvider() {
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 42161, { staticNetwork: true });
      const n = await p.getBlockNumber();
      console.log(`[demo] connected RPC ${url} (block ${n})`);
      return p;
    } catch (e) {
      console.warn(`[demo] RPC ${url} failed: ${String(e.message || e).slice(0, 80)}`);
    }
  }
  throw new Error('no responding RPC');
}

function banner(t) {
  console.log(`\n${'='.repeat(64)}\n${t}\n${'='.repeat(64)}`);
}

async function main() {
  banner('E2E DRY-RUN DEMO — full pipeline, live flags OFF');
  console.log(`[demo] contract=${CONTRACT} wallet=${WALLET || '(unset)'} anyLiveFlag=${anyLive}`);
  if (anyLive) {
    console.error('[demo] ABORT: a live flag is set. This demo runs only with live trading OFF.');
    process.exit(2);
  }

  const provider = await connectProvider();

  // A realistic discovery candidate: USDC->WETH->USDC, $20k loan, both Uni v3 0.05%.
  const realCandidate = {
    asset: USDC,
    amount: (20000n * 10n ** 6n).toString(),
    routerA: ROUTERS.UNIV3, routerB: ROUTERS.UNIV3,
    tokenB: WETH,
    routerAisV3: true, routerBisV3: true,
    feeA: 500, feeB: 500,
    amountBMin: '0',
    tokenPair: 'USDC/WETH', buyDex: 'uniswapv3', sellDex: 'uniswapv3', network: 'arbitrum',
    estimatedGasCost: 0.25, estimatedSlippageBps: 20,
    predictedNetProfit: 0, // discovery-neutral; on-chain truth decides
    quote: { quoteTokenUsdPrice: 1 },
  };

  banner('PATH 1 — REAL candidate, re-quoted on-chain NOW (honest result)');
  const realResult = await bridgeCandidate(realCandidate, {
    provider,
    contractAddress: CONTRACT,
    walletAddress: WALLET,
    minProfitUsd: 0.25,
    gasUsd: 0.25,
    maxSlippageBps: 65,
  });
  console.log('[demo] PATH 1 result:', JSON.stringify({
    passed: realResult.passed, reasons: realResult.reasons,
    netProfitUsd: realResult.netProfitUsd, submitted: realResult.submitted,
  }, null, 0));

  if (!process.env.DRY_RUN_DEMO) {
    banner('DONE (set DRY_RUN_DEMO=true to also run the synthetic wired-machine demo)');
    return;
  }

  banner('PATH 2 — SYNTHETIC DRY_RUN_DEMO candidate (proves machine is fully wired)');
  console.log('[demo] NOTE: quote numbers are synthetic; gate + calldata + submit path are REAL.');
  // Deterministic profitable quotes: hop A -> 3 WETH, hop B -> more USDC than owed.
  const step1 = 3n * 10n ** 18n;
  const finalUSDC = 20050n * 10n ** 6n; // owed is 20010e6 (20000 + 5bps), so +~$40 gross
  const syntheticQuote = (hop, _amt) =>
    (hop.tokenOut.toLowerCase() === WETH.toLowerCase() ? step1 : finalUSDC);

  const synthCandidate = { ...realCandidate, predictedNetProfit: 34, estimatedGasCost: 5 };
  const synthResult = await bridgeCandidate(synthCandidate, {
    provider,
    quoteFn: syntheticQuote,          // synthetic quotes; bridge refuses this if live
    contractAddress: CONTRACT,
    walletAddress: WALLET,
    minProfitUsd: 0.25,
    gasUsd: 5,
    maxSlippageBps: 65,
  });
  console.log('[demo] PATH 2 result:', JSON.stringify({
    passed: synthResult.passed, submitted: synthResult.submitted, dryRun: synthResult.dryRun,
    netProfitUsd: synthResult.netProfitUsd,
    calldataBytes: synthResult.txRequest ? (synthResult.txRequest.data.length - 2) / 2 : 0,
  }, null, 0));

  if (!synthResult.passed || synthResult.submitted !== false) {
    throw new Error('synthetic demo did not complete as expected');
  }
  banner('DONE — pipeline fired end-to-end in DRY-RUN. Nothing was broadcast.');
}

main().catch((err) => {
  console.error(`[demo] fatal: ${err?.message || err}`);
  process.exit(1);
});
