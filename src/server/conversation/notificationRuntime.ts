import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {ConversationNotificationWorker,type ConversationHintDispatchPort,type ConversationNotificationRun} from './notificationWorker.js';

/** Explicit queue credential; no consumer or migration-owner fallback. */
export function notificationConnectionConfig(env:NodeJS.ProcessEnv):pg.PoolConfig|null{
 if(env.CR1_NOTIFICATION_WORKER_ENABLED!=='true')return null;
 if(!env.CR1_NOTIFICATION_DATABASE_URL)throw new Error('NOTIFICATION_RUNTIME_CONFIGURATION_REQUIRED');
 try{
  const url=new URL(env.CR1_NOTIFICATION_DATABASE_URL);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||url.pathname.length<2||url.hash||(!local&&!url.password))throw new Error();
  for(const field of url.searchParams.keys())if(!['sslmode','channel_binding'].includes(field))throw new Error();
  url.searchParams.delete('sslmode');url.searchParams.delete('channel_binding');
  return {connectionString:url.toString(),ssl:local?false:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:8000,idleTimeoutMillis:10000,statement_timeout:10000,allowExitOnIdle:true,application_name:'encho_cr1_notification_hints'};
 }catch{throw new Error('NOTIFICATION_RUNTIME_CONFIGURATION_INVALID');}
}
export interface NotificationRuntimeReport{code:'NOTIFICATION_HINT_BATCH'|'NOTIFICATION_HINT_RUNTIME_UNAVAILABLE';counts?:ConversationNotificationRun}
/** Socket hints remain an optimization. This in-process adapter has no channel
 * delivery claim; canonical participant polling is the reconnect/fan-out fallback. */
export function startConversationNotifications(env:NodeJS.ProcessEnv,port:ConversationHintDispatchPort,report:(event:NotificationRuntimeReport)=>void):{stop:()=>Promise<void>}|null{
 let config:pg.PoolConfig|null;
 try{config=notificationConnectionConfig(env);}catch{report({code:'NOTIFICATION_HINT_RUNTIME_UNAVAILABLE'});return null;}
 if(!config)return null;
 const pool=new pg.Pool(config);pool.on('error',()=>report({code:'NOTIFICATION_HINT_RUNTIME_UNAVAILABLE'}));
 const worker=new ConversationNotificationWorker(pool,port,{workerId:`notification-hints:${randomUUID()}`,batchSize:10,leaseSeconds:60,dispatchTimeoutMs:2000});
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
 let active:Promise<void>|null=null;
 const run=()=>{
  if(stopped)return;
  active=(async()=>{
   try{const counts=await worker.runOnce();if(counts.claimed)report({code:'NOTIFICATION_HINT_BATCH',counts});}
   catch{report({code:'NOTIFICATION_HINT_RUNTIME_UNAVAILABLE'});}
   finally{active=null;if(!stopped){timer=setTimeout(run,10000);timer.unref();}}
  })();
 };
 run();
 return {async stop(){stopped=true;if(timer)clearTimeout(timer);await active;await pool.end();}};
}
