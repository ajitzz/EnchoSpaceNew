import {createHmac, randomUUID} from 'node:crypto';
import type pg from 'pg';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {CanonicalTripService, assertTripReaderRole} from '../../services/canonicalTripService.js';
import {canonicalTripSchema} from '../../services/canonicalTripContract.js';
import {ingestProviderEvent, createPaymentAttempt} from '../../services/canonicalPaymentService.js';
import {createQ1TripFixture, fixtureAuthentication, fixtureCursorKey, fixtureProof, fixtureReadKey,
  loginA, loginB, loginAdmin, proofArguments, rawTripSQL, q1Migration} from './helpers/q1TripFixture.js';
import {applyIsolatedMigration} from './helpers/isolatedMigration.js';

describe('Q1 internal canonical own-account Trip authority / real PostgreSQL', () => {
  let f: Awaited<ReturnType<typeof createQ1TripFixture>>;
  beforeAll(async () => { f = await createQ1TripFixture(); }, 90000);
  afterAll(async () => { await f?.close(); }, 30000);
  const detail = (id: string, login = loginA) => f.service.detail(login, {reservationId: id});

  it('returns only an own Encho Direct user reservation and a strict minimal V1 snapshot', async () => {
    const own = await f.reserve({nights: 2});
    const trip = await detail(own.reservationId);
    expect(trip).toMatchObject({schemaVersion: 'ENCHO_TRIP_V1', origin: 'ENCHO_DIRECT', inventoryCommitment: 'INVENTORY_COMMITTED',
      stay: {version: 1, authority: 'ORIGINAL_COMMITTED', roomTypeId: 101, checkIn: own.checkIn, checkOut: own.checkOut,
        nights: 2, roomSubtotalMinor: own.subtotal}, payment: {composition: 'NOT_ESTABLISHED', currentCondition: 'NO_ATTEMPT'},
      lifecycle: {state: 'ACTIVE', inventoryRelease: 'NOT_RECORDED'}, checkIn: 'UNSUPPORTED', fulfillment: 'UNSUPPORTED'});
    expect(trip!.stay.allocation).toHaveLength(2);
    expect(canonicalTripSchema.safeParse(trip).success).toBe(true);
  });

  it('foreign and nonexistent detail are indistinguishable; Host/Admin cannot override account ownership', async () => {
    const own = await f.reserve(), other = await f.reserve({principal: 'user:11'});
    expect(await detail(own.reservationId, loginB)).toBeNull();
    expect(await detail(randomUUID(), loginB)).toBeNull();
    expect(await detail(other.reservationId)).toBeNull();
    expect(await detail(own.reservationId, loginAdmin)).toBeNull();
    expect((await f.service.list(loginB)).trips.map(t => t.reservationId)).toContain(other.reservationId);
    expect((await f.service.list(loginB)).trips.map(t => t.reservationId)).not.toContain(own.reservationId);
    await expect(f.service.detail(loginB, {reservationId: own.reservationId, admin: true})).rejects.toMatchObject({code: 'TRIP_INPUT_INVALID'});
  });

  it('excludes a valid anonymous session, external origin and null principal without transferring identities', async () => {
    const anonymous = await f.reserve({principal: `session:${randomUUID()}`});
    const ids: string[] = [];
    for (const principal of ['user:10', null]) {
      const result = await f.owner.query(`INSERT INTO canonical_reservations(origin_kind,listing_id,room_type_id,
        holder_principal,check_in_date,check_out_date,nights,guest_count,room_subtotal_paise,currency,status,command_id,command_fingerprint)
        VALUES('EXTERNAL_CHANNEL',1,101,$1,$2::date,$2::date+1,1,1,0,'INR','INVENTORY_COMMITTED',$3,$4) RETURNING id`,
      [principal, f.today, randomUUID(), 'c'.repeat(64)]);
      ids.push(result.rows[0].id);
    }
    for (const id of [anonymous.reservationId, ...ids]) expect(await detail(id)).toBeNull();
    const listed = (await f.service.list(loginA, {limit: 50})).trips.map(t => t.reservationId);
    expect(listed).not.toContain(anonymous.reservationId);
    for (const id of ids) expect(listed).not.toContain(id);
    expect((await f.owner.query('SELECT holder_principal FROM canonical_reservations WHERE id=$1', [anonymous.reservationId])).rows[0])
      .toEqual({holder_principal: anonymous.principal});
  });

  it('neither an input account nor an untrusted authentication context can choose ownership', async () => {
    await expect(f.service.list(loginB, {accountId: 10})).rejects.toMatchObject({code: 'TRIP_INPUT_INVALID'});
    await expect(f.service.list({credential: 'user:10'})).rejects.toMatchObject({code: 'TRIP_AUTHENTICATION_REQUIRED'});
    const valid = fixtureProof(11);
    const forged = new CanonicalTripService(f.reader, {async authenticate() { return {...valid, accountId: 10}; }}, fixtureCursorKey);
    await expect(forged.list({})).rejects.toMatchObject({code: 'TRIP_AUTHENTICATION_REQUIRED'});
  });

  it('rejects altered, expired, wrong-audience/unsigned, unknown-key and disabled account proofs in SQL', async () => {
    const proof = fixtureProof(10);
    const wrongAudience = createHmac('sha256', fixtureReadKey).update('a-different-operation').digest('hex');
    for (const invalid of [{...proof, accountId: 11}, {...proof, nonce: randomUUID()}, {...proof, mac: wrongAudience},
      fixtureProof(10, -1), fixtureProof(10, 600), {...proof, keyId: 'missing'}, {...proof, mac: '0'.repeat(64)}])
      await expect(f.reader.query(rawTripSQL, proofArguments(invalid))).rejects.toThrow('TRIP_AUTHENTICATION_REQUIRED');
    await f.owner.query('UPDATE canonical_trip_private.authentication_keys SET enabled=false');
    try { await expect(f.reader.query(rawTripSQL, proofArguments(proof))).rejects.toThrow('TRIP_AUTHENTICATION_REQUIRED'); }
    finally { await f.owner.query('UPDATE canonical_trip_private.authentication_keys SET enabled=true'); }
  });

  it('raw SQL and forged GUC cannot widen a valid proof; private helper/key access is denied', async () => {
    const other = await f.reserve({principal: 'user:11'}), proof = fixtureProof(10);
    const client = await f.reader.connect();
    try {
      await client.query("SELECT set_config('app.stays_principal','user:11',false)");
      expect((await client.query(rawTripSQL, proofArguments(proof, 1, other.reservationId))).rows).toEqual([]);
      await expect(client.query(rawTripSQL, proofArguments({...proof, accountId: 11}))).rejects.toThrow('TRIP_AUTHENTICATION_REQUIRED');
      for (const query of ['SELECT * FROM canonical_trip_private.authentication_keys',
        `SELECT canonical_trip_private.project('${other.reservationId}'::uuid)`,
        `SELECT * FROM canonical_reservation_effective_revisions`,
        `SELECT * FROM canonical_get_effective_reservation('${other.reservationId}'::uuid)`])
        await expect(client.query(query)).rejects.toMatchObject({code: '42501'});
    } finally { await client.query('RESET app.stays_principal'); client.release(); }
  });

  it('committed composition requires matched capture, payable authority and its immutable paid bridge', async () => {
    const paid = await f.reserve({paid: true});
    const trip = await detail(paid.reservationId);
    expect(trip!.payment).toEqual({composition: 'VERIFIED_ORIGINAL_BOOKING', compositionVersion: 1,
      currentCondition: 'MATCHED_CAPTURE', effectiveRevisionClearance: 'ORIGINAL_COMPOSITION'});
    const database = (await f.owner.query(`SELECT r.status, b.status AS bridge_status, a.payment_state FROM canonical_reservations r
      JOIN canonical_payment_reservations b ON b.reservation_id=r.id JOIN canonical_payment_attempts a ON a.id=b.payment_attempt_id
      WHERE r.id=$1`, [paid.reservationId])).rows[0];
    expect(database).toEqual({status: 'INVENTORY_COMMITTED', bridge_status: 'COMMITTED', payment_state: 'MATCHED_CAPTURE'});
    expect(JSON.stringify(trip)).not.toMatch(/MUST_NOT_BE_PROJECTED|provider|payable|principal|evidencePayload|packet|secret|approval_ref/);
  });

  it('capture alone does not confirm a paid booking, and a capture with no reservation is not a Trip', async () => {
    const onlyCapture = await f.reserve({captureOnly: true});
    expect((await detail(onlyCapture.reservationId))!.payment).toMatchObject({composition: 'NOT_ESTABLISHED',
      compositionVersion: null, currentCondition: 'MATCHED_CAPTURE', effectiveRevisionClearance: 'NOT_ESTABLISHED'});
    const held = await f.held(); const matched = await f.matched(held);
    expect((await f.owner.query('SELECT payment_state FROM canonical_payment_attempts WHERE id=$1', [matched.attemptId])).rows[0].payment_state)
      .toBe('MATCHED_CAPTURE');
    expect((await f.owner.query('SELECT id FROM canonical_reservations WHERE hold_id=$1', [held.holdId])).rows).toEqual([]);
  });

  it('current unresolved/later conflicting evidence cannot erase immutable paid history', async () => {
    const paid = await f.reserve({paid: true});
    await ingestProviderEvent(f.paymentWorker, {...paid.paid!.event, reportedAmountPaise: 1});
    const trip = await detail(paid.reservationId);
    expect(trip!.payment).toMatchObject({composition: 'VERIFIED_ORIGINAL_BOOKING', currentCondition: 'RECONCILIATION_REQUIRED'});
    expect((await f.owner.query(`SELECT count(*)::int AS n FROM canonical_payment_reconciliations
      WHERE payment_attempt_id=$1 AND NOT resolved`, [paid.paid!.attemptId])).rows[0].n).toBe(1);
    expect((await f.owner.query('SELECT count(*)::int AS n FROM canonical_payment_reservations WHERE reservation_id=$1',
      [paid.reservationId])).rows[0].n).toBe(1);
  });

  it('unknown attempt/reconciliation on an inventory-only reservation stays qualified', async () => {
    const held = await f.held();
    const attempt = await createPaymentAttempt(f.paymentWorker, {commandId: randomUUID(), holderPrincipal: held.principal,
      originKind: 'STRIPE', quoteId: held.quoteId, holdId: held.holdId, providerOrderRef: 'q1-unknown-order'});
    await ingestProviderEvent(f.paymentWorker, {attemptId: attempt.attemptId, originKind: 'STRIPE', providerEventId: randomUUID(),
      normalizedEventType: 'PAYMENT_UNKNOWN', reportedAmountPaise: 0, reportedCurrency: 'INR',
      providerOrderRef: 'q1-unknown-order', evidencePayload: {synthetic: true}});
    const client = await f.reservationWorker.connect();
    let reservationId: string;
    try {
      await client.query('BEGIN'); await client.query("SELECT set_config('app.stays_principal',$1,true)",[held.principal]);
      reservationId = (await client.query('SELECT * FROM canonical_finalize_direct_hold($1,$2,$3)',
        [held.holdId,held.quoteId,randomUUID()])).rows[0].reservation_id;
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    expect((await detail(reservationId!))!.payment).toMatchObject({composition: 'NOT_ESTABLISHED', currentCondition: 'RECONCILIATION_REQUIRED'});
  });

  it('distinguishes request and completed cancellation, preserving original allocation and no refund claim', async () => {
    const own = await f.reserve({paid: true, nights: 2});
    const before = (await f.owner.query('SELECT * FROM canonical_reservation_nights WHERE reservation_id=$1 ORDER BY stay_date',
      [own.reservationId])).rows;
    const request = await f.requestCancellation(own.reservationId);
    expect((await detail(own.reservationId))!.lifecycle).toEqual({state: 'CANCELLATION_REQUESTED', inventoryRelease: 'NOT_RECORDED'});
    await f.completeCancellation(own.reservationId, request.eventId);
    const trip = await detail(own.reservationId);
    expect(trip!.lifecycle).toEqual({state: 'CANCELLED', inventoryRelease: 'VERIFIED_EFFECTIVE_ALLOCATION'});
    expect(trip!.payment.composition).toBe('VERIFIED_ORIGINAL_BOOKING');
    expect(trip!.refund).toEqual({decision: 'NONE_RECORDED', authorization: 'NONE_RECORDED', execution: 'NOT_ESTABLISHED',
      settlement: 'NOT_ESTABLISHED', remainingBalance: 'UNSUPPORTED', externalHistory: 'UNKNOWN'});
    expect((await f.owner.query('SELECT * FROM canonical_reservation_nights WHERE reservation_id=$1 ORDER BY stay_date',
      [own.reservationId])).rows).toEqual(before);
  });

  it('refund authorization/decision is high-level evidence, never execution, settlement or available balance', async () => {
    const paid = await f.reserve({paid: true});
    const requested = await f.requestCancellation(paid.reservationId);
    await f.completeCancellation(paid.reservationId, requested.eventId);
    // Exact accepted synthetic D1 input, admitted by its existing trigger. Does
    // not recreate/review D2 IAM or claim a genuine human approval fixture.
    const decision = await f.owner.query(`INSERT INTO canonical_cancellation_refund_decision_evidence(
      decision_ref,version,evidence_classification,approver_responsibility,approver_identity_ref,decision_at,
      reason_code,approval_ref,verifying_component,verified_at,reservation_id,cancellation_event_id,cancellation_release_id,
      paid_bridge_id,payment_attempt_id,quote_id,payable_authority_id,provider_origin_kind,provider_payment_ref,
      supporting_provider_event_id,supporting_evidence_hash,approved_amount_paise,currency,permitted_submitting_component,
      permitted_issuer_role,decision_digest)
      SELECT $2,1,'LOCAL_SYNTHETIC_TEST_FIXTURE','ACCOMMODATION_FINANCE_APPROVER','LOCAL-TEST-APPROVER',statement_timestamp(),
      'LOCAL_TEST','PRIVATE-APPROVAL-NOT-PROJECTED','LOCAL-FIXTURE',statement_timestamp(),r.id,rel.event_id,rel.release_id,
      b.id,b.payment_attempt_id,b.quote_id,p.id,e.origin_kind,e.provider_payment_ref,e.id,e.evidence_hash,100,'INR',
      'REFUND_DECISION_AUTHORITY_PRIMITIVE','encho_refund_issuer',repeat('0',64)
      FROM canonical_reservations r JOIN canonical_reservation_cancellation_inventory_releases rel ON rel.reservation_id=r.id
      JOIN canonical_payment_reservations b ON b.reservation_id=r.id JOIN canonical_payable_authorities p ON p.quote_id=b.quote_id
      JOIN canonical_provider_events e ON e.payment_attempt_id=b.payment_attempt_id WHERE r.id=$1 RETURNING id`,
    [paid.reservationId, randomUUID()]);
    await f.refundIssuer.query('SELECT * FROM issue_cancellation_refund_authorization($1,$2,$3)',
      [randomUUID(), paid.reservationId, decision.rows[0].id]);
    const trip = await detail(paid.reservationId);
    expect(trip!.refund).toMatchObject({decision: 'LOCAL_TEST_EVIDENCE', authorization: 'RECORDED_ONLY',
      execution: 'NOT_ESTABLISHED', settlement: 'NOT_ESTABLISHED', remainingBalance: 'UNSUPPORTED', externalHistory: 'UNKNOWN'});
    expect(JSON.stringify(trip)).not.toContain('PRIVATE-APPROVAL-NOT-PROJECTED');
  });

  it('uses only sealed successor allocation; ignores unsealed V3 and does not invent paid V2 clearance', async () => {
    const own = await f.reserve({paid: true, nights: 2});
    const revision = await f.assemble(own.reservationId);
    expect((await detail(own.reservationId))!.stay.version).toBe(1);
    await f.owner.query('SELECT * FROM canonical_seal_reservation_revision($1)', [revision]);
    await f.assemble(own.reservationId,3);
    const trip = await detail(own.reservationId);
    expect(trip!.stay).toMatchObject({version: 2, authority: 'SEALED_SUCCESSOR_SNAPSHOT', roomTypeId: 102, nights: 2});
    expect(trip!.payment).toMatchObject({composition: 'VERIFIED_ORIGINAL_BOOKING', compositionVersion: 1,
      effectiveRevisionClearance: 'NOT_ESTABLISHED'});
  });

  it('rejects cross-bound source identities and contradictory lifecycle without silently returning empty success', async () => {
    const own = await f.reserve();
    // Disposable owner-only corruption, never source/production changes. Commit
    // the invalid fixture so the actual restricted service must reject it.
    const client = await f.owner.connect();
    let failure: unknown;
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE canonical_reservations DISABLE TRIGGER canonical_reservations_immutable');
      await client.query('UPDATE canonical_reservations SET room_type_id=102 WHERE id=$1', [own.reservationId]);
      await client.query('ALTER TABLE canonical_reservations ENABLE TRIGGER canonical_reservations_immutable');
      await client.query('COMMIT');
      await expect(detail(own.reservationId)).rejects.toMatchObject({code:'TRIP_SOURCE_INTEGRITY'});
      await expect(f.service.list(loginA)).rejects.toMatchObject({code:'TRIP_SOURCE_INTEGRITY'});
    } catch (error) { failure = error; }
    finally {
      await client.query('ROLLBACK');
      try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE canonical_reservations DISABLE TRIGGER canonical_reservations_immutable');
        await client.query('UPDATE canonical_reservations SET room_type_id=101 WHERE id=$1',[own.reservationId]);
        await client.query('ALTER TABLE canonical_reservations ENABLE TRIGGER canonical_reservations_immutable');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        failure = failure ? new AggregateError([failure,error],'Q1_FIXTURE_RESTORE_FAILED') : error;
      }
      finally { client.release(); }
    }
    if (failure) throw failure;
    expect((await detail(own.reservationId))!.stay.roomTypeId).toBe(101);
    const bad = await f.reserve();
    await f.owner.query(`INSERT INTO canonical_reservation_events(reservation_id,sequence_number,event_type,actor_kind,
      actor_principal,origin_kind,reason_code,command_id) VALUES($1,1,'CANCELLATION_REQUESTED','GUEST','user:11',
      'ENCHO_DIRECT','LOCAL_CORRUPTION',$2)`, [bad.reservationId, randomUUID()]);
    try { await expect(detail(bad.reservationId)).rejects.toMatchObject({code: 'TRIP_SOURCE_INTEGRITY'}); }
    finally {
      // Disposable owner repairs only its synthetic invalid fixture, not accepted source.
      await f.owner.query('ALTER TABLE canonical_reservation_events DISABLE TRIGGER canonical_reservation_events_immutable');
      try { await f.owner.query('DELETE FROM canonical_reservation_events WHERE reservation_id=$1', [bad.reservationId]); }
      finally { await f.owner.query('ALTER TABLE canonical_reservation_events ENABLE TRIGGER canonical_reservation_events_immutable'); }
    }
  });

  it('concurrent sealing between source reads cannot mix V1 header with V2 allocation', async () => {
    const own = await f.reserve({nights: 2}), revision = await f.assemble(own.reservationId);
    const client = await f.reader.connect();
    const query = client.query.bind(client);
    let observed!: () => void, proceed!: () => void;
    const snapshotReady = new Promise<void>(resolve => { observed = resolve; });
    const writerCommitted = new Promise<void>(resolve => { proceed = resolve; });
    const connectSpy = vi.spyOn(f.reader,'connect').mockImplementationOnce((() => Promise.resolve(client)) as pg.Pool['connect']);
    const querySpy = vi.spyOn(client,'query').mockImplementation((async (...args: Parameters<typeof query>) => {
      const result = await query(...args);
      if (args[0] === 'SELECT public.canonical_trip_read_ready() AS ready') {
        const mode = await query("SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS read_only");
        expect(mode.rows[0]).toEqual({isolation: 'repeatable read', read_only: 'on'});
        observed(); await writerCommitted;
      }
      return result;
    }) as typeof client.query);
    const read = detail(own.reservationId);
    try {
      await Promise.race([snapshotReady, read.then(() => { throw new Error('Q1_SNAPSHOT_GATE_NOT_REACHED'); })]);
      await f.owner.query('SELECT * FROM canonical_seal_reservation_revision($1)', [revision]);
      proceed();
      const trip = await read;
      expect(trip!.stay).toMatchObject({version: 1, roomTypeId: 101});
    } finally { proceed(); await read.catch(() => undefined); querySpy.mockRestore(); connectSpy.mockRestore(); }
    expect((await detail(own.reservationId))!.stay).toMatchObject({version: 2, roomTypeId: 102});
  });

  it('invalid offer/room/date successor bindings cannot publish a new effective Trip', async () => {
    const own = await f.reserve(), revision = randomUUID();
    await f.owner.query(`INSERT INTO canonical_reservation_revisions(id,reservation_id,version,room_type_id,offer_id,offer_revision,
      check_in_date,check_out_date,nights,guest_count,room_subtotal_paise,currency)
      SELECT $1,id,2,102,offer_id,offer_revision,check_in_date,check_out_date,nights,guest_count,room_subtotal_paise,currency
      FROM canonical_reservations WHERE id=$2`,[revision,own.reservationId]);
    // The wrong room/date allocation is rejected structurally, before sealing.
    await expect(f.owner.query(`INSERT INTO canonical_reservation_revision_nights(revision_id,reservation_id,inventory_day_id,
      stay_date,room_type_id,units) SELECT $1,$2,n.inventory_day_id,n.stay_date,102,1 FROM canonical_reservation_nights n
      WHERE reservation_id=$2`,[revision,own.reservationId])).rejects.toThrow('REVISION_NIGHT_ROOM_TYPE_INVENTORY_MISMATCH');
    await f.owner.query(`INSERT INTO canonical_reservation_revision_nights(revision_id,reservation_id,inventory_day_id,
      stay_date,room_type_id,units) SELECT $1,$2,d.id,d.calendar_date,102,1 FROM inventory_days d JOIN canonical_reservations r
      ON d.calendar_date>=r.check_in_date AND d.calendar_date<r.check_out_date WHERE r.id=$2 AND d.room_type_id=102`,[revision,own.reservationId]);
    await expect(f.owner.query('SELECT * FROM canonical_seal_reservation_revision($1)',[revision]))
      .rejects.toThrow('REVISION_OFFER_ROOM_TYPE_MISMATCH');
    expect((await detail(own.reservationId))!.stay).toMatchObject({version:1,roomTypeId:101});
  });

  it('sealed V2 cancellation projects exact version-aware release without a V1 refund inference', async () => {
    const own = await f.reserve(), revision = await f.assemble(own.reservationId);
    await f.owner.query('SELECT * FROM canonical_seal_reservation_revision($1)',[revision]);
    // Synthetic capacity only, as in accepted C2 structural fixtures. This is
    // not a physical modification writer or financial-clearance implementation.
    await f.owner.query(`UPDATE inventory_days SET booked_units=1 WHERE id IN
      (SELECT inventory_day_id FROM canonical_reservation_revision_nights WHERE revision_id=$1)`,[revision]);
    const request = await f.requestCancellation(own.reservationId);
    await f.completeCancellation(own.reservationId,request.eventId);
    const trip = await detail(own.reservationId);
    expect(trip!.stay.version).toBe(2);
    expect(trip!.lifecycle).toEqual({state:'CANCELLED',inventoryRelease:'VERIFIED_EFFECTIVE_ALLOCATION'});
    expect(trip!.refund).toMatchObject({authorization:'NONE_RECORDED',execution:'NOT_ESTABLISHED',remainingBalance:'UNSUPPORTED'});
    expect((await f.owner.query(`SELECT released_effective_version FROM canonical_reservation_cancellation_inventory_releases
      WHERE reservation_id=$1`,[own.reservationId])).rows[0].released_effective_version).toBe(2);
  });

  it('dedicated reader has no raw protected reads/writes, schema CREATE, writer or issuer authority', async () => {
    const client = await f.reader.connect();
    try {
      await assertTripReaderRole(client);
      for (const sql of ['SELECT * FROM canonical_reservations', 'SELECT * FROM canonical_provider_events',
        'SELECT * FROM canonical_cancellation_refund_decision_preparations', 'INSERT INTO canonical_reservations DEFAULT VALUES',
        'UPDATE inventory_days SET booked_units=0', 'DELETE FROM canonical_payment_reservations', 'CREATE TABLE public.q1_bad(id int)',
        `SELECT * FROM canonical_finalize_direct_hold('${randomUUID()}','${randomUUID()}','${randomUUID()}')`,
        `SELECT * FROM canonical_compose_payment_reservation('${randomUUID()}','${randomUUID()}')`,
        `SELECT * FROM issue_cancellation_refund_authorization('${randomUUID()}','${randomUUID()}','${randomUUID()}')`,
        'SET ROLE encho_trip_projection']) await expect(client.query(sql)).rejects.toMatchObject({code: '42501'});
    } finally { client.release(); }
    const attrs = (await f.owner.query(`SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
      FROM pg_roles WHERE rolname='encho_trip_reader'`)).rows[0];
    expect(attrs).toEqual({rolcanlogin: true, rolinherit: false, rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false});
  });

  it('PUBLIC and unintended runtimes cannot execute Q1 even with a valid local proof', async () => {
    const proof = fixtureProof(10);
    for (const pool of [f.untrusted,f.stays,f.reservationWorker,f.paymentWorker,f.compositionWorker,
      f.lifecycleIssuer,f.lifecycleWorker,f.cancellationExecutor,f.refundIssuer,f.publicPool,f.hostPool,f.staffPool])
      await expect(pool.query(rawTripSQL, proofArguments(proof))).rejects.toMatchObject({code: '42501'});
    const acl = await f.owner.query(`SELECT count(*)::int AS n FROM pg_proc p,
      LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.proname IN ('canonical_trip_read_ready','canonical_own_account_trips') AND a.grantee=0`);
    expect(acl.rows[0].n).toBe(0);
  });

  it('actual-role checks reject inherited broad privileges, raw column access and unsafe role attributes', async () => {
    for (const [grant, undo] of [
      ['GRANT pg_read_all_data TO encho_trip_reader', 'REVOKE pg_read_all_data FROM encho_trip_reader'],
      ['GRANT SELECT(id) ON canonical_reservations TO encho_trip_reader', 'REVOKE SELECT(id) ON canonical_reservations FROM encho_trip_reader'],
      ['ALTER ROLE encho_trip_reader BYPASSRLS', 'ALTER ROLE encho_trip_reader NOBYPASSRLS'],
      ['GRANT EXECUTE ON FUNCTION issue_cancellation_refund_authorization(uuid,uuid,uuid) TO encho_trip_reader',
        'REVOKE EXECUTE ON FUNCTION issue_cancellation_refund_authorization(uuid,uuid,uuid) FROM encho_trip_reader'],
      ['GRANT CREATE ON SCHEMA public TO encho_trip_reader', 'REVOKE CREATE ON SCHEMA public FROM encho_trip_reader']]) {
      await f.owner.query(grant);
      try { await expect(f.service.list(loginA)).rejects.toMatchObject({code: 'TRIP_ROLE_NOT_RESTRICTED'}); }
      finally { await f.owner.query(undo); }
    }
    // A runtime membership/direct ACL drift cannot substitute a session_user.
    await f.owner.query('GRANT EXECUTE ON FUNCTION canonical_trip_read_ready() TO q1_untrusted');
    try { await expect(f.untrusted.query('SELECT canonical_trip_read_ready()')).rejects.toThrow('TRIP_ROLE_NOT_RESTRICTED'); }
    finally { await f.owner.query('REVOKE EXECUTE ON FUNCTION canonical_trip_read_ready() FROM q1_untrusted'); }
  });

  it('unsafe definer configuration fails readiness and all new policies/grants remain SELECT-only', async () => {
    await f.owner.query('ALTER FUNCTION canonical_trip_read_ready() SET search_path=public,pg_catalog');
    try { await expect(f.service.list(loginA)).rejects.toMatchObject({code:'TRIP_ROLE_NOT_RESTRICTED'}); }
    finally { await f.owner.query('ALTER FUNCTION canonical_trip_read_ready() SET search_path=pg_catalog,pg_temp'); }
    const policies = await f.owner.query(`SELECT DISTINCT cmd FROM pg_policies WHERE policyname='q1_private_projection'`);
    expect(policies.rows).toEqual([{cmd:'SELECT'}]);
    const forceRLS = await f.owner.query(`SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS enforced
      FROM pg_class c WHERE c.oid IN ('canonical_reservations'::regclass,'canonical_cancellation_refund_authorizations'::regclass,
        'canonical_trip_private.authentication_keys'::regclass)`);
    expect(forceRLS.rows[0].enforced).toBe(true);
  });

  it('missing predecessor authority, RLS or accepted history cannot become an empty successful page', async () => {
    expect((await f.service.list(loginAdmin)).trips).toEqual([]);
    await f.owner.query('ALTER TABLE canonical_cancellation_refund_decision_admissions RENAME TO q1_unavailable_admissions');
    try { await expect(f.service.list(loginAdmin)).rejects.toMatchObject({code:'TRIP_AUTHORITY_UNAVAILABLE'}); }
    finally { await f.owner.query('ALTER TABLE q1_unavailable_admissions RENAME TO canonical_cancellation_refund_decision_admissions'); }
    await f.owner.query('ALTER TABLE canonical_reservations NO FORCE ROW LEVEL SECURITY');
    try { await expect(f.service.list(loginAdmin)).rejects.toMatchObject({code:'TRIP_AUTHORITY_UNAVAILABLE'}); }
    finally { await f.owner.query('ALTER TABLE canonical_reservations FORCE ROW LEVEL SECURITY'); }
    const version = '052_canonical_reservation_hold_finalization.sql';
    const checksum = (await f.owner.query('SELECT checksum FROM schema_migrations WHERE version=$1',[version])).rows[0].checksum;
    await f.owner.query('UPDATE schema_migrations SET checksum=$2 WHERE version=$1',[version,'0'.repeat(64)]);
    try { await expect(f.service.list(loginAdmin)).rejects.toMatchObject({code:'TRIP_AUTHORITY_UNAVAILABLE'}); }
    finally { await f.owner.query('UPDATE schema_migrations SET checksum=$2 WHERE version=$1',[version,checksum]); }
    expect((await f.service.list(loginAdmin)).trips).toEqual([]);
  });

  it('a one-connection pool keeps two accounts isolated across commits, failed proofs and rollbacks', async () => {
    const a = await f.reserve(), b = await f.reserve({principal: 'user:11'});
    for (let i = 0; i < 3; i++) {
      const [own, foreign] = await Promise.all([detail(a.reservationId), detail(a.reservationId,loginB)]);
      expect(own!.reservationId).toBe(a.reservationId); expect(foreign).toBeNull();
      const invalid = new CanonicalTripService(f.reader, {async authenticate() { return {...fixtureProof(10), mac: 'f'.repeat(64)}; }}, fixtureCursorKey);
      await expect(invalid.list({})).rejects.toMatchObject({code: 'TRIP_AUTHENTICATION_REQUIRED'});
      expect((await detail(b.reservationId,loginB))!.reservationId).toBe(b.reservationId);
    }
    const state = await f.reader.query(`SELECT current_setting('transaction_read_only') AS ro,
      current_setting('transaction_isolation') AS isolation,current_setting('role') AS role,
      nullif(current_setting('app.stays_principal',true),'') AS principal`);
    expect(state.rows[0]).toEqual({ro:'off',isolation:'read committed',role:'none',principal:null});
    expect(f.reader.totalCount).toBe(1);
  });

  it('a real lock timeout returns unavailable and rolls back cleanly for the next account', async () => {
    const own = await f.reserve(), lock = await f.owner.connect();
    try {
      await lock.query('BEGIN'); await lock.query('LOCK TABLE canonical_reservations IN ACCESS EXCLUSIVE MODE');
      await expect(detail(own.reservationId)).rejects.toMatchObject({code:'TRIP_AUTHORITY_UNAVAILABLE'});
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    expect(await detail(own.reservationId,loginB)).toBeNull();
    expect((await detail(own.reservationId))!.reservationId).toBe(own.reservationId);
  });

  it('commit and rollback transport failures discard a broken connection rather than return successful empty data', async () => {
    const client = await f.reader.connect(), query = client.query.bind(client);
    const connectSpy = vi.spyOn(f.reader,'connect').mockImplementationOnce((() => Promise.resolve(client)) as pg.Pool['connect']);
    const querySpy = vi.spyOn(client,'query').mockImplementation((async (...args: Parameters<typeof query>) => {
      if (args[0] === 'COMMIT' || args[0] === 'ROLLBACK') throw new Error('LOCAL_SIMULATED_CONNECTION_LOSS');
      return query(...args);
    }) as typeof client.query);
    try { await expect(f.service.list(loginA)).rejects.toMatchObject({code:'TRIP_AUTHORITY_UNAVAILABLE'}); }
    finally { querySpy.mockRestore(); connectSpy.mockRestore(); }
    expect(f.reader.totalCount).toBe(0);
    expect((await f.service.list(loginB)).trips.every(t => t.origin === 'ENCHO_DIRECT')).toBe(true);
  });

  it('a real backend disconnect is unavailable and the pool recovers without an open transaction', async () => {
    const client = await f.reader.connect();
    const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const connectSpy = vi.spyOn(f.reader,'connect').mockImplementationOnce((() => Promise.resolve(client)) as pg.Pool['connect']);
    const query = client.query.bind(client);
    const querySpy = vi.spyOn(client,'query').mockImplementation((async (...args: Parameters<typeof query>) => {
      // Kill while a query is pending: PostgreSQL really rejects/loses the
      // connection. Other cleanup fault tests isolate COMMIT/ROLLBACK windows.
      if (args[0] === 'SELECT public.canonical_trip_read_ready() AS ready') {
        const pending = query('SELECT pg_sleep(10)').then(result => ({result}),error => ({error}));
        await f.owner.query('SELECT pg_terminate_backend($1)',[pid]);
        const outcome = await pending;
        if ('error' in outcome) throw outcome.error;
        return outcome.result;
      }
      return query(...args);
    }) as typeof client.query);
    try { await expect(f.service.list(loginA)).rejects.toMatchObject({code:'TRIP_AUTHORITY_UNAVAILABLE'}); }
    finally { querySpy.mockRestore(); connectSpy.mockRestore(); }
    expect(f.reader.totalCount).toBe(0);
    expect((await f.service.list(loginB)).schemaVersion).toBe('ENCHO_TRIP_PAGE_V1');
  });

  it('pagination is bounded, stable, principal-bound and tamper/expiry-safe', async () => {
    const expected = (await f.owner.query(`SELECT id FROM canonical_reservations
      WHERE origin_kind='ENCHO_DIRECT' AND holder_principal='user:10' ORDER BY created_at DESC,id DESC`)).rows.map(r => r.id);
    const actual: string[] = []; let cursor: string | undefined;
    do {
      const page = await f.service.list(loginA,{limit:3,...(cursor ? {cursor}: {})});
      expect(page.trips.length).toBeLessThanOrEqual(3); actual.push(...page.trips.map(t => t.reservationId));
      if (page.nextCursor) {
        await expect(f.service.list(loginB,{cursor:page.nextCursor})).rejects.toMatchObject({code:'TRIP_CURSOR_INVALID'});
        await expect(f.service.list(loginA,{cursor:page.nextCursor.slice(0,-1)+'!'})).rejects.toMatchObject({code:'TRIP_CURSOR_INVALID'});
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(actual).toEqual(expected); expect(new Set(actual).size).toBe(actual.length);
    for (const input of [{limit:0},{limit:51},{limit:1.5},{cursor:'x'.repeat(1025)},{limit:1,userId:11}])
      await expect(f.service.list(loginA,input)).rejects.toMatchObject({code:'TRIP_INPUT_INVALID'});
    await expect(f.reader.query(rawTripSQL,proofArguments(fixtureProof(10),51))).rejects.toThrow('TRIP_INPUT_INVALID');
    const data = Buffer.from(JSON.stringify({v:1,account:10,at:'2026-01-01T00:00:00.000000Z',id:randomUUID(),until:1})).toString('base64url');
    const expired = `${data}.${createHmac('sha256',fixtureCursorKey).update(`q1-cursor-v1:${data}`).digest('base64url')}`;
    await expect(f.service.list(loginA,{cursor:expired})).rejects.toMatchObject({code:'TRIP_CURSOR_INVALID'});
  });

  it('projection does not mutate domain rows or read today\'s mutable prices', async () => {
    const own = await f.reserve();
    const before = await f.owner.query(`SELECT (SELECT count(*) FROM canonical_reservations) AS roots,
      (SELECT count(*) FROM canonical_reservation_nights) AS nights,(SELECT sum(booked_units) FROM inventory_days) AS booked,
      (SELECT count(*) FROM canonical_provider_events) AS events,(SELECT count(*) FROM canonical_reservation_events) AS lifecycle`);
    const old = (await f.owner.query('SELECT base_price FROM room_types WHERE id=101')).rows[0].base_price;
    await f.owner.query('UPDATE room_types SET base_price=999999 WHERE id=101');
    try {
      expect((await detail(own.reservationId))!.stay.roomSubtotalMinor).toBe(own.subtotal);
      await f.service.list(loginA,{limit:50});
    } finally { await f.owner.query('UPDATE room_types SET base_price=$1 WHERE id=101',[old]); }
    expect((await f.owner.query(`SELECT (SELECT count(*) FROM canonical_reservations) AS roots,
      (SELECT count(*) FROM canonical_reservation_nights) AS nights,(SELECT sum(booked_units) FROM inventory_days) AS booked,
      (SELECT count(*) FROM canonical_provider_events) AS events,(SELECT count(*) FROM canonical_reservation_events) AS lifecycle`)).rows)
      .toEqual(before.rows);
  });

  it('keyset pagination breaks equal timestamp ties by immutable UUID without gaps or duplicates', async () => {
    const contexts = await Promise.all([f.held(),f.held()]);
    const client = await f.reservationWorker.connect();
    try {
      await client.query('BEGIN'); await client.query("SELECT set_config('app.stays_principal','user:10',true)");
      const result = await client.query(`SELECT finalized.* FROM (VALUES($1::uuid,$2::uuid,$3::uuid),($4::uuid,$5::uuid,$6::uuid))
        args(hold,quote,command) CROSS JOIN LATERAL canonical_finalize_direct_hold(args.hold,args.quote,args.command) finalized`,
      [contexts[0].holdId,contexts[0].quoteId,randomUUID(),contexts[1].holdId,contexts[1].quoteId,randomUUID()]);
      await client.query('COMMIT');
      expect(result.rows).toHaveLength(2);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const first = await f.service.list(loginA,{limit:1}), second = await f.service.list(loginA,{limit:1,cursor:first.nextCursor!});
    expect(first.trips[0].reservedAt).toBe(second.trips[0].reservedAt);
    expect(first.trips[0].reservationId > second.trips[0].reservationId).toBe(true);
  });

  it('strict DTO rejects unexpected private fields and inconsistent qualified dispositions', async () => {
    const own = await f.reserve(), trip = (await detail(own.reservationId))!;
    expect(canonicalTripSchema.safeParse({...trip,providerPayload:{secret:'local'}}).success).toBe(false);
    expect(canonicalTripSchema.safeParse({...trip,payment:{...trip.payment,compositionVersion:1}}).success).toBe(false);
    expect(canonicalTripSchema.safeParse({...trip,refund:{...trip.refund,settlement:'SETTLED'}}).success).toBe(false);
  });

  it('SQL HMAC matches standard SHA256 interoperability vectors and is private', async () => {
    const messages = ['Hi There','', 'q1-proof\nuser:10', 'a'.repeat(200)];
    for (const message of messages) {
      const result = await f.owner.query(`SELECT encode(canonical_trip_private.hmac_sha256(convert_to($1,'UTF8'),$2),'hex') AS digest`,
        [message,fixtureReadKey]);
      expect(result.rows[0].digest).toBe(createHmac('sha256',fixtureReadKey).update(message).digest('hex'));
    }
    // RFC 4231 test case 1: twenty 0x0b bytes followed by twelve zero padding
    // bytes produce the same HMAC as the shorter RFC key under RFC 2104 padding.
    const rfcKey = Buffer.concat([Buffer.alloc(20,0x0b),Buffer.alloc(12)]);
    expect((await f.owner.query(`SELECT encode(canonical_trip_private.hmac_sha256(convert_to('Hi There','UTF8'),$1),'hex') AS digest`,
      [rfcKey])).rows[0].digest).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });
});

describe('Q1 fail-closed schema adoption / separate disposable PostgreSQL', () => {
  let f: Awaited<ReturnType<typeof createQ1TripFixture>>;
  beforeAll(async () => { f = await createQ1TripFixture({applyQ1:false}); },90000);
  afterAll(async () => { await f?.close(); },30000);
  it('missing Q1 schema is unavailable, not an authoritative empty collection', async () => {
    await expect(f.service.list(loginA)).rejects.toMatchObject({code:'TRIP_AUTHORITY_UNAVAILABLE'});
  });
  it('migration rejects an unsafe preprovisioned reader and rolls back all new objects', async () => {
    await f.owner.query('ALTER ROLE encho_trip_reader INHERIT');
    try { await expect(applyIsolatedMigration(f.owner,q1Migration)).rejects.toThrow('TRIP_ROLE_NOT_RESTRICTED'); }
    finally { await f.owner.query('ALTER ROLE encho_trip_reader NOINHERIT'); }
    expect((await f.owner.query("SELECT to_regnamespace('canonical_trip_private') AS schema")).rows[0].schema).toBeNull();
    expect((await f.owner.query("SELECT rolname FROM pg_roles WHERE rolname='encho_trip_projection'")).rows).toEqual([]);
  });
});
