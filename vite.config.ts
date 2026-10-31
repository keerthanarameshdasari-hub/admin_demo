/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * One build for every environment. Nothing environment-specific is baked in:
 * the API base URL comes from /config.json at runtime (see src/config.ts),
 * which each environment's deploy writes next to index.html.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    // Maps are written for error tracking but not referenced from the JS, so browsers don't fetch them.
    sourcemap: 'hidden',
    target: 'es2023',
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
