import {readFileSync,lstatSync} from 'node:fs';
import {parse} from 'dotenv';
import pg from 'pg';
import {stagedRehearsalConnection} from './portfolioRehearsal.js';
import {rehearseAdtechRollout} from './adtechRehearsal.js';
let pool:pg.Pool|undefined;
try{
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--env-file')throw new Error('EXPLICIT_STAGING_FILE_REQUIRED');
 const stat=lstatSync(args[1]);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('PRIVATE_STAGING_FILE_REQUIRED');
 const env=parse(readFileSync(args[1]));pool=new pg.Pool({...stagedRehearsalConnection(env),application_name:'adtech_staging_rehearsal'});
 const c=await pool.connect();try{console.log(JSON.stringify({evidence:'STAGED_REHEARSAL_NOT_DEPLOYMENT',branch:env.HARVO_STAGING_BRANCH_ID,...await rehearseAdtechRollout(c,env.HARVO_STAGING_RUNTIME_ROLE)}));}finally{c.release();}
}catch(error){
 const known=new Set(['EXPLICIT_STAGING_FILE_REQUIRED','PRIVATE_STAGING_FILE_REQUIRED','STAGING_IDENTITY_REQUIRED','DIRECT_STAGING_ENDPOINT_REQUIRED','UNEXPECTED_CONNECTION_OPTION','RUNTIME_ROLE_INVALID','ADTECH_MANIFEST_INVALID','MIGRATION_LOCK_BUSY','RUNTIME_ROLE_UNSAFE','RUNTIME_ROLE_OWNER_OR_PRIVILEGED_MEMBER','MIGRATION_HISTORY_MISSING_OR_DRIFTED','ADTECH_CATALOG_REJECTED']);
 console.error(JSON.stringify({event:'ADTECH_REHEARSAL_FAILED',reason:error instanceof Error&&known.has(error.message)?error.message:'CONFIGURATION_OR_DATABASE_FAILURE',committed:false}));process.exitCode=1;
}finally{await pool?.end();}
