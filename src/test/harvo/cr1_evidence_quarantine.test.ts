import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cr1ReleaseCertificateEngine } from '../../lib/compliance/cr1ReleaseCertificateEngine.js';
import { verifyPausedCanaryReadback } from '../../../scripts/deployment/provider-canary-runner.mjs';
import { fixtureRoot, writeFixtureReceipt } from '../../../scripts/compliance/fixture-output.mjs';
import { generateAdTechMarkupClearanceReceipt } from '../../../scripts/compliance/generate-adtech-markup-clearance-receipt.mjs';
import { generateTaxClearanceReceipt } from '../../../scripts/compliance/generate-tax-clearance-receipt.mjs';
import { generateProviderCanaryReceipt } from '../../../scripts/compliance/generate-provider-canary-receipt.mjs';
import { generateGoogleMccClearanceReceipt } from '../../../scripts/compliance/generate-google-mcc-clearance-receipt.mjs';
import { generateMetaHecClearanceReceipt } from '../../../scripts/compliance/generate-meta-hec-clearance-receipt.mjs';
import { generateStagingPreflightReceipt } from '../../../scripts/compliance/generate-staging-preflight-receipt.mjs';
import { generateCr1ReleaseCandidateDossier } from '../../../scripts/compliance/generate-cr1-rc-dossier.mjs';

describe('R0-02 reproduced evidence trust defects', () => {
  it('does not treat absent provider spend as zero', async () => {
    await expect(verifyPausedCanaryReadback({ getCampaign: async () => ({
      provider: 'meta', campaignId: 'test-campaign', status: 'PAUSED', impressions: 0,
    }) }, 'test-campaign')).rejects.toThrow(/CANARY_OBSERVATION_INCOMPLETE/);
  });

  it('does not manufacture a release certificate from source constants', () => {
    const dir = mkdtempSync(join(tmpdir(), 'encho-evidence-before-'));
    try {
      const engine = new Cr1ReleaseCertificateEngine();
      expect(() => engine.generateReleaseCandidateCertificate({
        commitHash: '0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508', releaseTag: 'test', targetPath: join(dir, 'receipt.json'),
      })).toThrow(/RELEASE_CERTIFICATION_UNAVAILABLE/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each([
    generateAdTechMarkupClearanceReceipt, generateTaxClearanceReceipt, generateProviderCanaryReceipt,
    generateGoogleMccClearanceReceipt, generateMetaHecClearanceReceipt, generateStagingPreflightReceipt, generateCr1ReleaseCandidateDossier,
  ])('contains legacy generator %s in temporary explicitly untrusted fixtures', async generator => {
    const result = await generator();
    try {
      expect(result.productionGateEligible).toBe(false);
      expect(result.status).toBe('NOT_EVIDENCE');
      expect(result.receiptPath.startsWith(fixtureRoot())).toBe(true);
      expect(JSON.parse(readFileSync(result.receiptPath, 'utf8'))).toMatchObject({ classification: 'FIXTURE', status: 'NOT_EVIDENCE', externalGates: 'UNKNOWN' });
    } finally { rmSync(result.receiptPath, { force: true }); }
  });

  it('cannot overwrite historical receipts or replay a fixture filename', () => {
    const historical = join(process.cwd(), 'docs/harvo/receipts/CR1_PRODUCTION_RELEASE_CANDIDATE_CERTIFICATE.json');
    const before = readFileSync(historical);
    expect(() => writeFixtureReceipt('blocked', {}, historical)).toThrow(/FIXTURE_OUTPUT_PATH_REQUIRED/);
    expect(readFileSync(historical).equals(before)).toBe(true);
    const result = writeFixtureReceipt('exclusive');
    try { expect(() => writeFixtureReceipt('exclusive', {}, result.receiptPath)).toThrow(/EEXIST/); }
    finally { rmSync(result.receiptPath, { force: true }); }
  });

  it('refuses symlink escape without creating external directories', () => {
    const outside = mkdtempSync(join(tmpdir(), 'encho-outside-'));
    const fixture = writeFixtureReceipt('initialize');
    const link = join(fixtureRoot(), `symlink-${Date.now()}`);
    try {
      symlinkSync(outside, link);
      expect(() => writeFixtureReceipt('blocked', {}, join(link, 'new-directory', 'receipt.json'))).toThrow(/FIXTURE_SYMLINK_ESCAPE/);
      expect(existsSync(join(outside, 'new-directory'))).toBe(false);
    } finally { rmSync(link, { force: true }); rmSync(fixture.receiptPath, { force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
});
