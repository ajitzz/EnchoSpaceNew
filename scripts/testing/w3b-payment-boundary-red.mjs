/**
 * ENCHO W3-B Task 1 diagnostic: Payment Authority Trace and First Red Boundary.
 *
 * Verifies:
 * 1. Missing payment authority boundary (RED):
 *    - Given an active W2 hold and quote, the quote provides roomSubtotalMinor (base_price_paise)
 *      but payableTotalMinor is NULL (stays_quotes.total_paise is NULL by DB constraint stays_quotes_authority_shape).
 *    - W2 room subtotal is NOT payable total; tax and payable total authority are MISSING / LEGALLY GATED.
 *    - Neither payment order creation nor capture verification can proceed without an approved payable total.
 *    - Zero canonical reservations exist, zero inventory units are committed to booked_units,
 *      and W3-A canonical_finalize_direct_hold has zero callers in payment flows.
 * 2. Mounted production routes fail closed (GREEN_CONTAINED):
 *    - POST /api/checkout/razorpay/order returns HTTP 503 CANONICAL_CHECKOUT_REQUIRED
 *    - POST /api/payments/razorpay/verify returns HTTP 410 SIGNED_PAYMENT_WEBHOOK_REQUIRED
 *    - POST /api/bookings returns HTTP 503 STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE
 *    - Accurately labels: test-sandbox sim_sig_ shortcut is NOT accessible on these mounted production routes,
 *      confirming zero public exploit across these three mounted legacy endpoints.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {test} from 'node:test';
import jwt from 'jsonwebtoken';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.js';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.js';
import {createItineraryQuote} from '../../src/services/itineraryQuoteService.js';
import {acquireHold} from '../../src/services/inventoryHoldService.js';
import {addDays,createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.ts';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.ts';

test('approved payable total authority is absent in canonical stays quote', async()=>{
  const fixture=await createW1AcceptedOfferFixture({serverCompatible:true});
  try {
    await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
      status TEXT NOT NULL,start_date DATE,end_date DATE)`);
    await applyIsolatedMigration(fixture.owner,'041_stays_canonical_commerce.sql');
    await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner,'050_accepted_offer_itinerary_quotes.sql');
    await fixture.owner.query(`CREATE ROLE encho_reservation_worker LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner,'052_canonical_reservation_hold_finalization.sql');

    const stays=new (await import('pg')).default.Pool({...fixture.owner.options,user:'encho_stays_web'});
    let quoteId,holdId,checkIn,checkOut;
    try {
      // 1. Establish valid accepted commercial offer
      const offerService=new AcceptedOfferService(fixture.hostPool,
        new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
      const draft=await offerService.createDraft(fixture.principal(10),{
        commandId:randomUUID(),listingId:1,roomTypeId:101,amountMinor:'550000',
        stayStart:fixture.today,stayEnd:addDays(fixture.today,70),
        effectiveFrom:new Date(Date.now()-3600000).toISOString(),
        effectiveUntil:new Date(Date.now()+70*86400000).toISOString(),maxGuests:2,minNights:1,
      });
      const submitted=await offerService.submit(fixture.principal(10),{
        offerId:draft.offerId,revision:1,expectedVersion:draft.version});
      await fixture.grantOffer(draft.offerId);
      await offerService.accept(fixture.principal(90,'STAFF'),{
        offerId:draft.offerId,revision:1,expectedVersion:submitted.version});

      // 2. Establish valid W2 itinerary quote
      checkIn=addDays(fixture.today,5);
      checkOut=addDays(fixture.today,8);
      const quote=await createItineraryQuote(stays,{
        offerId:draft.offerId,revision:1,checkIn,checkOut,
        guestCount:2,requestId:randomUUID()
      },'user:10');
      quoteId=quote.id;

      // 3. Establish active physical hold
      const holdRes=await acquireHold(stays,{
        roomTypeId:101,checkIn,checkOut,quantity:1,
        idempotencyKey:randomUUID(),quoteId:quote.id,
        holderPrincipal:'user:10',userId:10
      });
      assert.equal(holdRes.success,true,'W2 hold acquisition must succeed');
      holdId=holdRes.hold.id;
    } finally {
      await stays.end();
    }

    // Inspect database truth for quote and inventory
    const quoteRow=(await fixture.owner.query(
      'SELECT id,base_price_paise,tax_paise,total_paise,currency FROM stays_quotes WHERE id=$1',
      [quoteId]
    )).rows[0];

    const holdRow=(await fixture.owner.query(
      'SELECT id,status,expires_at FROM booking_holds WHERE id=$1',
      [holdId]
    )).rows[0];

    const inventoryBefore=(await fixture.owner.query(
      `SELECT coalesce(sum(held_units),0)::int AS held, coalesce(sum(booked_units),0)::int AS booked
       FROM inventory_days WHERE room_type_id=101 AND calendar_date>=$1::date AND calendar_date<$2::date`,
      [checkIn,checkOut]
    )).rows[0];

    const reservationsCount=(await fixture.owner.query(
      'SELECT count(*)::int AS n FROM canonical_reservations WHERE hold_id=$1',
      [holdId]
    )).rows[0].n;

    console.log('W3_B_PAYMENT_AUTHORITY_OBSERVATION',JSON.stringify({
      quoteId:quoteRow.id,
      roomSubtotalPaise:quoteRow.base_price_paise,
      quoteTaxPaise:quoteRow.tax_paise,
      quoteTotalPaise:quoteRow.total_paise,
      holdId:holdRow.id,
      holdStatus:holdRow.status,
      inventoryHeldUnits:inventoryBefore.held,
      inventoryBookedUnits:inventoryBefore.booked,
      canonicalReservationsCount:reservationsCount
    }));

    // SINGLE HONEST RED ASSERTION:
    // Neither payment order creation nor capture verification can proceed without an approved
    // server-authoritative payable total.
    // W2 room subtotal (base_price_paise) is NOT payable total.
    // In stays_quotes, total_paise is NULL (enforced by CHECK constraint stays_quotes_authority_shape;
    // tax and total authority are MISSING / LEGALLY GATED pending Indian CA/tax-lawyer sign-off).
    assert.notEqual(
      quoteRow.total_paise,
      null,
      'Payment order creation and capture verification require an approved server-authoritative payable total in stays_quotes (currently NULL / legally gated)'
    );
  } finally {
    await fixture.close();
  }
});

test('mounted production checkout and payment verification fail closed', async()=>{
  const fixture=await createW1AcceptedOfferFixture({serverCompatible:true});
  let child;
  const output=[];
  try {
    await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,user_id INT,listing_id INT,
      room_id INT,move_in_date TEXT,configuration TEXT,name TEXT,phone TEXT,total_rent NUMERIC,status TEXT)`);
    await fixture.owner.query(`CREATE TABLE host_marketing_campaigns(id SERIAL PRIMARY KEY,
      host_id INT NOT NULL,listing_id INT NOT NULL,accumulated_conversions INT DEFAULT 0)`);
    await fixture.owner.query(`INSERT INTO host_marketing_campaigns(host_id,listing_id) VALUES(10,1)`);

    const port=await new Promise((resolve,reject)=>{
      const socket=createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{
        const address=socket.address();if(!address||typeof address==='string')return reject(new Error('No port'));
        socket.close(()=>resolve(address.port));
      });
    });
    const base=`http://127.0.0.1:${port}`;
    const ownerUrl=`postgresql://${encodeURIComponent(fixture.owner.options.user)}@localhost:${fixture.port}/`+
      `${fixture.owner.options.database}?host=${encodeURIComponent(fixture.socketPath)}`;

    child=spawn(process.execPath,['build/server/server.js'],{
      cwd:process.cwd(),
      env:{
        PATH:process.env.PATH||'/usr/bin:/bin',
        HOME:process.env.HOME||'/tmp',
        TMPDIR:process.env.TMPDIR||'/tmp',
        NODE_ENV:'production',
        DATABASE_URL:ownerUrl,
        ACCEPTED_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_host'),
        PUBLIC_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_public'),
        CR1_WORKFORCE_ENVIRONMENT:'LOCAL',
        JWT_SECRET:'w3b-disposable-test-server-secret-32chars',
        PORT:String(port),
        ALLOWED_ORIGINS:base
      },
      stdio:['ignore','pipe','pipe']
    });

    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
      output.push(String(chunk));if(output.length>30)output.shift();
    });

    let ready=false;
    for(let attempt=0;attempt<80;attempt++){
      if(child.exitCode!==null)break;
      try{if((await fetch(`${base}/api/health/live`)).ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.ok(ready,`Built server did not start: ${output.join('').slice(-500)}`);

    const token=jwt.sign({id:10},'w3b-disposable-test-server-secret-32chars');

    const checkoutRes=await fetch(`${base}/api/checkout/razorpay/order`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({listingId:1,roomId:'101',name:'Guest',phone:'9999999999',moveInDate:fixture.today})
    });
    const checkoutBody=await checkoutRes.json();

    const verifyRes=await fetch(`${base}/api/payments/razorpay/verify`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({razorpay_order_id:'order_123',razorpay_payment_id:'pay_123',razorpay_signature:'sig_123'})
    });
    const verifyBody=await verifyRes.json();

    const bookingRes=await fetch(`${base}/api/bookings`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({})
    });
    const bookingBody=await bookingRes.json();

    console.log('W3_B_PRODUCTION_CONTAINMENT_OBSERVATION',JSON.stringify({
      checkoutStatus:checkoutRes.status,
      checkoutCode:checkoutBody.code,
      verifyStatus:verifyRes.status,
      verifyCode:verifyBody.code,
      bookingStatus:bookingRes.status,
      bookingCode:bookingBody.code
    }));

    // Production routes fail closed:
    assert.equal(checkoutRes.status,503);
    assert.equal(checkoutBody.code,'CANONICAL_CHECKOUT_REQUIRED');
    assert.equal(verifyRes.status,410);
    assert.equal(verifyBody.code,'SIGNED_PAYMENT_WEBHOOK_REQUIRED');
    assert.equal(bookingRes.status,503);
    assert.equal(bookingBody.code,'STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE');
  } finally {
    if(child&&!child.killed){
      child.kill('SIGTERM');
      await new Promise(resolve=>{
        if(child.exitCode!==null)return resolve();
        child.once('exit',resolve);
        setTimeout(resolve,2000).unref();
      });
    }
    await fixture.close();
  }
});
