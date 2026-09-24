import express from 'express';
import request from 'supertest';
import {randomBytes,randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {createParticipantServiceRouter,createStaffServiceRouter} from '../server/conversations/serviceRouter.js';
import {ServiceCaseError} from '../lib/conversations/serviceCases.js';
import {createHttpExecutionContextMiddleware} from '../server/observability/httpExecutionContext.js';
import type {ServiceCaseRuntime} from '../server/conversations/serviceRuntime.js';

describe('CR1 assistance HTTP boundaries',()=>{
 const origin='https://ops.encho.test',credential=`wfs_${randomBytes(32).toString('base64url')}`;
 const caseId=randomUUID(),assignmentId=randomUUID();
 function fixture(){
  const consumer:ServiceCaseRuntime['participant']={status:vi.fn(async()=>({case:null,disclosureVersion:'cr1-service-assistance-v1'})),request:vi.fn(),withdraw:vi.fn()};
  const staff:ServiceCaseRuntime['staff']={read:vi.fn(),addNote:vi.fn()};
  const app=express();app.use(express.json(),createHttpExecutionContextMiddleware());
  app.use('/consumer',createParticipantServiceRouter(consumer,{authenticate:(_req,_res,next)=>next(),accountId:()=>10}));
  app.use('/staff',createStaffServiceRouter(staff,origin));return{app,consumer,staff};
 }
 it('gets participant status with server-selected identity and no role claim',async()=>{
  const{app,consumer}=fixture();const response=await request(app).get('/consumer/threads/1/assistance').set('role','admin');
  expect(response.status).toBe(200);expect(consumer.status).toHaveBeenCalledExactlyOnceWith(10,1);expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toEqual({case:null,disclosureVersion:'cr1-service-assistance-v1'});
 });
 it('requires workforce credentials and a fixed origin for even audited content reads',async()=>{
  const{app,staff}=fixture();const body={caseId,assignmentId,assignmentVersion:1,assignmentFence:'1'};
  expect((await request(app).post('/staff/read').set('Origin','https://evil.test').send(body)).status).toBe(403);
  expect((await request(app).post('/staff/read').set('Origin',origin).set('X-Encho-Workforce-Command','1').set('Authorization','Bearer consumer.jwt').send(body)).status).toBe(401);
  expect(staff.read).not.toHaveBeenCalled();
 });
 it('binds exact cookie identity and leaves case/fence authorization to the fresh service',async()=>{
  const{app,staff}=fixture();vi.mocked(staff.read).mockRejectedValueOnce(new ServiceCaseError('ASSIGNMENT_REQUIRED'));
  const body={caseId,assignmentId,assignmentVersion:1,assignmentFence:'1'};
  const response=await request(app).post('/staff/read').set('Origin',origin).set('X-Encho-Workforce-Command','1').set('Cookie',`__Host-encho_workforce=${credential}`).send(body);
  expect(response.status).toBe(403);expect(staff.read).toHaveBeenCalledExactlyOnceWith(`Bearer ${credential}`,body);expect(response.body).not.toHaveProperty('messages');
 });
 it('does not serialize raw errors or turn uncertain notes into accepted mutations',async()=>{
  const{app,staff}=fixture();vi.mocked(staff.addNote).mockRejectedValueOnce(new ServiceCaseError('OUTCOME_UNKNOWN'));
  const response=await request(app).post('/staff/notes').set('Origin',origin).set('X-Encho-Workforce-Command','1').set('Cookie',`__Host-encho_workforce=${credential}`).send({});
  expect(response.status).toBe(503);expect(response.body.code).toBe('OUTCOME_UNKNOWN');
  vi.mocked(staff.read).mockRejectedValueOnce(new Error('postgres://password private message'));
  const error=await request(app).post('/staff/read').set('Origin',origin).set('X-Encho-Workforce-Command','1').set('Cookie',`__Host-encho_workforce=${credential}`).send({});
  expect(error.status).toBe(503);expect(JSON.stringify(error.body)).not.toMatch(/password|private message/);
 });
 it('requires withdrawal version and path case identity, never body actor substitution',async()=>{
  const{app,consumer}=fixture();
  expect((await request(app).post(`/consumer/cases/${caseId}/withdraw`).send({expectedVersion:2,accountId:90})).status).toBe(422);
  expect(consumer.withdraw).not.toHaveBeenCalled();
  vi.mocked(consumer.withdraw).mockResolvedValue({id:caseId,threadId:1,state:'WITHDRAWN',version:3,disclosureVersion:'cr1-service-assistance-v1'});
  expect((await request(app).post(`/consumer/cases/${caseId}/withdraw`).send({expectedVersion:2})).status).toBe(200);
  expect(consumer.withdraw).toHaveBeenCalledWith(10,{caseId,expectedVersion:2});
 });
});
