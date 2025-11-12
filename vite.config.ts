import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables (VITE_* prefixed) for the current mode.
  const env = loadEnv(mode, process.cwd(), "");
  // Allow a comma-separated list in VITE_ALLOWED_HOSTS (e.g. "fe,localhost")
  const allowedFromEnv = (env.VITE_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Ensure 'fe' is always allowed (keeps prior behavior).
  const allowedHosts = Array.from(new Set([...allowedFromEnv, "fe"]));

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3001,
      host: true,
      // Allow hosts configured via VITE_ALLOWED_HOSTS, always include 'fe'
      allowedHosts,
      // Proxy common API paths to the backend to avoid CORS during local dev.
      // The backend target is taken from VITE_API_URL if provided, otherwise
      // you'll want to set VITE_API_URL in your env to the backend (e.g.
      // https://rust-service:8800).
      proxy: {
        // Proxy a single '/api' prefix to the backend in dev. This avoids
        // forwarding top-level SPA routes like '/projects' directly to the
        // backend (which causes unauthorized JSON responses on direct
        // navigation). Client-side XHRs should use '/api' as their base in
        // development.
        '/api': {
          target: env.VITE_API_URL || 'https://rust-service:8800',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        // Keep OpenAPI proxied if needed
        '/openapi': {
          target: env.VITE_API_URL || 'https://rust-service:8800',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: 3001,
      host: true,
      allowedHosts,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'https://rust-service:8800',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/openapi': {
          target: env.VITE_API_URL || 'https://rust-service:8800',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  build: {
    // Increase warning threshold slightly; prefer splitting instead of raising instead of raising too high.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;

          // React internals separate from react-dom
          if (/node_modules\/react-dom(\/|$)/.test(id)) return 'vendor.react-dom';
          if (/node_modules\/react(\/|$)/.test(id)) return 'vendor.react';

          // Query / state libs
          if (id.includes('@tanstack') || id.includes('react-query')) return 'vendor.tanstack';
          if (id.includes('zustand')) return 'vendor.zustand';

          // Routing, forms, validation and floating UI are sizable — isolate them
          if (id.includes('react-router') || id.includes('react-router-dom')) return 'vendor.react-router';
          if (id.includes('react-hook-form')) return 'vendor.react-hook-form';
          if (id.includes('zod')) return 'vendor.zod';
          if (id.includes('@floating-ui') || id.includes('floating-ui')) return 'vendor.floating-ui';

          // HTTP
          if (id.includes('axios')) return 'vendor.axios';

          // UI / icons / utilities
          if (id.includes('lucide-react')) return 'vendor.icons';
          if (id.includes('sonner')) return 'vendor.sonner';
          if (id.includes('class-variance-authority') || id.includes('tailwind-merge')) return 'vendor.utils';
          if (id.includes('@radix-ui')) return 'vendor.radix';

          // fallback vendor chunk
          return 'vendor';
        },
      },
    },
  },
  };
});
