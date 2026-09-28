/** Local disposable PostgreSQL process fixture; never reads application env files. */
import {realpathSync} from 'node:fs';
import pg from 'pg';
import {z} from 'zod';
import {ConversationNotificationWorker} from '../../src/server/conversation/notificationWorker.js';

const input=z.object({
 host:z.string().min(1),port:z.number().int().min(20000).max(49999),
 workerId:z.string().regex(/^notification\.child\.[a-z]+$/),
 mode:z.enum(['RUN','EXIT_AFTER_HINT']),
}).strict().parse(JSON.parse(process.argv[2]??'null'));
if(process.env.ENCHO_TEST_SANDBOX!=='1'||process.env.NODE_ENV!=='test'||!process.send
 ||!/[/]harvo-pg-[^/]+[/]socket$/.test(realpathSync(input.host)))throw new Error('LOCAL_DISPOSABLE_FIXTURE_REQUIRED');

const pool=new pg.Pool({host:input.host,port:input.port,database:'postgres',user:'cr1_notification_worker',max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:1000});
const worker=new ConversationNotificationWorker(pool,{dispatch:async ({payload})=>{
 if(input.mode==='EXIT_AFTER_HINT')await new Promise<never>(()=>{
  process.send!({type:'hint',notificationId:payload.notificationId},()=>process.exit(23));
 });
 else process.send!({type:'hint',notificationId:payload.notificationId});
 return {outcome:'SOCKET_HINT_DISPATCHED'};
}},{workerId:input.workerId});

process.once('message',async message=>{
 try{
  z.object({type:z.literal('run')}).strict().parse(message);
  const result=await worker.runOnce();
  process.send!({type:'result',result});
 }catch{process.exitCode=1;process.send!({type:'error',code:'LOCAL_WORKER_FIXTURE_FAILED'});}
 finally{await pool.end();process.disconnect();}
});
process.send({type:'ready'});
