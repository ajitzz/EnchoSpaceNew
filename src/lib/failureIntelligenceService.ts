export type NormalizedErrorClass =
  | 'RATE_LIMIT'
  | 'TRANSIENT_INFRA'
  | 'AUTH_EXPIRED'
  | 'POLICY_DISAPPROVED'
  | 'DETERMINISTIC_ASSET_ERROR'
  | 'INVALID_PARAMETER'
  | 'BILLING_ERROR'
  | 'PERMISSION_ERROR'
  | 'EXTERNAL_OUTCOME_UNKNOWN'
  | 'RECONCILIATION_FAILURE'
  | 'INTERNAL_SYSTEM_ERROR'
  | 'UNKNOWN';

export type FailureOwner =
  | 'HOST_ERROR'
  | 'ADMIN_ERROR'
  | 'META_POLICY_ERROR'
  | 'SYSTEM_INFRA_ERROR'
  | 'PAYMENT_GATEWAY_ERROR';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FinancialRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FailureInputs {
  http_status?: number | null;
  meta_error_code?: number | string | null;
  meta_error_subcode?: number | string | null;
  meta_error_type?: string | null;
  response_headers?: Record<string, string> | null;
  network_exception_type?: string | null;
  publishing_stage?: string | null;
  current_publish_status?: string | null;
  rollback_status?: string | null;
  external_outcome?: string | null;
  financial_state?: string | null;
  raw_message?: string | null;
  correlation_id?: string | null;
}

export interface FailureIntelligenceContract {
  error_class: NormalizedErrorClass;
  severity: SeverityLevel;
  failure_stage: string;
  root_cause: string;
  owner: FailureOwner;
  retryable: boolean;
  retry_reason: string;
  host_action_required: boolean;
  host_guidance: string;
  admin_action_required: boolean;
  admin_guidance: string;
  financial_state: string;
  financial_risk: FinancialRiskLevel;
  external_object_state: string;
  reconciliation_required: boolean;
  
  // Admin-only diagnostic properties (redacted for Host)
  correlation_id?: string | null;
  meta_error_code?: number | string | null;
  meta_subcode?: number | string | null;
  http_status?: number | null;
  exact_exception_type?: string | null;
}

export class FailureIntelligenceService {
  /**
   * Pure deterministic classification engine.
   * Evaluates inputs with strict priority ordering and produces normalized classification.
   * ABSOLUTE INVARIANT: MUST NOT perform DB writes, money refunds, or state mutations.
   */
  static classifyFailure(inputs: FailureInputs): FailureIntelligenceContract {
    const httpStatus = inputs.http_status ? Number(inputs.http_status) : null;
    const rawCode = inputs.meta_error_code !== undefined && inputs.meta_error_code !== null ? inputs.meta_error_code : null;
    const errCode = rawCode !== null ? Number(rawCode) : null;
    const rawSubcode = inputs.meta_error_subcode !== undefined && inputs.meta_error_subcode !== null ? inputs.meta_error_subcode : null;
    const errSubcode = rawSubcode !== null ? Number(rawSubcode) : null;

    const msgLower = String(inputs.raw_message || '').toLowerCase();
    const exceptionType = String(inputs.network_exception_type || '').toUpperCase();
    const pubStatus = String(inputs.current_publish_status || '').toUpperCase();
    const rollbackStatus = String(inputs.rollback_status || '').toUpperCase();
    const stage = String(inputs.publishing_stage || 'UNKNOWN').toUpperCase();
    const financialState = String(inputs.financial_state || 'HOLDING').toUpperCase();

    // Determine External Object State
    let external_object_state = 'NO_EXTERNAL_OBJECTS';
    if (pubStatus === 'QUARANTINED' || rollbackStatus === 'QUARANTINED') {
      external_object_state = 'QUARANTINED';
    } else if (pubStatus === 'EXTERNAL_OUTCOME_UNKNOWN') {
      external_object_state = 'UNVERIFIED_EXTERNAL_OBJECTS';
    } else if (rollbackStatus === 'ROLLBACK_FAILED') {
      external_object_state = 'ORPHANED_EXTERNAL_OBJECTS';
    } else if (rollbackStatus === 'ROLLBACK_SUCCESS') {
      external_object_state = 'CLEANED_UP';
    } else if (pubStatus === 'SUCCESS') {
      external_object_state = 'ACTIVE_ON_META';
    }

    // Determine Financial Risk
    let financial_risk: FinancialRiskLevel = 'LOW';
    if (pubStatus === 'EXTERNAL_OUTCOME_UNKNOWN' || pubStatus === 'ROLLBACK_FAILED' || rollbackStatus === 'ROLLBACK_FAILED') {
      financial_risk = 'HIGH';
    } else if (pubStatus === 'QUARANTINED' || stage === 'RECONCILIATION') {
      financial_risk = 'MEDIUM';
    }

    // Determine Reconciliation Requirement
    const reconciliation_required = Boolean(
      pubStatus === 'EXTERNAL_OUTCOME_UNKNOWN' ||
      pubStatus === 'ROLLBACK_FAILED' ||
      rollbackStatus === 'ROLLBACK_FAILED' ||
      pubStatus === 'QUARANTINED'
    );

    // Default Fallback Contract Template
    let error_class: NormalizedErrorClass = 'UNKNOWN';
    let severity: SeverityLevel = 'MEDIUM';
    let owner: FailureOwner = 'SYSTEM_INFRA_ERROR';
    let retryable = false;
    let retry_reason = 'Non-retryable error encountered. Manual review required.';
    let host_action_required = false;
    let host_guidance = 'An issue occurred during processing. Support has been notified.';
    let admin_action_required = true;
    let admin_guidance = 'Review system diagnostic trace in Admin Telemetry.';
    let root_cause = inputs.raw_message || 'Unclassified execution failure.';

    // Check for explicit headers (e.g., Retry-After)
    const hasRetryHeader = Boolean(inputs.response_headers && (inputs.response_headers['retry-after'] || inputs.response_headers['Retry-After']));

    // 1. RECONCILIATION_FAILURE
    if (pubStatus === 'ROLLBACK_FAILED' || rollbackStatus === 'ROLLBACK_FAILED' || stage === 'RECONCILIATION' || msgLower.includes('reconciliation failed')) {
      error_class = 'RECONCILIATION_FAILURE';
      severity = 'CRITICAL';
      owner = 'ADMIN_ERROR';
      retryable = false;
      retry_reason = 'Active rollback or reconciliation failed to safely clean up external Meta objects. Requires manual admin quarantine.';
      host_action_required = false;
      host_guidance = 'Campaign setup encountered a safety check notice. Your payment is held securely in escrow while support reviews.';
      admin_action_required = true;
      admin_guidance = 'CRITICAL ACTION REQUIRED: Rollback/reconciliation failed. Quarantined Meta objects require manual admin inspection or active cleanup.';
      root_cause = 'Automatic rollback failed during cleanup of Meta external assets.';
    }
    // 2. EXTERNAL_OUTCOME_UNKNOWN
    else if (pubStatus === 'EXTERNAL_OUTCOME_UNKNOWN' || inputs.external_outcome === 'EXTERNAL_OUTCOME_UNKNOWN') {
      error_class = 'EXTERNAL_OUTCOME_UNKNOWN';
      severity = 'HIGH';
      owner = 'SYSTEM_INFRA_ERROR';
      retryable = false; // Cannot retry until reconciliation resolves external state
      retry_reason = 'Network connection dropped before Meta dispatch confirmation was received. Status is UNKNOWN until reconciliation runs.';
      host_action_required = false;
      host_guidance = 'Publishing status is currently verifying with Meta. Your escrow funds are held safely.';
      admin_action_required = true;
      admin_guidance = 'ACTION REQUIRED: External outcome unknown. Run active reconciliation or verify Meta campaign ID manually.';
      root_cause = 'Meta API response timed out before creation confirmation could be recorded.';
    }
    // 3. RATE_LIMIT
    else if (
      httpStatus === 429 ||
      errCode === 17 ||
      errCode === 4 ||
      errCode === 32 ||
      hasRetryHeader ||
      msgLower.includes('rate limit') ||
      msgLower.includes('throttled') ||
      msgLower.includes('too many requests')
    ) {
      error_class = 'RATE_LIMIT';
      severity = 'MEDIUM';
      owner = 'SYSTEM_INFRA_ERROR';
      retryable = true;
      retry_reason = 'Meta API rate limit reached. Automated exponential backoff retry eligible.';
      host_action_required = false;
      host_guidance = 'Temporary high network traffic. Our automated queue is retrying setup automatically; no action required.';
      admin_action_required = false;
      admin_guidance = 'Meta API rate limit encountered. System will automatically retry when rate limit window elapses.';
      root_cause = 'Upstream Meta Graph API rate limit threshold exceeded.';
    }
    // 4. AUTH_EXPIRED
    else if (
      httpStatus === 401 ||
      errCode === 190 ||
      errSubcode === 460 ||
      errSubcode === 463 ||
      errSubcode === 467 ||
      msgLower.includes('token') ||
      msgLower.includes('oauth') ||
      msgLower.includes('session has been invalidated') ||
      msgLower.includes('access token')
    ) {
      error_class = 'AUTH_EXPIRED';
      severity = 'CRITICAL';
      owner = 'SYSTEM_INFRA_ERROR';
      retryable = false;
      retry_reason = 'Meta Master OAuth access token expired or invalidated. Non-retryable until token refreshed by Admin.';
      host_action_required = false;
      host_guidance = 'System credentials are being updated. Your campaign is queued and will process shortly.';
      admin_action_required = true;
      admin_guidance = 'ACTION REQUIRED: Meta System Master Access Token expired or invalid. Re-authenticate Meta OAuth in Admin Settings.';
      root_cause = 'Meta Master OAuth access token expired or was invalidated.';
    }
    // 5. POLICY_DISAPPROVED
    else if (
      (errCode === 100 && errSubcode === 33) ||
      msgLower.includes('housing') ||
      msgLower.includes('special ad category') ||
      msgLower.includes('policy') ||
      msgLower.includes('disapproved') ||
      msgLower.includes('housing_policy') ||
      msgLower.includes('discriminatory')
    ) {
      error_class = 'POLICY_DISAPPROVED';
      severity = 'HIGH';
      owner = 'META_POLICY_ERROR';
      retryable = false;
      retry_reason = 'Campaign violates Meta Special Ad Category (Housing) policies. Non-retryable without ad copy/targeting edits.';
      host_action_required = true;
      host_guidance = 'ACTION REQUIRED: Ad text or targeting flags require adjustment under Meta Housing Policy. Please update prohibited claims and re-submit.';
      admin_action_required = true;
      admin_guidance = 'Meta Policy Disapproval (Housing Category). Review host edit submission in Admin Queue.';
      root_cause = 'Campaign ad copy or targeting flags triggered Meta Housing Policy disapproval.';
    }
    // 6. DETERMINISTIC_ASSET_ERROR
    else if (
      msgLower.includes('aspect ratio') ||
      msgLower.includes('resolution') ||
      msgLower.includes('image size') ||
      msgLower.includes('media format') ||
      msgLower.includes('dimensions') ||
      msgLower.includes('invalid image')
    ) {
      error_class = 'DETERMINISTIC_ASSET_ERROR';
      severity = 'MEDIUM';
      owner = 'HOST_ERROR';
      retryable = false;
      retry_reason = 'Uploaded creative image does not meet Meta aspect ratio or resolution requirements. Host action required.';
      host_action_required = true;
      host_guidance = 'ACTION REQUIRED: Creative image does not meet Meta resolution constraints. Please upload high-resolution 1:1 media.';
      admin_action_required = false;
      admin_guidance = 'Host uploaded non-compliant media file. Awaiting host media update.';
      root_cause = 'Media asset failed Meta minimum aspect ratio or resolution requirements.';
    }
    // 7. BILLING_ERROR
    else if (
      errCode === 1487001 ||
      errCode === 270 ||
      msgLower.includes('billing') ||
      msgLower.includes('ad account balance') ||
      msgLower.includes('credit limit') ||
      msgLower.includes('payment method')
    ) {
      error_class = 'BILLING_ERROR';
      severity = 'CRITICAL';
      owner = 'PAYMENT_GATEWAY_ERROR';
      retryable = false;
      retry_reason = 'Encho Master Ad Account payment method or credit threshold issue.';
      host_action_required = false;
      host_guidance = 'Campaign setup is completing financial verification. Your funds are protected in escrow.';
      admin_action_required = true;
      admin_guidance = 'CRITICAL ACTION REQUIRED: Check Encho Master Ad Account billing threshold and credit card status in Meta Business Manager.';
      root_cause = 'Meta Master Ad Account billing limit reached or credit card declined.';
    }
    // 8. PERMISSION_ERROR
    else if (
      errCode === 200 ||
      errCode === 294 ||
      msgLower.includes('permission') ||
      msgLower.includes('not authorized') ||
      msgLower.includes('access denied') ||
      msgLower.includes('scope')
    ) {
      error_class = 'PERMISSION_ERROR';
      severity = 'CRITICAL';
      owner = 'ADMIN_ERROR';
      retryable = false;
      retry_reason = 'Encho Master System User lacks required page or ad account permissions.';
      host_action_required = false;
      host_guidance = 'System setup is completing permissions verification. Your campaign is safely queued.';
      admin_action_required = true;
      admin_guidance = 'ACTION REQUIRED: Grant required Page Management / Ads Management permissions to Master System User in Meta Business Manager.';
      root_cause = 'System User missing required permissions on Meta Ad Account or Page.';
    }
    // 9. INVALID_PARAMETER
    else if (
      httpStatus === 400 ||
      errCode === 100 ||
      errCode === 108 ||
      msgLower.includes('invalid parameter') ||
      msgLower.includes('missing required field') ||
      msgLower.includes('param')
    ) {
      error_class = 'INVALID_PARAMETER';
      severity = 'MEDIUM';
      owner = 'HOST_ERROR';
      retryable = false;
      retry_reason = 'Campaign payload contains invalid parameters or missing required fields.';
      host_action_required = true;
      host_guidance = 'ACTION REQUIRED: Some campaign details are missing or invalid. Please check fields and re-submit.';
      admin_action_required = true;
      admin_guidance = 'Invalid API payload parameters. Inspect payload fields in Admin Telemetry.';
      root_cause = 'Meta API rejected payload due to invalid or missing parameter values.';
    }
    // 10. TRANSIENT_INFRA
    else if (
      [500, 502, 503, 504].includes(httpStatus || 0) ||
      ['ETIMEDOUT', 'ECONNRESET', 'FETCH_FAILED', 'ENOTFOUND', 'TIMEOUT'].includes(exceptionType) ||
      msgLower.includes('timeout') ||
      msgLower.includes('connection reset') ||
      msgLower.includes('network error') ||
      msgLower.includes('gateway timeout')
    ) {
      error_class = 'TRANSIENT_INFRA';
      severity = 'HIGH';
      owner = 'SYSTEM_INFRA_ERROR';
      retryable = true;
      retry_reason = 'Transient infrastructure network timeout or gateway drop. Automated retry eligible.';
      host_action_required = false;
      host_guidance = 'Temporary network drop to advertising network. Dispatch is retrying automatically.';
      admin_action_required = false;
      admin_guidance = 'Transient upstream network/gateway error. Automated queue handling retry.';
      root_cause = 'Transient network timeout or upstream gateway disconnection.';
    }
    // 11. INTERNAL_SYSTEM_ERROR
    else if (httpStatus === 500 || msgLower.includes('database') || msgLower.includes('internal error')) {
      error_class = 'INTERNAL_SYSTEM_ERROR';
      severity = 'HIGH';
      owner = 'SYSTEM_INFRA_ERROR';
      retryable = true;
      retry_reason = 'Internal application error during processing.';
      host_action_required = false;
      host_guidance = 'Internal system processing delay. Automated system is retrying.';
      admin_action_required = true;
      admin_guidance = 'Internal application exception. Review server logs.';
      root_cause = 'Internal application processing error.';
    }

    return {
      error_class,
      severity,
      failure_stage: stage,
      root_cause,
      owner,
      retryable,
      retry_reason,
      host_action_required,
      host_guidance,
      admin_action_required,
      admin_guidance,
      financial_state: financialState,
      financial_risk,
      external_object_state,
      reconciliation_required,
      correlation_id: inputs.correlation_id || null,
      meta_error_code: errCode !== null ? errCode : (inputs.meta_error_code || null),
      meta_subcode: errSubcode !== null ? errSubcode : (inputs.meta_error_subcode || null),
      http_status: httpStatus,
      exact_exception_type: inputs.network_exception_type || null
    };
  }

  /**
   * Role-based projection helper for Failure Intelligence.
   * Host projection REDACTS correlation_id, meta_error_code, meta_subcode, http_status, admin_guidance, etc.
   */
  static projectFailureIntelligenceForViewer(
    intelligence: FailureIntelligenceContract | undefined | null,
    viewerContext: { role: string; isAdmin?: boolean }
  ): Partial<FailureIntelligenceContract> {
    if (!intelligence) {
      return {
        error_class: 'UNKNOWN',
        severity: 'INFO',
        failure_stage: 'NONE',
        root_cause: 'No failure detected',
        retryable: false,
        host_action_required: false
      };
    }

    const isAdmin = Boolean(viewerContext.isAdmin || viewerContext.role === 'admin');

    if (isAdmin) {
      // ADMIN PROJECTION: Complete diagnostic transparency
      return intelligence;
    }

    // HOST PROJECTION: Redact diagnostic tokens, correlation IDs, error codes, HTTP status, and admin actions
    return {
      error_class: intelligence.error_class,
      severity: intelligence.severity,
      failure_stage: intelligence.failure_stage,
      root_cause: intelligence.host_action_required ? intelligence.root_cause : 'Processing update in progress',
      owner: intelligence.owner,
      retryable: intelligence.retryable,
      retry_reason: intelligence.host_action_required ? intelligence.retry_reason : 'System is managing retry automatically',
      host_action_required: intelligence.host_action_required,
      host_guidance: intelligence.host_guidance,
      financial_state: intelligence.financial_state,
      financial_risk: intelligence.financial_risk,
      external_object_state: intelligence.external_object_state,
      reconciliation_required: intelligence.reconciliation_required
      // REDACTED FOR HOST:
      // - correlation_id
      // - meta_error_code
      // - meta_subcode
      // - http_status
      // - admin_action_required
      // - admin_guidance
      // - exact_exception_type
    };
  }
}
