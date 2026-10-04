import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {AcceptedOfferService} from '../../server/offers/acceptedOfferService.js';
import {assertReservationWorkerRole,finalizeDirectHold} from '../../services/canonicalReservationService.js';
import {acquireHold,releaseHold} from '../../services/inventoryHoldService.js';
import {createItineraryQuote} from '../../services/itineraryQuoteService.js';
import {addDays,createW1AcceptedOfferFixture} from './helpers/w1AcceptedOfferFixture.js';
import {applyIsolatedMigration} from './helpers/isolatedMigration.js';

describe('W3-A internal canonical reservation finalization on disposable PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let stays:pg.Pool,worker:pg.Pool,offerId:string;
  let nextOffset=1;
  beforeAll(async()=>{
    fixture=await createW1AcceptedOfferFixture({serverCompatible:true});
    await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
      status TEXT NOT NULL,start_date DATE,end_date DATE)`);
    await applyIsolatedMigration(fixture.owner,'041_stays_canonical_commerce.sql');
    await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner,'050_accepted_offer_itinerary_quotes.sql');
    await fixture.owner.query(`CREATE ROLE encho_reservation_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner,'052_canonical_reservation_hold_finalization.sql');
    stays=new pg.Pool({...fixture.owner.options,user:'encho_stays_web'});
    worker=new pg.Pool({...fixture.owner.options,user:'encho_reservation_worker',max:8});
    await assertReservationWorkerRole(worker);
    const service=new AcceptedOfferService(fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
    const draft=await service.createDraft(fixture.principal(10),{
      commandId:randomUUID(),listingId:1,roomTypeId:101,amountMinor:'550000',
      stayStart:fixture.today,stayEnd:addDays(fixture.today,70),
      effectiveFrom:new Date(Date.now()-3600000).toISOString(),
      effectiveUntil:new Date(Date.now()+70*86400000).toISOString(),maxGuests:2,minNights:1,
    });
    const submitted=await service.submit(fixture.principal(10),{
      offerId:draft.offerId,revision:1,expectedVersion:draft.version});
    await fixture.grantOffer(draft.offerId);
    await service.accept(fixture.principal(90,'STAFF'),{
      offerId:draft.offerId,revision:1,expectedVersion:submitted.version});
    offerId=draft.offerId;
  },90000);
  afterAll(async()=>{await Promise.all([stays?.end(),worker?.end()]);await fixture?.close();});

  const held=async()=>{
    const start=nextOffset;nextOffset+=4;
    const checkIn=addDays(fixture.today,start),checkOut=addDays(fixture.today,start+3);
    const quote=await createItineraryQuote(stays,{offerId,revision:1,checkIn,checkOut,
      guestCount:2,requestId:randomUUID()},'user:10');
    const result=await acquireHold(stays,{roomTypeId:101,checkIn,checkOut,quantity:1,
      idempotencyKey:randomUUID(),quoteId:quote.id,holderPrincipal:'user:10',userId:10});
    expect(result.success).toBe(true);
    return {holdId:result.hold!.id,quoteId:quote.id,checkIn,checkOut,
      commandId:randomUUID()};
  };
  const state=async(holdId:string)=>{
    const row=(await fixture.owner.query(`SELECT h.status,
      (SELECT count(*)::int FROM canonical_reservations WHERE hold_id=h.id) AS reservations,
      (SELECT coalesce(sum(d.held_units),0)::int FROM booking_hold_nights n
        JOIN inventory_days d ON d.id=n.inventory_day_id WHERE n.hold_id=h.id) AS held,
      (SELECT coalesce(sum(d.booked_units),0)::int FROM booking_hold_nights n
        JOIN inventory_days d ON d.id=n.inventory_day_id WHERE n.hold_id=h.id) AS booked
      FROM booking_holds h WHERE h.id=$1`,[holdId])).rows[0];
    return row;
  };
  const request=(item:{holdId:string;quoteId:string;commandId:string})=>({
    holdId:item.holdId,quoteId:item.quoteId,commandId:item.commandId});
  const finalize=(item:{holdId:string;quoteId:string;commandId:string},principal='user:10')=>
    finalizeDirectHold(worker,principal,request(item));
  const fails=async(input:unknown,principal='user:10',code?:string)=>{
    await expect(finalizeDirectHold(worker,principal,input&&typeof input==='object'?request(input as ReturnType<typeof request>):input)).rejects.toMatchObject(
      code?{code}:{name:'ReservationAuthorityError'});
  };

  it('allows only the internal function, converts all nights, freezes commercial truth and replays',async()=>{
    const item=await held();
    expect(await finalize(item)).toMatchObject({
      replayed:false,status:'INVENTORY_COMMITTED'});
    const first=await finalize(item);
    expect(first.replayed).toBe(true);
    expect(await state(item.holdId)).toMatchObject({status:'CONSUMED',reservations:1,held:0,booked:3});
    const row=(await fixture.owner.query(`SELECT * FROM canonical_reservations WHERE hold_id=$1`,[item.holdId])).rows[0];
    expect(first.reservationId).toBe(row.id);
    expect(row).toMatchObject({origin_kind:'ENCHO_DIRECT',offer_id:offerId,offer_revision:1,
      quote_id:item.quoteId,room_type_id:101,listing_id:1,guest_count:2,
      room_subtotal_paise:'1650000',currency:'INR',status:'INVENTORY_COMMITTED'});
    expect((await fixture.owner.query(`SELECT count(*)::int AS n FROM canonical_reservation_nights
      WHERE reservation_id=$1`,[row.id])).rows[0].n).toBe(3);
    await fixture.owner.query('UPDATE listings SET price=1 WHERE id=1');
    await fixture.owner.query('UPDATE room_types SET base_price=1 WHERE id=101');
    expect((await fixture.owner.query(`SELECT room_subtotal_paise FROM canonical_reservations WHERE id=$1`,
      [row.id])).rows[0].room_subtotal_paise).toBe('1650000');
    await expect(fixture.owner.query(`UPDATE canonical_reservations SET room_subtotal_paise=1 WHERE id=$1`,
      [row.id])).rejects.toThrow(/CANONICAL_RESERVATION_IMMUTABLE/);
    await expect(worker.query(`INSERT INTO canonical_reservations(id,origin_kind,listing_id,room_type_id,
      check_in_date,check_out_date,nights,guest_count,room_subtotal_paise,currency,status,command_id,
      command_fingerprint) VALUES($1,'EXTERNAL_CHANNEL',1,101,$2::date,$3::date,3,2,0,'INR',
      'INVENTORY_COMMITTED',$4,$5)`,[randomUUID(),item.checkIn,item.checkOut,randomUUID(),'a'.repeat(64)]))
      .rejects.toThrow(/permission denied|row-level security/);
    expect((await fixture.owner.query(`SELECT has_table_privilege('encho_stays_web',
      'canonical_reservations','INSERT') AS can_write`)).rows[0].can_write).toBe(false);
  });

  it('serializes same-command contenders into one durable reservation and one inventory conversion',async()=>{
    const item=await held();
    const results=await Promise.all([finalize(item),finalize(item)]);
    expect(results[0].reservationId).toBe(results[1].reservationId);
    expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
    expect(await state(item.holdId)).toMatchObject({reservations:1,held:0,booked:3});
    await fails({...item,commandId:randomUUID()},'user:10','RESERVATION_HOLD_NOT_ACTIVE');
  });

  it('serializes different commands against one hold: one succeeds, one conflicts',async()=>{
    const item=await held();
    const settled=await Promise.allSettled([finalize(item),finalize({...item,commandId:randomUUID()})]);
    expect(settled.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(settled.filter(result=>result.status==='rejected')).toHaveLength(1);
    expect(await state(item.holdId)).toMatchObject({reservations:1,held:0,booked:3});
  });

  it('fails closed on foreign, missing, expired, released and mismatched authority',async()=>{
    const item=await held();
    await fails({...item,holdId:randomUUID()},'user:10','RESERVATION_HOLD_NOT_FOUND');
    await fails(item,'user:11','RESERVATION_FORBIDDEN');
    await fails({...item,quoteId:randomUUID()},'user:10','RESERVATION_QUOTE_MISMATCH');
    expect(await state(item.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:3,booked:0});
    const other=await held();
    await fixture.owner.query(`UPDATE booking_holds SET expires_at=clock_timestamp()-interval '1 second'
      WHERE id=$1`,[other.holdId]);
    await fails(other,'user:10','RESERVATION_HOLD_EXPIRED');
    const released=await held();
    expect((await releaseHold(stays,{holdId:released.holdId,holderPrincipal:'user:10',isServerAdmin:false})).success).toBe(true);
    await fails(released,'user:10','RESERVATION_HOLD_NOT_ACTIVE');
  });

  it('uses expiry at lock acquisition, not the start of a blocked finalizer statement',async()=>{
    const item=await held();
    await fixture.owner.query(`UPDATE booking_holds SET expires_at=clock_timestamp()+interval '700 milliseconds'
      WHERE id=$1`,[item.holdId]);
    const locker=await fixture.owner.connect();
    try{
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM booking_holds WHERE id=$1 FOR UPDATE',[item.holdId]);
      const pending=finalize(item).then(result=>({result,error:null}),error=>({result:null,error}));
      let waiting=false;
      for(let attempt=0;attempt<100;attempt++){
        const result=await fixture.owner.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE usename='encho_reservation_worker' AND wait_event_type='Lock'
          AND query LIKE 'SELECT * FROM canonical_finalize_direct_hold%'`);
        if(result.rows[0].n>0){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true);
      let expired=false;
      for(let attempt=0;attempt<100;attempt++){
        const result=await fixture.owner.query(`SELECT clock_timestamp()>expires_at AS expired
          FROM booking_holds WHERE id=$1`,[item.holdId]);
        if(result.rows[0].expired){expired=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(expired).toBe(true);
      await locker.query('COMMIT');
      expect((await pending).error).toMatchObject({code:'RESERVATION_HOLD_EXPIRED'});
      expect(await state(item.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:3,booked:0});
    }finally{
      try{await locker.query('ROLLBACK');}finally{locker.release();}
    }
  });

  it('rejects duplicate command with a different semantic hold and incomplete inventory nights',async()=>{
    const first=await held(),second=await held();
    await finalize(first);
    await fails({...second,commandId:first.commandId},'user:10','RESERVATION_COMMAND_CONFLICT');
    await fixture.owner.query(`DELETE FROM booking_hold_nights WHERE hold_id=$1 AND stay_date=$2::date`,
      [second.holdId,second.checkIn]);
    await fails(second,'user:10','RESERVATION_NIGHTS_INCOMPLETE');
    expect(await state(second.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:2,booked:0});
  });

  it('rejects corrupted night capacity and forged commercial input',async()=>{
    const item=await held();
    await fixture.owner.query(`UPDATE inventory_days SET held_units=0 WHERE id=(SELECT inventory_day_id
      FROM booking_hold_nights WHERE hold_id=$1 ORDER BY stay_date LIMIT 1)`,[item.holdId]);
    await fails(item,'user:10','RESERVATION_NIGHT_AUTHORITY_INVALID');
    expect(await state(item.holdId)).toMatchObject({status:'ACTIVE',reservations:0,booked:0});
    await expect(finalizeDirectHold(worker,'user:10',{...request(item),roomSubtotalMinor:'1'}))
      .rejects.toMatchObject({code:'RESERVATION_INPUT_INVALID'});
  });

  it('rejects adversarial quote offer, room, property and date drift',async()=>{
    const item=await held();
    const service=new AcceptedOfferService(fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
    const other=await service.createDraft(fixture.principal(10),{
      commandId:randomUUID(),listingId:1,roomTypeId:102,amountMinor:'610000',
      stayStart:fixture.today,stayEnd:addDays(fixture.today,70),
      effectiveFrom:new Date(Date.now()-3600000).toISOString(),
      effectiveUntil:new Date(Date.now()+70*86400000).toISOString(),maxGuests:2,minNights:1,
    });
    await fixture.owner.query('ALTER TABLE stays_quotes DISABLE TRIGGER stays_quote_accepted_immutable');
    try{
      const changes:[string,unknown][]=[
        ['offer_id',other.offerId],['room_type_id',102],['listing_id',2],
        ['check_in_date',addDays(item.checkIn,1)],['guest_count',3],
      ];
      for(const [column,value] of changes){
        const original=(await fixture.owner.query(`SELECT ${column} AS value FROM stays_quotes WHERE id=$1`,
          [item.quoteId])).rows[0].value;
        await fixture.owner.query(`UPDATE stays_quotes SET ${column}=$2 WHERE id=$1`,[item.quoteId,value]);
        await fails(item,'user:10','RESERVATION_AUTHORITY_MISMATCH');
        await fixture.owner.query(`UPDATE stays_quotes SET ${column}=$2 WHERE id=$1`,[item.quoteId,original]);
      }
    }finally{
      await fixture.owner.query('ALTER TABLE stays_quotes ENABLE TRIGGER stays_quote_accepted_immutable');
    }
    expect(await state(item.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:3,booked:0});
  });

  it('denies web role finalization and rejects a broadened internal role',async()=>{
    const item=await held();
    await expect(stays.query('SELECT * FROM canonical_finalize_direct_hold($1,$2,$3)',
      [item.holdId,item.quoteId,item.commandId])).rejects.toThrow(/permission denied/);
    await fixture.owner.query('GRANT SELECT ON canonical_reservations TO encho_reservation_worker');
    await expect(assertReservationWorkerRole(worker)).rejects.toMatchObject({code:'RESERVATION_ROLE_NOT_RESTRICTED'});
    await fixture.owner.query('REVOKE SELECT ON canonical_reservations FROM encho_reservation_worker');
    await assertReservationWorkerRole(worker);
  });

  it('rolls back after reservation insertion or inventory mutation fails',async()=>{
    const beforeNights=await held();
    await fixture.owner.query(`CREATE FUNCTION w3_fail_night() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'TEST_AFTER_RESERVATION_INSERT'; END $$;
      CREATE TRIGGER w3_fail_night BEFORE INSERT ON canonical_reservation_nights
      FOR EACH ROW EXECUTE FUNCTION w3_fail_night()`);
    await fails(beforeNights);
    expect(await state(beforeNights.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:3,booked:0});
    await fixture.owner.query('DROP TRIGGER w3_fail_night ON canonical_reservation_nights; DROP FUNCTION w3_fail_night()');
    const afterInventory=await held();
    await fixture.owner.query(`CREATE FUNCTION w3_fail_consume() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status='CONSUMED' THEN RAISE EXCEPTION 'TEST_AFTER_INVENTORY_UPDATE'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER w3_fail_consume BEFORE UPDATE ON booking_holds
      FOR EACH ROW EXECUTE FUNCTION w3_fail_consume()`);
    await fails(afterInventory);
    expect(await state(afterInventory.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:3,booked:0});
    await fixture.owner.query('DROP TRIGGER w3_fail_consume ON booking_holds; DROP FUNCTION w3_fail_consume()');
  });

  it('reserves schema space for an external origin without Encho quote, hold or payment',async()=>{
    const id=randomUUID();
    await fixture.owner.query(`INSERT INTO canonical_reservations(id,origin_kind,listing_id,room_type_id,
      check_in_date,check_out_date,nights,guest_count,room_subtotal_paise,currency,status,command_id,
      command_fingerprint) VALUES($1,'EXTERNAL_CHANNEL',1,101,$2::date,$3::date,2,2,0,'INR',
      'INVENTORY_COMMITTED',$4,$5)`,[id,addDays(fixture.today,75),addDays(fixture.today,77),
        randomUUID(),createHash('sha256').update('external-fixture').digest('hex')]);
    const row=(await fixture.owner.query(`SELECT origin_kind,quote_id,hold_id,offer_id FROM canonical_reservations
      WHERE id=$1`,[id])).rows[0];
    expect(row).toEqual({origin_kind:'EXTERNAL_CHANNEL',quote_id:null,hold_id:null,offer_id:null});
  });

  it('rejects changed accepted source facts after a hold without partial inventory conversion',async()=>{
    // This fixture changes material public facts without creating a successor
    // offer; finalization must not promote the old accepted source snapshot.
    const item=await held();
    await fixture.owner.query("UPDATE listings SET title='Materially changed title' WHERE id=1");
    try{
      await fails(item,'user:10','RESERVATION_AUTHORITY_MISMATCH');
      expect(await state(item.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:3,booked:0});
    }finally{
      await fixture.owner.query("UPDATE listings SET title='Amber House' WHERE id=1");
    }
  });

  it('does not silently finalize an active hold after its W1 offer is retired',async()=>{
    const item=await held();
    const service=new AcceptedOfferService(fixture.hostPool,
      new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
    await service.retire(fixture.principal(90,'STAFF'),{
      offerId,revision:1,expectedVersion:3});
    await fails(item,'user:10','RESERVATION_AUTHORITY_MISMATCH');
    expect(await state(item.holdId)).toMatchObject({status:'ACTIVE',reservations:0,held:3,booked:0});
  });
});
