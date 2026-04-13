interface EthereumProvider {
  request?: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  [key: string]: unknown;
}

interface Window {
  ethereum?: EthereumProvider;
  webkitAudioContext?: typeof AudioContext;
}
