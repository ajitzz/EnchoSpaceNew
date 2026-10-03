import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import { z } from 'zod';

const databaseId = z.number().int().positive().max(2_147_483_647);
const optionalText = (max: number) => z.string().trim().max(max).nullable();
const shortText = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxLength: number) => z.array(shortText(maxLength)).max(maxItems)
  .refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length, 'Duplicate values are not allowed');
const coordinate = (minimum: number, maximum: number) => z.number().finite().min(minimum).max(maximum).nullable();

const amenityClusters = z.object({
  vibe: stringList(40, 100),
  comfort: stringList(40, 100),
  work: stringList(40, 100),
  culinary: stringList(40, 100),
}).strict();

/** A bounded PATCH contract for existing draft property facts. Room, media, price and status
 * have separate authority and are deliberately absent from this schema. */
export const adminDraftPropertyPatchSchema = z.object({
  title: shortText(255).optional(),
  description: optionalText(20_000).optional(),
  type: shortText(50).optional(),
  address: shortText(255).optional(),
  city: shortText(100).optional(),
  lat: coordinate(-90, 90).optional(),
  lng: coordinate(-180, 180).optional(),
  rental_mode: z.enum(['entire_place', 'private_rooms', 'hybrid']).optional(),
  amenities: stringList(80, 100).optional(),
  amenity_clusters: amenityClusters.optional(),
  child_safety_specs: stringList(40, 200).optional(),
  raw_rules: optionalText(8_000).optional(),
  curated_guidelines: stringList(40, 500).optional(),
  experience_tags: stringList(40, 100).optional(),
  concierge_privileges: optionalText(5_000).optional(),
  host_philosophy: optionalText(5_000).optional(),
  seo_title: optionalText(255).optional(),
  seo_description: optionalText(2_000).optional(),
  seo_keywords: optionalText(1_000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one supported draft property field is required');

// Expected values come from the authenticated raw property read. They must retain
// whitespace and distinguish NULL from an empty string for an exact CAS check.
const rawStringList = (maxItems: number, maxLength: number) => z.array(z.string().max(maxLength)).max(maxItems);
const rawCoordinate = (minimum: number, maximum: number) => z.union([
  z.number().finite().min(minimum).max(maximum),
  z.string().regex(/^-?\d+(?:\.\d+)?$/).refine(value => Number(value) >= minimum && Number(value) <= maximum),
]).nullable();
const expectedAmenityClusters = z.object({
  vibe: rawStringList(40, 100).optional(),
  comfort: rawStringList(40, 100).optional(),
  work: rawStringList(40, 100).optional(),
  culinary: rawStringList(40, 100).optional(),
}).strict();
export const adminDraftPropertyExpectedCurrentSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  description: z.string().max(20_000).nullable().optional(),
  type: z.string().max(50).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  lat: rawCoordinate(-90, 90).optional(),
  lng: rawCoordinate(-180, 180).optional(),
  rental_mode: z.string().max(50).nullable().optional(),
  amenities: rawStringList(80, 100).nullable().optional(),
  amenity_clusters: expectedAmenityClusters.nullable().optional(),
  child_safety_specs: rawStringList(40, 200).nullable().optional(),
  raw_rules: z.string().max(8_000).nullable().optional(),
  curated_guidelines: z.union([rawStringList(40, 500), z.string().max(20_000)]).nullable().optional(),
  experience_tags: rawStringList(40, 100).nullable().optional(),
  concierge_privileges: z.string().max(5_000).nullable().optional(),
  host_philosophy: z.string().max(5_000).nullable().optional(),
  seo_title: z.string().max(255).nullable().optional(),
  seo_description: z.string().max(2_000).nullable().optional(),
  seo_keywords: z.string().max(1_000).nullable().optional(),
}).strict();

export const adminDraftPropertyCommandSchema = z.object({
  listingId: databaseId,
  adminId: databaseId,
  patch: adminDraftPropertyPatchSchema,
  expectedCurrent: adminDraftPropertyExpectedCurrentSchema,
  ipAddress: z.string().trim().max(255).nullable().optional(),
}).strict().refine(value => {
  const patchKeys = Object.keys(value.patch).sort();
  const expectedKeys = Object.keys(value.expectedCurrent).sort();
  return patchKeys.length === expectedKeys.length && patchKeys.every((key, index) => key === expectedKeys[index]);
}, 'Expected current values must have exactly the edited field keys');

export type AdminDraftPropertyPatch = z.infer<typeof adminDraftPropertyPatchSchema>;
export type AdminDraftPropertyCommand = z.infer<typeof adminDraftPropertyCommandSchema>;
export type AdminDraftPropertyExpectedCurrent = z.infer<typeof adminDraftPropertyExpectedCurrentSchema>;
export type AdminDraftPropertyField = keyof AdminDraftPropertyPatch;

export interface AdminDraftPropertyResult {
  listingId: number;
  publication_status: 'draft';
  changedFields: AdminDraftPropertyField[];
  auditLogId: number | null;
  unchanged: boolean;
  property: Record<AdminDraftPropertyField, unknown>;
}

export class AdminDraftPropertyError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 422 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminDraftPropertyError';
  }
}

const fields = [
  'title', 'description', 'type', 'address', 'city', 'lat', 'lng', 'rental_mode',
  'amenities', 'amenity_clusters',
  'child_safety_specs', 'raw_rules', 'curated_guidelines', 'experience_tags',
  'concierge_privileges', 'host_philosophy', 'seo_title', 'seo_description',
  'seo_keywords',
] as const satisfies readonly AdminDraftPropertyField[];
const jsonbFields = new Set<AdminDraftPropertyField>(['amenities', 'amenity_clusters', 'child_safety_specs', 'experience_tags']);
const selectedColumns = `id, publication_status, ${fields.join(', ')}`;

function legacyGuidelines(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return parsed;
  } catch {
    // Legacy rows stored plain text. Preserve it as one guideline in the read model.
  }
  return [value];
}

function presentationValue(field: AdminDraftPropertyField, value: unknown): unknown {
  if ((field === 'lat' || field === 'lng') && value !== null && value !== undefined) return Number(value);
  if (field === 'curated_guidelines') return legacyGuidelines(value);
  return value;
}

function propertyView(row: Record<string, unknown>): Record<AdminDraftPropertyField, unknown> {
  return Object.fromEntries(fields.map(field => [field, presentationValue(field, row[field])])) as Record<AdminDraftPropertyField, unknown>;
}

function storedValue(field: AdminDraftPropertyField, value: unknown): unknown {
  if (jsonbFields.has(field) || field === 'curated_guidelines') return JSON.stringify(value);
  return value;
}

function matchesExpectedCurrent(field: AdminDraftPropertyField, actual: unknown, expected: unknown): boolean {
  if (field === 'lat' || field === 'lng') {
    return isDeepStrictEqual(actual === null ? null : Number(actual), expected === null ? null : Number(expected));
  }
  if (field === 'curated_guidelines' && Array.isArray(expected)) {
    return isDeepStrictEqual(legacyGuidelines(actual), expected);
  }
  return isDeepStrictEqual(actual, expected);
}

/** Parent-first lock and persisted admin reauthorization are held through the update and
 * audit insert. An identical retry is a no-op and receives no second audit receipt.
 * Database-enforced immutability of listing audit rows is a separate release gate. */
export async function updateAdminDraftProperty(pool: Pool, rawCommand: unknown): Promise<AdminDraftPropertyResult> {
  const parsed = adminDraftPropertyCommandSchema.safeParse(rawCommand);
  if (!parsed.success) {
    throw new AdminDraftPropertyError(400, 'INVALID_DRAFT_PROPERTY_PATCH', 'Invalid draft property command or unsupported field');
  }
  const { listingId, adminId, patch, expectedCurrent, ipAddress } = parsed.data;
  const suppliedFields = Object.keys(patch) as AdminDraftPropertyField[];
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const listing = (await client.query<Record<string, unknown>>(
      `SELECT ${selectedColumns} FROM listings WHERE id = $1 FOR UPDATE`, [listingId],
    )).rows[0];
    if (!listing) throw new AdminDraftPropertyError(404, 'LISTING_NOT_FOUND', 'Listing not found');

    // The JWT/middleware role is a projection. FOR SHARE holds the current persisted
    // admin role and active flag stable until COMMIT, including the audit receipt.
    let administrator: { role: string; is_active: boolean } | undefined;
    try {
      administrator = (await client.query<{ role: string; is_active: boolean }>(
        'SELECT role, is_active FROM users WHERE id = $1 FOR SHARE', [adminId],
      )).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '42703') {
        throw new AdminDraftPropertyError(503, 'ADMIN_REAUTHORIZATION_UNAVAILABLE', 'Admin account status cannot be verified');
      }
      throw error;
    }
    if (administrator?.role !== 'admin' || administrator.is_active !== true) {
      throw new AdminDraftPropertyError(403, 'ADMIN_PRIVILEGES_REQUIRED', 'Active administrator privileges are required');
    }

    if (listing.publication_status !== 'draft') {
      throw new AdminDraftPropertyError(422, 'LISTING_NOT_DRAFT', 'Only a draft listing can be edited directly');
    }

    const before = propertyView(listing);
    const changedFields = suppliedFields.filter(field => !isDeepStrictEqual(before[field], patch[field]));
    if (changedFields.length === 0) {
      await client.query('COMMIT');
      transactionStarted = false;
      return { listingId, publication_status: 'draft', changedFields: [], auditLogId: null, unchanged: true, property: before };
    }

    for (const field of suppliedFields) {
      if (!matchesExpectedCurrent(field, listing[field], expectedCurrent[field])) {
        throw new AdminDraftPropertyError(409, 'DRAFT_PROPERTY_STALE', `Draft property field ${field} changed since it was loaded`);
      }
    }

    if (patch.lat !== undefined || patch.lng !== undefined) {
      const lat = patch.lat === undefined ? listing.lat : patch.lat;
      const lng = patch.lng === undefined ? listing.lng : patch.lng;
      if ((lat === null) !== (lng === null)) {
        throw new AdminDraftPropertyError(422, 'INCOMPLETE_COORDINATES', 'Latitude and longitude must both be set or both be empty');
      }
    }

    // Identifiers come only from the static allowlist above. Values remain parameters.
    const assignments = changedFields.map((field, index) => `${field} = $${index + 2}${jsonbFields.has(field) ? '::jsonb' : ''}`);
    const values = changedFields.map(field => storedValue(field, patch[field]));
    const updated = (await client.query<Record<string, unknown>>(
      `UPDATE listings SET ${assignments.join(', ')} WHERE id = $1 AND publication_status = 'draft' RETURNING ${selectedColumns}`,
      [listingId, ...values],
    )).rows[0];
    if (!updated || updated.publication_status !== 'draft') {
      throw new AdminDraftPropertyError(409, 'DRAFT_PROPERTY_STATE_CHANGED', 'Draft property state changed during update');
    }
    const after = propertyView(updated);
    // The audit stores exact persisted values, including legacy text/null distinctions.
    // The response above is a normalized editor projection, not the forensic receipt.
    const previousState = Object.fromEntries(suppliedFields.map(field => [field, listing[field]]));
    const newState = Object.fromEntries(suppliedFields.map(field => [field, updated[field]]));
    const audit = (await client.query<{ id: number }>(
      `INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
       VALUES ($1, 'listing', $2, 'draft_property_fields_updated', $3::jsonb, $4::jsonb, $5)
       RETURNING id`,
      [adminId, listingId, JSON.stringify(previousState), JSON.stringify(newState), ipAddress || null],
    )).rows[0];
    if (!audit || !Number.isSafeInteger(Number(audit.id))) {
      throw new Error('Draft property audit receipt was not returned');
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return { listingId, publication_status: 'draft', changedFields, auditLogId: Number(audit.id), unchanged: false, property: after };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Draft property update and rollback both failed');
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
