import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    // La reconnaissance de caractères prend quelques secondes par page.
    testTimeout: 90_000,
    hookTimeout: 60_000,
  },
});
