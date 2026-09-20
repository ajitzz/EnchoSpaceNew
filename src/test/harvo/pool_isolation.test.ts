import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { createLocalPostgresFixture } from './postgres.js';
import { installPoolIsolation,type DatabaseRequestContext } from '../../server/deployment/poolIsolation.js';
import { inTransaction } from '../../lib/marketing/database.js';

describe('transaction-local pool isolation with one reused, non-bypass PostgreSQL connection',()=>{
 let fixture:Awaited<ReturnType<typeof createLocalPostgresFixture>>,pool:pg.Pool;
 const context=new AsyncLocalStorage<DatabaseRequestContext>();
 beforeAll(async()=>{
  fixture=await createLocalPostgresFixture();
  await fixture.pool.query("CREATE ROLE isolated_client LOGIN NOSUPERUSER NOBYPASSRLS; CREATE TABLE isolation_rows(id int PRIMARY KEY,host_id int); INSERT INTO isolation_rows VALUES(1,10),(2,11); ALTER TABLE isolation_rows ENABLE ROW LEVEL SECURITY; ALTER TABLE isolation_rows FORCE ROW LEVEL SECURITY; CREATE POLICY tenant ON isolation_rows USING(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.bypass_rls',true)='true'); GRANT SELECT,INSERT ON isolation_rows TO isolated_client");
  pool=new pg.Pool({...fixture.pool.options,user:'isolated_client',max:1});installPoolIsolation(pool,()=>context.getStore());
 });
 afterAll(async()=>{await pool?.end();await fixture?.close();});
 const scoped=<T>(id:number,admin:boolean,run:()=>Promise<T>)=>context.run({isRequest:true,userId:id,bypassRls:admin},run);
 const ids=async()=> (await pool.query('SELECT id FROM isolation_rows ORDER BY id')).rows.map(row=>row.id);
 it('isolates host A, admin, anonymous and host B on the same connection',async()=>{
  expect(await scoped(10,false,ids)).toEqual([1]);expect(await scoped(90,true,ids)).toEqual([1,2]);
  expect(await ids()).toEqual([]);expect(await scoped(11,false,ids)).toEqual([2]);expect(await ids()).toEqual([]);
 });
 it('does not elevate an anonymous context carrying an admin flag',async()=>{
  expect(await context.run({isRequest:true,userId:null,bypassRls:true},ids)).toEqual([]);
 });
 it('preserves caller transaction boundaries and rolls back unreleased changes',async()=>{
  await scoped(10,false,async()=>{
   const c=await pool.connect();await c.query('BEGIN');await c.query('INSERT INTO isolation_rows VALUES(3,10)');
   expect((await c.query('SELECT id FROM isolation_rows ORDER BY id')).rows).toHaveLength(2);c.release();
  });
  expect(await scoped(10,false,ids)).toEqual([1]);
 });
 it('supports pool and explicit-client callbacks without bypassing isolation',async()=>{
  const result=await scoped(11,false,()=>new Promise<number[]>((resolve,reject)=>{
   pool.query('SELECT id FROM isolation_rows',(err,data)=>err?reject(err):resolve(data.rows.map(row=>row.id)));
  }));expect(result).toEqual([2]);
  const read=await scoped(10,false,()=>new Promise<number[]>((resolve,reject)=>{
   pool.connect((error,c,done)=>{if(error||!c){reject(error);return;}c.query('SELECT id FROM isolation_rows',(err,data)=>{done();if(err)reject(err);else resolve(data.rows.map(row=>row.id));});});
  }));expect(read).toEqual([1]);expect(await ids()).toEqual([]);
 });
 it('resets local elevation after nested service composition',async()=>{
  const result=await inTransaction(pool,{id:90,role:'system'},async c=>(await c.query('SELECT id FROM isolation_rows')).rows);
  expect(result).toHaveLength(2);expect(await ids()).toEqual([]);
 });
 it('recovers from a failed transaction and preserves the primary error',async()=>{
  await expect(scoped(10,false,async()=>inTransaction(pool,{id:10,role:'host'},async c=>{await c.query('SELECT missing_column FROM isolation_rows');}))).rejects.toMatchObject({code:'42703'});
  expect(await scoped(11,false,ids)).toEqual([2]);expect(await ids()).toEqual([]);
 });
 it('serializes concurrent autocommit reads on a checked-out client',async()=>{
  await scoped(10,false,async()=>{const c=await pool.connect();try{
   const results=await Promise.all([c.query('SELECT id FROM isolation_rows'),c.query('SELECT id FROM isolation_rows')]);
   expect(results.map(r=>r.rows.map(row=>row.id))).toEqual([[1],[1]]);
  }finally{c.release();}});
 });
});
