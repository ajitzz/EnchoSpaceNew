/**
 * Provider Security & Capability Hardening Engine
 *
 * Enforces FAANG L7/L8 Zero-Trust provider invariants for Package P6.1 (`PROV-M-01` & `PROV-G-01` Gates):
 * 1. Transactional Outbox for provider account registry and audit trail with atomic rollback.
 * 2. 200ms burst deduplication on concurrent provider account bindings.
 * 3. Strict Meta Housing Special Ad Category (HEC) compliance verification (no demographic or postal filtering).
 * 4. Google Ads MCC developer token and customer ID validation.
 * 5. Monotonic provider capability attestation sequence fencing against out-of-order webhooks.
 */

export interface ProviderDbClientPort {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface MetaAccountBindingInput {
  operatorId: string;
  businessManagerId: string;
  adAccountId: string;
  specialAdCategory: string;
  idempotencyKey: string;
}

export interface GoogleMccBindingInput {
  mccCustomerId: string;
  developerToken: string;
  managerAccountId: string;
}

export interface MetaHousingComplianceInput {
  specialAdCategory: string;
  hasAgeFilter: boolean;
  hasGenderFilter: boolean;
  hasPostalCodeFilter: boolean;
}

export interface ProviderCapabilityAttestationPayload {
  providerId: string;
  sequenceNumber: number;
  status: string;
  appliedAt: number;
}

export interface ProviderRegistrationResult {
  registrationId: string;
  status: 'REGISTERED';
  isReplay: boolean;
  timestamp: string;
}

export interface ProviderCapabilityAttestationResult {
  providerId: string;
  status: string;
  applied: boolean;
  isStale: boolean;
  currentSequence: number;
  reason?: string;
}

export class ProviderSecurityHardeningEngine {
  private inFlightRegistrations = new Map<string, Promise<ProviderRegistrationResult>>();
  private completedRegistrations = new Map<string, ProviderRegistrationResult>();
  private capabilitySequences = new Map<string, number>();
  private capabilityStatuses = new Map<string, string>();

  /**
   * Registers a Meta Master Ad Account with transactional audit log entry in an atomic SQL transaction.
   * Deduplicates rapid 200ms burst submissions via in-flight Promise caching.
   */
  async registerMetaMasterAccountWithAudit(
    dbClient: ProviderDbClientPort,
    input: MetaAccountBindingInput
  ): Promise<ProviderRegistrationResult> {
    // 1. Check idempotency cache
    const existing = this.completedRegistrations.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, isReplay: true };
    }

    // 2. Check in-flight burst deduplication
    const inFlight = this.inFlightRegistrations.get(input.idempotencyKey);
    if (inFlight) {
      const res = await inFlight;
      return { ...res, isReplay: true };
    }

    const executionPromise = (async (): Promise<ProviderRegistrationResult> => {
      await dbClient.query('BEGIN');
      try {
        const registrationId = `prov_meta_${input.idempotencyKey}`;

        // Step 1: Insert into provider_account_registry
        await dbClient.query(
          `INSERT INTO provider_account_registry (id, provider_type, business_manager_id, ad_account_id, special_ad_category, operator_id, idempotency_key, status)
           VALUES ('${registrationId}', 'META_ADS', '${input.businessManagerId}', '${input.adAccountId}', '${input.specialAdCategory}', '${input.operatorId}', '${input.idempotencyKey}', 'REGISTERED')`
        );

        // Step 2: Insert into platform_audit_log (Transactional Outbox)
        await dbClient.query(
          `INSERT INTO platform_audit_log (id, event_type, aggregate_id, actor_id, status)
           VALUES ('audit_${registrationId}', 'PROVIDER_META_ACCOUNT_BOUND', '${registrationId}', '${input.operatorId}', 'COMMITTED')`
        );

        await dbClient.query('COMMIT');

        const outcome: ProviderRegistrationResult = {
          registrationId,
          status: 'REGISTERED',
          isReplay: false,
          timestamp: new Date().toISOString(),
        };

        this.completedRegistrations.set(input.idempotencyKey, outcome);
        return outcome;
      } catch (err: unknown) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        this.inFlightRegistrations.delete(input.idempotencyKey);
      }
    })();

    this.inFlightRegistrations.set(input.idempotencyKey, executionPromise);
    return executionPromise;
  }

  /**
   * Validates Meta Housing Special Ad Category (HEC) compliance.
   * Properties must be declared as HOUSING, and demographic/postal filtering is strictly prohibited.
   */
  validateMetaHousingCompliance(input: MetaHousingComplianceInput): boolean {
    if (input.specialAdCategory !== 'HOUSING') {
      throw new Error(
        'META_HOUSING_CATEGORY_POLICY_VIOLATION: Encho properties fall strictly under Meta Housing Special Ad Category (HEC). Non-housing categorization is prohibited.'
      );
    }

    if (input.hasAgeFilter) {
      throw new Error(
        'META_HOUSING_CATEGORY_POLICY_VIOLATION: Demographic age targeting is strictly prohibited under Meta Housing Special Ad Category.'
      );
    }

    if (input.hasGenderFilter) {
      throw new Error(
        'META_HOUSING_CATEGORY_POLICY_VIOLATION: Demographic gender targeting is strictly prohibited under Meta Housing Special Ad Category.'
      );
    }

    if (input.hasPostalCodeFilter) {
      throw new Error(
        'META_HOUSING_CATEGORY_POLICY_VIOLATION: Postal code / ZIP code targeting is strictly prohibited under Meta Housing Special Ad Category.'
      );
    }

    return true;
  }

  /**
   * Validates Google Ads MCC developer token and Manager Customer ID formatting.
   * Customer ID must be 10 digits (formatted with hyphens or continuous).
   * Developer token must be at least 22 characters matching alphanumeric / standard token charset.
   */
  validateGoogleMccCredentials(input: GoogleMccBindingInput): boolean {
    const trimmedCid = input.mccCustomerId ? input.mccCustomerId.trim() : '';
    const trimmedToken = input.developerToken ? input.developerToken.trim() : '';

    if (!/^(\d{3}-\d{3}-\d{4}|\d{10})$/.test(trimmedCid)) {
      throw new Error(
        'INVALID_GOOGLE_MCC_CREDENTIALS: MCC Customer ID must be 10 digits formatted as 000-000-0000 or 0000000000.'
      );
    }

    if (trimmedToken.length < 22 || !/^[A-Za-z0-9_-]{22,}$/.test(trimmedToken)) {
      throw new Error(
        'INVALID_GOOGLE_MCC_CREDENTIALS: Google Ads developer token must be at least 22 valid token characters.'
      );
    }

    if (!input.managerAccountId || input.managerAccountId.trim().length === 0) {
      throw new Error(
        'INVALID_GOOGLE_MCC_CREDENTIALS: Google Ads Manager Account ID must not be empty.'
      );
    }

    return true;
  }

  /**
   * Applies an incoming provider capability attestation update with monotonic sequence fencing.
   */
  async applyCapabilitySequence(
    payload: ProviderCapabilityAttestationPayload
  ): Promise<ProviderCapabilityAttestationResult> {
    const currentSeq = this.capabilitySequences.get(payload.providerId) || 0;
    const currentStatus = this.capabilityStatuses.get(payload.providerId) || 'NOT_INITIALIZED';

    if (payload.sequenceNumber <= currentSeq) {
      return {
        providerId: payload.providerId,
        status: currentStatus,
        applied: false,
        isStale: true,
        currentSequence: currentSeq,
        reason: 'STALE_PROVIDER_SEQUENCE_REJECTED',
      };
    }

    this.capabilitySequences.set(payload.providerId, payload.sequenceNumber);
    this.capabilityStatuses.set(payload.providerId, payload.status);

    return {
      providerId: payload.providerId,
      status: payload.status,
      applied: true,
      isStale: false,
      currentSequence: payload.sequenceNumber,
    };
  }
}
