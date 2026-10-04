/** W2-P0 failing-before: run only against this script's fresh disposable
 * PostgreSQL cluster and the offline-built server. No dotenv or remote URL is
 * read. A hold requested without a canonical server quote must allocate zero. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.ts';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.ts';
import {addDays,createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.ts';

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
const serverOutput=[];
try{
  const service=new AcceptedOfferService(fixture.hostPool,
    new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
  const draft=await service.createDraft(fixture.principal(10),{
    commandId:randomUUID(),listingId:1,roomTypeId:101,amountMinor:'550000',
    stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
    effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),
    maxGuests:2,minNights:1,
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

  const port=await freePort();
  const base=`http://127.0.0.1:${port}`;
  const ownerUrl=`postgresql://${encodeURIComponent(fixture.owner.options.user)}@localhost:${fixture.port}/`+
    `${fixture.owner.options.database}?host=${encodeURIComponent(fixture.socketPath)}`;
  child=spawn(process.execPath,['build/server/server.js'],{
    cwd:process.cwd(),
    env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp',
      TMPDIR:process.env.TMPDIR||'/tmp',NODE_ENV:'production',
      DATABASE_URL:ownerUrl,ACCEPTED_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_host'),
      PUBLIC_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_public'),
      CR1_WORKFORCE_ENVIRONMENT:'LOCAL',JWT_SECRET:'w2-disposable-test-server-secret',
      PORT:String(port),ALLOWED_ORIGINS:base},
    stdio:['ignore','pipe','pipe'],
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

  const response=await fetch(`${base}/api/v2/stays/holds`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({room_type_id:101,check_in:addDays(fixture.today,1),
      check_out:addDays(fixture.today,4),quantity:1,idempotency_key:randomUUID()}),
  });
  const holds=await fixture.owner.query(`SELECT COUNT(*)::int AS count
    FROM booking_holds WHERE room_type_id=101`);
  const inventory=await fixture.owner.query(`SELECT COALESCE(SUM(held_units),0)::int AS units
    FROM inventory_days WHERE room_type_id=101 AND calendar_date >= $1::date
    AND calendar_date < $2::date`,[addDays(fixture.today,1),addDays(fixture.today,4)]);
  const observed={httpSuccess:response.ok,holds:holds.rows[0].count,
    heldNights:inventory.rows[0].units};
  console.log(JSON.stringify({receipt:'W2_HOLD_WITHOUT_QUOTE',environment:'disposable-postgres-built-route',
    httpStatus:response.status,...observed}));
  assert.deepEqual(observed,{httpSuccess:false,holds:0,heldNights:0});
}finally{
  if(child?.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  await fixture.close();
}
