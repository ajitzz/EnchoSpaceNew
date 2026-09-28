import type pg from 'pg';
import {z} from 'zod';
import {WorkforceStepUp,WorkforceStepUpError} from '../../lib/iam/factors/workforceStepUp.js';
import {passkeyAssertionResponseSchema} from '../../lib/iam/factors/passkeyAssertion.js';
import {StaffSessionReader,WorkforceSessionError,staffSessionCredential} from '../../lib/iam/staffSessions.js';
import {verifyIamCatalog} from '../deployment/iamReadiness.js';
import {verifyWorkforceFactorCatalog} from '../deployment/iamFactorReadiness.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';

export const workforceFactorRequestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('BEGIN'),enrollmentId:z.uuid(),actionHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal('COMPLETE'),challengeId:z.uuid(),response:passkeyAssertionResponseSchema}).strict(),
]);
const timestamp=z.iso.datetime({offset:true});
export const workforceFactorResponseSchema=z.union([
 z.object({challengeId:z.uuid(),expiresAt:timestamp,publicKey:z.object({challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  rpId:z.string().min(1).max(253),timeout:z.number().int().positive().max(600000),
  allowCredentials:z.array(z.object({id:z.string().regex(/^[A-Za-z0-9_-]+$/).max(1400),type:z.literal('public-key')}).strict()).length(1),
  userVerification:z.literal('required')}).strict()}).strict(),
 z.object({status:z.literal('VERIFIED'),challengeId:z.uuid(),actionHash:z.string().regex(/^[a-f0-9]{64}$/),
  assuranceLevel:z.literal('PHISHING_RESISTANT'),expiresAt:timestamp}).strict(),
]);
export type WorkforceFactorRequest=z.infer<typeof workforceFactorRequestSchema>;
export type WorkforceFactorResponse=z.infer<typeof workforceFactorResponseSchema>;
export interface WorkforceFactorPort {dispatch(authorization:string,input:WorkforceFactorRequest):Promise<WorkforceFactorResponse>}

/** No registration, key import or recovery. The canonical service owns durable
 * challenges, reviewed enrollments, cryptography and exact-action receipts. */
export class CanonicalWorkforceFactor implements WorkforceFactorPort {
 private readonly reader:StaffSessionReader;
 private readonly service:WorkforceStepUp;
 private readonly organizationId:string;
 constructor(runtime:pg.Pool,private readonly writer:pg.Pool,options:{organizationId:string;environment:z.infer<typeof workforceEnvironmentSchema>}){
  this.organizationId=z.uuid().parse(options.organizationId);
  this.reader=new StaffSessionReader(runtime,options.environment);
  this.service=new WorkforceStepUp(writer,options.environment);
 }
 async dispatch(authorization:string,raw:WorkforceFactorRequest):Promise<WorkforceFactorResponse>{
  const input=workforceFactorRequestSchema.parse(raw);
  await this.reader.read(authorization,async(client,principal)=>{
   if(principal.organizationId!==this.organizationId)throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
   if(!(await verifyIamCatalog(client)).ready)throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
  });
  const client=await this.writer.connect();try{
   if(!(await verifyWorkforceFactorCatalog(client)).ready)throw new WorkforceStepUpError('FACTOR_STORE_UNAVAILABLE');
  }finally{client.release();}
  // Never accept session/environment/correlation identity from the body.
  const trusted={credential:staffSessionCredential(authorization),correlationId:requireExecutionContext().correlationId};
  if(input.action==='BEGIN')return workforceFactorResponseSchema.parse(await this.service.begin({...trusted,enrollmentId:input.enrollmentId,actionHash:input.actionHash}));
  const proof=await this.service.complete({...trusted,challengeId:input.challengeId,response:input.response});
  return workforceFactorResponseSchema.parse({status:'VERIFIED',challengeId:proof.challengeId,actionHash:proof.actionHash,
   assuranceLevel:proof.assuranceLevel,expiresAt:proof.expiresAt});
 }
}
