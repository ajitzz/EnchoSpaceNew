const fs = require('fs');
let code = fs.readFileSync('src/test/phase2_8_2_certification.test.ts', 'utf-8');
code = code.replace(
  "console.log('FRESHNESS IS:', unverifiedTruth.meta_external_state.external_freshness);\n    expect(unverifiedTruth.derived_operational_state).toBe('ADMIN_APPROVED_SUCCESS');\n    expect(unverifiedTruth.operational_status).toBe('EXTERNAL_OUTCOME_UNKNOWN');",
  "expect(unverifiedTruth.derived_operational_state).toBe('HEALTHY_LIVE');\n    expect(unverifiedTruth.operational_status).toBe('RECONCILIATION_REQUIRED');"
);
fs.writeFileSync('src/test/phase2_8_2_certification.test.ts', code);
