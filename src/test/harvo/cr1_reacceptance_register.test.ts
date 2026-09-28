import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { verifyReacceptanceRegister } from '../../../scripts/cr1/verify-reacceptance-register.mjs';

const input = () => JSON.parse(readFileSync('docs/implementation/CR1_PACKAGE_REACCEPTANCE_REGISTER.json', 'utf8'));
const plan = readFileSync('docs/implementation/CR1_EXECUTION_PLAN.md', 'utf8');
const cards = readFileSync('docs/implementation/CR1_REMEDIATION_WORK_PACKAGES.md', 'utf8');
const gates = readFileSync('docs/implementation/CR1_EXTERNAL_GATE_REGISTER.md', 'utf8');
const check = (record: ReturnType<typeof input>) => verifyReacceptanceRegister(record, plan, cards, gates, existsSync);
describe('R0-03 original criterion traceability foundation', () => {
  it('preserves every original exit criterion and corrective-card mapping without accepting any package', () => {
    expect(check(input())).toEqual([]);
    expect(input().summary.independentlyReacceptedPackages).toBe(0);
  });
  it('rejects missing/duplicate original packages and unknown corrective cards', () => {
    const record = input(); record.packages[1] = record.packages[0];
    expect(check(record)).toContain('PACKAGE_IDENTITY_COUNT_INVALID');
    const invalidCard = input(); invalidCard.packages[0].correctiveCards = ['R9-99'];
    expect(check(invalidCard).join(' ')).toContain('CORRECTIVE_COVERAGE_INVALID');
  });
  it('rejects weakened original criteria, missing references and invented acceptance', () => {
    const record = input(); record.packages[0].criterion.text = 'Looks good';
    record.packages[0].implementationReferences[0].path = 'missing-file';
    record.packages[0].independentAcceptance.state = 'ACCEPTED';
    expect(check(record).join(' ')).toContain('CRITERION_CHANGED');
    expect(check(record).join(' ')).toContain('SOURCE_REFERENCE_INVALID');
    expect(check(record).join(' ')).toContain('ACCEPTANCE_REQUIRES_REVIEW_WORKFLOW');
  });
  it('rejects invented gate owners and omitted workforce/privacy/support gates', () => {
    const record = input(); record.externalGates[0].assignedHuman = { state: 'ASSIGNED', identity: 'invented-person' };
    expect(check(record).join(' ')).toContain('GATE_AUTHORITY_UNVERIFIED');
    record.externalGates = record.externalGates.filter((gate: { id: string }) => !['IAM-01', 'PRIV-01', 'OPS-01'].includes(gate.id));
    expect(check(record)).toContain('GATE_IDENTITY_COUNT_INVALID');
  });
});
