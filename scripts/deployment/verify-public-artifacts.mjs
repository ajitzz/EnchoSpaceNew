import {verifyPublicBuild} from '../../build/server/src/server/deployment/publicArtifacts.js';
const result=verifyPublicBuild(process.argv[2]||'dist');
console.log(JSON.stringify({event:'HARVO_PUBLIC_BUILD_VERIFIED',...result}));
