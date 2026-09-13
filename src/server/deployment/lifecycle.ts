import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import type {Server} from 'node:http';

export function isProcessEntry(moduleUrl:string,argv=process.argv){
 if(!argv[1])return false;const entry=resolve(argv[1]),modulePath=fileURLToPath(moduleUrl);
 try{return realpathSync(entry)===realpathSync(modulePath);}catch{return entry===modulePath;}
}
/** Stop accepting requests before ending pools; upgraded sockets are drained by the caller. */
export async function drainHttpServer(server:Server|undefined){
 if(!server?.listening)return;
 await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections?.();});
}
export function createShutdown(options:{markDraining:()=>void;drain:()=>Promise<void>;closeResources:()=>Promise<void>;exit:(code:number)=>void;deadlineMs?:number;log:(event:string)=>void}){
 let pending:Promise<void>|undefined;let exitCode=0;
 return (code=0)=>{
  exitCode=Math.max(exitCode,code);
  if(pending)return pending;
  options.markDraining();options.log('PROCESS_DRAINING');
  const deadline=setTimeout(()=>{options.log('PROCESS_SHUTDOWN_TIMEOUT');options.exit(1);},options.deadlineMs??60000);deadline.unref();
  pending=(async()=>{try{await options.drain();await options.closeResources();}catch{exitCode=1;options.log('PROCESS_SHUTDOWN_FAILED');}finally{clearTimeout(deadline);options.log('PROCESS_STOPPED');options.exit(exitCode);}})();return pending;
 };
}
