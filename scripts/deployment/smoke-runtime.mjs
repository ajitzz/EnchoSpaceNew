import {cpSync,writeFileSync,symlinkSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';

// Expects an isolated build directory from scripts/verify-harvo-build.mjs.
// No ambient .env, configured DB, network credentials or external calls are supplied.
const artifact=resolve(process.argv[2]||'');
if(!process.argv[2]||!existsSync(join(artifact,'server/server.js'))||!existsSync(join(artifact,'client/index.html')))throw new Error('ISOLATED_BUILD_REQUIRED');
const work=mkdtempSync(join(tmpdir(),'harvo-runtime-smoke-'));
writeFileSync(join(work,'package.json'),'{"type":"module"}');
cpSync(join(artifact,'server'),join(work,'server'),{recursive:true});cpSync(join(artifact,'client'),join(work,'dist'),{recursive:true});
symlinkSync(resolve('node_modules'),join(work,'node_modules'),'dir');
const holder=createServer();await new Promise(r=>holder.listen(0,'127.0.0.1',r));const port=holder.address().port;await new Promise(r=>holder.close(r));
const guard=join(work,'deny-outbound.mjs');writeFileSync(guard,"import net from 'node:net';net.Socket.prototype.connect=function(){throw new Error('ISOLATED_OUTBOUND_CONNECTION_BLOCKED')};globalThis.fetch=async()=>{throw new Error('ISOLATED_OUTBOUND_FETCH_BLOCKED')};\n");
const env={PATH:process.env.PATH,NODE_ENV:'production',DISABLE_BACKGROUND_WORKERS:'true',PORT:String(port),JWT_SECRET:'isolated-runtime-smoke-only-not-a-deployment-secret'};
let logs='';const child=spawn(process.execPath,['--import',guard,join(work,'server/server.js')],{cwd:work,env,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',v=>{logs+=v;});child.stderr.on('data',v=>{logs+=v;});let closed;const exit=new Promise(r=>child.once('close',(code,signal)=>{closed={code,signal};r(closed);}));
const get=path=>fetch(`http://127.0.0.1:${port}${path}`,{signal:AbortSignal.timeout(3000)});
try{
 let healthy=false;for(let attempt=0;attempt<120;attempt++){if(closed)break;try{healthy=(await get('/api/health/live')).status===200;}catch{}if(healthy)break;await new Promise(r=>setTimeout(r,250));}
 if(!healthy){writeFileSync(join(artifact,'runtime-smoke-failure.log'),logs);throw new Error('COMPILED_WEB_STARTUP_FAILED; isolated log saved in artifact directory');}
 if((await get('/api/health/ready')).status!==503)throw new Error('UNCONFIGURED_DATABASE_REPORTED_READY');
 for(const path of ['/server.js','/src/lib/marketing/config.js','/build/server/server.js','/.env.production'])if((await get(path)).status!==404)throw new Error('PRIVATE_PATH_NOT_REJECTED');
 if((await get('/stay/example-stay')).status!==200)throw new Error('CANONICAL_SPA_ROUTE_FAILED');
 child.kill('SIGTERM');const stopped=await Promise.race([exit,new Promise((_,reject)=>setTimeout(()=>reject(new Error('WEB_DRAIN_TIMEOUT')),10000).unref())]);
 if(stopped.code!==0||!logs.includes('PROCESS_STOPPED'))throw new Error('WEB_DRAIN_FAILED');
 const worker=spawnSync(process.execPath,['--import',guard,join(work,'server/src/server/marketing/worker.js')],{cwd:work,env,encoding:'utf8',timeout:15000});
 if(worker.status!==1||!worker.stderr.includes('HARVO_WORKER_FAILED')||worker.stderr.includes('ERR_MODULE_NOT_FOUND'))throw new Error('WORKER_FAIL_CLOSED_STARTUP_FAILED');
 const imported=spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',`await import(${JSON.stringify(new URL('file://'+join(work,'server/src/server/marketing/worker.js')).href)});console.log('IMPORT_ONLY_OK')`],{cwd:work,env,encoding:'utf8',timeout:15000});
 if(imported.status!==0||!imported.stdout.includes('IMPORT_ONLY_OK')){writeFileSync(join(artifact,'worker-import-smoke-failure.log'),JSON.stringify({status:imported.status,signal:imported.signal,error:imported.error?.code,stdout:imported.stdout,stderr:imported.stderr}));throw new Error('WORKER_IMPORT_STARTED_SIDE_EFFECTS');}
 console.log(JSON.stringify({worker:'FAIL_CLOSED_AND_IMPORT_SAFE',scope:'ISOLATED_COMPILED_RUNTIME_NO_DATABASE_OR_PROVIDER',web:'PASSED',privatePaths:'REJECTED',databaseReadiness:'CORRECTLY_503',sigterm:'DRAINED',node:process.version}));
}finally{if(!closed){child.kill('SIGKILL');await exit;}rmSync(work,{recursive:true,force:true});}
