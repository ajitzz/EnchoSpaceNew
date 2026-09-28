import {z} from 'zod';

export class MigrationExecutionError extends Error {
  constructor(readonly code: string, readonly file?: string) {
    super(`${code}${file ? `: ${file}` : ''}`);
    this.name = 'MigrationExecutionError';
  }
}

const manifestEntrySchema = z.object({
  version: z.string().regex(/^\d{3}_[a-z0-9_]+\.sql$/),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MigrationManifestEntry = z.infer<typeof manifestEntrySchema>;
const historySchema = z.array(z.object({version: z.string(), checksum: z.string().nullable()}).strict());

export function validateMigrationManifest(raw: unknown): MigrationManifestEntry[] {
  const parsed = z.array(manifestEntrySchema).min(1).safeParse(raw);
  if (!parsed.success) throw new MigrationExecutionError('MIGRATION_MANIFEST_INVALID');
  const manifest = parsed.data;
  if (new Set(manifest.map(row => row.version.slice(0, 3))).size !== manifest.length
    || manifest.some((row, index) => index > 0 && row.version <= manifest[index - 1].version)) {
    throw new MigrationExecutionError('MIGRATION_ORDER_INVALID');
  }
  return manifest;
}

/** Pure comparison, shared by migration apply and read-only deployment checks.
 * Gaps in numeric filenames are legal; gaps within the supplied manifest are not.
 * Database row order is immaterial, but duplicate identities are always invalid. */
export function compareMigrationHistory(rawManifest: unknown, rawHistory: unknown,
  options: {requireComplete?: boolean} = {}): MigrationManifestEntry[] {
  const manifest = validateMigrationManifest(rawManifest);
  const parsed = historySchema.safeParse(rawHistory);
  if (!parsed.success) throw new MigrationExecutionError('MIGRATION_HISTORY_INVALID');
  const history = parsed.data;
  if (new Set(history.map(row => row.version)).size !== history.length) {
    throw new MigrationExecutionError('MIGRATION_HISTORY_DUPLICATE');
  }
  const expected = new Map(manifest.map(row => [row.version, row]));
  for (const row of history) {
    const entry = expected.get(row.version);
    // Do not reflect an untrusted database version into operator diagnostics.
    if (!entry) throw new MigrationExecutionError('MIGRATION_HISTORY_UNKNOWN');
    if (row.checksum !== entry.checksum) throw new MigrationExecutionError('MIGRATION_CHECKSUM_MISMATCH', entry.version);
  }
  const applied = new Set(history.map(row => row.version));
  const pending: MigrationManifestEntry[] = [];
  for (const entry of manifest) {
    if (!applied.has(entry.version)) pending.push(entry);
    else if (pending.length) throw new MigrationExecutionError('MIGRATION_HISTORY_OUT_OF_ORDER', entry.version);
  }
  if (options.requireComplete && pending.length) throw new MigrationExecutionError('MIGRATION_HISTORY_INCOMPLETE');
  return pending;
}
