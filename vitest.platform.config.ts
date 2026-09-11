import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Deliberately independent of the integration suite: no dotenv, database setup, server boot or providers.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/test/platform-*.test.ts', 'src/test/platform-*.test.tsx'],
    setupFiles: [],
    testTimeout: 10000,
  },
});
