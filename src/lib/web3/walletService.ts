import { ethers } from 'ethers';

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
}

export interface WalletInfo {
  address: string;
  balance: string;
  chainId: number;
  provider: ethers.BrowserProvider;
  signer: ethers.Signer;
}

// Standard EIP-1193 error codes
const WALLET_ERROR_CODES = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
  REQUEST_PENDING: -32002,
  CHAIN_NOT_ADDED: 4902,
};

// Helper to check if an error is from wallet extension conflicts
const isExtensionConflictError = (error: unknown): boolean => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('cannot redefine property: ethereum') ||
    lowerMessage.includes('cannot redefine property: solana') ||
    lowerMessage.includes('chrome-extension://') ||
    lowerMessage.includes('moz-extension://') ||
    lowerMessage.includes('evmask')
  );
};

// Helper to check if error is a user rejection
const isUserRejectionError = (error: unknown): boolean => {
  if (!error) return false;
  
  // Check for error code 4001 (standard EIP-1193 user rejection)
  const err = error as { code?: number; info?: { error?: { code?: number } }; message?: string };
  
  // Direct code check
  if (err?.code === WALLET_ERROR_CODES.USER_REJECTED) return true;
  
  // Nested code check (ethers.js v6 format)
  if (err?.info?.error?.code === WALLET_ERROR_CODES.USER_REJECTED) return true;
  
  // Message-based detection for ethers.js wrapped errors
  const message = err?.message || String(error);
  const lowerMessage = message.toLowerCase();
  
  return (
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied') ||
    lowerMessage.includes('rejected the request') ||
    lowerMessage.includes('user cancelled') ||
    lowerMessage.includes('user canceled') ||
    lowerMessage.includes('action="requestaccess"') && lowerMessage.includes('reason="rejected"')
  );
};

// Helper to check if request is already pending
const isRequestPendingError = (error: unknown): boolean => {
  if (!error) return false;
  
  const err = error as { code?: number; message?: string };
  
  if (err?.code === WALLET_ERROR_CODES.REQUEST_PENDING) return true;
  
  const message = err?.message || String(error);
  const lowerMessage = message.toLowerCase();
  
  return (
    lowerMessage.includes('already pending') ||
    lowerMessage.includes('request already pending') ||
    lowerMessage.includes('-32002')
  );
};

type WalletWindow = Window & typeof globalThis & {
  ethereum?: unknown;
  coinbaseWalletExtension?: unknown;
  phantom?: { ethereum?: unknown };
};

// Safe way to access injected EVM providers that handles extension conflicts
const getEthereum = (): Eip1193Provider | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  
  try {
    const walletWindow = window as WalletWindow;
    const candidates = [
      'ethereum' in walletWindow ? walletWindow.ethereum : undefined,
      'coinbaseWalletExtension' in walletWindow ? walletWindow.coinbaseWalletExtension : undefined,
      walletWindow.phantom?.ethereum,
    ];

    for (const candidate of candidates) {
      if (candidate) {
        return candidate as Eip1193Provider;
      }
    }

    return null;
  } catch (error) {
    if (!isExtensionConflictError(error)) {
      console.warn('Error accessing injected wallet provider:', error);
    }
    return null;
  }
};

const waitForInjectedProvider = async (timeoutMs = 2500): Promise<Eip1193Provider | null> => {
  const existing = getPreferredInjectedProvider();
  if (existing) return existing;

  if (typeof window === 'undefined') {
    return null;
  }

  return await new Promise((resolve) => {
    let settled = false;

    const checkForProvider = () => {
      const provider = getPreferredInjectedProvider();
      if (provider && !settled) {
        settled = true;
        cleanup();
        resolve(provider);
      }
    };

    const cleanup = () => {
      window.removeEventListener('ethereum#initialized', checkForProvider as EventListener);
      window.removeEventListener('eip6963:announceProvider', checkForProvider as EventListener);
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
    };

    window.addEventListener('ethereum#initialized', checkForProvider as EventListener);
    window.addEventListener('eip6963:announceProvider', checkForProvider as EventListener);

    try {
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    } catch {
      // Ignore environments without custom event support
    }

    const pollId = window.setInterval(checkForProvider, 150);
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(getPreferredInjectedProvider());
      }
    }, timeoutMs);

    checkForProvider();
  });
};

// In multi-wallet environments, window.ethereum may expose a providers array.
// Always pick MetaMask explicitly so only MetaMask can connect.
const getMetaMaskProvider = (): Eip1193Provider | null => {
  const ethereum = getEthereum() as Eip1193Provider | null;
  if (!ethereum) return null;

  const providers = Array.isArray(ethereum.providers) ? ethereum.providers : [];
  const metaMaskFromArray = providers.find((provider) => provider?.isMetaMask === true);
  if (metaMaskFromArray) return metaMaskFromArray;

  if (ethereum.isMetaMask === true) return ethereum;
  return null;
};

// Get the best available injected provider.
// Preference order: MetaMask -> first provider in providers[] -> window.ethereum.
const getPreferredInjectedProvider = (): Eip1193Provider | null => {
  const ethereum = getEthereum() as Eip1193Provider | null;
  if (!ethereum) return null;

  const metaMask = getMetaMaskProvider();
  if (metaMask) return metaMask;

  const providers = Array.isArray(ethereum.providers) ? ethereum.providers : [];
  if (providers.length > 0) {
    return providers[0] ?? null;
  }

  return ethereum;
};

// Check if ethereum is available without throwing
const isEthereumAvailable = (): boolean => {
  try {
    const eth = getEthereum();
    return eth !== null && eth !== undefined;
  } catch {
    return false;
  }
};

const isMetaMaskAvailable = (): boolean => {
  try {
    return getMetaMaskProvider() !== null;
  } catch {
    return false;
  }
};

const isInjectedWalletAvailable = (): boolean => {
  try {
    return getPreferredInjectedProvider() !== null;
  } catch {
    return false;
  }
};

export class WalletConnectionError extends Error {
  public readonly isUserRejection: boolean;
  public readonly isRequestPending: boolean;
  public readonly isExtensionConflict: boolean;
  public readonly originalError: unknown;
  public readonly errorCode: number | string | undefined;

  constructor(
    message: string,
    options: {
      isUserRejection?: boolean;
      isRequestPending?: boolean;
      isExtensionConflict?: boolean;
      originalError?: unknown;
      errorCode?: number | string;
    } = {}
  ) {
    super(message);
    this.name = 'WalletConnectionError';
    this.isUserRejection = options.isUserRejection || false;
    this.isRequestPending = options.isRequestPending || false;
    this.isExtensionConflict = options.isExtensionConflict || false;
    this.originalError = options.originalError;
    
    // Extract error code from original error if not provided
    if (options.errorCode !== undefined) {
      this.errorCode = options.errorCode;
    } else if (options.originalError) {
      const origErr = options.originalError as { code?: number; info?: { error?: { code?: number } } };
      this.errorCode = origErr?.code ?? origErr?.info?.error?.code;
    }
  }
}


class WalletService {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private externalProvider: Eip1193Provider | null = null;

  private async buildWalletInfo(
    provider: ethers.BrowserProvider,
    signer: ethers.Signer,
  ): Promise<WalletInfo> {
    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);
    const network = await provider.getNetwork();

    this.provider = provider;
    this.signer = signer;

    return {
      address,
      balance: ethers.formatEther(balance),
      chainId: Number(network.chainId),
      provider,
      signer,
    };
  }

  async connectMetaMask(): Promise<WalletInfo> {
    // Wait a bit for extensions to settle before trying to connect
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let ethereum = getPreferredInjectedProvider();

    if (!ethereum) {
      ethereum = await waitForInjectedProvider(2500);
    }
    
    if (!ethereum) {
      throw new WalletConnectionError(
        'No injected wallet detected. Please install/enable MetaMask, Coinbase Wallet, or another EVM wallet and retry.',
        { isUserRejection: false }
      );
    }
    
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      this.externalProvider = ethereum as Eip1193Provider;
      return this.buildWalletInfo(provider, signer);
    } catch (error: unknown) {
      // Handle extension conflict errors
      if (isExtensionConflictError(error)) {
        throw new WalletConnectionError(
          'Wallet extension conflict detected. Please try disabling some wallet extensions and refresh the page.',
          { isExtensionConflict: true, originalError: error }
        );
      }
      
      // Handle user rejection - this is NOT an error, just user choice
      if (isUserRejectionError(error)) {
        throw new WalletConnectionError(
          'Connection cancelled. You can connect your wallet anytime by clicking the connect button.',
          { isUserRejection: true, originalError: error }
        );
      }
      
      // Handle pending request
      if (isRequestPendingError(error)) {
        throw new WalletConnectionError(
          'A connection request is already pending. Please check your wallet and approve or reject the existing request.',
          { isRequestPending: true, originalError: error }
        );
      }
      
      // Re-throw with more context for other errors
      const err = error as { message?: string };
      throw new WalletConnectionError(
        `Wallet connection failed: ${err?.message || 'Unknown error'}`,
        { originalError: error }
      );
    }
  }

  async switchNetwork(chainId: number): Promise<void> {
    const provider = this.externalProvider ?? getMetaMaskProvider();

    if (!provider) {
      throw new WalletConnectionError('No Ethereum wallet detected');
    }
    
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (error: unknown) {
      // Handle extension conflict errors
      if (isExtensionConflictError(error)) {
        throw new WalletConnectionError(
          'Wallet extension conflict detected. Please try disabling some wallet extensions and refresh the page.',
          { isExtensionConflict: true, originalError: error }
        );
      }
      
      // Handle user rejection
      if (isUserRejectionError(error)) {
        throw new WalletConnectionError(
          'Network switch cancelled.',
          { isUserRejection: true, originalError: error }
        );
      }
      
      // Handle chain not added error
      const err = error as { code?: number; message?: string };
      if (err?.code === WALLET_ERROR_CODES.CHAIN_NOT_ADDED) {
        throw new WalletConnectionError(
          'This network is not configured in your wallet. Please add it manually.',
          { originalError: error }
        );
      }
      
      throw new WalletConnectionError(
        `Failed to switch network: ${err?.message || 'Unknown error'}`,
        { originalError: error }
      );
    }
  }

  async disconnect(): Promise<void> {
    this.provider = null;
    this.signer = null;
    this.externalProvider = null;
  }

  isWalletAvailable(): boolean {
    return isInjectedWalletAvailable() || isMetaMaskAvailable() || isEthereumAvailable();
  }
  getProvider() { return this.provider; }
  getSigner() { return this.signer; }
}

export const walletService = new WalletService();
