/**
 * ENCHO W4-C3 Focused Test Suite:
 * Canonical Pending Modification Request Authority.
 *
 * Verifies:
 * - Matrix Cases A through AC.
 * - Active Encho Direct reservation bound to immutable target quote.
 * - Replay semantics: exact return before mutable gates.
 * - Wall-clock quote expiry after lock wait.
 * - Role isolation: encho_modification_issuer function-only access.
 * - Zero inventory mutation, zero holds, zero financial adjustments.
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
} from '../../src/services/canonicalCancellationCompletionService.js';
import {addDays, createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.js';

const toDateStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const safeAddDays = (d, count) => addDays(toDateStr(d), count);

test('W4-C3 canonical pending modification request authority verification', async () => {
  // =========================================================================
  // 1. VERIFY EXACT CANONICAL BASE & ENVIRONMENT
  // =========================================================================
  const expectedCanonicalBase = 'affc14b185dedb3d54a3c414876f98f0f3e85061';
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

  const migration059Path = path.resolve('src/migrations/059_canonical_reservation_modification_request.sql');
  assert.equal(
    fs.existsSync(migration059Path),
    true,
    'EVIDENCE_INCOMPLETE: migration 059 must exist in src/migrations'
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
  let modificationIssuer;

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
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '052_canonical_reservation_hold_finalization.sql');
    await fixture.owner.query(`CREATE ROLE encho_payment_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '053_canonical_payment_evidence_and_reconciliation.sql');
    await fixture.owner.query(`CREATE ROLE encho_composition_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '054_canonical_payment_reservation_composition.sql');

    // Provision lifecycle roles for W4-A
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
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

    // Provision modification issuer role for W4-C3
    await fixture.owner.query(`CREATE ROLE encho_modification_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);

    // Apply W4-C3 migration 059
    await applyIsolatedMigration(fixture.owner, '059_canonical_reservation_modification_request.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer'});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker'});
    cancellationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_issuer'});
    cancellationExecutor = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_executor'});
    modificationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_modification_issuer'});

    await assertCancellationIssuerRole(cancellationIssuer);
    await assertCancellationExecutorRole(cancellationExecutor);

    // Seed ample inventory days for listing 1 (room 101 and 102)
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 101, $1::date + n, 10
       FROM generate_series(0, 100) AS n
       ON CONFLICT (room_type_id, calendar_date) DO UPDATE SET total_units = 10`,
      [fixture.today]
    );

    // Seed a second room type for listing 1
    await fixture.owner.query(
      `INSERT INTO room_types(id, listing_id, name, max_occupancy, base_price)
       VALUES (102, 1, 'Deluxe Suite', 2, 600000)
       ON CONFLICT (id) DO NOTHING`
    );
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 102, $1::date + n, 10
       FROM generate_series(0, 100) AS n
       ON CONFLICT (room_type_id, calendar_date) DO UPDATE SET total_units = 10`,
      [fixture.today]
    );

    // Seed a second listing and room type (for testing listing mismatch)
    await fixture.owner.query(
      `INSERT INTO listings(id, user_id, title, slug, publication_status, price, currency)
       VALUES (2, 10, 'Listing Two', 'listing-two', 'published', 7000, 'INR')
       ON CONFLICT (id) DO NOTHING`
    );
    await fixture.owner.query(
      `INSERT INTO room_types(id, listing_id, name, max_occupancy, base_price)
       VALUES (201, 2, 'Cabin', 2, 700000)
       ON CONFLICT (id) DO NOTHING`
    );
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 2, 201, $1::date + n, 10
       FROM generate_series(0, 100) AS n
       ON CONFLICT (room_type_id, calendar_date) DO UPDATE SET total_units = 10`,
      [fixture.today]
    );

    // Seed media assets for room 101 and 102 and 201 to make them sellable
    for (const [rt, lst] of [[101, 1], [102, 1], [201, 2]]) {
      for (let i = 1; i <= 3; i++) {
        await fixture.owner.query(
          `INSERT INTO media_assets(entity_type, entity_id, room_type_id, url, moderation_status, is_sleeping_area)
           VALUES ('listing', $1, $2, $3, 'approved', $4)`,
          [lst, rt, `https://images.example.test/${rt}/${i}.jpg`, i === 1]
        );
      }
    }

    // Establish base accepted offer on listing 1, room 101
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
    const createCommittedRes = async (nights = 2, holderPrincipal = 'user:10') => {
      dayOffset += nights + 4;
      const checkIn = addDays(fixture.today, dayOffset);
      const checkOut = addDays(fixture.today, dayOffset + nights);

      const currentRev = (await fixture.owner.query(
        'SELECT current_accepted_revision FROM sellable_offers WHERE id = $1',
        [offerId]
      )).rows[0]?.current_accepted_revision || 1;

      const quote = await createItineraryQuote(
        stays,
        {
          offerId,
          revision: currentRev,
          checkIn,
          checkOut,
          guestCount: 2,
          requestId: randomUUID(),
        },
        holderPrincipal
      );

      const holdRes = await acquireHold(stays, {
        roomTypeId: 101,
        checkIn,
        checkOut,
        quantity: 1,
        idempotencyKey: randomUUID(),
        quoteId: quote.id,
        holderPrincipal,
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
        holderPrincipal,
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

      const comp = await composePaymentReservation(compositionWorker, {
        commandId: randomUUID(),
        paymentAttemptId: attempt.attemptId,
      });
      if (!comp.reservationId) {
        const recon = await fixture.owner.query(
          'SELECT * FROM canonical_payment_reconciliations WHERE payment_attempt_id = $1',
          [attempt.attemptId]
        );
        console.error('RECONCILIATION DETAILS:', recon.rows[0]?.details);
      }
      assert.ok(comp.reservationId, `Composition must succeed: ${JSON.stringify(comp)}`);

      return {
        reservationId: comp.reservationId,
        quote,
        holdId,
        checkIn,
        checkOut,
        nights,
        holderPrincipal,
      };
    };

    // Helper: Call modification request as encho_modification_issuer
    const requestModification = async ({
      reservationId,
      commandId = randomUUID(),
      expectedSourceEffectiveVersion = 1,
      targetQuoteId,
      authenticatedPrincipal = 'user:10',
    }) => {
      const res = await modificationIssuer.query(
        `SELECT * FROM canonical_request_reservation_modification(
          $1::uuid, $2::uuid, $3::int, $4::uuid, $5::text
        )`,
        [reservationId, commandId, expectedSourceEffectiveVersion, targetQuoteId, authenticatedPrincipal]
      );
      return res.rows[0];
    };

    // Helper: Safely update expires_at on stays_quotes by temporarily disabling immutable trigger
    const updateQuoteExpiresAt = async (quoteId, intervalSql) => {
      await fixture.owner.query('ALTER TABLE stays_quotes DISABLE TRIGGER stays_quote_accepted_immutable');
      try {
        await fixture.owner.query(
          `UPDATE stays_quotes SET expires_at = ${intervalSql} WHERE id = $1`,
          [quoteId]
        );
      } finally {
        await fixture.owner.query('ALTER TABLE stays_quotes ENABLE TRIGGER stays_quote_accepted_immutable');
      }
    };

    // Helper: Safely update current_accepted_revision on sellable_offers by temporarily disabling identity trigger
    const updateOfferCurrentAcceptedRevision = async (offerId, revision) => {
      await fixture.owner.query('ALTER TABLE sellable_offers DISABLE TRIGGER sellable_offer_identity_guard');
      try {
        await fixture.owner.query(
          `UPDATE sellable_offers SET current_accepted_revision = $2, latest_revision = GREATEST(latest_revision, $2) WHERE id = $1`,
          [offerId, revision]
        );
      } finally {
        await fixture.owner.query('ALTER TABLE sellable_offers ENABLE TRIGGER sellable_offer_identity_guard');
      }
    };

    // =========================================================================
    // CASE A: ACTIVE Encho Direct V1 + fresh quote + matching holder
    // =========================================================================
    const resA = await createCommittedRes(2);
    const targetQuoteA = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 1,
        checkIn: safeAddDays(fixture.today, 40),
        checkOut: safeAddDays(fixture.today, 43),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    const cmdA = randomUUID();
    const resultA = await requestModification({
      reservationId: resA.reservationId,
      commandId: cmdA,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: targetQuoteA.id,
      authenticatedPrincipal: 'user:10',
    });

    assert.ok(resultA.request_id);
    assert.equal(resultA.reservation_id, resA.reservationId);
    assert.equal(resultA.command_id, cmdA);
    assert.equal(resultA.holder_principal, 'user:10');
    assert.equal(resultA.source_effective_version, 1);
    assert.equal(resultA.source_revision_id, null);
    assert.equal(resultA.target_quote_id, targetQuoteA.id);
    assert.equal(resultA.replayed, false);
    assert.ok(resultA.created_at);

    // Verify persisted database facts
    const dbRowA = (await fixture.owner.query(
      `SELECT * FROM canonical_reservation_modification_requests WHERE id = $1`,
      [resultA.request_id]
    )).rows[0];
    assert.equal(dbRowA.request_type, 'REQUEST_MODIFICATION');
    assert.equal(dbRowA.command_id, cmdA);
    assert.equal(dbRowA.source_effective_version, 1);
    assert.equal(dbRowA.source_revision_id, null);
    assert.match(dbRowA.command_fingerprint, /^[a-f0-9]{64}$/);

    // =========================================================================
    // CASE B: Sealed V2 source captures exact revision; unsealed V3 ignored
    // =========================================================================
    const resB = await createCommittedRes(2);
    const v2HeaderId = randomUUID();
    const v2CheckIn = safeAddDays(fixture.today, 45);
    const v2CheckOut = safeAddDays(fixture.today, 48);

    // Assemble and seal V2
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $3, 1, $4, $5, 3, 2, 825000, 'INR')`,
      [v2HeaderId, resB.reservationId, offerId, v2CheckIn, v2CheckOut]
    );

    const invDaysB = (await fixture.owner.query(
      `SELECT id, calendar_date FROM inventory_days
       WHERE listing_id = 1 AND room_type_id = 101 AND calendar_date >= $1 AND calendar_date < $2
       ORDER BY calendar_date ASC`,
      [v2CheckIn, v2CheckOut]
    )).rows;

    for (const d of invDaysB) {
      await fixture.owner.query(
        `INSERT INTO canonical_reservation_revision_nights (
          revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
        ) VALUES ($1, $2, $3, $4, 101, 1)`,
        [v2HeaderId, resB.reservationId, d.id, d.calendar_date]
      );
    }

    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v2HeaderId, resB.reservationId]
    );

    // Also assemble unsealed V3
    const v3HeaderId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 3, 101, $3, 1, $4, $5, 2, 2, 550000, 'INR')`,
      [v3HeaderId, resB.reservationId, offerId, safeAddDays(fixture.today, 50), safeAddDays(fixture.today, 52)]
    );

    const targetQuoteB = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 1,
        checkIn: safeAddDays(fixture.today, 55),
        checkOut: safeAddDays(fixture.today, 57),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    const resultB = await requestModification({
      reservationId: resB.reservationId,
      expectedSourceEffectiveVersion: 2,
      targetQuoteId: targetQuoteB.id,
      authenticatedPrincipal: 'user:10',
    });

    assert.equal(resultB.source_effective_version, 2);
    assert.equal(resultB.source_revision_id, v2HeaderId);
    assert.equal(resultB.replayed, false);

    // =========================================================================
    // CASE C: Stale expected source version rejected
    // =========================================================================
    await assert.rejects(
      requestModification({
        reservationId: resB.reservationId,
        expectedSourceEffectiveVersion: 1, // resB is now at version 2
        targetQuoteId: targetQuoteB.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_SOURCE_VERSION_MISMATCH/
    );

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
    // CASE D: CANCELLATION_REQUESTED lifecycle rejected
    // =========================================================================
    const resD = await createCommittedRes(2);
    const cancelReqD = await requestCancel(resD.reservationId);

    await assert.rejects(
      requestModification({
        reservationId: resD.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: targetQuoteA.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_LIFECYCLE_CONFLICT/
    );

    // =========================================================================
    // CASE E: CANCELLED lifecycle rejected
    // =========================================================================
    const compCmdD = randomUUID();
    const decAuthD = await issueCancellationDecisionAuthorization(cancellationIssuer, {
      reservationId: resD.reservationId,
      requestEventId: cancelReqD.requestEventId,
      commandId: compCmdD,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved cancellation',
    });
    await completeReservationCancellation(cancellationExecutor, {
      authorizationId: decAuthD.authorizationId,
      commandId: compCmdD,
      reservationId: resD.reservationId,
      reasonCode: 'GUEST_CANCEL_APPROVED',
      reasonText: 'Approved cancellation',
    });

    await assert.rejects(
      requestModification({
        reservationId: resD.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: targetQuoteA.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_LIFECYCLE_CONFLICT/
    );

    // =========================================================================
    // CASE F: Quote expired rejected
    // =========================================================================
    const resF = await createCommittedRes(2);
    const quoteF = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 1,
        checkIn: safeAddDays(fixture.today, 60),
        checkOut: safeAddDays(fixture.today, 62),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );
    await updateQuoteExpiresAt(quoteF.id, `now() - interval '1 hour'`);

    await assert.rejects(
      requestModification({
        reservationId: resF.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteF.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_QUOTE_EXPIRED/
    );

    // =========================================================================
    // CASE G: Quote expiry DURING LOCK WAIT evaluated with post-wait wall clock
    // =========================================================================
    const resG = await createCommittedRes(2);
    const clientG = await fixture.owner.connect();
    try {
      await clientG.query('BEGIN');
      await clientG.query(
        'SELECT * FROM canonical_reservations WHERE id = $1 FOR UPDATE',
        [resG.reservationId]
      );

      const quoteG = await createItineraryQuote(
        stays,
        {
          offerId,
          revision: 1,
          checkIn: safeAddDays(fixture.today, 65),
          checkOut: safeAddDays(fixture.today, 67),
          guestCount: 2,
          requestId: randomUUID(),
        },
        'user:10'
      );

      // Set quote expiry 120ms from now
      await updateQuoteExpiresAt(quoteG.id, `clock_timestamp() + interval '120 milliseconds'`);

      let bFinished = false;
      const bPromise = modificationIssuer.query(
        `SELECT * FROM canonical_request_reservation_modification($1::uuid, $2::uuid, $3::int, $4::uuid, $5::text)`,
        [resG.reservationId, randomUUID(), 1, quoteG.id, 'user:10']
      ).finally(() => { bFinished = true; });

      // Verify B is waiting behind A's lock
      await new Promise(r => setTimeout(r, 40));
      assert.equal(bFinished, false, 'Tx B must wait on reservation row lock');

      // Allow quote to expire in wall clock time
      await new Promise(r => setTimeout(r, 160));

      // Release lock so Tx B can wake up and check clock_timestamp()
      await clientG.query('COMMIT');

      await assert.rejects(
        bPromise,
        /MODIFICATION_QUOTE_EXPIRED/
      );
    } finally {
      clientG.release();
    }

    // =========================================================================
    // CASE H: Reservation / quote holder mismatch rejected
    // =========================================================================
    const resH = await createCommittedRes(2);
    const quoteH = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 1,
        checkIn: safeAddDays(fixture.today, 70),
        checkOut: safeAddDays(fixture.today, 72),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:11' // Mismatched holder!
    );

    await assert.rejects(
      requestModification({
        reservationId: resH.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteH.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_NOT_AUTHORIZED/
    );

    // =========================================================================
    // CASE I: Foreign authenticated principal rejected for create & replay
    // =========================================================================
    const resI = await createCommittedRes(2);
    const quoteI = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 1,
        checkIn: safeAddDays(fixture.today, 75),
        checkOut: safeAddDays(fixture.today, 77),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    // Foreign create attempt
    await assert.rejects(
      requestModification({
        reservationId: resI.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteI.id,
        authenticatedPrincipal: 'user:99',
      }),
      /MODIFICATION_NOT_AUTHORIZED/
    );

    // Valid create by owner
    const cmdI = randomUUID();
    const resultI = await requestModification({
      reservationId: resI.reservationId,
      commandId: cmdI,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteI.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(resultI.replayed, false);

    // Foreign replay attempt on known command ID
    await assert.rejects(
      requestModification({
        reservationId: resI.reservationId,
        commandId: cmdI,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteI.id,
        authenticatedPrincipal: 'user:99',
      }),
      /MODIFICATION_NOT_AUTHORIZED/
    );

    // =========================================================================
    // CASE J: Quote kind != ACCEPTED_OFFER rejected
    // =========================================================================
    const quoteJId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO stays_quotes (
        id, quote_kind, listing_id, room_type_id, offer_id, offer_revision,
        holder_principal, check_in_date, check_out_date, nights, guest_count,
        base_price_paise, tax_paise, total_paise, currency, expires_at
      ) VALUES (
        $1, 'LEGACY', 1, 101, NULL, NULL,
        'user:10', $2, $3, 2, 2,
        100000, 18000, 118000, 'INR', now() + interval '1 day'
      )`,
      [quoteJId, safeAddDays(fixture.today, 80), safeAddDays(fixture.today, 82)]
    );

    await assert.rejects(
      requestModification({
        reservationId: resI.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteJId,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_QUOTE_KIND_INVALID/
    );

    // =========================================================================
    // CASE K: Different listing target quote rejected
    // =========================================================================
    // Create draft offer on listing 2
    const draft2 = await offerService.createDraft(fixture.principal(11), {
      commandId: randomUUID(),
      listingId: 2,
      roomTypeId: 201,
      amountMinor: '700000',
      stayStart: fixture.today,
      stayEnd: addDays(fixture.today, 100),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 100 * 86400000).toISOString(),
      maxGuests: 2,
      minNights: 1,
    });
    const sub2 = await offerService.submit(fixture.principal(11), {
      offerId: draft2.offerId,
      revision: 1,
      expectedVersion: draft2.version,
    });
    await fixture.grantOffer(draft2.offerId);
    await offerService.accept(fixture.principal(90, 'STAFF'), {
      offerId: draft2.offerId,
      revision: 1,
      expectedVersion: sub2.version,
    });

    const quoteListing2 = await createItineraryQuote(
      stays,
      {
        offerId: draft2.offerId,
        revision: 1,
        checkIn: safeAddDays(fixture.today, 80),
        checkOut: safeAddDays(fixture.today, 82),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    await assert.rejects(
      requestModification({
        reservationId: resI.reservationId, // reservation on listing 1
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteListing2.id, // quote on listing 2
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_LISTING_MISMATCH/
    );

    // =========================================================================
    // CASE L: Quote / offer static incoherence rejected
    // =========================================================================
    // Construct incoherent quote pointing to room 201 while listing is 1
    const quoteIncoherentId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO stays_quotes (
        id, quote_kind, listing_id, room_type_id, offer_id, offer_revision,
        holder_principal, check_in_date, check_out_date, nights, guest_count,
        base_price_paise, accepted_nightly_paise, price_basis, currency,
        request_id, request_fingerprint, source_hash, expires_at
      ) VALUES (
        $1, 'ACCEPTED_OFFER', 1, 201, $2, 1,
        'user:10', $3, $4, 2, 2,
        550000, 275000, 'PER_ROOM_NIGHT', 'INR',
        $5, repeat('b', 64), repeat('a', 64), now() + interval '1 day'
      )`,
      [quoteIncoherentId, offerId, safeAddDays(fixture.today, 85), safeAddDays(fixture.today, 87), randomUUID()]
    );

    await assert.rejects(
      requestModification({
        reservationId: resI.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteIncoherentId,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_QUOTE_INCOHERENT/
    );

    // =========================================================================
    // CASE M: Superseded offer revision rejected
    // =========================================================================
    // Create quote on revision 1
    const quoteRev1 = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 1,
        checkIn: safeAddDays(fixture.today, 88),
        checkOut: safeAddDays(fixture.today, 90),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    // Advance offer to revision 2 via offerService
    const host = fixture.principal(10);
    const staff = fixture.principal(90, 'STAFF');
    const curOfferVer = (await fixture.owner.query(
      'SELECT version FROM sellable_offers WHERE id = $1',
      [offerId]
    )).rows[0].version;

    const successor = await offerService.createDraft(host, {
      commandId: randomUUID(),
      listingId: 1,
      roomTypeId: 101,
      amountMinor: '600000',
      stayStart: fixture.today,
      stayEnd: addDays(fixture.today, 100),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 100 * 86400000).toISOString(),
      maxGuests: 2,
      minNights: 1,
      offerId,
      expectedVersion: Number(curOfferVer),
    });
    const subSuccessor = await offerService.submit(host, {
      offerId,
      revision: 2,
      expectedVersion: successor.version,
    });
    await fixture.grantOffer(offerId);
    await offerService.accept(staff, {
      offerId,
      revision: 2,
      expectedVersion: subSuccessor.version,
    });

    // NEW request using old quoteRev1 (on revision 1) must be rejected
    await assert.rejects(
      requestModification({
        reservationId: resI.reservationId,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteRev1.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_OFFER_SUPERSEDED/
    );

    // =========================================================================
    // CASE N: Current accepted revision succeeds
    // =========================================================================
    const quoteRev2 = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 2,
        checkIn: safeAddDays(fixture.today, 88),
        checkOut: safeAddDays(fixture.today, 90),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    const resultN = await requestModification({
      reservationId: resI.reservationId,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(resultN.replayed, false);
    assert.equal(resultN.target_quote_id, quoteRev2.id);

    // =========================================================================
    // CASE O: Exact idempotent replay returns same stored result
    // =========================================================================
    const cmdO = randomUUID();
    const firstO = await requestModification({
      reservationId: resI.reservationId,
      commandId: cmdO,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(firstO.replayed, false);

    const replayO = await requestModification({
      reservationId: resI.reservationId,
      commandId: cmdO,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(replayO.replayed, true);
    assert.equal(replayO.request_id, firstO.request_id);
    assert.equal(replayO.created_at.toISOString(), firstO.created_at.toISOString());

    // =========================================================================
    // CASE P: Replay after quote expiry succeeds without re-evaluating expiry
    // =========================================================================
    await updateQuoteExpiresAt(quoteRev2.id, `now() - interval '2 hours'`);

    const replayP = await requestModification({
      reservationId: resI.reservationId,
      commandId: cmdO,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(replayP.replayed, true);
    assert.equal(replayP.request_id, firstO.request_id);

    // Restore quote expiry for other tests
    await updateQuoteExpiresAt(quoteRev2.id, `now() + interval '10 days'`);

    // =========================================================================
    // CASE Q: Replay after offer succession succeeds without re-evaluating
    // =========================================================================
    await fixture.owner.query(
      `INSERT INTO sellable_offer_revisions (
        offer_id, revision, amount_minor, currency, price_basis, stay_start, stay_end,
        effective_from, effective_until, max_guests, min_nights, source_facts, source_hash,
        media_facts, media_hash, created_by
      ) SELECT
        offer_id, 3, 620000, currency, price_basis, stay_start, stay_end,
        effective_from, effective_until, max_guests, min_nights, source_facts, source_hash,
        media_facts, media_hash, created_by
      FROM sellable_offer_revisions WHERE offer_id = $1 AND revision = 1`,
      [offerId]
    );
    await updateOfferCurrentAcceptedRevision(offerId, 3);

    const replayQ = await requestModification({
      reservationId: resI.reservationId,
      commandId: cmdO,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(replayQ.replayed, true);
    assert.equal(replayQ.request_id, firstO.request_id);

    // Restore current revision back to 2
    await updateOfferCurrentAcceptedRevision(offerId, 2);

    // =========================================================================
    // CASE R: Replay after lifecycle change succeeds without re-evaluating
    // =========================================================================
    const resR = await createCommittedRes(2);
    const cmdR = randomUUID();
    const firstR = await requestModification({
      reservationId: resR.reservationId,
      commandId: cmdR,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(firstR.replayed, false);

    // Transition resR to CANCELLATION_REQUESTED
    await requestCancel(resR.reservationId);

    const replayR = await requestModification({
      reservationId: resR.reservationId,
      commandId: cmdR,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(replayR.replayed, true);
    assert.equal(replayR.request_id, firstR.request_id);

    // =========================================================================
    // CASE S: Same command + changed target quote -> conflict
    // =========================================================================
    const quoteS2 = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 2,
        checkIn: safeAddDays(fixture.today, 92),
        checkOut: safeAddDays(fixture.today, 94),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    await assert.rejects(
      requestModification({
        reservationId: resR.reservationId,
        commandId: cmdR,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteS2.id, // Changed quote ID!
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_COMMAND_CONFLICT/
    );

    // =========================================================================
    // CASE T: Same command + changed expected source version -> conflict
    // =========================================================================
    await assert.rejects(
      requestModification({
        reservationId: resR.reservationId,
        commandId: cmdR,
        expectedSourceEffectiveVersion: 2, // Changed source version!
        targetQuoteId: quoteRev2.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_COMMAND_CONFLICT/
    );

    // =========================================================================
    // CASE U: Same command + changed principal -> rejected without disclosure
    // =========================================================================
    await assert.rejects(
      requestModification({
        reservationId: resR.reservationId,
        commandId: cmdR,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteRev2.id,
        authenticatedPrincipal: 'user:99', // Changed principal!
      }),
      /MODIFICATION_NOT_AUTHORIZED/
    );

    // =========================================================================
    // CASE V: Same command + changed reservation -> rejected
    // =========================================================================
    const resV2 = await createCommittedRes(2);
    await assert.rejects(
      requestModification({
        reservationId: resV2.reservationId, // Different reservation!
        commandId: cmdR,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteRev2.id,
        authenticatedPrincipal: 'user:10',
      }),
      /MODIFICATION_COMMAND_CONFLICT/
    );

    // =========================================================================
    // CASE W: Same-command two-connection race creates exactly 1 row
    // =========================================================================
    const resW = await createCommittedRes(2);
    const cmdW = randomUUID();
    const [p1, p2] = await Promise.all([
      requestModification({
        reservationId: resW.reservationId,
        commandId: cmdW,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteRev2.id,
        authenticatedPrincipal: 'user:10',
      }),
      requestModification({
        reservationId: resW.reservationId,
        commandId: cmdW,
        expectedSourceEffectiveVersion: 1,
        targetQuoteId: quoteRev2.id,
        authenticatedPrincipal: 'user:10',
      }),
    ]);

    assert.equal(p1.request_id, p2.request_id);
    assert.equal(
      (p1.replayed === false && p2.replayed === true) || (p1.replayed === true && p2.replayed === false),
      true,
      'One invocation must be original and the other must be replayed'
    );

    const totalWRows = (await fixture.owner.query(
      `SELECT count(*)::int AS count FROM canonical_reservation_modification_requests WHERE command_id = $1`,
      [cmdW]
    )).rows[0].count;
    assert.equal(totalWRows, 1, 'Exactly 1 request row must exist for command');

    // =========================================================================
    // CASE X: Distinct-command same-source requests are both allowed
    // =========================================================================
    const cmdX1 = randomUUID();
    const cmdX2 = randomUUID();

    const rX1 = await requestModification({
      reservationId: resW.reservationId,
      commandId: cmdX1,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });
    const rX2 = await requestModification({
      reservationId: resW.reservationId,
      commandId: cmdX2,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteRev2.id,
      authenticatedPrincipal: 'user:10',
    });

    assert.notEqual(rX1.request_id, rX2.request_id);
    assert.equal(rX1.replayed, false);
    assert.equal(rX2.replayed, false);

    // =========================================================================
    // CASE Y: Invalid V2 source structural combinations rejected by constraints
    // =========================================================================
    // 1. V1 with non-null source_revision_id
    await assert.rejects(
      fixture.owner.query(
        `INSERT INTO canonical_reservation_modification_requests (
          reservation_id, command_id, command_fingerprint, holder_principal,
          source_effective_version, source_revision_id, target_quote_id
        ) VALUES ($1, $2, repeat('a', 64), 'user:10', 1, $3, $4)`,
        [resW.reservationId, randomUUID(), randomUUID(), quoteRev2.id]
      ),
      /chk_modification_request_source_version_shape/
    );

    // 2. V2 with null source_revision_id
    await assert.rejects(
      fixture.owner.query(
        `INSERT INTO canonical_reservation_modification_requests (
          reservation_id, command_id, command_fingerprint, holder_principal,
          source_effective_version, source_revision_id, target_quote_id
        ) VALUES ($1, $2, repeat('a', 64), 'user:10', 2, NULL, $3)`,
        [resW.reservationId, randomUUID(), quoteRev2.id]
      ),
      /chk_modification_request_source_version_shape/
    );

    // 3. V2 with revision_id from another reservation
    await assert.rejects(
      fixture.owner.query(
        `INSERT INTO canonical_reservation_modification_requests (
          reservation_id, command_id, command_fingerprint, holder_principal,
          source_effective_version, source_revision_id, target_quote_id
        ) VALUES ($1, $2, repeat('a', 64), 'user:10', 2, $3, $4)`,
        [resW.reservationId, randomUUID(), v2HeaderId, quoteRev2.id] // v2HeaderId belongs to resB, not resW
      ),
      /fk_modification_request_source_revision/
    );

    // 4. V2 with unsealed revision_id
    await assert.rejects(
      fixture.owner.query(
        `INSERT INTO canonical_reservation_modification_requests (
          reservation_id, command_id, command_fingerprint, holder_principal,
          source_effective_version, source_revision_id, target_quote_id
        ) VALUES ($1, $2, repeat('a', 64), 'user:10', 3, $3, $4)`,
        [resB.reservationId, randomUUID(), v3HeaderId, quoteRev2.id] // v3HeaderId is unsealed
      ),
      /fk_modification_request_source_sealed/
    );

    // =========================================================================
    // CASE Z: No-op quote succeeds with zero side effects
    // =========================================================================
    const resZ = await createCommittedRes(2);
    // Create quote matching identical itinerary as resZ
    const quoteNoOp = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 2,
        checkIn: resZ.checkIn,
        checkOut: resZ.checkOut,
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    const resultZ = await requestModification({
      reservationId: resZ.reservationId,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteNoOp.id,
      authenticatedPrincipal: 'user:10',
    });
    assert.equal(resultZ.replayed, false);
    assert.equal(resultZ.reservation_id, resZ.reservationId);

    // =========================================================================
    // CASE AA: Write-set containment: only request table modified
    // =========================================================================
    const tablesToTrack = [
      'canonical_reservations',
      'canonical_reservation_nights',
      'canonical_reservation_events',
      'canonical_reservation_lifecycle_commands',
      'canonical_reservation_cancellation_authorizations',
      'canonical_reservation_cancellation_inventory_releases',
      'canonical_reservation_cancellation_release_nights',
      'canonical_reservation_revisions',
      'canonical_reservation_revision_nights',
      'canonical_reservation_revision_seals',
      'inventory_days',
      'booking_holds',
      'booking_hold_nights',
      'canonical_payable_authorities',
      'canonical_payment_attempts',
      'canonical_provider_events',
    ];

    const getCounts = async () => {
      const counts = {};
      for (const t of tablesToTrack) {
        counts[t] = (await fixture.owner.query(`SELECT count(*)::int AS count FROM ${t}`)).rows[0].count;
      }
      return counts;
    };

    const resAA = await createCommittedRes(2);
    const quoteAA = await createItineraryQuote(
      stays,
      {
        offerId,
        revision: 2,
        checkIn: safeAddDays(fixture.today, 95),
        checkOut: safeAddDays(fixture.today, 97),
        guestCount: 2,
        requestId: randomUUID(),
      },
      'user:10'
    );

    // Snapshot after fixture creation
    const countPreRequest = await getCounts();
    const reqCountPreRequest = (await fixture.owner.query(
      `SELECT count(*)::int AS count FROM canonical_reservation_modification_requests`
    )).rows[0].count;

    // Issue modification request
    await requestModification({
      reservationId: resAA.reservationId,
      expectedSourceEffectiveVersion: 1,
      targetQuoteId: quoteAA.id,
      authenticatedPrincipal: 'user:10',
    });

    const countPostRequest = await getCounts();
    const reqCountPostRequest = (await fixture.owner.query(
      `SELECT count(*)::int AS count FROM canonical_reservation_modification_requests`
    )).rows[0].count;

    assert.equal(reqCountPostRequest, reqCountPreRequest + 1, 'Exactly 1 request row must be created');
    for (const t of tablesToTrack) {
      assert.equal(
        countPostRequest[t],
        countPreRequest[t],
        `Table ${t} count must NOT change during modification request creation`
      );
    }

    // =========================================================================
    // CASE AB: Role isolation & immutability enforcement
    // =========================================================================
    // encho_modification_issuer has EXECUTE on function
    const issuerCanExec = (await fixture.owner.query(
      `SELECT has_function_privilege(
        'encho_modification_issuer',
        'canonical_request_reservation_modification(uuid,uuid,int,uuid,text)',
        'EXECUTE'
      ) AS p`
    )).rows[0].p;
    assert.equal(issuerCanExec, true, 'encho_modification_issuer must have EXECUTE on function');

    // encho_modification_issuer has NO direct table DML or SELECT on request table
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const p = (await fixture.owner.query(
        `SELECT has_table_privilege('encho_modification_issuer', 'public.canonical_reservation_modification_requests', $1) AS p`,
        [priv]
      )).rows[0].p;
      assert.equal(p, false, `encho_modification_issuer must NOT have ${priv} on request table`);
    }

    // Other roles have NO EXECUTE on function and NO INSERT on request table
    const otherRoles = [
      'encho_stays_web',
      'encho_reservation_worker',
      'encho_payment_worker',
      'encho_composition_worker',
      'encho_lifecycle_issuer',
      'encho_lifecycle_worker',
      'encho_cancellation_issuer',
      'encho_cancellation_executor',
    ];
    for (const r of otherRoles) {
      const pExec = (await fixture.owner.query(
        `SELECT has_function_privilege($1, 'canonical_request_reservation_modification(uuid,uuid,int,uuid,text)', 'EXECUTE') AS p`,
        [r]
      )).rows[0].p;
      assert.equal(pExec, false, `${r} must NOT have EXECUTE on modification function`);

      const pIns = (await fixture.owner.query(
        `SELECT has_table_privilege($1, 'public.canonical_reservation_modification_requests', 'INSERT') AS p`,
        [r]
      )).rows[0].p;
      assert.equal(pIns, false, `${r} must NOT have INSERT on request table`);
    }

    // Immutability trigger: UPDATE and DELETE rejected even by owner
    const existingReqRow = (await fixture.owner.query(
      `SELECT id FROM canonical_reservation_modification_requests LIMIT 1`
    )).rows[0];
    await assert.rejects(
      fixture.owner.query(
        `UPDATE canonical_reservation_modification_requests SET holder_principal = 'user:999' WHERE id = $1`,
        [existingReqRow.id]
      ),
      /CANONICAL_MODIFICATION_REQUEST_IMMUTABLE/
    );
    await assert.rejects(
      fixture.owner.query(
        `DELETE FROM canonical_reservation_modification_requests WHERE id = $1`,
        [existingReqRow.id]
      ),
      /CANONICAL_MODIFICATION_REQUEST_IMMUTABLE/
    );

    // =========================================================================
    // CASE AC: No public ingress route mounted
    // =========================================================================
    const filesInSrc = execSync(`git status --porcelain`, {encoding: 'utf8'}).trim();
    // Verify no application/runtime API controllers are created or modified
    assert.equal(
      filesInSrc.includes('src/server') || filesInSrc.includes('src/routes'),
      false,
      'No application routes or controllers must be modified or created'
    );

    console.log('✔ All W4-C3 test matrix cases (A-AC) verified successfully');
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
      modificationIssuer?.end(),
    ]);
    await fixture.close();
  }
});
