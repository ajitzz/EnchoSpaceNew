import {actorPool} from '../../lib/marketing/database.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {readMarketingConfig} from '../../lib/marketing/config.js';
import {marketingReadiness} from '../../lib/marketing/readiness.js';
import {MarketingFinanceService} from '../../lib/marketing/financeService.js';
import {fingerprint} from '../../lib/marketing/financeQuote.js';

// Explicit environment file only; importing this command does not run the app or migrations.
const args=process.argv.slice(2);const command=args.shift();
if(!['check','register-policy'].includes(command||''))throw new Error('Use check [--database] [--env-file path] or register-policy --env-file path');
const envIndex=args.indexOf('--env-file');if(envIndex>=0){const file=args[envIndex+1];if(!file)throw new Error('An environment file path is required');for(const [key,value] of Object.entries(parse(readFileSync(file))))if(process.env[key]===undefined)process.env[key]=value;args.splice(envIndex,2);}
if(args.some(arg=>arg!=='--database'))throw new Error('Unsupported operator argument');
let pool:pg.Pool|undefined;
try{
 const config=readMarketingConfig();
 if(command==='check')console.log(JSON.stringify({evidence:'LOCAL_CONFIGURATION_PRESENCE_ONLY',checks:marketingReadiness(config,process.env)},null,2));
 if(args.includes('--database')||command==='register-policy'){
  const raw=process.env.DATABASE_URL?.trim();if(!raw||/dummy|placeholder|example\.com/i.test(raw))throw new Error('DATABASE_URL must identify the intended environment');
  const url=new URL(raw);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('PostgreSQL URL required');
  pool=new pg.Pool({connectionString:raw,max:1,connectionTimeoutMillis:5000,statement_timeout:8000});
  const actor=(await pool.query('SELECT role FROM users WHERE id=$1',[config.policyAdminId])).rows[0];if(actor?.role!=='admin')throw new Error('Configured service actor is not an existing administrator');
  if(command==='register-policy'){
   if(!config.financialPolicy)throw new Error('An actual reviewed cost policy is required');
   const stored=await new MarketingFinanceService(pool,{actorContext:{id:config.policyAdminId!,role:'admin'}}).persistPolicy(config.financialPolicy,config.policyAdminId!);
   console.log(JSON.stringify({event:'HARVO_POLICY_REGISTERED',version:stored.version,fingerprint:fingerprint(stored)}));
  }else{
   const migrations=['009_harvo_marketing_finance.sql','010_harvo_marketing_workflow.sql','011_harvo_marketing_measurement.sql','012_harvo_marketing_settlement.sql','013_harvo_marketing_conversion_delivery.sql','014_harvo_marketing_request_limits.sql','015_harvo_marketing_creative_review.sql','016_harvo_google_invoice_imports.sql'];
   const results=[];
   for(const name of migrations){let local:string;try{local=createHash('sha256').update(readFileSync(new URL(`../../migrations/${name}`,import.meta.url))).digest('hex');}catch{throw new Error(`Expected migration is unavailable: ${name}`);}const row=(await pool.query('SELECT checksum FROM schema_migrations WHERE version=$1',[name])).rows[0];results.push({migration:name,status:!row?'MISSING':row.checksum===local?'MATCHED':'CHECKSUM_MISMATCH'});}
   const jobs=(await actorPool(pool,{id:config.policyAdminId!,role:'system'}).query("SELECT kind,state,count(*)::int AS count FROM marketing_jobs GROUP BY kind,state ORDER BY kind,state")).rows;
   const role=(await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
   console.log(JSON.stringify({evidence:'READ_ONLY_DATABASE_CHECK',migrations:results,jobs,applicationRoleBypassesRls:!!(role?.rolsuper||role?.rolbypassrls)},null,2));
   if(results.some(r=>r.status!=='MATCHED')||role?.rolsuper||role?.rolbypassrls)process.exitCode=1;
  }
 }
}catch(error){console.error(JSON.stringify({event:'HARVO_OPERATOR_CHECK_FAILED',code:(error as any)?.code||'CONFIGURATION_OR_DATABASE_CHECK_FAILED'}));process.exitCode=1;}finally{await pool?.end();}
