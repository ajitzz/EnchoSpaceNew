# SP0 release failure register

Date: 21 September 2026. Complete isolated Node 24 baseline: **1,298 passed, 127 failed, 268 pending/unexecuted; 46 failing files**. No file is excluded from the release gate.

This is a failure inventory, not a completed semantic audit. Observed missing-schema signatures identify an investigation starting point; they do not establish whether the production implementation or fixture must change. Each correction requires source authority, equivalent positive/negative assertions and a rerun before closure. Raw assertions/logs stay in ignored local test-results.

Historical first batch: **1,314 passed, 125 failed, 268 pending/unexecuted; 45 failing files**.

HARVO-032 release-baseline rerun: **1,748 passed, 0 failed, 0 pending across 130 files** (`test-results/sp0-gate.json`). The table preserves original failing/unexecuted counts; dispositions now reflect the complete local rerun. Retired paid-write expectations were replaced by containment tests and current real-transport/provider/finance coverage; see `SP0_TEST_CONTRACT_DISPOSITIONS.md`. This is test-gate closure, not production certification.

| File | Failed assertions | Pending/unexecuted | Observed starting point | Disposition |
|---|---:|---:|---|---|
| `src/test/cross_provider_financial.test.ts` | 0 | 2 | Assertion/setup contract requires source investigation | Resolved locally — 2 passing current-contract assertions; no skips |
| `src/test/google_auth.test.ts` | 2 | 0 | Source review: credential-free synthetic authentication/health expectations conflict with observed-credential contract | Resolved locally — 8 passing current-contract assertions; no skips |
| `src/test/google_hierarchy.test.ts` | 0 | 1 | Assertion/setup contract requires source investigation | Resolved locally — 1 passing current-contract assertions; no skips |
| `src/test/google_oauth_origin_forensics.test.ts` | 2 | 0 | Source review: unsigned identity expectation conflicts with server-verified Google sign-in | Resolved locally — 11 passing current-contract assertions; no skips |
| `src/test/google_reconciliation.test.ts` | 0 | 3 | Assertion/setup contract requires source investigation | Resolved locally — 3 passing current-contract assertions; no skips |
| `src/test/google_unknown_outcome.test.ts` | 0 | 2 | Assertion/setup contract requires source investigation | Resolved locally — 2 passing current-contract assertions; no skips |
| `src/test/meta_auto_activation.test.ts` | 0 | 9 | Assertion/setup contract requires source investigation | Resolved locally — 9 passing current-contract assertions; no skips |
| `src/test/milestone15_dco_and_localizer.test.ts` | 0 | 5 | Assertion/setup contract requires source investigation | Resolved locally — 5 passing current-contract assertions; no skips |
| `src/test/multi_provider_isolation.test.ts` | 0 | 2 | Assertion/setup contract requires source investigation | Resolved locally — 2 passing current-contract assertions; no skips |
| `src/test/p0_2_unknown_outcome.test.ts` | 0 | 5 | Assertion/setup contract requires source investigation | Resolved locally — 5 passing current-contract assertions; no skips |
| `src/test/p0_3_reconciliation.test.ts` | 3 | 0 | Assertion/setup contract requires source investigation | Resolved locally — 5 passing current-contract assertions; no skips |
| `src/test/p0_4_fsm_bypass.test.ts` | 0 | 4 | Assertion/setup contract requires source investigation | Resolved locally — 4 passing current-contract assertions; no skips |
| `src/test/p0_6_escrow_remediation.test.ts` | 0 | 3 | Assertion/setup contract requires source investigation | Resolved locally — 5 passing current-contract assertions; no skips |
| `src/test/p2_6_m1_analytics_rollup.test.ts` | 10 | 0 | Missing schema signature: `campaign_daily_rollups`, `campaign_raw_event_logs` | Resolved locally — 10 passing current-contract assertions; no skips |
| `src/test/phase2_5_delivery_hardening.test.ts` | 0 | 4 | Assertion/setup contract requires source investigation | Resolved locally — 4 passing current-contract assertions; no skips |
| `src/test/phase2_6_activation_timestamp.test.ts` | 0 | 8 | Assertion/setup contract requires source investigation | Resolved locally — 8 passing current-contract assertions; no skips |
| `src/test/phase2_6_step2_multivariant.test.ts` | 0 | 5 | Assertion/setup contract requires source investigation | Resolved locally — 5 passing current-contract assertions; no skips |
| `src/test/phase2_6_step3_insights.test.ts` | 0 | 10 | Assertion/setup contract requires source investigation | Resolved locally — 10 passing current-contract assertions; no skips |
| `src/test/phase2_6_step4_dco_evaluator.test.ts` | 0 | 23 | Assertion/setup contract requires source investigation | Resolved locally — 23 passing current-contract assertions; no skips |
| `src/test/phase2_6_step4b_dco_external_actions.test.ts` | 0 | 16 | Assertion/setup contract requires source investigation | Resolved locally — 16 passing current-contract assertions; no skips |
| `src/test/phase2_7_activation_audit.test.ts` | 17 | 0 | Missing schema signature: `admin_approved` | Resolved locally — 6 passing current-contract assertions; no skips |
| `src/test/phase2_7_financial_boundary_adversarial.test.ts` | 15 | 0 | Missing schema signature: `payment_gateway` | Resolved locally — 7 passing current-contract assertions; no skips |
| `src/test/phase2_7_m2_truth_projection.test.ts` | 15 | 0 | Missing schema signature: `admin_approved`, `dco_status`, `escrow_status`, `external_status_verified_at`, `insights_synced_at`, `meta_publishing_transactions` | Resolved locally — 16 passing current-contract assertions; no skips |
| `src/test/phase2_7_m3_failure_intelligence.test.ts` | 4 | 0 | Missing schema signature: `admin_approved`, `escrow_status`, `meta_publishing_transactions` | Resolved locally — 18 passing current-contract assertions; no skips |
| `src/test/phase2_7_m4_external_sync.test.ts` | 18 | 0 | Missing schema signature: `meta_campaign_id` | Resolved locally — 18 passing current-contract assertions; no skips |
| `src/test/phase2_7_m5_performance_engagement.test.ts` | 31 | 0 | Missing schema signature: `meta_campaign_id` | Resolved locally — 31 passing current-contract assertions; no skips |
| `src/test/phase2_7_m6_admin_command_center.test.ts` | 3 | 0 | Missing schema signature: `admin_approved` | Resolved locally — 3 passing current-contract assertions; no skips |
| `src/test/phase2_7_m8_control_plane.test.ts` | 0 | 6 | Assertion/setup contract requires source investigation | Resolved locally — 6 passing current-contract assertions; no skips |
| `src/test/phase2_8_2_certification.test.ts` | 0 | 6 | Assertion/setup contract requires source investigation | Resolved locally — 6 passing current-contract assertions; no skips |
| `src/test/phase2_8_4_canonical_truth_consumption.test.ts` | 0 | 1 | Assertion/setup contract requires source investigation | Resolved locally — 1 passing current-contract assertions; no skips |
| `src/test/phase2_9_10_production_certification.test.ts` | 3 | 0 | Missing schema signature: `async_webhook_queue`, `escrow_status`, `meta_publishing_transactions` | Resolved locally — 7 passing current-contract assertions; no skips |
| `src/test/phase2_9_7_worker_runtime.test.ts` | 0 | 12 | Assertion/setup contract requires source investigation | Resolved locally — 12 passing current-contract assertions; no skips |
| `src/test/phase2_9_8_shadow_parity.test.ts` | 0 | 7 | Assertion/setup contract requires source investigation | Resolved locally — 7 passing current-contract assertions; no skips |
| `src/test/phase2_9_9_cutover.test.ts` | 0 | 10 | Assertion/setup contract requires source investigation | Resolved locally — 10 passing current-contract assertions; no skips |
| `src/test/phase3_1_host_control_center.test.ts` | 0 | 6 | Assertion/setup contract requires source investigation | Resolved locally — 6 passing current-contract assertions; no skips |
| `src/test/phase3_2_admin_command_center.test.ts` | 0 | 7 | Assertion/setup contract requires source investigation | Resolved locally — 7 passing current-contract assertions; no skips |
| `src/test/phase3_3_dco_engine.test.ts` | 0 | 15 | Assertion/setup contract requires source investigation | Resolved locally — 15 passing current-contract assertions; no skips |
| `src/test/phase3_4_control_plane_and_calendar.test.ts` | 0 | 20 | Assertion/setup contract requires source investigation | Resolved locally — 20 passing current-contract assertions; no skips |
| `src/test/phase3_5_analytics_reporting.test.ts` | 0 | 20 | Assertion/setup contract requires source investigation | Resolved locally — 20 passing current-contract assertions; no skips |
| `src/test/phase3_6_2_p0_remediation.test.ts` | 2 | 0 | Assertion/setup contract requires source investigation | Resolved locally — 9 passing current-contract assertions; no skips |
| `src/test/phase3_6_lead_alerting_crm.test.ts` | 0 | 20 | Assertion/setup contract requires source investigation | Resolved locally — 20 passing current-contract assertions; no skips |
| `src/test/phase3_8b_google_sandbox_certification.test.ts` | 0 | 14 | Assertion/setup contract requires source investigation | Resolved locally — 14 passing current-contract assertions; no skips |
| `src/test/phase3_m4_1_case_b_golden_failure.test.ts` | 1 | 0 | Assertion/setup contract requires source investigation | Resolved locally — 7 passing current-contract assertions; no skips |
| `src/test/phase3_m4_external_side_effect_idempotency.test.ts` | 1 | 0 | Assertion/setup contract requires source investigation | Resolved locally — 6 passing current-contract assertions; no skips |
| `src/test/provider_contract_google.test.ts` | 0 | 10 | Assertion/setup contract requires source investigation | Resolved locally — 10 passing current-contract assertions; no skips |
| `src/test/provider_contract_meta.test.ts` | 0 | 12 | Assertion/setup contract requires source investigation | Resolved locally — 12 passing current-contract assertions; no skips |

Current targeted batch fixes projection/diagnostics/evidence/benchmark concerns and the source-backed Google credential test contract. Remaining rows are individually unresolved; no blanket waiver is used. Overall SP0 acceptance remains blocked until the full release gate is green.
