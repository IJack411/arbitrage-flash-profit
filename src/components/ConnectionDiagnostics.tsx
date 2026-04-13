import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw, 
  Database, 
  Wifi, 
  Server,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Globe,
  Network,
  Activity,
  RotateCcw,
  Clock,
  TrendingUp
} from 'lucide-react';
import { supabase, isSupabaseConfigured, getConfigStatus, checkConnection } from '@/lib/supabase';

interface ConnectionTest {
  name: string;
  status: 'pending' | 'testing' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
  latency?: number;
}

interface NetworkConfig {
  id: string;
  name: string;
  symbol: string;
  color: string;
  rpcUrl: string;
  explorer: string;
  icon: string;
}

interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  nextRetryIn?: number;
  errors: string[];
}

interface NetworkTestResult {
  networkId: string;
  status: 'pending' | 'testing' | 'success' | 'error' | 'retrying';
  blockNumber?: number;
  latency?: number;
  error?: string;
  retryInfo?: RetryInfo;
}

interface AlchemyRpcResponse {
  result?: string;
  error?: {
    message?: string;
  };
}

const NETWORKS: NetworkConfig[] = [
  {
    id: 'ethereum',
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    color: '#627EEA',
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
    explorer: 'https://etherscan.io',
    icon: '⟠'
  },
  {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    color: '#8247E5',
    rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/',
    explorer: 'https://polygonscan.com',
    icon: '⬡'
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum One',
    symbol: 'ARB',
    color: '#28A0F0',
    rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/',
    explorer: 'https://arbiscan.io',
    icon: '◈'
  },
  {
    id: 'optimism',
    name: 'Optimism',
    symbol: 'OP',
    color: '#FF0420',
    rpcUrl: 'https://opt-mainnet.g.alchemy.com/v2/',
    explorer: 'https://optimistic.etherscan.io',
    icon: '◎'
  },
  {
    id: 'base',
    name: 'Base',
    symbol: 'BASE',
    color: '#0052FF',
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/',
    explorer: 'https://basescan.org',
    icon: '◉'
  }
];

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY = 1000; // 1 second

// Calculate exponential backoff delay
const getRetryDelay = (attempt: number): number => {
  return BASE_RETRY_DELAY * Math.pow(2, attempt); // 1s, 2s, 4s
};

const NETWORK_ICON_CLASSES: Record<string, string> = {
  ethereum: 'bg-[#627EEA]/20 text-[#627EEA]',
  polygon: 'bg-[#8247E5]/20 text-[#8247E5]',
  arbitrum: 'bg-[#28A0F0]/20 text-[#28A0F0]',
  optimism: 'bg-[#FF0420]/20 text-[#FF0420]',
  base: 'bg-[#0052FF]/20 text-[#0052FF]',
};

export const ConnectionDiagnostics: React.FC = () => {
  const [tests, setTests] = useState<ConnectionTest[]>([
    { name: 'Supabase Configuration', status: 'pending', message: 'Waiting to test...' },
    { name: 'Supabase Connection', status: 'pending', message: 'Waiting to test...' },
    { name: 'Alchemy API Key', status: 'pending', message: 'Waiting to test...' },
  ]);
  
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>(['ethereum', 'polygon', 'arbitrum']);
  const [networkResults, setNetworkResults] = useState<NetworkTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [retryCountdowns, setRetryCountdowns] = useState<Record<string, number>>({});
  const countdownIntervals = useRef<Record<string, NodeJS.Timeout>>({});

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error occurred';
  };

  const updateTest = (name: string, update: Partial<ConnectionTest>) => {
    setTests(prev => prev.map(t => t.name === name ? { ...t, ...update } : t));
  };

  const updateNetworkResult = (networkId: string, update: Partial<NetworkTestResult>) => {
    setNetworkResults(prev => {
      const existing = prev.find(r => r.networkId === networkId);
      if (existing) {
        return prev.map(r => r.networkId === networkId ? { ...r, ...update } : r);
      }
      return [...prev, { networkId, status: 'pending', ...update }];
    });
  };

  const toggleNetwork = (networkId: string) => {
    setSelectedNetworks(prev => 
      prev.includes(networkId) 
        ? prev.filter(id => id !== networkId)
        : [...prev, networkId]
    );
  };

  const selectAllNetworks = () => {
    setSelectedNetworks(NETWORKS.map(n => n.id));
  };

  const deselectAllNetworks = () => {
    setSelectedNetworks([]);
  };

  // Start countdown timer for retry
  const startRetryCountdown = (networkId: string, delay: number) => {
    // Clear any existing countdown
    if (countdownIntervals.current[networkId]) {
      clearInterval(countdownIntervals.current[networkId]);
    }

    let remaining = Math.ceil(delay / 1000);
    setRetryCountdowns(prev => ({ ...prev, [networkId]: remaining }));

    countdownIntervals.current[networkId] = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownIntervals.current[networkId]);
        setRetryCountdowns(prev => {
          const updated = { ...prev };
          delete updated[networkId];
          return updated;
        });
      } else {
        setRetryCountdowns(prev => ({ ...prev, [networkId]: remaining }));
      }
    }, 1000);
  };

  // Cleanup countdown intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(countdownIntervals.current).forEach(clearInterval);
    };
  }, []);

  const testSupabaseConfig = async (): Promise<boolean> => {
    updateTest('Supabase Configuration', { status: 'testing', message: 'Checking configuration...' });
    
    const configStatus = getConfigStatus();
    
    if (!configStatus.configured) {
      const issues: string[] = [];
      if (!configStatus.url) issues.push('Invalid or missing VITE_SUPABASE_URL');
      if (!configStatus.key) issues.push('Invalid or missing VITE_SUPABASE_ANON_KEY');
      
      updateTest('Supabase Configuration', { 
        status: 'error', 
        message: 'Configuration missing or invalid',
        details: issues.join(', ')
      });
      return false;
    }
    
    updateTest('Supabase Configuration', { 
      status: 'success', 
      message: 'Configuration valid',
      details: 'URL and API key are properly formatted'
    });
    return true;
  };

  const testSupabaseConnection = async (): Promise<boolean> => {
    updateTest('Supabase Connection', { status: 'testing', message: 'Testing connection...' });
    
    if (!isSupabaseConfigured()) {
      updateTest('Supabase Connection', { 
        status: 'warning', 
        message: 'Skipped - configuration required first',
        details: 'Fix configuration issues before testing connection'
      });
      return false;
    }
    
    const startTime = Date.now();
    
    try {
      const isConnected = await checkConnection();
      const latency = Date.now() - startTime;
      
      if (isConnected) {
        updateTest('Supabase Connection', { 
          status: 'success', 
          message: 'Connected successfully',
          details: `Response time: ${latency}ms`,
          latency
        });
        return true;
      } else {
        updateTest('Supabase Connection', { 
          status: 'error', 
          message: 'Connection failed',
          details: 'Could not reach Supabase. Check your project URL and API key.',
          latency
        });
        return false;
      }
    } catch (error: unknown) {
      updateTest('Supabase Connection', { 
        status: 'error', 
        message: 'Connection error',
        details: getErrorMessage(error)
      });
      return false;
    }
  };

  const testAlchemyConfig = async (): Promise<boolean> => {
    updateTest('Alchemy API Key', { status: 'testing', message: 'Checking API key...' });
    
    const alchemyKey = import.meta.env.VITE_ALCHEMY_API_KEY || '';
    
    if (!alchemyKey || alchemyKey === 'your-alchemy-api-key-here') {
      updateTest('Alchemy API Key', { 
        status: 'error', 
        message: 'API key not configured',
        details: 'Add VITE_ALCHEMY_API_KEY to your .env file'
      });
      return false;
    }
    
    if (alchemyKey.length < 20) {
      updateTest('Alchemy API Key', { 
        status: 'error', 
        message: 'API key appears invalid',
        details: 'Key is too short. Get your key from dashboard.alchemy.com'
      });
      return false;
    }
    
    updateTest('Alchemy API Key', { 
      status: 'success', 
      message: 'API key configured',
      details: `Key: ${alchemyKey.slice(0, 6)}...${alchemyKey.slice(-4)}`
    });
    return true;
  };

  // Single network test attempt
  const attemptNetworkTest = async (network: NetworkConfig): Promise<{ success: boolean; blockNumber?: number; latency?: number; error?: string }> => {
    const alchemyKey = import.meta.env.VITE_ALCHEMY_API_KEY || '';
    
    if (!alchemyKey || alchemyKey === 'your-alchemy-api-key-here') {
      return { success: false, error: 'API key not configured' };
    }
    
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${network.rpcUrl}${alchemyKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: []
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      const data = (await response.json()) as AlchemyRpcResponse;
      
      if (data.error) {
        return { 
          success: false, 
          latency, 
          error: data.error.message || 'RPC error returned' 
        };
      }
      
      if (data.result) {
        const blockNumber = parseInt(data.result, 16);
        return { success: true, blockNumber, latency };
      }
      
      return { success: false, latency, error: 'No block number in response' };
      
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      const errorMessageRaw = getErrorMessage(error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, latency, error: 'Request timed out (10s)' };
      }
      
      // Provide more detailed error messages
      let errorMessage = errorMessageRaw || 'Network error';
      if (errorMessageRaw.includes('Failed to fetch')) {
        errorMessage = 'Network unreachable - check internet connection';
      } else if (errorMessageRaw.includes('NetworkError')) {
        errorMessage = 'Network error - possible CORS or connectivity issue';
      }
      
      return { success: false, latency, error: errorMessage };
    }
  };

  // Network test with auto-retry and exponential backoff
  const testNetworkConnection = async (network: NetworkConfig): Promise<void> => {
    const errors: string[] = [];
    
    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      // Update status based on attempt
      if (attempt === 0) {
        updateNetworkResult(network.id, { 
          status: 'testing',
          retryInfo: { attempt: 0, maxAttempts: MAX_RETRY_ATTEMPTS, errors: [] }
        });
      } else {
        updateNetworkResult(network.id, { 
          status: 'retrying',
          retryInfo: { 
            attempt, 
            maxAttempts: MAX_RETRY_ATTEMPTS, 
            errors: [...errors]
          }
        });
      }
      
      const result = await attemptNetworkTest(network);
      
      if (result.success) {
        // Success! Clear any countdown and update result
        if (countdownIntervals.current[network.id]) {
          clearInterval(countdownIntervals.current[network.id]);
        }
        setRetryCountdowns(prev => {
          const updated = { ...prev };
          delete updated[network.id];
          return updated;
        });
        
        updateNetworkResult(network.id, { 
          status: 'success',
          blockNumber: result.blockNumber,
          latency: result.latency,
          error: undefined,
          retryInfo: attempt > 0 ? { 
            attempt, 
            maxAttempts: MAX_RETRY_ATTEMPTS, 
            errors 
          } : undefined
        });
        return;
      }
      
      // Failed - record error
      errors.push(`Attempt ${attempt + 1}: ${result.error}`);
      
      // If we have more retries, wait with exponential backoff
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = getRetryDelay(attempt);
        
        updateNetworkResult(network.id, { 
          status: 'retrying',
          latency: result.latency,
          retryInfo: { 
            attempt: attempt + 1, 
            maxAttempts: MAX_RETRY_ATTEMPTS, 
            nextRetryIn: delay,
            errors: [...errors]
          }
        });
        
        // Start countdown timer
        startRetryCountdown(network.id, delay);
        
        // Wait for the delay
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // All retries exhausted
        updateNetworkResult(network.id, { 
          status: 'error',
          latency: result.latency,
          error: result.error,
          retryInfo: { 
            attempt: MAX_RETRY_ATTEMPTS, 
            maxAttempts: MAX_RETRY_ATTEMPTS, 
            errors 
          }
        });
      }
    }
  };

  // Manual retry for a single network
  const retryNetwork = async (networkId: string) => {
    const network = NETWORKS.find(n => n.id === networkId);
    if (network) {
      await testNetworkConnection(network);
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    
    // Clear all countdown intervals
    Object.values(countdownIntervals.current).forEach(clearInterval);
    countdownIntervals.current = {};
    setRetryCountdowns({});
    
    // Reset all tests
    setTests(prev => prev.map(t => ({ ...t, status: 'pending', message: 'Waiting to test...' })));
    setNetworkResults([]);
    
    // Run Supabase tests
    await testSupabaseConfig();
    await new Promise(r => setTimeout(r, 300));
    
    await testSupabaseConnection();
    await new Promise(r => setTimeout(r, 300));
    
    // Run Alchemy config test
    const alchemyConfigured = await testAlchemyConfig();
    await new Promise(r => setTimeout(r, 300));
    
    // Run network tests if Alchemy is configured
    if (alchemyConfigured && selectedNetworks.length > 0) {
      // Test networks in parallel
      const networkPromises = selectedNetworks.map(networkId => {
        const network = NETWORKS.find(n => n.id === networkId);
        if (network) {
          return testNetworkConnection(network);
        }
        return Promise.resolve();
      });
      
      await Promise.all(networkPromises);
    }
    
    setIsRunning(false);
  };

  const runAllTestsRef = useRef(runAllTests);
  runAllTestsRef.current = runAllTests;

  useEffect(() => {
    void runAllTestsRef.current();
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const getStatusIcon = (status: ConnectionTest['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
      case 'testing':
        return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-600" />;
    }
  };

  const getStatusBg = (status: ConnectionTest['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/10 border-green-500/30';
      case 'error':
        return 'bg-red-500/10 border-red-500/30';
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/30';
      case 'testing':
        return 'bg-blue-500/10 border-blue-500/30';
      default:
        return 'bg-gray-800 border-gray-700';
    }
  };

  const allBasePassed = tests.every(t => t.status === 'success');
  const allNetworksPassed = selectedNetworks.length > 0 && 
    selectedNetworks.every(id => networkResults.find(r => r.networkId === id)?.status === 'success');
  const allPassed = allBasePassed && allNetworksPassed;
  const hasErrors = tests.some(t => t.status === 'error') || 
    networkResults.some(r => r.status === 'error');
  const hasRetrying = networkResults.some(r => r.status === 'retrying');

  const getNetworkResult = (networkId: string) => {
    return networkResults.find(r => r.networkId === networkId);
  };

  // Get retry statistics
  const getRetryStats = () => {
    const resultsWithRetries = networkResults.filter(r => r.retryInfo && r.retryInfo.attempt > 0);
    const successAfterRetry = resultsWithRetries.filter(r => r.status === 'success').length;
    const failedAfterRetry = resultsWithRetries.filter(r => r.status === 'error').length;
    return { successAfterRetry, failedAfterRetry, total: resultsWithRetries.length };
  };

  const retryStats = getRetryStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${allPassed ? 'bg-green-500/20' : hasErrors ? 'bg-red-500/20' : hasRetrying ? 'bg-orange-500/20' : 'bg-blue-500/20'}`}>
              <Wifi className={`h-6 w-6 ${allPassed ? 'text-green-400' : hasErrors ? 'text-red-400' : hasRetrying ? 'text-orange-400' : 'text-blue-400'}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Connection Diagnostics</h2>
              <p className="text-gray-400 text-sm">Verify your API connections across multiple networks</p>
            </div>
          </div>
          <button
            onClick={runAllTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-[#00F0FF] hover:bg-[#00D0E0] disabled:bg-gray-700 text-gray-900 disabled:text-gray-400 font-medium rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Testing...' : 'Run Tests'}
          </button>
        </div>

        {/* Overall Status */}
        <div className={`p-4 rounded-lg ${allPassed ? 'bg-green-500/10 border border-green-500/30' : hasErrors ? 'bg-red-500/10 border border-red-500/30' : hasRetrying ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-gray-700/50 border border-gray-600'}`}>
          <div className="flex items-center gap-2">
            {allPassed ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-green-400 font-medium">All connections verified successfully!</span>
              </>
            ) : hasRetrying ? (
              <>
                <RotateCcw className="h-5 w-5 text-orange-400 animate-spin" />
                <span className="text-orange-400 font-medium">Retrying failed connections with exponential backoff...</span>
              </>
            ) : hasErrors ? (
              <>
                <XCircle className="h-5 w-5 text-red-400" />
                <span className="text-red-400 font-medium">Some connections failed after {MAX_RETRY_ATTEMPTS} retries. See details below.</span>
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                <span className="text-blue-400 font-medium">Running connection tests...</span>
              </>
            )}
          </div>
        </div>

        {/* Retry Info Banner */}
        {(hasRetrying || retryStats.total > 0) && (
          <div className="mt-4 p-3 bg-gray-900 rounded-lg border border-gray-700">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-orange-400" />
                <span className="text-gray-400">Auto-Retry:</span>
              </div>
              <span className="text-gray-300">
                Up to {MAX_RETRY_ATTEMPTS} attempts with exponential backoff (1s → 2s → 4s)
              </span>
              {retryStats.total > 0 && (
                <div className="flex items-center gap-3 ml-auto">
                  {retryStats.successAfterRetry > 0 && (
                    <span className="text-green-400">
                      {retryStats.successAfterRetry} recovered
                    </span>
                  )}
                  {retryStats.failedAfterRetry > 0 && (
                    <span className="text-red-400">
                      {retryStats.failedAfterRetry} failed
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Base Test Results */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-[#00F0FF]" />
          Core Services
        </h3>
        <div className="grid gap-3">
          {tests.map((test) => (
            <div
              key={test.name}
              className={`border rounded-lg p-4 transition-all ${getStatusBg(test.status)}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getStatusIcon(test.status)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-medium">{test.name}</h4>
                    {test.latency && (
                      <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                        {test.latency}ms
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-1 ${
                    test.status === 'success' ? 'text-green-400' :
                    test.status === 'error' ? 'text-red-400' :
                    test.status === 'warning' ? 'text-yellow-400' :
                    'text-gray-400'
                  }`}>
                    {test.message}
                  </p>
                  {test.details && (
                    <p className="text-gray-500 text-sm mt-1">{test.details}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Network Selection */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-[#00F0FF]" />
            Network Selection
          </h3>
          <div className="flex gap-2">
            <button
              onClick={selectAllNetworks}
              className="text-xs text-[#00F0FF] hover:text-[#00D0E0] transition-colors"
            >
              Select All
            </button>
            <span className="text-gray-600">|</span>
            <button
              onClick={deselectAllNetworks}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {NETWORKS.map((network) => {
            const isSelected = selectedNetworks.includes(network.id);
            return (
              <button
                key={network.id}
                onClick={() => toggleNetwork(network.id)}
                className={`p-3 rounded-lg border transition-all ${
                  isSelected 
                    ? 'border-[#00F0FF] bg-[#00F0FF]/10' 
                    : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${NETWORK_ICON_CLASSES[network.id] ?? 'bg-gray-700 text-gray-300'}`}
                  >
                    {network.icon}
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                      {network.symbol}
                    </p>
                    <p className="text-xs text-gray-500 truncate max-w-[80px]">
                      {network.name}
                    </p>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-2 flex justify-end">
                    <CheckCircle className="h-4 w-4 text-[#00F0FF]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        
        <p className="text-gray-500 text-xs mt-3">
          Select the networks you want to test. All networks use your Alchemy API key.
        </p>
      </div>

      {/* Network Test Results */}
      {selectedNetworks.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#00F0FF]" />
            Network Connection Results
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Network</th>
                  <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Status</th>
                  <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Block Number</th>
                  <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Latency</th>
                  <th className="text-center text-gray-400 text-sm font-medium py-3 px-4">Retry</th>
                  <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedNetworks.map((networkId) => {
                  const network = NETWORKS.find(n => n.id === networkId);
                  const result = getNetworkResult(networkId);
                  const countdown = retryCountdowns[networkId];
                  
                  if (!network) return null;
                  
                  return (
                    <React.Fragment key={networkId}>
                      <tr className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div 
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${NETWORK_ICON_CLASSES[network.id] ?? 'bg-gray-700 text-gray-300'}`}
                            >
                              {network.icon}
                            </div>
                            <div>
                              <p className="text-white font-medium">{network.name}</p>
                              <p className="text-gray-500 text-xs">{network.symbol}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {!result || result.status === 'pending' ? (
                            <span className="flex items-center gap-2 text-gray-400">
                              <div className="h-4 w-4 rounded-full border-2 border-gray-600" />
                              Pending
                            </span>
                          ) : result.status === 'testing' ? (
                            <span className="flex items-center gap-2 text-blue-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Testing...
                            </span>
                          ) : result.status === 'retrying' ? (
                            <span className="flex items-center gap-2 text-orange-400">
                              <RotateCcw className="h-4 w-4 animate-spin" />
                              <span>
                                Retry {result.retryInfo?.attempt}/{result.retryInfo?.maxAttempts}
                                {countdown && (
                                  <span className="ml-1 text-xs">
                                    (in {countdown}s)
                                  </span>
                                )}
                              </span>
                            </span>
                          ) : result.status === 'success' ? (
                            <span className="flex items-center gap-2 text-green-400">
                              <CheckCircle className="h-4 w-4" />
                              <span>
                                Connected
                                {result.retryInfo && result.retryInfo.attempt > 0 && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    (after {result.retryInfo.attempt} {result.retryInfo.attempt === 1 ? 'retry' : 'retries'})
                                  </span>
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-red-400">
                              <XCircle className="h-4 w-4" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {result?.blockNumber ? (
                            <span className="text-white font-mono">
                              {result.blockNumber.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {result?.latency ? (
                            <span className={`font-mono ${
                              result.latency < 200 ? 'text-green-400' :
                              result.latency < 500 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {result.latency}ms
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {result?.retryInfo ? (
                            <div className="flex items-center justify-center gap-1">
                              {Array.from({ length: result.retryInfo.maxAttempts }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-2 h-2 rounded-full ${
                                    i < result.retryInfo!.attempt
                                      ? result.status === 'success'
                                        ? 'bg-green-400'
                                        : result.status === 'error'
                                        ? 'bg-red-400'
                                        : 'bg-orange-400'
                                      : 'bg-gray-600'
                                  }`}
                                  title={`Attempt ${i + 1}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {result?.status === 'error' && (
                              <button
                                onClick={() => retryNetwork(networkId)}
                                disabled={isRunning}
                                className="text-[#00F0FF] hover:text-[#00D0E0] disabled:text-gray-600 p-1 rounded transition-colors"
                                title="Retry this network"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                            <a
                              href={network.explorer}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open ${network.name} explorer`}
                              className="text-[#00F0FF] hover:text-[#00D0E0] inline-flex items-center gap-1"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </td>
                      </tr>
                      {/* Error details row */}
                      {result?.status === 'error' && result.retryInfo && result.retryInfo.errors.length > 0 && (
                        <tr className="bg-red-500/5">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="text-sm">
                              <p className="text-red-400 font-medium mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Connection failed after {result.retryInfo.maxAttempts} retry attempts
                              </p>
                              <div className="space-y-1 ml-6">
                                {result.retryInfo.errors.map((error, idx) => (
                                  <p key={idx} className="text-gray-400 text-xs font-mono">
                                    {error}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Latency Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-700">
            <span className="text-gray-500 text-xs">Latency:</span>
            <span className="flex items-center gap-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span className="text-gray-400">&lt;200ms (Fast)</span>
            </span>
            <span className="flex items-center gap-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
              <span className="text-gray-400">200-500ms (Normal)</span>
            </span>
            <span className="flex items-center gap-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
              <span className="text-gray-400">&gt;500ms (Slow)</span>
            </span>
          </div>
        </div>
      )}

      {/* Network Stats Summary */}
      {networkResults.length > 0 && networkResults.some(r => r.status === 'success') && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-gray-400 text-sm">Networks Tested</p>
            <p className="text-2xl font-bold text-white mt-1">
              {networkResults.filter(r => r.status === 'success').length}/{selectedNetworks.length}
            </p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-gray-400 text-sm">Avg Latency</p>
            <p className="text-2xl font-bold text-white mt-1">
              {Math.round(
                networkResults
                  .filter(r => r.latency)
                  .reduce((sum, r) => sum + (r.latency || 0), 0) / 
                networkResults.filter(r => r.latency).length || 0
              )}ms
            </p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-gray-400 text-sm">Fastest Network</p>
            <p className="text-2xl font-bold text-white mt-1">
              {(() => {
                const fastest = networkResults
                  .filter(r => r.latency && r.status === 'success')
                  .sort((a, b) => (a.latency || 0) - (b.latency || 0))[0];
                if (fastest) {
                  const network = NETWORKS.find(n => n.id === fastest.networkId);
                  return network?.symbol || '-';
                }
                return '-';
              })()}
            </p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-gray-400 text-sm flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Recovered
            </p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {retryStats.successAfterRetry}
            </p>
          </div>
        </div>
      )}

      {/* Quick Reference */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-[#00F0FF]" />
          Quick Reference
        </h3>
        
        <div className="space-y-4">
          {/* Supabase */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-green-400" />
                <span className="text-white font-medium">Supabase</span>
              </div>
              <a 
                href="https://supabase.com/dashboard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#00F0FF] hover:underline text-sm flex items-center gap-1"
              >
                Dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                <code className="text-gray-400">VITE_SUPABASE_URL</code>
                <button
                  onClick={() => copyToClipboard('VITE_SUPABASE_URL=', 'url')}
                  className="text-gray-500 hover:text-white"
                >
                  {copied === 'url' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                <code className="text-gray-400">VITE_SUPABASE_ANON_KEY</code>
                <button
                  onClick={() => copyToClipboard('VITE_SUPABASE_ANON_KEY=', 'key')}
                  className="text-gray-500 hover:text-white"
                >
                  {copied === 'key' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Find these in: Project Settings → API
            </p>
          </div>

          {/* Alchemy */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />
                <span className="text-white font-medium">Alchemy</span>
              </div>
              <a 
                href="https://dashboard.alchemy.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#00F0FF] hover:underline text-sm flex items-center gap-1"
              >
                Dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                <code className="text-gray-400">VITE_ALCHEMY_API_KEY</code>
                <button
                  onClick={() => copyToClipboard('VITE_ALCHEMY_API_KEY=', 'alchemy')}
                  className="text-gray-500 hover:text-white"
                >
                  {copied === 'alchemy' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              One API key works across all supported networks (Ethereum, Polygon, Arbitrum, Optimism, Base)
            </p>
          </div>

          {/* Retry Mechanism Info */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="h-4 w-4 text-orange-400" />
              <span className="text-white font-medium">Auto-Retry Mechanism</span>
            </div>
            <div className="text-sm text-gray-400 space-y-2">
              <p>Failed network tests are automatically retried with exponential backoff:</p>
              <div className="flex items-center gap-4 bg-gray-800 rounded px-3 py-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span>1st retry: 1 second</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span>2nd retry: 2 seconds</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span>3rd retry: 4 seconds</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Each failed attempt is logged with detailed error messages for troubleshooting.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Troubleshooting Tips */}
      {hasErrors && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            Troubleshooting Tips
          </h3>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">1.</span>
              <p>Make sure you've created a <code className="bg-gray-900 px-1 rounded">.env</code> file in your project root (copy from <code className="bg-gray-900 px-1 rounded">.env.example</code>)</p>
            </div>
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">2.</span>
              <p>Verify your API keys are correct - no extra spaces or quotes</p>
            </div>
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">3.</span>
              <p>After updating <code className="bg-gray-900 px-1 rounded">.env</code>, restart your development server (<code className="bg-gray-900 px-1 rounded">npm run dev</code>)</p>
            </div>
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">4.</span>
              <p>For Supabase, ensure your project is active (not paused due to inactivity)</p>
            </div>
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">5.</span>
              <p>For Alchemy, your API key should work on all networks. If a specific network fails, it may be a rate limit or network-specific issue.</p>
            </div>
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">6.</span>
              <p>High latency (&gt;500ms) may indicate network congestion or geographic distance from the RPC server.</p>
            </div>
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">7.</span>
              <p><strong className="text-orange-400">Persistent failures:</strong> Check the detailed error log for each attempt. Common issues include rate limiting, invalid API keys, or network-specific outages.</p>
            </div>
            <div className="flex items-start gap-3 text-gray-400">
              <span className="text-[#00F0FF] font-bold">8.</span>
              <p><strong className="text-orange-400">Timeout errors:</strong> If you see "Request timed out", the RPC endpoint may be overloaded. Try again later or check Alchemy's status page.</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {allPassed && (
        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-white mb-2">All Systems Operational!</h3>
          <p className="text-gray-400">
            Your Supabase and Alchemy connections are working perfectly across all selected networks. 
            You're ready to start using the Flash Arbitrage Bot.
          </p>
          {retryStats.successAfterRetry > 0 && (
            <p className="text-green-400 text-sm mt-2">
              {retryStats.successAfterRetry} network{retryStats.successAfterRetry > 1 ? 's' : ''} recovered after retry attempts.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
