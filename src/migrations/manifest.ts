import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateMigrationManifest} from './history.js';

/** Apply and preflight discover the same bytes, including invalid SQL filenames.
 * Never silently omit an unexpected migration from a release manifest. */
export function readMigrationEntries(directory: string | URL) {
  const path = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = readdirSync(path).filter(file => file.endsWith('.sql')).sort().map(file => {
    const bytes = readFileSync(join(path, file));
    return {file, sql: bytes.toString('utf8'), checksum: createHash('sha256').update(bytes).digest('hex')};
  });
  validateMigrationManifest(entries.map(({file, checksum}) => ({version: file, checksum})));
  return entries;
}

export function readMigrationManifest(directory: string | URL) {
  return readMigrationEntries(directory).map(({file, checksum}) => ({version: file, checksum}));
}
