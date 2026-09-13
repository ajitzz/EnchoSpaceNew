// Offline source diagnostic. Does not import the application or connect to any service.
// Synthetic fixtures and captured SQL are confined to this process.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sources = {};
function parse(relative) {
  const body = fs.readFileSync(path.join(root, relative), 'utf8');
  const ast = ts.createSourceFile(relative, body, ts.ScriptTarget.Latest, true);
  sources[relative] = { sha256: crypto.createHash('sha256').update(body).digest('hex') };
  return ast;
}
const serviceFile = 'src/lib/campaignControlCenterService.ts';
const service = parse(serviceFile);
const names = ['buildGeographicBreakdown', 'buildPlacementBreakdown', 'buildDemographicsBreakdown', 'buildDeviceBreakdown', 'buildFunnelMetrics', 'buildMetaCryptographicProof', 'buildPricingSyncStatus'];
const methods = [];
const locations = {};
function visit(node) {
  if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(service))) {
    const name = node.name.getText(service);
    methods.push(node.getText(service));
    locations[name] = { file: serviceFile, line: service.getLineAndCharacterOfPosition(node.getStart(service)).line + 1 };
  }
  ts.forEachChild(node, visit);
}
visit(service);
if (methods.length !== names.length) throw new Error('Expected source methods changed; re-review this diagnostic.');
const server = parse('server.ts');
const pacing = server.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'syncCampaignSpend');
if (!pacing) throw new Error('Pacing source function absent.');
locations.syncCampaignSpend = { file: 'server.ts', line: server.getLineAndCharacterOfPosition(pacing.getStart(server)).line + 1 };
const capturedQueries = [];
const fixedNow = Date.parse('2026-09-13T12:00:00.000Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}
const context = vm.createContext({
  Date: FixedDate,
  console: { log() {}, warn() {}, error() {} },
  rlsStorage: { run: (_scope, fn) => fn() },
  pool: { query: async (sql, values) => { capturedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), values }); return { rows: [] }; } },
  transitionCampaignState: async () => { throw new Error('Unexpected transition in diagnostic fixture'); }
});
const generated = ts.transpileModule(`class DiagnosticMethods { ${methods.join('\n')} }\n${pacing.getText(server)}\nglobalThis.probe = DiagnosticMethods; globalThis.pacing = syncCampaignSpend;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInContext(generated, context, { timeout: 2000 });
const fixture = { campaign_id: 42, performance_state: { impressions: 1000, clicks: 100, conversions: 7 }, currency: 'INR' };
const derived = {};
for (const name of names) derived[name] = context.probe[name](fixture, 10000, 'INR');
const paced = await context.pacing({ id: 42, host_id: 42, listing_id: 42, status: 'active', subscription_active: true, budget: 10000, pacing_mode: 'standard', created_at: '2026-09-13T11:50:00.000Z', last_pacing_calc_at: '2026-09-13T11:50:00.000Z', accumulated_spent: 0, accumulated_impressions: 0, accumulated_clicks: 0, accumulated_conversions: 0 });
const output = {
  diagnostic: 'HARVO offline paid funnel source reproduction',
  recordedAt: new Date().toISOString(),
  fixedClock: new FixedDate().toISOString(),
  limits: 'Extracted functions with synthetic inputs and in-process database stubs; not an HTTP, database, provider, concurrency or production test. No application import, network API, secrets or real IDs supplied.',
  sources, locations, fixture, derived,
  pacingWithoutProviderData: { elapsedSeconds: 600, analytics: paced.analytics, capturedQueries }
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
