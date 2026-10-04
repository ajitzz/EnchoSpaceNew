/** Built-server W0 receipt against a fresh Unix-socket PostgreSQL cluster.
 * Run after build:offline with `node --import tsx scripts/testing/w0-built-journey.mjs`.
 * This script deliberately does not read dotenv or connect to a remote target.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import pg from 'pg';
import {chromium} from '@playwright/test';
import {createLocalPostgresFixture} from '../../src/test/harvo/postgres.ts';

const fixture = await createLocalPostgresFixture({schema:'empty'});
const {pool} = fixture;
let child;
let browser;
const serverOutput=[];
try {
  const source=readFileSync(new URL('../../src/test/setup.ts',import.meta.url),'utf8');
  const baseline=source.match(/const baselineSql = `([\s\S]*?)`;/)?.[1];
  assert.ok(baseline,'Current disposable test schema must be present');
  await pool.query(baseline);
  await pool.query(`INSERT INTO users (id,email,name) VALUES (10,'w0-host@example.invalid','W0 host'),
    (11,'w0-other@example.invalid','Other host')`);
  await pool.query(`INSERT INTO listings
    (id,user_id,title,description,slug,publication_status,price,currency,type,city,address,image_url,image_urls,rooms,lat,lng)
    VALUES (9101,10,'W0 Built Stay','Verified public stay. Call +91 9876543210','w0-built-stay-9101','published',9999,'INR','Villa',
      'W0 Built City','Private road 19','https://media.encho.test/unapproved.jpg','["https://media.encho.test/unapproved.jpg"]','[]',11.6,76.1),
    (9102,10,'W0 Missing Media','No approved photograph.','w0-missing-media-9102','published',9999,'INR','Villa',
      'W0 Built City','Private road 20','','[]','[]',null,null),
    (9103,11,'Other Host Draft','Private draft.','other-host-draft-9103','draft',9999,'INR','Villa',
      'W0 Built City','Private road 21','https://media.encho.test/private.jpg','[]','[]',12,77),
    (9104,10,'Call +91 9876543210','Private contact.','call-91-9876543210-9104','published',9999,'INR','Villa',
      'W0 Private City','','','[]','[]',null,null)`);
  await pool.query(`INSERT INTO listings
    (id,user_id,title,slug,publication_status,price,currency,type,city,rental_mode,amenities)
    VALUES (9300,10,'W0 Hybrid Stay','w0-hybrid-stay-9300','published',9999,'INR','Villa',
      'W0 Hybrid City','hybrid','[]'::jsonb)`);
  const room=(await pool.query(`INSERT INTO room_types (listing_id,name,type,base_price,currency,max_occupancy)
    VALUES (9101,'Verified Room','suite',9999,'INR',2) RETURNING id`)).rows[0].id;
  const hybridRooms=(await pool.query(`INSERT INTO room_types (listing_id,name,type,base_price,currency,max_occupancy,amenities)
    VALUES (9300,'AC Suite','suite',9999,'INR',2,'["Air conditioning","Ensuite"]'::jsonb),
           (9300,'Plain Suite','suite',9999,'INR',2,'[]'::jsonb) RETURNING id,name`)).rows;
  await pool.query(`INSERT INTO media_assets (entity_type,entity_id,url,room_type_id,moderation_status,is_hero)
    VALUES ('listing',9300,'/logo.svg',$1,'approved',true),
           ('listing',9300,'/app-icon.svg',$2,'approved',false)`, [hybridRooms[0].id,hybridRooms[1].id]);
  await pool.query(`INSERT INTO media_assets (entity_type,entity_id,url,room_type_id,moderation_status,is_hero)
    VALUES ('listing',9101,$1,$2,'approved',true),
      ('listing',9101,'https://media.encho.test/unapproved.jpg',$2,'pending_review',false)`,
    ['/logo.svg',room]);

  const {host,port:pgPort,user,database}=pool.options;
  const databaseUrl=`postgresql://${encodeURIComponent(user)}@localhost:${pgPort}/${database}?host=${encodeURIComponent(host)}`;
  const independentPool=new pg.Pool({connectionString:databaseUrl});
  try {assert.equal((await independentPool.query('SELECT 1 AS ok')).rows[0].ok,1);}
  finally {await independentPool.end();}

  const port=await new Promise((resolve,reject)=>{
    const socket=createServer(); socket.once('error',reject);
    socket.listen(0,'127.0.0.1',()=>{const value=socket.address().port;socket.close(()=>resolve(value));});
  });
  const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp',
    TMPDIR:process.env.TMPDIR||'/tmp',NODE_ENV:'production',DATABASE_URL:databaseUrl,
    JWT_SECRET:'w0-disposable-built-server-secret',PORT:String(port),
    ALLOWED_ORIGINS:`http://127.0.0.1:${port}`};
  child=spawn(process.execPath,['build/server/server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{
    serverOutput.push(String(chunk)); if(serverOutput.length>80)serverOutput.shift();
  });
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    if(child.exitCode!==null)break;
    try {if((await fetch(`${base}/api/health/live`)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,`Built server did not start: ${serverOutput.join('').slice(-1200)}`);
  const get=async(path,expected)=>{
    const response=await fetch(base+path,{redirect:'manual'});
    if(response.status!==expected) throw new Error(`${path}: expected ${expected}, got ${response.status}: ${await response.text()}`);
    return response;
  };
  const direct=await get('/stay/w0-built-stay-9101',200);
  const directHtml=await direct.text();
  assert.match(directHtml,/W0 Built Stay/);
  assert.doesNotMatch(directHtml,/unapproved\.jpg|Private road 19|9876543210|product:price:amount/);
  assert.doesNotMatch(await (await get('/api/seo?type=stay&slug=w0-built-stay-9101',200)).text(),/9876543210/);
  assert.equal((await get('/stay/call-91-9876543210-9104',301)).headers.get('location'),'/stay/_s-9104');
  const safeAliasHtml=await (await get('/stay/_s-9104',200)).text();
  assert.doesNotMatch(safeAliasHtml,/9876543210/);
  assert.match(safeAliasHtml,/https:\/\/www\.encho\.co\.in\/stay\/_s-9104/);
  const catalogue=await (await get('/api/listings?city=W0%20Built%20City',200)).json();
  assert.deepEqual(catalogue.map(row=>row.id),['9102','9101']);
  assert.equal(catalogue[1].price,null);
  assert.equal(catalogue[1].rooms[0].id,String(room));
  assert.equal(catalogue[1].imageUrls.length,1);
  const detail=await (await get('/api/v2/stays/w0-built-stay-9101',200)).json();
  const refresh=await (await get('/api/listings/9101',200)).json();
  for(const view of [catalogue[1],detail,refresh]){
    assert.equal(view.price,null);
    assert.equal(view.rooms[0].id,String(room));
    assert.doesNotMatch(JSON.stringify(view),/unapproved\.jpg|Private road 19|9876543210/);
  }
  assert.equal(detail.photos.find(photo=>photo.room_type_id===String(room))?.url,'/logo.svg');
  assert.equal((await (await get('/api/v2/stays/w0-missing-media-9102',200)).json()).imageUrl,'');
  assert.doesNotMatch(await (await get('/stay/w0-missing-media-9102',200)).text(),/og:image/);
  await get('/api/v2/stays/other-host-draft-9103',404);
  await get('/api/listings/9103',404);

  browser=await chromium.launch({headless:true});
  for(const width of [1280,360]){
    const context=await browser.newContext({viewport:{width,height:800},serviceWorkers:'block'});
    const page=await context.newPage();
    const browserErrors=[];
    page.on('pageerror',error=>browserErrors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400)browserErrors.push(`${response.status()} ${response.url()}`);});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const cardButton=page.getByRole('button',{name:'View W0 Built Stay stay'});
    try {await cardButton.waitFor({state:'visible',timeout:15000});}
    catch(error){throw new Error(`Browser ${width}: ${error.message}; body=${(await page.locator('body').innerText()).slice(0,700)}; errors=${browserErrors.slice(0,5).join(' | ')}`);}
    await cardButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/stay/w0-built-stay-9101',{timeout:15000});
    await page.getByText('W0 Built Stay',{exact:false}).first().waitFor({state:'visible',timeout:15000});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByText('W0 Built Stay',{exact:false}).first().waitFor({state:'visible',timeout:15000});
    // Wait for the detail gallery's entrance transform before checking layout.
    await page.waitForTimeout(1000);
    const detailText=await page.locator('body').innerText();
    assert.match(detailText,/Availability (?:is not confirmed|unconfirmed)/i);
    assert.doesNotMatch(detailText,/\b0 rooms? reported available\b/i);
    await page.getByRole('button',{name:'View Verified Room photo 1'}).waitFor({state:'visible',timeout:15000});
    const {overflow,offenders}=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-window.innerWidth,
      offenders:[...document.querySelectorAll('body *')].map(element=>({
        tag:element.tagName,cls:String(element.className).slice(0,100),right:Math.round(element.getBoundingClientRect().right)
      })).filter(item=>item.right>innerWidth+2).slice(0,8)
    }));
    assert.ok(overflow<=2,`${width}px viewport has ${overflow}px blocking overflow: ${JSON.stringify(offenders)}`);
    await page.goto(`${base}/stay/w0-missing-media-9102`,{waitUntil:'domcontentloaded'});
    await page.getByText('W0 Missing Media',{exact:false}).first().waitFor({state:'visible',timeout:15000});
    const missingMediaSources=await page.locator('img').evaluateAll(images=>images.map(image=>image.getAttribute('src')||''));
    assert.ok(missingMediaSources.every(src=>!src.includes('unsplash')&&!src.includes('unapproved.jpg')),
      'Missing-media detail must not inject stock or unapproved imagery');
    await context.close();
  }
  const filterPage=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});
  await filterPage.goto(base+'/',{waitUntil:'domcontentloaded'});
  await filterPage.getByRole('button',{name:'Space Mode',exact:true}).click();
  await filterPage.getByRole('button',{name:'Private Room',exact:true}).click();
  await filterPage.getByRole('button',{name:'Apply',exact:true}).click();
  await filterPage.getByRole('button',{name:'View W0 Hybrid Stay - AC Suite stay'}).waitFor({state:'visible'});
  assert.equal(await filterPage.getByRole('button',{name:'View W0 Hybrid Stay stay'}).count(),0);
  const mapHero=filterPage.locator('div.absolute.bottom-6.left-6 img').first();
  assert.match(await mapHero.getAttribute('src'),/logo\.svg/);
  await filterPage.getByRole('button',{name:'Plain Suite',exact:true}).click();
  assert.match(await mapHero.getAttribute('src'),/app-icon\.svg/,
    'Map media must follow the selected canonical room');
  await filterPage.getByRole('button',{name:'Filters',exact:true}).click();
  await filterPage.getByRole('checkbox',{name:/Must have AC/}).check();
  await filterPage.getByRole('button',{name:'Show places'}).click();
  await filterPage.getByRole('button',{name:'View W0 Hybrid Stay - AC Suite stay'}).waitFor({state:'visible'});
  assert.equal(await filterPage.getByRole('button',{name:'View W0 Hybrid Stay - Plain Suite stay'}).count(),0);
  assert.equal(await filterPage.getByRole('button',{name:'Plain Suite',exact:true}).count(),0,
    'Map room selector must not revive a filtered-out room');
  await filterPage.getByRole('button',{name:'AC Suite',exact:true}).waitFor({state:'visible'});
  await filterPage.getByRole('button',{name:'Space Mode Active',exact:true}).click();
  await filterPage.getByRole('button',{name:'Entire Space',exact:true}).click();
  await filterPage.getByRole('button',{name:'Apply',exact:true}).click();
  await filterPage.getByRole('button',{name:'View W0 Hybrid Stay stay'}).waitFor({state:'visible'});
  assert.equal(await filterPage.getByRole('button',{name:'View W0 Hybrid Stay - AC Suite stay'}).count(),0);
  await filterPage.close();
  const mobileMap=await browser.newPage({viewport:{width:360,height:800},serviceWorkers:'block'});
  await mobileMap.goto(base+'/',{waitUntil:'domcontentloaded'});
  await mobileMap.getByRole('button',{name:'Space Mode',exact:true}).click();
  await mobileMap.getByRole('button',{name:'Private Room Only',exact:true}).click();
  await mobileMap.getByRole('button',{name:'Show places',exact:true}).click();
  await mobileMap.getByRole('button',{name:'Show map'}).click();
  await mobileMap.getByRole('button',{name:'Select Plain Suite for W0 Hybrid Stay'}).click();
  const mobileMapDetail=mobileMap.getByRole('button',{name:'View W0 Hybrid Stay stay'});
  await mobileMapDetail.focus();
  await mobileMap.keyboard.press('Enter');
  await mobileMap.waitForURL('**/stay/w0-hybrid-stay-9300',{timeout:15000});
  await mobileMap.getByText('Plain Suite',{exact:false}).first().waitFor({state:'visible',timeout:15000});
  assert.match(await mobileMap.locator('body').innerText(),/Plain Suite/);
  await mobileMap.close();
  for(let id=9200;id<9226;id++) await pool.query(`INSERT INTO listings
    (id,user_id,title,slug,publication_status,price,currency,type,city,address,image_urls,rooms)
    VALUES ($1,10,$2,$3,'published',9999,'INR','Villa','W0 Built City','','[]','[]')`,
    [id,`Page fixture ${id}`,`page-fixture-${id}`]);
  const catalogueContext=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const cataloguePage=await catalogueContext.newPage();
  await cataloguePage.goto(base+'/',{waitUntil:'domcontentloaded'});
  const loadMore=cataloguePage.getByRole('button',{name:'Show more stays'});
  await loadMore.waitFor({state:'visible',timeout:15000});
  assert.equal(await cataloguePage.getByRole('button',{name:'View W0 Built Stay stay'}).count(),0);
  await loadMore.click();
  await cataloguePage.getByRole('button',{name:'View W0 Built Stay stay'}).waitFor({state:'visible',timeout:15000});
  await catalogueContext.close();
  await pool.query('ALTER TABLE room_types RENAME TO room_types_w0_outage');
  try {
    await get('/stay/w0-built-stay-9101',503);
    await get('/api/listings?city=W0%20Built%20City',503);
    const unavailable=await browser.newPage();
    const unavailableResponse=await unavailable.goto(`${base}/stay/w0-built-stay-9101`);
    assert.equal(unavailableResponse?.status(),503);
    assert.match(await unavailable.locator('body').innerText(),/temporarily unavailable/i);
    await unavailable.close();
  } finally {await pool.query('ALTER TABLE room_types_w0_outage RENAME TO room_types');}
  console.log(JSON.stringify({receipt:'W0_BUILT_JOURNEY_PASS',source:'production-shaped local artifact',
    database:'fresh disposable PostgreSQL',viewports:[1280,360],directHttp:true,keyboard:true,pagination:true,
    filteredCardPresentation:true,safePublicSlug:true,
    publicationNegative:true,authorityFailure:true}));
} catch(error){
  console.error(error);
  console.error(serverOutput.join('').slice(-2000));
  process.exitCode=1;
} finally {
  await browser?.close();
  if(child){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  await fixture.close();
}
