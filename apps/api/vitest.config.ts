import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // config/env.ts throws on startup when these are missing, so the test run
    // needs throwaway values. These are never used to sign or verify anything.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test?schema=public',
      JWT_SECRET: 'test-jwt-secret-not-used-in-production',
      CRON_SECRET: 'test-cron-secret-not-used-in-production',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
