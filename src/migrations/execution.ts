import type pg from 'pg';
import {z} from 'zod';
import {createHash} from 'node:crypto';

const entrySchema=z.object({file:z.string().regex(/^\d{3}_[a-z0-9_]+\.sql$/),sql:z.string().min(1),checksum:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type MigrationEntry=z.infer<typeof entrySchema>;
export interface MigrationResult {file:string;status:'applied'|'skipped'|'failed'|'unknown';error?:string}
export class MigrationExecutionError extends Error{
 constructor(readonly code:string,readonly file?:string){super(`${code}${file?`: ${file}`:''}`);this.name='MigrationExecutionError';}
}
export const migrationLockId=82749102;

/** Remove lexical bodies before checking top-level transaction escapes. SQL
 * functions contain BEGIN/COMMIT words inside dollar strings, not runner DDL. */
export function migrationStatementSurface(sql:string):string{
 let result='',i=0;
 while(i<sql.length){
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end;result+=' ';continue;}
  if(sql.startsWith('/*',i)){
   let depth=1;i+=2;
   while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}
   if(depth)throw new MigrationExecutionError('MIGRATION_SQL_UNTERMINATED');result+=' ';continue;
  }
  if(sql[i]==="'"||sql[i]==='"'){
   const escaped=sql[i]==="'"&&/(?:^|[^A-Za-z0-9_$])[eE]$/.test(sql.slice(0,i));
   const quote=sql[i++];let closed=false;
   while(i<sql.length){if(sql[i]===quote){if(sql[i+1]===quote){i+=2;continue;}i++;closed=true;break;}if(escaped&&sql[i]==='\\')i++;i++;}
   if(!closed)throw new MigrationExecutionError('MIGRATION_SQL_UNTERMINATED');result+=' ';continue;
  }
  const dollar=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
  if(dollar){const end=sql.indexOf(dollar,i+dollar.length);if(end<0)throw new MigrationExecutionError('MIGRATION_SQL_UNTERMINATED');i=end+dollar.length;result+=' ';continue;}
  result+=sql[i++];
 }
 return result;
}

export function validateMigrationEntries(raw:unknown):MigrationEntry[]{
 const parsed=z.array(entrySchema).min(1).safeParse(raw);
 if(!parsed.success)throw new MigrationExecutionError('MIGRATION_MANIFEST_INVALID');
 const entries=parsed.data;
 if(new Set(entries.map(row=>row.file.slice(0,3))).size!==entries.length||entries.some((row,i)=>i>0&&row.file<=entries[i-1].file))throw new MigrationExecutionError('MIGRATION_ORDER_INVALID');
 for(const row of entries){
  if(createHash('sha256').update(row.sql,'utf8').digest('hex')!==row.checksum)throw new MigrationExecutionError('MIGRATION_MANIFEST_CHECKSUM_INVALID',row.file);
  const surface=migrationStatementSurface(row.sql);
  if(/^\s*--\s*NON-TRANSACTIONAL\b/im.test(row.sql)||/\bCONCURRENTLY\b/i.test(surface)
    ||/(?:^|;)\s*(?:BEGIN\b|COMMIT\b|ROLLBACK\b|END\b|ABORT\b|START\s+TRANSACTION\b|PREPARE\s+TRANSACTION\b)/i.test(surface))throw new MigrationExecutionError('MIGRATION_TRANSACTION_CONTRACT_INVALID',row.file);
 }
 return entries;
}

/** Library callers provide the exact manifest. The CLI always loads all packaged
 * migrations. No automatic baseline adoption or checksum repair is performed. */
export async function executeMigrations(pool:Pick<pg.Pool,'connect'>,rawEntries:unknown,options:{lockTimeoutMs?:number}={}):Promise<MigrationResult[]>{
 const entries=validateMigrationEntries(rawEntries);
 const timeout=z.number().int().min(1).max(60000).parse(options.lockTimeoutMs??15000);
 const client=await pool.connect().catch(()=>{throw new MigrationExecutionError('MIGRATION_CONNECTION_FAILED');});
 const results:MigrationResult[]=[];let locked=false,discard=false;
 try{
  const deadline=Date.now()+timeout;
  do{
   locked=(await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock($1) AS locked',[migrationLockId])).rows[0]?.locked===true;
   if(locked)break;
   if(Date.now()>=deadline)throw new MigrationExecutionError('MIGRATION_LOCK_TIMEOUT');
   await new Promise(resolve=>setTimeout(resolve,Math.min(100,Math.max(1,deadline-Date.now()))));
  }while(!locked);
  await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations(version VARCHAR(255) PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,checksum VARCHAR(64))');
  const checksumColumn=(await client.query("SELECT 1 FROM pg_attribute WHERE attrelid='public.schema_migrations'::regclass AND attname='checksum' AND NOT attisdropped")).rowCount===1;
  if(!checksumColumn)await client.query('ALTER TABLE public.schema_migrations ADD COLUMN checksum VARCHAR(64)');
  const history=(await client.query<{version:string;checksum:string|null}>('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
  const expected=new Map(entries.map(entry=>[entry.file,entry]));
  for(const row of history){
   const entry=expected.get(row.version);
   if(!entry)throw new MigrationExecutionError('MIGRATION_HISTORY_UNKNOWN');
   if(!row.checksum||row.checksum!==entry.checksum)throw new MigrationExecutionError('MIGRATION_CHECKSUM_MISMATCH',entry.file);
  }
  const applied=new Set(history.map(row=>row.version));let missing=false;
  for(const entry of entries){
   if(!applied.has(entry.file))missing=true;
   else if(missing)throw new MigrationExecutionError('MIGRATION_HISTORY_OUT_OF_ORDER',entry.file);
  }
  for(const entry of entries){
   if(applied.has(entry.file)){results.push({file:entry.file,status:'skipped'});continue;}
   let committing=false;
   try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='5min'");
    await client.query('SELECT pg_advisory_xact_lock($1)',[migrationLockId]);
    await client.query(entry.sql);
    await client.query('INSERT INTO public.schema_migrations(version,checksum) VALUES($1,$2)',[entry.file,entry.checksum]);
    committing=true;await client.query('COMMIT');results.push({file:entry.file,status:'applied'});
   }catch(error){
    try{await client.query('ROLLBACK');}catch{discard=true;}
    const sqlState=z.object({code:z.string().regex(/^[A-Z0-9]{5}$/)}).safeParse(error);
    if(committing)discard=true;
    results.push({file:entry.file,status:committing?'unknown':'failed',error:committing?'MIGRATION_COMMIT_UNKNOWN':`MIGRATION_STATEMENT_FAILED${sqlState.success?`_${sqlState.data.code}`:''}`});
    break;
   }
  }
  return results;
 }catch(error){
  if(error instanceof MigrationExecutionError)throw error;
  throw new MigrationExecutionError('MIGRATION_STORE_UNAVAILABLE');
 }finally{
  if(locked&&!discard){try{const result=await client.query<{unlocked:boolean}>('SELECT pg_advisory_unlock($1) AS unlocked',[migrationLockId]);if(!result.rows[0]?.unlocked)discard=true;}catch{discard=true;}}
  // Discard an uncertain connection instead of returning a held session lock or
  // unknown transaction to the pool. Closing it releases its server lock.
  client.release(discard);
 }
}
