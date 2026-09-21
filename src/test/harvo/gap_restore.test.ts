import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import pg from 'pg';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createWorkflowPgFixture} from './workflowPgFixture.js';
import {prepareRestoreSettlement,prepareRestoreConversion,prepareRestorePause,restoreAdmin,restoreHost,restoreSettlementOptions,restoreWorkflow} from './gapRestoreFixture.js';
import {MarketingSettlementService} from '../../lib/marketing/settlementService.js';
import {MarketingFinanceService} from '../../lib/marketing/financeService.js';
import {MarketingPauseRecovery} from '../../lib/marketing/pauseRecovery.js';

const migrations=['011_harvo_marketing_measurement.sql','012_harvo_marketing_settlement.sql','013_harvo_marketing_conversion_delivery.sql','014_harvo_marketing_request_limits.sql'];
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
describe('current financial and conversion evidence survives real PostgreSQL dump/restore',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>;
 const report:Record<string,any>={scope:'LOCAL_POSTGRESQL_RESTORE_ONLY_NOT_PRODUCTION_RECOVERY_ACCEPTANCE',observedAt:new Date().toISOString(),node:process.version,status:'NOT_COMPLETED',migrations:{}};
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();for(const name of migrations){const sql=readFileSync(new URL(`../../migrations/${name}`,import.meta.url),'utf8');await fixture.pool.query(sql);report.migrations[name]=hash(sql);}await fixture.reset();report.postgresql=(await fixture.pool.query('SHOW server_version')).rows[0].server_version;});
 afterAll(async()=>{await fixture?.close();const directory=new URL('../../../test-results/harvo/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('gap-restore.json',directory),JSON.stringify(report,null,2)+'\n');});
 async function digest(pool:pg.Pool){const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'marketing_%' OR tablename IN ('provider_entities','provider_publishing_transactions','campaign_financial_contracts','host_marketing_campaigns')) ORDER BY tablename")).rows.map(r=>r.tablename as string);const result:Record<string,{rows:number;sha256:string}>={};for(const table of tables){if(!/^[a-z0-9_]+$/.test(table))throw new Error('Unexpected fixture table identity');const rows=(await pool.query(`SELECT to_jsonb(t)::text AS evidence FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows;result[table]={rows:rows.length,sha256:hash(rows.map(r=>r.evidence).join('\n'))};}return result;}
 async function schema(pool:pg.Pool){return (await pool.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname LIKE 'marketing_%' ORDER BY c.relname")).rows;}
 it('preserves exact bytes, settled accounting, unknown dispatch ownership and nonowner access barriers',async()=>{
  const external=vi.fn<typeof fetch>(async()=>{throw new Error('Injected unknown response after fixture dispatch; no real HTTP');});
  const settled=await prepareRestoreSettlement(fixture.pool),conversion=await prepareRestoreConversion(fixture.pool,external);expect(external).toHaveBeenCalledOnce();
  const pause = await prepareRestorePause(fixture.pool);
  expect((await fixture.pool.query('SELECT status,request_fingerprint FROM marketing_conversion_deliveries')).rows[0].status).toBe('UNKNOWN');
  expect((await fixture.pool.query('SELECT status,attempts FROM marketing_conversion_outbox')).rows[0]).toEqual({status:'UNKNOWN',attempts:1});
  await fixture.pool.query('CREATE ROLE harvo_gap_restore_reader');await fixture.pool.query('GRANT USAGE ON SCHEMA public TO harvo_gap_restore_reader');await fixture.pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO harvo_gap_restore_reader');
  const before=await digest(fixture.pool),beforeSchema=await schema(fixture.pool);const binaries=process.env.HARVO_POSTGRES_BIN||'/opt/homebrew/opt/postgresql@18/bin';if(!existsSync(join(binaries,'pg_dump')))throw new Error('Real local pg_dump is required');
  const directory=mkdtempSync(join(tmpdir(),'harvo-gap-restore-')),file=join(directory,'current-evidence.dump');const arguments_=['-h',String(fixture.pool.options.host),'-p',String(fixture.pool.options.port),'-U','harvo_test'];let restored:pg.Pool|undefined;
  const command=(name:string,args:string[])=>execFileSync(join(binaries,name),[...arguments_,...args],{env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:'pipe',timeout:20000});
  const started=performance.now();
  try{
   command('pg_dump',['-Fc','-d','postgres','-f',file]);await fixture.pool.query('CREATE DATABASE harvo_gap_restore TEMPLATE template0');command('pg_restore',['--exit-on-error','-d','harvo_gap_restore',file]);restored=new pg.Pool({...fixture.pool.options,database:'harvo_gap_restore',max:5});
   const after=await digest(restored);expect(after).toEqual(before);expect(await schema(restored)).toEqual(beforeSchema);const unprotected=beforeSchema.filter(row=>!row.relrowsecurity||!row.relforcerowsecurity).map(row=>row.relname);expect(unprotected).toEqual([]);report.unprotectedServiceTables=unprotected;report.productionIsolationAcceptance='LOCAL_OPERATIONAL_RLS_VERIFIED_PRODUCTION_GRANTS_PENDING';
   const noExternal=vi.fn<typeof fetch>(async()=>{throw new Error('No external request is allowed after restore');}),noStopRead=vi.fn(async()=>{throw new Error('A settled replay must not make another provider read');});
   const pauseReplay = await new MarketingPauseRecovery(restored, noStopRead).adopt(restoreAdmin, pause.campaignId, pause.input, pause.requestKey);
   expect(pauseReplay).toEqual({...pause.result, idempotent:true});
   expect(noStopRead).not.toHaveBeenCalled();
   const service=new MarketingSettlementService(restored,{...restoreSettlementOptions,verifyStopped:noStopRead});const replay=await service.settle(restoreAdmin,settled.proposal.id,{fingerprint:settled.proposal.fingerprint},'restore-settle');expect(replay).toMatchObject({idempotent:true,returnedMinor:'10500',profitMinor:'4500',actualCostMinor:'90000'});expect(noStopRead).not.toHaveBeenCalled();
   expect((await service.getDocument(restoreAdmin,settled.document.id)).sha256).toBe(settled.document.sha256);const storedDocument=(await service.getDocument(restoreAdmin,settled.document.id));expect(hash(storedDocument.content)).toBe(settled.document.sha256);
   const captureReplay=await new MarketingFinanceService(restored,{actorContext:restoreAdmin,fundingEnabled:true,verifyCapture:async()=>settled.capture}).recordVerifiedCapture({fixture:true});expect(captureReplay.idempotent).toBe(true);
   const replayConsumer=conversion.make(restored,noExternal);await replayConsumer.ingest('fixture-booking-reference');await replayConsumer.runOnce();await replayConsumer.runOnce();expect(noExternal).not.toHaveBeenCalled();
   expect((await restored.query('SELECT status,attempts FROM marketing_conversion_outbox')).rows).toEqual([{status:'UNKNOWN',attempts:1}]);expect((await restored.query('SELECT order_id,booking_id,campaign_id,external_campaign_id FROM marketing_booking_measurements')).rows[0]).toMatchObject({order_id:conversion.booking.orderId,booking_id:conversion.booking.bookingId,campaign_id:conversion.campaignId,external_campaign_id:conversion.booking.attribution.externalCampaignId});
   expect(await digest(restored)).toEqual(before);
   for(const sql of ["DELETE FROM marketing_pause_recovery_attempts","UPDATE marketing_pause_recovery_attempts SET request_key='tampered'","UPDATE marketing_pause_recoveries SET evidence='{}'", "DELETE FROM marketing_pause_recoveries", "UPDATE marketing_settlement_documents SET content='tampered'::bytea","UPDATE marketing_settlement_reviews SET decision='REJECT'","UPDATE marketing_settlement_allocations SET amount_minor=0","UPDATE marketing_settlement_proposals SET snapshot='{}'","UPDATE marketing_measurement_events SET evidence='{}'","UPDATE marketing_conversion_outbox SET payload='{}'","UPDATE marketing_conversion_deliveries SET request_fingerprint=repeat('f',64)","DELETE FROM marketing_conversion_delivery_events"]){await expect(restored.query(sql)).rejects.toThrow(/immutable|IMMUTABLE|append-only|cannot be deleted/);}
   const reader=await restored.connect();try{await reader.query('BEGIN');await reader.query('SET LOCAL ROLE harvo_gap_restore_reader');await reader.query("SELECT set_config('app.current_user_id','11',true),set_config('app.marketing_admin','false',true)");for(const table of ['marketing_pause_recovery_attempts','marketing_pause_recoveries','marketing_settlement_documents','marketing_settlement_proposals','marketing_finance_accounts','marketing_booking_measurements','marketing_conversion_deliveries','marketing_request_limits'])expect((await reader.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
    await reader.query("SELECT set_config('app.current_user_id','10',true)");expect((await reader.query('SELECT * FROM marketing_settlement_documents')).rows).toHaveLength(0);expect((await reader.query('SELECT * FROM marketing_booking_measurements')).rows).toHaveLength(1);expect((await reader.query('SELECT * FROM marketing_settlement_proposals')).rows).toHaveLength(1);await reader.query('COMMIT');
   }finally{await reader.query('ROLLBACK');reader.release();}
   expect(await digest(restored)).toEqual(before);report.status='PASSED';report.restore={format:'pg_dump -Fc / pg_restore into distinct local database',elapsedMs:Math.round(performance.now()-started),tables:before,identicalRowsAndEvidence:true,immutableTriggersPreserved:true,forcedRlsPreserved:true,nonownerIsolationVerified:true,settledJournalCount:before.marketing_finance_journals.rows,unknownConversionAttempts:1,externalRequestsAfterRestore:0,financialReplayIdempotent:true,pauseRecoveryReplayIdempotent:true,pauseRecoveryReceipts:before.marketing_pause_recoveries.rows,scope:'011–014 and pause-recovery020/022 plus workflow/finance/provider baseline; creative015 is not covered yet'};
  }catch(error){report.status='FAILED';report.failureType=error instanceof Error?error.name:'Unknown';throw error;}
  finally{await restored?.end();await fixture.pool.query('DROP DATABASE IF EXISTS harvo_gap_restore');rmSync(directory,{recursive:true,force:true});}
 },60000);
});
