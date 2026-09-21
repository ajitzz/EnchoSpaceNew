import type pg from 'pg';
import {inTransaction} from '../database.js';
import {MarketingError,fingerprint,type Actor,type CampaignDraft} from '../domain.js';
import {AdtechStrategyRegistry,requireAdtechAdmin} from './registry.js';
import {FeederCorridorResolver} from './corridors.js';
import {ADTECH_COMPILER_HASH,canonicalPriceEvidence,resolvePriceTier,strategySchema,strategySelectionSchema,validateGeography,type ResolvedCampaignStrategy,type StrategySelection} from './contracts.js';
import {assertStrategyCapabilities} from './capabilities.js';

export function validateBoundStrategy(input:unknown,provider:'META'|'GOOGLE'):ResolvedCampaignStrategy {
 const strategy=strategySchema.parse(input);const {snapshotHash,...content}=strategy;
 if(strategy.provider!==provider||strategy.compilerContractHash!==ADTECH_COMPILER_HASH||fingerprint(content)!==snapshotHash)
  throw new MarketingError('STRATEGY_BINDING_INVALID','The approved strategy does not match this compiler or provider.',409);
 validateGeography(strategy.geography,provider);assertStrategyCapabilities(strategy.profile,provider);return strategy;
}

/** The host controls references and bounded radii, never an executable profile. */
export class CampaignStrategyBindings {
 readonly registry:AdtechStrategyRegistry;readonly corridors:FeederCorridorResolver;
 constructor(readonly pool:pg.Pool,readonly serviceActor:Actor,readonly required=false){this.registry=new AdtechStrategyRegistry(pool);this.corridors=new FeederCorridorResolver(pool);}
 private async authority<T>(c:pg.PoolClient,work:()=>Promise<T>):Promise<T>{
  await requireAdtechAdmin(c,this.serviceActor);
  const before=(await c.query("SELECT current_setting('app.current_user_id',true) AS actor,current_setting('app.marketing_admin',true) AS admin")).rows[0];
  await c.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.marketing_admin','true',true)",[String(this.serviceActor.id)]);
  // Any failure escapes to the enclosing transaction rollback, including its local role settings.
  const result=await work();
  await c.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.marketing_admin',$2,true)",[before.actor??'',before.admin??'false']);
  return result;
 }
 private async resolve(c:pg.PoolClient,listingId:number,hostId:number,provider:'META'|'GOOGLE',selection?:StrategySelection){
  // Ownership and canonical price are read before elevation. No private location is projected.
  const row=(await c.query('SELECT id,user_id,city,price::text,currency,rental_mode,publication_status FROM listings WHERE id=$1 AND user_id=$2 FOR SHARE',[listingId,hostId])).rows[0];
  if(!row||row.publication_status!=='published')throw new MarketingError('LISTING_NOT_AVAILABLE','Choose your published property.',404);
  const price=canonicalPriceEvidence(row);
  return this.authority(c,async()=>{
   const versions=await this.registry.current(c);const {profile}=resolvePriceTier(price,versions.map(v=>v.config));
   assertStrategyCapabilities(profile,provider);
   const version=versions.find(v=>v.config.tier===profile.tier)!;
   const corridor=await this.corridors.resolve(c,row.city,profile.tier,provider);
   if(selection&&(selection.releaseId!==version.release_id||selection.profileVersionId!==version.version_id||selection.corridorVersionId!==corridor.id||selection.priceHash!==price.sourceHash))
    throw new MarketingError('STRATEGY_DEFAULTS_CHANGED','The price or strategy changed. Reload the audience defaults before saving.',409);
   const overrides=selection?.overrides??[];const limits=profile.hostOverrides;
   if(overrides.length&&!limits.enabled||new Set(overrides.map(o=>o.evidenceHash)).size!==overrides.length)
    throw new MarketingError('TARGETING_OVERRIDE_INVALID','Audience adjustments are unavailable or duplicated.',422);
   const allowed=selection?.feederHashes;
   if(allowed&&(!limits.enabled||new Set(allowed).size!==allowed.length||allowed.some(h=>!corridor.geography.some((g:ResolvedCampaignStrategy['geography'][number])=>g.kind!=='PROVIDER_REGION_EXCLUSION'&&g.evidenceHash===h))))throw new MarketingError('TARGETING_OVERRIDE_INVALID','Use distinct approved feeders and retain at least one.',422);
   const geography=corridor.geography.filter((g:ResolvedCampaignStrategy['geography'][number])=>!allowed||g.kind==='PROVIDER_REGION_EXCLUSION'||allowed.includes(g.evidenceHash)).map((g:ResolvedCampaignStrategy['geography'][number])=>{
    const override=overrides.find(o=>o.evidenceHash===g.evidenceHash);if(!override)return g;
    if(g.kind==='PROVIDER_REGION_EXCLUSION'||override.radiusKm<limits.minRadiusKm||override.radiusKm>limits.maxRadiusKm)
     throw new MarketingError('TARGETING_OVERRIDE_INVALID','District exclusions are locked and radius adjustments must remain within the released limits.',422);
    return {...g,radiusKm:override.radiusKm};
   });
   if(overrides.some(o=>!geography.some((g:ResolvedCampaignStrategy['geography'][number])=>g.evidenceHash===o.evidenceHash))||geography.filter((g:ResolvedCampaignStrategy['geography'][number])=>g.kind!=='PROVIDER_REGION_EXCLUSION').length>limits.maxFeeders)
    throw new MarketingError('TARGETING_OVERRIDE_INVALID','Use only the approved feeder locations.',422);
   const content={version:1 as const,provider,releaseId:version.release_id,profileVersionId:version.version_id,corridorVersionId:corridor.id,price,profile,geography,compilerContract:'ADTECH_V1' as const,compilerContractHash:ADTECH_COMPILER_HASH,hostOverrides:overrides};
   return validateBoundStrategy({...content,snapshotHash:fingerprint(content)},provider);
  });
 }
 async defaults(actor:Actor,listingId:number,provider:'META'|'GOOGLE'){
  return inTransaction(this.pool,actor,async c=>{
   const strategy=await this.resolve(c,listingId,actor.id,provider);
   return {provider,tier:strategy.profile.tier,price:strategy.price,budget:strategy.profile.budget,limits:strategy.profile.hostOverrides,
    ...(provider==='GOOGLE'?{google:{geoMode:strategy.profile.google.geoMode,matchTypes:strategy.profile.google.matchTypes},keywordResearchLocations:strategy.geography.flatMap(g=>g.kind==='PROVIDER_CITY_RADIUS'?[{evidenceHash:g.evidenceHash,geoTargetConstant:g.providerKey}]:[])}:{}),
    selection:{releaseId:strategy.releaseId,profileVersionId:strategy.profileVersionId,corridorVersionId:strategy.corridorVersionId,priceHash:strategy.price.sourceHash,overrides:[]},
    // These are public feeder coordinates, never the stay's coordinates or provider identifiers.
    geography:strategy.geography.map(g=>g.kind==='PROVIDER_REGION_EXCLUSION'?{kind:g.kind,label:g.label,evidenceHash:g.evidenceHash}:{kind:g.kind,label:g.label,evidenceHash:g.evidenceHash,latitude:g.latitude,longitude:g.longitude,radiusKm:g.radiusKm}),
    assumptions:['Budget and acquisition-cost ranges are planning hypotheses, not guaranteed results.']};
  });
 }
 async bind(c:pg.PoolClient,row:{campaign_id:number;revision:number;host_id:number;listing_id:number;provider:'META'|'GOOGLE';draft:CampaignDraft}){
  if(!row.draft.strategySelection){if(this.required)throw new MarketingError('STRATEGY_REQUIRED','Load this property’s audience defaults before saving.',422);return;}
  const selection=strategySelectionSchema.parse(row.draft.strategySelection);
  const snapshot=await this.resolve(c,row.listing_id,row.host_id,row.provider,selection);
  if(row.provider==='GOOGLE'&&row.draft.googleSearch?.keywords.some(k=>!snapshot.profile.google.matchTypes.includes(k.matchType)))throw new MarketingError('KEYWORD_MATCH_UNSUPPORTED','Use the match types allowed by this strategy.',422);
  await this.authority(c,()=>c.query(`INSERT INTO marketing_campaign_strategy_bindings(campaign_id,revision,host_id,release_id,profile_version_id,corridor_version_id,snapshot,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[row.campaign_id,row.revision,row.host_id,snapshot.releaseId,snapshot.profileVersionId,snapshot.corridorVersionId,JSON.stringify(snapshot),snapshot.snapshotHash]));
 }
 async load(c:pg.PoolClient,row:{campaign_id:number;revision:number;listing_id:number;provider:'META'|'GOOGLE';draft:CampaignDraft}){
  if(!row.draft.strategySelection)return null;
  const record=(await c.query('SELECT snapshot FROM marketing_campaign_strategy_bindings WHERE campaign_id=$1 AND revision=$2',[row.campaign_id,row.revision])).rows[0];
  if(!record)throw new MarketingError('STRATEGY_BINDING_MISSING','This revision has no approved strategy binding.',409);
  const strategy=validateBoundStrategy(record.snapshot,row.provider);
  if(strategy.price.listingId!==row.listing_id)throw new MarketingError('STRATEGY_BINDING_INVALID','Price evidence belongs to another stay.',409);
  return strategy;
 }
 async verify(c:pg.PoolClient,row:Parameters<CampaignStrategyBindings['load']>[1]){
  const strategy=await this.load(c,row);if(!strategy)return;
  const listing=(await c.query('SELECT id,price::text,currency,rental_mode FROM listings WHERE id=$1 FOR SHARE',[row.listing_id])).rows[0];
  if(!listing||canonicalPriceEvidence(listing).sourceHash!==strategy.price.sourceHash)throw new MarketingError('STRATEGY_PRICE_CHANGED','The nightly price changed. Review a new campaign revision.',409);
 }
}
