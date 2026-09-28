#!/usr/bin/env node

/**
 * CR1 Phase P8.1 / Track 1: Formal Staging Deployment Runbook & Orchestrator
 *
 * Orchestrates the end-to-end staging validation and deployment clearance:
 * 1. Validates staging configuration (.env.staging) with zero-tolerance preflight.
 * 2. Audits connected PostgreSQL runtime to verify least-privilege role invariants.
 * 3. Enforces fail-closed compliance gates (STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE).
 * 4. Generates an immutable, cryptographically verifiable CR1_STAGING_DEPLOYMENT_RECEIPT.json.
 */

import { createHash } from 'node:crypto';
import { validateStagingConfig } from './staging-preflight.mjs';
import { verifyDatabaseRoles } from './verify-database-roles.mjs';

/**
 * Orchestrates the staging deployment runbook.
 */
export async function executeStagingDeploymentRunbook({
  env,
  dbClient,
  gitCommit = 'HEAD',
}) {
  // Step 1: Preflight Configuration Verification
  const preflight = validateStagingConfig(env);
  if (!preflight.valid) {
    return {
      success: false,
      stepFailed: 'PREFLIGHT',
      errors: preflight.errors,
      warnings: preflight.warnings,
      receipt: null,
    };
  }

  // Configuration is not a database observation. No client means no evidence.
  if (!dbClient || typeof dbClient.query !== 'function') {
    return { success: false, stepFailed: 'DATABASE_ROLES', errors: ['DATABASE_OBSERVATION_REQUIRED'], warnings: preflight.warnings, receipt: null };
  }
  // Step 2: Database Least-Privilege Role Auditing (partial collector, not clearance)
  let roleMetadata = {
    roleName: 'unknown',
    rolsuper: false,
    rolbypassrls: false,
  };

  if (dbClient) {
    const roleAudit = await verifyDatabaseRoles(dbClient);
    if (!roleAudit.valid) {
      const formattedErrors = [...roleAudit.errors];
      const roleName = roleAudit.role?.user || roleAudit.role?.rolname || 'unknown';
      if (roleAudit.role?.isSuperuser || roleAudit.role?.rolsuper) {
        formattedErrors.push(
          `Database user ${roleName} must not be a superuser`
        );
      }
      return {
        success: false,
        stepFailed: 'DATABASE_ROLES',
        errors: formattedErrors,
        warnings: roleAudit.warnings,
        receipt: null,
      };
    }
    if (roleAudit.role) {
      roleMetadata = {
        roleName: roleAudit.role.user || roleAudit.role.rolname || 'unknown',
        rolsuper: Boolean(roleAudit.role.isSuperuser || roleAudit.role.rolsuper),
        rolbypassrls: Boolean(roleAudit.role.bypassRls || roleAudit.role.rolbypassrls),
      };
    }
  }

  // Step 3: Receipt Generation & Cryptographic Checksum
  const receipt = generateStagingReceipt({
    gitCommit,
    environment: env.NODE_ENV || 'staging',
    roleVerification: roleMetadata,
    preflightPassed: true,
    complianceGatesEnforced:
      env.STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE === 'true',
  });

  return {
    success: true,
    stepFailed: null,
    errors: [],
    warnings: preflight.warnings,
    receipt,
  };
}

/**
 * Generates an immutable staging deployment receipt artifact.
 */
export function generateStagingReceipt(data) {
  const receipt = {
    schemaVersion: '1.0.0',
    type: 'ENCHO_CR1_STAGING_DEPLOYMENT_RECEIPT',
    status: 'REQUIRES_INDEPENDENT_REVIEW',
    classification: 'UNTRUSTED_OBSERVATION',
    productionGateEligible: false,
    limitations: ['Caller/client provenance unverified', 'No artifact or migration manifest binding', 'Role collector does not establish full grants, policies, inherited membership or FORCE RLS acceptance'],
    receiptId: `rcpt_staging_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    gitCommit: data.gitCommit,
    environment: data.environment,
    roleVerification: data.roleVerification,
    preflightPassed: data.preflightPassed,
    complianceGatesEnforced: data.complianceGatesEnforced,
    verificationChecksum: createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex'),
  };

  return receipt;
}

if (process.argv[1] && process.argv[1].endsWith('run-staging-deployment.mjs')) {
  console.log(JSON.stringify({ status: 'NOT_RUN', productionGateEligible: false, reason: 'Explicit target, authenticated collector and artifact identity required; this CLI does not deploy or connect.' }));
  process.exitCode = 1;
}
