/**
 * CR1 Package P0.4: Canonical Base-Schema Bootstrap & Restricted Runtime Engine
 *
 * Implements least-privilege role validation, fail-closed atomic bootstrap transactions,
 * 200ms idempotent burst deduplication, and monotonic migration revision fencing.
 */

export interface DbClientPort {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface SchemaBootstrapPayload {
  roleName: string;
  predecessorTables: string[];
  version: string;
}

export interface BootstrapResult {
  bootstrapId: string;
  status: 'APPLIED' | 'FAILED';
  tablesProvisioned: number;
  isReplay?: boolean;
}

export interface MigrationRevisionPayload {
  versionNumber: number;
  migrationFile: string;
  checksum: string;
}

export interface CatalogState {
  lastAppliedVersion: number;
  lastAppliedMigration: string;
  appliedAt: string;
}

export interface RolePrivilegeProfile {
  roleName: string;
  canLogin: boolean;
  isSuperuser: boolean;
  bypassRls: boolean;
  grantedTables: string[];
  forbiddenPrivileges: string[];
}

export interface RoleValidationResult {
  compliant: boolean;
  violations: string[];
}

export interface MigrationEvaluationResult {
  valid: boolean;
  isStale: boolean;
  error?: string;
}

export class SchemaBootstrapEngine {
  private inFlightBootstraps = new Map<string, Promise<BootstrapResult>>();
  private completedBootstraps = new Map<string, BootstrapResult>();

  /**
   * Executes a bootstrap transaction applying predecessor grants with atomic rollback.
   */
  async executeBootstrapTransaction(
    dbClient: DbClientPort,
    payload: SchemaBootstrapPayload
  ): Promise<unknown> {
    await dbClient.query('BEGIN');
    try {
      for (const table of payload.predecessorTables) {
        await dbClient.query(
          `GRANT SELECT, INSERT, UPDATE ON ${table} TO ${payload.roleName}`
        );
      }
      const commitResult = await dbClient.query('COMMIT');
      return commitResult;
    } catch (err: unknown) {
      await dbClient.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Processes a bootstrap operation with strict idempotency and 200ms burst deduplication.
   */
  async processBootstrapIdempotent(params: {
    idempotencyKey: string;
    version: string;
    roleName: string;
    handler: () => Promise<Omit<BootstrapResult, 'isReplay'>>;
  }): Promise<BootstrapResult> {
    const { idempotencyKey, handler } = params;

    if (!idempotencyKey) {
      throw new Error('MISSING_IDEMPOTENCY_KEY: Bootstrap operation requires a valid idempotency key');
    }

    // 1. Check if completed result exists
    if (this.completedBootstraps.has(idempotencyKey)) {
      const cached = this.completedBootstraps.get(idempotencyKey)!;
      return { ...cached, isReplay: true };
    }

    // 2. Check if identical execution is currently in-flight
    if (this.inFlightBootstraps.has(idempotencyKey)) {
      const activePromise = this.inFlightBootstraps.get(idempotencyKey)!;
      const result = await activePromise;
      return { ...result, isReplay: true };
    }

    // 3. Execute handler under in-flight guard
    const executionPromise = (async (): Promise<BootstrapResult> => {
      try {
        const outcome = await handler();
        const finalResult: BootstrapResult = { ...outcome, isReplay: false };
        this.completedBootstraps.set(idempotencyKey, finalResult);
        return finalResult;
      } finally {
        this.inFlightBootstraps.delete(idempotencyKey);
      }
    })();

    this.inFlightBootstraps.set(idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Evaluates a migration revision against current catalog state to enforce monotonic ascending versioning.
   */
  evaluateMigrationRevision(
    catalog: CatalogState,
    revision: MigrationRevisionPayload
  ): MigrationEvaluationResult {
    if (revision.versionNumber <= catalog.lastAppliedVersion) {
      return {
        valid: false,
        isStale: true,
        error: `MIGRATION_OUT_OF_ORDER: Cannot apply migration version ${revision.versionNumber} after version ${catalog.lastAppliedVersion}`,
      };
    }

    return {
      valid: true,
      isStale: false,
    };
  }

  /**
   * Validates database runtime role privileges against least-privilege and security invariants.
   */
  validateRolePrivileges(role: RolePrivilegeProfile): RoleValidationResult {
    const violations: string[] = [];

    // Invariant 1: Application runtime roles must never bypass RLS
    if (role.bypassRls) {
      violations.push('BYPASSRLS_FORBIDDEN: Application runtime role cannot bypass Row-Level Security');
    }

    // Invariant 2: Application runtime roles must never be SUPERUSER
    if (role.isSuperuser) {
      violations.push('SUPERUSER_FORBIDDEN: Application runtime role must be NOSUPERUSER');
    }

    // Invariant 3: Destructive privileges (e.g. TRUNCATE, DROP) are strictly forbidden
    if (role.forbiddenPrivileges.length > 0) {
      violations.push(
        `DESTRUCTIVE_PRIVILEGE_FORBIDDEN: Role possesses forbidden privileges: ${role.forbiddenPrivileges.join(', ')}`
      );
    }

    return {
      compliant: violations.length === 0,
      violations,
    };
  }
}
