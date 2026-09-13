import {lstatSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';

const privateRoots=new Set(['src','server','build','node_modules','api','components','scripts','docs','.git']);
export function isPrivatePublicPath(value:string):boolean {
 const parts=value.replaceAll('\\','/').split('/').filter(Boolean);
 return parts.some(p=>p==='..'||p.startsWith('.'))||privateRoots.has((parts[0]||'').toLowerCase())||parts.some(p=>/^(?:server|worker)\.[cm]?js$/i.test(p)||/^package(?:-lock)?\.json$/i.test(p)||/^tsconfig.*\.json$/i.test(p)||/\.(?:tsx?|sql|pem|key|p12|pfx|map)$/i.test(p));
}
/** Build/startup guard: public artifacts cannot be symlinks or contain private server output. */
export function verifyPublicBuild(directory:string):{files:number} {
 const root=resolve(directory);if(!existsSync(root)||lstatSync(root).isSymbolicLink()||!lstatSync(root).isDirectory()||!existsSync(join(root,'index.html')))throw new Error('PUBLIC_BUILD_MISSING');let files=0;
 const walk=(path:string)=>{for(const name of readdirSync(path)){const absolute=join(path,name),local=relative(root,absolute),stat=lstatSync(absolute);if(stat.isSymbolicLink()||isPrivatePublicPath(local))throw new Error(`PRIVATE_PUBLIC_ARTIFACT:${local}`);if(stat.isDirectory())walk(absolute);else if(stat.isFile())files++;else throw new Error('PUBLIC_ARTIFACT_TYPE_INVALID');}};
 walk(root);return {files};
}
