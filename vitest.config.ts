import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['react-server'] },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
