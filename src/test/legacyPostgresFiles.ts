/** These suites need PostgreSQL date/interval, locking and transaction semantics.
 * They remain in the default gate; pg-mem is not evidence for those contracts.
 */
export const legacyPostgresFiles = [
  'src/test/phase3_5_analytics_reporting.test.ts',
  'src/test/phase2_9_7_worker_runtime.test.ts',
  'src/test/phase2_9_8_shadow_parity.test.ts',
  'src/test/phase2_9_9_cutover.test.ts',
  'src/test/phase3_6_lead_alerting_crm.test.ts',
  'src/test/phase2_7_m5_performance_engagement.test.ts',
  'src/test/p0_3_reconciliation.test.ts',
  'src/test/p2_6_m1_analytics_rollup.test.ts',
  'src/test/phase2_9_10_production_certification.test.ts',
];
