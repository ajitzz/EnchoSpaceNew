import {currentProviderContractFiles} from './src/test/currentProviderContractFiles';
import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {legacyPostgresFiles} from './src/test/legacyPostgresFiles';

export default defineConfig({
  envDir: false,
  plugins: [react()],
  test: {
    name: 'legacy', environment: 'node', globals: true,
    setupFiles: ['./src/test/isolation.ts', './src/test/setup.ts'],
    fileParallelism: false, testTimeout: 60000, hookTimeout: 120000,
    include: ['src/test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', 'test_*.test.ts'],
    exclude: [...currentProviderContractFiles, ...legacyPostgresFiles, 'src/test/harvo/**', 'src/test/google_budget.test.ts', 'src/test/google_dco.test.ts',
      'src/test/m6a_guest_presentation_truth.test.tsx', 'src/test/sanctuary_gallery.test.ts',
      'src/test/m6a_interactive_gallery.test.tsx', 'src/test/property_presentation_boundary.test.tsx',
      'src/test/cr1_guest_presentation.test.tsx'],
  },
  resolve: {alias: {'@': path.resolve(import.meta.dirname, './src')}},
});
