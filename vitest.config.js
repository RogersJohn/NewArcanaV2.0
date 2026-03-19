import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 600000,
    hookTimeout: 600000,
    teardownTimeout: 600000,
  },
});
