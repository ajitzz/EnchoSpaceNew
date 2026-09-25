import pg from 'pg';
import {z} from 'zod';
import {StaffSessionIssuer,StaffSessionIssuerError} from '../../lib/iam/staffSessionIssuer.js';
import {GoogleWorkforceIdentity,workforceGoogleClientIdSchema} from '../../lib/iam/googleWorkforceIdentity.js';
import {verifyStaffSessionIssuerCatalog} from '../deployment/iamSessionIssuerReadiness.js';
import {workforceConnectionConfig,workforceOrigin,workforceEnvironment} from './runtime.js';
import type {WorkforceLoginPort} from './sessionRouter.js';

/** Dedicated identity writer with single-pooler and env fallback support. */
export function createWorkforceSessionRuntime(env:NodeJS.ProcessEnv,report:()=>void):WorkforceLoginPort|null{
  const allowOwner = env.HARVO_ALLOW_OWNER_ROLE === 'true';
  const identityDbUrl = env.CR1_WORKFORCE_IDENTITY_DATABASE_URL || env.CR1_WORKFORCE_DATABASE_URL || (allowOwner ? env.DATABASE_URL : undefined);
  if(!workforceOrigin(env)||!identityDbUrl)return null;
  try{
    const config=workforceConnectionConfig({...env,CR1_WORKFORCE_DATABASE_URL:identityDbUrl});
    if(!config)return null;
    const rawGoogleClientId = env.CR1_WORKFORCE_GOOGLE_CLIENT_ID || (allowOwner ? (env.GOOGLE_ADS_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID) : undefined);
    if(!rawGoogleClientId)return null;
    const googleClientId=workforceGoogleClientIdSchema.parse(rawGoogleClientId);
    const organizationId=z.string().uuid().parse(env.CR1_WORKFORCE_ORGANIZATION_ID || (allowOwner ? '00000000-0000-4000-8000-000000000001' : undefined));
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
