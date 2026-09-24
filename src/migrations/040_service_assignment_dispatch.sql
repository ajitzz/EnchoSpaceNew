-- CR1: protected dispatch of participant-requested service cases only.
SELECT pg_advisory_xact_lock(82749102);

CREATE TABLE internal_service_assignment_dispatches (
 authorization_id UUID PRIMARY KEY REFERENCES internal_action_authorizations(id) ON DELETE RESTRICT,
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 actor_membership_id UUID NOT NULL,
 case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE RESTRICT,
 case_version INT NOT NULL CHECK(case_version>0),
 disclosure_version TEXT NOT NULL CHECK(length(disclosure_version) BETWEEN 3 AND 100),
 environment TEXT NOT NULL CHECK(environment IN ('LOCAL','STAGING','PRODUCTION')),
 operation TEXT NOT NULL CHECK(operation IN ('CREATE','REASSIGN','RELEASE')),
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 policy_snapshot_hash TEXT NOT NULL CHECK(policy_snapshot_hash ~ '^[a-f0-9]{64}$'),
 old_assignment_id UUID REFERENCES internal_work_assignments(id) ON DELETE RESTRICT,
 assignment_id UUID NOT NULL REFERENCES internal_work_assignments(id) ON DELETE RESTRICT,
 assignee_membership_id UUID NOT NULL,
 result_version INT NOT NULL CHECK(result_version>0),
 result_fence BIGINT NOT NULL CHECK(result_fence>=0),
 result_state TEXT NOT NULL CHECK(result_state IN ('ASSIGNED','RELEASED')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(actor_membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(assignee_membership_id,organization_id) REFERENCES internal_organization_memberships(id,organization_id) ON DELETE RESTRICT,
 CHECK((operation='CREATE')=(old_assignment_id IS NULL)),
 CHECK((operation='RELEASE')=(result_state='RELEASED')),
 CHECK((operation='RELEASE' AND assignment_id=old_assignment_id) OR (operation<>'RELEASE' AND result_version=1 AND result_fence=0 AND assignment_id IS DISTINCT FROM old_assignment_id))
);
CREATE INDEX internal_service_dispatch_case_history ON internal_service_assignment_dispatches(organization_id,case_id,created_at DESC);
ALTER TABLE internal_service_assignment_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_service_assignment_dispatches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON internal_service_assignment_dispatches FROM PUBLIC;
CREATE TRIGGER internal_service_dispatch_immutable BEFORE UPDATE OR DELETE ON internal_service_assignment_dispatches FOR EACH ROW EXECUTE FUNCTION internal_iam_reject_mutation();
DO $$ BEGIN
 EXECUTE format('CREATE POLICY iam_dispatch_owner_read ON internal_service_assignment_dispatches FOR SELECT TO %I USING(true)',current_user);
 EXECUTE format('CREATE POLICY iam_dispatch_owner_create ON internal_service_assignment_dispatches FOR INSERT TO %I WITH CHECK(actor_membership_id=internal_iam_current_membership_id() AND organization_id=internal_iam_current_organization_id())',current_user);
END $$;

CREATE FUNCTION internal_iam_dispatch_service_case(command JSONB,p_authorization UUID,reason TEXT,trace TEXT,causation TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
#variable_conflict use_variable
DECLARE org UUID:=internal_iam_current_organization_id(); actor UUID:=internal_iam_current_membership_id();
 target_case UUID; target_assignee UUID; old_id UUID; op TEXT; env TEXT; member_id UUID; requested_hash TEXT; context JSONB;
 old_work internal_work_assignments%ROWTYPE; work internal_work_assignments%ROWTYPE;
 auth internal_action_authorizations%ROWTYPE; policy internal_iam_policy_versions%ROWTYPE;
 prior internal_service_assignment_dispatches%ROWTYPE; saved internal_service_assignment_dispatches%ROWTYPE;
 before_hash TEXT;
BEGIN
 IF command IS NULL OR jsonb_typeof(command)<>'object' OR p_authorization IS NULL OR reason IS NULL OR trace IS NULL
 OR octet_length(command::text)>4096 OR EXISTS(SELECT 1 FROM jsonb_each(command) WHERE value='null'::jsonb)
 OR NOT command ?& ARRAY['operation','caseId','caseVersion','environment']
 OR command->>'operation' NOT IN ('CREATE','REASSIGN','RELEASE') OR command->>'environment' NOT IN ('LOCAL','STAGING','PRODUCTION')
 OR jsonb_typeof(command->'caseVersion')<>'number' OR command->>'caseVersion' !~ '^[1-9][0-9]{0,9}$' OR (command->>'caseVersion')::bigint>=2147483647
 OR length(reason) NOT BETWEEN 10 AND 2000 OR reason<>btrim(reason) OR trace !~ '^[A-Za-z0-9._:-]{1,128}$'
 OR (causation IS NOT NULL AND causation !~ '^[A-Za-z0-9._:-]{1,128}$') THEN RAISE EXCEPTION 'IAM_DISPATCH_INPUT_INVALID'; END IF;
 op:=command->>'operation';env:=command->>'environment';target_case:=(command->>'caseId')::uuid;
 IF (op='CREATE' AND ((SELECT count(*) FROM jsonb_object_keys(command))<>5 OR NOT command ? 'assigneeMembershipId'))
 OR (op='REASSIGN' AND ((SELECT count(*) FROM jsonb_object_keys(command))<>8 OR NOT command ?& ARRAY['assigneeMembershipId','assignmentId','expectedVersion','expectedFence']))
 OR (op='RELEASE' AND ((SELECT count(*) FROM jsonb_object_keys(command))<>7 OR NOT command ?& ARRAY['assignmentId','expectedVersion','expectedFence']))
 THEN RAISE EXCEPTION 'IAM_DISPATCH_INPUT_INVALID'; END IF;
 IF op<>'RELEASE' THEN target_assignee:=(command->>'assigneeMembershipId')::uuid; END IF;
 IF op<>'CREATE' THEN
  old_id:=(command->>'assignmentId')::uuid;
  IF (jsonb_typeof(command->'expectedVersion')='number' AND command->>'expectedVersion' ~ '^[1-9][0-9]{0,9}$' AND (command->>'expectedVersion')::bigint<2147483647
   AND jsonb_typeof(command->'expectedFence')='string' AND command->>'expectedFence' ~ '^(0|[1-9][0-9]{0,18})$' AND (command->>'expectedFence')::numeric<9223372036854775807) IS NOT TRUE THEN RAISE EXCEPTION 'IAM_DISPATCH_INPUT_INVALID'; END IF;
 END IF;
 IF org IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'IAM_DISPATCH_PERMISSION_DENIED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN RAISE EXCEPTION 'IAM_DISPATCH_NOT_READY'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('iam-policy',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('iam-dispatch-case:'||org::text||':'||env||':'||target_case::text,0));
 -- Read immutable identities before row locks. Existing claim/release commands
 -- take member fences first; reversing that order would deadlock against them.
 IF old_id IS NOT NULL THEN SELECT * INTO old_work FROM internal_work_assignments WHERE id=old_id AND organization_id=org AND resource_type='SERVICE_CASE' AND resource_id=target_case::text AND environment=env; END IF;
 FOR member_id IN SELECT actor UNION SELECT target_assignee WHERE target_assignee IS NOT NULL UNION SELECT old_work.assignee_membership_id WHERE old_work.assignee_membership_id IS NOT NULL ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('iam-member:'||member_id::text,0));
 END LOOP;
 IF NOT internal_iam_is_active_session(org)
 OR NOT internal_iam_has_permission(org,'work.assignment.reassign','WORKFORCE',org::text,NULL,env,NULL)
 OR NOT internal_iam_has_permission(org,'service.assign','SERVICE_CASE',target_case::text,NULL,env,NULL) THEN RAISE EXCEPTION 'IAM_DISPATCH_PERMISSION_DENIED'; END IF;
 SELECT v.* INTO policy FROM internal_iam_current_policy cp JOIN internal_iam_policy_versions v ON v.id=cp.version_id WHERE cp.singleton;
 IF policy.id IS NULL OR (env='PRODUCTION' AND policy.approval_status<>'APPROVED')
 OR (SELECT count(*) FROM internal_permission_catalog WHERE active AND step_up_required AND checker_policy='NONE' AND ((permission_code='work.assignment.reassign' AND resource_type='WORKFORCE') OR (permission_code='service.assign' AND resource_type='SERVICE_CASE')))<>2
 THEN RAISE EXCEPTION 'IAM_DISPATCH_NOT_READY'; END IF;
 SELECT * INTO auth FROM internal_action_authorizations WHERE id=p_authorization AND organization_id=org AND maker_membership_id=actor FOR UPDATE;
 IF NOT FOUND OR auth.permission_code<>'work.assignment.reassign' OR auth.resource_type<>'WORKFORCE' OR auth.resource_id<>org::text OR auth.environment<>env OR auth.provider IS NOT NULL OR auth.amount_minor IS NOT NULL OR auth.required_approvals<>0 THEN RAISE EXCEPTION 'IAM_DISPATCH_AUTHORIZATION_INVALID'; END IF;
 requested_hash:=internal_iam_invitation_command_hash(org,'work.assignment.dispatch.v1','work.assignment.reassign',env,reason,command);
 IF auth.command_hash<>requested_hash THEN RAISE EXCEPTION 'IAM_DISPATCH_COMMAND_CONFLICT'; END IF;
 SELECT * INTO prior FROM internal_service_assignment_dispatches WHERE authorization_id=p_authorization;
 IF FOUND THEN RETURN jsonb_build_object('receipt',to_jsonb(prior)||jsonb_build_object('result_fence',prior.result_fence::text),'replayed',true); END IF;
 IF auth.status<>'APPROVED' OR auth.policy_snapshot_hash<>policy.config_hash THEN RAISE EXCEPTION 'IAM_DISPATCH_AUTHORIZATION_INVALID'; END IF;
 -- Nested bounded definer retains session_user STAFF binding and holds the
 -- canonical case FOR SHARE. No private conversation data leaves that helper.
 context:=service_case_resolve_dispatch(target_case,(command->>'caseVersion')::int);
 IF op<>'RELEASE' AND (NOT internal_iam_membership_has_permission(target_assignee,org,'service.read','SERVICE_CASE',target_case::text,NULL,env,NULL)
  OR NOT internal_iam_membership_has_permission(target_assignee,org,'work.assignment.claim','WORKFORCE',org::text,NULL,env,NULL)) THEN RAISE EXCEPTION 'IAM_DISPATCH_ASSIGNEE_INELIGIBLE'; END IF;
 IF op='CREATE' THEN
  IF EXISTS(SELECT 1 FROM internal_work_assignments WHERE organization_id=org AND queue_key='service_case' AND resource_type='SERVICE_CASE' AND resource_id=target_case::text AND environment=env AND state IN ('ASSIGNED','CLAIMED')) THEN RAISE EXCEPTION 'IAM_DISPATCH_STATE_CONFLICT'; END IF;
 ELSE
  SELECT * INTO old_work FROM internal_work_assignments WHERE id=old_id AND organization_id=org AND queue_key='service_case' AND resource_type='SERVICE_CASE' AND resource_id=target_case::text AND environment=env AND required_permission_code='service.read' AND provider IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IAM_DISPATCH_ASSIGNMENT_NOT_FOUND'; END IF;
  IF old_work.version<>(command->>'expectedVersion')::int OR old_work.fence<>(command->>'expectedFence')::bigint THEN RAISE EXCEPTION 'IAM_DISPATCH_CAS_CONFLICT'; END IF;
  IF old_work.state NOT IN ('ASSIGNED','CLAIMED') OR (op='REASSIGN' AND old_work.assignee_membership_id=target_assignee) THEN RAISE EXCEPTION 'IAM_DISPATCH_STATE_CONFLICT'; END IF;
  before_hash:=encode(sha256(convert_to(to_jsonb(old_work)::text,'UTF8')),'hex');
 END IF;
 -- Existing IAM trigger rechecks fresh action-specific proof and consumes it.
 UPDATE internal_action_authorizations SET status='CONSUMED',consumed_at=clock_timestamp(),version=version+1 WHERE id=auth.id;
 IF old_id IS NOT NULL THEN
  UPDATE internal_work_assignments SET state=CASE WHEN op='RELEASE' THEN 'RELEASED' ELSE 'CANCELLED' END,version=version+1,fence=fence+1,lease_until=NULL,reason=internal_iam_dispatch_service_case.reason WHERE id=old_id RETURNING * INTO work;
 END IF;
 IF op<>'RELEASE' THEN
  INSERT INTO internal_work_assignments(organization_id,queue_key,resource_type,resource_id,assignee_membership_id,environment,required_permission_code,assigned_by,reason)
  VALUES(org,'service_case','SERVICE_CASE',target_case::text,target_assignee,env,'service.read',internal_iam_current_user_id(),reason) RETURNING * INTO work;
 END IF;
 INSERT INTO internal_service_assignment_dispatches(authorization_id,organization_id,actor_membership_id,case_id,case_version,disclosure_version,environment,operation,command_hash,policy_snapshot_hash,old_assignment_id,assignment_id,assignee_membership_id,result_version,result_fence,result_state,reason)
 VALUES(auth.id,org,actor,target_case,(context->>'version')::int,context->>'disclosureVersion',env,op,requested_hash,policy.config_hash,old_id,work.id,work.assignee_membership_id,work.version,work.fence,work.state,reason) RETURNING * INTO saved;
 INSERT INTO internal_iam_events(organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,previous_hash,new_hash,evidence,correlation_id,causation_id,request_hash,reason)
 VALUES(org,internal_iam_current_user_id(),actor,'SERVICE_ASSIGNMENT_DISPATCHED','WORK_ASSIGNMENT',work.id::text,before_hash,encode(sha256(convert_to(to_jsonb(work)::text,'UTF8')),'hex'),jsonb_build_object('authorizationId',auth.id,'operation',op,'caseId',target_case,'caseVersion',saved.case_version,'oldAssignmentId',old_id,'assignmentVersion',work.version,'assignmentFence',work.fence::text,'environment',env),trace,causation,requested_hash,reason);
 RETURN jsonb_build_object('receipt',to_jsonb(saved)||jsonb_build_object('result_fence',saved.result_fence::text),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION internal_iam_dispatch_service_case(JSONB,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
