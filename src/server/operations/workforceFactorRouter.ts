import {Router,json,type ErrorRequestHandler} from 'express';
import {rateLimit} from 'express-rate-limit';
import {workforceFactorRequestSchema,workforceFactorResponseSchema,type WorkforceFactorPort} from './workforceFactor.js';
import {staffAuthorization} from './router.js';
import {WorkforceSessionError} from '../../lib/iam/staffSessions.js';
import {WorkforceStepUpError} from '../../lib/iam/factors/workforceStepUp.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';

/** Mount before broad JSON parsing at /api/operations/v1/workforce/factor. */
export function createWorkforceFactorRouter(port:WorkforceFactorPort|null,origin:string|null):Router{
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.use(rateLimit({windowMs:60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,
  handler:(_req,res)=>{const trace=requireExecutionContext();return res.status(429).json({code:'FACTOR_RATE_LIMITED',error:'Passkey verification is temporarily limited.',
   correlationId:trace.correlationId,operationId:trace.operationId});}}));
 router.use(json({limit:'14kb',strict:true}));
 router.post('/',async(req,res)=>{
  const trace=requireExecutionContext();
  const fail=(status:number,code:string)=>res.status(status).json({code,error:code==='FACTOR_OUTCOME_UNKNOWN'
   ?'Verification outcome is uncertain. Refresh command evidence before starting another verification.'
   :'Passkey verification was not accepted. Use your current Operations session and reviewed passkey.',
   correlationId:trace.correlationId,operationId:trace.operationId});
  try{
   const authorization=staffAuthorization(req.headers.authorization,req.headers.cookie);
   if(!port||!origin)return fail(503,'FACTOR_STORE_UNAVAILABLE');
   if(req.headers.origin!==origin||req.headers['x-encho-workforce-command']!=='1'||!req.is('application/json'))return fail(403,'COMMAND_ORIGIN_DENIED');
   const parsed=workforceFactorRequestSchema.safeParse(req.body);if(!parsed.success)return fail(422,'INPUT_INVALID');
   return res.json(workforceFactorResponseSchema.parse(await port.dispatch(authorization,parsed.data)));
  }catch(error){
   if(error instanceof WorkforceSessionError)return fail(error.code==='STAFF_SESSION_REQUIRED'?401:503,error.code);
   if(error instanceof WorkforceStepUpError){
    const status=error.code==='FACTOR_RATE_LIMITED'?429:['FACTOR_STORE_UNAVAILABLE','FACTOR_POLICY_UNAVAILABLE','FACTOR_OUTCOME_UNKNOWN'].includes(error.code)?503:409;
    return fail(status,error.code);
   }
   return fail(503,'FACTOR_STORE_UNAVAILABLE');
  }
 });
 const invalidBody:ErrorRequestHandler=(error:unknown,_req,res,next)=>{
  const kind=typeof error==='object'&&error!==null&&'type' in error?error.type:null;
  if(kind!=='entity.too.large'&&kind!=='entity.parse.failed')return next(error);
  const trace=requireExecutionContext();res.status(kind==='entity.too.large'?413:400).json({code:'INPUT_INVALID',
   error:'Submit a bounded JSON passkey verification request.',correlationId:trace.correlationId,operationId:trace.operationId});
 };
 router.use(invalidBody);return router;
}
