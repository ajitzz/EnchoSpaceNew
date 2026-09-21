import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
const out=await mkdtemp(join(tmpdir(),'encho-adtech-browser-'));
await build({entryPoints:['scripts/testing/adtech-browser/entry.tsx'],outdir:out,bundle:true,format:'esm',platform:'browser',loader:{'.png':'dataurl'},define:{'import.meta.env':'{}','process.env.NODE_ENV':'"test"'},logLevel:'silent'});
await writeFile(join(out,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated AdTech verification</title><link rel="stylesheet" href="/entry.css"><body style="margin:0"><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');
const server=createServer(async(req,res)=>{const name= req.url==='/entry.js'?'entry.js':req.url==='/entry.css'?'entry.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(out,name)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const configs=JSON.parse((await readFile('src/migrations/032_marketing_adtech_registry.sql','utf8')).split('$profiles$')[1]);
const browser=await chromium.launch({headless:true});let passed=0;
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
 let research={jobs:[{id:1,destination_name:'Wayanad',provider:'META',state:'DONE',attempts:1,fence:1}],proposals:[{id:1,destination_name:'Wayanad',tier_code:'BUDGET',provider:'META',state:'PROPOSED',content_hash:'c'.repeat(64),content:{destination:{districtName:'Wayanad'},geography:[{kind:'PROVIDER_CITY_RADIUS',label:'Bengaluru',latitude:12.97,longitude:77.59,radiusKm:30}],feeders:[{city:'Bengaluru',radiusKm:30,rationale:'Synthetic feeder hypothesis requiring review.'}],assumptions:['Provider identity verified; commercial suitability requires review.']}}]};
 let data={profiles:configs.map((config,i)=>({id:i+1,version:1,version_id:i+1,tier_code:config.tier,config,capabilityIssues:{META:[],GOOGLE:[]}})),versions:configs.map((config,i)=>({id:i+1,config})),currentReleaseId:1,releases:[{id:1,reason:'Synthetic fixture release',version_ids:[1,2,3]}],audits:[]};
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  let result;
  if(url.pathname==='/api/auth/me')result={user:{id:10,name:'Synthetic host',role:'host'}};
  else if(url.pathname.endsWith('/workspace'))result={campaigns:[],listings:[{id:20,title:'Synthetic Garden Villa',slug:'synthetic-garden-villa',city:'Wayanad',publicationStatus:'published',media:[{id:'100',url:origin+'/fixture-image.png',type:'IMAGE',approved:true}]}],policy:{currency:'INR',markupPercent:5,configured:false},capabilities:{adtech:true,funding:false,publish:false,activate:false}};
  else if(url.pathname.endsWith('/destination-pools'))result={pools:[]};
  else if(url.pathname.endsWith('/languages'))result={languages:[{resourceName:'languageConstants/1000',name:'English',code:'en'}]};
  else if(url.pathname.endsWith('/targeting-defaults'))result={provider:url.searchParams.get('provider'),tier:'BUDGET',price:{version:1,listingId:20,currency:'INR',amountMinor:'350000',basis:'ENTIRE_STAY_BASE_NIGHT',roomTypeId:null,sourceHash:'a'.repeat(64),observedAt:'2026-09-22T00:00:00.000Z'},budget:configs[0].budget,limits:configs[0].hostOverrides,selection:{releaseId:1,profileVersionId:1,corridorVersionId:1,priceHash:'a'.repeat(64),overrides:[]},geography:[{kind:'PROVIDER_CITY_RADIUS',label:'Bengaluru',latitude:12.97,longitude:77.59,radiusKm:30,evidenceHash:'b'.repeat(64)},{kind:'PROVIDER_REGION_EXCLUSION',label:'Wayanad',evidenceHash:'c'.repeat(64)}],assumptions:['Budget recommendations are hypotheses.']};
  else if(url.pathname.endsWith('/marketing-facts'))result={factHash:'a'.repeat(64),facts:[]};
  else if(url.pathname.endsWith('/spatial-stories'))result=[];
  else if(url.pathname.endsWith('/creatives'))result={items:[],page:{nextCursor:null}};
  else if(url.pathname.endsWith('/corridors'))result={corridors:[{id:1,name:'Wayanad',district_name:'Wayanad'}],versions:[],published:[]};
  else if(url.pathname.endsWith('/inference/1/review')){const body=req.postDataJSON();if(body.expectedHash!=='c'.repeat(64)||body.expectedVersion!==0)throw new Error('Invalid research review binding');research.proposals[0].state='APPROVED';result={state:'APPROVED'};}
  else if(url.pathname.endsWith('/inference'))result=research;
  else if(req.method()==='PUT') {const body=req.postDataJSON();if(body.expectedVersion!==data.profiles[0].version)throw new Error('CAS mismatch in browser request');data.profiles[0]={...data.profiles[0],version:2,version_id:4,config:body.profile};data.versions.push({id:4,config:body.profile});result={id:4};}
  else if(req.method()==='POST'){const body=req.postDataJSON();if(body.expectedReleaseId!==1||JSON.stringify(body.versionIds)!=='[4,2,3]')throw new Error('Incorrect release request');data.currentReleaseId=2;data.releases.unshift({id:2,reason:body.reason,version_ids:body.versionIds});result={id:2};}
  else result=data;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(origin);await page.getByRole('button',{name:'BUDGET · v1'}).waitFor();
 if(!await page.getByRole('button',{name:'Publish reviewed saved versions'}).isDisabled())throw new Error('Missing reason guard');passed++;
 await page.getByLabel('Maximum age',{exact:true}).fill('34');await page.getByLabel('Reason for change',{exact:true}).fill('Browser verified future strategy adjustment');await page.getByRole('button',{name:'Save immutable profile version'}).click();await page.getByRole('button',{name:'BUDGET · v2'}).waitFor();passed++;
 await page.getByText('Compare published and proposed profiles').click();await page.getByLabel('Reason for change',{exact:true}).fill('Publish reviewed saved fixture profiles');await page.getByRole('button',{name:'Publish reviewed saved versions'}).click();await page.getByText('Current release #2.',{exact:false}).waitFor();passed++;
 await page.reload();await page.getByText('Current release #2.',{exact:false}).waitFor();passed++;
 await page.getByRole('button',{name:'Corridors',exact:true}).click();await page.screenshot({path:join(out,`corridor-open-${width}.png`),fullPage:true});await page.getByLabel('Destination',{exact:true}).selectOption('1');await page.getByText('Required exclusion: Wayanad district').waitFor();await page.getByLabel('Radius for new feeder · km').fill('30');await page.getByText('Add a public coordinate feeder').click();await page.getByLabel('Feeder label',{exact:true}).fill('Synthetic public feeder');await page.getByLabel('Latitude',{exact:true}).fill('12.97');await page.getByLabel('Longitude',{exact:true}).fill('77.59');await page.getByRole('button',{name:'Add coordinate feeder'}).click();await page.getByText('Synthetic public feeder · 30 km').waitFor();passed++;
 await page.keyboard.press('Tab');if(!await page.evaluate(()=>document.activeElement!==document.body))throw new Error('Keyboard focus unavailable');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw new Error(`Horizontal overflow at ${width}`);if(errors.length)throw new Error(errors.join('\n'));passed++;
 await page.screenshot({path:join(out,`corridors-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Research',exact:true}).click();await page.getByText('Review status: PROPOSED').waitFor();if(!await page.getByRole('button',{name:'Approve as saved corridor version'}).isDisabled())throw new Error('Review missing reason guard');passed++;
 await page.getByLabel('Review reason for Wayanad').fill('Verified synthetic feeder and exclusion evidence.');await page.getByRole('button',{name:'Approve as saved corridor version'}).click();await page.getByText('Review status: APPROVED').waitFor();passed++;if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw new Error('Research mobile overflow');await page.screenshot({path:join(out,`research-${width}.png`),fullPage:true});
 await page.goto(origin+'/host');await page.getByRole('button',{name:'Create a campaign',exact:true}).click();await page.getByLabel('Property',{exact:true}).selectOption('20');await page.getByRole('radio',{name:/Facebook/}).check();await page.getByText('Budget-friendly audience plan').waitFor();passed++;
 await page.getByLabel('Campaign name',{exact:true}).fill('Synthetic garden campaign');await page.getByText('Adjust audience locations',{exact:true}).click();await page.getByRole('slider').fill('40');await page.getByText('Bengaluru radius · 40 km').waitFor();if(!await page.getByRole('checkbox',{name:'Bengaluru',exact:true}).isDisabled())throw new Error('Last feeder can be removed');passed++;
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Prepare a plan from this property'}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByText('Total media budget · INR',{exact:true}).waitFor();if(await page.getByLabel('Total media budget · INR',{exact:true}).inputValue()!=='1500.00')throw new Error('Server budget preset differs');passed++;
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw new Error(`Host horizontal overflow at ${width}`);if(errors.length)throw new Error(errors.join('\n'));passed++;
 await page.screenshot({path:join(out,`host-${width}.png`),fullPage:true});await page.close();
 }console.log(JSON.stringify({scenariosPassed:passed,viewports:[1440,390],externalNetwork:'blocked',artifacts:out}));}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
