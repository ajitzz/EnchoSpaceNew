/** W1 built-artifact intent and impact: use only a fresh Unix-socket PostgreSQL
 * cluster and the offline build to prove that accepted room-night offers, stable
 * same-name room IDs, approved media, withheld prices, and public error states
 * survive HTTP, catalogue navigation, direct detail reload, and 360px keyboard
 * interaction. The script never reads dotenv or a remote database URL. It owns
 * only disposable data, a child server, and a browser; failure kills all three.
 * Run after `npm run build:offline` with `node --import tsx scripts/testing/w1-built-journey.mjs`.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {chromium} from '@playwright/test';
import {PostgresWorkforceAuthorization} from '../../src/lib/iam/postgresAuthorization.ts';
import {AcceptedOfferService} from '../../src/server/offers/acceptedOfferService.ts';
import {addDays,createW1AcceptedOfferFixture} from '../../src/test/harvo/helpers/w1AcceptedOfferFixture.ts';

const fixture=await createW1AcceptedOfferFixture({serverCompatible:true});
let child;
let browser;
const serverOutput=[];
const getPort=()=>new Promise((resolve,reject)=>{
  const socket=createServer();socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{const value=socket.address().port;socket.close(()=>resolve(value));});
});
const offerInput=(roomTypeId,amountMinor)=>({commandId:randomUUID(),listingId:roomTypeId===201?2:1,roomTypeId,amountMinor,
  stayStart:fixture.today,stayEnd:addDays(fixture.today,30),
  effectiveFrom:new Date(Date.now()-3600000).toISOString(),
  effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1});

try{
  const {owner}=fixture;
  // URLs are test assets from this disposable cluster; no caller-supplied URI is used.
  await owner.query(`UPDATE listings SET description='A dated offer test stay.',city='W1 Built City',
    type='Villa',rental_mode='entire_place',image_urls='[]'::jsonb,rooms='[]'::jsonb,
    amenities='[]'::jsonb WHERE id IN (1,2)`);
  await owner.query(`UPDATE media_assets SET url=CASE WHEN room_type_id=102
    THEN '/app-icon.svg' ELSE '/logo.svg' END WHERE room_type_id IN (101,102,201)`);
  await owner.query(`INSERT INTO listings(id,user_id,title,slug,publication_status,price,currency,
    description,city,type,rental_mode,image_urls,rooms,amenities)
    VALUES (3,10,'No Offer House','no-offer-house','published',1,'INR',
      'This stay has no reviewed offer.','W1 Built City','Villa','entire_place','[]','[]','[]')`);
  await owner.query(`INSERT INTO room_types(id,listing_id,name,type,base_price,currency,max_occupancy,
    inventory_count,min_stay_nights) VALUES (301,3,'Unpriced Room','suite',1,'INR',2,1,1)`);
  await owner.query(`INSERT INTO media_assets(entity_type,entity_id,room_type_id,url,category,
    moderation_status,is_sleeping_area,is_hero)
    VALUES ('listing',3,301,'/logo.svg','bedroom','approved',true,true)`);
  // The built public availability reader checks legacy bookings for ambiguous
  // room allocation. An empty table is still required to prove none exist.
  await owner.query(`CREATE TABLE bookings(id SERIAL PRIMARY KEY,listing_id INT NOT NULL,
    status TEXT NOT NULL,start_date DATE,end_date DATE)`);

  const service=new AcceptedOfferService(fixture.hostPool,
    new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),'LOCAL');
  const host=fixture.principal(10),reviewer=fixture.principal(90,'STAFF');
  async function accept(roomTypeId,amountMinor){
    const draft=await service.createDraft(host,offerInput(roomTypeId,amountMinor));
    await service.submit(host,{offerId:draft.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(draft.offerId);
    await service.accept(reviewer,{offerId:draft.offerId,revision:1,expectedVersion:2});
    return draft.offerId;
  }
  const royalA=await accept(101,'550000');
  const royalB=await accept(102,'620000');
  const blueOffer=await service.createDraft(fixture.principal(11),offerInput(201,'70000'));
  await service.submit(fixture.principal(11),{offerId:blueOffer.offerId,revision:1,expectedVersion:1});
  await fixture.grantOffer(blueOffer.offerId);
  await service.accept(reviewer,{offerId:blueOffer.offerId,revision:1,expectedVersion:2});
  await service.retire(reviewer,{offerId:blueOffer.offerId,revision:1,expectedVersion:3});
  // A cheaper successor draft must never displace the accepted first revision.
  await service.createDraft(host,{...offerInput(101,'100000'),offerId:royalA,expectedVersion:3});

  const port=await getPort();
  const ownerUrl=`postgresql://${encodeURIComponent(owner.options.user)}@localhost:${fixture.port}/${owner.options.database}`+
    `?host=${encodeURIComponent(fixture.socketPath)}`;
  const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp',
    TMPDIR:process.env.TMPDIR||'/tmp',NODE_ENV:'production',
    DATABASE_URL:ownerUrl,ACCEPTED_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_host'),
    PUBLIC_OFFER_DATABASE_URL:fixture.urlFor('w1_offer_public'),
    CR1_WORKFORCE_ENVIRONMENT:'LOCAL',JWT_SECRET:'w1-disposable-built-server-secret',
    PORT:String(port),ALLOWED_ORIGINS:`http://127.0.0.1:${port}`};
  child=spawn(process.execPath,['build/server/server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
    serverOutput.push(String(chunk));if(serverOutput.length>100)serverOutput.shift();
  });
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){
    if(child.exitCode!==null)break;
    try{if((await fetch(`${base}/api/health/live`)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,`Built W1 server did not start: ${serverOutput.join('').slice(-1800)}`);
  const get=async(path,expected)=>{
    const response=await fetch(base+path,{redirect:'manual'});
    if(response.status!==expected)throw new Error(`${path}: expected ${expected}, got ${response.status}: ${await response.text()}`);
    return response;
  };
  const catalog=await (await get('/api/listings?city=W1%20Built%20City',200)).json();
  const amber=catalog.find(row=>row.id==='1'),blue=catalog.find(row=>row.id==='2'),noOffer=catalog.find(row=>row.id==='3');
  assert.ok(amber&&blue&&noOffer,'All three publication fixtures must reach the public catalogue');
  assert.equal(amber.priceState,'VERIFIED_OFFER_AVAILABLE');
  assert.equal(amber.price,5500);
  assert.equal(amber.fromOffer.offerId,royalA);
  assert.deepEqual(amber.rooms.map(room=>room.id),['101','102']);
  assert.deepEqual(amber.rooms.map(room=>room.offer?.offerId),[royalA,royalB]);
  assert.deepEqual(amber.rooms.map(room=>room.price),[5500,6200]);
  assert.equal(blue.price,null);
  assert.equal(blue.offerState,'OFFER_RETIRED');
  assert.equal(noOffer.price,null);
  assert.equal(noOffer.offerState,'NO_ACCEPTED_OFFER');
  const detail=await (await get('/api/v2/stays/amber-house',200)).json();
  const refresh=await (await get('/api/listings/1',200)).json();
  for(const view of [amber,detail,refresh]){
    assert.equal(view.price,5500);
    assert.equal(view.priceState,'VERIFIED_OFFER_AVAILABLE');
    assert.equal(view.fromOffer?.offerId,royalA);
    assert.equal(view.fromOffer?.priceBasis,'PER_ROOM_NIGHT');
    assert.equal(Object.hasOwn(view,'quoteTotal'),false,'Discovery price is not a checkout quote');
    assert.deepEqual(view.rooms.map(room=>room.id),['101','102']);
    assert.deepEqual(view.rooms.map(room=>room.offer?.offerId),[royalA,royalB]);
  }
  assert.ok(detail.photos.some(photo=>photo.room_type_id==='101'&&photo.url==='/logo.svg'));
  assert.ok(detail.photos.some(photo=>photo.room_type_id==='102'&&photo.url==='/app-icon.svg'));
  assert.match(await (await get('/stay/amber-house',200)).text(),/Amber House/);
  const seo=await (await get('/api/seo?type=stay&slug=amber-house',200)).text();
  assert.match(seo,/Amber House/);
  assert.doesNotMatch(seo,/product:price:amount|"price"\s*:\s*(?:999|700)\b|₹(?:999|700)\b/,
    'SEO must not revive a listing-level or foreign-property price');
  assert.equal((await (await get('/api/v2/stays/no-offer-house',200)).json()).price,null);
  assert.equal((await (await get('/api/v2/stays/blue-house',200)).json()).price,null);

  browser=await chromium.launch({headless:true});
  for(const width of [1280,360]){
    const context=await browser.newContext({viewport:{width,height:800},serviceWorkers:'block'});
    const page=await context.newPage();
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const card=page.getByRole('button',{name:'View Amber House stay'});
    try{await card.waitFor({state:'visible',timeout:15000});}
    catch(error){throw new Error(`W1 browser ${width} card missing: ${error.message}; body=${(await page.locator('body').innerText()).slice(0,800)}; server=${serverOutput.join('').slice(-800)}`);}
    await page.getByText('Rooms from',{exact:false}).first().waitFor({state:'visible'});
    await card.focus();await page.keyboard.press('Enter');
    await page.waitForURL('**/stay/amber-house',{timeout:15000});
    await page.getByText('Amber House',{exact:false}).first().waitFor({state:'visible',timeout:15000});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByText('Amber House',{exact:false}).first().waitFor({state:'visible',timeout:15000});
    const selected=page.locator(`button[data-offer-id="${royalA}"]`).first();
    await selected.waitFor({state:'attached',timeout:15000});
    const other=page.locator(`button[data-offer-id="${royalB}"]`).first();
    await other.waitFor({state:'attached',timeout:15000});
    const datedCopy=width===1280?'Accepted per room night for stays from':'Stay window';
    await page.getByText(datedCopy,{exact:false}).filter({visible:true}).first()
      .waitFor({state:'visible',timeout:15000});
    const detailText=await page.locator('body').innerText();
    assert.match(detailText,/Accepted per room night|Stay window/,'Guest price must carry its dated scope');
    const checkout=page.getByRole('button',{name:/^(?:Online )?Booking (?:is )?being prepared$/i}).first();
    await checkout.waitFor({state:'visible',timeout:15000});
    assert.equal(await checkout.isDisabled(),true,'Accepted offer must not activate checkout');
    const secondCollection=page.getByRole('button',{name:'02 · Royal Suite',exact:true});
    await secondCollection.focus();await page.keyboard.press('Enter');
    assert.equal(await secondCollection.getAttribute('aria-pressed'),'true',
      'Keyboard room selection must preserve the second same-name canonical identity');
    if(width===1280){assert.equal(await other.getAttribute('aria-pressed'),'true');}
    // Hero and collage entrance transforms should settle before checking the
    // actual document width; transient animation bounds are not page overflow.
    await page.waitForTimeout(1000);
    const {overflow,offenders}=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-window.innerWidth,
      offenders:[...document.querySelectorAll('body *')].map(element=>({tag:element.tagName,
        cls:String(element.className).slice(0,80),right:Math.round(element.getBoundingClientRect().right)}))
        .filter(item=>item.right>innerWidth+2).slice(0,6),
    }));
    assert.ok(overflow<=2,`${width}px W1 detail overflow ${overflow}px: ${JSON.stringify(offenders)}`);
    assert.deepEqual(pageErrors,[],`${width}px page errors: ${pageErrors.join(' | ')}`);
    await page.goto(`${base}/stay/no-offer-house`,{waitUntil:'domcontentloaded'});
    await page.getByText('Price unavailable',{exact:true}).filter({visible:true}).first()
      .waitFor({state:'visible',timeout:15000});
    await page.goto(`${base}/stay/blue-house`,{waitUntil:'domcontentloaded'});
    await page.getByText('Price unavailable',{exact:true}).filter({visible:true}).first()
      .waitFor({state:'visible',timeout:15000});
    await context.close();
  }
  await owner.query('ALTER TABLE sellable_offer_revisions RENAME TO sellable_offer_revisions_w1_outage');
  try{
    await get('/stay/amber-house',503);
    await get('/api/listings?city=W1%20Built%20City',503);
  }finally{await owner.query('ALTER TABLE sellable_offer_revisions_w1_outage RENAME TO sellable_offer_revisions');}
  console.log(JSON.stringify({receipt:'W1_BUILT_JOURNEY_PASS',source:'offline built artifact',
    database:'fresh disposable PostgreSQL',viewports:[1280,360],directHttp:true,
    canonicalRoomIds:['101','102'],acceptedOfferIds:[royalA,royalB],
    keyboard:true,retiredOfferWithheld:true,noOfferWithheld:true,authorityFailure:true}));
}catch(error){
  console.error(error);console.error(serverOutput.join('').slice(-2500));process.exitCode=1;
}finally{
  await browser?.close();
  if(child&&child.exitCode===null&&child.signalCode===null){
    const exited=new Promise(resolve=>child.once('exit',resolve));
    child.kill('SIGTERM');
    await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,3000))]);
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  }
  await fixture.close();
}
