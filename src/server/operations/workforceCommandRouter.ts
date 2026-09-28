import {Router,json,type ErrorRequestHandler} from 'express';
import {rateLimit} from 'express-rate-limit';
import {workforceCommandRequestSchema,workforceCommandResponseSchema,type WorkforceCommandPort} from './workforceCommands.js';
import {staffAuthorization} from './router.js';
import {WorkforceSessionError} from '../../lib/iam/staffSessions.js';
import {WorkforceLifecycleError} from '../../lib/iam/workforceLifecycle.js';
import {PrivilegedActionError} from '../../lib/iam/privilegedActions.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';

/** Mount independently of consumer authentication at /api/operations/v1/workforce/commands. */
export function createWorkforceCommandRouter(port:WorkforceCommandPort|null,origin:string|null):Router{
  const router=Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.use(rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,
    handler:(_req,res)=>{const trace=requireExecutionContext();return res.status(429).json({code:'COMMAND_RATE_LIMITED',
      error:'Workforce commands are temporarily limited. Retry with the original command identity.',
      correlationId:trace.correlationId,operationId:trace.operationId});}}));
  router.use(json({limit:'24kb'}));
  router.post('/',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');const trace=requireExecutionContext();
    const fail=(status:number,code:string)=>res.status(status).json({code,
      error:code==='OUTCOME_UNKNOWN'?'Result uncertain. Reconcile using the original command identity.':'The workforce command was not accepted. Refresh access and current evidence.',
      correlationId:trace.correlationId,operationId:trace.operationId});
    try{
      const authorization=staffAuthorization(req.headers.authorization,req.headers.cookie);
      if(!port||!origin)return fail(503,'WORKFORCE_UNAVAILABLE');
      if(req.headers.origin!==origin||req.headers['x-encho-workforce-command']!=='1'||!req.is('application/json'))return fail(403,'COMMAND_ORIGIN_DENIED');
      const parsed=workforceCommandRequestSchema.safeParse(req.body);
      if(!parsed.success)return fail(422,'INPUT_INVALID');
      return res.json(workforceCommandResponseSchema.parse(await port.dispatch(authorization,parsed.data)));
    }catch(error){
      if(error instanceof WorkforceSessionError)return fail(error.code==='STAFF_SESSION_REQUIRED'?401:503,error.code);
      if(error instanceof WorkforceLifecycleError||error instanceof PrivilegedActionError)return fail(error.status,error.code);
      return fail(503,'WORKFORCE_UNAVAILABLE');
    }
  });
  const invalidBody:ErrorRequestHandler=(error:unknown,_req,res,next)=>{
    const kind=typeof error==='object'&&error!==null&&'type' in error?error.type:null;
    if(kind!=='entity.too.large'&&kind!=='entity.parse.failed')return next(error);
    const trace=requireExecutionContext();
    res.status(kind==='entity.too.large'?413:400).set('Cache-Control','no-store').json({
      code:'INPUT_INVALID',error:'Submit a bounded, valid JSON workforce command.',
      correlationId:trace.correlationId,operationId:trace.operationId,
    });
  };
  router.use(invalidBody);
  return router;
}
