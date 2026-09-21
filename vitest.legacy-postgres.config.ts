import {defineConfig} from 'vitest/config';
import legacy from './vitest.legacy.config';
import {legacyPostgresFiles} from './src/test/legacyPostgresFiles';
export default defineConfig({...legacy, test: {...legacy.test,
  name: 'legacy-postgres', include: legacyPostgresFiles, exclude: [],
  env: {ENCHO_LEGACY_POSTGRES: '1'}, sequence: {hooks: 'stack'},
}});
