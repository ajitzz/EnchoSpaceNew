import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createWorkflowPgFixture,workflowConfig} from './workflowPgFixture.js';
import {MetaMarketingEvents} from '../../lib/marketing/metaEvents.js';
import {marketingReadiness} from '../../lib/marketing/readiness.js';

describe('HARVO operational boundaries',()=>{
 let db:Awaited<ReturnType<typeof createWorkflowPgFixture>>;
 beforeAll(async()=>{db=await createWorkflowPgFixture();});beforeEach(async()=>{await db.reset();});afterAll(async()=>{await db?.close();});
 const secret='isolated-meta-signing-secret';
 const body=()=>({object:'page',entry:[{id:'1234',changes:[{value:{ad_id:'9876',email:'sensitive@example.com',message:'Private lead body'}}]}]});
 const signed=(value:unknown)=>{const raw=Buffer.from(JSON.stringify(value));return {raw,signature:'sha256='+createHmac('sha256',secret).update(raw).digest('hex')};};
 it('persists one minimal authenticated event under concurrent delivery',async()=>{
  const events=new MetaMarketingEvents(db.pool,secret,'isolated-verify-token');const s=signed(body());
  await Promise.all(Array.from({length:20},()=>events.ingest(s.raw,s.signature)));
  const rows=(await db.pool.query('SELECT * FROM marketing_jobs')).rows;expect(rows).toHaveLength(1);expect(rows[0].payload.entry[0].changes[0].value).toEqual({ad_id:'9876'});
  expect(JSON.stringify(rows)).not.toContain('sensitive@example.com');expect(JSON.stringify(rows)).not.toContain('Private lead');
 });
 it('invalid signatures and malformed structures never reach durable work',async()=>{
  const events=new MetaMarketingEvents(db.pool,secret);const good=signed(body());
  await expect(events.ingest(good.raw,'sha256='+'0'.repeat(64))).rejects.toMatchObject({code:'WEBHOOK_SIGNATURE_INVALID'});
  for(const value of [{object:'page',entry:[{id:'1234',changes:{}}]},{object:'unknown',entry:[]},{object:'page',entry:[{id:'not-provider-id',changes:[]}]}]){const s=signed(value);await expect(events.ingest(s.raw,s.signature)).rejects.toMatchObject({code:'WEBHOOK_PAYLOAD_INVALID'});}
  expect((await db.pool.query('SELECT count(*)::int n FROM marketing_jobs')).rows[0].n).toBe(0);
 });
 it('challenge verification is bounded and never echoes a wrong token',()=>{
  const events=new MetaMarketingEvents(db.pool,secret,'token');expect(events.challenge('subscribe','token','12345')).toBe('12345');
  expect(()=>events.challenge('subscribe','wrong','12345')).toThrow();expect(()=>events.challenge('subscribe','token','<script>')).toThrow();
 });
 it('presence report exposes no secret values or live acceptance',()=>{
  const report=marketingReadiness(workflowConfig,{GEMINI_API_KEY:'private-isolated-secret',META_API_TOKEN:'private-meta-token'});
  expect(report.find(r=>r.name==='GEMINI_API_KEY')?.status).toBe('PRESENT_UNVERIFIED');expect(report.find(r=>r.name==='META_ACCESS_TOKEN')?.status).toBe('PRESENT_UNVERIFIED');expect(report.find(r=>r.name==='GOOGLE_ADS_CUSTOMER_ID')?.status).toBe('MISSING');expect(JSON.stringify(report)).not.toContain('private-');
 });
 it('offline background sync excludes marketing financial and provider actions',()=>{
  const source=readFileSync(new URL('../../../vite.config.ts',import.meta.url),'utf8');
  const expression=source.match(/urlPattern: (\/[^\n]+\/i),\s*method: 'POST'/)?.[1];expect(expression).toBeTruthy();
  const pattern=new RegExp(expression!.slice(1,-2),'i');
  for(const path of ['/api/marketing/v2/campaigns/1/fund','/api/marketing/v2/campaigns/1/activate','/api/webhooks/marketing/v2/meta'])expect(pattern.test('https://encho.example'+path)).toBe(false);
  expect(pattern.test('https://encho.example/api/unrelated-post')).toBe(true);
 });
});
