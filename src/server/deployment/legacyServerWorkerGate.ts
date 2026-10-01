/**
 * Legacy interval workers belong only in an explicitly disposable local run.
 * The production marketing worker has its own entry point and is not gated here.
 */
export function legacyServerWorkersEnabled(env: NodeJS.ProcessEnv, rawDbUrl: string): boolean {
  if (env.HARVO_LEGACY_SERVER_WORKERS_ENABLED !== 'local-disposable-only') return false;
  if (env.DISABLE_BACKGROUND_WORKERS === 'true') return false;
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'test') return false;
  if (env.VERCEL || env.NOW_REGION || env.AWS_LAMBDA_FUNCTION_NAME) return false;

  try {
    const target = new URL(rawDbUrl);
    if (target.protocol !== 'postgres:' && target.protocol !== 'postgresql:') return false;
    return ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname.toLowerCase());
  } catch {
    return false;
  }
}
