import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {packageMigrationAssets} from './migration-assets.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(run){
  const root=mkdtempSync(join(tmpdir(),'encho-sql-assets-'));
  const source=join(root,'source'),destination=join(root,'candidate');
  mkdirSync(source);mkdirSync(destination);
  writeFileSync(join(source,'001_test.sql'),'SELECT 1;');
  const manifest=[{version:'001_test.sql',checksum:hash('SELECT 1;')}];
  try{run({source,destination,manifest,root});}finally{rmSync(root,{recursive:true,force:true});}
}
test('clean candidates copy exact source and repeated packaging preserves bytes',()=>fixture(args=>{
  packageMigrationAssets(args);packageMigrationAssets(args);
  assert.equal(readFileSync(join(args.destination,'001_test.sql'),'utf8'),'SELECT 1;');
}));
for(const [name,content] of [['047_missing_source.sql','original unknown bytes'],['001_test.sql','different previous bytes']]){
  test(`mismatch preserves old ${name} without partial writes`,()=>fixture(args=>{
    writeFileSync(join(args.destination,name),content);
    assert.throws(()=>packageMigrationAssets(args),/MIGRATION_ASSET_EXISTING_MISMATCH/);
    assert.deepEqual(readdirSync(args.destination),[name]);
    assert.equal(readFileSync(join(args.destination,name),'utf8'),content);
  }));
}
test('a symlink to source cannot become an artifact destination',()=>fixture(args=>{
  const linked=join(args.root,'linked');symlinkSync(args.source,linked,'dir');
  assert.throws(()=>packageMigrationAssets({...args,destination:linked}),/SOURCE_OVERWRITE_FORBIDDEN/);
  assert.equal(readFileSync(join(args.source,'001_test.sql'),'utf8'),'SELECT 1;');
}));
test('an existing SQL symlink is rejected without overwriting its target',()=>fixture(args=>{
  symlinkSync(join(args.source,'001_test.sql'),join(args.destination,'001_test.sql'));
  assert.throws(()=>packageMigrationAssets(args),/EXISTING_MISMATCH/);
  assert.equal(readFileSync(join(args.source,'001_test.sql'),'utf8'),'SELECT 1;');
}));
test('source drift after manifest capture does not produce a partial candidate',()=>fixture(args=>{
  writeFileSync(join(args.source,'001_test.sql'),'SELECT 2;');
  assert.throws(()=>packageMigrationAssets(args),/SOURCE_CHANGED/);
  assert.deepEqual(readdirSync(args.destination),[]);
}));
