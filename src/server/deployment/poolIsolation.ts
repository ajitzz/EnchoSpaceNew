import type pg from 'pg';

export interface DatabaseRequestContext { userId?: number | string | null; isRequest?: boolean; bypassRls?: boolean }
const settings = "SELECT set_config('app.current_user_id',$1,true),set_config('app.bypass_rls',$2,true),set_config('app.marketing_admin',$2,true)";

/**
 * Every checked-out client gets an explicit context, including anonymous callers.
 * Autocommit queries use short transactions; caller-owned transactions keep their
 * boundaries. Context is transaction-local, including on transaction poolers.
 * Failed/uncertain writes are never automatically replayed.
 */
export function installPoolIsolation(pool: pg.Pool, context: () => DatabaseRequestContext | undefined) {
  const connect = pool.connect.bind(pool);
  async function acquire() {
    const scope = context();
    const actor = scope?.isRequest && /^[1-9]\d*$/.test(String(scope.userId)) && Number.isSafeInteger(Number(scope.userId)) ? String(scope.userId) : '';
    const privileged = actor !== '' && scope?.bypassRls === true;
    const client = await connect();
    const rawQuery = client.query.bind(client), rawRelease = client.release.bind(client);
    let transaction = false, released = false;
    let chain: Promise<unknown> = Promise.resolve();
    const query = (...args: unknown[]) => {
      const callback = typeof args.at(-1) === 'function' ? args.pop() as (error: unknown, result?: unknown) => void : undefined;
      const work = async () => {
        const text = typeof args[0] === 'string' ? args[0] : (args[0] as pg.QueryConfig)?.text;
        if (typeof text !== 'string') throw new Error('A SQL string or query configuration is required.');
        const native = () => (rawQuery as (...parameters: unknown[]) => Promise<unknown>)(...args);
        if (/^\s*(?:BEGIN|START\s+TRANSACTION)\b/i.test(text)) {
          if (transaction) throw new Error('Nested database transactions are not supported.');
          const result = await native(); transaction = true;
          await rawQuery(settings, [actor, String(privileged)]); return result;
        }
        if (/^\s*(?:COMMIT|END|ROLLBACK)(?:\s*;?\s*)$/i.test(text)) {
          const result = await native(); transaction = false; return result;
        }
        if (transaction) return native();
        try {
          await rawQuery('BEGIN');
          await rawQuery(settings, [actor, String(privileged)]);
          const result = await native(); await rawQuery('COMMIT'); return result;
        } catch (error) {
          try { await rawQuery('ROLLBACK'); } catch { released = true; rawRelease(true); }
          throw error;
        }
      };
      const operation = released ? Promise.reject(new Error('Database client already released.')) : chain.then(work);
      chain = operation.catch(() => undefined);
      if (callback) { void operation.then(result => callback(null, result), error => callback(error)); return; }
      return operation;
    };
    const release = (error?: Error | boolean) => {
      if (released) return;
      released = true;
      // Do not return a client to the pool before all queued work and rollback finish.
      void chain.then(async () => {
        if (error) { rawRelease(error); return; }
        try { await rawQuery('ROLLBACK'); rawRelease(); }
        catch { rawRelease(true); }
      });
    };
    return new Proxy(client, { get(target,key) {
      if (key === 'query') return query;
      if (key === 'release') return release;
      const value = Reflect.get(target,key,target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  pool.connect = ((callback?: (error: Error | undefined, client?: pg.PoolClient, done?: (error?: Error | boolean) => void) => void) => {
    const result = acquire();
    if (callback) { void result.then(client => callback(undefined,client,client.release),error => callback(error)); return; }
    return result;
  }) as pg.Pool['connect'];
}
