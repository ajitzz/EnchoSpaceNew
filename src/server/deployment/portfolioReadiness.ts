import type pg from 'pg';
import {readFileSync} from 'node:fs';

const shadowTables=['marketing_campaign_search_targets','marketing_campaign_search_scopes','marketing_search_conflict_assessments','marketing_search_conflict_reviews'];
const attributionTables=['marketing_attribution_links','marketing_measurement_consents','marketing_attribution_touchpoints'];
const poolTables=['marketing_destination_pools','marketing_pool_memberships','marketing_pool_events','marketing_pool_exposures','marketing_pool_spend_claims'];
const storyTables=['marketing_spatial_stories','marketing_spatial_story_reviews'];
const sequences=['marketing_measurement_consents_sequence_seq','marketing_spatial_story_reviews_sequence_seq'];
const immutableTables=['marketing_fact_snapshots','marketing_revision_products',...shadowTables,...attributionTables,...poolTables.slice(2),...storyTables,'marketing_inquiry_attributions'];
const mutableTables=['marketing_keyword_research','marketing_keyword_customer_slots',...poolTables.slice(0,2)];
const expiringTables=['marketing_measurement_payloads'];
export const portfolioTables=[...immutableTables,...mutableTables,...expiringTables];
const admin="(current_setting('app.marketing_admin'::text, true) = 'true'::text)";
const owned=`(((host_id)::text = current_setting('app.current_user_id'::text, true)) OR ${admin})`;
// Compare the reviewed PostgreSQL expression tree spelling. Never discard boolean grouping,
// qualifiers, casts or whitespace inside literals: each can change the policy's authority.
const normalize=(value:string|null|undefined)=>(value||'').replace(/('[^']*(?:''[^']*)*')|\s+/g,(match,literal:string|undefined)=>literal??'');
const policies=[
 {table:'marketing_measurement_payloads',name:'harvo_measurement_payload_service',cmd:'ALL',using:admin,check:admin},
 {table:'marketing_fact_snapshots',name:'harvo_facts_read',cmd:'SELECT',using:owned,check:''},
 {table:'marketing_fact_snapshots',name:'harvo_facts_record',cmd:'INSERT',using:'',check:`(${owned} AND (EXISTS (SELECT 1 FROM listings WHERE ((listings.id = marketing_fact_snapshots.listing_id) AND (listings.user_id = marketing_fact_snapshots.host_id) AND (listings.publication_status = 'published'::text)))))`},
 {table:'marketing_revision_products',name:'harvo_product_read',cmd:'SELECT',using:owned,check:''},
 {table:'marketing_revision_products',name:'harvo_product_record',cmd:'INSERT',using:'',check:`(${owned} AND (EXISTS (SELECT 1 FROM marketing_fact_snapshots f WHERE ((f.id = marketing_revision_products.fact_snapshot_id) AND (f.host_id = marketing_revision_products.host_id) AND (f.listing_id = marketing_revision_products.listing_id) AND (f.fact_hash = (marketing_revision_products.contract ->> 'factHash'::text)) AND ((f.projection ->> 'canonicalPath'::text) = (marketing_revision_products.contract ->> 'canonicalPath'::text))))) AND (EXISTS (SELECT 1 FROM marketing_campaign_revisions r WHERE ((r.campaign_id = marketing_revision_products.campaign_id) AND (r.revision = marketing_revision_products.revision) AND (r.host_id = marketing_revision_products.host_id) AND ((r.listing_snapshot -> 'marketingProduct'::text) = marketing_revision_products.contract)))))`},
 {table:'marketing_keyword_research',name:'harvo_research_read',cmd:'SELECT',using:owned,check:''},
 {table:'marketing_keyword_research',name:'harvo_research_write',cmd:'ALL',using:admin,check:admin},
 {table:'marketing_keyword_customer_slots',name:'harvo_research_slot_service',cmd:'ALL',using:admin,check:admin},
 ...shadowTables.map(table=>({table,name:'harvo_shadow_admin',cmd:'ALL',using:admin,check:admin})),
 ...attributionTables.map(table=>({table,name:'harvo_attribution_service',cmd:'ALL',using:admin,check:admin})),
 ...poolTables.map(table=>({table,name:'harvo_pool_service',cmd:'ALL',using:admin,check:admin})),
 ...poolTables.slice(1).map(table=>({table,name:'harvo_pool_host_read',cmd:'SELECT',using:"((host_id)::text = current_setting('app.current_user_id'::text, true))",check:''})),
 {table:'marketing_destination_pools',name:'harvo_pool_member_read',cmd:'SELECT',using:"(EXISTS (SELECT 1 FROM marketing_pool_memberships m WHERE ((m.pool_id = marketing_destination_pools.id) AND ((m.host_id)::text = current_setting('app.current_user_id'::text, true)))))",check:''},
 ...storyTables.map(table=>({table,name:'harvo_story_read',cmd:'SELECT',using:owned,check:''})),
 ...storyTables.map(table=>({table,name:'harvo_story_admin',cmd:'INSERT',using:'',check:admin})),
 {table:'marketing_spatial_stories',name:'harvo_story_capture',cmd:'INSERT',using:'',check:"(((host_id)::text = current_setting('app.current_user_id'::text, true)) AND (EXISTS (SELECT 1 FROM listings WHERE ((listings.id = marketing_spatial_stories.listing_id) AND (listings.user_id = marketing_spatial_stories.host_id) AND (listings.publication_status = 'published'::text)))) AND ((manifest ->> 'hostId'::text) = (host_id)::text) AND ((manifest ->> 'listingId'::text) = (listing_id)::text))"},
 {table:'marketing_inquiry_attributions',name:'harvo_inquiry_service',cmd:'ALL',using:admin,check:admin},
 {table:'marketing_inquiry_attributions',name:'harvo_inquiry_owner',cmd:'SELECT',using:"((host_id)::text = current_setting('app.current_user_id'::text, true))",check:''},
];

/** Deployment evidence, not authority to install grants or migrations. Reads catalog metadata only. */
export async function verifyPortfolioCatalog(c:pg.PoolClient){
 // The production legacy column is pg_catalog.varchar; isolated/new schemas use text.
 // PostgreSQL deparses its safe varchar-to-text comparison with an explicit cast.
 // Accept that exact schema-bound spelling only, never erase arbitrary policy casts/grouping.
 const statusType=(await c.query(`SELECT t.typname,n.nspname FROM pg_attribute a
  JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE a.attrelid=to_regclass('public.listings') AND a.attname='publication_status' AND NOT a.attisdropped`)).rows[0];
 const statusTypeValid=statusType?.nspname==='pg_catalog'&&['text','varchar'].includes(statusType.typname);
 const expectedCheck=(check:string)=>statusType?.typname==='varchar'
  ?check.replaceAll("(listings.publication_status = 'published'::text)","((listings.publication_status)::text = 'published'::text)") :check;
 const rows=(await c.query("SELECT tablename,policyname,permissive,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",[portfolioTables])).rows;
 const policyValid=statusTypeValid&&rows.length===policies.length&&policies.every(expected=>rows.some(row=>row.tablename===expected.table&&row.policyname===expected.name&&row.permissive==='PERMISSIVE'&&JSON.stringify(row.roles)==='["public"]'&&row.cmd===expected.cmd&&normalize(row.qual)===normalize(expected.using)&&normalize(row.with_check)===normalize(expectedCheck(expected.check))));
 const grants=(await c.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'USAGE') AS owns,
  has_table_privilege(current_user,c.oid,'SELECT') AS can_read,has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
  has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
  has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE acl.grantee=0) AS public_grant
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[portfolioTables])).rows;
 const sequenceRows=(await c.query(`SELECT c.relname,has_sequence_privilege(current_user,c.oid,'USAGE') AS usage,has_sequence_privilege(current_user,c.oid,'UPDATE') AS update,pg_has_role(current_user,c.relowner,'USAGE') AS owns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND c.relname=ANY($1::text[])`,[sequences])).rows;
 const isOwner=grants.some(g=>g.owns);
 const privileges=sequenceRows.length===sequences.length&&sequenceRows.every(s=>s.usage&&(isOwner||(!s.update&&!s.owns)))&&grants.length===portfolioTables.length&&grants.every(g=>g.relrowsecurity&&g.relforcerowsecurity&&(isOwner||!g.owns)&&g.can_read&&g.can_insert&&(isOwner||(!g.can_truncate&&!g.can_trigger&&!g.public_grant&&(g.can_update===mutableTables.includes(g.relname))&&(g.can_delete===(g.relname==='marketing_keyword_research'||expiringTables.includes(g.relname))))));
 const triggers=(await c.query(`SELECT c.relname,t.tgenabled,t.tgtype,t.tgqual IS NULL AS unconditional,p.proname,p.prosrc,p.prosecdef,p.proconfig,n.nspname AS function_schema
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
  JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE cn.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal`,[immutableTables])).rows;
 const sql=readFileSync(new URL('../../migrations/010_harvo_marketing_workflow.sql',import.meta.url),'utf8');
 const body=sql.match(/FUNCTION harvo_reject_evidence_mutation\([^]*?AS \$\$([^]*?)\$\$/i)?.[1]?.trim();
 const immutable=!!body&&triggers.length===immutableTables.length&&immutableTables.every(table=>triggers.some(t=>t.relname===table&&['O','A'].includes(t.tgenabled)&&t.tgtype===27&&t.unconditional===true&&t.proname==='harvo_reject_evidence_mutation'&&t.function_schema==='public'&&t.prosecdef===false&&t.proconfig===null&&t.prosrc.trim()===body));
 return {ready:policyValid&&privileges&&immutable,policyValid,privileges,immutable};
}
