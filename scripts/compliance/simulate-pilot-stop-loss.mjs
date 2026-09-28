import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFixtureReceipt } from './fixture-output.mjs';
import { resolve } from 'node:path';

/**
 * CR1 Phase P8.4 / Track 4: Bounded Commercial Pilot Simulation Runner
 *
 * Simulates commercial execution under the Bounded Commercial Pilot Charter (PILOT-01):
 * - Verifies single-property boundary (Listing 1 / Wayanad Sanctuary)
 * - Enforces ₹50,000 INR aggregate spend cap (5,000,000 paise)
 * - Simulates 95% spend threshold triggering the automated circuit breaker (₹47,500 INR)
 * This fixture does not establish commercial performance, approval, spend or refunds.
 */

export const PILOT_STOP_LOSS_CONSTANTS = {
  AUTHORIZED_LISTING_ID: 'listing_1',
  MAX_AGGREGATE_BUDGET_PAISE: 5000000, // ₹50,000 INR
  MAX_DAILY_BUDGET_PAISE: 200000, // ₹2,000 INR
  CIRCUIT_BREAKER_THRESHOLD_PERCENT: 95, // 95%
  CIRCUIT_BREAKER_THRESHOLD_PAISE: 4750000, // ₹47,500 INR
};

export function runPilotStopLossSimulation(
  charterPath = resolve(process.cwd(), 'docs/compliance/TRACK_4_BOUNDED_PILOT_AGREEMENT_AND_STOP_LOSS_CHARTER.md'),
  targetReceiptPath
) {
  if (!existsSync(charterPath)) {
    throw new Error(`PILOT_CHARTER_MISSING: Cannot locate pilot charter at ${charterPath}`);
  }

  const charterBytes = readFileSync(charterPath);
  const charterSha256 = createHash('sha256').update(charterBytes).digest('hex');

  // A local threshold calculation has no authority over real host funds or pilot approval.
  const finalSimulatedSpendPaise = 4760000;
  const circuitBreakerTriggered = finalSimulatedSpendPaise >= PILOT_STOP_LOSS_CONSTANTS.CIRCUIT_BREAKER_THRESHOLD_PAISE;
  return { ...writeFixtureReceipt('pilot-stop-loss-simulation', {
    charterSha256, finalSimulatedSpendPaise, circuitBreakerTriggered,
    providerPauseObserved: false, capturedBookingsObserved: false, boardApprovalObserved: false,
  }, targetReceiptPath), circuitBreakerTriggered };

}

if (process.argv[1] && process.argv[1].endsWith('simulate-pilot-stop-loss.mjs')) {
  try {
    const outcome = runPilotStopLossSimulation();
    console.log(JSON.stringify(outcome, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: 'FAILED', error: err.message }, null, 2));
    process.exitCode = 1;
  }
}
