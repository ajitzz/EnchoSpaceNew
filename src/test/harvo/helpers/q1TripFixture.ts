import {createHmac, randomUUID} from 'node:crypto';
import pg from 'pg';
import {AcceptedOfferService} from '../../../server/offers/acceptedOfferService.js';
import {PostgresWorkforceAuthorization} from '../../../lib/iam/postgresAuthorization.js';
import {createItineraryQuote} from '../../../services/itineraryQuoteService.js';
import {acquireHold} from '../../../services/inventoryHoldService.js';
import {finalizeDirectHold} from '../../../services/canonicalReservationService.js';
import {createPaymentAttempt, ingestProviderEvent} from '../../../services/canonicalPaymentService.js';
import {composePaymentReservation} from '../../../services/canonicalCompositionService.js';
import {issueCancellationAuthorization, requestReservationCancellation} from '../../../services/canonicalLifecycleService.js';
import {issueCancellationDecisionAuthorization, completeReservationCancellation} from '../../../services/canonicalCancellationCompletionService.js';
import {CanonicalTripService} from '../../../services/canonicalTripService.js';
import type {TripReadProof} from '../../../services/canonicalTripContract.js';
import {addDays, createW1AcceptedOfferFixture} from './w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from './isolatedMigration.js';

export const q1Migration = '063_internal_own_account_trip_projection.sql';
// Synthetic, local-only fixture material. No environment/configuration secret.
export const fixtureReadKey = Buffer.alloc(32, 0x0b);
export const fixtureCursorKey = Buffer.alloc(32, 0x35);
export type FixtureLogin = {credential: string};
export const loginA = {credential: 'isolated-account-a'};
export const loginB = {credential: 'isolated-account-b'};
export const loginAdmin = {credential: 'isolated-admin-account'};
const accounts = new Map([[loginA.credential, 10], [loginB.credential, 11], [loginAdmin.credential, 90]]);

export function fixtureProof(accountId: number, ttl = 120): TripReadProof {
  const keyId = 'local-fixture', expiresAtSeconds = Math.floor(Date.now() / 1000) + ttl, nonce = randomUUID();
  const message = `q1-trip-read-v1\n${keyId}\nuser:${accountId}\n${expiresAtSeconds}\n${nonce}`;
  return {keyId, accountId, expiresAtSeconds, nonce,
    mac: createHmac('sha256', fixtureReadKey).update(message).digest('hex')};
}
export const fixtureAuthentication = {async authenticate(context: FixtureLogin) {
  const account = accounts.get(context?.credential);
  return account ? fixtureProof(account) : null;
}};
export const proofArguments = (proof: TripReadProof, size = 20, reservation: string | null = null) =>
  [proof.keyId, proof.accountId, proof.expiresAtSeconds, proof.nonce, proof.mac, size, reservation, null, null];
export const rawTripSQL = `SELECT projection FROM public.canonical_own_account_trips($1,$2,$3,$4,$5,$6,$7,$8,$9)`;

/** Exact predecessors in a Unix-socket-only disposable cluster; never reads a
 * database URL. Owner-created commercial/structural fixtures are NOT policy,
 * deployed IAM, paid modification or live provider acceptance evidence. */
export async function createQ1TripFixture(options: {applyQ1?: boolean} = {}) {
  const base = await createW1AcceptedOfferFixture({serverCompatible: true});
  const pools: pg.Pool[] = [];
  const poolFor = (user: string, max = 1) => {
    const pool = new pg.Pool({...base.owner.options, user, max}); pools.push(pool); return pool;
  };
  const close = async () => { await Promise.all(pools.map(pool => pool.end())); await base.close(); };
  try {
    await base.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
      status TEXT NOT NULL,start_date DATE,end_date DATE)`);
    await applyIsolatedMigration(base.owner, '041_stays_canonical_commerce.sql');
    await base.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE encho_trip_reader LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE q1_untrusted LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(base.owner, '050_accepted_offer_itinerary_quotes.sql');
    for (const role of ['encho_reservation_worker', 'encho_payment_worker', 'encho_composition_worker',
      'encho_lifecycle_issuer', 'encho_lifecycle_worker', 'encho_cancellation_issuer',
      'encho_cancellation_executor', 'encho_modification_issuer', 'encho_refund_issuer']) {
      // Role names are a fixed fixture allowlist, never user input.
      await base.owner.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
    }
    for (const migration of ['052_canonical_reservation_hold_finalization.sql',
      '053_canonical_payment_evidence_and_reconciliation.sql', '054_canonical_payment_reservation_composition.sql',
      '055_canonical_reservation_lifecycle_authority.sql', '056_canonical_cancellation_completion_authority.sql',
      '057_canonical_reservation_revision_model.sql', '058_version_aware_cancellation_release.sql',
      '059_canonical_reservation_modification_request.sql', '060_canonical_payment_composition_lock_order_hardening.sql',
      '061_canonical_cancellation_refund_authorization.sql', '062_canonical_cancellation_refund_approval_admission.sql'])
      await applyIsolatedMigration(base.owner, migration);
    if (options.applyQ1 !== false) {
      await applyIsolatedMigration(base.owner, q1Migration);
      await base.owner.query(`INSERT INTO canonical_trip_private.authentication_keys
        (key_id,secret,enabled,valid_from,valid_until) VALUES($1,$2,true,clock_timestamp()-interval '1 hour',
          clock_timestamp()+interval '1 hour')`, ['local-fixture', fixtureReadKey]);
    }
    await base.owner.query(`INSERT INTO inventory_days(listing_id,room_type_id,calendar_date,total_units)
      SELECT 1, room, $1::date + n, 1 FROM unnest(ARRAY[101,102]) room CROSS JOIN generate_series(90,364) n
      ON CONFLICT(room_type_id,calendar_date) DO NOTHING`, [base.today]);
    const offers = new Map<number, string>();
    const offerService = new AcceptedOfferService(base.hostPool, new PostgresWorkforceAuthorization(base.staffPool, 'LOCAL'), 'LOCAL');
    for (const roomTypeId of [101,102]) {
      const draft = await offerService.createDraft(base.principal(10), {commandId: randomUUID(), listingId: 1,
        roomTypeId, amountMinor: '550000', stayStart: base.today, stayEnd: addDays(base.today,365),
        effectiveFrom: new Date(Date.now()-3600000).toISOString(),
        effectiveUntil: new Date(Date.now()+365*86400000).toISOString(), maxGuests: 2, minNights: 1});
      const submitted = await offerService.submit(base.principal(10), {offerId: draft.offerId, revision: 1, expectedVersion: draft.version});
      await base.grantOffer(draft.offerId);
      await offerService.accept(base.principal(90,'STAFF'), {offerId: draft.offerId, revision: 1, expectedVersion: submitted.version});
      offers.set(roomTypeId,draft.offerId);
    }
    const reader = poolFor('encho_trip_reader'), stays = poolFor('encho_stays_web'), reservationWorker = poolFor('encho_reservation_worker');
    const paymentWorker = poolFor('encho_payment_worker'), compositionWorker = poolFor('encho_composition_worker');
    const lifecycleIssuer = poolFor('encho_lifecycle_issuer'), lifecycleWorker = poolFor('encho_lifecycle_worker');
    const cancellationIssuer = poolFor('encho_cancellation_issuer'), cancellationExecutor = poolFor('encho_cancellation_executor');
    const untrusted = poolFor('q1_untrusted'), refundIssuer = poolFor('encho_refund_issuer');
    const service = new CanonicalTripService(reader, fixtureAuthentication, fixtureCursorKey);
    let offset = 1;
    const held = async (principal = 'user:10', nights = 1) => {
      const start = offset; offset += nights + 1;
      const checkIn = addDays(base.today,start), checkOut = addDays(base.today,start+nights);
      const quote = await createItineraryQuote(stays, {offerId: offers.get(101)!, revision: 1, checkIn, checkOut,
        guestCount: 2, requestId: randomUUID()}, principal);
      const hold = await acquireHold(stays, {roomTypeId: 101, checkIn, checkOut, quantity: 1,
        idempotencyKey: randomUUID(), quoteId: quote.id, holderPrincipal: principal,
        ...(principal.startsWith('user:') ? {userId: Number(principal.slice(5))} : {})});
      if (!hold.success || !hold.hold) throw new Error('Q1_FIXTURE_HOLD_FAILED');
      return {principal, holdId: hold.hold.id, quoteId: quote.id, checkIn, checkOut, nights, subtotal: quote.roomSubtotalMinor};
    };
    const matched = async (context: Awaited<ReturnType<typeof held>>) => {
      const amount = Number(context.subtotal), orderRef = `q1-order-${randomUUID()}`, paymentRef = `q1-capture-${randomUUID()}`;
      await base.owner.query(`INSERT INTO canonical_payable_authorities(quote_id,currency,payable_amount_paise,
        authority_kind,contract_hash,status) VALUES($1,'INR',$2,'DISPOSABLE TEST FIXTURE ONLY',$3,'APPROVED')`,
      [context.quoteId, amount, 'a'.repeat(64)]);
      const attempt = await createPaymentAttempt(paymentWorker, {commandId: randomUUID(), holderPrincipal: context.principal,
        originKind: 'RAZORPAY', quoteId: context.quoteId, holdId: context.holdId, providerOrderRef: orderRef});
      const eventId = `q1-event-${randomUUID()}`, evidencePayload = {synthetic: true, privateFixtureMarker: 'MUST_NOT_BE_PROJECTED'};
      const event = {attemptId: attempt.attemptId, originKind: 'RAZORPAY' as const, providerEventId: eventId,
        normalizedEventType: 'PAYMENT_CAPTURED' as const, reportedAmountPaise: amount, reportedCurrency: 'INR',
        providerPaymentRef: paymentRef, providerOrderRef: orderRef, evidencePayload};
      await ingestProviderEvent(paymentWorker, event);
      return {...context, attemptId: attempt.attemptId, event, paymentRef};
    };
    const reserve = async (options: {principal?: string; nights?: number; paid?: boolean; captureOnly?: boolean} = {}) => {
      const context = await held(options.principal, options.nights);
      const paid = options.paid || options.captureOnly ? await matched(context) : null;
      const commandId = randomUUID();
      const result = options.paid ? await composePaymentReservation(compositionWorker,
        {commandId, paymentAttemptId: paid!.attemptId})
        : await finalizeDirectHold(reservationWorker, context.principal, {commandId, holdId: context.holdId, quoteId: context.quoteId});
      if (!result.reservationId) throw new Error('Q1_FIXTURE_RESERVATION_FAILED');
      return {...context, paid, reservationId: result.reservationId};
    };
    const requestCancellation = async (reservationId: string, principal = 'user:10') => {
      const commandId = randomUUID(), reasonCode = 'Q1_LOCAL_CANCEL';
      const auth = await issueCancellationAuthorization(lifecycleIssuer,
        {reservationId, commandId, reasonCode, authenticatedPrincipal: principal});
      return requestReservationCancellation(lifecycleWorker, {reservationId, commandId, reasonCode, authorizationId: auth.authorizationId});
    };
    const completeCancellation = async (reservationId: string, requestEventId: string) => {
      const commandId = randomUUID(), reasonCode = 'Q1_LOCAL_DECISION';
      const auth = await issueCancellationDecisionAuthorization(cancellationIssuer, {reservationId, requestEventId, commandId, reasonCode});
      return completeReservationCancellation(cancellationExecutor, {reservationId, commandId, reasonCode, authorizationId: auth.authorizationId});
    };
    const assemble = async (reservationId: string, version = 2) => {
      const id = randomUUID();
      await base.owner.query(`INSERT INTO canonical_reservation_revisions(id,reservation_id,version,room_type_id,
        offer_id,offer_revision,check_in_date,check_out_date,nights,guest_count,room_subtotal_paise,currency)
        SELECT $1,id,$3,102,$4,1,check_in_date,check_out_date,nights,guest_count,room_subtotal_paise,currency
        FROM canonical_reservations WHERE id=$2`, [id,reservationId,version,offers.get(102)]);
      await base.owner.query(`INSERT INTO canonical_reservation_revision_nights(revision_id,reservation_id,
        inventory_day_id,stay_date,room_type_id,units)
        SELECT $1,$2,d.id,d.calendar_date,102,1 FROM inventory_days d JOIN canonical_reservations r
        ON d.calendar_date>=r.check_in_date AND d.calendar_date<r.check_out_date
        WHERE r.id=$2 AND d.room_type_id=102`, [id,reservationId]);
      return id;
    };
    return {...base, reader, stays, reservationWorker, paymentWorker, compositionWorker, lifecycleIssuer, lifecycleWorker,
      cancellationIssuer, cancellationExecutor, refundIssuer, untrusted, service, offers, poolFor, held, matched,
      reserve, requestCancellation, completeCancellation, assemble, close};
  } catch (error) { await close(); throw error; }
}
