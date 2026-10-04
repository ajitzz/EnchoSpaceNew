-- W1: accepted dated room-offer authority. Apply only through the canonical runner.
-- Historical revisions and events are retained; no legacy price is backfilled.
CREATE TABLE sellable_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  host_account_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  latest_revision INT NOT NULL DEFAULT 0 CHECK (latest_revision >= 0),
  current_accepted_revision INT,
  public_disposition TEXT NOT NULL DEFAULT 'NONE' CHECK (public_disposition IN ('NONE','ACCEPTED','RETIRED')),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (current_accepted_revision IS NULL OR current_accepted_revision BETWEEN 1 AND latest_revision),
  CHECK ((current_accepted_revision IS NOT NULL) = (public_disposition='ACCEPTED'))
);
CREATE INDEX sellable_offers_listing_room ON sellable_offers(listing_id,room_type_id,id);

CREATE TABLE sellable_offer_revisions (
  offer_id UUID NOT NULL REFERENCES sellable_offers(id) ON DELETE RESTRICT,
  revision INT NOT NULL CHECK (revision > 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 900719925474099),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  price_basis TEXT NOT NULL CHECK (price_basis = 'PER_ROOM_NIGHT'),
  stay_start DATE NOT NULL,
  stay_end DATE NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ NOT NULL,
  max_guests INT NOT NULL CHECK (max_guests > 0),
  min_nights INT NOT NULL CHECK (min_nights > 0),
  source_facts JSONB NOT NULL CHECK (jsonb_typeof(source_facts) = 'object'),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  media_facts JSONB NOT NULL CHECK (jsonb_typeof(media_facts) = 'array'),
  media_hash TEXT NOT NULL CHECK (media_hash ~ '^[a-f0-9]{64}$'),
  created_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (offer_id,revision),
  CHECK (stay_end > stay_start),
  CHECK (min_nights <= stay_end - stay_start),
  CHECK (effective_until > effective_from)
);
ALTER TABLE sellable_offers ADD CONSTRAINT sellable_offers_current_revision_fk
  FOREIGN KEY (id,current_accepted_revision)
  REFERENCES sellable_offer_revisions(offer_id,revision) ON DELETE RESTRICT;
CREATE INDEX sellable_offer_revisions_stay ON sellable_offer_revisions(stay_start,stay_end,effective_from,effective_until);

CREATE TABLE sellable_offer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL,
  revision INT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('DRAFT_CREATED','SUBMITTED','ACCEPTED','SUPERSEDED','RETIRED')),
  actor_account_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_membership_id UUID REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
  offer_version BIGINT NOT NULL CHECK (offer_version > 0),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (offer_id,revision) REFERENCES sellable_offer_revisions(offer_id,revision) ON DELETE RESTRICT,
  UNIQUE (offer_id,revision,event_type),
  CHECK ((event_type IN ('DRAFT_CREATED','SUBMITTED')) = (actor_membership_id IS NULL))
);
CREATE INDEX sellable_offer_events_queue ON sellable_offer_events(event_type,occurred_at,offer_id);

-- One durable response identity for a Host SaveOfferDraft command. The payload
-- digest is compared by the service on replay; the receipt itself never changes.
CREATE TABLE sellable_offer_draft_receipts (
  host_account_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_id UUID NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  offer_id UUID NOT NULL,
  revision INT NOT NULL,
  result JSONB NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (host_account_id,command_id),
  FOREIGN KEY (offer_id,revision) REFERENCES sellable_offer_revisions(offer_id,revision) ON DELETE RESTRICT
);
CREATE INDEX sellable_offer_draft_receipts_offer ON sellable_offer_draft_receipts(offer_id,revision);

CREATE FUNCTION sellable_offer_reject_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SELLABLE_OFFER_EVIDENCE_IMMUTABLE'; END $$;
CREATE TRIGGER sellable_offer_revision_immutable BEFORE UPDATE OR DELETE ON sellable_offer_revisions
  FOR EACH ROW EXECUTE FUNCTION sellable_offer_reject_evidence_mutation();
CREATE TRIGGER sellable_offer_event_immutable BEFORE UPDATE OR DELETE ON sellable_offer_events
  FOR EACH ROW EXECUTE FUNCTION sellable_offer_reject_evidence_mutation();
CREATE TRIGGER sellable_offer_draft_receipt_immutable BEFORE UPDATE OR DELETE ON sellable_offer_draft_receipts
  FOR EACH ROW EXECUTE FUNCTION sellable_offer_reject_evidence_mutation();

-- Events and the mutable parent pointer are one transaction-level transition.
-- A restricted writer cannot commit an orphan event that would misstate review
-- status even when it never becomes publicly sellable. The service deliberately
-- inserts the event before updating the parent, so this guard is deferred.
CREATE FUNCTION sellable_offer_guard_event_commit() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE authority RECORD;
BEGIN
  SELECT version,latest_revision,current_accepted_revision,public_disposition
    INTO authority FROM public.sellable_offers WHERE id=NEW.offer_id;
  IF NOT FOUND OR authority.version<>NEW.offer_version THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_EVENT_PARENT_MISMATCH';
  END IF;
  IF NEW.event_type='DRAFT_CREATED' AND authority.latest_revision<>NEW.revision THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_EVENT_PARENT_MISMATCH';
  ELSIF NEW.event_type='SUBMITTED' AND (
    authority.latest_revision<>NEW.revision OR NOT EXISTS(
      SELECT 1 FROM public.sellable_offer_events created WHERE created.offer_id=NEW.offer_id
        AND created.revision=NEW.revision AND created.event_type='DRAFT_CREATED'
        AND created.offer_version=NEW.offer_version-1)) THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_EVENT_PARENT_MISMATCH';
  ELSIF NEW.event_type='ACCEPTED' AND (
    authority.latest_revision<>NEW.revision OR authority.current_accepted_revision IS DISTINCT FROM NEW.revision
    OR authority.public_disposition<>'ACCEPTED' OR NOT EXISTS(
      SELECT 1 FROM public.sellable_offer_events submitted WHERE submitted.offer_id=NEW.offer_id
        AND submitted.revision=NEW.revision AND submitted.event_type='SUBMITTED'
        AND submitted.offer_version=NEW.offer_version-1)) THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_EVENT_PARENT_MISMATCH';
  ELSIF NEW.event_type='SUPERSEDED' AND (
    authority.current_accepted_revision IS NULL OR authority.current_accepted_revision=NEW.revision
    OR authority.public_disposition<>'ACCEPTED' OR NOT EXISTS(
      SELECT 1 FROM public.sellable_offer_events accepted WHERE accepted.offer_id=NEW.offer_id
        AND accepted.revision=authority.current_accepted_revision AND accepted.event_type='ACCEPTED'
        AND accepted.offer_version=NEW.offer_version)) THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_EVENT_PARENT_MISMATCH';
  ELSIF NEW.event_type='RETIRED' AND (
    authority.current_accepted_revision IS NOT NULL OR authority.public_disposition<>'RETIRED'
    OR NOT EXISTS(SELECT 1 FROM public.sellable_offer_events accepted WHERE accepted.offer_id=NEW.offer_id
      AND accepted.revision=NEW.revision AND accepted.event_type='ACCEPTED')) THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_EVENT_PARENT_MISMATCH';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sellable_offer_event_parent_commit
  AFTER INSERT ON sellable_offer_events DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sellable_offer_guard_event_commit();

CREATE FUNCTION sellable_offer_guard_identity() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE incoming_scope RECORD;
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
      IF public.sellable_offer_revision_state(NEW.id,NEW.current_accepted_revision)
        NOT IN ('VERIFIED_OFFER_AVAILABLE','OFFER_NOT_YET_EFFECTIVE') THEN
        RAISE EXCEPTION 'SELLABLE_OFFER_CURRENT_AUTHORITY_INVALID';
      END IF;
      -- The advisory lock serializes even raw SQL writers for this canonical room.
      -- Two independent offer IDs may cover disjoint seasons, never the same
      -- room-night and effective instant at once.
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
CREATE TRIGGER sellable_offer_identity_guard BEFORE UPDATE ON sellable_offers
  FOR EACH ROW EXECUTE FUNCTION sellable_offer_guard_identity();
CREATE FUNCTION sellable_offer_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SELLABLE_OFFER_IDENTITY_IMMUTABLE'; END $$;
CREATE TRIGGER sellable_offer_no_delete BEFORE DELETE ON sellable_offers
  FOR EACH ROW EXECUTE FUNCTION sellable_offer_reject_delete();

-- Exact approved-row evidence. This is a URL/association fingerprint, not a byte or rights certificate.
CREATE FUNCTION sellable_offer_source_snapshot(target_listing INT,target_room INT) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT jsonb_build_object(
    'listingId',l.id,'hostAccountId',l.user_id,'title',l.title,'slug',l.slug,
    'publicationStatus',l.publication_status,'listingCurrency',l.currency,
    'roomTypeId',r.id,'roomName',r.name,'roomType',r.type,'roomCurrency',r.currency,
    'maxGuests',r.max_occupancy,'inventoryCount',r.inventory_count,'minNights',r.min_stay_nights,
    'description',r.description,'specs',r.specs,'features',r.features,'amenities',r.amenities,
    'media',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',m.id,'url',m.url,'roomTypeId',m.room_type_id,'category',m.category,
      'sleepingArea',m.is_sleeping_area,'status',m.moderation_status) ORDER BY m.id)
      FROM public.media_assets m WHERE m.entity_type='listing' AND m.entity_id=l.id
        AND m.room_type_id=r.id AND m.moderation_status='approved'),'[]'::jsonb))
  FROM public.listings l JOIN public.room_types r ON r.listing_id=l.id
  WHERE l.id=target_listing AND r.id=target_room
$$;

-- A restricted offer credential may fence existing source/inventory rows without
-- acquiring UPDATE privilege on canonical room, media, inventory or block tables.
CREATE FUNCTION sellable_offer_lock_evidence(target_listing INT,target_room INT,
  target_start DATE,target_end DATE,target_offer UUID DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.listings l JOIN public.room_types r ON r.listing_id=l.id
      WHERE l.id=target_listing AND r.id=target_room AND (
        l.user_id::text=current_setting('app.current_user_id',true)
        OR (target_offer IS NOT NULL AND EXISTS(SELECT 1 FROM public.sellable_offers o
          WHERE o.id=target_offer AND o.listing_id=l.id AND o.room_type_id=r.id)
          AND public.internal_iam_has_permission(public.internal_iam_current_organization_id(),
            'offer.accept','OFFER',target_offer::text,NULL,
            coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL)))) THEN
    RAISE EXCEPTION 'SELLABLE_OFFER_LOCK_FORBIDDEN';
  END IF;
  PERFORM id FROM public.room_types WHERE id=target_room AND listing_id=target_listing FOR SHARE;
  PERFORM id FROM public.media_assets WHERE entity_type='listing' AND entity_id=target_listing
    AND room_type_id=target_room ORDER BY id FOR SHARE;
  PERFORM id FROM public.inventory_days WHERE listing_id=target_listing AND room_type_id=target_room
    AND calendar_date>=target_start AND calendar_date<target_end ORDER BY calendar_date FOR SHARE;
  PERFORM id FROM public.room_calendar_blocks WHERE listing_id=target_listing
    AND start_date<target_end AND end_date>=target_start
    AND (room_type_id IS NULL OR room_type_id=target_room) ORDER BY id FOR SHARE;
END $$;

-- The SQL role's own RLS remains in force; a browser cannot supply these settings directly.
ALTER TABLE sellable_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellable_offers FORCE ROW LEVEL SECURITY;
ALTER TABLE sellable_offer_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellable_offer_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE sellable_offer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellable_offer_events FORCE ROW LEVEL SECURITY;
ALTER TABLE sellable_offer_draft_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellable_offer_draft_receipts FORCE ROW LEVEL SECURITY;

-- The owner-only policy lets a SECURITY DEFINER scalar disclose just whether
-- a published room has retired authority. The public role cannot read retired
-- offer IDs, Host IDs, revision counters or audit evidence from these tables.
CREATE POLICY sellable_offer_owner_read ON sellable_offers FOR SELECT TO current_user USING (true);
CREATE POLICY sellable_offer_revision_owner_read ON sellable_offer_revisions FOR SELECT TO current_user USING (true);
-- Conservative SQL subset of the approved-media URL contract. A raw SQL
-- accepted-pointer transition must not publish a price with executable or
-- private-network media even if a matching source hash was forged.
CREATE FUNCTION sellable_offer_media_url_safe(raw_url TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE value TEXT := btrim(raw_url);
DECLARE hostname TEXT;
BEGIN
  IF value IS NULL OR value='' OR length(value)>2048 OR value ~ '[[:space:]]'
    OR position(chr(92) IN value)>0 THEN RETURN false; END IF;
  IF value ~ '^/[A-Za-z0-9_./%?&#=+-]+$' AND value !~ '^//' THEN RETURN true; END IF;
  IF value !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:443)?([/?#].*)?$'
    THEN RETURN false; END IF;
  hostname:=lower(substring(value FROM '^https://([^:/?#]+)'));
  IF hostname ~ '^[0-9.]+$' OR hostname IN ('localhost','metadata.google.internal')
    OR hostname ~ '\.(localhost|local|internal)$' THEN RETURN false; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION sellable_offer_media_url_safe(TEXT) FROM PUBLIC;
-- One private current-facts predicate is shared by direct-SQL acceptance and
-- the public safe-row projection. This intentionally uses PostgreSQL's clock:
-- a public caller cannot supply a future time to reveal future prices.
CREATE FUNCTION sellable_offer_revision_state(target_offer UUID,target_revision INT) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE authority RECORD;
DECLARE facts JSONB;
DECLARE india_day DATE := (statement_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT o.listing_id,o.room_type_id,o.host_account_id,l.user_id,l.publication_status,
    v.stay_start,v.stay_end,v.effective_from,v.effective_until,v.min_nights,
    v.source_hash,v.media_hash INTO authority
  FROM public.sellable_offers o
  JOIN public.listings l ON l.id=o.listing_id
  JOIN public.room_types r ON r.id=o.room_type_id AND r.listing_id=o.listing_id
  JOIN public.sellable_offer_revisions v ON v.offer_id=o.id AND v.revision=target_revision
  WHERE o.id=target_offer;
  IF NOT FOUND OR authority.publication_status<>'published' OR authority.user_id<>authority.host_account_id
    THEN RETURN 'OFFER_STALE_REVIEW'; END IF;
  facts:=public.sellable_offer_source_snapshot(authority.listing_id,authority.room_type_id);
  IF facts IS NULL OR encode(sha256(convert_to(facts::text,'UTF8')),'hex')<>authority.source_hash
    OR encode(sha256(convert_to((facts->'media')::text,'UTF8')),'hex')<>authority.media_hash
    OR EXISTS(SELECT 1 FROM public.media_assets current_media WHERE current_media.entity_type='listing'
      AND current_media.entity_id=authority.listing_id AND current_media.room_type_id=authority.room_type_id
      AND current_media.moderation_status='approved'
      AND NOT public.sellable_offer_media_url_safe(current_media.url))
    OR NOT EXISTS(SELECT 1 FROM public.room_types WHERE listing_id=authority.listing_id)
    OR EXISTS(SELECT 1 FROM public.room_types rr WHERE rr.listing_id=authority.listing_id AND (
      rr.base_price IS NULL OR rr.base_price<=0 OR
      (SELECT count(*) FROM public.media_assets mm WHERE mm.entity_type='listing'
        AND mm.entity_id=authority.listing_id AND mm.room_type_id=rr.id
        AND mm.moderation_status='approved')<3 OR
      (SELECT count(*) FROM public.media_assets mm WHERE mm.entity_type='listing'
        AND mm.entity_id=authority.listing_id AND mm.room_type_id=rr.id
        AND mm.moderation_status='approved' AND mm.is_sleeping_area=true)<1))
    THEN RETURN 'OFFER_STALE_REVIEW'; END IF;
  IF statement_timestamp()>=authority.effective_until OR authority.stay_end<=india_day
    THEN RETURN 'OFFER_EXPIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_calendar_blocks unresolved
    WHERE unresolved.listing_id=authority.listing_id AND unresolved.start_date<authority.stay_end
      AND unresolved.end_date>=greatest(authority.stay_start,india_day)
      AND (unresolved.room_type_id IS NULL OR unresolved.room_type_id=authority.room_type_id)
      AND (unresolved.room_type_id IS NULL OR unresolved.room_tier_key='all'
        OR unresolved.mapping_status IS DISTINCT FROM 'mapped'))
    THEN RETURN 'LEGACY_DATA_UNRECONCILED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_days first_night
    WHERE first_night.listing_id=authority.listing_id AND first_night.room_type_id=authority.room_type_id
      AND first_night.calendar_date>=greatest(authority.stay_start,india_day)
      AND first_night.calendar_date+authority.min_nights<=authority.stay_end
      AND NOT EXISTS(SELECT 1 FROM generate_series(0,authority.min_nights-1) AS nights(n)
        LEFT JOIN public.inventory_days inventory ON inventory.room_type_id=authority.room_type_id
          AND inventory.calendar_date=first_night.calendar_date+nights.n
        WHERE inventory.id IS NULL OR inventory.listing_id<>authority.listing_id
          OR inventory.total_units-inventory.held_units-inventory.booked_units-inventory.blocked_units<1
          OR EXISTS(SELECT 1 FROM public.room_calendar_blocks block
            WHERE block.listing_id=authority.listing_id AND block.room_type_id=authority.room_type_id
              AND block.start_date<=first_night.calendar_date+nights.n
              AND block.end_date>=first_night.calendar_date+nights.n)))
    THEN RETURN 'ROOM_UNAVAILABLE'; END IF;
  IF statement_timestamp()<authority.effective_from THEN RETURN 'OFFER_NOT_YET_EFFECTIVE'; END IF;
  RETURN 'VERIFIED_OFFER_AVAILABLE';
END $$;
REVOKE ALL ON FUNCTION sellable_offer_revision_state(UUID,INT) FROM PUBLIC;
CREATE FUNCTION sellable_offer_public_rows(target_listing INT,target_room INT)
RETURNS TABLE(offer_id UUID,listing_id INT,room_type_id INT,revision INT,
  amount_minor BIGINT,currency TEXT,price_basis TEXT,stay_start DATE,stay_end DATE,
  effective_from TIMESTAMPTZ,effective_until TIMESTAMPTZ,max_guests INT,min_nights INT,
  media_urls TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
  SELECT o.id,o.listing_id,o.room_type_id,v.revision,v.amount_minor,v.currency,v.price_basis,
    v.stay_start,v.stay_end,v.effective_from,v.effective_until,v.max_guests,v.min_nights,
    ARRAY(SELECT media->>'url' FROM jsonb_array_elements(snapshot.facts->'media') media)
  FROM public.sellable_offers o
  JOIN public.listings l ON l.id=o.listing_id AND l.publication_status='published'
  JOIN public.room_types r ON r.id=o.room_type_id AND r.listing_id=o.listing_id
  JOIN public.sellable_offer_revisions v ON v.offer_id=o.id AND v.revision=o.current_accepted_revision
  CROSS JOIN LATERAL (SELECT public.sellable_offer_source_snapshot(l.id,r.id) AS facts) snapshot
  WHERE o.listing_id=target_listing AND o.room_type_id=target_room AND o.public_disposition='ACCEPTED'
    AND public.sellable_offer_revision_state(o.id,v.revision)='VERIFIED_OFFER_AVAILABLE'
$$;
REVOKE ALL ON FUNCTION sellable_offer_public_rows(INT,INT) FROM PUBLIC;
CREATE FUNCTION sellable_offer_public_state(target_listing INT,target_room INT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM public.listings l
    JOIN public.room_types r ON r.listing_id=l.id
    WHERE l.id=target_listing AND l.publication_status='published' AND r.id=target_room) THEN NULL
  ELSE coalesce((SELECT public.sellable_offer_revision_state(o.id,o.current_accepted_revision)
      FROM public.sellable_offers o WHERE o.listing_id=target_listing AND o.room_type_id=target_room
        AND o.current_accepted_revision IS NOT NULL AND o.public_disposition='ACCEPTED'
      ORDER BY CASE public.sellable_offer_revision_state(o.id,o.current_accepted_revision)
        WHEN 'VERIFIED_OFFER_AVAILABLE' THEN 0 WHEN 'OFFER_STALE_REVIEW' THEN 1
        WHEN 'LEGACY_DATA_UNRECONCILED' THEN 2 WHEN 'ROOM_UNAVAILABLE' THEN 3
        WHEN 'OFFER_NOT_YET_EFFECTIVE' THEN 4 ELSE 5 END,o.id LIMIT 1),
      CASE WHEN EXISTS(SELECT 1 FROM public.sellable_offers o WHERE o.listing_id=target_listing
        AND o.room_type_id=target_room AND o.public_disposition='RETIRED')
        THEN 'OFFER_RETIRED' ELSE 'NO_ACCEPTED_OFFER' END)
  END
$$;
REVOKE ALL ON FUNCTION sellable_offer_public_state(INT,INT) FROM PUBLIC;

CREATE POLICY sellable_offer_identity_read ON sellable_offers FOR SELECT USING (
  host_account_id::text=current_setting('app.current_user_id',true)
  OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.read','OFFER',id::text,NULL,
    coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL)
  OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.accept','OFFER',id::text,NULL,
    coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL)
);
CREATE POLICY sellable_offer_identity_create ON sellable_offers FOR INSERT WITH CHECK (
  host_account_id::text=current_setting('app.current_user_id',true)
  AND EXISTS(SELECT 1 FROM listings l WHERE l.id=listing_id AND l.user_id=host_account_id)
  AND EXISTS(SELECT 1 FROM room_types r WHERE r.id=room_type_id AND r.listing_id=listing_id)
  AND latest_revision=0 AND current_accepted_revision IS NULL AND version=0
);
CREATE POLICY sellable_offer_identity_change ON sellable_offers FOR UPDATE
  USING(host_account_id::text=current_setting('app.current_user_id',true)
    OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.accept','OFFER',id::text,NULL,
      coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL))
  WITH CHECK(host_account_id::text=current_setting('app.current_user_id',true)
    OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.accept','OFFER',id::text,NULL,
      coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL));
CREATE POLICY sellable_offer_revision_read ON sellable_offer_revisions FOR SELECT USING (
  EXISTS(SELECT 1 FROM sellable_offers o WHERE o.id=offer_id AND (
    o.host_account_id::text=current_setting('app.current_user_id',true)
    OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.read','OFFER',o.id::text,NULL,
      coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL)
    OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.accept','OFFER',o.id::text,NULL,
      coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL)))
);
CREATE POLICY sellable_offer_revision_create ON sellable_offer_revisions FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM sellable_offers o WHERE o.id=offer_id AND
    o.host_account_id::text=current_setting('app.current_user_id',true) AND revision=o.latest_revision+1)
);
CREATE POLICY sellable_offer_event_read ON sellable_offer_events FOR SELECT USING (
  EXISTS(SELECT 1 FROM sellable_offers o WHERE o.id=offer_id AND (
    o.host_account_id::text=current_setting('app.current_user_id',true)
    OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.read','OFFER',o.id::text,NULL,
      coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL)
    OR internal_iam_has_permission(internal_iam_current_organization_id(),'offer.accept','OFFER',o.id::text,NULL,
      coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL)))
);
CREATE POLICY sellable_offer_event_create ON sellable_offer_events FOR INSERT WITH CHECK (
  (event_type IN ('DRAFT_CREATED','SUBMITTED') AND actor_membership_id IS NULL
   AND EXISTS(SELECT 1 FROM sellable_offers o WHERE o.id=offer_id AND o.host_account_id=actor_account_id
     AND o.host_account_id::text=current_setting('app.current_user_id',true)))
  OR (event_type IN ('ACCEPTED','SUPERSEDED','RETIRED')
    AND actor_account_id::text=current_setting('app.current_user_id',true)
    AND actor_membership_id=internal_iam_current_membership_id()
    AND internal_iam_has_permission(internal_iam_current_organization_id(),'offer.accept','OFFER',offer_id::text,NULL,
      coalesce(nullif(current_setting('app.workforce_environment',true),''),'LOCAL'),NULL))
);
CREATE POLICY sellable_offer_draft_receipt_read ON sellable_offer_draft_receipts FOR SELECT USING (
  host_account_id::text=current_setting('app.current_user_id',true)
);
CREATE POLICY sellable_offer_draft_receipt_create ON sellable_offer_draft_receipts FOR INSERT WITH CHECK (
  host_account_id::text=current_setting('app.current_user_id',true)
  AND EXISTS(SELECT 1 FROM sellable_offers o WHERE o.id=offer_id AND o.host_account_id=host_account_id)
  AND EXISTS(SELECT 1 FROM sellable_offer_events e WHERE e.offer_id=offer_id AND e.revision=revision
    AND e.event_type='DRAFT_CREATED')
);

REVOKE ALL ON sellable_offers,sellable_offer_revisions,sellable_offer_events,
  sellable_offer_draft_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION sellable_offer_source_snapshot(INT,INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION sellable_offer_lock_evidence(INT,INT,DATE,DATE,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sellable_offer_reject_evidence_mutation(),sellable_offer_guard_identity(),
  sellable_offer_reject_delete(),sellable_offer_guard_event_commit() FROM PUBLIC;

-- Extend the current scoped workforce catalog. The seeded role has no member grants.
DO $seed$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['internal_permission_catalog','internal_role_definitions',
    'internal_role_versions','internal_role_permissions','internal_role_current_versions'] LOOP
    EXECUTE format('CREATE POLICY w1_offer_migration_seed ON %I FOR INSERT TO %I WITH CHECK (true)',relation_name,current_user);
  END LOOP;
END $seed$;
INSERT INTO internal_permission_catalog(permission_code,resource_type,risk_class,step_up_required,checker_policy,description)
VALUES ('offer.read','OFFER','STANDARD',false,'NONE','Read an exact assigned sellable offer revision.'),
       ('offer.accept','OFFER','SENSITIVE',false,'NONE','Accept or retire an exact submitted sellable offer revision.');
INSERT INTO internal_role_definitions(organization_id,role_key,display_name,description)
VALUES ('00000000-0000-4000-8000-000000000001','offer_reviewer','Offer Reviewer',
        'Review and accept exact submitted sellable offer revisions.');
INSERT INTO internal_role_versions(role_id,organization_id,version,config_hash,reason)
SELECT id,organization_id,1,encode(sha256(convert_to('offer_reviewer:v1','UTF8')),'hex'),
  'Initial scoped W1 offer-review authority.' FROM internal_role_definitions WHERE role_key='offer_reviewer';
INSERT INTO internal_role_permissions(role_version_id,permission_code)
SELECT v.id,p.permission_code FROM internal_role_versions v
JOIN internal_role_definitions r ON r.id=v.role_id
JOIN internal_permission_catalog p ON p.permission_code IN ('offer.read','offer.accept')
WHERE r.role_key='offer_reviewer' AND v.version=1;
INSERT INTO internal_role_current_versions(role_id,organization_id,version_id)
SELECT r.id,r.organization_id,v.id FROM internal_role_definitions r
JOIN internal_role_versions v ON v.role_id=r.id AND v.version=1 WHERE r.role_key='offer_reviewer';
DO $seed$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['internal_permission_catalog','internal_role_definitions',
    'internal_role_versions','internal_role_permissions','internal_role_current_versions'] LOOP
    EXECUTE format('DROP POLICY w1_offer_migration_seed ON %I',relation_name);
  END LOOP;
END $seed$;

-- Existing named restricted LOGINs only. Additional Host/workforce credentials need
-- an explicit reviewed grant deployment; no owner, BYPASSRLS or PUBLIC fallback.
DO $grants$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['encho_app_prod','encho_web_prod_20261002'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND rolcanlogin AND NOT rolsuper
      AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
      AND NOT has_schema_privilege(role_name,'public','CREATE')
      AND NOT has_database_privilege(role_name,current_database(),'CREATE')
      AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='sellable_offers'
          AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=role_name),c.relowner,'MEMBER')) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION sellable_offer_public_rows(INT,INT) TO %I',role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION sellable_offer_public_state(INT,INT) TO %I',role_name);
      IF role_name='encho_app_prod' THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION sellable_offer_source_snapshot(INT,INT) TO %I',role_name);
        EXECUTE format('GRANT SELECT,INSERT,UPDATE ON sellable_offers TO %I',role_name);
        EXECUTE format('GRANT SELECT,INSERT ON sellable_offer_revisions,sellable_offer_events TO %I',role_name);
        EXECUTE format('GRANT SELECT,INSERT ON sellable_offer_draft_receipts TO %I',role_name);
        EXECUTE format('GRANT EXECUTE ON FUNCTION sellable_offer_lock_evidence(INT,INT,DATE,DATE,UUID) TO %I',role_name);
        EXECUTE format('GRANT EXECUTE ON FUNCTION internal_iam_has_permission(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT) TO %I',role_name);
        EXECUTE format('GRANT EXECUTE ON FUNCTION internal_iam_current_organization_id(),internal_iam_current_membership_id() TO %I',role_name);
      END IF;
    END IF;
  END LOOP;
END $grants$;
