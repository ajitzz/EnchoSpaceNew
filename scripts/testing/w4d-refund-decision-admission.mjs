/**
 * ENCHO W4-D Stage B Test Suite:
 * Canonical Cancellation Refund Decision Admission.
 *
 * Verifies:
 * - Missing-Registrar Negative Control: SQLSTATE 42883 before migration 062
 * - A01: Positive end-to-end chain (Maker prepare -> Maker passkey -> Checker review -> Checker passkey -> Checker approve -> Maker runAuthorized -> registrar admission)
 * - A02: Maker self-checker & unauthorized checkers (MAKER_CHECKER_CONFLICT, PERMISSION_DENIED)
 * - A03: Session & Step-Up negative controls (STAFF_SESSION_REQUIRED, STEP_UP_REQUIRED, STEP_UP_INVALID)
 * - A04: Material packet tampering after approval (COMMAND_CONFLICT, COMMAND_FINGERPRINT_MISMATCH)
 * - A05: Canonical domain exclusions (uncancelled, V2 release, amount > ceiling, non-INR)
 * - A06: Guarded Replay & cross-maker denial (replayed: true, PERMISSION_DENIED)
 * - A07: Concurrency (racing identical Winner/Loser recovery; competing distinct serialization)
 * - A08: Injected failure rollback (atomic rollback restoring APPROVED status and zero domain rows)
 * - A09: Lost COMMIT acknowledgement / uncertainty recovery
 * - A10: Downstream issue_cancellation_refund_authorization acceptance & negative controls
 * - A11: Immutability triggers & zero side effects
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
import {createPasskeyFixture} from '../../src/test/harvo/helpers/passkeyFixture.js';
import {workforceFactorGrants} from '../../src/server/deployment/iamFactorReadiness.js';
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
    // 4. APPLY MIGRATION 062 & VERIFY HARDENED CATALOG IDENTITY
    // =======================================================================
    await applyIsolatedMigration(fixture.owner, '062_canonical_cancellation_refund_approval_admission.sql');

    // Verify pg_proc catalog hardening for admit_cancellation_refund_decision
    const admitProc = (
      await fixture.owner.query(`
        SELECT proname, prosecdef, proconfig, rolname AS owner
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE proname = 'admit_cancellation_refund_decision'
      `)
    ).rows[0];
    assert.ok(admitProc, 'admit_cancellation_refund_decision must exist in pg_proc');
    assert.equal(admitProc.prosecdef, true, 'admit_cancellation_refund_decision must be SECURITY DEFINER');
    assert.ok(
      admitProc.proconfig?.some(c => c.includes('search_path=pg_catalog, public, pg_temp')),
      'admit_cancellation_refund_decision must harden search_path'
    );
    assert.ok(
      admitProc.proconfig?.some(c => c.includes('row_security=on')),
      'admit_cancellation_refund_decision must enforce row_security=on'
    );

    // Verify pg_proc catalog hardening for get_admitted_cancellation_refund_decision
    const replayProc = (
      await fixture.owner.query(`
        SELECT proname, prosecdef, proconfig, rolname AS owner
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE proname = 'get_admitted_cancellation_refund_decision'
      `)
    ).rows[0];
    assert.ok(replayProc, 'get_admitted_cancellation_refund_decision must exist in pg_proc');
    assert.equal(replayProc.prosecdef, true, 'get_admitted_cancellation_refund_decision must be SECURITY DEFINER');
    assert.ok(
      replayProc.proconfig?.some(c => c.includes('search_path=pg_catalog, public, pg_temp')),
      'get_admitted_cancellation_refund_decision must harden search_path'
    );
    assert.ok(
      replayProc.proconfig?.some(c => c.includes('row_security=on')),
      'get_admitted_cancellation_refund_decision must enforce row_security=on'
    );

    // Grant SELECT on canonical tables to w1_offer_staff for read previews
    await fixture.owner.query(`
      GRANT SELECT ON canonical_reservations, canonical_reservation_events,
        canonical_reservation_cancellation_inventory_releases, canonical_payment_reservations,
        canonical_payable_authorities, canonical_provider_events
      TO w1_offer_staff;
    `);

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

    // Create pools
    stays = new pg.Pool({...fixture.owner.options, user: 'encho_stays_web'});
    reservationWorker = new pg.Pool({...fixture.owner.options, user: 'encho_reservation_worker'});
    paymentWorker = new pg.Pool({...fixture.owner.options, user: 'encho_payment_worker'});
    compositionWorker = new pg.Pool({...fixture.owner.options, user: 'encho_composition_worker'});
    lifecycleIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_issuer'});
    lifecycleWorker = new pg.Pool({...fixture.owner.options, user: 'encho_lifecycle_worker'});
    cancellationIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_issuer'});
    cancellationExecutor = new pg.Pool({...fixture.owner.options, user: 'encho_cancellation_executor'});
    refundIssuer = new pg.Pool({...fixture.owner.options, user: 'encho_refund_issuer'});

    // Service under test
    const admissionService = new CanonicalRefundDecisionAdmissionService(fixture.staffPool, 'LOCAL');

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

    // Outsider: User 92, outsiderMembershipId, outsiderSessionId, token: outsiderToken
    const outsiderToken = `wfs_${Buffer.alloc(32, 0x53).toString('base64url')}`;
    const outsiderBearer = `Bearer ${outsiderToken}`;
    const outsiderMembershipId = randomUUID();
    const outsiderSessionId = randomUUID();

    await fixture.owner.query(`
      INSERT INTO users (id, email, role, is_active, name)
      VALUES (92, 'outsider@example.test', 'admin', true, 'Outsider User')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO internal_organization_memberships(id, organization_id, user_id, status, accepted_at, changed_by, change_reason)
      VALUES ('${outsiderMembershipId}', '${organizationId}', 92, 'ACTIVE', clock_timestamp(), 90, 'Outsider membership');
      INSERT INTO internal_staff_sessions(id, organization_id, membership_id, token_hash, status, assurance_level,
        authenticated_at, idle_expires_at, absolute_expires_at, environment)
      VALUES ('${outsiderSessionId}', '${organizationId}', '${outsiderMembershipId}',
        '${createHash('sha256').update(outsiderToken).digest('hex')}', 'ACTIVE', 'AAL2',
        clock_timestamp(), clock_timestamp() + interval '20 minutes', clock_timestamp() + interval '4 hours', 'LOCAL');
    `);

    // Helper: setup Passkey fixtures in DB
    // Setup Organization Identity and Factor Policies
    const initialPasskey = createPasskeyFixture();
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
       VALUES ($1, 'LOCAL', 1, $2, repeat('0', 64), 'PENDING_FOUNDER_OPERATIONAL_APPROVAL', 90, 'Disposable local factor policy.')
       RETURNING id`,
      [organizationId, JSON.stringify({
        rpId: initialPasskey.policy.rpId,
        origin: initialPasskey.policy.origin,
        allowSyncedPasskeys: false,
        challengeTtlSeconds: 120,
        maximumStartsPerMinute: 10,
      })]
    )).rows[0];

    await fixture.owner.query(
      `INSERT INTO internal_workforce_current_factor_policy VALUES ($1, 'LOCAL', $2)`,
      [organizationId, fp.id]
    );

    // Helper: setup Passkey fixtures in DB for individual staff members
    const setupPasskeyForStaff = async (userId, membershipId, sessionId, token) => {
      const passkey = createPasskeyFixture();
      const loginChallengeId = randomUUID();
      const nonceHash = createHash('sha256').update(randomUUID()).digest('hex');
      const browserHash = createHash('sha256').update(randomUUID()).digest('hex');
      await fixture.owner.query(
        `INSERT INTO internal_workforce_login_challenges(id, organization_id, environment, policy_id, nonce_hash, browser_hash, status, created_at, expires_at, consumed_at)
         VALUES ($1, $2, 'LOCAL', $3, $4, $5, 'CONSUMED', clock_timestamp(), clock_timestamp() + interval '5 minutes', clock_timestamp())`,
        [loginChallengeId, organizationId, ip.id, nonceHash, browserHash]
      );

      const tokenDigest = createHash('sha256').update(token).digest('hex');
      await fixture.owner.query(
        `INSERT INTO internal_workforce_login_receipts(
           challenge_id, organization_id, environment, user_id, membership_id, session_id,
           subject_hash, email_hash, token_hash, identity_policy_hash, iam_policy_hash,
           token_issued_at, token_expires_at, verified_at
         ) VALUES (
           $1, $2, 'LOCAL', $3, $4, $5,
           repeat('1', 64), repeat('2', 64), $6, repeat('3', 64), repeat('4', 64),
           clock_timestamp(), clock_timestamp() + interval '4 hours', clock_timestamp()
         )`,
        [loginChallengeId, organizationId, userId, membershipId, sessionId, tokenDigest]
      );

      const credential = {
        ...passkey.credential,
        organizationId: organizationId,
        membershipId,
        identityReceiptHash: tokenDigest,
      };

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
    // Maker gets accommodation_refund_preparer
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

    // Checker gets accommodation_finance_approver
    const approverRoleVersionId = (await fixture.owner.query(
      `SELECT v.id FROM internal_role_versions v
       JOIN internal_role_definitions r ON r.id = v.role_id
       WHERE r.role_key = 'accommodation_finance_approver' AND v.version = 1`
    )).rows[0].id;

    await fixture.owner.query(
      `INSERT INTO internal_membership_grants(
         organization_id, membership_id, role_version_id, scope_type, scope_id, environment,
         grant_hash, granted_by, reason
       ) VALUES (
         $1, $2, $3, 'ORGANIZATION', $4, 'LOCAL',
         $5, 90, 'Grant accommodation finance approver for testing.'
       )`,
      [organizationId, foreignMembershipId, approverRoleVersionId, organizationId, createHash('sha256').update(randomUUID()).digest('hex')]
    );

    // Cryptographic Step-Up Execution Helper
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

    // Helper: Create paid reservation
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

      const dbAttempt = await getPaymentAttempt(paymentWorker, attempt.attemptId);
      assert.equal(dbAttempt?.paymentState, 'MATCHED_CAPTURE');

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
        supportingProviderEventId: provEventRow.id,
        supportingEvidenceHash: provEventRow.evidence_hash,
        capturedAmountPaise: payableAmountPaise,
      };
    };

    // Helper: Cancel reservation V1
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

    // Snapshot pre-admission table states for side-effect assertions
    const preInventoryCounts = (await fixture.owner.query('SELECT count(*)::int as c FROM inventory_days')).rows[0].c;
    const preHoldCounts = (await fixture.owner.query('SELECT count(*)::int as c FROM booking_holds')).rows[0].c;
    const preBookingCounts = (await fixture.owner.query('SELECT count(*)::int as c FROM bookings')).rows[0].c;

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

    // Maker calculates envelope fingerprint and performs real ES256 step-up
    const makerEnvelopeA01 = admissionService.buildRequestEnvelope(
      fixture.principal(90, 'STAFF'),
      packetA01,
      randomUUID(),
      'Prepare refund admission A01'
    );
    const fingerprintA01 = admissionService.fingerprint(makerEnvelopeA01);
    const makerStepUpA01 = await performStepUp(makerToken, makerPasskey, fingerprintA01);

    // Maker prepares admission
    const prepA01 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
      packet: packetA01,
      makerStepUpReceiptId: makerStepUpA01,
      reason: 'Prepare refund admission A01',
    });
    assert.equal(prepA01.actionReceipt.status, 'PENDING');
    assert.equal(prepA01.commandFingerprint, fingerprintA01);

    // Checker previews the prepared packet
    const checkerPreviewA01 = await admissionService.getRefundDecisionPreview(checkerBearer, prepA01.actionReceipt.id);
    assert.equal(checkerPreviewA01.actionReceipt.id, prepA01.actionReceipt.id);
    assert.equal(checkerPreviewA01.packet.admissionCommandId, cmdA01);
    assert.equal(checkerPreviewA01.commandFingerprint, fingerprintA01);

    // Checker performs real ES256 step-up on the exact command hash
    const checkerStepUpA01 = await performStepUp(checkerToken, checkerPasskey, prepA01.actionReceipt.commandHash);

    // Checker approves
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
    assert.ok(admittedA01.evidenceId);
    assert.ok(admittedA01.admissionId);

    // Assert admission provenance row in DB
    const admRowA01 = (await fixture.owner.query(
      `SELECT * FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1`,
      [cmdA01]
    )).rows[0];
    assert.ok(admRowA01, 'Admission provenance row must exist');
    assert.equal(admRowA01.action_authorization_id, prepA01.actionReceipt.id);
    assert.equal(admRowA01.decision_evidence_id, admittedA01.evidenceId);
    assert.equal(admRowA01.maker_membership_id, reviewerMembershipId);
    assert.equal(admRowA01.checker_membership_id, foreignMembershipId);

    // Assert decision evidence row in DB
    const devRowA01 = (await fixture.owner.query(
      `SELECT * FROM canonical_cancellation_refund_decision_evidence WHERE id = $1`,
      [admittedA01.evidenceId]
    )).rows[0];
    assert.ok(devRowA01, 'Decision evidence row must exist');
    assert.equal(devRowA01.evidence_classification, 'AUTHENTICATED_HUMAN_APPROVAL');
    assert.equal(devRowA01.approver_responsibility, 'ACCOMMODATION_FINANCE_APPROVER');
    assert.equal(devRowA01.approver_identity_ref, foreignMembershipId);
    assert.equal(devRowA01.approval_ref, prepA01.actionReceipt.id);
    assert.equal(devRowA01.permitted_issuer_role, 'encho_refund_issuer');

    // Assert action authorization is CONSUMED and stamped with pg_current_xact_id()
    const authRowA01 = (await fixture.owner.query(
      `SELECT status, consumed_transaction_id, version FROM internal_action_authorizations WHERE id = $1`,
      [prepA01.actionReceipt.id]
    )).rows[0];
    assert.equal(authRowA01.status, 'CONSUMED');
    assert.ok(authRowA01.consumed_transaction_id, 'Action authorization must have transaction witness stamped');

    // Assert admission created ZERO refund authorizations
    const zeroAuths = (await fixture.owner.query(
      `SELECT count(*)::int as c FROM canonical_cancellation_refund_authorizations WHERE reservation_id = $1`,
      [resA01.reservationId]
    )).rows[0].c;
    assert.equal(zeroAuths, 0, 'Admission must create zero refund authorizations');

    // =======================================================================
    // SCENARIO A02: MAKER SELF-CHECKER & UNAUTHORIZED CHECKERS
    // =======================================================================
    const resA02 = await createPaidReservation(50000);
    await cancelReservationV1(resA02.reservationId);

    const cmdA02 = randomUUID();
    const packetA02 = await admissionService.deriveCanonicalPreview(makerBearer, {
      admissionCommandId: cmdA02,
      decisionRef: 'DEC-A02-' + randomUUID(),
      reservationId: resA02.reservationId,
      approvedAmountMinor: '50000',
      reasonCode: 'TEST_A02_SELF_CHECK',
      organizationId: organizationId,
    });

    const makerEnvelopeA02 = admissionService.buildRequestEnvelope(
      fixture.principal(90, 'STAFF'),
      packetA02,
      randomUUID(),
      'Prepare refund admission A02'
    );
    const fingerprintA02 = admissionService.fingerprint(makerEnvelopeA02);
    const makerStepUpA02 = await performStepUp(makerToken, makerPasskey, fingerprintA02);

    const prepA02 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
      packet: packetA02,
      makerStepUpReceiptId: makerStepUpA02,
      reason: 'Prepare refund admission A02',
    });

    // 1. Maker attempts to approve their own prepared admission
    let makerSelfCheckError;
    try {
      await admissionService.approveRefundDecisionAdmission(makerBearer, {
        authorizationId: prepA02.actionReceipt.id,
        expectedCommandHash: prepA02.actionReceipt.commandHash,
        checkerStepUpReceiptId: makerStepUpA02,
        reason: 'Maker attempting self-approval',
      });
    } catch (err) {
      makerSelfCheckError = err;
    }
    assert.ok(makerSelfCheckError, 'Maker self-approval must fail');
    assert.ok(
      makerSelfCheckError.message.includes('MAKER_CHECKER_CONFLICT') ||
      makerSelfCheckError.message.includes('PERMISSION_DENIED'),
      'Must reject with MAKER_CHECKER_CONFLICT or PERMISSION_DENIED'
    );

    // 2. Outsider (staff without accommodation_finance_approver) attempts preview
    let outsiderPreviewError;
    try {
      await admissionService.getRefundDecisionPreview(outsiderBearer, prepA02.actionReceipt.id);
    } catch (err) {
      outsiderPreviewError = err;
    }
    assert.ok(outsiderPreviewError, 'Unappointed staff must fail preview');
    assert.ok(outsiderPreviewError.message.includes('PERMISSION_DENIED'));

    // 3. Outsider attempts approve
    let outsiderApproveError;
    try {
      await admissionService.approveRefundDecisionAdmission(outsiderBearer, {
        authorizationId: prepA02.actionReceipt.id,
        expectedCommandHash: prepA02.actionReceipt.commandHash,
        checkerStepUpReceiptId: randomUUID(),
        reason: 'Outsider approve attempt',
      });
    } catch (err) {
      outsiderApproveError = err;
    }
    assert.ok(outsiderApproveError, 'Unappointed staff must fail approve');
    assert.ok(outsiderApproveError.message.includes('PERMISSION_DENIED'));

    // =======================================================================
    // SCENARIO A03: SESSION & STEP-UP NEGATIVE CONTROLS
    // =======================================================================
    // 1. Foreign / invalid session token
    let invalidTokenError;
    try {
      await admissionService.getRefundDecisionPreview('Bearer wfs_invalid_token_which_is_not_registered_in_sessions____', prepA01.actionReceipt.id);
    } catch (err) {
      invalidTokenError = err;
    }
    assert.ok(invalidTokenError, 'Unregistered token must fail');
    assert.ok(invalidTokenError.message.includes('STAFF_SESSION_REQUIRED'));

    // 2. Missing / unverified step-up challenge
    const packetA03Missing = {
      ...packetA02,
      admissionCommandId: randomUUID(),
      decisionRef: 'DEC-A03-MISSING-' + randomUUID(),
    };
    let missingStepUpError;
    try {
      await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetA03Missing,
        makerStepUpReceiptId: randomUUID(),
        reason: 'Missing step up',
      });
    } catch (err) {
      missingStepUpError = err;
    }
    assert.ok(missingStepUpError, 'Missing step-up challenge must fail');
    assert.ok(
      missingStepUpError.message.includes('STEP_UP_REQUIRED') ||
      missingStepUpError.message.includes('STEP_UP_INVALID') ||
      missingStepUpError.message.includes('INPUT_INVALID') ||
      missingStepUpError.message.includes('FACTOR')
    );

    // 3. Step-up bound to a different action hash
    const wrongHash = createHash('sha256').update('different-action').digest('hex');
    const wrongStepUpId = await performStepUp(makerToken, makerPasskey, wrongHash);

    const packetA03WrongHash = {
      ...packetA02,
      admissionCommandId: randomUUID(),
      decisionRef: 'DEC-A03-WRONG-' + randomUUID(),
    };
    let wrongHashStepUpError;
    try {
      await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: packetA03WrongHash,
        makerStepUpReceiptId: wrongStepUpId,
        reason: 'Wrong hash step up',
      });
    } catch (err) {
      wrongHashStepUpError = err;
    }
    assert.ok(wrongHashStepUpError, 'Step-up bound to wrong action hash must fail');
    assert.ok(
      wrongHashStepUpError.message.includes('STEP_UP_INVALID') ||
      wrongHashStepUpError.message.includes('STEP_UP_REQUIRED') ||
      wrongHashStepUpError.message.includes('COMMAND_CONFLICT')
    );

    // =======================================================================
    // SCENARIO A04: MATERIAL PACKET TAMPERING AFTER APPROVAL
    // =======================================================================
    // Approve A02 with Checker
    const checkerStepUpA02 = await performStepUp(checkerToken, checkerPasskey, prepA02.actionReceipt.commandHash);
    await admissionService.approveRefundDecisionAdmission(checkerBearer, {
      authorizationId: prepA02.actionReceipt.id,
      expectedCommandHash: prepA02.actionReceipt.commandHash,
      checkerStepUpReceiptId: checkerStepUpA02,
      reason: 'Checker approved A02',
    });

    // Maker tampers approved amount from 50000 to 45000
    const tamperedPacketA02 = {
      ...packetA02,
      approvedAmountMinor: '45000',
    };

    let tamperedAdmitError;
    try {
      await admissionService.admitRefundDecision(makerBearer, {
        packet: tamperedPacketA02,
        actionAuthorizationId: prepA02.actionReceipt.id,
        makerStepUpReceiptId: makerStepUpA02,
      });
    } catch (err) {
      tamperedAdmitError = err;
    }
    assert.ok(tamperedAdmitError, 'Tampered packet admission must fail');
    assert.ok(
      tamperedAdmitError.message.includes('COMMAND_CONFLICT') ||
      tamperedAdmitError.message.includes('POLICY_CHANGED') ||
      tamperedAdmitError.message.includes('COMMAND_FINGERPRINT_MISMATCH')
    );

    // =======================================================================
    // SCENARIO A05: CANONICAL DOMAIN EXCLUSIONS
    // =======================================================================
    // 1. Uncancelled reservation (still CONFIRMED)
    const resA05Active = await createPaidReservation(50000);
    let uncancelledError;
    try {
      await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: randomUUID(),
        decisionRef: 'DEC-UNCANCELLED',
        reservationId: resA05Active.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_UNCANCELLED',
        organizationId: organizationId,
      });
    } catch (err) {
      uncancelledError = err;
    }
    assert.ok(uncancelledError, 'Uncancelled reservation preview must fail');
    assert.ok(uncancelledError.message.includes('RESERVATION_NOT_CANCELLED'));

    // 2. V2 cancellation release (released_effective_version = 2)
    const resA05V2 = await createPaidReservation(50000);
    const resRowV2 = (
      await fixture.owner.query(`SELECT * FROM canonical_reservations WHERE id = $1`, [resA05V2.reservationId])
    ).rows[0];
    const v2RevId = randomUUID();
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revisions (
        id, reservation_id, version, room_type_id, offer_id, offer_revision,
        check_in_date, check_out_date, nights, guest_count, room_subtotal_paise, currency
      ) VALUES ($1, $2, 2, 101, $6, $7, $3, $4, $5, 2, 1100000, 'INR')`,
      [v2RevId, resA05V2.reservationId, resRowV2.check_in_date, resRowV2.check_out_date, resRowV2.nights, resRowV2.offer_id, resRowV2.offer_revision]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_nights (
        revision_id, reservation_id, inventory_day_id, stay_date, room_type_id, units
      ) SELECT $1, $2, d.id, d.calendar_date, 101, 1
        FROM inventory_days d
        WHERE d.room_type_id = 101 AND d.calendar_date >= $3 AND d.calendar_date < $4`,
      [v2RevId, resA05V2.reservationId, resRowV2.check_in_date, resRowV2.check_out_date]
    );
    await fixture.owner.query(
      `INSERT INTO canonical_reservation_revision_seals (revision_id, reservation_id) VALUES ($1, $2)`,
      [v2RevId, resA05V2.reservationId]
    );
    await cancelReservationV1(resA05V2.reservationId);

    let v2ReleaseError;
    try {
      await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: randomUUID(),
        decisionRef: 'DEC-V2',
        reservationId: resA05V2.reservationId,
        approvedAmountMinor: '50000',
        reasonCode: 'TEST_V2',
        organizationId: organizationId,
      });
    } catch (err) {
      v2ReleaseError = err;
    }
    assert.ok(v2ReleaseError, 'V2 cancellation release must fail preview');
    assert.ok(
      v2ReleaseError.message.includes('CANCELLATION_RELEASE_INVALID') ||
      v2ReleaseError.message.includes('V2_CANCELLATION_RELEASE_EXCLUDED')
    );

    // 3. Amount exceeding captured ceiling
    const resA05Ceil = await createPaidReservation(40000);
    await cancelReservationV1(resA05Ceil.reservationId);

    let ceilingError;
    try {
      await admissionService.deriveCanonicalPreview(makerBearer, {
        admissionCommandId: randomUUID(),
        decisionRef: 'DEC-CEILING',
        reservationId: resA05Ceil.reservationId,
        approvedAmountMinor: '50000', // exceeds 40000
        reasonCode: 'TEST_CEIL',
        organizationId: organizationId,
      });
    } catch (err) {
      ceilingError = err;
    }
    assert.ok(ceilingError, 'Amount exceeding captured ceiling must fail preview');
    assert.ok(ceilingError.message.includes('APPROVED_AMOUNT_INVALID'));

    // 4. Non-INR currency rejection
    let currencyError;
    try {
      await admissionService.prepareRefundDecisionAdmission(makerBearer, {
        packet: {
          ...packetA01,
          currency: 'USD',
        },
        makerStepUpReceiptId: makerStepUpA01,
        reason: 'Non-INR currency admission attempt',
      });
    } catch (err) {
      currencyError = err;
    }
    assert.ok(currencyError, 'Non-INR currency packet must fail');
    assert.ok(
      currencyError.message.includes('INR') ||
      currencyError.message.includes('invalid') ||
      currencyError.message.includes('INPUT_INVALID')
    );

    // =======================================================================
    // SCENARIO A06: GUARDED REPLAY & CROSS-MAKER ACCESS DENIAL
    // =======================================================================
    // 1. Exact Maker replay returns replayed: true without fresh factor consumption
    const replayedA01 = await admissionService.admitRefundDecision(makerBearer, {
      packet: packetA01,
      actionAuthorizationId: prepA01.actionReceipt.id,
      makerStepUpReceiptId: randomUUID(), // Even with dummy or expired factor, replay succeeds
    });
    assert.equal(replayedA01.replayed, true);
    assert.equal(replayedA01.commandId, cmdA01);
    assert.equal(replayedA01.evidenceId, admittedA01.evidenceId);
    assert.equal(replayedA01.admissionId, admittedA01.admissionId);
    assert.equal(replayedA01.approvedAmountPaise, 50000n);

    // 2. Cross-maker access rejection: Checker attempting to query Maker's command ID via get_admitted_cancellation_refund_decision
    let crossMakerError;
    try {
      await admissionService.admitRefundDecision(checkerBearer, {
        packet: packetA01,
        actionAuthorizationId: prepA01.actionReceipt.id,
        makerStepUpReceiptId: randomUUID(),
      });
    } catch (err) {
      crossMakerError = err;
    }
    assert.ok(crossMakerError, 'Different staff member must be denied replay of Maker command');
    assert.ok(crossMakerError.message.includes('PERMISSION_DENIED'));

    // =======================================================================
    // SCENARIO A07: CONCURRENCY (RACING WINNER/LOSER & COMPETING DISTINCT)
    // =======================================================================
    // 1. Identical command race: Winner commits, Loser recovers cleanly
    const resA07Identical = await createPaidReservation(50000);
    await cancelReservationV1(resA07Identical.reservationId);

    const cmdA07 = randomUUID();
    const packetA07 = await admissionService.deriveCanonicalPreview(makerBearer, {
      admissionCommandId: cmdA07,
      decisionRef: 'DEC-A07-' + randomUUID(),
      reservationId: resA07Identical.reservationId,
      approvedAmountMinor: '50000',
      reasonCode: 'TEST_A07_RACE',
      organizationId: organizationId,
    });

    const makerEnvelopeA07 = admissionService.buildRequestEnvelope(
      fixture.principal(90, 'STAFF'),
      packetA07,
      randomUUID(),
      'Prepare refund admission A07'
    );
    const fingerprintA07 = admissionService.fingerprint(makerEnvelopeA07);
    const makerStepUpA07 = await performStepUp(makerToken, makerPasskey, fingerprintA07);

    const prepA07 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {
      packet: packetA07,
      makerStepUpReceiptId: makerStepUpA07,
      reason: 'Prepare refund admission A07',
    });

    const checkerStepUpA07 = await performStepUp(checkerToken, checkerPasskey, prepA07.actionReceipt.commandHash);
    await admissionService.approveRefundDecisionAdmission(checkerBearer, {
      authorizationId: prepA07.actionReceipt.id,
      expectedCommandHash: prepA07.actionReceipt.commandHash,
      checkerStepUpReceiptId: checkerStepUpA07,
      reason: 'Checker approved A07',
    });

    // Run two racing calls concurrently
    const [raceResult1, raceResult2] = await Promise.all([
      admissionService.admitRefundDecision(makerBearer, {
        packet: packetA07,
        actionAuthorizationId: prepA07.actionReceipt.id,
        makerStepUpReceiptId: makerStepUpA07,
      }),
      admissionService.admitRefundDecision(makerBearer, {
        packet: packetA07,
        actionAuthorizationId: prepA07.actionReceipt.id,
        makerStepUpReceiptId: makerStepUpA07,
      }),
    ]);

    assert.equal(raceResult1.evidenceId, raceResult2.evidenceId);
    assert.equal(raceResult1.admissionId, raceResult2.admissionId);
    // One must be replayed: false, one replayed: true (or both converge gracefully)
    const replayedFlags = [raceResult1.replayed, raceResult2.replayed];
    assert.ok(replayedFlags.includes(false), 'At least one winner must record new admission');

    // Exactly 1 admission row and 1 evidence row
    const a07AdmissionsCount = (await fixture.owner.query(
      `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_admissions WHERE command_id = $1`,
      [cmdA07]
    )).rows[0].c;
    assert.equal(a07AdmissionsCount, 1, 'Exactly one admission row must exist after race');

    // 2. Competing distinct commands racing for the same reservation
    const resA07Distinct = await createPaidReservation(50000);
    await cancelReservationV1(resA07Distinct.reservationId);

    const cmdDistinct1 = randomUUID();
    const packetDistinct1 = await admissionService.deriveCanonicalPreview(makerBearer, {
      admissionCommandId: cmdDistinct1,
      decisionRef: 'DEC-DISTINCT-1-' + randomUUID(),
      reservationId: resA07Distinct.reservationId,
      approvedAmountMinor: '30000',
      reasonCode: 'TEST_DISTINCT_1',
      organizationId: organizationId,
    });
    const envDist1 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetDistinct1, randomUUID(), 'Prepare refund admission distinct 1');
    const fpDist1 = admissionService.fingerprint(envDist1);
    const stepUpDist1 = await performStepUp(makerToken, makerPasskey, fpDist1);
    const prepDist1 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {packet: packetDistinct1, makerStepUpReceiptId: stepUpDist1, reason: 'Prepare refund admission distinct 1'});
    const chkStepUpDist1 = await performStepUp(checkerToken, checkerPasskey, prepDist1.actionReceipt.commandHash);
    await admissionService.approveRefundDecisionAdmission(checkerBearer, {authorizationId: prepDist1.actionReceipt.id, expectedCommandHash: prepDist1.actionReceipt.commandHash, checkerStepUpReceiptId: chkStepUpDist1, reason: 'Approved distinct 1 by checker'});

    const cmdDistinct2 = randomUUID();
    const packetDistinct2 = await admissionService.deriveCanonicalPreview(makerBearer, {
      admissionCommandId: cmdDistinct2,
      decisionRef: 'DEC-DISTINCT-2-' + randomUUID(),
      reservationId: resA07Distinct.reservationId,
      approvedAmountMinor: '40000',
      reasonCode: 'TEST_DISTINCT_2',
      organizationId: organizationId,
    });
    const envDist2 = admissionService.buildRequestEnvelope(fixture.principal(90, 'STAFF'), packetDistinct2, randomUUID(), 'Prepare refund admission distinct 2');
    const fpDist2 = admissionService.fingerprint(envDist2);
    const stepUpDist2 = await performStepUp(makerToken, makerPasskey, fpDist2);
    const prepDist2 = await admissionService.prepareRefundDecisionAdmission(makerBearer, {packet: packetDistinct2, makerStepUpReceiptId: stepUpDist2, reason: 'Prepare refund admission distinct 2'});
    const chkStepUpDist2 = await performStepUp(checkerToken, checkerPasskey, prepDist2.actionReceipt.commandHash);
    await admissionService.approveRefundDecisionAdmission(checkerBearer, {authorizationId: prepDist2.actionReceipt.id, expectedCommandHash: prepDist2.actionReceipt.commandHash, checkerStepUpReceiptId: chkStepUpDist2, reason: 'Approved distinct 2 by checker'});

    const distinctResults = await Promise.allSettled([
      admissionService.admitRefundDecision(makerBearer, {packet: packetDistinct1, actionAuthorizationId: prepDist1.actionReceipt.id, makerStepUpReceiptId: stepUpDist1}),
      admissionService.admitRefundDecision(makerBearer, {packet: packetDistinct2, actionAuthorizationId: prepDist2.actionReceipt.id, makerStepUpReceiptId: stepUpDist2}),
    ]);

    const distinctSuccesses = distinctResults.filter(r => r.status === 'fulfilled');
    const distinctFailures = distinctResults.filter(r => r.status === 'rejected');

    assert.equal(distinctSuccesses.length, 1, 'Exactly one distinct command must succeed for the reservation');
    assert.equal(distinctFailures.length, 1, 'Competing distinct command must fail reservation uniqueness constraint');

    // =======================================================================
    // SCENARIO A08: INJECTED FAILURE ROLLBACK
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

    let injectedAbortError;
    try {
      await admissionService.admitRefundDecision(makerBearer, {
        packet: packetA08,
        actionAuthorizationId: prepA08.actionReceipt.id,
        makerStepUpReceiptId: stepUpA08,
        injectedFailureHook: async (client) => {
          await client.query("SELECT 'intentional_abort'::int");
        },
      });
    } catch (err) {
      injectedAbortError = err;
    }
    assert.ok(injectedAbortError, 'Injected abort failure hook must cause transaction rollback');

    // Verify atomic rollback in DB: zero admissions, zero evidence rows
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

    // Preparation is preserved
    const a08PrepCount = (await fixture.owner.query(
      `SELECT count(*)::int as c FROM canonical_cancellation_refund_decision_preparations WHERE command_id = $1`,
      [cmdA08]
    )).rows[0].c;
    assert.equal(a08PrepCount, 1, 'Preparation row must be preserved');

    // Re-trying without failure hook succeeds cleanly
    const a08Recovered = await admissionService.admitRefundDecision(makerBearer, {
      packet: packetA08,
      actionAuthorizationId: prepA08.actionReceipt.id,
      makerStepUpReceiptId: stepUpA08,
    });
    assert.equal(a08Recovered.replayed, false);
    assert.equal(a08Recovered.commandId, cmdA08);

    // =======================================================================
    // SCENARIO A09: SIMULATED LOST COMMIT ACKNOWLEDGEMENT
    // =======================================================================
    // For the committed A08 command, caller attempts admission again
    const a09Recovered = await admissionService.admitRefundDecision(makerBearer, {
      packet: packetA08,
      actionAuthorizationId: prepA08.actionReceipt.id,
      makerStepUpReceiptId: stepUpA08,
    });
    assert.equal(a09Recovered.replayed, true);
    assert.equal(a09Recovered.evidenceId, a08Recovered.evidenceId);
    assert.equal(a09Recovered.admissionId, a08Recovered.admissionId);

    // =======================================================================
    // SCENARIO A10: DOWNSTREAM ISSUE_CANCELLATION_REFUND_AUTHORIZATION
    // =======================================================================
    // 1. Positive: Issue refund authorization using admitted AUTHENTICATED_HUMAN_APPROVAL evidence
    const issueCmdA10 = randomUUID();
    const issueResA10 = (await refundIssuer.query(
      `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
      [issueCmdA10, resA01.reservationId, admittedA01.evidenceId]
    )).rows[0];

    assert.ok(issueResA10, 'issue_cancellation_refund_authorization must return issued authorization');
    assert.equal(issueResA10.issuing_role, 'encho_refund_issuer');
    assert.equal(issueResA10.approved_amount_paise, '50000');
    assert.equal(issueResA10.replayed, false);

    // 2. Negative Control: Forged provenance (evidence with AUTHENTICATED_HUMAN_APPROVAL but missing admissions provenance)
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
        resA05Active.reservationId,
        (await cancelReservationV1(resA05Active.reservationId)).cancellationEventId,
        (await fixture.owner.query(`SELECT release_id FROM canonical_reservation_cancellation_inventory_releases WHERE reservation_id = $1`, [resA05Active.reservationId])).rows[0].release_id,
        resA05Active.paidBridgeId,
        resA05Active.paymentAttemptId,
        resA05Active.quoteId,
        resA05Active.payableAuthorityId,
        resA05Active.providerPaymentRef,
        resA05Active.supportingProviderEventId,
        resA05Active.supportingEvidenceHash,
      ]
    );

    let forgedProvenanceError;
    try {
      await refundIssuer.query(
        `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
        [randomUUID(), resA05Active.reservationId, forgedEvidenceId]
      );
    } catch (err) {
      forgedProvenanceError = err;
    }
    assert.ok(forgedProvenanceError, 'Forged provenance must be rejected by issue_cancellation_refund_authorization');
    assert.ok(forgedProvenanceError.message.includes('EVIDENCE_PROVENANCE_NOT_FOUND'));

    // 3. Positive: Accepts LOCAL_SYNTHETIC_TEST_FIXTURE without requiring admissions provenance
    const syntheticRes = await createPaidReservation(50000);
    const synthCancel = await cancelReservationV1(syntheticRes.reservationId);
    const synthEvidenceId = randomUUID();

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
        $1, 'DEC-SYNTH', 1, 'LOCAL_SYNTHETIC_TEST_FIXTURE', 'ACCOMMODATION_FINANCE_APPROVER',
        'synthetic-checker', clock_timestamp(), 'SYNTH_REASON', 'Synthetic test', 'synth-ref',
        'SYNTHETIC', clock_timestamp(), $2, $3, $4, $5, $6, $7, $8, 'RAZORPAY', $9,
        $10, $11, 50000, 'INR', 'REFUND_DECISION_AUTHORITY_PRIMITIVE', 'encho_refund_issuer'
      )`,
      [
        synthEvidenceId,
        syntheticRes.reservationId,
        synthCancel.cancellationEventId,
        synthCancel.cancellationReleaseId,
        syntheticRes.paidBridgeId,
        syntheticRes.paymentAttemptId,
        syntheticRes.quoteId,
        syntheticRes.payableAuthorityId,
        syntheticRes.providerPaymentRef,
        syntheticRes.supportingProviderEventId,
        syntheticRes.supportingEvidenceHash,
      ]
    );

    const synthIssue = (await refundIssuer.query(
      `SELECT * FROM issue_cancellation_refund_authorization($1, $2, $3)`,
      [randomUUID(), syntheticRes.reservationId, synthEvidenceId]
    )).rows[0];
    assert.ok(synthIssue, 'Synthetic fixture evidence must be accepted');
    assert.equal(synthIssue.issuing_role, 'encho_refund_issuer');

    // =======================================================================
    // SCENARIO A11: IMMUTABILITY TRIGGERS & ZERO SIDE EFFECTS
    // =======================================================================
    // 1. UPDATE on canonical_cancellation_refund_decision_admissions
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

    // 2. DELETE on canonical_cancellation_refund_decision_admissions
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

    // 3. UPDATE on canonical_cancellation_refund_decision_preparations
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

    // 4. DELETE on canonical_cancellation_refund_decision_preparations
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

    // 5. UPDATE on canonical_cancellation_refund_decision_evidence
    let updateDevError;
    try {
      await fixture.owner.query(`
        UPDATE canonical_cancellation_refund_decision_evidence
        SET reason_text = 'hacked'
        WHERE id = $1`,
        [admittedA01.evidenceId]
      );
    } catch (err) {
      updateDevError = err;
    }
    assert.ok(updateDevError, 'UPDATE on evidence table must be rejected');
    assert.ok(updateDevError.message.includes('CANONICAL_REFUND_DECISION_EVIDENCE_IMMUTABLE'));

    // 6. Assert zero mutation to bookings table
    const postBookingCounts = (await fixture.owner.query('SELECT count(*)::int as c FROM bookings')).rows[0].c;
    assert.equal(postBookingCounts, preBookingCounts, 'Zero side-effect mutation on bookings');

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
