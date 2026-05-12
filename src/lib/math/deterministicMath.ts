const SCALE = 10n ** 18n;
const BPS_DENOMINATOR = 10_000n;

const TEN = 10n;

const parseDecimalStringToScaled = (raw: string): bigint => {
  const value = raw.trim();
  if (!value) return 0n;

  const sign = value.startsWith('-') ? -1n : 1n;
  const normalized = value.replace(/^[+-]/, '');
  const [wholePart, fractionPart = ''] = normalized.split('.');
  const safeWhole = wholePart === '' ? '0' : wholePart;
  const paddedFraction = (fractionPart + '0'.repeat(18)).slice(0, 18);

  const combined = `${safeWhole}${paddedFraction}`.replace(/^0+(?=\d)/, '');
  const base = combined === '' ? 0n : BigInt(combined);
  return base * sign;
};

export const toScaled = (value: number | string): bigint => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0n;
    return parseDecimalStringToScaled(value.toString());
  }
  return parseDecimalStringToScaled(value);
};

export const fromScaled = (value: bigint, decimals = 6): number => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const fraction = abs % SCALE;
  const divisor = 10n ** BigInt(18 - decimals);
  const roundedFraction = fraction / divisor;
  const asString = `${negative ? '-' : ''}${whole.toString()}.${roundedFraction.toString().padStart(decimals, '0')}`;
  return Number(asString);
};

export const mulScaled = (a: bigint, b: bigint): bigint => (a * b) / SCALE;
export const divScaled = (a: bigint, b: bigint): bigint => (a * SCALE) / (b === 0n ? 1n : b);

export const spreadBpsFromPrices = (highPrice: bigint, lowPrice: bigint): bigint => {
  if (lowPrice <= 0n || highPrice <= lowPrice) return 0n;
  return ((highPrice - lowPrice) * BPS_DENOMINATOR) / lowPrice;
};

export const applyBps = (amount: bigint, bps: bigint): bigint => {
  return (amount * bps) / BPS_DENOMINATOR;
};

export const getAmountOutV2 = (amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint => {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  if (denominator <= 0n) return 0n;
  return numerator / denominator;
};

export const getAmountInV2 = (amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint => {
  if (amountOut <= 0n || reserveIn <= 0n || reserveOut <= amountOut) return 0n;
  const numerator = reserveIn * amountOut * 1000n;
  const denominator = (reserveOut - amountOut) * 997n;
  if (denominator <= 0n) return 0n;
  return (numerator / denominator) + 1n;
};

export const slippageFractionScaled = (expectedOut: bigint, actualOut: bigint): bigint => {
  if (expectedOut <= 0n || actualOut >= expectedOut) return 0n;
  return divScaled(expectedOut - actualOut, expectedOut);
};

export const sqrtPriceX96ToPriceScaled = (sqrtPriceX96: bigint): bigint => {
  if (sqrtPriceX96 <= 0n) return 0n;
  const q96 = 2n ** 96n;
  const q192 = q96 * q96;
  const ratioX192 = sqrtPriceX96 * sqrtPriceX96;
  return (ratioX192 * SCALE) / q192;
};

export const liquidityUsageBps = (tradeSize: bigint, liquidityDepth: bigint): bigint => {
  if (tradeSize <= 0n || liquidityDepth <= 0n) return 0n;
  return (tradeSize * BPS_DENOMINATOR) / liquidityDepth;
};

export const greaterThan = (a: bigint, b: bigint): boolean => a > b;

export const ONE_SCALED = SCALE;
export const ZERO_SCALED = 0n;
export const BPS_SCALE = BPS_DENOMINATOR;
export const safeMin = (a: bigint, b: bigint): bigint => (a < b ? a : b);
export const safeMax = (a: bigint, b: bigint): bigint => (a > b ? a : b);
export const safeAbs = (a: bigint): bigint => (a < 0n ? -a : a);
export const safePow10 = (n: number): bigint => TEN ** BigInt(Math.max(0, n));
