import {Router, type RequestHandler} from 'express';
import {z} from 'zod';
import {AcceptedOfferService} from './acceptedOfferService.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';
import {StaffSessionReader,WorkforceSessionError} from '../../lib/iam/staffSessions.js';
import {PermissionNotGrantedError} from '../../lib/iam/authorizationPort.js';
import {staffAuthorization} from '../operations/router.js';

const intId=z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().safe().max(2147483647));
const uuid=z.string().uuid();
const positive=z.number().int().positive().safe();
const draftBody=z.object({
  roomTypeId:positive,
  offerId:uuid.optional(),
  amountMinor:z.string().regex(/^[1-9]\d{0,18}$/).refine(value=>BigInt(value)<=9223372036854775807n),
  stayStart:z.iso.date(),stayEnd:z.iso.date(),
  effectiveFrom:z.iso.datetime({offset:true}),effectiveUntil:z.iso.datetime({offset:true}),
  maxGuests:positive,minNights:positive,
  expectedVersion:positive.optional(),
}).strict();
const versionBody=z.object({expectedVersion:positive}).strict();
const staffBody=z.object({expectedVersion:positive}).strict();

type AccountRequest={user?:{id?:number|string}};
type OfferError={code:string;status:number};
function publicError(error:unknown):OfferError{
  if(error instanceof PermissionNotGrantedError)return ['IAM_NOT_READY','POLICY_UNAVAILABLE','POLICY_RESULT_INVALID'].includes(error.code)
    ?{code:'WORKFORCE_UNAVAILABLE',status:503}:{code:'PERMISSION_DENIED',status:403};
  if(error&&typeof error==='object'&&'code' in error&&'status' in error){
    const candidate=error as {code:unknown;status:unknown};
    if(typeof candidate.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(candidate.code)
      &&typeof candidate.status==='number'&&[400,401,403,404,409,422,503].includes(candidate.status)){
      return{code:candidate.code,status:candidate.status};
    }
  }
  return{code:'OFFER_AUTHORITY_UNAVAILABLE',status:503};
}
function trace(){const context=requireExecutionContext();return{correlationId:context.correlationId,operationId:context.operationId};}
function noStore():RequestHandler{return(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();};}

/** Consumer JWT identifies an account only. Ownership and active status are rechecked by the service. */
export function createHostOfferRouter(service:AcceptedOfferService|null,authenticate:RequestHandler):Router{
  const router=Router();router.use(noStore(),authenticate);
  const principal=(req:Parameters<RequestHandler>[0])=>{
    const accountId=Number((req as typeof req&AccountRequest).user?.id);
    if(!Number.isSafeInteger(accountId)||accountId<=0)throw{code:'ACCOUNT_REQUIRED',status:401};
    const context=requireExecutionContext();
    return parsePrincipalContext({accountId,actorKind:'ACCOUNT',assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),
      correlationId:context.correlationId,operationId:context.operationId});
  };
  const fail=(res:Parameters<RequestHandler>[1],error:unknown)=>{const result=publicError(error);return res.status(result.status).json({...result,...trace()});};
  router.get('/listings/:listingId',async(req,res)=>{
    const listing=intId.safeParse(req.params.listingId);
    if(!listing.success)return res.status(422).json({code:'INPUT_INVALID',...trace()});
    try{if(!service)throw{code:'OFFER_AUTHORITY_UNAVAILABLE',status:503};
      return res.json(await service.listForHost(principal(req),listing.data));
    }catch(error){return fail(res,error);}
  });
  router.post('/listings/:listingId/drafts',async(req,res)=>{
    const listing=intId.safeParse(req.params.listingId),body=draftBody.safeParse(req.body);
    if(!listing.success||!body.success)return res.status(422).json({code:'INPUT_INVALID',...trace()});
    try{if(!service)throw{code:'OFFER_AUTHORITY_UNAVAILABLE',status:503};
      const result=await service.createDraft(principal(req),{listingId:listing.data,...body.data});
      return res.status(201).json(result);
    }catch(error){return fail(res,error);}
  });
  router.post('/:offerId/revisions/:revision/submit',async(req,res)=>{
    const offer=uuid.safeParse(req.params.offerId),revision=intId.safeParse(req.params.revision),body=versionBody.safeParse(req.body);
    if(!offer.success||!revision.success||!body.success)return res.status(422).json({code:'INPUT_INVALID',...trace()});
    try{if(!service)throw{code:'OFFER_AUTHORITY_UNAVAILABLE',status:503};
      return res.json(await service.submit(principal(req),{offerId:offer.data,revision:revision.data,...body.data}));
    }catch(error){return fail(res,error);}
  });
  router.get('/:offerId',async(req,res)=>{
    const offer=uuid.safeParse(req.params.offerId);
    if(!offer.success)return res.status(422).json({code:'INPUT_INVALID',...trace()});
    try{if(!service)throw{code:'OFFER_AUTHORITY_UNAVAILABLE',status:503};
      return res.json(await service.readForHost(principal(req),offer.data));
    }catch(error){return fail(res,error);}
  });
  return router;
}

/** Workforce credential and fixed-origin command gate stay separate from consumer Admin identity. */
export function createStaffOfferRouter(service:AcceptedOfferService|null,reader:StaffSessionReader|null,origin:string|null):Router{
  const router=Router();router.use(noStore());
  const fail=(res:Parameters<RequestHandler>[1],error:unknown)=>{const result=publicError(error);return res.status(result.status).json({...result,...trace()});};
  async function staff(req:Parameters<RequestHandler>[0]){
    const authorization=staffAuthorization(req.headers.authorization,req.headers.cookie);
    if(!reader||!service)throw{code:'WORKFORCE_UNAVAILABLE',status:503};
    return reader.read(authorization,async(_client,principal)=>principal);
  }
  function commandGate(req:Parameters<RequestHandler>[0]):boolean{
    return Boolean(origin&&req.headers.origin===origin&&req.headers['x-encho-workforce-command']==='1'&&req.is('application/json'));
  }
  router.get('/listings/:listingId/submitted',async(req,res)=>{
    const listing=intId.safeParse(req.params.listingId);
    if(!listing.success)return res.status(422).json({code:'INPUT_INVALID',...trace()});
    try{const actor=await staff(req);return res.json(await service!.listSubmittedForStaff(actor,listing.data));}
    catch(error){return fail(res,error instanceof WorkforceSessionError?{code:error.code,status:error.code==='STAFF_SESSION_REQUIRED'?401:503}:error);}
  });
  router.get('/listings/:listingId/accepted',async(req,res)=>{
    const listing=intId.safeParse(req.params.listingId);
    if(!listing.success)return res.status(422).json({code:'INPUT_INVALID',...trace()});
    try{const actor=await staff(req);return res.json(await service!.listCurrentAcceptedForStaff(actor,listing.data));}
    catch(error){return fail(res,error instanceof WorkforceSessionError?{code:error.code,status:error.code==='STAFF_SESSION_REQUIRED'?401:503}:error);}
  });
  for(const action of ['accept','retire'] as const){
    router.post('/:offerId/revisions/:revision/'+action,async(req,res)=>{
      try{
        // Check the isolated credential before returning route or body diagnostics.
        const actor=await staff(req);
        if(!commandGate(req))return res.status(403).json({code:'COMMAND_ORIGIN_DENIED',...trace()});
        const offer=uuid.safeParse(req.params.offerId),revision=intId.safeParse(req.params.revision),body=staffBody.safeParse(req.body);
        if(!offer.success||!revision.success||!body.success)return res.status(422).json({code:'INPUT_INVALID',...trace()});
        return res.json(await service![action](actor,{offerId:offer.data,revision:revision.data,...body.data}));
      }catch(error){return fail(res,error instanceof WorkforceSessionError?{code:error.code,status:error.code==='STAFF_SESSION_REQUIRED'?401:503}:error);}
    });
  }
  return router;
}
