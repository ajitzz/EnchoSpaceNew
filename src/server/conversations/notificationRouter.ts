import {Router,type Request,type RequestHandler} from 'express';
import {z} from 'zod';
import {ConversationNotificationError} from '../../lib/conversations/notifications.js';
import {notificationPreferenceMutationSchema,notificationPreferencesSchema,notificationPreferenceReceiptSchema,notificationEvidenceQuerySchema,notificationEvidencePageSchema} from '../../shared/conversation/notifications.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';
import {PlatformDomainError,toPublicApiError,type PublicErrorCode} from '../../shared/platform/apiError.js';
import type {ParticipantNotificationRuntime} from './notificationRuntimeAdapter.js';

const mappedCodes:Readonly<Record<ConversationNotificationError['code'],PublicErrorCode>>={INPUT_INVALID:'INVALID_REQUEST',CURSOR_INVALID:'INVALID_REQUEST',PERMISSION_DENIED:'ACCESS_DENIED',VERSION_CONFLICT:'VERSION_CONFLICT',IDEMPOTENCY_CONFLICT:'IDEMPOTENCY_CONFLICT',NOT_READY:'FEATURE_UNAVAILABLE',STORE_UNAVAILABLE:'DEPENDENCY_UNAVAILABLE',OUTCOME_UNKNOWN:'OPERATION_OUTCOME_UNKNOWN'};
export function createParticipantNotificationRouter(port:ParticipantNotificationRuntime|null,options:{authenticate:RequestHandler;mutationLimiter:RequestHandler;accountId:(req:Request)=>unknown;onFailure?:(event:{code:string;correlationId:string;operationId:string})=>void}):Router{
 const router=Router();
 const noStore:RequestHandler=(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();};
 const run=(work:(req:Request,actor:number,port:ParticipantNotificationRuntime)=>Promise<{accountId:number}>):RequestHandler=>async(req,res)=>{
  const trace=requireExecutionContext();
  try{
   const actor=z.number().int().positive().safe().safeParse(options.accountId(req));
   if(!actor.success)throw new PlatformDomainError('AUTHENTICATION_REQUIRED');
   if(!port)throw new PlatformDomainError('FEATURE_UNAVAILABLE');
   const result=await work(req,actor.data,port);
   if(result.accountId!==actor.data)throw new PlatformDomainError('INTERNAL_ERROR');
   res.json(result);
  }catch(error){
   const classified=error instanceof ConversationNotificationError?new PlatformDomainError(mappedCodes[error.code]):error;
   const safe=toPublicApiError(classified,trace);
   if(safe.status>=500)options.onFailure?.({code:safe.body.code,...trace});
   res.status(safe.status).json(safe.body);
  }
 };
 const parse=<T>(schema:z.ZodType<T>,input:unknown):T=>{const result=schema.safeParse(input);if(!result.success)throw new PlatformDomainError('INVALID_REQUEST');return result.data;};
 router.get('/notifications/preferences',noStore,options.authenticate,run(async(_req,actor,runtime)=>notificationPreferencesSchema.parse(await runtime.preferences(actor))));
 router.put('/notifications/preferences',noStore,options.authenticate,options.mutationLimiter,run(async(req,actor,runtime)=>{
  if(!req.is('application/json')||req.headers['x-encho-conversation-command']!=='1')throw new PlatformDomainError('INVALID_REQUEST');
  return notificationPreferenceReceiptSchema.parse(await runtime.setPreference(actor,parse(notificationPreferenceMutationSchema,req.body)));
 }));
 router.get('/notifications/evidence',noStore,options.authenticate,run(async(req,actor,runtime)=>{
  const query=parse(z.object({beforeId:z.string().uuid().optional(),limit:z.string().regex(/^[1-9][0-9]?$/).optional()}).strict(),req.query);
  const input=parse(notificationEvidenceQuerySchema,{beforeId:query.beforeId,...(query.limit?{limit:Number(query.limit)}:{})});
  return notificationEvidencePageSchema.parse(await runtime.evidence(actor,input));
 }));
 return router;
}
