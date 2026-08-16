const fs = require('fs');
let code = fs.readFileSync('src/test/phase2_8_2_certification.test.ts', 'utf-8');
code = code.replace(
  "expect(unverifiedTruth.operational_status).toBe('RECONCILIATION_REQUIRED');",
  "const opStatus = CampaignControlCenterService.getOperationalStatus(unverifiedTruth);\n    expect(opStatus.operational_status).toBe('RECONCILIATION_REQUIRED');"
);
fs.writeFileSync('src/test/phase2_8_2_certification.test.ts', code);
