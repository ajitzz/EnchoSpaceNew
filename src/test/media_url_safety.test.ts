import { describe, expect, it } from 'vitest';
import { isSafeAdminImageUrl } from '../lib/mediaUrlSafety.js';

describe('Media URL Safety Inspector for Admin Thumbnails', () => {
  it('permits valid HTTPS external URLs and trusted local paths', () => {
    expect(isSafeAdminImageUrl('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb')).toBe(true);
    expect(isSafeAdminImageUrl('https://encho-assets.s3.ap-south-1.amazonaws.com/resorts/hero.webp')).toBe(true);
    expect(isSafeAdminImageUrl('https://cdn.encho.space/media/villas/living.jpg')).toBe(true);
    expect(isSafeAdminImageUrl('https://images.example.com/asset-123.jpg?w=1080&q=80')).toBe(true);
    expect(isSafeAdminImageUrl('/placeholder-villa.jpg')).toBe(true);
    expect(isSafeAdminImageUrl('/images/luxury-pool.png')).toBe(true);
  });

  it('rejects dangerous script and data URI schemes', () => {
    expect(isSafeAdminImageUrl('javascript:alert(document.cookie)')).toBe(false);
    expect(isSafeAdminImageUrl('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeAdminImageUrl('vbscript:msgbox("hacked")')).toBe(false);
    expect(isSafeAdminImageUrl('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4=')).toBe(false);
    expect(isSafeAdminImageUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeAdminImageUrl('blob:https://encho.space/3d3ad583')).toBe(false);
    expect(isSafeAdminImageUrl('about:blank')).toBe(false);
  });

  it('rejects insecure plain HTTP and non-HTTPS protocols', () => {
    expect(isSafeAdminImageUrl('http://example.com/photo.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('ftp://example.com/photo.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('ws://example.com/socket')).toBe(false);
  });

  it('rejects cloud metadata service endpoints (SSRF vectors)', () => {
    expect(isSafeAdminImageUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeAdminImageUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeAdminImageUrl('https://metadata.google.internal/computeMetadata/v1/')).toBe(false);
  });

  it('rejects localhost, loopbacks, and private RFC 1918 addresses', () => {
    expect(isSafeAdminImageUrl('https://localhost/test.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://admin.localhost/test.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://127.0.0.1/secret.png')).toBe(false);
    expect(isSafeAdminImageUrl('https://10.0.0.1/internal.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://192.168.1.1/router.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://172.16.0.5/dev.png')).toBe(false);
    expect(isSafeAdminImageUrl('https://172.31.255.255/intranet.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://0.0.0.0/pic.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://[::1]/pic.jpg')).toBe(false);
  });

  it('rejects URLs with credentials or non-standard ports', () => {
    expect(isSafeAdminImageUrl('https://admin:password@cdn.example.com/photo.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://user@cdn.example.com/photo.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://cdn.example.com:8443/photo.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://cdn.example.com:22/photo.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('https://cdn.example.com:5432/photo.jpg')).toBe(false);
  });

  it('rejects protocol-relative URLs and malformed inputs', () => {
    expect(isSafeAdminImageUrl('//evil.com/exploit.jpg')).toBe(false);
    expect(isSafeAdminImageUrl('')).toBe(false);
    expect(isSafeAdminImageUrl('   ')).toBe(false);
    expect(isSafeAdminImageUrl(null)).toBe(false);
    expect(isSafeAdminImageUrl(undefined)).toBe(false);
    expect(isSafeAdminImageUrl(12345)).toBe(false);
    expect(isSafeAdminImageUrl({})).toBe(false);
    expect(isSafeAdminImageUrl('not-a-valid-url')).toBe(false);
  });
});
