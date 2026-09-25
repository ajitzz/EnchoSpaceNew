/** Exact origin comparison shared by HTTP and realtime transports. */
export function originAllowed(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return true; // Non-browser requests still require endpoint authentication.
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.origin !== origin || !['https:', 'http:'].includes(parsed.protocol)) return false;
  const canonical = [
    'https://encho.space',
    'https://www.encho.space',
    'https://encho.co.in',
    'https://www.encho.co.in',
    'https://encho-space-chi.vercel.app',
  ];
  const configured = (env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const vercelOrigins = [
    env.VERCEL_URL ? (env.VERCEL_URL.startsWith('http') ? env.VERCEL_URL : `https://${env.VERCEL_URL}`) : null,
    env.VERCEL_PROJECT_PRODUCTION_URL ? (env.VERCEL_PROJECT_PRODUCTION_URL.startsWith('http') ? env.VERCEL_PROJECT_PRODUCTION_URL : `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) : null,
    env.VERCEL_BRANCH_URL ? (env.VERCEL_BRANCH_URL.startsWith('http') ? env.VERCEL_BRANCH_URL : `https://${env.VERCEL_BRANCH_URL}`) : null,
  ].filter(Boolean) as string[];
  if ([...canonical, ...configured, ...vercelOrigins].includes(origin)) return true;
  return env.NODE_ENV !== 'production' && !env.VERCEL && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}
