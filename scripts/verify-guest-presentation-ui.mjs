import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

// Real presentation components and compiled styles, with local-only explicit fixtures.
// Never starts server.ts, reads .env, or contacts a database/provider.
if(!process.argv[2])throw new Error('ISOLATED_BUILD_DIRECTORY_REQUIRED');
const assets=join(resolve(process.argv[2]),'client/assets');
const css=readdirSync(assets).filter(name=>name.endsWith('.css')).map(name=>readFileSync(join(assets,name),'utf8')).join('\n');
const directory=mkdtempSync(join(tmpdir(),'encho-guest-browser-'));
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{HelmetProvider}from'react-helmet-async';
import{ListingDetailsNew}from'./components/ListingDetailsNew';import HostForm from'./components/HostForm';
const screen=new URLSearchParams(location.search).get('screen');
const roomPhoto={id:'fixture-room-photo',url:'/fixture/room.svg',category:'other',title:'Garden room photograph'};
const listing={id:'fixture-stay',title:'Lake House — local fixture',description:'A supplied property description for this isolated visual check.',city:'Kochi',locality:'Lake Road',price:6000,currency:'INR',type:'Villa',imageUrl:'/fixture/grounds.svg',imageUrls:['/fixture/grounds.svg','/fixture/room.svg'],imageCount:2,isVerified:false,amenities:['WiFi'],rooms:[{id:'fixture-room',type:'garden-room',name:'Garden room',price:6000,capacity:2,photos:[roomPhoto]}]};
const empty={...listing,id:'fixture-empty',title:'Property details pending — local fixture',rooms:[],imageUrl:'',imageUrls:[],imageCount:0,price:0,amenities:[]};
createRoot(document.getElementById('root')).render(<HelmetProvider>{screen==='builder'?<HostForm onBack={()=>{}} onSuccess={()=>{}}/>:<ListingDetailsNew listing={screen==='empty'?empty:listing} onBack={()=>{}}/>}</HelmetProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:join(directory,'app.js'),platform:'browser',jsx:'automatic',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-context',setup(plugin){
 plugin.onResolve({filter:/(AuthContext|ToastContext|CurrencyContext)(?:\.js)?$/},args=>({path:args.path,namespace:'fixture'}));
 plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const useAuth=()=>({user:null,token:''});export const useToast=()=>({addToast(){}});export const useCurrency=()=>({currency:'INR',formatPrice:value=>'₹'+value});",loader:'js'}));
}}]});
const requests=[];
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/app.js'){res.writeHead(200,{'Content-Type':'application/javascript'});return res.end(readFileSync(join(directory,'app.js')));}
 if(path==='/app.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(css);}
 if(path.startsWith('/fixture/')){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><rect width="900" height="600" fill="${path.includes('room')?'#8eaa98':'#b3c5c3'}"/><rect x="130" y="100" width="640" height="400" rx="40" fill="#e5ebe6"/><text x="450" y="300" text-anchor="middle" font-size="32" fill="#173c32">${path.includes('room')?'Room photograph fixture':'Property photograph fixture'}</text><text x="450" y="360" text-anchor="middle" font-size="20" fill="#173c32">Local test data only</text></svg>`);}
 if(path.startsWith('/api/')){requests.push({path,method:req.method});res.writeHead(404,{'Content-Type':'application/json'});return res.end('{"error":"No live services in browser fixture"}');}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0}.fixture-note{position:relative;z-index:9999;padding:8px;background:#173c32;color:white;font:12px system-ui}</style></head><body><div class="fixture-note">Isolated presentation verification — no live property, checkout or publishing</div><main id="root"></main><script src="/app.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const evidence=[];
try{
 for(const width of [1440,390])for(const screen of ['guest','empty','builder']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(`${origin}/?screen=${screen}`);
  if(screen==='builder'){
   await page.waitForFunction(()=>!!localStorage.getItem('hostPreviewListing'));
   const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('hostPreviewListing')));
   if(draft.rooms.length||draft.photos.length||draft.experience_tags.length||draft.price||draft.rating||draft.lat)throw new Error('FABRICATED_DRAFT_FACTS');
  }else{
   await page.getByRole('heading',{name:screen==='guest'?'Lake House — local fixture':'Property details pending — local fixture',exact:true}).first().waitFor();
   if(screen==='guest'){
    await page.getByRole('button',{name:'View Garden room photo 1',exact:true}).click();
    await page.getByTitle('Close Lightbox (ESC)').waitFor();
    if(!await page.locator('img[src="/fixture/room.svg"]').last().isVisible())throw new Error('WRONG_ROOM_PHOTO');
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   }else if(await page.locator('img').count())throw new Error('EMPTY_PROPERTY_HAS_INVENTED_MEDIA');
   await page.evaluate(()=>scrollTo(0,0));
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow||errors.length)throw new Error(JSON.stringify({screen,width,overflow,errors}));
  await page.screenshot({path:join(directory,`${screen}-${width}.png`),fullPage:true});
  evidence.push({screen,width,render:'PASSED',overflow,uncaughtErrors:errors});await page.close();
 }
 if(requests.some(request=>request.method!=='GET'))throw new Error('UNEXPECTED_MUTATION');
 writeFileSync(join(directory,'verification.json'),JSON.stringify({scope:'LOCAL_FIXTURE_ONLY',evidence,requests},null,2));console.log(JSON.stringify({directory,evidence}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));rmSync(join(directory,'app.js'));}
