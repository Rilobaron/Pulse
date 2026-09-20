import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// API target can be overridden for local dev (e.g. API_URL=http://localhost:4001)
const apiTarget = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});

