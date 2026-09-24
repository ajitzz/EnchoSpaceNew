import type {RequestHandler} from 'express';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';

/** Existing draft route trusts client history/role and has no canonical fact or
 * consent boundary. Keep it unavailable until P3's grounded assistance port. */
export const conversationAssistanceBoundary:RequestHandler=(_req,res)=>{
  const trace=requireExecutionContext();
  res.setHeader('Cache-Control','no-store');
  res.status(503).json({code:'GROUNDED_CONVERSATION_ASSISTANCE_UNAVAILABLE',
    error:'AI reply drafting is unavailable. Write a reply using verified conversation and stay information.',
    correlationId:trace.correlationId,operationId:trace.operationId});
};
