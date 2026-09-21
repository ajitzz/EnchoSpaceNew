import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {inTransaction} from '../database.js';
import {draftSchema, fingerprint, MarketingError, type Actor, type CampaignDraft} from '../domain.js';

const MAX_CANDIDATES=100,MAX_PAIRS=50;
const activeStates=['PENDING_ADMIN','APPROVED','PUBLISH_QUEUED','PROVIDER_PAUSED','PROVIDER_REVIEW','LIVE','ACTIVATION_QUEUED','RECONCILIATION_REQUIRED'];
export const normalizeSearchKeyword=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
type Row={campaign_id:number;revision:number;host_id:number;state:string;draft:CampaignDraft;provider_truth?:{externalCampaignId?:string}};
/** An administrator-only observer. No caller in publish, funding, inventory or queue authorization. */
export class SearchPortfolioConflictAnalyzer {
 constructor(private readonly pool:pg.Pool,private readonly customerId:string){
  if(!/^\d{10}$/.test(customerId))throw new Error('A configured Google serving customer is required for shadow scope.');
 }
 private async authorize(c:pg.PoolClient,actor:Actor){
  if(!['admin','system'].includes(actor.role)||(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0]?.role!=='admin')throw new MarketingError('ADMIN_REQUIRED','Current administrator access is required.',403);
 }
 private scope(row:Row){
  const draft=draftSchema.parse(row.draft),search=draft.googleSearch;
  if(draft.provider!=='GOOGLE'||!search)throw new MarketingError('SEARCH_REQUIRED','Only Google Search revisions have a search portfolio scope.',422);
  const resource=row.provider_truth?.externalCampaignId;
  const customer=resource?.match(/^customers\/(\d{10})\/campaigns\/[1-9]\d*$/)?.[1];
  if(resource&&!customer)throw new MarketingError('ACCOUNT_SCOPE_UNKNOWN','Provider account evidence is unavailable for this revision.');
  return {campaignId:row.campaign_id,revision:row.revision,hostId:row.host_id,customerId:customer??this.customerId,accountSource:customer?'PROVIDER_RESOURCE':'CONFIGURED_ACCOUNT',
   keywords:search.keywords.map(k=>({...k,normalized:normalizeSearchKeyword(k.text)})),geos:[...search.geoTargetConstants].sort(),languages:[...search.languageConstants].sort(),geoMode:search.geoMode,startDate:draft.startDate,endDate:draft.endDate};
 }
 async assess(actor:Actor,campaignId:number,revision:number){
  z.object({campaignId:z.number().int().positive().safe(),revision:z.number().int().positive().safe()}).parse({campaignId,revision});
  return inTransaction(this.pool,actor,async c=>{
   await c.query("SET LOCAL statement_timeout='1500ms'; SET LOCAL lock_timeout='150ms'");
   await this.authorize(c,actor);
   // MVCC reads only: never acquire a campaign lock or run inside its publication transaction.
   const source=(await c.query('SELECT w.*,r.draft FROM marketing_campaign_workflows w JOIN marketing_campaign_revisions r ON r.campaign_id=w.campaign_id AND r.revision=w.revision WHERE w.campaign_id=$1',[campaignId])).rows[0] as Row|undefined;
   if(!source||source.revision!==revision)throw new MarketingError('REVISION_CONFLICT','Read the current campaign revision before inspecting its portfolio.');
   const selected=this.scope(source);
   const candidateRows=(await c.query(`SELECT w.*,r.draft FROM marketing_campaign_workflows w JOIN marketing_campaign_revisions r ON r.campaign_id=w.campaign_id AND r.revision=w.revision WHERE w.provider='GOOGLE' AND w.state=ANY($1::text[]) AND w.campaign_id<>$2 ORDER BY w.campaign_id LIMIT $3`,[activeStates,campaignId,MAX_CANDIDATES+1])).rows as Row[];
   const truncated=candidateRows.length>MAX_CANDIDATES;
   const skipped:number[]=[],scopes=[selected];
   for(const row of candidateRows.slice(0,MAX_CANDIDATES)){try{scopes.push(this.scope(row));}catch(error){if(error instanceof MarketingError||error instanceof z.ZodError)skipped.push(row.campaign_id);else throw error;}}
   // Index immutable revision inputs. Provider binding is first-observation evidence, not a routing authority.
   await c.query(`INSERT INTO marketing_campaign_search_scopes(campaign_id,revision,host_id,customer_id,account_source,geo_constants,languages,geo_mode,start_date,end_date,input_hash)
    SELECT x."campaignId",x.revision,x."hostId",x."customerId",x."accountSource",x.geos,x.languages,x."geoMode",x."startDate",x."endDate",x.hash
    FROM jsonb_to_recordset($1::jsonb) AS x("campaignId" int,revision int,"hostId" int,"customerId" text,"accountSource" text,geos text[],languages text[],"geoMode" text,"startDate" date,"endDate" date,hash text) ON CONFLICT DO NOTHING`,[JSON.stringify(scopes.map(scope=>({...scope,hash:fingerprint(scope)})))]);
   await c.query(`INSERT INTO marketing_campaign_search_targets(campaign_id,revision,host_id,keyword,normalized_keyword,match_type)
    SELECT x."campaignId",x.revision,x."hostId",x.text,x.normalized,x."matchType" FROM jsonb_to_recordset($1::jsonb)
     AS x("campaignId" int,revision int,"hostId" int,text text,normalized text,"matchType" text) ON CONFLICT DO NOTHING`,
    [JSON.stringify(scopes.flatMap(scope=>scope.keywords.map(k=>({campaignId:scope.campaignId,revision:scope.revision,hostId:scope.hostId,...k}))))]);
   const candidates=new Set((await c.query(`SELECT DISTINCT t.campaign_id FROM marketing_campaign_search_targets t
    JOIN marketing_campaign_workflows w ON w.campaign_id=t.campaign_id AND w.revision=t.revision
    WHERE t.normalized_keyword=ANY($1::text[]) AND t.campaign_id=ANY($2::int[])`,[selected.keywords.map(k=>k.normalized),scopes.slice(1).map(scope=>scope.campaignId)])).rows.map(row=>row.campaign_id));
   const conflicts:Array<{campaignId:number;revision:number;sharedKeywords:string[];sharedGeoConstants:string[];sharedLanguages:string[];confidence:'SHARED_EXPLICIT_SCOPE'|'GEOGRAPHY_OR_LANGUAGE_UNRESOLVED'}>=[];
   let pairLimit=false;
   for(const other of scopes.slice(1)){
    if(!candidates.has(other.campaignId)||other.customerId!==selected.customerId||other.endDate<selected.startDate||other.startDate>selected.endDate)continue;
    const shared=[...new Set(selected.keywords.filter(k=>other.keywords.some(v=>v.normalized===k.normalized)).map(k=>k.normalized))];if(!shared.length)continue;if(shared.length>20)pairLimit=true;
    if(conflicts.length>=MAX_PAIRS){pairLimit=true;break;}
    const geos=selected.geos.filter(g=>other.geos.includes(g)),languages=selected.languages.filter(l=>other.languages.includes(l));
    conflicts.push({campaignId:other.campaignId,revision:other.revision,sharedKeywords:shared.slice(0,20),sharedGeoConstants:geos,sharedLanguages:languages,confidence:geos.length&&languages.length?'SHARED_EXPLICIT_SCOPE':'GEOGRAPHY_OR_LANGUAGE_UNRESOLVED'});
   }
   const evidence={version:1,mode:'SHADOW_ONLY',blocking:false,authority:'OBSERVATION_ONLY',conflicts,candidateCount:scopes.length-1,truncated:truncated||pairLimit,skippedCampaignIds:skipped,
    limitations:['Identical normalized terms only; close variants and semantic matches remain unmeasured.','Different geo IDs do not prove disjoint geography; ancestry and radius intersections are unresolved.','Shared scope is not proof of auction harm, CPC inflation or guaranteed delivery suppression.','Ad-account timezone and actual search-term delivery need pilot evidence.'],input:fingerprint(scopes)};
   const hash=fingerprint({evidence,scopes,states:[source,...candidateRows.slice(0,MAX_CANDIDATES)].map(row=>[row.campaign_id,row.state])});
   const saved=(await c.query(`INSERT INTO marketing_search_conflict_assessments(id,campaign_id,revision,analyzer_version,mode,input_hash,evidence,actor_id)
    VALUES($1,$2,$3,'shadow-v1','SHADOW_ONLY',$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *`,[randomUUID(),campaignId,revision,hash,JSON.stringify(evidence),actor.id])).rows[0];
   return saved??(await c.query("SELECT * FROM marketing_search_conflict_assessments WHERE campaign_id=$1 AND revision=$2 AND analyzer_version='shadow-v1' AND input_hash=$3",[campaignId,revision,hash])).rows[0];
  });
 }
 async review(actor:Actor,assessmentId:string,input:unknown,key:string){
  z.string().uuid().parse(assessmentId);
  if(!/^[a-zA-Z0-9:_-]{8,160}$/.test(key))throw new MarketingError('INVALID_INPUT','A stable review request identity is required.',422);
  const body=z.object({verdict:z.enum(['CONFIRMED_OVERLAP','FALSE_POSITIVE','INSUFFICIENT_EVIDENCE']),note:z.string().trim().min(20).max(2000),evidenceReference:z.string().trim().min(10).max(255)}).strict().parse(input);
  const hash=fingerprint({assessmentId,...body});
  return inTransaction(this.pool,actor,async c=>{
   await this.authorize(c,actor);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`portfolio-review:${actor.id}:${key}`]);
   const old=(await c.query('SELECT id,created_at,request_fingerprint FROM marketing_search_conflict_reviews WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
   if(old){if(old.request_fingerprint!==hash)throw new MarketingError('IDEMPOTENCY_CONFLICT','This review request already records different evidence.');return{id:old.id,created_at:old.created_at,idempotent:true};}
   if(!(await c.query('SELECT id FROM marketing_search_conflict_assessments WHERE id=$1',[assessmentId])).rowCount)throw new MarketingError('ASSESSMENT_NOT_FOUND','The observation receipt was not found.',404);
   const saved=(await c.query('INSERT INTO marketing_search_conflict_reviews(id,assessment_id,actor_id,request_key,request_fingerprint,verdict,note,evidence_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at',[randomUUID(),assessmentId,actor.id,key,hash,body.verdict,body.note,body.evidenceReference])).rows[0];
   return {...saved,idempotent:false};
  });
 }
}
