import {MarketingError} from '../domain.js';
import {validateBoundStrategy} from './bindings.js';
import type {ProviderPublishRequest} from '../../providers/types.js';

/** Provider identities retain a pointer, never a second mutable strategy authority. */
export function publishedStrategyReference(request:ProviderPublishRequest){
 if(!request.metadata?.adtechStrategy)return {};
 const strategy=validateBoundStrategy(request.metadata.adtechStrategy,request.metadata.adtechStrategy.provider);
 const revision=request.metadata.revision;
 if(!Number.isSafeInteger(revision)||revision<1||strategy.price.listingId!==request.listingId)
  throw new MarketingError('STRATEGY_BINDING_INVALID','Publishing requires the approved campaign revision and property.',409);
 return {adtechRevision:revision,adtechStrategyHash:strategy.snapshotHash};
}

export async function loadPublishedStrategy(db:{query:(sql:string,values?:unknown[])=>Promise<{rows:any[]}>},campaignId:number,provider:'META'|'GOOGLE',metadata:Record<string,unknown>){
 if(metadata.adtechRevision===undefined&&metadata.adtechStrategyHash===undefined)return null;
 if(!Number.isSafeInteger(metadata.adtechRevision)||Number(metadata.adtechRevision)<1||typeof metadata.adtechStrategyHash!=='string')
  throw new MarketingError('STRATEGY_BINDING_INVALID','Published strategy identity is incomplete. Keep the campaign paused.',409);
 const rows=(await db.query('SELECT snapshot FROM marketing_campaign_strategy_bindings WHERE campaign_id=$1 AND revision=$2',[campaignId,metadata.adtechRevision])).rows;
 if(rows.length!==1)throw new MarketingError('STRATEGY_BINDING_MISSING','The published strategy binding is unavailable. Keep the campaign paused.',409);
 const strategy=validateBoundStrategy(rows[0].snapshot,provider);
 if(strategy.snapshotHash!==metadata.adtechStrategyHash)throw new MarketingError('STRATEGY_BINDING_INVALID','Published strategy identity differs from the approved revision.',409);
 return strategy;
}
