import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService} from '../../server/offers/acceptedOfferService.js';
import {addDays,createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';

describe('W1 Host SaveOfferDraft idempotency on isolated PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let service:AcceptedOfferService;
  beforeAll(async()=>{
    fixture=await createW1AcceptedOfferFixture();
    service=new AcceptedOfferService(fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL',fixture.staffPool);
  },90000);
  afterAll(async()=>{await fixture?.close();});

  const input=(commandId:string,fixture:Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>,
    amountMinor='550000')=>({commandId,listingId:1,roomTypeId:101,amountMinor,
    stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
    effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1});

  async function counts(offerId:string){
    const result=await fixture.owner.query<{offers:number;revisions:number;events:number;receipts:number}>(`
      SELECT (SELECT count(*)::int FROM sellable_offers WHERE id=$1) AS offers,
        (SELECT count(*)::int FROM sellable_offer_revisions WHERE offer_id=$1) AS revisions,
        (SELECT count(*)::int FROM sellable_offer_events WHERE offer_id=$1 AND event_type='DRAFT_CREATED') AS events,
        (SELECT count(*)::int FROM sellable_offer_draft_receipts WHERE offer_id=$1) AS receipts`,[offerId]);
    return result.rows[0];
  }

  it('replays the exact original draft response after submission and source changes',async()=>{
    const host=fixture.principal(10),draftInput=input(randomUUID(),fixture);
    const created=await service.createDraft(host,draftInput);
    expect(created).toMatchObject({status:'DRAFT',revision:1,version:1});
    await service.submit(host,{offerId:created.offerId,revision:1,expectedVersion:1});
    await fixture.owner.query("UPDATE listings SET publication_status='draft' WHERE id=1");
    try{
      expect(await service.createDraft(host,draftInput)).toEqual(created);
      expect(await counts(created.offerId)).toEqual({offers:1,revisions:1,events:1,receipts:1});
    }finally{
      await fixture.owner.query("UPDATE listings SET publication_status='published' WHERE id=1");
    }
  });

  it('serializes identical commands on separate PostgreSQL connections',async()=>{
    const host=fixture.principal(10),draftInput=input(randomUUID(),fixture,'570000');
    const makePool=()=>new pg.Pool({...fixture.hostPool.options,user:'w1_offer_host',max:1});
    const firstPool=makePool(),secondPool=makePool();
    try{
      const first=new AcceptedOfferService(firstPool,
        new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL',fixture.staffPool);
      const second=new AcceptedOfferService(secondPool,
        new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL',fixture.staffPool);
      const [a,b]=await Promise.all([first.createDraft(host,draftInput),second.createDraft(host,draftInput)]);
      expect(a).toEqual(b);
      expect(await counts(a.offerId)).toEqual({offers:1,revisions:1,events:1,receipts:1});
    }finally{await Promise.all([firstPool.end(),secondPool.end()]);}
  });

  it('reconciles a committed draft after its COMMIT acknowledgment is lost',async()=>{
    const host=fixture.principal(10),draftInput=input(randomUUID(),fixture,'575000');
    let commitRan=false;
    const lostAckPool={connect:async()=>{
      const client=await fixture.hostPool.connect();
      return new Proxy(client,{get(target,key){
        if(key==='query')return async(...args:unknown[])=>{
          const query=target.query.bind(target) as (...values:unknown[])=>Promise<unknown>;
          const result=await query(...args);
          if(args[0]==='COMMIT'){commitRan=true;throw new Error('Fixture lost the committed response.');}
          return result;
        };
        const value=Reflect.get(target,key);
        return typeof value==='function'?value.bind(target):value;
      }});
    }} as unknown as pg.Pool;
    const uncertain=new AcceptedOfferService(lostAckPool,
      new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL',fixture.staffPool);
    await expect(uncertain.createDraft(host,draftInput))
      .rejects.toMatchObject({code:'OFFER_OUTCOME_UNKNOWN',status:503});
    expect(commitRan).toBe(true);
    const replay=await service.createDraft(host,draftInput);
    expect(replay).toMatchObject({status:'DRAFT',revision:1,amountMinor:'575000'});
    expect(await counts(replay.offerId)).toEqual({offers:1,revisions:1,events:1,receipts:1});
  });

  it('rejects a reused command ID with changed payload and keeps receipts Host-scoped',async()=>{
    const host=fixture.principal(10),draftInput=input(randomUUID(),fixture,'580000');
    const created=await service.createDraft(host,draftInput);
    await expect(service.createDraft(host,{...draftInput,amountMinor:'590000'}))
      .rejects.toMatchObject({code:'OFFER_COMMAND_CONFLICT',status:409});
    // PostgreSQL keeps microseconds; JavaScript Date would silently collapse this
    // distinct effective instant to the same millisecond if used for hashing.
    await expect(service.createDraft(host,{...draftInput,
      effectiveFrom:draftInput.effectiveFrom.replace(/Z$/,'123Z')}))
      .rejects.toMatchObject({code:'OFFER_COMMAND_CONFLICT',status:409});
    await expect(service.createDraft(fixture.principal(11),draftInput))
      .rejects.toMatchObject({code:'OFFER_FORBIDDEN',status:403});
    const client=await fixture.hostPool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id','11',true)");
      expect((await client.query('SELECT * FROM sellable_offer_draft_receipts WHERE command_id=$1',
        [draftInput.commandId])).rows).toEqual([]);
      await client.query('COMMIT');
    }finally{client.release();}
    expect(await counts(created.offerId)).toEqual({offers:1,revisions:1,events:1,receipts:1});
  });

  it('requires a caller-stable command ID before any draft write',async()=>{
    const {commandId:_,...withoutCommand}=input(randomUUID(),fixture);
    await expect(service.createDraft(fixture.principal(10),withoutCommand))
      .rejects.toMatchObject({code:'INPUT_INVALID',status:400});
  });
});
