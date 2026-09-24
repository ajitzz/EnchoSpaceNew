import { describe, expect, it, vi } from 'vitest';
import {
  SchemaBootstrapEngine,
  type RolePrivilegeProfile,
  type MigrationRevisionPayload,
  type SchemaBootstrapPayload,
  type DbClientPort,
} from '../../lib/platform/schemaBootstrapEngine.js';

describe('CR1 Package P0.4: Canonical Base-Schema Bootstrap & Restricted Runtime Login Adversarial Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 1: Database Connection Drops Halfway Through
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 1: Database Connection Drops Halfway Through Bootstrap / Grants', () => {
    it('executes atomic rollback, creates 0 zombie grant rows, and leaves catalog uncommitted', async () => {
      let rollbacksCount = 0;
      let commitsCount = 0;
      const grantsApplied: string[] = [];

      const mockDbClient: DbClientPort = {
        query: vi.fn(async (sql: string) => {
          if (sql === 'BEGIN') return {};
          if (sql === 'ROLLBACK') {
            rollbacksCount++;
            grantsApplied.length = 0;
            return {};
          }
          if (sql === 'COMMIT') {
            commitsCount++;
            return {};
          }
          if (sql.includes('GRANT SELECT, INSERT, UPDATE ON listings')) {
            grantsApplied.push('grant_listings');
            // Simulate sudden connection failure before transaction commits
            throw new Error('ECONNRESET: Database connection closed unexpectedly during predecessor grant application');
          }
          return {};
        }),
      };

      const engine = new SchemaBootstrapEngine();

      await expect(
        engine.executeBootstrapTransaction(mockDbClient, {
          roleName: 'encho_restricted_app',
          predecessorTables: ['users', 'listings', 'room_types', 'media_assets'],
          version: '036_cr1_base',
        })
      ).rejects.toThrow('ECONNRESET');

      expect(rollbacksCount).toBe(1);
      expect(commitsCount).toBe(0);
      expect(grantsApplied.length).toBe(0); // 0 zombie/partial grants!
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 2: Host/Admin Clicks Submit 5 Times in 200 Milliseconds
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 2: Host/Admin Clicks Submit 5 Times in 200 Milliseconds', () => {
    it('deduplicates rapid burst submissions via idempotency key, executing exactly 1 bootstrap operation', async () => {
      const engine = new SchemaBootstrapEngine();
      const idempotencyKey = 'idemp_bootstrap_burst_' + Date.now();

      let bootstrapHandlerInvocations = 0;
      const triggerBootstrap = async () => {
        return engine.processBootstrapIdempotent({
          idempotencyKey,
          version: '036_cr1_base',
          roleName: 'encho_restricted_app',
          handler: async () => {
            bootstrapHandlerInvocations++;
            await new Promise((resolve) => setTimeout(resolve, 50)); // Simulated processing latency
            return {
              bootstrapId: 'boot_036_complete',
              status: 'APPLIED' as const,
              tablesProvisioned: 4,
            };
          },
        });
      };

      // Fire 5 identical requests within 200ms
      const burstResults = await Promise.all([
        triggerBootstrap(),
        triggerBootstrap(),
        triggerBootstrap(),
        triggerBootstrap(),
        triggerBootstrap(),
      ]);

      // Exactly 1 handler execution
      expect(bootstrapHandlerInvocations).toBe(1);

      // All 5 responses return identical bootstrap results
      burstResults.forEach((res) => {
        expect(res.bootstrapId).toBe('boot_036_complete');
        expect(res.status).toBe('APPLIED');
        expect(res.tablesProvisioned).toBe(4);
      });

      // The 4 deduplicated replays must be marked as isReplay: true
      const originals = burstResults.filter((r) => r.isReplay === false);
      const replays = burstResults.filter((r) => r.isReplay === true);
      expect(originals.length).toBe(1);
      expect(replays.length).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL SCENARIO 3: Schema Migration Payload Arrives Out of Order
  // ──────────────────────────────────────────────────────────────────────────
  describe('Adversarial Scenario 3: Schema Migration Payload Arrives Out of Order', () => {
    it('strictly enforces monotonic migration versioning and rejects out-of-order schema revisions', () => {
      const engine = new SchemaBootstrapEngine();

      const currentCatalogState = {
        lastAppliedVersion: 36,
        lastAppliedMigration: '036_cr1_iam_core.sql',
        appliedAt: '2026-09-24T12:00:00Z',
      };

      // Fresh migration 37 arrives
      const migration37: MigrationRevisionPayload = {
        versionNumber: 37,
        migrationFile: '037_cr1_platform_outbox.sql',
        checksum: 'a'.repeat(64),
      };

      const result37 = engine.evaluateMigrationRevision(currentCatalogState, migration37);
      expect(result37.valid).toBe(true);
      expect(result37.isStale).toBe(false);

      // Stale / out-of-order migration 35 arrives AFTER migration 36
      const migration35: MigrationRevisionPayload = {
        versionNumber: 35,
        migrationFile: '035_old_schema.sql',
        checksum: 'b'.repeat(64),
      };

      const result35 = engine.evaluateMigrationRevision(currentCatalogState, migration35);
      expect(result35.valid).toBe(false);
      expect(result35.isStale).toBe(true);
      expect(result35.error).toContain('MIGRATION_OUT_OF_ORDER: Cannot apply migration version 35 after version 36');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Restricted-Runtime Role Privilege & Non-Bypass RLS Assertion
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: Restricted-Runtime Role Privilege & Non-Bypass RLS Assertion', () => {
    it('strictly enforces NOSUPERUSER and NOBYPASSRLS for application runtime role', () => {
      const engine = new SchemaBootstrapEngine();

      // Safe least-privilege role
      const safeRole: RolePrivilegeProfile = {
        roleName: 'encho_restricted_app',
        canLogin: true,
        isSuperuser: false,
        bypassRls: false,
        grantedTables: ['users', 'listings', 'room_types', 'media_assets'],
        forbiddenPrivileges: [],
      };

      const safeCheck = engine.validateRolePrivileges(safeRole);
      expect(safeCheck.compliant).toBe(true);
      expect(safeCheck.violations.length).toBe(0);

      // Dangerous role with BYPASSRLS
      const bypassRole: RolePrivilegeProfile = {
        roleName: 'encho_unsafe_role',
        canLogin: true,
        isSuperuser: false,
        bypassRls: true, // Violation!
        grantedTables: ['users', 'listings'],
        forbiddenPrivileges: [],
      };

      const bypassCheck = engine.validateRolePrivileges(bypassRole);
      expect(bypassCheck.compliant).toBe(false);
      expect(bypassCheck.violations).toContain('BYPASSRLS_FORBIDDEN: Application runtime role cannot bypass Row-Level Security');

      // Dangerous role with SUPERUSER
      const superRole: RolePrivilegeProfile = {
        roleName: 'encho_superuser_role',
        canLogin: true,
        isSuperuser: true, // Violation!
        bypassRls: false,
        grantedTables: ['users'],
        forbiddenPrivileges: [],
      };

      const superCheck = engine.validateRolePrivileges(superRole);
      expect(superCheck.compliant).toBe(false);
      expect(superCheck.violations).toContain('SUPERUSER_FORBIDDEN: Application runtime role must be NOSUPERUSER');

      // Role with excessive destructive permissions (e.g. TRUNCATE, DROP)
      const destructiveRole: RolePrivilegeProfile = {
        roleName: 'encho_destructive_role',
        canLogin: true,
        isSuperuser: false,
        bypassRls: false,
        grantedTables: ['users'],
        forbiddenPrivileges: ['TRUNCATE', 'DROP'],
      };

      const destructiveCheck = engine.validateRolePrivileges(destructiveRole);
      expect(destructiveCheck.compliant).toBe(false);
      expect(destructiveCheck.violations).toContain('DESTRUCTIVE_PRIVILEGE_FORBIDDEN: Role possesses forbidden privileges: TRUNCATE, DROP');
    });
  });
});
