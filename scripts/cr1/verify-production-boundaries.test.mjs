import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyProductionBoundaries} from './verify-production-boundaries.mjs';

for(const statement of ["export {unsafe} from './prototype.js';","import('./prototype.js');","require('./prototype.js');","import {unsafe} from '@/prototype';"]){
  test(`rejects a transitive prototype dependency: ${statement}`,()=>{
    const directory=mkdtempSync(join(tmpdir(),'encho-import-'));
    try{
      writeFileSync(join(directory,'entry.ts'),"import './adapter.js';");
      writeFileSync(join(directory,'adapter.ts'),statement);
      writeFileSync(join(directory,'prototype.ts'),'export const unsafe=true;');
      const result=verifyProductionBoundaries({directory,entries:['entry.ts'],retired:['prototype.ts']});
      assert.equal(result.valid,false);assert.deepEqual(result.violations,[['entry.ts','adapter.ts','prototype.ts']]);
    }finally{rmSync(directory,{recursive:true,force:true});}
  });
}
test('test-only historical prototypes do not become production dependencies',()=>{
  const directory=mkdtempSync(join(tmpdir(),'encho-import-'));
  try{
    mkdirSync(join(directory,'test'));
    writeFileSync(join(directory,'entry.ts'),'export const safe=true;');
    writeFileSync(join(directory,'prototype.ts'),'export const unsafe=true;');
    writeFileSync(join(directory,'test','probe.ts'),"import '../prototype.js';");
    assert.equal(verifyProductionBoundaries({directory,entries:['entry.ts'],retired:['prototype.ts']}).valid,true);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
