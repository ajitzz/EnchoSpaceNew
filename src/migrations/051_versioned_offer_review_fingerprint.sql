-- W1/W2 compatibility: retain every immutable V1 submission and its original
-- inventorySqlHash. Only new SUBMITTED events receive the V2 commercial-review
-- fingerprint. Occupancy and calendar blocks remain live sellability authority.
CREATE FUNCTION sellable_offer_review_fingerprint_v2(target_listing INT,target_room INT,
  target_start DATE,target_end DATE) RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'version',2,'listingId',target_listing,'roomTypeId',target_room,
    'stayStart',to_char(target_start,'YYYY-MM-DD'),'stayEnd',to_char(target_end,'YYYY-MM-DD'),
    'configuredDays',coalesce((SELECT jsonb_agg(jsonb_build_array(
      i.listing_id,i.room_type_id,to_char(i.calendar_date,'YYYY-MM-DD'),i.total_units)
      ORDER BY i.calendar_date)
      FROM public.inventory_days i WHERE i.listing_id=target_listing AND i.room_type_id=target_room
        AND i.calendar_date>=target_start AND i.calendar_date<target_end),'[]'::jsonb)
  )::text,'UTF8')),'hex')
$$;
REVOKE ALL ON FUNCTION sellable_offer_review_fingerprint_v2(INT,INT,DATE,DATE) FROM PUBLIC;

-- The database owns the evidence version and digest. A Host or raw SQL caller
-- cannot opt back into V1 for a new submission or supply a forged V2 digest.
CREATE OR REPLACE FUNCTION sellable_offer_stamp_submitted_inventory() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE scope RECORD;
BEGIN
  IF NEW.event_type='SUBMITTED' THEN
    SELECT o.listing_id,o.room_type_id,r.stay_start,r.stay_end INTO scope
      FROM public.sellable_offers o JOIN public.sellable_offer_revisions r
        ON r.offer_id=o.id AND r.revision=NEW.revision WHERE o.id=NEW.offer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SELLABLE_OFFER_SUBMISSION_SCOPE_MISSING'; END IF;
    NEW.evidence:=(coalesce(NEW.evidence,'{}'::jsonb)
      - 'inventoryHash' - 'inventorySqlHash' - 'commercialSqlHash' - 'reviewFingerprintVersion')
      || jsonb_build_object('reviewFingerprintVersion',2,'commercialSqlHash',
        public.sellable_offer_review_fingerprint_v2(scope.listing_id,scope.room_type_id,
          scope.stay_start,scope.stay_end));
  END IF;
  RETURN NEW;
END $$;

-- Replace only the acceptance guard's fingerprint branch. Historical V1
-- events retain V1 occupancy/block semantics; a changed V1 submission must
-- be explicitly superseded and resubmitted, never silently rehashed as V2.
CREATE OR REPLACE FUNCTION sellable_offer_guard_identity() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE incoming_scope RECORD;
DECLARE submitted_review_version INT;
DECLARE submitted_review_hash TEXT;
DECLARE current_state TEXT;
BEGIN
  IF NEW.id<>OLD.id OR NEW.listing_id<>OLD.listing_id OR NEW.room_type_id<>OLD.room_type_id
     OR NEW.host_account_id<>OLD.host_account_id OR NEW.created_at<>OLD.created_at
     OR NEW.version<>OLD.version+1 OR NEW.latest_revision<OLD.latest_revision
     OR NEW.latest_revision>OLD.latest_revision+1 THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_IDENTITY_OR_VERSION_INVALID';
  END IF;
  IF NEW.public_disposition IS DISTINCT FROM OLD.public_disposition
    AND NEW.current_accepted_revision IS NOT DISTINCT FROM OLD.current_accepted_revision THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_DISPOSITION_EVENT_REQUIRED';
  END IF;
  IF NEW.latest_revision=OLD.latest_revision+1 AND NOT EXISTS (
      SELECT 1 FROM public.sellable_offer_revisions r WHERE r.offer_id=NEW.id AND r.revision=NEW.latest_revision) THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_REVISION_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sellable_offer_events e WHERE e.offer_id=NEW.id
      AND e.offer_version=NEW.version AND (
        (NEW.latest_revision=OLD.latest_revision+1 AND e.revision=NEW.latest_revision AND e.event_type='DRAFT_CREATED')
        OR (NEW.latest_revision=OLD.latest_revision AND NEW.current_accepted_revision IS DISTINCT FROM OLD.current_accepted_revision
          AND e.event_type IN ('ACCEPTED','RETIRED'))
        OR (NEW.latest_revision=OLD.latest_revision AND NEW.current_accepted_revision IS NOT DISTINCT FROM OLD.current_accepted_revision
          AND e.event_type='SUBMITTED' AND e.revision=NEW.latest_revision))) THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_VERSION_EVENT_REQUIRED';
  END IF;
  IF NEW.current_accepted_revision IS DISTINCT FROM OLD.current_accepted_revision THEN
    IF NEW.current_accepted_revision IS NULL THEN
      IF OLD.current_accepted_revision IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.sellable_offer_events e WHERE e.offer_id=NEW.id AND e.revision=OLD.current_accepted_revision
          AND e.event_type='RETIRED' AND e.offer_version=NEW.version) THEN
        RAISE EXCEPTION 'SELLABLE_OFFER_RETIRE_EVENT_REQUIRED';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.sellable_offer_events e WHERE e.offer_id=NEW.id AND e.revision=NEW.current_accepted_revision
        AND e.event_type='ACCEPTED' AND e.offer_version=NEW.version) THEN
      RAISE EXCEPTION 'SELLABLE_OFFER_ACCEPT_EVENT_REQUIRED';
    END IF;
    IF NEW.current_accepted_revision IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.sellable_offer_events submitted
        JOIN public.sellable_offer_revisions revision ON revision.offer_id=submitted.offer_id
          AND revision.revision=submitted.revision
        JOIN public.sellable_offer_events accepted ON accepted.offer_id=submitted.offer_id
          AND accepted.revision=submitted.revision AND accepted.event_type='ACCEPTED'
        WHERE submitted.offer_id=NEW.id AND submitted.revision=NEW.current_accepted_revision
          AND submitted.event_type='SUBMITTED' AND submitted.offer_version<NEW.version
          AND submitted.source_hash=revision.source_hash AND accepted.source_hash=revision.source_hash) THEN
        RAISE EXCEPTION 'SELLABLE_OFFER_SUBMISSION_REQUIRED';
      END IF;
      SELECT stay_start,stay_end INTO incoming_scope FROM public.sellable_offer_revisions
        WHERE offer_id=NEW.id AND revision=NEW.current_accepted_revision;
      PERFORM public.sellable_offer_lock_evidence(NEW.listing_id,NEW.room_type_id,
        incoming_scope.stay_start,incoming_scope.stay_end,NEW.id);
      SELECT CASE WHEN e.evidence ? 'reviewFingerprintVersion'
          THEN (e.evidence->>'reviewFingerprintVersion')::INT ELSE 1 END,
        CASE WHEN e.evidence ? 'reviewFingerprintVersion'
          THEN e.evidence->>'commercialSqlHash' ELSE e.evidence->>'inventorySqlHash' END
        INTO submitted_review_version,submitted_review_hash
        FROM public.sellable_offer_events e WHERE e.offer_id=NEW.id
          AND e.revision=NEW.current_accepted_revision AND e.event_type='SUBMITTED';
      IF submitted_review_version=1 THEN
        IF submitted_review_hash IS NULL OR submitted_review_hash<>
          public.sellable_offer_inventory_snapshot_hash(NEW.listing_id,NEW.room_type_id,
            incoming_scope.stay_start,incoming_scope.stay_end) THEN
          RAISE EXCEPTION 'SELLABLE_OFFER_SUBMISSION_INVENTORY_CHANGED';
        END IF;
      ELSIF submitted_review_version=2 THEN
        IF submitted_review_hash IS NULL OR submitted_review_hash<>
          public.sellable_offer_review_fingerprint_v2(NEW.listing_id,NEW.room_type_id,
            incoming_scope.stay_start,incoming_scope.stay_end) THEN
          RAISE EXCEPTION 'SELLABLE_OFFER_SUBMISSION_INVENTORY_CHANGED';
        END IF;
      ELSE
        RAISE EXCEPTION 'SELLABLE_OFFER_SUBMISSION_FINGERPRINT_VERSION_INVALID';
      END IF;
      current_state:=public.sellable_offer_revision_state(NEW.id,NEW.current_accepted_revision);
      IF current_state NOT IN ('VERIFIED_OFFER_AVAILABLE','OFFER_NOT_YET_EFFECTIVE')
        AND NOT (submitted_review_version=2 AND current_state='ROOM_UNAVAILABLE') THEN
        RAISE EXCEPTION 'SELLABLE_OFFER_CURRENT_AUTHORITY_INVALID';
      END IF;
      PERFORM pg_advisory_xact_lock(90210491,NEW.room_type_id);
      IF EXISTS (
        SELECT 1 FROM public.sellable_offer_revisions candidate
        JOIN public.sellable_offers other ON other.id=candidate.offer_id
          AND other.current_accepted_revision=candidate.revision
        JOIN public.sellable_offer_revisions incoming ON incoming.offer_id=NEW.id
          AND incoming.revision=NEW.current_accepted_revision
        WHERE other.id<>NEW.id AND other.room_type_id=NEW.room_type_id
          AND daterange(candidate.stay_start,candidate.stay_end,'[)') &&
            daterange(incoming.stay_start,incoming.stay_end,'[)')
          AND tstzrange(candidate.effective_from,candidate.effective_until,'[)') &&
            tstzrange(incoming.effective_from,incoming.effective_until,'[)')
      ) THEN
        RAISE EXCEPTION 'SELLABLE_OFFER_ROOM_SCOPE_CONFLICT';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Mirror 049's restricted-runtime grant predicate. Never grant the review
-- hash to PUBLIC, a web-only role or an owner/BYPASSRLS runtime credential.
DO $grants$
DECLARE role_name TEXT := 'encho_app_prod';
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND rolcanlogin AND NOT rolsuper
      AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    AND NOT has_schema_privilege(role_name,'public','CREATE')
    AND NOT has_database_privilege(role_name,current_database(),'CREATE')
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='sellable_offers'
        AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=role_name),c.relowner,'MEMBER')) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION sellable_offer_review_fingerprint_v2(INT,INT,DATE,DATE) TO %I',role_name);
  END IF;
END $grants$;
