-- CR1 P3: presentation preferences only. No external channel or consent activation.
SELECT pg_advisory_xact_lock(82749102);

CREATE TABLE conversation_notification_preferences (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 in_app_alerts BOOLEAN NOT NULL,
 version BIGINT NOT NULL CHECK(version>0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE conversation_notification_preference_events (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 previous_version BIGINT NOT NULL CHECK(previous_version>=0),
 previous_in_app_alerts BOOLEAN,
 version BIGINT NOT NULL CHECK(version=previous_version+1),
 in_app_alerts BOOLEAN NOT NULL,
 correlation_id TEXT NOT NULL CHECK(correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,request_id),
 UNIQUE(user_id,version),
 CHECK((previous_version=0)=(previous_in_app_alerts IS NULL))
);

CREATE FUNCTION conversation_guard_notification_preference() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
DECLARE expected bigint:=NULLIF(current_setting('app.notification_expected_version',true),'')::bigint;
 request uuid:=NULLIF(current_setting('app.notification_request_id',true),'')::uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NOTIFICATION_PREFERENCE_IMMUTABLE'; END IF;
 IF NEW.user_id IS DISTINCT FROM conversation_actor_id() OR request IS NULL OR expected IS NULL OR expected<0
 THEN RAISE EXCEPTION 'NOTIFICATION_PREFERENCE_AUTHORITY_REQUIRED'; END IF;
 IF TG_OP='INSERT' THEN
  IF expected<>0 OR NEW.version<>1 THEN RAISE EXCEPTION 'NOTIFICATION_PREFERENCE_VERSION_CONFLICT'; END IF;
 ELSE
  IF NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'NOTIFICATION_PREFERENCE_IMMUTABLE'; END IF;
  IF expected<>OLD.version OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'NOTIFICATION_PREFERENCE_VERSION_CONFLICT'; END IF;
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END;
$$;
CREATE FUNCTION conversation_record_notification_preference() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 INSERT INTO conversation_notification_preference_events(user_id,request_id,previous_version,previous_in_app_alerts,version,in_app_alerts,correlation_id)
 VALUES(NEW.user_id,NULLIF(current_setting('app.notification_request_id',true),'')::uuid,
  CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.version END,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.in_app_alerts END,
  NEW.version,NEW.in_app_alerts,current_setting('app.correlation_id',true));
 RETURN NEW;
END;
$$;
CREATE FUNCTION conversation_guard_notification_preference_event() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public SET row_security=on AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'NOTIFICATION_PREFERENCE_AUDIT_IMMUTABLE'; END IF;
 -- Runtime cannot create triggers. Only the AFTER preference trigger may append.
 IF pg_trigger_depth()<>2 OR NEW.user_id IS DISTINCT FROM conversation_actor_id()
  OR NEW.request_id IS DISTINCT FROM NULLIF(current_setting('app.notification_request_id',true),'')::uuid
  OR NEW.previous_version IS DISTINCT FROM NULLIF(current_setting('app.notification_expected_version',true),'')::bigint
  OR NOT EXISTS(SELECT 1 FROM conversation_notification_preferences p WHERE p.user_id=NEW.user_id AND p.version=NEW.version AND p.in_app_alerts=NEW.in_app_alerts)
 THEN RAISE EXCEPTION 'NOTIFICATION_PREFERENCE_AUDIT_AUTHORITY_REQUIRED'; END IF;
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_notification_preference_guard BEFORE INSERT OR UPDATE OR DELETE ON conversation_notification_preferences FOR EACH ROW EXECUTE FUNCTION conversation_guard_notification_preference();
CREATE TRIGGER conversation_notification_preference_record AFTER INSERT OR UPDATE ON conversation_notification_preferences FOR EACH ROW EXECUTE FUNCTION conversation_record_notification_preference();
CREATE TRIGGER conversation_notification_preference_event_guard BEFORE INSERT OR UPDATE OR DELETE ON conversation_notification_preference_events FOR EACH ROW EXECUTE FUNCTION conversation_guard_notification_preference_event();

ALTER TABLE conversation_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE conversation_notification_preference_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_notification_preference_events FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_preference_actor ON conversation_notification_preferences FOR ALL TO CURRENT_USER USING(user_id=conversation_actor_id()) WITH CHECK(user_id=conversation_actor_id());
CREATE POLICY notification_preference_boundary ON conversation_notification_preferences AS RESTRICTIVE FOR ALL USING(user_id=conversation_actor_id()) WITH CHECK(user_id=conversation_actor_id());
CREATE POLICY notification_preference_event_actor ON conversation_notification_preference_events FOR ALL TO CURRENT_USER USING(user_id=conversation_actor_id()) WITH CHECK(user_id=conversation_actor_id());
CREATE POLICY notification_preference_event_boundary ON conversation_notification_preference_events AS RESTRICTIVE FOR ALL USING(user_id=conversation_actor_id()) WITH CHECK(user_id=conversation_actor_id());
REVOKE ALL ON conversation_notification_preferences,conversation_notification_preference_events FROM PUBLIC;
REVOKE ALL ON FUNCTION conversation_guard_notification_preference(),conversation_record_notification_preference(),conversation_guard_notification_preference_event() FROM PUBLIC;
