import type {CorridorInferenceWorker} from '../../lib/marketing/adtech/inference.js';
import {Router} from 'express';
import {z} from 'zod';
import {MarketingError, type Actor} from '../../lib/marketing/domain.js';
import type {AdtechStrategyRegistry} from '../../lib/marketing/adtech/registry.js';
import {FeederCorridorResolver} from '../../lib/marketing/adtech/corridors.js';

/** Mounted after the v2 router's persisted-user authentication and rate limiter. */
export function createAdtechAdminRouter(registry:AdtechStrategyRegistry,inference?:CorridorInferenceWorker){
  const router=Router();
  const corridors=new FeederCorridorResolver(registry.pool);
  router.use((_req,res,next)=>res.locals.actor?.role==='admin'?next():next(new MarketingError('ADMIN_REQUIRED','Administrator access required.',403)));
  const actor=(res:any)=>res.locals.actor as Actor;
  const key=(req:any)=>z.string().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/).parse(req.get('Idempotency-Key'));
  const id=(req:any)=>z.coerce.number().int().positive().safe().parse(req.params.id);
  router.get('/inference',async(_req,res)=>{if(!inference)throw new MarketingError('INFERENCE_NOT_CONFIGURED','Destination research is unavailable.',503);res.json(await inference.list(actor(res)));});
  router.post('/inference/jobs/:id/retry',async(req,res)=>{if(!inference)throw new MarketingError('INFERENCE_NOT_CONFIGURED','Destination research is unavailable.',503);res.json(await inference.retry(actor(res),id(req),req.body,key(req)));});
  router.post('/inference/:id/review',async(req,res)=>{if(!inference)throw new MarketingError('INFERENCE_NOT_CONFIGURED','Destination research is unavailable.',503);res.json(await inference.review(actor(res),id(req),req.body,key(req)));});
  router.get('/corridors',async(_req,res)=>res.json(await corridors.list(actor(res))));
  router.post('/corridors',async(req,res)=>res.status(201).json(await corridors.create(actor(res),req.body,key(req))));
  router.put('/corridors/:id',async(req,res)=>res.json(await corridors.save(actor(res),id(req),req.body,key(req))));
  router.post('/corridors/:id/publish',async(req,res)=>res.json(await corridors.publish(actor(res),id(req),req.body,key(req))));
  router.get('/geography',async(req,res)=>{const input=z.object({provider:z.enum(['META','GOOGLE']),q:z.string().trim().min(2).max(120),kind:z.enum(['CITY','DISTRICT'])}).strict().parse(req.query);res.json({locations:await corridors.search(actor(res),input.provider,input.q,input.kind)});});
  router.get('/profiles',async(_req,res)=>res.json(await registry.list(actor(res))));
  router.post('/profiles',async(req,res)=>res.status(201).json(await registry.save(actor(res),req.body,key(req))));
  router.put('/profiles/:id',async(req,res)=>res.json(await registry.save(actor(res),req.body,key(req),z.coerce.number().int().positive().safe().parse(req.params.id))));
  router.post('/releases',async(req,res)=>res.status(201).json(await registry.publish(actor(res),req.body,key(req))));
  router.post('/releases/:id/rollback',async(req,res)=>{
    const body=z.object({expectedReleaseId:z.number().int().positive().safe(),reason:z.string().trim().min(10).max(2000)}).strict().parse(req.body);
    res.json(await registry.rollback(actor(res),z.coerce.number().int().positive().safe().parse(req.params.id),body.expectedReleaseId,key(req),body.reason));
  });
  return router;
}
