import fs from 'fs';

const path = 'server.ts';
let content = fs.readFileSync(path, 'utf8');

// The escrow release API should properly transition the state.
// We must honor the FSM. 
// If it is in 'escrow', it must go to 'ASSET_PREP', then 'META_API_PUSH'.
// Let's replace the single transition with sequential transitions if needed, but ONLY valid ones.

const regex = /\/\/ Transition to META_API_PUSH directly from approved \(do not go through ASSET_PREP\)[\s\S]*?await transitionCampaignState\(\{ campaignId: campaign_id, to: 'META_API_PUSH', reason: 'Escrow released, dispatching to Meta', actorType: 'admin', client: releaseClient \}\);/g;

const replacement = `// Advance through FSM correctly to reach META_API_PUSH
    if (campaign.status === 'escrow') {
        await transitionCampaignState({ campaignId: campaign_id, to: 'ASSET_PREP', reason: 'Escrow released', actorType: 'admin', client: releaseClient });
        await transitionCampaignState({ campaignId: campaign_id, to: 'META_API_PUSH', reason: 'Async dispatch started', actorType: 'system', client: releaseClient });
    } else if (campaign.status === 'approved') {
        await transitionCampaignState({ campaignId: campaign_id, to: 'META_API_PUSH', reason: 'Escrow released, dispatching to Meta', actorType: 'admin', client: releaseClient });
    } else if (campaign.status === 'ASSET_PREP') {
        await transitionCampaignState({ campaignId: campaign_id, to: 'META_API_PUSH', reason: 'Async dispatch started', actorType: 'system', client: releaseClient });
    }`;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content);
console.log("Fixed FSM");
