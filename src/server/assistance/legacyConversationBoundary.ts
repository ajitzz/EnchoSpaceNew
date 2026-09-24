import type {RequestHandler} from 'express';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';

/** A legacy administrator role is not case-scoped authority to read/delete
 * private conversations. Staff access must move through the Operations desk. */
export const legacyStaffConversationBoundary:RequestHandler=(_req,res)=>{
  const trace=requireExecutionContext();
  res.setHeader('Cache-Control','no-store');
  res.status(403).json({code:'SCOPED_SERVICE_DESK_REQUIRED',
    error:'Conversation support requires a workforce session and an assigned service case.',
    correlationId:trace.correlationId,operationId:trace.operationId});
};

/** Unbridged booking writes accept a recipient supplied by the caller and emit
 * external message previews. Preserve history; stop new unsafe writes. */
export const legacyBookingMessageBoundary:RequestHandler=(_req,res)=>{
  const trace=requireExecutionContext();
  res.setHeader('Cache-Control','no-store');
  res.status(503).json({code:'CONVERSATION_CONTEXT_REQUIRED',
    error:'This booking conversation requires a verified participant context. Use the Encho inbox for existing property inquiries.',
    correlationId:trace.correlationId,operationId:trace.operationId});
};
