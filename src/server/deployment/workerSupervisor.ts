export interface MaintenanceTask{name:string;intervalMs:number;run:()=>Promise<void>}
export interface WorkerProgress{version:1;pid:number;state:'STARTING'|'RUNNING'|'DRAINING'|'STOPPED'|'FAILED';startedAt:string;lastPollCompletedAt:string|null;lastDatabaseCheckAt:string|null;lastError:string|null;maintenance:Record<string,{lastCompletedAt:string|null;lastError:string|null}>}
const errorCode=(e:unknown)=>/^[A-Z_0-9]{1,100}$/.test((e as any)?.code||'')?(e as any).code:'WORKER_CYCLE_FAILED';
export function freshWorkerProgress(now=Date.now()):WorkerProgress{return {version:1,pid:process.pid,state:'STARTING',startedAt:new Date(now).toISOString(),lastPollCompletedAt:null,lastDatabaseCheckAt:null,lastError:null,maintenance:{}};}
export function waitForNextPoll(ms:number,signal:AbortSignal){return new Promise<void>(resolve=>{if(signal.aborted)return resolve();const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});});}
/** Sequential ownership: no overlapping cycles, no new job after stop, in-flight work drains. */
export async function runWorkerLoop(options:{progress:WorkerProgress;signal:AbortSignal;runJob:()=>Promise<boolean>;checkDatabase:()=>Promise<void>;maintenance:MaintenanceTask[];report:(value:WorkerProgress)=>void;now?:()=>number;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>}){
 const now=options.now||Date.now,sleep=options.sleep||waitForNextPoll,p=options.progress,nextDue=new Map<string,number>();let databaseDue=0;
 const report=()=>options.report(structuredClone(p));const onAbort=()=>{p.state='DRAINING';report();};options.signal.addEventListener('abort',onAbort,{once:true});
 try{p.state=options.signal.aborted?'DRAINING':'RUNNING';report();while(!options.signal.aborted){
  try{
   if(now()>=databaseDue){await options.checkDatabase();p.lastDatabaseCheckAt=new Date(now()).toISOString();databaseDue=now()+30000;report();}
   for(const task of options.maintenance){if(options.signal.aborted)break;if(now()<(nextDue.get(task.name)||0))continue;
    try{await task.run();p.maintenance[task.name]={lastCompletedAt:new Date(now()).toISOString(),lastError:null};}
    catch(e){p.maintenance[task.name]={lastCompletedAt:p.maintenance[task.name]?.lastCompletedAt||null,lastError:errorCode(e)};nextDue.set(task.name,now()+3000);report();continue;}
    nextDue.set(task.name,now()+task.intervalMs);report();
   }
   if(options.signal.aborted)break;const worked=await options.runJob();p.lastPollCompletedAt=new Date(now()).toISOString();p.lastError=Object.values(p.maintenance).find(value=>value.lastError)?.lastError||null;report();if(!worked)await sleep(1000,options.signal);
  }catch(e){p.lastError=errorCode(e);report();await sleep(3000,options.signal);}
 }p.state='STOPPED';report();}finally{options.signal.removeEventListener('abort',onAbort);}
}
export function workerProgressHealthy(value:unknown,now=Date.now(),maxAgeMs=180000):boolean{
 const p=value as WorkerProgress;if(!p||p.version!==1||p.state!=='RUNNING'||!Number.isSafeInteger(p.pid)||p.pid<=0||p.lastError||Object.values(p.maintenance||{}).some(v=>v.lastError))return false;
 return [p.lastPollCompletedAt,p.lastDatabaseCheckAt].every(v=>{const at=Date.parse(v||'');return Number.isFinite(at)&&at<=now&&now-at<=maxAgeMs;});
}
/** Background hosts without HTTP probes can restart a process that has stopped making progress. */
export function watchWorkerProgress(read:()=>WorkerProgress,fail:()=>void,options:{now?:()=>number;maxStallMs?:number;intervalMs?:number}={}){
 const now=options.now||Date.now;let lastHealthyAt=now();const limit=options.maxStallMs??180000;
 const timer=setInterval(()=>{const progress=read();if(['DRAINING','STOPPED','FAILED'].includes(progress.state))return;if(workerProgressHealthy(progress,now()))lastHealthyAt=Math.min(Date.parse(progress.lastPollCompletedAt!),Date.parse(progress.lastDatabaseCheckAt!));else if(now()-lastHealthyAt>=limit){clearInterval(timer);fail();}},options.intervalMs??30000);timer.unref();return ()=>clearInterval(timer);
}
