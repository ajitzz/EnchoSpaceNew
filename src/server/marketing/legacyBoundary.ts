import type {RequestHandler} from 'express';
/** Legacy operations must not bypass revision, captured funding or provider authorization. */
export const legacyMarketingBoundary:RequestHandler=(req,res,next)=>{
 const p=req.path;
 if(p.startsWith('/api/marketing/v2')||p.startsWith('/api/webhooks/marketing/v2'))return next();
 const campaignMutation=req.method!=='GET'&&(/^\/api\/(?:admin\/)?marketing\/campaigns(?:\/|$)/.test(p)||/^\/api\/(?:admin\/)?campaigns\//.test(p));
 const dangerousOther=/^\/api\/marketing\/(?:wallet\/refuel|simulate-webhook|pre-flight-check|copilot|grade-targeting|ai-generate-copy|social\/publish|track\/|pixel$)/.test(p)||/^\/api\/admin\/marketing\/(?:replay|rollback|dlq\/resolve|kill-switch)/.test(p)||/^\/api\/host\/social-posts\/[^/]+\/boost$/.test(p)||/^\/api\/marketing\/leads\/[^/]+\/convert-booking$/.test(p);
 if(campaignMutation||dangerousOther||/^\/api\/admin\/payments\/escrow\/release\/?$/i.test(p))return res.status(410).json({error:'This legacy paid-marketing operation has been retired. Open the campaign studio to use revision-bound review, verified funding and provider controls.',code:'HARVO_V2_REQUIRED'});
 next();
};
