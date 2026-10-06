/**
 * ENCHO W4-C1 Focused Test Suite:
 * Canonical Reservation Revision, Full Effective Allocation Snapshot, and Structural Seal Model.
 *
 * Verifies:
 * - Structural seal model as the authority fence: V2+ assembly != authority until sealed.
 * - Atomic seal validation: contiguous dates, row count == nights, inventory-day identity.
 * - Snapshot set immutability: zero post-seal appends, updates, or deletes.
 * - Cross-bound identities: root reservation, listing, room-type, and inventory-day cross-validation.
 * - Adversarial test cases A through Q.
 * - Runtime role negative authority across all 8 runtime roles.
 * - Existing invariants: V1 projection, zero inventory mutation, W4-B unchanged, no modification writer.
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

test('W4-C1 canonical reservation revision, full snapshot, and structural seal model verification', async () => {
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

    // Seed ample inventory days for roomTypeId 101 (listing 1)
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 101, $1::date + n, 5
       FROM generate_series(0, 30) AS n
       ON CONFLICT (room_type_id, calendar_date) DO NOTHING`,
      [fixture.today]
    );

    // Seed inventory days for roomTypeId 201 (listing 2) to test cross-listing rejection
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 2, 201, $1::date + n, 5
       FROM generate_series(0, 30) AS n
       ON CONFLICT (room_type_id, calendar_date) DO NOTHING`,
      [fixture.today]
    );

    // Seed inventory days for roomTypeId 102 (listing 1) to test composite FK room-type rejection
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 102, $1::date + n, 5
       FROM generate_series(0, 30) AS n
       ON CONFLICT (room_type_id, calendar_date) DO NOTHING`,
      [fixture.today]
    );

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

    // =========================================================================
    // BASELINE: V1 PROJECTION PARITY & ZERO COPY
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

    const effAllocV1 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_allocations WHERE reservation_id = $1 ORDER BY stay_date`,
        [reservationId]
      )
    ).rows;
    assert.equal(effAllocV1.length, 2, 'Effective allocation has 2 rows for V1');
    assert.equal(effAllocV1[0].effective_version, 1);
    assert.equal(effAllocV1[0].room_type_id, 101);
    assert.equal(effAllocV1[0].inventory_day_id, v1Nights[0].inventory_day_id);

    // Record initial inventory booked_units before any V2 assembly
    const inventoryBeforeV2 = (
      await fixture.owner.query(
        `SELECT id, calendar_date, booked_units
         FROM inventory_days WHERE room_type_id = 101 ORDER BY calendar_date`
      )
    ).rows;

    // =========================================================================
    // ADVERSARIAL CASE H: ROOT LISTING/ROOM-TYPE MISMATCH
    // Attempt V2 header with room_type_id 201 (listing 2) for reservation on listing 1
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revisions (
            id, reservation_id, version, room_type_id, offer_id, offer_revision,
            check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
          ) VALUES ($1, $2, 2, 201, $3, 1, $4, $5, 2, 2, 550000, 'INR')`,
          [randomUUID(), reservationId, draft.offerId, checkIn, checkOut]
        );
      },
      /REVISION_ROOM_TYPE_LISTING_MISMATCH/,
      'Header with room_type_id from a different listing must be rejected at insertion'
    );

    // =========================================================================
    // ADVERSARIAL CASE A: ZERO SNAPSHOT
    // Insert valid V2 header with 0 nights. Assert not effective. Seal fails.
    // =========================================================================
    const v2HeaderId = randomUUID();
    const newCheckIn = addDays(fixture.today, 11);
    const newCheckOut = addDays(fixture.today, 14); // 3 nights
    const newNights = 3;
    const newSubtotalPaise = 825000;

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $3, 1, $4, $5, $6, 2, $7, 'INR')`,
      [v2HeaderId, reservationId, draft.offerId, newCheckIn, newCheckOut, newNights, newSubtotalPaise]
    );

    // Header exists, but zero nights -> V2 MUST NOT BE EFFECTIVE
    const effZeroNights = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effZeroNights.effective_version, 1, 'Zero-snapshot V2 must NOT become effective');

    // Sealing zero snapshot must FAIL
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
          [v2HeaderId, reservationId]
        );
      },
      /REVISION_SEAL_NIGHTS_COUNT_MISMATCH/,
      'Sealing a revision with zero snapshot rows must fail'
    );

    // =========================================================================
    // ADVERSARIAL CASE D: OUT-OF-RANGE DATE
    // stay_date outside [check_in_date, check_out_date) must be rejected
    // =========================================================================
    const outOfRangeDay = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days
         WHERE room_type_id = 101 AND calendar_date = $1`,
        [addDays(fixture.today, 20)] // Day 20 is outside [11, 14)
      )
    ).rows[0];

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_nights (
            revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
          ) VALUES ($1, $2, $3, $4, 101, 1)`,
          [v2HeaderId, reservationId, outOfRangeDay.id, outOfRangeDay.calendar_date]
        );
      },
      /REVISION_NIGHT_DATE_OUT_OF_RANGE/,
      'Snapshot row with stay_date outside check-in/out range must be rejected'
    );

    // =========================================================================
    // ADVERSARIAL CASE E: HEADER/NIGHT ROOM-TYPE MISMATCH
    // Night declared with room_type_id 102 while header has room_type_id 101
    // (Both rooms belong to listing 1, isolating the header/night composite FK check)
    // =========================================================================
    const day11Room102 = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days WHERE room_type_id = 102 AND calendar_date = $1`,
        [addDays(fixture.today, 11)]
      )
    ).rows[0];

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_nights (
            revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
          ) VALUES ($1, $2, $3, $4, 102, 1)`,
          [v2HeaderId, reservationId, day11Room102.id, day11Room102.calendar_date]
        );
      },
      (err) => err.code === '23503',
      'Night with mismatched room_type_id must be rejected structurally by composite FK'
    );

    // =========================================================================
    // ADVERSARIAL CASE F: INVENTORY-DAY / DATE MISMATCH
    // inventory_day_id corresponds to Day 12, but night claims stay_date = Day 11
    // =========================================================================
    const day11 = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [addDays(fixture.today, 11)]
      )
    ).rows[0];
    const day12 = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [addDays(fixture.today, 12)]
      )
    ).rows[0];

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_nights (
            revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
          ) VALUES ($1, $2, $3, $4, 101, 1)`,
          [v2HeaderId, reservationId, day12.id, day11.calendar_date]
        );
      },
      /REVISION_NIGHT_DATE_INVENTORY_MISMATCH/,
      'Inventory day date mismatch must be rejected'
    );

    // =========================================================================
    // ADVERSARIAL CASE G: INVENTORY-DAY / ROOM-TYPE MISMATCH
    // inventory_day for room 201 passed while night claims room_type_id 101
    const day11Room201 = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days WHERE room_type_id = 201 AND calendar_date = $1`,
        [addDays(fixture.today, 11)]
      )
    ).rows[0];

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_nights (
            revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
          ) VALUES ($1, $2, $3, $4, 101, 1)`,
          [v2HeaderId, reservationId, day11Room201.id, day11.calendar_date]
        );
      },
      /REVISION_NIGHT_ROOM_TYPE_INVENTORY_MISMATCH/,
      'Inventory day room-type mismatch must be rejected'
    );

    // =========================================================================
    // ADVERSARIAL CASE B: PARTIAL SNAPSHOT
    // Insert 1 night when header requires 3 nights. Seal must FAIL.
    // =========================================================================
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES ($1, $2, $3, $4, 101, 1)`,
      [v2HeaderId, reservationId, day11.id, day11.calendar_date]
    );

    // Still unsealed -> not effective
    const effPartial = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effPartial.effective_version, 1, 'Partial-snapshot V2 must NOT become effective');

    // Seal must FAIL
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
          [v2HeaderId, reservationId]
        );
      },
      /REVISION_SEAL_NIGHTS_COUNT_MISMATCH/,
      'Sealing partial snapshot (1 of 3) must fail'
    );

    // =========================================================================
    // ADVERSARIAL CASE C: GAPPED SNAPSHOT
    // Insert Day 11 and Day 13 (omitting Day 12). Count is 2 of 3, gap exists.
    // =========================================================================
    const day13 = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [addDays(fixture.today, 13)]
      )
    ).rows[0];

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES ($1, $2, $3, $4, 101, 1)`,
      [v2HeaderId, reservationId, day13.id, day13.calendar_date]
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
          [v2HeaderId, reservationId]
        );
      },
      /REVISION_SEAL_NIGHTS_COUNT_MISMATCH|REVISION_SEAL_DATES_INCOMPLETE/,
      'Sealing gapped snapshot must fail'
    );

    // =========================================================================
    // ADVERSARIAL CASE I: VALID COMPLETE SNAPSHOT BEFORE SEAL
    // Insert missing Day 12. Snapshot is now 3 nights, valid and complete.
    // BUT V2 IS NOT YET SEALED. It MUST NOT BE EFFECTIVE!
    // =========================================================================
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES ($1, $2, $3, $4, 101, 1)`,
      [v2HeaderId, reservationId, day12.id, day12.calendar_date]
    );

    // Revisions all view shows V2 as ASSEMBLING
    const revAllUnsealed = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_revisions_all WHERE reservation_id = $1 ORDER BY version`,
        [reservationId]
      )
    ).rows;
    assert.equal(revAllUnsealed.length, 2);
    assert.equal(revAllUnsealed[0].status, 'COMMITTED'); // V1
    assert.equal(revAllUnsealed[1].status, 'ASSEMBLING'); // V2 unsealed

    // Effective revision MUST STILL BE V1!
    const effBeforeSeal = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effBeforeSeal.effective_version, 1, 'Valid complete snapshot BEFORE SEAL must NOT be effective');

    // =========================================================================
    // ADVERSARIAL CASE J: VALID SEAL
    // Seal valid complete V2. It becomes effective.
    // =========================================================================
    const sealRes = await fixture.owner.query(
      `SELECT * FROM canonical_seal_reservation_revision($1)`,
      [v2HeaderId]
    );
    assert.equal(sealRes.rows.length, 1);
    assert.equal(sealRes.rows[0].revision_id, v2HeaderId);

    // Now V2 is effective!
    const effAfterSeal = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effAfterSeal.effective_version, 2, 'After seal, V2 becomes effective');
    assert.equal(effAfterSeal.status, 'SEALED');
    assert.equal(effAfterSeal.effective_revision_id, v2HeaderId);
    assert.equal(effAfterSeal.nights, 3);
    assert.equal(Number(effAfterSeal.room_subtotal_paise), newSubtotalPaise);

    // Allocation projection returns exactly V2's 3 nights (full replacement, not merged with V1)
    const effAllocV2 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_allocations WHERE reservation_id = $1 ORDER BY stay_date`,
        [reservationId]
      )
    ).rows;
    assert.equal(effAllocV2.length, 3, 'Effective allocation has 3 nights');
    assert.deepEqual(effAllocV2.map(r => r.effective_version), [2, 2, 2]);

    // =========================================================================
    // ADVERSARIAL CASE K: POST-SEAL APPEND MUST BE REJECTED
    // Attempt to insert any night into sealed revision -> CANONICAL_RESERVATION_REVISION_SEALED
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_revision_nights (
            revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
          ) VALUES ($1, $2, $3, $4, 101, 1)`,
          [v2HeaderId, reservationId, day11.id, day11.calendar_date]
        );
      },
      /CANONICAL_RESERVATION_REVISION_SEALED/,
      'Post-seal append must be rejected with CANONICAL_RESERVATION_REVISION_SEALED'
    );

    // =========================================================================
    // ADVERSARIAL CASES L, M, N: POST-SEAL UPDATE/DELETE REJECTED
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `UPDATE canonical_reservation_revision_nights SET units = 2 WHERE revision_id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_IMMUTABLE/,
      'Post-seal night update must be rejected'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `DELETE FROM canonical_reservation_revision_nights WHERE revision_id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_IMMUTABLE/,
      'Post-seal night delete must be rejected'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `UPDATE canonical_reservation_revision_seals SET sealed_at = now() WHERE revision_id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_SEAL_IMMUTABLE/,
      'Seal update must be rejected'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `DELETE FROM canonical_reservation_revision_seals WHERE revision_id = $1`,
          [v2HeaderId]
        );
      },
      /CANONICAL_RESERVATION_REVISION_SEAL_IMMUTABLE/,
      'Seal delete must be rejected'
    );

    // =========================================================================
    // ADVERSARIAL CASE O: HIGHER UNSEALED VERSION DOES NOT MASK LOWER SEALED
    // Seed V3 as ASSEMBLING (unsealed). Effective remains V2!
    // =========================================================================
    const v3HeaderId = randomUUID();
    const v3CheckIn = addDays(fixture.today, 15);
    const v3CheckOut = addDays(fixture.today, 16); // 1 night

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 3, 101, $3, 1, $4, $5, 1, 1, 275000, 'INR')`,
      [v3HeaderId, reservationId, draft.offerId, v3CheckIn, v3CheckOut]
    );

    // V3 exists in all_revisions as ASSEMBLING
    const revAllWithV3 = (
      await fixture.owner.query(
        `SELECT version, status FROM canonical_reservation_revisions_all WHERE reservation_id = $1 ORDER BY version`,
        [reservationId]
      )
    ).rows;
    assert.deepEqual(revAllWithV3, [
      {version: 1, status: 'COMMITTED'},
      {version: 2, status: 'SEALED'},
      {version: 3, status: 'ASSEMBLING'},
    ]);

    // Effective projection MUST STILL BE V2!
    const effWithUnsealedV3 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effWithUnsealedV3.effective_version, 2, 'Unsealed V3 must NOT mask sealed V2');
    assert.equal(effWithUnsealedV3.effective_revision_id, v2HeaderId);

    // Now seal V3 and verify effective moves to V3
    const day15 = (
      await fixture.owner.query(
        `SELECT id, calendar_date FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
        [v3CheckIn]
      )
    ).rows[0];
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES ($1, $2, $3, $4, 101, 1)`,
      [v3HeaderId, reservationId, day15.id, day15.calendar_date]
    );
    await fixture.owner.query(`SELECT * FROM canonical_seal_reservation_revision($1)`, [v3HeaderId]);

    const effAfterV3Seal = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [reservationId]
      )
    ).rows[0];
    assert.equal(effAfterV3Seal.effective_version, 3, 'After sealing V3, effective version advances to 3');

    // =========================================================================
    // ADVERSARIAL CASE P: CONCURRENT APPEND VS SEAL SERIALIZATION
    // Test that row lock on revision header serializes append and seal transactions
    // =========================================================================
    const v4HeaderId = randomUUID();
    const v4CheckIn = addDays(fixture.today, 17);
    const v4CheckOut = addDays(fixture.today, 18);
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 4, 101, $3, 1, $4, $5, 1, 1, 275000, 'INR')`,
      [v4HeaderId, reservationId, draft.offerId, v4CheckIn, v4CheckOut]
    );

    const client1 = await fixture.owner.connect();
    const client2 = await fixture.owner.connect();
    try {
      // Client 1 seals V4
      const day17 = (
        await fixture.owner.query(
          `SELECT id, calendar_date FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`,
          [v4CheckIn]
        )
      ).rows[0];
      await fixture.owner.query(
        `INSERT INTO canonical_reservation_revision_nights (
          revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
        ) VALUES ($1, $2, $3, $4, 101, 1)`,
        [v4HeaderId, reservationId, day17.id, day17.calendar_date]
      );

      await client1.query('BEGIN');
      await client1.query(`SELECT * FROM canonical_seal_reservation_revision($1)`, [v4HeaderId]);

      // Client 2 attempts append while seal tx is in flight -> client 2 blocks until client 1 commits
      let client2Finished = false;
      let client2Error = null;
      const appendPromise = (async () => {
        try {
          await client2.query(
            `INSERT INTO canonical_reservation_revision_nights (
              revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
            ) VALUES ($1, $2, $3, $4, 101, 1)`,
            [v4HeaderId, reservationId, day17.id, day17.calendar_date]
          );
        } catch (err) {
          client2Error = err;
        } finally {
          client2Finished = true;
        }
      })();

      // Verify client 2 is waiting behind row lock
      await new Promise(res => setTimeout(res, 50));
      assert.equal(client2Finished, false, 'Client 2 must be blocked on header lock while seal tx is open');

      // Client 1 commits seal
      await client1.query('COMMIT');

      // Now client 2 unblocks and MUST FAIL with CANONICAL_RESERVATION_REVISION_SEALED
      await appendPromise;
      assert.ok(client2Error, 'Client 2 append must fail after seal commits');
      assert.match(client2Error.message, /CANONICAL_RESERVATION_REVISION_SEALED/);
    } finally {
      client1.release();
      client2.release();
    }

    // =========================================================================
    // ADVERSARIAL CASE Q: ZERO PHYSICAL INVENTORY MUTATION
    // Compare inventory_days.booked_units against baseline
    // =========================================================================
    const inventoryAfterAll = (
      await fixture.owner.query(
        `SELECT id, calendar_date, booked_units
         FROM inventory_days WHERE room_type_id = 101 ORDER BY calendar_date`
      )
    ).rows;

    assert.deepEqual(
      inventoryAfterAll.map(r => r.booked_units),
      inventoryBeforeV2.map(r => r.booked_units),
      'All physical booked_units must be 100% identical before and after revision assembly/sealing'
    );

    // =========================================================================
    // RUNTIME ROLE NEGATIVE AUTHORITY PROBES (Section 23)
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
      // Cannot INSERT header
      await assert.rejects(
        async () => {
          await pool.query(
            `INSERT INTO canonical_reservation_revisions (
              id, reservation_id, version, room_type_id, offer_id, offer_revision,
              check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
            ) VALUES ($1, $2, 9, 101, $3, 1, $4, $5, 1, 1, 100000, 'INR')`,
            [randomUUID(), reservationId, draft.offerId, checkIn, checkOut]
          );
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied INSERT on canonical_reservation_revisions with 42501`
      );

      // Cannot INSERT snapshot row
      await assert.rejects(
        async () => {
          await pool.query(
            `INSERT INTO canonical_reservation_revision_nights (
              revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
            ) VALUES ($1, $2, $3, $4, 101, 1)`,
            [v2HeaderId, reservationId, day11.id, day11.calendar_date]
          );
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied INSERT on canonical_reservation_revision_nights with 42501`
      );

      // Cannot INSERT seal
      await assert.rejects(
        async () => {
          await pool.query(
            `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
            [v2HeaderId, reservationId]
          );
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied INSERT on canonical_reservation_revision_seals with 42501`
      );

      // Cannot execute sealing helper
      await assert.rejects(
        async () => {
          await pool.query(`SELECT * FROM canonical_seal_reservation_revision($1)`, [v2HeaderId]);
        },
        (err) => err.code === '42501',
        `Role ${name} must be denied EXECUTE on canonical_seal_reservation_revision with 42501`
      );
    }

    // =========================================================================
    // NEGATIVE AUTHORITY TEST: ZERO MODIFICATION WRITER
    // =========================================================================
    const candidateProcs = (
      await fixture.owner.query(
        `SELECT p.proname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (
             p.prosrc ILIKE '%canonical_reservation_revisions%'
             OR p.prosrc ILIKE '%canonical_reservation_revision_nights%'
             OR p.prosrc ILIKE '%canonical_reservation_revision_seals%'
           )
           AND p.proname NOT IN (
             'canonical_validate_reservation_revision_header',
             'canonical_validate_reservation_revision_night',
             'canonical_validate_and_seal_reservation_revision',
             'canonical_reservation_revision_reject_mutation',
             'canonical_reservation_revision_seal_reject_mutation',
             'canonical_seal_reservation_revision',
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

    // =========================================================================
    // INVARIANT O: W4-B CANCELLATION PROCS UNCHANGED
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

    console.log('W4_C1_OBSERVATION', JSON.stringify({
      canonicalCommit: expectedCanonicalBase,
      v1ReservationProjectsAsVersion1: true,
      v1AllocationMatchesNights: true,
      v2HeaderAssemblyOnlyBeforeSeal: true,
      adversarialCaseA_ZeroSnapshotRejected: true,
      adversarialCaseB_PartialSnapshotRejected: true,
      adversarialCaseC_GappedSnapshotRejected: true,
      adversarialCaseD_OutOfRangeDateRejected: true,
      adversarialCaseE_RoomTypeMismatchRejected: true,
      adversarialCaseF_InventoryDateMismatchRejected: true,
      adversarialCaseG_InventoryRoomTypeMismatchRejected: true,
      adversarialCaseH_ListingMismatchRejected: true,
      adversarialCaseI_UnsealedCompleteNotEffective: true,
      adversarialCaseJ_ValidSealBecomesEffective: true,
      adversarialCaseK_PostSealAppendRejected: true,
      adversarialCaseL_M_N_ImmutabilityEnforced: true,
      adversarialCaseO_HigherUnsealedDoesNotMaskSealed: true,
      adversarialCaseP_ConcurrentAppendSealSerialized: true,
      adversarialCaseQ_ZeroInventoryMutation: true,
      runtimeRolesNegativeAuthorityVerified: true,
      w4bCancellationProcsUnchanged: true,
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
