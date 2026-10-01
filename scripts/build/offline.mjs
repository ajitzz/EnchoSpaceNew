/** Credential-free compile only. Never invokes deployment/database preflight. */
import {spawnSync} from 'node:child_process';
import {delimiter,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

if(Number(process.versions.node.split('.')[0])!==24){
  console.error('Offline build requires Node 24.');process.exit(1);
}
const env=Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','SYSTEMROOT','TERM','NO_COLOR']
  .filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
Object.assign(env,{NODE_ENV:'production',PATH:`${dirname(process.execPath)}${delimiter}${env.PATH||''}`});
const root=fileURLToPath(new URL('../../',import.meta.url));
for(const args of [
  ['scripts/cr1/verify-production-boundaries.mjs'],
  ['node_modules/vite/bin/vite.js','build'],
  ['node_modules/typescript/bin/tsc','-p','tsconfig.server.json'],
  ['scripts/deployment/package-server-assets.mjs'],
  ['scripts/deployment/verify-public-artifacts.mjs'],
]){
  const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit'});
  if(result.error||result.signal||result.status!==0){process.exit(result.status||1);}
}
