/**
 * ENCHO W4-D Focused Test Suite:
 * Canonical Cancellation Refund Authorization.
 *
 * Verifies:
 * - T01: Valid paid V1 cancellation plus admitted synthetic decision returns complete authorization.
 * - T02: Payable differs from room subtotal: follows payable/capture authority.
 * - T03: Missing/forged approval and issuer evidence-DML denial (role isolation & permissions).
 * - T04: Cross-resource evidence/authorization insert rejection (independent DB triggers).
 * - T05: ACTIVE/request-only, external, direct-only, and V2 exclusions.
 * - T06: Invalid amount/currency, conflicting capture, unresolved reconciliation, visible cross-attempt alias.
 * - T07: Equivalent duplicate captures yield one ceiling (no summing).
 * - T08: Exact authorized replay after later financial observations; changed semantics conflict; unauthorized replay denied.
 * - T09: Concurrency on two real connections: identical converge, competing distinct blocked.
 * - T10: Immutability, exact injected insertion failure rollback, zero mutation to existing domain facts.
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
  issueCancellationDecisionAuthorization,
  completeReservationCancellation,
} from '../../src/services/canonicalCancellationCompletionService.js';
import {addDays, createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.js';

test('W4-D canonical cancellation refund authorization verification', async () => {
  // =========================================================================
  // 1. VERIFY EXACT CANONICAL BASE & ENVIRONMENT
  // =========================================================================
  const expectedCanonicalBase = 'e75b446b9754104f62d1e61ac3c665563ce40a96';
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

  const migration061Path = path.resolve('src/migrations/061_canonical_cancellation_refund_authorization.sql');
  assert.equal(
    fs.existsSync(migration061Path),
    true,
    'EVIDENCE_INCOMPLETE: migration 061 must exist in src/migrations'
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
  let refundIssuer;

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

    // Lifecycle roles for W4-A
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

    // Cancellation roles for W4-B
    await fixture.owner.query(`CREATE ROLE encho_cancellation_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await fixture.owner.query(`CREATE ROLE encho_cancellation_executor LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '056_canonical_cancellation_completion_authority.sql');

    // W4-C1 revision model
    await applyIsolatedMigration(fixture.owner, '057_canonical_reservation_revision_model.sql');

    // W4-C2 version-aware cancellation
    await applyIsolatedMigration(fixture.owner, '058_version_aware_cancellation_release.sql');

    // W4-C3 reservation modification request
    await fixture.owner.query(`CREATE ROLE encho_modification_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner, '059_canonical_reservation_modification_request.sql');

    // W4-C4 composition lock order hardening
    await applyIsolatedMigration(fixture.owner, '060_canonical_payment_composition_lock_order_hardening.sql');

    // Provision dedicated restricted issuer role for W4-D
    await fixture.owner.query(`CREATE ROLE encho_refund_issuer LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);

    // Apply new migration 061
    await applyIsolatedMigration(fixture.owner, '061_canonical_cancellation_refund_authorization.sql');

    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer'});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker'});
    cancellationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_issuer'});
    cancellationExecutor = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_executor'});
    refundIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_refund_issuer'});

    // Verify installed function identity in pg_proc
    const procCheck = (
      await fixture.owner.query(`
        SELECT proname, prosecdef, proconfig, rolname AS owner
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE proname = 'issue_cancellation_refund_authorization'
      `)
    ).rows[0];
    assert.ok(procCheck, 'issue_cancellation_refund_authorization must be installed in pg_proc');
    assert.equal(procCheck.prosecdef, true, 'Function must be SECURITY DEFINER');
    assert.ok(
      procCheck.proconfig?.some(c => c.includes('search_path=pg_catalog, public, pg_temp')),
      'Function must harden search_path'
    );
    assert.ok(
      procCheck.proconfig?.some(c => c.includes('row_security=on')),
      'Function must enforce row_security=on'
    );

    // Seed ample inventory days for roomTypeId 101 (listing 1)
    await fixture.owner.query(
      `INSERT INTO inventory_days(listing_id, room_type_id, calendar_date, total_units)
       SELECT 1, 101, $1::date + n, 10
       FROM generate_series(0, 150) AS n
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
      stayEnd: addDays(fixture.today, 150),
      effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
      effectiveUntil: new Date(Date.now() + 150 * 86400000).toISOString(),
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

    // Helper: Create committed paid canonical reservation
    const createPaidReservation = async ({nights = 2, customPayablePaise = null} = {}) => {
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
      const payableAmountPaise = customPayablePaise !== null ? customPayablePaise : roomSubtotalPaise;

      const payableId = randomUUID();
      const contractHash = repeatHex('a', 64);
      await fixture.owner.query(
        `INSERT INTO canonical_payable_authorities (
          id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
        ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', $4, 'APPROVED')`,
        [payableId, quote.id, payableAmountPaise, contractHash]
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

      const providerEventId = 'evt_cap_' + randomUUID();
      await ingestProviderEvent(paymentWorker, {
        attemptId: attempt.attemptId,
        originKind: 'RAZORPAY',
        providerEventId,
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: payableAmountPaise,
        reportedCurrency: 'INR',
        providerPaymentRef: paymentRef,
        providerOrderRef: orderRef,
        evidencePayload: {pay_id: paymentRef, amount: payableAmountPaise},
      });

      const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
      assert.equal(dbAttempt?.paymentState, 'MATCHED_CAPTURE');

      const compRes = await composePaymentReservation(compositionWorker, {
        commandId: randomUUID(),
        paymentAttemptId: attempt.attemptId,
      });
      assert.equal(compRes.compositionState, 'COMMITTED');

      // Fetch supporting provider event row
      const provEventRow = (
        await fixture.owner.query(
          `SELECT * FROM canonical_provider_events WHERE payment_attempt_id = $1 AND normalized_event_type = 'PAYMENT_CAPTURED'`,
          [attempt.attemptId]
        )
      ).rows[0];

      // Fetch paid bridge row
      const bridgeRow = (
        await fixture.owner.query(
          `SELECT * FROM canonical_payment_reservations WHERE reservation_id = $1`,
          [compRes.reservationId]
        )
      ).rows[0];

      return {
        reservationId: compRes.reservationId,
        quoteId: quote.id,
        holdId,
        payableAuthorityId: payableId,
        paymentAttemptId: attempt.attemptId,
        paidBridgeId: bridgeRow.id,
        providerOrderRef: orderRef,
        providerPaymentRef: paymentRef,
        supportingProviderEventId: provEventRow.id,
        supportingEvidenceHash: provEventRow.evidence_hash,
        capturedAmountPaise: payableAmountPaise,
        roomSubtotalPaise,
      };
    };

    // Helper: Cancel a reservation via canonical V1 cancellation completion
    const cancelReservationV1 = async (reservationId) => {
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

      const compCmdId = randomUUID();
      const decAuth = await issueCancellationDecisionAuthorization(cancellationIssuer, {
        reservationId,
        requestEventId: transitionRes.eventId,
        commandId: compCmdId,
        reasonCode: 'GUEST_CANCEL_APPROVED',
        reasonText: 'Approved V1 cancellation',
      });

      const completeRes = await completeReservationCancellation(cancellationExecutor, {
        authorizationId: decAuth.authorizationId,
        commandId: compCmdId,
        reservationId,
        reasonCode: 'GUEST_CANCEL_APPROVED',
        reasonText: 'Approved V1 cancellation',
      });

      assert.equal(completeRes.lifecycleState, 'CANCELLED');

      return {
        cancellationEventId: completeRes.eventId,
        cancellationReleaseId: completeRes.releaseId,
      };
    };

    // Helper: Insert synthetic decision evidence
    const insertSyntheticDecisionEvidence = async (fields) => {
      const id = fields.id || randomUUID();
      const decisionRef = fields.decisionRef !== undefined ? fields.decisionRef : ('DEC-REF-' + randomUUID());
      const version = fields.version || 1;
      const classification = fields.evidenceClassification || 'LOCAL_SYNTHETIC_TEST_FIXTURE';
      const responsibility = fields.approverResponsibility || 'ACCOMMODATION_FINANCE_APPROVER';
      const approverIdentity = fields.approverIdentityRef || 'synthetic:founder:01';
      const decisionAt = fields.decisionAt || new Date().toISOString();
      const reasonCode = fields.reasonCode || 'CANCELLATION_REFUND_APPROVED';
      const reasonText = fields.reasonText !== undefined ? fields.reasonText : 'Approved cancellation refund for testing';
      const approvalRef = fields.approvalRef || 'APP-REF-' + randomUUID();
      const verifyingComp = fields.verifyingComponent || 'REFUND_DECISION_AUTHORITY_PRIMITIVE';
      const verifiedAt = fields.verifiedAt || new Date().toISOString();
      const reservationId = fields.reservationId;
      const cancelEventId = fields.cancellationEventId;
      const cancelReleaseId = fields.cancellationReleaseId;
      const paidBridgeId = fields.paidBridgeId;
      const attemptId = fields.paymentAttemptId;
      const quoteId = fields.quoteId;
      const payableAuthId = fields.payableAuthorityId;
      const originKind = fields.providerOriginKind || 'RAZORPAY';
      const paymentRef = fields.providerPaymentRef;
      const supportingEventId = fields.supportingProviderEventId;
      const supportingHash = fields.supportingEvidenceHash;
      const amountPaise = fields.approvedAmountPaise;
      const currency = fields.currency || 'INR';
      const submittingComp = fields.permittedSubmittingComponent || 'REFUND_DECISION_AUTHORITY_PRIMITIVE';
      const issuerRole = fields.permittedIssuerRole || 'encho_refund_issuer';

      const res = await fixture.owner.query(
        `INSERT INTO canonical_cancellation_refund_decision_evidence (
          id, decision_ref, version, evidence_classification, approver_responsibility,
          approver_identity_ref, decision_at, reason_code, reason_text,
          approval_ref, verifying_component, verified_at,
          reservation_id, cancellation_event_id, cancellation_release_id,
          paid_bridge_id, payment_attempt_id, quote_id, payable_authority_id,
          provider_origin_kind, provider_payment_ref, supporting_provider_event_id,
          supporting_evidence_hash, approved_amount_paise, currency,
          permitted_submitting_component, permitted_issuer_role, decision_digest
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25,
          $26, $27, repeat('0', 64)
        ) RETURNING *`,
        [
          id, decisionRef, version, classification, responsibility,
          approverIdentity, decisionAt, reasonCode, reasonText,
          approvalRef, verifyingComp, verifiedAt,
          reservationId, cancelEventId, cancelReleaseId,
          paidBridgeId, attemptId, quoteId, payableAuthId,
          originKind, paymentRef, supportingEventId,
          supportingHash, amountPaise, currency,
          submittingComp, issuerRole,
        ]
      );
      return res.rows[0];
    };

    function repeatHex(ch, len) {
      return ch.repeat(len);
    }

    // Helper: Snapshot all 16 scoped domain tables
    const takeScopedDomainSnapshot = async (paidRes) => {
      const [
        resRow,
        nightsRows,
        eventsRows,
        releasesRows,
        relNightsRows,
        attemptsRow,
        bridgeRow,
        provEventsRows,
        payableAuthRow,
        reconciliationsRows,
        commandsRows,
        inventoryDaysRows,
        holdsRow,
        holdNightsRows,
        quotesRow,
        bookingsRows,
      ] = await Promise.all([
        fixture.owner.query(`SELECT * FROM canonical_reservations WHERE id = $1`, [paidRes.reservationId]),
        fixture.owner.query(`SELECT * FROM canonical_reservation_nights WHERE reservation_id = $1 ORDER BY stay_date`, [paidRes.reservationId]),
        fixture.owner.query(`SELECT * FROM canonical_reservation_events WHERE reservation_id = $1 ORDER BY sequence_number`, [paidRes.reservationId]),
        fixture.owner.query(`SELECT * FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`, [paidRes.reservationId]),
        fixture.owner.query(`SELECT * FROM canonical_reservation_cancellation_release_nights WHERE reservation_id = $1 ORDER BY stay_date`, [paidRes.reservationId]),
        fixture.owner.query(`SELECT * FROM canonical_payment_attempts WHERE id = $1`, [paidRes.paymentAttemptId]),
        fixture.owner.query(`SELECT * FROM canonical_payment_reservations WHERE reservation_id = $1`, [paidRes.reservationId]),
        fixture.owner.query(`SELECT * FROM canonical_provider_events WHERE payment_attempt_id = $1 ORDER BY id`, [paidRes.paymentAttemptId]),
        fixture.owner.query(`SELECT * FROM canonical_payable_authorities WHERE id = $1`, [paidRes.payableAuthorityId]),
        fixture.owner.query(`SELECT * FROM canonical_payment_reconciliations WHERE payment_attempt_id = $1 ORDER BY id`, [paidRes.paymentAttemptId]),
        fixture.owner.query(`SELECT * FROM canonical_reservation_commands WHERE reservation_id = $1 ORDER BY command_id`, [paidRes.reservationId]),
        fixture.owner.query(`SELECT * FROM inventory_days WHERE room_type_id = 101 ORDER BY calendar_date`),
        fixture.owner.query(`SELECT * FROM booking_holds WHERE id = $1`, [paidRes.holdId]),
        fixture.owner.query(`SELECT * FROM booking_hold_nights WHERE hold_id = $1 ORDER BY stay_date`, [paidRes.holdId]),
        fixture.owner.query(`SELECT * FROM stays_quotes WHERE id = $1`, [paidRes.quoteId]),
        fixture.owner.query(`SELECT * FROM bookings ORDER BY id`),
      ]);
      return {
        resRow: resRow.rows[0],
        nightsRows: nightsRows.rows,
        eventsRows: eventsRows.rows,
        releasesRows: releasesRows.rows,
        relNightsRows: relNightsRows.rows,
        attemptsRow: attemptsRow.rows[0],
        bridgeRow: bridgeRow.rows[0],
        provEventsRows: provEventsRows.rows,
        payableAuthRow: payableAuthRow.rows[0],
        reconciliationsRows: reconciliationsRows.rows,
        commandsRows: commandsRows.rows,
        inventoryDaysRows: inventoryDaysRows.rows,
        holdsRow: holdsRow.rows[0],
        holdNightsRows: holdNightsRows.rows,
        quotesRow: quotesRow.rows[0],
        bookingsRows: bookingsRows.rows,
      };
    };

    // =========================================================================
    // T01: VALID PAID V1 CANCELLATION PLUS ADMITTED SYNTHETIC DECISION
    // =========================================================================
    {
      const paidRes = await createPaidReservation({nights: 2});
      const cancelInfo = await cancelReservationV1(paidRes.reservationId);

      const decisionEvidence = await insertSyntheticDecisionEvidence({
        reservationId: paidRes.reservationId,
        cancellationEventId: cancelInfo.cancellationEventId,
        cancellationReleaseId: cancelInfo.cancellationReleaseId,
        paidBridgeId: paidRes.paidBridgeId,
        paymentAttemptId: paidRes.paymentAttemptId,
        quoteId: paidRes.quoteId,
        payableAuthorityId: paidRes.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidRes.providerPaymentRef,
        supportingProviderEventId: paidRes.supportingProviderEventId,
        supportingEvidenceHash: paidRes.supportingEvidenceHash,
        approvedAmountPaise: paidRes.capturedAmountPaise,
      });

      assert.ok(decisionEvidence.decision_digest, 'Database must generate decision_digest');
      assert.notEqual(decisionEvidence.decision_digest, repeatHex('0', 64), 'Digest must not be dummy placeholder');

      const commandId = randomUUID();
      const authResult = (
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [commandId, paidRes.reservationId, decisionEvidence.id]
        )
      ).rows[0];

      assert.ok(authResult, 'issue_cancellation_refund_authorization must return a row');
      assert.equal(authResult.command_id, commandId);
      assert.equal(authResult.decision_evidence_id, decisionEvidence.id);
      assert.equal(authResult.decision_version, 1);
      assert.equal(authResult.decision_digest, decisionEvidence.decision_digest);
      assert.equal(authResult.reservation_id, paidRes.reservationId);
      assert.equal(authResult.cancellation_release_id, cancelInfo.cancellationReleaseId);
      assert.equal(authResult.paid_bridge_id, paidRes.paidBridgeId);
      assert.equal(authResult.payment_attempt_id, paidRes.paymentAttemptId);
      assert.equal(authResult.provider_origin_kind, 'RAZORPAY');
      assert.equal(authResult.provider_payment_ref, paidRes.providerPaymentRef);
      assert.equal(BigInt(authResult.approved_amount_paise), BigInt(paidRes.capturedAmountPaise));
      assert.equal(authResult.currency, 'INR');
      assert.equal(authResult.issuing_role, 'encho_refund_issuer');
      assert.equal(authResult.issuing_principal, 'encho_refund_issuer');
      assert.equal(authResult.replayed, false);

      // Verify row in canonical_cancellation_refund_authorizations
      const storedAuth = (
        await fixture.owner.query(
          `SELECT * FROM canonical_cancellation_refund_authorizations WHERE id = $1`,
          [authResult.authorization_id]
        )
      ).rows[0];
      assert.ok(storedAuth, 'Stored authorization row must exist');
      assert.equal(storedAuth.command_id, commandId);
      assert.equal(storedAuth.reservation_id, paidRes.reservationId);
    }

    // =========================================================================
    // T02: PAYABLE DIFFERS FROM ROOM SUBTOTAL: FOLLOWS PAYABLE/CAPTURE AUTHORITY
    // =========================================================================
    {
      // Subtotal for 2 nights is 1,100,000 paise; custom payable authority is 1,300,000 paise (tax/fees added)
      const paidResT2 = await createPaidReservation({nights: 2, customPayablePaise: 1300000});
      assert.notEqual(paidResT2.roomSubtotalPaise, paidResT2.capturedAmountPaise);

      const cancelInfoT2 = await cancelReservationV1(paidResT2.reservationId);

      // Approve amount that exceeds room subtotal 1,100,000 paise but remains within captured authority 1,300,000 paise
      const approvedPaise = 1200000;
      assert.ok(approvedPaise > paidResT2.roomSubtotalPaise, 'Approved amount exceeds room subtotal');
      assert.ok(approvedPaise <= paidResT2.capturedAmountPaise, 'Approved amount is within captured authority');

      const decisionEvidenceT2 = await insertSyntheticDecisionEvidence({
        reservationId: paidResT2.reservationId,
        cancellationEventId: cancelInfoT2.cancellationEventId,
        cancellationReleaseId: cancelInfoT2.cancellationReleaseId,
        paidBridgeId: paidResT2.paidBridgeId,
        paymentAttemptId: paidResT2.paymentAttemptId,
        quoteId: paidResT2.quoteId,
        payableAuthorityId: paidResT2.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT2.providerPaymentRef,
        supportingProviderEventId: paidResT2.supportingProviderEventId,
        supportingEvidenceHash: paidResT2.supportingEvidenceHash,
        approvedAmountPaise: approvedPaise,
      });

      const cmdT2 = randomUUID();
      const authResultT2 = (
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [cmdT2, paidResT2.reservationId, decisionEvidenceT2.id]
        )
      ).rows[0];

      assert.ok(authResultT2);
      assert.equal(BigInt(authResultT2.approved_amount_paise), BigInt(approvedPaise));
      assert.equal(authResultT2.replayed, false);
    }

    // =========================================================================
    // T03: MISSING/FORGED APPROVAL AND ISSUER EVIDENCE-DML DENIAL
    // =========================================================================
    {
      const paidResT3 = await createPaidReservation({nights: 2});
      const cancelInfoT3 = await cancelReservationV1(paidResT3.reservationId);

      // 3a. Calling function with non-existent decision_evidence_id
      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT3.reservationId, randomUUID()]
        ),
        (err) => {
          assert.match(err.message, /DECISION_EVIDENCE_NOT_FOUND/);
          return true;
        }
      );

      // 3b. Synthetic evidence with unapproved submitting component
      await assert.rejects(
        () => insertSyntheticDecisionEvidence({
          reservationId: paidResT3.reservationId,
          cancellationEventId: cancelInfoT3.cancellationEventId,
          cancellationReleaseId: cancelInfoT3.cancellationReleaseId,
          paidBridgeId: paidResT3.paidBridgeId,
          paymentAttemptId: paidResT3.paymentAttemptId,
          quoteId: paidResT3.quoteId,
          payableAuthorityId: paidResT3.payableAuthorityId,
          providerOriginKind: 'RAZORPAY',
          providerPaymentRef: paidResT3.providerPaymentRef,
          supportingProviderEventId: paidResT3.supportingProviderEventId,
          supportingEvidenceHash: paidResT3.supportingEvidenceHash,
          approvedAmountPaise: paidResT3.capturedAmountPaise,
          permittedSubmittingComponent: 'FORGED_SUBMITTING_COMPONENT',
        }),
        (err) => {
          assert.match(err.message, /check constraint/i);
          return true;
        }
      );

      // 3c. Issuer role direct table DML denial (SELECT/INSERT/UPDATE/DELETE on both tables)
      await assert.rejects(
        () => refundIssuer.query(`SELECT * FROM canonical_cancellation_refund_decision_evidence`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on evidence SELECT');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`INSERT INTO canonical_cancellation_refund_decision_evidence (decision_ref) VALUES ('x')`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on evidence INSERT');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`UPDATE canonical_cancellation_refund_decision_evidence SET reason_text = 'hack'`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on evidence UPDATE');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`DELETE FROM canonical_cancellation_refund_decision_evidence`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on evidence DELETE');
          return true;
        }
      );

      await assert.rejects(
        () => refundIssuer.query(`SELECT * FROM canonical_cancellation_refund_authorizations`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on authorizations SELECT');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`INSERT INTO canonical_cancellation_refund_authorizations (command_id) VALUES ($1)`, [randomUUID()]),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on authorizations INSERT');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`UPDATE canonical_cancellation_refund_authorizations SET issuing_principal = 'hack'`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on authorizations UPDATE');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`DELETE FROM canonical_cancellation_refund_authorizations`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) on authorizations DELETE');
          return true;
        }
      );

      // 3d. Non-issuer runtime roles calling issue_cancellation_refund_authorization denied with 42501 under normal ACLs
      for (const [roleName, pool] of [
        ['composition worker', compositionWorker],
        ['payment worker', paymentWorker],
        ['stays web', stays],
        ['reservation worker', reservationWorker],
      ]) {
        await assert.rejects(
          () => pool.query(
            `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
            [randomUUID(), paidResT3.reservationId, randomUUID()]
          ),
          (err) => {
            assert.equal(err.code, '42501', `Must fail with permission denied (42501) for ${roleName}`);
            return true;
          }
        );
      }

      // 3e. W4D-01 Negative admission test: empty string or whitespace-only decision_ref rejected by check constraint
      for (const invalidDecisionRef of ['', '   ']) {
        await assert.rejects(
          () => insertSyntheticDecisionEvidence({
            decisionRef: invalidDecisionRef,
            reservationId: paidResT3.reservationId,
            cancellationEventId: cancelInfoT3.cancellationEventId,
            cancellationReleaseId: cancelInfoT3.cancellationReleaseId,
            paidBridgeId: paidResT3.paidBridgeId,
            paymentAttemptId: paidResT3.paymentAttemptId,
            quoteId: paidResT3.quoteId,
            payableAuthorityId: paidResT3.payableAuthorityId,
            providerOriginKind: 'RAZORPAY',
            providerPaymentRef: paidResT3.providerPaymentRef,
            supportingProviderEventId: paidResT3.supportingProviderEventId,
            supportingEvidenceHash: paidResT3.supportingEvidenceHash,
            approvedAmountPaise: paidResT3.capturedAmountPaise,
          }),
          (err) => {
            assert.equal(err.code, '23514', 'Must fail with PostgreSQL check constraint violation (23514)');
            return true;
          }
        );
      }
    }

    // =========================================================================
    // T04: CROSS-RESOURCE EVIDENCE/AUTHORIZATION INSERT REJECTION
    // =========================================================================
    {
      const paidRes1 = await createPaidReservation({nights: 2});
      const cancelInfo1 = await cancelReservationV1(paidRes1.reservationId);

      const paidRes2 = await createPaidReservation({nights: 2});
      const cancelInfo2 = await cancelReservationV1(paidRes2.reservationId);

      // 4a. Cross-binding mismatch in decision evidence: pair release of Res 2 with Res 1
      await assert.rejects(
        () => insertSyntheticDecisionEvidence({
          reservationId: paidRes1.reservationId,
          cancellationEventId: cancelInfo1.cancellationEventId,
          cancellationReleaseId: cancelInfo2.cancellationReleaseId, // Cross-bound from Res 2!
          paidBridgeId: paidRes1.paidBridgeId,
          paymentAttemptId: paidRes1.paymentAttemptId,
          quoteId: paidRes1.quoteId,
          payableAuthorityId: paidRes1.payableAuthorityId,
          providerOriginKind: 'RAZORPAY',
          providerPaymentRef: paidRes1.providerPaymentRef,
          supportingProviderEventId: paidRes1.supportingProviderEventId,
          supportingEvidenceHash: paidRes1.supportingEvidenceHash,
          approvedAmountPaise: paidRes1.capturedAmountPaise,
        }),
        (err) => {
          assert.match(err.message, /DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: RELEASE_RESERVATION_MISMATCH/);
          return true;
        }
      );

      // 4b. Cross-binding mismatch in decision evidence: pair paid bridge of Res 2 with Res 1
      await assert.rejects(
        () => insertSyntheticDecisionEvidence({
          reservationId: paidRes1.reservationId,
          cancellationEventId: cancelInfo1.cancellationEventId,
          cancellationReleaseId: cancelInfo1.cancellationReleaseId,
          paidBridgeId: paidRes2.paidBridgeId, // Cross-bound bridge!
          paymentAttemptId: paidRes1.paymentAttemptId,
          quoteId: paidRes1.quoteId,
          payableAuthorityId: paidRes1.payableAuthorityId,
          providerOriginKind: 'RAZORPAY',
          providerPaymentRef: paidRes1.providerPaymentRef,
          supportingProviderEventId: paidRes1.supportingProviderEventId,
          supportingEvidenceHash: paidRes1.supportingEvidenceHash,
          approvedAmountPaise: paidRes1.capturedAmountPaise,
        }),
        (err) => {
          assert.match(err.message, /DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: BRIDGE_RESERVATION_MISMATCH/);
          return true;
        }
      );

      // 4c. Valid decision evidence for Res 1
      const validEvidence1 = await insertSyntheticDecisionEvidence({
        reservationId: paidRes1.reservationId,
        cancellationEventId: cancelInfo1.cancellationEventId,
        cancellationReleaseId: cancelInfo1.cancellationReleaseId,
        paidBridgeId: paidRes1.paidBridgeId,
        paymentAttemptId: paidRes1.paymentAttemptId,
        quoteId: paidRes1.quoteId,
        payableAuthorityId: paidRes1.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidRes1.providerPaymentRef,
        supportingProviderEventId: paidRes1.supportingProviderEventId,
        supportingEvidenceHash: paidRes1.supportingEvidenceHash,
        approvedAmountPaise: paidRes1.capturedAmountPaise,
      });

      // Direct insert into authorizations with mismatched reservationId vs decision_evidence_id
      await assert.rejects(
        () => fixture.owner.query(
          `INSERT INTO canonical_cancellation_refund_authorizations (
            command_id, command_fingerprint, decision_evidence_id, reservation_id,
            cancellation_release_id, paid_bridge_id, payment_attempt_id,
            provider_origin_kind, provider_payment_ref, issuing_role, issuing_principal
          ) VALUES ($1, repeat('a', 64), $2, $3, $4, $5, $6, 'RAZORPAY', $7, 'encho_refund_issuer', 'owner')`,
          [
            randomUUID(),
            validEvidence1.id,
            paidRes2.reservationId, // Mismatched reservation!
            cancelInfo1.cancellationReleaseId,
            paidRes1.paidBridgeId,
            paidRes1.paymentAttemptId,
            paidRes1.providerPaymentRef,
          ]
        ),
        (err) => {
          assert.match(err.message, /REFUND_AUTHORIZATION_CROSS_BINDING_MISMATCH: EVIDENCE_SUBJECT_MISMATCH/);
          return true;
        }
      );
    }

    // =========================================================================
    // T05: ACTIVE/REQUEST-ONLY, EXTERNAL, DIRECT-ONLY AND V2 EXCLUSIONS
    // =========================================================================
    {
      // 5a. ACTIVE reservation (not cancelled)
      const activeRes = await createPaidReservation({nights: 2});
      await assert.rejects(
        () => insertSyntheticDecisionEvidence({
          reservationId: activeRes.reservationId,
          cancellationEventId: randomUUID(),
          cancellationReleaseId: randomUUID(),
          paidBridgeId: activeRes.paidBridgeId,
          paymentAttemptId: activeRes.paymentAttemptId,
          quoteId: activeRes.quoteId,
          payableAuthorityId: activeRes.payableAuthorityId,
          providerOriginKind: 'RAZORPAY',
          providerPaymentRef: activeRes.providerPaymentRef,
          supportingProviderEventId: activeRes.supportingProviderEventId,
          supportingEvidenceHash: activeRes.supportingEvidenceHash,
          approvedAmountPaise: activeRes.capturedAmountPaise,
        }),
        (err) => {
          assert.match(err.message, /DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: CANCELLATION_RELEASE_NOT_FOUND/);
          return true;
        }
      );

      // 5b. Request-only reservation (state is CANCELLATION_REQUESTED, not CANCELLED)
      const reqOnlyRes = await createPaidReservation({nights: 2});
      const cancelCmdId = randomUUID();
      const cancelAuth = await issueCancellationAuthorization(lifecycleIssuer, {
        reservationId: reqOnlyRes.reservationId,
        commandId: cancelCmdId,
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest cancel',
        authenticatedPrincipal: 'user:10',
      });
      const reqRes = await requestReservationCancellation(lifecycleWorker, {
        authorizationId: cancelAuth.authorizationId,
        commandId: cancelCmdId,
        reservationId: reqOnlyRes.reservationId,
        reasonCode: 'GUEST_CANCEL_REQUEST',
        reasonText: 'Guest cancel',
      });
      assert.equal(reqRes.lifecycleState, 'CANCELLATION_REQUESTED');

      // Assert no completed release row exists for reqOnlyRes
      const reqReleaseCount = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`,
          [reqOnlyRes.reservationId]
        )
      ).rows[0].count;
      assert.equal(Number(reqReleaseCount), 0);

      await assert.rejects(
        () => insertSyntheticDecisionEvidence({
          reservationId: reqOnlyRes.reservationId,
          cancellationEventId: reqRes.eventId,
          cancellationReleaseId: randomUUID(),
          paidBridgeId: reqOnlyRes.paidBridgeId,
          paymentAttemptId: reqOnlyRes.paymentAttemptId,
          quoteId: reqOnlyRes.quoteId,
          payableAuthorityId: reqOnlyRes.payableAuthorityId,
          providerOriginKind: 'RAZORPAY',
          providerPaymentRef: reqOnlyRes.providerPaymentRef,
          supportingProviderEventId: reqOnlyRes.supportingProviderEventId,
          supportingEvidenceHash: reqOnlyRes.supportingEvidenceHash,
          approvedAmountPaise: reqOnlyRes.capturedAmountPaise,
        }),
        (err) => {
          assert.match(err.message, /DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: CANCELLATION_RELEASE_NOT_FOUND/);
          return true;
        }
      );

      // 5c. Direct-finalizer-only reservation (no paid bridge in canonical_payment_reservations)
      const dirCheckIn = addDays(fixture.today, dayOffset);
      const dirCheckOut = addDays(fixture.today, dayOffset + 2);
      dayOffset += 5;
      const dirQuote = await createItineraryQuote(
        stays,
        {
          offerId,
          revision: 1,
          checkIn: dirCheckIn,
          checkOut: dirCheckOut,
          guestCount: 2,
          requestId: randomUUID(),
        },
        'user:10'
      );
      const dirHold = await acquireHold(stays, {
        roomTypeId: 101,
        checkIn: dirCheckIn,
        checkOut: dirCheckOut,
        quantity: 1,
        idempotencyKey: randomUUID(),
        quoteId: dirQuote.id,
        holderPrincipal: 'user:10',
        userId: 10,
      });
      assert.equal(dirHold.success, true);
      const dirClient = await reservationWorker.connect();
      let directResId;
      try {
        await dirClient.query('BEGIN');
        await dirClient.query("SELECT set_config('app.stays_principal', $1, true)", ['user:10']);
        const dirFinRes = await dirClient.query(
          `SELECT * FROM canonical_finalize_direct_hold($1, $2, $3)`,
          [dirHold.hold.id, dirQuote.id, randomUUID()]
        );
        directResId = dirFinRes.rows[0].reservation_id;
        await dirClient.query('COMMIT');
      } finally {
        dirClient.release();
      }
      const dirCancel = await cancelReservationV1(directResId);

      const dirBridgeCount = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_payment_reservations WHERE reservation_id = $1`,
          [directResId]
        )
      ).rows[0].count;
      assert.equal(Number(dirBridgeCount), 0);

      await assert.rejects(
        () => insertSyntheticDecisionEvidence({
          reservationId: directResId,
          cancellationEventId: dirCancel.cancellationEventId,
          cancellationReleaseId: dirCancel.cancellationReleaseId,
          paidBridgeId: randomUUID(),
          paymentAttemptId: randomUUID(),
          quoteId: dirQuote.id,
          payableAuthorityId: randomUUID(),
          providerOriginKind: 'RAZORPAY',
          providerPaymentRef: 'dummy_ref',
          supportingProviderEventId: randomUUID(),
          supportingEvidenceHash: repeatHex('a', 64),
          approvedAmountPaise: 100000,
        }),
        (err) => {
          assert.match(err.message, /DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PAID_BRIDGE_NOT_FOUND/);
          return true;
        }
      );

      // 5d. External reservation (lifecycle origin not ENCHO_DIRECT)
      const extResId = randomUUID();
      const extCmd = randomUUID();
      const extCheckIn = addDays(fixture.today, dayOffset);
      const extCheckOut = addDays(fixture.today, dayOffset + 2);
      dayOffset += 5;
      await fixture.owner.query(
        `INSERT INTO canonical_reservations (
          id, command_id, command_fingerprint, hold_id, quote_id,
          listing_id, room_type_id, origin_kind, check_in_date, check_out_date,
          nights, guest_count, room_subtotal_paise, currency, status
        ) VALUES (
          $1, $2, repeat('c', 64), NULL, NULL,
          1, 101, 'EXTERNAL_CHANNEL', $3, $4,
          2, 2, 1000000, 'INR', 'INVENTORY_COMMITTED'
        )`,
        [extResId, extCmd, extCheckIn, extCheckOut]
      );
      await assert.rejects(
        () => issueCancellationAuthorization(lifecycleIssuer, {
          reservationId: extResId,
          commandId: randomUUID(),
          reasonCode: 'GUEST_CANCEL_REQUEST',
          reasonText: 'Guest cancel',
          authenticatedPrincipal: 'user:10',
        }),
        (err) => {
          assert.match(err.message, /LIFECYCLE_ORIGIN_NOT_SUPPORTED/);
          return true;
        }
      );

      // 5e. V2 Cancellation release excluded via natural V2 assembly and seal
      const v2Res = await createPaidReservation({nights: 2});
      const resRowV2 = (
        await fixture.owner.query(`SELECT * FROM canonical_reservations WHERE id = $1`, [v2Res.reservationId])
      ).rows[0];
      const v2RevId = randomUUID();
      await fixture.owner.query(
        `INSERT INTO canonical_reservation_revisions (
          id, reservation_id, version, room_type_id, offer_id, offer_revision,
          check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
        ) VALUES ($1, $2, 2, 101, $6, $7, $3, $4, $5, 2, 1100000, 'INR')`,
        [v2RevId, v2Res.reservationId, resRowV2.check_in_date, resRowV2.check_out_date, resRowV2.nights, resRowV2.offer_id, resRowV2.offer_revision]
      );
      await fixture.owner.query(
        `INSERT INTO canonical_reservation_revision_nights (
          revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
        ) SELECT $1, $2, d.id, d.calendar_date, 101, 1
          FROM inventory_days d
          WHERE d.room_type_id = 101 AND d.calendar_date >= $3 AND d.calendar_date < $4`,
        [v2RevId, v2Res.reservationId, resRowV2.check_in_date, resRowV2.check_out_date]
      );
      await fixture.owner.query(
        `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
        [v2RevId, v2Res.reservationId]
      );

      // Normal cancellation releases effective version 2
      const cancelInfoV2 = await cancelReservationV1(v2Res.reservationId);
      const relRowV2 = (
        await fixture.owner.query(
          `SELECT * FROM canonical_reservation_cancellation_inventory_releases WHERE release_id = $1`,
          [cancelInfoV2.cancellationReleaseId]
        )
      ).rows[0];
      assert.equal(relRowV2.released_effective_version, 2);
      assert.equal(relRowV2.released_revision_id, v2RevId);

      const evidenceV2 = await insertSyntheticDecisionEvidence({
        reservationId: v2Res.reservationId,
        cancellationEventId: cancelInfoV2.cancellationEventId,
        cancellationReleaseId: cancelInfoV2.cancellationReleaseId,
        paidBridgeId: v2Res.paidBridgeId,
        paymentAttemptId: v2Res.paymentAttemptId,
        quoteId: v2Res.quoteId,
        payableAuthorityId: v2Res.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: v2Res.providerPaymentRef,
        supportingProviderEventId: v2Res.supportingProviderEventId,
        supportingEvidenceHash: v2Res.supportingEvidenceHash,
        approvedAmountPaise: v2Res.capturedAmountPaise,
      });

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), v2Res.reservationId, evidenceV2.id]
        ),
        (err) => {
          assert.match(err.message, /V2_CANCELLATION_RELEASE_EXCLUDED/);
          return true;
        }
      );
    }

    // =========================================================================
    // T06: INVALID AMOUNT/CURRENCY, CONFLICTING CAPTURE, UNRESOLVED RECONCILIATION
    // =========================================================================
    {
      const paidResT6 = await createPaidReservation({nights: 2});
      const cancelInfoT6 = await cancelReservationV1(paidResT6.reservationId);

      // 6a. Approved amount exceeds captured ceiling
      const evidenceOverAmount = await insertSyntheticDecisionEvidence({
        reservationId: paidResT6.reservationId,
        cancellationEventId: cancelInfoT6.cancellationEventId,
        cancellationReleaseId: cancelInfoT6.cancellationReleaseId,
        paidBridgeId: paidResT6.paidBridgeId,
        paymentAttemptId: paidResT6.paymentAttemptId,
        quoteId: paidResT6.quoteId,
        payableAuthorityId: paidResT6.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT6.providerPaymentRef,
        supportingProviderEventId: paidResT6.supportingProviderEventId,
        supportingEvidenceHash: paidResT6.supportingEvidenceHash,
        approvedAmountPaise: paidResT6.capturedAmountPaise + 10000, // Exceeds ceiling!
      });

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT6.reservationId, evidenceOverAmount.id]
        ),
        (err) => {
          assert.match(err.message, /REFUND_AMOUNT_EXCEEDS_CAPTURE/);
          return true;
        }
      );

      // 6b-1. Natural conflicting capture transitions attempt to RECONCILIATION_REQUIRED
      const paidResT6b = await createPaidReservation({nights: 2});
      const cancelInfoT6b = await cancelReservationV1(paidResT6b.reservationId);

      await ingestProviderEvent(paymentWorker, {
        attemptId: paidResT6b.paymentAttemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_conflict_' + randomUUID(),
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: paidResT6b.capturedAmountPaise + 50000,
        reportedCurrency: 'INR',
        providerPaymentRef: 'pay_conflict_' + randomUUID(),
        providerOrderRef: paidResT6b.providerOrderRef,
        evidencePayload: { conflicting: true },
      });

      const validEvidenceT6 = await insertSyntheticDecisionEvidence({
        decisionRef: 'DEC-REF-VALID-' + randomUUID(),
        reservationId: paidResT6b.reservationId,
        cancellationEventId: cancelInfoT6b.cancellationEventId,
        cancellationReleaseId: cancelInfoT6b.cancellationReleaseId,
        paidBridgeId: paidResT6b.paidBridgeId,
        paymentAttemptId: paidResT6b.paymentAttemptId,
        quoteId: paidResT6b.quoteId,
        payableAuthorityId: paidResT6b.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT6b.providerPaymentRef,
        supportingProviderEventId: paidResT6b.supportingProviderEventId,
        supportingEvidenceHash: paidResT6b.supportingEvidenceHash,
        approvedAmountPaise: paidResT6b.capturedAmountPaise,
      });

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT6b.reservationId, validEvidenceT6.id]
        ),
        (err) => {
          assert.match(err.message, /PAYMENT_STATE_NOT_MATCHED_CAPTURE/);
          return true;
        }
      );

      // 6b-2. Unresolved reconciliation on matched attempt
      const paidResT6b2 = await createPaidReservation({nights: 2});
      const cancelInfoT6b2 = await cancelReservationV1(paidResT6b2.reservationId);

      await fixture.owner.query(
        `INSERT INTO canonical_payment_reconciliations (
          payment_attempt_id, reason, details, resolved
        ) VALUES ($1, 'AMOUNT_MISMATCH', '{}'::jsonb, false)`,
        [paidResT6b2.paymentAttemptId]
      );

      const validEvidenceT6b2 = await insertSyntheticDecisionEvidence({
        decisionRef: 'DEC-REF-VALID2-' + randomUUID(),
        reservationId: paidResT6b2.reservationId,
        cancellationEventId: cancelInfoT6b2.cancellationEventId,
        cancellationReleaseId: cancelInfoT6b2.cancellationReleaseId,
        paidBridgeId: paidResT6b2.paidBridgeId,
        paymentAttemptId: paidResT6b2.paymentAttemptId,
        quoteId: paidResT6b2.quoteId,
        payableAuthorityId: paidResT6b2.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT6b2.providerPaymentRef,
        supportingProviderEventId: paidResT6b2.supportingProviderEventId,
        supportingEvidenceHash: paidResT6b2.supportingEvidenceHash,
        approvedAmountPaise: paidResT6b2.capturedAmountPaise,
      });

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT6b2.reservationId, validEvidenceT6b2.id]
        ),
        (err) => {
          assert.match(err.message, /PAYMENT_RECONCILIATION_UNRESOLVED/);
          return true;
        }
      );

      // Resolve reconciliation
      await fixture.owner.query(
        `UPDATE canonical_payment_reconciliations SET resolved = true WHERE payment_attempt_id = $1`,
        [paidResT6b2.paymentAttemptId]
      );

      // 6c. Visible cross-attempt alias of same capture reference
      const resOther = await createPaidReservation({nights: 2});
      await ingestProviderEvent(paymentWorker, {
        attemptId: resOther.paymentAttemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_alias_' + randomUUID(),
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: resOther.capturedAmountPaise,
        reportedCurrency: 'INR',
        providerPaymentRef: paidResT6b2.providerPaymentRef,
        providerOrderRef: resOther.providerOrderRef,
        evidencePayload: { alias: true },
      });

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT6b2.reservationId, validEvidenceT6b2.id]
        ),
        (err) => {
          assert.match(err.message, /CAPTURE_CROSS_ATTEMPT_ALIAS_AMBIGUOUS/);
          return true;
        }
      );
    }

    // =========================================================================
    // T07: EQUIVALENT DUPLICATE CAPTURES YIELD ONE CEILING
    // =========================================================================
    {
      // 7a. Attempting to claim approvedAmount = 2 * capturedAmountPaise must be rejected!
      const paidResT7a = await createPaidReservation({nights: 2});
      const cancelInfoT7a = await cancelReservationV1(paidResT7a.reservationId);

      await ingestProviderEvent(paymentWorker, {
        attemptId: paidResT7a.paymentAttemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_dup_a_' + randomUUID(),
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: paidResT7a.capturedAmountPaise,
        reportedCurrency: 'INR',
        providerPaymentRef: paidResT7a.providerPaymentRef,
        providerOrderRef: paidResT7a.providerOrderRef,
        evidencePayload: {pay_id: paidResT7a.providerPaymentRef, amount: paidResT7a.capturedAmountPaise, retry: true},
      });

      const evidenceDoubleAmount = await insertSyntheticDecisionEvidence({
        reservationId: paidResT7a.reservationId,
        cancellationEventId: cancelInfoT7a.cancellationEventId,
        cancellationReleaseId: cancelInfoT7a.cancellationReleaseId,
        paidBridgeId: paidResT7a.paidBridgeId,
        paymentAttemptId: paidResT7a.paymentAttemptId,
        quoteId: paidResT7a.quoteId,
        payableAuthorityId: paidResT7a.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT7a.providerPaymentRef,
        supportingProviderEventId: paidResT7a.supportingProviderEventId,
        supportingEvidenceHash: paidResT7a.supportingEvidenceHash,
        approvedAmountPaise: paidResT7a.capturedAmountPaise * 2, // Doubled amount
      });

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT7a.reservationId, evidenceDoubleAmount.id]
        ),
        (err) => {
          assert.match(err.message, /REFUND_AMOUNT_EXCEEDS_CAPTURE/);
          return true;
        }
      );

      // 7b. Approved amount equal to single ceiling succeeds!
      const paidResT7b = await createPaidReservation({nights: 2});
      const cancelInfoT7b = await cancelReservationV1(paidResT7b.reservationId);

      await ingestProviderEvent(paymentWorker, {
        attemptId: paidResT7b.paymentAttemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_dup_b_' + randomUUID(),
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: paidResT7b.capturedAmountPaise,
        reportedCurrency: 'INR',
        providerPaymentRef: paidResT7b.providerPaymentRef,
        providerOrderRef: paidResT7b.providerOrderRef,
        evidencePayload: {pay_id: paidResT7b.providerPaymentRef, amount: paidResT7b.capturedAmountPaise, retry: true},
      });

      const capCount = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_provider_events
           WHERE payment_attempt_id = $1 AND normalized_event_type = 'PAYMENT_CAPTURED' AND status = 'PROCESSED'`,
          [paidResT7b.paymentAttemptId]
        )
      ).rows[0].count;
      assert.equal(Number(capCount), 2, 'Two duplicate capture events recorded');

      const evidenceSingleCeiling = await insertSyntheticDecisionEvidence({
        decisionRef: 'DEC-T7-SINGLE-' + randomUUID(),
        reservationId: paidResT7b.reservationId,
        cancellationEventId: cancelInfoT7b.cancellationEventId,
        cancellationReleaseId: cancelInfoT7b.cancellationReleaseId,
        paidBridgeId: paidResT7b.paidBridgeId,
        paymentAttemptId: paidResT7b.paymentAttemptId,
        quoteId: paidResT7b.quoteId,
        payableAuthorityId: paidResT7b.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT7b.providerPaymentRef,
        supportingProviderEventId: paidResT7b.supportingProviderEventId,
        supportingEvidenceHash: paidResT7b.supportingEvidenceHash,
        approvedAmountPaise: paidResT7b.capturedAmountPaise,
      });

      const authT7 = (
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT7b.reservationId, evidenceSingleCeiling.id]
        )
      ).rows[0];
      assert.ok(authT7);
      assert.equal(BigInt(authT7.approved_amount_paise), BigInt(paidResT7b.capturedAmountPaise));
      assert.equal(authT7.replayed, false);
    }

    // =========================================================================
    // T08: EXACT AUTHORIZED REPLAY AFTER LATER FINANCIAL OBSERVATIONS
    // =========================================================================
    {
      const paidResT8 = await createPaidReservation({nights: 2});
      const cancelInfoT8 = await cancelReservationV1(paidResT8.reservationId);

      const decisionEvidenceT8 = await insertSyntheticDecisionEvidence({
        reservationId: paidResT8.reservationId,
        cancellationEventId: cancelInfoT8.cancellationEventId,
        cancellationReleaseId: cancelInfoT8.cancellationReleaseId,
        paidBridgeId: paidResT8.paidBridgeId,
        paymentAttemptId: paidResT8.paymentAttemptId,
        quoteId: paidResT8.quoteId,
        payableAuthorityId: paidResT8.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT8.providerPaymentRef,
        supportingProviderEventId: paidResT8.supportingProviderEventId,
        supportingEvidenceHash: paidResT8.supportingEvidenceHash,
        approvedAmountPaise: paidResT8.capturedAmountPaise,
      });

      const cmdT8 = randomUUID();
      const firstAuth = (
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [cmdT8, paidResT8.reservationId, decisionEvidenceT8.id]
        )
      ).rows[0];
      assert.equal(firstAuth.replayed, false);

      // Add a later conflicting observation on the SAME payment attempt
      await ingestProviderEvent(paymentWorker, {
        attemptId: paidResT8.paymentAttemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_conflict_later_' + randomUUID(),
        normalizedEventType: 'PAYMENT_CAPTURED',
        reportedAmountPaise: paidResT8.capturedAmountPaise + 10000,
        reportedCurrency: 'INR',
        providerPaymentRef: 'pay_conflict_later_' + randomUUID(),
        providerOrderRef: paidResT8.providerOrderRef,
        evidencePayload: { conflicting_later: true },
      });

      // Verify attempt is now in RECONCILIATION_REQUIRED
      const attemptRowT8 = (
        await fixture.owner.query(`SELECT * FROM canonical_payment_attempts WHERE id = $1`, [paidResT8.paymentAttemptId])
      ).rows[0];
      assert.equal(attemptRowT8.payment_state, 'RECONCILIATION_REQUIRED');

      // 8a. Replay with identical command: succeeds with replayed = true despite later conflicting event on attempt
      const replayedAuth = (
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [cmdT8, paidResT8.reservationId, decisionEvidenceT8.id]
        )
      ).rows[0];
      assert.equal(replayedAuth.replayed, true);
      assert.equal(replayedAuth.authorization_id, firstAuth.authorization_id);
      assert.equal(replayedAuth.command_id, firstAuth.command_id);
      assert.equal(replayedAuth.approved_amount_paise, firstAuth.approved_amount_paise);

      // Verify exactly 1 authorization row exists (0 new rows added)
      const authCountT8 = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
          [paidResT8.reservationId]
        )
      ).rows[0].count;
      assert.equal(Number(authCountT8), 1, 'Replay must not insert new authorization row');

      // 8b. Replay with changed semantics (different reservationId under same commandId)
      const unrelatedRes = await createPaidReservation({nights: 2});
      const cancelInfoUnrelated = await cancelReservationV1(unrelatedRes.reservationId);
      const evidenceUnrelated = await insertSyntheticDecisionEvidence({
        reservationId: unrelatedRes.reservationId,
        cancellationEventId: cancelInfoUnrelated.cancellationEventId,
        cancellationReleaseId: cancelInfoUnrelated.cancellationReleaseId,
        paidBridgeId: unrelatedRes.paidBridgeId,
        paymentAttemptId: unrelatedRes.paymentAttemptId,
        quoteId: unrelatedRes.quoteId,
        payableAuthorityId: unrelatedRes.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: unrelatedRes.providerPaymentRef,
        supportingProviderEventId: unrelatedRes.supportingProviderEventId,
        supportingEvidenceHash: unrelatedRes.supportingEvidenceHash,
        approvedAmountPaise: unrelatedRes.capturedAmountPaise,
      });

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [cmdT8, unrelatedRes.reservationId, evidenceUnrelated.id]
        ),
        (err) => {
          assert.match(err.message, /REFUND_COMMAND_CONFLICT/);
          return true;
        }
      );

      // 8c. Unauthorized role attempting replay of known command
      await assert.rejects(
        () => stays.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [cmdT8, paidResT8.reservationId, decisionEvidenceT8.id]
        ),
        (err) => {
          assert.equal(err.code, '42501');
          return true;
        }
      );
    }

    // =========================================================================
    // T09: CONCURRENCY ON TWO REAL CONNECTIONS: IDENTICAL, DISTINCT, AND CLEANUP
    // =========================================================================
    {
      // 9-pre. Demonstrate configured observer SQL timeout is effective via bounded delayed query
      {
        const timeoutTestClient = await fixture.owner.connect();
        try {
          await timeoutTestClient.query("SET statement_timeout = '200ms'");
          const stCheck = (await timeoutTestClient.query("SELECT current_setting('statement_timeout') AS st")).rows[0].st;
          assert.ok(stCheck === '200ms' || stCheck === '0.2s', `Configured setting must be nonzero and match limit, got ${stCheck}`);

          let timeoutErr = null;
          try {
            await timeoutTestClient.query("SELECT pg_sleep(1)");
          } catch (err) {
            timeoutErr = err;
          }
          assert.ok(timeoutErr, 'Delayed SQL must be interrupted by statement_timeout');
          assert.equal(timeoutErr.code, '57014', 'SQLSTATE must be 57014 (query_canceled)');
          assert.match(timeoutErr.message, /canceling statement due to statement timeout/);

          const txStatus = typeof timeoutTestClient.getTransactionStatus === 'function' ? timeoutTestClient.getTransactionStatus() : 'I';
          assert.equal(txStatus, 'I', 'Transaction status must be idle after query cancellation');
          timeoutTestClient.release();
        } catch (err) {
          try {
            timeoutTestClient.release(err);
          } catch (e) {}
          throw err;
        }
      }

      // Local race runner enforcing timeouts, dedicated observer client, and ordered cleanup
      const runTwoConnectionRace = async ({
        cmdA,
        cmdB,
        reservationId,
        evidenceId,
        triggerDeliberateObserverFailure = false,
        injectCleanupVerificationFailure = null,
      }) => {
        let connA = null;
        let connB = null;
        let observerClient = null;
        let connBPromise = null;
        let settledB = false;
        let resA = null;
        let resB = null;
        let errB = null;
        let primaryError = null;
        let terminalActionA = null;
        let terminalActionB = null;
        let terminalActionObs = null;

        try {
          // Protect partial acquisition: acquire connA, connB, and dedicated observerClient
          connA = await refundIssuer.connect();
          connB = await refundIssuer.connect();
          observerClient = await fixture.owner.connect();

          const pidA = (await connA.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          const pidB = (await connB.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

          // Configure supported session-level timeouts on dedicated observer connection
          await observerClient.query("SET statement_timeout = '5000ms'");
          await observerClient.query("SET lock_timeout = '5000ms'");
          const obsSt = (await observerClient.query("SELECT current_setting('statement_timeout') AS st")).rows[0].st;
          assert.ok(obsSt === '5s' || obsSt === '5000ms', `Effective observer statement_timeout must be 5000ms, got ${obsSt}`);
          const obsLt = (await observerClient.query("SELECT current_setting('lock_timeout') AS lt")).rows[0].lt;
          assert.ok(obsLt === '5s' || obsLt === '5000ms', `Effective observer lock_timeout must be 5000ms, got ${obsLt}`);

          // Session-level and transaction-local timeouts on relevant connections A and B
          await connA.query("SET statement_timeout = '10000ms'");
          await connA.query("SET lock_timeout = '10000ms'");
          await connA.query('BEGIN');
          await connA.query("SET LOCAL statement_timeout = '10000ms'");
          await connA.query("SET LOCAL lock_timeout = '10000ms'");
          const stA = (await connA.query("SELECT current_setting('statement_timeout') AS st")).rows[0].st;
          assert.ok(stA && stA !== '0', 'Effective statement_timeout must be non-zero on connA');

          await connB.query("SET statement_timeout = '10000ms'");
          await connB.query("SET lock_timeout = '10000ms'");
          await connB.query('BEGIN');
          await connB.query("SET LOCAL statement_timeout = '10000ms'");
          await connB.query("SET LOCAL lock_timeout = '10000ms'");
          const stB = (await connB.query("SELECT current_setting('statement_timeout') AS st")).rows[0].st;
          assert.ok(stB && stB !== '0', 'Effective statement_timeout must be non-zero on connB');

          // Connection A executes issuance but holds transaction open (holding row locks)
          resA = (
            await connA.query(
              `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
              [cmdA, reservationId, evidenceId]
            )
          ).rows[0];

          // Connection B starts command B in background transaction with immediate outcome handler attached
          connBPromise = connB.query(
            `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
            [cmdB, reservationId, evidenceId]
          ).then(
            (r) => {
              settledB = true;
              resB = r.rows[0];
              return resB;
            },
            (e) => {
              settledB = true;
              errB = e;
              throw e;
            }
          );
          // Suppress unhandled rejection while B is blocked waiting on lock
          connBPromise.catch(() => {});

          // Actively observe B waiting on Lock specifically blocked by A using dedicated observer client
          let observedBlocker = false;
          const maxAttempts = 50;
          const pollIntervalMs = 50;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const act = (await observerClient.query(
              `SELECT wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
               FROM pg_stat_activity
               WHERE pid = $1`,
              [pidB]
            )).rows[0];

            if (
              act &&
              act.wait_event_type === 'Lock' &&
              Array.isArray(act.blockers) &&
              act.blockers.map(Number).includes(Number(pidA))
            ) {
              observedBlocker = true;
              break;
            }
            await new Promise((r) => setTimeout(r, pollIntervalMs));
          }

          assert.equal(
            observedBlocker,
            true,
            'Connection B must be observed waiting on Lock with Connection A in pg_blocking_pids before A commits'
          );

          if (triggerDeliberateObserverFailure) {
            throw new Error('DELIBERATE_OBSERVER_FAILURE: Simulated assertion failure during lock observation');
          }

          // Connection A commits, releasing its locks
          await connA.query('COMMIT');

          // Settle Connection B
          try {
            await connBPromise;
          } catch (e) {
            // errB is already captured
          }

          if (cmdA === cmdB) {
            // Identical commands: B commits its replay recovery
            await connB.query('COMMIT');
          } else {
            // Distinct commands: B rolls back its rejected transaction
            await connB.query('ROLLBACK');
          }

          return {
            resA,
            resB,
            errB,
            pidA,
            pidB,
          };
        } catch (err) {
          primaryError = err;
          throw err;
        } finally {
          const cleanupErrors = [];

          // 1. Roll back A first to release its locks (allowing B to unblock if still waiting)
          if (connA) {
            try {
              await connA.query('ROLLBACK');
            } catch (rbErr) {
              cleanupErrors.push(rbErr);
            }
          }

          // 2. Observe and settle B's already-started query
          if (connBPromise && !settledB) {
            try {
              await connBPromise;
            } catch (e) {
              // query settled
            }
          }

          // 3. Roll back B after its query settles
          if (connB) {
            try {
              await connB.query('ROLLBACK');
            } catch (rbErr) {
              cleanupErrors.push(rbErr);
            }
          }

          // 4 & 5. Verify transaction cleanliness via getTransactionStatus() === 'I'; release or discard each client exactly once
          if (connA && !terminalActionA) {
            try {
              if (injectCleanupVerificationFailure === 'connA') {
                throw new Error('INJECTED_CLEANUP_VERIFICATION_FAILURE: Simulated failure during connA transaction status verification');
              }
              const txStatusA = typeof connA.getTransactionStatus === 'function' ? connA.getTransactionStatus() : null;
              if (txStatusA !== 'I') {
                throw new Error(`TRANSACTION_STATUS_UNCLEAN: Expected idle transaction status 'I', observed '${txStatusA}'`);
              }
              await connA.query('SELECT 1');
              terminalActionA = 'released';
              connA.release();
            } catch (cleanErrA) {
              cleanupErrors.push(cleanErrA);
              terminalActionA = 'discarded';
              try {
                connA.release(cleanErrA);
              } catch (discardErrA) {
                cleanupErrors.push(discardErrA);
              }
            }
          }

          if (connB && !terminalActionB) {
            try {
              if (injectCleanupVerificationFailure === 'connB') {
                throw new Error('INJECTED_CLEANUP_VERIFICATION_FAILURE: Simulated failure during connB transaction status verification');
              }
              const txStatusB = typeof connB.getTransactionStatus === 'function' ? connB.getTransactionStatus() : null;
              if (txStatusB !== 'I') {
                throw new Error(`TRANSACTION_STATUS_UNCLEAN: Expected idle transaction status 'I', observed '${txStatusB}'`);
              }
              await connB.query('SELECT 1');
              terminalActionB = 'released';
              connB.release();
            } catch (cleanErrB) {
              cleanupErrors.push(cleanErrB);
              terminalActionB = 'discarded';
              try {
                connB.release(cleanErrB);
              } catch (discardErrB) {
                cleanupErrors.push(discardErrB);
              }
            }
          }

          if (observerClient && !terminalActionObs) {
            try {
              const txStatusObs = typeof observerClient.getTransactionStatus === 'function' ? observerClient.getTransactionStatus() : 'I';
              if (txStatusObs !== 'I') {
                throw new Error(`TRANSACTION_STATUS_UNCLEAN: Expected observer idle transaction status 'I', observed '${txStatusObs}'`);
              }
              terminalActionObs = 'released';
              observerClient.release();
            } catch (cleanErrObs) {
              cleanupErrors.push(cleanErrObs);
              terminalActionObs = 'discarded';
              try {
                observerClient.release(cleanErrObs);
              } catch (discardErrObs) {
                cleanupErrors.push(discardErrObs);
              }
            }
          }

          // 8. Preserve cleanup failures alongside primary failure
          if (cleanupErrors.length > 0) {
            if (!primaryError) {
              const cleanErr = new Error(`CLEANUP_FAILED: ${cleanupErrors.map((e) => e.message).join('; ')}`);
              cleanErr.cleanupErrors = cleanupErrors;
              cleanErr.cause = cleanupErrors[0];
              throw cleanErr;
            } else {
              primaryError.cleanupErrors = cleanupErrors;
              primaryError.cause = cleanupErrors[0];
            }
          }
        }
      };

      // 9a. Identical-command race on two real connections: converge cleanly
      const paidResT9 = await createPaidReservation({nights: 2});
      const cancelInfoT9 = await cancelReservationV1(paidResT9.reservationId);
      const evidenceT9 = await insertSyntheticDecisionEvidence({
        reservationId: paidResT9.reservationId,
        cancellationEventId: cancelInfoT9.cancellationEventId,
        cancellationReleaseId: cancelInfoT9.cancellationReleaseId,
        paidBridgeId: paidResT9.paidBridgeId,
        paymentAttemptId: paidResT9.paymentAttemptId,
        quoteId: paidResT9.quoteId,
        payableAuthorityId: paidResT9.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT9.providerPaymentRef,
        supportingProviderEventId: paidResT9.supportingProviderEventId,
        supportingEvidenceHash: paidResT9.supportingEvidenceHash,
        approvedAmountPaise: paidResT9.capturedAmountPaise,
      });

      const identicalCmd = randomUUID();
      const raceResult9a = await runTwoConnectionRace({
        cmdA: identicalCmd,
        cmdB: identicalCmd,
        reservationId: paidResT9.reservationId,
        evidenceId: evidenceT9.id,
      });

      assert.equal(raceResult9a.resA.authorization_id, raceResult9a.resB.authorization_id);
      const replays = [raceResult9a.resA.replayed, raceResult9a.resB.replayed].sort();
      assert.deepEqual(replays, [false, true], 'One insertion, one recovery replay');

      const countAuthT9 = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
          [paidResT9.reservationId]
        )
      ).rows[0].count;
      assert.equal(Number(countAuthT9), 1, 'Exactly one authorization must exist');

      // 9b. Competing distinct-command contention on two real connections using FRESH subject
      const paidResT9b = await createPaidReservation({nights: 2});
      const cancelInfoT9b = await cancelReservationV1(paidResT9b.reservationId);
      const evidenceT9b = await insertSyntheticDecisionEvidence({
        reservationId: paidResT9b.reservationId,
        cancellationEventId: cancelInfoT9b.cancellationEventId,
        cancellationReleaseId: cancelInfoT9b.cancellationReleaseId,
        paidBridgeId: paidResT9b.paidBridgeId,
        paymentAttemptId: paidResT9b.paymentAttemptId,
        quoteId: paidResT9b.quoteId,
        payableAuthorityId: paidResT9b.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT9b.providerPaymentRef,
        supportingProviderEventId: paidResT9b.supportingProviderEventId,
        supportingEvidenceHash: paidResT9b.supportingEvidenceHash,
        approvedAmountPaise: paidResT9b.capturedAmountPaise,
      });

      const snapshotBeforeT9b = await takeScopedDomainSnapshot(paidResT9b);

      const cmdA = randomUUID();
      const cmdB = randomUUID();
      assert.notEqual(cmdA, cmdB, 'Commands must be distinct');

      const raceResult9b = await runTwoConnectionRace({
        cmdA,
        cmdB,
        reservationId: paidResT9b.reservationId,
        evidenceId: evidenceT9b.id,
      });

      assert.ok(raceResult9b.resA && raceResult9b.resA.authorization_id);
      assert.equal(raceResult9b.resA.replayed, false);
      assert.ok(raceResult9b.errB, 'Competing distinct command B must be rejected');
      assert.match(raceResult9b.errB.message, /REFUND_ALREADY_AUTHORIZED/);

      // After both settle: exactly one authorization exists and belongs to commandA
      const authRows9b = (
        await fixture.owner.query(
          `SELECT * FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
          [paidResT9b.reservationId]
        )
      ).rows;
      assert.equal(authRows9b.length, 1, 'Exactly one durable authorization must exist');
      assert.equal(authRows9b[0].command_id, cmdA, 'Persisted authorization must belong to command A');
      assert.equal(authRows9b[0].id, raceResult9b.resA.authorization_id);

      // No authorization exists for commandB
      const countCmdB = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [cmdB]
        )
      ).rows[0].count;
      assert.equal(Number(countCmdB), 0, 'No authorization row may exist for competing command B');

      // Exact replay of commandA returns the same authorization, replayed=true
      const replayA = (
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [cmdA, paidResT9b.reservationId, evidenceT9b.id]
        )
      ).rows[0];
      assert.equal(replayA.authorization_id, raceResult9b.resA.authorization_id);
      assert.equal(replayA.replayed, true, 'Replay of command A must return replayed=true');
      assert.equal(replayA.command_id, cmdA);

      // Declared scoped existing-domain snapshot is unchanged
      const snapshotAfterT9b = await takeScopedDomainSnapshot(paidResT9b);
      assert.deepEqual(
        snapshotBeforeT9b,
        snapshotAfterT9b,
        'Declared scoped existing-domain snapshot must be unchanged after distinct race settlement'
      );

      // Helper: Normal T09c caller validator (inspects error message AND verifies zero unexpected cleanup errors)
      const validateT09cNormalSuccess = (err) => {
        assert.ok(err, 'Expected deliberate observer failure error');
        assert.match(err.message, /DELIBERATE_OBSERVER_FAILURE/);
        assert.ok(
          !err.cleanupErrors || err.cleanupErrors.length === 0,
          `Unexpected cleanup errors remained: ${err.cleanupErrors?.map((e) => e.message).join('; ')}`
        );
        return true;
      };

      // 9c. Controlled deliberate observer-failure demonstration through actual race/cleanup path
      const paidResFail = await createPaidReservation({nights: 2});
      const cancelInfoFail = await cancelReservationV1(paidResFail.reservationId);
      const evidenceFail = await insertSyntheticDecisionEvidence({
        reservationId: paidResFail.reservationId,
        cancellationEventId: cancelInfoFail.cancellationEventId,
        cancellationReleaseId: cancelInfoFail.cancellationReleaseId,
        paidBridgeId: paidResFail.paidBridgeId,
        paymentAttemptId: paidResFail.paymentAttemptId,
        quoteId: paidResFail.quoteId,
        payableAuthorityId: paidResFail.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResFail.providerPaymentRef,
        supportingProviderEventId: paidResFail.supportingProviderEventId,
        supportingEvidenceHash: paidResFail.supportingEvidenceHash,
        approvedAmountPaise: paidResFail.capturedAmountPaise,
      });

      const snapshotBeforeFail = await takeScopedDomainSnapshot(paidResFail);
      const failCmdA = randomUUID();
      const failCmdB = randomUUID();

      await assert.rejects(
        () => runTwoConnectionRace({
          cmdA: failCmdA,
          cmdB: failCmdB,
          reservationId: paidResFail.reservationId,
          evidenceId: evidenceFail.id,
          triggerDeliberateObserverFailure: true,
        }),
        (err) => validateT09cNormalSuccess(err)
      );

      // Require no surviving authorization from the rolled-back race
      const authCountFailA = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failCmdA]
        )
      ).rows[0].count;
      assert.equal(Number(authCountFailA), 0, 'No surviving authorization for failed command A');

      const authCountFailB = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failCmdB]
        )
      ).rows[0].count;
      assert.equal(Number(authCountFailB), 0, 'No surviving authorization for failed command B');

      const authCountFailRes = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
          [paidResFail.reservationId]
        )
      ).rows[0].count;
      assert.equal(Number(authCountFailRes), 0, 'No surviving authorization for scoped reservation');

      // Require scoped restoration
      const snapshotAfterFail = await takeScopedDomainSnapshot(paidResFail);
      assert.deepEqual(
        snapshotBeforeFail,
        snapshotAfterFail,
        'Deliberate observer failure rollback must leave all 16 scoped domain tables unchanged'
      );

      // Require no retained open transaction or active blocked query on fixture backends
      const activeBackends = (
        await fixture.owner.query(
          `SELECT count(*) FROM pg_stat_activity
           WHERE state IN ('idle in transaction', 'idle in transaction (aborted)', 'active')
             AND pid != pg_backend_pid()
             AND usename = 'encho_refund_issuer'`
        )
      ).rows[0].count;
      assert.equal(Number(activeBackends), 0, 'No active or in-transaction issuer backends may be retained after cleanup');

      // 9c-neg. Cleanup-error negative control: injected cleanup verification failure
      const failNegCmdA = randomUUID();
      const failNegCmdB = randomUUID();
      let caughtNegError = null;
      try {
        await runTwoConnectionRace({
          cmdA: failNegCmdA,
          cmdB: failNegCmdB,
          reservationId: paidResFail.reservationId,
          evidenceId: evidenceFail.id,
          triggerDeliberateObserverFailure: true,
          injectCleanupVerificationFailure: 'connA',
        });
      } catch (err) {
        caughtNegError = err;
      }

      assert.ok(caughtNegError, 'Must reject when deliberate observer failure is triggered with injected cleanup error');
      assert.match(caughtNegError.message, /DELIBERATE_OBSERVER_FAILURE/, 'Original observer error must remain visible');
      assert.ok(Array.isArray(caughtNegError.cleanupErrors) && caughtNegError.cleanupErrors.length > 0, 'Cleanup errors must be preserved');
      assert.match(caughtNegError.cleanupErrors[0].message, /INJECTED_CLEANUP_VERIFICATION_FAILURE/, 'Cleanup error cause must remain visible');

      // Ordinary T09c success validator must reject that outcome
      assert.throws(
        () => validateT09cNormalSuccess(caughtNegError),
        (valErr) => {
          assert.match(valErr.message, /Unexpected cleanup errors remained/);
          return true;
        },
        'Ordinary T09c success validator must reject outcome when cleanup error is present'
      );

      // Verify actual client disposal and restored fixture state
      const authCountNegA = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failNegCmdA]
        )
      ).rows[0].count;
      assert.equal(Number(authCountNegA), 0, 'No surviving authorization for failed command A');

      const authCountNegB = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failNegCmdB]
        )
      ).rows[0].count;
      assert.equal(Number(authCountNegB), 0, 'No surviving authorization for failed command B');

      const activeBackendsNeg = (
        await fixture.owner.query(
          `SELECT count(*) FROM pg_stat_activity
           WHERE state IN ('idle in transaction', 'idle in transaction (aborted)', 'active')
             AND pid != pg_backend_pid()
             AND usename = 'encho_refund_issuer'`
        )
      ).rows[0].count;
      assert.equal(Number(activeBackendsNeg), 0, 'No active or in-transaction issuer backends retained after cleanup negative control');

      const snapshotAfterNegCleanup = await takeScopedDomainSnapshot(paidResFail);
      assert.deepEqual(
        snapshotBeforeFail,
        snapshotAfterNegCleanup,
        'Cleanup-error negative control must leave all 16 scoped domain tables unchanged'
      );

      // 9d. Sequential distinct command attempt against already-authorized reservation
      const sequentialCmd = randomUUID();
      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [sequentialCmd, paidResT9.reservationId, evidenceT9.id]
        ),
        (err) => {
          assert.match(err.message, /REFUND_ALREADY_AUTHORIZED/);
          return true;
        }
      );
    }

    // =========================================================================
    // T10: IMMUTABILITY, STRUCTURED INJECTED ROLLBACKS, AND ZERO DOMAIN MUTATION
    // =========================================================================
    {
      const paidResT10 = await createPaidReservation({nights: 2});
      const cancelInfoT10 = await cancelReservationV1(paidResT10.reservationId);

      const evidenceT10 = await insertSyntheticDecisionEvidence({
        reservationId: paidResT10.reservationId,
        cancellationEventId: cancelInfoT10.cancellationEventId,
        cancellationReleaseId: cancelInfoT10.cancellationReleaseId,
        paidBridgeId: paidResT10.paidBridgeId,
        paymentAttemptId: paidResT10.paymentAttemptId,
        quoteId: paidResT10.quoteId,
        payableAuthorityId: paidResT10.payableAuthorityId,
        providerOriginKind: 'RAZORPAY',
        providerPaymentRef: paidResT10.providerPaymentRef,
        supportingProviderEventId: paidResT10.supportingProviderEventId,
        supportingEvidenceHash: paidResT10.supportingEvidenceHash,
        approvedAmountPaise: paidResT10.capturedAmountPaise,
      });

      // Snapshot all 16 scoped domain tables before any operations
      const snapshotInitial = await takeScopedDomainSnapshot(paidResT10);

      // -----------------------------------------------------------------------
      // T10A: Outer transaction failure: verify issuance witness, replay witness,
      // invalid cast 22P02 abort, complete rollback, 16 tables unchanged,
      // and negative control rejecting pre-issuance 22P02 substitution.
      // -----------------------------------------------------------------------
      const runOuterRollbackDemonstration = async ({
        client,
        cmd,
        resId,
        evId,
        expectedEv,
        expectedPaid,
        preIssuanceQuery = null,
      }) => {
        let executionError = null;
        let rollbackError = null;

        // Distinct stage evidence initialized as incomplete
        const stageEvidence = {
          initialIssuanceCompleted: false,
          replayWitnessCompleted: false,
          postWitnessAbortDispatched: false,
        };

        await client.query('BEGIN');
        try {
          if (preIssuanceQuery) {
            await client.query(preIssuanceQuery);
          }
          const res1 = (
            await client.query(
              `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
              [cmd, resId, evId]
            )
          ).rows[0];

          // 3. Retain and assert returned row before proceeding
          assert.ok(res1 && res1.authorization_id, 'authorization_id must be present');
          assert.equal(res1.replayed, false, 'replayed must be false on first call');
          assert.equal(res1.command_id, cmd, 'command_id must match');
          assert.equal(res1.decision_evidence_id, evId, 'decision_evidence_id must match');
          assert.equal(res1.reservation_id, resId, 'reservation_id must match');
          assert.equal(res1.cancellation_release_id, expectedEv.cancellation_release_id, 'cancellation_release_id must match');
          assert.equal(res1.paid_bridge_id, expectedPaid.paidBridgeId, 'paid_bridge_id must match');
          assert.equal(res1.payment_attempt_id, expectedPaid.paymentAttemptId, 'payment_attempt_id must match');
          assert.equal(res1.provider_origin_kind, 'RAZORPAY', 'provider_origin_kind must match');
          assert.equal(res1.provider_payment_ref, expectedPaid.providerPaymentRef, 'provider_payment_ref must match');
          assert.equal(BigInt(res1.approved_amount_paise), BigInt(expectedPaid.capturedAmountPaise), 'approved_amount_paise must match');
          assert.equal(res1.currency, 'INR', 'currency must match');
          assert.equal(res1.decision_version, expectedEv.version, 'decision_version must match');
          assert.equal(res1.decision_digest, expectedEv.decision_digest, 'decision_digest must match');
          assert.equal(res1.issuing_role, 'encho_refund_issuer', 'issuing_role must match');
          assert.equal(res1.issuing_principal, 'encho_refund_issuer', 'issuing_principal must match');
          assert.ok(res1.created_at, 'created_at must be present');

          stageEvidence.initialIssuanceCompleted = true;

          // 4-5. On SAME client and transaction, repeat call to witness restricted replay
          const res2 = (
            await client.query(
              `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
              [cmd, resId, evId]
            )
          ).rows[0];

          assert.ok(res2 && res2.authorization_id, 'Replay row must exist with authorization_id');
          assert.equal(res2.replayed, true, 'Replay replayed must be true');

          // Compare replay's returned immutable projection with original, excluding only replayed (including created_at)
          const { replayed: _r1, ...proj1 } = res1;
          const { replayed: _r2, ...proj2 } = res2;
          assert.deepEqual(proj1, proj2, 'Immutable projection of replay must match original issuance exactly (including created_at)');

          stageEvidence.replayWitnessCompleted = true;

          // 6. Execute intended PostgreSQL invalid cast after both witnesses succeed
          stageEvidence.postWitnessAbortDispatched = true;
          await client.query(`SELECT 'intentional_abort'::int`);
          await client.query('COMMIT');
          throw new Error('UNEXPECTED_COMMIT: Intentional abort did not fail transaction');
        } catch (err) {
          executionError = err;
          // 8. Roll back transaction, preserving original execution error if rollback also fails
          try {
            await client.query('ROLLBACK');
          } catch (rbErr) {
            rollbackError = rbErr;
          }
          if (rollbackError) {
            const combinedErr = new Error(`ROLLBACK_FAILED: ${rollbackError.message} (original execution error: ${executionError.message})`);
            combinedErr.cause = executionError;
            combinedErr.rollbackError = rollbackError;
            throw combinedErr;
          }

          // Stage validation: require initial issuance, replay witness, and post-witness abort stages
          if (
            !stageEvidence.initialIssuanceCompleted ||
            !stageEvidence.replayWitnessCompleted ||
            !stageEvidence.postWitnessAbortDispatched
          ) {
            const stageErr = new Error(
              `STAGE_VALIDATION_FAILED: Incomplete demonstration stages (initialIssuanceCompleted=${stageEvidence.initialIssuanceCompleted}, replayWitnessCompleted=${stageEvidence.replayWitnessCompleted}, postWitnessAbortDispatched=${stageEvidence.postWitnessAbortDispatched}). Underlying error: ${executionError.message}`
            );
            stageErr.code = 'STAGE_VALIDATION_FAILED';
            stageErr.stageEvidence = stageEvidence;
            stageErr.underlyingError = executionError;
            stageErr.cause = executionError;
            throw stageErr;
          }

          // 7. Assert SQLSTATE 22P02 and intentional_abort marker in underlying error
          assert.equal(executionError.code, '22P02', 'SQLSTATE must be 22P02');
          assert.match(executionError.message, /intentional_abort/, 'Error message must contain intentional_abort');
          return {
            witnessed: true,
            stageEvidence,
            error: executionError,
          };
        }
      };

      // Positive execution of T10A
      const failCmdA = randomUUID();
      const clientA = await refundIssuer.connect();
      try {
        await runOuterRollbackDemonstration({
          client: clientA,
          cmd: failCmdA,
          resId: paidResT10.reservationId,
          evId: evidenceT10.id,
          expectedEv: evidenceT10,
          expectedPaid: paidResT10,
          preIssuanceQuery: null,
        });
      } finally {
        clientA.release();
      }

      // 9. Observer assertions
      const failedAuthCountA = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failCmdA]
        )
      ).rows[0].count;
      assert.equal(Number(failedAuthCountA), 0, 'Rolled back transaction must leave 0 authorization rows for command');

      const failedAuthCountSubjectA = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
          [paidResT10.reservationId]
        )
      ).rows[0].count;
      assert.equal(Number(failedAuthCountSubjectA), 0, 'Rolled back transaction must leave 0 authorization rows for scoped subject');

      const snapshotAfterA = await takeScopedDomainSnapshot(paidResT10);
      assert.deepEqual(snapshotInitial, snapshotAfterA, 'T10A rollback must leave all 16 scoped domain tables unchanged');

      // Committed negative control: identical marker pre-issuance SELECT 'intentional_abort'::int must fail stage validation
      const failCmdNeg = randomUUID();
      const clientNeg = await refundIssuer.connect();
      try {
        await assert.rejects(
          () => runOuterRollbackDemonstration({
            client: clientNeg,
            cmd: failCmdNeg,
            resId: paidResT10.reservationId,
            evId: evidenceT10.id,
            expectedEv: evidenceT10,
            expectedPaid: paidResT10,
            preIssuanceQuery: "SELECT 'intentional_abort'::int",
          }),
          (err) => {
            assert.equal(err.code, 'STAGE_VALIDATION_FAILED', 'Demonstration must reject pre-issuance error due to absent stages');
            assert.equal(err.stageEvidence.initialIssuanceCompleted, false);
            assert.equal(err.stageEvidence.replayWitnessCompleted, false);
            assert.equal(err.stageEvidence.postWitnessAbortDispatched, false);
            assert.equal(err.underlyingError.code, '22P02', 'Underlying error must be 22P02');
            assert.match(err.underlyingError.message, /intentional_abort/);
            return true;
          }
        );
      } finally {
        clientNeg.release();
      }

      const failedAuthCountNeg = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failCmdNeg]
        )
      ).rows[0].count;
      assert.equal(Number(failedAuthCountNeg), 0, 'Negative control must leave 0 authorization rows for command');

      const failedAuthCountSubjectNeg = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
          [paidResT10.reservationId]
        )
      ).rows[0].count;
      assert.equal(Number(failedAuthCountSubjectNeg), 0, 'Negative control must leave 0 authorization rows for scoped subject');

      const snapshotAfterNeg = await takeScopedDomainSnapshot(paidResT10);
      assert.deepEqual(snapshotInitial, snapshotAfterNeg, 'Negative control must leave all 16 scoped domain tables unchanged');

      // -----------------------------------------------------------------------
      // T10B: Fixture-only trigger failure injected on authorizations table
      // -----------------------------------------------------------------------
      await fixture.owner.query(`
        CREATE OR REPLACE FUNCTION trg_fixture_review_fail_fn()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'REVIEW_REFUND_AUTHORIZATION_INSERT_FAILURE' USING ERRCODE = 'P7777';
        END;
        $$;
        CREATE TRIGGER trg_fixture_review_fail
        BEFORE INSERT ON canonical_cancellation_refund_authorizations
        FOR EACH ROW EXECUTE FUNCTION trg_fixture_review_fail_fn();
      `);

      const failCmdB = randomUUID();
      const clientB = await refundIssuer.connect();
      let injectedErr = null;
      try {
        await clientB.query('BEGIN');
        await clientB.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [failCmdB, paidResT10.reservationId, evidenceT10.id]
        );
        await clientB.query('COMMIT');
      } catch (err) {
        injectedErr = err;
        await clientB.query('ROLLBACK');
      } finally {
        clientB.release();
        await fixture.owner.query(`
          DROP TRIGGER IF EXISTS trg_fixture_review_fail ON canonical_cancellation_refund_authorizations;
          DROP FUNCTION IF EXISTS trg_fixture_review_fail_fn();
        `);
      }

      assert.ok(injectedErr, 'Injected trigger failure must throw');
      assert.equal(injectedErr.code, 'P7777', 'Injected trigger must produce SQLSTATE P7777');
      assert.match(injectedErr.message, /REVIEW_REFUND_AUTHORIZATION_INSERT_FAILURE/);

      const failedAuthCountB = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failCmdB]
        )
      ).rows[0].count;
      assert.equal(Number(failedAuthCountB), 0, 'Injected trigger rollback must leave 0 authorization rows');

      const snapshotAfterB = await takeScopedDomainSnapshot(paidResT10);
      assert.deepEqual(snapshotInitial, snapshotAfterB, 'T10B rollback must leave all 16 domain tables unchanged');

      // -----------------------------------------------------------------------
      // T10C: Immutability, successful issuance, and zero domain row mutations
      // -----------------------------------------------------------------------
      // Immutability on decision evidence
      await assert.rejects(
        () => fixture.owner.query(
          `UPDATE canonical_cancellation_refund_decision_evidence SET reason_text = 'mutated' WHERE id = $1`,
          [evidenceT10.id]
        ),
        (err) => {
          assert.match(err.message, /CANONICAL_REFUND_DECISION_EVIDENCE_IMMUTABLE/);
          return true;
        }
      );
      await assert.rejects(
        () => fixture.owner.query(
          `DELETE FROM canonical_cancellation_refund_decision_evidence WHERE id = $1`,
          [evidenceT10.id]
        ),
        (err) => {
          assert.match(err.message, /CANONICAL_REFUND_DECISION_EVIDENCE_IMMUTABLE/);
          return true;
        }
      );

      // Clean successful issuance
      const successCmd = randomUUID();
      const successAuth = (
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [successCmd, paidResT10.reservationId, evidenceT10.id]
        )
      ).rows[0];
      assert.ok(successAuth);
      assert.equal(successAuth.replayed, false);

      // Immutability on authorizations table
      await assert.rejects(
        () => fixture.owner.query(
          `UPDATE canonical_cancellation_refund_authorizations SET issuing_principal = 'hacked' WHERE id = $1`,
          [successAuth.authorization_id]
        ),
        (err) => {
          assert.match(err.message, /CANONICAL_REFUND_AUTHORIZATION_IMMUTABLE/);
          return true;
        }
      );
      await assert.rejects(
        () => fixture.owner.query(
          `DELETE FROM canonical_cancellation_refund_authorizations WHERE id = $1`,
          [successAuth.authorization_id]
        ),
        (err) => {
          assert.match(err.message, /CANONICAL_REFUND_AUTHORIZATION_IMMUTABLE/);
          return true;
        }
      );

      // Verify ZERO domain rows mutated across all 16 tables
      const snapshotFinal = await takeScopedDomainSnapshot(paidResT10);
      assert.deepEqual(snapshotInitial, snapshotFinal, 'Clean issuance must mutate ZERO existing domain rows across all 16 tables');
    }
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
      refundIssuer?.end(),
    ]);
    await fixture?.close();
  }
});
