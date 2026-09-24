import { describe, expect, it } from 'vitest';
import {
  StagingHardeningEngine,
  type StagingDbClientPort,
  type StagingVerificationInput,
  type StagingMigrationPayload,
} from '../../lib/compliance/stagingHardeningEngine.js';

describe('CR1 Phase 4.1: Staging Deployment & DB Role Verification Adversarial Suite (P0.5 / P8.1)', () => {
  const engine = new StagingHardeningEngine();

  // Adversarial Scenario 1: Connection drops midway through staging preflight audit logging
  it('Scenario 1: Connection drops midway through staging preflight audit logging -> full rollback, 0 zombie records', async () => {
    const executedQueries: string[] = [];
    let rolledBack = false;

    const mockFailingClient: StagingDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        executedQueries.push(sql);
        if (sql.includes('platform_audit_log')) {
          throw new Error('ECONNRESET: Database socket terminated unexpectedly during audit insert');
        }
        if (sql === 'ROLLBACK') {
          rolledBack = true;
        }
        return { rows: [] };
      },
    };

    const input: StagingVerificationInput = {
      operatorId: 'operator_sec_infra_01',
      environment: 'staging',
      databaseUrl: 'postgresql://encho_app:StrongP@ssw0rd!@neon-staging.encho.internal:5432/encho_staging?sslmode=require',
      idempotencyKey: 'idemp_staging_audit_fail_001',
    };

    await expect(engine.verifyStagingEnvironmentWithAudit(mockFailingClient, input)).rejects.toThrow(
      'ECONNRESET'
    );

    expect(executedQueries).toContain('BEGIN');
    expect(executedQueries).toContain('ROLLBACK');
    expect(rolledBack).toBe(true);
    expect(executedQueries.filter((q) => q === 'COMMIT')).toHaveLength(0);
  });

  // Adversarial Scenario 2: Concurrent 5-click burst in 200ms
  it('Scenario 2: Concurrent 5-click burst in 200ms deduplicates to exactly 1 write and 4 replays', async () => {
    let writeCount = 0;
    const client: StagingDbClientPort = {
      async query(sql: string, _params?: unknown[]) {
        if (sql.includes('INSERT INTO staging_preflight_registry')) {
          writeCount++;
        }
        return { rows: [] };
      },
    };

    const input: StagingVerificationInput = {
      operatorId: 'operator_devops_lead',
      environment: 'staging',
      databaseUrl: 'postgresql://encho_app:StrongP@ssw0rd!@neon-staging.encho.internal:5432/encho_staging?sslmode=require',
      idempotencyKey: 'idemp_staging_burst_key_999',
    };

    const promises = Array.from({ length: 5 }, () =>
      engine.verifyStagingEnvironmentWithAudit(client, input)
    );

    const results = await Promise.all(promises);

    expect(writeCount).toBe(1);
    expect(results).toHaveLength(5);
    const nonReplays = results.filter((r) => !r.isReplay);
    const replays = results.filter((r) => r.isReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(4);
    expect(nonReplays[0].status).toBe('VERIFIED');
  });

  // Adversarial Scenario 3: Superuser or BYPASSRLS credentials trigger immediate fail-closed rejection
  it('Scenario 3: Superuser or BYPASSRLS credentials trigger immediate fail-closed security rejection', async () => {
    const superuserClient: StagingDbClientPort = {
      async query(sql: string) {
        if (sql.includes('pg_roles')) {
          return {
            rows: [
              {
                current_user: 'postgres',
                rolname: 'postgres',
                rolsuper: true,
                rolbypassrls: true,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const input: StagingVerificationInput = {
      operatorId: 'operator_devops_lead',
      environment: 'staging',
      databaseUrl: 'postgresql://postgres:root@neon-staging.encho.internal:5432/encho_staging?sslmode=require',
      idempotencyKey: 'idemp_staging_superuser_check',
    };

    await expect(engine.verifyStagingEnvironmentWithAudit(superuserClient, input)).rejects.toThrow(
      'CRITICAL_SECURITY_LEAST_PRIVILEGE_VIOLATION'
    );
  });

  // Adversarial Scenario 4: Out-of-order staging migration sequences are sequence-fenced without regression
  it('Scenario 4: Out-of-order staging migration sequence updates are safely rejected without state regression', async () => {
    const payloadSeq4: StagingMigrationPayload = {
      migrationId: 'migration_035_adtech_governance',
      sequenceNumber: 4,
      status: 'APPLIED',
      appliedAt: Date.now(),
    };

    const payloadSeq2Outdated: StagingMigrationPayload = {
      migrationId: 'migration_033_provider_telemetry',
      sequenceNumber: 2,
      status: 'PENDING',
      appliedAt: Date.now() + 100,
    };

    const res1 = await engine.applyMigrationSequence(payloadSeq4);
    expect(res1.applied).toBe(true);
    expect(res1.currentSequence).toBe(4);
    expect(res1.isStale).toBe(false);

    const res2 = await engine.applyMigrationSequence(payloadSeq2Outdated);
    expect(res2.applied).toBe(false);
    expect(res2.isStale).toBe(true);
    expect(res2.currentSequence).toBe(4);
    expect(res2.reason).toBe('STALE_MIGRATION_SEQUENCE_REJECTED');
  });

  // Adversarial Scenario 5: Database URL without sslmode=require fails closed
  it('Scenario 5: Database URL missing sslmode=require strictly fails closed', async () => {
    const mockClient: StagingDbClientPort = {
      async query() {
        return { rows: [] };
      },
    };

    const insecureInput: StagingVerificationInput = {
      operatorId: 'operator_devops_lead',
      environment: 'staging',
      databaseUrl: 'postgresql://encho_app:secret@neon-staging.encho.internal:5432/encho_staging',
      idempotencyKey: 'idemp_insecure_db_url',
    };

    await expect(engine.verifyStagingEnvironmentWithAudit(mockClient, insecureInput)).rejects.toThrow(
      'DATABASE_SSL_NOT_ENFORCED'
    );
  });
});
