import express from 'express';
import request from 'supertest';
import {describe,it,expect,vi} from 'vitest';
import {createHttpExecutionContextMiddleware} from '../server/observability/httpExecutionContext.js';
import {conversationAssistanceBoundary} from '../server/assistance/conversationAssistanceBoundary.js';
import {legacyStaffConversationBoundary,legacyBookingMessageBoundary} from '../server/assistance/legacyConversationBoundary.js';
describe('CR1 conversation authority containment',()=>{
  it.each([
    [legacyStaffConversationBoundary,403,'SCOPED_SERVICE_DESK_REQUIRED'],
    [legacyBookingMessageBoundary,503,'CONVERSATION_CONTEXT_REQUIRED'],
    [conversationAssistanceBoundary,503,'GROUNDED_CONVERSATION_ASSISTANCE_UNAVAILABLE'],
  ] as const)('terminates an unsafe legacy path without data or provider side effects',async(boundary,status,code)=>{
    const app=express(),downstream=vi.fn();
    app.use(express.json(),createHttpExecutionContextMiddleware());
    app.post('/operation',boundary,(_req,res)=>{downstream();res.json({privateMessage:'private'});});
    const response=await request(app).post('/operation').send({role:'admin',guestPhone:'secret',history:'private content'});
    expect(response.status).toBe(status);expect(response.body.code).toBe(code);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
    expect(JSON.stringify(response.body)).not.toMatch(/secret|private content/);
    expect(downstream).not.toHaveBeenCalled();
  });
});
