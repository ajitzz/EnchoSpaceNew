// HARVO read-only source inventory. Never imports or executes application code.
// Run from the project root: node docs/harvo/build_inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const root = process.cwd();
if (!fs.existsSync(path.join(root, 'docs/ENCHO_ENGINEERING_CONSTITUTION.md'))) {
  throw new Error('Run from the Encho project root.');
}
const output = path.join(root, 'docs/harvo');
const skipDirs = new Set(['node_modules', '.git', 'dist', 'dist-ssr', '.next', '.sites-runtime', 'test-results', 'playwright-report', 'blob-report', 'uploads', 'migrated_prompt_history']);
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs']);
const readableExtensions = new Set([...codeExtensions, '.sql', '.md', '.css', '.html', '.py', '.sh']);
const entryNames = new Set(['server.ts', 'worker.ts', 'App.tsx', 'index.tsx', 'types.ts', 'index.css', 'index.html']);
const files = [];
const runtime = p => entryNames.has(p) || /^(src\/(lib|services|migrations)\/|components\/|hooks\/|lib\/|api\/)/.test(p);
function category(p) {
  if (/^(src\/test[s]?\/|e2e\/)/.test(p) || /(^|\/)test[_-]/.test(p)) return 'test-or-diagnostic';
  if (p.startsWith('docs/') || p.endsWith('.md')) return 'documentation';
  if (runtime(p)) return p.startsWith('src/migrations/') ? 'migration' : 'application';
  if (/^(scratch|scripts|workspace)\//.test(p) || /\.(cjs|py|sh)$/.test(p)) return 'maintenance-or-diagnostic';
  return 'configuration-or-other';
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name), rel = path.relative(root, abs).split(path.sep).join('/');
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (!skipDirs.has(e.name) && rel !== 'docs/harvo') walk(abs); continue; }
    if (e.name.startsWith('.env') || /(?:^|[._-])(secret|credential|token)(?:[._-]|$)/i.test(e.name) || ['tk.txt', 'schema_dump.json', 'package-lock.json', 'bun.lock'].includes(e.name)) continue;
    if (!readableExtensions.has(path.extname(e.name)) && !['package.json','tsconfig.json','tsconfig.server.json','vercel.json','Dockerfile','Dockerfile.worker','.gitignore'].includes(e.name)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
    const record = { path: rel, category: category(rel), lines, sha256: crypto.createHash('sha256').update(text).digest('hex'), reviewLevel: 'structural-index-only', imports: [], symbols: [], routes: [], tables: [], flags: [] };
    if (codeExtensions.has(path.extname(rel))) {
      const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
      const line = n => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;
      const snippet = n => n?.getText(source).slice(0,160);
      function visit(n) {
        if (ts.isImportDeclaration(n)) record.imports.push({ source: n.moduleSpecifier.text, line: line(n) });
        if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) {
          record.symbols.push({ name: snippet(n.name), kind: ts.SyntaxKind[n.kind], start: line(n), end: source.getLineAndCharacterOfPosition(n.end).line + 1 });
        }
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(source) === 'app' && ['get','post','put','patch','delete'].includes(n.expression.name.text)) {
          const arg = n.arguments[0];
          const paths = ts.isArrayLiteralExpression(arg) ? arg.elements.map(snippet) : [snippet(arg)];
          if (paths.some(p => p?.includes('/'))) record.routes.push({ method:n.expression.name.text.toUpperCase(), paths, start:line(n), end:source.getLineAndCharacterOfPosition(n.end).line + 1, middleware:n.arguments.slice(1,-1).map(snippet) });
        }
        ts.forEachChild(n, visit);
      }
      visit(source);
      record.syntaxDiagnosticCount = source.parseDiagnostics.length;
    }
    const patterns = { typecheck_disabled:/@ts-nocheck/, stock_photo_reference:/images\.unsplash\.com/, runtime_ddl:/\b(?:CREATE TABLE|ALTER TABLE)\b/i, random_value:/Math\.random\(/, browser_storage:/localStorage|sessionStorage/, sql_select_star:/SELECT\s+\*/i };
    for (const [flag,re] of Object.entries(patterns)) {
      const at=[]; text.split('\n').forEach((s,i)=>{ if (re.test(s)) at.push(i+1); });
      if(at.length) record.flags.push({flag,lines:at});
    }
    for(const m of text.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-zA-Z_][a-zA-Z_0-9]*)/gi)) record.tables.push({name:m[1],line:text.slice(0,m.index).split('\n').length});
    files.push(record);
  }
}
walk(root);
const totals={files:files.length,lines:files.reduce((n,f)=>n+f.lines,0),categories:{}};
for(const f of files){ const c=totals.categories[f.category] ||= {files:0,lines:0}; c.files++;c.lines+=f.lines; }
const routes=files.flatMap(f=>f.routes.map(r=>({file:f.path,...r})));
const duplicateRoutes=[];
const routeGroups=new Map();
for(const r of routes) for(const p of r.paths){const key=r.method+' '+p;const group=routeGroups.get(key)||[];group.push(r);routeGroups.set(key,group);}
for(const [key,rs] of routeGroups)if(rs.length>1)duplicateRoutes.push({key,locations:rs.map(r=>r.file+':'+r.start)});
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'SOURCE_INVENTORY.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),root,scope:'Selected first-party text files; structural indexing is not semantic line-by-line review. Excludes dependencies, outputs, secrets, historical chat and raw dumps/logs. All flags require contextual review.',totals,duplicateRoutes,files},null,2)+'\n');
const md=['# HARVO — Source inventory','', 'Structural coverage only. File hashes identify this local source snapshot; they do not certify correctness. See HARVO.md and REVIEW_COVERAGE.md for the actual review limits.','',`Indexed ${totals.files} files / ${totals.lines} lines. Dependencies, generated output, environment/secret files, raw logs/dumps, and historical chat are excluded.`, '', '| Area | Files | Lines |','|---|---:|---:|',...Object.entries(totals.categories).map(([k,v])=>`| ${k} | ${v.files} | ${v.lines} |`),'','## File register','','| File | Lines | Category | SHA-256 prefix |','|---|---:|---|---|',...files.map(f=>`| [${f.path}](../../${f.path}) | ${f.lines} | ${f.category} | ${f.sha256.slice(0,16)} |`)];
fs.writeFileSync(path.join(output,'SOURCE_INVENTORY.md'),md.join('\n')+'\n');
const rm=['# HARVO — Express route map','','Extracted from syntax trees without importing the server. Middleware lists show inline middleware only; presence or absence alone does not establish effective authorization. `app.get` setting lookups are excluded. Arrays and duplicate registrations are retained.','','| Method | Route | Source | Inline middleware |','|---|---|---|---|',...routes.map(r=>`| ${r.method} | ${r.paths.join(', ').replaceAll('|','\\|')} | [${r.file}:${r.start}](../../${r.file}#L${r.start}) | ${r.middleware.join(', ')} |`),'','## Duplicate registrations','',...duplicateRoutes.map(d=>`- ${d.key}: ${d.locations.join(', ')}`)];
fs.writeFileSync(path.join(output,'API_MAP.md'),rm.join('\n')+'\n');
console.log(JSON.stringify({totals,routeRegistrations:routes.length,duplicateRoutes},null,2));
