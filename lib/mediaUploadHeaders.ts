/** Forward only the upload service's supported storage precondition, never auth headers. */
export function mediaUploadHeaders(
  contentType: string,
  supplied: unknown,
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  // Local signed upload capabilities do not need an S3 precondition header.
  if (supplied === undefined) return headers;
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
    throw new Error('Invalid media upload header contract');
  }
  const entries = Object.entries(supplied);
  if (entries.length !== 1 || entries[0][0].toLowerCase() !== 'if-none-match' || entries[0][1] !== '*') {
    throw new Error('Unsupported media upload header contract');
  }
  headers['If-None-Match'] = '*';
  return headers;
}
