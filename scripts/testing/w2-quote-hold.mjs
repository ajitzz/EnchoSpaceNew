/** Mounted W2 quote→hold integration on a fresh disposable PostgreSQL cluster. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from '@playwright/test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.ts';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.ts';
import {addDays,createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.ts';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.ts';
import {sweepExpiredHolds} from '../../src/services/inventoryHoldService.ts';
import {assertStaysRole,withStaysPrincipal} from '../../src/server/stays/runtime.ts';

const freePort=()=>new Promise((resolve,reject)=>{
  const socket=createServer();socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{
    const address=socket.address();
    if(!address||typeof address==='string')return reject(new Error('Expected TCP port'));
    socket.close(()=>resolve(address.port));
  });
});
const fixture=await createW1AcceptedOfferFixture({serverCompatible:true});
let child;
let browser;
let restrictedPool;
const serverOutput=[];
try{
  await fixture.owner.query(`UPDATE listings SET description='A real temporary-hold test stay.',
    type='Villa',rental_mode='entire_place',amenities='[]'::jsonb WHERE id=1`);
  await fixture.owner.query("UPDATE media_assets SET url='/logo.svg' WHERE room_type_id IN (101,102)");
  const service=new AcceptedOfferService(fixture.hostPool,
    new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
  const draft=await service.createDraft(fixture.principal(10),{
    commandId:randomUUID(),listingId:1,roomTypeId:101,amountMinor:'550000',
    stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
    effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1,
  });
  const submitted=await service.submit(fixture.principal(10),{
    offerId:draft.offerId,revision:1,expectedVersion:draft.version,
  });
  await fixture.grantOffer(draft.offerId);
  await service.accept(fixture.principal(90,'STAFF'),{
    offerId:draft.offerId,revision:1,expectedVersion:submitted.version,
  });
  await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
    status TEXT NOT NULL,start_date DATE,end_date DATE)`);
  await applyIsolatedMigration(fixture.owner,'041_stays_canonical_commerce.sql');
  const historicalHoldId=randomUUID();
  await fixture.owner.query(`INSERT INTO booking_holds(id,room_type_id,user_id,holder_principal,
    idempotency_key,request_fingerprint,check_in_date,check_out_date,
    units_held,status,expires_at) VALUES($1,201,10,'user:10',$2,repeat('b',64),
    $3::date,$4::date,1,'ACTIVE',clock_timestamp()+interval '10 minutes')`,
    [historicalHoldId,randomUUID(),addDays(fixture.today,1),addDays(fixture.today,2)]);
  await fixture.owner.query(`UPDATE inventory_days SET held_units=held_units+1
    WHERE room_type_id=201 AND calendar_date=$1::date`,[addDays(fixture.today,1)]);
  await fixture.owner.query(`INSERT INTO booking_hold_nights(hold_id,inventory_day_id,stay_date,units)
    SELECT $1,id,calendar_date,1 FROM inventory_days WHERE room_type_id=201
    AND calendar_date=$2::date`,[historicalHoldId,addDays(fixture.today,1)]);
  await assert.rejects(applyIsolatedMigration(fixture.owner,'050_accepted_offer_itinerary_quotes.sql'),
    /STAYS_RESTRICTED_ROLE_NOT_READY/);
  const rolledBack=await fixture.owner.query("SELECT to_regclass('public.stays_quotes') AS quote_table");
  assert.ok(rolledBack.rows[0].quote_table,'Migration 041 quote table must survive rejected 050');
  await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await applyIsolatedMigration(fixture.owner,'050_accepted_offer_itinerary_quotes.sql');
  restrictedPool=new pg.Pool({...fixture.owner.options,user:'encho_stays_web'});
  await assertStaysRole(restrictedPool);
  await fixture.owner.query('GRANT w1_offer_migrator TO encho_stays_web');
  await assert.rejects(assertStaysRole(restrictedPool),/STAYS_ROLE_NOT_RESTRICTED/);
  await fixture.owner.query('REVOKE w1_offer_migrator FROM encho_stays_web');
  await fixture.owner.query('GRANT SELECT ON sellable_offers TO encho_stays_web');
  await assert.rejects(assertStaysRole(restrictedPool),/STAYS_ROLE_NOT_RESTRICTED/);
  await fixture.owner.query('REVOKE SELECT ON sellable_offers FROM encho_stays_web');
  await assertStaysRole(restrictedPool);
  await assert.rejects(restrictedPool.query('SELECT amount_minor FROM sellable_offer_revisions'),
    /permission denied/);

  const port=await freePort();
  const base=`http://127.0.0.1:${port}`;
  const ownerUrl=`postgresql://${encodeURIComponent(fixture.owner.options.user)}@localhost:${fixture.port}/`+
    `${fixture.owner.options.database}?host=${encodeURIComponent(fixture.socketPath)}`;
  child=spawn(process.execPath,['build/server/server.js'],{
    cwd:process.cwd(),env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp',
      TMPDIR:process.env.TMPDIR||'/tmp',NODE_ENV:'production',DATABASE_URL:ownerUrl,
      ACCEPTED_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_host'),
      PUBLIC_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_public'),
      STAYS_DATABASE_URL:`postgresql://encho_stays_web@localhost/postgres?host=${encodeURIComponent(fixture.socketPath)}&port=${fixture.port}`,
      CR1_WORKFORCE_ENVIRONMENT:'LOCAL',JWT_SECRET:'w2-disposable-test-server-secret',
      PORT:String(port),ALLOWED_ORIGINS:base},stdio:['ignore','pipe','pipe'],
  });
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
    serverOutput.push(String(chunk));if(serverOutput.length>100)serverOutput.shift();
  });
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){
    if(child.exitCode!==null)break;
    try{if((await fetch(`${base}/api/health/live`)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,`Built server did not start: ${serverOutput.join('').slice(-1400)}`);
  const ownerToken=jwt.sign({id:10},'w2-disposable-test-server-secret');
  const historicRead=await fetch(`${base}/api/v2/stays/holds/${historicalHoldId}`,
    {headers:{Authorization:`Bearer ${ownerToken}`}});
  assert.equal(historicRead.status,200);
  assert.equal((await historicRead.json()).hold.quoteId,null);
  const historicRelease=await fetch(`${base}/api/v2/stays/holds/${historicalHoldId}/release`,
    {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ownerToken}`},
      body:'{}'});
  assert.equal(historicRelease.status,200,await historicRelease.text());
  const historicCapacity=await fixture.owner.query(`SELECT held_units FROM inventory_days
    WHERE room_type_id=201 AND calendar_date=$1::date`,[addDays(fixture.today,1)]);
  assert.equal(historicCapacity.rows[0].held_units,0);
  const post=async(path,body,cookie)=>{
    const response=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',
      ...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const itinerary={offerId:draft.offerId,revision:1,checkIn:addDays(fixture.today,1),
    checkOut:addDays(fixture.today,4),guestCount:2};
  const firstRequest={...itinerary,requestId:randomUUID()};
  const nonexistentAccountToken=jwt.sign({id:999999},'w2-disposable-test-server-secret');
  for(const path of ['/api/v2/stays/quotes','/api/v2/stays/holds']){
    const response=await fetch(`${base}${path}`,{method:'POST',headers:{
      'Content-Type':'application/json',Authorization:`Bearer ${nonexistentAccountToken}`},
      body:JSON.stringify(path.endsWith('quotes')?firstRequest:{quoteId:randomUUID(),idempotencyKey:randomUUID()})});
    assert.equal(response.status,401,'A signed token without a current account must not become a Guest');
  }
  const first=await post('/api/v2/stays/quotes',firstRequest);
  assert.equal(first.status,201,JSON.stringify(first.body));
  assert.equal(first.body.quote.acceptedNightlyMinor,'550000');
  assert.equal(first.body.quote.roomSubtotalMinor,'1650000');
  assert.equal(first.body.quote.payableTotalMinor,null);
  const privateQuotes=await withStaysPrincipal(restrictedPool,'session:00000000-0000-4000-8000-000000000000',
    client=>client.query("SELECT id FROM stays_quotes WHERE quote_kind='ACCEPTED_OFFER'"));
  assert.equal(privateQuotes.rowCount,0);
  const quoteReplay=await post('/api/v2/stays/quotes',firstRequest,first.cookie);
  assert.equal(quoteReplay.body.quote.id,first.body.quote.id);
  const quoteConflict=await post('/api/v2/stays/quotes',{
    ...firstRequest,guestCount:1},first.cookie);
  assert.equal(quoteConflict.status,409);
  for(const column of ['request_fingerprint','source_hash']){
    await assert.rejects(fixture.owner.query(`INSERT INTO stays_quotes(id,listing_id,room_type_id,
      check_in_date,check_out_date,nights,base_price_paise,tax_paise,total_paise,currency,
      guest_count,expires_at,quote_kind,offer_id,offer_revision,holder_principal,request_id,
      request_fingerprint,accepted_nightly_paise,price_basis,source_hash)
      SELECT $1,listing_id,room_type_id,check_in_date,check_out_date,nights,base_price_paise,
      NULL,NULL,currency,guest_count,expires_at,quote_kind,offer_id,offer_revision,
      holder_principal,$2,${column==='request_fingerprint'?'NULL':'request_fingerprint'},
      accepted_nightly_paise,price_basis,${column==='source_hash'?'NULL':'source_hash'}
      FROM stays_quotes WHERE id=$3`,[randomUUID(),randomUUID(),first.body.quote.id]),
    /stays_quotes_authority_shape/);
  }
  const second=await post('/api/v2/stays/quotes',{...itinerary,requestId:randomUUID()},first.cookie);
  const otherAccountToken=jwt.sign({id:11},'w2-disposable-test-server-secret');
  const foreignQuoteRead=await fetch(`${base}/api/v2/stays/quotes/${first.body.quote.id}`,{
    headers:{Authorization:`Bearer ${otherAccountToken}`}});
  assert.equal(foreignQuoteRead.status,404);
  const foreignAccountHold=await fetch(`${base}/api/v2/stays/holds`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${otherAccountToken}`},
    body:JSON.stringify({quoteId:first.body.quote.id,idempotencyKey:randomUUID()})});
  assert.equal(foreignAccountHold.status,404);
  assert.equal(second.status,201,JSON.stringify(second.body));
  const invalid=await post('/api/v2/stays/holds',{quoteId:first.body.quote.id,
    idempotencyKey:randomUUID(),roomTypeId:201},first.cookie);
  assert.equal(invalid.status,400,'Caller room override must be rejected');
  const keys=[randomUUID(),randomUUID()];
  const results=await Promise.all([first,second].map((q,index)=>post('/api/v2/stays/holds',
    {quoteId:q.body.quote.id,idempotencyKey:keys[index]},first.cookie)));
  assert.deepEqual(results.map(result=>result.status).sort(),[201,409],JSON.stringify(results));
  const winnerIndex=results.findIndex(result=>result.status===201);
  const replay=await post('/api/v2/stays/holds',{
    quoteId:[first,second][winnerIndex].body.quote.id,idempotencyKey:keys[winnerIndex]},first.cookie);
  assert.equal(replay.status,200,JSON.stringify(replay.body));
  assert.equal(replay.body.hold.id,results[winnerIndex].body.hold.id);
  const holds=await fixture.owner.query('SELECT id,quote_id FROM booking_holds WHERE quote_id IS NOT NULL');
  const inventory=await fixture.owner.query(`SELECT calendar_date::text,held_units FROM inventory_days
    WHERE room_type_id=101 AND calendar_date >= $1::date AND calendar_date < $2::date
    ORDER BY calendar_date`,[itinerary.checkIn,itinerary.checkOut]);
  assert.equal(holds.rowCount,1);
  assert.equal(holds.rows[0].quote_id,[first,second][winnerIndex].body.quote.id);
  await assert.rejects(fixture.owner.query('UPDATE booking_holds SET quote_id=$1 WHERE id=$2',
    [[first,second][1-winnerIndex].body.quote.id,holds.rows[0].id]),
    /BOOKING_HOLD_QUOTED_IDENTITY_IMMUTABLE/);
  assert.deepEqual(inventory.rows.map(row=>row.held_units),[1,1,1]);
  const forged=await post('/api/v2/stays/holds',{quoteId:randomUUID(),idempotencyKey:randomUUID()},first.cookie);
  assert.equal(forged.status,404);
  const foreign=await post('/api/v2/stays/holds',{
    quoteId:[first,second][winnerIndex].body.quote.id,idempotencyKey:randomUUID()});
  assert.equal(foreign.status,404);
  const fakeMoney=await post('/api/v2/stays/quotes',{
    ...itinerary,requestId:randomUUID(),amountMinor:'1'},first.cookie);
  assert.equal(fakeMoney.status,400);
  const wrongDates=await post('/api/v2/stays/holds',{
    quoteId:first.body.quote.id,idempotencyKey:randomUUID(),checkIn:addDays(fixture.today,10)},first.cookie);
  assert.equal(wrongDates.status,400);
  const tooManyGuests=await post('/api/v2/stays/quotes',{
    ...itinerary,guestCount:3,requestId:randomUUID()},first.cookie);
  assert.equal(tooManyGuests.status,422);
  const outsideScope=await post('/api/v2/stays/quotes',{
    ...itinerary,checkOut:addDays(fixture.today,40),requestId:randomUUID()},first.cookie);
  assert.equal(outsideScope.status,422);

  // A quote can expire without ever reserving inventory. Construct one
  // already-expired immutable row directly in this disposable fixture.
  const expiredId=randomUUID();
  await fixture.owner.query(`INSERT INTO stays_quotes(id,listing_id,room_type_id,check_in_date,
    check_out_date,nights,base_price_paise,tax_paise,total_paise,currency,guest_count,
    created_at,expires_at,quote_kind,offer_id,offer_revision,holder_principal,request_id,
    request_fingerprint,accepted_nightly_paise,price_basis,source_hash)
    SELECT $1,listing_id,room_type_id,check_in_date,check_out_date,nights,base_price_paise,
      NULL,NULL,currency,guest_count,created_at,clock_timestamp()-interval '1 second',
      quote_kind,offer_id,offer_revision,holder_principal,$2,request_fingerprint,
      accepted_nightly_paise,price_basis,source_hash FROM stays_quotes WHERE id=$3`,
    [expiredId,randomUUID(),first.body.quote.id]);
  const expired=await post('/api/v2/stays/holds',{quoteId:expiredId,idempotencyKey:randomUUID()},first.cookie);
  assert.equal(expired.status,409);
  assert.equal(expired.body.code,'QUOTE_EXPIRED');

  await fixture.owner.query(`UPDATE booking_holds SET expires_at=clock_timestamp()-interval '1 second'
    WHERE id=$1`,[holds.rows[0].id]);
  const quoteAfterExpiredHold=await post('/api/v2/stays/quotes',{
    ...itinerary,requestId:randomUUID()},first.cookie);
  assert.equal(quoteAfterExpiredHold.status,201,
    'A delayed sweeper must not strand capacity after a hold expires');
  const expiredByQuote=await fixture.owner.query('SELECT status FROM booking_holds WHERE id=$1',
    [holds.rows[0].id]);
  assert.equal(expiredByQuote.rows[0].status,'EXPIRED');
  const swept=await sweepExpiredHolds(fixture.owner);
  assert.equal(swept.expiredHoldCount,0,'Sweeper must not release on-demand expiry twice');
  const released=await fixture.owner.query(`SELECT calendar_date::text,held_units FROM inventory_days
    WHERE room_type_id=101 AND calendar_date >= $1::date AND calendar_date < $2::date
    ORDER BY calendar_date`,[itinerary.checkIn,itinerary.checkOut]);
  assert.deepEqual(released.rows.map(row=>row.held_units),[0,0,0]);

  // A lost hold response may be retried after quote expiry. Replay returns
  // the existing hold; an expired quote can never acquire fresh capacity.
  const shortQuoteId=randomUUID();
  await fixture.owner.query(`INSERT INTO stays_quotes(id,listing_id,room_type_id,check_in_date,
    check_out_date,nights,base_price_paise,tax_paise,total_paise,currency,guest_count,
    created_at,expires_at,quote_kind,offer_id,offer_revision,holder_principal,request_id,
    request_fingerprint,accepted_nightly_paise,price_basis,source_hash)
    SELECT $1,listing_id,room_type_id,check_in_date,check_out_date,nights,base_price_paise,
      NULL,NULL,currency,guest_count,created_at,clock_timestamp()+interval '3 seconds',
      quote_kind,offer_id,offer_revision,holder_principal,$2,request_fingerprint,
      accepted_nightly_paise,price_basis,source_hash FROM stays_quotes WHERE id=$3`,
    [shortQuoteId,randomUUID(),first.body.quote.id]);
  const shortKey=randomUUID();
  const shortHold=await post('/api/v2/stays/holds',{
    quoteId:shortQuoteId,idempotencyKey:shortKey},first.cookie);
  assert.equal(shortHold.status,201,JSON.stringify(shortHold.body));
  await new Promise(resolve=>setTimeout(resolve,3200));
  const replayAfterQuoteExpiry=await post('/api/v2/stays/holds',{
    quoteId:shortQuoteId,idempotencyKey:shortKey},first.cookie);
  assert.equal(replayAfterQuoteExpiry.status,200,JSON.stringify(replayAfterQuoteExpiry.body));
  assert.equal(replayAfterQuoteExpiry.body.hold.id,shortHold.body.hold.id);
  const newHoldAfterQuoteExpiry=await post('/api/v2/stays/holds',{
    quoteId:shortQuoteId,idempotencyKey:randomUUID()},first.cookie);
  assert.equal(newHoldAfterQuoteExpiry.status,409);
  assert.equal(newHoldAfterQuoteExpiry.body.code,'QUOTE_EXPIRED');
  const releaseShort=await post(`/api/v2/stays/holds/${shortHold.body.hold.id}/release`,{},first.cookie);
  assert.equal(releaseShort.status,200,JSON.stringify(releaseShort.body));

  // W1 watch: a transient hold must not be mistaken for a material change to
  // commercial-review facts when another unit remains sellable.
  const otherDraft=await service.createDraft(fixture.principal(10),{
    commandId:randomUUID(),listingId:1,roomTypeId:102,amountMinor:'620000',
    stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
    effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1,
  });
  const otherSubmitted=await service.submit(fixture.principal(10),{
    offerId:otherDraft.offerId,revision:1,expectedVersion:otherDraft.version,
  });
  await fixture.grantOffer(otherDraft.offerId);
  const otherAccepted=await service.accept(fixture.principal(90,'STAFF'),{
    offerId:otherDraft.offerId,revision:1,expectedVersion:otherSubmitted.version,
  });
  await fixture.owner.query('UPDATE inventory_days SET total_units=2 WHERE room_type_id=102');
  const successor=await service.createDraft(fixture.principal(10),{
    commandId:randomUUID(),offerId:otherDraft.offerId,expectedVersion:otherAccepted.version,
    listingId:1,roomTypeId:102,amountMinor:'650000',stayStart:fixture.today,
    stayEnd:addDays(fixture.today,30),effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1,
  });
  const successorSubmitted=await service.submit(fixture.principal(10),{
    offerId:otherDraft.offerId,revision:2,expectedVersion:successor.version,
  });
  const otherQuote=await post('/api/v2/stays/quotes',{
    offerId:otherDraft.offerId,revision:1,checkIn:itinerary.checkIn,
    checkOut:itinerary.checkOut,guestCount:2,requestId:randomUUID()},first.cookie);
  assert.equal(otherQuote.status,201,JSON.stringify(otherQuote.body));
  const otherHold=await post('/api/v2/stays/holds',{
    quoteId:otherQuote.body.quote.id,idempotencyKey:randomUUID()},first.cookie);
  assert.equal(otherHold.status,201,JSON.stringify(otherHold.body));
  let reviewWhileHeld='ACCEPTED';
  try{await service.accept(fixture.principal(90,'STAFF'),{
    offerId:otherDraft.offerId,revision:2,expectedVersion:successorSubmitted.version});}
  catch(error){reviewWhileHeld=error.code??'UNKNOWN';}
  const release=await post(`/api/v2/stays/holds/${otherHold.body.hold.id}/release`,{},first.cookie);
  assert.equal(release.status,200,JSON.stringify(release.body));
  const reviewAfterRelease=await service.accept(fixture.principal(90,'STAFF'),{
    offerId:otherDraft.offerId,revision:2,expectedVersion:successorSubmitted.version});
  assert.equal(reviewAfterRelease.status,'ACCEPTED');
  const supersededQuoteHold=await post('/api/v2/stays/holds',{
    quoteId:otherQuote.body.quote.id,idempotencyKey:randomUUID()},first.cookie);
  assert.equal(supersededQuoteHold.status,409,'A new hold needs a quote from the current accepted revision');
  const successorQuote=await post('/api/v2/stays/quotes',{
    offerId:otherDraft.offerId,revision:2,checkIn:itinerary.checkIn,
    checkOut:itinerary.checkOut,guestCount:2,requestId:randomUUID()},first.cookie);
  assert.equal(successorQuote.status,201,JSON.stringify(successorQuote.body));
  assert.equal(successorQuote.body.quote.acceptedNightlyMinor,'650000');
  const superseded=await fixture.owner.query(`SELECT COUNT(*)::int AS count FROM sellable_offer_events
    WHERE offer_id=$1 AND revision=1 AND event_type='SUPERSEDED'`,[otherDraft.offerId]);
  assert.equal(superseded.rows[0].count,1);

  // The public/Host LOGIN roles must not read private per-guest quote rows.
  await assert.rejects(fixture.publicPool.query('SELECT holder_principal FROM stays_quotes LIMIT 1'),
    /permission denied/);
  await assert.rejects(fixture.hostPool.query('SELECT holder_principal FROM stays_quotes LIMIT 1'),
    /permission denied/);

  await assert.rejects(fixture.owner.query('UPDATE stays_quotes SET base_price_paise=1 WHERE id=$1',
    [first.body.quote.id]),/ACCEPTED_OFFER_QUOTE_IMMUTABLE/);
  await assert.rejects(fixture.owner.query(`INSERT INTO booking_holds(id,room_type_id,
    holder_principal,idempotency_key,request_fingerprint,check_in_date,check_out_date,
    units_held,status,expires_at) VALUES($1,101,'session:forged',$2,repeat('a',64),
    $3::date,$4::date,1,'ACTIVE',clock_timestamp()+interval '10 minutes')`,
    [randomUUID(),randomUUID(),itinerary.checkIn,itinerary.checkOut]),
    /BOOKING_HOLD_QUOTE_REQUIRED/);
  await assert.rejects(fixture.owner.query(`INSERT INTO booking_holds(id,room_type_id,
    holder_principal,idempotency_key,request_fingerprint,check_in_date,check_out_date,
    units_held,status,expires_at,quote_id) VALUES($1,101,'session:forged',$2,repeat('a',64),
    $3::date,$4::date,1,'ACTIVE',clock_timestamp()+interval '10 minutes',$5)`,
    [randomUUID(),randomUUID(),itinerary.checkIn,itinerary.checkOut,first.body.quote.id]),
    /BOOKING_HOLD_QUOTE_BINDING_INVALID/);

  browser=await chromium.launch({headless:true});
  for(const width of [1280,360]){
    const context=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
    const page=await context.newPage();
    page.on('response',response=>{
      if(response.url().includes('/api/v2/stays/'))console.error('Browser W2 response',response.status(),response.url());
    });
    await page.goto(`${base}/stay/amber-house`,{waitUntil:'domcontentloaded'});
    const quoteButton=page.getByRole('button',{name:'Get verified room subtotal'});
    await quoteButton.waitFor({state:'visible',timeout:15000});
    if(width===360){await quoteButton.focus();await page.keyboard.press('Enter');}
    else await quoteButton.click();
    await page.getByText(/Room subtotal:/).waitFor({state:'visible',timeout:15000});
    const holdButton=page.getByRole('button',{name:'Temporarily hold this room'});
    if(width===360){await holdButton.focus();await page.keyboard.press('Enter');}
    else await holdButton.click();
    try{await page.getByText(/Temporarily held until/).waitFor({state:'visible',timeout:15000});}
    catch(error){
      console.error('Guest hold panel:',await page.getByRole('region',{name:'Room quote and temporary hold'}).innerText());
      throw error;
    }
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByText(/Temporarily held until/).waitFor({state:'visible',timeout:15000});
    if(width===360){
      await page.waitForTimeout(500);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(overflow<=2,`Mobile quote/hold caused ${overflow}px horizontal overflow`);
    }
    await page.getByRole('button',{name:'Release hold'}).click();
    await page.getByText(/Hold released/).waitFor({state:'visible',timeout:15000});
    await context.close();
  }
  const foreignDraft=await service.createDraft(fixture.principal(11),{
    commandId:randomUUID(),listingId:2,roomTypeId:201,amountMinor:'70000',
    stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
    effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1,
  });
  const draftQuote=await post('/api/v2/stays/quotes',{
    ...itinerary,offerId:foreignDraft.offerId,requestId:randomUUID()},first.cookie);
  assert.equal(draftQuote.status,409);
  await fixture.owner.query("UPDATE listings SET publication_status='draft' WHERE id=1");
  const unpublished=await post('/api/v2/stays/quotes',{
    ...itinerary,requestId:randomUUID()},first.cookie);
  assert.equal(unpublished.status,409);
  console.log(JSON.stringify({receipt:'W2_QUOTE_HOLD',environment:'disposable-postgres-built-route',
    quoteSubtotalMinor:first.body.quote.roomSubtotalMinor,holdStatuses:results.map(result=>result.status),
    replayStatus:replay.status,holdCount:holds.rowCount,heldNights:inventory.rows.length,
    forgedStatus:forged.status,foreignStatus:foreign.status,quoteReplay:quoteReplay.status,
    quoteConflict:quoteConflict.status,expiredQuote:expired.status,
    expiredHoldReleased:expiredByQuote.rows[0].status,
    replayAfterQuoteExpiry:replayAfterQuoteExpiry.status,newHoldAfterQuoteExpiry:newHoldAfterQuoteExpiry.status,
    reviewWhileHeld,reviewAfterRelease:reviewAfterRelease.status,
    supersededQuoteHold:supersededQuoteHold.status,supersededEvents:superseded.rows[0].count,
    browserViewports:[1280,360],draftQuote:draftQuote.status,unpublishedQuote:unpublished.status}));
}catch(error){
  console.error('Built W2 server diagnostic:',serverOutput.join('').slice(-4000));
  throw error;
}finally{
  await browser?.close();
  if(child?.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  await restrictedPool?.end();
  await fixture.close();
}
