-- CR1 P3.1/P3.2: local additive authority; no channel dispatch or historical alerts.
SELECT pg_advisory_xact_lock(82749102);
LOCK TABLE threads, messages IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE threads ADD COLUMN last_message_sequence BIGINT NOT NULL DEFAULT 0 CHECK(last_message_sequence>=0);
ALTER TABLE messages ADD COLUMN conversation_sequence BIGINT CHECK(conversation_sequence>0);
ALTER TABLE messages ADD COLUMN notification_intent_id UUID UNIQUE;

-- Legacy IDs are the stable ordering evidence; do not reinterpret guest text,
-- delivery timestamps or old is_read flags as new acknowledgement receipts.
WITH ordered AS (
 SELECT id,row_number() OVER(PARTITION BY thread_id ORDER BY id) AS sequence
 FROM messages WHERE thread_id IS NOT NULL
) UPDATE messages m SET conversation_sequence=o.sequence FROM ordered o WHERE m.id=o.id;
UPDATE threads t SET last_message_sequence=s.sequence
 FROM (SELECT thread_id,max(conversation_sequence) AS sequence FROM messages WHERE thread_id IS NOT NULL GROUP BY thread_id) s
 WHERE t.id=s.thread_id;
ALTER TABLE messages ADD CONSTRAINT conversation_message_sequence_shape CHECK((thread_id IS NULL)=(conversation_sequence IS NULL));
ALTER TABLE messages ADD CONSTRAINT conversation_message_sequence_unique UNIQUE(thread_id,conversation_sequence);
CREATE INDEX conversation_threads_guest_recent ON threads(guest_id,(coalesce(updated_at,'epoch'::timestamp)) DESC,id DESC);
CREATE INDEX conversation_threads_host_recent ON threads(host_id,(coalesce(updated_at,'epoch'::timestamp)) DESC,id DESC);

CREATE FUNCTION conversation_actor_id() RETURNS INTEGER LANGUAGE sql STABLE
 SET search_path=pg_catalog,public SET row_security=on AS $$
 SELECT NULLIF(current_setting('app.current_user_id',true),'')::integer;
$$;

CREATE FUNCTION conversation_notification_fingerprint(p_thread integer,p_message integer,p_notification uuid,p_sender integer)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(format('{"executionClass":"LOCAL_EFFECT","organizationId":null,"partitionKey":"conversation:%s","payload":{"messageId":%s,"notificationId":"%s","threadId":%s,"type":"new_message"},"principalId":"user:%s","topic":"CRM.MESSAGE.NOTIFY"}',p_thread,p_message,p_notification,p_thread,p_sender),'UTF8')),'hex');
$$;

CREATE TABLE conversation_read_cursors (
 thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE RESTRICT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 last_read_sequence BIGINT NOT NULL CHECK(last_read_sequence>0),
 acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(thread_id,user_id)
);

CREATE TABLE notification_intents (
 id UUID PRIMARY KEY,
 thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE RESTRICT,
 message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id) ON DELETE RESTRICT,
 message_sequence BIGINT NOT NULL CHECK(message_sequence>0),
 sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 topic TEXT NOT NULL CHECK(topic='CRM.MESSAGE.NOTIFY'),
 partition_key TEXT NOT NULL,
 dedupe_key TEXT NOT NULL UNIQUE,
 request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 payload JSONB NOT NULL,
 execution_class TEXT NOT NULL DEFAULT 'LOCAL_EFFECT' CHECK(execution_class='LOCAL_EFFECT'),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','RUNNING','RETRY','SUCCEEDED','DEAD','RECONCILIATION_REQUIRED')),
 priority INTEGER NOT NULL DEFAULT 50 CHECK(priority BETWEEN 0 AND 100),
 fence BIGINT NOT NULL DEFAULT 0 CHECK(fence>=0),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 max_attempts INTEGER NOT NULL DEFAULT 8 CHECK(max_attempts BETWEEN 1 AND 100),
 lease_until TIMESTAMPTZ,
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 claimed_by TEXT CHECK(length(claimed_by) BETWEEN 1 AND 160),
 correlation_id TEXT NOT NULL CHECK(correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
 causation_id TEXT CHECK(causation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
 principal_id TEXT NOT NULL,
 organization_id TEXT CHECK(organization_id IS NULL),
 trace_source TEXT NOT NULL CHECK(trace_source IN ('REQUEST','SYSTEM')),
 last_error_code TEXT CHECK(last_error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 completed_at TIMESTAMPTZ,
 CHECK(sender_id<>recipient_id),
 CHECK(partition_key='conversation:'||thread_id::text),
 CHECK(dedupe_key='conversation-message:'||message_id::text),
 CHECK(principal_id='user:'||sender_id::text),
 CHECK(request_fingerprint=conversation_notification_fingerprint(thread_id,message_id,id,sender_id)),
 CHECK(payload=jsonb_build_object('type','new_message','threadId',thread_id,'messageId',message_id,'notificationId',id::text)),
 CHECK((state='RUNNING')=(lease_until IS NOT NULL AND claimed_by IS NOT NULL)),
 CHECK(state='RUNNING' OR (lease_until IS NULL AND claimed_by IS NULL)),
 CHECK((state='SUCCEEDED')=(completed_at IS NOT NULL))
);
CREATE INDEX notification_intents_ready ON notification_intents(priority DESC,available_at,id) WHERE state IN ('PENDING','RETRY');
CREATE INDEX notification_intents_leases ON notification_intents(lease_until,id) WHERE state='RUNNING';
CREATE INDEX notification_intents_recipient ON notification_intents(recipient_id,created_at,id);

CREATE TABLE notification_intent_events (
 id BIGSERIAL PRIMARY KEY,
 outbox_id UUID NOT NULL REFERENCES notification_intents(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(event_type IN ('ENQUEUED','CLAIMED','LEASE_EXPIRED','ATTEMPTS_EXHAUSTED','OUTCOME_UNKNOWN','SUCCEEDED','RETRY_SCHEDULED','DEAD_LETTERED','MANUAL_REPLAY','RECONCILED')),
 actor_id TEXT CHECK(actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
 reason TEXT CHECK(length(reason) BETWEEN 10 AND 2000),
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=4096),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(evidence-ARRAY['requestFingerprint','fence','previousFence','attempt','classification','errorCode','delaySeconds','receiptId','outcome']::text[]='{}'::jsonb)
);
CREATE UNIQUE INDEX notification_single_enqueue ON notification_intent_events(outbox_id) WHERE event_type='ENQUEUED';
CREATE INDEX notification_event_history ON notification_intent_events(outbox_id,id);

CREATE FUNCTION conversation_sequence_message() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE target threads%ROWTYPE; actor integer:=conversation_actor_id();
BEGIN
 IF NEW.thread_id IS NULL THEN RAISE EXCEPTION 'CONVERSATION_THREAD_REQUIRED'; END IF;
 SELECT * INTO target FROM threads WHERE id=NEW.thread_id FOR UPDATE;
 IF NOT FOUND OR actor IS NULL OR NEW.sender_id IS DISTINCT FROM actor
   OR actor NOT IN (target.guest_id,target.host_id)
   OR target.guest_id IS NULL OR target.host_id IS NULL OR target.guest_id=target.host_id
   OR NEW.receiver_id IS DISTINCT FROM (CASE WHEN actor=target.guest_id THEN target.host_id ELSE target.guest_id END)
 THEN RAISE EXCEPTION 'CONVERSATION_PARTICIPANT_REQUIRED'; END IF;
 IF NEW.conversation_sequence IS NOT NULL OR NEW.notification_intent_id IS NOT NULL THEN RAISE EXCEPTION 'CONVERSATION_SERVER_IDENTITY_REQUIRED'; END IF;
 NEW.conversation_sequence:=target.last_message_sequence+1;
 NEW.notification_intent_id:=gen_random_uuid();
 NEW.is_read:=false;
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END;
$$;

CREATE FUNCTION conversation_enqueue_message() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE correlation text:=current_setting('app.correlation_id',true);
 operation text:=current_setting('app.operation_id',true); source text:='REQUEST'; fingerprint text;
BEGIN
 UPDATE threads SET last_message_sequence=NEW.conversation_sequence WHERE id=NEW.thread_id;
 IF correlation IS NULL OR correlation !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' THEN correlation:=gen_random_uuid()::text; source:='SYSTEM'; END IF;
 IF operation IS NULL OR operation !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' THEN operation:=NULL; END IF;
 fingerprint:=conversation_notification_fingerprint(NEW.thread_id,NEW.id,NEW.notification_intent_id,NEW.sender_id);
 INSERT INTO notification_intents(id,thread_id,message_id,message_sequence,sender_id,recipient_id,topic,partition_key,dedupe_key,request_fingerprint,payload,correlation_id,causation_id,principal_id,trace_source)
 VALUES(NEW.notification_intent_id,NEW.thread_id,NEW.id,NEW.conversation_sequence,NEW.sender_id,NEW.receiver_id,'CRM.MESSAGE.NOTIFY','conversation:'||NEW.thread_id::text,'conversation-message:'||NEW.id::text,fingerprint,
 jsonb_build_object('type','new_message','threadId',NEW.thread_id,'messageId',NEW.id,'notificationId',NEW.notification_intent_id::text),correlation,operation,'user:'||NEW.sender_id::text,source);
 INSERT INTO notification_intent_events(outbox_id,event_type,evidence) VALUES(NEW.notification_intent_id,'ENQUEUED',jsonb_build_object('requestFingerprint',fingerprint));
 RETURN NEW;
END;
$$;

CREATE FUNCTION conversation_guard_message() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONVERSATION_RETENTION_POLICY_REQUIRED'; END IF;
 IF to_jsonb(NEW)-'is_read' IS DISTINCT FROM to_jsonb(OLD)-'is_read' THEN RAISE EXCEPTION 'CONVERSATION_MESSAGE_IMMUTABLE'; END IF;
 IF NEW.is_read IS DISTINCT FROM OLD.is_read AND
   (NEW.receiver_id IS DISTINCT FROM conversation_actor_id() OR NEW.is_read IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'CONVERSATION_READ_AUTHORITY_REQUIRED'; END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION conversation_guard_thread() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONVERSATION_RETENTION_POLICY_REQUIRED'; END IF;
 IF to_jsonb(NEW)-ARRAY['last_message','unread_count_guest','unread_count_host','updated_at','last_message_sequence']::text[]
   IS DISTINCT FROM to_jsonb(OLD)-ARRAY['last_message','unread_count_guest','unread_count_host','updated_at','last_message_sequence']::text[]
 THEN RAISE EXCEPTION 'CONVERSATION_THREAD_IDENTITY_IMMUTABLE'; END IF;
 IF NEW.last_message_sequence IS DISTINCT FROM OLD.last_message_sequence AND
   (pg_trigger_depth()<2 OR NEW.last_message_sequence<>OLD.last_message_sequence+1)
 THEN RAISE EXCEPTION 'CONVERSATION_SEQUENCE_AUTHORITY_REQUIRED'; END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION conversation_create_thread() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE actor integer:=conversation_actor_id(); canonical_host integer;
BEGIN
 IF (NEW.listing_id IS NULL)=(NEW.experience_id IS NULL) THEN RAISE EXCEPTION 'CONVERSATION_CONTEXT_REQUIRED'; END IF;
 IF actor IS NULL OR NEW.guest_id IS DISTINCT FROM actor OR NEW.host_id IS NULL OR NEW.host_id=actor
 THEN RAISE EXCEPTION 'CONVERSATION_PARTICIPANT_REQUIRED'; END IF;
 IF NEW.listing_id IS NOT NULL THEN
  SELECT user_id INTO canonical_host FROM listings WHERE id=NEW.listing_id AND publication_status='published';
 ELSE
  SELECT host_id INTO canonical_host FROM experiences WHERE id=NEW.experience_id AND status='published';
 END IF;
 IF canonical_host IS NULL OR NEW.host_id IS DISTINCT FROM canonical_host THEN RAISE EXCEPTION 'CONVERSATION_CONTEXT_REQUIRED'; END IF;
 IF NEW.last_message IS NOT NULL OR NEW.last_message_sequence IS DISTINCT FROM 0
  OR NEW.unread_count_guest IS DISTINCT FROM 0 OR NEW.unread_count_host IS DISTINCT FROM 0
 THEN RAISE EXCEPTION 'CONVERSATION_INITIAL_STATE_REQUIRED'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END;
$$;
CREATE FUNCTION conversation_guard_cursor() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONVERSATION_RETENTION_POLICY_REQUIRED'; END IF;
 IF NEW.user_id IS DISTINCT FROM conversation_actor_id() OR NOT EXISTS(SELECT 1 FROM threads t WHERE t.id=NEW.thread_id AND NEW.user_id IN(t.guest_id,t.host_id))
   OR NOT EXISTS(SELECT 1 FROM messages m WHERE m.thread_id=NEW.thread_id AND m.conversation_sequence=NEW.last_read_sequence)
 THEN RAISE EXCEPTION 'CONVERSATION_CURSOR_AUTHORITY_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND (NEW.thread_id<>OLD.thread_id OR NEW.user_id<>OLD.user_id OR NEW.last_read_sequence<OLD.last_read_sequence)
 THEN RAISE EXCEPTION 'CONVERSATION_CURSOR_MONOTONIC_REQUIRED'; END IF;
 NEW.acknowledged_at:=clock_timestamp(); RETURN NEW;
END;
$$;
CREATE FUNCTION conversation_guard_intent() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NOTIFICATION_INTENT_IMMUTABLE'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM messages m WHERE m.id=NEW.message_id AND m.thread_id=NEW.thread_id
    AND m.notification_intent_id=NEW.id AND m.conversation_sequence=NEW.message_sequence
    AND m.sender_id=NEW.sender_id AND m.receiver_id=NEW.recipient_id AND m.sender_id=conversation_actor_id())
  THEN RAISE EXCEPTION 'NOTIFICATION_MESSAGE_AUTHORITY_REQUIRED'; END IF;
 ELSIF to_jsonb(NEW)-ARRAY['state','fence','attempts','lease_until','available_at','claimed_by','last_error_code','updated_at','completed_at']::text[]
   IS DISTINCT FROM to_jsonb(OLD)-ARRAY['state','fence','attempts','lease_until','available_at','claimed_by','last_error_code','updated_at','completed_at']::text[]
 THEN RAISE EXCEPTION 'NOTIFICATION_INTENT_IMMUTABLE'; END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION conversation_immutable_event() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN RAISE EXCEPTION 'NOTIFICATION_EVENT_IMMUTABLE'; END;
$$;

CREATE TRIGGER conversation_message_sequence BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION conversation_sequence_message();
CREATE TRIGGER conversation_message_enqueue AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION conversation_enqueue_message();
CREATE TRIGGER conversation_message_immutable BEFORE UPDATE OR DELETE ON messages FOR EACH ROW EXECUTE FUNCTION conversation_guard_message();
CREATE TRIGGER conversation_thread_immutable BEFORE UPDATE OR DELETE ON threads FOR EACH ROW EXECUTE FUNCTION conversation_guard_thread();
CREATE TRIGGER conversation_thread_create BEFORE INSERT ON threads FOR EACH ROW EXECUTE FUNCTION conversation_create_thread();
CREATE TRIGGER conversation_cursor_monotonic BEFORE INSERT OR UPDATE OR DELETE ON conversation_read_cursors FOR EACH ROW EXECUTE FUNCTION conversation_guard_cursor();
CREATE TRIGGER notification_intent_immutable BEFORE INSERT OR UPDATE OR DELETE ON notification_intents FOR EACH ROW EXECUTE FUNCTION conversation_guard_intent();
CREATE TRIGGER notification_event_immutable BEFORE UPDATE OR DELETE ON notification_intent_events FOR EACH ROW EXECUTE FUNCTION conversation_immutable_event();

CREATE FUNCTION conversation_acknowledge_read(p_thread integer,p_message integer)
 RETURNS TABLE(thread_id integer,through_message_id integer,last_read_sequence bigint,unread bigint)
 LANGUAGE plpgsql SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE actor integer:=conversation_actor_id(); observed bigint; advanced bigint; remaining bigint;
BEGIN
 PERFORM 1 FROM threads t WHERE t.id=p_thread AND actor IN(t.guest_id,t.host_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_PARTICIPANT_REQUIRED'; END IF;
 SELECT m.conversation_sequence INTO observed FROM messages m WHERE m.id=p_message AND m.thread_id=p_thread;
 IF observed IS NULL THEN RAISE EXCEPTION 'CONVERSATION_CURSOR_AUTHORITY_REQUIRED'; END IF;
 INSERT INTO conversation_read_cursors AS cursor(thread_id,user_id,last_read_sequence) VALUES(p_thread,actor,observed)
 ON CONFLICT ON CONSTRAINT conversation_read_cursors_pkey DO UPDATE SET last_read_sequence=greatest(cursor.last_read_sequence,EXCLUDED.last_read_sequence)
 RETURNING cursor.last_read_sequence INTO advanced;
 UPDATE messages m SET is_read=true WHERE m.thread_id=p_thread AND m.receiver_id=actor AND m.conversation_sequence<=advanced AND NOT coalesce(m.is_read,false);
 SELECT count(*) INTO remaining FROM messages m WHERE m.thread_id=p_thread AND m.receiver_id=actor AND NOT coalesce(m.is_read,false);
 UPDATE threads t SET unread_count_guest=CASE WHEN t.guest_id=actor THEN remaining::integer ELSE t.unread_count_guest END,
  unread_count_host=CASE WHEN t.host_id=actor THEN remaining::integer ELSE t.unread_count_host END WHERE t.id=p_thread;
 RETURN QUERY SELECT p_thread,p_message,advanced,remaining;
END;
$$;

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE conversation_read_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_read_cursors FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_intent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_intent_events FORCE ROW LEVEL SECURITY;

-- Restrictive policies remain effective if legacy startup recreates its older
-- permissive policies containing app.bypass_rls. Staff cases need separate work.
CREATE POLICY conversation_thread_access ON threads FOR ALL USING(conversation_actor_id() IN(guest_id,host_id)) WITH CHECK(conversation_actor_id() IN(guest_id,host_id));
CREATE POLICY conversation_thread_boundary ON threads AS RESTRICTIVE FOR ALL USING(conversation_actor_id() IN(guest_id,host_id)) WITH CHECK(conversation_actor_id() IN(guest_id,host_id));
CREATE POLICY conversation_message_access ON messages FOR ALL USING(
 (thread_id IS NULL AND conversation_actor_id() IN(sender_id,receiver_id)) OR EXISTS(SELECT 1 FROM threads t WHERE t.id=thread_id AND conversation_actor_id() IN(t.guest_id,t.host_id))
) WITH CHECK(thread_id IS NOT NULL AND EXISTS(SELECT 1 FROM threads t WHERE t.id=thread_id AND conversation_actor_id() IN(t.guest_id,t.host_id)));
CREATE POLICY conversation_message_boundary ON messages AS RESTRICTIVE FOR ALL USING(
 (thread_id IS NULL AND conversation_actor_id() IN(sender_id,receiver_id)) OR EXISTS(SELECT 1 FROM threads t WHERE t.id=thread_id AND conversation_actor_id() IN(t.guest_id,t.host_id))
) WITH CHECK(thread_id IS NOT NULL AND EXISTS(SELECT 1 FROM threads t WHERE t.id=thread_id AND conversation_actor_id() IN(t.guest_id,t.host_id)));
CREATE POLICY conversation_cursor_access ON conversation_read_cursors FOR ALL USING(user_id=conversation_actor_id() AND EXISTS(SELECT 1 FROM threads t WHERE t.id=thread_id)) WITH CHECK(user_id=conversation_actor_id() AND EXISTS(SELECT 1 FROM threads t WHERE t.id=thread_id));
CREATE POLICY notification_recipient_read ON notification_intents FOR SELECT TO CURRENT_USER USING(recipient_id=conversation_actor_id());
CREATE POLICY notification_sender_enqueue ON notification_intents FOR INSERT TO CURRENT_USER WITH CHECK(sender_id=conversation_actor_id());
CREATE POLICY notification_recipient_events ON notification_intent_events FOR SELECT TO CURRENT_USER USING(EXISTS(SELECT 1 FROM notification_intents i WHERE i.id=outbox_id));
CREATE POLICY notification_sender_event ON notification_intent_events FOR INSERT TO CURRENT_USER WITH CHECK(event_type='ENQUEUED' AND actor_id IS NULL AND reason IS NULL AND EXISTS(SELECT 1 FROM messages m WHERE m.notification_intent_id=outbox_id AND m.sender_id=conversation_actor_id()));

REVOKE ALL ON conversation_read_cursors,notification_intents,notification_intent_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE notification_intent_events_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION conversation_actor_id(),conversation_notification_fingerprint(integer,integer,uuid,integer),conversation_sequence_message(),conversation_enqueue_message(),conversation_guard_message(),conversation_guard_thread(),conversation_create_thread(),conversation_guard_cursor(),conversation_guard_intent(),conversation_immutable_event(),conversation_acknowledge_read(integer,integer) FROM PUBLIC;
