import { expect, test } from '@playwright/test';
import {
  buildHopsFromLegacyPayload,
  deriveClosingLegMin,
  validateHopPath,
  MIN_HOPS,
  MAX_HOPS,
  type CanonicalHop,
} from '../supabase/functions/_shared/opportunity-contract';

// Phase 6: N-hop off-chain payload must match the on-chain Solidity `Hop[]`
// (router, tokenOut, isV3, fee, amountOutMin) and the Rust encoder, and its
// dry-run validator must mirror the contract invariants. Validation only —
// nothing here signs or broadcasts.

const ASSET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TOKEN_B = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
const TOKEN_C = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const ROUTER_A = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const ROUTER_B = '0xd9e1cE17f2641f24aE9d90c5c91B2DA78cED6f1a';
const ROUTER_C = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
const ZERO = '0x0000000000000000000000000000000000000000';

const threeHopPath = (): { asset: string; amount: string; hops: CanonicalHop[] } => ({
  asset: ASSET,
  amount: '1000000000',
  hops: [
    { router: ROUTER_A, tokenOut: TOKEN_B, isV3: true, fee: 500, amountOutMin: '111' },
    { router: ROUTER_B, tokenOut: TOKEN_C, isV3: false, fee: 0, amountOutMin: '222' },
    { router: ROUTER_C, tokenOut: ASSET, isV3: true, fee: 3000, amountOutMin: '333' },
  ],
});

test.describe('Phase 6 N-hop off-chain payload contract', () => {
  test('CanonicalHop exposes exactly the Solidity Hop fields in order', () => {
    const hop: CanonicalHop = {
      router: ROUTER_A,
      tokenOut: TOKEN_B,
      isV3: true,
      fee: 500,
      amountOutMin: '1',
    };
    // Field set + order must match Solidity `Hop { router, tokenOut, isV3, fee, amountOutMin }`.
    expect(Object.keys(hop)).toEqual(['router', 'tokenOut', 'isV3', 'fee', 'amountOutMin']);
  });

  test('legacy 2-hop payload maps to a 2-element Hop[] closing back to the asset', () => {
    const hops = buildHopsFromLegacyPayload({
      asset: ASSET,
      amount: '1000000000',
      routerA: ROUTER_A,
      routerB: ROUTER_B,
      tokenB: TOKEN_B,
      routerAisV3: true,
      routerBisV3: false,
      feeA: 500,
      feeB: 0,
      amountBMin: '487804878000000000000',
    });

    expect(hops).toHaveLength(2);
    expect(hops[0]).toEqual({
      router: ROUTER_A,
      tokenOut: TOKEN_B,
      isV3: true,
      fee: 500,
      amountOutMin: '487804878000000000000',
    });
    // Closing leg returns the borrowed asset.
    expect(hops[1].tokenOut).toBe(ASSET);
    expect(hops[1].router).toBe(ROUTER_B);
    expect(hops[1].isV3).toBe(false);
    // Closing leg carries a genuine positive floor (principal + Aave premium),
    // never a zero min.
    expect(BigInt(hops[1].amountOutMin) > 0n).toBe(true);
  });

  test('legacy-built payload PASSES its own validateHopPath (no self-rejecting zero min)', () => {
    const amount = '1000000000';
    const hops = buildHopsFromLegacyPayload({
      asset: ASSET,
      amount,
      routerA: ROUTER_A,
      routerB: ROUTER_B,
      tokenB: TOKEN_B,
      routerAisV3: true,
      routerBisV3: false,
      feeA: 500,
      feeB: 0,
      amountBMin: '487804878000000000000',
    });
    // Regression pin: the legacy builder must produce a payload its OWN module
    // validator accepts (closing-leg min > 0, loop closes to asset).
    expect(validateHopPath({ asset: ASSET, amount, hops })).toEqual({ ok: true });
  });

  test('deriveClosingLegMin floors at principal + Aave premium (>0)', () => {
    const min = deriveClosingLegMin('1000000000');
    // 1_000_000_000 * (10_000 + 5) / 10_000, rounded up = 1_000_500_000.
    expect(min).toBe('1000500000');
    expect(BigInt(min) > BigInt('1000000000')).toBe(true);
    expect(deriveClosingLegMin('0')).toBe('0');
  });

  test('validateHopPath accepts a well-formed 3-hop route', () => {
    expect(validateHopPath(threeHopPath())).toEqual({ ok: true });
  });

  test('validateHopPath rejects a path that does not close to the asset', () => {
    const path = threeHopPath();
    path.hops[path.hops.length - 1].tokenOut = TOKEN_C; // != asset
    const result = validateHopPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('path does not close'))).toBe(true);
    }
  });

  test('validateHopPath rejects hop count below MIN_HOPS', () => {
    const path = threeHopPath();
    path.hops = [path.hops[0]]; // 1 hop, and no longer closes
    const result = validateHopPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes(`expected [${MIN_HOPS},${MAX_HOPS}]`))).toBe(true);
    }
  });

  test('validateHopPath rejects hop count above MAX_HOPS', () => {
    const path = threeHopPath();
    const filler: CanonicalHop = { router: ROUTER_A, tokenOut: TOKEN_B, isV3: true, fee: 500, amountOutMin: '1' };
    while (path.hops.length <= MAX_HOPS) path.hops.unshift({ ...filler });
    const result = validateHopPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('bad path length'))).toBe(true);
    }
  });

  test('validateHopPath rejects a missing per-hop amountOutMin', () => {
    const path = threeHopPath();
    path.hops[1].amountOutMin = '0';
    const result = validateHopPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('hop 1: missing per-hop amountOutMin'))).toBe(true);
    }
  });

  test('validateHopPath rejects zero router / tokenOut and zero amount', () => {
    const path = threeHopPath();
    path.amount = '0';
    path.hops[0].router = ZERO;
    path.hops[0].tokenOut = ZERO;
    const result = validateHopPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('zero borrow amount');
      expect(result.errors).toContain('hop 0: zero router');
      expect(result.errors).toContain('hop 0: zero tokenOut');
    }
  });
});
