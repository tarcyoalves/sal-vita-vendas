import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // O primeiro import do content script (transformação a frio) pode passar de 5 s em máquina lenta.
    testTimeout: 30_000,
  },
});
