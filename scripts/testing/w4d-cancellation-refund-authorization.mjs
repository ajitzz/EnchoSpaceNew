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
      const decisionRef = fields.decisionRef || 'DEC-REF-' + randomUUID();
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

      // 3c. Issuer role direct table DML denial (INSERT/UPDATE/DELETE)
      await assert.rejects(
        () => refundIssuer.query(`DELETE FROM canonical_cancellation_refund_decision_evidence`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501)');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`DELETE FROM canonical_cancellation_refund_authorizations`),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501)');
          return true;
        }
      );
      await assert.rejects(
        () => refundIssuer.query(`INSERT INTO canonical_cancellation_refund_authorizations (command_id) VALUES ($1)`, [randomUUID()]),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501)');
          return true;
        }
      );

      // 3d. Non-issuer runtime roles calling issue_cancellation_refund_authorization
      await assert.rejects(
        () => compositionWorker.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT3.reservationId, randomUUID()]
        ),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) for composition worker');
          return true;
        }
      );
      await assert.rejects(
        () => paymentWorker.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT3.reservationId, randomUUID()]
        ),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) for payment worker');
          return true;
        }
      );
      await assert.rejects(
        () => stays.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT3.reservationId, randomUUID()]
        ),
        (err) => {
          assert.equal(err.code, '42501', 'Must fail with permission denied (42501) for stays web role');
          return true;
        }
      );
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
      const dummyEvidenceId = randomUUID();
      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), activeRes.reservationId, dummyEvidenceId]
        ),
        (err) => {
          assert.match(err.message, /DECISION_EVIDENCE_NOT_FOUND/);
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

      // Create dummy release record pointing to another completed release to test function check
      const completedRes = await createPaidReservation({nights: 2});
      const completedCancel = await cancelReservationV1(completedRes.reservationId);

      // Try issuance on reqOnlyRes (with completedCancel release passed in synthetic evidence to bypass trigger)
      // Trigger on evidence insert will reject release reservation mismatch
      await assert.rejects(
        () => insertSyntheticDecisionEvidence({
          reservationId: reqOnlyRes.reservationId,
          cancellationEventId: reqRes.eventId,
          cancellationReleaseId: completedCancel.cancellationReleaseId,
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
          assert.match(err.message, /DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: RELEASE_RESERVATION_MISMATCH/);
          return true;
        }
      );

      // 5c. V2 Cancellation release excluded
      const v2Res = await createPaidReservation({nights: 2});
      const cancelInfoV2 = await cancelReservationV1(v2Res.reservationId);
      // Temporarily mark release as V2
      await fixture.owner.query(
        `ALTER TABLE canonical_reservation_cancellation_inventory_releases DROP CONSTRAINT fk_cancellation_release_revision;`
      );
      await fixture.owner.query(
        `ALTER TABLE canonical_reservation_cancellation_inventory_releases DISABLE TRIGGER canonical_reservation_cancellation_inventory_releases_immutable;`
      );
      await fixture.owner.query(
        `UPDATE canonical_reservation_cancellation_inventory_releases SET released_effective_version = 2, released_revision_id = $2 WHERE release_id = $1;`,
        [cancelInfoV2.cancellationReleaseId, randomUUID()]
      );
      await fixture.owner.query(
        `ALTER TABLE canonical_reservation_cancellation_inventory_releases ENABLE TRIGGER canonical_reservation_cancellation_inventory_releases_immutable;`
      );

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

      // Revert back
      await fixture.owner.query(
        `ALTER TABLE canonical_reservation_cancellation_inventory_releases DISABLE TRIGGER canonical_reservation_cancellation_inventory_releases_immutable;`
      );
      await fixture.owner.query(
        `UPDATE canonical_reservation_cancellation_inventory_releases SET released_effective_version = 1, released_revision_id = NULL WHERE release_id = $1;`,
        [cancelInfoV2.cancellationReleaseId]
      );
      await fixture.owner.query(
        `ALTER TABLE canonical_reservation_cancellation_inventory_releases ENABLE TRIGGER canonical_reservation_cancellation_inventory_releases_immutable;`
      );
      await fixture.owner.query(
        `ALTER TABLE canonical_reservation_cancellation_inventory_releases ADD CONSTRAINT fk_cancellation_release_revision FOREIGN KEY (released_revision_id, reservation_id) REFERENCES canonical_reservation_revisions(id, reservation_id) ON DELETE RESTRICT;`
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

      // 6b. Unresolved reconciliation on attempt
      const paidResT6b = await createPaidReservation({nights: 2});
      const cancelInfoT6b = await cancelReservationV1(paidResT6b.reservationId);

      await fixture.owner.query(
        `INSERT INTO canonical_payment_reconciliations (
          payment_attempt_id, reason, details, resolved
        ) VALUES ($1, 'AMOUNT_MISMATCH', '{}'::jsonb, false)`,
        [paidResT6b.paymentAttemptId]
      );

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
          assert.match(err.message, /PAYMENT_RECONCILIATION_UNRESOLVED/);
          return true;
        }
      );

      // Resolve reconciliation
      await fixture.owner.query(
        `UPDATE canonical_payment_reconciliations SET resolved = true WHERE payment_attempt_id = $1`,
        [paidResT6b.paymentAttemptId]
      );

      // 6c. Visible cross-attempt alias of same capture reference
      const resOther = await createPaidReservation({nights: 2});
      await fixture.owner.query(
        `ALTER TABLE canonical_provider_events DISABLE TRIGGER canonical_provider_events_immutable;`
      );
      await fixture.owner.query(
        `INSERT INTO canonical_provider_events (
           origin_kind, provider_event_id, payment_attempt_id, provider_payment_ref, provider_order_ref,
           normalized_event_type, reported_amount_paise, reported_currency, evidence_hash, evidence_payload, status
         ) VALUES (
           'RAZORPAY', $1, $2, $3, 'order_dummy',
           'PAYMENT_CAPTURED', 550000, 'INR', repeat('e', 64), '{}'::jsonb, 'PROCESSED'
         )`,
        ['evt_alias_' + randomUUID(), resOther.paymentAttemptId, paidResT6b.providerPaymentRef]
      );
      await fixture.owner.query(
        `ALTER TABLE canonical_provider_events ENABLE TRIGGER canonical_provider_events_immutable;`
      );

      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), paidResT6b.reservationId, validEvidenceT6.id]
        ),
        (err) => {
          assert.match(err.message, /CAPTURE_CROSS_ATTEMPT_ALIAS_AMBIGUOUS/);
          return true;
        }
      );

      // Clean up alias event
      await fixture.owner.query(
        `ALTER TABLE canonical_provider_events DISABLE TRIGGER canonical_provider_events_immutable;`
      );
      await fixture.owner.query(
        `DELETE FROM canonical_provider_events WHERE provider_payment_ref = $1 AND payment_attempt_id = $2;`,
        [paidResT6b.providerPaymentRef, resOther.paymentAttemptId]
      );
      await fixture.owner.query(
        `ALTER TABLE canonical_provider_events ENABLE TRIGGER canonical_provider_events_immutable;`
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

      // Add a later observation (e.g. unrelated provider event on another attempt)
      const unrelatedRes = await createPaidReservation({nights: 2});
      await ingestProviderEvent(paymentWorker, {
        attemptId: unrelatedRes.paymentAttemptId,
        originKind: 'RAZORPAY',
        providerEventId: 'evt_later_' + randomUUID(),
        normalizedEventType: 'PAYMENT_UNKNOWN',
        reportedAmountPaise: 0,
        reportedCurrency: 'INR',
        providerPaymentRef: 'unrelated_ref',
        providerOrderRef: unrelatedRes.providerOrderRef,
        evidencePayload: {},
      });

      // 8a. Replay with identical command: succeeds with replayed = true
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

      // 8b. Replay with changed semantics (different reservationId under same commandId)
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
    // T09: TWO REAL CONNECTIONS: IDENTICAL CONVERGE, COMPETING BLOCKED
    // =========================================================================
    {
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

      // 9a. Two real connections with IDENTICAL command converge
      const conn1 = await refundIssuer.connect();
      const conn2 = await refundIssuer.connect();
      const identicalCmd = randomUUID();

      try {
        const [res1, res2] = await Promise.all([
          conn1.query(`SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`, [identicalCmd, paidResT9.reservationId, evidenceT9.id]),
          conn2.query(`SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`, [identicalCmd, paidResT9.reservationId, evidenceT9.id]),
        ]);

        const auth1 = res1.rows[0];
        const auth2 = res2.rows[0];
        assert.equal(auth1.authorization_id, auth2.authorization_id);
        const replays = [auth1.replayed, auth2.replayed].sort();
        assert.deepEqual(replays, [false, true], 'One insertion, one recovery replay');
      } finally {
        conn1.release();
        conn2.release();
      }

      // 9b. Competing distinct command for same reservation
      const competingCmd = randomUUID();
      await assert.rejects(
        () => refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [competingCmd, paidResT9.reservationId, evidenceT9.id]
        ),
        (err) => {
          assert.match(err.message, /REFUND_ALREADY_AUTHORIZED/);
          return true;
        }
      );
    }

    // =========================================================================
    // T10: IMMUTABILITY, INJECTED FAILURE ROLLBACK, AND ZERO DOMAIN ROW MUTATION
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

      // 10a. Immutability: UPDATE or DELETE on decision evidence
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

      // Snapshot scoped domain tables before issuance
      const takeDomainSnapshot = async () => {
        const [
          resRow,
          nightsRows,
          eventsRows,
          releasesRows,
          relNightsRows,
          attemptsRow,
          bridgeRow,
          provEventsRows,
        ] = await Promise.all([
          fixture.owner.query(`SELECT * FROM canonical_reservations WHERE id = $1`, [paidResT10.reservationId]),
          fixture.owner.query(`SELECT * FROM canonical_reservation_nights WHERE reservation_id = $1 ORDER BY stay_date`, [paidResT10.reservationId]),
          fixture.owner.query(`SELECT * FROM canonical_reservation_events WHERE reservation_id = $1 ORDER BY sequence_number`, [paidResT10.reservationId]),
          fixture.owner.query(`SELECT * FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`, [paidResT10.reservationId]),
          fixture.owner.query(`SELECT * FROM canonical_reservation_cancellation_release_nights WHERE reservation_id = $1 ORDER BY stay_date`, [paidResT10.reservationId]),
          fixture.owner.query(`SELECT * FROM canonical_payment_attempts WHERE id = $1`, [paidResT10.paymentAttemptId]),
          fixture.owner.query(`SELECT * FROM canonical_payment_reservations WHERE reservation_id = $1`, [paidResT10.reservationId]),
          fixture.owner.query(`SELECT * FROM canonical_provider_events WHERE payment_attempt_id = $1 ORDER BY id`, [paidResT10.paymentAttemptId]),
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
        };
      };

      const snapshotBefore = await takeDomainSnapshot();

      // 10b. Injected failure in transaction: rolls back completely
      const client = await refundIssuer.connect();
      const failCmd = randomUUID();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`, [failCmd, paidResT10.reservationId, evidenceT10.id]);
        // Inject failure
        await client.query(`SELECT 'intentional_abort'::int`);
      } catch (err) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Assert 0 authorizations persist for failCmd
      const failedAuthCount = (
        await fixture.owner.query(
          `SELECT count(*) FROM canonical_cancellation_refund_authorizations WHERE command_id = $1`,
          [failCmd]
        )
      ).rows[0].count;
      assert.equal(Number(failedAuthCount), 0, 'Rolled back transaction must leave 0 authorization rows');

      // 10c. Successful issuance
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

      // Verify ZERO domain rows mutated
      const snapshotAfter = await takeDomainSnapshot();
      assert.deepEqual(snapshotBefore, snapshotAfter, 'Successful issuance must mutate ZERO existing domain rows');
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
