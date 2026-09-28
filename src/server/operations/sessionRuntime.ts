import pg from 'pg';
import {StaffSessionIssuer,StaffSessionIssuerError} from '../../lib/iam/staffSessionIssuer.js';
import {GoogleWorkforceIdentity} from '../../lib/iam/googleWorkforceIdentity.js';
import {verifyStaffSessionIssuerCatalog} from '../deployment/iamSessionIssuerReadiness.js';
import {workforceConnectionConfig,workforceRuntimeSettings} from './runtime.js';
import type {WorkforceLoginPort} from './sessionRouter.js';

/** Dedicated identity writer; no consumer/ad-account or owner fallback. */
export function createWorkforceSessionRuntime(env:NodeJS.ProcessEnv,report:()=>void):WorkforceLoginPort|null{
  const identityDbUrl=env.CR1_WORKFORCE_IDENTITY_DATABASE_URL;
  if(!identityDbUrl||!env.CR1_WORKFORCE_DATABASE_URL)return null;
  try{
    const {googleClientId,organizationId,environment}=workforceRuntimeSettings(env);
    // Validate both explicit connections before exposing a login path. Neither
    // credential is opened here; actual-role readiness remains mandatory.
    if(!workforceConnectionConfig(env))return null;
    const config=workforceConnectionConfig({...env,CR1_WORKFORCE_DATABASE_URL:identityDbUrl});
    if(!config)return null;
    const pool=new pg.Pool({...config,application_name:'encho_cr1_identity'});pool.on('error',report);
    const issuer=new StaffSessionIssuer(pool,new GoogleWorkforceIdentity(googleClientId),{
      googleClientId,organizationId,environment,
    });
    let until=0,pending:Promise<void>|null=null;
    const ready=async()=>{
      if(Date.now()<until)return;
      pending??=(async()=>{const client=await pool.connect();try{
        if(!(await verifyStaffSessionIssuerCatalog(client)).ready)throw new StaffSessionIssuerError('ISSUER_UNAVAILABLE');
        until=Date.now()+30000;
      }finally{client.release();}})();
      try{await pending;}catch{report();throw new StaffSessionIssuerError('ISSUER_UNAVAILABLE');}finally{pending=null;}
    };
    return {async begin(){await ready();return issuer.begin();},async complete(input){await ready();return issuer.complete(input);},async logout(input){await ready();return issuer.logout(input);}};
  }catch{report();return null;}
}
