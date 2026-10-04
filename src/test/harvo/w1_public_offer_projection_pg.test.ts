import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService,readPublicOfferAuthority} from '../../server/offers/acceptedOfferService.js';
import {resolvePublicStayAuthorities,resolvePublicStayAuthority,PublicStayAuthorityError} from '../../server/guest/publicStayAuthority.js';
import {toPublicListingCardProjection,toPublicStayProjection} from '../../lib/stayProjection.js';
import {addDays,createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';
import {createLocalPostgresFixture} from './postgres.js';

const sleep=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));

describe('W1 accepted offer public projection on disposable PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let service:AcceptedOfferService;
  beforeAll(async()=>{
    fixture=await createW1AcceptedOfferFixture();
    service=new AcceptedOfferService(fixture.hostPool,new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'));
  },90000);
  afterAll(async()=>{await fixture?.close();});

  const input=(roomTypeId:number,amountMinor:string,effectiveFrom?:string,effectiveUntil?:string)=>({
    listingId:roomTypeId===201?2:1,roomTypeId,amountMinor,
    stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
    effectiveFrom:effectiveFrom||new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:effectiveUntil||new Date(Date.now()+30*86400000).toISOString(),
    maxGuests:2,minNights:1,
  });
  const accept=async(roomTypeId:number,amountMinor:string,effectiveFrom?:string,effectiveUntil?:string)=>{
    const host=fixture.principal(roomTypeId===201?11:10),staff=fixture.principal(90,'STAFF');
    const draft=await service.createDraft(host,input(roomTypeId,amountMinor,effectiveFrom,effectiveUntil));
    await service.submit(host,{offerId:draft.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(draft.offerId);
    const accepted=await service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2});
    expect(accepted.status).toBe('ACCEPTED');
    return accepted;
  };
  const listing=async(id:number)=>(await fixture.owner.query('SELECT * FROM listings WHERE id=$1',[id])).rows[0];

  it('preserves W0 null price before acceptance, then projects only current accepted room-night revisions',async()=>{
    const before=toPublicListingCardProjection(await resolvePublicStayAuthority(
      fixture.owner,await listing(1),fixture.publicPool));
    expect(before).toMatchObject({price:null,priceState:'VERIFIED_OFFER_UNAVAILABLE',
      offerState:'NO_ACCEPTED_OFFER',fromOffer:null});
    expect(before.rooms.map(room=>[room.id,room.name,room.price])).toEqual([
      ['101','Royal Suite',null],['102','Royal Suite',null]]);

    // Accept a short-lived ₹900 revision, then let it expire before the current
    // offer for the same room starts. Distinct temporal scopes are explicit.
    const expiry=Date.now()+9000;
    const expired=await accept(101,'90000',undefined,new Date(expiry).toISOString());
    const retired=await accept(102,'80000');
    await service.retire(fixture.principal(90,'STAFF'),
      {offerId:retired.offerId,revision:1,expectedVersion:3});
    const foreign=await accept(201,'70000');
    const draft=await service.createDraft(fixture.principal(10),input(101,'100000'));
    expect(draft.status).toBe('DRAFT');
    if(Date.now()<=expiry)await sleep(expiry-Date.now()+20);
    const acceptedA=await accept(101,'550000',new Date(expiry).toISOString());
    const acceptedB=await accept(102,'620000');

    const resolved=await resolvePublicStayAuthorities(fixture.owner,[await listing(1),await listing(2)],fixture.publicPool);
    const card=toPublicListingCardProjection(resolved[0]);
    const detail=toPublicStayProjection(resolved[0]);
    const foreignCard=toPublicListingCardProjection(resolved[1]);
    for(const surface of [card,detail]){
      expect(surface).toMatchObject({price:5500,currency:'INR',priceState:'VERIFIED_OFFER_AVAILABLE',
        offerState:'VERIFIED_OFFER_AVAILABLE',fromOffer:{offerId:acceptedA.offerId,revision:1,
          roomTypeId:'101',amountMinor:'550000',priceBasis:'PER_ROOM_NIGHT'}});
      expect(surface.rooms.map(room=>[room.id,room.name,room.price,room.offer?.offerId])).toEqual([
        ['101','Royal Suite',5500,acceptedA.offerId],
        ['102','Royal Suite',6200,acceptedB.offerId]]);
      expect(surface.photos.filter(photo=>photo.room_type_id!==null)
        .map(photo=>[photo.room_type_id,photo.url])).toEqual([
          ...[1,2,3].map(n=>['101',fixture.mediaUrl(101,n)]),
          ...[1,2,3].map(n=>['102',fixture.mediaUrl(102,n)]),
        ]);
      expect(JSON.stringify(surface)).not.toContain('1000');
      expect(JSON.stringify(surface)).not.toContain('90000');
      expect(JSON.stringify(surface)).not.toContain('80000');
    }
    expect(card.fromOffer?.availableStartDate).toBe(fixture.today);
    expect(foreignCard).toMatchObject({price:700,fromOffer:{offerId:foreign.offerId,roomTypeId:'201'}});
    expect(card.price).not.toBe(foreignCard.price);
    const authority=await readPublicOfferAuthority(fixture.publicPool,[1,2],new Date());
    expect(authority.states).toContainEqual(expect.objectContaining({offerId:draft.offerId,state:'NO_ACCEPTED_OFFER'}));
    expect(authority.states).toContainEqual(expect.objectContaining({offerId:expired.offerId,state:'OFFER_EXPIRED'}));
    expect(authority.states).toContainEqual(expect.objectContaining({offerId:retired.offerId,state:'OFFER_RETIRED'}));
    expect(authority.eligibleOffers.map(offer=>offer.offerId).sort()).toEqual(
      [acceptedA.offerId,acceptedB.offerId,foreign.offerId].sort());
    await expect(resolvePublicStayAuthority(fixture.owner,await listing(1)))
      .rejects.toBeInstanceOf(PublicStayAuthorityError);
    await expect(resolvePublicStayAuthority(fixture.owner,await listing(1),fixture.owner))
      .rejects.toBeInstanceOf(PublicStayAuthorityError);
    await expect(resolvePublicStayAuthority(fixture.owner,{...await listing(1),slug:'stale-slug'},fixture.publicPool))
      .rejects.toBeInstanceOf(PublicStayAuthorityError);

    await service.retire(fixture.principal(90,'STAFF'),
      {offerId:acceptedA.offerId,revision:1,expectedVersion:3});
    await service.retire(fixture.principal(90,'STAFF'),
      {offerId:acceptedB.offerId,revision:1,expectedVersion:3});
    const after=toPublicStayProjection(await resolvePublicStayAuthority(
      fixture.owner,await listing(1),fixture.publicPool));
    expect(after).toMatchObject({price:null,priceState:'VERIFIED_OFFER_UNAVAILABLE',fromOffer:null});
    expect(after.rooms.every(room=>room.price===null&&room.offer===null)).toBe(true);
    expect(after.offerState).toBe('OFFER_EXPIRED');

    await fixture.owner.query("UPDATE listings SET publication_status='draft' WHERE id=1");
    await expect(resolvePublicStayAuthority(fixture.owner,await listing(1),fixture.publicPool))
      .rejects.toBeInstanceOf(PublicStayAuthorityError);
  },90000);

  it('retains W0 null-price compatibility only before migration 049 and fails closed on schema drift',async()=>{
    const legacy=await createLocalPostgresFixture({schema:'empty'});
    try{
      await legacy.pool.query(`
        CREATE TABLE room_types(id INT PRIMARY KEY,listing_id INT NOT NULL,name TEXT NOT NULL,
          type TEXT,icon TEXT,tag TEXT,currency TEXT NOT NULL,base_price NUMERIC NOT NULL,
          max_occupancy INT NOT NULL,features JSONB,amenities JSONB,description TEXT,specs TEXT);
        CREATE TABLE media_assets(id INT PRIMARY KEY,entity_id INT NOT NULL,entity_type TEXT NOT NULL,
          room_type_id INT,url TEXT NOT NULL,tier TEXT,category TEXT,title TEXT,description TEXT,
          is_hero BOOLEAN,is_sleeping_area BOOLEAN,moderation_status TEXT,order_index INT DEFAULT 0);
        INSERT INTO room_types VALUES (101,1,'Royal Suite','suite',NULL,NULL,'INR',999,2,'[]','[]',NULL,NULL);
      `);
      const property={id:1,title:'Legacy fixture',slug:'legacy-fixture',currency:'INR',
        publication_status:'published',price:999,rooms:[]};
      const before=toPublicListingCardProjection(await resolvePublicStayAuthority(legacy.pool,property));
      expect(before).toMatchObject({price:null,priceState:'VERIFIED_OFFER_UNAVAILABLE',fromOffer:null});
      await legacy.pool.query(`CREATE TABLE schema_migrations(version VARCHAR(255) PRIMARY KEY);
        INSERT INTO schema_migrations(version) VALUES('049_accepted_sellable_offers.sql')`);
      await expect(resolvePublicStayAuthority(legacy.pool,property))
        .rejects.toBeInstanceOf(PublicStayAuthorityError);
    }finally{await legacy.close();}
  },30000);
});
