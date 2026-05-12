import { expect, test } from '@playwright/test';
import {
  applyBps,
  BPS_SCALE,
  fromScaled,
  getAmountInV2,
  getAmountOutV2,
  liquidityUsageBps,
  ONE_SCALED,
  slippageFractionScaled,
  spreadBpsFromPrices,
  sqrtPriceX96ToPriceScaled,
  toScaled,
} from '../src/lib/math/deterministicMath';

test.describe('deterministic math', () => {
  test('scaled roundtrip stays deterministic', () => {
    const value = toScaled('1234.567891');
    expect(fromScaled(value, 6)).toBe(1234.567891);
  });

  test('spread bps from prices is exact integer arithmetic', () => {
    const low = toScaled('100');
    const high = toScaled('103.5');
    const spreadBps = spreadBpsFromPrices(high, low);
    expect(spreadBps).toBe(350n);
  });

  test('applyBps computes deterministic haircut', () => {
    const amount = toScaled('1000');
    const haircut = applyBps(amount, 25n);
    expect(fromScaled(haircut, 6)).toBe(2.5);
  });

  test('uniswap v2 amount out and in are internally consistent', () => {
    const reserveIn = 1_000_000_000n;
    const reserveOut = 2_000_000_000n;
    const amountIn = 100_000n;

    const amountOut = getAmountOutV2(amountIn, reserveIn, reserveOut);
    const amountInBack = getAmountInV2(amountOut, reserveIn, reserveOut);

    expect(amountOut).toBeGreaterThan(0n);
    expect(amountInBack).toBeGreaterThanOrEqual(amountIn);
    expect(amountInBack - amountIn).toBeLessThanOrEqual(2n);
  });

  test('slippage fraction is deterministic and monotonic', () => {
    const expectedOut = toScaled('1000');
    const actualOut = toScaled('992.5');
    const slippage = slippageFractionScaled(expectedOut, actualOut);

    expect(fromScaled(slippage, 6)).toBe(0.0075);
  });

  test('sqrtPriceX96 conversion returns 1.0 price at Q96', () => {
    const q96 = 2n ** 96n;
    const price = sqrtPriceX96ToPriceScaled(q96);
    expect(price).toBe(ONE_SCALED);
  });

  test('liquidity usage bps is bounded for sensible trades', () => {
    const tradeSize = toScaled('2500');
    const liquidityDepth = toScaled('50000');
    const usageBps = liquidityUsageBps(tradeSize, liquidityDepth);

    expect(usageBps).toBe(500n);
    expect(usageBps).toBeLessThan(BPS_SCALE);
  });
});