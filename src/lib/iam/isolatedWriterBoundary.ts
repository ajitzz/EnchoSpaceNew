import type pg from 'pg';
import {reachableRuntimeRolesSql,verifyRuntimeDatabaseAuthority} from '../../server/deployment/runtimeDatabaseAuthority.js';

export const factorWriterFunctions=[
 'internal_iam_begin_passkey(text,uuid,text,uuid,text,text,text)',
 'internal_iam_read_passkey_ceremony(text,uuid,text)',
 'internal_iam_record_passkey(text,uuid,jsonb,text,text)',
] as const;
export const invitationWriterFunctions=['internal_iam_accept_invitation(text,text,jsonb,text,text)'] as const;

/** Fixed server-owned allowlists only. NOINHERIT is not an isolation boundary:
 * a LOGIN can SET ROLE into a reachable grant even when it cannot use it yet. */
export async function isIsolatedWorkforceWriter(client:pg.PoolClient,functions:typeof factorWriterFunctions|typeof invitationWriterFunctions):Promise<boolean>{
 if(!(await verifyRuntimeDatabaseAuthority(client)).safe)return false;
 const row=(await client.query<{safe:boolean}>(`${reachableRuntimeRolesSql}
 SELECT session_user=current_user
 AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN reachable r
   WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND
   (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN reachable r
   WHERE n.nspname='public' AND c.relkind='S' AND has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE'))
 AND NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN reachable r
   WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND has_function_privilege(r.oid,p.oid,'EXECUTE')
   AND p.oid<>ALL($1::regprocedure[]))
 AND NOT EXISTS(SELECT 1 FROM unnest($1::regprocedure[]) allowed WHERE NOT has_function_privilege(current_user,allowed,'EXECUTE')) AS safe`,[functions])).rows[0];
 return row?.safe===true;
}
