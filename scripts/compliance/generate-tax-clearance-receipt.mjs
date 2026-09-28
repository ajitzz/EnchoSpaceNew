import { writeFixtureReceipt } from './fixture-output.mjs';

/** Retired synthetic clearance generator (CR1-045). This API only creates labeled fixtures. */
export async function generateTaxClearanceReceipt(options = {}) {
  return writeFixtureReceipt('LEGAL-01-example', { gateId: 'LEGAL-01', requiredEvidence: 'Authentic independent authority remains unavailable' }, options.targetReceiptPath);
}

if (process.argv[1]?.endsWith('generate-tax-clearance-receipt.mjs')) {
  try { console.log(JSON.stringify(await generateTaxClearanceReceipt(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ status: 'FAILED', code: error.message })); process.exitCode = 1; }
}
