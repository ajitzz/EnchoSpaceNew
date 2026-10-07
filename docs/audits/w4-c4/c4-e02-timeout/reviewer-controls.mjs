#!/usr/bin/env node
/** GPT-6 reviewer-authored tests; not production implementation or a worker repair. */
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, existsSync, rmSync, realpathSync, lstatSync} from 'node:fs';
import {dirname, join, resolve, isAbsolute, relative, delimiter} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {identifySubject, evaluateInlineSubject, buildP5Preload, SOURCE_PATH} from './subject-loader.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const IDS = ['P1','P2','P3','P4','P5'];
const PRIMARY = {P1:'P1_ACCOUNTING_REJECTS_UNRESOLVED_CONNECT',P2:'P2_NO_ACTIVE_PID_CLEAN_RELEASE',P3:'P3_DEADLINE_LATCHES_BEFORE_CANCEL_COMPLETES',P4:'P4_TERMINAL_FAILURE_VISIBLE_AND_REJECTED'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gate = () => {let resolveGate;const promise=new Promise(r=>{resolveGate=r;});return {promise,open:resolveGate};};
const safeError = err => err ? {name:err.name,code:err.code??null,message:String(err.message).replaceAll(process.cwd(),'<cwd>').slice(0,350)} : null;
const capture = fn => {try {fn();return {rejected:false,error:null};}catch(e){return {rejected:true,error:safeError(e)};}};
async function within(promise, ms, label) {
  let timer;try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`REVIEW_SUPERVISOR: ${label}`)),ms);})]);}finally {clearTimeout(timer);}
}
async function observe(fn, label, ms=3500) {
  const end=Date.now()+ms;
  while(Date.now()<end){if(await within(Promise.resolve().then(fn),Math.max(1,end-Date.now()),label))return;await sleep(10);}
  throw new Error(`REVIEW_OBSERVATION_FAILURE: ${label}`);
}
function assertion(result,id,condition,observation) {
  try {assert.ok(condition,id);result.assertions.push({id,passed:true,observation});}
  catch(e){if(e.code!=='ERR_ASSERTION')throw e;result.assertions.push({id,passed:false,observation});}
}
function nestedMessages(err) {if(!err)return [];return [err.message,...(err.errors??[]).flatMap(nestedMessages)];}
async function subjectCleanup(c,args,label) {
  try{return await within(c.performFiniteCleanup(args),6500,label);}
  catch(e){if(e.message.startsWith('REVIEW_SUPERVISOR:'))throw e;return {cleanupErrors:[e],combinedError:e,threw:true};}
}

function options(argv) {
  const o={probes:IDS,mode:'acceptance',allowDirty:false};
  for(let i=0;i<argv.length;i++) {
    const k=argv[i];
    if(k==='--allow-dirty'){o.allowDirty=true;continue;}
    const v=argv[++i];assert.ok(v,`MISSING_ARGUMENT: ${k}`);
    if(k==='--subject-root')o.root=v;
    else if(k==='--subject-sha')o.sha=v;
    else if(k==='--source-sha256')o.sourceHash=v;
    else if(k==='--expect')o.mode=v;
    else if(k==='--output')o.output=v;
    else if(k==='--probes')o.probes=v.split(',');
    else if(k==='--internal-probe')o.internal=v;
    else throw new Error(`UNKNOWN_ARGUMENT: ${k}`);
  }
  assert.ok(o.root&&o.sha&&o.sourceHash,'EXPLICIT_SUBJECT_ROOT_SHA_HASH_REQUIRED');
  assert.ok(['baseline','acceptance'].includes(o.mode),'INVALID_EXPECT_MODE');
  assert.ok(o.probes.length&&new Set(o.probes).size===o.probes.length&&o.probes.every(p=>IDS.includes(p)),'INVALID_PROBE_SELECTION');
  if(o.mode==='baseline'&&!o.internal)assert.deepEqual(o.probes,IDS,'BASELINE_REQUIRES_ALL_FIVE_PROBES');
  if(!o.internal)assert.ok(o.output,'EXPLICIT_EXTERNAL_OUTPUT_REQUIRED');
  return o;
}
const allowedEnv = extra => Object.fromEntries([
  ...['PATH','HOME','HARVO_POSTGRES_BIN','SystemRoot'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]),
  ['NODE_ENV','test'],['ENCHO_TEST_SANDBOX','1'],['TZ','UTC'],['LANG','C'],...Object.entries(extra),
]);

function resources(pool) {
  const records=new Map();const poolErrors=[];
  pool.on('release',(err,c)=>{const r=records.get(c);if(r){r.poolReleaseEvents++;r.checkedOut=false;r.errorRelease=Boolean(err);}});
  pool.on('remove',c=>{const r=records.get(c);if(r){r.removed=true;r.checkedOut=false;}});
  pool.on('error',(err,c)=>{poolErrors.push({error:safeError(err),knownClient:records.has(c)});});
  async function borrow() {
    const c=await pool.connect();
    const originalRelease=c.release.bind(c);
    const originalQuery=c.query.bind(c);
    const r={client:c,originalRelease,originalQuery,checkedOut:true,poolReleaseEvents:0,removed:false,attempts:[],queryRestore:null};
    records.set(c,r);
    c.on('error',err=>{r.clientErrors??=[];r.clientErrors.push(safeError(err));});
    c.release=(err)=>{r.attempts.push({errorRelease:Boolean(err),activeQuery:Boolean(c._getActiveQuery?.()),queuedQueries:c._queryQueue?.length??0});return originalRelease(err);};
    return c;
  }
  const proxy={connect:borrow};
  async function rescue() {
    const actions=[];
    for(const r of records.values()) {
      if(r.queryRestore)r.client.query=r.queryRestore;
      if(r.endRestore)r.client.end=r.endRestore;
      if(r.checkedOut){
        try {r.client.connection.stream.destroy();r.originalRelease(new Error('REVIEWER_RESCUE_ONLY'));actions.push({discarded:true});}
        catch(e){actions.push({discarded:false,error:safeError(e)});}
      }
    }
    return actions;
  }
  return {records,proxy,borrow,rescue,poolErrors};
}

async function buildFixture(subject) {
  const mod=await import(pathToFileURL(join(subject.root,'src/test/harvo/postgres.ts')).href);
  const fixture=await mod.createLocalPostgresFixture({schema:'empty'});
  assert.ok(fixture.pool.options.host.startsWith(process.env.TMPDIR),'FIXTURE_OUTSIDE_RUN_ROOT');
  assert.equal(fixture.pool.options.database,'postgres');
  assert.ok(!fixture.pool.options.connectionString,'FIXTURE_CONNECTION_STRING_FORBIDDEN');
  return fixture;
}
function coordinator(actual,fixture,name) {
  return new actual.CaseLocalCoordinator({scenarioName:name,fixture:{owner:fixture.pool},compositionWorker:null,deliberatelyDiscardedSet:new Set(),scenarioDeadlineMs:15000,cleanupDeadlineMs:5000,fallbackReserveMs:1500});
}

async function P1(actual,fixture,res,result) {
  const c=coordinator(actual,fixture,'P1_REAL_ACQUIRE');const delivery=gate();const obtained=gate();let raw=null;
  const controlled={connect:()=>res.borrow().then(async client=>{raw=client;obtained.open();await delivery.promise;return client;})};
  const caller=c.tracker.acquire(controlled,'P1_late',Date.now()+250).then(v=>({success:true,value:v}),e=>({success:false,error:safeError(e)}));
  await within(obtained.promise,3500,'P1 physical checkout');
  const outcome=await within(caller,3500,'P1 caller timeout');
  const before={caller:outcome.error,tracker:capture(()=>c.tracker.assertAllAccountedFor()),final:capture(()=>c.assertFinalAccounting()),resultDelivered:false};
  assertion(result,PRIMARY.P1,!outcome.success&&outcome.error?.code==='HARNESS_DEADLINE_EXCEEDED'&&before.tracker.rejected&&before.final.rejected,before);
  delivery.open();
  await observe(()=>res.records.get(raw)?.removed,'P1 late removal');
  await observe(async()=>(await fixture.pool.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1',[raw.processID])).rowCount===0,'P1 independent backend disappearance');
  const after={terminal:c.tracker.terminalActions.get(raw),poolRemoved:res.records.get(raw).removed,backendAbsent:true,tracker:capture(()=>c.tracker.assertAllAccountedFor()),final:capture(()=>c.assertFinalAccounting())};
  assertion(result,'P1_REAL_LATE_DISPOSITION',after.poolRemoved&&after.backendAbsent&&!after.tracker.rejected&&!after.final.rejected,after);
}

async function P2(actual,fixture,res,result) {
  const c=coordinator(actual,fixture,'P2_REAL_PID_INITIALIZATION');
  const prior=await c.tracker.acquire(res.proxy,'P2_prior',c.normalDeadlineAt);
  const locker=await res.borrow();const key=420002;await locker.query('BEGIN');await locker.query('SELECT pg_advisory_xact_lock($1)',[key]);
  let partial=null,pidPromise=null,pidSettled=false,intercepted=0;
  const started=gate();
  const controlled={connect:async()=>{
    partial=await res.borrow();const r=res.records.get(partial);r.queryRestore=partial.query;
    partial.query=(sql,args)=>{
      if(/^SELECT\s+pg_backend_pid\(\)\s+AS\s+pid\s*;?$/i.test(sql)){
        intercepted++;started.open();
        pidPromise=r.originalQuery('SELECT pg_advisory_xact_lock($1), pg_backend_pid() AS pid',[key]).finally(()=>{pidSettled=true;});
        return pidPromise;
      }
      return r.originalQuery(sql,args);
    };return partial;
  }};
  const caller=c.tracker.acquire(controlled,'P2_partial',Date.now()+250).then(v=>({success:true,value:v}),e=>({success:false,error:e}));
  try {
    await within(started.promise,3500,'P2 actual PID query');
    const outcome=await within(caller,3500,'P2 PID deadline');
    assert.equal(intercepted,1,'P2_INJECTION_NOT_REACHED');
    const cleanup=await subjectCleanup(c,{cancellationConn:prior,observerConn:partial,scenarioError:outcome.error,committed:true},'P2 subject cleanup');
    const r=res.records.get(partial);
    const backend=(await locker.query('SELECT state, xact_start IS NOT NULL AS open_transaction FROM pg_stat_activity WHERE pid=$1',[partial.processID])).rows[0]??null;
    const beforeGate={callerError:safeError(outcome.error),pidSettled,backend,releaseAttempts:r.attempts,priorReleaseEvents:res.records.get(prior).poolReleaseEvents,final:capture(()=>c.assertFinalAccounting()),subjectCleanupErrors:cleanup.cleanupErrors.map(safeError)};
    assertion(result,PRIMARY.P2,!outcome.success&&outcome.error?.code==='HARNESS_DEADLINE_EXCEEDED'&&!r.attempts.some(a=>!a.errorRelease&&a.activeQuery),beforeGate);
    assertion(result,'P2_UNSETTLED_PID_BLOCKS_ACCOUNTING',pidSettled||beforeGate.final.rejected,beforeGate.final);
    assertion(result,'P2_PRIOR_CLIENT_CLEANED',res.records.get(prior).poolReleaseEvents===1,{poolReleaseEvents:res.records.get(prior).poolReleaseEvents});
    assertion(result,'P2_SUBJECT_SETTLES_AND_VERIFIES_BEFORE_RESCUE',pidSettled&&(!backend||(backend.state==='idle'&&!backend.open_transaction))&&!beforeGate.final.rejected&&nestedMessages(cleanup.combinedError).includes(outcome.error?.message),beforeGate);
  } finally {
    await within(locker.query('ROLLBACK'),2000,'P2 release reviewer advisory gate');locker.release();
    if(pidPromise)await within(pidPromise.catch(()=>{}),2500,'P2 independent PID settlement');
    if(partial){const r=res.records.get(partial);if(r.queryRestore)partial.query=r.queryRestore;}
  }
  assertion(result,'P2_PID_OUTCOME_OBSERVED',pidSettled,{pidSettled,reviewerGateReleased:true,gateReleaseIsNotSubjectCleanup:true});
}

async function P3(actual,fixture,res,result) {
  const c=coordinator(actual,fixture,'P3_REAL_DELAYED_CANCELLATION');
  const cancel=await c.tracker.acquire(res.proxy,'P3_cancel',c.normalDeadlineAt);c.cancellationConn=cancel;
  const observer=await c.tracker.acquire(res.proxy,'P3_observer',c.normalDeadlineAt);
  const locker=await res.borrow();await locker.query('BEGIN');await locker.query('SELECT pg_advisory_xact_lock($1)',[420003]);
  const sourceGate=gate();const cancelStarted=gate();let cancelJob=null,cancelSettled=false,sourceSettled=false,callState='pending',callError=null;
  const start=Date.now();
  const caller=c.runOperation('P3_actual_control',()=>sourceGate.promise.then(()=>observer.query('SELECT 1 AS subject_result')).finally(()=>{sourceSettled=true;}),{
    owningClient:observer,
    cancel:()=>{
      cancelJob=(async()=>{cancelStarted.open();await cancel.query('SELECT pg_advisory_xact_lock($1)',[420003]);await cancel.query('SELECT pg_cancel_backend($1)',[c.tracker.getPid(observer)]);})().finally(()=>{cancelSettled=true;});return cancelJob;
    },deadlineAt:Date.now()+250,
  }).then(()=>{callState='success';},e=>{callState='failure';callError=e;});
  try {
    await within(cancelStarted.promise,3500,'P3 cancellation started');
    await observe(async()=>{const r=await fixture.pool.query('SELECT wait_event_type, pg_blocking_pids($1) AS blockers FROM pg_stat_activity WHERE pid=$1',[c.tracker.getPid(cancel)]);return r.rows[0]?.wait_event_type==='Lock'&&r.rows[0]?.blockers.length>0;},'P3 actual control query blocked');
    await sleep(75); // cancellation-start and server blocker witnesses establish ordering; not an exact timer race.
    const atDeadline={callState,cancelSettled,sourceSettled,controlActiveQuery:Boolean(cancel._getActiveQuery?.()),controlRegisteredActiveOps:c.tracker.entries.get(cancel)?.activeOps?.size??null,elapsedMs:Date.now()-start};
    assertion(result,PRIMARY.P3,callState==='failure'&&callError?.code==='HARNESS_DEADLINE_EXCEEDED',atDeadline);
    sourceGate.open();
    await observe(()=>sourceSettled,'P3 later source settlement');
    await sleep(20);
    assertion(result,'P3_LATE_SOURCE_CANNOT_CHANGE_FAILURE',callState==='failure',{callState,callError:safeError(callError),cancelSettled});
    const controlOwned=(c.tracker.entries.get(cancel)?.activeOps?.size??0)>0 || [...c.operations.values()].some(op=>op.owningClient===cancel&&op.started&&!op.settled);
    assertion(result,'P3_CONTROL_REGISTERED_WHILE_BLOCKED',controlOwned,{controlOwned,cancelSettled,controlActiveQuery:Boolean(cancel._getActiveQuery?.())});
    const cleanup=await subjectCleanup(c,{cancellationConn:observer,observerConn:cancel,scenarioError:callError,committed:true},'P3 subject cleanup with control gate retained');
    const final=capture(()=>c.assertFinalAccounting());
    const cancelRecord=res.records.get(cancel);
    const backend=(await locker.query('SELECT state, xact_start IS NOT NULL AS open_transaction FROM pg_stat_activity WHERE pid=$1',[cancel.processID])).rows[0]??null;
    assertion(result,'P3_CLEANUP_OWNS_CONTROL_BEFORE_REVIEWER_RESCUE',cancelSettled&&(!backend||(backend.state==='idle'&&!backend.open_transaction))&&!final.rejected&&nestedMessages(cleanup.combinedError).includes(callError?.message),{cancelSettled,poolRemoved:cancelRecord.removed,backend,final,cleanupErrors:cleanup.cleanupErrors.map(safeError),reviewerGateStillHeld:true});
    assertion(result,'P3_NO_ACTIVE_CONTROL_CLEAN_RELEASE',!cancelRecord.attempts.some(a=>!a.errorRelease&&a.activeQuery),{attempts:cancelRecord.attempts});
  } finally {
    sourceGate.open();await locker.query('ROLLBACK');locker.release();
    if(cancelJob)await within(cancelJob.catch(()=>{}),2500,'P3 cancellation outcome');
    await within(caller,2500,'P3 caller final outcome');
  }
  assertion(result,'P3_INDEPENDENT_OUTCOMES_OBSERVED',cancelSettled&&sourceSettled,{cancelSettled,sourceSettled,reviewerGateReleaseIsNotSubjectCleanup:true});
}

async function P4(actual,fixture,res,result) {
  const c=coordinator(actual,fixture,'P4_REAL_LATE_TERMINAL_FAILURE');
  const other=await c.tracker.acquire(res.proxy,'P4_other',c.normalDeadlineAt);
  const delivery=gate();const obtained=gate();let raw=null;const terminalFailuresReached=[];
  const controlled={connect:()=>res.borrow().then(async client=>{
    raw=client;const r=res.records.get(client);
    client.release=()=>{terminalFailuresReached.push('release');throw new Error('REVIEW_TERMINAL_ACTION_FAILURE: release');};
    r.endRestore=client.end;
    client.end=()=>{terminalFailuresReached.push('end');return Promise.reject(new Error('REVIEW_TERMINAL_ACTION_FAILURE: end'));};
    r.queryRestore=null;obtained.open();await delivery.promise;return client;
  })};
  const caller=c.tracker.acquire(controlled,'P4_late',Date.now()+250).catch(e=>e);
  await within(obtained.promise,3500,'P4 actual checkout');const callerError=await within(caller,3500,'P4 caller acquisition timeout');
  assert.equal(callerError?.code,'HARNESS_DEADLINE_EXCEEDED','P4_REQUIRED_TIMEOUT_NOT_REACHED');delivery.open();
  await observe(()=>terminalFailuresReached.length>0,'P4 actual terminal injection reached');await sleep(20);
  const cleanup=await subjectCleanup(c,{scenarioError:new Error('REVIEW_P4_ORIGINAL'),committed:true},'P4 subject cleanup');
  const final=capture(()=>c.assertFinalAccounting());const terminal=c.tracker.terminalActions.get(raw);
  const errors=[...nestedMessages(cleanup.combinedError),terminal?.error?.message,final.error?.message].filter(Boolean);
  const visible=errors.some(s=>s.includes('REVIEW_TERMINAL_ACTION_FAILURE'));
  assertion(result,PRIMARY.P4,terminalFailuresReached.length>0&&visible&&final.rejected&&terminal?.success!==true,{terminalFailuresReached,errorVisible:visible,final,terminal,poolRemovalObserved:res.records.get(raw).removed,subjectErrors:errors});
  assertion(result,'P4_ORIGINAL_ERROR_PRESERVED',nestedMessages(cleanup.combinedError).includes('REVIEW_P4_ORIGINAL'),{cleanupError:safeError(cleanup.combinedError)});
  assertion(result,'P4_OTHER_CLIENT_CLEANED',res.records.get(other).poolReleaseEvents===1,{poolReleaseEvents:res.records.get(other).poolReleaseEvents});
  result.observations.reviewerRescueRequired=res.records.get(raw).checkedOut;
}

async function internalProbe(o,subject) {
  assert.ok(IDS.includes(o.internal)&&o.internal!=='P5','INVALID_INTERNAL_PROBE');
  const result={id:o.internal,status:null,assertions:[],observations:{},identity:subject.identity,fixture:'NEW_UNIX_SOCKET_DISPOSABLE_POSTGRES',reviewerRescue:[]};
  let fixture,res;
  try {
    fixture=await buildFixture(subject);res=resources(fixture.pool);
    const actual=evaluateInlineSubject(subject);
    await ({P1,P2,P3,P4}[o.internal])(actual,fixture,res,result);
    result.status=result.assertions.every(a=>a.passed)?'PASS':'FAIL';
  } catch(e) {result.status='INFRASTRUCTURE_FAILURE';result.infrastructureError=safeError(e);}
  finally {
    if(res)result.reviewerRescue=await res.rescue();
    if(fixture)try{await within(fixture.close(),4000,'fixture shutdown');}catch(e){result.status='INFRASTRUCTURE_FAILURE';result.fixtureCleanupError=safeError(e);}
  }
  process.send?.({type:'probe-result',result});
}

function postgresBin() {
  const paths=process.env.HARVO_POSTGRES_BIN?[resolve(process.env.HARVO_POSTGRES_BIN)]:[...(process.env.PATH??'').split(delimiter),'/opt/homebrew/opt/postgresql@18/bin'];
  const found=paths.find(p=>['initdb','postgres','pg_ctl'].every(n=>existsSync(join(p,n))));assert.ok(found,'EXPLICIT_DISPOSABLE_POSTGRES_BINARIES_REQUIRED');return found;
}
function emergencyStop(runDir,bin) {
  const records=[];
  for(const name of readdirSync(runDir)) {
    if(!name.startsWith('harvo-pg-'))continue;
    const data=join(runDir,name,'data');
    if(!existsSync(join(data,'postmaster.pid')))continue;
    try {execFileSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe',timeout:8000});records.push({fixture:name,stopped:true});}
    catch {records.push({fixture:name,stopped:false});}
  }
  return records;
}
async function supervised(subject,o,id,base,bin) {
  const runDir=join(base,id);mkdirSync(runDir);
  const identityObserver=join(runDir,'identity-observer.mjs');
  const identityOutput=join(runDir,'installed-function.json');
  const lifecycleOutput=join(runDir,'lifecycle-observations.json');
  if(id==='P5')writeFileSync(identityObserver,buildP5Preload(subject,{identityOutput,lifecycleOutput}));
  const args=id==='P5'?['--import',subject.tsxLoader,'--import',identityObserver,'--test',join(subject.root,SOURCE_PATH)]:['--import',subject.tsxLoader,fileURLToPath(import.meta.url),'--subject-root',subject.root,'--subject-sha',o.sha,'--source-sha256',o.sourceHash,'--expect',o.mode,'--internal-probe',id,...(o.allowDirty?['--allow-dirty']:[])];
  const env=allowedEnv({TMPDIR:runDir,HARVO_POSTGRES_BIN:bin});
  const child=spawn(process.execPath,args,{cwd:subject.root,env,stdio:['ignore','pipe','pipe','ipc']});
  let message=null,output='',supervisor=false,spawnError=null;const installedFunctions=[];
  child.on('message',m=>{if(m.type==='probe-result')message=m.result;if(m.type==='installed-function')installedFunctions.push(m.identity);});
  child.stdout.on('data',b=>{output=(output+b.toString()).slice(-40000);});child.stderr.on('data',b=>{output=(output+b.toString()).slice(-40000);});
  const timer=setTimeout(()=>{supervisor=true;child.kill('SIGKILL');},id==='P5'?45000:20000);
  const exit=await new Promise(r=>{child.on('error',e=>{spawnError=e;r({code:null,signal:null});});child.on('close',(code,signal)=>r({code,signal}));});clearTimeout(timer);
  const leftovers=emergencyStop(runDir,bin);
  if(supervisor||spawnError||leftovers.length||(id!=='P5'&&(!message||exit.code!==0||exit.signal)))return {id,status:'INFRASTRUCTURE_FAILURE',supervisorIntervention:supervisor,processExit:exit,ownedFixtureEmergencyCleanup:leftovers,error:spawnError?safeError(spawnError):'Missing result, abnormal exit, forced termination or incomplete fixture cleanup; not an architectural RED.'};
  if(id==='P5') {
    if(existsSync(identityOutput))installedFunctions.push(JSON.parse(readFileSync(identityOutput,'utf8')));
    const count=Number(output.match(/(?:ℹ\s*tests|# tests)\s+(\d+)/)?.[1]??NaN);
    const fail=Number(output.match(/(?:ℹ\s*fail|# fail)\s+(\d+)/)?.[1]??NaN);
    const ordinaryPass=exit.code===0&&count===1&&fail===0&&installedFunctions.length>0;
    const lifecycle=existsSync(lifecycleOutput)?JSON.parse(readFileSync(lifecycleOutput,'utf8')):null;
    const observed=['setup_fixture','setup_c2_fixture','setup_c3_fixture'].every(name=>lifecycle?.setupNames.includes(name)&&lifecycle.setupQueryCounts[name]>0);
    const ownershipPass=observed&&lifecycle.pendingQueries===0&&lifecycle.pendingConnects===0&&lifecycle.violations.length===0;
    const pass=ordinaryPass&&ownershipPass;
    const semanticFail=exit.code!==0&&count===1&&fail===1&&output.includes('ERR_ASSERTION');
    return {id,status:pass?'PASS':observed&&(ordinaryPass||semanticFail)?'FAIL':'INFRASTRUCTURE_FAILURE',processExit:exit,nodeTests:count,failures:fail,ordinaryRegression:{status:ordinaryPass?'PASS':'FAIL'},lifecycleObservation:lifecycle,identity:subject.identity,installedFunctions,assertions:[{id:'P5_UNMODIFIED_SUBJECT_REGRESSIONS',passed:ordinaryPass},{id:'P5_ACTUAL_CHILD_OWNERSHIP',passed:ownershipPass}],diagnostics:ordinaryPass?[]:output.split('\n').filter(l=>/ERR_ASSERTION|not ok|AssertionError|error:|✖/.test(l)).slice(-12).map(l=>l.replaceAll(subject.root,'<subject>').slice(0,350)),limitations:'One observational class-registration hook and transparent pg dispatch/result witnesses; algorithms, callers, SQL and assertions unchanged. Covers actual runOperation/performFiniteCleanup scopes, including all three setup service-pool paths. Not universal field/database coverage. Complete G also requires P1-P4.'};
  }
  return {...message,processExit:exit,supervisorIntervention:false};
}

async function main() {
  assert.equal(Number(process.versions.node.split('.')[0]),24,'NODE_24_REQUIRED');
  const o=options(process.argv.slice(2));const subject=identifySubject(o);
  if(o.internal)return await internalProbe(o,subject);
  assert.ok(isAbsolute(o.output),'OUTPUT_MUST_BE_ABSOLUTE');
  if(existsSync(o.output))assert.ok(!lstatSync(o.output).isSymbolicLink(),'OUTPUT_SYMLINK_FORBIDDEN');
  o.output=join(realpathSync(dirname(o.output)),o.output.slice(o.output.lastIndexOf('/')+1));
  for(const root of [subject.root,realpathSync(resolve(HERE,'../../../../'))]){const rel=relative(root,o.output);assert.ok(rel==='..'||rel.startsWith('../')||isAbsolute(rel),'OUTPUT_MUST_BE_OUTSIDE_REPOSITORIES');}
  const bin=postgresBin();const base=mkdtempSync('/tmp/c4e-'); // Generated short socket paths; no dependency on retained /tmp artifacts.
  const report={pack:'C4-E02_EXECUTABLE_ACCEPTANCE',authorship:'GPT-6 reviewer-authored/adapted test code; no production implementation',generatedAt:new Date().toISOString(),mode:o.mode,identity:subject.identity,selectedProbes:o.probes,results:[],historicalCommandB:'UNKNOWN / OWNER FOLLOW-UP',production:'NOT EVALUATED'};
  try {
    for(const id of o.probes){identifySubject(o);report.results.push(await supervised(subject,o,id,base,bin));identifySubject(o);}
  } finally {
    const unstopped=report.results.some(r=>r.ownedFixtureEmergencyCleanup?.some(x=>!x.stopped));
    if(unstopped)report.preservedFixtureDirectory=base;else rmSync(base,{recursive:true,force:true});
  }
  const infra=report.results.some(r=>r.status==='INFRASTRUCTURE_FAILURE');
  const failed=report.results.filter(r=>r.status!=='PASS');
  let consistent=true;
  if(o.mode==='baseline')consistent=o.probes.every(id=>{const r=report.results.find(x=>x.id===id);return id==='P5'?r.status==='FAIL'&&r.ordinaryRegression.status==='PASS'&&r.lifecycleObservation.violations.some(v=>v.kind==='CONNECT_NOT_OWNED_AT_DISPATCH'&&v.operation.startsWith('setup')):r.status==='FAIL'&&r.assertions.some(a=>a.id===PRIMARY[id]&&!a.passed);});
  report.baselineSelfConsistency=o.mode==='baseline'?(consistent&&!infra?'PASS':'FAIL'):'NOT_APPLICABLE';
  report.acceptance=infra?'INVALID_OR_INCOMPLETE':failed.length?'CHANGES_REQUESTED':o.probes.length===5?'PASS':'PARTIAL_CHECKPOINT_PASS';
  report.readyForReview=!infra&&failed.length===0&&o.mode==='acceptance'&&o.probes.length===5&&!subject.identity.dirty;
  report.exitCode=infra||!consistent?2:failed.length?1:0;
  if(o.mode==='baseline'&&report.exitCode===0){report.acceptance='INVALID_BASELINE_PATTERN';report.exitCode=2;}
  if(o.output)writeFileSync(o.output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));process.exitCode=report.exitCode;
}
main().catch(e=>{console.error(JSON.stringify({acceptance:'INVALID_OR_INCOMPLETE',error:safeError(e)}));process.exitCode=2;});
