import type pg from 'pg';
import {z} from 'zod';
import {inTransaction} from '../database.js';
import {MarketingError,fingerprint,type Actor} from '../domain.js';
import {adtechMutation,requireAdtechAdmin} from './registry.js';
import {geoRequestSchema,type GeoResolverPort,MetaGeoResolver,GoogleGeoResolver} from './geography.js';
import {geographyEvidenceSchema,reasonSchema,tierCodeSchema,validateGeography} from './contracts.js';

const createSchema=z.object({destinationKey:z.string().min(2).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),name:z.string().trim().min(2).max(160),districtName:z.string().trim().min(2).max(160),aliases:z.array(z.string().trim().min(2).max(160)).max(20),reason:reasonSchema}).strict();
export const corridorVersionSchema=z.object({tier:tierCodeSchema,provider:z.enum(['META','GOOGLE']),expectedVersion:z.number().int().min(0),entries:z.array(geoRequestSchema).min(2).max(40),reason:reasonSchema}).strict();
export class FeederCorridorResolver {
 constructor(readonly pool:pg.Pool,readonly adapters:Record<'META'|'GOOGLE',GeoResolverPort>={META:new MetaGeoResolver(),GOOGLE:new GoogleGeoResolver()}){}
 async list(actor:Actor){return inTransaction(this.pool,actor,async c=>{
  await requireAdtechAdmin(c,actor);
  return {corridors:(await c.query('SELECT * FROM marketing_destination_corridors ORDER BY id LIMIT 200')).rows,
   versions:(await c.query('SELECT * FROM marketing_destination_corridor_versions ORDER BY id DESC LIMIT 200')).rows,
   published:(await c.query('SELECT * FROM marketing_corridor_current_versions ORDER BY corridor_id,tier_code,provider LIMIT 1200')).rows};
 });}
 async search(actor:Actor,provider:'META'|'GOOGLE',query:string,kind:'CITY'|'DISTRICT'){
  await inTransaction(this.pool,actor,c=>requireAdtechAdmin(c,actor));
  return this.adapters[provider].search(query,kind);
 }
 async create(actor:Actor,input:unknown,key:string){const body=createSchema.parse(input);return adtechMutation(this.pool,actor,key,'CREATE_CORRIDOR',body,async c=>{
  const row=(await c.query('INSERT INTO marketing_destination_corridors(destination_key,name,district_name,country,aliases) VALUES($1,$2,$3,$4,$5) RETURNING *',[body.destinationKey,body.name,body.districtName,'IN',JSON.stringify(body.aliases)])).rows[0];
  return {entityType:'CORRIDOR',entityId:row.id,before:null,after:row,reason:body.reason,result:row};
 });}
 async save(actor:Actor,id:number,input:unknown,key:string){
  const body=corridorVersionSchema.parse(input);
  const preliminary=await inTransaction(this.pool,actor,async c=>{
   await requireAdtechAdmin(c,actor);
   const prior=(await c.query('SELECT request_hash,result FROM marketing_adtech_strategy_audits WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
   if(prior){if(prior.request_hash!==fingerprint({operation:'SAVE_CORRIDOR',input:{id,...body}}))throw new MarketingError('IDEMPOTENCY_CONFLICT','Request key already used for another change.',409);return {prior:prior.result};}
   const corridor=(await c.query('SELECT * FROM marketing_destination_corridors WHERE id=$1',[id])).rows[0];
   if(!corridor)throw new MarketingError('CORRIDOR_NOT_FOUND','Destination not found.',404);return {corridor};
  });
  if(preliminary.prior)return preliminary.prior;
  // All network operations precede the short, serialized database transaction.
  const geography:import('./contracts.js').StrategyGeographyEvidence[]=[];
  for(const entry of body.entries)geography.push(geographyEvidenceSchema.parse(await this.adapters[body.provider].resolve(entry,preliminary.corridor.district_name)));
  validateGeography(geography,body.provider);
  return adtechMutation(this.pool,actor,key,'SAVE_CORRIDOR',{id,...body},async c=>{
   await c.query('SELECT pg_advisory_xact_lock(82749105,$1)',[id]);
   const previous=(await c.query('SELECT * FROM marketing_destination_corridor_versions WHERE corridor_id=$1 AND tier_code=$2 AND provider=$3 ORDER BY version DESC LIMIT 1',[id,body.tier,body.provider])).rows[0];
   if((previous?.version??0)!==body.expectedVersion)throw new MarketingError('STRATEGY_VERSION_CONFLICT','The corridor changed. Reload its latest version.',409);
   for(const entry of geography)await c.query('INSERT INTO marketing_corridor_geography_evidence(id,provider,evidence,verified_at,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[entry.evidenceHash,entry.provider,JSON.stringify(entry),entry.verifiedAt,actor.id]);
   const row=(await c.query('INSERT INTO marketing_destination_corridor_versions(corridor_id,tier_code,provider,version,geography,snapshot_hash,created_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id,body.tier,body.provider,body.expectedVersion+1,JSON.stringify(geography),fingerprint(geography),actor.id,body.reason])).rows[0];
   return {entityType:'CORRIDOR',entityId:id,before:previous??null,after:row,reason:body.reason,result:row};
  });
 }
 async publish(actor:Actor,id:number,input:unknown,key:string){
  const body=z.object({versionId:z.number().int().positive().safe(),expectedVersionId:z.number().int().positive().safe().nullable(),reason:reasonSchema}).strict().parse(input);
  return adtechMutation(this.pool,actor,key,'PUBLISH_CORRIDOR',{id,...body},async c=>{
   await c.query('SELECT pg_advisory_xact_lock(82749105,$1)',[id]);
   const version=(await c.query('SELECT * FROM marketing_destination_corridor_versions WHERE id=$1 AND corridor_id=$2',[body.versionId,id])).rows[0];
   if(!version)throw new MarketingError('CORRIDOR_NOT_FOUND','This version does not belong to the destination.',404);
   const previous=(await c.query('SELECT version_id FROM marketing_corridor_current_versions WHERE corridor_id=$1 AND tier_code=$2 AND provider=$3',[id,version.tier_code,version.provider])).rows[0];
   if((previous?.version_id??null)!==body.expectedVersionId)throw new MarketingError('STRATEGY_VERSION_CONFLICT','Published corridor changed. Reload before publishing.',409);
   validateGeography(version.geography.map((e:unknown)=>geographyEvidenceSchema.parse(e)),version.provider);
   await c.query('INSERT INTO marketing_corridor_current_versions(corridor_id,tier_code,provider,version_id) VALUES($1,$2,$3,$4) ON CONFLICT(corridor_id,tier_code,provider) DO UPDATE SET version_id=EXCLUDED.version_id',[id,version.tier_code,version.provider,version.id]);
   return {entityType:'CORRIDOR',entityId:id,before:previous??null,after:{versionId:version.id},reason:body.reason,result:{versionId:version.id}};
  });
 }
 async resolve(c:pg.PoolClient,city:string,tier:string,provider:string){
  const rows=(await c.query(`SELECT v.*,d.destination_key,d.name,d.district_name FROM marketing_destination_corridors d JOIN marketing_corridor_current_versions p ON p.corridor_id=d.id JOIN marketing_destination_corridor_versions v ON v.id=p.version_id
    WHERE p.tier_code=$2 AND p.provider=$3 AND (lower(d.name)=lower($1) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.aliases)a WHERE lower(a)=lower($1))) LIMIT 2`,[city,tier,provider])).rows;
  if(rows.length!==1)throw new MarketingError('EXCLUSION_UNRESOLVED','An approved feeder corridor and exact destination district are required. Encho can prepare this destination for review.',422);
  const row=rows[0];validateGeography(row.geography.map((e:unknown)=>geographyEvidenceSchema.parse(e)),provider as 'META'|'GOOGLE');return row;
 }
}
