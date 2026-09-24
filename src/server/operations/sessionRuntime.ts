import pg from 'pg';
import {z} from 'zod';
import {StaffSessionIssuer,StaffSessionIssuerError} from '../../lib/iam/staffSessionIssuer.js';
import {GoogleWorkforceIdentity,workforceGoogleClientIdSchema} from '../../lib/iam/googleWorkforceIdentity.js';
import {verifyStaffSessionIssuerCatalog} from '../deployment/iamSessionIssuerReadiness.js';
import {workforceConnectionConfig,workforceOrigin,workforceEnvironment} from './runtime.js';
import type {WorkforceLoginPort} from './sessionRouter.js';

/** Dedicated identity writer: absence never falls back to app or owner credentials. */
export function createWorkforceSessionRuntime(env:NodeJS.ProcessEnv,report:()=>void):WorkforceLoginPort|null{
  if(!workforceOrigin(env)||!env.CR1_WORKFORCE_IDENTITY_DATABASE_URL)return null;
  try{
    const config=workforceConnectionConfig({...env,CR1_WORKFORCE_DATABASE_URL:env.CR1_WORKFORCE_IDENTITY_DATABASE_URL});
    if(!config)return null;
    const googleClientId=workforceGoogleClientIdSchema.parse(env.CR1_WORKFORCE_GOOGLE_CLIENT_ID);
    const organizationId=z.string().uuid().parse(env.CR1_WORKFORCE_ORGANIZATION_ID);
    const pool=new pg.Pool({...config,application_name:'encho_cr1_identity'});pool.on('error',report);
    const issuer=new StaffSessionIssuer(pool,new GoogleWorkforceIdentity(googleClientId),{
      googleClientId,organizationId,environment:workforceEnvironment(env),
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
