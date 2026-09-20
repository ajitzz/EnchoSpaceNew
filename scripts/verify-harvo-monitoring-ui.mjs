import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

// Production components, local fixture transport only. No app startup, .env, DB or provider.
const directory=mkdtempSync(join(tmpdir(),'encho-monitoring-browser-'));
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';
import Calendar from './components/HostCalendar';import Studio from './components/marketing/CampaignStudio';import Admin from './components/marketing/AdminMarketingWorkspace';
const screen=new URLSearchParams(location.search).get('screen');
createRoot(document.getElementById('root')).render(screen==='calendar'?<Calendar listings={[{id:20,title:'Lake House'},{id:21,title:'Hill House'}]}/>:screen==='admin'?<Admin/>:<Studio/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:join(directory,'app.js'),platform:'browser',jsx:'automatic',plugins:[{name:'fixture-auth',setup(plugin){plugin.onResolve({filter:/AuthContext(?:\.js)?$/},()=>({path:'fixture-auth',namespace:'fixture'}));plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const useAuth=()=>({token:'isolated-ui-fixture'});",loader:'js'}));}}]});
const stamp=new Date().toISOString(),start=stamp.slice(0,8)+'01';
const campaign={id:1,revision:2,listingId:20,title:'Lake House September',listingTitle:'Lake House',hostName:'Fixture host',provider:'GOOGLE',status:'RECONCILIATION_REQUIRED',startDate:start,endDate:stamp.slice(0,8)+'28',stayStartDate:start,stayEndDate:stamp.slice(0,8)+'28',headline:'A quiet stay by the lake',description:'Explore the property and available dates on Encho.',mediaIds:[],locations:['India'],mediaBudgetMinor:'100000',ai:{status:'PASSED',score:9,notes:[]},quote:{currency:'INR',costMinor:'100000',markupPercent:5,profitMinor:'5000',totalMinor:'105000',status:'ACCEPTED',lines:[{label:'Google media',amountMinor:'100000'},{label:'Encho markup',amountMinor:'5000'}]},funding:{status:'CAPTURED',capturedMinor:'105000',reservedMinor:'100000',released:true},contentApproval:{status:'APPROVED',revision:2},delivery:{configuredStatus:'ACTIVE',observedStatus:'UNKNOWN',observedAt:stamp,externalCampaignId:'fixture-campaign',deliveryConfirmed:false},blockers:['Recorded provider outcome requires review.'],metrics:{impressions:1000,clicks:20,ctr:.02,leads:null,bookings:null,spendMinor:'20000',currency:'INR',source:'GOOGLE',dateStart:start,dateEnd:stamp.slice(0,10),observedAt:stamp,dataAsOf:null,report:{status:'AVAILABLE',attemptedAt:stamp,dateStart:start,dateEnd:stamp.slice(0,10)}}};
const workspace={listings:[{id:20,title:'Lake House',slug:'lake-house',publicationStatus:'published',media:[]}],campaigns:[campaign],policy:{currency:'INR',markupPercent:5,configured:false,costItems:[]},capabilities:{funding:false,publish:false,activate:false,reason:'Isolated browser fixture. No financial or network actions are enabled.',metaCountries:[]}};
const requests=[];
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');const send=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname.startsWith('/api/')){
  requests.push({path:url.pathname,method:req.method});
  if(url.pathname.endsWith('/workspace'))return send(workspace);
  if(url.pathname.endsWith('/settlement'))return send({status:'NOT_STARTED',result:null});
  if(url.pathname.endsWith('/refresh')&&req.method==='POST')return send({status:'PENDING',jobId:'fixture-refresh',coalesced:false});
  if(url.pathname.endsWith('/recovery'))return send({revision:2,observedAt:stamp,assessment:'QUARANTINED_REVIEW_REQUIRED',quoteId:'fixture-quote',automaticRetryAllowed:false,truncated:false,jobs:[{id:'fixture-job',kind:'PUBLISH',state:'RECONCILIATION_REQUIRED',attempts:1}],operations:[{id:1,provider:'GOOGLE',operation_type:'PUBLISH',publish_status:'EXTERNAL_OUTCOME_UNKNOWN',correlation_id:'fixture-correlation'}],entities:[],nextSteps:['Reconcile the original operation and financial reservation before another publication.']});
  if(url.pathname.endsWith('/room-calendar')){const id=Number(url.pathname.split('/')[3]),from=url.searchParams.get('from'),to=url.searchParams.get('to');const days=[];for(let date=new Date(from);date<new Date(to);date.setUTCDate(date.getUTCDate()+1))days.push({roomTypeId:id,date:date.toISOString().slice(0,10),held:0,booked:0,blocked:0,available:date.getUTCDate()===5?null:2,issue:date.getUTCDate()===5?'UNRESOLVED_LEGACY_BOOKING':null});return send({listingId:id,observedAt:stamp,rooms:[{id,name:'Garden room',inventoryCount:2}],days,blocks:[],bookings:[{id:1,guestName:id===20?'Lake fixture guest':'Hill fixture guest',startDate:from,endDate:to,status:'confirmed',totalPrice:'1000.00'}]});}
  return send({error:'No fixture for this action'},404);
 }
 if(url.pathname==='/app.js'||url.pathname==='/app.css'){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'application/javascript':'text/css'});return res.end(readFileSync(join(directory,url.pathname.slice(1))));}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Encho browser verification</title><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#f7f7f0}.fixture-note{padding:8px 16px;background:#173c32;color:white;font-size:12px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head><body><div class="fixture-note">Local verification fixtures — no live data or financial actions</div><main id="root"></main><script src="/app.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const evidence=[];
try{
 for(const width of [1440,390])for(const screen of ['calendar','host','admin']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('token','isolated-ui-fixture'));
  await page.goto(`${origin}/?screen=${screen}`);
  if(screen==='calendar'){
   await page.getByText('Lake fixture guest',{exact:true}).waitFor();await page.getByLabel('Property',{exact:true}).selectOption('21');await page.getByText('Hill fixture guest',{exact:true}).waitFor();
   if(await page.getByText('Lake fixture guest',{exact:true}).count())throw new Error('CALENDAR_PREVIOUS_PROPERTY_VISIBLE');
   await page.getByLabel('Scrollable room availability').focus();if(!await page.getByLabel('Scrollable room availability').evaluate(el=>el===document.activeElement))throw new Error('CALENDAR_KEYBOARD_SCROLL_UNREACHABLE');
  }else{
   await page.locator(screen==='admin'?'.mkt-queue-item':'.mkt-campaign-card').filter({hasText:'Lake House September'}).first().click();
   await page.getByRole('progressbar').waitFor();await page.getByRole('button',{name:'Refresh network evidence',exact:true}).click();await page.getByText(/network refresh is queued/).waitFor();
   if(screen==='admin'){await page.getByRole('button',{name:'Inspect recovery',exact:true}).click();await page.getByText(/No external entity is recorded/).waitFor();}
  }
  if(errors.length)throw new Error(JSON.stringify({screen,width,errors}));
  const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));if(layout.scroll>layout.viewport+1)throw new Error(`PAGE_OVERFLOW:${screen}:${width}:${layout.scroll}`);
  await page.screenshot({path:join(directory,`${screen}-${width}.png`),fullPage:true});
  evidence.push({screen,width,render:'PASSED',overflow:false,uncaughtErrors:errors});await page.close();
 }
 if(requests.some(r=>r.method!=='GET'&&!r.path.endsWith('/refresh')))throw new Error('UNEXPECTED_MUTATION');
 writeFileSync(join(directory,'verification.json'),JSON.stringify({scope:'LOCAL_FIXTURE_BROWSER_ONLY',evidence,requests},null,2));console.log(JSON.stringify({directory,evidence}));
}finally{await browser.close();await new Promise(r=>server.close(r));rmSync(join(directory,'app.js'));rmSync(join(directory,'app.css'));}
