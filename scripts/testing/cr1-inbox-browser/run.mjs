import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {compile} from '@tailwindcss/node';
import {Scanner} from '@tailwindcss/oxide';
const output=await mkdtemp(join(tmpdir(),'encho-cr1-inbox-'));
const ports=resolve('scripts/testing/cr1-inbox-browser/ports.ts');
await build({entryPoints:['scripts/testing/cr1-inbox-browser/entry.tsx'],outdir:output,bundle:true,format:'esm',platform:'browser',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"test"'},logLevel:'silent',plugins:[{name:'isolated-inbox-ports',setup(builder){builder.onResolve({filter:/AuthContext$|syncService$|\/audio$|^socket.io-client$/},()=>({path:ports}));}}]});
const css=await readFile('index.css','utf8');
const compiler=await compile(css.split('\n').filter(line=>!line.trim().startsWith('@import url(')).join('\n'),{base:process.cwd(),onDependency(){}});
const scanner=new Scanner({sources:[{base:process.cwd(),pattern:'components/InboxPage.tsx',negated:false},{base:process.cwd(),pattern:'components/Skeletons.tsx',negated:false},{base:process.cwd(),pattern:'components/operations/ConversationAssistance.tsx',negated:false}]});
await writeFile(join(output,'entry.css'),compiler.build(scanner.scan()));
await writeFile(join(output,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Inbox verification</title><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const name=pathname==='/entry.js'?'entry.js':pathname==='/entry.css'?'entry.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(output,name)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const checks=[];
const assert=(value,message)=>{if(!value)throw new Error(message);};
const thread={id:1,listing_id:4,experience_id:null,guest_id:10,host_id:20,last_message:'We can explain the room options.',unread_count_guest:1,unread_count_host:0,updated_at:'2026-09-24T12:00:00Z',listing_title:'Fixture forest stay',listing_image:null,guest_name:'Guest fixture',host_name:'Host fixture',list_cursor:'cursor'};
const initial={id:7,thread_id:1,sender_id:20,receiver_id:10,content:'We can explain the room options.',is_read:false,created_at:'2026-09-24T12:00:00Z',conversation_sequence:'1'};
try{
 for(const width of [1440,360]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));let readCount=0,queued=false,assistance=null;const canonicalRows=[initial];
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname==='/api/threads')return reply([thread]);
   if(url.pathname.endsWith('/assistance'))return reply({case:assistance,disclosureVersion:'cr1-service-assistance-v1'});
   if(url.pathname==='/api/conversations/v1/cases'){const body=req.postDataJSON();assert(body.acceptAssistance===true&&body.disclosureVersion==='cr1-service-assistance-v1'&&/^[a-f0-9-]{36}$/.test(body.requestId),'Assistance bypassed explicit disclosed request');assistance={id:'77777777-7777-4777-8777-777777777777',threadId:1,state:'OPEN',version:1,disclosureVersion:body.disclosureVersion};return reply(assistance);}
   if(url.pathname.endsWith('/withdraw')){assert(assistance&&req.postDataJSON().expectedVersion===assistance.version,'Withdraw lost current case version');assistance={...assistance,state:'WITHDRAWN',version:2};return reply(assistance);}
   if(url.pathname.endsWith('/read')){readCount++;return reply({threadId:1,throughMessageId:7,lastReadSequence:'1',unread:0});}
   if(req.method()==='GET')return reply(canonicalRows);
   if(queued)return route.fulfill({status:503,contentType:'application/json',body:'{"code":"DEPENDENCY_UNAVAILABLE"}'});
   const body=req.postDataJSON();assert(/^[a-f0-9-]{36}$/.test(body.clientEventId),'Message event identity missing');const canonical={...initial,id:8,conversation_sequence:'2',sender_id:10,receiver_id:20,content:body.content,client_event_id:body.clientEventId};canonicalRows.push(canonical);return reply(canonical);
  });
  const record=name=>checks.push({width,name});const overflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
  await page.goto(origin);await page.getByRole('button',{name:/Host fixture/}).waitFor();assert(readCount===0,'List prefetched a read receipt');await overflow();record('list is read-only and fits viewport');
  await page.getByRole('button',{name:/Host fixture/}).click();await page.getByRole('log',{name:'Conversation messages'}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-inquiry-read-id="7"]'));
  await page.waitForTimeout(250);assert(readCount===1,'Visible incoming message acknowledgement missing or repeated');await overflow();record('visible message acknowledges exact cursor once');
  await page.evaluate(()=>{window.fixtureReplyCounts=[];new MutationObserver(()=>window.fixtureReplyCounts.push([...document.querySelectorAll('[role=log] p')].filter(p=>p.textContent==='Which room fits two adults?').length)).observe(document.querySelector('[role=log]'),{childList:true,subtree:true});});
  await page.getByRole('textbox',{name:'Message'}).fill('Which room fits two adults?');await page.getByRole('button',{name:'Send message'}).click();await page.getByText('Which room fits two adults?',{exact:true}).waitFor();
  assert(await page.getByRole('log',{name:'Conversation messages'}).getByText('Which room fits two adults?',{exact:true}).count()===1,'Optimistic reply duplicated');await page.waitForFunction(()=>[...document.querySelectorAll('[role=log] p')].some(p=>p.textContent==='Which room fits two adults?'&&!p.parentElement.textContent.includes('Sending')));assert(await page.evaluate(()=>window.fixtureReplyCounts.every(count=>count<=1)),'Animation retained duplicate optimistic row');record('canonical send converges without transient duplicate');
  await page.evaluate(canonical=>window.fixtureConversationEvent('new_message',canonical),canonicalRows[1]);assert(await page.getByRole('log',{name:'Conversation messages'}).getByText('Which room fits two adults?',{exact:true}).count()===1,'Socket duplicated committed reply');record('socket receipt convergence');
  queued=true;await page.getByRole('textbox',{name:'Message'}).fill('Please keep this pending question.');await page.getByRole('button',{name:'Send message'}).click();await page.getByText(/Awaiting confirmation/).waitFor();record('unconfirmed send remains explicit');
  await page.getByText('Encho assistance',{exact:true}).click();await page.getByRole('checkbox',{name:'I agree to share this conversation with Encho support.'}).waitFor();assert(await page.getByRole('button',{name:'Request assistance'}).isDisabled(),'Assistance enabled without disclosure acceptance');await page.getByRole('checkbox',{name:'I agree to share this conversation with Encho support.'}).check();await page.getByRole('button',{name:'Request assistance'}).click();await page.getByRole('button',{name:'Stop new support access'}).waitFor();await overflow();record('explicit assistance disclosure and request');await page.getByRole('button',{name:'Stop new support access'}).click();await page.getByRole('button',{name:'Request assistance'}).waitFor();assert(assistance.state==='WITHDRAWN','Withdrawal did not preserve terminal case state');record('participant withdrawal');
  await page.screenshot({path:join(output,`conversation-${width}.png`),fullPage:true});await overflow();
  if(width===360){await page.getByRole('button',{name:'Back to conversations'}).click();await page.getByRole('button',{name:/Host fixture/}).waitFor();record('mobile back navigation');}
  assert(errors.length===0,errors.join('\n'));await page.close();
 }
 const receipt={checksPassed:checks.length,checks,viewports:[1440,360],externalNetwork:'blocked',source:'Isolated InboxPage + real Tailwind CSS, fixture API and auth ports; no server/environment/database import',artifacts:output};await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
