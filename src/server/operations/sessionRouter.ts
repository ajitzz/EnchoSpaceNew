import {Router,json,type ErrorRequestHandler} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {StaffSessionIssuerError,type StaffSessionIssuer} from '../../lib/iam/staffSessionIssuer.js';
import {staffSessionCredential} from '../../lib/iam/staffSessions.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';
import {workforceLoginChallengeSchema,workforceLoginSubmissionSchema} from '../../shared/iam/sessionTransport.js';
import {originAllowed} from '../deployment/origins.js';

export type WorkforceLoginPort=Pick<StaffSessionIssuer,'begin'|'complete'|'logout'>;
const loginCookie='__Host-encho_workforce_login';
const sessionCookie='__Host-encho_workforce';
const cookieOptions={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/'};
const bindingSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
function uniqueCookie(raw:string|undefined,name:string):string|null{
  const values=(raw??'').split(';').map(item=>item.trim()).filter(item=>item.startsWith(`${name}=`));
  return values.length===1?values[0].slice(name.length+1):null;
}

/** Mount before the broad application JSON parser. The dedicated login payload
 * ceiling, fixed Origin and non-simple header also protect login/logout CSRF. */
export function createWorkforceSessionRouter(port:WorkforceLoginPort|null,origin:string|null):Router{
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');next();});
  router.use(rateLimit({windowMs:60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,
    handler:(_req,res)=>res.status(429).json({code:'LOGIN_RATE_LIMITED',error:'Too many sign-in attempts. Try again shortly.'})}));
  router.use((req,res,next)=>{
    if(!origin||!port)return res.status(503).json({code:'LOGIN_NOT_CONFIGURED',error:'Workforce sign-in is unavailable in this deployment.'});
    const originMatches = req.headers.origin === origin || (Boolean(req.headers.origin) && originAllowed(req.headers.origin) && Boolean(origin) && originAllowed(origin));
    if(req.method!=='POST'||!originMatches||req.headers['x-encho-workforce-command']!=='1'||!req.is('application/json')){
      return res.status(403).json({code:'COMMAND_ORIGIN_DENIED',error:'Use the Encho Operations sign-in page.'});
    }
    next();
  });
  router.use(json({limit:'18kb',strict:true}));
  for(const action of ['begin','complete','logout'] as const)router.post(`/${action}`,async(req,res)=>{
    const context=requireExecutionContext();
    const fail=(status:number,code:string,message:string)=>res.status(status).json({code,error:message,correlationId:context.correlationId,operationId:context.operationId});
    try{
      if(!port)throw new StaffSessionIssuerError('LOGIN_NOT_CONFIGURED');
      if(action==='begin'){
        z.object({}).strict().parse(req.body);
        const value=await port.begin();const challenge=workforceLoginChallengeSchema.parse(value.public);
        const browserVerifier=bindingSchema.parse(value.private.browserVerifier);
        const ttl=Date.parse(challenge.expiresAt)-Date.now();
        if(ttl<=0||ttl>600000)throw new StaffSessionIssuerError('ISSUER_UNAVAILABLE');
        res.cookie(loginCookie,`${challenge.challengeId}.${browserVerifier}`,{...cookieOptions,maxAge:ttl});
        return res.json(challenge);
      }
      if(action==='complete'){
        const body=workforceLoginSubmissionSchema.parse(req.body);
        const bound=uniqueCookie(req.headers.cookie,loginCookie)?.split('.');
        if(!bound||bound.length!==2||bound[0]!==body.challengeId||!bindingSchema.safeParse(bound[1]).success){
          throw new StaffSessionIssuerError('LOGIN_CHALLENGE_INVALID');
        }
        const result=await port.complete({...body,browserVerifier:bound[1],correlationId:context.correlationId});
        staffSessionCredential(`Bearer ${result.private.credential}`);
        const expiry=z.string().datetime({offset:true}).parse(result.public.expiresAt);
        if(Date.parse(expiry)<=Date.now())throw new StaffSessionIssuerError('ISSUER_UNAVAILABLE');
        res.cookie(sessionCookie,result.private.credential,{...cookieOptions,expires:new Date(expiry)});
        res.clearCookie(loginCookie,cookieOptions);
        // Identity internals and both credentials are deliberately absent.
        return res.json({status:'AUTHENTICATED',expiresAt:expiry});
      }
      z.object({}).strict().parse(req.body);
      const credential=uniqueCookie(req.headers.cookie,sessionCookie);
      if(!credential)return fail(401,'STAFF_SESSION_REQUIRED','A workforce session is required.');
      staffSessionCredential(`Bearer ${credential}`);
      await port.logout({credential,correlationId:context.correlationId});
      res.clearCookie(sessionCookie,cookieOptions);res.clearCookie(loginCookie,cookieOptions);
      return res.json({status:'LOGGED_OUT'});
    }catch(error){
      if(error instanceof z.ZodError)return fail(422,'INPUT_INVALID','Review the sign-in request.');
      if(error instanceof StaffSessionIssuerError){
        if(error.code==='OUTCOME_UNKNOWN'){
          res.clearCookie(loginCookie,cookieOptions);
          return fail(503,error.code,'The session result could not be confirmed. Start a new sign-in; no session was confirmed by this response.');
        }
        if(['LOGIN_CHALLENGE_INVALID','IDENTITY_INVALID','MEMBERSHIP_UNAVAILABLE'].includes(error.code)){
          res.clearCookie(loginCookie,cookieOptions);
          return fail(401,'STAFF_SESSION_REQUIRED','Sign-in was not accepted. Use the invited Google account with current workforce access.');
        }
        if(['LOGIN_RATE_LIMITED','SESSION_LIMIT_REACHED'].includes(error.code))return fail(429,'LOGIN_RATE_LIMITED','Sign-in is temporarily limited. Try again later or contact your workforce administrator.');
      }
      return fail(503,'LOGIN_UNAVAILABLE','The workforce session result is unavailable. Try again when the service is restored.');
    }
  });
  const malformed:ErrorRequestHandler=(_error,_req,res,_next)=>{
    const trace=requireExecutionContext();
    res.status(400).json({code:'INPUT_INVALID',error:'A bounded JSON sign-in request is required.',correlationId:trace.correlationId,operationId:trace.operationId});
  };
  router.use(malformed);
  return router;
}
