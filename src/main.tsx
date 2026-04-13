import React, { StrictMode, Component, ReactNode, ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './components/theme-provider'
import { AppProvider } from './contexts/AppContext'
import { Web3Provider } from './contexts/Web3Context'
import { AuthProvider } from './contexts/AuthContext'
import { MultiWalletProvider } from './contexts/MultiWalletContext'
import App from './App.tsx'
import './index.css'

// Wallet extension error detection - uses global helper if available
const isWalletExtensionError = (input: unknown): boolean => {
  // Use global helper from index.html if available
  const globalHelper = (window as unknown as { __isWalletExtensionError?: (input: unknown) => boolean }).__isWalletExtensionError;
  if (globalHelper) {
    try {
      return globalHelper(input);
    } catch {
      // Fall through to local implementation
    }
  }
  
  if (!input) return false;
  
  let str = '';
  if (typeof input === 'string') {
    str = input;
  } else if (input instanceof Error) {
    str = (input.message || '') + ' ' + (input.stack || '');
  } else if (typeof input === 'object' && input !== null) {
    const obj = input as { message?: string; stack?: string; reason?: unknown };
    str = (obj.message || '') + ' ' + (obj.stack || '');
    if (obj.reason) {
      str += ' ' + String(obj.reason);
    }
    try { str += ' ' + JSON.stringify(input); } catch { /* ignore */ }
  }
  
  const lower = str.toLowerCase();
  
  const patterns = [
    'cannot redefine property: ethereum',
    'cannot redefine property: solana',
    'cannot redefine property: phantom',
    'evmask',
    'inpage.js',
    'contentscript',
    'content-script'
  ];
  
  for (const pattern of patterns) {
    if (lower.includes(pattern)) {
      return true;
    }
  }
  
  // Check for extension URLs with wallet-related content
  if (lower.includes('chrome-extension://') || lower.includes('moz-extension://')) {
    if (lower.includes('ethereum') || lower.includes('wallet') || 
        lower.includes('provider') || lower.includes('redefine') ||
        lower.includes('solana') || lower.includes('phantom') ||
        lower.includes('defineproperty')) {
      return true;
    }
  }
  
  return false;
};

// Suppress extension errors at React level
if (typeof window !== 'undefined') {
  // Store originals
  const _originalConsoleError = console.error;
  const _originalConsoleWarn = console.warn;
  
  // Override console.error
  console.error = (...args: unknown[]) => {
    for (const arg of args) {
      if (isWalletExtensionError(arg)) {
        return; // Suppress entirely
      }
    }
    _originalConsoleError.apply(console, args);
  };
  
  // Override console.warn
  console.warn = (...args: unknown[]) => {
    for (const arg of args) {
      if (isWalletExtensionError(arg)) {
        return;
      }
    }
    _originalConsoleWarn.apply(console, args);
  };

  // Global error handler
  const existingOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (isWalletExtensionError(message) || isWalletExtensionError(error) || isWalletExtensionError(source)) {
      return true; // Suppress
    }
    if (existingOnError) {
      return existingOnError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };

  // Unhandled rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    if (isWalletExtensionError(event.reason)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
  
  // Also listen in bubble phase
  window.addEventListener('unhandledrejection', (event) => {
    if (isWalletExtensionError(event.reason)) {
      event.preventDefault();
    }
  }, false);
  
  // Error event listener
  window.addEventListener('error', (event) => {
    const errorInfo = [
      event.message || '',
      event.filename || '',
      event.error?.message || '',
      event.error?.stack || ''
    ].join(' ');
    
    if (isWalletExtensionError(errorInfo)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        // Don't retry on extension-related errors
        if (isWalletExtensionError(error)) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
})

// React Error Boundary
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Check if it's an extension error we should ignore
    if (isWalletExtensionError(error)) {
      return { hasError: false, error: null }; // Don't treat as error
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Suppress extension-related errors completely
    if (isWalletExtensionError(error)) {
      // Reset error state since this isn't a real app error
      this.setState({ hasError: false, error: null });
      return;
    }
    console.error('Application error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Double-check it's not an extension error before showing error UI
      if (isWalletExtensionError(this.state.error)) {
        return this.props.children;
      }
      
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md text-center">
            <h2 className="text-xl font-bold text-white mb-4">Something went wrong</h2>
            <p className="text-gray-400 mb-4">Please refresh the page to try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mount the app
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <AuthProvider>
              <AppProvider>
                <Web3Provider>
                  <MultiWalletProvider>
                    <App />
                  </MultiWalletProvider>
                </Web3Provider>
              </AppProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
