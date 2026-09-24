import {Router,type RequestHandler,type Request} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {ServiceCaseError} from '../../lib/conversations/serviceCases.js';
import {WorkforceSessionError} from '../../lib/iam/staffSessions.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';
import {staffAuthorization} from '../operations/router.js';
import type {ServiceCaseRuntime} from './serviceRuntime.js';

const limited=()=>rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
function run(work:(req:Request)=>Promise<unknown>):RequestHandler{return async(req,res)=>{
  const trace=requireExecutionContext();res.setHeader('Cache-Control','no-store');
  try{res.json(await work(req));}catch(error){
    const code=error instanceof ServiceCaseError?error.code:error instanceof WorkforceSessionError?error.code:error instanceof z.ZodError?'INPUT_INVALID':'STORE_UNAVAILABLE';
    const status=error instanceof ServiceCaseError?error.status:error instanceof WorkforceSessionError&&error.code==='STAFF_SESSION_REQUIRED'?401:error instanceof z.ZodError?422:503;
    res.status(status).json({code,error:code==='OUTCOME_UNKNOWN'?'The result could not be confirmed. Refresh the current case before retrying.':status===403?'Current case access or assignment was not accepted.':'Service assistance is unavailable for this request.',correlationId:trace.correlationId,operationId:trace.operationId});
  }
};}
export function createParticipantServiceRouter(port:ServiceCaseRuntime['participant']|null,options:{authenticate:RequestHandler;accountId:(req:Request)=>unknown}):Router{
  const router=Router();router.use(options.authenticate,limited());
  const actor=(req:Request)=>z.number().int().positive().safe().parse(options.accountId(req));
  router.get('/threads/:id/assistance',run(req=>{if(!port)throw new ServiceCaseError('NOT_READY');return port.status(actor(req),z.coerce.number().int().positive().safe().parse(req.params.id));}));
  router.post('/cases',run(req=>{if(!port)throw new ServiceCaseError('NOT_READY');return port.request(actor(req),req.body);}));
  router.post('/cases/:id/withdraw',run(req=>{
    if(!port)throw new ServiceCaseError('NOT_READY');
    const body=z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body);
    return port.withdraw(actor(req),{caseId:z.string().uuid().parse(req.params.id),...body});
  }));return router;
}
export function createStaffServiceRouter(port:ServiceCaseRuntime['staff']|null,origin:string|null):Router{
  const router=Router();router.use(limited());
  router.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(!origin||!port)return res.status(503).json({code:'NOT_READY',error:'The Service Desk is not enabled in this deployment.'});
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-encho-workforce-command']!=='1'||!req.is('application/json'))return res.status(403).json({code:'COMMAND_ORIGIN_DENIED',error:'Use the Operations Service Desk.'});
    next();
  });
  router.post('/read',run(req=>{if(!port)throw new ServiceCaseError('NOT_READY');return port.read(staffAuthorization(req.headers.authorization,req.headers.cookie),req.body);}));
  router.post('/notes',run(req=>{if(!port)throw new ServiceCaseError('NOT_READY');return port.addNote(staffAuthorization(req.headers.authorization,req.headers.cookie),req.body);}));
  return router;
}
