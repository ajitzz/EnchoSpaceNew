import {afterEach,describe,expect,it,vi} from 'vitest';
import type pg from 'pg';
import {createMarketingRuntime} from '../../server/marketing/runtime.js';
import {workflowConfig} from './workflowPgFixture.js';

describe('Runtime activation requires canonical source authority',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 function setup(){
  vi.stubEnv('HARVO_MARKETING_CONFIG',JSON.stringify({...workflowConfig,conversions:{google:{customerId:'9876543210',conversionActionId:'5'}}}));
  vi.stubEnv('GOOGLE_ADS_CUSTOMER_ID','9876543210');vi.stubEnv('GOOGLE_ADS_MCC_CUSTOMER_ID','1234567890');
  vi.stubEnv('GOOGLE_ADS_CLIENT_ID','isolated-client');vi.stubEnv('GOOGLE_ADS_CLIENT_SECRET','isolated-secret');vi.stubEnv('HARVO_GOOGLE_DATA_MANAGER_REFRESH_TOKEN','isolated-refresh');
  const query=vi.fn(()=>{throw new Error('This runtime construction test must not access a database');});
  return {pool:{query} as unknown as pg.Pool,query};
 }
 it('does not let configured activation and acceptance references supply absent booking/consent adapters',async()=>{
  const {pool,query}=setup(),runtime=createMarketingRuntime(pool);
  expect(runtime.config.activationEnabled).toBe(true);expect(runtime.workflow.options.activationEnabled).toBe(false);
  expect(runtime.conversions.readiness()).toMatchObject({enabled:false,canonicalSource:'NOT_CONNECTED'});
  await expect(runtime.workflow.schedule(1,{id:90,role:'admin'},1,'ACTIVATE','isolated-activation')).rejects.toMatchObject({code:'ACTIVATION_NOT_CONFIGURED'});
  expect(runtime.workflow.options.publishingEnabled).toBe(true);expect(query).not.toHaveBeenCalled();
 });
 it('binds a future explicitly injected source to its configured conversion channel',()=>{
  const {pool,query}=setup();const runtime=createMarketingRuntime(pool,{verifyBooking:async()=>{throw new Error('Isolated verifier is never invoked');},resolveAttribution:async()=>{throw new Error('Isolated consent resolver is never invoked');}});
  expect(runtime.workflow.options.activationEnabled).toBe(true);expect(runtime.workflow.options.activationBlockers?.('GOOGLE')).toEqual([]);expect(runtime.workflow.options.activationBlockers?.('META')).toHaveLength(1);expect(query).not.toHaveBeenCalled();
 });
 it('does not replace the separately scoped Data Manager grant with an Ads refresh token',()=>{
  const {pool}=setup();vi.stubEnv('HARVO_GOOGLE_DATA_MANAGER_REFRESH_TOKEN','');vi.stubEnv('GOOGLE_ADS_REFRESH_TOKEN','isolated-ads-only');
  const runtime=createMarketingRuntime(pool);expect(runtime.conversions.readiness().google).toBe('NOT_CONFIGURED');expect(runtime.workflow.options.activationEnabled).toBe(false);
 });
 it.each(['','54321','12345'])('binds Meta activation to the exact publisher pixel: %s',pixel=>{
  const {pool}=setup();vi.stubEnv('HARVO_MARKETING_CONFIG',JSON.stringify({...workflowConfig,conversions:{meta:{pixelId:'12345'}}}));vi.stubEnv('META_ACCESS_TOKEN','isolated-meta-token');vi.stubEnv('META_PIXEL_ID',pixel);
  const runtime=createMarketingRuntime(pool,{verifyBooking:async()=>{throw new Error('Isolated verifier is never invoked');},resolveAttribution:async()=>{throw new Error('Isolated resolver is never invoked');}});
  expect(runtime.workflow.options.activationBlockers?.('META')).toHaveLength(pixel==='12345'?0:1);
 });
});
