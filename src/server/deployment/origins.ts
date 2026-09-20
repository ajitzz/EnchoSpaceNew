/** Exact origin comparison shared by HTTP and realtime transports. */
export function originAllowed(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return true; // Non-browser requests still require endpoint authentication.
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.origin !== origin || !['https:', 'http:'].includes(parsed.protocol)) return false;
  const canonical = ['https://encho.space', 'https://www.encho.space', 'https://encho.co.in', 'https://www.encho.co.in'];
  const configured = (env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if ([...canonical, ...configured].includes(origin)) return true;
  return env.NODE_ENV !== 'production' && !env.VERCEL && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}
