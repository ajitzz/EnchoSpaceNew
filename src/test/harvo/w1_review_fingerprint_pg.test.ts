import {createHash,randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService,readPublicOfferAuthority} from '../../server/offers/acceptedOfferService.js';
import {addDays,createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';

type Fixture=Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('versioned commercial offer-review fingerprint on disposable PostgreSQL',()=>{
  let fixture:Fixture;
  let service:AcceptedOfferService;
  beforeEach(async()=>{
    fixture=await createW1AcceptedOfferFixture();
    service=new AcceptedOfferService(fixture.hostPool,new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),
      'LOCAL',fixture.staffPool);
  },90000);
  afterEach(async()=>{await fixture?.close();});
  const input=(roomTypeId:number,amountMinor='550000')=>({
    commandId:randomUUID(),listingId:roomTypeId===201?2:1,roomTypeId,amountMinor,
    stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
    effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1,
  });
  const submit=async(roomTypeId:number,amountMinor='550000')=>{
    const host=fixture.principal(roomTypeId===201?11:10);
    const draft=await service.createDraft(host,input(roomTypeId,amountMinor));
    await service.submit(host,{offerId:draft.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(draft.offerId);
    return draft;
  };
  const occupancy=async(roomTypeId:number,column:'held_units'|'booked_units',units:number)=>{
    await fixture.owner.query(`UPDATE inventory_days SET ${column}=$1 WHERE room_type_id=$2
      AND calendar_date >= $3::date AND calendar_date < $4::date`,
      [units,roomTypeId,fixture.today,addDays(fixture.today,30)]);
  };
  const reviewHash=async(listingId:number,roomTypeId:number)=>(await fixture.owner.query(
    `SELECT sellable_offer_review_fingerprint_v2($1,$2,$3::date,$4::date) AS hash`,
    [listingId,roomTypeId,fixture.today,addDays(fixture.today,30)])).rows[0].hash as string;
  const attemptRawAccept=async(offerId:string)=>{
    const staff=fixture.principal(90,'STAFF');
    const raw=await fixture.staffPool.connect();
    try{
      await raw.query('BEGIN');
      await raw.query(`SELECT set_config('app.current_user_id','90',true),
        set_config('app.organization_id',$1,true),set_config('app.membership_id',$2,true),
        set_config('app.staff_session_id',$3,true),set_config('app.workforce_environment','LOCAL',true)`,
        [staff.organizationId,staff.membershipId,staff.sessionId]);
      await raw.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
        actor_membership_id,offer_version,source_hash,evidence)
        SELECT offer_id,revision,'ACCEPTED',90,$2::uuid,3,source_hash,'{}'::jsonb
        FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1`,[offerId,staff.membershipId]);
      await expect(raw.query(`UPDATE sellable_offers SET current_accepted_revision=1,
        public_disposition='ACCEPTED',version=3 WHERE id=$1`,[offerId]))
        .rejects.toThrow(/SELLABLE_OFFER_SUBMISSION_INVENTORY_CHANGED/);
    }finally{await raw.query('ROLLBACK');raw.release();}
  };

  it('keeps two-unit holds, last-unit holds, release and booked occupancy out of commercial review',async()=>{
    await fixture.owner.query('UPDATE room_types SET inventory_count=2 WHERE id=101');
    await fixture.owner.query(`UPDATE inventory_days SET total_units=2 WHERE room_type_id=101
      AND calendar_date >= $1::date AND calendar_date < $2::date`,
      [fixture.today,addDays(fixture.today,30)]);
    const twoUnits=await submit(101);
    const twoUnitHash=await reviewHash(1,101);
    await occupancy(101,'held_units',1);
    expect(await reviewHash(1,101)).toBe(twoUnitHash);
    expect((await service.accept(fixture.principal(90,'STAFF'),
      {offerId:twoUnits.offerId,revision:1,expectedVersion:2})).status).toBe('ACCEPTED');
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).eligibleOffers)
      .toContainEqual(expect.objectContaining({roomTypeId:101,offerId:twoUnits.offerId}));
    await occupancy(101,'held_units',0);
    expect(await reviewHash(1,101)).toBe(twoUnitHash);

    const lastUnit=await submit(102,'620000');
    const lastUnitHash=await reviewHash(1,102);
    await occupancy(102,'held_units',1);
    expect(await reviewHash(1,102)).toBe(lastUnitHash);
    expect((await service.accept(fixture.principal(90,'STAFF'),
      {offerId:lastUnit.offerId,revision:1,expectedVersion:2})).status).toBe('ACCEPTED');
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).states)
      .toContainEqual(expect.objectContaining({roomTypeId:102,state:'ROOM_UNAVAILABLE'}));
    await occupancy(102,'held_units',0);
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).eligibleOffers)
      .toContainEqual(expect.objectContaining({roomTypeId:102,offerId:lastUnit.offerId}));

    const booked=await submit(201,'700000');
    const bookedHash=await reviewHash(2,201);
    await occupancy(201,'booked_units',1);
    expect(await reviewHash(2,201)).toBe(bookedHash);
    expect((await service.accept(fixture.principal(90,'STAFF'),
      {offerId:booked.offerId,revision:1,expectedVersion:2})).status).toBe('ACCEPTED');
    expect((await readPublicOfferAuthority(fixture.publicPool,[2],new Date())).states)
      .toContainEqual(expect.objectContaining({roomTypeId:201,state:'ROOM_UNAVAILABLE'}));
  });

  it('stales material capacity, source/media and minimum-stay changes; mapped calendar blocks are operational',async()=>{
    const staff=fixture.principal(90,'STAFF');
    const capacity=await submit(101);
    await fixture.owner.query(`UPDATE inventory_days SET total_units=2 WHERE room_type_id=101
      AND calendar_date=$1::date`,[fixture.today]);
    await attemptRawAccept(capacity.offerId);
    await expect(service.accept(staff,{offerId:capacity.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW'});
    await fixture.owner.query(`UPDATE inventory_days SET total_units=1 WHERE room_type_id=101
      AND calendar_date=$1::date`,[fixture.today]);
    await fixture.owner.query(`UPDATE room_types SET inventory_count=2 WHERE id=101`);
    await expect(service.accept(staff,{offerId:capacity.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW'});
    await fixture.owner.query(`UPDATE room_types SET inventory_count=1 WHERE id=101`);
    await fixture.owner.query(`UPDATE room_types SET min_stay_nights=2 WHERE id=101`);
    await expect(service.accept(staff,{offerId:capacity.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW'});
    await fixture.owner.query(`UPDATE room_types SET min_stay_nights=1 WHERE id=101`);
    await expect(fixture.owner.query(`UPDATE sellable_offer_revisions SET amount_minor=100000
      WHERE offer_id=$1 AND revision=1`,[capacity.offerId]))
      .rejects.toThrow(/SELLABLE_OFFER_EVIDENCE_IMMUTABLE/);
    await fixture.owner.query(`UPDATE media_assets SET url='https://images.example.test/changed.jpg'
      WHERE room_type_id=101 AND url=$1`,[fixture.mediaUrl(101,1)]);
    await expect(service.accept(staff,{offerId:capacity.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW'});
    await fixture.owner.query(`UPDATE media_assets SET url=$1 WHERE room_type_id=101
      AND url='https://images.example.test/changed.jpg'`,[fixture.mediaUrl(101,1)]);
    await fixture.owner.query(`INSERT INTO room_calendar_blocks(listing_id,room_type_id,room_tier_key,
      room_name,mapping_status,start_date,end_date) VALUES(1,101,'suite','Royal Suite','mapped',
      $1::date,$1::date)`,[fixture.today]);
    const evidence=(await fixture.owner.query(`SELECT evidence FROM sellable_offer_events
      WHERE offer_id=$1 AND event_type='SUBMITTED'`,[capacity.offerId])).rows[0].evidence;
    expect(evidence.commercialSqlHash).toBe(await reviewHash(1,101));
    expect((await service.accept(staff,{offerId:capacity.offerId,revision:1,expectedVersion:2})).status)
      .toBe('ACCEPTED');
  });

  it('database stamps V2 even when a raw Host submission requests V1 and a forged hash',async()=>{
    const draft=await service.createDraft(fixture.principal(10),input(101));
    const raw=await fixture.hostPool.connect();
    try{
      await raw.query('BEGIN');
      await raw.query(`SELECT set_config('app.current_user_id','10',true),
        set_config('app.bypass_rls','false',true)`);
      await raw.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
        offer_version,source_hash,evidence) VALUES($1,1,'SUBMITTED',10,2,$2,$3::jsonb)`,
        [draft.offerId,draft.sourceHash,JSON.stringify({reviewFingerprintVersion:1,
          inventoryHash:'forged',inventorySqlHash:'forged',commercialSqlHash:'forged'})]);
      await raw.query('UPDATE sellable_offers SET version=2 WHERE id=$1',[draft.offerId]);
      await raw.query('COMMIT');
    }catch(error){await raw.query('ROLLBACK');throw error;}finally{raw.release();}
    const evidence=(await fixture.owner.query(`SELECT evidence FROM sellable_offer_events
      WHERE offer_id=$1 AND event_type='SUBMITTED'`,[draft.offerId])).rows[0].evidence;
    expect(evidence).toEqual({reviewFingerprintVersion:2,commercialSqlHash:await reviewHash(1,101)});
  });

  it('preserves a pre-051 V1 submission byte-for-byte and requires resubmission after occupancy drift',async()=>{
    await fixture.close();
    fixture=await createW1AcceptedOfferFixture({reviewFingerprintV2:false});
    service=new AcceptedOfferService(fixture.hostPool,new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),
      'LOCAL',fixture.staffPool);
    const host=fixture.principal(10),staff=fixture.principal(90,'STAFF');
    const draft=await service.createDraft(host,input(101));
    const raw=await fixture.hostPool.connect();
    try{
      await raw.query('BEGIN');
      await raw.query(`SELECT set_config('app.current_user_id','10',true),
        set_config('app.bypass_rls','false',true)`);
      const nights=(await raw.query(`SELECT calendar_date::text AS date,listing_id,total_units,held_units,
        booked_units,blocked_units FROM inventory_days WHERE room_type_id=101
        AND calendar_date >= $1::date AND calendar_date < $2::date ORDER BY calendar_date LIMIT 10000`,
        [fixture.today,addDays(fixture.today,30)])).rows;
      const blocks=(await raw.query(`SELECT room_type_id,room_tier_key,mapping_status,
        start_date::text,end_date::text FROM room_calendar_blocks WHERE listing_id=1
        AND start_date < $2::date AND end_date >= $1::date AND (room_type_id IS NULL OR room_type_id=101)
        ORDER BY start_date,id`,[fixture.today,addDays(fixture.today,30)])).rows;
      await raw.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
        offer_version,source_hash,evidence) VALUES($1,1,'SUBMITTED',10,2,$2,$3::jsonb)`,
        [draft.offerId,draft.sourceHash,JSON.stringify({inventoryHash:digest({nights,blocks})})]);
      await raw.query(`UPDATE sellable_offers SET version=version+1 WHERE id=$1`,[draft.offerId]);
      await raw.query('COMMIT');
    }catch(error){await raw.query('ROLLBACK');throw error;}finally{raw.release();}
    const before=(await fixture.owner.query(`SELECT evidence FROM sellable_offer_events
      WHERE offer_id=$1 AND event_type='SUBMITTED'`,[draft.offerId])).rows[0].evidence;
    expect(before.reviewFingerprintVersion).toBeUndefined();
    expect(before.inventoryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(before.inventorySqlHash).toMatch(/^[a-f0-9]{64}$/);
    await fixture.applyReviewMigration();
    const after=(await fixture.owner.query(`SELECT evidence FROM sellable_offer_events
      WHERE offer_id=$1 AND event_type='SUBMITTED'`,[draft.offerId])).rows[0].evidence;
    expect(after).toEqual(before);
    await fixture.grantOffer(draft.offerId);
    await occupancy(101,'held_units',1);
    await expect(service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW'});
    await occupancy(101,'held_units',0);
    expect((await service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2})).status)
      .toBe('ACCEPTED');
    expect((await fixture.owner.query(`SELECT evidence FROM sellable_offer_events
      WHERE offer_id=$1 AND event_type='SUBMITTED'`,[draft.offerId])).rows[0].evidence).toEqual(before);
  });
});
