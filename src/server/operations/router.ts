import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import type {OperationsWorkspace} from '../../shared/iam/workspace.js';
import {WorkforceSessionError, staffSessionCredential} from '../../lib/iam/staffSessions.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';
import {assignmentActionRequestSchema,type AssignmentActionRequest} from '../../shared/iam/workspace.js';
import {AssignmentCommandError,type AssignmentCommandResult} from '../../lib/iam/assignmentService.js';
import {workforceReviewRequestSchema,type WorkforceReviewRequest,type WorkforceReview} from '../../shared/iam/workforceReview.js';
import {WorkforceReviewError} from '../../lib/iam/workforceReview.js';
import {PermissionNotGrantedError} from '../../lib/iam/authorizationPort.js';

export interface OperationsWorkspacePort {
  load(authorization: string): Promise<OperationsWorkspace>;
  assignment?:(authorization:string,input:AssignmentActionRequest)=>Promise<AssignmentCommandResult>;
  workforce?:(authorization:string,input:WorkforceReviewRequest)=>Promise<WorkforceReview>;
}

export function staffAuthorization(header: string | undefined, cookie: string | undefined): string {
  if (header) { staffSessionCredential(header); return header; }
  const matches = (cookie ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith('__Host-encho_workforce='));
  if (matches.length !== 1) throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
  const authorization = `Bearer ${matches[0].slice('__Host-encho_workforce='.length)}`;
  staffSessionCredential(authorization);
  return authorization;
}

/** Independent session authority: never mount authenticateToken/requireAdmin here. */
export function createOperationsRouter(workspace: OperationsWorkspacePort | null,options:{origin?:string|null}={}): Router {
  const router = Router();
  router.use(rateLimit({windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false}));
  router.get('/workspace', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const trace = requireExecutionContext();
    try {
      const authorization = staffAuthorization(req.headers.authorization, req.headers.cookie);
      if (!workspace) throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
      res.json(await workspace.load(authorization));
    } catch (error) {
      const invalidSession = error instanceof WorkforceSessionError && error.code === 'STAFF_SESSION_REQUIRED';
      if (!invalidSession) {
        console.error('[WORKFORCE_WORKSPACE_ERROR]', {
          correlationId: trace.correlationId,
          operationId: trace.operationId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      res.status(invalidSession ? 401 : 503).json({
        code: invalidSession ? 'STAFF_SESSION_REQUIRED' : 'WORKFORCE_UNAVAILABLE',
        error: invalidSession ? 'A current workforce session is required.' : 'The workforce workspace is not available in this deployment.',
        correlationId: trace.correlationId, operationId: trace.operationId,
      });
    }
  });
  router.post('/assignments/:id/actions',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');const trace=requireExecutionContext();
    const fail=(status:number,code:string,message:string)=>res.status(status).json({code,error:message,correlationId:trace.correlationId,operationId:trace.operationId});
    try{
      const authorization=staffAuthorization(req.headers.authorization,req.headers.cookie);
      if(!options.origin||!workspace?.assignment)return fail(503,'WORKFORCE_UNAVAILABLE','Assignment commands are unavailable in this deployment.');
      // Fixed deployment origin, never the request Host. Custom header prevents
      // form posts, and origin validation also covers same-site sibling attacks.
      if(req.headers.origin!==options.origin||req.headers['x-encho-workforce-command']!=='1'||!req.is('application/json')){
        return fail(403,'COMMAND_ORIGIN_DENIED','This action must be submitted from the Operations workspace.');
      }
      const parsed=assignmentActionRequestSchema.safeParse(req.body);
      if(!parsed.success||parsed.data.assignmentId!==req.params.id||!['CLAIM','RELEASE'].includes(parsed.data.action)){
        return fail(422,'INPUT_INVALID','Review the assignment and refresh before submitting.');
      }
      const result=await workspace.assignment(authorization,parsed.data);
      res.json({status:'ACCEPTED',...result});
    }catch(error){
      if(error instanceof WorkforceSessionError&&error.code==='STAFF_SESSION_REQUIRED')return fail(401,error.code,'A current workforce session is required.');
      if(error instanceof AssignmentCommandError){
        return fail(error.status,error.code,error.code==='OUTCOME_UNKNOWN'
          ?'The result is being reconciled. Retain the same request identity.'
          :'The assignment command was not accepted. Refresh current work and access.');
      }
      return fail(503,'WORKFORCE_UNAVAILABLE','The assignment result is unavailable. Refresh before retrying.');
    }
  });
  router.get('/workforce',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');const trace=requireExecutionContext();
    const fail=(status:number,code:string,error:string)=>res.status(status).json({code,error,correlationId:trace.correlationId,operationId:trace.operationId});
    try{
      const authorization=staffAuthorization(req.headers.authorization,req.headers.cookie);
      if(!workspace?.workforce)return fail(503,'WORKFORCE_UNAVAILABLE','Workforce evidence is unavailable in this deployment.');
      // Query parameters may select a page, never a principal, environment or organization.
      const query={...req.query,...(typeof req.query.limit==='string'&&/^[1-9]\d?$/.test(req.query.limit)?{limit:Number(req.query.limit)}:{})};
      const parsed=workforceReviewRequestSchema.safeParse(query);
      if(!parsed.success)return fail(422,'INPUT_INVALID','The workforce page request is invalid.');
      return res.json(await workspace.workforce(authorization,parsed.data));
    }catch(error){
      if(error instanceof WorkforceSessionError&&error.code==='STAFF_SESSION_REQUIRED')return fail(401,error.code,'A current workforce session is required.');
      if(error instanceof PermissionNotGrantedError||error instanceof WorkforceReviewError&&error.code==='PERMISSION_DENIED')return fail(403,'PERMISSION_DENIED','This workforce view is outside your current access.');
      return fail(503,'WORKFORCE_UNAVAILABLE','Workforce evidence could not be verified.');
    }
  });
  return router;
}
