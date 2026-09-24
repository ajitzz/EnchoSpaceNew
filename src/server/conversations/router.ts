import {Router,type Request,type RequestHandler} from 'express';
import {z} from 'zod';
import type {InquiryInbox} from '../../lib/marketing/inquiryInbox.js';
import {MarketingError,type Actor} from '../../lib/marketing/domain.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';
import {PlatformDomainError,toPublicApiError} from '../../shared/platform/apiError.js';

interface ConversationRouterOptions {
  inbox:Pick<InquiryInbox,'create'|'messages'|'send'|'acknowledgeRead'|'list'|'unread'|'bookingHistory'>;
  authenticate:RequestHandler;
  mutationLimiter:RequestHandler;
  accountId:(req:Request)=>unknown;
  visitor:(req:Request)=>string|undefined;
  ready:()=>Promise<boolean>;
  afterCommit?:(result:Awaited<ReturnType<InquiryInbox['send']>>)=>void;
  onFailure?:(event:{code:string;correlationId:string;operationId:string})=>void;
}

/** Compatibility paths preserve participant identities while the legacy root
 * handlers are strangled. Database state/outbox is authoritative; sockets hint. */
export function createConversationRouter(options:ConversationRouterOptions):Router{
  const router=Router();
  const execute=(work:(req:Request,actor:Actor)=>Promise<unknown>):RequestHandler=>async(req,res)=>{
    const trace=requireExecutionContext();res.setHeader('Cache-Control','no-store');
    try{
      const parsed=z.number().int().positive().safe().safeParse(options.accountId(req));
      if(!parsed.success)throw new PlatformDomainError('AUTHENTICATION_REQUIRED');
      if(!await options.ready())throw new PlatformDomainError('FEATURE_UNAVAILABLE');
      res.json(await work(req,{id:parsed.data,role:'host'}));
    }catch(error){
      const classified=error instanceof z.ZodError?new PlatformDomainError('INVALID_REQUEST'):
        error instanceof MarketingError&&error.code==='THREAD_NOT_FOUND'?new PlatformDomainError('RESOURCE_NOT_FOUND'):
        error instanceof MarketingError&&error.code==='IDEMPOTENCY_CONFLICT'?new PlatformDomainError('IDEMPOTENCY_CONFLICT'):error;
      const result=toPublicApiError(classified,trace);
      if(result.status>=500)options.onFailure?.({code:result.body.code,...trace});
      res.status(result.status).json({...result.body,error:result.body.message});
    }
  };
  router.get('/messages/:bookingId',options.authenticate,execute((req,actor)=>options.inbox.bookingHistory(actor,Number(req.params.bookingId),req.query.before)));
  router.get('/threads',options.authenticate,execute((req,actor)=>options.inbox.list(actor,req.query)));
  router.get('/unread-counts',options.authenticate,execute((req,actor)=>options.inbox.unread(actor,req.query)));
  router.post('/threads',options.authenticate,options.mutationLimiter,execute((req,actor)=>options.inbox.create(actor,req.body)));
  router.get('/threads/:id/messages',options.authenticate,execute((req,actor)=>options.inbox.messages(actor,Number(req.params.id),req.query.before)));
  router.post('/threads/:id/read',options.authenticate,options.mutationLimiter,execute((req,actor)=>options.inbox.acknowledgeRead(actor,Number(req.params.id),req.body)));
  router.post('/threads/:id/messages',options.authenticate,options.mutationLimiter,execute(async(req,actor)=>{
    const result=await options.inbox.send(actor,Number(req.params.id),req.body,options.visitor(req));
    // An optional socket outage must not turn a committed message into a failed
    // command response. Its durable alert remains available for catch-up.
    if(!result.duplicate&&options.afterCommit){
      try{options.afterCommit(result);}catch{
        const trace=requireExecutionContext();options.onFailure?.({code:'CONVERSATION_SOCKET_HINT_FAILED',...trace});
      }
    }
    return result.message;
  }));
  return router;
}
