import {writeFileSync,renameSync} from 'node:fs';
import type {WorkerProgress} from './workerSupervisor.js';

export function writeWorkerProgress(value:WorkerProgress,path=process.env.HARVO_WORKER_HEALTH_FILE||'/tmp/harvo-worker-health.json'){
 const temporary=`${path}.${process.pid}.tmp`;
 writeFileSync(temporary,JSON.stringify(value)+'\n',{mode:0o600});renameSync(temporary,path);
}
