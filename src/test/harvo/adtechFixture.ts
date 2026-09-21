import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createLocalPostgresFixture} from './postgres.js';

export async function createAdtechFixture(){
 const fixture=await createLocalPostgresFixture({schema:'empty'});
 try{
  await fixture.pool.query(`CREATE TABLE users(id INT PRIMARY KEY,role TEXT NOT NULL);
   INSERT INTO users VALUES(10,'host'),(11,'host'),(90,'admin'),(91,'admin');
   CREATE TABLE admin_audit_logs(id SERIAL PRIMARY KEY,admin_id INT REFERENCES users,entity_type TEXT,entity_id INT,action TEXT,previous_state JSONB,new_state JSONB,created_at TIMESTAMPTZ DEFAULT now());
   CREATE TABLE listings(id INT PRIMARY KEY,user_id INT REFERENCES users,title TEXT,city TEXT,price NUMERIC(18,2),currency TEXT,rental_mode TEXT,publication_status TEXT,lat NUMERIC,lng NUMERIC);
   INSERT INTO listings VALUES(20,10,'Synthetic Wayanad stay','Wayanad',3500,'INR','entire_place','published',11.7,76.1),(21,11,'Synthetic Goa stay','North Goa',9000,'INR','entire_place','published',15.5,73.8);`);
  const migration=await fixture.pool.connect();
  try{await migration.query('BEGIN');await migration.query(readFileSync('src/migrations/032_marketing_adtech_registry.sql','utf8'));await migration.query('COMMIT');}catch(error){await migration.query('ROLLBACK');throw error;}finally{migration.release();}
  await fixture.pool.query(`CREATE ROLE authenticated_host LOGIN NOSUPERUSER NOBYPASSRLS;
   CREATE ROLE marketing_worker LOGIN NOSUPERUSER NOBYPASSRLS;
   GRANT USAGE ON SCHEMA public TO authenticated_host,marketing_worker;
   GRANT SELECT ON users,listings TO authenticated_host,marketing_worker;
   GRANT SELECT,INSERT ON marketing_adtech_tier_profiles,marketing_adtech_profile_versions,marketing_adtech_releases,marketing_adtech_release_members,marketing_adtech_strategy_audits TO authenticated_host,marketing_worker;
   GRANT SELECT,UPDATE ON marketing_adtech_current_release TO authenticated_host,marketing_worker;
   GRANT INSERT ON admin_audit_logs TO authenticated_host,marketing_worker;
   GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated_host,marketing_worker;`);
  const runtime=new pg.Pool({...fixture.pool.options,user:'marketing_worker'});
  const hostPool=new pg.Pool({...fixture.pool.options,user:'authenticated_host'});
  return {...fixture,runtime,hostPool,close:async()=>{await runtime.end();await hostPool.end();await fixture.close();}};
 }catch(e){await fixture.close();throw e;}
}
