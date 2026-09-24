import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  TaxClearanceEngine,
  type DbClientPort,
  type TaxLedgerEntryInput,
  type TaxFilingWebhookPayload,
} from '../../lib/compliance/taxClearanceEngine.js';

describe('CR1 Track 2: Statutory Tax Clearance & CA Checksum Adversarial Suite', () => {
  const memorandumPath = resolve(
    process.cwd(),
    'docs/compliance/TRACK_2_STATUTORY_TAX_CLEARANCE_MEMORANDUM_AND_CA_PACKET.md'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Mid-Transaction Connection Drop Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 1: Rolls back tax invoice and withholding ledger atomically on midway connection drop', async () => {
    const executedQueries: string[] = [];
    let shouldDropConnection = false;

    const mockDb: DbClientPort = {
      query: async (sql: string) => {
        executedQueries.push(sql.trim().split('\n')[0]);
        if (shouldDropConnection && sql.includes('INSERT INTO platform_tax_withholding_ledger')) {
          throw new Error('ECONNRESET: Database connection stream severed unexpectedly during tax commit');
        }
        return { rows: [] };
      },
    };

    const engine = new TaxClearanceEngine();
    const input: TaxLedgerEntryInput = {
      bookingId: 'book_stay_wayanad_01',
      hostId: 'host_unregistered_101',
      hostGstStatus: 'UNREGISTERED',
      baseStayPricePaise: 1000000, // ₹10,000.00
      idempotencyKey: 'idemp_tax_drop_01',
    };

    // Inject connection failure during ledger write
    shouldDropConnection = true;

    await expect(engine.recordTaxWithholdingWithOutbox(mockDb, input)).rejects.toThrow(
      'ECONNRESET: Database connection stream severed unexpectedly during tax commit'
    );

    // Verify atomic transaction boundary: BEGIN -> INSERT invoice -> FAIL withholding -> ROLLBACK
    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(executedQueries).not.toContain('COMMIT');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: 5-Click Concurrency Burst in 200ms
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 2: Deduplicates 5 concurrent tax ledger submissions in 200ms into exactly 1 write and 4 replays', async () => {
    let writeCount = 0;

    const mockDb: DbClientPort = {
      query: async (sql: string) => {
        if (sql.includes('INSERT INTO platform_invoices')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const engine = new TaxClearanceEngine();
    const idempotencyKey = 'idemp_burst_tax_200ms';

    const input: TaxLedgerEntryInput = {
      bookingId: 'book_burst_02',
      hostId: 'host_registered_202',
      hostGstStatus: 'REGISTERED',
      baseStayPricePaise: 2500000, // ₹25,000.00
      idempotencyKey,
    };

    // Simulate 5 simultaneous rapid clicks within 200ms
    const burstPromises = Array.from({ length: 5 }, () =>
      engine.recordTaxWithholdingWithOutbox(mockDb, input)
    );

    const results = await Promise.all(burstPromises);

    // Exactly 1 insert executed in the database
    expect(writeCount).toBe(1);

    // All 5 returned valid results with identical invoice IDs
    const invoiceIds = results.map(r => r.invoiceId);
    expect(new Set(invoiceIds).size).toBe(1);

    // Exactly 1 original execution and 4 replays
    const replays = results.filter(r => r.isReplay);
    expect(replays).toHaveLength(4);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Out-of-Order Tax Filing Telemetry / Webhook
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 3: Safely rejects stale monthly tax filing webhooks arriving out-of-order', async () => {
    const engine = new TaxClearanceEngine();
    const filingYear = '2026-27';

    // Step 1: Initial filing sequence 7 arrives (Month 7 / October GSTR-8 filed)
    const eventSeq7: TaxFilingWebhookPayload = {
      filingId: 'file_gstr8_007',
      filingYear,
      sequenceNumber: 7,
      formType: 'GSTR-8',
      status: 'FILED_AND_RECONCILED',
      filedAt: '2026-11-10T10:00:00.000Z',
    };

    const result7 = await engine.applyTaxFilingEvent(eventSeq7);
    expect(result7.applied).toBe(true);
    expect(result7.currentSequence).toBe(7);

    // Step 2: Stale sequence 5 arrives delayed (Month 5 / August GSTR-8 duplicate retry)
    const eventSeq5: TaxFilingWebhookPayload = {
      filingId: 'file_gstr8_005',
      filingYear,
      sequenceNumber: 5, // Out of order!
      formType: 'GSTR-8',
      status: 'FILED_AND_RECONCILED',
      filedAt: '2026-09-10T10:00:00.000Z',
    };

    const result5 = await engine.applyTaxFilingEvent(eventSeq5);
    expect(result5.applied).toBe(false);
    expect(result5.isStale).toBe(true);
    expect(result5.currentSequence).toBe(7); // Preserves monotonic ceiling
    expect(result5.reason).toBe('STALE_TAX_FILING_SEQUENCE_REJECTED');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 4: Checksum Fingerprint & Tamper Detection
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 4: Cryptographically fingerprints memorandum and detects content tampering', () => {
    const engine = new TaxClearanceEngine();

    // Fingerprint official memorandum
    const fingerprint = engine.computeMemorandumFingerprint(memorandumPath);
    expect(fingerprint.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint.byteLength).toBeGreaterThan(5000);

    // Verify tamper detection on altered text
    const originalText = '# Track 2: Statutory Tax Clearance Memorandum';
    const tamperedText = '# Track 2: Statutory Tax Clearance Memorandum - ALTERED!';

    const originalHash = engine.hashContent(originalText);
    const tamperedHash = engine.hashContent(tamperedText);

    expect(originalHash).not.toBe(tamperedHash);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 5: Statutory Rate Precision & Fail-Closed Gate
  // ──────────────────────────────────────────────────────────────────────────
  it('Scenario 5: Enforces exact statutory tax formulas and locks compliance gate pending UDIN', () => {
    const engine = new TaxClearanceEngine();

    // 1. Calculate statutory taxes for ₹10,000 stay with unregistered host
    // Base: ₹10,000.00 (1000000 paise)
    // 18% Stay GST under Sec 9(5): ₹1,800.00 (180000 paise)
    // 15% Encho Commission: ₹1,500.00 (150000 paise)
    // 18% GST on Commission: ₹270.00 (27000 paise)
    // 1% Section 52 TCS on Base: ₹100.00 (10000 paise)
    // Net Host Payout = 10,000 - 1,500 - 100 = ₹8,400.00 (840000 paise)
    const breakdown = engine.calculateStatutoryTaxes({
      baseStayPricePaise: 1000000,
      hostGstStatus: 'UNREGISTERED',
      commissionRateBps: 1500, // 15%
    });

    expect(breakdown.guestTotalPaise).toBe(1180000); // ₹11,800.00 (Base + 18% GST)
    expect(breakdown.stayGstPaise).toBe(180000);
    expect(breakdown.platformCommissionPaise).toBe(150000);
    expect(breakdown.platformCommissionGstPaise).toBe(27000);
    expect(breakdown.tcsSection52Paise).toBe(10000); // Exactly 1% TCS
    expect(breakdown.netHostPayoutPaise).toBe(840000); // Exactly ₹8,400.00

    // 2. Compliance gate must fail closed without valid 18-char UDIN
    expect(() =>
      engine.verifyCaAttestation({
        caName: 'P. K. Sharma & Co.',
        icaiMembershipNumber: '123456',
        firmRegistrationNumber: '001234N',
        udin: 'SHORT_UDIN', // Invalid length & non-alphanumeric!
      })
    ).toThrow('INVALID_UDIN: ICAI Unique Document Identification Number must be exactly 18 alphanumeric characters');

    // Valid 18-character UDIN passes
    const validAttestation = engine.verifyCaAttestation({
      caName: 'P. K. Sharma & Co.',
      icaiMembershipNumber: '123456',
      firmRegistrationNumber: '001234N',
      udin: '26123456AAAAAA1234', // Exactly 18 chars
    });

    expect(validAttestation.verified).toBe(true);
    expect(validAttestation.status).toBe('ATTESTATION_VALIDATED');
  });
});
