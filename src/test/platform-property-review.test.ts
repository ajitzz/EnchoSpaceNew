import { describe, expect, it, vi } from 'vitest';
import { createPropertyReviewRouter, propertyReviewVersion } from '../server/propertyReview';

const data = { title: 'A hillside retreat', city: 'Munnar', type: 'Villa', address: 'Hill Road', price: 1500, imageUrl: 'https://example.com/property.jpg', photos: [{ id: 'photo-1', url: 'https://example.com/property.jpg' }], rooms: [{ id: 'room-one', name: 'Garden', price: 1500, capacity: 2, inventory_count: 0 }] };
function fixture({ owner = 7, auditFailure = false, stored = null as any, existingRooms = [] as any[] } = {}) {
  let draft = stored;
  const query = vi.fn(async (sql: string, values: any[] = []) => {
    if (sql.startsWith('SELECT * FROM listings WHERE')) return { rows: [{ id: 42, user_id: owner, rooms: existingRooms }] };
    if (sql.startsWith('SELECT host_id')) return { rows: draft ? [{ host_id: draft.host_id }] : [] };
    if (sql.includes("draft_data->>'_submissionKey'")) return { rows: draft?.draft_data?._submissionKey === values[1] ? [draft] : [] };
    if (sql.startsWith('SELECT * FROM listings_drafts WHERE id')) return { rows: draft ? [draft] : [] };
    if (sql.startsWith('INSERT INTO listings_drafts')) {
      draft = { id: 10, host_id: 7, published_listing_id: values[1], status: values[2], updated_at: '2026-09-10T00:00:00Z', draft_data: JSON.parse(values[3]) }; return { rows: [draft] };
    }
    if (sql.startsWith('INSERT INTO listings (')) return { rows: [{ id: 42 }] };
    if (sql.startsWith('UPDATE listings SET')) return { rows: owner === 7 ? [{ id: 42 }] : [] };
    if (sql.startsWith('UPDATE listings_drafts SET draft_data')) { draft = { ...draft, draft_data: JSON.parse(values[0]), status: values[1], updated_at: '2026-09-10T01:00:00Z' }; return { rows: [draft] }; }
    if (sql.startsWith('UPDATE listings_drafts SET')) { draft = { ...draft, status: values[0], published_listing_id: values[1] }; return { rows: [draft] }; }
    if (sql.startsWith('INSERT INTO admin_audit_logs') && auditFailure) throw new Error('Audit unavailable');
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) };
  const router = createPropertyReviewRouter({ pool: pool as any, authenticate: vi.fn(), enabled: () => true });
  async function call(path: string, body: any = {}, role = 'guest', method = 'post', queryParams = {}, key = 'submission-attempt-0001') {
    const route = router.stack.find((s: any) => s.route?.path === path && s.route.methods[method]) as any;
    const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
    await route.route.stack[0].handle({ user: { id: 7, role }, body, params: { id: '10' }, query: queryParams, get: () => key, ip: '127.0.0.1' }, res, vi.fn());
    return res;
  }
  return { call, query, pool, draft: () => draft };
}
describe('Property submission and review boundaries', () => {
  it('preserves the allocation declaration in the reviewed room snapshot', async () => {
    const f = fixture(); const result = await f.call('/', { ...data, rooms: [{ ...data.rooms[0], inventory_source: 'encho_allocation' }] });
    expect(result.statusCode).toBe(200); expect(result.body.submission.draft_data.rooms[0].inventory_source).toBe('encho_allocation');
  });
  it('rejects invented connector verification states', async () => {
    const f = fixture(); expect((await f.call('/', { ...data, rooms: [{ ...data.rooms[0], inventory_source: 'verified_channex' }] })).statusCode).toBe(400);
  });
  it('rejects publication that removes an existing room identity', async () => {
    const f = fixture({ existingRooms: [{ id: 'retained-room', inventory_count: 1 }] });
    const submission = await f.call('/', { ...data, published_listing_id: 42 });
    expect(submission.statusCode).toBe(200);
    const result = await f.call('/:id/decision', { decision: 'approve', version: submission.body.submission.version }, 'admin');
    expect(result.statusCode).toBe(409);
    expect(result.body.error).toContain('Existing room IDs');
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE listings SET'))).toBe(false);
  });
  it('paginates with lookahead while retaining the host predicate', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce({ rows: Array.from({ length: 101 }, (_, i) => ({ id: 200 - i, draft_data: {} })) });
    const result = await f.call('/', {}, 'guest', 'get', { before: '201' });
    expect(result.body.submissions).toHaveLength(100);
    expect(result.body.nextCursor).toBe('101');
    expect(f.query.mock.calls[0][0]).toContain('WHERE d.host_id=$1 AND d.id<$2 ORDER BY d.id DESC LIMIT 101');
    expect(f.query.mock.calls[0][1]).toEqual([7, '201']);
  });
  it('preserves admin pending-review scope on subsequent pages', async () => {
    const f = fixture();
    const result = await f.call('/', {}, 'admin', 'get', { scope: 'admin', before: '100' });
    expect(result.body.nextCursor).toBeNull();
    expect(f.query.mock.calls[0][0]).toContain("WHERE d.status='PENDING_REVIEW' AND d.id<$1");
    expect(f.query.mock.calls[0][1]).toEqual(['100']);
  });
  it.each(['0', '-1', '1 OR true', '9223372036854775808', ['2', '3']])('rejects invalid cursors before SQL: %j', async before => {
    const f = fixture();
    expect((await f.call('/', {}, 'guest', 'get', { before })).statusCode).toBe(400);
    expect(f.query).not.toHaveBeenCalled();
  });
  it('saves an incomplete draft without making it reviewable', async () => {
    const f = fixture(); const r = await f.call('/', { intent: 'draft', title: '' });
    expect(r.statusCode).toBe(200); expect(r.body.submission.status).toBe('DRAFT');
    expect((await f.call('/:id/decision', { decision: 'approve', version: r.body.submission.version }, 'admin')).statusCode).toBe(409);
  });
  it('updates a saved draft using its version and rejects stale editors', async () => {
    const f = fixture(); const r = await f.call('/', { intent: 'draft', title: '' });
    const version = r.body.submission.version;
    const updated = await f.call('/', { ...data, draftId: 10, version }, 'guest', 'post', {}, 'submission-attempt-0002');
    expect(updated.statusCode).toBe(200); expect(updated.body.submission.status).toBe('PENDING_REVIEW');
    const stale = await f.call('/', { ...data, intent: 'draft', draftId: 10, version }, 'guest', 'post', {}, 'submission-attempt-0003');
    expect(stale.statusCode).toBe(409);
  });
  it('submits without publishing and preserves zero inventory', async () => {
    const f = fixture(); const r = await f.call('/', data);
    expect(r.statusCode).toBe(200); expect(r.body.submission.status).toBe('PENDING_REVIEW');
    expect(r.body.submission.draft_data.rooms[0].inventory_count).toBe(0);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO listings ('))).toBe(false);
  });
  it('rejects temporary photo URLs before creating a review submission', async () => {
    const f = fixture();
    expect((await f.call('/', { ...data, photos: [{ url: 'blob:temporary-photo' }] })).statusCode).toBe(400);
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('retries one submission without duplicates, including JSONB key reordering', async () => {
    const f = fixture(); await f.call('/', data); const r = await f.call('/', { photos: data.photos, imageUrl: data.imageUrl, rooms: data.rooms, price: 1500, address: 'Hill Road', type: 'Villa', city: 'Munnar', title: data.title });
    expect(r.statusCode).toBe(200);
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO listings_drafts'))).toHaveLength(1);
  });
  it('rejects key reuse with changed nested room data', async () => {
    const f = fixture(); await f.call('/', data);
    expect((await f.call('/', { ...data, rooms: [{ ...data.rooms[0], price: 2500 }] })).statusCode).toBe(409);
  });
  it('blocks editing another owner property', async () => {
    const f = fixture({ owner: 8 }); expect((await f.call('/', { ...data, published_listing_id: 42 })).statusCode).toBe(404);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('denies host approval and admin queue access before database calls', async () => {
    const f = fixture(); expect((await f.call('/:id/decision', { decision: 'approve', version: 'x' })).statusCode).toBe(403);
    expect((await f.call('/', {}, 'guest', 'get', { scope: 'admin' })).statusCode).toBe(403);
    expect(f.pool.connect).not.toHaveBeenCalled(); expect(f.query).not.toHaveBeenCalled();
  });
  it('rejects stale review without publication', async () => {
    const f = fixture(); await f.call('/', data);
    expect((await f.call('/:id/decision', { decision: 'approve', version: 'stale' }, 'admin')).statusCode).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO listings ('))).toBe(false);
  });
  it('does not overwrite a published listing that changed after submission', async () => {
    const f = fixture(); await f.call('/', { ...data, published_listing_id: 42 });
    f.draft().draft_data._publishedVersion = 'outdated-published-version';
    const result = await f.call('/:id/decision', { decision: 'approve', version: propertyReviewVersion(f.draft()) }, 'admin');
    expect(result.statusCode).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE listings SET'))).toBe(false);
  });
  it('approves the snapshot and repeated approval returns the same listing', async () => {
    const f = fixture(); await f.call('/', data); const version = propertyReviewVersion(f.draft());
    const r = await f.call('/:id/decision', { decision: 'approve', version }, 'admin');
    expect(r.statusCode).toBe(200); expect(r.body.submission.published_listing_id).toBe(42);
    expect((await f.call('/:id/decision', { decision: 'approve', version }, 'admin')).statusCode).toBe(200);
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO listings ('))).toHaveLength(1);
  });
  it('requires useful rejection feedback', async () => {
    const f = fixture(); expect((await f.call('/:id/decision', { decision: 'reject', version: 'x', note: ' ' }, 'admin')).statusCode).toBe(400);
  });
  it('rolls back publication if audit persistence fails', async () => {
    const stored = { id: 10, host_id: 7, status: 'PENDING_REVIEW', updated_at: '2026-09-10', draft_data: { ...data, _submissionKey: 'submission-attempt-0001' } };
    const f = fixture({ stored, auditFailure: true });
    expect((await f.call('/:id/decision', { decision: 'approve', version: propertyReviewVersion(stored) }, 'admin')).statusCode).toBe(503);
    expect(f.query).toHaveBeenCalledWith('ROLLBACK'); expect(f.query).not.toHaveBeenCalledWith('COMMIT');
  });
});
