import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createLocalPostgresFixture} from './postgres.js';
describe('021 observation schema compatibility',()=>{
 let fixture:Awaited<ReturnType<typeof createLocalPostgresFixture>>;
 beforeAll(async()=>{fixture=await createLocalPostgresFixture({schema:'empty'});});
 afterAll(async()=>{await fixture?.close();});
 it('replays additively, preserving unknown history and existing evidence',async()=>{
  await fixture.pool.query('CREATE TABLE host_marketing_campaigns(id INT PRIMARY KEY); INSERT INTO host_marketing_campaigns VALUES(1)');
  const sql=readFileSync(new URL('../../migrations/021_legacy_telemetry_evidence.sql',import.meta.url),'utf8');
  await fixture.pool.query(sql);
  expect((await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows[0]).toEqual({id:1,telemetry_source_metadata:null,engagement_synced_at:null,engagement_source_metadata:null});
  await fixture.pool.query("UPDATE host_marketing_campaigns SET telemetry_source_metadata=$1,engagement_source_metadata=$2,engagement_synced_at='2026-09-01T12:00:00Z'",[{source:'fixture',observed:true},{source:'fixture',supported_metrics:['comments']}]);
  const before=(await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows;
  await fixture.pool.query(sql);
  expect((await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows).toEqual(before);
 });
});
