import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createNotificationPreferencesFixture} from './helpers/notificationPreferencesFixture.js';
import {verifyNotificationPreferenceCatalog} from '../../server/deployment/notificationPreferencesReadiness.js';

describe('notification preference readiness checks actual LOGIN and reachable authority',()=>{
 let f:Awaited<ReturnType<typeof createNotificationPreferencesFixture>>;
 beforeAll(async()=>{f=await createNotificationPreferencesFixture();},30_000);
 afterAll(async()=>{await f?.close();});
 async function catalog(){
  const c=await f.runtime.connect();
  try{await c.query('BEGIN READ ONLY');return await verifyNotificationPreferenceCatalog(c);}
  finally{await c.query('ROLLBACK');c.release();}
 }
 it('preserves the exact least-privilege participant LOGIN',async()=>{
  expect((await f.runtime.query('SELECT session_user,current_user')).rows[0]).toEqual({session_user:'cr1_conversation_runtime',current_user:'cr1_conversation_runtime'});
  expect((await catalog()).ready).toBe(true);
 });
 it.each([
  ['forged preference timestamp','INSERT(updated_at) ON conversation_notification_preferences'],
  ['preference identity UPDATE','UPDATE(user_id) ON conversation_notification_preferences'],
  ['audit content UPDATE','UPDATE(in_app_alerts) ON conversation_notification_preference_events'],
  ['audit deletion','DELETE ON conversation_notification_preference_events'],
  ['preference truncation','TRUNCATE ON conversation_notification_preferences'],
  ['column REFERENCES','REFERENCES(version) ON conversation_notification_preferences'],
  ['trigger creation','TRIGGER ON conversation_notification_preferences'],
  ['trigger-function execution','EXECUTE ON FUNCTION conversation_record_notification_preference()'],
  ['forged audit timestamp','INSERT(created_at) ON conversation_notification_preference_events'],
 ])('rejects NOINHERIT reachable %s before enabling the route',async(_label,privilege)=>{
  await f.pool.query('ALTER ROLE cr1_conversation_runtime NOINHERIT; CREATE ROLE preference_reachable NOLOGIN; GRANT preference_reachable TO cr1_conversation_runtime');
  await f.pool.query(`GRANT ${privilege} TO preference_reachable`);
  try{
   const c=await f.runtime.connect();
   try{
    await c.query('BEGIN READ ONLY; SET LOCAL ROLE preference_reachable');
    expect((await c.query('SELECT current_user')).rows[0].current_user).toBe('preference_reachable');
   }finally{await c.query('ROLLBACK');c.release();}
   expect((await catalog()).ready).toBe(false);
  }finally{
   await f.pool.query(`REVOKE ${privilege} FROM preference_reachable`);
   await f.pool.query('REVOKE preference_reachable FROM cr1_conversation_runtime; DROP ROLE preference_reachable; ALTER ROLE cr1_conversation_runtime INHERIT');
  }
  expect((await catalog()).ready).toBe(true);
 });
 it.each([
  ['SELECT(version) ON conversation_notification_preferences'],
  ['REFERENCES(version) ON conversation_notification_preference_events'],
 ])('rejects PUBLIC column authority %s',async(privilege)=>{
  await f.pool.query(`GRANT ${privilege} TO PUBLIC`);
  try{expect((await catalog()).ready).toBe(false);}
  finally{await f.pool.query(`REVOKE ${privilege} FROM PUBLIC`);}
  expect((await catalog()).ready).toBe(true);
 });
 it('rejects direct column REFERENCES without treating it as a table grant',async()=>{
  await f.pool.query('GRANT REFERENCES(version) ON conversation_notification_preferences TO cr1_conversation_runtime');
  try{expect((await catalog()).ready).toBe(false);}
  finally{await f.pool.query('REVOKE REFERENCES(version) ON conversation_notification_preferences FROM cr1_conversation_runtime');}
  expect((await catalog()).ready).toBe(true);
 });
 it('does not reject harmless reachable copies of allowed grants',async()=>{
  await f.pool.query('ALTER ROLE cr1_conversation_runtime NOINHERIT; CREATE ROLE preference_reader NOLOGIN; GRANT preference_reader TO cr1_conversation_runtime; GRANT SELECT,UPDATE(in_app_alerts,version) ON conversation_notification_preferences TO preference_reader');
  try{expect((await catalog()).ready).toBe(true);}
  finally{await f.pool.query('REVOKE ALL ON conversation_notification_preferences FROM preference_reader; REVOKE UPDATE(in_app_alerts,version) ON conversation_notification_preferences FROM preference_reader; REVOKE preference_reader FROM cr1_conversation_runtime; DROP ROLE preference_reader; ALTER ROLE cr1_conversation_runtime INHERIT');}
 });
 it('requires actual current-role SELECT even when a NOINHERIT reader could supply it',async()=>{
  await f.pool.query('ALTER ROLE cr1_conversation_runtime NOINHERIT; CREATE ROLE preference_reader NOLOGIN; GRANT preference_reader TO cr1_conversation_runtime; GRANT SELECT ON conversation_notification_preferences TO preference_reader; REVOKE SELECT ON conversation_notification_preferences FROM cr1_conversation_runtime');
  try{expect((await catalog()).ready).toBe(false);}
  finally{await f.pool.query('GRANT SELECT ON conversation_notification_preferences TO cr1_conversation_runtime; REVOKE ALL ON conversation_notification_preferences FROM preference_reader; REVOKE preference_reader FROM cr1_conversation_runtime; DROP ROLE preference_reader; ALTER ROLE cr1_conversation_runtime INHERIT');}
 });
});
