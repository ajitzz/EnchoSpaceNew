import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = {
  plan: 'docs/implementation/CR1_EXECUTION_PLAN.md',
  coverage: 'docs/implementation/CR1_REMEDIATION_WORK_PACKAGES.md',
  gates: 'docs/implementation/CR1_EXTERNAL_GATE_REGISTER.md',
  register: 'docs/implementation/CR1_PACKAGE_REACCEPTANCE_REGISTER.json',
};
const hash = value => createHash('sha256').update(value).digest('hex');

/** Structural check only. It cannot authenticate evidence or accept a package. */
export function verifyReacceptanceRegister(record, plan, coverage, gates, referenceExists) {
  const errors = [];
  const expected = new Map();
  plan.split('\n').forEach((line, index) => {
    const found = /^\| (P[0-8]\.\d+) \| (.*?) \| (.*?) \|$/.exec(line);
    if (found) expected.set(found[1], { criterion: found[2], historicalState: found[3], line: index + 1 });
  });
  const mapping = new Map();
  const mappingText = coverage.split('## Original 48-package coverage')[1]?.split('## Audit closure matrix')[0] || '';
  for (const line of mappingText.split('\n')) {
    if (!line.startsWith('| P')) continue;
    const cells = line.split('|');
    for (const id of cells[1].match(/P[0-8]\.\d+/g) || []) mapping.set(id, cells[2].match(/R[0-7]-0[1-4]/g) || []);
  }
  const validCards = new Set([...coverage.matchAll(/^### (R[0-7]-0[1-4]) /gm)].map(match => match[1]));
  if (expected.size !== 48 || mapping.size !== 48 || validCards.size !== 32) errors.push('CONTROLLING_CONTRACT_COUNT_INVALID');
  if (record?.schemaVersion !== 1 || record.status !== 'REACCEPTANCE_FOUNDATION_ONLY' || !Array.isArray(record.packages)) return ['REGISTER_SCHEMA_INVALID'];
  if (record.packages.length !== 48 || new Set(record.packages.map(row => row.id)).size !== 48) errors.push('PACKAGE_IDENTITY_COUNT_INVALID');
  for (const row of record.packages) {
    const original = expected.get(row?.id);
    if (!original) { errors.push('UNKNOWN_ORIGINAL_PACKAGE'); continue; }
    if (row.criterion?.text !== original.criterion || row.criterion?.sha256 !== hash(original.criterion)) errors.push(`${row.id}:CRITERION_CHANGED`);
    if (row.criterion?.source !== paths.plan || row.criterion?.line !== original.line) errors.push(`${row.id}:CRITERION_REFERENCE_STALE`);
    if (row.historicalClaim?.state !== original.historicalState) errors.push(`${row.id}:HISTORICAL_CLAIM_CHANGED`);
    if (!Array.isArray(row.correctiveCards) || JSON.stringify(row.correctiveCards) !== JSON.stringify(mapping.get(row.id)) || row.correctiveCards.some(id => !validCards.has(id))) errors.push(`${row.id}:CORRECTIVE_COVERAGE_INVALID`);
    if (!Array.isArray(row.implementationReferences) || !row.implementationReferences.length || row.implementationReferences.some(ref => ref.status !== 'REFERENCE_IDENTIFIED_IN_SOURCE_SCAN' || !referenceExists(ref.path))) errors.push(`${row.id}:SOURCE_REFERENCE_INVALID`);
    for (const dimension of ['routes', 'schema', 'ui', 'workers']) if (row.routeSchemaUiAssessment?.[dimension] !== 'UNREVIEWED') errors.push(`${row.id}:UNREVIEWED_INTEGRATION_CLAIM`);
    for (const level of ['local', 'integrated', 'external']) {
      if (row.evidence?.[level]?.state !== (level === 'external' ? 'OPEN' : 'UNREVIEWED') || !Array.isArray(row.evidence[level].acceptedEvidence) || row.evidence[level].acceptedEvidence.length) errors.push(`${row.id}:ACCEPTANCE_REQUIRES_REVIEW_WORKFLOW`);
    }
    if (row.independentAcceptance?.state !== 'UNREVIEWED' || row.independentAcceptance.reviewer !== null || row.independentAcceptance.decisionEvidence !== null) errors.push(`${row.id}:ACCEPTANCE_REQUIRES_REVIEW_WORKFLOW`);
  }
  if (record.summary?.historicalClaimedPackages !== 48 || record.summary.independentlyReacceptedPackages !== 0 || record.summary.replacementCompletionPercentage !== null) errors.push('SUMMARY_CLAIM_INVALID');
  const originalGates = new Map();
  gates.split('\n').forEach((line, index) => {
    if (!/^\| (ENV|DB|LEGAL|PROV|COMM|IAM|OPS|PILOT|PRIV)-/.test(line)) return;
    const cells = line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
    originalGates.set(cells[0].split(' ')[0], { owner: cells[2], evidence: cells[3], stop: cells[4], line: index + 1 });
  });
  if (!Array.isArray(record.externalGates) || record.externalGates.length !== 10 || new Set(record.externalGates.map(gate => gate.id)).size !== 10) errors.push('GATE_IDENTITY_COUNT_INVALID');
  for (const gate of record.externalGates || []) {
    const original = originalGates.get(gate.id);
    if (!original || gate.requiredOwnerRole !== original.owner || gate.requiredEvidence !== original.evidence || gate.stopCondition !== original.stop || gate.source !== paths.gates || gate.line !== original.line) errors.push(`${gate.id}:GATE_CONTRACT_CHANGED`);
    if (gate.assignedHuman?.state !== 'UNASSIGNED' || gate.assignedHuman.identity !== null || gate.currentAcceptance !== 'OPEN') errors.push(`${gate.id}:GATE_AUTHORITY_UNVERIFIED`);
  }
  for (const row of record.packages) {
    if (!Array.isArray(row.evidence?.external?.relatedGateIds) || row.evidence.external.relatedGateIds.some(id => !originalGates.has(id))) errors.push(`${row.id}:GATE_REFERENCE_INVALID`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = verifyReacceptanceRegister(
      JSON.parse(readFileSync(resolve(root, paths.register), 'utf8')),
      readFileSync(resolve(root, paths.plan), 'utf8'), readFileSync(resolve(root, paths.coverage), 'utf8'), readFileSync(resolve(root, paths.gates), 'utf8'),
      ref => typeof ref === 'string' && !ref.startsWith('/') && !ref.split('/').includes('..') && existsSync(resolve(root, ref)),
    );
    console.log(JSON.stringify({ status: errors.length ? 'FAILED' : 'STRUCTURE_VERIFIED', packageRows: 48, independentlyReaccepted: 0, productionGateEligible: false, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
  } catch { console.error(JSON.stringify({ status: 'FAILED', code: 'REACCEPTANCE_REGISTER_UNAVAILABLE' })); process.exitCode = 1; }
}
