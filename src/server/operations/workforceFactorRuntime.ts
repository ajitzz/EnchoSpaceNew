import pg from 'pg';
import {CanonicalWorkforceFactor,type WorkforceFactorPort} from './workforceFactor.js';
import {workforceConnectionConfig,workforceRuntimeSettings} from './runtime.js';

/** A missing isolated factor writer disables this path. Never reuse identity,
 * application, migration or workforce credentials to manufacture availability. */
export function createWorkforceFactorRuntime(env:NodeJS.ProcessEnv,reportFault:()=>void):WorkforceFactorPort|null{
 if(!env.CR1_WORKFORCE_FACTOR_DATABASE_URL||!env.CR1_WORKFORCE_DATABASE_URL)return null;
 try{
  const settings=workforceRuntimeSettings(env),runtime=workforceConnectionConfig(env);
  const writer=workforceConnectionConfig({...env,CR1_WORKFORCE_DATABASE_URL:env.CR1_WORKFORCE_FACTOR_DATABASE_URL});
  if(!runtime||!writer)return null;
  const runtimePool=new pg.Pool(runtime),writerPool=new pg.Pool({...writer,application_name:'encho_cr1_factor'});
  runtimePool.on('error',reportFault);writerPool.on('error',reportFault);
  return new CanonicalWorkforceFactor(runtimePool,writerPool,settings);
 }catch{reportFault();return null;}
}
