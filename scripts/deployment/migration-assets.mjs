import {constants,copyFileSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

/** SQL from an earlier artifact may be the only recoverable applied source.
 * Preserve mismatches for investigation; never synchronize by deletion. */
export function packageMigrationAssets({source,destination,manifest}){
  const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  if(!Array.isArray(manifest)||!manifest.length||manifest.some(row=>
    !/^\d{3}_[a-z0-9_]+\.sql$/.test(row.version)||!/^[a-f0-9]{64}$/.test(row.checksum))
    ||new Set(manifest.map(row=>row.version)).size!==manifest.length)throw new Error('MIGRATION_ASSET_MANIFEST_INVALID');
  mkdirSync(destination,{recursive:true});
  if(realpathSync(source)===realpathSync(destination))throw new Error('MIGRATION_ASSET_SOURCE_OVERWRITE_FORBIDDEN');
  const expected=new Map(manifest.map(row=>[row.version,row.checksum]));
  const present=new Set(readdirSync(destination).filter(name=>name.endsWith('.sql')));
  // Validate all previous bytes before adding anything. The caller must select
  // a new candidate directory when old SQL differs; no implicit repair occurs.
  for(const name of present){
    const file=join(destination,name);
    if(!lstatSync(file).isFile()||!expected.has(name)||hash(file)!==expected.get(name))throw new Error('MIGRATION_ASSET_EXISTING_MISMATCH');
  }
  for(const {version,checksum} of manifest){
    if(!lstatSync(join(source,version)).isFile()||hash(join(source,version))!==checksum)throw new Error('MIGRATION_ASSET_SOURCE_CHANGED');
  }
  for(const {version} of manifest){
    if(!present.has(version))copyFileSync(join(source,version),join(destination,version),constants.COPYFILE_EXCL);
  }
}
