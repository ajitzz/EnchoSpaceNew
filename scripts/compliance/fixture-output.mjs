import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve, sep } from 'node:path';

// These legacy examples are not collectors. Their only output boundary is temporary,
// clearly marked fixtures; historical evidence can never be overwritten here.
export function fixtureRoot() {
  return resolve(tmpdir(), 'encho-cr1-evidence-fixtures');
}

export function writeFixtureReceipt(name, details = {}, requestedPath) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('FIXTURE_NAME_INVALID');
  const root = fixtureRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink()) throw new Error('FIXTURE_SYMLINK_ESCAPE');
  const destination = requestedPath === undefined ? resolve(root, randomUUID(), `${name}.json`) : resolve(requestedPath);
  const relativePath = relative(root, destination);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || resolve(root, relativePath) !== destination) {
    throw new Error('FIXTURE_OUTPUT_PATH_REQUIRED: outputs are confined to the temporary evidence fixture directory');
  }
  let parent = root;
  for (const component of relative(root, dirname(destination)).split(sep).filter(Boolean)) {
    parent = resolve(parent, component);
    if (existsSync(parent)) {
      if (lstatSync(parent).isSymbolicLink()) throw new Error('FIXTURE_SYMLINK_ESCAPE');
    } else mkdirSync(parent, { recursive: false, mode: 0o700 });
  }
  // Refuse parent symlinks escaping the fixture directory. wx also refuses existing
  // files/symlinks; no test/example is allowed to replace a prior receipt.
  const canonicalRoot = realpathSync(root);
  const canonicalParent = realpathSync(dirname(destination));
  if (canonicalParent !== canonicalRoot && !canonicalParent.startsWith(`${canonicalRoot}${sep}`)) throw new Error('FIXTURE_SYMLINK_ESCAPE');
  const receipt = {
    schemaVersion: 1, type: 'ENCHO_UNTRUSTED_FIXTURE', classification: 'FIXTURE',
    environment: 'LOCAL', status: 'NOT_EVIDENCE', productionGateEligible: false,
    externalGates: 'UNKNOWN', generatedAt: new Date().toISOString(), name, details,
    qualification: 'Synthetic example only. No external observation, professional approval, production acceptance or pilot success is established.',
  };
  writeFileSync(resolve(canonicalParent, basename(destination)), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  return { receiptPath: destination, targetPath: destination, targetReceiptPath: destination, status: 'NOT_EVIDENCE', classification: 'FIXTURE', productionGateEligible: false };
}
