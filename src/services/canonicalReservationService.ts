import type pg from 'pg';
import {z} from 'zod';
import {setStaysPrincipal} from '../server/stays/runtime.js';

const command=z.object({holdId:z.string().uuid(),quoteId:z.string().uuid(),commandId:z.string().uuid()}).strict();
export type FinalizeDirectHoldCommand=z.infer<typeof command>;
export type FinalizedReservation={reservationId:string;replayed:boolean;status:'INVENTORY_COMMITTED'};

const knownCodes=new Set([
  'RESERVATION_INPUT_INVALID','RESERVATION_COMMAND_CONFLICT','RESERVATION_HOLD_NOT_FOUND',
  'RESERVATION_FORBIDDEN','RESERVATION_HOLD_NOT_ACTIVE','RESERVATION_HOLD_EXPIRED',
  'RESERVATION_QUOTE_MISMATCH','RESERVATION_AUTHORITY_MISMATCH',
  'RESERVATION_NIGHTS_INCOMPLETE','RESERVATION_NIGHT_AUTHORITY_INVALID',
  'RESERVATION_HOLD_STATE_CHANGED',
]);
export class ReservationAuthorityError extends Error {
  constructor(readonly code:string,readonly cause?:unknown){super(code);this.name='ReservationAuthorityError';}
}

/** Dedicated internal login; no Guest/web role has raw canonical-reservation DML. */
export async function assertReservationWorkerRole(pool:pg.Pool):Promise<void>{
  const {rows}=await pool.query(`SELECT current_user AS role_name,r.rolcanlogin,r.rolsuper,
    r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    has_table_privilege(current_user,'public.canonical_reservations','SELECT,INSERT,UPDATE,DELETE') AS raw_reservations,
    has_table_privilege(current_user,'public.canonical_reservation_nights','SELECT,INSERT,UPDATE,DELETE') AS raw_nights,
    has_table_privilege(current_user,'public.canonical_reservation_commands','SELECT,INSERT,UPDATE,DELETE') AS raw_commands,
    has_table_privilege(current_user,'public.booking_holds','INSERT,UPDATE,DELETE') AS raw_holds,
    has_table_privilege(current_user,'public.inventory_days','INSERT,UPDATE,DELETE') AS raw_inventory,
    has_table_privilege(current_user,'public.stays_quotes','INSERT,UPDATE,DELETE') AS raw_quotes,
    has_table_privilege(current_user,'public.sellable_offers','SELECT,INSERT,UPDATE,DELETE') AS raw_offers,
    has_table_privilege(current_user,'public.sellable_offer_revisions','SELECT,INSERT,UPDATE,DELETE') AS raw_revisions,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_reservations',
        'canonical_reservation_nights','canonical_reservation_commands','booking_holds',
        'booking_hold_nights','inventory_days','stays_quotes','sellable_offers','sellable_offer_revisions')
        AND pg_has_role(r.oid,c.relowner,'MEMBER')) AS protected_owner_member,
    pg_has_role(r.oid,'pg_read_all_data'::regrole,'MEMBER') AS read_all_data,
    pg_has_role(r.oid,'pg_write_all_data'::regrole,'MEMBER') AS write_all_data,
    has_function_privilege(current_user,'public.canonical_finalize_direct_hold(uuid,uuid,uuid)','EXECUTE') AS finalizer
    FROM pg_roles r WHERE r.rolname=current_user`);
  const r=rows[0];
  if(!r||r.role_name!=='encho_reservation_worker'||!r.rolcanlogin||r.rolsuper||r.rolbypassrls||
    r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.schema_create||r.database_create||
    r.raw_reservations||r.raw_nights||r.raw_commands||r.raw_holds||r.raw_inventory||
    r.raw_quotes||r.raw_offers||r.raw_revisions||r.protected_owner_member||
    r.read_all_data||r.write_all_data||!r.finalizer)
    throw new ReservationAuthorityError('RESERVATION_ROLE_NOT_RESTRICTED');
}

/** Internal only. The database function is the sole reservation writer and
 * atomically turns every held night into one booked allocation. */
export async function finalizeDirectHold(pool:pg.Pool,holderPrincipal:string,
  rawCommand:unknown):Promise<FinalizedReservation>{
  const parsed=command.safeParse(rawCommand);
  if(!parsed.success)throw new ReservationAuthorityError('RESERVATION_INPUT_INVALID');
  await assertReservationWorkerRole(pool);
  const client=await pool.connect();
  let committing=false;
  try{
    await client.query('BEGIN');
    await setStaysPrincipal(client,holderPrincipal);
    const {rows}=await client.query<{reservation_id:string;replayed:boolean}>(
      'SELECT * FROM canonical_finalize_direct_hold($1::uuid,$2::uuid,$3::uuid)',
      [parsed.data.holdId,parsed.data.quoteId,parsed.data.commandId]);
    if(rows.length!==1)throw new ReservationAuthorityError('RESERVATION_AUTHORITY_UNAVAILABLE');
    committing=true;
    await client.query('COMMIT');
    return {reservationId:rows[0].reservation_id,replayed:rows[0].replayed,
      status:'INVENTORY_COMMITTED'};
  }catch(error){
    try{await client.query('ROLLBACK');}catch{/* Preserve the original failure. */}
    if(committing)throw new ReservationAuthorityError('RESERVATION_OUTCOME_UNKNOWN',error);
    if(error instanceof ReservationAuthorityError)throw error;
    const message=error instanceof Error?error.message:'';
    throw new ReservationAuthorityError(knownCodes.has(message)?message:'RESERVATION_AUTHORITY_UNAVAILABLE',error);
  }finally{client.release();}
}
