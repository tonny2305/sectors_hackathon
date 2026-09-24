import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Vitest is a server harness; Next enforces the real client-import boundary.
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
