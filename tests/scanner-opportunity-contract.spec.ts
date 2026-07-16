import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  ALERT_REASON_CODES,
  OPPORTUNITY_REASON_CODES,
  buildRouteKey,
  classifySimulationGate,
  createDeterministicCandidateId,
  deriveAmountBMinFromQuote,
  evaluateReadinessGateDecision,
  evaluateSourceQualityPenalty,
  validateOpportunityParity,
} from '../supabase/functions/_shared/opportunity-contract';

test.describe('scanner opportunity contract hardening', () => {
  test('derives deterministic minOut from route quote in token units', () => {
    const amountBMin = deriveAmountBMinFromQuote({
      loanAmountUsd: 1000,
      quoteTokenUsdPrice: 1,
      buyPrice: 2,
      estimatedSlippageBps: 50,
      tokenBDecimals: 18,
    });

    expect(amountBMin.toString()).toBe('487804878000000000000');
  });

  test('rejects stale or parity-mismatched execution opportunities at boundary', () => {
    const quoteTimestamp = new Date().toISOString();
    const routeKey = buildRouteKey('ethereum', 'ethereum:LINK/USDC', 'Uniswap V3', 'SushiSwap');
    const candidateId = createDeterministicCandidateId('scan-run-1', routeKey, 'active');
    const amountBMin = deriveAmountBMinFromQuote({
      loanAmountUsd: 1000,
      quoteTokenUsdPrice: 1,
      buyPrice: 2,
      estimatedSlippageBps: 50,
      tokenBDecimals: 18,
    }).toString();

    const baseOpportunity = {
      tokenPair: 'ethereum:LINK/USDC',
      buyDex: 'Uniswap V3',
      sellDex: 'SushiSwap',
      network: 'ethereum',
      loanAmount: 1000,
      executableLoanAmount: 1000,
      grossProfit: 25,
      netProfit: 15,
      distanceToExecutableUsd: 0,
      gasCost: 10,
      confidenceScore: 81,
      confidenceTier: 'high',
      spread: '0.42',
      liquidity: '250000',
      estimatedSlippageBps: 50,
      buyImpactBps: 20,
      sellImpactBps: 20,
      routePenaltyBps: 10,
      status: 'active',
      quoteSources: ['subgraph', 'dexscreener'],
      scanRunId: 'scan-run-1',
      candidateId,
      quoteTimestamp,
      dataSource: 'multi-source',
      reasonCode: OPPORTUNITY_REASON_CODES.activeExecutionReady,
      executionPayload: {
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '1000000000',
        routerA: '0x1111111111111111111111111111111111111111',
        routerB: '0x2222222222222222222222222222222222222222',
        tokenB: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        routerAisV3: true,
        routerBisV3: false,
        feeA: 500,
        feeB: 0,
        amountBMin,
        tokenPair: 'ethereum:LINK/USDC',
        buyDex: 'Uniswap V3',
        sellDex: 'SushiSwap',
        network: 'ethereum',
        predictedGrossProfit: 25,
        predictedNetProfit: 15,
        estimatedGasCost: 10,
        estimatedSlippageBps: 50,
        scanTimestamp: quoteTimestamp,
        confidenceScore: 81,
        quote: {
          version: 'scanner-opportunity-v1',
          routeKey,
          quoteTimestamp,
          quoteTokenUsdPrice: 1,
          buyPrice: 2,
          expectedBuyTokenAmount: '500000000000000000000',
          amountBMin,
          tokenBDecimals: 18,
          slippageBps: 50,
          sourceQualityBps: 9200,
          persistenceCount: 2,
          minRequiredPersistence: 2,
          sourceFlags: {
            hasSubgraph: true,
            fallbackOnly: false,
            sameFallbackSource: false,
          },
        },
      },
    } as const;

    expect(validateOpportunityParity(baseOpportunity, { maxQuoteAgeMs: 90_000 }).ok).toBe(true);

    const stale = {
      ...baseOpportunity,
      quoteTimestamp: new Date(Date.now() - 120_000).toISOString(),
      executionPayload: {
        ...baseOpportunity.executionPayload,
        quote: {
          ...baseOpportunity.executionPayload.quote,
          quoteTimestamp: new Date(Date.now() - 120_000).toISOString(),
        },
      },
    };
    const staleResult = validateOpportunityParity(stale, { maxQuoteAgeMs: 90_000 });
    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) {
      expect(staleResult.errors).toContain(OPPORTUNITY_REASON_CODES.executionQuoteStale);
    }

    const mismatched = {
      ...baseOpportunity,
      executionPayload: {
        ...baseOpportunity.executionPayload,
        amountBMin: '1',
        quote: {
          ...baseOpportunity.executionPayload.quote,
          amountBMin: '1',
        },
      },
    };
    const mismatchResult = validateOpportunityParity(mismatched, { maxQuoteAgeMs: 90_000 });
    expect(mismatchResult.ok).toBe(false);
    if (!mismatchResult.ok) {
      expect(mismatchResult.errors).toContain(OPPORTUNITY_REASON_CODES.executionParityMismatch);
    }
  });

  test('penalizes low-quality fallback-only sources in ranking inputs', () => {
    const highQualityPenalty = evaluateSourceQualityPenalty({
      sourceQualityBps: 9500,
      fallbackOnly: false,
      sameFallbackSource: false,
      persistenceCount: 3,
      minRequiredPersistence: 2,
    });
    const lowQualityPenalty = evaluateSourceQualityPenalty({
      sourceQualityBps: 7100,
      fallbackOnly: true,
      sameFallbackSource: true,
      persistenceCount: 1,
      minRequiredPersistence: 3,
    });

    expect(highQualityPenalty).toBe(0);
    expect(lowQualityPenalty).toBeGreaterThan(25);
  });

  test('classifies readiness gates and simulation rejections deterministically', () => {
    expect(evaluateReadinessGateDecision({
      hasGraphKey: true,
      healthySources: 4,
      minHealthySources: 3,
      fallbackSources: 1,
      maxFallbackSources: 2,
    }).pass).toBe(true);

    expect(evaluateReadinessGateDecision({
      hasGraphKey: false,
      healthySources: 4,
      minHealthySources: 3,
      fallbackSources: 1,
      maxFallbackSources: 2,
    }).pass).toBe(false);

    expect(classifySimulationGate({ firstRevert: { error: 'slippage' } })).toEqual({
      reject: true,
      reason: 'simulation_reverted',
      detail: 'Transaction reverted: {"error":"slippage"}',
    });
    expect(classifySimulationGate({})).toEqual({
      reject: false,
      reason: 'simulation_ok',
      detail: null,
    });
  });

  test('alert watch loop includes machine-readable reason codes for every alert class', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/opportunity-alert-watch-loop.mjs');
    const script = fs.readFileSync(scriptPath, 'utf8');

    for (const reasonCode of Object.values(ALERT_REASON_CODES)) {
      expect(script).toContain(reasonCode);
    }
    expect(script).toContain('reason_code=');
  });
});
