import type pg from 'pg';

import { workforcePermissionCodes } from '../../shared/iam/contracts.js';
import {invitationBaseOwnerPolicyNames,verifyInvitationBaseOwnerPolicies} from './iamInvitationReadiness.js';
import {lifecycleBaseOwnerPolicyNames,verifyLifecycleBaseOwnerPolicies} from './iamLifecycleReadiness.js';
import {sessionIssuerBaseOwnerPolicyNames,verifySessionIssuerBaseOwnerPolicies} from './iamSessionIssuerReadiness.js';
import {factorBaseOwnerPolicyNames,verifyFactorBaseOwnerPolicies} from './iamFactorReadiness.js';

export const iamTables = [
  'internal_organizations',
  'internal_permission_catalog',
  'internal_iam_policy_versions',
  'internal_iam_current_policy',
  'internal_role_definitions',
  'internal_role_versions',
  'internal_role_permissions',
  'internal_role_current_versions',
  'internal_organization_invitations',
  'internal_organization_memberships',
  'internal_membership_grants',
  'internal_membership_grant_revocations',
  'internal_staff_sessions',
  'internal_step_up_challenges',
  'internal_action_authorizations',
  'internal_action_approvals',
  'internal_work_assignments',
  'internal_assignment_commands',
  'internal_access_reviews',
  'internal_access_review_items',
  'internal_break_glass_events',
  'internal_iam_events',
] as const;

export const iamImmutableTables = [
  'internal_permission_catalog',
  'internal_iam_policy_versions',
  'internal_role_definitions',
  'internal_role_versions',
  'internal_role_permissions',
  'internal_membership_grants',
  'internal_membership_grant_revocations',
  'internal_action_approvals',
  'internal_assignment_commands',
  'internal_iam_events',
] as const;

// Authority creation (membership/grants), identity assurance and policy writes
// are intentionally absent. Their isolated, audited service adapters are a P2
// integration prerequisite; a shared runtime connection cannot mint proof.
const insertTables = [
  'internal_action_authorizations',
  'internal_action_approvals',
  'internal_iam_events',
] as const;

const updateTables = ['internal_action_authorizations'] as const;

const helperFunctions = [
  'internal_iam_authenticate_session(text)',
  'internal_iam_lock_authority()',
  'internal_iam_command_assignment(uuid,text,integer,bigint,text,text,text,text,text)',
  'internal_iam_current_user_id()',
  'internal_iam_current_membership_id()',
  'internal_iam_current_session_id()',
  'internal_iam_current_organization_id()',
  'internal_iam_is_active_membership(uuid)',
  'internal_iam_is_active_session(uuid)',
  'internal_iam_has_permission(uuid,text,text,text,text,text,bigint)',
] as const;

const securityDefinerFunctions = [
  'internal_iam_authenticate_session',
  'internal_iam_lock_authority',
  'internal_iam_command_assignment',
  'internal_iam_fence_revocation',
  'internal_iam_validate_checker',
  'internal_iam_guard_authorization_transition',
  'internal_iam_membership_has_permission',
  'internal_iam_valid_step_up',
  'internal_iam_is_active_membership',
  'internal_iam_is_active_session',
  'internal_iam_has_permission',
] as const;

const expectedPolicies = [
  'internal_organizations:iam_organization_read:SELECT',
  'internal_organizations:iam_organization_manage:UPDATE',
  'internal_permission_catalog:iam_catalog_read:SELECT',
  'internal_iam_policy_versions:iam_policy_read:SELECT',
  'internal_iam_current_policy:iam_current_policy_read:SELECT',
  'internal_iam_current_policy:iam_current_policy_manage:UPDATE',
  'internal_role_definitions:iam_role_definition_read:SELECT',
  'internal_role_versions:iam_role_version_read:SELECT',
  'internal_role_permissions:iam_role_permission_read:SELECT',
  'internal_role_current_versions:iam_role_current_read:SELECT',
  'internal_organization_invitations:iam_invitation_manage:ALL',
  'internal_organization_memberships:iam_membership_self_read:SELECT',
  'internal_organization_memberships:iam_membership_manage_read:SELECT',
  'internal_organization_memberships:iam_membership_create:INSERT',
  'internal_organization_memberships:iam_membership_transition:UPDATE',
  'internal_membership_grants:iam_grant_self_read:SELECT',
  'internal_membership_grants:iam_grant_manage:INSERT',
  'internal_membership_grant_revocations:iam_revocation_self_read:SELECT',
  'internal_membership_grant_revocations:iam_revocation_manage:INSERT',
  'internal_staff_sessions:iam_session_self_read:SELECT',
  'internal_staff_sessions:iam_session_self_create:INSERT',
  'internal_staff_sessions:iam_session_self_revoke:UPDATE',
  'internal_step_up_challenges:iam_step_up_self:SELECT',
  'internal_action_authorizations:iam_action_participant_read:SELECT',
  'internal_action_authorizations:iam_action_create:INSERT',
  'internal_action_authorizations:iam_action_update:UPDATE',
  'internal_action_approvals:iam_approval_read:SELECT',
  'internal_action_approvals:iam_approval_create:INSERT',
  'internal_work_assignments:iam_assignment_read:SELECT',
  'internal_work_assignments:iam_assignment_create:INSERT',
  'internal_work_assignments:iam_assignment_update:UPDATE',
  'internal_assignment_commands:iam_assignment_command_read:SELECT',
  'internal_access_reviews:iam_access_review_manage:ALL',
  'internal_access_review_items:iam_access_item_manage:ALL',
  'internal_break_glass_events:iam_break_glass_manage:ALL',
  'internal_iam_events:iam_event_read:SELECT',
  'internal_iam_events:iam_event_record:INSERT',
].sort();

const immutableTriggerTables = new Set<string>(iamImmutableTables);

type BooleanRow = Record<string, boolean | string>;

/**
 * Verifies the deployed IAM authority from a restricted runtime connection.
 * This intentionally checks metadata and seed contracts only; it does not read
 * staff identities, invitations, sessions or audit-event payloads.
 */
export async function verifyIamCatalog(client: pg.PoolClient) {
  const relations = (await client.query<BooleanRow>(`
    SELECT c.relname,
      c.relrowsecurity,
      c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) AS owner_name,
      pg_has_role(current_user,c.relowner,'MEMBER') AS owns,
      has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
      has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
      has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
      has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
      has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
      has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger,
      EXISTS (
        SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
        WHERE acl.grantee=0
      ) AS public_grant
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
  `, [iamTables])).rows;

  const privilegeValid = relations.length === iamTables.length && relations.every(row => {
    const name = String(row.relname);
    return row.relrowsecurity === true
      && row.relforcerowsecurity === true
      && row.owns === false
      && row.can_select === true
      && row.can_insert === insertTables.includes(name as (typeof insertTables)[number])
      && row.can_update === updateTables.includes(name as (typeof updateTables)[number])
      && row.can_delete === false
      && row.can_truncate === false
      && row.can_trigger === false
      && row.public_grant === false;
  });

  const policies = (await client.query<{
    tablename: string;
    policyname: string;
    cmd: string;
    permissive: string;
    roles: string[];
    qual: string | null;
    with_check: string | null;
  }>(`
    SELECT tablename,policyname,cmd,permissive,roles::text[] AS roles,qual,with_check
    FROM pg_policies
    WHERE schemaname='public' AND tablename=ANY($1::text[])
  `, [iamTables])).rows;
  const ownerPolicies = policies.filter(row => row.policyname === 'iam_catalog_owner_read' || row.policyname === 'iam_factor_owner_consume' || row.policyname === 'iam_action_owner_lock' || row.policyname === 'iam_assignment_command_owner_create');
  const ownerPolicyValid = ownerPolicies.length === iamTables.length + 3 && ownerPolicies.every(row => {
    const table = relations.find(relation => relation.relname === row.tablename);
    return table && row.permissive === 'PERMISSIVE' && JSON.stringify(row.roles) === JSON.stringify([table.owner_name])
      && (row.policyname === 'iam_assignment_command_owner_create' ? row.cmd === 'INSERT' && row.qual === null && row.with_check === 'true'
        : row.qual === 'true' && (row.policyname === 'iam_catalog_owner_read' ? row.cmd === 'SELECT' : row.cmd === 'UPDATE' && row.with_check === 'true'));
  });
  const invitationOwnerPolicies = policies.filter(row => invitationBaseOwnerPolicyNames.includes(row.policyname));
  const lifecycleOwnerPolicies = policies.filter(row => lifecycleBaseOwnerPolicyNames.includes(row.policyname));
  const sessionIssuerOwnerPolicies = policies.filter(row => sessionIssuerBaseOwnerPolicyNames.includes(row.policyname));
  const factorOwnerPolicies = policies.filter(row => factorBaseOwnerPolicyNames.includes(row.policyname));
  const runtimePolicies = policies.filter(row => !ownerPolicies.includes(row) && !invitationOwnerPolicies.includes(row) && !lifecycleOwnerPolicies.includes(row) && !sessionIssuerOwnerPolicies.includes(row) && !factorOwnerPolicies.includes(row));
  const actualPolicies = runtimePolicies.map(row => `${row.tablename}:${row.policyname}:${row.cmd}`).sort();
  const forbiddenPolicyFragments = ['app.marketing_admin', 'users.role', 'app.current_user_role'];
  const policyRelations=relations.map(row=>({relname:row.relname,owner_name:row.owner_name}));
  const policyValid = ownerPolicyValid && verifyInvitationBaseOwnerPolicies(policies,policyRelations) && verifyLifecycleBaseOwnerPolicies(policies,policyRelations) && verifySessionIssuerBaseOwnerPolicies(policies,policyRelations) && verifyFactorBaseOwnerPolicies(policies,policyRelations) && JSON.stringify(actualPolicies) === JSON.stringify(expectedPolicies)
    && runtimePolicies.every(row => row.permissive === 'PERMISSIVE'
      && JSON.stringify(row.roles) === '["public"]'
      && !forbiddenPolicyFragments.some(fragment => `${row.qual ?? ''} ${row.with_check ?? ''}`.includes(fragment)));

  const catalog = (await client.query<{ permission_code: string }>(`
    SELECT permission_code FROM internal_permission_catalog ORDER BY permission_code
  `)).rows.map(row => row.permission_code);
  const permissionCatalogValid = JSON.stringify(catalog) === JSON.stringify([...workforcePermissionCodes].sort());

  const defaults = (await client.query<{
    approval_status: string;
    config: Record<string, unknown>;
    valid_hash: boolean;
  }>(`
    SELECT v.approval_status,v.config,
      v.config_hash=encode(sha256(convert_to(v.config::text,'UTF8')),'hex') AS valid_hash
    FROM internal_iam_current_policy p
    JOIN internal_iam_policy_versions v ON v.id=p.version_id
    WHERE p.singleton=true
  `)).rows;
  const policy = defaults[0];
  const config = policy?.config;
  const thresholds = config?.amountThresholds as Record<string, unknown> | undefined;
  const boundedInteger = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
  const safeDefaults = defaults.length === 1 && policy.valid_hash
    && ['PENDING_FOUNDER_OPERATIONAL_APPROVAL', 'APPROVED'].includes(policy.approval_status)
    && config?.operationalApproval === policy.approval_status
    && config?.allRefundsRequireChecker === true && config?.allSettlementsRequireChecker === true && config?.allActivationsRequireChecker === true
    && boundedInteger(config?.minimumOwnersForProduction, 2, 100)
    && boundedInteger(config?.invitationTtlSeconds, 900, 604800)
    && boundedInteger(config?.staffSessionIdleSeconds, 300, 28800)
    && boundedInteger(config?.staffSessionAbsoluteSeconds, 900, 86400)
    && boundedInteger(config?.stepUpTtlSeconds, 60, 1800)
    && boundedInteger(config?.assignmentLeaseSeconds, 60, 3600)
    && thresholds != null && ['refundMinor', 'settlementMinor'].every(key => thresholds[key] === null || (typeof thresholds[key] === 'string' && /^(0|[1-9][0-9]*)$/.test(thresholds[key] as string)));
  // Catalog readiness is distinct from the founder's operational policy release.
  const operationalPolicyApproved = safeDefaults && policy.approval_status === 'APPROVED';

  const triggers = (await client.query<{ relname: string; tgname: string; proname: string }>(`
    SELECT c.relname,t.tgname,p.proname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname=ANY($1::text[])
  `, [iamTables])).rows;
  const immutableEvidence = [...immutableTriggerTables].every(table => triggers.some(trigger =>
    trigger.relname === table && trigger.tgname === 'internal_iam_immutable' && trigger.proname === 'internal_iam_reject_mutation'));
  const lifecycleTriggers = [
    ['internal_organization_memberships', 'internal_membership_transition', 'internal_iam_guard_membership_transition'],
    ['internal_action_authorizations', 'internal_authorization_transition', 'internal_iam_guard_authorization_transition'],
    ['internal_action_approvals', 'internal_checker_validate', 'internal_iam_validate_checker'],
    ['internal_membership_grant_revocations', 'internal_revocation_fence', 'internal_iam_fence_revocation'],
    ['internal_step_up_challenges', 'internal_factor_transition', 'internal_iam_guard_factor_transition'],
    ['internal_work_assignments', 'internal_assignment_fence', 'internal_iam_fence_assignment'],
    ['internal_work_assignments', 'internal_assignment_transition', 'internal_iam_guard_assignment_transition'],
    ['internal_staff_sessions', 'internal_session_fence', 'internal_iam_fence_session'],
    ['internal_iam_current_policy', 'internal_current_policy_fence', 'internal_iam_fence_policy'],
    ['internal_organizations', 'internal_organization_fence', 'internal_iam_fence_policy'],
    ['internal_membership_grants', 'internal_grant_validate', 'internal_iam_validate_grant'],
  ].every(([table, triggerName, functionName]) => triggers.some(trigger =>
    trigger.relname === table && trigger.tgname === triggerName && trigger.proname === functionName));

  const functions = (await client.query<{
    proname: string;
    prosecdef: boolean;
    proconfig: string[] | null;
    owns: boolean;
    owner_bypasses: boolean;
    public_execute: boolean;
    can_execute: boolean;
  }>(`
    SELECT p.proname,p.prosecdef,p.proconfig,pg_has_role(current_user,p.proowner,'MEMBER') AS owns,
      (r.rolsuper OR r.rolbypassrls) AS owner_bypasses,
      has_function_privilege(current_user,p.oid,'EXECUTE') AS can_execute,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname='public' AND p.proname=ANY($1::text[])
  `, [securityDefinerFunctions])).rows;
  const functionSafety = functions.length === securityDefinerFunctions.length && functions.every(row =>
    row.prosecdef && !row.owns && !row.owner_bypasses && !row.public_execute
      && row.can_execute === helperFunctions.some(signature=>signature.startsWith(`${row.proname}(`))
      && row.proconfig?.includes('search_path=pg_catalog, public')
      && row.proconfig.includes('row_security=on'));

  const constraints = (await client.query<{ relname: string; definition: string; convalidated: boolean }>(`
    SELECT c.relname,pg_get_constraintdef(k.oid) AS definition,k.convalidated
    FROM pg_constraint k
    JOIN pg_class c ON c.oid=k.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
  `, [iamTables])).rows;
  const requiredConstraints = [
    ['internal_role_versions', 'UNIQUE (role_id, version)'],
    ['internal_organization_memberships', 'UNIQUE (organization_id, user_id)'],
    ['internal_action_authorizations', 'UNIQUE (organization_id, maker_membership_id, command_hash)'],
    ['internal_action_approvals', 'UNIQUE (authorization_id, checker_membership_id)'],
    ['internal_iam_events', 'UNIQUE (sequence)'],
  ];
  const criticalConstraints = requiredConstraints.every(([table, definition]) => constraints.some(row =>
    row.relname === table && row.definition === definition && row.convalidated));

  const sequence = (await client.query<{ usage: boolean; update: boolean; owns: boolean }>(`
    SELECT has_sequence_privilege(current_user,c.oid,'USAGE') AS usage,
      has_sequence_privilege(current_user,c.oid,'UPDATE') AS update,
      pg_has_role(current_user,c.relowner,'MEMBER') AS owns
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='internal_iam_events_sequence_seq'
  `)).rows;
  const sequenceValid = sequence.length === 1 && sequence[0].usage && !sequence[0].update && !sequence[0].owns;

  const runtimeRole = (await client.query<{ safe: boolean }>(`
    SELECT NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR has_schema_privilege(current_user,'public','CREATE') OR EXISTS(SELECT 1 FROM pg_roles inherited WHERE pg_has_role(current_user,inherited.oid,'MEMBER') AND (inherited.rolsuper OR inherited.rolbypassrls OR inherited.rolcreaterole OR inherited.rolcreatedb))) AS safe
    FROM pg_roles r WHERE r.rolname=current_user
  `)).rows[0];
  const runtimeRoleSafe = runtimeRole?.safe === true;
  const ready = runtimeRoleSafe && privilegeValid && policyValid && permissionCatalogValid && safeDefaults
    && immutableEvidence && lifecycleTriggers && functionSafety && criticalConstraints && sequenceValid;
  return {
    ready,
    privilegeValid,
    policyValid,
    permissionCatalogValid,
    safeDefaults,
    operationalPolicyApproved,
    runtimeRoleSafe,
    immutableEvidence,
    lifecycleTriggers,
    functionSafety,
    criticalConstraints,
    sequenceValid,
  };
}

/** Exact grants for a non-owner, non-BYPASSRLS application role. */
export function iamRolloutGrants(runtimeRole: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole)) throw new Error('RUNTIME_ROLE_INVALID');
  const role = `"${runtimeRole}"`;
  return [
    `GRANT SELECT ON ${iamTables.join(',')} TO ${role}`,
    `GRANT INSERT ON ${insertTables.join(',')} TO ${role}`,
    `GRANT UPDATE ON ${updateTables.join(',')} TO ${role}`,
    `GRANT USAGE ON SEQUENCE internal_iam_events_sequence_seq TO ${role}`,
    `GRANT EXECUTE ON FUNCTION ${helperFunctions.join(',')} TO ${role}`,
  ];
}
