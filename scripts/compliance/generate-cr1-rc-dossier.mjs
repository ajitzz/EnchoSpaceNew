import { writeFixtureReceipt } from './fixture-output.mjs';

/** Formatting source constants cannot certify an artifact or clear an external gate. */
export function generateCr1ReleaseCandidateDossier(targetPath) {
  return writeFixtureReceipt('CR1-unaccepted-dossier-example', { requiredEvidence: 'Independently accepted current-source, deployment and external gate evidence', completedPackages: null }, targetPath);
}

if (process.argv[1]?.endsWith('generate-cr1-rc-dossier.mjs')) {
  try { console.log(JSON.stringify(generateCr1ReleaseCandidateDossier(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ status: 'FAILED', code: error.message })); process.exitCode = 1; }
}
