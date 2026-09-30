/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev/preview proxy target for /api (default: the API on :3000; e.g. API_TARGET=http://localhost:8088).
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // SSE-safe: the dev proxy streams responses without buffering.
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
