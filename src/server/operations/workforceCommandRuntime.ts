import pg from 'pg';
import {CanonicalWorkforceCommands,type WorkforceCommandPort} from './workforceCommands.js';
import {workforceConnectionConfig,workforceRuntimeSettings} from './runtime.js';

/** Dedicated restricted workforce credential only; never the shared app pool. */
export function createWorkforceCommandRuntime(env:NodeJS.ProcessEnv,reportFault:()=>void):WorkforceCommandPort|null{
  try{
    const settings=workforceRuntimeSettings(env),connection=workforceConnectionConfig(env);
    if(!connection)return null;
    const pool=new pg.Pool(connection);pool.on('error',reportFault);
    return new CanonicalWorkforceCommands(pool,settings);
  }catch{reportFault();return null;}
}
