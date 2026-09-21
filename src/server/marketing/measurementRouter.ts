import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import type {MarketingTouchpoints} from '../../lib/marketing/portfolio/touchpoints.js';
import {MarketingError,publicOrigin} from '../../lib/marketing/domain.js';
const cookieName='__Host-encho_measurement';
export const measurementVisitor=(req:{headers:{cookie?:string}})=>(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
export function createMeasurementRouter(origin:string,service?:MarketingTouchpoints){
 const router=Router();
 router.use(rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false}));
 router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!=='POST'||req.get('Origin')!==publicOrigin(origin)||!req.is('application/json'))return next(new MarketingError('MEASUREMENT_ORIGIN_REQUIRED','Use the measurement choices on the Encho website.',403));
  if(!service)return next(new MarketingError('MEASUREMENT_UNAVAILABLE','Optional campaign measurement is unavailable.',503));
  next();
 });

 // Establish the browser identity before committing evidence so a lost response can be retried.
 router.post('/session',async(req,res)=>{
  z.object({}).strict().parse(req.body);const cookie=service!.visitorSession(measurementVisitor(req));
  res.cookie(cookieName,cookie,{secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge:30*86400000});res.json({status:'READY'});
 });
 router.post('/visit',async(req,res)=>{
  if(!measurementVisitor(req))throw new MarketingError('MEASUREMENT_SESSION_REQUIRED','Allow the first-party measurement cookie before recording your choice.',409);
  const result=await service!.record(req.body,measurementVisitor(req),req.get('user-agent')??'');
  res.cookie(cookieName,result.cookie,{secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge:30*86400000});
  res.status(201).json(result.receipt);
 });
 router.post('/revoke',async(req,res)=>{
  const body=z.object({requestId:z.string().uuid()}).strict().parse(req.body);await service!.revoke(measurementVisitor(req),body.requestId);
  res.clearCookie(cookieName,{secure:true,httpOnly:true,sameSite:'lax',path:'/'});res.json({status:'REVOKED'});
 });
 return router;
}
