import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3001,
    host: true,
  },
  preview: {
    port: 3001,
    host: true,
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
});
