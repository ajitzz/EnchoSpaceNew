/**
 * ENCHO W4-D Stage B Test Suite:
 * Canonical Cancellation Refund Decision Admission.
 *
 * Verifies:
 * - Pre-062 Synthetic Evidence: Prepared and issued under 061, verified backward-compatible under 062
 * - Missing-Registrar Negative Control: SQLSTATE 42883 before migration 062
 * - ADM-05: Schema detection independently of capability row in verifyIamCatalog
 * - ADM-01: Raw table access denial (42501), protected preparation/preview/replay interfaces
 * - ADM-03: Dedicated appointment binding (preparer cannot approve, amount cap, revocation, expiry)
 * - ADM-03: Idempotent retention (same packet replays, changed semantics conflicts)
 * - ADM-01: Borrowed approval rejection (packet B cannot borrow packet A approval)
 * - ADM-01: Protected replay (revoked capability rejected, old factor expiry allowed)
 * - ADM-02: Financial authority blocker (transaction A conflicting capture blocks issuer in transaction B)
 * - A01: Positive end-to-end chain (Dual custody, WebAuthn passkeys, runAuthorized, registrar)
 * - A02: Maker self-checker & unauthorized checkers (MAKER_CHECKER_CONFLICT, PERMISSION_DENIED)
 * - A03: Session & Step-Up negative controls (STAFF_SESSION_REQUIRED, STEP_UP_REQUIRED, STEP_UP_INVALID)
 * - A04: Material packet tampering after approval (COMMAND_CONFLICT, COMMAND_FINGERPRINT_MISMATCH)
 * - A05: Canonical domain exclusions (uncancelled, V2 release, amount > ceiling, non-INR)
 * - A06: Guarded Replay & cross-maker denial (replayed: true, PERMISSION_DENIED)
 * - A07: Concurrency with observed database blocker in pg_blocking_pids (winner/loser recovery, distinct conflict)
 * - A08: Injected failure rollback at audit stage (witness domain write + consumption in-flight, rollback restoration)
 * - A09: Lost COMMIT acknowledgement / uncertainty recovery (OUTCOME_UNKNOWN, recovery with no duplicate rows)
 * - A10: Downstream issue_cancellation_refund_authorization acceptance & forged provenance rejection
 * - A11: Immutability triggers & 16-table canonical commerce snapshot equality
 */
import assert from 'node:assert/strict';
import {execSync} from 'node:child_process';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

process.env.TZ = 'UTC';

import pg from 'pg';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.js';
import {
  PostgresWorkforceAuthorization,
  WorkforceCommandOutcomeUnknownError,
} from '../../src/lib/iam/postgresAuthorization.js';
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
import {createPasskeyFixture} from '../../src/test/harvo/helpers/passkeyFixture.js';
import {workforceFactorGrants} from '../../src/server/deployment/iamFactorReadiness.js';
import {verifyIamCatalog} from '../../src/server/deployment/iamReadiness.js';
import {WorkforceStepUp} from '../../src/lib/iam/factors/workforceStepUp.js';
import {
  CanonicalRefundDecisionAdmissionService,
} from '../../src/services/canonicalRefundDecisionAdmissionService.js';
import {
  createRootExecutionContext,
  runWithExecutionContext,
} from '../../src/lib/observability/executionContext.js';

function combineErrors(originalError, cleanupErrors, messagePrefix = 'OPERATION_AND_CLEANUP_FAILED') {
  if (originalError && cleanupErrors.length > 0) {
    return new AggregateError([originalError, ...cleanupErrors], messagePrefix);
  } else if (originalError) {
    return originalError;
  } else if (cleanupErrors.length > 0) {
    return cleanupErrors.length === 1 ? cleanupErrors[0] : new AggregateError(cleanupErrors, `${messagePrefix}_CLEANUP_ONLY`);
  }
  return null;
}

test('W4-D canonical cancellation refund decision admission verification', async () => {
  const rootCtx = createRootExecutionContext({source: 'SYSTEM'});
  await runWithExecutionContext(rootCtx, async () => {
    // =========================================================================
    // 1. VERIFY EXACT CANONICAL BASE & FROZEN MIGRATIONS
    // =========================================================================
    const expectedCanonicalBase = '909c1bf20e53f4e95cca2b80edb69bab20f569ac';
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

    const migration062Path = path.resolve('src/migrations/062_canonical_cancellation_refund_approval_admission.sql');
    assert.equal(
      fs.existsSync(migration062Path),
      true,
      'EVIDENCE_INCOMPLETE: migration 062 must exist in src/migrations'
    );

    const hashFile = (relPath) => createHash('sha256').update(fs.readFileSync(path.resolve(relPath))).digest('hex');
    const frozen060Hash = '0823b6d434ebad6a6bce11196671a6ad8ff0a567049ca001fc7f4c3e9708548c';
    const frozen061Hash = 'bd33f749f07f27bd4f5ff40d7cffe8bd559fac0ca8dccca3da12bb495598d1c9';

    assert.equal(
      hashFile('src/migrations/060_canonical_payment_composition_lock_order_hardening.sql'),
      frozen060Hash,
      'EVIDENCE_INCOMPLETE: migration 060 SHA256 must match frozen checkpoint'
    );
    assert.equal(
      hashFile('src/migrations/061_canonical_cancellation_refund_authorization.sql'),
      frozen061Hash,
      'EVIDENCE_INCOMPLETE: migration 061 SHA256 must match frozen checkpoint'
    );

    // =========================================================================
    // 2. SETUP ISOLATED POSTGRES FIXTURE & BASE MIGRATIONS
    // =========================================================================
    const fixture = await createW1AcceptedOfferFixture({serverCompatible: true});
    const originalOwner = fixture.owner;
    const originalStaff = fixture.staffPool;
    await originalOwner.query(`
      ALTER DATABASE postgres SET statement_timeout = '8000ms';
      ALTER DATABASE postgres SET lock_timeout = '5000ms';
      ALTER ROLE harvo_test SET statement_timeout = '8000ms';
      ALTER ROLE harvo_test SET lock_timeout = '5000ms';
      ALTER ROLE w1_offer_staff SET statement_timeout = '8000ms';
      ALTER ROLE w1_offer_staff SET lock_timeout = '5000ms';
    `);
    fixture.owner = new pg.Pool({
      ...originalOwner.options,
      options: '-c statement_timeout=8000 -c lock_timeout=5000',
      statement_timeout: 8000,
      lock_timeout: 5000,
      query_timeout: 8000,
      connectionTimeoutMillis: 5000,
    });
    fixture.staffPool = new pg.Pool({
      ...originalOwner.options,
      user: 'w1_offer_staff',
      options: '-c statement_timeout=8000 -c lock_timeout=5000',
      statement_timeout: 8000,
      lock_timeout: 5000,
      query_timeout: 8000,
      connectionTimeoutMillis: 5000,
    });
    const organizationId = '00000000-0000-4000-8000-000000000001';

    let stays;
    let reservationWorker;
    let paymentWorker;
    let compositionWorker;
    let lifecycleIssuer;
    let lifecycleWorker;
    let cancellationIssuer;
    let cancellationExecutor;
    let refundIssuer;
    let factorPool;
    let suiteError = null;

    try {
      // Independently query PostgreSQL for effective statement_timeout and lock_timeout
      const ownerEffectiveLimits = (await fixture.owner.query(
        "SELECT current_setting('statement_timeout') as statement_timeout, current_setting('lock_timeout') as lock_timeout"
      )).rows[0];
      assert.notEqual(ownerEffectiveLimits.statement_timeout, '0', 'Observer owner connection statement_timeout must be finite');
      assert.notEqual(ownerEffectiveLimits.lock_timeout, '0', 'Observer owner connection lock_timeout must be finite');
      assert.equal(fixture.owner.options.query_timeout, 8000, 'Observer owner pool client-side query_timeout must be configured');
      assert.equal(fixture.owner.options.connectionTimeoutMillis, 5000, 'Observer owner pool connectionTimeoutMillis must be configured');

      // Harmless delayed SQL statement demonstrating timeout cancellation and clean disposal
      const timeoutDemoClient = await fixture.owner.connect();
      try {
        await timeoutDemoClient.query('BEGIN');
        await timeoutDemoClient.query("SET LOCAL statement_timeout = '150ms'");
        const timeoutDemoStart = Date.now();
        let timeoutDemoError = null;
        try {
          await timeoutDemoClient.query('SELECT pg_sleep(1.0)');
        } catch (err) {
          timeoutDemoError = err;
        }
        const timeoutDemoElapsed = Date.now() - timeoutDemoStart;
        assert.ok(timeoutDemoError, 'Delayed SQL statement must be terminated by statement timeout');
        assert.equal(timeoutDemoError.code, '57014', 'PostgreSQL error code must be 57014 (query_canceled)');
        assert.ok(timeoutDemoElapsed < 1000, 'Delayed query must terminate within budget before sleep completes');
        try {
          await timeoutDemoClient.query('ROLLBACK');
        } catch {}
      } finally {
        timeoutDemoClient.release(true);
      }
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
      await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '050_accepted_offer_itinerary_quotes.sql');
      await fixture.owner.query(`CREATE ROLE encho_reservation_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '052_canonical_reservation_hold_finalization.sql');
      await fixture.owner.query(`CREATE ROLE encho_payment_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '053_canonical_payment_evidence_and_reconciliation.sql');
      await fixture.owner.query(`CREATE ROLE encho_composition_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '054_canonical_payment_reservation_composition.sql');

      await fixture.owner.query(`CREATE ROLE encho_lifecycle_issuer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await fixture.owner.query(`CREATE ROLE encho_lifecycle_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '055_canonical_reservation_lifecycle_authority.sql');

      await fixture.owner.query(`CREATE ROLE encho_cancellation_issuer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await fixture.owner.query(`CREATE ROLE encho_cancellation_executor LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '056_canonical_cancellation_completion_authority.sql');

      await applyIsolatedMigration(fixture.owner, '057_canonical_reservation_revision_model.sql');
      await applyIsolatedMigration(fixture.owner, '058_version_aware_cancellation_release.sql');

      await fixture.owner.query(`CREATE ROLE encho_modification_issuer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '059_canonical_reservation_modification_request.sql');

      await applyIsolatedMigration(fixture.owner, '060_canonical_payment_composition_lock_order_hardening.sql');

      await fixture.owner.query(`CREATE ROLE encho_refund_issuer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await applyIsolatedMigration(fixture.owner, '061_canonical_cancellation_refund_authorization.sql');

      // Create pool wrappers for workers
      stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
      reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker'});
      paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
      compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});
      lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer'});
      lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker'});
      cancellationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_issuer'});
      cancellationExecutor = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_executor'});
      refundIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_refund_issuer'});

      // Seed inventory
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

      // Reservation helper
      let reservationSeq = 0;
      const createPaidReservation = async (customPayablePaise = null) => {
        reservationSeq++;
        const checkIn = addDays(fixture.today, 10 + reservationSeq * 4);
        const checkOut = addDays(checkIn, 3);

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
        const payableAmountPaise = customPayablePaise !== null ? customPayablePaise : roomSubtotalPaise;

        const payableId = randomUUID();
        await fixture.owner.query(
          `INSERT INTO canonical_payable_authorities (
            id, quote_id, currency, payable_amount_paise, authority_kind, contract_hash, status
          ) VALUES ($1, $2, 'INR', $3, 'DISPOSABLE TEST FIXTURE ONLY', repeat('a', 64), 'APPROVED')`,
          [payableId, quote.id, payableAmountPaise]
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

        const compRes = await composePaymentReservation(compositionWorker, {
          commandId: randomUUID(),
          paymentAttemptId: attempt.attemptId,
        });
        assert.equal(compRes.compositionState, 'COMMITTED');

        const provEventRow = (
          await fixture.owner.query(
            `SELECT * FROM canonical_provider_events WHERE payment_attempt_id = $1 AND normalized_event_type = 'PAYMENT_CAPTURED'`,
            [attempt.attemptId]
          )
        ).rows[0];

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
          providerPaymentRef: paymentRef,
          providerOrderRef: orderRef,
          supportingProviderEventId: provEventRow.id,
          supportingEvidenceHash: provEventRow.evidence_hash,
          capturedAmountPaise: payableAmountPaise,
        };
      };

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

      // =======================================================================
      // PRE-062 SYNTHETIC EVIDENCE PREPARATION & COMPATIBILITY WITNESS
      // =======================================================================
      const pre062Res = await createPaidReservation(50000);
      const pre062Cancel = await cancelReservationV1(pre062Res.reservationId);
      const pre062EvidenceId = randomUUID();
      const pre062Cmd = randomUUID();

      await fixture.owner.query(`
        INSERT INTO canonical_cancellation_refund_decision_evidence (
          id, decision_ref, version, evidence_classification, approver_responsibility,
          approver_identity_ref, decision_at, reason_code, reason_text, approval_ref,
          verifying_component, verified_at, reservation_id, cancellation_event_id,
          cancellation_release_id, paid_bridge_id, payment_attempt_id, quote_id,
          payable_authority_id, provider_origin_kind, provider_payment_ref,
          supporting_provider_event_id, supporting_evidence_hash, approved_amount_paise,
          currency, permitted_submitting_component, permitted_issuer_role
        ) VALUES (
          $1, 'DEC-PRE-062', 1, 'LOCAL_SYNTHETIC_TEST_FIXTURE', 'ACCOMMODATION_FINANCE_APPROVER',
          'synthetic-pre-062', clock_timestamp(), 'PRE_062_SYNTH', 'Synthetic pre-062 test', 'synth-ref-pre-062',
          'REFUND_DECISION_AUTHORITY_PRIMITIVE', clock_timestamp(), $2, $3, $4, $5, $6, $7, $8, 'RAZORPAY', $9,
          $10, $11, 50000, 'INR', 'REFUND_DECISION_AUTHORITY_PRIMITIVE', 'encho_refund_issuer'
        )`,
        [
          pre062EvidenceId,
          pre062Res.reservationId,
          pre062Cancel.cancellationEventId,
          pre062Cancel.cancellationReleaseId,
          pre062Res.paidBridgeId,
          pre062Res.paymentAttemptId,
          pre062Res.quoteId,
          pre062Res.payableAuthorityId,
          pre062Res.providerPaymentRef,
          pre062Res.supportingProviderEventId,
          pre062Res.supportingEvidenceHash,
        ]
      );

      // Verify pre-062 issuance succeeds under 061
      const pre062IssueRes = (await refundIssuer.query(
        `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
        [pre062Cmd, pre062Res.reservationId, pre062EvidenceId]
      )).rows[0];
      assert.ok(pre062IssueRes, 'Pre-062 issuance must succeed under migration 061');
      assert.equal(pre062IssueRes.replayed, false);
      const pre062AuthDigest = pre062IssueRes.decision_digest;

      // =======================================================================
      // 3. MISSING-REGISTRAR NEGATIVE CONTROL
      // =======================================================================
      let missingRegistrarError;
      try {
        await fixture.owner.query(
          "SELECT * FROM admit_cancellation_refund_decision('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid)"
        );
      } catch (err) {
        missingRegistrarError = err;
      }
      assert.ok(missingRegistrarError, 'Missing-registrar negative control must fail before migration 062 is applied');
      assert.equal(missingRegistrarError.code, '42883', 'Missing-registrar negative control must fail with SQLSTATE 42883 (undefined_function)');

      // =======================================================================
      // ADM-05: READINESS CHECK INDEPENDENT OF CAPABILITY ROW
      // =======================================================================
      // 1. Older supported schema compatibility (before 062 is applied)
      const readinessPre062 = await verifyIamCatalog(fixture.owner);
      assert.equal(readinessPre062.permissionCatalogValid, true, 'Older supported schema must remain compatible and pass readiness');

      // 2. Installed admission schema missing its capability row must fail readiness
      await fixture.owner.query(`CREATE TABLE canonical_cancellation_refund_decision_admissions (id uuid primary key)`);
      try {
        const readinessMissing = await verifyIamCatalog(fixture.owner);
        assert.equal(readinessMissing.permissionCatalogValid, false, 'Readiness must fail when installed schema is missing its capability row');
      } finally {
        await fixture.owner.query(`DROP TABLE canonical_cancellation_refund_decision_admissions`);
      }

      // =======================================================================
      // 4. APPLY MIGRATION 062 & VERIFY POST-062 SYNTHETIC REPLAY
      // =======================================================================
      await applyIsolatedMigration(fixture.owner, '062_canonical_cancellation_refund_approval_admission.sql');

      // 3. Post-062 readiness with both schema and capability row present
      const readinessPost062 = await verifyIamCatalog(fixture.owner);
      assert.equal(readinessPost062.permissionCatalogValid, true, 'Readiness must pass when installed schema and its capability row are both present');

      // Verify that the pre-062 synthetic authorization replays identically under migration 062
      const post062Replay = (await refundIssuer.query(
        `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
        [pre062Cmd, pre062Res.reservationId, pre062EvidenceId]
      )).rows[0];
      assert.ok(post062Replay, 'Pre-062 authorization must replay under 062');
      assert.equal(post062Replay.replayed, true);
      assert.equal(post062Replay.decision_digest, pre062AuthDigest);

      // =======================================================================
      // 5. SETUP PASSKEY & WORKFORCE STEP-UP INFRASTRUCTURE
      // =======================================================================
      await fixture.owner.query(`
        CREATE ROLE cr1_factor_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      `);
      for (const grant of workforceFactorGrants('cr1_factor_writer')) {
        await fixture.owner.query(grant);
      }
      factorPool = new pg.Pool({...fixture.owner.options, user: 'cr1_factor_writer'});
      const stepUpService = new WorkforceStepUp(factorPool, 'LOCAL');

      // Service under test
      const admissionService = new CanonicalRefundDecisionAdmissionService(fixture.staffPool, 'LOCAL');

      // Staff tokens & identities from w1AcceptedOfferFixture:
      // Maker: User 90, reviewerMembershipId, reviewerSessionId, token: staffToken
      const makerToken = `wfs_${Buffer.alloc(32, 0x51).toString('base64url')}`;
      const makerBearer = `Bearer ${makerToken}`;
      const reviewerMembershipId = '11111111-1111-4111-8111-111111111111';
      const reviewerSessionId = '22222222-2222-4222-8222-222222222222';

      // Checker: User 91, foreignMembershipId, foreignSessionId, token: foreignStaffToken
      const checkerToken = `wfs_${Buffer.alloc(32, 0x52).toString('base64url')}`;
      const checkerBearer = `Bearer ${checkerToken}`;
      const foreignMembershipId = '33333333-3333-4333-8333-333333333333';
      const foreignSessionId = '44444444-4444-4444-8444-444444444444';

      // Helper: setup Passkey fixtures in DB
      const identityConfig = {
        googleClientId: '12345678-test.apps.googleusercontent.com',
        challengeTtlSeconds: 120,
        idTokenMaxAgeSeconds: 300,
        allowGmail: true,
        allowedHostedDomains: [],
        maximumActiveSessions: 3,
        maximumStartsPerMinute: 20,
      };

      const ip = (await fixture.owner.query(
        `INSERT INTO internal_workforce_identity_policies(organization_id, environment, version, config, config_hash, approval_status, created_by, reason)
         VALUES ($1, 'LOCAL', 1, $2, repeat('0', 64), 'PENDING_FOUNDER_OPERATIONAL_APPROVAL', 90, 'Disposable local identity policy.')
         RETURNING id`,
        [organizationId, JSON.stringify(identityConfig)]
      )).rows[0];

      await fixture.owner.query(
        `INSERT INTO internal_workforce_current_identity_policy VALUES ($1, 'LOCAL', $2)`,
        [organizationId, ip.id]
      );

      const fp = (await fixture.owner.query(
        `INSERT INTO internal_workforce_factor_policies(organization_id, environment, version, config, config_hash, approval_status, created_by, reason)
         VALUES ($1, 'LOCAL', 1, $2, repeat('0', 64), 'PENDING_FOUNDER_OPERATIONAL_APPROVAL', 90, 'Disposable factor policy.')
         RETURNING id`,
        [organizationId, JSON.stringify({rpId: 'localhost', origin: 'http://localhost:3000', allowSyncedPasskeys: false, challengeTtlSeconds: 120, maximumStartsPerMinute: 30})]
      )).rows[0];

      await fixture.owner.query(
        `INSERT INTO internal_workforce_current_factor_policy VALUES ($1, 'LOCAL', $2)`,
        [organizationId, fp.id]
      );

      const setupPasskeyForStaff = async (userId, membershipId, sessionId, tokenRaw) => {
        const passkey = createPasskeyFixture();
        const loginChallengeId = randomUUID();
        const tokenHash = createHash('sha256').update(loginChallengeId).digest('hex');
        const credential = {
          ...passkey.credential,
          recordId: passkey.credential.recordId,
          id: passkey.credential.id,
          organizationId,
          membershipId,
          environment: 'LOCAL',
          status: 'ACTIVE',
          enrollmentReceiptHash: passkey.credential.enrollmentReceiptHash,
          identityReceiptHash: tokenHash,
        };

        const nonceHash = randomBytes(32).toString('hex');
        const browserHash = randomBytes(32).toString('hex');
        const subjectHash = randomBytes(32).toString('hex');
        const emailHash = randomBytes(32).toString('hex');
        await fixture.owner.query(
          `INSERT INTO internal_workforce_login_challenges(
             id, organization_id, environment, policy_id, nonce_hash, browser_hash, created_at, expires_at, status, consumed_at
           ) VALUES (
             $1, $2, 'LOCAL', $3, $4, $5, clock_timestamp() - interval '10 seconds', clock_timestamp() + interval '5 minutes', 'CONSUMED', clock_timestamp()
           )`,
          [loginChallengeId, organizationId, ip.id, nonceHash, browserHash]
        );

        await fixture.owner.query(
          `INSERT INTO internal_workforce_login_receipts(
             challenge_id, organization_id, environment, user_id, membership_id, session_id,
             subject_hash, email_hash, token_hash, identity_policy_hash, iam_policy_hash,
             token_issued_at, token_expires_at, verified_at, provider_authenticated_at
           ) VALUES (
             $1, $2, 'LOCAL', $3, $4, $5,
             $6, $7, $8, repeat('c', 64), repeat('c', 64),
             statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour', statement_timestamp(), statement_timestamp()
           )`,
          [loginChallengeId, organizationId, userId, membershipId, sessionId, subjectHash, emailHash, tokenHash]
        );

        const reviewedBy = userId === 90 ? 91 : 90;
        await fixture.owner.query(
          `INSERT INTO internal_workforce_passkey_enrollments(
             id, organization_id, membership_id, environment, credential, credential_id,
             identity_receipt_id, registration_receipt_hash, reviewed_by, registered_at, reviewed_at, reason
           ) VALUES (
             $1, $2, $3, 'LOCAL', $4, $5, $6, $7, $8, statement_timestamp(), statement_timestamp(), 'Disposable test passkey enrollment'
           )`,
          [
            passkey.credential.recordId,
            organizationId,
            membershipId,
            JSON.stringify(credential),
            passkey.credential.id,
            loginChallengeId,
            passkey.credential.enrollmentReceiptHash,
            reviewedBy,
          ]
        );

        await fixture.owner.query(
          `INSERT INTO internal_workforce_passkey_state(enrollment_id, counter) VALUES ($1, 4)`,
          [passkey.credential.recordId]
        );

        return passkey;
      };

      const makerPasskey = await setupPasskeyForStaff(90, reviewerMembershipId, reviewerSessionId, makerToken);
      const checkerPasskey = await setupPasskeyForStaff(91, foreignMembershipId, foreignSessionId, checkerToken);

      // Seed IAM Role Grants:
      const preparerRoleVersionId = (await fixture.owner.query(
        `SELECT v.id FROM internal_role_versions v
         JOIN internal_role_definitions r ON r.id = v.role_id
         WHERE r.role_key = 'accommodation_refund_preparer' AND v.version = 1`
      )).rows[0].id;

      await fixture.owner.query(
        `INSERT INTO internal_membership_grants(
           organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
           grant_hash, granted_by, reason
         ) VALUES (
           $1, $2, $3, 'ORGANIZATION', $4, 'LOCAL',
           $5, 90, 'Grant accommodation refund preparer for testing.'
         )`,
        [organizationId, reviewerMembershipId, preparerRoleVersionId, organizationId, createHash('sha256').update(randomUUID()).digest('hex')]
      );

      const approverRoleVersionId = (await fixture.owner.query(
        `SELECT v.id FROM internal_role_versions v
         JOIN internal_role_definitions r ON r.id = v.role_id
         WHERE r.role_key = 'accommodation_finance_approver' AND v.version = 1`
      )).rows[0].id;

      const checkerGrantId = randomUUID();
      await fixture.owner.query(
        `INSERT INTO internal_membership_grants(
           id, organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
           grant_hash, granted_by, reason
         ) VALUES (
           $1, $2, $3, $4, 'ORGANIZATION', $5, 'LOCAL',
           $6, 90, 'Grant accommodation finance approver for testing.'
         )`,
        [checkerGrantId, organizationId, foreignMembershipId, approverRoleVersionId, organizationId, createHash('sha256').update(randomUUID()).digest('hex')]
      );

      // Step-Up Execution Helper
      let stepUpCounter = 4;
      const performStepUp = async (tokenRaw, passkey, actionHash) => {
        stepUpCounter++;
        const currentCounter = stepUpCounter;
        const start = await stepUpService.begin({
          credential: tokenRaw,
          enrollmentId: passkey.credential.recordId,
          actionHash,
          correlationId: 'stepup-start-' + randomUUID(),
        });
        const proof = await stepUpService.complete({
          credential: tokenRaw,
          challengeId: start.challengeId,
          response: passkey.assertion({
            client: {challenge: start.publicKey.challenge},
            counter: currentCounter,
          }),
          correlationId: 'stepup-complete-' + randomUUID(),
        });
        return proof.challengeId;
      };

      // =======================================================================
      // ADM-01: RAW TABLE ACCESS DENIAL
      // =======================================================================
      let rawPrepAccessError;
      try {
        await fixture.staffPool.query(
          'SELECT * FROM canonical_cancellation_refund_decision_preparations'
        );
      } catch (err) {
        rawPrepAccessError = err;
      }
      assert.ok(rawPrepAccessError, 'Raw preparation access must be denied to runtime staff role');
      assert.equal(rawPrepAccessError.code, '42501', 'Must fail with SQLSTATE 42501 permission denied for table');

      // Snapshot 16 canonical tables for deep equality
      const snapshotCanonicalCommerce = async () => {
        const counts = {};
        const tables = [
          'canonical_reservations',
          'canonical_reservation_nights',
          'canonical_reservation_events',
          'canonical_reservation_cancellation_inventory_releases',
          'canonical_reservation_cancellation_release_nights',
          'canonical_payment_attempts',
          'canonical_payment_reservations',
          'canonical_provider_events',
          'canonical_payable_authorities',
          'canonical_payment_reconciliations',
          'canonical_reservation_commands',
          'inventory_days',
          'booking_holds',
          'booking_hold_nights',
          'stays_quotes',
          'bookings',
        ];
        for (const t of tables) {
          counts[t] = (await fixture.owner.query(`SELECT count(*)::int as c FROM ${t}`)).rows[0].c;
        }
        return counts;
      };

      // =======================================================================
      // SCENARIO A01: POSITIVE END-TO-END ADMISSION CHAIN
      // =======================================================================
      const resA01 = await createPaidReservation(50000);
      await cancelReservationV1(resA01.reservationId);

      const cmdA01 = randomUUID();
      const packetA01 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA01,
        decisionRef: 'DEC-A01-' + randomUUID(),
        decisionVersion: 1,
        reservationId: resA01.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'CANCELLATION_REFUND_APPROVED',
        reasonText: 'Customer requested cancellation approved under policy',
        organizationId: organizationId,
      });
      assert.equal(packetA01.approvedAmountMinor, '50000');
      assert.equal(packetA01.currency, 'INR');

      const makerEnvelopeA01 = admissionService.buildRequestEnvelope(
        fixture.principal(90, 'STAFF'),
        packetA01,
        randomUUID(),
        'Prepare refund admission A01'
      );
      const fingerprintA01 = admissionService.fingerprint(makerEnvelopeA01);
      const makerStepUpA01 = await performStepUp(makerToken, makerPasskey, fingerprintA01);

      const prepA01 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetA01,
        makerStepUpReceiptId: makerStepUpA01,
        reason: 'Prepare refund admission A01',
      });
      assert.equal(prepA01.actionReceipt.status, 'PENDING');
      assert.equal(prepA01.commandFingerprint, fingerprintA01);
      assert.equal(prepA01.replayed, false);

      // ADM-03: Idempotent retention demonstration: Repeating prepare with exact same packet returns replayed: true
      const prepA01Replay = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetA01,
        makerStepUpReceiptId: makerStepUpA01,
        reason: 'Prepare refund admission A01',
      });
      assert.equal(prepA01Replay.replayed, true, 'Repeating prepare with same packet must return replayed: true');

      // Checker previews the prepared packet
      const checkerPreviewA01 = await admissionService.getRefundDecisionPreview(checkerBearer, prepA01.actionReceipt.id);
      assert.equal(checkerPreviewA01.actionReceipt.id, prepA01.actionReceipt.id);
      assert.equal(checkerPreviewA01.packet.admissionCommandId, cmdA01);
      assert.equal(checkerPreviewA01.commandFingerprint, fingerprintA01);

      const checkerStepUpA01 = await performStepUp(checkerToken, checkerPasskey, prepA01.actionReceipt.commandHash);

      const approvedA01 = await admissionService.approveRefundDecisionAdmission(checkerBearer, {
        authorizationId: prepA01.actionReceipt.id,
        expectedCommandHash: prepA01.actionReceipt.commandHash,
        checkerStepUpReceiptId: checkerStepUpA01,
        reason: 'Approved by Accommodation Finance Approver',
      });
      assert.equal(approvedA01.receipt.status, 'APPROVED');

      // Maker admits through atomic runAuthorized + registrar
      const admittedA01 = await admissionService.admitRefundDecision(makerBearer, {
        packet: packetA01,
        actionAuthorizationId: prepA01.actionReceipt.id,
        makerStepUpReceiptId: makerStepUpA01,
      });

      assert.equal(admittedA01.replayed, false);
      assert.equal(admittedA01.commandId, cmdA01);
      assert.equal(admittedA01.approvedAmountPaise, 50000n);
      assert.equal(admittedA01.currency, 'INR');

      // Assert admission provenance row in DB
      const admRowA01 = (await fixture.owner.query(
        `SELECT * FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1`,
        [cmdA01]
      )).rows[0];
      assert.ok(admRowA01, 'Admission provenance row must exist');
      assert.equal(admRowA01.action_authorization_id, prepA01.actionReceipt.id);
      assert.equal(admRowA01.decision_evidence_id, admittedA01.evidenceId);
      assert.equal(admRowA01.checker_appointment_grant_id, checkerGrantId, 'Admission row must retain exact checker appointment grant id');
      assert.equal(admRowA01.checker_appointment_role_version_id, approverRoleVersionId, 'Admission row must retain exact checker appointment role version id');

      // Assert decision evidence row in DB
      const devRowA01 = (await fixture.owner.query(
        `SELECT * FROM canonical_cancellation_refund_decision_evidence WHERE id = $1`,
        [admittedA01.evidenceId]
      )).rows[0];
      assert.ok(devRowA01, 'Decision evidence row must exist');
      assert.equal(devRowA01.evidence_classification, 'AUTHENTICATED_HUMAN_APPROVAL');
      assert.equal(devRowA01.approver_responsibility, 'ACCOMMODATION_FINANCE_APPROVER');

      // Assert zero refund authorizations created by admission
      const zeroAuths = (await fixture.owner.query(
        `SELECT count(*)::int as c FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
        [resA01.reservationId]
      )).rows[0].c;
      assert.equal(zeroAuths, 0, 'Admission must create zero refund authorizations');

      // =======================================================================
      // ADM-01: BORROWED APPROVAL & COPIED-HASH REJECTION & CHANGED-SEMANTIC REPLAY
      // =======================================================================
      // 1. Packet B cannot borrow approval of Packet A
      const cmdA01B = randomUUID();
      const packetA01B = {
        ...packetA01,
        admissionCommandId: cmdA01B,
        decisionRef: 'DEC-BORROW-' + randomUUID(),
        approvedAmountMinor: '40000', // different amount
      };
      let borrowedApprovalError;
      try {
        await admissionService.admitRefundDecision(makerBearer, {
          packet: packetA01B,
          actionAuthorizationId: prepA01.actionReceipt.id,
          makerStepUpReceiptId: makerStepUpA01,
        });
      } catch (err) {
        borrowedApprovalError = err;
      }
      assert.ok(borrowedApprovalError, 'Packet B cannot borrow approval of packet A');
      assert.ok(
        borrowedApprovalError.message.includes('COMMAND_CONFLICT') ||
        borrowedApprovalError.message.includes('POLICY_CHANGED') ||
        borrowedApprovalError.message.includes('COMMAND_FINGERPRINT_MISMATCH')
      );

      // 2. Changed-semantic replay rejected: replaying admitted command with altered amount or fields
      let changedReplayError;
      try {
        await admissionService.admitRefundDecision(makerBearer, {
          packet: { ...packetA01, approvedAmountMinor: '40000' },
          actionAuthorizationId: prepA01.actionReceipt.id,
          makerStepUpReceiptId: randomUUID(),
        });
      } catch (err) {
        changedReplayError = err;
      }
      assert.ok(changedReplayError, 'Changed-semantic replay must be rejected');
      assert.ok(changedReplayError.message.includes('COMMAND_CONFLICT'));

      // 3. Out-of-scope read access denied & current exact resource authority precedes disclosure
      const outOfScopeStaffToken = `wfs_${Buffer.alloc(32, 0x66).toString('base64url')}`;
      const outOfScopeStaffBearer = `Bearer ${outOfScopeStaffToken}`;
      const outOfScopeMembershipId = randomUUID();
      const outOfScopeSessionId = randomUUID();
      const otherResScope = randomUUID();

      await fixture.owner.query(`
        INSERT INTO users (id, email, role, is_active, name)
        VALUES (97, 'outofscope@example.test', 'admin', true, 'Out of Scope User')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO internal_organization_memberships(id, organization_id, user_id, status, accepted_at, changed_by, change_reason)
        VALUES ('${outOfScopeMembershipId}', '${organizationId}', 97, 'ACTIVE', clock_timestamp(), 90, 'Out of scope membership');
        INSERT INTO internal_staff_sessions(id, organization_id, membership_id, token_hash, status, assurance_level,
          authenticated_at, idle_expires_at, absolute_expires_at, environment)
        VALUES ('${outOfScopeSessionId}', '${organizationId}', '${outOfScopeMembershipId}',
          '${createHash('sha256').update(outOfScopeStaffToken).digest('hex')}', 'ACTIVE', 'AAL2',
          clock_timestamp(), clock_timestamp() + interval '20 minutes', clock_timestamp() + interval '4 hours', 'LOCAL');
        INSERT INTO internal_membership_grants(
          organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          grant_hash, granted_by, reason
        ) VALUES (
          '${organizationId}', '${outOfScopeMembershipId}', '${approverRoleVersionId}', 'FINANCIAL_CONTRACT', '${otherResScope}', 'LOCAL',
          '${createHash('sha256').update(randomUUID()).digest('hex')}', 90, 'Scoped only to other reservation'
        );
      `);

      let outOfScopePreviewError;
      try {
        await admissionService.getRefundDecisionPreview(outOfScopeStaffBearer, prepA01.actionReceipt.id);
      } catch (err) {
        outOfScopePreviewError = err;
      }
      assert.ok(
        outOfScopePreviewError.message.includes('PERMISSION_DENIED') ||
        outOfScopePreviewError.message.includes('ACTION_NOT_FOUND'),
        'Out-of-scope staff preview must be rejected with PERMISSION_DENIED or ACTION_NOT_FOUND'
      );

      // =======================================================================
      // ADM-01 & A06: PROTECTED REPLAY CONTROLS
      // =======================================================================
      // 1. Authorized exact replay still works after old factor expiry
      const replayedA01 = await admissionService.admitRefundDecision(makerBearer, {
        packet: packetA01,
        actionAuthorizationId: prepA01.actionReceipt.id,
        makerStepUpReceiptId: randomUUID(), // dummy / expired factor
      });
      assert.equal(replayedA01.replayed, true, 'Authorized exact replay works after factor expiry');

      // 2. Still-valid session with revoked capability cannot replay
      const makerGrantId = (await fixture.owner.query(
        `SELECT id FROM internal_membership_grants WHERE membership_id = $1 AND role_version_id = $2`,
        [reviewerMembershipId, preparerRoleVersionId]
      )).rows[0].id;
      await fixture.owner.query(
        `INSERT INTO internal_membership_grant_revocations(grant_id, revoked_by, reason)
         VALUES ($1, 90, 'Revoked maker grant for testing replay rejection')`,
        [makerGrantId]
      );

      let revokedReplayError;
      try {
        await admissionService.admitRefundDecision(makerBearer, {
          packet: packetA01,
          actionAuthorizationId: prepA01.actionReceipt.id,
          makerStepUpReceiptId: randomUUID(),
        });
      } catch (err) {
        revokedReplayError = err;
      }
      assert.ok(revokedReplayError, 'Revoked capability must be denied replay');
      assert.ok(revokedReplayError.message.includes('PERMISSION_DENIED'));

      // Restore maker grant by inserting a new active grant
      await fixture.owner.query(
        `INSERT INTO internal_membership_grants(
           organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
           grant_hash, granted_by, reason
         ) VALUES (
           $1, $2, $3, 'ORGANIZATION', $4, 'LOCAL',
           $5, 90, 'Restored maker grant after revocation test'
         )`,
        [organizationId, reviewerMembershipId, preparerRoleVersionId, organizationId, createHash('sha256').update(randomUUID()).digest('hex')]
      );

      // =======================================================================
      // SCENARIO A02: MAKER SELF-CHECKER & UNAUTHORIZED CHECKERS
      // =======================================================================
      // 1. Maker cannot approve own preparation (MAKER_CHECKER_CONFLICT)
      let broadPreparerError;
      try {
        await admissionService.approveRefundDecisionAdmission(makerBearer, {
          authorizationId: prepA01.actionReceipt.id,
          expectedCommandHash: prepA01.actionReceipt.commandHash,
          checkerStepUpReceiptId: makerStepUpA01,
          reason: 'Broad preparer attempting approval',
        });
      } catch (err) {
        broadPreparerError = err;
      }
      assert.ok(broadPreparerError, 'Maker cannot approve own preparation');
      assert.ok(
        broadPreparerError.message.includes('MAKER_CHECKER_CONFLICT') ||
        broadPreparerError.message.includes('PERMISSION_DENIED')
      );

      // =======================================================================
      // SCENARIO A03: SESSION & STEP-UP NEGATIVE CONTROLS
      // =======================================================================
      const badSessionBearer = `Bearer wfs_${Buffer.alloc(32, 0x00).toString('base64url')}`;
      let sessErrPreview, sessErrPrep, sessErrApprove, sessErrAdmit;
      try {
        await admissionService.deriveCanonicalPreview(badSessionBearer, {
          admissionCommandId: randomUUID(),
          decisionRef: 'DEC-BAD-SESS',
          reservationId: resA01.reservationId,
          approvedAmountMinor: '50000',
          reasonCode: 'BAD_SESSION',
          organizationId,
        });
      } catch (err) { sessErrPreview = err; }
      assert.ok(sessErrPreview?.message.includes('STAFF_SESSION_REQUIRED'), 'Preview requires staff session');

      try {
        await admissionService.prepareRefundDecisionAdmission(badSessionBearer, {
          packet: packetA01,
          makerStepUpReceiptId: makerStepUpA01,
          reason: 'Bad session prepare',
        });
      } catch (err) { sessErrPrep = err; }
      assert.ok(sessErrPrep?.message.includes('STAFF_SESSION_REQUIRED'), 'Prepare requires staff session');

      try {
        await admissionService.approveRefundDecisionAdmission(badSessionBearer, {
          authorizationId: prepA01.actionReceipt.id,
          expectedCommandHash: prepA01.actionReceipt.commandHash,
          checkerStepUpReceiptId: randomUUID(),
          reason: 'Bad session approve',
        });
      } catch (err) { sessErrApprove = err; }
      assert.ok(sessErrApprove?.message.includes('STAFF_SESSION_REQUIRED'), 'Approve requires staff session');

      try {
        await admissionService.admitRefundDecision(badSessionBearer, {
          packet: packetA01,
          actionAuthorizationId: prepA01.actionReceipt.id,
          makerStepUpReceiptId: makerStepUpA01,
        });
      } catch (err) { sessErrAdmit = err; }
      assert.ok(sessErrAdmit?.message.includes('STAFF_SESSION_REQUIRED'), 'Admit requires staff session');

      // Step-up negative control: bogus/unverified step-up receipt on prepare
      const badStepUpPacket = { ...packetA01, admissionCommandId: randomUUID(), decisionRef: 'DEC-STEPUP-' + randomUUID() };
      let badStepUpErr;
      try {
        await admissionService.prepareRefundDecisionAdmission(makerBearer, {
          packet: badStepUpPacket,
          makerStepUpReceiptId: randomUUID(),
          reason: 'Bad step-up prepare',
        });
      } catch (err) { badStepUpErr = err; }
      assert.ok(badStepUpErr, 'Bogus step-up receipt must be rejected on prepare');

      // =======================================================================
      // SCENARIO A05: CANONICAL DOMAIN EXCLUSIONS
      // =======================================================================
      // 1. Uncancelled reservation
      const resUncancelled = await createPaidReservation(50000);
      let uncancelledErr;
      try {
        await admissionService.deriveCanonicalPreview(makerBearer, {
          admissionCommandId: randomUUID(),
          decisionRef: 'DEC-UNCANCELLED',
          reservationId: resUncancelled.reservationId,
          approvedAmountMinor: '50000',
          reasonCode: 'TEST_UNCANCELLED',
          organizationId,
        });
      } catch (err) { uncancelledErr = err; }
      assert.ok(uncancelledErr?.message.includes('RESERVATION_NOT_CANCELLED'), 'Uncancelled reservation must be rejected');

      // 2. Amount exceeding captured ceiling
      const resCeiling = await createPaidReservation(50000);
      await cancelReservationV1(resCeiling.reservationId);
      let ceilingErr;
      try {
        await admissionService.deriveCanonicalPreview(makerBearer, {
          admissionCommandId: randomUUID(),
          decisionRef: 'DEC-CEILING',
          reservationId: resCeiling.reservationId,
          approvedAmountMinor: '60000',
          reasonCode: 'TEST_CEILING',
          organizationId,
        });
      } catch (err) { ceilingErr = err; }
      assert.ok(ceilingErr?.message.includes('APPROVED_AMOUNT_INVALID'), 'Amount exceeding ceiling must be rejected');

      // 3. Sealed V2 revision excluded
      const resSealed = await createPaidReservation(50000);
      await cancelReservationV1(resSealed.reservationId);
      const sealedRevisionId = randomUUID();
      await fixture.owner.query(`
        INSERT INTO canonical_reservation_revisions (
          id, reservation_id, version, room_type_id, offer_id, offer_revision,
          check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
        )
        SELECT
          $1, id, 2, room_type_id, offer_id, offer_revision,
          check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
        FROM canonical_reservations
        WHERE id = $2
      `, [sealedRevisionId, resSealed.reservationId]);
      await fixture.owner.query(`
        INSERT INTO canonical_reservation_revision_nights (
          revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
        ) SELECT $1, $2, d.id, d.calendar_date, r.room_type_id, 1
          FROM canonical_reservations r
          JOIN inventory_days d ON d.room_type_id = r.room_type_id AND d.calendar_date >= r.check_in_date AND d.calendar_date < r.check_out_date
          WHERE r.id = $2
      `, [sealedRevisionId, resSealed.reservationId]);
      await fixture.owner.query(`
        INSERT INTO canonical_reservation_revision_seals (
          revision_id, reservation_id
        ) VALUES (
          $1, $2
        )
      `, [sealedRevisionId, resSealed.reservationId]);

      let sealedErr;
      try {
        await admissionService.deriveCanonicalPreview(makerBearer, {
          admissionCommandId: randomUUID(),
          decisionRef: 'DEC-SEALED',
          reservationId: resSealed.reservationId,
          approvedAmountMinor: '50000',
          reasonCode: 'TEST_SEALED',
          organizationId,
        });
      } catch (err) { sealedErr = err; }
      assert.ok(sealedErr?.message.includes('SEALED_V2_REVISION_EXCLUDED'), 'Sealed V2 revision must be excluded');

      // =======================================================================
      // ADM-03: DEDICATED APPOINTMENT BINDINGS & NEGATIVE CONTROLS
      // =======================================================================

      // 2. Grant with amount cap lower than requested amount cannot approve
      const narrowCheckerToken = `wfs_${Buffer.alloc(32, 0x54).toString('base64url')}`;
      const narrowCheckerBearer = `Bearer ${narrowCheckerToken}`;
      const narrowCheckerMembershipId = randomUUID();
      const narrowCheckerSessionId = randomUUID();

      await fixture.owner.query(`
        INSERT INTO users (id, email, role, is_active, name)
        VALUES (94, 'narrow@example.test', 'admin', true, 'Narrow Approver')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO internal_organization_memberships(id, organization_id, user_id, status, accepted_at, changed_by, change_reason)
        VALUES ('${narrowCheckerMembershipId}', '${organizationId}', 94, 'ACTIVE', clock_timestamp(), 90, 'Narrow membership');
        INSERT INTO internal_staff_sessions(id, organization_id, membership_id, token_hash, status, assurance_level,
          authenticated_at, idle_expires_at, absolute_expires_at, environment)
        VALUES ('${narrowCheckerSessionId}', '${organizationId}', '${narrowCheckerMembershipId}',
          '${createHash('sha256').update(narrowCheckerToken).digest('hex')}', 'ACTIVE', 'AAL2',
          clock_timestamp(), clock_timestamp() + interval '20 minutes', clock_timestamp() + interval '4 hours', 'LOCAL');
        INSERT INTO internal_membership_grants(
          organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          max_amount_minor, grant_hash, granted_by, reason
        ) VALUES (
          '${organizationId}', '${narrowCheckerMembershipId}', '${approverRoleVersionId}', 'ORGANIZATION', '${organizationId}', 'LOCAL',
          10000, '${createHash('sha256').update(randomUUID()).digest('hex')}', 90, 'Cap at 10000 minor'
        );
      `);

      const resCap = await createPaidReservation(50000);
      await cancelReservationV1(resCap.reservationId);
      const packetCap = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: randomUUID(),
        decisionRef: 'DEC-CAP-' + randomUUID(),
        reservationId: resCap.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_CAP',
        organizationId: organizationId,
      });
      const envCap = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetCap, randomUUID(), 'Prepare refund admission Cap');
      const fpCap = admissionService.fingerprint(envCap);
      const stepUpCap = await performStepUp(makerToken, makerPasskey, fpCap);
      const prepCap = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetCap,
        makerStepUpReceiptId: stepUpCap,
        reason: 'Prepare refund admission Cap',
      });

      let amountCapError;
      try {
        await admissionService.approveRefundDecisionAdmission(narrowCheckerBearer, {
          authorizationId: prepCap.actionReceipt.id,
          expectedCommandHash: prepCap.actionReceipt.commandHash,
          checkerStepUpReceiptId: randomUUID(),
          reason: 'Narrow approver exceeding amount cap',
        });
      } catch (err) {
        amountCapError = err;
      }
      assert.ok(amountCapError, 'Approver with amount cap below requested amount must be rejected');
      assert.ok(
        amountCapError.message.includes('PERMISSION_DENIED') ||
        amountCapError.message.includes('ACTION_NOT_FOUND')
      );

      // 3. Legitimate scoped appointment success (scope_type = FINANCIAL_CONTRACT, scope_id = reservationId)
      const resScoped = await createPaidReservation(50000);
      await cancelReservationV1(resScoped.reservationId);
      const scopedCheckerToken = `wfs_${Buffer.alloc(32, 0x58).toString('base64url')}`;
      const scopedCheckerBearer = `Bearer ${scopedCheckerToken}`;
      const scopedCheckerMembershipId = randomUUID();
      const scopedCheckerSessionId = randomUUID();

      const scopedGrantId = randomUUID();
      await fixture.owner.query(`
        INSERT INTO users (id, email, role, is_active, name)
        VALUES (95, 'scoped_checker@example.test', 'admin', true, 'Scoped Checker')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO internal_organization_memberships(id, organization_id, user_id, status, accepted_at, changed_by, change_reason)
        VALUES ('${scopedCheckerMembershipId}', '${organizationId}', 95, 'ACTIVE', clock_timestamp(), 90, 'Scoped checker membership');
        INSERT INTO internal_staff_sessions(id, organization_id, membership_id, token_hash, status, assurance_level,
          authenticated_at, idle_expires_at, absolute_expires_at, environment)
        VALUES ('${scopedCheckerSessionId}', '${organizationId}', '${scopedCheckerMembershipId}',
          '${createHash('sha256').update(scopedCheckerToken).digest('hex')}', 'ACTIVE', 'AAL2',
          clock_timestamp(), clock_timestamp() + interval '20 minutes', clock_timestamp() + interval '4 hours', 'LOCAL');
        INSERT INTO internal_membership_grants(
          id, organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          grant_hash, granted_by, reason
        ) VALUES (
          '${scopedGrantId}', '${organizationId}', '${scopedCheckerMembershipId}', '${approverRoleVersionId}', 'FINANCIAL_CONTRACT', '${resScoped.reservationId}', 'LOCAL',
          '${createHash('sha256').update(randomUUID()).digest('hex')}', 90, 'Legitimate scoped checker grant'
        );
      `);

      const cmdScoped = randomUUID();
      const packetScoped = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdScoped,
        decisionRef: 'DEC-SCOPED-' + randomUUID(),
        reservationId: resScoped.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_SCOPED_SUCCESS',
        organizationId: organizationId,
      });
      const envScoped = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetScoped, randomUUID(), 'Prepare scoped success');
      const fpScoped = admissionService.fingerprint(envScoped);
      const stepUpScoped = await performStepUp(makerToken, makerPasskey, fpScoped);
      const prepScoped = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetScoped,
        makerStepUpReceiptId: stepUpScoped,
        reason: 'Prepare scoped success',
      });

      // Legitimate scoped preview and approval succeeds!
      const previewScoped = await admissionService.getRefundDecisionPreview(scopedCheckerBearer, prepScoped.actionReceipt.id);
      assert.equal(previewScoped.actionReceipt.id, prepScoped.actionReceipt.id);

      const scopedCheckerPasskey = await setupPasskeyForStaff(95, scopedCheckerMembershipId, scopedCheckerSessionId, scopedCheckerToken);
      const stepUpScopedChecker = await performStepUp(scopedCheckerToken, scopedCheckerPasskey, prepScoped.actionReceipt.commandHash);
      const approvedScoped = await admissionService.approveRefundDecisionAdmission(scopedCheckerBearer, {
        authorizationId: prepScoped.actionReceipt.id,
        expectedCommandHash: prepScoped.actionReceipt.commandHash,
        checkerStepUpReceiptId: stepUpScopedChecker,
        reason: 'Approved by Legitimate Scoped Approver',
      });
      assert.equal(approvedScoped.receipt.status, 'APPROVED');

      // Maker admits using the scoped checker's approval
      const admittedScoped = await admissionService.admitRefundDecision(makerBearer, {
        packet: packetScoped,
        actionAuthorizationId: prepScoped.actionReceipt.id,
        makerStepUpReceiptId: stepUpScoped,
      });
      assert.equal(admittedScoped.replayed, false);
      assert.equal(admittedScoped.commandId, cmdScoped);

      // Verify exact checker appointment grant and role version recorded
      const admScopedRow = (await fixture.owner.query(
        `SELECT checker_appointment_grant_id, checker_appointment_role_version_id
         FROM canonical_cancellation_refund_decision_admissions
         WHERE command_id = $1`,
        [cmdScoped]
      )).rows[0];
      assert.ok(admScopedRow, 'Scoped admission row must exist');
      assert.equal(admScopedRow.checker_appointment_grant_id, scopedGrantId, 'Must record exact scoped checker appointment grant id');
      assert.equal(admScopedRow.checker_appointment_role_version_id, approverRoleVersionId, 'Must record exact approver role version id');

      // 4. Wrong subject rejection: scoped checker cannot approve other reservation
      const resWrong = await createPaidReservation(50000);
      await cancelReservationV1(resWrong.reservationId);
      const cmdWrong = randomUUID();
      const packetWrong = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdWrong,
        decisionRef: 'DEC-WRONG-' + randomUUID(),
        reservationId: resWrong.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_WRONG_SUBJECT',
        organizationId: organizationId,
      });
      const envWrong = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetWrong, randomUUID(), 'Prepare wrong subject');
      const fpWrong = admissionService.fingerprint(envWrong);
      const stepUpWrong = await performStepUp(makerToken, makerPasskey, fpWrong);
      const prepWrong = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetWrong,
        makerStepUpReceiptId: stepUpWrong,
        reason: 'Prepare wrong subject',
      });

      let wrongSubjectError;
      try {
        await admissionService.approveRefundDecisionAdmission(scopedCheckerBearer, {
          authorizationId: prepWrong.actionReceipt.id,
          expectedCommandHash: prepWrong.actionReceipt.commandHash,
          checkerStepUpReceiptId: stepUpScopedChecker,
          reason: 'Scoped checker attempting wrong reservation approval',
        });
      } catch (err) {
        wrongSubjectError = err;
      }
      assert.ok(wrongSubjectError, 'Wrong subject approval must be rejected with PERMISSION_DENIED or ACTION_NOT_FOUND');
      assert.ok(
        wrongSubjectError.message.includes('PERMISSION_DENIED') ||
        wrongSubjectError.message.includes('ACTION_NOT_FOUND')
      );

      // 5. Expired appointment rejection
      const expiredCheckerToken = `wfs_${Buffer.alloc(32, 0x59).toString('base64url')}`;
      const expiredCheckerBearer = `Bearer ${expiredCheckerToken}`;
      const expiredCheckerMembershipId = randomUUID();
      const expiredCheckerSessionId = randomUUID();

      await fixture.owner.query(`
        INSERT INTO users (id, email, role, is_active, name)
        VALUES (96, 'expired_checker@example.test', 'admin', true, 'Expired Checker')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO internal_organization_memberships(id, organization_id, user_id, status, accepted_at, changed_by, change_reason)
        VALUES ('${expiredCheckerMembershipId}', '${organizationId}', 96, 'ACTIVE', clock_timestamp(), 90, 'Expired checker membership');
        INSERT INTO internal_staff_sessions(id, organization_id, membership_id, token_hash, status, assurance_level,
          authenticated_at, idle_expires_at, absolute_expires_at, environment)
        VALUES ('${expiredCheckerSessionId}', '${organizationId}', '${expiredCheckerMembershipId}',
          '${createHash('sha256').update(expiredCheckerToken).digest('hex')}', 'ACTIVE', 'AAL2',
          clock_timestamp(), clock_timestamp() + interval '20 minutes', clock_timestamp() + interval '4 hours', 'LOCAL');
        INSERT INTO internal_membership_grants(
          organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          grant_hash, granted_by, reason, valid_from, valid_until
        ) VALUES (
          '${organizationId}', '${expiredCheckerMembershipId}', '${approverRoleVersionId}', 'ORGANIZATION', '${organizationId}', 'LOCAL',
          '${createHash('sha256').update(randomUUID()).digest('hex')}', 90, 'Expired checker grant',
          clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 hour'
        );
      `);

      let expiredCheckerError;
      try {
        await admissionService.approveRefundDecisionAdmission(expiredCheckerBearer, {
          authorizationId: prepScoped.actionReceipt.id,
          expectedCommandHash: prepScoped.actionReceipt.commandHash,
          checkerStepUpReceiptId: stepUpScopedChecker,
          reason: 'Expired checker attempting approval',
        });
      } catch (err) {
        expiredCheckerError = err;
      }
      assert.ok(expiredCheckerError, 'Expired appointment must be rejected with PERMISSION_DENIED or ACTION_NOT_FOUND');
      assert.ok(
        expiredCheckerError.message.includes('PERMISSION_DENIED') ||
        expiredCheckerError.message.includes('ACTION_NOT_FOUND')
      );

      // 6. Revoked appointment rejection
      const revokedGrantId = (await fixture.owner.query(
        `SELECT id FROM internal_membership_grants WHERE membership_id = $1`,
        [scopedCheckerMembershipId]
      )).rows[0].id;
      await fixture.owner.query(
        `INSERT INTO internal_membership_grant_revocations (grant_id, revoked_by, reason)
         VALUES ($1, 90, 'Revoked scoped checker grant for test')`,
        [revokedGrantId]
      );

      let revokedCheckerError;
      try {
        await admissionService.approveRefundDecisionAdmission(scopedCheckerBearer, {
          authorizationId: prepScoped.actionReceipt.id,
          expectedCommandHash: prepScoped.actionReceipt.commandHash,
          checkerStepUpReceiptId: stepUpScopedChecker,
          reason: 'Revoked checker attempting approval',
        });
      } catch (err) {
        revokedCheckerError = err;
      }
      assert.ok(revokedCheckerError, 'Revoked appointment must be rejected with PERMISSION_DENIED or ACTION_NOT_FOUND');
      assert.ok(
        revokedCheckerError.message.includes('PERMISSION_DENIED') ||
        revokedCheckerError.message.includes('ACTION_NOT_FOUND')
      );

      // =======================================================================
      // ADM-02: FINANCIAL AUTHORITY BLOCKER REPRODUCTION
      // Transaction A ingests conflicting capture and holds open transaction;
      // Transaction B invokes issuer, blocked in pg_blocking_pids;
      // Commit A, B unblocks and rejects with PAYMENT_STATE_NOT_MATCHED_CAPTURE.
      // =======================================================================
      const resFin = await createPaidReservation(50000);
      const cancelFin = await cancelReservationV1(resFin.reservationId);
      const synthFinEvidenceId = randomUUID();
      await fixture.owner.query(`
        INSERT INTO canonical_cancellation_refund_decision_evidence (
          id, decision_ref, version, evidence_classification, approver_responsibility,
          approver_identity_ref, decision_at, reason_code, reason_text, approval_ref,
          verifying_component, verified_at, reservation_id, cancellation_event_id,
          cancellation_release_id, paid_bridge_id, payment_attempt_id, quote_id,
          payable_authority_id, provider_origin_kind, provider_payment_ref,
          supporting_provider_event_id, supporting_evidence_hash, approved_amount_paise,
          currency, permitted_submitting_component, permitted_issuer_role
        ) VALUES (
          $1, 'DEC-FIN', 1, 'LOCAL_SYNTHETIC_TEST_FIXTURE', 'ACCOMMODATION_FINANCE_APPROVER',
          'synth-fin-checker', clock_timestamp(), 'FIN_REASON', 'Financial test', 'synth-ref-fin',
          'REFUND_DECISION_AUTHORITY_PRIMITIVE', clock_timestamp(), $2, $3, $4, $5, $6, $7, $8, 'RAZORPAY', $9,
          $10, $11, 50000, 'INR', 'REFUND_DECISION_AUTHORITY_PRIMITIVE', 'encho_refund_issuer'
        )`,
        [
          synthFinEvidenceId,
          resFin.reservationId,
          cancelFin.cancellationEventId,
          cancelFin.cancellationReleaseId,
          resFin.paidBridgeId,
          resFin.paymentAttemptId,
          resFin.quoteId,
          resFin.payableAuthorityId,
          resFin.providerPaymentRef,
          resFin.supportingProviderEventId,
          resFin.supportingEvidenceHash,
        ]
      );

      const clientA = await fixture.owner.connect();
      const clientB = await refundIssuer.connect();
      let clientACommitted = false;
      let adm02Error = null;
      const adm02CleanupErrors = [];
      let promiseB;
      try {
        await clientA.query('BEGIN');
        // Ingest conflicting capture on same payment attempt inside Transaction A
        await clientA.query(
          `INSERT INTO canonical_provider_events (
            id, payment_attempt_id, origin_kind, provider_event_id, normalized_event_type,
            reported_amount_paise, reported_currency, provider_payment_ref, provider_order_ref,
            evidence_hash, evidence_payload, status
          ) VALUES ($1, $2, 'RAZORPAY', $3, 'PAYMENT_CAPTURED', 99999, 'INR', $4, $5, repeat('9', 64), '{"conflict": true}'::jsonb, 'PROCESSED')`,
          [randomUUID(), resFin.paymentAttemptId, 'evt_conflict_' + randomUUID(), resFin.providerPaymentRef, resFin.providerOrderRef]
        );
        // Lock payment attempt row in Transaction A
        await clientA.query('SELECT * FROM canonical_payment_attempts WHERE id = $1 FOR UPDATE', [resFin.paymentAttemptId]);

        // Transaction B invokes issuer in background
        promiseB = clientB.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), resFin.reservationId, synthFinEvidenceId]
        );

        // Wait and observe real database blocker in pg_blocking_pids
        let observedBlocker = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 50));
          const blockingRows = (await fixture.owner.query(`
            SELECT pid, pg_blocking_pids(pid) as blockers
            FROM pg_stat_activity
            WHERE query LIKE '%issue_cancellation_refund_authorization%'
          `)).rows;
          if (blockingRows.some(r => r.blockers && r.blockers.length > 0)) {
            observedBlocker = true;
            break;
          }
        }
        assert.ok(observedBlocker, 'Transaction B must be actively blocked by Transaction A in pg_blocking_pids');

        // Commit Transaction A (attempt is now in conflict)
        await clientA.query('COMMIT');
        clientACommitted = true;

        // Transaction B unblocks and must reject the unresolved basis
        let blockerResultError;
        try {
          await promiseB;
        } catch (err) {
          blockerResultError = err;
        }
        assert.ok(blockerResultError, 'Issuer must reject unresolved financial basis');
        assert.ok(
          blockerResultError.message.includes('CAPTURE_AMOUNT_CONFLICT') ||
          blockerResultError.message.includes('PAYMENT_STATE_NOT_MATCHED_CAPTURE') ||
          blockerResultError.message.includes('PAYMENT_RECONCILIATION_UNRESOLVED'),
          'Must fail with capture conflict or reconciliation error'
        );

        // Verify zero authorizations were created
        const finAuthCount = (await fixture.owner.query(
          `SELECT count(*)::int as c FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
          [resFin.reservationId]
        )).rows[0].c;
        assert.equal(finAuthCount, 0, 'Zero authorizations must be issued for conflicting capture');
      } catch (err) {
        adm02Error = err;
      } finally {
        if (!clientACommitted) {
          try {
            await clientA.query('ROLLBACK');
          } catch (err) {
            adm02CleanupErrors.push(err);
          }
        }
        try {
          clientA.release();
        } catch (err) {
          adm02CleanupErrors.push(err);
        }
        if (promiseB) {
          try {
            await promiseB;
          } catch (err) {
            const isExpectedLoser = clientACommitted && (
              err?.message?.includes('CAPTURE_AMOUNT_CONFLICT') ||
              err?.message?.includes('PAYMENT_STATE_NOT_MATCHED_CAPTURE') ||
              err?.message?.includes('PAYMENT_RECONCILIATION_UNRESOLVED')
            );
            if (!isExpectedLoser) {
              adm02CleanupErrors.push(err);
            }
          }
        }
        try {
          clientB.release();
        } catch (err) {
          adm02CleanupErrors.push(err);
        }

        const finalAdm02Err = combineErrors(adm02Error, adm02CleanupErrors, 'ADM02_FAILED');
        if (finalAdm02Err) throw finalAdm02Err;
      }

      // =======================================================================
      // SCENARIO A07: CONCURRENCY WITH OBSERVED BLOCKER (WINNER & LOSER RECOVERY)
      // =======================================================================
      const resA07 = await createPaidReservation(50000);
      await cancelReservationV1(resA07.reservationId);

      const cmdA07 = randomUUID();
      const packetA07 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA07,
        decisionRef: 'DEC-A07-' + randomUUID(),
        reservationId: resA07.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_A07_RACE',
        organizationId: organizationId,
      });

      const envA07 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetA07, randomUUID(), 'Prepare refund admission A07');
      const fpA07 = admissionService.fingerprint(envA07);
      const stepUpA07 = await performStepUp(makerToken, makerPasskey, fpA07);
      const prepA07 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {packet: packetA07, makerStepUpReceiptId: stepUpA07, reason: 'Prepare refund admission A07'});
      const chkStepUpA07 = await performStepUp(checkerToken, checkerPasskey, prepA07.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {authorizationId: prepA07.actionReceipt.id, expectedCommandHash: prepA07.actionReceipt.commandHash, checkerStepUpReceiptId: chkStepUpA07, reason: 'Approved A07 by checker'});

      // Caller 2 prepares competing distinct command A07_2 on the SAME reservation
      const cmdA07_2 = randomUUID();
      const packetA07_2 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA07_2,
        decisionRef: 'DEC-A07-2-' + randomUUID(),
        reservationId: resA07.reservationId,
        approvedAmountMinor: '40000',
        reasonCode: 'TEST_A07_CALLER2',
        organizationId: organizationId,
      });
      const envA07_2 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetA07_2, randomUUID(), 'Prepare distinct A07_2');
      const fpA07_2 = admissionService.fingerprint(envA07_2);
      const stepUpA07_2 = await performStepUp(makerToken, makerPasskey, fpA07_2);
      const prepA07_2 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {packet: packetA07_2, makerStepUpReceiptId: stepUpA07_2, reason: 'Prepare distinct A07_2'});
      const chkStepUpA07_2 = await performStepUp(checkerToken, checkerPasskey, prepA07_2.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {authorizationId: prepA07_2.actionReceipt.id, expectedCommandHash: prepA07_2.actionReceipt.commandHash, checkerStepUpReceiptId: chkStepUpA07_2, reason: 'Approved distinct A07_2 by checker'});

      // Dedicated 1-connection pools to pre-identify exact backend PIDs before execution
      const a07Caller1Pool = new pg.Pool({ ...fixture.owner.options, user: 'w1_offer_staff', max: 1 });
      const a07Caller2Pool = new pg.Pool({ ...fixture.owner.options, user: 'w1_offer_staff', max: 1 });
      const a07Caller1Service = new CanonicalRefundDecisionAdmissionService(a07Caller1Pool, 'LOCAL');
      const a07Caller2Service = new CanonicalRefundDecisionAdmissionService(a07Caller2Pool, 'LOCAL');

      const caller1Pid = (await a07Caller1Pool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
      const caller2Pid = (await a07Caller2Pool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
      assert.ok(caller1Pid, 'Caller 1 PID must be pre-identified');
      assert.ok(caller2Pid, 'Caller 2 PID must be pre-identified');

      let releaseCaller1;
      let caller1Released = false;
      const caller1HoldPromise = new Promise(resolve => {
        releaseCaller1 = () => {
          if (!caller1Released) {
            caller1Released = true;
            resolve();
          }
        };
      });

      let caller1AtHook;
      let caller1AtHookReject;
      const caller1EnteredPromise = new Promise((resolve, reject) => {
        caller1AtHook = resolve;
        caller1AtHookReject = reject;
      });

      let caller1Promise;
      let caller2Promise;
      let raceResult1;
      let caller2Error;
      let a07DistinctError = null;
      const a07DistinctCleanupErrors = [];

      try {
        caller1Promise = (async () => {
          try {
            return await a07Caller1Service.admitRefundDecision(makerBearer, {
              packet: packetA07,
              actionAuthorizationId: prepA07.actionReceipt.id,
              makerStepUpReceiptId: stepUpA07,
              postAdmissionHook: async (client, result) => {
                caller1AtHook();
                await caller1HoldPromise;
              },
            });
          } catch (err) {
            caller1AtHookReject(err);
            throw err;
          }
        })();

        // Wait boundedly for Caller 1 to execute admit_cancellation_refund_decision and reach hook
        await Promise.race([
          caller1EnteredPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('CALLER1_HOOK_TIMEOUT')), 5000)),
        ]);

        // Caller 2 concurrently attempts admission on the same reservation
        caller2Promise = (async () => {
          return await a07Caller2Service.admitRefundDecision(makerBearer, {
            packet: packetA07_2,
            actionAuthorizationId: prepA07_2.actionReceipt.id,
            makerStepUpReceiptId: stepUpA07_2,
          });
        })();

        // Observe in pg_blocking_pids that exact Caller 2 is blocked on the reservation row lock by exact Caller 1
        let observedA07Blocker = false;
        const a07Deadline = Date.now() + 4000;
        while (Date.now() < a07Deadline) {
          const row = (await fixture.owner.query(`
            SELECT pid, pg_blocking_pids(pid) as blockers, wait_event_type, wait_event
            FROM pg_stat_activity
            WHERE pid = $1
          `, [caller2Pid])).rows[0];
          if (row && Array.isArray(row.blockers) && row.blockers.includes(caller1Pid)) {
            observedA07Blocker = true;
            break;
          }
          await new Promise(r => setTimeout(r, 40));
        }
        assert.ok(observedA07Blocker, 'Caller 2 must be observed blocked on reservation lock by Caller 1 in pg_blocking_pids');

        // Release Caller 1 to commit
        releaseCaller1();
        raceResult1 = await caller1Promise;
        assert.ok(raceResult1.evidenceId);
        assert.ok(raceResult1.admissionId);
        assert.equal(raceResult1.replayed, false);

        // Caller 2 unblocks and is rejected with REFUND_DECISION_ALREADY_ADMITTED
        try {
          await caller2Promise;
        } catch (err) {
          caller2Error = err;
        }
        assert.ok(caller2Error, 'Caller 2 must be rejected with REFUND_DECISION_ALREADY_ADMITTED');
        assert.ok(
          caller2Error.message.includes('REFUND_DECISION_ALREADY_ADMITTED'),
          'Caller 2 must fail with REFUND_DECISION_ALREADY_ADMITTED'
        );
      } catch (err) {
        a07DistinctError = err;
      } finally {
        releaseCaller1();
        if (caller1Promise) {
          try {
            await caller1Promise;
          } catch (err) {
            a07DistinctCleanupErrors.push(err);
          }
        }
        if (caller2Promise) {
          try {
            await caller2Promise;
          } catch (err) {
            // Expected rejection of losing entrant is REFUND_DECISION_ALREADY_ADMITTED; preserve any other unexpected error
            if (!err?.message?.includes('REFUND_DECISION_ALREADY_ADMITTED')) {
              a07DistinctCleanupErrors.push(err);
            }
          }
        }
        try {
          await a07Caller1Pool.end();
        } catch (err) {
          a07DistinctCleanupErrors.push(err);
        }
        try {
          await a07Caller2Pool.end();
        } catch (err) {
          a07DistinctCleanupErrors.push(err);
        }

        const finalA07DistinctErr = combineErrors(a07DistinctError, a07DistinctCleanupErrors, 'A07_DISTINCT_FAILED');
        if (finalA07DistinctErr) throw finalA07DistinctErr;
      }

      // Assert losing action state: action was not consumed (remains APPROVED after rollback)
      const caller2AuthStatus = (await fixture.owner.query(
        `SELECT status FROM internal_action_authorizations WHERE id = $1`,
        [prepA07_2.actionReceipt.id]
      )).rows[0].status;
      assert.equal(caller2AuthStatus, 'APPROVED', 'Losing action must remain APPROVED (not consumed) after rollback');

      // Exactly 1 admission row and 1 evidence row exist for reservation
      const a07AdmissionsCount = (await fixture.owner.query(
        `SELECT count(*)::int as c
         FROM canonical_cancellation_refund_decision_admissions a
         JOIN canonical_cancellation_refund_decision_evidence dev ON dev.id = a.decision_evidence_id
         WHERE dev.reservation_id = $1`,
        [resA07.reservationId]
      )).rows[0].c;
      assert.equal(a07AdmissionsCount, 1, 'Exactly one admission row must exist for reservation after race');

      const a07EvidenceCount = (await fixture.owner.query(
        `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_evidence WHERE reservation_id = $1`,
        [resA07.reservationId]
      )).rows[0].c;
      assert.equal(a07EvidenceCount, 1, 'Exactly one evidence row must exist for reservation after race');

      // Concurrent identical-command race demonstration
      const resA07Iden = await createPaidReservation(50000);
      await cancelReservationV1(resA07Iden.reservationId);
      const cmdA07Iden = randomUUID();
      const packetA07Iden = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA07Iden,
        decisionRef: 'DEC-A07-IDEN-' + randomUUID(),
        reservationId: resA07Iden.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_A07_IDEN_RACE',
        organizationId: organizationId,
      });
      const envA07Iden = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetA07Iden, randomUUID(), 'Prepare identical A07');
      const fpA07Iden = admissionService.fingerprint(envA07Iden);
      const stepUpA07Iden = await performStepUp(makerToken, makerPasskey, fpA07Iden);
      const prepA07Iden = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetA07Iden,
        makerStepUpReceiptId: stepUpA07Iden,
        reason: 'Prepare identical A07',
      });
      const chkStepUpA07Iden = await performStepUp(checkerToken, checkerPasskey, prepA07Iden.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {
        authorizationId: prepA07Iden.actionReceipt.id,
        expectedCommandHash: prepA07Iden.actionReceipt.commandHash,
        checkerStepUpReceiptId: chkStepUpA07Iden,
        reason: 'Approved identical A07 by checker',
      });

      // Dedicated 1-connection pools to pre-identify exact backend PIDs before execution
      const a07Iden1Pool = new pg.Pool({ ...fixture.owner.options, user: 'w1_offer_staff', max: 1 });
      const a07Iden2Pool = new pg.Pool({ ...fixture.owner.options, user: 'w1_offer_staff', max: 1 });
      const a07Iden1Service = new CanonicalRefundDecisionAdmissionService(a07Iden1Pool, 'LOCAL');
      const a07Iden2Service = new CanonicalRefundDecisionAdmissionService(a07Iden2Pool, 'LOCAL');

      const iden1Pid = (await a07Iden1Pool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
      const iden2Pid = (await a07Iden2Pool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
      assert.ok(iden1Pid, 'Identical entrant 1 PID must be pre-identified');
      assert.ok(iden2Pid, 'Identical entrant 2 PID must be pre-identified');

      let releaseIden1;
      let iden1Released = false;
      const iden1HoldPromise = new Promise(resolve => {
        releaseIden1 = () => {
          if (!iden1Released) {
            iden1Released = true;
            resolve();
          }
        };
      });

      let iden1AtHook;
      let iden1AtHookReject;
      const iden1EnteredPromise = new Promise((resolve, reject) => {
        iden1AtHook = resolve;
        iden1AtHookReject = reject;
      });

      let iden1Promise;
      let iden2Promise;
      let idenResult1;
      let idenResult2;
      let a07IdenError = null;
      const a07IdenCleanupErrors = [];

      try {
        iden1Promise = (async () => {
          try {
            return await a07Iden1Service.admitRefundDecision(makerBearer, {
              packet: packetA07Iden,
              actionAuthorizationId: prepA07Iden.actionReceipt.id,
              makerStepUpReceiptId: stepUpA07Iden,
              postAdmissionHook: async (client, result) => {
                iden1AtHook();
                await iden1HoldPromise;
              },
            });
          } catch (err) {
            iden1AtHookReject(err);
            throw err;
          }
        })();

        // Wait boundedly for entrant 1 to reach hook
        await Promise.race([
          iden1EnteredPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('IDEN1_HOOK_TIMEOUT')), 5000)),
        ]);

        // Entrant 2 concurrently attempts identical admission
        iden2Promise = (async () => {
          return await a07Iden2Service.admitRefundDecision(makerBearer, {
            packet: packetA07Iden,
            actionAuthorizationId: prepA07Iden.actionReceipt.id,
            makerStepUpReceiptId: stepUpA07Iden,
          });
        })();

        // Observe in pg_blocking_pids that exact iden2Pid is blocked on reservation lock by exact iden1Pid
        let observedIdenBlocker = false;
        const idenDeadline = Date.now() + 4000;
        while (Date.now() < idenDeadline) {
          const row = (await fixture.owner.query(`
            SELECT pid, pg_blocking_pids(pid) as blockers, wait_event_type, wait_event
            FROM pg_stat_activity
            WHERE pid = $1
          `, [iden2Pid])).rows[0];
          if (row && Array.isArray(row.blockers) && row.blockers.includes(iden1Pid)) {
            observedIdenBlocker = true;
            break;
          }
          await new Promise(r => setTimeout(r, 40));
        }
        assert.ok(observedIdenBlocker, 'Concurrent identical caller must be observed blocked on reservation lock by winner');

        // Release entrant 1 to commit
        releaseIden1();
        idenResult1 = await iden1Promise;
        idenResult2 = await iden2Promise;
      } catch (err) {
        a07IdenError = err;
      } finally {
        releaseIden1();
        if (iden1Promise) {
          try {
            await iden1Promise;
          } catch (err) {
            a07IdenCleanupErrors.push(err);
          }
        }
        if (iden2Promise) {
          try {
            await iden2Promise;
          } catch (err) {
            a07IdenCleanupErrors.push(err);
          }
        }
        try {
          await a07Iden1Pool.end();
        } catch (err) {
          a07IdenCleanupErrors.push(err);
        }
        try {
          await a07Iden2Pool.end();
        } catch (err) {
          a07IdenCleanupErrors.push(err);
        }

        const finalA07IdenErr = combineErrors(a07IdenError, a07IdenCleanupErrors, 'A07_IDEN_FAILED');
        if (finalA07IdenErr) throw finalA07IdenErr;
      }

      assert.equal(idenResult1.replayed, false);
      assert.equal(idenResult2.replayed, true);
      assert.equal(idenResult1.evidenceId, idenResult2.evidenceId);
      assert.equal(idenResult1.admissionId, idenResult2.admissionId);

      const idenAdmissionsCount = (await fixture.owner.query(
        `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1`,
        [cmdA07Iden]
      )).rows[0].c;
      assert.equal(idenAdmissionsCount, 1, 'Exactly one admission row must exist after identical race convergence');

      // =======================================================================
      // SCENARIO A08: INJECTED FAILURE ROLLBACK AT AUDIT STAGE
      // Witness consumption and domain insertion in-flight, then rollback.
      // =======================================================================
      const resA08 = await createPaidReservation(50000);
      await cancelReservationV1(resA08.reservationId);

      const cmdA08 = randomUUID();
      const packetA08 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA08,
        decisionRef: 'DEC-A08-' + randomUUID(),
        reservationId: resA08.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_A08_ABORT',
        organizationId: organizationId,
      });

      const envA08 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetA08, randomUUID(), 'Prepare refund admission A08');
      const fpA08 = admissionService.fingerprint(envA08);
      const stepUpA08 = await performStepUp(makerToken, makerPasskey, fpA08);
      const prepA08 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {packet: packetA08, makerStepUpReceiptId: stepUpA08, reason: 'Prepare refund admission A08'});
      const chkStepUpA08 = await performStepUp(checkerToken, checkerPasskey, prepA08.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {authorizationId: prepA08.actionReceipt.id, expectedCommandHash: prepA08.actionReceipt.commandHash, checkerStepUpReceiptId: chkStepUpA08, reason: 'Approved A08 by checker'});

      // Snapshot scoped state before failure injection
      const beforeA08 = {
        action: (await fixture.owner.query(
          'SELECT id, status, version, consumed_transaction_id FROM internal_action_authorizations WHERE id = $1',
          [prepA08.actionReceipt.id]
        )).rows[0],
        factors: (await fixture.owner.query(
          'SELECT id, status, consumed_at FROM internal_step_up_challenges WHERE id = ANY($1::uuid[]) ORDER BY id',
          [[stepUpA08, chkStepUpA08]]
        )).rows,
        audit: (await fixture.owner.query(
          "SELECT sequence, event_type, entity_id FROM internal_iam_events WHERE entity_id = $1 ORDER BY sequence",
          [resA08.reservationId]
        )).rows,
      };

      let witnessedInFlightWrite = false;
      let injectedAbortError;
      try {
        await admissionService.admitRefundDecision(makerBearer, {
          packet: packetA08,
          actionAuthorizationId: prepA08.actionReceipt.id,
          makerStepUpReceiptId: stepUpA08,
          postAdmissionHook: async (client, result) => {
            // Witness consumption and domain insertion in the active transaction
            const inFlightAdmitted = (await client.query(
              `SELECT * FROM get_admitted_cancellation_refund_decision($1)`,
              [cmdA08]
            )).rows;
            const inFlightAuth = (await client.query(
              `SELECT status FROM internal_action_authorizations WHERE id = $1`,
              [prepA08.actionReceipt.id]
            )).rows[0].status;

            if (inFlightAdmitted.length === 1 && inFlightAdmitted[0].evidence_id === result.evidence_id && inFlightAuth === 'CONSUMED') {
              witnessedInFlightWrite = true;
            }
            throw new Error('INJECTED_AUDIT_STAGE_FAILURE');
          },
        });
      } catch (err) {
        injectedAbortError = err;
      }
      assert.ok(injectedAbortError, 'Injected audit stage failure must cause rollback');
      assert.equal(injectedAbortError.message, 'INJECTED_AUDIT_STAGE_FAILURE', 'Error message must strictly match injected cause');
      assert.ok(witnessedInFlightWrite, 'Must witness in-flight domain insertion and consumption before aborting');

      // Verify atomic rollback in DB
      const a08Admissions = (await fixture.owner.query(
        `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1`,
        [cmdA08]
      )).rows[0].c;
      assert.equal(a08Admissions, 0, 'Admissions table must have 0 rows after rollback');

      const a08Evidence = (await fixture.owner.query(
        `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_evidence WHERE reservation_id = $1`,
        [resA08.reservationId]
      )).rows[0].c;
      assert.equal(a08Evidence, 0, 'Decision evidence table must have 0 rows after rollback');

      // Scoped action authorization, factor, and audit restoration
      const afterA08Action = (await fixture.owner.query(
        'SELECT id, status, version, consumed_transaction_id FROM internal_action_authorizations WHERE id = $1',
        [prepA08.actionReceipt.id]
      )).rows[0];
      assert.deepStrictEqual(afterA08Action, beforeA08.action, 'Action authorization must be restored to exact prior state');
      assert.equal(afterA08Action.status, 'APPROVED', 'Action authorization must remain APPROVED after rollback');

      const afterA08Factors = (await fixture.owner.query(
        'SELECT id, status, consumed_at FROM internal_step_up_challenges WHERE id = ANY($1::uuid[]) ORDER BY id',
        [[stepUpA08, chkStepUpA08]]
      )).rows;
      assert.deepStrictEqual(afterA08Factors, beforeA08.factors, 'Step-up challenges must remain unconsumed after rollback');

      const afterA08Audit = (await fixture.owner.query(
        "SELECT sequence, event_type, entity_id FROM internal_iam_events WHERE entity_id = $1 ORDER BY sequence",
        [resA08.reservationId]
      )).rows;
      assert.deepStrictEqual(afterA08Audit, beforeA08.audit, 'Audit log events must remain restored after rollback');

      // Re-trying without failure hook succeeds cleanly
      const a08Recovered = await admissionService.admitRefundDecision(makerBearer, {
        packet: packetA08,
        actionAuthorizationId: prepA08.actionReceipt.id,
        makerStepUpReceiptId: stepUpA08,
      });
      assert.equal(a08Recovered.replayed, false);
      assert.equal(a08Recovered.commandId, cmdA08);

      // =======================================================================
      // SCENARIO A09: LOST COMMIT ACKNOWLEDGEMENT RECOVERY
      // =======================================================================
      // Prepare fresh command A09
      const resA09 = await createPaidReservation(50000);
      await cancelReservationV1(resA09.reservationId);

      const cmdA09 = randomUUID();
      const packetA09 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA09,
        decisionRef: 'DEC-A09-' + randomUUID(),
        reservationId: resA09.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_A09_LOST_COMMIT',
        organizationId: organizationId,
      });

      const envA09 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetA09, randomUUID(), 'Prepare refund admission A09');
      const fpA09 = admissionService.fingerprint(envA09);
      const stepUpA09 = await performStepUp(makerToken, makerPasskey, fpA09);
      const prepA09 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {packet: packetA09, makerStepUpReceiptId: stepUpA09, reason: 'Prepare refund admission A09'});
      const chkStepUpA09 = await performStepUp(checkerToken, checkerPasskey, prepA09.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {authorizationId: prepA09.actionReceipt.id, expectedCommandHash: prepA09.actionReceipt.commandHash, checkerStepUpReceiptId: chkStepUpA09, reason: 'Approved A09 by checker'});

      // Inject lost commit acknowledgement by wrapping pool connect
      const originalConnect = fixture.staffPool.connect.bind(fixture.staffPool);
      let simulatedLostCommitTriggered = false;
      fixture.staffPool.connect = async () => {
        const client = await originalConnect();
        const originalQuery = client.query.bind(client);
        let hasRunAdmission = false;
        client.query = async (text, params) => {
          if (typeof text === 'string' && text.includes('admit_cancellation_refund_decision')) {
            hasRunAdmission = true;
          }
          if (typeof text === 'string' && text.trim().toUpperCase() === 'COMMIT' && hasRunAdmission && !simulatedLostCommitTriggered) {
            simulatedLostCommitTriggered = true;
            // Execute real commit in DB
            await originalQuery('COMMIT');
            // Throw socket disconnect simulation so caller sees OUTCOME_UNKNOWN
            throw new Error('SIMULATED_NETWORK_DROP_AFTER_COMMIT');
          }
          return originalQuery(text, params);
        };
        return client;
      };

      let outcomeUnknownEncountered = false;
      let admittedA09;
      try {
        admittedA09 = await admissionService.admitRefundDecision(makerBearer, {
          packet: packetA09,
          actionAuthorizationId: prepA09.actionReceipt.id,
          makerStepUpReceiptId: stepUpA09,
        });
      } finally {
        fixture.staffPool.connect = originalConnect;
      }

      assert.ok(simulatedLostCommitTriggered, 'Must have triggered simulated lost commit drop');
      // Because admitRefundDecision has built-in uncertainty recovery, it recovered with replayed: true!
      assert.equal(admittedA09.replayed, true, 'Uncertainty recovery must recover committed admission with replayed: true');

      // Verify no duplicate consumption or domain rows
      const a09Admissions = (await fixture.owner.query(
        `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1`,
        [cmdA09]
      )).rows[0].c;
      assert.equal(a09Admissions, 1, 'Exactly one admission row must exist after lost-commit recovery');

      const a09AuthRow = (await fixture.owner.query(
        `SELECT status, version FROM internal_action_authorizations WHERE id = $1`,
        [prepA09.actionReceipt.id]
      )).rows[0];
      assert.equal(a09AuthRow.status, 'CONSUMED');
      assert.equal(a09AuthRow.version, 3, 'Action authorization must be consumed exactly once');

      // =======================================================================
      // SCENARIO A10: DOWNSTREAM ISSUE_CANCELLATION_REFUND_AUTHORIZATION
      // =======================================================================
      const issueCmdA10 = randomUUID();
      const issueResA10 = (await refundIssuer.query(
        `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
        [issueCmdA10, resA01.reservationId, admittedA01.evidenceId]
      )).rows[0];

      assert.ok(issueResA10, 'issue_cancellation_refund_authorization must return issued authorization');
      assert.equal(issueResA10.issuing_role, 'encho_refund_issuer');
      assert.equal(issueResA10.approved_amount_paise, '50000');
      assert.equal(issueResA10.replayed, false);

      // Negative Control: Forged provenance
      const resForged = await createPaidReservation(50000);
      await cancelReservationV1(resForged.reservationId);
      const forgedEvidenceId = randomUUID();
      await fixture.owner.query(`
        INSERT INTO canonical_cancellation_refund_decision_evidence (
          id, decision_ref, version, evidence_classification, approver_responsibility,
          approver_identity_ref, decision_at, reason_code, reason_text, approval_ref,
          verifying_component, verified_at, reservation_id, cancellation_event_id,
          cancellation_release_id, paid_bridge_id, payment_attempt_id, quote_id,
          payable_authority_id, provider_origin_kind, provider_payment_ref,
          supporting_provider_event_id, supporting_evidence_hash, approved_amount_paise,
          currency, permitted_submitting_component, permitted_issuer_role
        ) VALUES (
          $1, 'DEC-FORGED', 1, 'AUTHENTICATED_HUMAN_APPROVAL', 'ACCOMMODATION_FINANCE_APPROVER',
          'bogus-checker', clock_timestamp(), 'FORGED', 'Forged test', 'bogus-auth-id',
          'FORGED', clock_timestamp(), $2, $3, $4, $5, $6, $7, $8, 'RAZORPAY', $9,
          $10, $11, 50000, 'INR', 'REFUND_DECISION_AUTHORITY_PRIMITIVE', 'encho_refund_issuer'
        )`,
        [
          forgedEvidenceId,
          resForged.reservationId,
          (await fixture.owner.query(`SELECT event_id FROM canonical_reservation_events WHERE reservation_id = $1 AND event_type = 'CANCELLED'`, [resForged.reservationId])).rows[0].event_id,
          (await fixture.owner.query(`SELECT release_id FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`, [resForged.reservationId])).rows[0].release_id,
          resForged.paidBridgeId,
          resForged.paymentAttemptId,
          resForged.quoteId,
          resForged.payableAuthorityId,
          resForged.providerPaymentRef,
          resForged.supportingProviderEventId,
          resForged.supportingEvidenceHash,
        ]
      );

      let forgedProvenanceError;
      try {
        await refundIssuer.query(
          `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
          [randomUUID(), resForged.reservationId, forgedEvidenceId]
        );
      } catch (err) {
        forgedProvenanceError = err;
      }
      assert.ok(forgedProvenanceError, 'Forged provenance must be rejected by issue_cancellation_refund_authorization');
      assert.ok(forgedProvenanceError.message.includes('ADMISSION_PROVENANCE_NOT_FOUND'));

      // =======================================================================
      // SCENARIO A11: IMMUTABILITY TRIGGERS & 16-TABLE SNAPSHOT VERIFICATION
      // =======================================================================
      let updateAdmError;
      try {
        await fixture.owner.query(`
          UPDATE canonical_cancellation_refund_decision_admissions
          SET admitting_principal = 'hacked'
          WHERE id = $1`,
          [admittedA01.admissionId]
        );
      } catch (err) {
        updateAdmError = err;
      }
      assert.ok(updateAdmError, 'UPDATE on admissions table must be rejected');
      assert.ok(updateAdmError.message.includes('CANONICAL_REFUND_DECISION_ADMISSION_IMMUTABLE'));

      let deleteAdmError;
      try {
        await fixture.owner.query(`
          DELETE FROM canonical_cancellation_refund_decision_admissions
          WHERE id = $1`,
          [admittedA01.admissionId]
        );
      } catch (err) {
        deleteAdmError = err;
      }
      assert.ok(deleteAdmError, 'DELETE on admissions table must be rejected');
      assert.ok(deleteAdmError.message.includes('CANONICAL_REFUND_DECISION_ADMISSION_IMMUTABLE'));

      let updatePrepError;
      try {
        await fixture.owner.query(`
          UPDATE canonical_cancellation_refund_decision_preparations
          SET packet_payload = '{}'::jsonb
          WHERE command_id = $1`,
          [cmdA01]
        );
      } catch (err) {
        updatePrepError = err;
      }
      assert.ok(updatePrepError, 'UPDATE on preparations table must be rejected');
      assert.ok(updatePrepError.message.includes('CANONICAL_REFUND_DECISION_PREPARATION_IMMUTABLE'));

      let deletePrepError;
      try {
        await fixture.owner.query(`
          DELETE FROM canonical_cancellation_refund_decision_preparations
          WHERE command_id = $1`,
          [cmdA01]
        );
      } catch (err) {
        deletePrepError = err;
      }
      assert.ok(deletePrepError, 'DELETE on preparations table must be rejected');
      assert.ok(deletePrepError.message.includes('CANONICAL_REFUND_DECISION_PREPARATION_IMMUTABLE'));

      // 16-table snapshot comparison before and after an admission
      const resA11 = await createPaidReservation(50000);
      await cancelReservationV1(resA11.reservationId);
      const cmdA11 = randomUUID();
      const packetA11 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA11,
        decisionRef: 'DEC-A11-' + randomUUID(),
        reservationId: resA11.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_A11_IMMUTABILITY',
        organizationId: organizationId,
      });
      const envA11 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetA11, randomUUID(), 'Prepare admission A11');
      const fpA11 = admissionService.fingerprint(envA11);
      const stepUpA11 = await performStepUp(makerToken, makerPasskey, fpA11);
      const prepA11 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetA11,
        makerStepUpReceiptId: stepUpA11,
        reason: 'Prepare admission A11',
      });
      const chkStepUpA11 = await performStepUp(checkerToken, checkerPasskey, prepA11.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {
        authorizationId: prepA11.actionReceipt.id,
        expectedCommandHash: prepA11.actionReceipt.commandHash,
        checkerStepUpReceiptId: chkStepUpA11,
        reason: 'Approved admission A11 by checker',
      });

      // Snapshot identified rows and counters before admitRefundDecision
      const resRowBeforeA11 = (await fixture.owner.query(
        'SELECT * FROM canonical_reservations WHERE id = $1',
        [resA11.reservationId]
      )).rows[0];
      const attemptRowBeforeA11 = (await fixture.owner.query(
        'SELECT * FROM canonical_payment_attempts WHERE id = $1',
        [resA11.paymentAttemptId]
      )).rows[0];
      const payableRowBeforeA11 = (await fixture.owner.query(
        'SELECT * FROM canonical_payable_authorities WHERE quote_id = $1',
        [resA11.quoteId]
      )).rows[0];
      const inventoryBeforeA11 = (await fixture.owner.query(
        `SELECT d.id, d.room_type_id, d.calendar_date, d.total_units, d.held_units, d.booked_units, d.blocked_units
         FROM inventory_days d
         JOIN canonical_reservation_nights n ON n.inventory_day_id = d.id
         WHERE n.reservation_id = $1
         ORDER BY d.calendar_date`,
        [resA11.reservationId]
      )).rows;

      // Snapshot all 16 canonical commerce tables immediately before admitRefundDecision
      const snapBeforeA11 = await snapshotCanonicalCommerce();

      // Admit
      await admissionService.admitRefundDecision(makerBearer, {
        packet: packetA11,
        actionAuthorizationId: prepA11.actionReceipt.id,
        makerStepUpReceiptId: stepUpA11,
      });

      // Snapshot all 16 canonical commerce tables immediately after admitRefundDecision
      const snapAfterA11 = await snapshotCanonicalCommerce();
      assert.deepStrictEqual(snapBeforeA11, snapAfterA11, 'Admission must produce zero side-effects on 16 canonical commerce tables');

      // Verify zero mutation on specific identified rows and inventory counters
      const resRowAfterA11 = (await fixture.owner.query(
        'SELECT * FROM canonical_reservations WHERE id = $1',
        [resA11.reservationId]
      )).rows[0];
      const attemptRowAfterA11 = (await fixture.owner.query(
        'SELECT * FROM canonical_payment_attempts WHERE id = $1',
        [resA11.paymentAttemptId]
      )).rows[0];
      const payableRowAfterA11 = (await fixture.owner.query(
        'SELECT * FROM canonical_payable_authorities WHERE quote_id = $1',
        [resA11.quoteId]
      )).rows[0];
      const inventoryAfterA11 = (await fixture.owner.query(
        `SELECT d.id, d.room_type_id, d.calendar_date, d.total_units, d.held_units, d.booked_units, d.blocked_units
         FROM inventory_days d
         JOIN canonical_reservation_nights n ON n.inventory_day_id = d.id
         WHERE n.reservation_id = $1
         ORDER BY d.calendar_date`,
        [resA11.reservationId]
      )).rows;

      assert.deepStrictEqual(resRowBeforeA11, resRowAfterA11, 'Zero mutation on canonical_reservations row');
      assert.deepStrictEqual(attemptRowBeforeA11, attemptRowAfterA11, 'Zero mutation on canonical_payment_attempts row');
      assert.deepStrictEqual(payableRowBeforeA11, payableRowAfterA11, 'Zero mutation on canonical_payable_authorities row');
      assert.deepStrictEqual(inventoryBeforeA11, inventoryAfterA11, 'Zero mutation on inventory_days counters');

      // Verify zero mutation on bookings table
      const postBookingCounts = (await fixture.owner.query('SELECT count(*)::int as c FROM bookings')).rows[0].c;
      assert.equal(postBookingCounts, 0, 'Zero side-effect mutation on bookings');

      // =======================================================================
      // REGRESSION CONTROLS: R1, R2, R3 CONSOLIDATED FINDINGS
      // =======================================================================
      // R1: Normalized version retention and restricted preparation checks
      const resR1 = await createPaidReservation(50000);
      await cancelReservationV1(resR1.reservationId);
      const cmdR1 = randomUUID();
      const packetR1 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdR1,
        decisionRef: 'DEC-R1-' + randomUUID(),
        decisionVersion: 1,
        reservationId: resR1.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_R1_REGRESSION',
        organizationId: organizationId,
      });
      // JSONB version 1.0 normalization check:
      packetR1.decisionVersion = 1.0;
      const envR1 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetR1, randomUUID(), 'Prepare R1');
      const fpR1 = admissionService.fingerprint(envR1);
      const stepUpR1 = await performStepUp(makerToken, makerPasskey, fpR1);
      const prepR1 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetR1,
        makerStepUpReceiptId: stepUpR1,
        reason: 'Prepare R1',
      });
      const storedPrepR1 = (await fixture.owner.query(
        'SELECT packet_payload FROM canonical_cancellation_refund_decision_preparations WHERE action_authorization_id = $1',
        [prepR1.actionReceipt.id]
      )).rows[0];
      assert.equal(storedPrepR1.packet_payload.decisionVersion, 1, 'decisionVersion must normalize to integer 1');

      // Replay preparation with altered packet payload must be rejected
      const alteredPacketR1 = { ...packetR1, reasonText: 'Tampered reason on replay' };
      let replayAlteredError;
      try {
        await admissionService.prepareRefundDecisionAdmission(makerBearer, {
          packet: alteredPacketR1,
          makerStepUpReceiptId: stepUpR1,
          reason: 'Prepare R1 tampered replay',
        });
      } catch (err) {
        replayAlteredError = err;
      }
      if (replayAlteredError) {
        console.log('REPLAY ALTERED ERROR:', replayAlteredError.message);
      }
      assert.ok(replayAlteredError, 'Replaying preparation with altered packet must be rejected');
      assert.ok(
        replayAlteredError.message.includes('IDEMPOTENCY_CONFLICT') ||
        replayAlteredError.message.includes('COMMAND_CONFLICT') ||
        replayAlteredError.message.includes('COMMAND_FINGERPRINT_MISMATCH') ||
        replayAlteredError.message.includes('PREPARATION_INPUT_INVALID'),
        `Must reject altered packet on replay: got ${replayAlteredError?.message}`
      );

      // Caller cannot substitute different amount in direct SQL call to lower permission scope
      let callerAmountError;
      try {
        await admissionService.executeWithStaffSessionWrite(makerBearer, async client => {
          await client.query(`
            SELECT * FROM prepare_cancellation_refund_decision(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
            )
          `, [
            randomUUID(),
            prepR1.actionReceipt.id,
            resR1.reservationId,
            'DEC-R1-SUB',
            1,
            1,
            'INR',
            'TEST_R1_SUB',
            'Substituted amount',
            fpR1,
            JSON.stringify(packetR1),
          ]);
        });
      } catch (err) {
        callerAmountError = err;
      }
      assert.ok(callerAmountError, 'Direct SQL call with substituted amount must be rejected');
      assert.ok(
        callerAmountError.message.includes('COMMAND_CONFLICT') ||
        callerAmountError.message.includes('PREPARATION_INPUT_INVALID') ||
        callerAmountError.message.includes('COMMAND_FINGERPRINT_MISMATCH')
      );

      // Caller cannot substitute different reservationId/subject in direct SQL call
      let callerSubjectError;
      try {
        await admissionService.executeWithStaffSessionWrite(makerBearer, async client => {
          await client.query(`
            SELECT * FROM prepare_cancellation_refund_decision(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
            )
          `, [
            randomUUID(),
            prepR1.actionReceipt.id,
            randomUUID(),
            'DEC-R1-SUB2',
            1,
            50000,
            'INR',
            'TEST_R1_SUB2',
            'Substituted subject',
            fpR1,
            JSON.stringify(packetR1),
          ]);
        });
      } catch (err) {
        callerSubjectError = err;
      }
      assert.ok(callerSubjectError, 'Direct SQL call with substituted subject must be rejected');
      assert.ok(
        callerSubjectError.message.includes('COMMAND_CONFLICT') ||
        callerSubjectError.message.includes('PREPARATION_INPUT_INVALID') ||
        callerSubjectError.message.includes('COMMAND_FINGERPRINT_MISMATCH')
      );

      // R2: Canonical integrity - Discrepant quote, resource, or environment rejected before admission
      for (const field of ['quoteId', 'resource', 'environment']) {
        const resR2 = await createPaidReservation(50000);
        await cancelReservationV1(resR2.reservationId);
        const originalR2 = await admissionService.deriveCanonicalPreview(makerBearer, {
          admissionCommandId: randomUUID(),
          decisionRef: 'CANON-' + field + '-' + randomUUID(),
          reservationId: resR2.reservationId,
          approvedAmountMinor: '50000',
          reasonCode: 'TEST_R2_' + field.toUpperCase(),
          organizationId: organizationId,
        });
        const packetR2 = {
          ...originalR2,
          [field]: field === 'quoteId' ? randomUUID() : field === 'resource' ? { type: 'FINANCIAL_CONTRACT', id: randomUUID() } : 'STAGING',
        };
        let r2Result;
        let r2Error;
        try {
          const reason = 'Prepare exact canonical coupling ' + field;
          const env = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetR2, randomUUID(), reason);
          const hash = admissionService.fingerprint(env);
          const factor = await performStepUp(makerToken, makerPasskey, hash);
          const prep = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
            packet: packetR2,
            makerStepUpReceiptId: factor,
            reason,
          });
          const cf = await performStepUp(checkerToken, checkerPasskey, hash);
          await admissionService.approveRefundDecisionAdmission(checkerBearer, {
            authorizationId: prep.actionReceipt.id,
            expectedCommandHash: hash,
            checkerStepUpReceiptId: cf,
            reason: 'Checker approves ' + field,
          });
          r2Result = await admissionService.admitRefundDecision(makerBearer, {
            packet: packetR2,
            actionAuthorizationId: prep.actionReceipt.id,
            makerStepUpReceiptId: factor,
          });
        } catch (err) {
          r2Error = err;
        }
        assert.ok(!r2Result, `Discrepant ${field} must not be admitted`);
        assert.ok(r2Error, `Discrepant ${field} must be rejected before durable admission`);
        const durableR2 = (await fixture.owner.query(
          'SELECT * FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1',
          [packetR2.admissionCommandId]
        )).rows;
        assert.equal(durableR2.length, 0, `Discrepant ${field} must produce zero durable admissions`);
      }

      // R3: Appointment expiry during reservation lock wait
      const resR3 = await createPaidReservation(50000);
      await cancelReservationV1(resR3.reservationId);
      const cmdR3 = randomUUID();
      const packetR3 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdR3,
        decisionRef: 'DEC-R3-' + randomUUID(),
        reservationId: resR3.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_R3_WAIT_EXPIRY',
        organizationId: organizationId,
      });
      const envR3 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetR3, randomUUID(), 'Prepare R3');
      const fpR3 = admissionService.fingerprint(envR3);
      const stepUpR3 = await performStepUp(makerToken, makerPasskey, fpR3);
      const prepR3 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetR3,
        makerStepUpReceiptId: stepUpR3,
        reason: 'Prepare R3',
      });

      // Revoke existing grants for foreign membership to isolate short appointment
      const existingR3Grants = (await fixture.owner.query(
        'SELECT g.id FROM internal_membership_grants g LEFT JOIN internal_membership_grant_revocations x ON x.grant_id = g.id WHERE g.membership_id = $1 AND x.grant_id IS NULL',
        [foreignMembershipId]
      )).rows;
      for (const g of existingR3Grants) {
        await fixture.owner.query("INSERT INTO internal_membership_grant_revocations(grant_id, revoked_by, reason) VALUES($1, 90, 'Revoke for R3 isolation')", [g.id]);
      }
      // Insert short 3-second grant
      const shortGrant = (await fixture.owner.query(`
        INSERT INTO internal_membership_grants(
          organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          max_amount_minor, grant_hash, granted_by, reason, valid_until
        ) VALUES (
          '${organizationId}', '${foreignMembershipId}', '${approverRoleVersionId}', 'FINANCIAL_CONTRACT', '${resR3.reservationId}', 'LOCAL',
          50000, '${createHash('sha256').update(randomUUID()).digest('hex')}', 90, 'Short 3-second appointment',
          clock_timestamp() + interval '3 seconds'
        ) RETURNING id, valid_until
      `)).rows[0];

      const chkStepUpR3 = await performStepUp(checkerToken, checkerPasskey, prepR3.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {
        authorizationId: prepR3.actionReceipt.id,
        expectedCommandHash: prepR3.actionReceipt.commandHash,
        checkerStepUpReceiptId: chkStepUpR3,
        reason: 'Approved R3 while grant valid',
      });

      // Snapshot before appointment expiry attempt to prove complete restoration
      const snapR3 = async () => ({
        action: (await fixture.owner.query('SELECT id, status, version, consumed_transaction_id FROM internal_action_authorizations WHERE id = $1', [prepR3.actionReceipt.id])).rows,
        factors: (await fixture.owner.query('SELECT id, status, consumed_at FROM internal_step_up_challenges WHERE id = ANY($1::uuid[]) ORDER BY id', [[stepUpR3, chkStepUpR3]])).rows,
        audit: (await fixture.owner.query("SELECT sequence, event_type, entity_id, request_hash FROM internal_iam_events WHERE entity_id = $1 AND event_type = 'AUTHORIZED_COMMAND' ORDER BY sequence", [resR3.reservationId])).rows,
      });
      const beforeR3 = await snapR3();

      // Dedicated 1-connection pool for R3 worker
      const r3Pool = new pg.Pool({ ...fixture.owner.options, user: 'w1_offer_staff', max: 1 });
      const r3Service = new CanonicalRefundDecisionAdmissionService(r3Pool, 'LOCAL');
      const r3CallerPid = (await r3Pool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;

      // Hold reservation lock with blocker
      const r3Blocker = await fixture.owner.connect();
      let r3BlockerPid;
      let r3BlockerReleased = false;
      let r3WorkerPromise;

      let r3WaitError = null;
      const r3WaitCleanupErrors = [];

      try {
        await r3Blocker.query('BEGIN');
        r3BlockerPid = (await r3Blocker.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
        await r3Blocker.query('SELECT id FROM canonical_reservations WHERE id = $1 FOR UPDATE', [resR3.reservationId]);

        r3WorkerPromise = (async () => {
          try {
            return { ok: true, value: await r3Service.admitRefundDecision(makerBearer, {
              packet: packetR3,
              actionAuthorizationId: prepR3.actionReceipt.id,
              makerStepUpReceiptId: stepUpR3,
            }) };
          } catch (err) {
            return { ok: false, error: err };
          }
        })();

        // Witness in pg_stat_activity that r3CallerPid is blocked by r3BlockerPid on reservation lock
        let observedR3Blocker = false;
        const r3WitnessDeadline = Date.now() + 4000;
        while (Date.now() < r3WitnessDeadline) {
          const row = (await fixture.owner.query(`
            SELECT pid, pg_blocking_pids(pid) as blockers, wait_event_type, wait_event
            FROM pg_stat_activity
            WHERE pid = $1
          `, [r3CallerPid])).rows[0];
          if (row && Array.isArray(row.blockers) && row.blockers.includes(r3BlockerPid)) {
            observedR3Blocker = true;
            break;
          }
          await new Promise(r => setTimeout(r, 40));
        }
        assert.ok(observedR3Blocker, 'Caller PID must be witnessed blocked by blocker PID on reservation lock');

        // Wait until appointment expires
        let r3Expired = false;
        const r3Deadline = Date.now() + 6000;
        while (Date.now() < r3Deadline) {
          r3Expired = (await fixture.owner.query('SELECT clock_timestamp() > valid_until as expired FROM internal_membership_grants WHERE id = $1', [shortGrant.id])).rows[0].expired;
          if (r3Expired) break;
          await new Promise(r => setTimeout(r, 40));
        }
        assert.ok(r3Expired, 'Short grant must expire during reservation lock wait');

        // Rollback blocker so waiter can proceed to post-wait appointment check
        await r3Blocker.query('ROLLBACK');
        r3BlockerReleased = true;

        const r3Result = await r3WorkerPromise;
        assert.equal(r3Result.ok, false, 'Admission must fail due to expired appointment');
        assert.ok(
          r3Result.error.message.includes('CHECKER_APPOINTMENT_EXPIRED'),
          'Must fail with CHECKER_APPOINTMENT_EXPIRED'
        );

        // Verify zero admissions persisted
        const r3Admissions = (await fixture.owner.query(
          'SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1',
          [cmdR3]
        )).rows[0].c;
        assert.equal(r3Admissions, 0, 'Zero admissions after post-wait appointment expiry');

        // Verify scoped action/factor/audit restoration on rejection
        const afterR3 = await snapR3();
        assert.deepEqual(afterR3, beforeR3, 'Rejected post-wait admission must restore prior action/factor/audit state');
      } catch (err) {
        r3WaitError = err;
      } finally {
        if (!r3BlockerReleased) {
          try {
            await r3Blocker.query('ROLLBACK');
          } catch (err) {
            r3WaitCleanupErrors.push(err);
          }
        }
        try {
          r3Blocker.release();
        } catch (err) {
          r3WaitCleanupErrors.push(err);
        }
        if (r3WorkerPromise) {
          try {
            await r3WorkerPromise;
          } catch (err) {
            r3WaitCleanupErrors.push(err);
          }
        }
        try {
          await r3Pool.end();
        } catch (err) {
          r3WaitCleanupErrors.push(err);
        }

        const finalR3WaitErr = combineErrors(r3WaitError, r3WaitCleanupErrors, 'R3_WAIT_FAILED');
        if (finalR3WaitErr) throw finalR3WaitErr;
      }

      // =======================================================================
      // SCENARIO R3-SERIALIZATION: CONCURRENT ROLE VERSION UPDATE SAFELY SERIALIZES
      // BEHIND PROTECTED ADMISSION SELECTION ACROSS RESERVATION WAIT
      // =======================================================================
      const resR3Ser = await createPaidReservation(50000);
      await cancelReservationV1(resR3Ser.reservationId);
      const cmdR3Ser = randomUUID();
      const packetR3Ser = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdR3Ser,
        decisionRef: 'DEC-R3-SER-' + randomUUID(),
        reservationId: resR3Ser.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_R3_SERIALIZATION',
        organizationId: organizationId,
      });
      const envR3Ser = admissionService.buildRequestEnvelope(
        fixture.principal(90, 'STAFF'),
        packetR3Ser,
        randomUUID(),
        'Prepare R3 serialization witness'
      );
      const fpR3Ser = admissionService.fingerprint(envR3Ser);
      const stepUpR3Ser = await performStepUp(makerToken, makerPasskey, fpR3Ser);
      const prepR3Ser = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetR3Ser,
        makerStepUpReceiptId: stepUpR3Ser,
        reason: 'Prepare R3 serialization witness',
      });

      // Ensure foreign membership has a valid appointment grant for the current approver role version
      const existingR3SerGrants = (await fixture.owner.query(
        'SELECT g.id FROM internal_membership_grants g LEFT JOIN internal_membership_grant_revocations x ON x.grant_id = g.id WHERE g.membership_id = $1 AND x.grant_id IS NULL',
        [foreignMembershipId]
      )).rows;
      for (const g of existingR3SerGrants) {
        await fixture.owner.query("INSERT INTO internal_membership_grant_revocations(grant_id, revoked_by, reason) VALUES($1, 90, 'Revoke for R3Ser isolation')", [g.id]);
      }

      const serGrant = (await fixture.owner.query(`
        INSERT INTO internal_membership_grants(
          organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          max_amount_minor, grant_hash, granted_by, reason, valid_until
        ) VALUES (
          '${organizationId}', '${foreignMembershipId}', '${approverRoleVersionId}', 'FINANCIAL_CONTRACT', '${resR3Ser.reservationId}', 'LOCAL',
          50000, '${createHash('sha256').update(randomUUID()).digest('hex')}', 90, 'Valid 1-hour appointment for current role version',
          clock_timestamp() + interval '1 hour'
        ) RETURNING id, valid_until
      `)).rows[0];

      const chkStepUpR3Ser = await performStepUp(checkerToken, checkerPasskey, prepR3Ser.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {
        authorizationId: prepR3Ser.actionReceipt.id,
        expectedCommandHash: prepR3Ser.actionReceipt.commandHash,
        checkerStepUpReceiptId: chkStepUpR3Ser,
        reason: 'Approved R3Ser while grant and role version valid',
      });

      // Insert next role version into internal_role_versions
      const nextRoleVersion = (await fixture.owner.query(`
        INSERT INTO internal_role_versions(role_id, organization_id, version, config_hash, reason, created_by)
        SELECT role_id, organization_id, version + 1, $2, 'Next approver role version', 90
        FROM internal_role_versions WHERE id = $1 RETURNING id, role_id
      `, [approverRoleVersionId, createHash('sha256').update(randomUUID()).digest('hex')])).rows[0];
      await fixture.owner.query(
        'INSERT INTO internal_role_permissions(role_version_id, permission_code) SELECT $2, permission_code FROM internal_role_permissions WHERE role_version_id = $1',
        [approverRoleVersionId, nextRoleVersion.id]
      );

      // Dedicated 1-connection pool for admission caller
      const serAdmissionPool = new pg.Pool({ ...fixture.owner.options, user: 'w1_offer_staff', max: 1 });
      const serAdmissionService = new CanonicalRefundDecisionAdmissionService(serAdmissionPool, 'LOCAL');
      const serCallerPid = (await serAdmissionPool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;

      // Connect blocker holding reservation lock
      const serBlocker = await fixture.owner.connect();
      let serBlockerPid;
      let serBlockerReleased = false;
      const serUpdaterClient = await fixture.owner.connect();
      let serUpdaterPid;
      let serAdmissionPromise;
      let serUpdaterPromise;
      let serError = null;
      const serCleanupErrors = [];

      try {
        await serBlocker.query('BEGIN');
        await serBlocker.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='8s'");
        serBlockerPid = (await serBlocker.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
        await serBlocker.query('SELECT id FROM canonical_reservations WHERE id = $1 FOR UPDATE', [resR3Ser.reservationId]);

        await serUpdaterClient.query("SET statement_timeout='10s'; SET lock_timeout='8s'");
        serUpdaterPid = (await serUpdaterClient.query('SELECT pg_backend_pid() as pid')).rows[0].pid;

        // Start admission caller
        serAdmissionPromise = (async () => {
          try {
            return { ok: true, value: await serAdmissionService.admitRefundDecision(makerBearer, {
              packet: packetR3Ser,
              actionAuthorizationId: prepR3Ser.actionReceipt.id,
              makerStepUpReceiptId: stepUpR3Ser,
            }) };
          } catch (err) {
            return { ok: false, error: err };
          }
        })();

        // Witness admission caller blocked on reservation lock behind blocker
        let observedSerAdmissionBlocked = false;
        const serWitnessDeadline = Date.now() + 4000;
        while (Date.now() < serWitnessDeadline) {
          const row = (await fixture.owner.query(`
            SELECT pid, pg_blocking_pids(pid) as blockers, wait_event_type, wait_event
            FROM pg_stat_activity
            WHERE pid = $1
          `, [serCallerPid])).rows[0];
          if (row && Array.isArray(row.blockers) && row.blockers.includes(serBlockerPid)) {
            observedSerAdmissionBlocked = true;
            break;
          }
          await new Promise(r => setTimeout(r, 40));
        }
        assert.ok(observedSerAdmissionBlocked, 'Admission caller must be witnessed blocked on reservation lock by blocker');

        // Now start the catalog updater asynchronously: attempts UPDATE internal_role_current_versions
        serUpdaterPromise = (async () => {
          try {
            return { ok: true, value: await serUpdaterClient.query(
              'UPDATE internal_role_current_versions SET version_id = $2, updated_by = 90 WHERE role_id = $1',
              [nextRoleVersion.role_id, nextRoleVersion.id]
            ) };
          } catch (err) {
            return { ok: false, error: err };
          }
        })();

        // Witness that the catalog updater is blocked behind admission caller on internal_role_current_versions SHARE lock
        let observedUpdaterBlocked = false;
        const updaterDeadline = Date.now() + 4000;
        while (Date.now() < updaterDeadline) {
          const row = (await fixture.owner.query(`
            SELECT pid, pg_blocking_pids(pid) as blockers, wait_event_type, wait_event
            FROM pg_stat_activity
            WHERE pid = $1
          `, [serUpdaterPid])).rows[0];
          if (row && Array.isArray(row.blockers) && row.blockers.includes(serCallerPid)) {
            observedUpdaterBlocked = true;
            break;
          }
          await new Promise(r => setTimeout(r, 40));
        }
        assert.ok(observedUpdaterBlocked, 'Catalog updater must be observed blocked behind admission caller PID on table SHARE lock');

        // Release reservation blocker
        await serBlocker.query('ROLLBACK');
        serBlockerReleased = true;

        // Admission caller completes first
        const admissionResult = await serAdmissionPromise;
        assert.equal(admissionResult.ok, true, 'Admission caller must complete successfully');
        assert.ok(admissionResult.value.admissionId);
        assert.equal(admissionResult.value.replayed, false);

        // Catalog updater unblocks and completes after admission commits
        const updaterResult = await serUpdaterPromise;
        assert.equal(updaterResult.ok, true, 'Catalog updater must unblock and succeed after admission finishes');

        // Verify durable admission record with the selected role version
        const durableAdmissions = (await fixture.owner.query(
          'SELECT a.command_id, a.checker_appointment_grant_id, g.role_version_id FROM canonical_cancellation_refund_decision_admissions a JOIN internal_membership_grants g ON g.id = a.checker_appointment_grant_id WHERE a.command_id = $1',
          [cmdR3Ser]
        )).rows;
        assert.equal(durableAdmissions.length, 1);
        assert.equal(durableAdmissions[0].role_version_id, approverRoleVersionId);

        // Verify current role version pointer was updated
        const updatedPointer = (await fixture.owner.query(
          'SELECT version_id FROM internal_role_current_versions WHERE role_id = $1',
          [nextRoleVersion.role_id]
        )).rows[0].version_id;
        assert.equal(updatedPointer, nextRoleVersion.id);

        // Verify negative control: old grant no longer qualifies once role version is superseded
        const qualifyingGrant = (await fixture.owner.query(`
          SELECT g.id
          FROM internal_membership_grants g
          JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
          JOIN internal_role_definitions r ON r.id = v.role_id AND r.organization_id = g.organization_id
          JOIN internal_role_current_versions rcv ON rcv.role_id = r.id AND rcv.version_id = v.id
          JOIN internal_role_permissions rp ON rp.role_version_id = v.id AND rp.permission_code = 'accommodation.refund_decision.admit'
          WHERE g.id = $1
        `, [serGrant.id])).rows;
        assert.equal(qualifyingGrant.length, 0, 'Old grant must no longer qualify once role version is superseded');
      } catch (err) {
        serError = err;
      } finally {
        if (!serBlockerReleased) {
          try {
            await serBlocker.query('ROLLBACK');
          } catch (err) {
            serCleanupErrors.push(err);
          }
        }
        try {
          serBlocker.release();
        } catch (err) {
          serCleanupErrors.push(err);
        }
        if (serAdmissionPromise) {
          try {
            await serAdmissionPromise;
          } catch (err) {
            serCleanupErrors.push(err);
          }
        }
        if (serUpdaterPromise) {
          try {
            await serUpdaterPromise;
          } catch (err) {
            serCleanupErrors.push(err);
          }
        }
        try {
          serUpdaterClient.release();
        } catch (err) {
          serCleanupErrors.push(err);
        }
        try {
          await serAdmissionPool.end();
        } catch (err) {
          serCleanupErrors.push(err);
        }

        const finalSerErr = combineErrors(serError, serCleanupErrors, 'R3_SERIALIZATION_FAILED');
        if (finalSerErr) throw finalSerErr;
      }

      // =======================================================================
      // SCENARIO E1-WITNESS: OBSERVER FAILURE WITH DELAYED SQL & INJECTED CLEANUP ERROR
      // Demonstrates:
      // 1. Observer fails while entrant database work is delayed
      // 2. Synchronization gate is released and delayed database work settles cleanly
      // 3. A terminal pool-close error is injected
      // 4. Both original observer error and cleanup error are observable in an AggregateError
      // 5. Zero open transactions or orphan database backends survive on the server
      // =======================================================================
      const resE1 = await createPaidReservation(50000);
      await cancelReservationV1(resE1.reservationId);

      const cmdE1 = randomUUID();
      const packetE1 = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdE1,
        decisionRef: 'DEC-E1-WITNESS-' + randomUUID(),
        reservationId: resE1.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_E1_WITNESS',
        organizationId: organizationId,
      });
      const envE1 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetE1, randomUUID(), 'Prepare E1 witness');
      const fpE1 = admissionService.fingerprint(envE1);
      const stepUpE1 = await performStepUp(makerToken, makerPasskey, fpE1);
      const prepE1 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetE1,
        makerStepUpReceiptId: stepUpE1,
        reason: 'Prepare E1 witness',
      });

      const currentRoleVersionId = (await fixture.owner.query(
        'SELECT rcv.version_id FROM internal_role_current_versions rcv JOIN internal_role_versions rv ON rv.role_id = rcv.role_id WHERE rv.id = $1',
        [approverRoleVersionId]
      )).rows[0].version_id;

      await fixture.owner.query(`
        INSERT INTO internal_membership_grants(
          organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          max_amount_minor, grant_hash, granted_by, reason, valid_until
        ) VALUES (
          $1, $2, $3, 'FINANCIAL_CONTRACT', $4, 'LOCAL',
          50000, $5, 90, 'Valid appointment for E1 witness',
          clock_timestamp() + interval '1 hour'
        )
      `, [
        organizationId,
        foreignMembershipId,
        currentRoleVersionId,
        resE1.reservationId,
        createHash('sha256').update(randomUUID()).digest('hex'),
      ]);

      const chkStepUpE1 = await performStepUp(checkerToken, checkerPasskey, prepE1.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {
        authorizationId: prepE1.actionReceipt.id,
        expectedCommandHash: prepE1.actionReceipt.commandHash,
        checkerStepUpReceiptId: chkStepUpE1,
        reason: 'Approved E1 witness by checker',
      });

      const e1WitnessPool = new pg.Pool({
        ...fixture.owner.options,
        user: 'w1_offer_staff',
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000,
        query_timeout: 10000,
      });
      const e1WitnessService = new CanonicalRefundDecisionAdmissionService(e1WitnessPool, 'LOCAL');
      const e1WitnessPid = (await e1WitnessPool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
      assert.ok(e1WitnessPid, 'E1 witness PID must be identified');

      let releaseE1Gate;
      let e1GateReleased = false;
      const e1GatePromise = new Promise(resolve => {
        releaseE1Gate = () => {
          if (!e1GateReleased) {
            e1GateReleased = true;
            resolve();
          }
        };
      });

      let e1AtHook;
      let e1AtHookReject;
      const e1HookReachedPromise = new Promise((resolve, reject) => {
        e1AtHook = resolve;
        e1AtHookReject = reject;
      });

      let e1DelayedSqlStarted = false;
      let e1DelayedSqlSettled = false;
      let e1EntrantPromise;

      let e1CaughtError = null;
      let e1OriginalError = null;
      const e1CleanupErrors = [];

      try {
        try {
          e1EntrantPromise = (async () => {
            try {
              return await e1WitnessService.admitRefundDecision(makerBearer, {
                packet: packetE1,
                actionAuthorizationId: prepE1.actionReceipt.id,
                makerStepUpReceiptId: stepUpE1,
                postAdmissionHook: async (client, result) => {
                  e1AtHook();
                  await e1GatePromise;
                  e1DelayedSqlStarted = true;
                  // Real delayed SQL work in transaction
                  await client.query('SELECT pg_sleep(0.5) /* E1_WITNESS_DELAY */');
                  e1DelayedSqlSettled = true;
                },
              });
            } catch (err) {
              e1AtHookReject(err);
              throw err;
            }
          })();

          // Wait boundedly until entrant reaches hook with failure propagation
          await Promise.race([
            e1HookReachedPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('E1_HOOK_TIMEOUT')), 5000)),
          ]);

          // Observer performs verification on pg_stat_activity
          const entrantActivity = (await fixture.owner.query(
            `SELECT pid, state, xact_start IS NOT NULL as in_transaction FROM pg_stat_activity WHERE pid = $1`,
            [e1WitnessPid]
          )).rows[0];
          assert.ok(entrantActivity, 'Entrant activity must be visible to observer');

          // Observer encounters a failure while database work is delayed behind the gate
          throw new Error('E1_OBSERVER_FAILURE_WHILE_WORK_DELAYED');
        } catch (err) {
          e1OriginalError = err;
        } finally {
          // 1. Release gate so delayed database work can proceed and settle
          releaseE1Gate();

          // 2. Join entrant promise cleanly without timeout abandonment
          if (e1EntrantPromise) {
            try {
              await e1EntrantPromise;
            } catch (err) {
              e1CleanupErrors.push(err);
            }
          }

          // 3. Inject terminal pool-close error
          try {
            await e1WitnessPool.end();
            // Simulate terminal pool cleanup error
            throw new Error('E1_TERMINAL_POOL_CLOSE_FAILURE');
          } catch (err) {
            e1CleanupErrors.push(err);
          }

          const combined = combineErrors(e1OriginalError, e1CleanupErrors, 'E1_WITNESS_OPERATION_AND_CLEANUP_FAILED');
          if (combined) throw combined;
        }
      } catch (err) {
        e1CaughtError = err;
      }

      // Assertions on the E1 witness execution:
      assert.ok(e1CaughtError, 'E1 witness must throw aggregated error');
      assert.ok(e1CaughtError instanceof AggregateError, 'E1 witness error must be an AggregateError preserving both failures');

      const unpackErrors = (e) => (e instanceof AggregateError ? [e.message, ...e.errors.flatMap(unpackErrors)] : [e?.message ?? String(e)]);
      const observedErrorMessages = unpackErrors(e1CaughtError);

      assert.ok(
        observedErrorMessages.includes('E1_OBSERVER_FAILURE_WHILE_WORK_DELAYED'),
        'Original observer failure must remain observable'
      );
      assert.ok(
        observedErrorMessages.includes('E1_TERMINAL_POOL_CLOSE_FAILURE'),
        'Terminal cleanup failure must remain observable'
      );
      assert.equal(e1DelayedSqlStarted, true, 'Delayed SQL must have executed');
      assert.equal(e1DelayedSqlSettled, true, 'Delayed SQL must have settled cleanly before pool termination');

      // Assert no open transaction or database backend survives on the server for the entrant
      const survivingBackends = (await fixture.owner.query(
        `SELECT pid, state, query, xact_start IS NOT NULL as in_transaction FROM pg_stat_activity WHERE pid = $1`,
        [e1WitnessPid]
      )).rows;
      assert.equal(survivingBackends.length, 0, 'Zero database backends or transactions may survive on the server');

      // =======================================================================
      // SCENARIO E1-WITNESS-ENTRANT-SQL-ERROR: OBSERVER FAILURE + POSTGRESQL 22012 ENTRANT FAILURE PRESERVES BOTH
      // Demonstrates:
      // When observer fails and entrant experiences an unexpected PostgreSQL 22012 (division by zero)
      // failure during joined work, BOTH the primary observer error AND the entrant SQL failure
      // are preserved in an AggregateError.
      // =======================================================================
      const resE1Sql = await createPaidReservation(50000);
      await cancelReservationV1(resE1Sql.reservationId);

      const cmdE1Sql = randomUUID();
      const packetE1Sql = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdE1Sql,
        decisionRef: 'DEC-E1-SQL-' + randomUUID(),
        reservationId: resE1Sql.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_E1_SQL_ERROR',
        organizationId: organizationId,
      });

      const envE1Sql = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetE1Sql, randomUUID(), 'Prepare E1 SQL witness');
      const fpE1Sql = admissionService.fingerprint(envE1Sql);
      const stepUpE1Sql = await performStepUp(makerToken, makerPasskey, fpE1Sql);
      const prepE1Sql = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetE1Sql,
        makerStepUpReceiptId: stepUpE1Sql,
        reason: 'Prepare E1 SQL witness',
      });

      const roleVersionIdForSql = (await fixture.owner.query(
        'SELECT rcv.version_id FROM internal_role_current_versions rcv JOIN internal_role_versions rv ON rv.role_id = rcv.role_id WHERE rv.id = $1',
        [approverRoleVersionId]
      )).rows[0].version_id;

      await fixture.owner.query(`
        INSERT INTO internal_membership_grants(
          organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
          max_amount_minor, grant_hash, granted_by, reason, valid_until
        ) VALUES (
          $1, $2, $3, 'FINANCIAL_CONTRACT', $4, 'LOCAL',
          50000, $5, 90, 'Valid appointment for E1 SQL witness',
          clock_timestamp() + interval '1 hour'
        )
      `, [
        organizationId,
        foreignMembershipId,
        roleVersionIdForSql,
        resE1Sql.reservationId,
        createHash('sha256').update(randomUUID()).digest('hex'),
      ]);

      const chkStepUpE1Sql = await performStepUp(checkerToken, checkerPasskey, prepE1Sql.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {
        authorizationId: prepE1Sql.actionReceipt.id,
        expectedCommandHash: prepE1Sql.actionReceipt.commandHash,
        checkerStepUpReceiptId: chkStepUpE1Sql,
        reason: 'Approved E1 SQL witness by checker',
      });

      const e1SqlPool = new pg.Pool({
        ...fixture.owner.options,
        user: 'w1_offer_staff',
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000,
        query_timeout: 10000,
      });
      const e1SqlService = new CanonicalRefundDecisionAdmissionService(e1SqlPool, 'LOCAL');
      const e1SqlPid = (await e1SqlPool.query('SELECT pg_backend_pid() as pid')).rows[0].pid;
      assert.ok(e1SqlPid, 'E1 SQL witness PID must be identified');

      let releaseE1SqlGate;
      let e1SqlGateReleased = false;
      const e1SqlGatePromise = new Promise(resolve => {
        releaseE1SqlGate = () => {
          if (!e1SqlGateReleased) {
            e1SqlGateReleased = true;
            resolve();
          }
        };
      });

      let e1SqlAtHook;
      let e1SqlAtHookReject;
      const e1SqlHookReachedPromise = new Promise((resolve, reject) => {
        e1SqlAtHook = resolve;
        e1SqlAtHookReject = reject;
      });

      let e1SqlEntrantPromise;
      let e1SqlCaughtError = null;
      let e1SqlOriginalError = null;
      const e1SqlCleanupErrors = [];
      let e1SqlErrorReached = false;

      try {
        try {
          e1SqlEntrantPromise = (async () => {
            try {
              return await e1SqlService.admitRefundDecision(makerBearer, {
                packet: packetE1Sql,
                actionAuthorizationId: prepE1Sql.actionReceipt.id,
                makerStepUpReceiptId: stepUpE1Sql,
                postAdmissionHook: async (client, _result) => {
                  e1SqlAtHook();
                  await e1SqlGatePromise;
                  e1SqlErrorReached = true;
                  // Deliberate PostgreSQL 22012 division by zero error during entrant transaction
                  await client.query('SELECT 1/0 /* E1_WITNESS_DIVISION_BY_ZERO */');
                },
              });
            } catch (err) {
              e1SqlAtHookReject(err);
              throw err;
            }
          })();

          // Wait boundedly until entrant reaches hook with failure propagation
          await Promise.race([
            e1SqlHookReachedPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('E1_SQL_HOOK_TIMEOUT')), 5000)),
          ]);

          // Observer performs verification on pg_stat_activity
          const entrantActivity = (await fixture.owner.query(
            `SELECT pid, state, xact_start IS NOT NULL as in_transaction FROM pg_stat_activity WHERE pid = $1`,
            [e1SqlPid]
          )).rows[0];
          assert.ok(entrantActivity, 'Entrant activity must be visible to observer');

          // Observer encounters a failure while database work is pending behind gate
          throw new Error('E1_OBSERVER_FAILURE_WHILE_SQL_PENDING');
        } catch (err) {
          e1SqlOriginalError = err;
        } finally {
          // Release gate so entrant executes the SQL query (which triggers PostgreSQL 22012)
          releaseE1SqlGate();

          // Join entrant promise cleanly and preserve unexpected entrant error
          if (e1SqlEntrantPromise) {
            try {
              await e1SqlEntrantPromise;
            } catch (err) {
              e1SqlCleanupErrors.push(err);
            }
          }

          try {
            await e1SqlPool.end();
          } catch (err) {
            e1SqlCleanupErrors.push(err);
          }

          const combined = combineErrors(e1SqlOriginalError, e1SqlCleanupErrors, 'E1_SQL_OPERATION_AND_CLEANUP_FAILED');
          if (combined) throw combined;
        }
      } catch (err) {
        e1SqlCaughtError = err;
      }

      assert.ok(e1SqlCaughtError, 'E1 SQL witness must throw aggregated error');
      assert.ok(e1SqlCaughtError instanceof AggregateError, 'E1 SQL witness error must be an AggregateError preserving both failures');
      const observedSqlErrorMessages = unpackErrors(e1SqlCaughtError);
      assert.ok(
        observedSqlErrorMessages.includes('E1_OBSERVER_FAILURE_WHILE_SQL_PENDING'),
        'Original observer failure must remain observable'
      );
      assert.ok(
        observedSqlErrorMessages.some(m => m.includes('division by zero')),
        'PostgreSQL 22012 entrant division by zero error must be preserved alongside observer error'
      );
      assert.equal(e1SqlErrorReached, true, 'Entrant SQL error hook must have been reached');

      const survivingSqlBackends = (await fixture.owner.query(
        `SELECT pid, state FROM pg_stat_activity WHERE pid = $1`,
        [e1SqlPid]
      )).rows;
      assert.equal(survivingSqlBackends.length, 0, 'Zero database backends may survive on the server');

      // =======================================================================
      // SCENARIO E1-WITNESS-SUITE-CLEANUP: ORIGINAL TEST ERROR + OUTER SUITE CLEANUP FAILURE PRESERVES BOTH
      // Demonstrates:
      // When primary test execution encounters a failure AND subsequent suite cleanup also encounters
      // an error (e.g., closing a connection pool fails), combineErrors preserves BOTH the primary test
      // failure and the suite cleanup error in an AggregateError, instead of replacing or masking the test error.
      // =======================================================================
      {
        let simulatedTestError = null;
        let caughtCombinedSuiteError = null;
        try {
          try {
            throw new Error('E1_PRIMARY_TEST_CASE_FAILURE');
          } catch (err) {
            simulatedTestError = err;
          } finally {
            const simulatedCleanupErrors = [];
            try {
              throw new Error('E1_SUITE_CLEANUP_POOL_TERMINATION_FAILURE');
            } catch (err) {
              simulatedCleanupErrors.push(err);
            }
            const combined = combineErrors(simulatedTestError, simulatedCleanupErrors, 'SUITE_AND_CLEANUP_FAILED');
            if (combined) throw combined;
          }
        } catch (err) {
          caughtCombinedSuiteError = err;
        }

        assert.ok(caughtCombinedSuiteError, 'Combined suite error must be thrown');
        assert.ok(caughtCombinedSuiteError instanceof AggregateError, 'Combined error must be an AggregateError');
        const suiteMsgs = unpackErrors(caughtCombinedSuiteError);
        assert.ok(
          suiteMsgs.includes('E1_PRIMARY_TEST_CASE_FAILURE'),
          'Primary test case failure must be preserved'
        );
        assert.ok(
          suiteMsgs.includes('E1_SUITE_CLEANUP_POOL_TERMINATION_FAILURE'),
          'Suite cleanup failure must be preserved alongside primary test error'
        );
      }

      console.log('ALL W4-D STAGE B ACCEPTANCE SCENARIOS (A01 - A11) AND NEGATIVE CONTROLS PASSED CLEANLY');
    } catch (err) {
      suiteError = err;
    } finally {
      const suiteCleanupErrors = [];
      const poolsToClose = [
        stays, reservationWorker, paymentWorker, compositionWorker,
        lifecycleIssuer, lifecycleWorker, cancellationIssuer,
        cancellationExecutor, refundIssuer, factorPool,
      ];
      for (const p of poolsToClose) {
        if (p) {
          try {
            await p.end();
          } catch (err) {
            suiteCleanupErrors.push(err);
          }
        }
      }
      if (fixture?.staffPool && fixture.staffPool !== originalStaff) {
        try {
          await fixture.staffPool.end();
        } catch (err) {
          suiteCleanupErrors.push(err);
        }
      }
      if (fixture?.owner && fixture.owner !== originalOwner) {
        try {
          await fixture.owner.end();
        } catch (err) {
          suiteCleanupErrors.push(err);
        }
      }
      if (fixture) {
        fixture.owner = originalOwner;
        fixture.staffPool = originalStaff;
        try {
          await fixture.close();
        } catch (err) {
          suiteCleanupErrors.push(err);
        }
      }
      const finalSuiteErr = combineErrors(suiteError, suiteCleanupErrors, 'SUITE_AND_CLEANUP_FAILED');
      if (finalSuiteErr) {
        throw finalSuiteErr;
      }
    }
  });
});
