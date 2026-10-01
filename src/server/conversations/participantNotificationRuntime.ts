import pg from 'pg';
import {createConversationNotificationRuntime, type ParticipantNotificationRuntime} from './notificationRuntimeAdapter.js';

/** A separate restricted participant connection is mandatory. The broad app
 * pool and queue-only notification worker role are never fallbacks. */
export function participantNotificationConnectionConfig(env: NodeJS.ProcessEnv): pg.PoolConfig | null {
  if (env.CR1_CONVERSATION_NOTIFICATIONS_ENABLED !== 'true') return null;
  const raw = env.CR1_CONVERSATION_PARTICIPANT_DATABASE_URL;
  if (!raw) throw new Error('PARTICIPANT_NOTIFICATION_CONFIGURATION_REQUIRED');
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || url.pathname.length < 2 || url.hash
      || (!local && !url.password) || (local && env.NODE_ENV === 'production')) throw new Error();
    for (const field of url.searchParams.keys()) if (!['sslmode', 'channel_binding'].includes(field)) throw new Error();
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    return {connectionString: url.toString(), ssl: local ? false : {rejectUnauthorized: true}, max: 2,
      connectionTimeoutMillis: 8000, idleTimeoutMillis: 10000, statement_timeout: 10000,
      allowExitOnIdle: true, application_name: 'encho_cr1_participant_notifications'};
  } catch { throw new Error('PARTICIPANT_NOTIFICATION_CONFIGURATION_INVALID'); }
}

export function createParticipantNotificationRuntime(env: NodeJS.ProcessEnv, reportFault: () => void):
  {port: ParticipantNotificationRuntime; close: () => Promise<void>} | null {
  let config: pg.PoolConfig | null;
  try { config = participantNotificationConnectionConfig(env); }
  catch { reportFault(); return null; }
  if (!config) return null;
  const pool = new pg.Pool(config);
  pool.on('error', reportFault);
  const port = createConversationNotificationRuntime(env, pool);
  if (!port) { void pool.end(); reportFault(); return null; }
  return {port, close: () => pool.end()};
}
