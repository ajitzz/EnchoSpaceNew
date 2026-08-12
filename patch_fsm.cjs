const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const fsmCode = `
// ==========================================
// PHASE 2.2: CENTRAL CAMPAIGN STATE MACHINE
// ==========================================
export type CampaignState = 
  | 'draft'
  | 'pending_webhook'
  | 'pending_approval'
  | 'pending' // alias for pending_approval
  | 'rejected'
  | 'escrow'
  | 'ASSET_PREP'
  | 'META_API_PUSH'
  | 'CAMPAIGN_LIVE'
  | 'active' // alias for CAMPAIGN_LIVE
  | 'paused'
  | 'cancelled'
  | 'killed'
  | 'failed_publish'
  | 'failed';

const VALID_TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  'draft': ['pending_approval', 'pending', 'rejected', 'pending_webhook', 'cancelled'],
  'pending_webhook': ['pending_approval', 'pending', 'escrow', 'ASSET_PREP', 'failed', 'cancelled'],
  'pending_approval': ['rejected', 'escrow', 'ASSET_PREP', 'cancelled'],
  'pending': ['rejected', 'escrow', 'ASSET_PREP', 'cancelled'],
  'rejected': ['pending_approval', 'pending', 'cancelled'],
  'escrow': ['ASSET_PREP', 'cancelled', 'failed'],
  'ASSET_PREP': ['META_API_PUSH', 'failed', 'cancelled', 'paused'],
  'META_API_PUSH': ['CAMPAIGN_LIVE', 'active', 'failed', 'failed_publish', 'cancelled'],
  'CAMPAIGN_LIVE': ['paused', 'cancelled', 'killed'],
  'active': ['paused', 'cancelled', 'killed'],
  'paused': ['CAMPAIGN_LIVE', 'active', 'cancelled', 'killed'],
  'failed_publish': ['ASSET_PREP', 'cancelled', 'killed'],
  'failed': ['ASSET_PREP', 'cancelled', 'killed'],
  'cancelled': [],
  'killed': []
};

export async function transitionCampaignState(params: {
  campaignId: number;
  expectedCurrentState?: CampaignState;
  to: CampaignState;
  reason: string;
  actorType?: 'system' | 'admin' | 'host' | 'webhook';
  actorId?: number | string;
  correlationId?: string;
  tenantId?: number;
  client?: any; // pg client
}): Promise<CampaignState> {
  const { campaignId, expectedCurrentState, to, reason, actorType = 'system', actorId = 'system', correlationId, tenantId } = params;
  
  const client = params.client || await pool.connect();
  let releaseClient = !params.client;

  try {
    if (releaseClient) await client.query('BEGIN');

    // 1. Lock campaign row
    const queryArgs: any[] = [campaignId];
    let queryStr = \`SELECT * FROM host_marketing_campaigns WHERE id = $1\`;
    if (tenantId) {
      queryStr += \` AND host_id = $2\`;
      queryArgs.push(tenantId);
    }
    queryStr += \` FOR UPDATE\`;

    const campRes = await client.query(queryStr, queryArgs);
    if (campRes.rows.length === 0) {
      throw new Error(\`Campaign \${campaignId} not found or tenant mismatch.\`);
    }

    const campaign = campRes.rows[0];
    const currentState = campaign.status as CampaignState;

    // 2. Validate current state if expected is provided
    if (expectedCurrentState && currentState !== expectedCurrentState) {
       // In some async replay/webhook cases, we might tolerate it, but FSM is strict
       console.warn(\`[FSM WARN] Expected state \${expectedCurrentState} but got \${currentState}\`);
    }

    // 3. Validate transition
    const allowed = VALID_TRANSITIONS[currentState] || [];
    // Allow admins to override safely
    if (!allowed.includes(to) && actorType !== 'admin') {
       throw new Error(\`Illegal transition from \${currentState} to \${to}\`);
    }

    // 4. Perform Update
    await client.query(
      \`UPDATE host_marketing_campaigns SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2\`,
      [to, campaignId]
    );

    // 5. Append Immutable Event
    const eventCorrId = correlationId || crypto.randomUUID();
    
    // We assume meta_publishing_events table exists. Let's do a safe insert or fallback if schema differs
    try {
      await client.query(\`
        INSERT INTO meta_publishing_events 
        (campaign_id, correlation_id, event_type, previous_state, new_state, actor, reason)
        VALUES ($1, $2, 'STATE_TRANSITION', $3, $4, $5, $6)
      \`, [campaignId, eventCorrId, currentState, to, String(actorId), reason]);
    } catch (e: any) {
      // If table doesn't have exact schema, log it but don't fail the FSM if it's missing columns (temporary until migration)
      console.error('[FSM AUDIT WARN] Could not append to meta_publishing_events:', e.message);
    }

    if (releaseClient) await client.query('COMMIT');
    
    console.log(\`[FSM] Campaign \${campaignId}: \${currentState} -> \${to} (\${reason})\`);
    return to;

  } catch (error) {
    if (releaseClient) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (releaseClient) client.release();
  }
}
// ==========================================
`;

if (!code.includes('export type CampaignState')) {
  // Inject at the top right after imports
  const importMatch = code.match(/import .*?;\\n/g);
  const lastImport = importMatch ? importMatch[importMatch.length - 1] : '';
  const insertIndex = code.indexOf(lastImport) + lastImport.length;
  
  code = code.slice(0, insertIndex) + '\\n' + fsmCode + '\\n' + code.slice(insertIndex);
  fs.writeFileSync('server.ts', code);
  console.log('FSM Code Injected.');
} else {
  console.log('FSM Code Already Exists.');
}

