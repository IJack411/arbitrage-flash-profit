import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      // Configure HMR to be more resilient to extension errors
      overlay: true,
    },
  },
  plugins: [
    react()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Suppress certain errors in the error overlay
  optimizeDeps: {
    exclude: [],
  },
  // Custom error handling
  define: {
    // This helps with some extension-related issues
    'process.env': {},
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react';
            }
            if (id.includes('@radix-ui/react-dialog') || id.includes('@radix-ui/react-dropdown-menu') || id.includes('@radix-ui/react-tabs') || id.includes('@radix-ui/react-toast') || id.includes('lucide-react')) {
              return 'ui';
            }
            if (id.includes('recharts')) {
              return 'charts';
            }
            if (id.includes('@supabase/supabase-js')) {
              return 'supabase';
            }
          }
        },
      },
    },
  },
}));
