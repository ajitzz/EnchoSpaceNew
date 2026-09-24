import {readFileSync} from 'node:fs';
import {createConversationFixture} from './conversationFixture.js';
import {notificationPreferenceRuntimeGrants} from '../../../server/deployment/notificationPreferencesReadiness.js';

export async function createNotificationPreferencesFixture(){
 const f=await createConversationFixture();
 try{
  const c=await f.migrator.connect();
  try{await c.query('BEGIN');await c.query(readFileSync(new URL('../../../migrations/039_conversation_notification_preferences.sql',import.meta.url),'utf8'));await c.query('COMMIT');}
  catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  for(const sql of notificationPreferenceRuntimeGrants('cr1_conversation_runtime'))await f.pool.query(sql);
  return f;
 }catch(error){await f.close();throw error;}
}
