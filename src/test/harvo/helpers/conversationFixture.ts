import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createLocalPostgresFixture} from '../postgres.js';
import {conversationRuntimeGrants,conversationWorkerGrants} from '../../../server/deployment/conversationReadiness.js';

/** Disposable Unix-socket cluster. No environment database URL or server import. */
export async function createConversationFixture(){
 const fixture=await createLocalPostgresFixture({schema:'empty'});
 let runtime:pg.Pool|undefined,worker:pg.Pool|undefined,migrator:pg.Pool|undefined;
 const close=async()=>{await runtime?.end();await worker?.end();await migrator?.end();await fixture.close();};
 try{
  await fixture.pool.query(`
   REVOKE CREATE ON SCHEMA public FROM PUBLIC;
   CREATE ROLE cr1_conversation_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
   CREATE ROLE cr1_conversation_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
   CREATE ROLE cr1_notification_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
   GRANT USAGE,CREATE ON SCHEMA public TO cr1_conversation_migrator;
   SET ROLE cr1_conversation_migrator;
   CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,role TEXT);
   CREATE TABLE listings(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,publication_status TEXT,slug TEXT,image_url TEXT);
   CREATE TABLE experiences(id INTEGER PRIMARY KEY,host_id INTEGER,title TEXT,image_urls JSONB DEFAULT '[]'::jsonb,status TEXT);
   CREATE TABLE threads(id SERIAL PRIMARY KEY,listing_id INTEGER,guest_id INTEGER REFERENCES users(id),host_id INTEGER REFERENCES users(id),last_message TEXT,unread_count_guest INTEGER DEFAULT 0,unread_count_host INTEGER DEFAULT 0,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,experience_id INTEGER);
   CREATE TABLE messages(id SERIAL PRIMARY KEY,booking_id INTEGER,sender_id INTEGER REFERENCES users(id),receiver_id INTEGER REFERENCES users(id),content TEXT NOT NULL,is_read BOOLEAN DEFAULT false,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,listing_id INTEGER,is_sanitized BOOLEAN DEFAULT false,client_event_id UUID,client_request_hash TEXT,UNIQUE(sender_id,client_event_id));
   INSERT INTO users VALUES(10,'Guest fixture','guest@example.test','user'),(20,'Host fixture','host@example.test','user'),(30,'Other guest','other@example.test','user'),(90,'Legacy admin','admin@example.test','admin');
   INSERT INTO listings(id,user_id,title,publication_status,slug) VALUES(1,20,'Local test stay','published','local-test-stay');
   INSERT INTO threads(id,listing_id,guest_id,host_id,last_message,unread_count_guest,unread_count_host) VALUES(1,1,10,20,'Historical reply',1,1),(2,1,30,20,NULL,0,0);
   SELECT setval('threads_id_seq',2);
   INSERT INTO messages(id,thread_id,sender_id,receiver_id,content,created_at,is_read) VALUES(1,1,10,20,'Historical inquiry','2026-01-01',false),(2,1,20,10,'Historical reply','2026-01-02',false);
   INSERT INTO messages(id,booking_id,sender_id,receiver_id,content,created_at) VALUES(3,77,10,20,'Legacy booking-only message','2026-01-03');
   SELECT setval('messages_id_seq',3);
   ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
   ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
   CREATE POLICY threads_policy ON threads USING(guest_id=NULLIF(current_setting('app.current_user_id',true),'')::integer OR host_id=NULLIF(current_setting('app.current_user_id',true),'')::integer OR current_setting('app.bypass_rls',true)='true');
   CREATE POLICY messages_policy ON messages USING(sender_id=NULLIF(current_setting('app.current_user_id',true),'')::integer OR receiver_id=NULLIF(current_setting('app.current_user_id',true),'')::integer OR current_setting('app.bypass_rls',true)='true');
   RESET ROLE;
  `);
  migrator=new pg.Pool({...fixture.pool.options,user:'cr1_conversation_migrator'});
  const client=await migrator.connect();
  try{await client.query('BEGIN');await client.query(readFileSync(new URL('../../../migrations/037_conversation_delivery.sql',import.meta.url),'utf8'));await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK');if(error instanceof Error&&'position' in error){const position=Number(error.position);const sql=readFileSync(new URL('../../../migrations/037_conversation_delivery.sql',import.meta.url),'utf8');error.message+=` (local migration line ${sql.slice(0,position).split('\n').length}, offset ${position})`;}throw error;}finally{client.release();}
  for(const sql of conversationRuntimeGrants('cr1_conversation_runtime'))await fixture.pool.query(sql);
  for(const sql of conversationWorkerGrants('cr1_notification_worker'))await fixture.pool.query(sql);
  await fixture.pool.query('GRANT SELECT ON users,listings,experiences TO cr1_conversation_runtime');
  runtime=new pg.Pool({...fixture.pool.options,user:'cr1_conversation_runtime'});
  worker=new pg.Pool({...fixture.pool.options,user:'cr1_notification_worker'});
  async function asActor<T>(userId:number,work:(client:pg.PoolClient)=>Promise<T>,commit=true){
   const c=await runtime!.connect();
   try{await c.query('BEGIN');await c.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls','false',true)",[String(userId)]);const value=await work(c);await c.query(commit?'COMMIT':'ROLLBACK');return value;}
   catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  return {pool:fixture.pool,runtime,worker,migrator,asActor,close};
 }catch(error){await close();throw error;}
}
