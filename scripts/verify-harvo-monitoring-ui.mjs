import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

// Production components, local fixture transport only. No app startup, .env, DB or provider.
const directory=mkdtempSync(join(tmpdir(),'encho-monitoring-browser-'));
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';
import {MeasurementChoices} from './components/marketing/MeasurementChoices';import {DestinationPools} from './components/marketing/DestinationPools';import DestinationCollection from './components/marketing/DestinationCollection';import {PublicSpatialStory} from './components/marketing/PublicSpatialStory';import {SpatialStoryWorkspace} from './components/marketing/SpatialStoryWorkspace';import {EconomicsPreflight} from './components/marketing/PreflightPanel';import {KeywordResearchPanel} from './components/marketing/KeywordResearchPanel';import Calendar from './components/HostCalendar';import Studio from './components/marketing/CampaignStudio';import Admin from './components/marketing/AdminMarketingWorkspace';
const screen=new URLSearchParams(location.search).get('screen');
createRoot(document.getElementById('root')).render(screen==='measurement'?<MeasurementChoices/>:screen==='collection'?<DestinationCollection destination="wayanad" onBack={()=>{}}/>:screen==='story'?<PublicSpatialStory slug="lake-house"/>:screen==='editorial'?<div className="mkt-studio"><SpatialStoryWorkspace listingId={20} admin/></div>:screen==='pools'?<div className="mkt-studio"><DestinationPools admin listings={[{id:20,title:'Lake House',slug:'lake-house',publicationStatus:'published',media:[]}]}/></div>:screen==='planning'?<div className="mkt-studio"><EconomicsPreflight listingId={20} mediaBudgetMinor="100000" flightDays={6}/></div>:screen==='research'?<div style={{maxWidth:760,margin:'20px auto',padding:16}}><KeywordResearchPanel listingId="20" geoIds={['geoTargetConstants/2356']} languageIds={['languageConstants/1000']} keywords={[]} onSelect={text=>{document.getElementById('selected').textContent=text;}}/><p id="selected"></p></div>:screen==='calendar'?<Calendar listings={[{id:20,title:'Lake House'},{id:21,title:'Hill House'}]}/>:screen==='admin'?<Admin/>:<Studio/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:join(directory,'app.js'),platform:'browser',jsx:'automatic',plugins:[{name:'fixture-auth',setup(plugin){plugin.onResolve({filter:/AuthContext(?:\.js)?$/},()=>({path:'fixture-auth',namespace:'fixture'}));plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const useAuth=()=>({token:'isolated-ui-fixture'});",loader:'js'}));}}]});
const stamp=new Date().toISOString(),start=stamp.slice(0,8)+'01';
const campaign={id:1,revision:2,listingId:20,title:'Lake House September',listingTitle:'Lake House',hostName:'Fixture host',provider:'GOOGLE',status:'RECONCILIATION_REQUIRED',startDate:start,endDate:stamp.slice(0,8)+'28',stayStartDate:start,stayEndDate:stamp.slice(0,8)+'28',headline:'A quiet stay by the lake',description:'Explore the property and available dates on Encho.',mediaIds:[],locations:['India'],mediaBudgetMinor:'100000',ai:{status:'PASSED',score:9,notes:[]},quote:{currency:'INR',costMinor:'100000',markupPercent:5,profitMinor:'5000',totalMinor:'105000',status:'ACCEPTED',lines:[{label:'Google media',amountMinor:'100000'},{label:'Encho markup',amountMinor:'5000'}]},funding:{status:'CAPTURED',capturedMinor:'105000',reservedMinor:'100000',released:true},contentApproval:{status:'APPROVED',revision:2},delivery:{submitted:true,configuredStatus:'ACTIVE',observedStatus:'UNKNOWN',observedAt:stamp,externalCampaignId:'fixture-campaign',deliveryConfirmed:false},blockers:['Recorded provider outcome requires review.'],metrics:{impressions:1000,clicks:20,ctr:.02,leads:null,bookings:null,spendMinor:'20000',currency:'INR',source:'GOOGLE',dateStart:start,dateEnd:stamp.slice(0,10),observedAt:stamp,dataAsOf:null,report:{status:'AVAILABLE',attemptedAt:stamp,dateStart:start,dateEnd:stamp.slice(0,10)}}};
const workspace={listings:[{id:20,title:'Lake House',slug:'lake-house',publicationStatus:'published',media:[]}],campaigns:[campaign],policy:{currency:'INR',markupPercent:5,configured:false,costItems:[]},capabilities:{funding:false,publish:false,activate:false,reason:'Isolated browser fixture. No financial or network actions are enabled.',metaCountries:[]}};
Object.assign(campaign.delivery,{readiness:'ELIGIBLE',statusCheck:'AVAILABLE',statusAttemptedAt:stamp});
campaign.firstPartyOutcomes={scope:'CAMPAIGN_ALL_REVISIONS',completeness:'RECORDED_EVENTS_ONLY',source:'ENCHO_CONSENTED_EVENTS',observedAt:stamp,propertyVisits:'12',lastInquiryAt:stamp,inquiries:'3',bookings:null,unreadMessages:'2'};
const storyCards=['vistas','suites','wellness','grounds'].map((section,index)=>({section,title:['Garden view','Lake bedroom','Quiet terrace','Courtyard'][index],image:{url:'/fixture-image.svg'}}));
const fixturePool={id:'10000000-0000-4000-8000-000000000001',destination:'wayanad',title:'Considered Wayanad stays',state:'OPEN',version:2,startsAt:stamp,endsAt:stamp,stayStart:start,stayEnd:stamp.slice(0,10),members:[{id:'20000000-0000-4000-8000-000000000001',listingId:20,listingTitle:'Lake House',state:'CONSENTED',version:2,campaignId:1,contributionMinor:'100000',servedExposures:0,factHash:'a'.repeat(64),hasReservation:false}]};
const requests=[];
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');const send=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname.startsWith('/api/')){
  requests.push({path:url.pathname,method:req.method});
  if(url.pathname.endsWith('/marketing-facts'))return send({factHash:'a'.repeat(64),facts:[{id:'b'.repeat(64),field:'name',value:'Garden view'}]});
  if(url.pathname.endsWith('/spatial-story'))return send({cards:storyCards.map(c=>({...c,image:c.image.url}))});
  if(url.pathname.endsWith('/spatial-stories'))return send([{id:'fixture-story',manifestHash:'a'.repeat(64),decision:'PENDING',manifest:{cards:storyCards}}]);
  if(url.pathname==='/api/explore/wayanad')return send({title:fixturePool.title,allocation:'Sponsored collection · featured placement rotates by contribution. Ad-network impressions are not guaranteed.',items:[{title:'Lake House',path:'/stay/lake-house',city:'Wayanad',image:'/fixture-image.svg',featured:true},{title:'Garden Villa',path:'/stay/garden-villa',city:'Wayanad',image:'/fixture-image.svg',featured:false}]});
  if(url.pathname.endsWith('/destination-pools'))return send({pools:[fixturePool],capabilities:{funding:false}});
  if(url.pathname.endsWith('/preflight/economics'))return send({currency:'INR',nightlyRateMinor:'500000',grossBookingRevenueMinor:'1000000',contributionBeforeAdvertisingMinor:'400000',plannedAcquisitionCostMinor:'100000',breakEvenAcquisitionCostMinor:'400000',dailyScenarioRangeMinor:{low:'16666',high:'33333'},warning:'SCENARIO_ONLY',explanation:'A planning scenario, not a booking forecast.'});
  if(url.pathname.endsWith('/preflight'))return send({status:'POSSIBLE_OVERLAP',observedAt:stamp,message:'Another campaign may reach similar searches. This advisory does not block your campaign.'});
  if(url.pathname.endsWith('/measurement/session'))return send({status:'READY'});
  if(url.pathname.endsWith('/measurement/visit'))return send({eventId:'30000000-0000-4000-8000-000000000001'},201);
  if(url.pathname.endsWith('/measurement/revoke'))return send({status:'REVOKED'});
  if(url.pathname.endsWith('/keyword-ideas'))return send({status:'AVAILABLE',cached:false,evidence:{source:'GOOGLE_KEYWORD_PLAN_IDEA',apiVersion:'v25',currency:'INR',historical:true,observedAt:stamp,truncated:false,ideas:[{text:'garden villa weekend stay',averageMonthlySearches:'2400',competition:'MEDIUM',competitionIndex:47,lowTopOfPageBidMicros:'25000000',highTopOfPageBidMicros:'45000000',monthlySearchVolumes:[]},{text:'quiet private stay',averageMonthlySearches:null,competition:'UNKNOWN',competitionIndex:null,lowTopOfPageBidMicros:null,highTopOfPageBidMicros:null,monthlySearchVolumes:[]}]}});
  if(url.pathname.endsWith('/workspace'))return send({...workspace,campaigns:workspace.campaigns.map(value=>url.pathname.includes('/admin/')?value:{...value,delivery:{...value.delivery,externalCampaignId:null}})});
  if(url.pathname.endsWith('/portfolio-shadow'))return send({id:'fixture-shadow-receipt',created_at:stamp,evidence:{mode:'SHADOW_ONLY',blocking:false,candidateCount:1,truncated:false,skippedCampaignIds:[],conflicts:[{campaignId:2,revision:1,sharedKeywords:['garden villa'],sharedGeoConstants:['geoTargetConstants/2356'],sharedLanguages:['languageConstants/1000'],confidence:'SHARED_EXPLICIT_SCOPE'}],limitations:['Identical normalized terms only; this is not proof of auction harm.']}});
  if(url.pathname.endsWith('/portfolio-assessments/fixture-shadow-receipt/reviews'))return send({id:'fixture-evidence-review'},201);
  if(url.pathname.endsWith('/settlement'))return send({status:'NOT_STARTED',result:null});
  if(url.pathname.endsWith('/refresh')&&req.method==='POST')return send({status:'PENDING',jobId:'fixture-refresh',coalesced:false});
  if(url.pathname.endsWith('/recovery'))return send({revision:2,observedAt:stamp,assessment:'QUARANTINED_REVIEW_REQUIRED',quoteId:'fixture-quote',automaticRetryAllowed:false,truncated:false,jobs:[{id:'fixture-job',kind:'PAUSE',state:'RECONCILIATION_REQUIRED',attempts:1}],operations:[{id:1,provider:'GOOGLE',operation_type:'PAUSE',publish_status:'COMMITTED',correlation_id:'fixture-correlation'}],entities:[],nextSteps:['Inspect the original pause receipt and read the bound account again.']});
  if(url.pathname.endsWith('/recovery/adopt-pause')&&req.method==='POST'){
   let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{
    const input=JSON.parse(body);
    if(input.revision!==2||input.reason!=='Inspected the original pause receipt in this local fixture.'||!req.headers['idempotency-key'])return send({error:'Invalid fixture recovery intent'},422);
    return send({id:'fixture-recovery-receipt'});
   });return;
  }
  if(url.pathname.endsWith('/room-calendar')){const id=Number(url.pathname.split('/')[3]),from=url.searchParams.get('from'),to=url.searchParams.get('to');const days=[];for(let date=new Date(from);date<new Date(to);date.setUTCDate(date.getUTCDate()+1))days.push({roomTypeId:id,date:date.toISOString().slice(0,10),held:0,booked:0,blocked:0,available:date.getUTCDate()===5?null:2,issue:date.getUTCDate()===5?'UNRESOLVED_LEGACY_BOOKING':null});return send({listingId:id,observedAt:stamp,rooms:[{id,name:'Garden room',inventoryCount:2}],days,blocks:[],bookings:[{id:1,guestName:id===20?'Lake fixture guest':'Hill fixture guest',startDate:from,endDate:to,status:'confirmed',totalPrice:'1000.00'}]});}
  return send({error:'No fixture for this action'},404);
 }
 if(url.pathname==='/fixture-image.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#dce5d9"/><path d="M0 700L400 300L800 800L1000 400L1200 800" fill="#82998a"/><text x="40" y="60" font-size="30" fill="#173c32">Isolated property image fixture</text></svg>');}
 if(url.pathname==='/app.js' ||url.pathname==='/app.css'){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'application/javascript':'text/css'});return res.end(readFileSync(join(directory,url.pathname.slice(1))));}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Encho browser verification</title><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#f7f7f0}.fixture-note{padding:8px 16px;background:#173c32;color:white;font-size:12px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head><body><div class="fixture-note">Local verification fixtures — no live data or financial actions</div><main id="root"></main><script src="/app.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const evidence=[];
try{
 for(const width of [1440,390])for(const screen of ['calendar','host','admin','research','planning','pools','collection','story','editorial','measurement']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('token','isolated-ui-fixture'));
  await page.goto(`${origin}/?screen=${screen}${screen==='measurement'?'&enc_ref=v1.fixture.'+'a'.repeat(43)+'.'+'b'.repeat(43):''}`);
  if(screen==='planning'){
   await page.getByLabel('Retained margin after stay costs, commission and taxes (%)',{exact:true}).fill('40');await page.getByRole('button',{name:'Calculate planning scenario',exact:true}).click();await page.getByText('A planning scenario, not a booking forecast.',{exact:true}).waitFor();
  }else if(screen==='pools'){
   await page.getByRole('button',{name:'Explore destination flights',exact:true}).click();await page.getByRole('heading',{name:fixturePool.title,exact:true}).waitFor();
   await page.getByRole('button',{name:'Read current property facts',exact:true}).click();await page.getByText('name: Garden view',{exact:true}).waitFor();
   if(!await page.getByRole('button',{name:'Record eligibility review',exact:true}).isDisabled())throw new Error('POOL_INDEPENDENT_REVIEW_MISSING');
  }else if(screen==='collection'){
   await page.getByRole('heading',{name:fixturePool.title,exact:true}).waitFor();if(await page.locator('a[href^="/stay/"]').count()!==2)throw new Error('COLLECTION_CANONICAL_LINKS_MISSING');
  }else if(screen==='story'){
   await page.getByRole('heading',{name:'Garden view',exact:true}).waitFor();for(const section of ['vistas','suites','wellness','grounds'])if(await page.locator('#'+section).count()!==1)throw new Error('STORY_ANCHOR_MISSING');
  }else if(screen==='editorial'){
   await page.getByText('Awaiting editorial review',{exact:true}).waitFor();if(!await page.getByRole('button',{name:'Approve exact story',exact:true}).isDisabled())throw new Error('STORY_ATTESTATION_MISSING');
  }else if(screen==='measurement'){
   await page.getByRole('heading',{name:'Your measurement choices',exact:true}).waitFor();
   if(requests.filter(r=>r.path.endsWith('/measurement/visit')).length!==(width===1440?0:1))throw new Error('MEASUREMENT_BEFORE_CONSENT');
   await page.getByRole('button',{name:'Allow measurement',exact:true}).click();await page.getByRole('button',{name:'Measurement choices',exact:true}).click();await page.getByRole('button',{name:'Withdraw permission',exact:true}).click();
   await page.waitForFunction(()=>localStorage.getItem('encho-measurement-choice')==='declined');
   // Reopen with a fresh optional invitation only for the visual artifact.
   await page.evaluate(()=>localStorage.removeItem('encho-measurement-choice'));await page.goto(`${origin}/?screen=measurement&enc_ref=v1.fixture.${'a'.repeat(43)}.${'b'.repeat(43)}`);
  }else if(screen==='research'){
   await page.getByRole('button',{name:'Research keyword ideas'}).click();await page.getByText('2,400',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Add exact phrase: garden villa weekend stay',exact:true}).click();
   if(await page.locator('#selected').textContent()!=='garden villa weekend stay')throw new Error('RESEARCH_SELECTION_FAILED');
  }else if(screen==='calendar'){
   await page.getByText('Lake fixture guest',{exact:true}).waitFor();await page.getByLabel('Property',{exact:true}).selectOption('21');await page.getByText('Hill fixture guest',{exact:true}).waitFor();
   if(await page.getByText('Lake fixture guest',{exact:true}).count())throw new Error('CALENDAR_PREVIOUS_PROPERTY_VISIBLE');
   await page.getByLabel('Scrollable room availability').focus();if(!await page.getByLabel('Scrollable room availability').evaluate(el=>el===document.activeElement))throw new Error('CALENDAR_KEYBOARD_SCROLL_UNREACHABLE');
  }else{
   await page.locator(screen==='admin'?'.mkt-queue-item':'.mkt-campaign-card').filter({hasText:'Lake House September'}).first().click();
   await page.getByRole('progressbar').waitFor();if(screen==='host'&&!await page.getByRole('button',{name:'Request campaign pause',exact:true}).isEnabled())throw new Error('HOST_PAUSE_UNREACHABLE');await page.getByRole('button',{name:'Refresh network evidence',exact:true}).click();await page.getByText(/network refresh is queued/).waitFor();
   await page.getByText('Eligible at the network',{exact:true}).waitFor();
   const identityCount=await page.getByText('fixture-campaign',{exact:true}).count();
   if(identityCount!==(screen==='admin'?1:0))throw new Error('PROVIDER_ID_AUDIENCE_MISMATCH');
   if(screen==='admin'){
    await page.getByRole('button',{name:'Inspect shadow overlap',exact:true}).click();await page.getByText('Campaign 2 · revision 1',{exact:true}).waitFor();
    await page.getByLabel('Evidence reference',{exact:true}).fill('isolated-browser-observation');
    await page.getByLabel('Review notes',{exact:true}).fill('This isolated fixture does not establish live auction harm.');
    await page.getByRole('button',{name:'Record review',exact:true}).click();await page.getByText('Immutable review receipt: fixture-evidence-review',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Inspect recovery',exact:true}).click();await page.getByText(/No external entity is recorded/).waitFor();
    const recover=page.getByRole('button',{name:'Verify and record paused state',exact:true});
    if(!await recover.isDisabled())throw new Error('RECOVERY_REASON_NOT_REQUIRED');
    await page.getByLabel('Investigation reason').fill('Inspected the original pause receipt in this local fixture.');
    await recover.click();await page.getByText(/Audit receipt fixture-recovery-receipt/).waitFor();
   }
  }
  if(errors.length)throw new Error(JSON.stringify({screen,width,errors}));
  const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));if(layout.scroll>layout.viewport+1)throw new Error(`PAGE_OVERFLOW:${screen}:${width}:${layout.scroll}`);
  await page.screenshot({path:join(directory,`${screen}-${width}.png`),fullPage:true});
  evidence.push({screen,width,render:'PASSED',overflow:false,uncaughtErrors:errors});await page.close();
 }
 if(requests.some(r=>r.method!=='GET'&&!r.path.endsWith('/refresh')&&!r.path.endsWith('/recovery/adopt-pause')&&!r.path.endsWith('/keyword-ideas')&&!r.path.endsWith('/portfolio-shadow')&&!r.path.endsWith('/portfolio-assessments/fixture-shadow-receipt/reviews')&&!r.path.endsWith('/preflight/economics')&&!r.path.includes('/measurement/')))throw new Error('UNEXPECTED_MUTATION');
 writeFileSync(join(directory,'verification.json'),JSON.stringify({scope:'LOCAL_FIXTURE_BROWSER_ONLY',evidence,requests},null,2));console.log(JSON.stringify({directory,evidence}));
}finally{await browser.close();await new Promise(r=>server.close(r));rmSync(join(directory,'app.js'));rmSync(join(directory,'app.css'));}
