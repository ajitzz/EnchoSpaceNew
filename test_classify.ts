import { classifyMetaError } from './server';

console.log("TEST 1: Preflight Error with Diagnostic Report");
const test1 = classifyMetaError({
  error: {
    message: "Preflight Failed: Meta safety gates validation failed.",
    diagnosticReport: {
      gate_results: [
        {
          status: 'FAILED',
          severity: 'BLOCKER',
          failure_code: 'MISSING_META_CREDENTIALS',
          action_required: 'Configure credentials'
        }
      ]
    }
  }
});
console.log(test1);

console.log("\nTEST 2: Meta API Error");
const test2 = classifyMetaError({
  error: {
    message: "App is in development mode",
    code: 100,
    error_subcode: 1885183
  }
});
console.log(test2);

console.log("\nTEST 3: Runtime Error");
const test3 = classifyMetaError(new TypeError("Cannot read properties of undefined"));
console.log(test3);
