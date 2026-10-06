/**
 * ENCHO W4-C1 Focused Test Suite:
 * Canonical Reservation Revision and Full Effective Allocation Snapshot Model.
 *
 * Verifies:
 * A. Existing W3 V1 reservation projects as reservation version 1 without copied V1 revision rows.
 * B. V1 effective allocation projection exactly matches existing canonical_reservation_nights.
 * C. Owner/test fixture can seed a structurally valid V2 header + full snapshot.
 * D. Effective projection chooses V2 when a valid committed V2 fixture exists.
 * E. V2 snapshot is FULL replacement authority, not merged cumulatively with V1.
 * F. V2 header mutation rejected (UPDATE / DELETE rejected with CANONICAL_RESERVATION_REVISION_IMMUTABLE).
 * G. V2 allocation row mutation rejected (UPDATE / DELETE rejected with CANONICAL_RESERVATION_REVISION_IMMUTABLE).
 * H. V2 commercial/model binding mutation rejected.
 * I. Duplicate reservation/version rejected (UNIQUE constraint violation 23505).
 * J. Invalid version <= 1 rejected from V2+ structure (CHECK constraint violation 23514).
 * K. Orphan snapshot rows rejected (FOREIGN KEY constraint violation 23503).
 * L. Allocation/commercial version cannot drift.
 * M. Accepted runtime roles cannot insert/update/delete/publish later revisions (42501 permission denied).
 * N. Migration and projections do not change inventory_days.booked_units.
 * O. W4-B cancellation functions remain unchanged.
 * 19. Negative Authority Test: complete physical W4-C modification capability = false.
 */
import assert from 'node:assert/strict';
import {execSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

process.env.TZ = 'UTC';

import pg from 'pg';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.js';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.js';
import {createItineraryQuote} from '../../src/services/itineraryQuoteService.js';
import {acquireHold} from '../../src/services/inventoryHoldService.js';
import {
  createPaymentAttempt,
  ingestProviderEvent,
  getPaymentAttempt,
} from '../../src/services/canonicalPaymentService.js';
import {composePaymentReservation} from '../../src/services/canonicalCompositionService.js';
import {addDays, createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.js';

test('W4-C1 canonical reservation revision and full snapshot model verification', async () => {
  // =========================================================================
  // 1. VERIFY EXACT CANONICAL BASE & ENVIRONMENT
  // =========================================================================
  const expectedCanonicalBase = '03de9fc4ceb6bc170033db8fb8f09f100d2a5b35';
  let mergeBaseCommit = '';
  try {
    mergeBaseCommit = execSync(`git merge-base HEAD ${expectedCanonicalBase}`, {
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    throw new Error(`EVIDENCE_INCOMPLETE: Unable to verify canonical base commit: ${err.message}`);
  }

  assert.equal(
    mergeBaseCommit,
    expectedCanonicalBase,
    `EVIDENCE_INCOMPLETE: Worker branch must descend directly from canonical base ${expectedCanonicalBase}`
  );

  const migration057Path = path.resolve('src/migrations/057_canonical_reservation_revision_model.sql');
  assert.equal(
    fs.existsSync(migration057Path),
    true,
    'EVIDENCE_INCOMPLETE: migration 057 must exist in src/migrations'
  );

  // =========================================================================
  // 2. SETUP ISOLATED POSTGRES CLUSTER & ROLES
  // =========================================================================
  const fixture = await createW1AcceptedOfferFixture({serverCompatible: true});
  let stays;
  let reservationWorker;
  let paymentWorker;
  let compositionWorker;
  let lifecycleIssuer;
  let lifecycleWorker;
  let cancellationIssuer;
  let cancellationExecutor;

  try {
    await fixture.owner.query(`CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INT,
      listing_id INT NOT NULL,
      status TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      total_rent NUMERIC
    )`);

    await applyIsolatedMigration(fixture.owner, '041_stays_canonical_commerce.sql');
    await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '050_accepted_offer_itinerary_quotes.sql');
    await fixture.owner.query(`CREATE ROLE encho_reservation_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '052_canonical_reservation_hold_finalization.sql');
    await fixture.owner.query(`CREATE ROLE encho_payment_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '053_canonical_payment_evidence_and_reconciliation.sql');
    await fixture.owner.query(`CREATE ROLE encho_composition_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '054_canonical_payment_reservation_composition.sql');

    // Provision lifecycle roles for W4-A
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

    // Provision cancellation roles for W4-B
    await fixture.owner.query(`CREATE ROLE encho_cancellation_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_cancellation_executor LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '056_canonical_cancellation_completion_authority.sql');

    // Apply W4-C1 migration 057
    await applyIsolatedMigration(fixture.owner, '057_canonical_reservation_revision_model.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer'});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker'});
    cancellationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_issuer'});
    cancellationExecutor = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_executor'});

    // Capture initial W4-B cancellation function bodies to test Invariant O
    const initialCancellationProcs = (
      await fixture.owner.query(
        `SELECT proname, prosrc FROM pg_proc
         WHERE proname IN (
           'canonical_issue_cancellation_decision_authorization',
           'canonical_complete_reservation_cancellation',
           'canonical_get_cancellation_release'
         ) ORDER BY proname`
      )
    ).rows;
    assert.equal(initialCancellationProcs.length, 3, 'All 3 W4-B cancellation functions must be present');

    // Seed ample inventory days for roomTypeId 101
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 101, $1::date + n, 5
       FROM generate_series(0, 30) AS n
       ON CONFLICT (room_type_id, calendar_date) DO NOTHING`,
      [fixture.today]
    );

    // Capture baseline inventory state
    const inventoryBefore = (
      await fixture.owner.query(
        `SELECT id, calendar_date, booked_units, held_units
         FROM inventory_days WHERE room_type_id = 101 ORDER BY calendar_date`
      )
    ).rows;

    // =========================================================================
    // 3. CREATE CANONICAL RESERVATION VIA W3 CANONICAL LIFECYCLE
    // =========================================================================
    const offerService = new AcceptedOfferService(
      fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool, 'LOCAL'),
      'LOCAL'
    );
    const draft = await offerService.createDraft(fixture.principal(10), {
      commandId: randomUUID(),
      listingId: 1,
      roomTypeId: 101,
      amountMinor: '550000',
      stayStart: fixture.today,
      stayEnd: addDays(fixture.today, 70),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 70 * 86400000).toISOString(),
      maxGuests: 2,
      minNights: 1,
    });
    const submitted = await offerService.submit(fixture.principal(10), {
      offerId: draft.offerId,
      revision: 1,
      expectedVersion: draft.version,
    });
    await fixture.grantOffer(draft.offerId);
    await offerService.accept(fixture.principal(90, 'STAFF'), {
      offerId: draft.offerId,
      revision: 1,
      expectedVersion: submitted.version,
    });

    const checkIn = addDays(fixture.today, 10);
    const checkOut = addDays(fixture.today, 12); // 2 nights
    const quote = await createItineraryQuote(
      stays,
      {
        offerId: draft.offerId,
        revision: 1,
        checkIn,
        checkOut,
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    const holdRes = await acquireHold(stays, {
      roomTypeId: 101,
      checkIn,
      checkOut,
      quantity: 1,
      idempotencyKey: randomUUID(),
      quoteId: quote.id,
      holderPrincipal: 'user:10',
      userId: 10,
    });
    assert.equal(holdRes.success, true);
    const holdId = holdRes.hold.id;
    const roomSubtotalPaise = Number(quote.roomSubtotalMinor);

    const payableId = randomUUID();
    const contractHash = 'a'.repeat(64);
    await fixture.owner.query(
      `INSERT INTO canonical_payable_authorities (
        id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
      ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
      [payableId, quote.id, roomSubtotalPaise, contractHash]
    );

    const orderRef = 'order_test_' + randomUUID();
    const paymentRef = 'pay_test_' + randomUUID();
    const attempt = await createPaymentAttempt(paymentWorker, {
      commandId: randomUUID(),
      holderPrincipal: 'user:10',
      originKind: 'RAZORPAY',
      quoteId: quote.id,
      holdId,
      providerOrderRef: orderRef,
    });

    await ingestProviderEvent(paymentWorker, {
      attemptId: attempt.attemptId,
      originKind: 'RAZORPAY',
      providerEventId: 'evt_cap_' + randomUUID(),
      normalizedEventType: 'PAYMENT_CAPTURED',
      reportedAmountPaise: roomSubtotalPaise,
      reportedCurrency: 'INR',
      providerPaymentRef: paymentRef,
      providerOrderRef: orderRef,
      evidencePayload: {pay_id: paymentRef, amount: roomSubtotalPaise},
    });

    const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
    assert.equal(dbAttempt?.paymentState, 'MATCHED_CAPTURE');

    const compRes = await composePaymentReservation(compositionWorker, {
      commandId: randomUUID(),
      paymentAttemptId: attempt.attemptId,
    });
    const reservationId = compRes.reservationId;
    assert.equal(compRes.compositionState, 'COMMITTED');

    // Retrieve original V1 reservation nights
    const v1Nights = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date, units
         FROM canonical_reservation_nights
         WHERE reservation_id = $1
         ORDER BY stay_date ASC`,
        [reservationId]
      )
    ).rows;
    assert.equal(v1Nights.length, 2, 'Reservation has 2 committed nights');

    // Record booked units after V1 creation
    const inventoryAfterV1 = (
      await fixture.owner.query(
        `SELECT id, calendar_date, booked_units, held_units
         FROM inventory_days WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2
         ORDER BY calendar_date`,
        [checkIn, checkOut]
      )
    ).rows;
    assert.deepEqual(
      inventoryAfterV1.map(r => r.booked_units),
      [1, 1],
      'Each reserved day has booked_units = 1'
    );

    // =========================================================================
    // ASSERTION A: Existing W3 V1 reservation projects as version 1 without copied rows
    // =========================================================================
    const revRowsCount = (
      await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0].count;
    assert.equal(revRowsCount, 0, 'No rows in canonical_reservation_revisions for V1 reservation');

    const revNightsCount = (
      await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_revision_nights WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0].count;
    assert.equal(revNightsCount, 0, 'No rows in canonical_reservation_revision_nights for V1 reservation');

    const effRevV1 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.ok(effRevV1, 'Effective revision row exists');
    assert.equal(effRevV1.effective_version, 1, 'Effective version for W3 reservation is 1');
    assert.equal(effRevV1.effective_revision_id, null, 'Effective revision id is null for V1');
    assert.equal(effRevV1.status, 'COMMITTED');
    assert.equal(effRevV1.listing_id, 1);
    assert.equal(effRevV1.room_type_id, 101);
    assert.equal(effRevV1.guest_count, 2);
    assert.equal(effRevV1.nights, 2);
    assert.equal(effRevV1.currency, 'INR');

    // Query helper function canonical_get_effective_reservation
    const helperRevV1 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_get_effective_reservation($1)`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(helperRevV1.effective_version, 1);
    assert.equal(helperRevV1.effective_revision_id, null);

    // =========================================================================
    // ASSERTION B: V1 effective allocation projection exactly matches canonical_reservation_nights
    // =========================================================================
    const effAllocV1 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_allocations WHERE reservation_id = $1 ORDER BY stay_date`,
        [reservationId]
      )
    ).rows;
    assert.equal(effAllocV1.length, 2, 'Effective allocation has 2 rows for V1');
    assert.equal(effAllocV1[0].effective_version, 1);
    assert.equal(effAllocV1[0].room_type_id, 101);
    assert.equal(effAllocV1[0].units, 1);
    assert.equal(effAllocV1[0].inventory_day_id, v1Nights[0].inventory_day_id);
    assert.equal(effAllocV1[1].inventory_day_id, v1Nights[1].inventory_day_id);

    // Query helper function canonical_get_effective_reservation_allocation
    const helperAllocV1 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_get_effective_reservation_allocation($1)`,
        [reservationId]
      )
    ).rows;
    assert.deepEqual(
      helperAllocV1.map(r => ({id: r.inventory_day_id, units: r.units, ver: r.effective_version})),
      effAllocV1.map(r => ({id: r.inventory_day_id, units: r.units, ver: r.effective_version}))
    );

    // =========================================================================
    // ASSERTION C: Owner/test fixture can seed a structurally valid V2 header + full snapshot
    // =========================================================================
    // Pick different dates: day 11 to day 14 (3 nights)
    const newCheckIn = addDays(fixture.today, 11);
    const newCheckOut = addDays(fixture.today, 14); // 3 nights
    const newNights = 3;
    const newSubtotalPaise = 825000;

    const v2InventoryDays = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days
         WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2
         ORDER BY calendar_date`,
        [newCheckIn, newCheckOut]
      )
    ).rows;
    assert.equal(v2InventoryDays.length, 3, 'Must have 3 inventory days for V2');

    const v2HeaderId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, status, origin_kind, listing_id, room_type_id,
        offer_id, offer_revision, check_in_date, check_out_date, nights, guest_count,
        room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 'COMMITTED', 'ENCHO_DIRECT', 1, 101, $3, 1, $4, $5, $6, 2, $7, 'INR')`,
      [v2HeaderId, reservationId, draft.offerId, newCheckIn, newCheckOut, newNights, newSubtotalPaise]
    );

    for (const d of v2InventoryDays) {
      await fixture.owner.query(
        `INSERT INTO canonical_reservation_revision_nights (
          revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
        ) VALUES ($1, $2, $3, $4, 101, 1)`,
        [v2HeaderId, reservationId, d.id, d.calendar_date]
      );
    }

    // =========================================================================
    // ASSERTION D: Effective projection chooses V2 when a valid committed V2 fixture exists
    // =========================================================================
    const effRevV2 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effRevV2.effective_version, 2, 'Effective version is now 2');
    assert.equal(effRevV2.effective_revision_id, v2HeaderId, 'Points to V2 header');
    assert.equal(effRevV2.nights, 3);
    assert.equal(Number(effRevV2.room_subtotal_paise), newSubtotalPaise);

    const helperRevV2 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_get_effective_reservation($1)`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(helperRevV2.effective_version, 2);
    assert.equal(helperRevV2.effective_revision_id, v2HeaderId);

    // =========================================================================
    // ASSERTION E: V2 snapshot is FULL replacement authority, not merged cumulatively with V1
    // =========================================================================
    const effAllocV2 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_allocations WHERE reservation_id = $1 ORDER BY stay_date`,
        [reservationId]
      )
    ).rows;
    assert.equal(effAllocV2.length, 3, 'Effective allocation has exactly 3 rows (full replacement, not 2+3=5)');
    assert.deepEqual(
      effAllocV2.map(r => r.effective_version),
      [2, 2, 2],
      'All rows belong to effective version 2'
    );
    assert.deepEqual(
      effAllocV2.map(r => r.inventory_day_id),
      v2InventoryDays.map(r => r.id),
      'Inventory day IDs match V2 snapshot exactly'
    );

    // =========================================================================
    // ASSERTION F: V2 header mutation rejected (UPDATE / DELETE)
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `UPDATE canonical_reservation_revisions SET room_subtotal_paise = 999999 WHERE id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_IMMUTABLE/,
      'Direct UPDATE on canonical_reservation_revisions must fail with CANONICAL_RESERVATION_REVISION_IMMUTABLE'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `DELETE FROM canonical_reservation_revisions WHERE id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_IMMUTABLE/,
      'Direct DELETE on canonical_reservation_revisions must fail with CANONICAL_RESERVATION_REVISION_IMMUTABLE'
    );

    // =========================================================================
    // ASSERTION G: V2 allocation row mutation rejected (UPDATE / DELETE)
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `UPDATE canonical_reservation_revision_nights SET units = 2 WHERE revision_id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_IMMUTABLE/,
      'Direct UPDATE on canonical_reservation_revision_nights must fail with CANONICAL_RESERVATION_REVISION_IMMUTABLE'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `DELETE FROM canonical_reservation_revision_nights WHERE revision_id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_IMMUTABLE/,
      'Direct DELETE on canonical_reservation_revision_nights must fail with CANONICAL_RESERVATION_REVISION_IMMUTABLE'
    );

    // =========================================================================
    // ASSERTION H: V2 commercial/model binding mutation rejected
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `UPDATE canonical_reservation_revisions SET offer_revision = 99 WHERE id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_IMMUTABLE/,
      'Commercial binding mutation must be rejected by immutability trigger'
    );

    // =========================================================================
    // ASSERTION I: Duplicate reservation/version rejected
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revisions (
            id, reservation_id, version, status, origin_kind, listing_id, room_type_id,
            offer_id, offer_revision, check_in_date, check_out_date, nights, guest_count,
            room_subtotal_paise, currency
          ) VALUES ($1, $2, 2, 'COMMITTED', 'ENCHO_DIRECT', 1, 101, $3, 1, $4, $5, 3, 2, 825000, 'INR')`,
          [randomUUID(), reservationId, draft.offerId, newCheckIn, newCheckOut]
        );
      },
      (err) => err.code === '23505',
      'Duplicate reservation_id + version must be rejected by unique constraint'
    );

    // =========================================================================
    // ASSERTION J: Invalid version <= 1 rejected from V2+ structure
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revisions (
            id, reservation_id, version, status, origin_kind, listing_id, room_type_id,
            offer_id, offer_revision, check_in_date, check_out_date, nights, guest_count,
            room_subtotal_paise, currency
          ) VALUES ($1, $2, 1, 'COMMITTED', 'ENCHO_DIRECT', 1, 101, $3, 1, $4, $5, 3, 2, 825000, 'INR')`,
          [randomUUID(), reservationId, draft.offerId, newCheckIn, newCheckOut]
        );
      },
      (err) => err.code === '23514',
      'version = 1 must be rejected by CHECK (version >= 2)'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revisions (
            id, reservation_id, version, status, origin_kind, listing_id, room_type_id,
            offer_id, offer_revision, check_in_date, check_out_date, nights, guest_count,
            room_subtotal_paise, currency
          ) VALUES ($1, $2, 0, 'COMMITTED', 'ENCHO_DIRECT', 1, 101, $3, 1, $4, $5, 3, 2, 825000, 'INR')`,
          [randomUUID(), reservationId, draft.offerId, newCheckIn, newCheckOut]
        );
      },
      (err) => err.code === '23514',
      'version = 0 must be rejected by CHECK (version >= 2)'
    );

    // =========================================================================
    // ASSERTION K: Orphan snapshot rows rejected
    // =========================================================================
    const nonExistentRevId = randomUUID();
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_nights (
            revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
          ) VALUES ($1, $2, $3, $4, 101, 1)`,
          [nonExistentRevId, reservationId, v2InventoryDays[0].id, v2InventoryDays[0].calendar_date]
        );
      },
      (err) => err.code === '23503',
      'Orphan allocation row with nonexistent revision_id must be rejected by foreign key'
    );

    // Cross-reservation row (valid revision_id, but wrong reservation_id)
    const anotherReservationId = randomUUID();
    const unusedDay = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days
         WHERE room_type_id = 101 AND calendar_date = $1`,
        [addDays(fixture.today, 25)]
      )
    ).rows[0];
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_nights (
            revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
          ) VALUES ($1, $2, $3, $4, 101, 1)`,
          [v2HeaderId, anotherReservationId, unusedDay.id, unusedDay.calendar_date]
        );
      },
      (err) => err.code === '23503',
      'Allocation row with mismatched reservation_id must be rejected by composite foreign key'
    );

    // =========================================================================
    // ASSERTION L: Allocation/commercial version cannot drift
    // =========================================================================
    // Effective revision and effective allocation always match the exact same single version
    const effRevCheck = (
      await fixture.owner.query(
        `SELECT effective_version FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    const effAllocCheck = (
      await fixture.owner.query(
        `SELECT DISTINCT effective_version FROM canonical_reservation_effective_allocations WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows;
    assert.equal(effAllocCheck.length, 1, 'Only one effective version in allocation projection');
    assert.equal(effAllocCheck[0].effective_version, effRevCheck.effective_version, 'Allocation version matches revision version');

    // =========================================================================
    // ASSERTION M: Accepted runtime roles cannot insert/update/delete/publish later revisions
    // =========================================================================
    const runtimeRolePools = [
      {name: 'encho_stays_web', pool: stays},
      {name: 'encho_reservation_worker', pool: reservationWorker},
      {name: 'encho_payment_worker', pool: paymentWorker},
      {name: 'encho_composition_worker', pool: compositionWorker},
      {name: 'encho_lifecycle_issuer', pool: lifecycleIssuer},
      {name: 'encho_lifecycle_worker', pool: lifecycleWorker},
      {name: 'encho_cancellation_issuer', pool: cancellationIssuer},
      {name: 'encho_cancellation_executor', pool: cancellationExecutor},
    ];

    for (const {name, pool} of runtimeRolePools) {
      await assert.rejects(
        async () => {
          await pool.query(
            `INSERT INTO canonical_reservation_revisions (
              id, reservation_id, version, status, origin_kind, listing_id, room_type_id,
              offer_id, offer_revision, check_in_date, check_out_date, nights, guest_count,
              room_subtotal_paise, currency
            ) VALUES ($1, $2, 9, 'COMMITTED', 'ENCHO_DIRECT', 1, 101, $3, 1, $4, $5, 3, 2, 825000, 'INR')`,
            [randomUUID(), reservationId, draft.offerId, newCheckIn, newCheckOut]
          );
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied INSERT on canonical_reservation_revisions with 42501`
      );

      await assert.rejects(
        async () => {
          await pool.query(
            `INSERT INTO canonical_reservation_revision_nights (
              revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
            ) VALUES ($1, $2, $3, $4, 101, 1)`,
            [v2HeaderId, reservationId, v2InventoryDays[0].id, v2InventoryDays[0].calendar_date]
          );
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied INSERT on canonical_reservation_revision_nights with 42501`
      );

      await assert.rejects(
        async () => {
          await pool.query(
            `UPDATE canonical_reservation_revisions SET room_subtotal_paise = 100 WHERE id = $1`,
            [v2HeaderId]
          );
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied UPDATE on canonical_reservation_revisions with 42501`
      );

      await assert.rejects(
        async () => {
          await pool.query(
            `DELETE FROM canonical_reservation_revisions WHERE id = $1`,
            [v2HeaderId]
          );
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied DELETE on canonical_reservation_revisions with 42501`
      );
    }

    // =========================================================================
    // ASSERTION N: Migration and projections do not change inventory_days.booked_units
    // =========================================================================
    const inventoryAfterV2 = (
      await fixture.owner.query(
        `SELECT id, calendar_date, booked_units, held_units
         FROM inventory_days WHERE room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2
         ORDER BY calendar_date`,
        [checkIn, checkOut]
      )
    ).rows;
    assert.deepEqual(
      inventoryAfterV2.map(r => r.booked_units),
      [1, 1],
      'Physical booked_units remains exactly 1; zero inventory replacement in W4-C1'
    );

    // Also check the days seeded in V2 that were not in V1:
    const v2ExclusiveDay = (
      await fixture.owner.query(
        `SELECT id, calendar_date, booked_units, held_units
         FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [addDays(fixture.today, 13)]
      )
    ).rows[0];
    assert.equal(
      v2ExclusiveDay.booked_units,
      0,
      'V2-only day has booked_units = 0 (unmutated by revision seating or projection)'
    );

    // =========================================================================
    // ASSERTION O: W4-B cancellation functions remain unchanged
    // =========================================================================
    const currentCancellationProcs = (
      await fixture.owner.query(
        `SELECT proname, prosrc FROM pg_proc
         WHERE proname IN (
           'canonical_issue_cancellation_decision_authorization',
           'canonical_complete_reservation_cancellation',
           'canonical_get_cancellation_release'
         ) ORDER BY proname`
      )
    ).rows;
    assert.deepEqual(
      currentCancellationProcs,
      initialCancellationProcs,
      'W4-B cancellation function bodies must be completely unchanged by migration 057'
    );

    // =========================================================================
    // ASSERTION P: Seeding higher version V3 deterministically selects V3
    // =========================================================================
    const v3HeaderId = randomUUID();
    const v3CheckIn = addDays(fixture.today, 15);
    const v3CheckOut = addDays(fixture.today, 16); // 1 night
    const v3InventoryDays = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days
         WHERE room_type_id = 101 AND calendar_date = $1`,
        [v3CheckIn]
      )
    ).rows;

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, status, origin_kind, listing_id, room_type_id,
        offer_id, offer_revision, check_in_date, check_out_date, nights, guest_count,
        room_subtotal_paise, currency
      ) VALUES ($1, $2, 3, 'COMMITTED', 'ENCHO_DIRECT', 1, 101, $3, 1, $4, $5, 1, 1, 275000, 'INR')`,
      [v3HeaderId, reservationId, draft.offerId, v3CheckIn, v3CheckOut]
    );

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES ($1, $2, $3, $4, 101, 1)`,
      [v3HeaderId, reservationId, v3InventoryDays[0].id, v3InventoryDays[0].calendar_date]
    );

    const effRevV3 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effRevV3.effective_version, 3, 'Effective version is now 3');
    assert.equal(effRevV3.effective_revision_id, v3HeaderId, 'Points to V3 header');

    const effAllocV3 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_allocations WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows;
    assert.equal(effAllocV3.length, 1, 'V3 has 1 allocation row');
    assert.equal(effAllocV3[0].effective_version, 3);
    assert.equal(effAllocV3[0].inventory_day_id, v3InventoryDays[0].id);

    // =========================================================================
    // ASSERTION 19: NEGATIVE AUTHORITY TEST - NO ACCEPTED MODIFICATION WRITER
    // =========================================================================
    // Check all pg_proc for any procedures that can insert into canonical_reservation_revisions
    const candidateProcs = (
      await fixture.owner.query(
        `SELECT p.proname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (
             p.prosrc ILIKE '%canonical_reservation_revisions%'
             OR p.prosrc ILIKE '%canonical_reservation_revision_nights%'
           )
           AND p.proname NOT IN (
             'canonical_reservation_revision_reject_mutation',
             'canonical_get_effective_reservation',
             'canonical_get_effective_reservation_allocation'
           )`
      )
    ).rows;
    assert.equal(
      candidateProcs.length,
      0,
      'No procedure exists that writes to revision tables: zero canonical modification writer'
    );

    // Check grants on revision tables: zero runtime roles have INSERT privilege
    const runtimeRoleGrants = (
      await fixture.owner.query(
        `SELECT grantee, table_name, privilege_type
         FROM information_schema.role_table_grants
         WHERE table_name IN ('canonical_reservation_revisions', 'canonical_reservation_revision_nights')
           AND grantee IN (
             'encho_stays_web',
             'encho_reservation_worker',
             'encho_payment_worker',
             'encho_composition_worker',
             'encho_lifecycle_issuer',
             'encho_lifecycle_worker',
             'encho_cancellation_issuer',
             'encho_cancellation_executor'
           )
           AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')`
      )
    ).rows;
    assert.equal(
      runtimeRoleGrants.length,
      0,
      'Zero DML privileges granted to any runtime role on revision tables'
    );

    console.log('W4_C1_OBSERVATION', JSON.stringify({
      canonicalCommit: expectedCanonicalBase,
      v1ReservationProjectsAsVersion1: true,
      v1AllocationMatchesNights: true,
      v2RevisionSeeded: true,
      v2EffectiveVersionSelected: true,
      v2FullReplacementSemanticsVerified: true,
      v2HeaderImmutabilityEnforced: true,
      v2AllocationImmutabilityEnforced: true,
      uniqueReservationVersionEnforced: true,
      versionGreaterThanOneEnforced: true,
      orphanAllocationRowsRejected: true,
      lockstepVersionEnforced: true,
      runtimeRolesDMLDenied: true,
      inventoryBookedUnitsUnmutated: true,
      w4bCancellationProcsUnchanged: true,
      v3HigherVersionSelected: true,
      hasCompleteAcceptedW4cModificationWriter: false,
      completePhysicalW4CModificationCapability: false,
    }, null, 2));

  } finally {
    await Promise.all([
      stays?.end(),
      reservationWorker?.end(),
      paymentWorker?.end(),
      compositionWorker?.end(),
      lifecycleIssuer?.end(),
      lifecycleWorker?.end(),
      cancellationIssuer?.end(),
      cancellationExecutor?.end(),
    ]);
    await fixture.close();
  }
});
