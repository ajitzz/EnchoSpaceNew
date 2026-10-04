import express from 'express';
import request from 'supertest';
import {randomBytes} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {createHostOfferRouter,createStaffOfferRouter} from '../server/offers/offerRouter.js';
import {createHttpExecutionContextMiddleware} from '../server/observability/httpExecutionContext.js';
import type {AcceptedOfferService} from '../server/offers/acceptedOfferService.js';
import type {StaffSessionReader} from '../lib/iam/staffSessions.js';
import {PermissionNotGrantedError} from '../lib/iam/authorizationPort.js';

const offerA='11111111-1111-4111-8111-111111111111';
const offerB='22222222-2222-4222-8222-222222222222';
const credential=`wfs_${randomBytes(32).toString('base64url')}`;
const origin='https://ops.encho.test';
const body=(roomTypeId:number)=>({commandId:roomTypeId===101
  ?'33333333-3333-4333-8333-333333333333':'44444444-4444-4444-8444-444444444444',
  roomTypeId,amountMinor:'550000',stayStart:'2099-01-01',stayEnd:'2099-01-05',
  effectiveFrom:'2098-12-01T00:00:00+05:30',effectiveUntil:'2099-01-04T00:00:00+05:30',maxGuests:2,minNights:1});

function mounted(service:Record<string,unknown>){
  const app=express();app.use(express.json(),createHttpExecutionContextMiddleware());
  const authenticate:express.RequestHandler=(req,res,next)=>{
    if(req.headers.authorization!=='Bearer host-10')return res.status(401).json({code:'ACCOUNT_REQUIRED'});
    (req as typeof req&{user:{id:number}}).user={id:10};next();
  };
  const reader={read:vi.fn(async(_token:string,work:(client:unknown,actor:unknown)=>Promise<unknown>)=>work({},
    {accountId:30,actorKind:'STAFF',organizationId:'00000000-0000-4000-8000-000000000001',
      membershipId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId:'route-test',operationId:'route-test'}))} as unknown as StaffSessionReader;
  app.use('/host',createHostOfferRouter(service as unknown as AcceptedOfferService,authenticate));
  app.use('/staff',createStaffOfferRouter(service as unknown as AcceptedOfferService,reader,origin));
  return{app,reader};
}

describe('W1 mounted offer command boundary',()=>{
  it('derives Host account from middleware and preserves two same-name canonical room IDs',async()=>{
    const createDraft=vi.fn(async(actor:unknown,input:{roomTypeId:number;effectiveFrom:string})=>({offerId:input.roomTypeId===101?offerA:offerB,
      revision:1,version:1,status:'DRAFT',roomTypeId:input.roomTypeId,actor}));
    const{app}=mounted({createDraft});
    const first=await request(app).post('/host/listings/7/drafts').set('Authorization','Bearer host-10').send(body(101));
    const second=await request(app).post('/host/listings/7/drafts').set('Authorization','Bearer host-10').send(body(102));
    expect(first.status).toBe(201);expect(second.status).toBe(201);
    expect(first.body.offerId).not.toBe(second.body.offerId);
    expect(createDraft.mock.calls.map(call=>call[1].roomTypeId)).toEqual([101,102]);
    expect(createDraft.mock.calls[0][1].effectiveFrom).toBe('2098-12-01T00:00:00+05:30');
    expect(createDraft.mock.calls.map(call=>(call[0] as {accountId:number}).accountId)).toEqual([10,10]);
    const spoofed=await request(app).post('/host/listings/7/drafts').set('Authorization','Bearer host-10')
      .send({...body(101),hostAccountId:20});
    expect(spoofed.status).toBe(422);expect(createDraft).toHaveBeenCalledTimes(2);
  });

  it('requires exact offer ID/revision/version and cannot submit through AI or a listing-wide path',async()=>{
    const submit=vi.fn(async(_actor:unknown,input:unknown)=>({status:'SUBMITTED',...input as object}));
    const{app}=mounted({submit});
    expect((await request(app).post(`/host/${offerA}/revisions/7/submit`).send({expectedVersion:1})).status).toBe(401);
    expect((await request(app).post('/host/listings/7/submit').set('Authorization','Bearer host-10').send({expectedVersion:1})).status).toBe(404);
    expect((await request(app).post(`/host/${offerA}/revisions/7/submit`).set('Authorization','Bearer host-10').send({expectedVersion:1,roomTypeId:102})).status).toBe(422);
    const response=await request(app).post(`/host/${offerA}/revisions/7/submit`).set('Authorization','Bearer host-10').send({expectedVersion:1});
    expect(response.status).toBe(200);expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][1]).toEqual({offerId:offerA,revision:7,expectedVersion:1});
  });

  it('requires isolated staff identity, fixed origin and a fresh exact acceptance fence',async()=>{
    const accept=vi.fn(async(_actor:unknown,input:{expectedVersion:number})=>{
      if(input.expectedVersion===7)throw{code:'OFFER_STALE_REVIEW',status:409};
      return{status:'ACCEPTED'};
    });
    const{app,reader}=mounted({accept});
    const path=`/staff/${offerA}/revisions/7/accept`;
    expect((await request(app).post(path).set('Authorization','Bearer consumer.jwt').send({expectedVersion:7})).status).toBe(401);
    const noOrigin=await request(app).post(path).set('Authorization',`Bearer ${credential}`).send({expectedVersion:7});
    expect(noOrigin.status).toBe(403);expect(accept).not.toHaveBeenCalled();
    const stale=await request(app).post(path).set('Cookie',`__Host-encho_workforce=${credential}`)
      .set('Origin',origin).set('X-Encho-Workforce-Command','1').send({expectedVersion:7});
    expect(stale.status).toBe(409);expect(stale.body.code).toBe('OFFER_STALE_REVIEW');
    expect(vi.mocked(reader.read)).toHaveBeenCalled();
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('denies an ungranted staff actor and targets retirement at the accepted revision',async()=>{
    const denied=new PermissionNotGrantedError({effect:'DENY',allowed:false,reason:'RESOURCE_OUT_OF_SCOPE',
      evaluatedAt:new Date().toISOString()});
    const accept=vi.fn(async()=>{throw denied;});
    const retire=vi.fn(async(_actor:unknown,input:unknown)=>({status:'RETIRED',...input as object}));
    const listCurrentAcceptedForStaff=vi.fn(async()=>[{offerId:offerB,revision:2,status:'ACCEPTED'}]);
    const{app}=mounted({accept,retire,listCurrentAcceptedForStaff});
    const headers={'Origin':origin,'X-Encho-Workforce-Command':'1'};
    const deniedResponse=await request(app).post(`/staff/${offerA}/revisions/1/accept`).set('Authorization',`Bearer ${credential}`)
      .set(headers).send({expectedVersion:3});
    expect(deniedResponse.status).toBe(403);expect(deniedResponse.body.code).toBe('PERMISSION_DENIED');
    const accepted=await request(app).get('/staff/listings/7/accepted').set('Authorization',`Bearer ${credential}`);
    expect(accepted.status).toBe(200);expect(accepted.body[0]).toMatchObject({offerId:offerB,revision:2});
    const retired=await request(app).post(`/staff/${offerB}/revisions/2/retire`).set('Authorization',`Bearer ${credential}`)
      .set(headers).send({expectedVersion:4});
    expect(retired.status).toBe(200);expect(retire.mock.calls[0][1]).toEqual({offerId:offerB,revision:2,expectedVersion:4});
  });
});
