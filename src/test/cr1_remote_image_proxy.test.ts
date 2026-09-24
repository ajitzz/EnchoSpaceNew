import { describe, expect, it } from 'vitest';
import {
  isAllowedImageSource,
  isPrivateImageAddress,
  parseImageTransformQuery,
  readBoundedImageResponse,
  REMOTE_IMAGE_LIMITS,
} from '../server/media/remoteImageProxy';

describe('CR1 bounded remote image proxy', () => {
  const env = { AWS_S3_BUCKET_NAME: 'encho-owned-media' } as NodeJS.ProcessEnv;

  it('accepts exact trusted hosts and owned S3 bucket forms', () => {
    expect(isAllowedImageSource(new URL('https://images.unsplash.com/photo-1'), env)).toBe(true);
    expect(isAllowedImageSource(new URL('https://encho-owned-media.s3.ap-south-1.amazonaws.com/a.jpg'), env)).toBe(true);
    expect(isAllowedImageSource(new URL('https://s3.amazonaws.com/encho-owned-media/a.jpg'), env)).toBe(true);
  });

  it('rejects substring tricks, insecure transport, credentials and wrong buckets', () => {
    expect(isAllowedImageSource(new URL('https://images.unsplash.com.evil.test/a.jpg'), env)).toBe(false);
    expect(isAllowedImageSource(new URL('https://evil-encho-owned-media.s3.amazonaws.com/a.jpg'), env)).toBe(false);
    expect(isAllowedImageSource(new URL('https://s3.amazonaws.com/other/a.jpg'), env)).toBe(false);
    expect(isAllowedImageSource(new URL('http://images.unsplash.com/a.jpg'), env)).toBe(false);
    expect(isAllowedImageSource(new URL('https://user:pass@images.unsplash.com/a.jpg'), env)).toBe(false);
    expect(isAllowedImageSource(new URL('https://127.0.0.1/a.jpg'), env)).toBe(false);
    expect(isAllowedImageSource(new URL('https://encho-owned-media.s3.bad.nested.amazonaws.com/a.jpg'), env)).toBe(false);
  });

  it('bounds dimensions, quality, protocol and supported aspect ratios', () => {
    expect(parseImageTransformQuery({ url: 'https://images.unsplash.com/a.jpg', w: '1080', q: '72', aspect: '9:16' }))
      .toMatchObject({ w: 1080, q: 72, aspect: '9:16' });
    expect(() => parseImageTransformQuery({ url: 'file:///etc/passwd' })).toThrow();
    expect(() => parseImageTransformQuery({ url: 'https://images.unsplash.com/a.jpg', w: '9000' })).toThrow();
    expect(() => parseImageTransformQuery({ url: 'https://images.unsplash.com/a.jpg', q: '0' })).toThrow();
    expect(() => parseImageTransformQuery({ url: 'https://images.unsplash.com/a.jpg', w: '4096', aspect: '9:16' })).toThrow();
  });

  it('rejects non-public DNS results including mapped IPv4 and multicast', () => {
    for (const address of ['127.0.0.1', '169.254.169.254', '100.64.0.1', '224.1.2.3', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fe80::1', 'ff02::1']) {
      expect(isPrivateImageAddress(address), address).toBe(true);
    }
    expect(isPrivateImageAddress('8.8.8.8')).toBe(false);
    expect(isPrivateImageAddress('2600:9000::1')).toBe(false);
    expect(isPrivateImageAddress('2001:4860:4860::8888')).toBe(false);
    expect(isPrivateImageAddress('2001:db8::1')).toBe(true);
  });

  it('rejects non-images and declared bodies above the byte ceiling', async () => {
    await expect(readBoundedImageResponse(new Response('html', { headers: { 'content-type': 'text/html' } })))
      .rejects.toThrow('IMAGE_CONTENT_TYPE_INVALID');
    await expect(readBoundedImageResponse(new Response('x', {
      headers: { 'content-type': 'image/png', 'content-length': String(REMOTE_IMAGE_LIMITS.maxSourceBytes + 1) },
    }))).rejects.toThrow('IMAGE_TOO_LARGE');
  });

  it('enforces the byte ceiling for a streaming body with no declared length', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(REMOTE_IMAGE_LIMITS.maxSourceBytes));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await expect(readBoundedImageResponse(new Response(body, { headers: { 'content-type': 'image/png' } })))
      .rejects.toThrow('IMAGE_TOO_LARGE');
  });
});
