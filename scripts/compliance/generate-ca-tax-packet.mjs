import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFixtureReceipt } from './fixture-output.mjs';
import { resolve } from 'node:path';

/**
 * Track 2: Statutory Tax Clearance Digest & CA Checksum Manifest Generator
 *
 * Cryptographically fingerprints the official statutory tax memorandum and generates
 * the machine-readable digital sign-off manifest for external Chartered Accountant review.
 */
export function generateTaxClearanceDigest(
  memorandumPath = resolve(process.cwd(), 'docs/compliance/TRACK_2_STATUTORY_TAX_CLEARANCE_MEMORANDUM_AND_CA_PACKET.md'),
  targetReceiptPath
) {
  if (!existsSync(memorandumPath)) {
    throw new Error(`STATUTORY_MEMORANDUM_MISSING: Cannot find memorandum at ${memorandumPath}`);
  }

  const rawBytes = readFileSync(memorandumPath);
  const sha256 = createHash('sha256').update(rawBytes).digest('hex');

  // A digest identifies bytes, not the correctness of statutory rates or an attestation.
  return { ...writeFixtureReceipt('tax-document-digest', {
    documentSha256: sha256, byteLength: rawBytes.byteLength,
    legalDisposition: 'UNREVIEWED', requiredEvidence: 'Authentic written professional opinion and independent authority verification',
  }, targetReceiptPath), sha256, byteLength: rawBytes.byteLength };

}

// CLI Runner execution
if (process.argv[1] && process.argv[1].endsWith('generate-ca-tax-packet.mjs')) {
  try {
    const result = generateTaxClearanceDigest();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: 'FAILED', error: err.message }, null, 2));
    process.exitCode = 1;
  }
}
