/** W3-A diagnostic: intentionally red until order confirmation has canonical authority. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {test} from 'node:test';
import jwt from 'jsonwebtoken';
import {createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.ts';
import {applyIsolatedMigration} from '../../src/test/harvo/helpers/isolatedMigration.ts';

test('a confirmed order requires the exact accepted-offer quote and physical W2 hold', async()=>{
  const fixture=await createW1AcceptedOfferFixture({serverCompatible:true});
  try {
    await fixture.owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
      status TEXT NOT NULL,start_date DATE,end_date DATE)`);
    await applyIsolatedMigration(fixture.owner,'041_stays_canonical_commerce.sql');
    await fixture.owner.query(`CREATE ROLE encho_stays_web LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await applyIsolatedMigration(fixture.owner,'050_accepted_offer_itinerary_quotes.sql');
    const orderId=randomUUID();
    await fixture.owner.query(`INSERT INTO stays_orders(id,hold_id,quote_id,user_id,total_paise,
      currency,status,idempotency_key) VALUES($1,NULL,NULL,10,12345,'INR','CONFIRMED',$2)`,
      [orderId,randomUUID()]);
    const result=await fixture.owner.query(`SELECT o.status,o.hold_id,o.quote_id,
      (SELECT count(*)::int FROM booking_holds) AS physical_holds,
      (SELECT count(*)::int FROM stays_quotes) AS quotes,
      (SELECT count(*)::int FROM sellable_offer_revisions WHERE status='ACCEPTED') AS accepted_revisions,
      (SELECT coalesce(sum(booked_units),0)::int FROM inventory_days) AS booked_units
      FROM stays_orders o WHERE o.id=$1`,[orderId]);
    const restricted=await fixture.owner.query(`SELECT has_table_privilege('encho_stays_web',
      'stays_orders','INSERT') AS can_insert_order`);
    console.log('W3_A_BOUNDARY_OBSERVATION',JSON.stringify({...result.rows[0],
      restrictedStaysRoleCanInsert:restricted.rows[0].can_insert_order}));
    assert.notEqual(result.rows[0].status,'CONFIRMED',
      'CONFIRMED order exists without accepted offer, canonical quote, W2 hold, payment evidence, or booked inventory');
  } finally {
    await fixture.close();
  }
});

test('mounted marketing lead conversion cannot confirm without W2 authority', async()=>{
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
    child=spawn(process.execPath,['build/server/server.js'],{cwd:process.cwd(),
      env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp',
        TMPDIR:process.env.TMPDIR||'/tmp',NODE_ENV:'production',DATABASE_URL:ownerUrl,
        ACCEPTED_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_host'),
        PUBLIC_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_public'),
        CR1_WORKFORCE_ENVIRONMENT:'LOCAL',JWT_SECRET:'w3-disposable-test-server-secret',
        PORT:String(port),ALLOWED_ORIGINS:base},stdio:['ignore','pipe','pipe']});
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
    const token=jwt.sign({id:10},'w3-disposable-test-server-secret');
    const response=await fetch(`${base}/api/marketing/leads/fixture-no-lead/convert-booking`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({campaignId:1,name:'Fixture',phone:'0000000000',
        moveInDate:fixture.today,totalRent:1,roomId:101})});
    const body=await response.json();
    const legacyBooking=await fetch(`${base}/api/bookings`,{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}'});
    const legacyCheckout=await fetch(`${base}/api/checkout/razorpay/order`,{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}'});
    const count=(await fixture.owner.query(`SELECT count(*)::int AS n FROM bookings WHERE status='Confirmed'`)).rows[0].n;
    const holds=(await fixture.owner.query('SELECT count(*)::int AS n FROM booking_holds')).rows[0].n;
    const accepted=(await fixture.owner.query('SELECT count(*)::int AS n FROM sellable_offers WHERE current_accepted_revision IS NOT NULL')).rows[0].n;
    console.log('W3_A_MOUNTED_OBSERVATION',JSON.stringify({http:response.status,
      code:body.code||null,error:body.error||null,confirmedBookings:count,
      physicalHolds:holds,acceptedRevisions:accepted,
      legacyBookingHttp:legacyBooking.status,legacyCheckoutHttp:legacyCheckout.status}));
    assert.equal(count,0,'Mounted route created a confirmed booking without W1/W2 authority');
    assert.equal(response.status,410);
    assert.equal(legacyBooking.status,503);
    assert.equal(legacyCheckout.status,503);
  } finally {
    if(child&&!child.killed){child.kill('SIGTERM');await new Promise(resolve=>{
      if(child.exitCode!==null)return resolve();child.once('exit',resolve);
      setTimeout(resolve,2000).unref();
    });}
    await fixture.close();
  }
});
