-- CR1 P2: internal workforce authority. This migration creates no staff member
-- automatically and grants no application role. Deployment must apply the
-- reviewed least-privilege grants and run an explicit owner bootstrap manifest.
SELECT pg_advisory_xact_lock(82749102);

CREATE TABLE internal_organizations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_key TEXT NOT NULL UNIQUE CHECK(organization_key ~ '^[a-z][a-z0-9-]{1,62}$'),
 display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 160),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
 version INT NOT NULL DEFAULT 1 CHECK(version > 0),
 created_by INT REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE internal_permission_catalog (
 permission_code TEXT PRIMARY KEY CHECK(permission_code ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$'),
 resource_type TEXT NOT NULL CHECK(resource_type IN ('ORGANIZATION','WORKFORCE','HOST_ACCOUNT','PROPERTY','LISTING','OFFER','CAMPAIGN','CREATIVE_PACKAGE','STRATEGY','CORRIDOR','PROVIDER_ACCOUNT','FINANCIAL_CONTRACT','SETTLEMENT','CONVERSATION','SERVICE_CASE','INCIDENT')),
 risk_class TEXT NOT NULL CHECK(risk_class IN ('STANDARD','SENSITIVE','CRITICAL')),
 step_up_required BOOLEAN NOT NULL,
 checker_policy TEXT NOT NULL CHECK(checker_policy IN ('NONE','DISTINCT_ACTOR')),
 description TEXT NOT NULL CHECK(length(description) BETWEEN 10 AND 500),
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE internal_iam_policy_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 version INT NOT NULL UNIQUE CHECK(version > 0),
 config JSONB NOT NULL CHECK(jsonb_typeof(config)='object'),
 config_hash TEXT NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
 approval_status TEXT NOT NULL CHECK(approval_status IN ('PENDING_FOUNDER_OPERATIONAL_APPROVAL','APPROVED')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_by INT REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(config ?& ARRAY['version','invitationTtlSeconds','staffSessionIdleSeconds','staffSessionAbsoluteSeconds','stepUpTtlSeconds','minimumOwnersForProduction','allRefundsRequireChecker','allSettlementsRequireChecker','allActivationsRequireChecker','operationalApproval','amountThresholds']),
 CHECK(config->>'operationalApproval'=approval_status),
 CHECK((config->>'version')::int=version),
 CHECK((config->>'invitationTtlSeconds')::int BETWEEN 900 AND 604800),
 CHECK((config->>'staffSessionIdleSeconds')::int BETWEEN 300 AND 28800),
 CHECK((config->>'staffSessionAbsoluteSeconds')::int BETWEEN 900 AND 86400),
 CHECK((config->>'stepUpTtlSeconds')::int BETWEEN 60 AND 1800),
 CHECK((jsonb_typeof(config->'assignmentLeaseSeconds')='number' AND (config->>'assignmentLeaseSeconds')::int BETWEEN 60 AND 3600) IS TRUE),
 CHECK((config->>'minimumOwnersForProduction')::int >= 2),
 CHECK((config->>'allRefundsRequireChecker')::boolean),
 CHECK((config->>'allSettlementsRequireChecker')::boolean),
 CHECK((config->>'allActivationsRequireChecker')::boolean),
 CHECK((jsonb_typeof(config->'version')='number' AND jsonb_typeof(config->'invitationTtlSeconds')='number' AND jsonb_typeof(config->'staffSessionIdleSeconds')='number' AND jsonb_typeof(config->'staffSessionAbsoluteSeconds')='number' AND jsonb_typeof(config->'stepUpTtlSeconds')='number' AND jsonb_typeof(config->'minimumOwnersForProduction')='number' AND jsonb_typeof(config->'allRefundsRequireChecker')='boolean' AND jsonb_typeof(config->'allSettlementsRequireChecker')='boolean' AND jsonb_typeof(config->'allActivationsRequireChecker')='boolean' AND jsonb_typeof(config->'amountThresholds')='object' AND jsonb_typeof(config->'operationalApproval')='string') IS TRUE),
 CHECK((config->>'staffSessionAbsoluteSeconds')::int >= (config->>'staffSessionIdleSeconds')::int)
);

CREATE TABLE internal_iam_current_policy (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 version_id UUID NOT NULL REFERENCES internal_iam_policy_versions(id) ON DELETE RESTRICT,
 updated_by INT REFERENCES users(id) ON DELETE RESTRICT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE internal_role_definitions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 role_key TEXT NOT NULL CHECK(role_key ~ '^[a-z][a-z0-9_]{1,79}$'),
 display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 120),
 description TEXT NOT NULL CHECK(length(description) BETWEEN 10 AND 500),
 created_by INT REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,role_key),
 UNIQUE(id,organization_id)
);

CREATE TABLE internal_role_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 role_id UUID NOT NULL REFERENCES internal_role_definitions(id) ON DELETE RESTRICT,
 organization_id UUID NOT NULL,
 version INT NOT NULL CHECK(version > 0),
 config_hash TEXT NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_by INT REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(role_id,version),
 UNIQUE(id,role_id,organization_id),
 FOREIGN KEY(role_id,organization_id) REFERENCES internal_role_definitions(id,organization_id) ON DELETE RESTRICT
);

CREATE TABLE internal_role_permissions (
 role_version_id UUID NOT NULL REFERENCES internal_role_versions(id) ON DELETE RESTRICT,
 permission_code TEXT NOT NULL REFERENCES internal_permission_catalog(permission_code) ON DELETE RESTRICT,
 PRIMARY KEY(role_version_id,permission_code)
);

CREATE TABLE internal_role_current_versions (
 role_id UUID PRIMARY KEY REFERENCES internal_role_definitions(id) ON DELETE RESTRICT,
 organization_id UUID NOT NULL,
 version_id UUID NOT NULL,
 updated_by INT REFERENCES users(id) ON DELETE RESTRICT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(version_id,role_id,organization_id) REFERENCES internal_role_versions(id,role_id,organization_id) ON DELETE RESTRICT
);

CREATE TABLE internal_organization_invitations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 email_normalized TEXT NOT NULL CHECK(email_normalized=lower(btrim(email_normalized)) AND length(email_normalized) BETWEEN 3 AND 254 AND position('@' IN email_normalized)>1),
 token_hash TEXT NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 grant_bundle JSONB NOT NULL CHECK(jsonb_typeof(grant_bundle)='array' AND jsonb_array_length(grant_bundle) BETWEEN 1 AND 20),
 grant_bundle_hash TEXT NOT NULL CHECK(grant_bundle_hash ~ '^[a-f0-9]{64}$'),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
 expires_at TIMESTAMPTZ NOT NULL,
 invited_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 accepted_by INT REFERENCES users(id) ON DELETE RESTRICT,
 accepted_at TIMESTAMPTZ,
 revoked_by INT REFERENCES users(id) ON DELETE RESTRICT,
 revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(expires_at>created_at),
 CHECK((status='ACCEPTED')=(accepted_by IS NOT NULL AND accepted_at IS NOT NULL)),
 CHECK((status='REVOKED')=(revoked_by IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX internal_invitation_one_pending ON internal_organization_invitations(organization_id,email_normalized) WHERE status='PENDING';

CREATE TABLE internal_organization_memberships (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','SUSPENDED','OFFBOARDED')),
 version INT NOT NULL DEFAULT 1 CHECK(version > 0),
 accepted_invitation_id UUID REFERENCES internal_organization_invitations(id) ON DELETE RESTRICT,
 accepted_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ,
 suspended_at TIMESTAMPTZ,
 offboarded_at TIMESTAMPTZ,
 changed_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 change_reason TEXT NOT NULL CHECK(length(change_reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,user_id),
 UNIQUE(id,organization_id),
 CHECK(expires_at IS NULL OR expires_at>accepted_at),
 CHECK((status='SUSPENDED')=(suspended_at IS NOT NULL)),
 CHECK((status='OFFBOARDED')=(offboarded_at IS NOT NULL))
);

CREATE TABLE internal_membership_grants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 membership_id UUID NOT NULL,
 role_version_id UUID NOT NULL,
 scope_type TEXT NOT NULL CHECK(scope_type IN ('ORGANIZATION','WORKFORCE','HOST_ACCOUNT','PROPERTY','LISTING','OFFER','CAMPAIGN','CREATIVE_PACKAGE','STRATEGY','CORRIDOR','PROVIDER_ACCOUNT','FINANCIAL_CONTRACT','SETTLEMENT','CONVERSATION','SERVICE_CASE','INCIDENT')),
 scope_id TEXT NOT NULL CHECK(scope_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$'),
 provider TEXT CHECK(provider IN ('META','GOOGLE')),
 environment TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 max_amount_minor BIGINT CHECK(max_amount_minor>=0),
 valid_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 valid_until TIMESTAMPTZ,
 grant_hash TEXT NOT NULL CHECK(grant_hash ~ '^[a-f0-9]{64}$'),
 granted_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(membership_id,grant_hash),
 FOREIGN KEY(membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(role_version_id) REFERENCES internal_role_versions(id) ON DELETE RESTRICT,
 CHECK(valid_until IS NULL OR valid_until>valid_from)
);

CREATE TABLE internal_membership_grant_revocations (
 grant_id UUID PRIMARY KEY REFERENCES internal_membership_grants(id) ON DELETE RESTRICT,
 revoked_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 revoked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE internal_staff_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL,
 membership_id UUID NOT NULL,
 environment TEXT NOT NULL DEFAULT 'LOCAL' CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 token_hash TEXT NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','EXPIRED')),
 assurance_level TEXT NOT NULL CHECK(assurance_level IN ('AAL1','AAL2','PHISHING_RESISTANT')),
 authenticated_at TIMESTAMPTZ NOT NULL,
 idle_expires_at TIMESTAMPTZ NOT NULL,
 absolute_expires_at TIMESTAMPTZ NOT NULL,
 revoked_by INT REFERENCES users(id) ON DELETE RESTRICT,
 revoked_at TIMESTAMPTZ,
 revoke_reason TEXT CHECK(revoke_reason IS NULL OR length(revoke_reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 UNIQUE(id,membership_id,organization_id),
 CHECK(idle_expires_at>authenticated_at AND absolute_expires_at>=idle_expires_at),
 CHECK((status='REVOKED')=(revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
);

CREATE TABLE internal_step_up_challenges (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL,
 membership_id UUID NOT NULL,
 session_id UUID NOT NULL,
 action_hash TEXT NOT NULL CHECK(action_hash ~ '^[a-f0-9]{64}$'),
 required_assurance TEXT NOT NULL CHECK(required_assurance IN ('AAL2','PHISHING_RESISTANT')),
 achieved_assurance TEXT CHECK(achieved_assurance IN ('AAL2','PHISHING_RESISTANT')),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','CONSUMED','EXPIRED','FAILED')),
 provider_receipt_hash TEXT CHECK(provider_receipt_hash ~ '^[a-f0-9]{64}$'),
 expires_at TIMESTAMPTZ NOT NULL,
 verified_at TIMESTAMPTZ,
 consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 CHECK(expires_at>created_at),
 FOREIGN KEY(session_id,membership_id,organization_id) REFERENCES internal_staff_sessions(id,membership_id,organization_id) ON DELETE RESTRICT,
 CHECK(required_assurance<>'PHISHING_RESISTANT' OR achieved_assurance IS NULL OR achieved_assurance='PHISHING_RESISTANT'),
 CHECK((achieved_assurance IS NOT NULL AND provider_receipt_hash IS NOT NULL AND verified_at IS NOT NULL) OR (achieved_assurance IS NULL AND provider_receipt_hash IS NULL AND verified_at IS NULL)),
 CHECK(status NOT IN ('VERIFIED','CONSUMED') OR verified_at IS NOT NULL),
 CHECK(status NOT IN ('PENDING','FAILED') OR verified_at IS NULL),
 CHECK((status='CONSUMED')=(consumed_at IS NOT NULL))
);

CREATE TABLE internal_action_authorizations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL,
 permission_code TEXT NOT NULL REFERENCES internal_permission_catalog(permission_code) ON DELETE RESTRICT,
 resource_type TEXT NOT NULL CHECK(resource_type IN ('ORGANIZATION','WORKFORCE','HOST_ACCOUNT','PROPERTY','LISTING','OFFER','CAMPAIGN','CREATIVE_PACKAGE','STRATEGY','CORRIDOR','PROVIDER_ACCOUNT','FINANCIAL_CONTRACT','SETTLEMENT','CONVERSATION','SERVICE_CASE','INCIDENT')),
 resource_id TEXT NOT NULL CHECK(resource_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$'),
 provider TEXT CHECK(provider IN ('META','GOOGLE')),
 environment TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 amount_minor BIGINT CHECK(amount_minor>=0),
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 policy_snapshot_hash TEXT NOT NULL CHECK(policy_snapshot_hash ~ '^[a-f0-9]{64}$'),
 maker_membership_id UUID NOT NULL,
 step_up_challenge_id UUID UNIQUE REFERENCES internal_step_up_challenges(id) ON DELETE RESTRICT,
 required_approvals SMALLINT NOT NULL CHECK(required_approvals BETWEEN 0 AND 3),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED','CONSUMED','CANCELLED')),
 version INT NOT NULL DEFAULT 1 CHECK(version>0),
 expires_at TIMESTAMPTZ NOT NULL,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 consumed_at TIMESTAMPTZ,
 FOREIGN KEY(maker_membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 UNIQUE(organization_id,maker_membership_id,command_hash),
 CHECK(expires_at>created_at),
 CHECK((status='CONSUMED')=(consumed_at IS NOT NULL))
);

CREATE TABLE internal_action_approvals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 authorization_id UUID NOT NULL REFERENCES internal_action_authorizations(id) ON DELETE RESTRICT,
 checker_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
 step_up_challenge_id UUID UNIQUE REFERENCES internal_step_up_challenges(id) ON DELETE RESTRICT,
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(authorization_id,checker_membership_id)
);

CREATE TABLE internal_work_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 queue_key TEXT NOT NULL CHECK(queue_key ~ '^[a-z][a-z0-9_]{1,79}$'),
 resource_type TEXT NOT NULL CHECK(resource_type IN ('LISTING','CAMPAIGN','CREATIVE_PACKAGE','STRATEGY','CORRIDOR','PROVIDER_ACCOUNT','FINANCIAL_CONTRACT','SETTLEMENT','CONVERSATION','SERVICE_CASE','INCIDENT','WORKFORCE')),
 resource_id TEXT NOT NULL CHECK(resource_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$'),
 assignee_membership_id UUID NOT NULL,
 environment TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 required_permission_code TEXT REFERENCES internal_permission_catalog(permission_code) ON DELETE RESTRICT,
 provider TEXT CHECK(provider IN ('META','GOOGLE')),
 state TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(state IN ('ASSIGNED','CLAIMED','RELEASED','COMPLETED','CANCELLED')),
 fence BIGINT NOT NULL DEFAULT 0 CHECK(fence>=0),
 version INT NOT NULL DEFAULT 1 CHECK(version>0),
 lease_until TIMESTAMPTZ,
 assigned_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(assignee_membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 CHECK((state='CLAIMED')=(lease_until IS NOT NULL))
);
CREATE UNIQUE INDEX internal_work_one_active ON internal_work_assignments(organization_id,queue_key,resource_type,resource_id,environment) WHERE state IN ('ASSIGNED','CLAIMED');

-- Runtime may read its own command receipts, but only the bounded lifecycle
-- function below can create them. They cannot be forged through IAM audit writes.
CREATE TABLE internal_assignment_commands (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 assignment_id UUID NOT NULL REFERENCES internal_work_assignments(id) ON DELETE RESTRICT,
 actor_membership_id UUID NOT NULL,
 idempotency_key_hash TEXT NOT NULL CHECK(idempotency_key_hash ~ '^[a-f0-9]{64}$'),
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 operation TEXT NOT NULL CHECK(operation IN ('CLAIM','RELEASE')),
 policy_snapshot_hash TEXT NOT NULL CHECK(policy_snapshot_hash ~ '^[a-f0-9]{64}$'),
 expected_version INT NOT NULL CHECK(expected_version>0),
 expected_fence BIGINT NOT NULL CHECK(expected_fence>=0),
 result_version INT NOT NULL CHECK(result_version=expected_version+1),
 result_fence BIGINT NOT NULL CHECK(result_fence=expected_fence+1),
 result_state TEXT NOT NULL CHECK(result_state IN ('CLAIMED','RELEASED')),
 lease_until TIMESTAMPTZ,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(actor_membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 UNIQUE(organization_id,actor_membership_id,idempotency_key_hash),
 CHECK((operation='CLAIM' AND result_state='CLAIMED') OR (operation='RELEASE' AND result_state='RELEASED')),
 CHECK((result_state='CLAIMED')=(lease_until IS NOT NULL))
);

CREATE TABLE internal_access_reviews (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 period_key TEXT NOT NULL CHECK(period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','CANCELLED')),
 due_at TIMESTAMPTZ NOT NULL,
 created_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 closed_at TIMESTAMPTZ,
 UNIQUE(organization_id,period_key),
 CHECK(due_at>created_at),
 CHECK((status='CLOSED')=(closed_at IS NOT NULL))
);

CREATE TABLE internal_access_review_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id UUID NOT NULL REFERENCES internal_access_reviews(id) ON DELETE RESTRICT,
 membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 grant_id UUID NOT NULL REFERENCES internal_membership_grants(id) ON DELETE RESTRICT,
 reviewer_membership_id UUID REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 decision TEXT NOT NULL DEFAULT 'PENDING' CHECK(decision IN ('PENDING','RETAIN','REVOKE')),
 reason TEXT CHECK(reason IS NULL OR length(reason) BETWEEN 10 AND 2000),
 decided_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(review_id,grant_id),
 CHECK((decision='PENDING')=(reviewer_membership_id IS NULL AND reason IS NULL AND decided_at IS NULL))
);

CREATE TABLE internal_break_glass_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 requester_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 approver_membership_id UUID REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 action_hash TEXT NOT NULL CHECK(action_hash ~ '^[a-f0-9]{64}$'),
 scope TEXT NOT NULL CHECK(scope IN ('READ','SAFETY_PAUSE','RECOVERY')),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','EXPIRED','ENDED','REJECTED')),
 expires_at TIMESTAMPTZ NOT NULL,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 20 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 ended_at TIMESTAMPTZ,
 reviewed_at TIMESTAMPTZ,
 CHECK(expires_at>created_at),
 CHECK(approver_membership_id IS NULL OR approver_membership_id<>requester_membership_id),
 CHECK(scope<>'RECOVERY' OR approver_membership_id IS NOT NULL)
);

CREATE TABLE internal_iam_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence BIGSERIAL UNIQUE NOT NULL,
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 actor_user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 actor_membership_id UUID REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type ~ '^[A-Z][A-Z0-9_]{2,79}$'),
 entity_type TEXT NOT NULL CHECK(entity_type ~ '^[A-Z][A-Z0-9_]{2,79}$'),
 entity_id TEXT NOT NULL CHECK(entity_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$'),
 previous_hash TEXT CHECK(previous_hash ~ '^[a-f0-9]{64}$'),
 new_hash TEXT CHECK(new_hash ~ '^[a-f0-9]{64}$'),
 evidence JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=16384),
 correlation_id TEXT NOT NULL CHECK(correlation_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 causation_id TEXT CHECK(causation_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX internal_membership_user_status ON internal_organization_memberships(user_id,status,organization_id);
CREATE INDEX internal_grant_active ON internal_membership_grants(membership_id,role_version_id,valid_until);
CREATE INDEX internal_session_active ON internal_staff_sessions(membership_id,status,absolute_expires_at,idle_expires_at);
CREATE INDEX internal_action_pending ON internal_action_authorizations(organization_id,status,expires_at);
CREATE INDEX internal_assignment_assignee ON internal_work_assignments(assignee_membership_id,state,updated_at DESC);
CREATE INDEX internal_event_org_sequence ON internal_iam_events(organization_id,sequence DESC);

CREATE FUNCTION internal_iam_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IAM_IMMUTABLE_EVIDENCE'; END $$;

CREATE FUNCTION internal_iam_hash_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.config_hash:=encode(sha256(convert_to(NEW.config::text,'UTF8')),'hex'); RETURN NEW; END $$;
CREATE TRIGGER internal_iam_policy_hash BEFORE INSERT ON internal_iam_policy_versions FOR EACH ROW EXECUTE FUNCTION internal_iam_hash_policy();

CREATE FUNCTION internal_iam_guard_membership_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||OLD.id::text,0));
 IF OLD.status='OFFBOARDED' AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'IAM_OFFBOARDING_TERMINAL'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'IAM_MEMBERSHIP_VERSION_CONFLICT'; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.user_id<>OLD.user_id OR NEW.accepted_invitation_id IS DISTINCT FROM OLD.accepted_invitation_id OR NEW.accepted_at<>OLD.accepted_at OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'IAM_MEMBERSHIP_IDENTITY_IMMUTABLE'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER internal_membership_transition BEFORE UPDATE ON internal_organization_memberships FOR EACH ROW EXECUTE FUNCTION internal_iam_guard_membership_transition();

CREATE FUNCTION internal_iam_validate_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||NEW.membership_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM internal_role_versions v WHERE v.id=NEW.role_version_id AND v.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'IAM_GRANT_ROLE_ORGANIZATION_MISMATCH'; END IF;
 IF NEW.scope_type='ORGANIZATION' AND NEW.scope_id<>NEW.organization_id::text THEN RAISE EXCEPTION 'IAM_ORGANIZATION_SCOPE_MISMATCH'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_grant_validate BEFORE INSERT ON internal_membership_grants FOR EACH ROW EXECUTE FUNCTION internal_iam_validate_grant();

CREATE FUNCTION internal_iam_validate_role_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM internal_role_versions v WHERE v.id=NEW.version_id AND v.role_id=NEW.role_id AND v.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'IAM_ROLE_VERSION_MISMATCH'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER internal_role_pointer_validate BEFORE INSERT OR UPDATE ON internal_role_current_versions FOR EACH ROW EXECUTE FUNCTION internal_iam_validate_role_pointer();

-- These triggers defend receipt integrity even when later domain services err.
-- They never accept a caller-supplied "approved" Boolean as authority.
CREATE FUNCTION internal_iam_validate_checker() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE action_record internal_action_authorizations%ROWTYPE; requires_step_up boolean;
BEGIN
 SELECT * INTO action_record FROM internal_action_authorizations WHERE id=NEW.authorization_id FOR UPDATE;
 IF action_record.id IS NULL THEN RAISE EXCEPTION 'IAM_AUTHORIZATION_NOT_FOUND'; END IF;
 IF action_record.status<>'PENDING' OR action_record.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'IAM_AUTHORIZATION_NOT_PENDING'; END IF;
 IF action_record.maker_membership_id=NEW.checker_membership_id THEN RAISE EXCEPTION 'IAM_MAKER_CHECKER_CONFLICT'; END IF;
 IF action_record.command_hash<>NEW.command_hash THEN RAISE EXCEPTION 'IAM_COMMAND_HASH_MISMATCH'; END IF;
 IF NOT internal_iam_membership_has_permission(NEW.checker_membership_id,action_record.organization_id,action_record.permission_code,action_record.resource_type,action_record.resource_id,action_record.provider,action_record.environment,action_record.amount_minor) THEN RAISE EXCEPTION 'IAM_CHECKER_PERMISSION_DENIED'; END IF;
 SELECT step_up_required INTO requires_step_up FROM internal_permission_catalog WHERE permission_code=action_record.permission_code;
 IF requires_step_up AND NOT internal_iam_valid_step_up(NEW.step_up_challenge_id,NEW.checker_membership_id,action_record.organization_id,NEW.command_hash) THEN RAISE EXCEPTION 'IAM_CHECKER_STEP_UP_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_checker_validate BEFORE INSERT ON internal_action_approvals FOR EACH ROW EXECUTE FUNCTION internal_iam_validate_checker();

CREATE FUNCTION internal_iam_guard_authorization_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE policy_record internal_permission_catalog%ROWTYPE; current_policy_hash text; current_policy_approval text; receipt_id uuid; member_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 FOR member_id IN SELECT NEW.maker_membership_id UNION SELECT checker_membership_id FROM internal_action_approvals WHERE authorization_id=NEW.id ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-member:'||member_id::text,0));
 END LOOP;
 SELECT * INTO policy_record FROM internal_permission_catalog WHERE permission_code=NEW.permission_code AND active;
 SELECT v.config_hash,v.approval_status INTO current_policy_hash,current_policy_approval FROM internal_iam_current_policy p JOIN internal_iam_policy_versions v ON v.id=p.version_id WHERE p.singleton;
 IF policy_record.permission_code IS NULL OR NEW.required_approvals < (CASE WHEN policy_record.checker_policy='DISTINCT_ACTOR' THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'IAM_CHECKER_POLICY_MISMATCH'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW.version<>1 THEN RAISE EXCEPTION 'IAM_AUTHORIZATION_INITIAL_STATE'; END IF;
  IF NEW.policy_snapshot_hash IS DISTINCT FROM current_policy_hash THEN RAISE EXCEPTION 'IAM_POLICY_CHANGED'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status IN ('REJECTED','EXPIRED','CONSUMED','CANCELLED') THEN RAISE EXCEPTION 'IAM_AUTHORIZATION_TERMINAL'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'IAM_AUTHORIZATION_VERSION_CONFLICT'; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.permission_code<>OLD.permission_code OR NEW.resource_type<>OLD.resource_type OR NEW.resource_id<>OLD.resource_id
    OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.environment<>OLD.environment OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.command_hash<>OLD.command_hash OR NEW.policy_snapshot_hash<>OLD.policy_snapshot_hash OR NEW.maker_membership_id<>OLD.maker_membership_id
    OR NEW.step_up_challenge_id IS DISTINCT FROM OLD.step_up_challenge_id OR NEW.required_approvals<>OLD.required_approvals
    OR NEW.expires_at<>OLD.expires_at OR NEW.reason<>OLD.reason OR NEW.created_at<>OLD.created_at THEN
  RAISE EXCEPTION 'IAM_AUTHORIZATION_EVIDENCE_IMMUTABLE';
 END IF;
 IF NOT ((OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED','EXPIRED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status IN ('CONSUMED','EXPIRED','CANCELLED'))) THEN RAISE EXCEPTION 'IAM_AUTHORIZATION_INVALID_TRANSITION'; END IF;
 IF NEW.status IN ('APPROVED','CONSUMED') THEN
  IF NEW.environment='PRODUCTION' AND current_policy_approval IS DISTINCT FROM 'APPROVED' THEN RAISE EXCEPTION 'IAM_OPERATIONAL_POLICY_UNAPPROVED'; END IF;
  IF NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'IAM_AUTHORIZATION_EXPIRED'; END IF;
  IF NEW.policy_snapshot_hash IS DISTINCT FROM current_policy_hash THEN RAISE EXCEPTION 'IAM_POLICY_CHANGED'; END IF;
  IF NOT internal_iam_membership_has_permission(NEW.maker_membership_id,NEW.organization_id,NEW.permission_code,NEW.resource_type,NEW.resource_id,NEW.provider,NEW.environment,NEW.amount_minor) THEN RAISE EXCEPTION 'IAM_MAKER_PERMISSION_DENIED'; END IF;
  IF EXISTS(SELECT 1 FROM internal_action_approvals a WHERE a.authorization_id=NEW.id AND a.decision='REJECT') OR
     (SELECT count(*) FROM internal_action_approvals a WHERE a.authorization_id=NEW.id AND a.decision='APPROVE' AND a.command_hash=NEW.command_hash
      AND internal_iam_membership_has_permission(a.checker_membership_id,NEW.organization_id,NEW.permission_code,NEW.resource_type,NEW.resource_id,NEW.provider,NEW.environment,NEW.amount_minor))<NEW.required_approvals THEN RAISE EXCEPTION 'IAM_CHECKER_REQUIRED'; END IF;
  IF policy_record.step_up_required THEN
   -- Deterministic row locks fence concurrent consumption of the same factor proof.
   FOR receipt_id IN SELECT id FROM internal_step_up_challenges WHERE id=NEW.step_up_challenge_id OR id IN (SELECT step_up_challenge_id FROM internal_action_approvals WHERE authorization_id=NEW.id AND decision='APPROVE') ORDER BY id FOR UPDATE LOOP NULL; END LOOP;
   IF NOT internal_iam_valid_step_up(NEW.step_up_challenge_id,NEW.maker_membership_id,NEW.organization_id,NEW.command_hash) THEN RAISE EXCEPTION 'IAM_MAKER_STEP_UP_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM internal_action_approvals a WHERE a.authorization_id=NEW.id AND a.decision='APPROVE' AND NOT internal_iam_valid_step_up(a.step_up_challenge_id,a.checker_membership_id,NEW.organization_id,NEW.command_hash)) THEN RAISE EXCEPTION 'IAM_CHECKER_STEP_UP_REQUIRED'; END IF;
   IF NEW.status='CONSUMED' THEN
    UPDATE internal_step_up_challenges SET status='CONSUMED',consumed_at=clock_timestamp() WHERE id=NEW.step_up_challenge_id OR id IN (SELECT step_up_challenge_id FROM internal_action_approvals WHERE authorization_id=NEW.id AND decision='APPROVE');
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_authorization_transition BEFORE INSERT OR UPDATE ON internal_action_authorizations FOR EACH ROW EXECUTE FUNCTION internal_iam_guard_authorization_transition();

CREATE FUNCTION internal_iam_validate_review_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.reviewer_membership_id IS NOT NULL AND NEW.reviewer_membership_id=NEW.membership_id THEN RAISE EXCEPTION 'IAM_SELF_ACCESS_REVIEW'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_access_review_validate BEFORE INSERT OR UPDATE ON internal_access_review_items FOR EACH ROW EXECUTE FUNCTION internal_iam_validate_review_item();

-- An exact, unguessable session digest is the sole pre-context lookup. This
-- function creates no identity, session or permission and discloses no PII.
CREATE FUNCTION internal_iam_authenticate_session(p_token_hash TEXT)
RETURNS TABLE(account_id INTEGER,organization_id UUID,membership_id UUID,session_id UUID,
 assurance_level TEXT,authenticated_at TIMESTAMPTZ,expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT m.user_id,s.organization_id,s.membership_id,s.id,s.assurance_level,s.authenticated_at,
        least(s.idle_expires_at,s.absolute_expires_at,coalesce(m.expires_at,s.absolute_expires_at))
 FROM internal_staff_sessions s
 JOIN internal_organization_memberships m ON m.id=s.membership_id AND m.organization_id=s.organization_id
 JOIN internal_organizations o ON o.id=s.organization_id
 WHERE p_token_hash ~ '^[a-f0-9]{64}$' AND s.token_hash=p_token_hash
   AND s.environment=coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL')
   AND s.status='ACTIVE' AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
   AND m.status='ACTIVE' AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND o.status='ACTIVE'
$$;
REVOKE ALL ON FUNCTION internal_iam_authenticate_session(TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_current_user_id() RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN COALESCE(current_setting('app.current_user_id',true),'') ~ '^[1-9][0-9]{0,9}$' THEN CASE WHEN current_setting('app.current_user_id',true)::bigint<=2147483647 THEN current_setting('app.current_user_id',true)::integer END END
$$;
CREATE FUNCTION internal_iam_current_membership_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN COALESCE(current_setting('app.membership_id',true),'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN current_setting('app.membership_id',true)::uuid END
$$;
CREATE FUNCTION internal_iam_current_session_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN COALESCE(current_setting('app.staff_session_id',true),'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN current_setting('app.staff_session_id',true)::uuid END
$$;
CREATE FUNCTION internal_iam_current_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN COALESCE(current_setting('app.organization_id',true),'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN current_setting('app.organization_id',true)::uuid END
$$;

CREATE FUNCTION internal_iam_is_active_membership(target_membership UUID) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM internal_organization_memberships m JOIN internal_organizations o ON o.id=m.organization_id
  WHERE m.id=target_membership AND m.user_id=internal_iam_current_user_id() AND m.status='ACTIVE' AND o.status='ACTIVE'
  AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
$$;

CREATE FUNCTION internal_iam_is_active_session(target_organization UUID) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM internal_staff_sessions s JOIN internal_organization_memberships m ON m.id=s.membership_id AND m.organization_id=s.organization_id
  JOIN internal_organizations o ON o.id=s.organization_id WHERE s.id=internal_iam_current_session_id() AND s.membership_id=internal_iam_current_membership_id()
  AND s.organization_id=target_organization AND target_organization=internal_iam_current_organization_id() AND m.user_id=internal_iam_current_user_id() AND m.status='ACTIVE' AND o.status='ACTIVE' AND s.status='ACTIVE'
  AND s.environment=coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL')
  AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp() AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
$$;

CREATE FUNCTION internal_iam_membership_has_permission(target_membership UUID,target_organization UUID,target_permission TEXT,target_resource_type TEXT,target_resource_id TEXT,target_provider TEXT,target_environment TEXT,target_amount_minor BIGINT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT EXISTS(
  SELECT 1 FROM internal_membership_grants g
  JOIN internal_organization_memberships m ON m.id=g.membership_id AND m.organization_id=g.organization_id
  JOIN internal_organizations o ON o.id=m.organization_id
  JOIN internal_role_versions rv ON rv.id=g.role_version_id AND rv.organization_id=g.organization_id
  JOIN internal_role_permissions rp ON rp.role_version_id=rv.id AND rp.permission_code=target_permission
  JOIN internal_permission_catalog p ON p.permission_code=rp.permission_code AND p.active
  LEFT JOIN internal_membership_grant_revocations x ON x.grant_id=g.id
  WHERE m.status='ACTIVE' AND o.status='ACTIVE' AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND g.organization_id=target_organization AND g.membership_id=target_membership AND x.grant_id IS NULL
  AND g.valid_from<=clock_timestamp() AND (g.valid_until IS NULL OR g.valid_until>clock_timestamp())
  AND ((g.scope_type='ORGANIZATION' AND g.scope_id=target_organization::text) OR (g.scope_type=target_resource_type AND g.scope_id=target_resource_id))
  AND (g.provider IS NULL OR g.provider=target_provider) AND g.environment=target_environment
  AND (target_amount_minor IS NULL OR target_amount_minor>=0)
  AND (g.max_amount_minor IS NULL OR (target_amount_minor IS NOT NULL AND target_amount_minor<=g.max_amount_minor))
 )
$$;
CREATE FUNCTION internal_iam_valid_step_up(target_challenge UUID,target_membership UUID,target_organization UUID,target_hash TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM internal_step_up_challenges c JOIN internal_staff_sessions s ON s.id=c.session_id
 WHERE c.id=target_challenge AND c.membership_id=target_membership AND c.organization_id=target_organization AND c.action_hash=target_hash
 AND c.status='VERIFIED' AND c.expires_at>clock_timestamp() AND c.verified_at<=clock_timestamp()
 AND s.status='ACTIVE' AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
 AND s.environment=coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL')
 AND (c.required_assurance='AAL2' OR c.achieved_assurance='PHISHING_RESISTANT'))
$$;
CREATE FUNCTION internal_iam_has_permission(target_organization UUID,target_permission TEXT,target_resource_type TEXT,target_resource_id TEXT,target_provider TEXT,target_environment TEXT,target_amount_minor BIGINT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT target_environment=coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL')
 AND internal_iam_is_active_session(target_organization) AND internal_iam_membership_has_permission(internal_iam_current_membership_id(),target_organization,target_permission,target_resource_type,target_resource_id,target_provider,target_environment,target_amount_minor)
$$;
REVOKE ALL ON FUNCTION internal_iam_membership_has_permission(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT),internal_iam_valid_step_up(UUID,UUID,UUID,TEXT) FROM PUBLIC;

-- Shared authority fences stay held until the protected command transaction
-- commits. Every authority-changing trigger below uses the same exclusive key.
-- Advisory fences avoid granting SELECT-only runtime roles table UPDATE powers.
CREATE FUNCTION internal_iam_lock_authority() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE membership uuid:=internal_iam_current_membership_id();
BEGIN
 IF membership IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-member:'||membership::text,0));
 RETURN internal_iam_is_active_session(internal_iam_current_organization_id());
END $$;
CREATE FUNCTION internal_iam_fence_revocation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE membership uuid;
BEGIN
 SELECT membership_id INTO membership FROM internal_membership_grants WHERE id=NEW.grant_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||membership::text,0));
 RETURN NEW;
END $$;
CREATE TRIGGER internal_revocation_fence BEFORE INSERT ON internal_membership_grant_revocations FOR EACH ROW EXECUTE FUNCTION internal_iam_fence_revocation();
CREATE FUNCTION internal_iam_fence_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||OLD.membership_id::text,0));
 IF NEW.id<>OLD.id OR NEW.membership_id<>OLD.membership_id OR NEW.organization_id<>OLD.organization_id OR NEW.environment<>OLD.environment OR NEW.token_hash<>OLD.token_hash OR NEW.assurance_level<>OLD.assurance_level OR NEW.authenticated_at<>OLD.authenticated_at OR NEW.absolute_expires_at<>OLD.absolute_expires_at THEN RAISE EXCEPTION 'IAM_SESSION_EVIDENCE_IMMUTABLE'; END IF;
 IF OLD.status<>'ACTIVE' THEN RAISE EXCEPTION 'IAM_SESSION_TERMINAL'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_session_fence BEFORE UPDATE ON internal_staff_sessions FOR EACH ROW EXECUTE FUNCTION internal_iam_fence_session();
CREATE FUNCTION internal_iam_fence_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member_id uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  FOR member_id IN SELECT OLD.assignee_membership_id UNION SELECT NEW.assignee_membership_id ORDER BY 1 LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||member_id::text,0));
  END LOOP;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||NEW.assignee_membership_id::text,0));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_assignment_fence BEFORE INSERT OR UPDATE ON internal_work_assignments FOR EACH ROW EXECUTE FUNCTION internal_iam_fence_assignment();
REVOKE ALL ON FUNCTION internal_iam_fence_assignment() FROM PUBLIC;

CREATE FUNCTION internal_iam_guard_assignment_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'ASSIGNED' OR NEW.version<>1 OR NEW.fence<>0 THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_INITIAL_STATE'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.state IN ('RELEASED','COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_TERMINAL'; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.queue_key<>OLD.queue_key OR NEW.resource_type<>OLD.resource_type OR NEW.resource_id<>OLD.resource_id OR NEW.environment<>OLD.environment OR NEW.required_permission_code IS DISTINCT FROM OLD.required_permission_code OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.assigned_by<>OLD.assigned_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_IDENTITY_IMMUTABLE'; END IF;
 IF NEW.version<>OLD.version+1 OR NEW.fence<>OLD.fence+1 THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_FENCE_INVALID'; END IF;
 IF NOT ((OLD.state='ASSIGNED' AND NEW.state IN ('CLAIMED','RELEASED','COMPLETED','CANCELLED')) OR (OLD.state='CLAIMED' AND NEW.state IN ('RELEASED','COMPLETED','CANCELLED')) OR (OLD.state='CLAIMED' AND NEW.state='CLAIMED' AND OLD.lease_until<=clock_timestamp())) THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_INVALID_TRANSITION'; END IF;
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER internal_assignment_transition BEFORE INSERT OR UPDATE ON internal_work_assignments FOR EACH ROW EXECUTE FUNCTION internal_iam_guard_assignment_transition();
REVOKE ALL ON FUNCTION internal_iam_guard_assignment_transition() FROM PUBLIC;

CREATE FUNCTION internal_iam_command_assignment(target_assignment UUID,target_operation TEXT,expected_version INT,expected_fence BIGINT,target_environment TEXT,idempotency_key TEXT,command_reason TEXT,correlation TEXT,causation TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE actor UUID:=internal_iam_current_membership_id(); organization UUID:=internal_iam_current_organization_id();
 work internal_work_assignments%ROWTYPE; previous_command internal_assignment_commands%ROWTYPE; saved internal_assignment_commands%ROWTYPE;
 current_hash TEXT; operational_approval TEXT; lease_seconds INT; required_type TEXT;
 key_hash TEXT; intent_hash TEXT; before_hash TEXT;
BEGIN
 IF (target_assignment IS NOT NULL AND target_operation IN ('CLAIM','RELEASE') AND expected_version>0 AND expected_fence>=0 AND expected_fence<9223372036854775807 AND expected_version<2147483647 AND target_environment IN ('LOCAL','STAGING','PRODUCTION') AND idempotency_key ~ '^[A-Za-z0-9:_-]{8,160}$' AND length(command_reason) BETWEEN 10 AND 2000 AND command_reason=btrim(command_reason) AND correlation ~ '^[A-Za-z0-9._:-]{1,128}$' AND (causation IS NULL OR causation ~ '^[A-Za-z0-9._:-]{1,128}$')) IS NOT TRUE THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_INPUT_INVALID'; END IF;
 IF actor IS NULL OR organization IS NULL THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_PERMISSION_DENIED'; END IF;
 -- Acquire an exclusive member fence directly, not by upgrading a shared lock:
 -- two simultaneous claims must serialize rather than deadlock on lock upgrades.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||actor::text,0));
 IF NOT internal_iam_is_active_session(organization) THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_PERMISSION_DENIED'; END IF;
 SELECT v.config_hash,v.approval_status,(v.config->>'assignmentLeaseSeconds')::int INTO current_hash,operational_approval,lease_seconds FROM internal_iam_current_policy cp JOIN internal_iam_policy_versions v ON v.id=cp.version_id WHERE cp.singleton;
 IF current_hash IS NULL OR lease_seconds IS NULL OR lease_seconds NOT BETWEEN 60 AND 3600 OR (target_environment='PRODUCTION' AND operational_approval<>'APPROVED') THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_NOT_READY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM internal_permission_catalog WHERE permission_code='work.assignment.claim' AND active AND resource_type='WORKFORCE' AND NOT step_up_required AND checker_policy='NONE') THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_NOT_READY'; END IF;
 SELECT * INTO work FROM internal_work_assignments WHERE id=target_assignment AND organization_id=organization AND assignee_membership_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_NOT_FOUND'; END IF;
 IF work.environment<>target_environment THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_ENVIRONMENT_MISMATCH'; END IF;
 SELECT resource_type INTO required_type FROM internal_permission_catalog WHERE permission_code=work.required_permission_code AND active;
 IF required_type IS NULL OR required_type<>work.resource_type THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_UNBOUND'; END IF;
 IF NOT internal_iam_has_permission(organization,'work.assignment.claim','WORKFORCE',organization::text,NULL,target_environment,NULL) OR NOT internal_iam_has_permission(organization,work.required_permission_code,work.resource_type,work.resource_id,work.provider,target_environment,NULL) THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_PERMISSION_DENIED'; END IF;
 key_hash:=encode(sha256(convert_to(idempotency_key,'UTF8')),'hex');
 intent_hash:=encode(sha256(convert_to(jsonb_build_object('contract','encho:assignment-command:v1','organization',organization,'actor',actor,'assignment',target_assignment,'operation',target_operation,'expectedVersion',expected_version,'expectedFence',expected_fence::text,'environment',target_environment,'reason',command_reason)::text,'UTF8')),'hex');
 SELECT * INTO previous_command FROM internal_assignment_commands WHERE organization_id=organization AND actor_membership_id=actor AND idempotency_key_hash=key_hash;
 IF FOUND THEN
  IF previous_command.command_hash<>intent_hash THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('receipt',to_jsonb(previous_command)||jsonb_build_object('expected_fence',previous_command.expected_fence::text,'result_fence',previous_command.result_fence::text),'replayed',true);
 END IF;
 IF work.version<>expected_version OR work.fence<>expected_fence THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_CAS_CONFLICT'; END IF;
 IF (target_operation='CLAIM' AND NOT(work.state='ASSIGNED' OR (work.state='CLAIMED' AND work.lease_until<=clock_timestamp()))) OR (target_operation='RELEASE' AND work.state<>'CLAIMED') THEN RAISE EXCEPTION 'IAM_ASSIGNMENT_STATE_CONFLICT'; END IF;
 before_hash:=encode(sha256(convert_to(to_jsonb(work)::text,'UTF8')),'hex');
 UPDATE internal_work_assignments SET state=CASE WHEN target_operation='CLAIM' THEN 'CLAIMED' ELSE 'RELEASED' END,version=version+1,fence=fence+1,lease_until=CASE WHEN target_operation='CLAIM' THEN clock_timestamp()+lease_seconds*interval '1 second' ELSE NULL END,reason=command_reason WHERE id=target_assignment RETURNING * INTO work;
 INSERT INTO internal_assignment_commands(organization_id,assignment_id,actor_membership_id,idempotency_key_hash,command_hash,operation,policy_snapshot_hash,expected_version,expected_fence,result_version,result_fence,result_state,lease_until,reason)
 VALUES(organization,target_assignment,actor,key_hash,intent_hash,target_operation,current_hash,expected_version,expected_fence,work.version,work.fence,work.state,work.lease_until,command_reason) RETURNING * INTO saved;
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,previous_hash,new_hash,evidence,correlation_id,causation_id,request_hash,reason)
 VALUES(organization,internal_iam_current_user_id(),actor,CASE WHEN target_operation='CLAIM' THEN 'WORK_ASSIGNMENT_CLAIMED' ELSE 'WORK_ASSIGNMENT_RELEASED' END,'WORK_ASSIGNMENT',target_assignment::text,before_hash,encode(sha256(convert_to(to_jsonb(work)::text,'UTF8')),'hex'),jsonb_build_object('commandId',saved.id,'environment',target_environment,'version',work.version,'fence',work.fence::text,'policySnapshotHash',current_hash,'state',work.state),correlation,causation,intent_hash,command_reason);
 RETURN jsonb_build_object('receipt',to_jsonb(saved)||jsonb_build_object('expected_fence',saved.expected_fence::text,'result_fence',saved.result_fence::text),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION internal_iam_command_assignment(UUID,TEXT,INT,BIGINT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
CREATE FUNCTION internal_iam_guard_factor_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('CONSUMED','EXPIRED','FAILED') THEN RAISE EXCEPTION 'IAM_FACTOR_TERMINAL'; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.membership_id<>OLD.membership_id OR NEW.session_id<>OLD.session_id OR NEW.action_hash<>OLD.action_hash OR NEW.required_assurance<>OLD.required_assurance OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'IAM_FACTOR_IDENTITY_IMMUTABLE'; END IF;
 IF NOT ((OLD.status='PENDING' AND NEW.status IN ('VERIFIED','FAILED','EXPIRED')) OR (OLD.status='VERIFIED' AND NEW.status IN ('CONSUMED','EXPIRED'))) THEN RAISE EXCEPTION 'IAM_FACTOR_INVALID_TRANSITION'; END IF;
 IF OLD.status='VERIFIED' AND (NEW.achieved_assurance IS DISTINCT FROM OLD.achieved_assurance OR NEW.provider_receipt_hash IS DISTINCT FROM OLD.provider_receipt_hash OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN RAISE EXCEPTION 'IAM_FACTOR_EVIDENCE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_factor_transition BEFORE UPDATE ON internal_step_up_challenges FOR EACH ROW EXECUTE FUNCTION internal_iam_guard_factor_transition();
REVOKE ALL ON FUNCTION internal_iam_guard_factor_transition() FROM PUBLIC;
CREATE FUNCTION internal_iam_fence_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-policy',0));
 RETURN NEW;
END $$;
CREATE TRIGGER internal_current_policy_fence BEFORE UPDATE ON internal_iam_current_policy FOR EACH ROW EXECUTE FUNCTION internal_iam_fence_policy();
CREATE TRIGGER internal_organization_fence BEFORE UPDATE ON internal_organizations FOR EACH ROW EXECUTE FUNCTION internal_iam_fence_policy();
REVOKE ALL ON FUNCTION internal_iam_lock_authority(),internal_iam_fence_revocation(),internal_iam_fence_session(),internal_iam_fence_policy() FROM PUBLIC;

REVOKE ALL ON FUNCTION internal_iam_reject_mutation(),internal_iam_hash_policy(),internal_iam_guard_membership_transition(),internal_iam_validate_grant(),internal_iam_validate_role_pointer(),internal_iam_validate_checker(),internal_iam_guard_authorization_transition(),internal_iam_validate_review_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION internal_iam_current_user_id(),internal_iam_current_membership_id(),internal_iam_current_session_id(),internal_iam_current_organization_id(),internal_iam_is_active_membership(UUID),internal_iam_is_active_session(UUID),internal_iam_has_permission(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT) FROM PUBLIC;

-- The organization and policy are bootstrap-owned reference data. No user gains
-- membership or authority until the reviewed bootstrap command records it.
INSERT INTO internal_organizations(id,organization_key,display_name,status) VALUES('00000000-0000-4000-8000-000000000001','encho','Encho','ACTIVE');

INSERT INTO internal_permission_catalog(permission_code,resource_type,risk_class,step_up_required,checker_policy,description) VALUES
 ('workforce.member.read','WORKFORCE','SENSITIVE',false,'NONE','Read scoped internal workforce membership summaries.'),
 ('workforce.invite','WORKFORCE','SENSITIVE',true,'NONE','Invite a verified identity into the internal workforce.'),
 ('workforce.grant','WORKFORCE','CRITICAL',true,'DISTINCT_ACTOR','Grant or revoke scoped internal workforce authority.'),
 ('workforce.suspend','WORKFORCE','CRITICAL',true,'NONE','Suspend or offboard a workforce member and their sessions.'),
 ('workforce.access_review','WORKFORCE','SENSITIVE',true,'DISTINCT_ACTOR','Create and attest periodic access reviews.'),
 ('work.assignment.read','WORKFORCE','STANDARD',false,'NONE','Read assigned operational work.'),
 ('work.assignment.claim','WORKFORCE','STANDARD',false,'NONE','Claim an authorized operational work item.'),
 ('work.assignment.reassign','WORKFORCE','SENSITIVE',true,'NONE','Reassign operational work with an audit reason.'),
 ('listing.review','LISTING','SENSITIVE',false,'NONE','Review exact canonical listing evidence.'),
 ('listing.publish','LISTING','CRITICAL',true,'DISTINCT_ACTOR','Publish a reviewed canonical listing revision.'),
 ('strategy.read','STRATEGY','STANDARD',false,'NONE','Read released and assigned strategy evidence.'),
 ('strategy.draft','STRATEGY','SENSITIVE',false,'NONE','Draft a new immutable strategy version.'),
 ('strategy.publish','STRATEGY','CRITICAL',true,'DISTINCT_ACTOR','Publish an exact strategy release.'),
 ('strategy.rollback','STRATEGY','CRITICAL',true,'DISTINCT_ACTOR','Publish a rollback release without rewriting history.'),
 ('corridor.read','CORRIDOR','STANDARD',false,'NONE','Read released and assigned corridor evidence.'),
 ('corridor.draft','CORRIDOR','SENSITIVE',false,'NONE','Draft provider-resolved corridor evidence.'),
 ('corridor.publish','CORRIDOR','CRITICAL',true,'DISTINCT_ACTOR','Publish exact feeder and exclusion geography.'),
 ('creative.read','CREATIVE_PACKAGE','STANDARD',false,'NONE','Read an assigned creative package and evidence.'),
 ('creative.review','CREATIVE_PACKAGE','SENSITIVE',false,'DISTINCT_ACTOR','Approve or reject exact reviewed creative bytes and claims.'),
 ('campaign.read','CAMPAIGN','STANDARD',false,'NONE','Read an assigned campaign and source-aware status.'),
 ('campaign.prepare','CAMPAIGN','SENSITIVE',false,'NONE','Prepare an exact campaign revision from released policy.'),
 ('campaign.approve','CAMPAIGN','CRITICAL',true,'DISTINCT_ACTOR','Approve or reject an exact campaign revision.'),
 ('provider.read','PROVIDER_ACCOUNT','SENSITIVE',false,'NONE','Read sanitized provider identity and operation evidence.'),
 ('provider.create_paused','CAMPAIGN','CRITICAL',true,'NONE','Create exact provider resources in a non-spending paused state.'),
 ('provider.readback','CAMPAIGN','SENSITIVE',false,'NONE','Read back effective provider configuration.'),
 ('provider.activate','CAMPAIGN','CRITICAL',true,'DISTINCT_ACTOR','Activate exact funded and verified provider resources.'),
 ('provider.pause','CAMPAIGN','CRITICAL',true,'NONE','Reduce spend exposure by pausing provider delivery.'),
 ('provider.resume','CAMPAIGN','CRITICAL',true,'DISTINCT_ACTOR','Resume an exact reconciled provider campaign.'),
 ('provider.recover','CAMPAIGN','CRITICAL',true,'DISTINCT_ACTOR','Recover a bounded unknown or failed provider operation.'),
 ('finance.read','FINANCIAL_CONTRACT','SENSITIVE',false,'NONE','Read scoped campaign financial evidence.'),
 ('finance.review','FINANCIAL_CONTRACT','CRITICAL',true,'NONE','Review funding risk, variance and reconciliation evidence.'),
 ('finance.refund','FINANCIAL_CONTRACT','CRITICAL',true,'DISTINCT_ACTOR','Authorize an exact campaign refund command.'),
 ('finance.settle','SETTLEMENT','CRITICAL',true,'DISTINCT_ACTOR','Commit an independently reviewed settlement.'),
 ('service.read','SERVICE_CASE','SENSITIVE',false,'NONE','Read an assigned support case and sanitized context.'),
 ('service.respond','SERVICE_CASE','SENSITIVE',false,'NONE','Respond visibly within an assigned support case.'),
 ('service.assign','SERVICE_CASE','SENSITIVE',true,'NONE','Assign or reassign a support case.'),
 ('service.note','SERVICE_CASE','SENSITIVE',false,'NONE','Record an internal note on an assigned support case.'),
 ('audit.read','ORGANIZATION','SENSITIVE',true,'NONE','Read scoped immutable operational and access evidence.'),
 ('incident.read','INCIDENT','SENSITIVE',false,'NONE','Read scoped incident evidence and runbooks.'),
 ('incident.declare','INCIDENT','CRITICAL',true,'NONE','Declare an operational incident with explicit scope.'),
 ('incident.pause_global','INCIDENT','CRITICAL',true,'NONE','Execute a time-critical global safety pause.'),
 ('incident.recover','INCIDENT','CRITICAL',true,'DISTINCT_ACTOR','Recover or resume after an incident with independent review.');

INSERT INTO internal_iam_policy_versions(version,config,config_hash,approval_status,reason) VALUES(1,$policy$
{"version":1,"invitationTtlSeconds":86400,"staffSessionIdleSeconds":1800,"staffSessionAbsoluteSeconds":28800,"stepUpTtlSeconds":600,"assignmentLeaseSeconds":300,"minimumOwnersForProduction":2,"allRefundsRequireChecker":true,"allSettlementsRequireChecker":true,"allActivationsRequireChecker":true,"amountThresholds":{"refundMinor":null,"settlementMinor":null},"operationalApproval":"PENDING_FOUNDER_OPERATIONAL_APPROVAL"}
$policy$::jsonb,repeat('0',64),'PENDING_FOUNDER_OPERATIONAL_APPROVAL','Conservative CR1 defaults pending founder operational threshold approval');
INSERT INTO internal_iam_current_policy(singleton,version_id) SELECT true,id FROM internal_iam_policy_versions WHERE version=1;

WITH roles(role_key,display_name,description) AS (VALUES
 ('platform_owner','Platform Owner','Govern workforce authority, audit evidence and emergency safety policy.'),
 ('strategy_architect','Strategy Architect','Draft versioned strategy and corridor proposals.'),
 ('strategy_publisher','Strategy Publisher','Independently publish or roll back reviewed strategy releases.'),
 ('campaign_operator','Campaign Operator','Prepare assigned campaign revisions from released policy.'),
 ('creative_policy_reviewer','Creative and Policy Reviewer','Review exact creative assets, claims and rights evidence.'),
 ('campaign_approver','Campaign Approver','Independently approve or reject assigned campaign revisions.'),
 ('provider_operator','Provider Operator','Create paused provider resources, read back status and reduce spend risk.'),
 ('finance_risk_reviewer','Finance and Risk Reviewer','Review funding, variance, refund and settlement evidence.'),
 ('incident_commander','Incident Commander','Declare incidents and execute time-critical safety pauses.'),
 ('support_analyst','Support Analyst','Assist assigned guest and host service cases.'),
 ('auditor','Auditor','Read scoped immutable evidence without mutation authority.')
) INSERT INTO internal_role_definitions(organization_id,role_key,display_name,description)
 SELECT '00000000-0000-4000-8000-000000000001',role_key,display_name,description FROM roles;

INSERT INTO internal_role_versions(role_id,organization_id,version,config_hash,reason)
 SELECT id,organization_id,1,encode(sha256(convert_to(role_key||':v1','UTF8')),'hex'),'Initial CR1 least-privilege role template' FROM internal_role_definitions;

WITH role_permissions(role_key,permission_code) AS (VALUES
 ('platform_owner','workforce.member.read'),('platform_owner','workforce.invite'),('platform_owner','workforce.grant'),('platform_owner','workforce.suspend'),('platform_owner','workforce.access_review'),('platform_owner','work.assignment.read'),('platform_owner','work.assignment.reassign'),('platform_owner','audit.read'),('platform_owner','incident.read'),('platform_owner','incident.declare'),('platform_owner','incident.pause_global'),
 ('strategy_architect','work.assignment.read'),('strategy_architect','work.assignment.claim'),('strategy_architect','strategy.read'),('strategy_architect','strategy.draft'),('strategy_architect','corridor.read'),('strategy_architect','corridor.draft'),
 ('strategy_publisher','work.assignment.read'),('strategy_publisher','strategy.read'),('strategy_publisher','strategy.publish'),('strategy_publisher','strategy.rollback'),('strategy_publisher','corridor.read'),('strategy_publisher','corridor.publish'),
 ('campaign_operator','work.assignment.read'),('campaign_operator','work.assignment.claim'),('campaign_operator','campaign.read'),('campaign_operator','campaign.prepare'),('campaign_operator','creative.read'),('campaign_operator','provider.read'),
 ('creative_policy_reviewer','work.assignment.read'),('creative_policy_reviewer','work.assignment.claim'),('creative_policy_reviewer','creative.read'),('creative_policy_reviewer','creative.review'),
 ('campaign_approver','work.assignment.read'),('campaign_approver','work.assignment.claim'),('campaign_approver','campaign.read'),('campaign_approver','creative.read'),('campaign_approver','strategy.read'),('campaign_approver','campaign.approve'),
 ('provider_operator','work.assignment.read'),('provider_operator','work.assignment.claim'),('provider_operator','campaign.read'),('provider_operator','provider.read'),('provider_operator','provider.create_paused'),('provider_operator','provider.readback'),('provider_operator','provider.pause'),('provider_operator','provider.resume'),('provider_operator','provider.recover'),
 ('finance_risk_reviewer','work.assignment.read'),('finance_risk_reviewer','work.assignment.claim'),('finance_risk_reviewer','finance.read'),('finance_risk_reviewer','finance.review'),('finance_risk_reviewer','finance.refund'),('finance_risk_reviewer','finance.settle'),
 ('incident_commander','work.assignment.read'),('incident_commander','incident.read'),('incident_commander','incident.declare'),('incident_commander','incident.pause_global'),('incident_commander','incident.recover'),('incident_commander','provider.read'),('incident_commander','provider.pause'),
 ('support_analyst','work.assignment.read'),('support_analyst','work.assignment.claim'),('support_analyst','service.read'),('support_analyst','service.respond'),('support_analyst','service.note'),
 ('auditor','audit.read'),('auditor','strategy.read'),('auditor','corridor.read'),('auditor','campaign.read'),('auditor','provider.read'),('auditor','finance.read'),('auditor','incident.read')
) INSERT INTO internal_role_permissions(role_version_id,permission_code)
 SELECT v.id,rp.permission_code FROM role_permissions rp JOIN internal_role_definitions r ON r.role_key=rp.role_key JOIN internal_role_versions v ON v.role_id=r.id AND v.version=1;

INSERT INTO internal_role_current_versions(role_id,organization_id,version_id)
 SELECT r.id,r.organization_id,v.id FROM internal_role_definitions r JOIN internal_role_versions v ON v.role_id=r.id AND v.version=1;

DO $$ DECLARE table_name TEXT; BEGIN
 FOREACH table_name IN ARRAY ARRAY['internal_permission_catalog','internal_iam_policy_versions','internal_role_definitions','internal_role_versions','internal_role_permissions','internal_membership_grants','internal_membership_grant_revocations','internal_action_approvals','internal_assignment_commands','internal_iam_events'] LOOP
  EXECUTE format('CREATE TRIGGER internal_iam_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation()',table_name);
 END LOOP;
END $$;

-- Policies deliberately grant no legacy-admin bypass. Exact runtime table grants
-- are installed separately after role safety checks.
DO $$ DECLARE table_name TEXT; BEGIN
 FOREACH table_name IN ARRAY ARRAY['internal_organizations','internal_permission_catalog','internal_iam_policy_versions','internal_iam_current_policy','internal_role_definitions','internal_role_versions','internal_role_permissions','internal_role_current_versions','internal_organization_invitations','internal_organization_memberships','internal_membership_grants','internal_membership_grant_revocations','internal_staff_sessions','internal_step_up_challenges','internal_action_authorizations','internal_action_approvals','internal_work_assignments','internal_assignment_commands','internal_access_reviews','internal_access_review_items','internal_break_glass_events','internal_iam_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',table_name);
  EXECUTE format('CREATE POLICY iam_catalog_owner_read ON %I FOR SELECT TO %I USING (true)',table_name,current_user);
 END LOOP;
END $$;

CREATE POLICY iam_organization_read ON internal_organizations FOR SELECT USING(internal_iam_is_active_session(id));
CREATE POLICY iam_organization_manage ON internal_organizations FOR UPDATE USING(internal_iam_has_permission(id,'workforce.grant','ORGANIZATION',id::text,NULL,'PRODUCTION',NULL)) WITH CHECK(internal_iam_has_permission(id,'workforce.grant','ORGANIZATION',id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_catalog_read ON internal_permission_catalog FOR SELECT USING(true);
CREATE POLICY iam_policy_read ON internal_iam_policy_versions FOR SELECT USING(true);
CREATE POLICY iam_current_policy_read ON internal_iam_current_policy FOR SELECT USING(true);
CREATE POLICY iam_current_policy_manage ON internal_iam_current_policy FOR UPDATE USING(internal_iam_has_permission(internal_iam_current_organization_id(),'workforce.grant','ORGANIZATION',internal_iam_current_organization_id()::text,NULL,'PRODUCTION',NULL)) WITH CHECK(internal_iam_has_permission(internal_iam_current_organization_id(),'workforce.grant','ORGANIZATION',internal_iam_current_organization_id()::text,NULL,'PRODUCTION',NULL));

CREATE POLICY iam_role_definition_read ON internal_role_definitions FOR SELECT USING(internal_iam_is_active_session(organization_id));
CREATE POLICY iam_role_version_read ON internal_role_versions FOR SELECT USING(internal_iam_is_active_session(organization_id));
CREATE POLICY iam_role_permission_read ON internal_role_permissions FOR SELECT USING(EXISTS(SELECT 1 FROM internal_role_versions v WHERE v.id=role_version_id AND internal_iam_is_active_session(v.organization_id)));
CREATE POLICY iam_role_current_read ON internal_role_current_versions FOR SELECT USING(internal_iam_is_active_session(organization_id));

CREATE POLICY iam_invitation_manage ON internal_organization_invitations FOR ALL USING(internal_iam_has_permission(organization_id,'workforce.invite','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL)) WITH CHECK(internal_iam_has_permission(organization_id,'workforce.invite','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_membership_self_read ON internal_organization_memberships FOR SELECT USING(user_id=internal_iam_current_user_id());
CREATE POLICY iam_membership_manage_read ON internal_organization_memberships FOR SELECT USING(internal_iam_has_permission(organization_id,'workforce.member.read','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_membership_create ON internal_organization_memberships FOR INSERT WITH CHECK(internal_iam_has_permission(organization_id,'workforce.grant','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_membership_transition ON internal_organization_memberships FOR UPDATE USING(internal_iam_has_permission(organization_id,'workforce.suspend','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL)) WITH CHECK(internal_iam_has_permission(organization_id,'workforce.suspend','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_grant_self_read ON internal_membership_grants FOR SELECT USING(membership_id=internal_iam_current_membership_id() AND internal_iam_is_active_membership(membership_id));
CREATE POLICY iam_grant_manage ON internal_membership_grants FOR INSERT WITH CHECK(internal_iam_has_permission(organization_id,'workforce.grant','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_revocation_self_read ON internal_membership_grant_revocations FOR SELECT USING(EXISTS(SELECT 1 FROM internal_membership_grants g WHERE g.id=grant_id AND g.membership_id=internal_iam_current_membership_id()));
CREATE POLICY iam_revocation_manage ON internal_membership_grant_revocations FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM internal_membership_grants g WHERE g.id=grant_id AND internal_iam_has_permission(g.organization_id,'workforce.grant','WORKFORCE',g.organization_id::text,NULL,'PRODUCTION',NULL)));

CREATE POLICY iam_session_self_read ON internal_staff_sessions FOR SELECT USING(membership_id=internal_iam_current_membership_id() AND internal_iam_is_active_membership(membership_id));
-- Staff authentication and factor evidence is written only by the isolated
-- identity adapters below. Shared runtime SQL cannot manufacture AAL2 proof.
CREATE POLICY iam_session_self_create ON internal_staff_sessions FOR INSERT WITH CHECK(false);
CREATE POLICY iam_session_self_revoke ON internal_staff_sessions FOR UPDATE USING(false) WITH CHECK(false);
CREATE POLICY iam_step_up_self ON internal_step_up_challenges FOR SELECT USING(membership_id=internal_iam_current_membership_id() AND session_id=internal_iam_current_session_id() AND internal_iam_is_active_session(organization_id));
DO $$ BEGIN
 EXECUTE format('CREATE POLICY iam_factor_owner_consume ON internal_step_up_challenges FOR UPDATE TO %I USING (true) WITH CHECK (true)',current_user);
 EXECUTE format('CREATE POLICY iam_action_owner_lock ON internal_action_authorizations FOR UPDATE TO %I USING (true) WITH CHECK (true)',current_user);
END $$;

CREATE POLICY iam_action_participant_read ON internal_action_authorizations FOR SELECT USING(internal_iam_is_active_session(organization_id) AND (maker_membership_id=internal_iam_current_membership_id() OR internal_iam_has_permission(organization_id,permission_code,resource_type,resource_id,provider,environment,amount_minor)));
CREATE POLICY iam_action_create ON internal_action_authorizations FOR INSERT WITH CHECK(maker_membership_id=internal_iam_current_membership_id() AND internal_iam_has_permission(organization_id,permission_code,resource_type,resource_id,provider,environment,amount_minor));
CREATE POLICY iam_action_update ON internal_action_authorizations FOR UPDATE USING(internal_iam_has_permission(organization_id,permission_code,resource_type,resource_id,provider,environment,amount_minor)) WITH CHECK(internal_iam_has_permission(organization_id,permission_code,resource_type,resource_id,provider,environment,amount_minor));
CREATE POLICY iam_approval_read ON internal_action_approvals FOR SELECT USING((checker_membership_id=internal_iam_current_membership_id() AND internal_iam_is_active_membership(checker_membership_id)) OR EXISTS(SELECT 1 FROM internal_action_authorizations a WHERE a.id=authorization_id AND a.maker_membership_id=internal_iam_current_membership_id()));
CREATE POLICY iam_approval_create ON internal_action_approvals FOR INSERT WITH CHECK(checker_membership_id=internal_iam_current_membership_id() AND EXISTS(SELECT 1 FROM internal_action_authorizations a WHERE a.id=authorization_id AND internal_iam_has_permission(a.organization_id,a.permission_code,a.resource_type,a.resource_id,a.provider,a.environment,a.amount_minor)));

DO $$ BEGIN
 EXECUTE format('CREATE POLICY iam_assignment_command_owner_create ON internal_assignment_commands FOR INSERT TO %I WITH CHECK (true)',current_user);
END $$;
CREATE POLICY iam_assignment_command_read ON internal_assignment_commands FOR SELECT USING(actor_membership_id=internal_iam_current_membership_id() AND internal_iam_is_active_session(organization_id));

CREATE POLICY iam_assignment_read ON internal_work_assignments FOR SELECT USING(internal_iam_is_active_session(organization_id) AND (assignee_membership_id=internal_iam_current_membership_id() OR internal_iam_has_permission(organization_id,'work.assignment.reassign','WORKFORCE',organization_id::text,NULL,environment,NULL)));
CREATE POLICY iam_assignment_create ON internal_work_assignments FOR INSERT WITH CHECK(internal_iam_has_permission(organization_id,'work.assignment.reassign','WORKFORCE',organization_id::text,NULL,environment,NULL));
CREATE POLICY iam_assignment_update ON internal_work_assignments FOR UPDATE USING(assignee_membership_id=internal_iam_current_membership_id() OR internal_iam_has_permission(organization_id,'work.assignment.reassign','WORKFORCE',organization_id::text,NULL,environment,NULL)) WITH CHECK(assignee_membership_id=internal_iam_current_membership_id() OR internal_iam_has_permission(organization_id,'work.assignment.reassign','WORKFORCE',organization_id::text,NULL,environment,NULL));

CREATE POLICY iam_access_review_manage ON internal_access_reviews FOR ALL USING(internal_iam_has_permission(organization_id,'workforce.access_review','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL)) WITH CHECK(internal_iam_has_permission(organization_id,'workforce.access_review','WORKFORCE',organization_id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_access_item_manage ON internal_access_review_items FOR ALL USING(EXISTS(SELECT 1 FROM internal_access_reviews r WHERE r.id=review_id AND internal_iam_has_permission(r.organization_id,'workforce.access_review','WORKFORCE',r.organization_id::text,NULL,'PRODUCTION',NULL))) WITH CHECK(EXISTS(SELECT 1 FROM internal_access_reviews r WHERE r.id=review_id AND internal_iam_has_permission(r.organization_id,'workforce.access_review','WORKFORCE',r.organization_id::text,NULL,'PRODUCTION',NULL)));
CREATE POLICY iam_break_glass_manage ON internal_break_glass_events FOR ALL USING(internal_iam_is_active_session(organization_id) AND (requester_membership_id=internal_iam_current_membership_id() OR internal_iam_has_permission(organization_id,'incident.recover','INCIDENT',id::text,NULL,'PRODUCTION',NULL))) WITH CHECK(requester_membership_id=internal_iam_current_membership_id() AND internal_iam_has_permission(organization_id,CASE WHEN scope='RECOVERY' THEN 'incident.recover' ELSE 'incident.pause_global' END,'INCIDENT',id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_event_read ON internal_iam_events FOR SELECT USING(internal_iam_has_permission(organization_id,'audit.read','ORGANIZATION',organization_id::text,NULL,'PRODUCTION',NULL));
CREATE POLICY iam_event_record ON internal_iam_events FOR INSERT WITH CHECK(actor_user_id=internal_iam_current_user_id() AND actor_membership_id=internal_iam_current_membership_id() AND internal_iam_is_active_session(organization_id));

REVOKE ALL ON SEQUENCE internal_iam_events_sequence_seq FROM PUBLIC;

-- CR1 P2 invitation lifecycle: coordinated append-only slice. Shared runtime
-- cannot accept invitations or manufacture verified identity evidence.
ALTER TABLE internal_action_authorizations ADD COLUMN consumed_transaction_id XID8,
 ADD CONSTRAINT internal_authorization_consumption_transaction CHECK((status='CONSUMED')=(consumed_transaction_id IS NOT NULL));
CREATE FUNCTION internal_iam_stamp_consumption_transaction() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.consumed_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'IAM_CONSUMPTION_TRANSACTION_INVALID'; END IF;
 ELSIF OLD.status='APPROVED' AND NEW.status='CONSUMED' THEN
  NEW.consumed_transaction_id:=pg_current_xact_id();
  NEW.consumed_at:=clock_timestamp();
 ELSIF NEW.consumed_transaction_id IS DISTINCT FROM OLD.consumed_transaction_id THEN
  RAISE EXCEPTION 'IAM_CONSUMPTION_TRANSACTION_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_consumption_transaction BEFORE INSERT OR UPDATE ON internal_action_authorizations
 FOR EACH ROW EXECUTE FUNCTION internal_iam_stamp_consumption_transaction();

ALTER TABLE internal_organization_invitations
 ADD COLUMN environment TEXT NOT NULL CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 ADD COLUMN command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 ADD COLUMN policy_snapshot_hash TEXT NOT NULL CHECK(policy_snapshot_hash ~ '^[a-f0-9]{64}$'),
 ADD COLUMN authorization_id UUID NOT NULL UNIQUE REFERENCES internal_action_authorizations(id),
 ADD COLUMN inviter_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id);

CREATE TABLE internal_invitation_identity_receipts (
 invitation_id UUID PRIMARY KEY REFERENCES internal_organization_invitations(id),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id),
 user_id INT NOT NULL REFERENCES users(id),
 membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) DEFERRABLE INITIALLY DEFERRED,
 receipt_hash TEXT NOT NULL UNIQUE CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
 verified_email_hash TEXT NOT NULL CHECK(verified_email_hash ~ '^[a-f0-9]{64}$'),
 verified_subject_hash TEXT NOT NULL CHECK(verified_subject_hash ~ '^[a-f0-9]{64}$'),
 verified_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('TRUSTED_IDENTITY_SERVICE','LOCAL_FIXTURE')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(expires_at>verified_at AND expires_at<=verified_at+interval '24 hours')
);
ALTER TABLE internal_invitation_identity_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_invitation_identity_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON internal_invitation_identity_receipts FROM PUBLIC;
CREATE TRIGGER internal_iam_immutable BEFORE UPDATE OR DELETE ON internal_invitation_identity_receipts
 FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation();

-- JSON-only bounded commands use a common lexical canonical form in SQL and TS.
CREATE FUNCTION internal_iam_canonical_json(value JSONB) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE result TEXT;
BEGIN
 CASE jsonb_typeof(value)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||internal_iam_canonical_json(val),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(value) AS x(key,val);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(internal_iam_canonical_json(val),',' ORDER BY ordinal),'')||']' INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS x(val,ordinal);
 ELSE result:=value::text;
 END CASE;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION internal_iam_canonical_json(JSONB) FROM PUBLIC;

CREATE FUNCTION internal_iam_invitation_command_hash(org UUID,kind TEXT,permission TEXT,env TEXT,reason TEXT,command JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(internal_iam_canonical_json(jsonb_build_object(
 'contract','encho:privileged-command:v1','kind',kind,'organizationId',org::text,'permission',permission,
 'resource',jsonb_build_object('target',jsonb_build_object('type','WORKFORCE','id',org::text),'ancestors','[]'::jsonb),
 'provider',NULL,'environment',env,'amountMinor',NULL,'reason',reason,'command',command)),'UTF8')),'hex')
$$;
REVOKE ALL ON FUNCTION internal_iam_invitation_command_hash(UUID,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;

CREATE FUNCTION internal_iam_guard_invitation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.grant_bundle_hash:=encode(sha256(convert_to(internal_iam_canonical_json(NEW.grant_bundle),'UTF8')),'hex');
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['status','accepted_by','accepted_at','revoked_by','revoked_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','accepted_by','accepted_at','revoked_by','revoked_at'])
 THEN RAISE EXCEPTION 'IAM_INVITATION_IMMUTABLE'; END IF;
 IF OLD.status<>'PENDING' OR NEW.status NOT IN ('ACCEPTED','REVOKED','EXPIRED') THEN RAISE EXCEPTION 'IAM_INVITATION_TRANSITION_INVALID'; END IF;
 IF NEW.status='EXPIRED' AND OLD.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'IAM_INVITATION_NOT_EXPIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_invitation_transition BEFORE INSERT OR UPDATE ON internal_organization_invitations
 FOR EACH ROW EXECUTE FUNCTION internal_iam_guard_invitation();
CREATE TRIGGER internal_invitation_no_delete BEFORE DELETE ON internal_organization_invitations
 FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation();

DROP POLICY iam_invitation_manage ON internal_organization_invitations;
CREATE POLICY iam_invitation_manage ON internal_organization_invitations FOR ALL
 USING(internal_iam_has_permission(organization_id,'workforce.invite','WORKFORCE',organization_id::text,NULL,environment,NULL))
 WITH CHECK(internal_iam_has_permission(organization_id,'workforce.invite','WORKFORCE',organization_id::text,NULL,environment,NULL));

DO $$ BEGIN
 EXECUTE format('CREATE POLICY iam_identity_receipt_owner_read ON internal_invitation_identity_receipts FOR SELECT TO %I USING(true)',current_user);
 EXECUTE format('CREATE POLICY iam_identity_receipt_owner_insert ON internal_invitation_identity_receipts FOR INSERT TO %I WITH CHECK(invitation_id::text=current_setting(''app.iam_acceptance_invitation'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_invitation_owner_create ON internal_organization_invitations FOR INSERT TO %I WITH CHECK(inviter_membership_id=internal_iam_current_membership_id() AND invited_by=internal_iam_current_user_id())',current_user);
 EXECUTE format('CREATE POLICY iam_invitation_owner_accept ON internal_organization_invitations FOR UPDATE TO %I USING(id::text=current_setting(''app.iam_acceptance_invitation'',true)) WITH CHECK(id::text=current_setting(''app.iam_acceptance_invitation'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_membership_owner_accept ON internal_organization_memberships FOR INSERT TO %I WITH CHECK(EXISTS(SELECT 1 FROM internal_invitation_identity_receipts r WHERE r.membership_id=internal_organization_memberships.id AND r.user_id=internal_organization_memberships.user_id AND r.invitation_id=internal_organization_memberships.accepted_invitation_id AND r.organization_id=internal_organization_memberships.organization_id AND r.invitation_id::text=current_setting(''app.iam_acceptance_invitation'',true)))',current_user);
 EXECUTE format('CREATE POLICY iam_grant_owner_accept ON internal_membership_grants FOR INSERT TO %I WITH CHECK(EXISTS(SELECT 1 FROM internal_invitation_identity_receipts r WHERE r.membership_id=internal_membership_grants.membership_id AND r.organization_id=internal_membership_grants.organization_id AND r.invitation_id::text=current_setting(''app.iam_acceptance_invitation'',true)))',current_user);
 EXECUTE format('CREATE POLICY iam_event_owner_accept ON internal_iam_events FOR INSERT TO %I WITH CHECK(entity_type=''INVITATION'' AND entity_id=current_setting(''app.iam_acceptance_invitation'',true) AND event_type IN (''WORKFORCE_INVITATION_ACCEPTED'',''WORKFORCE_INVITATION_EXPIRED''))',current_user);
END $$;

CREATE FUNCTION internal_iam_validate_invitation_bundle(org UUID,bundle JSONB,env TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE entry JSONB; permissions JSONB; role_hash TEXT;
BEGIN
 IF jsonb_typeof(bundle)<>'array' OR jsonb_array_length(bundle) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(bundle) LOOP
  IF (SELECT count(*) FROM jsonb_object_keys(entry))<>8 OR NOT entry ?& ARRAY['roleVersionId','roleHash','permissionCodes','scope','environment','provider','maxAmountMinor','validUntil']
   OR entry->>'environment'<>env OR (entry->'scope'->>'type' IN ('ORGANIZATION','WORKFORCE') AND entry->'scope'->>'id'<>org::text)
   OR (entry->>'validUntil' IS NOT NULL AND (entry->>'validUntil')::timestamptz<=clock_timestamp())
  THEN RETURN false; END IF;
  SELECT v.config_hash,coalesce(jsonb_agg(p.permission_code ORDER BY p.permission_code),'[]'::jsonb) INTO role_hash,permissions
   FROM internal_role_versions v JOIN internal_role_current_versions c ON c.version_id=v.id AND c.organization_id=v.organization_id
   JOIN internal_role_permissions p ON p.role_version_id=v.id
   WHERE v.id=(entry->>'roleVersionId')::uuid AND v.organization_id=org GROUP BY v.config_hash;
  IF role_hash IS NULL OR role_hash<>entry->>'roleHash' OR permissions IS DISTINCT FROM entry->'permissionCodes' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION internal_iam_validate_invitation_bundle(UUID,JSONB,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_issue_invitation(command JSONB,p_authorization UUID,token_digest TEXT,reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE org UUID:=internal_iam_current_organization_id(); auth internal_action_authorizations%ROWTYPE;
 policy internal_iam_policy_versions%ROWTYPE; requested_hash TEXT; invitation UUID; env TEXT;
BEGIN
 IF command IS NULL OR jsonb_typeof(command)<>'object' OR token_digest IS NULL OR reason IS NULL OR p_authorization IS NULL
  OR EXISTS(SELECT 1 FROM jsonb_each(command) WHERE value='null'::jsonb)
  OR octet_length(command::text)>32768 OR (SELECT count(*) FROM jsonb_object_keys(command))<>5
  OR NOT command ?& ARRAY['invitationId','email','environment','expiresAt','grants']
  OR token_digest !~ '^[a-f0-9]{64}$' OR length(reason) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'IAM_INVITATION_INPUT_INVALID'; END IF;
 env:=command->>'environment'; invitation:=(command->>'invitationId')::uuid;
 IF NOT internal_iam_lock_authority() OR NOT internal_iam_has_permission(org,'workforce.invite','WORKFORCE',org::text,NULL,env,NULL)
  OR NOT internal_iam_has_permission(org,'workforce.grant','WORKFORCE',org::text,NULL,env,NULL) THEN RAISE EXCEPTION 'IAM_INVITATION_PERMISSION_DENIED'; END IF;
 SELECT v.* INTO policy FROM internal_iam_current_policy c JOIN internal_iam_policy_versions v ON v.id=c.version_id WHERE c.singleton;
 IF policy.id IS NULL OR (env='PRODUCTION' AND policy.approval_status<>'APPROVED') THEN RAISE EXCEPTION 'IAM_INVITATION_POLICY_UNAPPROVED'; END IF;
 requested_hash:=internal_iam_invitation_command_hash(org,'workforce.invitation.issue.v1','workforce.grant',env,reason,command);
 SELECT * INTO auth FROM internal_action_authorizations WHERE id=p_authorization;
 IF auth.status IS DISTINCT FROM 'CONSUMED' OR auth.maker_membership_id<>internal_iam_current_membership_id()
  OR auth.organization_id<>org OR auth.permission_code<>'workforce.grant' OR auth.command_hash<>requested_hash
  OR auth.policy_snapshot_hash<>policy.config_hash OR auth.required_approvals<1 OR auth.consumed_transaction_id IS DISTINCT FROM pg_current_xact_id()
 THEN RAISE EXCEPTION 'IAM_INVITATION_AUTHORIZATION_INVALID'; END IF;
 LOCK TABLE internal_role_current_versions,internal_role_permissions IN SHARE MODE;
 IF command->>'email'<>lower(btrim(command->>'email')) OR length(command->>'email') NOT BETWEEN 3 AND 254
  OR position('@' IN command->>'email')<2 OR (command->>'expiresAt')::timestamptz<=clock_timestamp()
  OR (command->>'expiresAt')::timestamptz>clock_timestamp()+(policy.config->>'invitationTtlSeconds')::int*interval '1 second'
  OR NOT internal_iam_validate_invitation_bundle(org,command->'grants',env) THEN RAISE EXCEPTION 'IAM_INVITATION_INPUT_INVALID'; END IF;
 INSERT INTO internal_organization_invitations(id,organization_id,email_normalized,token_hash,grant_bundle,grant_bundle_hash,expires_at,
  invited_by,reason,environment,command_hash,policy_snapshot_hash,authorization_id,inviter_membership_id)
 VALUES(invitation,org,command->>'email',token_digest,command->'grants',repeat('0',64),(command->>'expiresAt')::timestamptz,
  internal_iam_current_user_id(),reason,env,requested_hash,policy.config_hash,p_authorization,internal_iam_current_membership_id());
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,request_hash,evidence,correlation_id,reason)
 VALUES(org,internal_iam_current_user_id(),internal_iam_current_membership_id(),'WORKFORCE_INVITATION_ISSUED','INVITATION',invitation::text,requested_hash,
  jsonb_build_object('authorizationId',auth.id,'environment',env),'workforce-invite:'||invitation::text,reason);
 RETURN invitation;
END $$;
REVOKE ALL ON FUNCTION internal_iam_issue_invitation(JSONB,UUID,TEXT,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_revoke_invitation(command JSONB,p_authorization UUID,reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE org UUID:=internal_iam_current_organization_id(); auth internal_action_authorizations%ROWTYPE;
 invitation internal_organization_invitations%ROWTYPE; requested_hash TEXT; policy internal_iam_policy_versions%ROWTYPE;
BEGIN
 IF command IS NULL OR jsonb_typeof(command)<>'object' OR p_authorization IS NULL OR reason IS NULL
  OR EXISTS(SELECT 1 FROM jsonb_each(command) WHERE value='null'::jsonb)
  OR (SELECT count(*) FROM jsonb_object_keys(command))<>3 OR NOT command ?& ARRAY['invitationId','expectedGrantBundleHash','environment'] THEN RAISE EXCEPTION 'IAM_INVITATION_INPUT_INVALID'; END IF;
 IF NOT internal_iam_lock_authority() OR NOT internal_iam_has_permission(org,'workforce.invite','WORKFORCE',org::text,NULL,command->>'environment',NULL) THEN RAISE EXCEPTION 'IAM_INVITATION_PERMISSION_DENIED'; END IF;
 SELECT * INTO invitation FROM internal_organization_invitations WHERE id=(command->>'invitationId')::uuid AND organization_id=org FOR UPDATE;
 IF invitation.id IS NULL OR invitation.environment<>command->>'environment' OR invitation.grant_bundle_hash<>command->>'expectedGrantBundleHash' THEN RAISE EXCEPTION 'IAM_INVITATION_UNAVAILABLE'; END IF;
 requested_hash:=internal_iam_invitation_command_hash(org,'workforce.invitation.revoke.v1','workforce.invite',invitation.environment,reason,command);
 SELECT * INTO auth FROM internal_action_authorizations WHERE id=p_authorization;
 SELECT v.* INTO policy FROM internal_iam_current_policy c JOIN internal_iam_policy_versions v ON v.id=c.version_id WHERE c.singleton;
 IF auth.status IS DISTINCT FROM 'CONSUMED' OR auth.maker_membership_id<>internal_iam_current_membership_id() OR auth.command_hash<>requested_hash
  OR auth.permission_code<>'workforce.invite' OR auth.organization_id<>org OR auth.consumed_transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR policy.id IS NULL OR auth.policy_snapshot_hash<>policy.config_hash OR (invitation.environment='PRODUCTION' AND policy.approval_status<>'APPROVED') THEN RAISE EXCEPTION 'IAM_INVITATION_AUTHORIZATION_INVALID'; END IF;
 IF invitation.status<>'PENDING' THEN RAISE EXCEPTION 'IAM_INVITATION_STATE_CONFLICT'; END IF;
 UPDATE internal_organization_invitations SET status='REVOKED',revoked_by=internal_iam_current_user_id(),revoked_at=clock_timestamp() WHERE id=invitation.id;
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,request_hash,evidence,correlation_id,reason)
 VALUES(org,internal_iam_current_user_id(),internal_iam_current_membership_id(),'WORKFORCE_INVITATION_REVOKED','INVITATION',invitation.id::text,requested_hash,
  jsonb_build_object('authorizationId',auth.id,'environment',invitation.environment),'workforce-invite:'||invitation.id::text,reason);
 RETURN invitation.id;
END $$;
REVOKE ALL ON FUNCTION internal_iam_revoke_invitation(JSONB,UUID,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_accept_invitation(token_digest TEXT,expected_bundle_hash TEXT,proof JSONB,env TEXT,trace TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE invitation internal_organization_invitations%ROWTYPE; policy internal_iam_policy_versions%ROWTYPE;
 prior internal_invitation_identity_receipts%ROWTYPE; auth internal_action_authorizations%ROWTYPE;
 member UUID; account INT; entry JSONB; granted UUID; grants JSONB:='[]'::jsonb; checker UUID; actual_email TEXT;
BEGIN
 IF token_digest IS NULL OR expected_bundle_hash IS NULL OR proof IS NULL OR env IS NULL OR trace IS NULL
  OR EXISTS(SELECT 1 FROM jsonb_each(proof) WHERE value='null'::jsonb)
  OR token_digest !~ '^[a-f0-9]{64}$' OR expected_bundle_hash !~ '^[a-f0-9]{64}$'
  OR env NOT IN ('LOCAL','STAGING','PRODUCTION') OR trace !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  OR jsonb_typeof(proof)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(proof))<>8
  OR NOT proof ?& ARRAY['userId','emailVerified','verifiedEmailHash','verifiedSubjectHash','receiptHash','verifiedAt','expiresAt','source']
  OR proof->'emailVerified' IS DISTINCT FROM 'true'::jsonb
  OR proof->>'verifiedEmailHash' !~ '^[a-f0-9]{64}$' OR proof->>'verifiedSubjectHash' !~ '^[a-f0-9]{64}$' OR proof->>'receiptHash' !~ '^[a-f0-9]{64}$'
  OR proof->>'source' NOT IN ('TRUSTED_IDENTITY_SERVICE','LOCAL_FIXTURE') OR (env<>'LOCAL' AND proof->>'source'<>'TRUSTED_IDENTITY_SERVICE')
  OR (proof->>'verifiedAt')::timestamptz>clock_timestamp() OR (proof->>'verifiedAt')::timestamptz<clock_timestamp()-interval '24 hours'
  OR (proof->>'expiresAt')::timestamptz<=clock_timestamp() OR (proof->>'expiresAt')::timestamptz<=(proof->>'verifiedAt')::timestamptz
  OR (proof->>'expiresAt')::timestamptz>(proof->>'verifiedAt')::timestamptz+interval '24 hours' THEN RAISE EXCEPTION 'IAM_INVITATION_IDENTITY_INVALID'; END IF;
 account:=(proof->>'userId')::int;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 SELECT * INTO invitation FROM internal_organization_invitations WHERE token_hash=token_digest;
 IF invitation.id IS NULL OR invitation.environment<>env OR invitation.grant_bundle_hash<>expected_bundle_hash THEN RAISE EXCEPTION 'IAM_INVITATION_UNAVAILABLE'; END IF;
 PERFORM set_config('app.iam_acceptance_invitation',invitation.id::text,true);
 SELECT * INTO invitation FROM internal_organization_invitations WHERE id=invitation.id FOR UPDATE;
 SELECT encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex') INTO actual_email FROM users WHERE id=account FOR SHARE;
 IF actual_email IS DISTINCT FROM proof->>'verifiedEmailHash' OR actual_email IS DISTINCT FROM encode(sha256(convert_to(invitation.email_normalized,'UTF8')),'hex') THEN RAISE EXCEPTION 'IAM_INVITATION_IDENTITY_INVALID'; END IF;
 SELECT v.* INTO policy FROM internal_iam_current_policy c JOIN internal_iam_policy_versions v ON v.id=c.version_id WHERE c.singleton;
 IF policy.id IS NULL OR policy.config_hash<>invitation.policy_snapshot_hash OR (env='PRODUCTION' AND policy.approval_status<>'APPROVED') THEN RAISE EXCEPTION 'IAM_INVITATION_POLICY_CHANGED'; END IF;
 SELECT * INTO prior FROM internal_invitation_identity_receipts WHERE invitation_id=invitation.id;
 IF invitation.status='ACCEPTED' THEN
  IF invitation.accepted_by<>account OR prior.user_id<>account OR prior.verified_subject_hash<>proof->>'verifiedSubjectHash'
   OR NOT EXISTS(SELECT 1 FROM internal_organization_memberships m WHERE m.id=prior.membership_id AND m.status='ACTIVE' AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
   OR EXISTS(SELECT 1 FROM internal_membership_grants g JOIN internal_membership_grant_revocations r ON r.grant_id=g.id WHERE g.membership_id=prior.membership_id)
  THEN RAISE EXCEPTION 'IAM_INVITATION_UNAVAILABLE'; END IF;
  RETURN jsonb_build_object('outcome','ALREADY_ACCEPTED','invitationId',invitation.id,'membershipId',prior.membership_id,'organizationId',invitation.organization_id);
 END IF;
 IF invitation.status<>'PENDING' THEN RAISE EXCEPTION 'IAM_INVITATION_UNAVAILABLE'; END IF;
 IF invitation.expires_at<=clock_timestamp() THEN
  UPDATE internal_organization_invitations SET status='EXPIRED' WHERE id=invitation.id;
  INSERT INTO internal_iam_events(organization_id,actor_user_id,event_type,entity_type,entity_id,evidence,correlation_id,request_hash,reason)
   VALUES(invitation.organization_id,account,'WORKFORCE_INVITATION_EXPIRED','INVITATION',invitation.id::text,'{}'::jsonb,trace,invitation.command_hash,'Verified acceptance request observed an expired workforce invitation.');
  RETURN jsonb_build_object('outcome','EXPIRED','invitationId',invitation.id,'organizationId',invitation.organization_id);
 END IF;
 SELECT * INTO auth FROM internal_action_authorizations WHERE id=invitation.authorization_id;
 LOCK TABLE internal_role_current_versions,internal_role_permissions IN SHARE MODE;
 FOR checker IN SELECT member_id FROM (SELECT invitation.inviter_membership_id AS member_id UNION SELECT checker_membership_id FROM internal_action_approvals WHERE authorization_id=auth.id) AS members ORDER BY member_id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||checker::text,0));
 END LOOP;
 IF auth.status IS DISTINCT FROM 'CONSUMED' OR auth.command_hash<>invitation.command_hash OR auth.policy_snapshot_hash<>policy.config_hash OR auth.required_approvals<1
  OR NOT internal_iam_membership_has_permission(invitation.inviter_membership_id,invitation.organization_id,'workforce.grant','WORKFORCE',invitation.organization_id::text,NULL,env,NULL)
  OR NOT internal_iam_membership_has_permission(invitation.inviter_membership_id,invitation.organization_id,'workforce.invite','WORKFORCE',invitation.organization_id::text,NULL,env,NULL)
 THEN RAISE EXCEPTION 'IAM_INVITATION_AUTHORIZATION_INVALID'; END IF;
 IF (SELECT count(DISTINCT a.checker_membership_id) FROM internal_action_approvals a
  WHERE a.authorization_id=auth.id AND a.decision='APPROVE' AND a.command_hash=auth.command_hash AND a.checker_membership_id<>auth.maker_membership_id
  AND internal_iam_membership_has_permission(a.checker_membership_id,invitation.organization_id,'workforce.grant','WORKFORCE',invitation.organization_id::text,NULL,env,NULL))<auth.required_approvals
 THEN RAISE EXCEPTION 'IAM_INVITATION_AUTHORIZATION_INVALID'; END IF;
 IF NOT internal_iam_validate_invitation_bundle(invitation.organization_id,invitation.grant_bundle,env) THEN RAISE EXCEPTION 'IAM_INVITATION_ROLE_CHANGED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-invitee:'||invitation.organization_id::text||':'||account::text,0));
 IF EXISTS(SELECT 1 FROM internal_organization_memberships WHERE organization_id=invitation.organization_id AND user_id=account)
  OR EXISTS(SELECT 1 FROM internal_invitation_identity_receipts WHERE receipt_hash=proof->>'receiptHash') THEN RAISE EXCEPTION 'IAM_INVITATION_UNAVAILABLE'; END IF;
 member:=gen_random_uuid();
 INSERT INTO internal_invitation_identity_receipts(invitation_id,organization_id,user_id,membership_id,receipt_hash,verified_email_hash,verified_subject_hash,verified_at,expires_at,source)
 VALUES(invitation.id,invitation.organization_id,account,member,proof->>'receiptHash',proof->>'verifiedEmailHash',proof->>'verifiedSubjectHash',(proof->>'verifiedAt')::timestamptz,(proof->>'expiresAt')::timestamptz,proof->>'source');
 UPDATE internal_organization_invitations SET status='ACCEPTED',accepted_by=account,accepted_at=clock_timestamp() WHERE id=invitation.id;
 INSERT INTO internal_organization_memberships(id,organization_id,user_id,status,accepted_invitation_id,accepted_at,changed_by,change_reason)
 VALUES(member,invitation.organization_id,account,'ACTIVE',invitation.id,clock_timestamp(),account,'Exact verified workforce invitation accepted; no session or factor issued.');
 FOR entry IN SELECT value FROM jsonb_array_elements(invitation.grant_bundle) LOOP
  granted:=gen_random_uuid();
  INSERT INTO internal_membership_grants(id,organization_id,membership_id,role_version_id,scope_type,scope_id,provider,environment,max_amount_minor,valid_until,grant_hash,granted_by,reason)
  VALUES(granted,invitation.organization_id,member,(entry->>'roleVersionId')::uuid,entry->'scope'->>'type',entry->'scope'->>'id',entry->>'provider',env,(entry->>'maxAmountMinor')::bigint,(entry->>'validUntil')::timestamptz,
   encode(sha256(convert_to(invitation.id::text||':'||member::text||':'||internal_iam_canonical_json(entry),'UTF8')),'hex'),invitation.invited_by,invitation.reason);
  grants:=grants||jsonb_build_array(granted);
 END LOOP;
 INSERT INTO internal_iam_events(organization_id,actor_user_id,event_type,entity_type,entity_id,new_hash,evidence,correlation_id,request_hash,reason)
 VALUES(invitation.organization_id,account,'WORKFORCE_INVITATION_ACCEPTED','INVITATION',invitation.id::text,invitation.grant_bundle_hash,
  jsonb_build_object('membershipId',member,'grantIds',grants,'identityReceiptHash',proof->>'receiptHash','environment',env),trace,invitation.command_hash,'Verified identity accepted the exact independently reviewed workforce grant bundle.');
 RETURN jsonb_build_object('outcome','ACCEPTED','invitationId',invitation.id,'membershipId',member,'organizationId',invitation.organization_id);
END $$;
REVOKE ALL ON FUNCTION internal_iam_accept_invitation(TEXT,TEXT,JSONB,TEXT,TEXT) FROM PUBLIC;

-- CR1 P2 personnel safety lifecycle. No shared runtime table mutation grant.
CREATE TABLE internal_workforce_lifecycle_commands (
 authorization_id UUID PRIMARY KEY REFERENCES internal_action_authorizations(id),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id),
 actor_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id),
 target_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id),
 operation TEXT NOT NULL CHECK(operation IN ('SUSPEND','OFFBOARD','REVOKE_SESSIONS')),
 environment TEXT NOT NULL CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 policy_snapshot_hash TEXT NOT NULL CHECK(policy_snapshot_hash ~ '^[a-f0-9]{64}$'),
 previous_version INT NOT NULL CHECK(previous_version>0),
 result_version INT NOT NULL CHECK(result_version=previous_version+1),
 result_status TEXT NOT NULL CHECK(result_status IN ('ACTIVE','SUSPENDED','OFFBOARDED')),
 effects JSONB NOT NULL CHECK(jsonb_typeof(effects)='object' AND octet_length(effects::text)<4096),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(actor_membership_id<>target_membership_id)
);
ALTER TABLE internal_workforce_lifecycle_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_workforce_lifecycle_commands FORCE ROW LEVEL SECURITY;
REVOKE ALL ON internal_workforce_lifecycle_commands FROM PUBLIC;
CREATE TRIGGER internal_iam_immutable BEFORE UPDATE OR DELETE ON internal_workforce_lifecycle_commands FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation();
CREATE INDEX internal_factor_member_status ON internal_step_up_challenges(membership_id,status);
CREATE INDEX internal_action_maker_status ON internal_action_authorizations(maker_membership_id,status);
CREATE INDEX internal_approval_checker_action ON internal_action_approvals(checker_membership_id,authorization_id);
DO $$ BEGIN
 EXECUTE format('CREATE POLICY iam_lifecycle_owner_read ON internal_workforce_lifecycle_commands FOR SELECT TO %I USING(true)',current_user);
 EXECUTE format('CREATE POLICY iam_lifecycle_owner_create ON internal_workforce_lifecycle_commands FOR INSERT TO %I WITH CHECK(actor_membership_id=internal_iam_current_membership_id() AND organization_id=internal_iam_current_organization_id())',current_user);
 EXECUTE format('CREATE POLICY iam_membership_owner_lifecycle ON internal_organization_memberships FOR UPDATE TO %I USING(id::text=current_setting(''app.iam_lifecycle_member'',true)) WITH CHECK(id::text=current_setting(''app.iam_lifecycle_member'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_session_owner_lifecycle ON internal_staff_sessions FOR UPDATE TO %I USING(membership_id::text=current_setting(''app.iam_lifecycle_member'',true)) WITH CHECK(membership_id::text=current_setting(''app.iam_lifecycle_member'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_assignment_owner_lifecycle ON internal_work_assignments FOR UPDATE TO %I USING(assignee_membership_id::text=current_setting(''app.iam_lifecycle_member'',true)) WITH CHECK(assignee_membership_id::text=current_setting(''app.iam_lifecycle_member'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_revocation_owner_lifecycle ON internal_membership_grant_revocations FOR INSERT TO %I WITH CHECK(EXISTS(SELECT 1 FROM internal_membership_grants g WHERE g.id=internal_membership_grant_revocations.grant_id AND g.membership_id::text=current_setting(''app.iam_lifecycle_member'',true)))',current_user);
END $$;
CREATE POLICY iam_lifecycle_self_read ON internal_workforce_lifecycle_commands FOR SELECT USING(actor_membership_id=internal_iam_current_membership_id() AND internal_iam_is_active_session(organization_id) AND internal_iam_has_permission(organization_id,'workforce.suspend','WORKFORCE',organization_id::text,NULL,environment,NULL));

CREATE FUNCTION internal_iam_apply_workforce_lifecycle(command JSONB,p_authorization UUID,reason TEXT,trace TEXT,causation TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
#variable_conflict use_variable
DECLARE org UUID:=internal_iam_current_organization_id(); actor UUID:=internal_iam_current_membership_id(); target UUID;
 auth internal_action_authorizations%ROWTYPE; member internal_organization_memberships%ROWTYPE; policy internal_iam_policy_versions%ROWTYPE;
 prior internal_workforce_lifecycle_commands%ROWTYPE; saved internal_workforce_lifecycle_commands%ROWTYPE;
 op TEXT; env TEXT; affected_env TEXT; requested_hash TEXT; locked_member UUID; owner_target BOOLEAN; production_owner BOOLEAN;
 before_hash TEXT; grants_count INT:=0; sessions_count INT:=0; factors_count INT:=0; assignments_count INT:=0; actions_count INT:=0;
BEGIN
 IF command IS NULL OR jsonb_typeof(command)<>'object' OR p_authorization IS NULL OR reason IS NULL OR trace IS NULL
  OR (SELECT count(*) FROM jsonb_object_keys(command))<>4 OR NOT command ?& ARRAY['targetMembershipId','expectedVersion','operation','environment']
  OR EXISTS(SELECT 1 FROM jsonb_each(command) WHERE value='null'::jsonb) OR octet_length(command::text)>4096
  OR (command->>'expectedVersion') !~ '^[1-9][0-9]{0,9}$' OR (command->>'expectedVersion')::bigint>=2147483647
  OR command->>'operation' NOT IN ('SUSPEND','OFFBOARD','REVOKE_SESSIONS') OR command->>'environment' NOT IN ('LOCAL','STAGING','PRODUCTION')
  OR length(reason) NOT BETWEEN 10 AND 2000 OR reason<>btrim(reason) OR trace !~ '^[A-Za-z0-9._:-]{1,128}$'
  OR (causation IS NOT NULL AND causation !~ '^[A-Za-z0-9._:-]{1,128}$') THEN RAISE EXCEPTION 'IAM_LIFECYCLE_INPUT_INVALID'; END IF;
 target:=(command->>'targetMembershipId')::uuid; op:=command->>'operation';env:=command->>'environment';
 IF actor IS NULL OR org IS NULL OR actor=target THEN RAISE EXCEPTION 'IAM_LIFECYCLE_SELF_ACTION_DENIED'; END IF;
 -- Rare offboarding safety barrier: no protected operation can race past the
 -- revocation transaction. Never perform external network work under this lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-policy',0));
 FOR locked_member IN
  SELECT actor UNION SELECT target UNION
  SELECT a.checker_membership_id FROM internal_action_approvals a WHERE a.authorization_id=p_authorization UNION
  SELECT g.membership_id FROM internal_membership_grants g JOIN internal_role_versions v ON v.id=g.role_version_id JOIN internal_role_definitions d ON d.id=v.role_id
   WHERE g.organization_id=org AND d.role_key='platform_owner' AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id)
  ORDER BY 1
 LOOP PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||locked_member::text,0)); END LOOP;
 IF NOT internal_iam_is_active_session(org) OR NOT internal_iam_has_permission(org,'workforce.suspend','WORKFORCE',org::text,NULL,env,NULL) THEN RAISE EXCEPTION 'IAM_LIFECYCLE_PERMISSION_DENIED'; END IF;
 SELECT v.* INTO policy FROM internal_iam_current_policy cp JOIN internal_iam_policy_versions v ON v.id=cp.version_id WHERE cp.singleton;
 IF policy.id IS NULL OR (env='PRODUCTION' AND policy.approval_status<>'APPROVED') THEN RAISE EXCEPTION 'IAM_LIFECYCLE_NOT_READY'; END IF;
 SELECT * INTO auth FROM internal_action_authorizations WHERE id=p_authorization AND organization_id=org AND maker_membership_id=actor FOR UPDATE;
 IF NOT FOUND OR auth.permission_code NOT IN ('workforce.suspend','workforce.grant') OR auth.environment<>env OR auth.resource_type<>'WORKFORCE' OR auth.resource_id<>org::text OR auth.provider IS NOT NULL OR auth.amount_minor IS NOT NULL THEN RAISE EXCEPTION 'IAM_LIFECYCLE_AUTHORIZATION_INVALID'; END IF;
 requested_hash:=internal_iam_invitation_command_hash(org,'workforce.lifecycle.v1',auth.permission_code,env,reason,command);
 IF auth.command_hash<>requested_hash THEN RAISE EXCEPTION 'IAM_LIFECYCLE_COMMAND_CONFLICT'; END IF;
 SELECT * INTO prior FROM internal_workforce_lifecycle_commands WHERE authorization_id=p_authorization;
 IF FOUND THEN RETURN jsonb_build_object('receipt',to_jsonb(prior),'replayed',true); END IF;
 IF auth.status<>'APPROVED' OR auth.policy_snapshot_hash<>policy.config_hash THEN RAISE EXCEPTION 'IAM_LIFECYCLE_AUTHORIZATION_INVALID'; END IF;
 PERFORM set_config('app.iam_lifecycle_member',target::text,true);
 SELECT * INTO member FROM internal_organization_memberships WHERE id=target AND organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'IAM_LIFECYCLE_NOT_FOUND'; END IF;
 IF member.version<>(command->>'expectedVersion')::int THEN RAISE EXCEPTION 'IAM_LIFECYCLE_CAS_CONFLICT'; END IF;
 IF member.status='OFFBOARDED' OR (op='SUSPEND' AND member.status<>'ACTIVE') THEN RAISE EXCEPTION 'IAM_LIFECYCLE_STATE_CONFLICT'; END IF;
 -- Membership is global. Require authority in every outstanding grant lane,
 -- including a future grant, rather than allowing a LOCAL permission to remove
 -- production access as an accidental side effect.
 IF EXISTS(SELECT 1 FROM internal_membership_grants g WHERE g.membership_id=target AND g.environment='PRODUCTION' AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id)) AND env<>'PRODUCTION'
  OR NOT EXISTS(SELECT 1 FROM internal_membership_grants g WHERE g.membership_id=target AND g.environment='PRODUCTION' AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id))
    AND EXISTS(SELECT 1 FROM internal_membership_grants g WHERE g.membership_id=target AND g.environment='STAGING' AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id)) AND env='LOCAL'
 THEN RAISE EXCEPTION 'IAM_LIFECYCLE_ENVIRONMENT_SCOPE_DENIED'; END IF;
 FOR affected_env IN SELECT DISTINCT g.environment FROM internal_membership_grants g WHERE g.membership_id=target AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id) LOOP
  IF NOT internal_iam_membership_has_permission(actor,org,'workforce.suspend','WORKFORCE',org::text,NULL,affected_env,NULL) THEN RAISE EXCEPTION 'IAM_LIFECYCLE_ENVIRONMENT_SCOPE_DENIED'; END IF;
  IF affected_env='PRODUCTION' AND policy.approval_status<>'APPROVED' THEN RAISE EXCEPTION 'IAM_LIFECYCLE_NOT_READY'; END IF;
 END LOOP;
 SELECT EXISTS(SELECT 1 FROM internal_membership_grants g JOIN internal_role_versions v ON v.id=g.role_version_id JOIN internal_role_definitions d ON d.id=v.role_id WHERE g.membership_id=target AND d.role_key='platform_owner' AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id)) INTO owner_target;
 IF owner_target AND op<>'REVOKE_SESSIONS' THEN
  IF auth.permission_code<>'workforce.grant' OR auth.required_approvals<1 OR EXISTS(SELECT 1 FROM internal_action_approvals a WHERE a.authorization_id=auth.id AND a.decision='APPROVE' AND a.checker_membership_id=target) THEN RAISE EXCEPTION 'IAM_LIFECYCLE_OWNER_CHECKER_REQUIRED'; END IF;
  SELECT EXISTS(SELECT 1 FROM internal_membership_grants g JOIN internal_role_versions v ON v.id=g.role_version_id JOIN internal_role_definitions d ON d.id=v.role_id WHERE g.membership_id=target AND g.environment='PRODUCTION' AND d.role_key='platform_owner' AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id)) INTO production_owner;
  IF production_owner AND (SELECT count(DISTINCT g.membership_id) FROM internal_membership_grants g JOIN internal_role_versions v ON v.id=g.role_version_id JOIN internal_role_definitions d ON d.id=v.role_id JOIN internal_organization_memberships m ON m.id=g.membership_id WHERE g.organization_id=org AND g.membership_id<>target AND g.environment='PRODUCTION' AND g.scope_type='ORGANIZATION' AND g.scope_id=org::text AND g.provider IS NULL AND g.max_amount_minor IS NULL AND d.role_key='platform_owner' AND m.status='ACTIVE' AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND g.valid_from<=clock_timestamp() AND (g.valid_until IS NULL OR g.valid_until>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id))<(policy.config->>'minimumOwnersForProduction')::int THEN RAISE EXCEPTION 'IAM_LIFECYCLE_OWNER_QUORUM_REQUIRED'; END IF;
 END IF;
 -- The transition trigger rechecks every independent approval and exact factor
 -- now, consumes proofs once and preserves the immutable policy/command binding.
 UPDATE internal_action_authorizations SET status='CONSUMED',consumed_at=clock_timestamp(),version=version+1 WHERE id=auth.id;
 PERFORM set_config('app.iam_lifecycle_member',target::text,true);
 before_hash:=encode(sha256(convert_to(to_jsonb(member)::text,'UTF8')),'hex');
 IF op<>'REVOKE_SESSIONS' THEN
  INSERT INTO internal_membership_grant_revocations(grant_id,revoked_by,reason) SELECT g.id,internal_iam_current_user_id(),reason FROM internal_membership_grants g WHERE g.membership_id=target ON CONFLICT(grant_id) DO NOTHING;
  GET DIAGNOSTICS grants_count=ROW_COUNT;
 END IF;
 WITH changed AS (UPDATE internal_staff_sessions SET status='REVOKED',revoked_at=clock_timestamp(),revoked_by=internal_iam_current_user_id(),revoke_reason=reason WHERE membership_id=target AND status='ACTIVE' RETURNING id)
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,evidence,correlation_id,causation_id,request_hash,reason)
 SELECT org,internal_iam_current_user_id(),actor,'WORKFORCE_SESSION_REVOKED','SESSION',id::text,jsonb_build_object('authorizationId',auth.id,'targetMembershipId',target),trace,causation,requested_hash,reason FROM changed;
 GET DIAGNOSTICS sessions_count=ROW_COUNT;
 UPDATE internal_step_up_challenges SET status='EXPIRED' WHERE membership_id=target AND status IN ('PENDING','VERIFIED');
 GET DIAGNOSTICS factors_count=ROW_COUNT;
 WITH changed AS (UPDATE internal_work_assignments SET state='RELEASED',lease_until=NULL,version=version+1,fence=fence+1,reason=internal_iam_apply_workforce_lifecycle.reason WHERE assignee_membership_id=target AND state IN ('ASSIGNED','CLAIMED') RETURNING id,fence,version)
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,evidence,correlation_id,causation_id,request_hash,reason)
 SELECT org,internal_iam_current_user_id(),actor,'WORK_ASSIGNMENT_RELEASED','WORK_ASSIGNMENT',id::text,jsonb_build_object('authorizationId',auth.id,'fence',fence::text,'version',version),trace,causation,requested_hash,reason FROM changed;
 GET DIAGNOSTICS assignments_count=ROW_COUNT;
 WITH changed AS (UPDATE internal_action_authorizations a SET status='CANCELLED',version=a.version+1 WHERE a.organization_id=org AND a.status IN ('PENDING','APPROVED') AND (a.maker_membership_id=target OR EXISTS(SELECT 1 FROM internal_action_approvals checkers WHERE checkers.authorization_id=a.id AND checkers.checker_membership_id=target)) RETURNING a.id)
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,evidence,correlation_id,causation_id,request_hash,reason)
 SELECT org,internal_iam_current_user_id(),actor,'WORKFORCE_ACTION_CANCELLED','AUTHORIZATION',id::text,jsonb_build_object('lifecycleAuthorizationId',auth.id,'targetMembershipId',target),trace,causation,requested_hash,reason FROM changed;
 GET DIAGNOSTICS actions_count=ROW_COUNT;
 UPDATE internal_organization_memberships SET status=CASE op WHEN 'SUSPEND' THEN 'SUSPENDED' WHEN 'OFFBOARD' THEN 'OFFBOARDED' ELSE status END,
  suspended_at=CASE WHEN op='SUSPEND' THEN clock_timestamp() WHEN op='OFFBOARD' THEN NULL ELSE suspended_at END,
  offboarded_at=CASE WHEN op='OFFBOARD' THEN clock_timestamp() ELSE offboarded_at END,version=version+1,changed_by=internal_iam_current_user_id(),change_reason=reason WHERE id=target RETURNING * INTO member;
 INSERT INTO internal_workforce_lifecycle_commands(authorization_id,organization_id,actor_membership_id,target_membership_id,operation,environment,command_hash,policy_snapshot_hash,previous_version,result_version,result_status,effects,reason)
 VALUES(auth.id,org,actor,target,op,env,requested_hash,policy.config_hash,(command->>'expectedVersion')::int,member.version,member.status,jsonb_build_object('grantsRevoked',grants_count,'sessionsRevoked',sessions_count,'factorsExpired',factors_count,'assignmentsReleased',assignments_count,'authorizationsCancelled',actions_count),reason) RETURNING * INTO saved;
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,previous_hash,new_hash,evidence,correlation_id,causation_id,request_hash,reason)
 VALUES(org,internal_iam_current_user_id(),actor,'WORKFORCE_LIFECYCLE_APPLIED','MEMBERSHIP',target::text,before_hash,encode(sha256(convert_to(to_jsonb(member)::text,'UTF8')),'hex'),jsonb_build_object('authorizationId',auth.id,'operation',op,'effects',saved.effects,'version',member.version),trace,causation,requested_hash,reason);
 RETURN jsonb_build_object('receipt',to_jsonb(saved),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION internal_iam_apply_workforce_lifecycle(JSONB,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;

-- CR1 P2 isolated Google identity/session issuer. No identity policy is seeded
-- or approved here. The runtime cannot create challenges, receipts or sessions.
CREATE TABLE internal_workforce_identity_policies (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES internal_organizations(id),
 environment TEXT NOT NULL CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')), version INT NOT NULL CHECK(version>0),
 config JSONB NOT NULL, config_hash TEXT NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
 approval_status TEXT NOT NULL CHECK(approval_status IN ('PENDING_FOUNDER_OPERATIONAL_APPROVAL','APPROVED')),
 created_by INT NOT NULL REFERENCES users(id), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), UNIQUE(organization_id,environment,version), UNIQUE(id,organization_id,environment),
 CHECK(jsonb_typeof(config)='object' AND config ?& ARRAY['googleClientId','challengeTtlSeconds','idTokenMaxAgeSeconds','allowGmail','allowedHostedDomains','maximumActiveSessions','maximumStartsPerMinute']),
 CHECK((jsonb_typeof(config->'googleClientId')='string' AND config->>'googleClientId' ~ '^[A-Za-z0-9_-]{8,200}[.]apps[.]googleusercontent[.]com$') IS TRUE),
 CHECK((jsonb_typeof(config->'challengeTtlSeconds')='number' AND (config->>'challengeTtlSeconds')::int BETWEEN 60 AND 600) IS TRUE),
 CHECK((jsonb_typeof(config->'idTokenMaxAgeSeconds')='number' AND (config->>'idTokenMaxAgeSeconds')::int BETWEEN 60 AND 600) IS TRUE),
 CHECK((jsonb_typeof(config->'allowGmail')='boolean' AND jsonb_typeof(config->'allowedHostedDomains')='array' AND jsonb_array_length(config->'allowedHostedDomains')<=20) IS TRUE),
 CHECK((jsonb_typeof(config->'maximumActiveSessions')='number' AND (config->>'maximumActiveSessions')::int BETWEEN 1 AND 10) IS TRUE),
 CHECK((jsonb_typeof(config->'maximumStartsPerMinute')='number' AND (config->>'maximumStartsPerMinute')::int BETWEEN 1 AND 1200) IS TRUE)
);
CREATE TABLE internal_workforce_current_identity_policy (
 organization_id UUID NOT NULL, environment TEXT NOT NULL, policy_id UUID NOT NULL,
 PRIMARY KEY(organization_id,environment), FOREIGN KEY(policy_id,organization_id,environment) REFERENCES internal_workforce_identity_policies(id,organization_id,environment)
);
CREATE TABLE internal_workforce_login_challenges (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL, environment TEXT NOT NULL, policy_id UUID NOT NULL,
 nonce_hash TEXT NOT NULL UNIQUE CHECK(nonce_hash ~ '^[a-f0-9]{64}$'), browser_hash TEXT NOT NULL CHECK(browser_hash ~ '^[a-f0-9]{64}$'),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONSUMED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
 FOREIGN KEY(policy_id,organization_id,environment) REFERENCES internal_workforce_identity_policies(id,organization_id,environment),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
 CHECK((status='CONSUMED')=(consumed_at IS NOT NULL))
);
CREATE INDEX internal_login_challenge_rate ON internal_workforce_login_challenges(organization_id,environment,created_at);
CREATE TABLE internal_workforce_login_receipts (
 challenge_id UUID PRIMARY KEY REFERENCES internal_workforce_login_challenges(id),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id), environment TEXT NOT NULL CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 user_id INT NOT NULL REFERENCES users(id), membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id),
 session_id UUID NOT NULL UNIQUE REFERENCES internal_staff_sessions(id) DEFERRABLE INITIALLY DEFERRED,
 subject_hash TEXT NOT NULL CHECK(subject_hash ~ '^[a-f0-9]{64}$'), email_hash TEXT NOT NULL CHECK(email_hash ~ '^[a-f0-9]{64}$'),
 token_hash TEXT NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), identity_policy_hash TEXT NOT NULL CHECK(identity_policy_hash ~ '^[a-f0-9]{64}$'),
 iam_policy_hash TEXT NOT NULL CHECK(iam_policy_hash ~ '^[a-f0-9]{64}$'),
 token_issued_at TIMESTAMPTZ NOT NULL, token_expires_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ NOT NULL,
 provider_authenticated_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(token_expires_at>token_issued_at), CHECK(provider_authenticated_at IS NULL OR provider_authenticated_at<=verified_at+interval '30 seconds')
);
CREATE FUNCTION internal_iam_identity_policy_hash() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.config))<>7 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.config->'allowedHostedDomains') d WHERE jsonb_typeof(d)<>'string' OR d#>>'{}' !~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$')
 THEN RAISE EXCEPTION 'IAM_IDENTITY_POLICY_INVALID'; END IF;
 NEW.config_hash:=encode(sha256(convert_to(internal_iam_canonical_json(jsonb_build_object('organizationId',NEW.organization_id,'environment',NEW.environment,'version',NEW.version,'config',NEW.config,'approvalStatus',NEW.approval_status)),'UTF8')),'hex');RETURN NEW;
END $$;
CREATE TRIGGER internal_identity_policy_hash BEFORE INSERT ON internal_workforce_identity_policies FOR EACH ROW EXECUTE FUNCTION internal_iam_identity_policy_hash();
CREATE TRIGGER internal_identity_policy_fence BEFORE INSERT OR UPDATE OR DELETE ON internal_workforce_current_identity_policy FOR EACH ROW EXECUTE FUNCTION internal_iam_fence_policy();
CREATE TRIGGER internal_iam_immutable BEFORE UPDATE OR DELETE ON internal_workforce_identity_policies FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation();
CREATE TRIGGER internal_iam_immutable BEFORE UPDATE OR DELETE ON internal_workforce_login_receipts FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation();
CREATE FUNCTION internal_iam_guard_login_challenge() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','consumed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','consumed_at'])
 OR OLD.status<>'PENDING' OR NEW.status<>'CONSUMED' OR NEW.consumed_at IS NULL THEN RAISE EXCEPTION 'IAM_LOGIN_CHALLENGE_IMMUTABLE'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER internal_login_challenge_transition BEFORE UPDATE ON internal_workforce_login_challenges FOR EACH ROW EXECUTE FUNCTION internal_iam_guard_login_challenge();
CREATE TRIGGER internal_login_challenge_no_delete BEFORE DELETE ON internal_workforce_login_challenges FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation();
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['internal_workforce_identity_policies','internal_workforce_current_identity_policy','internal_workforce_login_challenges','internal_workforce_login_receipts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tab);
  EXECUTE format('CREATE POLICY iam_login_owner_read ON %I FOR SELECT TO %I USING(true)',tab,current_user);
 END LOOP;
 EXECUTE format('CREATE POLICY iam_identity_policy_owner_create ON internal_workforce_identity_policies FOR INSERT TO %I WITH CHECK(true)',current_user);
 EXECUTE format('CREATE POLICY iam_identity_pointer_owner_write ON internal_workforce_current_identity_policy FOR ALL TO %I USING(true) WITH CHECK(true)',current_user);
 EXECUTE format('CREATE POLICY iam_login_challenge_owner_create ON internal_workforce_login_challenges FOR INSERT TO %I WITH CHECK(id::text=current_setting(''app.iam_login_challenge'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_login_challenge_owner_consume ON internal_workforce_login_challenges FOR UPDATE TO %I USING(id::text=current_setting(''app.iam_login_challenge'',true)) WITH CHECK(id::text=current_setting(''app.iam_login_challenge'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_login_receipt_owner_create ON internal_workforce_login_receipts FOR INSERT TO %I WITH CHECK(challenge_id::text=current_setting(''app.iam_login_challenge'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_session_owner_issue ON internal_staff_sessions FOR INSERT TO %I WITH CHECK(EXISTS(SELECT 1 FROM internal_workforce_login_receipts r WHERE r.session_id=internal_staff_sessions.id AND r.membership_id=internal_staff_sessions.membership_id AND r.organization_id=internal_staff_sessions.organization_id AND r.environment=internal_staff_sessions.environment AND r.challenge_id::text=current_setting(''app.iam_login_challenge'',true)))',current_user);
 EXECUTE format('CREATE POLICY iam_session_owner_logout ON internal_staff_sessions FOR UPDATE TO %I USING(id::text=current_setting(''app.iam_logout_session'',true)) WITH CHECK(id::text=current_setting(''app.iam_logout_session'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_login_event_owner_create ON internal_iam_events FOR INSERT TO %I WITH CHECK(entity_type=''SESSION'' AND entity_id=current_setting(''app.iam_login_session'',true) AND event_type IN (''WORKFORCE_SESSION_ISSUED'',''WORKFORCE_SESSION_LOGGED_OUT''))',current_user);
END $$;

CREATE FUNCTION internal_iam_begin_workforce_login(org UUID,env TEXT,audience TEXT,challenge UUID,nonce_digest TEXT,browser_digest TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE identity_policy internal_workforce_identity_policies%ROWTYPE; iam_policy internal_iam_policy_versions%ROWTYPE; expiry TIMESTAMPTZ;
BEGIN
 IF org IS NULL OR env IS NULL OR audience IS NULL OR challenge IS NULL OR nonce_digest IS NULL OR browser_digest IS NULL OR env NOT IN ('LOCAL','STAGING','PRODUCTION') OR nonce_digest !~ '^[a-f0-9]{64}$' OR browser_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'IAM_LOGIN_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 SELECT p.* INTO identity_policy FROM internal_workforce_current_identity_policy c JOIN internal_workforce_identity_policies p ON p.id=c.policy_id WHERE c.organization_id=org AND c.environment=env;
 SELECT p.* INTO iam_policy FROM internal_iam_current_policy c JOIN internal_iam_policy_versions p ON p.id=c.version_id WHERE c.singleton;
 IF identity_policy.id IS NULL OR iam_policy.id IS NULL OR identity_policy.config->>'googleClientId'<>audience OR NOT EXISTS(SELECT 1 FROM internal_organizations WHERE id=org AND status='ACTIVE')
 OR (env='PRODUCTION' AND (identity_policy.approval_status<>'APPROVED' OR iam_policy.approval_status<>'APPROVED')) THEN RAISE EXCEPTION 'IAM_LOGIN_NOT_CONFIGURED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-login-rate:'||org::text||':'||env,0));
 IF (SELECT count(*) FROM internal_workforce_login_challenges WHERE organization_id=org AND environment=env AND created_at>clock_timestamp()-interval '1 minute')>=(identity_policy.config->>'maximumStartsPerMinute')::int THEN RAISE EXCEPTION 'IAM_LOGIN_RATE_LIMITED'; END IF;
 expiry:=clock_timestamp()+(identity_policy.config->>'challengeTtlSeconds')::int*interval '1 second';
 PERFORM set_config('app.iam_login_challenge',challenge::text,true);
 INSERT INTO internal_workforce_login_challenges(id,organization_id,environment,policy_id,nonce_hash,browser_hash,expires_at) VALUES(challenge,org,env,identity_policy.id,nonce_digest,browser_digest,expiry);
 RETURN jsonb_build_object('challengeId',challenge,'expiresAt',expiry,'maximumAgeSeconds',(identity_policy.config->>'idTokenMaxAgeSeconds')::int);
END $$;
REVOKE ALL ON FUNCTION internal_iam_begin_workforce_login(UUID,TEXT,TEXT,UUID,TEXT,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_read_workforce_login(challenge UUID,browser_digest TEXT,env TEXT,audience TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE c internal_workforce_login_challenges%ROWTYPE; p internal_workforce_identity_policies%ROWTYPE;
BEGIN
 SELECT * INTO c FROM internal_workforce_login_challenges WHERE id=challenge AND browser_hash=browser_digest AND environment=env AND status='PENDING' AND expires_at>clock_timestamp();
 SELECT v.* INTO p FROM internal_workforce_current_identity_policy cp JOIN internal_workforce_identity_policies v ON v.id=cp.policy_id WHERE cp.organization_id=c.organization_id AND cp.environment=env;
 IF c.id IS NULL OR p.id IS DISTINCT FROM c.policy_id OR p.config->>'googleClientId' IS DISTINCT FROM audience OR (env='PRODUCTION' AND p.approval_status<>'APPROVED') THEN RAISE EXCEPTION 'IAM_LOGIN_CHALLENGE_INVALID'; END IF;
 RETURN jsonb_build_object('nonceHash',c.nonce_hash,'maximumAgeSeconds',(p.config->>'idTokenMaxAgeSeconds')::int);
END $$;
REVOKE ALL ON FUNCTION internal_iam_read_workforce_login(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_issue_staff_session(challenge UUID,browser_digest TEXT,proof JSONB,session_digest TEXT,env TEXT,trace TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE c internal_workforce_login_challenges%ROWTYPE; p internal_workforce_identity_policies%ROWTYPE; policy internal_iam_policy_versions%ROWTYPE;
 member internal_organization_memberships%ROWTYPE; account INT; actual_email TEXT; sid UUID:=gen_random_uuid(); now_at TIMESTAMPTZ; idle_at TIMESTAMPTZ; absolute_at TIMESTAMPTZ; email TEXT; hosted TEXT;
BEGIN
 IF challenge IS NULL OR browser_digest IS NULL OR proof IS NULL OR session_digest IS NULL OR env IS NULL OR trace IS NULL OR env NOT IN ('LOCAL','STAGING','PRODUCTION')
 OR browser_digest !~ '^[a-f0-9]{64}$' OR session_digest !~ '^[a-f0-9]{64}$' OR trace !~ '^[A-Za-z0-9._:-]{1,128}$'
 OR jsonb_typeof(proof)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(proof))<>12
 OR NOT proof ?& ARRAY['subject','email','hostedDomain','audience','nonceHash','tokenHash','issuedAt','expiresAt','verifiedAt','providerAuthenticatedAt','assurance','source']
 OR proof->>'assurance' IS DISTINCT FROM 'AAL1' OR proof->>'source' IS DISTINCT FROM 'GOOGLE_OIDC' OR proof->>'subject' IS NULL OR proof->>'subject' !~ '^[!-~]{1,255}$'
 OR proof->>'email' IS NULL OR proof->>'nonceHash' IS NULL OR proof->>'tokenHash' IS NULL OR proof->>'issuedAt' IS NULL OR proof->>'expiresAt' IS NULL OR proof->>'verifiedAt' IS NULL
 OR proof->>'nonceHash' !~ '^[a-f0-9]{64}$' OR proof->>'tokenHash' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'IAM_LOGIN_IDENTITY_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 PERFORM set_config('app.iam_login_challenge',challenge::text,true);
 SELECT * INTO c FROM internal_workforce_login_challenges WHERE id=challenge AND browser_hash=browser_digest AND environment=env FOR UPDATE;
 SELECT v.* INTO p FROM internal_workforce_current_identity_policy cp JOIN internal_workforce_identity_policies v ON v.id=cp.policy_id WHERE cp.organization_id=c.organization_id AND cp.environment=env;
 SELECT v.* INTO policy FROM internal_iam_current_policy cp JOIN internal_iam_policy_versions v ON v.id=cp.version_id WHERE cp.singleton;
 IF c.id IS NULL OR c.status<>'PENDING' OR c.expires_at<=clock_timestamp() OR p.id IS DISTINCT FROM c.policy_id OR policy.id IS NULL OR proof->>'audience' IS DISTINCT FROM p.config->>'googleClientId'
 OR (env='PRODUCTION' AND (p.approval_status<>'APPROVED' OR policy.approval_status<>'APPROVED')) THEN RAISE EXCEPTION 'IAM_LOGIN_CHALLENGE_INVALID'; END IF;
 IF proof->>'nonceHash'<>c.nonce_hash OR (proof->>'issuedAt')::timestamptz<clock_timestamp()-(p.config->>'idTokenMaxAgeSeconds')::int*interval '1 second'
 OR (proof->>'issuedAt')::timestamptz>clock_timestamp()+interval '30 seconds' OR (proof->>'expiresAt')::timestamptz<=clock_timestamp()
 OR (proof->>'verifiedAt')::timestamptz>clock_timestamp()+interval '5 seconds' OR (proof->>'verifiedAt')::timestamptz<clock_timestamp()-interval '30 seconds'
 THEN RAISE EXCEPTION 'IAM_LOGIN_IDENTITY_INVALID'; END IF;
 email:=proof->>'email';hosted:=proof->>'hostedDomain';
 IF email<>lower(btrim(email)) OR length(email)>254 OR NOT ((right(email,10)='@gmail.com' AND (p.config->>'allowGmail')::boolean)
 OR (hosted IS NOT NULL AND split_part(email,'@',2)=hosted AND p.config->'allowedHostedDomains' ? hosted)) THEN RAISE EXCEPTION 'IAM_LOGIN_IDENTITY_INVALID'; END IF;
 BEGIN
  SELECT id,lower(btrim(users.email)) INTO STRICT account,actual_email FROM users WHERE google_id=proof->>'subject' FOR SHARE;
 EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'IAM_LOGIN_MEMBERSHIP_UNAVAILABLE'; END;
 IF actual_email IS DISTINCT FROM email THEN RAISE EXCEPTION 'IAM_LOGIN_MEMBERSHIP_UNAVAILABLE'; END IF;
 SELECT * INTO member FROM internal_organization_memberships WHERE organization_id=c.organization_id AND user_id=account;
 IF member.id IS NULL THEN RAISE EXCEPTION 'IAM_LOGIN_MEMBERSHIP_UNAVAILABLE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||member.id::text,0));
 SELECT * INTO member FROM internal_organization_memberships WHERE id=member.id;
 IF member.status<>'ACTIVE' OR (member.expires_at IS NOT NULL AND member.expires_at<=clock_timestamp())
 OR NOT EXISTS(SELECT 1 FROM internal_organizations WHERE id=member.organization_id AND status='ACTIVE')
 OR NOT EXISTS(SELECT 1 FROM internal_membership_grants g JOIN internal_role_current_versions r ON r.version_id=g.role_version_id AND r.organization_id=g.organization_id WHERE g.membership_id=member.id AND g.environment=env AND g.valid_from<=clock_timestamp() AND (g.valid_until IS NULL OR g.valid_until>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM internal_membership_grant_revocations x WHERE x.grant_id=g.id))
 OR (member.accepted_invitation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM internal_invitation_identity_receipts r WHERE r.invitation_id=member.accepted_invitation_id AND r.user_id=account AND r.verified_subject_hash=encode(sha256(convert_to(proof->>'subject','UTF8')),'hex')))
 THEN RAISE EXCEPTION 'IAM_LOGIN_MEMBERSHIP_UNAVAILABLE'; END IF;
 IF (SELECT count(*) FROM internal_staff_sessions WHERE membership_id=member.id AND environment=env AND status='ACTIVE' AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp())>=(p.config->>'maximumActiveSessions')::int THEN RAISE EXCEPTION 'IAM_LOGIN_SESSION_LIMIT'; END IF;
 now_at:=clock_timestamp();idle_at:=least(now_at+(policy.config->>'staffSessionIdleSeconds')::int*interval '1 second',coalesce(member.expires_at,'infinity'));
 absolute_at:=least(now_at+(policy.config->>'staffSessionAbsoluteSeconds')::int*interval '1 second',coalesce(member.expires_at,'infinity'));
 INSERT INTO internal_workforce_login_receipts(challenge_id,organization_id,environment,user_id,membership_id,session_id,subject_hash,email_hash,token_hash,identity_policy_hash,iam_policy_hash,token_issued_at,token_expires_at,verified_at,provider_authenticated_at)
 VALUES(challenge,member.organization_id,env,account,member.id,sid,encode(sha256(convert_to(proof->>'subject','UTF8')),'hex'),encode(sha256(convert_to(email,'UTF8')),'hex'),proof->>'tokenHash',p.config_hash,policy.config_hash,(proof->>'issuedAt')::timestamptz,(proof->>'expiresAt')::timestamptz,(proof->>'verifiedAt')::timestamptz,(proof->>'providerAuthenticatedAt')::timestamptz);
 INSERT INTO internal_staff_sessions(id,organization_id,membership_id,environment,token_hash,assurance_level,authenticated_at,idle_expires_at,absolute_expires_at) VALUES(sid,member.organization_id,member.id,env,session_digest,'AAL1',now_at,idle_at,absolute_at);
 UPDATE internal_workforce_login_challenges SET status='CONSUMED',consumed_at=now_at WHERE id=challenge;
 PERFORM set_config('app.iam_login_session',sid::text,true);
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,evidence,correlation_id,request_hash,reason)
 VALUES(member.organization_id,account,member.id,'WORKFORCE_SESSION_ISSUED','SESSION',sid::text,jsonb_build_object('assuranceLevel','AAL1','environment',env,'identityPolicyHash',p.config_hash),trace,encode(sha256(convert_to(challenge::text,'UTF8')),'hex'),'Verified Google identity and current accepted membership established a bounded workforce session.');
 RETURN jsonb_build_object('sessionId',sid,'organizationId',member.organization_id,'membershipId',member.id,'accountId',account,'assuranceLevel','AAL1','authenticatedAt',now_at,'expiresAt',least(idle_at,absolute_at));
END $$;
REVOKE ALL ON FUNCTION internal_iam_issue_staff_session(UUID,TEXT,JSONB,TEXT,TEXT,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_logout_staff_session(session_digest TEXT,env TEXT,trace TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE s internal_staff_sessions%ROWTYPE; account INT; factors_count INT; actions_count INT;
BEGIN
 IF session_digest IS NULL OR env IS NULL OR trace IS NULL OR session_digest !~ '^[a-f0-9]{64}$' OR env NOT IN ('LOCAL','STAGING','PRODUCTION') OR trace !~ '^[A-Za-z0-9._:-]{1,128}$' THEN RAISE EXCEPTION 'IAM_LOGIN_INPUT_INVALID'; END IF;
 -- A logout may cancel an authorization shared with another checker. The brief
 -- exclusive barrier avoids opposite-member lock order across simultaneous logouts.
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-policy',0));
 SELECT * INTO s FROM internal_staff_sessions WHERE token_hash=session_digest AND environment=env;
 IF s.id IS NULL THEN RETURN jsonb_build_object('outcome','LOGGED_OUT'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||s.membership_id::text,0));
 SELECT * INTO s FROM internal_staff_sessions WHERE id=s.id;
 IF s.status<>'ACTIVE' THEN RETURN jsonb_build_object('outcome','LOGGED_OUT'); END IF;
 SELECT user_id INTO account FROM internal_organization_memberships WHERE id=s.membership_id;
 PERFORM set_config('app.iam_logout_session',s.id::text,true);PERFORM set_config('app.iam_login_session',s.id::text,true);
 UPDATE internal_staff_sessions SET status='REVOKED',revoked_at=clock_timestamp(),revoked_by=account,revoke_reason='Account holder explicitly ended this workforce session.' WHERE id=s.id;
 UPDATE internal_step_up_challenges SET status='EXPIRED' WHERE session_id=s.id AND status IN ('PENDING','VERIFIED');
 GET DIAGNOSTICS factors_count=ROW_COUNT;
 UPDATE internal_action_authorizations a SET status='CANCELLED',version=version+1 WHERE status IN ('PENDING','APPROVED') AND
 (EXISTS(SELECT 1 FROM internal_step_up_challenges f WHERE f.id=a.step_up_challenge_id AND f.session_id=s.id)
 OR EXISTS(SELECT 1 FROM internal_action_approvals x JOIN internal_step_up_challenges f ON f.id=x.step_up_challenge_id WHERE x.authorization_id=a.id AND f.session_id=s.id));
 GET DIAGNOSTICS actions_count=ROW_COUNT;
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,evidence,correlation_id,request_hash,reason)
 VALUES(s.organization_id,account,s.membership_id,'WORKFORCE_SESSION_LOGGED_OUT','SESSION',s.id::text,jsonb_build_object('environment',env,'factorsExpired',factors_count,'authorizationsCancelled',actions_count),trace,encode(sha256(convert_to(s.id::text||':logout','UTF8')),'hex'),'Account holder explicitly ended this workforce session.');
 RETURN jsonb_build_object('outcome','LOGGED_OUT');
END $$;
REVOKE ALL ON FUNCTION internal_iam_logout_staff_session(TEXT,TEXT,TEXT) FROM PUBLIC;

-- CR1 Workforce review projection: read evidence, never attest an access review.
-- Deployment provisions the existing schema owner as NOLOGIN. The migration
-- runner does not require CREATEROLE or silently alter the deployment topology.
CREATE FUNCTION internal_iam_project_workforce_review(org UUID,env TEXT,member_after UUID,grant_after UUID,invitation_after UUID,page_limit INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE observed TIMESTAMPTZ; result JSONB; policy_hash TEXT; policy_status TEXT;
BEGIN
 IF org IS NULL OR env NOT IN ('LOCAL','STAGING','PRODUCTION') OR page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'IAM_REVIEW_INPUT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb))
   OR pg_has_role(session_user,current_user,'MEMBER') THEN RAISE EXCEPTION 'IAM_REVIEW_OWNER_UNSAFE'; END IF;
 IF org IS DISTINCT FROM internal_iam_current_organization_id()
   OR env IS DISTINCT FROM current_setting('app.workforce_environment',true)
   OR NOT internal_iam_lock_authority()
   OR NOT internal_iam_has_permission(org,'workforce.member.read','WORKFORCE',org::text,NULL,env,NULL)
 THEN RAISE EXCEPTION 'IAM_REVIEW_PERMISSION_DENIED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM internal_permission_catalog WHERE permission_code='workforce.member.read' AND active
   AND resource_type='WORKFORCE' AND NOT step_up_required AND checker_policy='NONE') THEN RAISE EXCEPTION 'IAM_REVIEW_POLICY_UNAVAILABLE'; END IF;
 SELECT v.config_hash,v.approval_status INTO policy_hash,policy_status FROM internal_iam_current_policy p
   JOIN internal_iam_policy_versions v ON v.id=p.version_id WHERE p.singleton;
 IF policy_hash IS NULL OR (env='PRODUCTION' AND policy_status<>'APPROVED') THEN RAISE EXCEPTION 'IAM_REVIEW_POLICY_UNAVAILABLE'; END IF;
 observed:=clock_timestamp();
 -- One statement gives the directory, totals and independent keyset pages the
 -- same MVCC view. Pagination remains explicit; no RLS-filtered global claims.
 WITH members AS MATERIALIZED (
   SELECT m.id,m.user_id,m.status,m.version,m.accepted_at,m.expires_at,m.updated_at
   FROM internal_organization_memberships m WHERE m.organization_id=org
 ), member_page AS MATERIALIZED (
   SELECT * FROM members WHERE member_after IS NULL OR id>member_after ORDER BY id LIMIT page_limit+1
 ), visible_members AS MATERIALIZED (SELECT * FROM member_page ORDER BY id LIMIT page_limit),
 grants AS MATERIALIZED (
   SELECT g.id,g.membership_id,g.role_version_id,g.scope_type,g.scope_id,g.provider,g.environment,
     g.max_amount_minor,g.valid_from,g.valid_until,m.user_id,m.status AS member_status,m.expires_at AS member_expiry,
     d.role_key,d.display_name,v.version AS role_version,x.revoked_at
   FROM internal_membership_grants g JOIN members m ON m.id=g.membership_id
   JOIN internal_role_versions v ON v.id=g.role_version_id AND v.organization_id=org
   JOIN internal_role_definitions d ON d.id=v.role_id AND d.organization_id=org
   LEFT JOIN internal_membership_grant_revocations x ON x.grant_id=g.id
   WHERE g.organization_id=org AND g.environment=env
 ), grant_page AS MATERIALIZED (
   SELECT * FROM grants WHERE grant_after IS NULL OR id>grant_after ORDER BY id LIMIT page_limit+1
 ), visible_grants AS MATERIALIZED (SELECT * FROM grant_page ORDER BY id LIMIT page_limit),
 invitations AS MATERIALIZED (
   SELECT i.id,i.environment,i.created_at,i.expires_at FROM internal_organization_invitations i
   WHERE i.organization_id=org AND i.environment=env AND i.status='PENDING'
 ), invitation_page AS MATERIALIZED (
   SELECT * FROM invitations WHERE invitation_after IS NULL OR id>invitation_after ORDER BY id LIMIT page_limit+1
 ), visible_invitations AS MATERIALIZED (SELECT * FROM invitation_page ORDER BY id LIMIT page_limit)
 SELECT jsonb_build_object(
 'schemaVersion',1,'kind','CURRENT_WORKFORCE_EVIDENCE','generatedAt',observed,'freshUntil',observed+interval '30 seconds',
 'organization',jsonb_build_object('id',org,'displayName',(SELECT display_name FROM internal_organizations WHERE id=org)),
 'environment',env,'policy',jsonb_build_object('hash',policy_hash,'approvalStatus',policy_status),
 'members',jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',id,'accountId',user_id,'state',status,'version',version,'acceptedAt',accepted_at,'expiresAt',expires_at,'updatedAt',updated_at,
   'effectiveState',CASE WHEN status='ACTIVE' AND expires_at<=observed THEN 'EXPIRED' ELSE status END) ORDER BY id) FROM visible_members),'[]'::jsonb),
   'total',(SELECT count(*) FROM members),'nextCursor',CASE WHEN (SELECT count(*) FROM member_page)>page_limit THEN (SELECT id FROM visible_members ORDER BY id DESC LIMIT 1) ELSE NULL END),
 'grants',jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',id,'membershipId',membership_id,'accountId',user_id,'role',jsonb_build_object('versionId',role_version_id,'key',role_key,'name',display_name,'version',role_version),
   'scope',jsonb_build_object('type',scope_type,'id',scope_id),'provider',provider,'environment',environment,'maxAmountMinor',max_amount_minor::text,
   'validFrom',valid_from,'validUntil',valid_until,'revokedAt',revoked_at,
   'state',CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED' WHEN valid_until<=observed THEN 'EXPIRED'
     WHEN valid_from>observed THEN 'SCHEDULED' WHEN member_status<>'ACTIVE' OR member_expiry<=observed THEN 'MEMBERSHIP_INACTIVE' ELSE 'CURRENT' END) ORDER BY id) FROM visible_grants),'[]'::jsonb),
   'total',(SELECT count(*) FROM grants),'nextCursor',CASE WHEN (SELECT count(*) FROM grant_page)>page_limit THEN (SELECT id FROM visible_grants ORDER BY id DESC LIMIT 1) ELSE NULL END),
 'invitations',jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',id,'environment',environment,'createdAt',created_at,'expiresAt',expires_at,'status',CASE WHEN expires_at<=observed THEN 'EXPIRED_PENDING' ELSE 'PENDING' END) ORDER BY id) FROM visible_invitations),'[]'::jsonb),
   'total',(SELECT count(*) FROM invitations),'nextCursor',CASE WHEN (SELECT count(*) FROM invitation_page)>page_limit THEN (SELECT id FROM visible_invitations ORDER BY id DESC LIMIT 1) ELSE NULL END),
 'protectedActions',(SELECT coalesce(jsonb_agg(jsonb_build_object('permission',permission_code,
   'permissionGranted',internal_iam_has_permission(org,permission_code,'WORKFORCE',org::text,NULL,env,NULL),
   'stepUpRequired',step_up_required,'independentApprovalRequired',checker_policy='DISTINCT_ACTOR','execution','SEPARATE_PROTECTED_COMMAND') ORDER BY permission_code),'[]'::jsonb)
   FROM internal_permission_catalog WHERE active AND permission_code IN ('workforce.invite','workforce.grant','workforce.suspend','workforce.access_review')),
 'formalReviewAccepted',false) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION internal_iam_project_workforce_review(UUID,TEXT,UUID,UUID,UUID,INT) FROM PUBLIC;

-- CR1 action-bound passkey assertion foundation. No enrollment/recovery writer
-- or approved factor policy is seeded. Reviewed credentials cannot be imported
-- by any runtime role; a future enrollment adapter must prove the full chain.
CREATE TABLE internal_workforce_factor_policies (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES internal_organizations(id), environment TEXT NOT NULL CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 version INT NOT NULL CHECK(version>0), config JSONB NOT NULL, config_hash TEXT NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
 approval_status TEXT NOT NULL CHECK(approval_status IN ('PENDING_FOUNDER_OPERATIONAL_APPROVAL','APPROVED')),
 created_by INT NOT NULL REFERENCES users(id),reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,environment,version),UNIQUE(id,organization_id,environment),
 CHECK(jsonb_typeof(config)='object' AND config ?& ARRAY['rpId','origin','allowSyncedPasskeys','challengeTtlSeconds','maximumStartsPerMinute']),
 CHECK((jsonb_typeof(config->'rpId')='string' AND length(config->>'rpId') BETWEEN 1 AND 253 AND jsonb_typeof(config->'origin')='string' AND length(config->>'origin') BETWEEN 8 AND 300) IS TRUE),
 CHECK((jsonb_typeof(config->'allowSyncedPasskeys')='boolean' AND jsonb_typeof(config->'challengeTtlSeconds')='number' AND (config->>'challengeTtlSeconds')::int BETWEEN 30 AND 600) IS TRUE),
 CHECK((jsonb_typeof(config->'maximumStartsPerMinute')='number' AND (config->>'maximumStartsPerMinute')::int BETWEEN 1 AND 30) IS TRUE)
);
CREATE TABLE internal_workforce_current_factor_policy (
 organization_id UUID NOT NULL,environment TEXT NOT NULL,policy_id UUID NOT NULL,PRIMARY KEY(organization_id,environment),
 FOREIGN KEY(policy_id,organization_id,environment) REFERENCES internal_workforce_factor_policies(id,organization_id,environment)
);
CREATE TABLE internal_workforce_passkey_enrollments (
 id UUID PRIMARY KEY,organization_id UUID NOT NULL,membership_id UUID NOT NULL,environment TEXT NOT NULL CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 credential JSONB NOT NULL,credential_id TEXT NOT NULL UNIQUE CHECK(length(credential_id) BETWEEN 16 AND 1400 AND credential_id ~ '^[A-Za-z0-9_-]+$'),
 identity_receipt_id UUID NOT NULL REFERENCES internal_workforce_login_receipts(challenge_id),registration_receipt_hash TEXT NOT NULL CHECK(registration_receipt_hash ~ '^[a-f0-9]{64}$'),
 reviewed_by INT NOT NULL REFERENCES users(id),reviewed_at TIMESTAMPTZ NOT NULL,registered_at TIMESTAMPTZ NOT NULL,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 FOREIGN KEY(membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id),
 CHECK((jsonb_typeof(credential)='object' AND credential->>'recordId'=id::text AND credential->>'id'=credential_id AND credential->>'organizationId'=organization_id::text AND credential->>'membershipId'=membership_id::text AND credential->>'environment'=environment AND credential->>'status'='ACTIVE' AND credential->>'enrollmentReceiptHash'=registration_receipt_hash) IS TRUE),
 CHECK(registered_at<=reviewed_at)
);
CREATE TABLE internal_workforce_passkey_state (
 enrollment_id UUID PRIMARY KEY REFERENCES internal_workforce_passkey_enrollments(id),counter BIGINT NOT NULL CHECK(counter BETWEEN 0 AND 4294967295),version INT NOT NULL DEFAULT 1 CHECK(version>0),
 revoked_at TIMESTAMPTZ,revoked_by INT REFERENCES users(id),reason TEXT, CHECK((revoked_at IS NOT NULL)=(revoked_by IS NOT NULL AND reason IS NOT NULL AND length(reason) BETWEEN 10 AND 2000))
);
CREATE TABLE internal_workforce_passkey_ceremonies (
 id UUID PRIMARY KEY REFERENCES internal_step_up_challenges(id),organization_id UUID NOT NULL,membership_id UUID NOT NULL,session_id UUID NOT NULL,environment TEXT NOT NULL,
 enrollment_id UUID NOT NULL REFERENCES internal_workforce_passkey_enrollments(id),credential_version INT NOT NULL,old_counter BIGINT NOT NULL,
 policy_id UUID NOT NULL,iam_policy_hash TEXT NOT NULL CHECK(iam_policy_hash ~ '^[a-f0-9]{64}$'),nonce_hash TEXT NOT NULL UNIQUE CHECK(nonce_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(policy_id,organization_id,environment) REFERENCES internal_workforce_factor_policies(id,organization_id,environment),
 FOREIGN KEY(session_id,membership_id,organization_id) REFERENCES internal_staff_sessions(id,membership_id,organization_id)
);
CREATE INDEX internal_passkey_ceremony_rate ON internal_workforce_passkey_ceremonies(membership_id,created_at);
CREATE TABLE internal_workforce_passkey_receipts (
 ceremony_id UUID PRIMARY KEY REFERENCES internal_workforce_passkey_ceremonies(id),enrollment_id UUID NOT NULL REFERENCES internal_workforce_passkey_enrollments(id),
 proof_hash TEXT NOT NULL UNIQUE CHECK(proof_hash ~ '^[a-f0-9]{64}$'),assertion_hash TEXT NOT NULL UNIQUE CHECK(assertion_hash ~ '^[a-f0-9]{64}$'),
 old_counter BIGINT NOT NULL,new_counter BIGINT NOT NULL,credential_version INT NOT NULL,verified_at TIMESTAMPTZ NOT NULL,
 CHECK(old_counter BETWEEN 0 AND 4294967295 AND new_counter BETWEEN 0 AND 4294967295 AND (new_counter>old_counter OR new_counter=0 AND old_counter=0))
);
CREATE FUNCTION internal_iam_factor_policy_hash() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.config))<>5 THEN RAISE EXCEPTION 'IAM_FACTOR_POLICY_INVALID'; END IF;
 NEW.config_hash:=encode(sha256(convert_to(internal_iam_canonical_json(jsonb_build_object('organization',NEW.organization_id,'environment',NEW.environment,'version',NEW.version,'config',NEW.config,'approval',NEW.approval_status)),'UTF8')),'hex');RETURN NEW;
END $$;
CREATE TRIGGER internal_factor_policy_hash BEFORE INSERT ON internal_workforce_factor_policies FOR EACH ROW EXECUTE FUNCTION internal_iam_factor_policy_hash();
CREATE TRIGGER internal_factor_policy_fence BEFORE INSERT OR UPDATE OR DELETE ON internal_workforce_current_factor_policy FOR EACH ROW EXECUTE FUNCTION internal_iam_fence_policy();
-- Counter writes already hold a shared policy fence. Use a separate exclusive
-- fence only for revocation, avoiding shared-to-exclusive upgrades during proof.
CREATE FUNCTION internal_iam_guard_passkey_counter() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN PERFORM pg_advisory_xact_lock(hashtextextended('iam-policy',0)); END IF;
 IF OLD.revoked_at IS NOT NULL OR NEW.enrollment_id<>OLD.enrollment_id OR NEW.version<>OLD.version+1 OR NEW.counter<OLD.counter
 OR (NEW.revoked_at IS NOT NULL AND NEW.counter<>OLD.counter) THEN RAISE EXCEPTION 'IAM_PASSKEY_STATE_INVALID'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER internal_passkey_counter_transition BEFORE UPDATE ON internal_workforce_passkey_state FOR EACH ROW EXECUTE FUNCTION internal_iam_guard_passkey_counter();
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['internal_workforce_factor_policies','internal_workforce_current_factor_policy','internal_workforce_passkey_enrollments','internal_workforce_passkey_state','internal_workforce_passkey_ceremonies','internal_workforce_passkey_receipts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tab);
  EXECUTE format('CREATE POLICY iam_passkey_owner_read ON %I FOR SELECT TO %I USING(true)',tab,current_user);
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['internal_workforce_factor_policies','internal_workforce_passkey_enrollments','internal_workforce_passkey_ceremonies','internal_workforce_passkey_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER internal_iam_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation()',tab);
 END LOOP;
 EXECUTE format('CREATE POLICY iam_passkey_policy_create ON internal_workforce_factor_policies FOR INSERT TO %I WITH CHECK(true)',current_user);
 EXECUTE format('CREATE POLICY iam_passkey_policy_pointer ON internal_workforce_current_factor_policy FOR ALL TO %I USING(true) WITH CHECK(true)',current_user);
 -- Deliberately no INSERT policy for enrollment/state: no unreviewed enrollment
 -- or arbitrary key import is exposed. Only isolated test administrator fixtures
 -- supply reviewed evidence until the independent enrollment adapter is reviewed.
 EXECUTE format('CREATE POLICY iam_passkey_counter_write ON internal_workforce_passkey_state FOR UPDATE TO %I USING(enrollment_id::text=current_setting(''app.passkey_enrollment'',true)) WITH CHECK(enrollment_id::text=current_setting(''app.passkey_enrollment'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_passkey_ceremony_create ON internal_workforce_passkey_ceremonies FOR INSERT TO %I WITH CHECK(id::text=current_setting(''app.passkey_ceremony'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_passkey_receipt_create ON internal_workforce_passkey_receipts FOR INSERT TO %I WITH CHECK(ceremony_id::text=current_setting(''app.passkey_ceremony'',true))',current_user);
 EXECUTE format('CREATE POLICY iam_passkey_factor_create ON internal_step_up_challenges FOR INSERT TO %I WITH CHECK(id::text=current_setting(''app.passkey_ceremony'',true) AND status=''PENDING'' AND required_assurance=''PHISHING_RESISTANT'')',current_user);
 EXECUTE format('CREATE POLICY iam_passkey_event_create ON internal_iam_events FOR INSERT TO %I WITH CHECK(entity_type=''STEP_UP'' AND entity_id=current_setting(''app.passkey_ceremony'',true) AND event_type IN (''PASSKEY_CHALLENGE_CREATED'',''PASSKEY_ASSERTION_VERIFIED''))',current_user);
END $$;

-- This helper only projects exact session-bound context; it grants no factor.
CREATE FUNCTION internal_iam_read_passkey_ceremony(sdigest TEXT,challenge UUID,env TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE s internal_staff_sessions%ROWTYPE;c internal_workforce_passkey_ceremonies%ROWTYPE;f internal_step_up_challenges%ROWTYPE;p internal_workforce_factor_policies%ROWTYPE;
 e internal_workforce_passkey_enrollments%ROWTYPE;k internal_workforce_passkey_state%ROWTYPE;iam internal_iam_policy_versions%ROWTYPE;m internal_organization_memberships%ROWTYPE;
BEGIN
 SELECT * INTO s FROM internal_staff_sessions WHERE token_hash=sdigest AND environment=env AND status='ACTIVE' AND least(idle_expires_at,absolute_expires_at)>clock_timestamp();
 SELECT * INTO c FROM internal_workforce_passkey_ceremonies WHERE id=challenge AND session_id=s.id AND environment=env;
 SELECT * INTO f FROM internal_step_up_challenges WHERE id=challenge AND session_id=s.id AND status='PENDING' AND expires_at>clock_timestamp();
 SELECT v.* INTO p FROM internal_workforce_current_factor_policy cp JOIN internal_workforce_factor_policies v ON v.id=cp.policy_id WHERE cp.organization_id=s.organization_id AND cp.environment=env;
 SELECT * INTO e FROM internal_workforce_passkey_enrollments WHERE id=c.enrollment_id AND membership_id=s.membership_id AND environment=env;
 SELECT * INTO k FROM internal_workforce_passkey_state WHERE enrollment_id=e.id AND revoked_at IS NULL;
 SELECT v.* INTO iam FROM internal_iam_current_policy cp JOIN internal_iam_policy_versions v ON v.id=cp.version_id WHERE cp.singleton;
 SELECT * INTO m FROM internal_organization_memberships WHERE id=s.membership_id AND status='ACTIVE' AND (expires_at IS NULL OR expires_at>clock_timestamp());
 IF s.id IS NULL OR c.id IS NULL OR f.id IS NULL OR e.id IS NULL OR k.enrollment_id IS NULL OR m.id IS NULL OR p.id IS DISTINCT FROM c.policy_id OR iam.config_hash IS DISTINCT FROM c.iam_policy_hash
 OR k.version<>c.credential_version OR k.counter<>c.old_counter OR NOT EXISTS(SELECT 1 FROM internal_organizations WHERE id=s.organization_id AND status='ACTIVE')
 OR (env='PRODUCTION' AND (p.approval_status<>'APPROVED' OR iam.approval_status<>'APPROVED')) THEN RAISE EXCEPTION 'IAM_PASSKEY_CHALLENGE_INVALID'; END IF;
 RETURN jsonb_build_object('policy',jsonb_build_object('id',p.id,'hash',p.config_hash,'environment',env,'approvalStatus',p.approval_status,'rpId',p.config->>'rpId','origin',p.config->>'origin','allowSyncedPasskeys',(p.config->>'allowSyncedPasskeys')::boolean,'challengeTtlSeconds',(p.config->>'challengeTtlSeconds')::int),
 'credential',e.credential||jsonb_build_object('version',k.version,'counter',k.counter),
 'ceremony',jsonb_build_object('id',c.id,'organizationId',s.organization_id,'membershipId',s.membership_id,'sessionId',s.id,'environment',env,'actionHash',f.action_hash,'challengeHash',c.nonce_hash,'policyHash',p.config_hash,'credentialRecordId',e.id,'credentialVersion',k.version,'createdAt',f.created_at,'expiresAt',f.expires_at,'sessionExpiresAt',least(s.idle_expires_at,s.absolute_expires_at,coalesce(m.expires_at,s.absolute_expires_at))));
END $$;
REVOKE ALL ON FUNCTION internal_iam_read_passkey_ceremony(TEXT,UUID,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_begin_passkey(sdigest TEXT,enrollment UUID,intent TEXT,challenge UUID,nonce_digest TEXT,env TEXT,trace TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE s internal_staff_sessions%ROWTYPE;e internal_workforce_passkey_enrollments%ROWTYPE;k internal_workforce_passkey_state%ROWTYPE;p internal_workforce_factor_policies%ROWTYPE;iam internal_iam_policy_versions%ROWTYPE;
 m internal_organization_memberships%ROWTYPE;r internal_workforce_login_receipts%ROWTYPE;expiry TIMESTAMPTZ;
BEGIN
 IF sdigest IS NULL OR sdigest !~ '^[a-f0-9]{64}$' OR intent IS NULL OR intent !~ '^[a-f0-9]{64}$' OR nonce_digest IS NULL OR nonce_digest !~ '^[a-f0-9]{64}$' OR challenge IS NULL OR env IS NULL OR env NOT IN ('LOCAL','STAGING','PRODUCTION') OR trace IS NULL OR trace !~ '^[A-Za-z0-9._:-]{1,128}$' THEN RAISE EXCEPTION 'IAM_PASSKEY_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 SELECT * INTO s FROM internal_staff_sessions WHERE token_hash=sdigest AND environment=env;
 IF s.id IS NULL THEN RAISE EXCEPTION 'IAM_PASSKEY_CHALLENGE_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||s.membership_id::text,0));
 SELECT * INTO s FROM internal_staff_sessions WHERE id=s.id AND status='ACTIVE' AND least(idle_expires_at,absolute_expires_at)>clock_timestamp();
 SELECT * INTO m FROM internal_organization_memberships WHERE id=s.membership_id AND status='ACTIVE' AND (expires_at IS NULL OR expires_at>clock_timestamp());
 SELECT v.* INTO p FROM internal_workforce_current_factor_policy cp JOIN internal_workforce_factor_policies v ON v.id=cp.policy_id WHERE cp.organization_id=s.organization_id AND cp.environment=env;
 SELECT v.* INTO iam FROM internal_iam_current_policy cp JOIN internal_iam_policy_versions v ON v.id=cp.version_id WHERE cp.singleton;
 IF s.id IS NULL OR m.id IS NULL OR p.id IS NULL OR iam.id IS NULL OR NOT EXISTS(SELECT 1 FROM internal_organizations WHERE id=s.organization_id AND status='ACTIVE') OR (env='PRODUCTION' AND (p.approval_status<>'APPROVED' OR iam.approval_status<>'APPROVED')) THEN RAISE EXCEPTION 'IAM_PASSKEY_POLICY_UNAVAILABLE'; END IF;
 SELECT * INTO e FROM internal_workforce_passkey_enrollments WHERE id=enrollment AND membership_id=m.id AND organization_id=m.organization_id AND environment=env;
 SELECT * INTO k FROM internal_workforce_passkey_state WHERE enrollment_id=e.id AND revoked_at IS NULL;
 SELECT * INTO r FROM internal_workforce_login_receipts WHERE challenge_id=e.identity_receipt_id AND membership_id=m.id AND organization_id=m.organization_id AND environment=env;
 IF e.id IS NULL OR k.enrollment_id IS NULL OR r.challenge_id IS NULL OR e.reviewed_by=m.user_id OR e.registered_at<r.verified_at OR e.registered_at>r.verified_at+interval '5 minutes' OR e.credential->>'rpId' IS DISTINCT FROM p.config->>'rpId'
 OR e.credential->>'enrollmentReceiptHash' IS DISTINCT FROM e.registration_receipt_hash OR e.credential->>'identityReceiptHash' IS DISTINCT FROM r.token_hash
 THEN RAISE EXCEPTION 'IAM_PASSKEY_ENROLLMENT_UNAVAILABLE'; END IF;
 IF (SELECT count(*) FROM internal_workforce_passkey_ceremonies WHERE membership_id=m.id AND created_at>clock_timestamp()-interval '1 minute')>=(p.config->>'maximumStartsPerMinute')::int THEN RAISE EXCEPTION 'IAM_PASSKEY_RATE_LIMITED'; END IF;
 expiry:=least(clock_timestamp()+(p.config->>'challengeTtlSeconds')::int*interval '1 second',s.idle_expires_at,s.absolute_expires_at,coalesce(m.expires_at,s.absolute_expires_at));
 PERFORM set_config('app.passkey_ceremony',challenge::text,true);
 INSERT INTO internal_step_up_challenges(id,organization_id,membership_id,session_id,action_hash,required_assurance,expires_at) VALUES(challenge,m.organization_id,m.id,s.id,intent,'PHISHING_RESISTANT',expiry);
 INSERT INTO internal_workforce_passkey_ceremonies(id,organization_id,membership_id,session_id,environment,enrollment_id,credential_version,old_counter,policy_id,iam_policy_hash,nonce_hash) VALUES(challenge,m.organization_id,m.id,s.id,env,e.id,k.version,k.counter,p.id,iam.config_hash,nonce_digest);
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,evidence,correlation_id,request_hash,reason) VALUES(m.organization_id,m.user_id,m.id,'PASSKEY_CHALLENGE_CREATED','STEP_UP',challenge::text,jsonb_build_object('environment',env,'policyHash',p.config_hash),trace,intent,'Server created an exact-action passkey challenge for this workforce session.');
 RETURN internal_iam_read_passkey_ceremony(sdigest,challenge,env);
END $$;
REVOKE ALL ON FUNCTION internal_iam_begin_passkey(TEXT,UUID,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;

CREATE FUNCTION internal_iam_record_passkey(sdigest TEXT,challenge UUID,proof JSONB,env TEXT,trace TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE context JSONB;s internal_staff_sessions%ROWTYPE;c internal_workforce_passkey_ceremonies%ROWTYPE;proof_digest TEXT;m internal_organization_memberships%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 SELECT * INTO s FROM internal_staff_sessions WHERE token_hash=sdigest AND environment=env;
 IF s.id IS NULL THEN RAISE EXCEPTION 'IAM_PASSKEY_CHALLENGE_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||s.membership_id::text,0));
 context:=internal_iam_read_passkey_ceremony(sdigest,challenge,env);
 SELECT * INTO c FROM internal_workforce_passkey_ceremonies WHERE id=challenge;
 IF proof IS NULL OR jsonb_typeof(proof)<>'object' OR trace IS NULL OR trace !~ '^[A-Za-z0-9._:-]{1,128}$'
 OR proof->>'ceremonyId' IS DISTINCT FROM challenge::text OR proof->>'sessionId' IS DISTINCT FROM s.id::text OR proof->>'membershipId' IS DISTINCT FROM s.membership_id::text OR proof->>'organizationId' IS DISTINCT FROM s.organization_id::text OR proof->>'environment' IS DISTINCT FROM env
 OR proof->>'actionHash' IS DISTINCT FROM context->'ceremony'->>'actionHash' OR proof->>'policyHash' IS DISTINCT FROM context->'policy'->>'hash' OR proof->>'credentialRecordId' IS DISTINCT FROM c.enrollment_id::text
 OR (proof->>'credentialVersion')::int IS DISTINCT FROM c.credential_version OR (proof->>'oldCounter')::bigint IS DISTINCT FROM c.old_counter
 OR proof->>'enrollmentReceiptHash' IS DISTINCT FROM context->'credential'->>'enrollmentReceiptHash' OR proof->>'assurance' IS DISTINCT FROM 'PHISHING_RESISTANT' OR proof->>'source' IS DISTINCT FROM 'WEBAUTHN_UV'
 OR proof->>'assertionHash' IS NULL OR proof->>'assertionHash' !~ '^[a-f0-9]{64}$' OR proof->>'verifiedAt' IS NULL OR (proof->>'verifiedAt')::timestamptz<clock_timestamp()-interval '30 seconds' OR (proof->>'verifiedAt')::timestamptz>clock_timestamp()+interval '5 seconds'
 OR (proof->>'expiresAt')::timestamptz IS DISTINCT FROM (context->'ceremony'->>'expiresAt')::timestamptz
 OR proof->>'deviceType' IS DISTINCT FROM context->'credential'->>'deviceType' OR ((context->'policy'->>'allowSyncedPasskeys')::boolean=false AND proof->>'deviceType'<>'singleDevice')
 THEN RAISE EXCEPTION 'IAM_PASSKEY_PROOF_INVALID'; END IF;
 proof_digest:=encode(sha256(convert_to(internal_iam_canonical_json(proof),'UTF8')),'hex');
 PERFORM set_config('app.passkey_enrollment',c.enrollment_id::text,true);PERFORM set_config('app.passkey_ceremony',challenge::text,true);
 UPDATE internal_workforce_passkey_state SET counter=(proof->>'newCounter')::bigint,version=version+1 WHERE enrollment_id=c.enrollment_id AND version=c.credential_version AND counter=c.old_counter AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'IAM_PASSKEY_CHALLENGE_INVALID'; END IF;
 INSERT INTO internal_workforce_passkey_receipts(ceremony_id,enrollment_id,proof_hash,assertion_hash,old_counter,new_counter,credential_version,verified_at) VALUES(challenge,c.enrollment_id,proof_digest,proof->>'assertionHash',c.old_counter,(proof->>'newCounter')::bigint,c.credential_version,(proof->>'verifiedAt')::timestamptz);
 UPDATE internal_step_up_challenges SET status='VERIFIED',achieved_assurance='PHISHING_RESISTANT',provider_receipt_hash=proof_digest,verified_at=(proof->>'verifiedAt')::timestamptz WHERE id=challenge AND status='PENDING';
 IF NOT FOUND THEN RAISE EXCEPTION 'IAM_PASSKEY_CHALLENGE_INVALID'; END IF;
 SELECT * INTO m FROM internal_organization_memberships WHERE id=s.membership_id;
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,evidence,correlation_id,request_hash,reason) VALUES(s.organization_id,m.user_id,s.membership_id,'PASSKEY_ASSERTION_VERIFIED','STEP_UP',challenge::text,jsonb_build_object('environment',env,'proofHash',proof_digest,'assurance','PHISHING_RESISTANT'),trace,proof->>'actionHash','Independent passkey user verification bound to one exact workforce action.');
 RETURN jsonb_build_object('challengeId',challenge,'membershipId',s.membership_id,'sessionId',s.id,'actionHash',proof->>'actionHash','assuranceLevel','PHISHING_RESISTANT','verifiedAt',proof->>'verifiedAt','expiresAt',proof->>'expiresAt','consumedAt',NULL);
END $$;
REVOKE ALL ON FUNCTION internal_iam_record_passkey(TEXT,UUID,JSONB,TEXT,TEXT) FROM PUBLIC;

-- Tracked passkey proofs are invalid after credential or policy revocation,
-- including between approval and consumption. Legacy local factor fixtures are
-- unchanged; no runtime can create those fixture rows.
CREATE OR REPLACE FUNCTION internal_iam_valid_step_up(target_challenge UUID,target_membership UUID,target_organization UUID,target_hash TEXT)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM internal_step_up_challenges c JOIN internal_staff_sessions s ON s.id=c.session_id
 WHERE c.id=target_challenge AND c.membership_id=target_membership AND c.organization_id=target_organization AND c.action_hash=target_hash
 AND c.status='VERIFIED' AND c.expires_at>clock_timestamp() AND c.verified_at<=clock_timestamp()
 AND s.status='ACTIVE' AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
 AND s.environment=coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL')
 AND (c.required_assurance='AAL2' OR c.achieved_assurance='PHISHING_RESISTANT')
 AND (NOT EXISTS(SELECT 1 FROM internal_workforce_passkey_ceremonies pc WHERE pc.id=c.id) OR EXISTS(
 SELECT 1 FROM internal_workforce_passkey_ceremonies pc JOIN internal_workforce_passkey_receipts r ON r.ceremony_id=pc.id JOIN internal_workforce_passkey_state k ON k.enrollment_id=pc.enrollment_id
 JOIN internal_workforce_current_factor_policy cp ON cp.organization_id=pc.organization_id AND cp.environment=pc.environment AND cp.policy_id=pc.policy_id
 JOIN internal_iam_current_policy ip ON ip.singleton JOIN internal_iam_policy_versions iv ON iv.id=ip.version_id AND iv.config_hash=pc.iam_policy_hash
 WHERE pc.id=c.id AND k.revoked_at IS NULL AND r.proof_hash=c.provider_receipt_hash)))
$$;
REVOKE ALL ON FUNCTION internal_iam_factor_policy_hash(),internal_iam_guard_passkey_counter() FROM PUBLIC;
