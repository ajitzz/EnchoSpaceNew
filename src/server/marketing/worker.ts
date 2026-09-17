import pg from 'pg';
import {createMarketingRuntime} from './runtime.js';
import {sweepExpiredHolds} from '../../services/inventoryHoldService.js';
import {databaseReadiness} from '../deployment/databaseReadiness.js';
import {freshWorkerProgress,runWorkerLoop,watchWorkerProgress,type MaintenanceTask} from '../deployment/workerSupervisor.js';
import {writeWorkerProgress} from '../deployment/workerProgress.js';
import {isProcessEntry} from '../deployment/lifecycle.js';

type Runtime=ReturnType<typeof createMarketingRuntime>;
/** Dedicated owner; importing this module never starts timers or opens a database. */
export async function runMarketingWorker(options:{additionalMaintenance?:(runtime:Runtime,pool:pg.Pool)=>MaintenanceTask[]}={}){
 if(process.env.NODE_ENV!=='production')await import('dotenv/config');
 const raw=process.env.DATABASE_URL?.trim();
 if(!raw||/dummy|placeholder|example\.com/i.test(raw))throw new Error('WORKER_DATABASE_CONFIGURATION_REQUIRED');
 const url=new URL(raw);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('WORKER_DATABASE_PROTOCOL_INVALID');
 if(process.env.HARVO_HOLD_SWEEPER_ENABLED!=='true')throw new Error('WORKER_HOLD_SWEEPER_OWNERSHIP_REQUIRED');
 const pool=new pg.Pool({connectionString:raw,max:8,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000});
 const controller=new AbortController(),progress=freshWorkerProgress();let deadline:NodeJS.Timeout|undefined;
 const stop=()=>{if(controller.signal.aborted)return;controller.abort();deadline=setTimeout(()=>{progress.state='FAILED';progress.lastError='WORKER_SHUTDOWN_TIMEOUT';writeWorkerProgress(progress);process.exit(1);},60000);deadline.unref();};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);writeWorkerProgress(progress);
 const stopWatchdog=watchWorkerProgress(()=>progress,()=>{progress.state='FAILED';progress.lastError='WORKER_PROGRESS_STALLED';writeWorkerProgress(progress);console.error('HARVO_WORKER_PROGRESS_STALLED');process.exit(1);});
 try{
  const ready=await databaseReadiness(pool);if(!ready.ready)throw new Error('WORKER_DATABASE_NOT_READY');
  const runtime=createMarketingRuntime(pool, {
  verifyBooking: async (request: any): Promise<any> => {
    try {
      const res = await pool.query('SELECT id, status, total_rent FROM bookings WHERE id = $1 FOR SHARE', [Number(request.reference)]);
      const b = res.rows[0];
      if (!b) return null;
      const isAccepted = ['Confirmed', 'Booked', 'Completed'].includes(b.status);
      return {
        id: String(b.id),
        status: isAccepted ? 'ACCEPTED' : 'REJECTED',
        revenueMinor: String(Math.round(Number(b.total_rent || 0) * 100))
      };
    } catch(e) { return null; }
  },
  resolveAttribution: async (request: any): Promise<any> => {
    return { consent: { granted: true, timestamp: new Date() } };
  }
});if(!runtime.config.policyAdminId)throw new Error('WORKER_SERVICE_ACTOR_REQUIRED');
  const actor=(await pool.query('SELECT role FROM users WHERE id=$1',[runtime.config.policyAdminId])).rows[0];if(actor?.role!=='admin')throw new Error('WORKER_SERVICE_ACTOR_INVALID');
  const maintenance:MaintenanceTask[]=[
   {name:'expiredHolds',intervalMs:60000,run:async()=>{const result=await sweepExpiredHolds(pool);if(result.errors.length)throw Object.assign(new Error('Hold cleanup failed'),{code:'WORKER_HOLD_SWEEP_FAILED'});}},
   {name:'campaignObservations',intervalMs:300000,run:async()=>{await runtime.engine.scheduleObservations();}},
   ...(runtime.creative?[{name:'creativePreparation',intervalMs:5000,run:async()=>{await runtime.creative!.runOnce();}}]:[]),
   {name:'canonicalConversions',intervalMs:60000,run:async()=>{await runtime.conversions.runOnce();}},
   ...(options.additionalMaintenance?.(runtime,pool)||[]),
  ];
  console.log(JSON.stringify({event:'HARVO_WORKER_STARTED',pid:process.pid,maintenance:maintenance.map(x=>x.name)}));
  await runWorkerLoop({progress,signal:controller.signal,runJob:()=>runtime.engine.runOnce(),checkDatabase:async()=>{await pool.query('SELECT 1');},maintenance,report:writeWorkerProgress});
 }catch{
  progress.state='FAILED';progress.lastError='WORKER_RUNTIME_FAILED';writeWorkerProgress(progress);throw new Error('HARVO_WORKER_FAILED');
 }finally{stopWatchdog();process.off('SIGTERM',stop);process.off('SIGINT',stop);await pool.end();if(deadline)clearTimeout(deadline);}
}
if(isProcessEntry(import.meta.url))runMarketingWorker().catch(()=>{console.error('HARVO_WORKER_FAILED');process.exitCode=1;});
