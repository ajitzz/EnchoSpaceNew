import {randomUUID} from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createHostOfferRouter, createStaffOfferRouter} from '../../server/offers/offerRouter.js';
import {AcceptedOfferService} from '../../server/offers/acceptedOfferService.js';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {StaffSessionReader} from '../../lib/iam/staffSessions.js';
import {createHttpExecutionContextMiddleware} from '../../server/observability/httpExecutionContext.js';
import {resolvePublicStayAuthority} from '../../server/guest/publicStayAuthority.js';
import {toPublicListingCardProjection, toPublicStayProjection} from '../../lib/stayProjection.js';
import {addDays, createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';

/** Integration impact: the mounted Host and workforce commands must produce the
 * same accepted offer authority consumed by Guest catalogue/detail. This test
 * uses separate restricted PostgreSQL LOGINs and no remote environment state. */
describe('W1 mounted command to public projection on disposable PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let app: express.Express;
  const origin = 'https://operations.w1.test';

  beforeAll(async () => {
    fixture = await createW1AcceptedOfferFixture();
    const authorization = new PostgresWorkforceAuthorization(fixture.staffPool, 'LOCAL');
    const service = new AcceptedOfferService(fixture.hostPool, authorization, 'LOCAL', fixture.staffPool);
    const staffReader = new StaffSessionReader(fixture.staffPool, 'LOCAL');
    app = express();
    app.use(express.json(), createHttpExecutionContextMiddleware());
    const hostAuth: express.RequestHandler = (req, res, next) => {
      if (req.headers.authorization !== 'Bearer fixture-host-10') {
        res.status(401).json({code: 'ACCOUNT_REQUIRED'});
        return;
      }
      (req as typeof req & {user: {id: number}}).user = {id: 10};
      next();
    };
    app.use('/host', createHostOfferRouter(service, hostAuth));
    app.use('/staff', createStaffOfferRouter(service, staffReader, origin));
  }, 60_000);

  afterAll(async () => { await fixture?.close(); });

  async function publicProjection() {
    const listing = (await fixture.publicPool.query('SELECT * FROM listings WHERE id=1')).rows[0];
    const resolved = await resolvePublicStayAuthority(fixture.publicPool, listing, fixture.publicPool);
    return {card: toPublicListingCardProjection(resolved), detail: toPublicStayProjection(resolved)};
  }

  const staffPost = (path: string, expectedVersion: number, token: string) =>
    request(app).post(path).set('Authorization', `Bearer ${token}`).set('Origin', origin)
      .set('X-Encho-Workforce-Command', '1').send({expectedVersion});

  it('publishes only exact submitted, staff-accepted room offers across the mounted boundary', async () => {
    const firstStay = addDays(fixture.today, 1);
    const endStay = addDays(fixture.today, 8);
    const effectiveFrom = new Date(Date.now() - 86_400_000).toISOString();
    const effectiveUntil = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const draft = async (roomTypeId: number, amountMinor: string, offerId?: string,
      expectedVersion?: number, commandId = randomUUID()) =>
      request(app).post('/host/listings/1/drafts').set('Authorization', 'Bearer fixture-host-10')
        .send({commandId, roomTypeId, amountMinor, stayStart: firstStay, stayEnd: endStay,
          effectiveFrom, effectiveUntil, maxGuests: 2, minNights: 1,
          ...(offerId ? {offerId, expectedVersion} : {})});

    const before = await publicProjection();
    expect(before.card.price).toBeNull();
    expect(before.detail.priceState).toBe('VERIFIED_OFFER_UNAVAILABLE');

    const firstCommandId = randomUUID();
    const firstDraft = await draft(101, '550000', undefined, undefined, firstCommandId);
    expect(firstDraft.status).toBe(201);
    expect(firstDraft.body).toMatchObject({roomTypeId: 101, revision: 1, status: 'DRAFT'});
    const offerId = firstDraft.body.offerId as string;
    await fixture.grantOffer(offerId);

    const afterDraft = await publicProjection();
    expect(afterDraft.card.price).toBeNull();
    const denied = await staffPost(`/staff/${offerId}/revisions/1/accept`, firstDraft.body.version,
      fixture.foreignStaffToken);
    expect(denied.status).toBe(403);

    const submitted = await request(app).post(`/host/${offerId}/revisions/1/submit`)
      .set('Authorization', 'Bearer fixture-host-10').send({expectedVersion: firstDraft.body.version});
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('SUBMITTED');
    const replay = await draft(101, '550000', undefined, undefined, firstCommandId);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(firstDraft.body);
    const conflictingReplay = await draft(101, '560000', undefined, undefined, firstCommandId);
    expect(conflictingReplay.status).toBe(409);
    expect(conflictingReplay.body.code).toBe('OFFER_COMMAND_CONFLICT');
    expect((await publicProjection()).card.price).toBeNull();
    const reviewQueue = await request(app).get('/staff/listings/1/submitted')
      .set('Authorization', `Bearer ${fixture.staffToken}`);
    expect(reviewQueue.status).toBe(200);
    expect(reviewQueue.body).toEqual(expect.arrayContaining([
      expect.objectContaining({offerId, revision: 1, status: 'SUBMITTED'}),
    ]));

    const accepted = await staffPost(`/staff/${offerId}/revisions/1/accept`, submitted.body.version,
      fixture.staffToken);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({status: 'ACCEPTED', revision: 1});
    const acceptedQueue = await request(app).get('/staff/listings/1/accepted')
      .set('Authorization', `Bearer ${fixture.staffToken}`);
    expect(acceptedQueue.status).toBe(200);
    expect(acceptedQueue.body).toEqual(expect.arrayContaining([
      expect.objectContaining({offerId, revision: 1, status: 'ACCEPTED'}),
    ]));
    const afterAccept = await publicProjection();
    for (const view of [afterAccept.card, afterAccept.detail]) {
      expect(view.priceState).toBe('VERIFIED_OFFER_AVAILABLE');
      expect(view.price).toBe(5500);
      expect(view.fromOffer).toMatchObject({offerId, revision: 1, roomTypeId: '101', amountMinor: '550000'});
      expect(view.rooms.find(room => room.id === '101')).toMatchObject({price: 5500,
        offer: {offerId, revision: 1}});
      expect(view.rooms.find(room => room.id === '102')?.price).toBeNull();
      expect(view.photos?.filter(photo => photo.room_type_id === '101').every(photo => photo.url.includes('/101/'))).toBe(true);
    }

    const secondDraft = await draft(102, '620000');
    expect(secondDraft.status).toBe(201);
    await fixture.grantOffer(secondDraft.body.offerId);
    const secondSubmitted = await request(app).post(`/host/${secondDraft.body.offerId}/revisions/1/submit`)
      .set('Authorization', 'Bearer fixture-host-10').send({expectedVersion: secondDraft.body.version});
    expect(secondSubmitted.status).toBe(200);
    const secondAccepted = await staffPost(`/staff/${secondDraft.body.offerId}/revisions/1/accept`,
      secondSubmitted.body.version, fixture.staffToken);
    expect(secondAccepted.status).toBe(200);
    const twoRooms = await publicProjection();
    expect(twoRooms.card.price).toBe(5500);
    expect(twoRooms.card.rooms.find(room => room.id === '102')).toMatchObject({price: 6200,
      offer: {offerId: secondDraft.body.offerId, revision: 1}});

    const successor = await draft(101, '600000', offerId, accepted.body.version);
    expect(successor.status).toBe(201);
    expect(successor.body).toMatchObject({revision: 2, status: 'DRAFT'});
    expect((await publicProjection()).card.price).toBe(5500);
    const successorSubmitted = await request(app).post(`/host/${offerId}/revisions/2/submit`)
      .set('Authorization', 'Bearer fixture-host-10').send({expectedVersion: successor.body.version});
    expect(successorSubmitted.status).toBe(200);
    expect((await publicProjection()).card.price).toBe(5500);
    const successorAccepted = await staffPost(`/staff/${offerId}/revisions/2/accept`,
      successorSubmitted.body.version, fixture.staffToken);
    expect(successorAccepted.status).toBe(200);
    const afterSuccessor = await publicProjection();
    expect(afterSuccessor.card.price).toBe(6000);
    expect(afterSuccessor.card.fromOffer).toMatchObject({offerId, revision: 2});
    expect(afterSuccessor.detail.price).toBe(6000);

    const retired = await staffPost(`/staff/${offerId}/revisions/2/retire`,
      successorAccepted.body.version, fixture.staffToken);
    expect(retired.status).toBe(200);
    const afterRetire = await publicProjection();
    expect(afterRetire.card.price).toBe(6200);
    expect(afterRetire.card.rooms.find(room => room.id === '101')?.price).toBeNull();
    expect(afterRetire.card.rooms.find(room => room.id === '101')?.offerState).toBe('OFFER_RETIRED');
  }, 60_000);
});
