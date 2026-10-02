import type pg from 'pg';
import {verifyRuntimeDatabaseAuthority} from '../deployment/runtimeDatabaseAuthority.js';

export type ConsumerAuthOperation = 'READ' | 'ENROLL' | 'GOOGLE_LINK';

const requiredColumns = ['id', 'email', 'password_hash', 'name', 'role', 'google_id', 'phone'];
const selectedColumns: Record<ConsumerAuthOperation, string[]> = {
  READ: ['id', 'email', 'name', 'role', 'password_hash', 'phone'],
  ENROLL: ['id', 'email', 'name', 'role', 'phone'],
  GOOGLE_LINK: ['id', 'email', 'name', 'role', 'google_id'],
};
const insertedColumns: Record<ConsumerAuthOperation, string[]> = {
  READ: [],
  ENROLL: ['email', 'password_hash', 'name', 'role', 'phone'],
  GOOGLE_LINK: ['email', 'name', 'google_id', 'role'],
};

/** Only the consumer identity contract is checked here. Marketing readiness is separate. */
export async function consumerAuthReadiness(pool: pg.Pool, operation: ConsumerAuthOperation): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='3000ms'");
    const authority = await verifyRuntimeDatabaseAuthority(client);
    const table = (await client.query(`
      SELECT c.oid, c.relkind,
        has_schema_privilege(current_user,n.oid,'USAGE') AS schema_usage
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='users'`)).rows[0];
    let ready = authority.safe && !!table && ['r', 'p'].includes(table.relkind) &&
      table.schema_usage === true;
    if (ready) {
      const columns = (await client.query(`
        SELECT attname,
          has_column_privilege(current_user,attrelid,attnum,'SELECT') AS can_select,
          has_column_privilege(current_user,attrelid,attnum,'INSERT') AS can_insert,
          has_column_privilege(current_user,attrelid,attnum,'UPDATE') AS can_update
        FROM pg_attribute
        WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped`, [table.oid])).rows;
      const byName = new Map(columns.map(row => [row.attname, row]));
      ready = requiredColumns.every(name => byName.has(name)) &&
        selectedColumns[operation].every(name => byName.get(name)?.can_select === true) &&
        insertedColumns[operation].every(name => byName.get(name)?.can_insert === true) &&
        (operation !== 'GOOGLE_LINK' || byName.get('google_id')?.can_update === true);
    }
    if (ready && operation !== 'READ') {
      // Legacy users.id is SERIAL. A restricted role needs sequence USAGE for
      // INSERT without receiving ownership or schema CREATE authority.
      const sequence = (await client.query(`
        SELECT a.attidentity,
          pg_get_serial_sequence('public.users','id') AS sequence_name
        FROM pg_attribute a WHERE a.attrelid=$1::oid AND a.attname='id'`, [table.oid])).rows[0];
      if (!sequence || (!sequence.attidentity && !sequence.sequence_name)) ready = false;
      else if (!sequence.attidentity) {
        ready = (await client.query(
          "SELECT has_sequence_privilege(current_user,$1::text,'USAGE') AS allowed",
          [sequence.sequence_name])).rows[0]?.allowed === true;
      }
    }
    await client.query('COMMIT');
    return ready;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
