/**
 * ENCHO W4-C2 Focused Test Suite:
 * Version-Aware Canonical Cancellation Compatibility.
 *
 * Verifies:
 * - V1 reservation cancellation releases immutable W3/V1 canonical_reservation_nights.
 * - Sealed V2+ reservation cancellation releases the highest sealed current-effective snapshot.
 * - Unsealed later revisions are completely ignored.
 * - Exactly one effective allocation version is released per cancellation.
 * - Release header snapshots released_effective_version (INT NOT NULL) and released_revision_id.
 * - Per-night release evidence persists room_type_id and exact released_units (units > 1 supported).
 * - All-or-nothing atomicity: underflow on any effective night rolls back the entire cancellation.
 * - Exact idempotent replay preserves stored result without re-releasing inventory.
 * - Release evidence immutability triggers remain active.
 * - Cancellation executor and runtime roles gain ZERO V2 assembly/seal authority.
 * - Zero modification writer in pg_proc.
 * - Zero financial or payment side effects.
 * - Test Matrix Cases A through P.
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
import {
  issueCancellationAuthorization,
  requestReservationCancellation,
} from '../../src/services/canonicalLifecycleService.js';
import {
  assertCancellationIssuerRole,
  assertCancellationExecutorRole,
  issueCancellationDecisionAuthorization,
  completeReservationCancellation,
  getCancellationRelease,
  CancellationCompletionError,
} from '../../src/services/canonicalCancellationCompletionService.js';
import {addDays, createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.js';

const toDateStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const safeAddDays = (d, count) => addDays(toDateStr(d), count);

test('W4-C2 version-aware canonical cancellation compatibility verification', async () => {
  // =========================================================================
  // 1. VERIFY EXACT CANONICAL BASE & ENVIRONMENT
  // =========================================================================
  const expectedCanonicalBase = '089b0effd601d9ed3e559b168f6e370a3097e09c';
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

  const migration058Path = path.resolve('src/migrations/058_version_aware_cancellation_release.sql');
  assert.equal(
    fs.existsSync(migration058Path),
    true,
    'EVIDENCE_INCOMPLETE: migration 058 must exist in src/migrations'
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

    // Apply W4-C1 revision model
    await applyIsolatedMigration(fixture.owner, '057_canonical_reservation_revision_model.sql');

    // Apply W4-C2 version-aware cancellation migration 058
    await applyIsolatedMigration(fixture.owner, '058_version_aware_cancellation_release.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer'});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker'});
    cancellationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_issuer'});
    cancellationExecutor = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_executor'});

    await assertCancellationIssuerRole(cancellationIssuer);
    await assertCancellationExecutorRole(cancellationExecutor);

    // Seed ample inventory days for roomTypeId 101 (listing 1)
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 101, $1::date + n, 10
       FROM generate_series(0, 100) AS n
       ON CONFLICT (room_type_id, calendar_date) DO UPDATE SET total_units = 10`,
      [fixture.today]
    );

    // Establish base accepted offer
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
      stayEnd: addDays(fixture.today, 100),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 100 * 86400000).toISOString(),
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
    const offerId = draft.offerId;

    let dayOffset = 5;

    // Helper: Create committed canonical reservation
    const createCommittedRes = async (nights = 2) => {
      const checkIn = addDays(fixture.today, dayOffset);
      const checkOut = addDays(fixture.today, dayOffset + nights);
      dayOffset += nights + 3;

      const quote = await createItineraryQuote(
        stays,
        {
          offerId,
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
      await fixture.owner.query(
        `INSERT INTO canonical_payable_authorities (
          id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
        ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', repeat('a', 64), 'APPROVED')`,
        [payableId, quote.id, roomSubtotalPaise]
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
      assert.equal(compRes.compositionState, 'COMMITTED');

      return {
        reservationId: compRes.reservationId,
        checkIn,
        checkOut,
        nights,
      };
    };

    // Helper: Transition reservation to CANCELLATION_REQUESTED
    const requestCancel = async (reservationId) => {
      const cancelCmdId = randomUUID();
      const auth = await issueCancellationAuthorization(lifecycleIssuer, {
        reservationId,
        commandId: cancelCmdId,
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest requested cancellation',
        authenticatedPrincipal: 'user:10',
      });

      const transitionRes = await requestReservationCancellation(lifecycleWorker, {
        authorizationId: auth.authorizationId,
        commandId: cancelCmdId,
        reservationId,
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest requested cancellation',
      });
      assert.equal(transitionRes.lifecycleState, 'CANCELLATION_REQUESTED');

      return {
        cancelCmdId,
        requestEventId: transitionRes.eventId,
      };
    };

    // =========================================================================
    // CASE A & CASE K & CASE L: V1 CANCELLATION POSITIVE CONTROL
    // V1 cancellation releases version 1 original nights.
    // Assert released_effective_version = 1, released_revision_id = NULL.
    // =========================================================================
    const resA = await createCommittedRes(2);
    const cancelReqA = await requestCancel(resA.reservationId);

    const v1NightsA = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date, units
         FROM canonical_reservation_nights
         WHERE reservation_id = $1
         ORDER BY stay_date ASC`,
        [resA.reservationId]
      )
    ).rows;
    assert.equal(v1NightsA.length, 2);

    // Initial inventory booked_units before cancellation
    const invA1Before = (
      await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsA[0].inventory_day_id])
    ).rows[0].booked_units;
    const invA2Before = (
      await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsA[1].inventory_day_id])
    ).rows[0].booked_units;

    const compCmdA = randomUUID();
    const decAuthA = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resA.reservationId,
      requestEventId: cancelReqA.requestEventId,
      commandId: compCmdA,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved V1 cancellation',
    });

    const completeResA = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthA.authorizationId,
      commandId: compCmdA,
      reservationId: resA.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved V1 cancellation',
    });

    assert.equal(completeResA.lifecycleState, 'CANCELLED');
    assert.equal(completeResA.replayed, false);

    // Verify inventory decrement
    const invA1After = (
      await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsA[0].inventory_day_id])
    ).rows[0].booked_units;
    const invA2After = (
      await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsA[1].inventory_day_id])
    ).rows[0].booked_units;
    assert.equal(invA1After, invA1Before - 1, 'Day 1 booked_units decremented by 1');
    assert.equal(invA2After, invA2Before - 1, 'Day 2 booked_units decremented by 1');

    // Case K (V1): Release header version evidence
    const releaseHeaderA = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_cancellation_inventory_releases WHERE release_id = $1`,
        [completeResA.releaseId]
      )
    ).rows[0];
    assert.equal(releaseHeaderA.released_effective_version, 1, 'V1 release header has released_effective_version = 1');
    assert.equal(releaseHeaderA.released_revision_id, null, 'V1 release header has released_revision_id = NULL');

    // Case L (V1): Release night evidence
    const releaseNightsA = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_cancellation_release_nights WHERE release_id = $1 ORDER BY stay_date ASC`,
        [completeResA.releaseId]
      )
    ).rows;
    assert.equal(releaseNightsA.length, 2, 'V1 release has 2 release nights');
    assert.equal(releaseNightsA[0].room_type_id, 101, 'V1 release night has room_type_id = 101');
    assert.equal(releaseNightsA[0].released_units, 1, 'V1 release night has released_units = 1');
    assert.equal(releaseNightsA[0].inventory_day_id, v1NightsA[0].inventory_day_id);
    assert.equal(releaseNightsA[1].inventory_day_id, v1NightsA[1].inventory_day_id);

    // Cancelled event metadata
    const cancelledEventA = (
      await fixture.owner.query(
        `SELECT metadata FROM canonical_reservation_events WHERE event_id = $1`,
        [completeResA.eventId]
      )
    ).rows[0];
    assert.equal(cancelledEventA.metadata.released_effective_version, 1);
    assert.equal(cancelledEventA.metadata.released_revision_id, null);

    // Query helper backward-compatibility check
    const queryHelperA = await getCancellationRelease(cancellationExecutor, resA.reservationId);
    assert.ok(queryHelperA);
    assert.equal(queryHelperA.totalNightsReleased, 2);
    assert.equal(queryHelperA.totalUnitsReleased, 2);

    // =========================================================================
    // CASES B, C, D, E: V2 CANCELLATION POSITIVE CONTROL
    // Material difference fixture:
    // V1: day 1, day 2 (2 nights)
    // V2: day 2 (UNCHANGED), day 3 (NEW_ONLY), day 4 (NEW_ONLY) -> 3 nights.
    // day 1 is OLD_ONLY.
    // Assert:
    // - released_effective_version = 2
    // - released_revision_id = V2 revision ID
    // - V2 snapshot nights decremented
    // - OLD_ONLY day 1 is NOT decremented
    // - UNCHANGED day 2 decremented once
    // - NEW_ONLY day 3, 4 decremented
    // =========================================================================
    const resB = await createCommittedRes(2);
    const v1NightsB = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date::text AS stay_date, units
         FROM canonical_reservation_nights
         WHERE reservation_id = $1
         ORDER BY stay_date ASC`,
        [resB.reservationId]
      )
    ).rows;
    assert.equal(v1NightsB.length, 2);
    const day1OldOnly = v1NightsB[0];
    const day2Unchanged = v1NightsB[1];

    // Identify day 3 and day 4 inventory days
    const day3Date = safeAddDays(day2Unchanged.stay_date, 1);
    const day4Date = safeAddDays(day2Unchanged.stay_date, 2);
    const day3Inv = (
      await fixture.owner.query(
        `SELECT id, calendar_date::text AS calendar_date, booked_units FROM inventory_days
         WHERE room_type_id = 101 AND calendar_date = $1`,
        [day3Date]
      )
    ).rows[0];
    const day4Inv = (
      await fixture.owner.query(
        `SELECT id, calendar_date::text AS calendar_date, booked_units FROM inventory_days
         WHERE room_type_id = 101 AND calendar_date = $1`,
        [day4Date]
      )
    ).rows[0];

    // Structurally assemble valid V2 revision (3 nights: day2, day3, day4)
    const v2HeaderId = randomUUID();
    const v2CheckIn = day2Unchanged.stay_date;
    const v2CheckOut = safeAddDays(day4Date, 1);
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $3, 1, $4, $5, 3, 2, 825000, 'INR')`,
      [v2HeaderId, resB.reservationId, offerId, v2CheckIn, v2CheckOut]
    );

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES
        ($1, $2, $3, $4, 101, 1),
        ($1, $2, $5, $6, 101, 1),
        ($1, $2, $7, $8, 101, 1)`,
      [
        v2HeaderId,
        resB.reservationId,
        day2Unchanged.inventory_day_id,
        day2Unchanged.stay_date,
        day3Inv.id,
        day3Date,
        day4Inv.id,
        day4Date,
      ]
    );

    // Seal V2 revision
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v2HeaderId, resB.reservationId]
    );

    // Verify V2 is now current effective revision
    const effV2 = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_effective_revisions WHERE reservation_id = $1`,
        [resB.reservationId]
      )
    ).rows[0];
    assert.equal(effV2.effective_version, 2);
    assert.equal(effV2.effective_revision_id, v2HeaderId);

    // Simulate hypothetical post-modification physical inventory state (Owner Test Fixture Setup):
    // 1. OLD_ONLY day 1: was booked by V1, decremented to reflect hypothetical post-mod state
    await fixture.owner.query(`UPDATE inventory_days SET booked_units = booked_units - 1 WHERE id = $1`, [day1OldOnly.inventory_day_id]);
    // 2. UNCHANGED day 2: stays booked (booked_units unchanged)
    // 3. NEW_ONLY day 3, 4: incremented to reflect hypothetical post-mod booking
    await fixture.owner.query(`UPDATE inventory_days SET booked_units = booked_units + 1 WHERE id = $1`, [day3Inv.id]);
    await fixture.owner.query(`UPDATE inventory_days SET booked_units = booked_units + 1 WHERE id = $1`, [day4Inv.id]);

    // Record inventory levels immediately prior to cancellation
    const day1BookedBeforeCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day1OldOnly.inventory_day_id])).rows[0].booked_units;
    const day2BookedBeforeCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day2Unchanged.inventory_day_id])).rows[0].booked_units;
    const day3BookedBeforeCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day3Inv.id])).rows[0].booked_units;
    const day4BookedBeforeCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day4Inv.id])).rows[0].booked_units;

    // Transition reservation to CANCELLATION_REQUESTED
    const cancelReqB = await requestCancel(resB.reservationId);

    const compCmdB = randomUUID();
    const decAuthB = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resB.reservationId,
      requestEventId: cancelReqB.requestEventId,
      commandId: compCmdB,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved V2 cancellation',
    });

    const completeResB = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthB.authorizationId,
      commandId: compCmdB,
      reservationId: resB.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved V2 cancellation',
    });

    assert.equal(completeResB.lifecycleState, 'CANCELLED');
    assert.equal(completeResB.replayed, false);

    // Case C: OLD_ONLY V1 inventory is NOT re-released
    const day1BookedAfterCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day1OldOnly.inventory_day_id])).rows[0].booked_units;
    assert.equal(day1BookedAfterCancel, day1BookedBeforeCancel, 'OLD_ONLY V1 day was NOT decremented by V2 cancellation');

    // Case E: UNCHANGED V2 allocation is released once
    const day2BookedAfterCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day2Unchanged.inventory_day_id])).rows[0].booked_units;
    assert.equal(day2BookedAfterCancel, day2BookedBeforeCancel - 1, 'UNCHANGED day decremented exactly once');

    // Case D: NEW_ONLY V2 inventory is released
    const day3BookedAfterCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day3Inv.id])).rows[0].booked_units;
    const day4BookedAfterCancel = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day4Inv.id])).rows[0].booked_units;
    assert.equal(day3BookedAfterCancel, day3BookedBeforeCancel - 1, 'NEW_ONLY day 3 decremented by 1');
    assert.equal(day4BookedAfterCancel, day4BookedBeforeCancel - 1, 'NEW_ONLY day 4 decremented by 1');

    // Case K (V2): Release header stores exact effective version/revision evidence
    const releaseHeaderB = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_cancellation_inventory_releases WHERE release_id = $1`,
        [completeResB.releaseId]
      )
    ).rows[0];
    assert.equal(releaseHeaderB.released_effective_version, 2, 'released_effective_version is 2');
    assert.equal(releaseHeaderB.released_revision_id, v2HeaderId, 'released_revision_id is exact V2 revision ID');

    // Case L (V2): Release nights evidence stores exact units, room_type_id, and inventory identity
    const releaseNightsB = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_cancellation_release_nights WHERE release_id = $1 ORDER BY stay_date ASC`,
        [completeResB.releaseId]
      )
    ).rows;
    assert.equal(releaseNightsB.length, 3, 'Exactly 3 release night rows for 3-night V2');
    assert.deepEqual(
      releaseNightsB.map(r => r.inventory_day_id),
      [day2Unchanged.inventory_day_id, day3Inv.id, day4Inv.id],
      'Release night inventory days match V2 snapshot'
    );
    assert.deepEqual(
      releaseNightsB.map(r => r.released_units),
      [1, 1, 1],
      'Released units match V2 snapshot'
    );
    assert.deepEqual(
      releaseNightsB.map(r => r.room_type_id),
      [101, 101, 101],
      'Room type ID matches V2 revision'
    );

    // =========================================================================
    // CASE J: V2 EXACT REPLAY DOES NOT RE-RELEASE INVENTORY
    // =========================================================================
    const replayResB = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthB.authorizationId,
      commandId: compCmdB,
      reservationId: resB.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved V2 cancellation',
    });
    assert.equal(replayResB.replayed, true, 'Replay returns replayed = true');
    assert.equal(replayResB.eventId, completeResB.eventId);
    assert.equal(replayResB.releaseId, completeResB.releaseId);
    assert.equal(replayResB.sequenceNumber, completeResB.sequenceNumber);

    // Verify inventory completely unchanged on replay
    const day1BookedReplay = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day1OldOnly.inventory_day_id])).rows[0].booked_units;
    const day2BookedReplay = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day2Unchanged.inventory_day_id])).rows[0].booked_units;
    const day3BookedReplay = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day3Inv.id])).rows[0].booked_units;
    const day4BookedReplay = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [day4Inv.id])).rows[0].booked_units;
    assert.equal(day1BookedReplay, day1BookedAfterCancel);
    assert.equal(day2BookedReplay, day2BookedAfterCancel);
    assert.equal(day3BookedReplay, day3BookedAfterCancel);
    assert.equal(day4BookedReplay, day4BookedAfterCancel);

    // =========================================================================
    // CASE F: MULTI-UNIT RELEASE (units > 1)
    // V2 revision with units = 2 on a night:
    // Assert cancellation decrements exactly 2, and release evidence says 2.
    // =========================================================================
    const resF = await createCommittedRes(2);
    const v1NightsF = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date::text AS stay_date, units
         FROM canonical_reservation_nights
         WHERE reservation_id = $1
         ORDER BY stay_date ASC`,
        [resF.reservationId]
      )
    ).rows;

    const v2HeaderF = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $3, 1, $4, $5, 2, 4, 1100000, 'INR')`,
      [v2HeaderF, resF.reservationId, offerId, v1NightsF[0].stay_date, safeAddDays(v1NightsF[1].stay_date, 1)]
    );

    // Night 0 has units = 2, Night 1 has units = 1
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES
        ($1, $2, $3, $4, 101, 2),
        ($1, $2, $5, $6, 101, 1)`,
      [
        v2HeaderF,
        resF.reservationId,
        v1NightsF[0].inventory_day_id,
        v1NightsF[0].stay_date,
        v1NightsF[1].inventory_day_id,
        v1NightsF[1].stay_date,
      ]
    );

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v2HeaderF, resF.reservationId]
    );

    // Simulate post-modification physical inventory for Night 0: needs 2 booked units
    // V1 booked 1 unit, so add 1 more to simulate 2 booked units total
    await fixture.owner.query(`UPDATE inventory_days SET booked_units = booked_units + 1 WHERE id = $1`, [v1NightsF[0].inventory_day_id]);

    const fNight0BookedBefore = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsF[0].inventory_day_id])).rows[0].booked_units;
    const fNight1BookedBefore = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsF[1].inventory_day_id])).rows[0].booked_units;

    const cancelReqF = await requestCancel(resF.reservationId);
    const compCmdF = randomUUID();
    const decAuthF = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resF.reservationId,
      requestEventId: cancelReqF.requestEventId,
      commandId: compCmdF,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved multi-unit V2 cancellation',
    });

    const completeResF = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthF.authorizationId,
      commandId: compCmdF,
      reservationId: resF.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved multi-unit V2 cancellation',
    });

    const fNight0BookedAfter = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsF[0].inventory_day_id])).rows[0].booked_units;
    const fNight1BookedAfter = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsF[1].inventory_day_id])).rows[0].booked_units;
    assert.equal(fNight0BookedAfter, fNight0BookedBefore - 2, 'Night 0 with units=2 decremented by exactly 2');
    assert.equal(fNight1BookedAfter, fNight1BookedBefore - 1, 'Night 1 with units=1 decremented by exactly 1');

    const releaseNightsF = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_cancellation_release_nights WHERE release_id = $1 ORDER BY stay_date ASC`,
        [completeResF.releaseId]
      )
    ).rows;
    assert.equal(releaseNightsF[0].released_units, 2, 'Release night evidence reflects exactly 2 units');
    assert.equal(releaseNightsF[1].released_units, 1, 'Release night evidence reflects exactly 1 unit');

    // =========================================================================
    // CASE G: SEALED V2 + UNSEALED V3 RELEASES V2
    // Fixture:
    // sealed V2 (version 2)
    // unsealed V3 (version 3, assembling)
    // Cancellation must release V2, ignoring V3 completely.
    // =========================================================================
    const resG = await createCommittedRes(2);
    const v1NightsG = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date::text AS stay_date, units
         FROM canonical_reservation_nights
         WHERE reservation_id = $1
         ORDER BY stay_date ASC`,
        [resG.reservationId]
      )
    ).rows;

    // Sealed V2
    const v2HeaderG = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $3, 1, $4, $5, 2, 2, 550000, 'INR')`,
      [v2HeaderG, resG.reservationId, offerId, v1NightsG[0].stay_date, safeAddDays(v1NightsG[1].stay_date, 1)]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES
        ($1, $2, $3, $4, 101, 1),
        ($1, $2, $5, $6, 101, 1)`,
      [v2HeaderG, resG.reservationId, v1NightsG[0].inventory_day_id, v1NightsG[0].stay_date, v1NightsG[1].inventory_day_id, v1NightsG[1].stay_date]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v2HeaderG, resG.reservationId]
    );

    // Unsealed V3 (version 3) on DIFFERENT future dates
    const v3Day1 = safeAddDays(fixture.today, 80);
    const v3Day2 = safeAddDays(fixture.today, 81);
    const v3Inv1 = (await fixture.owner.query(`SELECT id FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`, [v3Day1])).rows[0];
    const v3Inv2 = (await fixture.owner.query(`SELECT id FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`, [v3Day2])).rows[0];

    const v3HeaderG = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 3, 101, $3, 1, $4, $5, 2, 2, 550000, 'INR')`,
      [v3HeaderG, resG.reservationId, offerId, v3Day1, safeAddDays(v3Day2, 1)]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES
        ($1, $2, $3, $4, 101, 1),
        ($1, $2, $5, $6, 101, 1)`,
      [v3HeaderG, resG.reservationId, v3Inv1.id, v3Day1, v3Inv2.id, v3Day2]
    );
    // DO NOT SEAL V3!

    const cancelReqG = await requestCancel(resG.reservationId);
    const compCmdG = randomUUID();
    const decAuthG = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resG.reservationId,
      requestEventId: cancelReqG.requestEventId,
      commandId: compCmdG,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved sealed V2 with unsealed V3 cancellation',
    });

    const completeResG = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthG.authorizationId,
      commandId: compCmdG,
      reservationId: resG.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved sealed V2 with unsealed V3 cancellation',
    });

    const releaseHeaderG = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_cancellation_inventory_releases WHERE release_id = $1`,
        [completeResG.releaseId]
      )
    ).rows[0];
    assert.equal(releaseHeaderG.released_effective_version, 2, 'Unsealed V3 ignored; released version is 2');
    assert.equal(releaseHeaderG.released_revision_id, v2HeaderG, 'Released revision is V2 revision ID');

    // =========================================================================
    // CASE H: HIGHEST SEALED REVISION SELECTED (SEALED V2 + SEALED V3 RELEASES V3)
    // =========================================================================
    const resH = await createCommittedRes(2);
    const v1NightsH = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date::text AS stay_date, units
         FROM canonical_reservation_nights
         WHERE reservation_id = $1
         ORDER BY stay_date ASC`,
        [resH.reservationId]
      )
    ).rows;

    // Sealed V2
    const v2HeaderH = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $3, 1, $4, $5, 2, 2, 550000, 'INR')`,
      [v2HeaderH, resH.reservationId, offerId, v1NightsH[0].stay_date, safeAddDays(v1NightsH[1].stay_date, 1)]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES
        ($1, $2, $3, $4, 101, 1),
        ($1, $2, $5, $6, 101, 1)`,
      [v2HeaderH, resH.reservationId, v1NightsH[0].inventory_day_id, v1NightsH[0].stay_date, v1NightsH[1].inventory_day_id, v1NightsH[1].stay_date]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v2HeaderH, resH.reservationId]
    );

    // Sealed V3 on different dates
    const v3Day1H = safeAddDays(fixture.today, 85);
    const v3Day2H = safeAddDays(fixture.today, 86);
    const v3Inv1H = (await fixture.owner.query(`SELECT id FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`, [v3Day1H])).rows[0];
    const v3Inv2H = (await fixture.owner.query(`SELECT id FROM inventory_days WHERE room_type_id = 101 AND calendar_date = $1`, [v3Day2H])).rows[0];

    const v3HeaderH = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 3, 101, $3, 1, $4, $5, 2, 2, 550000, 'INR')`,
      [v3HeaderH, resH.reservationId, offerId, v3Day1H, safeAddDays(v3Day2H, 1)]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES
        ($1, $2, $3, $4, 101, 1),
        ($1, $2, $5, $6, 101, 1)`,
      [v3HeaderH, resH.reservationId, v3Inv1H.id, v3Day1H, v3Inv2H.id, v3Day2H]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v3HeaderH, resH.reservationId]
    );

    // Adjust test inventory to reflect V3 physical booking
    await fixture.owner.query(`UPDATE inventory_days SET booked_units = booked_units + 1 WHERE id IN ($1, $2)`, [v3Inv1H.id, v3Inv2H.id]);

    const cancelReqH = await requestCancel(resH.reservationId);
    const compCmdH = randomUUID();
    const decAuthH = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resH.reservationId,
      requestEventId: cancelReqH.requestEventId,
      commandId: compCmdH,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved sealed V3 cancellation',
    });

    const completeResH = await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthH.authorizationId,
      commandId: compCmdH,
      reservationId: resH.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved sealed V3 cancellation',
    });

    const releaseHeaderH = (
      await fixture.owner.query(
        `SELECT * FROM canonical_reservation_cancellation_inventory_releases WHERE release_id = $1`,
        [completeResH.releaseId]
      )
    ).rows[0];
    assert.equal(releaseHeaderH.released_effective_version, 3, 'Highest sealed revision V3 selected');
    assert.equal(releaseHeaderH.released_revision_id, v3HeaderH, 'Released revision is V3 revision ID');

    // =========================================================================
    // CASE I: V2 LATER-NIGHT UNDERFLOW ROLLS BACK ENTIRE CANCELLATION
    // Night 1 has sufficient booked_units, but Night 2 has insufficient booked_units.
    // Assert all-or-nothing rollback.
    // =========================================================================
    const resI = await createCommittedRes(2);
    const v1NightsI = (
      await fixture.owner.query(
        `SELECT inventory_day_id, stay_date::text AS stay_date, units
         FROM canonical_reservation_nights
         WHERE reservation_id = $1
         ORDER BY stay_date ASC`,
        [resI.reservationId]
      )
    ).rows;

    const v2HeaderI = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $3, 1, $4, $5, 2, 2, 550000, 'INR')`,
      [v2HeaderI, resI.reservationId, offerId, v1NightsI[0].stay_date, safeAddDays(v1NightsI[1].stay_date, 1)]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) VALUES
        ($1, $2, $3, $4, 101, 1),
        ($1, $2, $5, $6, 101, 1)`,
      [v2HeaderI, resI.reservationId, v1NightsI[0].inventory_day_id, v1NightsI[0].stay_date, v1NightsI[1].inventory_day_id, v1NightsI[1].stay_date]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v2HeaderI, resI.reservationId]
    );

    // Intentionally drain Night 2 booked_units to 0 (underflow condition!)
    await fixture.owner.query(`UPDATE inventory_days SET booked_units = 0 WHERE id = $1`, [v1NightsI[1].inventory_day_id]);

    const night1BookedBefore = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsI[0].inventory_day_id])).rows[0].booked_units;
    assert.ok(night1BookedBefore >= 1, 'Night 1 has sufficient booked units');

    const cancelReqI = await requestCancel(resI.reservationId);
    const compCmdI = randomUUID();
    const decAuthI = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resI.reservationId,
      requestEventId: cancelReqI.requestEventId,
      commandId: compCmdI,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Underflow test',
    });

    await assert.rejects(
      async () => {
        await completeReservationCancellation(cancellationExecutor, {
          authorizationId: decAuthI.authorizationId,
          commandId: compCmdI,
          reservationId: resI.reservationId,
          reasonCode: 'GUEST_CANCEL_APPROVED',
          reasonText: 'Underflow test',
        });
      },
      (err) => {
        return err instanceof CancellationCompletionError && err.code === 'INVENTORY_RELEASE_UNDERFLOW';
      },
      'Underflow must abort cancellation execution'
    );

    // Verify atomic rollback: Night 1 booked_units was NOT decremented!
    const night1BookedAfter = (await fixture.owner.query(`SELECT booked_units FROM inventory_days WHERE id = $1`, [v1NightsI[0].inventory_day_id])).rows[0].booked_units;
    assert.equal(night1BookedAfter, night1BookedBefore, 'Night 1 decrement rolled back completely');

    // No release header persisted
    const releaseCountI = (
      await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`,
        [resI.reservationId]
      )
    ).rows[0].count;
    assert.equal(releaseCountI, 0, 'Zero release headers persisted');

    // No release nights persisted
    const releaseNightsCountI = (
      await fixture.owner.query(
        `SELECT count(*)::int AS count FROM canonical_reservation_cancellation_release_nights WHERE reservation_id = $1`,
        [resI.reservationId]
      )
    ).rows[0].count;
    assert.equal(releaseNightsCountI, 0, 'Zero release night rows persisted');

    // Authorization unconsumed
    const authRowI = (
      await fixture.owner.query(
        `SELECT consumed_at FROM canonical_reservation_cancellation_authorizations WHERE authorization_id = $1`,
        [decAuthI.authorizationId]
      )
    ).rows[0];
    assert.equal(authRowI.consumed_at, null, 'Authorization remains unconsumed after rollback');

    // Lifecycle state remains CANCELLATION_REQUESTED
    const latestEventI = (
      await fixture.owner.query(
        `SELECT event_type FROM canonical_reservation_events WHERE reservation_id = $1 ORDER BY sequence_number DESC LIMIT 1`,
        [resI.reservationId]
      )
    ).rows[0];
    assert.equal(latestEventI.event_type, 'CANCELLATION_REQUESTED', 'Lifecycle state remains CANCELLATION_REQUESTED');

    // =========================================================================
    // CASE M: REVISION AND SEAL ROWS REMAIN UNTOUCHED BY CANCELLATION
    // =========================================================================
    const revCountBefore = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_reservation_revisions`)).rows[0].count;
    const sealCountBefore = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_reservation_revision_seals`)).rows[0].count;
    const revNightsCountBefore = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_reservation_revision_nights`)).rows[0].count;

    // Perform another valid cancellation
    const resM = await createCommittedRes(2);
    const cancelReqM = await requestCancel(resM.reservationId);
    const compCmdM = randomUUID();
    const decAuthM = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resM.reservationId,
      requestEventId: cancelReqM.requestEventId,
      commandId: compCmdM,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Case M test',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthM.authorizationId,
      commandId: compCmdM,
      reservationId: resM.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Case M test',
    });

    const revCountAfter = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_reservation_revisions`)).rows[0].count;
    const sealCountAfter = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_reservation_revision_seals`)).rows[0].count;
    const revNightsCountAfter = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_reservation_revision_nights`)).rows[0].count;

    assert.equal(revCountAfter, revCountBefore, 'Revision count unchanged by cancellation');
    assert.equal(sealCountAfter, sealCountBefore, 'Seal count unchanged by cancellation');
    assert.equal(revNightsCountAfter, revNightsCountBefore, 'Revision nights count unchanged by cancellation');

    // =========================================================================
    // CASE N: CANCELLATION EXECUTOR HAS NO V2 ASSEMBLY / SEAL PRIVILEGES
    // =========================================================================
    const executorCanInsertRev = (
      await fixture.owner.query(
        `SELECT has_table_privilege('encho_cancellation_executor', 'public.canonical_reservation_revisions', 'INSERT') AS p`
      )
    ).rows[0].p;
    assert.equal(executorCanInsertRev, false, 'cancellation_executor must NOT have INSERT on canonical_reservation_revisions');

    const executorCanInsertSeal = (
      await fixture.owner.query(
        `SELECT has_table_privilege('encho_cancellation_executor', 'public.canonical_reservation_revision_seals', 'INSERT') AS p`
      )
    ).rows[0].p;
    assert.equal(executorCanInsertSeal, false, 'cancellation_executor must NOT have INSERT on canonical_reservation_revision_seals');

    const executorCanInsertRevNights = (
      await fixture.owner.query(
        `SELECT has_table_privilege('encho_cancellation_executor', 'public.canonical_reservation_revision_nights', 'INSERT') AS p`
      )
    ).rows[0].p;
    assert.equal(executorCanInsertRevNights, false, 'cancellation_executor must NOT have INSERT on canonical_reservation_revision_nights');

    // Attempting direct insert as cancellation executor must fail
    await assert.rejects(
      async () => {
        await cancellationExecutor.query(
          `INSERT INTO canonical_reservation_revisions (id, reservation_id, version, room_type_id, offer_id, offer_revision,
             check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency)
           VALUES ($1, $2, 2, 101, $3, 1, '2026-11-01', '2026-11-03', 2, 2, 500000, 'INR')`,
          [randomUUID(), resA.reservationId, offerId]
        );
      },
      /permission denied/,
      'Direct insertion by cancellation executor must be denied'
    );

    // =========================================================================
    // CASE O: ZERO MODIFICATION WRITER IN PG_PROC
    // =========================================================================
    const modificationProcs = (
      await fixture.owner.query(
        `SELECT proname FROM pg_proc
         WHERE proname ~* '(modify_reservation|replace_reservation_inventory|update_reservation_allocation|assemble_reservation_revision)'`
      )
    ).rows;
    assert.equal(
      modificationProcs.length,
      0,
      `Zero modification writers must exist in pg_proc, found: ${JSON.stringify(modificationProcs)}`
    );

    // Additionally verify no procedure exists that writes to revision tables
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
             'canonical_get_effective_reservation_allocation',
             'canonical_complete_reservation_cancellation'
           )`
      )
    ).rows;
    assert.equal(
      candidateProcs.length,
      0,
      `No procedure exists that writes to revision tables: zero canonical modification writer, found: ${JSON.stringify(candidateProcs)}`
    );

    // =========================================================================
    // CASE P: ZERO FINANCIAL OR PAYMENT SIDE EFFECTS
    // =========================================================================
    const paymentAttemptsBefore = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_payment_attempts`)).rows[0].count;
    const payablesBefore = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_payable_authorities`)).rows[0].count;

    const resP = await createCommittedRes(2);
    const cancelReqP = await requestCancel(resP.reservationId);
    const compCmdP = randomUUID();
    const decAuthP = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resP.reservationId,
      requestEventId: cancelReqP.requestEventId,
      commandId: compCmdP,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Financial side effect check',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthP.authorizationId,
      commandId: compCmdP,
      reservationId: resP.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Financial side effect check',
    });

    const paymentAttemptsAfter = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_payment_attempts`)).rows[0].count;
    const payablesAfter = (await fixture.owner.query(`SELECT count(*)::int AS count FROM canonical_payable_authorities`)).rows[0].count;

    // Exactly 1 new payment attempt and payable was created for createCommittedRes, ZERO for cancellation!
    assert.equal(paymentAttemptsAfter, paymentAttemptsBefore + 1, 'Cancellation does not create payment attempts');
    assert.equal(payablesAfter, payablesBefore + 1, 'Cancellation does not create payable authorities');

    // =========================================================================
    // CASE Q: RELEASE EVIDENCE IMMUTABILITY
    // Updates/deletes to release header and release nights must be rejected
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `UPDATE canonical_reservation_cancellation_inventory_releases
           SET released_effective_version = 99
           WHERE release_id = $1`,
          [completeResA.releaseId]
        );
      },
      /CANONICAL_CANCELLATION_RELEASE_IMMUTABLE/,
      'Release header must be immutable'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `UPDATE canonical_reservation_cancellation_release_nights
           SET released_units = 99
           WHERE release_id = $1`,
          [completeResA.releaseId]
        );
      },
      /CANONICAL_RELEASE_NIGHT_IMMUTABLE/,
      'Release nights must be immutable'
    );

    // =========================================================================
    // CASE R: STRUCTURAL CONSTRAINTS ON RELEASE HEADER
    // chk_cancellation_release_version_revision:
    // (version = 1 AND revision_id IS NULL) OR (version >= 2 AND revision_id IS NOT NULL)
    // =========================================================================
    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_cancellation_inventory_releases (
             release_id, reservation_id, event_id, command_id, authorization_id,
             release_fingerprint, released_effective_version, released_revision_id
           ) VALUES (
             gen_random_uuid(), $1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
             repeat('e', 64), 1, gen_random_uuid()
           )`,
          [resP.reservationId]
        );
      },
      /chk_cancellation_release_version_revision/,
      'Version 1 with non-null revision_id must be rejected by check constraint'
    );

    await assert.rejects(
      async () => {
        await fixture.owner.query(
          `INSERT INTO canonical_reservation_cancellation_inventory_releases (
             release_id, reservation_id, event_id, command_id, authorization_id,
             release_fingerprint, released_effective_version, released_revision_id
           ) VALUES (
             gen_random_uuid(), $1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
             repeat('e', 64), 2, NULL
           )`,
          [resP.reservationId]
        );
      },
      /chk_cancellation_release_version_revision/,
      'Version >= 2 with null revision_id must be rejected by check constraint'
    );

  } finally {
    await Promise.allSettled([
      stays?.end(),
      reservationWorker?.end(),
      paymentWorker?.end(),
      compositionWorker?.end(),
      lifecycleIssuer?.end(),
      lifecycleWorker?.end(),
      cancellationIssuer?.end(),
      cancellationExecutor?.end(),
    ]);
    await fixture?.close();
  }
});
