import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}', 'supabase/tests/**/*.test.js'],
    // Each database test boots Postgres (WebAssembly), which takes a few seconds.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
