import { PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const MEDIA_UPLOAD_TTL_SECONDS = 600;

/** This client signs browser uploads whose bytes are not available to this server. */
export function createMediaUploadS3Client(config: S3ClientConfig): S3Client {
  return new S3Client({
    ...config,
    // Otherwise the SDK signs a checksum of an empty body, rejecting real media.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
}

/** A reused capability cannot replace the current object at this server-owned key. */
export async function createImmutableS3Upload(
  client: S3Client,
  input: { bucket: string; key: string; contentType: string },
): Promise<{ uploadUrl: string; uploadHeaders: { 'If-None-Match': '*' } }> {
  const command = new PutObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    ContentType: input.contentType,
    IfNoneMatch: '*',
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: MEDIA_UPLOAD_TTL_SECONDS,
    signableHeaders: new Set(['content-type', 'if-none-match']),
  });
  return { uploadUrl, uploadHeaders: { 'If-None-Match': '*' } };
}
