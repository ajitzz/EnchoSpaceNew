import {legacySchemaBootstrapEnabled} from './legacySchemaBootstrapGate.js';

/** Old booking/payment routes are executable only by the isolated test harness. */
export function legacyCommerceTestSandboxEnabled(env: NodeJS.ProcessEnv, rawDbUrl: string): boolean {
  return env.NODE_ENV === 'test'
    && env.ENCHO_TEST_SANDBOX === '1'
    && legacySchemaBootstrapEnabled(env, rawDbUrl);
}
