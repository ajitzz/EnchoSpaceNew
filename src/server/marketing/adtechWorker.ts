import pg from 'pg';
import {readMarketingConfig} from '../../lib/marketing/config.js';
import {CorridorInferenceWorker} from '../../lib/marketing/adtech/inference.js';
import {databaseReadiness} from '../deployment/databaseReadiness.js';
import {isProcessEntry} from '../deployment/lifecycle.js';
import {freshWorkerProgress,runWorkerLoop,watchWorkerProgress} from '../deployment/workerSupervisor.js';
import {writeWorkerProgress} from '../deployment/workerProgress.js';

/** Separate process: slow research cannot delay pause, refund or inventory jobs. */
export async function runAdtechWorker(){
 if(process.env.NODE_ENV!=='production')await import('dotenv/config');
 const raw=process.env.DATABASE_URL?.trim();
 if(!raw||/dummy|placeholder|example\.com/i.test(raw)||!['postgres:','postgresql:'].includes(new URL(raw).protocol))throw new Error('ADTECH_DATABASE_CONFIGURATION_REQUIRED');
 const config=readMarketingConfig();
 if(process.env.HARVO_ADTECH_ENABLED!=='true'||!config.policyAdminId||!process.env.GEMINI_API_KEY||!process.env.GEMINI_MARKETING_MODEL||!process.env.HARVO_GEOCODING_API_KEY)throw new Error('ADTECH_RESEARCH_CONFIGURATION_REQUIRED');
 const pool=new pg.Pool({connectionString:raw,max:4,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000});
 const controller=new AbortController(),progress=freshWorkerProgress(),health=process.env.HARVO_ADTECH_WORKER_HEALTH_FILE||'/tmp/harvo-adtech-worker-health.json';
 const report=()=>writeWorkerProgress(progress,health);let deadline:NodeJS.Timeout|undefined;
 const stop=()=>{if(controller.signal.aborted)return;controller.abort();deadline=setTimeout(()=>{progress.state='FAILED';progress.lastError='ADTECH_SHUTDOWN_TIMEOUT';report();process.exit(1);},60000);deadline.unref();};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);report();
 const stopWatchdog=watchWorkerProgress(()=>progress,()=>{progress.state='FAILED';progress.lastError='ADTECH_PROGRESS_STALLED';report();process.exit(1);},{maxStallMs:180000});
 try{
  if(!(await databaseReadiness(pool)).ready)throw new Error('ADTECH_DATABASE_NOT_READY');
  if((await pool.query('SELECT role FROM users WHERE id=$1',[config.policyAdminId])).rows[0]?.role!=='admin')throw new Error('ADTECH_SERVICE_ACTOR_INVALID');
  const worker=new CorridorInferenceWorker(pool,{id:config.policyAdminId,role:'system'});
  await runWorkerLoop({progress,signal:controller.signal,runJob:()=>worker.runOnce(),checkDatabase:async()=>{await pool.query('SELECT 1');},maintenance:[],report});
 }catch{progress.state='FAILED';progress.lastError='ADTECH_WORKER_FAILED';report();throw new Error('ADTECH_WORKER_FAILED');}
 finally{stopWatchdog();process.off('SIGTERM',stop);process.off('SIGINT',stop);await pool.end();if(deadline)clearTimeout(deadline);}
}
if(isProcessEntry(import.meta.url))runAdtechWorker().catch(()=>{console.error('ADTECH_WORKER_FAILED');process.exitCode=1;});
