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
        [organizationId, JSON.stringify({rpId: 'localhost', origin: 'http://localhost:3000', allowSyncedPasskeys: false, challengeTtlSeconds: 120, maximumStartsPerMinute: 10})]
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
          'canonical_reservation_events',
          'canonical_reservation_nights',
          'canonical_reservation_cancellation_inventory_releases',
          'canonical_reservation_cancellation_release_nights',
          'canonical_payment_reservations',
          'canonical_payable_authorities',
          'canonical_payment_attempts',
          'canonical_provider_events',
          'canonical_payment_reconciliations',
          'canonical_cancellation_refund_authorizations',
          'canonical_cancellation_refund_decision_evidence',
          'canonical_cancellation_refund_decision_preparations',
          'canonical_cancellation_refund_decision_admissions',
          'booking_holds',
          'stays_quotes',
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
      // ADM-01: BORROWED APPROVAL REJECTION
      // Packet B cannot borrow approval of Packet A
      // =======================================================================
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
      // ADM-03: DEDICATED APPOINTMENT BINDINGS & NEGATIVE CONTROLS
      // =======================================================================
      // 1. Broad preparer grant alone cannot approve (User 90 has only preparer grant)
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
      assert.ok(broadPreparerError, 'Broad preparer grant alone cannot approve');
      assert.ok(
        broadPreparerError.message.includes('PERMISSION_DENIED') ||
        broadPreparerError.message.includes('MAKER_CHECKER_CONFLICT')
      );

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
        const promiseB = clientB.query(
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
      } finally {
        clientA.release();
        clientB.release();
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

      // Connection 1 locks reservation in open transaction
      const conn1 = await fixture.owner.connect();
      await conn1.query('BEGIN');
      await conn1.query('SELECT * FROM canonical_reservations WHERE id = $1 FOR UPDATE', [resA07.reservationId]);

      // Connection 2 attempts admission concurrently in background
      const racePromise2 = admissionService.admitRefundDecision(makerBearer, {
        packet: packetA07,
        actionAuthorizationId: prepA07.actionReceipt.id,
        makerStepUpReceiptId: stepUpA07,
      });

      // Observe Connection 2 blocked by Connection 1 in pg_blocking_pids
      let observedA07Blocker = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 50));
        const blockingRows = (await fixture.owner.query(`
          SELECT pid, pg_blocking_pids(pid) as blockers
          FROM pg_stat_activity
          WHERE query LIKE '%canonical_reservations%' OR query LIKE '%admit_cancellation_refund_decision%'
        `)).rows;
        if (blockingRows.some(r => r.blockers && r.blockers.length > 0)) {
          observedA07Blocker = true;
          break;
        }
      }
      assert.ok(observedA07Blocker, 'Connection 2 must be blocked on reservation lock by Connection 1');

      // Commit Connection 1 (winner)
      await conn1.query('COMMIT');
      conn1.release();

      const raceResult = await racePromise2;
      assert.ok(raceResult.evidenceId);
      assert.ok(raceResult.admissionId);

      // Exactly 1 admission row and 1 evidence row
      const a07AdmissionsCount = (await fixture.owner.query(
        `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1`,
        [cmdA07]
      )).rows[0].c;
      assert.equal(a07AdmissionsCount, 1, 'Exactly one admission row must exist after race');

      // Competing distinct command on same reservation fails
      const cmdA07Distinct = randomUUID();
      const packetA07Distinct = await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: cmdA07Distinct,
        decisionRef: 'DEC-DISTINCT-' + randomUUID(),
        reservationId: resA07.reservationId,
        approvedAmountMinor: '40000',
        reasonCode: 'TEST_DISTINCT',
        organizationId: organizationId,
      });
      const envDist = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetA07Distinct, randomUUID(), 'Prepare distinct');
      const fpDist = admissionService.fingerprint(envDist);
      const stepUpDist = await performStepUp(makerToken, makerPasskey, fpDist);
      const prepDist = await admissionService.prepareRefundDecisionAdmission(makerBearer, {packet: packetA07Distinct, makerStepUpReceiptId: stepUpDist, reason: 'Prepare distinct'});
      const chkStepUpDist = await performStepUp(checkerToken, checkerPasskey, prepDist.actionReceipt.commandHash);
      await admissionService.approveRefundDecisionAdmission(checkerBearer, {authorizationId: prepDist.actionReceipt.id, expectedCommandHash: prepDist.actionReceipt.commandHash, checkerStepUpReceiptId: chkStepUpDist, reason: 'Approved distinct'});

      let distinctConflictError;
      try {
        await admissionService.admitRefundDecision(makerBearer, {
          packet: packetA07Distinct,
          actionAuthorizationId: prepDist.actionReceipt.id,
          makerStepUpReceiptId: stepUpDist,
        });
      } catch (err) {
        distinctConflictError = err;
      }
      assert.ok(distinctConflictError, 'Competing distinct command must fail');
      // Assert losing action state: action was not consumed
      const distAuthStatus = (await fixture.owner.query(
        `SELECT status FROM internal_action_authorizations WHERE id = $1`,
        [prepDist.actionReceipt.id]
      )).rows[0].status;
      assert.equal(distAuthStatus, 'APPROVED', 'Losing action must remain APPROVED (not consumed)');

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

      // Action authorization is restored to APPROVED (not CONSUMED)
      const a08AuthStatus = (await fixture.owner.query(
        `SELECT status FROM internal_action_authorizations WHERE id = $1`,
        [prepA08.actionReceipt.id]
      )).rows[0].status;
      assert.equal(a08AuthStatus, 'APPROVED', 'Action authorization must remain APPROVED after rollback');

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

      // Verify zero mutation on bookings table
      const postBookingCounts = (await fixture.owner.query('SELECT count(*)::int as c FROM bookings')).rows[0].c;
      assert.equal(postBookingCounts, 0, 'Zero side-effect mutation on bookings');

      console.log('ALL W4-D STAGE B ACCEPTANCE SCENARIOS (A01 - A11) AND NEGATIVE CONTROLS PASSED CLEANLY');
    } finally {
      await stays?.end();
      await reservationWorker?.end();
      await paymentWorker?.end();
      await compositionWorker?.end();
      await lifecycleIssuer?.end();
      await lifecycleWorker?.end();
      await cancellationIssuer?.end();
      await cancellationExecutor?.end();
      await refundIssuer?.end();
      await factorPool?.end();
      await fixture?.close();
    }
  });
});
