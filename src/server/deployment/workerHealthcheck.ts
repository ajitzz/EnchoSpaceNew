import {readFileSync} from 'node:fs';
import {workerProgressHealthy} from './workerSupervisor.js';
try{const status=JSON.parse(readFileSync(process.env.HARVO_WORKER_HEALTH_FILE||'/tmp/harvo-worker-health.json','utf8'));process.exitCode=workerProgressHealthy(status)?0:1;}catch{process.exitCode=1;}
