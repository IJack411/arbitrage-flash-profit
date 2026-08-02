// Shared address-safety helpers used by live/auto execution scripts.
// Single source of truth so a placeholder can never be mistaken for a real
// deployed contract address in any live/auto code path.

const PLACEHOLDER_PATTERNS = [
  'your-',
  'replace-me',
  'changeme',
  'example',
  '0xyour',
];

// Known local/test deployment addresses that must never be used for live trading.
export const KNOWN_DEV_CONTRACT_ADDRESSES = new Set([
  '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
  '0x5fbdb2315678afecb367f032d93f642f64180aa3',
]);

export function isPlaceholder(value) {
  const lower = String(value || '').toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

// Returns a usable contract address or '' when the value is missing, a
// placeholder, malformed, or a known dev address. This is what callers should
// use instead of a raw `A || B` fallback, so a truthy placeholder can never
// shadow a real address.
export function sanitizeContractAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isPlaceholder(raw)) return '';
  if (!isEvmAddress(raw)) return '';
  if (KNOWN_DEV_CONTRACT_ADDRESSES.has(raw.toLowerCase())) return '';
  return raw;
}

// Resolve the first genuinely-valid contract address from an ordered list of
// candidates (e.g. [AUTO_CONTRACT_ADDRESS, VITE_ARBITRAGE_CONTRACT_ADDRESS]).
export function resolveContractAddress(...candidates) {
  for (const candidate of candidates) {
    const clean = sanitizeContractAddress(candidate);
    if (clean) return clean;
  }
  return '';
}

// Throws when the address is unusable for a live/auto run. Message explains
// exactly why so operators can fix the env quickly.
export function assertLiveContractAddress(value, { mode = 'live' } = {}) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error(
      `AUTO_TRADE_MODE=${mode} requires a contract address. Set AUTO_CONTRACT_ADDRESS or VITE_ARBITRAGE_CONTRACT_ADDRESS to your deployed contract.`,
    );
  }
  if (isPlaceholder(raw)) {
    throw new Error(
      `Refusing to run in ${mode} mode: contract address "${raw}" is a placeholder. Set it to your real deployed contract address.`,
    );
  }
  if (!isEvmAddress(raw)) {
    throw new Error(
      `Refusing to run in ${mode} mode: contract address "${raw}" is not a valid 0x-prefixed 40-hex EVM address.`,
    );
  }
  if (KNOWN_DEV_CONTRACT_ADDRESSES.has(raw.toLowerCase())) {
    throw new Error(
      `Refusing to run in ${mode} mode: contract address "${raw}" is a known local/test deployment address, not a production contract.`,
    );
  }
  return raw;
}
