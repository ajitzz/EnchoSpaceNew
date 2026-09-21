import {currentProviderContractFiles} from './src/test/currentProviderContractFiles';
import { defineConfig } from 'vitest/config';

// Provider acceptance runs independently of dotenv, server startup and pg-mem.
export default defineConfig({
  envDir: false,
  test: {
    name: 'marketing',
    environment: 'node',
    setupFiles: ['./src/test/isolation.ts'],
    include: [...currentProviderContractFiles, 'src/test/harvo/**/*.test.ts', 'src/test/google_budget.test.ts', 'src/test/google_dco.test.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    restoreMocks: true,
  },
});
