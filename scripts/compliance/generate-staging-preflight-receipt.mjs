import { writeFixtureReceipt } from './fixture-output.mjs';

/** No network/catalog inspection occurs here. Use the explicitly targeted deployment collectors. */
export function generateStagingPreflightReceipt(targetReceiptPath) {
  return writeFixtureReceipt('STAGE-01-example', { gateId: 'STAGE-01', databaseObserved: false, requiredEvidence: ['ENV-01', 'DB-01'] }, targetReceiptPath);
}

if (process.argv[1]?.endsWith('generate-staging-preflight-receipt.mjs')) {
  try { console.log(JSON.stringify(generateStagingPreflightReceipt(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ status: 'FAILED', code: error.message })); process.exitCode = 1; }
}
