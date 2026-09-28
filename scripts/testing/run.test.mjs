import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('script tests inherit the same secret-free environment as Vitest',()=>{
  const folder=mkdtempSync(join(root,'scripts/testing/probe-'));
  const file=join(folder,'environment.test.mjs');
  try{
    writeFileSync(file,`import {test} from 'node:test'; import {strict as assert} from 'node:assert';
      test('isolation',()=>{
        for(const key of ['DATABASE_URL','META_ACCESS_TOKEN','PRIVATE_CANARY_TOKEN']) assert.equal(process.env[key],undefined);
        assert.equal(process.env.ENCHO_TEST_SANDBOX,'1');
        assert.equal(process.env.NODE_ENV,'test');
        assert.equal(process.env.TZ,'UTC');
        assert.match(process.env.TEST_DATABASE_URL,/encho-test.invalid/);
      });`);
    const result=spawnSync(process.execPath,['scripts/testing/run.mjs','--node-test',relative(root,file)],{
      cwd:root,encoding:'utf8',env:{...process.env,DATABASE_URL:'fixture-must-not-inherit',
        META_ACCESS_TOKEN:'fixture-must-not-inherit',PRIVATE_CANARY_TOKEN:'fixture-must-not-inherit'},
    });
    assert.equal(result.status,0,result.stderr);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('script test mode cannot dispatch an arbitrary operator script',()=>{
  const result=spawnSync(process.execPath,['scripts/testing/run.mjs','--node-test','scripts/deployment/verify-schema-sync.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/explicit script test files/);
});
