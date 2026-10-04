import type pg from 'pg';
import {publicOfferConnectionConfig} from '../offers/runtime.js';

/** W2 Guest writes have their own non-owner login; never inherit DATABASE_URL. */
export function staysConnectionConfig(env:NodeJS.ProcessEnv):pg.PoolConfig|null{
  if(!env.STAYS_DATABASE_URL)return null;
  return publicOfferConnectionConfig({...env,PUBLIC_OFFER_DATABASE_URL:env.STAYS_DATABASE_URL});
}

export async function assertStaysRole(pool:pg.Pool):Promise<void>{
  const {rows}=await pool.query(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreatedb,
    r.rolcreaterole,r.rolreplication,r.rolcanlogin,
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    pg_has_role(r.oid,c.relowner,'MEMBER') AS owns_quotes
    FROM pg_roles r JOIN pg_class c ON c.oid='public.stays_quotes'::regclass
    WHERE r.rolname=current_user`);
  const r=rows[0];
  if(!r||!r.rolcanlogin||r.rolsuper||r.rolbypassrls||r.rolcreatedb||
    r.rolcreaterole||r.rolreplication||r.schema_create||r.database_create||r.owns_quotes)
    throw new Error('STAYS_ROLE_NOT_RESTRICTED');
}

export async function setStaysPrincipal(client:pg.PoolClient,principal:string):Promise<void>{
  if(!/^(user:\d+|session:[0-9a-f-]{36})$/.test(principal))throw new Error('INVALID_STAYS_PRINCIPAL');
  await client.query('SELECT set_config($1,$2,true)', ['app.stays_principal',principal]);
}

export async function withStaysPrincipal<T>(pool:pg.Pool,principal:string,
  operation:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await setStaysPrincipal(client,principal);
    const result=await operation(client);
    await client.query('COMMIT');
    return result;
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
