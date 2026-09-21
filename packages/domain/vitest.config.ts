import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/test/global-setup.ts'],
    // DB-backed tests share one database; files run serially, tests create their own uniquely-named data.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
