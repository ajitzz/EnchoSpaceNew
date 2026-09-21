import type pg from 'pg';
import {verifyMigrationHistory,verifyRecoveryCatalog} from './recoveryReadiness.js';
import {verifyPortfolioCatalog,portfolioTables} from './portfolioReadiness.js';
import {adtechTables,verifyAdtechCatalog} from './adtechReadiness.js';

export const requiredForcedRlsTables=[...adtechTables,...portfolioTables.filter(name=>!['marketing_campaign_search_targets','marketing_campaign_search_scopes','marketing_search_conflict_assessments','marketing_search_conflict_reviews','marketing_revision_products','marketing_fact_snapshots','marketing_keyword_research','marketing_keyword_customer_slots'].includes(name)),'marketing_campaign_search_targets','marketing_campaign_search_scopes','marketing_search_conflict_assessments','marketing_search_conflict_reviews','marketing_revision_products','marketing_fact_snapshots','marketing_keyword_research','marketing_keyword_customer_slots','marketing_pause_recovery_attempts','marketing_pause_recoveries','marketing_jobs','marketing_ai_attempts','marketing_commercial_preferences','calendar_operations','host_outreach_leads','marketing_campaign_workflows','marketing_finance_accounts','marketing_finance_quotes','marketing_finance_reservations','marketing_finance_journals','marketing_finance_lines','marketing_settlement_documents','marketing_settlement_proposals','marketing_settlement_reviews','marketing_settlement_allocations','marketing_conversion_deliveries','marketing_conversion_delivery_events','marketing_request_limits','marketing_creative_derivatives','marketing_creative_events','marketing_google_invoice_imports'];
export const requiredRuntimeTables=['room_types','room_calendar_blocks','bookings','users','listings','host_marketing_campaigns','provider_entities','provider_publishing_transactions','inventory_days','booking_holds','booking_hold_nights','marketing_jobs','marketing_campaign_workflows','marketing_finance_accounts','marketing_finance_quotes','marketing_finance_captures','marketing_finance_reservations','marketing_finance_journals','marketing_finance_lines',...requiredForcedRlsTables.filter(name=>!['marketing_jobs','marketing_campaign_workflows','marketing_finance_accounts','marketing_finance_quotes','marketing_finance_reservations','marketing_finance_journals','marketing_finance_lines'].includes(name))];
/** Read-only structural readiness. No customer rows, DDL, provider calls or credential output. */
export async function databaseReadiness(pool:pg.Pool){
 const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='3000ms'");
  const role=(await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  const rows=(await c.query("SELECT name,to_regclass('public.'||quote_ident(name)) IS NOT NULL AS present FROM unnest($1::text[]) AS name",[requiredRuntimeTables])).rows;
  const missing=rows.filter(r=>!r.present).map(r=>r.name);
  const rls=(await c.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[requiredForcedRlsTables])).rows;
  const forcedRls=rls.length===requiredForcedRlsTables.length&&rls.every(r=>r.relrowsecurity&&r.relforcerowsecurity);
  const migrationsValid=await verifyMigrationHistory(c);
  const recovery=await verifyRecoveryCatalog(c);
  const portfolio=await verifyPortfolioCatalog(c);
  const adtech=await verifyAdtechCatalog(c);
  await c.query('COMMIT');return {ready:role?.rolsuper===false&&role?.rolbypassrls===false&&!missing.length&&forcedRls&&migrationsValid&&recovery.ready&&portfolio.ready&&adtech.ready,missing,roleBypassesRls:!!(role?.rolsuper||role?.rolbypassrls),forcedRls,migrationsValid,recovery,portfolio,adtech};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
