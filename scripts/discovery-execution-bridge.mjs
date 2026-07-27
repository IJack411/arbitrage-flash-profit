// Discovery -> Execution bridge.
//
// Closes the "two disconnected scanners" gap. The Supabase discovery path finds
// candidates (CanonicalExecutionPayload) but never re-quotes them execution-grade
// on-chain or hands them to the executor. This module does exactly that, in-process:
//
//   discovered candidate
//     -> re-quote BOTH hops on-chain (execution-grade, real Quoter / V2 router)
//     -> gate: realtime verification (re-quote succeeded & not a stale mirage)
//              + net profit >= floor + slippage bound + venue allowlist
//     -> build REAL executeArbitrage calldata (ethers Interface, real ABI)
//     -> dry-run: log a full simulated submission (never sends)
//
// Safety: this module NEVER broadcasts a transaction. It returns a ready-to-submit
// request that the executor would send. A synthetic-quote path (for the dry-run
// demo) is hard-refused whenever any live flag is on.

import { ethers } from 'ethers';
import {
  AAVE_PREMIUM_BPS,
  QUOTER_ABI,
  V2_ROUTER_ABI,
  FLASH_LOAN_ABI,
  UNIV3_QUOTER,
  ROUTERS,
  LIVE_EXEC_VENUE_ALLOWLIST,
  decimalsForAddress,
} from './lib/arb-constants.mjs';
import { assertLiveContractAddress, sanitizeContractAddress } from './lib/address-safety.mjs';

const flashLoanInterface = new ethers.Interface(FLASH_LOAN_ABI);

// Re-quote a single hop on-chain using the same venues the live contract uses.
async function quoteHopOnChain(provider, { tokenIn, tokenOut, isV3, fee, router }, amountIn) {
  if (isV3) {
    const quoter = new ethers.Contract(UNIV3_QUOTER, QUOTER_ABI, provider);
    return quoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, fee, amountIn, 0);
  }
  const r = new ethers.Contract(router, V2_ROUTER_ABI, provider);
  const amounts = await r.getAmountsOut(amountIn, [tokenIn, tokenOut]);
  return amounts[1];
}

// Execution-grade re-quote of the full 2-hop round trip described by the payload.
// quoteFn is injectable ONLY for the dry-run demo; default is the real on-chain path.
export async function reQuoteOnChain(payload, { provider, quoteFn } = {}) {
  const asset = payload.asset;
  const tokenB = payload.tokenB;
  const amountIn = BigInt(payload.amount);

  const hopA = {
    tokenIn: asset, tokenOut: tokenB,
    isV3: !!payload.routerAisV3, fee: Number(payload.feeA) || 0, router: payload.routerA,
  };
  const hopB = {
    tokenIn: tokenB, tokenOut: asset,
    isV3: !!payload.routerBisV3, fee: Number(payload.feeB) || 0, router: payload.routerB,
  };

  const doQuote = quoteFn
    ? (hop, amt) => quoteFn(hop, amt)
    : (hop, amt) => quoteHopOnChain(provider, hop, amt);

  const step1Out = BigInt(await doQuote(hopA, amountIn));
  const finalOut = BigInt(await doQuote(hopB, step1Out));

  const premium = (amountIn * AAVE_PREMIUM_BPS) / 10000n;
  const owed = amountIn + premium;
  const grossProfitBase = finalOut - owed; // in asset base units (can be negative)

  const assetDecimals = decimalsForAddress(asset);
  const grossProfitTokens = Number(ethers.formatUnits(grossProfitBase, assetDecimals));

  return { step1Out, finalOut, premium, owed, grossProfitBase, grossProfitTokens, assetDecimals };
}

// Apply the execution gates. Returns { pass, reasons, netProfitUsd, amountBMin }.
export function gateCandidate(payload, requote, opts = {}) {
  const minProfitUsd = Number(opts.minProfitUsd ?? 0.25);
  const maxSlippageBps = Number(opts.maxSlippageBps ?? 65);
  // Max allowed drift between the discovery-predicted net and the on-chain net,
  // as a fraction of the predicted net. Beyond this, the candidate is a stale
  // mirage (this is the "realtime verification" gate).
  const maxDriftPct = Number(opts.maxDriftPct ?? 0.5);

  const reasons = [];

  // Venue allowlist (defense-in-depth).
  const routerAok = payload.routerAisV3 || LIVE_EXEC_VENUE_ALLOWLIST.has(payload.routerA);
  const routerBok = payload.routerBisV3 || LIVE_EXEC_VENUE_ALLOWLIST.has(payload.routerB);
  if (!routerAok || !routerBok) reasons.push('venue_not_allowlisted');

  const quoteUsdPrice = Number(payload.quote?.quoteTokenUsdPrice ?? 1);
  const gasUsd = Number(opts.gasUsd ?? payload.estimatedGasCost ?? 0);
  const grossUsd = requote.grossProfitTokens * quoteUsdPrice;
  const netProfitUsd = grossUsd - gasUsd;

  // Realtime verification: on-chain net must not fall far short of what discovery
  // predicted. A big positive prediction that re-quotes negative is a stale mirage.
  const predicted = Number(payload.predictedNetProfit ?? 0);
  if (predicted > 0) {
    const drift = (predicted - netProfitUsd) / predicted; // >0 means on-chain is worse
    if (drift > maxDriftPct) reasons.push('watchlist_realtime_verification_blocked');
  }

  if (netProfitUsd < minProfitUsd) reasons.push('watchlist_net_profit_below_threshold');

  const slippageBps = Number(payload.estimatedSlippageBps ?? 0);
  if (slippageBps > maxSlippageBps) reasons.push('slippage_above_max');

  // amountBMin: prefer the payload's canonical value; else derive from the fresh
  // on-chain step-1 output with a 1.5% floor.
  let amountBMin;
  if (payload.amountBMin && BigInt(payload.amountBMin) > 0n) {
    amountBMin = BigInt(payload.amountBMin);
  } else {
    amountBMin = (requote.step1Out * 985n) / 1000n;
  }

  return { pass: reasons.length === 0, reasons, netProfitUsd, grossUsd, gasUsd, amountBMin };
}

// Build the REAL executeArbitrage calldata (same ABI the deployed contract exposes).
export function buildExecuteArbitrageCalldata(payload, amountBMin) {
  const args = [
    payload.asset,
    BigInt(payload.amount),
    payload.routerA,
    payload.routerB,
    payload.tokenB,
    !!payload.routerAisV3,
    !!payload.routerBisV3,
    Number(payload.feeA) || 0,
    Number(payload.feeB) || 0,
    BigInt(amountBMin),
  ];
  return flashLoanInterface.encodeFunctionData('executeArbitrage', args);
}

// Orchestrate the full bridge for one discovered candidate.
//
// Returns a structured result. In dry-run it logs a full simulated submission and
// returns { submitted:false, dryRun:true, txRequest, ... }. It NEVER broadcasts.
export async function bridgeCandidate(payload, {
  provider,
  quoteFn = null,          // inject ONLY for the synthetic dry-run demo
  contractAddress,
  walletAddress = null,
  liveTradingEnabled = false,
  allowLiveTrading = false,
  gasLimit = 800000n,
  logger = console,
  ...gateOpts
} = {}) {
  const live = !!(liveTradingEnabled || allowLiveTrading);

  // HARD SAFETY: a synthetic/injected quote source must never run in a live context.
  if (quoteFn && live) {
    throw new Error('[bridge] refusing synthetic quote path while live trading flags are enabled');
  }

  // Resolve + validate the contract address (reuses the placeholder-safe helper).
  const cleanContract = sanitizeContractAddress(contractAddress);
  if (live) {
    assertLiveContractAddress(contractAddress, { mode: 'live' });
  }

  const tag = `${payload.network || 'arbitrum'} ${payload.tokenPair || `${payload.asset}->${payload.tokenB}`} ${payload.buyDex || ''}->${payload.sellDex || ''}`;

  // 1) Execution-grade on-chain re-quote.
  let requote;
  try {
    requote = await reQuoteOnChain(payload, { provider, quoteFn });
  } catch (err) {
    logger.warn(`[bridge] re-quote failed for ${tag}: ${err?.message || err}`);
    return { ok: false, stage: 're-quote', reason: 'requote_failed', error: String(err?.message || err) };
  }

  // 2) Gate.
  const gate = gateCandidate(payload, requote, gateOpts);
  logger.log(
    `[bridge] ${tag} | on-chain net=$${gate.netProfitUsd.toFixed(4)} ` +
    `(predicted=$${Number(payload.predictedNetProfit ?? 0).toFixed(4)}) ` +
    `gross=$${gate.grossUsd.toFixed(4)} gas=$${gate.gasUsd.toFixed(4)} ` +
    `gate=${gate.pass ? 'PASS' : 'BLOCKED[' + gate.reasons.join(',') + ']'}`,
  );
  if (!gate.pass) {
    return { ok: true, passed: false, stage: 'gate', reasons: gate.reasons, netProfitUsd: gate.netProfitUsd, requote };
  }

  // 3) Build REAL calldata.
  const calldata = buildExecuteArbitrageCalldata(payload, gate.amountBMin);
  const txRequest = {
    to: cleanContract || contractAddress,
    from: walletAddress || undefined,
    data: calldata,
    gasLimit,
    chainId: 42161,
  };

  // 4) Submit (dry-run: simulate + log; live: caller/executor is responsible).
  if (!live) {
    logger.log(
      `[bridge][dry-run] SIMULATED SUBMISSION ${tag}\n` +
      `  to        : ${txRequest.to}\n` +
      `  from      : ${txRequest.from || '(unset)'}\n` +
      `  fn        : executeArbitrage(asset,amount,routerA,routerB,tokenB,aV3,bV3,feeA,feeB,amountBMin)\n` +
      `  amount    : ${payload.amount}\n` +
      `  amountBMin: ${gate.amountBMin.toString()}\n` +
      `  calldata  : ${calldata.slice(0, 42)}... (${(calldata.length - 2) / 2} bytes)\n` +
      `  expectNet : $${gate.netProfitUsd.toFixed(4)}\n` +
      `  gasLimit  : ${gasLimit.toString()}\n` +
      `  >> DRY-RUN: not broadcast.`,
    );
    return { ok: true, passed: true, submitted: false, dryRun: true, txRequest, netProfitUsd: gate.netProfitUsd, amountBMin: gate.amountBMin.toString(), requote };
  }

  // Live path intentionally does NOT broadcast here — the executor owns signing +
  // simulation + submission. The bridge returns the verified, ready-to-submit request.
  return { ok: true, passed: true, submitted: false, dryRun: false, readyForExecutor: true, txRequest, netProfitUsd: gate.netProfitUsd, amountBMin: gate.amountBMin.toString(), requote };
}

export const _internals = { quoteHopOnChain, flashLoanInterface, ROUTERS };
