-- CR1 P3 scoped assistance. Role ownership/grants are an explicit rollout step.
SELECT pg_advisory_xact_lock(82749102);

CREATE TABLE service_case_runtime_bindings (
 role_name NAME PRIMARY KEY, role_kind TEXT NOT NULL CHECK(role_kind IN('CONSUMER','STAFF')),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 environment TEXT NOT NULL CHECK(environment IN('LOCAL','STAGING','PRODUCTION')),
 disclosure_version TEXT NOT NULL CHECK(disclosure_version ~ '^[a-z0-9][a-z0-9._:-]{2,99}$')
);
CREATE TABLE service_cases (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,
 environment TEXT NOT NULL CHECK(environment IN('LOCAL','STAGING','PRODUCTION')),
 thread_id INT NOT NULL REFERENCES threads(id) ON DELETE RESTRICT,
 guest_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 host_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 listing_id INT,experience_id INT,
 disclosure_version TEXT NOT NULL, requested_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN('OPEN','WITHDRAWN')),
 version INT NOT NULL DEFAULT 1 CHECK(version>0),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 withdrawn_at TIMESTAMPTZ,withdrawn_by INT REFERENCES users(id) ON DELETE RESTRICT,
 CHECK(guest_id<>host_id),CHECK(requested_by IN(guest_id,host_id)),
 CHECK((listing_id IS NULL)<>(experience_id IS NULL)),
 CHECK((state='WITHDRAWN')=(withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL)),
 UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX service_case_one_open ON service_cases(organization_id,environment,thread_id) WHERE state='OPEN';
CREATE TABLE service_case_requests (
 requester_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,request_id UUID NOT NULL,
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE RESTRICT,
 PRIMARY KEY(requester_id,request_id)
);
CREATE TABLE service_case_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN('REQUESTED','WITHDRAWN','NOTE_ADDED','CONTENT_ACCESS_AUTHORIZED')),
 actor_user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 evidence_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE service_case_internal_notes (
 id BIGSERIAL PRIMARY KEY,case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE RESTRICT,
 author_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 session_id UUID NOT NULL REFERENCES internal_staff_sessions(id) ON DELETE RESTRICT,
 assignment_id UUID NOT NULL REFERENCES internal_work_assignments(id) ON DELETE RESTRICT,
 assignment_version INT NOT NULL CHECK(assignment_version>0),assignment_fence BIGINT NOT NULL CHECK(assignment_fence>=0),
 policy_hash TEXT NOT NULL CHECK(policy_hash ~ '^[a-f0-9]{64}$'),
 request_id UUID NOT NULL,body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(author_membership_id,request_id)
);
CREATE INDEX service_case_notes_order ON service_case_internal_notes(case_id,id DESC);
CREATE TABLE service_case_content_access_receipts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE RESTRICT,
 organization_id UUID NOT NULL REFERENCES internal_organizations(id) ON DELETE RESTRICT,environment TEXT NOT NULL,
 thread_id INT NOT NULL REFERENCES threads(id) ON DELETE RESTRICT,
 actor_user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
 session_id UUID NOT NULL REFERENCES internal_staff_sessions(id) ON DELETE RESTRICT,
 assignment_id UUID NOT NULL REFERENCES internal_work_assignments(id) ON DELETE RESTRICT,
 assignment_version INT NOT NULL CHECK(assignment_version>0),assignment_fence BIGINT NOT NULL CHECK(assignment_fence>=0),
 policy_hash TEXT NOT NULL CHECK(policy_hash ~ '^[a-f0-9]{64}$'),
 before_sequence BIGINT CHECK(before_sequence>0),through_sequence BIGINT NOT NULL CHECK(through_sequence>=0),
 through_note_id BIGINT NOT NULL CHECK(through_note_id>=0),limit_count INT NOT NULL CHECK(limit_count BETWEEN 1 AND 100),
 creation_xid TEXT NOT NULL,correlation_id TEXT NOT NULL CHECK(correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),expires_at TIMESTAMPTZ NOT NULL,
 CHECK(expires_at>created_at)
);

CREATE FUNCTION service_case_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'SERVICE_CASE_IMMUTABLE'; END $$;
CREATE FUNCTION service_case_guard_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' OR to_jsonb(NEW)-ARRAY['state','version','withdrawn_at','withdrawn_by']::text[] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['state','version','withdrawn_at','withdrawn_by']::text[]
 OR OLD.state<>'OPEN' OR NEW.state<>'WITHDRAWN' OR NEW.version<>OLD.version+1 OR NEW.withdrawn_by NOT IN(OLD.guest_id,OLD.host_id)
 THEN RAISE EXCEPTION 'SERVICE_CASE_IMMUTABLE'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER service_case_transition BEFORE UPDATE OR DELETE ON service_cases FOR EACH ROW EXECUTE FUNCTION service_case_guard_transition();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['service_case_requests','service_case_events','service_case_internal_notes','service_case_content_access_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER service_case_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION service_case_immutable()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['service_case_runtime_bindings','service_cases','service_case_requests','service_case_events','service_case_internal_notes','service_case_content_access_receipts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;

CREATE FUNCTION service_case_require_staff(target_case UUID,target_assignment UUID,target_version INT,target_fence BIGINT,permission TEXT)
 RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE target service_cases%ROWTYPE;binding service_case_runtime_bindings%ROWTYPE;policy_hash text;
BEGIN
 SELECT * INTO binding FROM service_case_runtime_bindings WHERE role_name=session_user AND role_kind='STAFF';
 IF NOT FOUND OR binding.environment IS DISTINCT FROM current_setting('app.service_environment',true) OR NOT internal_iam_lock_authority() THEN RAISE EXCEPTION 'SERVICE_CASE_PERMISSION_DENIED'; END IF;
 SELECT * INTO target FROM service_cases WHERE id=target_case FOR SHARE;
 IF NOT FOUND OR target.state<>'OPEN' OR target.organization_id<>binding.organization_id OR target.environment<>binding.environment
 OR target.organization_id IS DISTINCT FROM internal_iam_current_organization_id() THEN RAISE EXCEPTION 'SERVICE_CASE_PERMISSION_DENIED'; END IF;
 SELECT v.config_hash INTO policy_hash FROM internal_iam_current_policy c JOIN internal_iam_policy_versions v ON v.id=c.version_id
 WHERE c.singleton AND (binding.environment<>'PRODUCTION' OR v.approval_status='APPROVED');
 IF policy_hash IS NULL OR permission NOT IN('service.read','service.note') OR EXISTS(
  SELECT 1 FROM internal_permission_catalog WHERE permission_code IN('service.read',permission) AND (NOT active OR resource_type<>'SERVICE_CASE' OR step_up_required OR checker_policy<>'NONE'))
 OR NOT internal_iam_has_permission(target.organization_id,'service.read','SERVICE_CASE',target.id::text,NULL,target.environment,NULL)
 OR NOT internal_iam_has_permission(target.organization_id,permission,'SERVICE_CASE',target.id::text,NULL,target.environment,NULL)
 THEN RAISE EXCEPTION 'SERVICE_CASE_PERMISSION_DENIED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM internal_work_assignments a WHERE a.id=target_assignment AND a.organization_id=target.organization_id
  AND a.resource_type='SERVICE_CASE' AND a.resource_id=target.id::text AND a.assignee_membership_id=internal_iam_current_membership_id()
  AND a.environment=target.environment AND a.required_permission_code='service.read' AND a.provider IS NULL
  AND a.state='CLAIMED' AND a.lease_until>clock_timestamp() AND a.version=target_version AND a.fence=target_fence)
 THEN RAISE EXCEPTION 'SERVICE_CASE_ASSIGNMENT_REQUIRED'; END IF;
 RETURN policy_hash;
END $$;

-- These predicates are callable by consumer policies but return false unless
-- executing as the dedicated helper owner. Knowing a GUC/receipt is no grant.
CREATE FUNCTION service_case_context_allowed(target_thread INT) RETURNS BOOLEAN LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 IF current_user<>pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='service_case_read_content(uuid)'::regprocedure)) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM service_cases c WHERE c.id=NULLIF(current_setting('app.service_case_id',true),'')::uuid AND c.thread_id=target_thread);
END $$;
CREATE FUNCTION service_case_message_allowed(target_thread INT,target_sequence BIGINT) RETURNS BOOLEAN LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 IF current_user<>pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='service_case_read_content(uuid)'::regprocedure)) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM service_case_content_access_receipts r WHERE r.id=NULLIF(current_setting('app.service_receipt_id',true),'')::uuid
 AND r.thread_id=target_thread AND r.creation_xid<>pg_current_xact_id()::text AND r.expires_at>clock_timestamp()
 AND r.membership_id=internal_iam_current_membership_id() AND r.session_id=internal_iam_current_session_id()
 AND target_sequence<=r.through_sequence AND (r.before_sequence IS NULL OR target_sequence<r.before_sequence));
END $$;

-- Only the isolated IAM dispatch helper receives EXECUTE. A real participant
-- assistance request is authoritative; a posted resource UUID is not evidence.
CREATE FUNCTION service_case_resolve_dispatch(target_case UUID,expected_version INT) RETURNS JSONB
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE binding service_case_runtime_bindings%ROWTYPE; target service_cases%ROWTYPE;
BEGIN
 SELECT * INTO binding FROM service_case_runtime_bindings WHERE role_name=session_user AND role_kind='STAFF';
 IF target_case IS NULL OR expected_version IS NULL OR expected_version<1 OR binding.role_name IS NULL
 OR binding.environment IS DISTINCT FROM current_setting('app.service_environment',true)
 OR binding.environment IS DISTINCT FROM current_setting('app.workforce_environment',true)
 OR binding.organization_id IS DISTINCT FROM internal_iam_current_organization_id()
 OR NOT internal_iam_is_active_session(binding.organization_id)
 OR NOT internal_iam_has_permission(binding.organization_id,'service.assign','SERVICE_CASE',target_case::text,NULL,binding.environment,NULL)
 THEN RAISE EXCEPTION 'SERVICE_CASE_DISPATCH_DENIED'; END IF;
 SELECT * INTO target FROM service_cases WHERE id=target_case AND organization_id=binding.organization_id AND environment=binding.environment FOR SHARE;
 IF NOT FOUND OR target.state<>'OPEN' OR target.version<>expected_version OR target.disclosure_version<>binding.disclosure_version
 THEN RAISE EXCEPTION 'SERVICE_CASE_DISPATCH_CONTEXT_CONFLICT'; END IF;
 RETURN jsonb_build_object('id',target.id,'organizationId',target.organization_id,'environment',target.environment,'version',target.version,'disclosureVersion',target.disclosure_version);
END $$;
REVOKE ALL ON FUNCTION service_case_resolve_dispatch(UUID,INT) FROM PUBLIC;

CREATE FUNCTION service_case_request(target_thread INT,request_uuid UUID,disclosure TEXT) RETURNS JSONB
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE actor integer:=conversation_actor_id();binding service_case_runtime_bindings%ROWTYPE;target record;saved service_cases%ROWTYPE;old service_case_requests%ROWTYPE;request_hash text;
BEGIN
 SELECT * INTO binding FROM service_case_runtime_bindings WHERE role_name=session_user AND role_kind='CONSUMER';
 IF NOT FOUND OR binding.environment IS DISTINCT FROM current_setting('app.service_environment',true) OR binding.organization_id::text IS DISTINCT FROM current_setting('app.organization_id',true) OR actor IS NULL OR request_uuid IS NULL OR disclosure IS DISTINCT FROM binding.disclosure_version THEN RAISE EXCEPTION 'SERVICE_CASE_PERMISSION_DENIED'; END IF;
 SELECT id,guest_id,host_id,listing_id,experience_id INTO target FROM threads WHERE id=target_thread AND actor IN(guest_id,host_id);
 IF NOT FOUND OR (target.listing_id IS NULL)=(target.experience_id IS NULL) THEN RAISE EXCEPTION 'SERVICE_CASE_PERMISSION_DENIED'; END IF;
 request_hash:=encode(sha256(convert_to(binding.organization_id::text||':'||binding.environment||':'||target_thread::text||':'||disclosure,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('service-request:'||actor::text||':'||request_uuid::text,0));
 SELECT * INTO old FROM service_case_requests WHERE requester_id=actor AND request_id=request_uuid;
 IF FOUND THEN
  IF old.request_hash<>request_hash THEN RAISE EXCEPTION 'SERVICE_CASE_IDEMPOTENCY_CONFLICT'; END IF;
  SELECT * INTO saved FROM service_cases WHERE id=old.case_id;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended('service-thread:'||binding.organization_id::text||':'||target_thread::text,0));
  SELECT * INTO saved FROM service_cases WHERE organization_id=binding.organization_id AND environment=binding.environment AND thread_id=target_thread AND state='OPEN';
  IF NOT FOUND THEN
   INSERT INTO service_cases(organization_id,environment,thread_id,guest_id,host_id,listing_id,experience_id,disclosure_version,requested_by)
   VALUES(binding.organization_id,binding.environment,target.id,target.guest_id,target.host_id,target.listing_id,target.experience_id,disclosure,actor) RETURNING * INTO saved;
   INSERT INTO service_case_events(case_id,event_type,actor_user_id) VALUES(saved.id,'REQUESTED',actor);
  END IF;
  INSERT INTO service_case_requests VALUES(actor,request_uuid,request_hash,saved.id);
 END IF;
 RETURN jsonb_build_object('id',saved.id,'threadId',saved.thread_id,'state',saved.state,'version',saved.version,'disclosureVersion',saved.disclosure_version);
END $$;
CREATE FUNCTION service_case_withdraw(target_case UUID,expected_version INT) RETURNS JSONB
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE saved service_cases%ROWTYPE;binding service_case_runtime_bindings%ROWTYPE;actor integer:=conversation_actor_id();
BEGIN
 SELECT * INTO binding FROM service_case_runtime_bindings WHERE role_name=session_user AND role_kind='CONSUMER';
 SELECT * INTO saved FROM service_cases WHERE id=target_case FOR UPDATE;
 IF binding.role_name IS NULL OR binding.environment IS DISTINCT FROM current_setting('app.service_environment',true) OR binding.organization_id::text IS DISTINCT FROM current_setting('app.organization_id',true) OR saved.id IS NULL OR actor IS NULL OR actor NOT IN(saved.guest_id,saved.host_id)
 OR saved.organization_id<>binding.organization_id OR saved.environment<>binding.environment THEN RAISE EXCEPTION 'SERVICE_CASE_PERMISSION_DENIED'; END IF;
 IF saved.state='WITHDRAWN' THEN RETURN jsonb_build_object('id',saved.id,'threadId',saved.thread_id,'state',saved.state,'version',saved.version,'disclosureVersion',saved.disclosure_version); END IF;
 IF saved.version<>expected_version THEN RAISE EXCEPTION 'SERVICE_CASE_VERSION_CONFLICT'; END IF;
 UPDATE service_cases SET state='WITHDRAWN',version=version+1,withdrawn_at=clock_timestamp(),withdrawn_by=actor WHERE id=target_case RETURNING * INTO saved;
 INSERT INTO service_case_events(case_id,event_type,actor_user_id) VALUES(saved.id,'WITHDRAWN',actor);
 RETURN jsonb_build_object('id',saved.id,'threadId',saved.thread_id,'state',saved.state,'version',saved.version,'disclosureVersion',saved.disclosure_version);
END $$;

-- Participant status contains neither staff notes nor access evidence. It is
-- safe to fetch before the participant has accepted assistance disclosure.
CREATE FUNCTION service_case_status(target_thread INT) RETURNS JSONB
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE actor integer:=conversation_actor_id();binding service_case_runtime_bindings%ROWTYPE;saved service_cases%ROWTYPE;projection jsonb;
BEGIN
 SELECT * INTO binding FROM service_case_runtime_bindings WHERE role_name=session_user AND role_kind='CONSUMER';
 IF NOT FOUND OR binding.environment IS DISTINCT FROM current_setting('app.service_environment',true) OR binding.organization_id::text IS DISTINCT FROM current_setting('app.organization_id',true)
 OR actor IS NULL OR NOT EXISTS(SELECT 1 FROM threads WHERE id=target_thread AND actor IN(guest_id,host_id)) THEN RAISE EXCEPTION 'SERVICE_CASE_PERMISSION_DENIED'; END IF;
 SELECT * INTO saved FROM service_cases WHERE organization_id=binding.organization_id AND environment=binding.environment AND thread_id=target_thread ORDER BY (state='OPEN') DESC,created_at DESC,id DESC LIMIT 1;
 IF FOUND THEN projection:=jsonb_build_object('id',saved.id,'threadId',saved.thread_id,'state',saved.state,'version',saved.version,'disclosureVersion',saved.disclosure_version); END IF;
 RETURN jsonb_build_object('case',projection,'disclosureVersion',binding.disclosure_version);
END $$;

CREATE FUNCTION service_case_prepare_content(target_case UUID,target_assignment UUID,target_version INT,target_fence BIGINT,before_sequence BIGINT,page_limit INT,correlation TEXT)
 RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE target service_cases%ROWTYPE;policy text;last_sequence bigint;last_note bigint;receipt uuid;
BEGIN
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR before_sequence<=0 OR correlation IS NULL OR correlation !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' THEN RAISE EXCEPTION 'SERVICE_CASE_INPUT_INVALID'; END IF;
 policy:=service_case_require_staff(target_case,target_assignment,target_version,target_fence,'service.read');
 SELECT * INTO target FROM service_cases WHERE id=target_case;
 PERFORM set_config('app.service_case_id',target_case::text,true);
 SELECT last_message_sequence INTO last_sequence FROM threads WHERE id=target.thread_id;
 SELECT coalesce(max(id),0) INTO last_note FROM service_case_internal_notes WHERE case_id=target_case;
 INSERT INTO service_case_content_access_receipts(case_id,organization_id,environment,thread_id,actor_user_id,membership_id,session_id,assignment_id,assignment_version,assignment_fence,policy_hash,before_sequence,through_sequence,through_note_id,limit_count,creation_xid,correlation_id,expires_at)
 VALUES(target.id,target.organization_id,target.environment,target.thread_id,internal_iam_current_user_id(),internal_iam_current_membership_id(),internal_iam_current_session_id(),target_assignment,target_version,target_fence,policy,before_sequence,last_sequence,last_note,page_limit,pg_current_xact_id()::text,correlation,clock_timestamp()+interval '2 minutes') RETURNING id INTO receipt;
 INSERT INTO service_case_events(case_id,event_type,actor_user_id,evidence_id) VALUES(target.id,'CONTENT_ACCESS_AUTHORIZED',internal_iam_current_user_id(),receipt);
 RETURN receipt;
END $$;
CREATE FUNCTION service_case_read_content(receipt_id UUID) RETURNS JSONB
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE receipt service_case_content_access_receipts%ROWTYPE;policy text;messages_json jsonb;notes_json jsonb;
BEGIN
 SELECT * INTO receipt FROM service_case_content_access_receipts WHERE id=receipt_id;
 IF NOT FOUND OR receipt.creation_xid=pg_current_xact_id()::text OR receipt.expires_at<=clock_timestamp()
 OR receipt.actor_user_id IS DISTINCT FROM internal_iam_current_user_id() OR receipt.membership_id IS DISTINCT FROM internal_iam_current_membership_id()
 OR receipt.session_id IS DISTINCT FROM internal_iam_current_session_id() THEN RAISE EXCEPTION 'SERVICE_CASE_COMMITTED_RECEIPT_REQUIRED'; END IF;
 policy:=service_case_require_staff(receipt.case_id,receipt.assignment_id,receipt.assignment_version,receipt.assignment_fence,'service.read');
 IF policy<>receipt.policy_hash THEN RAISE EXCEPTION 'SERVICE_CASE_POLICY_CHANGED'; END IF;
 PERFORM set_config('app.service_receipt_id',receipt.id::text,true);PERFORM set_config('app.service_case_id',receipt.case_id::text,true);
 SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.conversation_sequence::bigint),'[]'::jsonb) INTO messages_json FROM(
  SELECT id,thread_id,sender_id,receiver_id,content,conversation_sequence::text,created_at FROM messages
  WHERE thread_id=receipt.thread_id AND conversation_sequence<=receipt.through_sequence AND(receipt.before_sequence IS NULL OR conversation_sequence<receipt.before_sequence)
  ORDER BY messages.conversation_sequence DESC LIMIT receipt.limit_count
 )m;
 SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.id::bigint),'[]'::jsonb) INTO notes_json FROM(
  SELECT id::text,body,author_membership_id,created_at FROM service_case_internal_notes WHERE case_id=receipt.case_id AND id<=receipt.through_note_id ORDER BY service_case_internal_notes.id DESC LIMIT receipt.limit_count
 )n;
 PERFORM service_case_require_staff(receipt.case_id,receipt.assignment_id,receipt.assignment_version,receipt.assignment_fence,'service.read');
 RETURN jsonb_build_object('caseId',receipt.case_id,'threadId',receipt.thread_id,'receiptId',receipt.id,'messages',messages_json,'internalNotes',notes_json);
END $$;
CREATE FUNCTION service_case_add_note(target_case UUID,target_assignment UUID,target_version INT,target_fence BIGINT,request_uuid UUID,note_body TEXT)
 RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE saved service_case_internal_notes%ROWTYPE;requested_hash text;policy text;
BEGIN
 IF request_uuid IS NULL OR note_body IS NULL OR length(btrim(note_body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'SERVICE_CASE_INPUT_INVALID'; END IF;
 policy:=service_case_require_staff(target_case,target_assignment,target_version,target_fence,'service.note');
 requested_hash:=encode(sha256(convert_to(target_case::text||':'||note_body,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('service-note:'||internal_iam_current_membership_id()::text||':'||request_uuid::text,0));
 SELECT * INTO saved FROM service_case_internal_notes WHERE author_membership_id=internal_iam_current_membership_id() AND request_id=request_uuid;
 IF FOUND THEN IF saved.command_hash<>requested_hash THEN RAISE EXCEPTION 'SERVICE_CASE_IDEMPOTENCY_CONFLICT'; END IF;
 ELSE
  INSERT INTO service_case_internal_notes(case_id,author_membership_id,session_id,assignment_id,assignment_version,assignment_fence,policy_hash,request_id,body,command_hash) VALUES(target_case,internal_iam_current_membership_id(),internal_iam_current_session_id(),target_assignment,target_version,target_fence,policy,request_uuid,note_body,requested_hash) RETURNING * INTO saved;
  INSERT INTO service_case_events(case_id,event_type,actor_user_id) VALUES(target_case,'NOTE_ADDED',internal_iam_current_user_id());
 END IF;
 RETURN jsonb_build_object('id',saved.id::text,'caseId',saved.case_id);
END $$;

-- Preserve participant access. A separate definer-only permissive policy is
-- installed by explicit grants; restrictive policy still checks exact evidence.
ALTER POLICY conversation_thread_boundary ON threads USING(conversation_actor_id() IN(guest_id,host_id) OR service_case_context_allowed(id));
ALTER POLICY conversation_message_boundary ON messages USING(
 (thread_id IS NULL AND conversation_actor_id() IN(sender_id,receiver_id)) OR EXISTS(SELECT 1 FROM threads t WHERE t.id=thread_id AND conversation_actor_id() IN(t.guest_id,t.host_id)) OR service_case_message_allowed(thread_id,conversation_sequence)
);
REVOKE ALL ON SEQUENCE service_case_internal_notes_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION service_case_immutable(),service_case_guard_transition(),service_case_require_staff(uuid,uuid,integer,bigint,text),service_case_context_allowed(integer),service_case_message_allowed(integer,bigint),service_case_request(integer,uuid,text),service_case_withdraw(uuid,integer),service_case_status(integer),service_case_prepare_content(uuid,uuid,integer,bigint,bigint,integer,text),service_case_read_content(uuid),service_case_add_note(uuid,uuid,integer,bigint,uuid,text) FROM PUBLIC;
