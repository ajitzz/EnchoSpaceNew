import type pg from 'pg';
import { inTransaction } from './database.js';
import { MarketingError, type Actor } from './domain.js';

/** Fixed-window budgets shared across API replicas; caller provides persisted actor identity. */
export async function consumeMarketingRequestBudget(pool: pg.Pool, actor: Actor, scope: 'TARGETING' | 'CAMPAIGN_GUIDANCE' | 'FACT_SNAPSHOT' | 'KEYWORD_RESEARCH') {
  const allowed = await inTransaction(pool, actor, async client => {
    await client.query("DELETE FROM marketing_request_limits WHERE host_id=$1 AND bucket<now()-interval '2 days'", [actor.id]);
    const result = await client.query(`INSERT INTO marketing_request_limits(host_id,scope,bucket,attempts)
      VALUES($1,$2,date_trunc($3::text,clock_timestamp()),1)
      ON CONFLICT(host_id,scope,bucket) DO UPDATE SET attempts=marketing_request_limits.attempts+1
      WHERE marketing_request_limits.attempts<$4 RETURNING attempts`, [actor.id, scope, ['CAMPAIGN_GUIDANCE','KEYWORD_RESEARCH'].includes(scope) ? 'hour' : 'minute', scope === 'CAMPAIGN_GUIDANCE' ? 5 : scope==='KEYWORD_RESEARCH'?30:scope==='FACT_SNAPSHOT'?10:60]);
    return result.rowCount === 1;
  });
  if (!allowed) throw new MarketingError('MARKETING_REQUEST_LIMIT', scope==='KEYWORD_RESEARCH'?'Keyword research is temporarily limited. Cached results remain available later.':scope==='FACT_SNAPSHOT'?'Property evidence capture is temporarily limited. Try again in a minute.':scope === 'TARGETING' ? 'Location lookup is temporarily limited. Try again in a minute.' : 'You have used this hour’s five campaign guidance requests. You can continue editing your draft.', 429);
}
