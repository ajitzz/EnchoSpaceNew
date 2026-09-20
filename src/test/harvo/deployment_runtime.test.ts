import {describe,it,expect,vi,afterEach} from 'vitest';
import express from 'express';
import request from 'supertest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {createPublicAssetsMiddleware,verifyPublicBuild} from '../../server/deployment/staticAssets.js';
import {databaseReadiness,requiredRuntimeTables,requiredForcedRlsTables} from '../../server/deployment/databaseReadiness.js';
import {freshWorkerProgress,runWorkerLoop,workerProgressHealthy,watchWorkerProgress} from '../../server/deployment/workerSupervisor.js';
import {writeWorkerProgress} from '../../server/deployment/workerProgress.js';
import {createShutdown,drainHttpServer,isProcessEntry} from '../../server/deployment/lifecycle.js';
const roots:string[]=[];
const fixture=()=>{const root=mkdtempSync(join(tmpdir(),'harvo-public-test-'));roots.push(root);mkdirSync(join(root,'assets'));writeFileSync(join(root,'index.html'),'<main>Encho</main>');writeFileSync(join(root,'assets','app-a1.js'),'console.log("public bundle")');return root;};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve};};
afterEach(()=>{for(const path of roots.splice(0))rmSync(path,{recursive:true,force:true});vi.useRealTimers();});

describe('public deployment boundary',()=>{
 it('serves real public assets and refuses backend paths even if a later file appears',async()=>{
  const directory=fixture(),app=express();app.use(createPublicAssetsMiddleware(directory));
  app.get('/{*splat}',(_req,res)=>res.send('SPA fallback'));
  expect((await request(app).get('/assets/app-a1.js')).text).toContain('public bundle');
  mkdirSync(join(directory,'src'));writeFileSync(join(directory,'src','secret.js'),'PRIVATE_SENTINEL');
  for(const url of ['/server.js','/src/secret.js','/build/server/server.js','/.env.production','/assets/file.js.map','/%73rc/secret.js']){
   const response=await request(app).get(url);expect(response.status).toBe(404);expect(response.text).not.toContain('PRIVATE_SENTINEL');
  }
  expect((await request(app).get('/stay/real-slug')).text).toBe('SPA fallback');
 });
 it.each(['server.js','server.js.map','.env.local','src/private.js','build/server.js','assets/key.pem'])('rejects contaminated build %s before serving',name=>{
  const directory=fixture();mkdirSync(join(directory,name,'..'),{recursive:true});writeFileSync(join(directory,name),'PRIVATE');expect(()=>verifyPublicBuild(directory)).toThrow('PRIVATE_PUBLIC_ARTIFACT');
 });
 it('rejects symlinked files and roots',()=>{const directory=fixture(),outside=fixture();symlinkSync(join(outside,'index.html'),join(directory,'escape.html'));expect(()=>verifyPublicBuild(directory)).toThrow();const link=join(outside,'linked-root');symlinkSync(directory,link);expect(()=>verifyPublicBuild(link)).toThrow('PUBLIC_BUILD_MISSING');});
 it('keeps TypeScript output private while Vercel only publishes dist',()=>{
  const server=JSON.parse(readFileSync('tsconfig.server.json','utf8')),vercel=JSON.parse(readFileSync('vercel.json','utf8')),pkg=JSON.parse(readFileSync('package.json','utf8'));
  expect(resolve(server.compilerOptions.outDir).startsWith(resolve(vercel.outputDirectory)+'/')).toBe(false);expect(server.compilerOptions.outDir).not.toBe('./dist');
  expect(pkg.scripts.start).toBe('node build/server/server.js');expect(pkg.scripts['marketing:worker']).toBe('node build/server/src/server/marketing/worker.js');expect(pkg.scripts.build).toContain('verify-public-artifacts.mjs');
  expect(readFileSync('Dockerfile.worker','utf8')).toContain('CMD ["node", "build/server/src/server/marketing/worker.js"]');
  for(const filename of ['Dockerfile','Dockerfile.worker']){const docker=readFileSync(filename,'utf8');expect(docker).toContain('node:24.21.0-bookworm-slim');expect(docker).toContain('npm ci --include=dev');expect(docker).toContain('USER node');expect(docker).not.toContain('COPY --chown=node:node --from=builder /app/src');}
  expect(readFileSync('.dockerignore','utf8').split('\n')).toEqual(expect.arrayContaining(['.env*','**/.env*','build']));
 });
});

describe('truthful structural readiness',()=>{
 const pool=(input:{missing?:string;bypass?:boolean;force?:boolean;fail?:boolean}={})=>{const queries:string[]=[];const release=vi.fn();return {queries,release,connect:async()=>({release,query:async(sql:string)=>{queries.push(sql);if(input.fail&&sql.includes('pg_roles'))throw new Error('DB_FAILED');if(sql.includes('pg_roles'))return{rows:[{rolsuper:false,rolbypassrls:!!input.bypass}]};if(sql.includes('unnest'))return{rows:requiredRuntimeTables.map(name=>({name,present:name!==input.missing}))};if(sql.includes('pg_class'))return{rows:Array.from({length:requiredForcedRlsTables.length},()=>({relrowsecurity:true,relforcerowsecurity:input.force!==false}))};return{rows:[]};}})};};
 it('rejects missing migrations, bypass roles and disabled FORCE RLS despite a working connection',async()=>{for(const config of[{missing:'marketing_jobs'},{bypass:true},{force:false}])expect((await databaseReadiness(pool(config) as any)).ready).toBe(false);expect((await databaseReadiness(pool() as any)).ready).toBe(true);});
 it('only reads metadata, rolls back failed checks and always releases',async()=>{const p=pool({fail:true});await expect(databaseReadiness(p as any)).rejects.toThrow();expect(p.queries[0]).toBe('BEGIN READ ONLY');expect(p.queries.at(-1)).toBe('ROLLBACK');expect(p.release).toHaveBeenCalledOnce();expect(p.queries.some(x=>/CREATE|ALTER|INSERT|UPDATE|DELETE/.test(x))).toBe(false);});
 it.each([undefined,{}, {rolsuper:true,rolbypassrls:false}, {rolsuper:false}, {rolbypassrls:false}])('requires explicit safe role flags: %j',async role=>{
  const p=pool();const original=p.connect;
  p.connect=async()=>{const c=await original();const query=c.query;c.query=async(sql:string)=>sql.includes('pg_roles')?{rows:role?[role]:[]} as any:query(sql);return c;};
  expect((await databaseReadiness(p as any)).ready).toBe(false);
 });
});

describe('worker supervision and draining',()=>{
 it('completes maintenance before consuming jobs and records actual progress',async()=>{
  const controller=new AbortController(),progress=freshWorkerProgress(),calls:string[]=[];let healthy=false;
  await runWorkerLoop({progress,signal:controller.signal,checkDatabase:async()=>{calls.push('db');},maintenance:[{name:'expiredHolds',intervalMs:60000,run:async()=>{calls.push('holds');}}],runJob:async()=>{calls.push('job');return false;},report:p=>{if(p.state==='RUNNING'&&p.lastPollCompletedAt)healthy=workerProgressHealthy(p);},sleep:async()=>{controller.abort();}});
  expect(calls).toEqual(['db','holds','job']);expect(healthy).toBe(true);expect(progress.state).toBe('STOPPED');expect(progress.maintenance.expiredHolds.lastCompletedAt).toBeTruthy();
 });
 it('failed maintenance stays unhealthy without starving durable pause or refund jobs',async()=>{
  const controller=new AbortController(),progress=freshWorkerProgress(),job=vi.fn();
  await runWorkerLoop({progress,signal:controller.signal,checkDatabase:async()=>{},maintenance:[{name:'expiredHolds',intervalMs:1,run:async()=>{throw Object.assign(new Error('secret'),{code:'HOLD_FAILED'});}}],runJob:job,report:()=>{},sleep:async()=>controller.abort()});
  expect(job).toHaveBeenCalledOnce();expect(progress.lastPollCompletedAt).toBeTruthy();expect(workerProgressHealthy(progress)).toBe(false);expect(progress.maintenance.expiredHolds.lastError).toBe('HOLD_FAILED');expect(JSON.stringify(progress)).not.toContain('secret');
 });
 it('SIGTERM equivalent waits for the in-flight job and starts no second job',async()=>{
  const controller=new AbortController(),progress=freshWorkerProgress(),entered=deferred(),finish=deferred(),job=vi.fn(async()=>{entered.resolve();await finish.promise;return true;});let done=false;
  const run=runWorkerLoop({progress,signal:controller.signal,checkDatabase:async()=>{},maintenance:[],runJob:job,report:()=>{}}).then(()=>{done=true;});
  await entered.promise;controller.abort();await Promise.resolve();expect(progress.state).toBe('DRAINING');expect(done).toBe(false);finish.resolve();await run;expect(job).toHaveBeenCalledOnce();expect(progress.state).toBe('STOPPED');
 });
 it('does not report an old or draining process as healthy and writes private atomic evidence',()=>{
  const progress=freshWorkerProgress(),now=Date.now();Object.assign(progress,{state:'RUNNING',lastPollCompletedAt:new Date(now).toISOString(),lastDatabaseCheckAt:new Date(now).toISOString()});
  expect(workerProgressHealthy(progress,now)).toBe(true);expect(workerProgressHealthy(progress,now+180001)).toBe(false);progress.state='DRAINING';expect(workerProgressHealthy(progress,now)).toBe(false);
  const directory=fixture(),file=join(directory,'progress.json');writeWorkerProgress(progress,file);expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(progress);expect(statSync(file).mode&0o777).toBe(0o600);
 });
 it('stops accepting HTTP traffic and waits for the active response before pool close',async()=>{
  const entered=deferred(),finish=deferred(),server=createServer(async(_req,res)=>{entered.resolve();await finish.promise;res.end('finished');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address() as any,response=fetch(`http://127.0.0.1:${address.port}`);await entered.promise;const order:string[]=[];
  const shutdown=createShutdown({markDraining:()=>order.push('draining'),drain:()=>drainHttpServer(server),closeResources:async()=>{order.push('pools');},exit:code=>order.push('exit:'+code),log:()=>{}});
  const stopping=shutdown();expect(shutdown()).toBe(stopping);await Promise.resolve();expect(order).toEqual(['draining']);finish.resolve();expect(await(await response).text()).toBe('finished');await stopping;expect(order).toEqual(['draining','pools','exit:0']);
 });
 it('fatal or deadline shutdown is unsuccessful',async()=>{
  vi.useFakeTimers();const waiting=deferred(),exit=vi.fn(),shutdown=createShutdown({markDraining:()=>{},drain:()=>waiting.promise,closeResources:async()=>{},exit,deadlineMs:100,log:()=>{}});const run=shutdown(1);await vi.advanceTimersByTimeAsync(101);expect(exit).toHaveBeenCalledWith(1);waiting.resolve();await run;
 });
 it('imports do not count as the service entrypoint',()=>{expect(isProcessEntry('file:///app/server.js',['node','/app/worker.js'])).toBe(false);expect(isProcessEntry('file:///app/server.js',['node','/app/server.js'])).toBe(true);});
 it('recognizes a real Node entrypoint launched through a filesystem symlink',()=>{const root=fixture(),actual=join(root,'actual.js'),link=join(root,'entry.js');writeFileSync(actual,'');symlinkSync(actual,link);expect(isProcessEntry(new URL('file://'+actual).href,['node',link])).toBe(true);});
 it('supervisor exits on stalled progress but respects an in-flight graceful drain',async()=>{vi.useFakeTimers();const progress=freshWorkerProgress(),failed=vi.fn();const stop=watchWorkerProgress(()=>progress,failed,{maxStallMs:100,intervalMs:20});await vi.advanceTimersByTimeAsync(80);expect(failed).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(20);expect(failed).toHaveBeenCalledOnce();stop();const draining=vi.fn();progress.state='DRAINING';const stopDrain=watchWorkerProgress(()=>progress,draining,{maxStallMs:100,intervalMs:20});await vi.advanceTimersByTimeAsync(200);expect(draining).not.toHaveBeenCalled();stopDrain();});
});
