import {defineConfig} from 'vitest/config';

// Keep every suite in the default gate. Legacy pg-mem setup must never replace
// the real PostgreSQL driver in the marketing acceptance project.
export default defineConfig({
  envDir: false,
  test: {projects: ['vitest.marketing-m1.config.ts', 'vitest.guest-presentation.config.ts', 'vitest.legacy.config.ts', 'vitest.legacy-postgres.config.ts']},
});
