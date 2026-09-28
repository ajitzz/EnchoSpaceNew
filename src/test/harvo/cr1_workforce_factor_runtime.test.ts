import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {createWorkforceFactorRuntime} from '../../server/operations/workforceFactorRuntime.js';
import {createWorkforceFactorRouter} from '../../server/operations/workforceFactorRouter.js';
import {createWorkforceCommandRouter} from '../../server/operations/workforceCommandRouter.js';
import {createHttpExecutionContextMiddleware} from '../../server/observability/httpExecutionContext.js';

const explicit:NodeJS.ProcessEnv={NODE_ENV:'production',CR1_WORKFORCE_ENVIRONMENT:'PRODUCTION',
 CR1_WORKFORCE_ORIGIN:'https://ops.encho.test',CR1_WORKFORCE_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',
 CR1_WORKFORCE_GOOGLE_CLIENT_ID:'workforce-client.apps.googleusercontent.com',
 CR1_WORKFORCE_DATABASE_URL:'postgres://runtime:fixture@runtime.invalid/encho',
 CR1_WORKFORCE_FACTOR_DATABASE_URL:'postgres://factor:fixture@runtime.invalid/encho'};

describe('R1-02 isolated factor construction (no network calls)',()=>{
 it('never falls back to customer, runtime or identity credentials',()=>{
  for(const name of ['CR1_WORKFORCE_DATABASE_URL','CR1_WORKFORCE_FACTOR_DATABASE_URL']){
   const env={...explicit,DATABASE_URL:explicit.CR1_WORKFORCE_FACTOR_DATABASE_URL,CR1_WORKFORCE_IDENTITY_DATABASE_URL:explicit.CR1_WORKFORCE_FACTOR_DATABASE_URL};
   delete env[name];expect(createWorkforceFactorRuntime(env,vi.fn())).toBeNull();
  }
 });
 it('requires explicit environment, origin, organization and audience before creating pools',()=>{
  for(const name of ['CR1_WORKFORCE_ENVIRONMENT','CR1_WORKFORCE_ORIGIN','CR1_WORKFORCE_ORGANIZATION_ID','CR1_WORKFORCE_GOOGLE_CLIENT_ID']){
   const env={...explicit};delete env[name];expect(createWorkforceFactorRuntime(env,vi.fn())).toBeNull();
  }
 });
 it('rejects injected connection authority and invalid origins without echoing credentials',()=>{
  for(const url of ['invalid','postgres://factor:fixture@runtime.invalid/encho?options=-c%20role%3Downer','postgres://factor@localhost/test']){
   const report=vi.fn();expect(createWorkforceFactorRuntime({...explicit,CR1_WORKFORCE_FACTOR_DATABASE_URL:url},report)).toBeNull();
   expect(report).toHaveBeenCalledWith();
  }
  expect(createWorkforceFactorRuntime({...explicit,CR1_WORKFORCE_ORIGIN:'https://ops.encho.test/path'},vi.fn())).toBeNull();
 });
 it.each([
  ['factor',12,'FACTOR_RATE_LIMITED'],['command',30,'COMMAND_RATE_LIMITED'],
 ] as const)('returns correlated bounded JSON for %s throttling',async(kind,limit,code)=>{
  const app=express();app.use(createHttpExecutionContextMiddleware());
  app.use('/test',kind==='factor'?createWorkforceFactorRouter(null,'https://ops.encho.test'):createWorkforceCommandRouter(null,'https://ops.encho.test'));
  for(let index=0;index<limit;index++)await request(app).post('/test').send({});
  const response=await request(app).post('/test').send({});expect(response.status).toBe(429);
  expect(response.headers['cache-control']).toBe('no-store');expect(response.body).toEqual({code,error:expect.any(String),correlationId:expect.any(String),operationId:expect.any(String)});
  expect(response.body.correlationId.length).toBeGreaterThan(0);expect(response.body.operationId.length).toBeGreaterThan(0);
 });
});
