#!/usr/bin/env node
/** Read-only structural validator; no server import, environment loading, or DB connection. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventoryFile = 'docs/implementation/CR1_P0_ROUTE_SCHEMA_INVENTORY.md';
const sources = new Map([
  ['server.ts', ''],
  ['src/server/calendar.ts', ''],
  ['src/server/marketing/router.ts', '/api/marketing/v2'],
  ['src/server/marketing/adtechRoutes.ts', '/api/marketing/v2/admin/adtech'],
  ['src/server/marketing/measurementRouter.ts', '/api/marketing/measurement'],
  ['src/server/operations/router.ts', '/api/operations/v1'],
  ['src/server/operations/sessionRouter.ts', '/api/operations/v1/session'],
  ['src/server/conversations/router.ts', '/api'],
  ['src/server/conversations/serviceRouter.ts', new Map([
    ['createParticipantServiceRouter', '/api/conversations/v1'],
    ['createStaffServiceRouter', '/api/operations/v1/service'],
  ])],
]);
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const walkFiles = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walkFiles(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const unwrap = node => ts.isAsExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
const visit = (node, callback) => { callback(node); ts.forEachChild(node, child => visit(child, callback)); };
const lineOf = (source, position) => source.getLineAndCharacterOfPosition(position).line + 1;
const routeSignature = row => JSON.stringify([row.file, row.method, row.paths]);

function values(node, environment = new Map()) {
  node = unwrap(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(element => values(element, environment));
  if (ts.isIdentifier(node) && environment.has(node.text)) return environment.get(node.text);
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.reduce((prefixes, span) => prefixes.flatMap(prefix =>
      values(span.expression, environment).map(value => prefix + value + span.literal.text)), [node.head.text]);
  }
  throw new Error(`Unresolved dynamic route expression: ${node.getText()}`);
}

export function scanRoutes(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const routes = [];
  visit(source, node => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || !ts.isIdentifier(node.expression.expression)
      || !['app', 'router'].includes(node.expression.expression.text)
      || !methods.has(node.expression.name.text)) return;
    // app.get('io') reads an Express setting and never declares a route.
    if (node.arguments.length === 1 && node.expression.name.text === 'get') return;
    if (!sources.has(file)) throw new Error(`Uninventoried Express route owner: ${file}`);
    const environment = new Map();
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isForOfStatement(parent) && ts.isVariableDeclarationList(parent.initializer)) {
        const declaration = parent.initializer.declarations[0];
        if (!ts.isIdentifier(declaration.name)) throw new Error('Unsupported destructured route loop');
        environment.set(declaration.name.text, values(parent.expression));
      }
    }
    // Multiple factories in one module may be mounted under different trust
    // boundaries. Resolve the lexical factory rather than assigning a file-wide
    // prefix that would mislabel staff routes as participant routes.
    const registration = sources.get(file);
    let prefix = registration;
    if (registration instanceof Map) {
      prefix = undefined;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isFunctionDeclaration(parent) && parent.name && registration.has(parent.name.text)) {
          prefix = registration.get(parent.name.text); break;
        }
      }
      if (prefix === undefined) throw new Error(`Uninventoried route factory: ${file}:${lineOf(source, node.getStart(source))}`);
    }
    const paths = values(node.arguments[0], environment).map(value => `${prefix}${value}`);
    if (paths.some(value => !value.startsWith('/') && !value.startsWith('*'))) {
      throw new Error(`Non-path Express registration requires explicit disposition: ${file}:${lineOf(source, node.pos)}`);
    }
    routes.push({ file, line: lineOf(source, node.getStart(source)), method: node.expression.name.text.toUpperCase(), paths });
  });
  return routes;
}

const createTable = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
const stripSqlComments = sql => sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, text => text.replace(/[^\n]/g, ' '));
function tableOccurrences(file, text, sql) {
  const found = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const scan = (literal, offset) => {
    for (const match of stripSqlComments(literal).matchAll(createTable)) {
      if (match[1] !== 'schema_migrations') found.push({ name: match[1], file, line: lineOf(source, offset + match.index) });
    }
  };
  if (sql) scan(text, 0);
  else {
    const scanNode = node => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        scan(node.getText(source), node.getStart(source));
        return;
      }
      ts.forEachChild(node, scanNode);
    };
    scanNode(source);
  }
  return found;
}

function mountedPrefix(file, receiver, factory) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const prefixes = [];
  visit(source, node => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || node.expression.expression.getText(source) !== receiver || node.expression.name.text !== 'use') return;
    if (node.arguments.slice(1).some(argument => ts.isCallExpression(argument)
      && ts.isIdentifier(argument.expression) && argument.expression.text === factory)) {
      prefixes.push(...values(node.arguments[0]));
    }
  });
  if (prefixes.length !== 1) throw new Error(`Expected one mounted prefix for ${factory}; found ${prefixes.length}`);
  return prefixes[0];
}

export function collectInventory() {
  const marketingPrefix = mountedPrefix('server.ts', 'app', 'createMarketingRouter');
  const expectedMounts = [
    ['src/server/marketing/router.ts', null, marketingPrefix],
    ['src/server/marketing/adtechRoutes.ts', null, marketingPrefix + mountedPrefix('src/server/marketing/router.ts', 'router', 'createAdtechAdminRouter')],
    ['src/server/marketing/measurementRouter.ts', null, mountedPrefix('server.ts', 'app', 'createMeasurementRouter')],
    ['src/server/operations/router.ts', null, mountedPrefix('server.ts', 'app', 'createOperationsRouter')],
    ['src/server/operations/sessionRouter.ts', null, mountedPrefix('server.ts', 'app', 'createWorkforceSessionRouter')],
    ['src/server/conversations/router.ts', null, mountedPrefix('server.ts', 'app', 'createConversationRouter')],
    ['src/server/conversations/serviceRouter.ts', 'createParticipantServiceRouter', mountedPrefix('server.ts', 'app', 'createParticipantServiceRouter')],
    ['src/server/conversations/serviceRouter.ts', 'createStaffServiceRouter', mountedPrefix('server.ts', 'app', 'createStaffServiceRouter')],
  ];
  for (const [file, factory, prefix] of expectedMounts) {
    const registration = sources.get(file);
    const expected = registration instanceof Map ? registration.get(factory) : registration;
    if (expected !== prefix) throw new Error(`Mounted route prefix changed: ${file}${factory ? `#${factory}` : ''} => ${prefix}`);
  }
  const productionFiles = ['server.ts', ...walkFiles('src/server').filter(file => file.endsWith('.ts'))];
  const routes = productionFiles.flatMap(file => scanRoutes(file, read(file)));
  const runtimeFiles = [...new Set([...productionFiles, ...walkFiles('src/lib').filter(file => file.endsWith('.ts'))])];
  const runtimeTables = runtimeFiles.flatMap(file => tableOccurrences(file, read(file), false));
  const migrationFiles = walkFiles('src/migrations').filter(file => file.endsWith('.sql')).sort();
  const migrationTables = migrationFiles.flatMap(file => tableOccurrences(file, read(file), true));
  const runtimeNames = new Set(runtimeTables.map(table => table.name));
  const migrationNames = new Set(migrationTables.map(table => table.name));
  const counts = {
    declarations: routes.length, expandedPaths: routes.reduce((total, row) => total + row.paths.length, 0),
    migrationFiles: migrationFiles.length, migrationTables: migrationNames.size, runtimeTables: runtimeNames.size,
    overlappingTables: [...runtimeNames].filter(name => migrationNames.has(name)).length,
    totalTables: new Set([...runtimeNames, ...migrationNames]).size,
  };
  return { routes, runtimeTables, migrationTables, migrationFiles, counts };
}

export function verifyDocumentation(inventory) {
  const text = read(inventoryFile);
  const errors = [];
  const assert = (condition, detail) => { if (!condition) errors.push(detail); };
  const section = (start, end) => text.split(start)[1]?.split(end)[0] ?? '';
  const routeRows = section('## Appendix A —', '## Appendix B —').split('\n')
    .filter(line => /^\| `(?:server\.ts|src\/server\/).*:\d+` \|/.test(line)).map(line => {
      const cells = line.split('|').map(cell => cell.trim());
      const [, file, anchor] = cells[1].match(/^`(.+):(\d+)`$/);
      return { file, line: Number(anchor), method: cells[2], paths: [...cells[3].matchAll(/`([^`]+)`/g)].map(match => match[1]),
        guard: cells[4], disposition: cells[5].replaceAll('`', '') };
    });
  const remaining = inventory.routes.slice();
  for (const row of routeRows) {
    const index = remaining.findIndex(actual => routeSignature(actual) === routeSignature(row) && actual.line === row.line);
    assert(index >= 0, `Stale/phantom route: ${row.file}:${row.line} ${row.method} ${row.paths.join(', ')}`);
    if (index >= 0) remaining.splice(index, 1);
  }
  for (const row of remaining) errors.push(`Missing route: ${row.file}:${row.line} ${row.method} ${row.paths.join(', ')}`);
  const groups = new Map();
  const guards = new Map();
  for (const row of routeRows) {
    const group = groups.get(row.disposition) ?? { declarations: 0, expandedPaths: 0 };
    group.declarations += 1; group.expandedPaths += row.paths.length; groups.set(row.disposition, group);
    guards.set(row.guard, (guards.get(row.guard) ?? 0) + 1);
  }
  const dispositionRows = section('### 3.2 Disposition classes', '### 3.3').split('\n')
    .filter(line => /^\| `[A-Z0-9_]+` \|/.test(line));
  for (const row of dispositionRows) {
    const cells = row.split('|').map(cell => cell.trim());
    const name = cells[1].replaceAll('`', ''); const group = groups.get(name);
    assert(group && group.declarations === Number(cells[3]) && group.expandedPaths === Number(cells[4]), `Stale disposition summary: ${name}`);
    groups.delete(name);
  }
  assert(groups.size === 0, 'Disposition summary has missing classes');
  const guardRows = section('### 3.3 Declared guard styles', '## 4.').split('\n')
    .filter(line => /^\| [^|]+ \| \d+ \|$/.test(line));
  for (const row of guardRows) {
    const cells = row.split('|').map(cell => cell.trim());
    assert(guards.get(cells[1]) === Number(cells[2]), `Stale declared guard summary: ${cells[1]}`);
    guards.delete(cells[1]);
  }
  assert(guards.size === 0, 'Declared guard summary has missing classes');
  const runtimeRows = section('## Appendix B —', '## Appendix C —').split('\n').filter(line => /^\| `[a-z_]+` \|/.test(line));
  const runtimeSeen = new Set();
  for (const row of runtimeRows) {
    const cells = row.split('|').map(cell => cell.trim());
    const name = cells[1].replaceAll('`', '');
    const observed = [...cells[2].matchAll(/`([^`]+):(\d+)`/g)].map(match => `${match[1]}:${match[2]}`).sort();
    const actual = inventory.runtimeTables.filter(table => table.name === name).map(table => `${table.file}:${table.line}`).sort();
    assert(JSON.stringify(observed) === JSON.stringify(actual), `Stale runtime table source: ${name}`);
    assert(!runtimeSeen.has(name), `Duplicate runtime table row: ${name}`);
    runtimeSeen.add(name);
  }
  assert(runtimeSeen.size === inventory.counts.runtimeTables, 'Runtime table ledger has missing/extra names');
  const migrationRows = section('## 8. Migration ledger', '## 9.').split('\n')
    .filter(line => /^\| `\d{3}_[^`]+\.sql` \|/.test(line));
  const migrationSeen = new Set();
  for (const row of migrationRows) {
    const cells = row.split('|').map(cell => cell.trim());
    const file = `src/migrations/${cells[1].replaceAll('`', '')}`;
    const names = [...cells[2].matchAll(/`([a-z_]+)`/g)].map(match => match[1]).sort();
    const actual = inventory.migrationTables.filter(table => table.file === file).map(table => table.name).sort();
    assert(JSON.stringify(names) === JSON.stringify(actual), `Stale migration table ledger: ${file}`);
    assert(!migrationSeen.has(file), `Duplicate migration ledger: ${file}`);
    migrationSeen.add(file);
  }
  assert(JSON.stringify([...migrationSeen].sort()) === JSON.stringify(inventory.migrationFiles), 'Migration file ledger is incomplete');
  for (const file of sources.keys()) {
    const routes = inventory.routes.filter(row => row.file === file);
    const expanded = routes.reduce((total, row) => total + row.paths.length, 0);
    assert(text.includes(`| \`${file}\` | ${routes.length} | ${expanded} |`), `Source summary is stale: ${file}`);
  }
  const marker = text.match(/<!-- CR1_INVENTORY_COUNTS (\{[^\n]+\}) -->/);
  assert(marker && JSON.stringify(JSON.parse(marker[1])) === JSON.stringify(inventory.counts), 'Machine count receipt missing or stale');
  const expected = `${inventory.counts.declarations} declarations, ${inventory.counts.expandedPaths} expanded paths`;
  assert(text.includes(`**PASS** — ${expected}`), 'Final human receipt is stale');
  if (errors.length) throw new Error(errors.join('\n'));
  return { status: 'PASS', ...inventory.counts, scope: 'source structure and ledger consistency only' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(verifyDocumentation(collectInventory()), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
