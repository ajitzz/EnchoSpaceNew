import { writeFixtureReceipt } from './fixture-output.mjs';

/** Retired synthetic clearance generator (CR1-045). This API only creates labeled fixtures. */
export async function generateGoogleMccClearanceReceipt(options = {}) {
  return writeFixtureReceipt('PROV-G-01-example', { gateId: 'PROV-G-01', requiredEvidence: 'Authentic independent authority remains unavailable' }, options.targetReceiptPath);
}

if (process.argv[1]?.endsWith('generate-google-mcc-clearance-receipt.mjs')) {
  try { console.log(JSON.stringify(await generateGoogleMccClearanceReceipt(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ status: 'FAILED', code: error.message })); process.exitCode = 1; }
}
