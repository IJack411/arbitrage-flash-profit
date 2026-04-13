import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate configuration
const isValidUrl = supabaseUrl.startsWith('https://') && supabaseUrl.includes('supabase.co');
const isValidKey = supabaseKey.length > 30 && supabaseKey.startsWith('eyJ');
const hasValidConfig = isValidUrl && isValidKey;

// Log configuration status (only in development)
if (import.meta.env.DEV) {
  if (!hasValidConfig) {
    console.info(
      '%c⚠️ Supabase not configured',
      'color: #f59e0b; font-weight: bold;',
      '\n\nTo enable persistent storage and authentication:',
      '\n1. Copy .env.example to .env',
      '\n2. Add your Supabase credentials from: Settings > API',
      '\n3. Restart the development server',
      '\n\nUsing localStorage fallback for now.'
    );
  } else {
    console.info('%c✓ Supabase configured', 'color: #22c55e; font-weight: bold;');
  }
}

// Safe fetch wrapper that handles errors gracefully
const createSafeFetch = () => {
  return async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    if (!hasValidConfig) {
      return new Response(JSON.stringify({ data: null, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch {
      return new Response(JSON.stringify({ data: null, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
};

// Create the Supabase client
let supabase: SupabaseClient;

try {
  const clientUrl = hasValidConfig ? supabaseUrl : 'https://placeholder.supabase.co';
  const clientKey = hasValidConfig ? supabaseKey : 'placeholder-key';

  supabase = createClient(clientUrl, clientKey, {
    global: { fetch: createSafeFetch() },
    auth: {
      persistSession: hasValidConfig, // Enable session persistence when configured
      autoRefreshToken: hasValidConfig, // Enable auto refresh when configured
      detectSessionInUrl: hasValidConfig, // Enable URL detection for OAuth
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: 'flash-arbitrage-auth',
    },
    realtime: {
      params: { eventsPerSecond: 2 },
    },
  });
} catch {
  supabase = createClient('https://placeholder.supabase.co', 'placeholder', {
    global: { fetch: createSafeFetch() },
  });
}

// Connection status tracking
let connectionStatus: 'unknown' | 'connected' | 'disconnected' = hasValidConfig ? 'unknown' : 'disconnected';

export const checkConnection = async (): Promise<boolean> => {
  if (!hasValidConfig) {
    connectionStatus = 'disconnected';
    return false;
  }

  try {
    const { error } = await supabase.from('governance_audit_logs').select('id').limit(1);
    connectionStatus = error ? 'disconnected' : 'connected';
    return !error;
  } catch {
    connectionStatus = 'disconnected';
    return false;
  }
};

export const isSupabaseConfigured = () => hasValidConfig;
export const getConnectionStatus = () => connectionStatus;
export const getConfigStatus = () => ({
  configured: hasValidConfig,
  url: isValidUrl,
  key: isValidKey,
});

export { supabase };
