/** Legacy DDL is allowed only for a declared local disposable database or pg-mem tests. */
export function legacySchemaBootstrapEnabled(env: NodeJS.ProcessEnv, rawDbUrl: string): boolean {
  let target: URL;
  try {
    target = new URL(rawDbUrl);
  } catch {
    return false;
  }
  if (target.protocol !== 'postgres:' && target.protocol !== 'postgresql:') return false;

  const hostname = target.hostname.toLowerCase();
  if (env.VERCEL || env.NOW_REGION || env.AWS_LAMBDA_FUNCTION_NAME) return false;
  if (env.NODE_ENV === 'test') {
    return env.ENCHO_TEST_SANDBOX === '1'
      && (hostname === 'encho-test.invalid' || ['localhost', '127.0.0.1', '[::1]'].includes(hostname));
  }
  if (env.NODE_ENV === 'production') return false;
  return env.HARVO_LOCAL_SCHEMA_BOOTSTRAP_ENABLED === 'local-disposable-only'
    && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}
