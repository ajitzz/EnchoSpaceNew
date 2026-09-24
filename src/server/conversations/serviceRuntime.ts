import pg from 'pg';
import {z} from 'zod';
import {ServiceCases} from '../../lib/conversations/serviceCases.js';
import {StaffSessionReader} from '../../lib/iam/staffSessions.js';
import {workforceConnectionConfig,workforceEnvironment} from '../operations/runtime.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';

export interface ServiceCaseRuntime {
  participant:{status:(accountId:number,threadId:number)=>ReturnType<ServiceCases['status']>;request:(accountId:number,input:unknown)=>ReturnType<ServiceCases['request']>;withdraw:(accountId:number,input:unknown)=>ReturnType<ServiceCases['withdraw']>};
  staff:{read:(authorization:string,input:unknown)=>ReturnType<ServiceCases['read']>;addNote:(authorization:string,input:unknown)=>ReturnType<ServiceCases['addNote']>};
}

/** Explicit rollout only. Each method still verifies exact catalog/grants and
 * fresh participant/workforce authority; a feature flag cannot grant access. */
export function createServiceCaseRuntime(env:NodeJS.ProcessEnv,participantPool:pg.Pool,report:()=>void):ServiceCaseRuntime|null{
  if(env.CR1_SERVICE_ASSISTANCE_ENABLED!=='true')return null;
  try{
    const config=workforceConnectionConfig(env);if(!config)return null;
    const organizationId=z.string().uuid().parse(env.CR1_WORKFORCE_ORGANIZATION_ID),environment=workforceEnvironment(env);
    const staffPool=new pg.Pool({...config,application_name:'encho_cr1_service'});staffPool.on('error',report);
    const cases=new ServiceCases(participantPool,staffPool,{organizationId,environment}),reader=new StaffSessionReader(staffPool,environment);
    // For account-only assistance, this timestamp records the just-verified
    // request credential, never an independent factor or staff authentication.
    const account=(accountId:number)=>{
      const {correlationId,operationId}=requireExecutionContext();
      return parsePrincipalContext({accountId,actorKind:'ACCOUNT',assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId,operationId});
    };
    return {participant:{status:(id,thread)=>cases.status(account(id),thread),request:(id,input)=>cases.request(account(id),input),withdraw:(id,input)=>cases.withdraw(account(id),input)},
      staff:{async read(authorization,input){const principal=await reader.read(authorization,async(_c,p)=>p);return cases.read(principal,input);},
        async addNote(authorization,input){const principal=await reader.read(authorization,async(_c,p)=>p);return cases.addNote(principal,input);}}};
  }catch{report();return null;}
}
