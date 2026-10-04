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
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('stays_quotes','booking_holds',
        'booking_hold_nights','inventory_days','sellable_offers','sellable_offer_revisions')
        AND pg_has_role(r.oid,c.relowner,'MEMBER')) AS protected_owner_member,
    has_table_privilege(current_user,'public.sellable_offers','SELECT,INSERT,UPDATE,DELETE')
      AS raw_offers_privilege,
    has_table_privilege(current_user,'public.sellable_offer_revisions','SELECT,INSERT,UPDATE,DELETE')
      AS raw_revisions_privilege,
    pg_has_role(r.oid,'pg_read_all_data'::regrole,'MEMBER') AS read_all_data,
    pg_has_role(r.oid,'pg_write_all_data'::regrole,'MEMBER') AS write_all_data,
    has_table_privilege(current_user,'public.stays_quotes','SELECT,INSERT') AS quote_access,
    has_function_privilege(current_user,'public.stays_current_accepted_offer(uuid,int)','EXECUTE')
      AS offer_capability
    FROM pg_roles r
    WHERE r.rolname=current_user`);
  const r=rows[0];
  if(!r||!r.rolcanlogin||r.rolsuper||r.rolbypassrls||r.rolcreatedb||
    r.rolcreaterole||r.rolreplication||r.schema_create||r.database_create||
    r.protected_owner_member||r.raw_offers_privilege||r.raw_revisions_privilege||
    r.read_all_data||r.write_all_data||!r.quote_access||!r.offer_capability)
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
