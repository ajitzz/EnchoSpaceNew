import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Track 2: Statutory Tax Clearance Digest & CA Checksum Manifest Generator
 *
 * Cryptographically fingerprints the official statutory tax memorandum and generates
 * the machine-readable digital sign-off manifest for external Chartered Accountant review.
 */
export function generateTaxClearanceDigest(
  memorandumPath = resolve(process.cwd(), 'docs/compliance/TRACK_2_STATUTORY_TAX_CLEARANCE_MEMORANDUM_AND_CA_PACKET.md'),
  targetReceiptPath = resolve(process.cwd(), 'docs/harvo/receipts/STATUTORY_TAX_CLEARANCE_DIGEST.json')
) {
  if (!existsSync(memorandumPath)) {
    throw new Error(`STATUTORY_MEMORANDUM_MISSING: Cannot find memorandum at ${memorandumPath}`);
  }

  const rawBytes = readFileSync(memorandumPath);
  const sha256 = createHash('sha256').update(rawBytes).digest('hex');

  const digest = {
    document_name: 'Track 2: Statutory Tax Clearance Memorandum & CA Sign-Off Packet',
    target_gates: ['LEGAL-01', 'COMM-01'],
    package_targets: ['P4.3', 'M5', 'M6B'],
    memorandum_file: 'docs/compliance/TRACK_2_STATUTORY_TAX_CLEARANCE_MEMORANDUM_AND_CA_PACKET.md',
    memorandum_sha256: sha256,
    byte_length: rawBytes.byteLength,
    statutory_regime: {
      cgst_act: 'Central Goods and Services Tax Act, 2017',
      igst_act: 'Integrated Goods and Services Tax Act, 2017',
      income_tax_act: 'Income-tax Act, 1961',
    },
    statutory_invariants: {
      section_9_5_cgst: {
        classification: 'Electronic Commerce Operator (ECO) Liability',
        posture: 'Encho discharges GST on stay accommodation for unregistered hosts (annual turnover < ₹20 Lakhs). For registered hosts, host issues invoice directly.',
        rate: '18% GST on accommodation (> ₹7,500/night) or 12% (< ₹7,500/night)',
      },
      section_52_tcs: {
        classification: 'Tax Collected at Source (TCS)',
        posture: '1% TCS (0.5% CGST + 0.5% SGST or 1% IGST) withheld on net taxable supplies made through platform.',
        filing: 'Monthly Form GSTR-8 filed by the 10th of succeeding month.',
      },
      section_194_o_tds: {
        classification: 'Tax Deducted at Source (TDS) on E-Commerce',
        posture: '1% TDS under Income-tax Act, 1961 deducted on gross sales of accommodation services.',
      },
      section_31_34_invoicing: {
        classification: 'Tax Invoices & Cancellation Credit Notes',
        posture: 'Consecutive FY-unique numbering; cancellations trigger credit notes linking original invoice UUID and date with proportional tax reversal.',
      },
      sac_998313_ad_margin: {
        classification: 'AdTech Optimization Margin Tax Treatment',
        posture: '18% GST charged on the 3–5% optimization margin (C * p). Pure ad spend C disbursed per agency contract.',
      },
      zero_guest_commission: {
        classification: 'Guest Platform Fee Exemption',
        posture: 'Zero platform commission or gateway surcharges charged to guests.',
      },
      host_commission_standard: {
        classification: 'Host Booking Commission',
        posture: '15% host booking commission on Flex tier; 0% on ₹4,999/month Growth plan.',
      },
    },
    ca_attestation_requirements: {
      signatory_qualifications: 'Fellow or Associate Chartered Accountant (ICAI) or qualified Indian Tax Lawyer',
      udin_mandate: 'Must provide valid 18-character Unique Document Identification Number (UDIN)',
      signed_artifact_destination: 'docs/harvo/receipts/INDIAN_TAX_LEGAL_CLEARANCE_OPINION.pdf',
    },
    compliance_gate_status: {
      gate_name: 'STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE',
      enforcement: 'STRICT_LOCK (HTTP 503)',
      unlock_condition: 'Physical or digital execution of CA clearance certificate with verified UDIN',
    },
    generated_at: new Date().toISOString(),
  };

  const dir = dirname(targetReceiptPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(targetReceiptPath, JSON.stringify(digest, null, 2), { mode: 0o644 });

  return {
    receiptPath: targetReceiptPath,
    sha256,
    byteLength: rawBytes.byteLength,
    status: 'DIGEST_GENERATED',
  };
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
