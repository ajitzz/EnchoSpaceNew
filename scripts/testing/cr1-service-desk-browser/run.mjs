import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';

const output=await mkdtemp(join(tmpdir(),'encho-cr1-service-desk-'));
await build({entryPoints:['scripts/testing/cr1-service-desk-browser/entry.tsx'],outdir:output,bundle:true,format:'esm',platform:'browser',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"test"'},logLevel:'silent'});
await writeFile(join(output,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Service Desk verification</title><link rel="stylesheet" href="/entry.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const file=pathname==='/entry.js'?'entry.js':pathname==='/entry.css'?'entry.css':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(output,file)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const scenarios=[];
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
try{
 for(const width of [1440,360]){
  const page=await browser.newPage({viewport:{width,height:980},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const record=name=>scenarios.push({width,name});
  const overflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}px`);
  const select=async()=>page.getByRole('navigation',{name:'Your assigned cases'}).getByRole('button',{name:/Help with a stay inquiry/}).click();
  const open=async()=>page.getByRole('button',{name:'Open audited conversation'}).click();
  await page.goto(origin);await select();assert(await page.evaluate(()=>window.serviceFixtureCalls.length)===0,'Private read occurred before explicit click');
  await overflow();await page.screenshot({path:join(output,`closed-${width}.png`),fullPage:true});record('explicit access boundary');
  await page.getByRole('button',{name:'Open audited conversation'}).focus();await page.keyboard.press('Enter');await page.getByText('Does the stay have a quiet workspace?').waitFor();
  await overflow();await page.screenshot({path:join(output,`open-${width}.png`),fullPage:true});record('keyboard read and bounded content');
  await page.getByTestId('replace-session').click();assert(await page.getByText('Does the stay have a quiet workspace?').count()===0,'Session replacement retained history');record('session replacement purge');
  await page.goto(`${origin}/?scenario=retry`);await select();await open();await page.getByText('Does the stay have a quiet workspace?').waitFor();
  await page.getByLabel('Internal case note').fill('Confirm the accessible entrance with the host.');await page.getByRole('button',{name:'Save internal note and refresh'}).click();await page.getByRole('button',{name:'Retry the same note'}).waitFor();
  assert(await page.getByLabel('Internal case note').isDisabled(),'Unknown note is editable');await page.getByRole('button',{name:'Retry the same note'}).click();await page.getByText('Internal note saved. Conversation access has been recorded again.').waitFor();
  const notes=await page.evaluate(()=>window.serviceFixtureCalls.filter(c=>c.path.endsWith('/notes')).map(c=>c.request));assert(notes.length===2&&notes[0].requestId===notes[1].requestId,'Note retry changed identity');await overflow();record('idempotent note retry and audited refresh');
  for(const scenario of ['empty','unclaimed','denied','unavailable']){
   await page.goto(`${origin}/?scenario=${scenario}`);
   if(scenario==='empty')await page.getByRole('heading',{name:'No assigned service cases'}).waitFor();
   else{await select();if(scenario==='unclaimed')await page.getByRole('heading',{name:'Claim this work first'}).waitFor();else{await open();await page.getByText(scenario==='denied'?'Current case access was not accepted. Refresh the workforce workspace.':'Conversation access is unavailable. No private content has been opened.').waitFor();}}
   assert(await page.getByText('Does the stay have a quiet workspace?').count()===0,`${scenario} leaked history`);await overflow();record(`${scenario} state`);
  }
  await page.goto(`${origin}/?scenario=expiry`);await select();await open();await page.getByText('Does the stay have a quiet workspace?').waitFor();await page.getByRole('heading',{name:'This claim is no longer active'}).waitFor({timeout:6000});assert(await page.getByText('Does the stay have a quiet workspace?').count()===0,'Expiry retained history');record('claim deadline purge');
  assert(errors.length===0,errors.join('\n'));await page.close();
 }
 const receipt={scenariosPassed:scenarios.length,viewports:[1440,360],externalNetwork:'blocked',source:'isolated esbuild fixture; no server/env/database import',artifacts:output,scenarios};await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
