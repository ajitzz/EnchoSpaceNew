/**
 * Inspects host-provided image URL safety before rendering thumbnails in the Admin DOM.
 *
 * Protection goals:
 * 1. Prevent malicious schemes (javascript:, vbscript:, data:, file:, blob:, etc.) from executing or leaking context.
 * 2. Prevent SSRF/internal network reconnaissance by blocking requests to private IPs, loopback, link-local,
 *    and cloud metadata endpoints (e.g., 169.254.169.254, 127.0.0.1, localhost, 10.0.0.0/8, 192.168.0.0/16, etc.).
 * 3. Reject credentials in URLs (user:password@host).
 * 4. Reject non-standard ports (e.g., :22, :3306, :5432, :6379, :8080).
 * 5. Allow only HTTPS (or safe relative local application paths).
 */

export function isSafeAdminImageUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  // Block dangerous schemes immediately
  if (/^(?:javascript|vbscript|data|file|blob|about):/i.test(trimmed)) {
    return false;
  }

  // Allow trusted relative paths within the application (e.g. /placeholder.jpg, /images/default.jpg)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);

    // Only HTTPS is permitted for external media
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Disallow user credentials in URLs
    if (parsed.username || parsed.password) {
      return false;
    }

    // Only allow standard HTTPS port (or empty/default 443)
    if (parsed.port && parsed.port !== '443') {
      return false;
    }

    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');

    // Block localhost, loopbacks, and domain names resolving to internal services
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }

    // Block private/internal IPv4 address ranges
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const b0 = Number(ipv4Match[1]);
      const b1 = Number(ipv4Match[2]);
      if (b0 === 0 || b0 === 10 || b0 === 127) return false;
      if (b0 === 169 && b1 === 254) return false;
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return false;
      if (b0 === 192 && b1 === 168) return false;
      if (b0 === 100 && b1 >= 64 && b1 <= 127) return false;
      if (b0 >= 224) return false; // Multicast / reserved
    }

    // Block IPv6 addresses (enclosed in brackets in URLs or raw)
    if (host.includes(':') || host.startsWith('[')) {
      const cleanIpv6 = host.replace(/^\[|\]$/g, '');
      if (
        cleanIpv6 === '::1' ||
        cleanIpv6.startsWith('::') ||
        cleanIpv6.startsWith('fc') ||
        cleanIpv6.startsWith('fd') ||
        cleanIpv6.startsWith('fe8') ||
        cleanIpv6.startsWith('fe9') ||
        cleanIpv6.startsWith('fea') ||
        cleanIpv6.startsWith('feb')
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
