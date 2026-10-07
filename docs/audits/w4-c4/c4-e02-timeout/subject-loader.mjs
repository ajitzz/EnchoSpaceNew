/** Reviewer-authored loader. Evaluates the identified subject's actual inline bytes. */
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve, dirname} from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

export const BASELINE_SHA = '764b9eadd5947dccf8e3ceb1333fd36c32a59f0f';
export const BASELINE_SOURCE_HASH = '54ec2fc9686a150b2882b698542eaad0166f6729e47cbff2122b02d408ca015e';
export const SOURCE_PATH = 'scripts/testing/w4c4-composition-finalizer-lock-hardening.mjs';
export const MIGRATION_PATH = 'src/migrations/060_canonical_payment_composition_lock_order_hardening.sql';
export const MIGRATION_HASH = '0823b6d434ebad6a6bce11196671a6ad8ff0a567049ca001fc7f4c3e9708548c';
export const HELPER_PATH = 'scripts/testing/helpers/w4c4-concurrency-evidence.mjs';
export const HELPER_HASH = '87ca30711882b7f5b539a112c4f3d0898fe752f504ea23dd7a4b4f9e4994ae78';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const allowedDirty = new Set([SOURCE_PATH, 'docs/implementation/receipts/W4_C4_COMPOSITION_FINALIZER_LOCK_HARDENING_LOCAL_2026_10_07.json']);
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8', timeout:5000}).trim();

export function identifySubject({root, sha, sourceHash, mode, allowDirty=false}) {
  assert.match(sha, /^[a-f0-9]{40}$/, 'SUBJECT_SHA_REQUIRED');
  assert.match(sourceHash, /^[a-f0-9]{64}$/, 'SOURCE_HASH_REQUIRED');
  root = realpathSync(resolve(root));
  assert.equal(realpathSync(git(root, 'rev-parse', '--show-toplevel')), root, 'EXPLICIT_SUBJECT_ROOT_REQUIRED');
  assert.equal(git(root, 'rev-parse', 'HEAD'), sha, 'SUBJECT_HEAD_MISMATCH');
  const source = readFileSync(join(root, SOURCE_PATH), 'utf8');
  assert.equal(hash(source), sourceHash, 'SUBJECT_SOURCE_DIGEST_MISMATCH');
  assert.equal(hash(readFileSync(join(root, MIGRATION_PATH))), MIGRATION_HASH, 'FROZEN_SQL_MISMATCH');
  assert.equal(hash(readFileSync(join(root, HELPER_PATH))), HELPER_HASH, 'FROZEN_HELPER_MISMATCH');
  const porcelain = execFileSync('git', ['-C',root,'status','--porcelain=v1','--untracked-files=all'], {encoding:'utf8',timeout:5000}).trimEnd();
  const changed = porcelain ? porcelain.split('\n').map(line => line.slice(3)) : [];
  if (changed.length) {
    assert.ok(allowDirty && mode === 'acceptance', 'DIRTY_SUBJECT_NOT_AUTHORIZED');
    assert.ok(changed.every(path => allowedDirty.has(path)), 'DIRTY_SCOPE_EXCEEDS_TWO_WORKER_FILES');
  }
  if (mode === 'baseline') {
    assert.equal(sha, BASELINE_SHA, 'BASELINE_SHA_MISMATCH');
    assert.equal(sourceHash, BASELINE_SOURCE_HASH, 'BASELINE_SOURCE_MISMATCH');
    assert.equal(changed.length, 0, 'BASELINE_MUST_BE_CLEAN');
  }
  assert.ok(!/\b(?:import|require)\s*\(?\s*['"]dotenv|process\.env\.(?:DATABASE_URL|PGHOST|PGDATABASE)/.test(source), 'SUBJECT_AMBIENT_DATABASE_PATH');
  const require = createRequire(join(root, 'package.json'));
  const pgPoolVersion = JSON.parse(readFileSync(join(dirname(require.resolve('pg-pool')),'package.json'),'utf8')).version;
  assert.equal(require('pg/package.json').version, '8.23.0', 'INSTALLED_PG_VERSION_MISMATCH');
  assert.equal(pgPoolVersion, '3.14.0', 'INSTALLED_PG_POOL_VERSION_MISMATCH');
  const pgEntry = require.resolve('pg');
  const tsxLoader = require.resolve('tsx');
  const ts = require('typescript');
  const syntax = ts.createSourceFile(SOURCE_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(syntax.parseDiagnostics.length, 0, 'SUBJECT_PARSE_FAILURE');
  const startText = '    const SCENARIO_DEADLINE_MS =';
  const endText = '    // NEGATIVE CONTROL: EXPIRED BUDGET MUST REJECT WITH ZERO ACTION INVOCATIONS';
  assert.equal(source.split(startText).length, 2, 'EXTRACTION_START_AMBIGUOUS');
  assert.equal(source.split(endText).length, 2, 'EXTRACTION_END_AMBIGUOUS');
  const start = source.indexOf(startText);
  const end = source.lastIndexOf('    // =========================================================================', source.indexOf(endText));
  assert.ok(end > start, 'EXTRACTION_ORDER_FAILURE');
  const slice = source.slice(start, end);
  const parsed = ts.createSourceFile('inline-subject.js', slice, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(parsed.parseDiagnostics.length, 0, 'INLINE_EXTRACTION_PARSE_FAILURE');
  for (const name of ['ClientTracker', 'CaseLocalCoordinator']) {
    assert.equal(parsed.statements.filter(node => ts.isClassDeclaration(node) && node.name?.text === name).length, 1, `INLINE_CLASS_MISSING: ${name}`);
  }
  return {
    root, source, slice, pgEntry, tsxLoader,
    identity: {
      gitSha:sha, sourcePath:SOURCE_PATH, sourceSha256:sourceHash,
      committedSourceSha256:hash(execFileSync('git', ['-C', root, 'show', `${sha}:${SOURCE_PATH}`], {timeout:5000})),
      dirty:changed.length > 0, changedPaths:changed,
      qualification:changed.length ? 'EXPLICIT_DIRTY_TWO_FILE_SUBJECT' : 'CLEAN_COMMITTED_SUBJECT',
      migrationSha256:MIGRATION_HASH,
      helperSha256:hash(readFileSync(join(root, HELPER_PATH))),
      extraction:{startLine:source.slice(0,start).split('\n').length,endLine:source.slice(0,end).split('\n').length-1,sha256:hash(slice)},
      nodeVersion:process.version,
      pgVersion:require('pg/package.json').version,
      pgPoolVersion,
    },
  };
}

export function evaluateInlineSubject(identified) {
  const context = vm.createContext({assert, randomUUID, setTimeout, clearTimeout, Date, Error, AggregateError, Map, Set, Promise, console});
  new vm.Script(`${identified.slice}\nglobalThis.__actualSubject = {ClientTracker, CaseLocalCoordinator};`, {filename:SOURCE_PATH}).runInContext(context, {timeout:2000});
  const actual = context.__actualSubject;
  for (const name of ['acquire','releaseClean','discard','assertAllAccountedFor']) assert.equal(typeof actual.ClientTracker.prototype[name], 'function', `ACTUAL_METHOD_MISSING: ${name}`);
  for (const name of ['runOperation','performFiniteCleanup','assertFinalAccounting']) assert.equal(typeof actual.CaseLocalCoordinator.prototype[name], 'function', `ACTUAL_METHOD_MISSING: ${name}`);
  return actual;
}

/** Observational hook only: actual class bodies and actual full test callers stay intact. */
export function buildP5Preload(subject, {identityOutput,lifecycleOutput}) {
  const marker='    // NEGATIVE CONTROL: EXPIRED BUDGET MUST REJECT WITH ZERO ACTION INVOCATIONS';
  const observedSource=subject.source.replace(marker,`    globalThis.__C4_REVIEW_INSTALL({ClientTracker,CaseLocalCoordinator});\n${marker}`);
  return `
    import {createRequire,registerHooks} from 'node:module';
    import {AsyncLocalStorage} from 'node:async_hooks';
    import {writeFileSync} from 'node:fs';
    const pg=createRequire(${JSON.stringify(join(subject.root,'package.json'))})('pg');
    const scope=new AsyncLocalStorage();const acquisition=new AsyncLocalStorage();
    const audit={setupNames:[],setupQueryCounts:{},queryCount:0,connectCount:0,pendingQueries:0,pendingConnects:0,violationCount:0,violationsByKind:{},scenarios:{},violations:[]};
    const save=()=>writeFileSync(${JSON.stringify(lifecycleOutput)},JSON.stringify(audit));
    const scenario=s=>audit.scenarios[s.coordinator.scenarioName]??=( {queryCount:0,connectCount:0,violationCount:0} );
    const bad=(kind,s)=>{audit.violationCount++;scenario(s).violationCount++;audit.violationsByKind[kind]=(audit.violationsByKind[kind]??0)+1;if(audit.violations.length<80)audit.violations.push({kind,operation:s.name,scenario:s.coordinator.scenarioName});save();};
    globalThis.__C4_REVIEW_INSTALL=({ClientTracker,CaseLocalCoordinator})=>{
      const originalRun=CaseLocalCoordinator.prototype.runOperation;
      CaseLocalCoordinator.prototype.runOperation=function(name,...args){
        const isSetup=['setup_fixture','setup_c2_fixture','setup_c3_fixture'].includes(name);
        if(isSetup&&!audit.setupNames.includes(name))audit.setupNames.push(name);
        return scope.run({coordinator:this,name,isSetup,rootSetup:isSetup?name:scope.getStore()?.rootSetup},()=>originalRun.call(this,name,...args));
      };
      const originalCleanup=CaseLocalCoordinator.prototype.performFiniteCleanup;
      CaseLocalCoordinator.prototype.performFiniteCleanup=function(...args){return scope.run({coordinator:this,name:'performFiniteCleanup',isSetup:false},()=>originalCleanup.apply(this,args));};
      const originalAcquire=ClientTracker.prototype.acquire;
      ClientTracker.prototype.acquire=function(pool,...args){return acquisition.run({tracker:this,logicalPool:pool,priorAttempts:new Set(this.acquisitionAttempts.values())},()=>originalAcquire.call(this,pool,...args));};
    };
    const originalQuery=pg.Client.prototype.query;
    pg.Client.prototype.query=function(...args){
      const s=scope.getStore();let op=null;
      if(s){
        audit.queryCount++;scenario(s).queryCount++;audit.pendingQueries++;
        if(s.rootSetup)audit.setupQueryCounts[s.rootSetup]=(audit.setupQueryCounts[s.rootSetup]??0)+1;
        const entry=s.coordinator.tracker.entries.get(this);
        op=[...s.coordinator.operations.values()].find(o=>o.name!==s.name&&o.owningClient===this&&o.started&&!o.settled);
        // A runOperation's own query may be its declared owner's work. Setup's outer wrapper cannot own service children.
        if(!op&&!s.isSetup)op=[...s.coordinator.operations.values()].find(o=>o.name===s.name&&o.owningClient===this&&o.started&&!o.settled);
        if(!entry||!op||!entry.activeOps?.has(op.name))bad('QUERY_NOT_OWNED_AT_DISPATCH',s);
        save();
      }
      const done=()=>{if(s){audit.pendingQueries--;if(op&&(s.coordinator.operations.get(op.name)!==op||op.owningClient!==this||op.settled||!s.coordinator.tracker.entries.get(this)?.activeOps?.has(op.name)))bad('QUERY_OWNER_REMOVED_BEFORE_SETTLEMENT',s);save();}};
      if(typeof args.at(-1)==='function'){const callback=args.at(-1);args[args.length-1]=(...v)=>{done();return callback(...v);};}
      let result;try{result=originalQuery.apply(this,args);}catch(e){done();throw e;}
      if(result?.then)result.then(done,done);
      return result;
    };
    const originalConnect=pg.Pool.prototype.connect;
    pg.Pool.prototype.connect=function(...args){
      const s=scope.getStore();const a=acquisition.getStore();let attempt=null;
      if(s){
        audit.connectCount++;scenario(s).connectCount++;audit.pendingConnects++;
        attempt=a&&[...a.tracker.acquisitionAttempts.values()].find(x=>x.pool===a.logicalPool&&!a.priorAttempts.has(x));
        if(!attempt||a.tracker!==s.coordinator.tracker)bad('CONNECT_NOT_OWNED_AT_DISPATCH',s);
        save();
      }
      const done=()=>{if(s){audit.pendingConnects--;if(attempt&&![...s.coordinator.tracker.acquisitionAttempts.values()].includes(attempt))bad('CONNECT_OWNER_REMOVED_BEFORE_SETTLEMENT',s);save();}};
      if(typeof args[0]==='function'){const callback=args[0];args[0]=(...v)=>{done();return callback(...v);};}
      let result;try{result=originalConnect.apply(this,args);}catch(e){done();throw e;}
      if(result?.then)result.then(done,done);
      return result;
    };
    const originalPoolQuery=pg.Pool.prototype.query;
    pg.Pool.prototype.query=function(...args){
      const result=originalPoolQuery.apply(this,args);const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
      if(sql?.includes('pg_get_functiondef')&&sql.includes('AS function_hash')&&result?.then)
        result.then(r=>{if(r.rows[0])writeFileSync(${JSON.stringify(identityOutput)},JSON.stringify(r.rows[0]));},()=>{});
      return result;
    };
    registerHooks({load(url,context,nextLoad){
      if(url===${JSON.stringify(pathToFileURL(join(subject.root,SOURCE_PATH)).href)})return {format:'module',source:${JSON.stringify(observedSource)},shortCircuit:true};
      return nextLoad(url,context);
    }});
  `;
}
