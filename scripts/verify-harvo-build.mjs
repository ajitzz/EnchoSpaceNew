import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'vite';

// Invoke with env -i PATH="$PATH". Never load ambient .env or start the application.
const directory=mkdtempSync(join(tmpdir(),'harvo-release-build-'));
await build({envDir:false,build:{outDir:join(directory,'client'),emptyOutDir:true}});
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.server.json','--outDir',join(directory,'server')],{stdio:'inherit',env:{PATH:process.env.PATH},timeout:900000});
if(result.error||result.status!==0){console.error('HARVO_SERVER_BUILD_FAILED');process.exitCode=1;}
else{const copied=spawnSync(process.execPath,['scripts/deployment/package-server-assets.mjs',join(directory,'server')],{stdio:'inherit',env:{PATH:process.env.PATH},timeout:30000});if(copied.error||copied.status!==0)throw new Error('HARVO_SERVER_ASSET_PACKAGING_FAILED');const {verifyPublicBuild}=await import(pathToFileURL(join(directory,'server/src/server/deployment/publicArtifacts.js')).href);const publicArtifacts=verifyPublicBuild(join(directory,'client'));const evidence={scope:'BUILD_ONLY_NO_DEPLOYMENT',client:'PASSED',server:'PASSED',serverSql:'PACKAGED_PRIVATE',publicArtifacts,envDir:false,directory};writeFileSync(join(directory,'verification.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));}
