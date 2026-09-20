import { randomUUID, createHash } from 'node:crypto';
import type pg from 'pg';
import type { Express, RequestHandler, Request } from 'express';
import { z } from 'zod';
import { getStayDatesRange } from '../services/inventoryHoldService.js';
import type { CalendarDay, PrivateCalendar, PublicAvailability } from '../lib/calendar.js';

class CalendarError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const positiveId = z.coerce.number().int().positive().safe();
const windowSchema = z.object({ from: z.string(), to: z.string() }).strict();
const blockSchema = z.object({ requestId: z.uuid(), roomTypeId: positiveId, from: z.string(), to: z.string(),
  source: z.enum(['manual', 'maintenance', 'airbnb', 'booking_com', 'direct']), note: z.string().trim().max(500).default('') }).strict();
function dateWindow(value: unknown) {
  const range = windowSchema.parse(value), checked = getStayDatesRange(range.from, range.to);
  if (!checked.valid) throw new CalendarError(400, 'INVALID_DATE_RANGE', checked.error || 'Invalid date range.');
  return { ...range, dates: checked.dates };
}
const stamp = (value: string | Date) => typeof value === 'string' ? value.slice(0, 10) : `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** All authorization and data reads/writes share a transaction and a locked listing. */
export class CalendarService {
  constructor(private pool: pg.Pool) {}
  private async scoped<T>(listingId: number, actorId: number | null, task: (c: pg.PoolClient, listing: { title: string }, admin: boolean) => Promise<T>) {
    const c = await this.pool.connect();
    let broken: Error | undefined;
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.current_user_id',$1,true), set_config('app.bypass_rls','false',true)", [actorId === null ? '' : String(actorId)]);
      let admin = false;
      if (actorId !== null) {
        const actor = (await c.query('SELECT role FROM users WHERE id=$1 FOR SHARE', [actorId])).rows[0];
        if (!actor) throw new CalendarError(401, 'UNAUTHORIZED', 'Sign in to view this calendar.');
        admin = actor.role === 'admin';
      }
      // Public reads are a server-owned, published-listing aggregate projection. They never return private records.
      await c.query("SELECT set_config('app.bypass_rls',$1,true)", [admin || actorId === null ? 'true' : 'false']);
      const listing = (await c.query(actorId === null
        ? "SELECT title FROM listings WHERE id=$1 AND publication_status='published' FOR SHARE"
        : 'SELECT title FROM listings WHERE id=$1 AND (user_id=$2 OR $3::boolean) FOR SHARE',
      actorId === null ? [listingId] : [listingId, actorId, admin])).rows[0];
      if (!listing) throw new CalendarError(404, 'LISTING_NOT_FOUND', 'Listing not found.');
      const result = await task(c, listing, admin);
      await c.query('COMMIT'); return result;
    } catch (error) {
      try { await c.query('ROLLBACK'); } catch (rollbackError) { broken = rollbackError as Error; }
      throw error;
    } finally { c.release(broken); }
  }

  private async capacity(c: pg.PoolClient, listingId: number, range: ReturnType<typeof dateWindow>) {
    const rooms = (await c.query('SELECT id,name,inventory_count FROM room_types WHERE listing_id=$1 ORDER BY id', [listingId])).rows;
    // Legacy bookings have no accepted canonical room allocation. Never guess a room/unit or invent availability.
    const days = (await c.query(`SELECT r.id AS room_type_id, d::date::text AS date, r.inventory_count,
      i.total_units, i.held_units, i.booked_units, i.blocked_units,
      (SELECT count(*)::int FROM room_calendar_blocks b WHERE b.listing_id=$1 AND b.room_type_id=r.id
        AND b.mapping_status='mapped' AND b.start_date<=d AND b.end_date>d) AS mapped_blocks,
      EXISTS(SELECT 1 FROM room_calendar_blocks b WHERE b.listing_id=$1 AND b.start_date<=d AND b.end_date>d
        AND (b.room_type_id IS NULL OR b.mapping_status IS DISTINCT FROM 'mapped' OR b.room_tier_key='all')) AS unresolved_block,
      EXISTS(SELECT 1 FROM bookings b WHERE b.listing_id=$1 AND lower(b.status) NOT IN ('cancelled','canceled','rejected')
        AND (b.start_date IS NULL OR b.end_date IS NULL OR (b.start_date<=d AND b.end_date>d))) AS legacy_booking
      FROM room_types r CROSS JOIN generate_series($2::date, $3::date-1, interval '1 day') d
      LEFT JOIN inventory_days i ON i.room_type_id=r.id AND i.calendar_date=d::date
      WHERE r.listing_id=$1 ORDER BY r.id,d`, [listingId, range.from, range.to])).rows.map((r): CalendarDay => {
      const total = r.total_units ?? r.inventory_count, held = r.held_units ?? 0, booked = r.booked_units ?? 0, blocked = r.blocked_units ?? 0;
      const issue = r.legacy_booking ? 'LEGACY_BOOKING' : r.unresolved_block ? 'UNMAPPED_BLOCK'
        : blocked !== r.mapped_blocks || total !== r.inventory_count || held + booked + blocked > total ? 'INVENTORY_DRIFT' : null;
      return { roomTypeId: r.room_type_id, date: r.date, total, held, booked, blocked, available: issue ? null : total-held-booked-blocked, issue };
    });
    return { rooms: rooms.map(r => ({ id: r.id, name: r.name, inventoryCount: r.inventory_count })), days };
  }

  async read(listing: unknown, actorId: number, window: unknown): Promise<PrivateCalendar> {
    const listingId = positiveId.parse(listing), range = dateWindow(window);
    return this.scoped(listingId, actorId, async (c, row, admin) => {
      const capacity = await this.capacity(c, listingId, range);
      const bookings = (await c.query(`SELECT id,start_date,end_date,name,status,total_rent AS total_price FROM bookings
        WHERE listing_id=$1 AND (start_date IS NULL OR end_date IS NULL OR (start_date<$3::date AND end_date>$2::date))
        AND lower(status) NOT IN ('cancelled','canceled','rejected') ORDER BY start_date,id LIMIT 501`, [listingId, range.from, range.to])).rows;
      const blocks = (await c.query(`SELECT id,room_type_id,start_date,end_date,block_source,note FROM room_calendar_blocks
        WHERE listing_id=$1 AND start_date<$3::date AND end_date>$2::date ORDER BY start_date,id LIMIT 501`, [listingId, range.from, range.to])).rows;
      if (bookings.length>500 || blocks.length>500) throw new CalendarError(422, 'WINDOW_TOO_LARGE', 'Choose a shorter calendar window.');
      if (admin) await c.query(`INSERT INTO calendar_operations(actor_id,listing_id,request_id,action,fingerprint,result)
        VALUES($1,$2,$3,'ADMIN_READ',$4,$5)`, [actorId, listingId, randomUUID(), hash(range), JSON.stringify({ from: range.from, to: range.to })]);
      return { listingId, listingTitle: row.title, from: range.from, to: range.to, observedAt: new Date().toISOString(), ...capacity,
        bookings: bookings.map(b => ({ id: b.id, startDate: b.start_date ? stamp(b.start_date) : null, endDate: b.end_date ? stamp(b.end_date) : null, guestName: b.name, status: b.status, totalPrice: b.total_price === null ? null : String(b.total_price) })),
        blocks: blocks.map(b => ({ id: b.id, roomTypeId: b.room_type_id, startDate: stamp(b.start_date), endDate: stamp(b.end_date), source: b.block_source, note: b.note })) };
    });
  }
  async availability(listing: unknown, window: unknown): Promise<PublicAvailability> {
    const listingId = positiveId.parse(listing), range = dateWindow(window);
    return this.scoped(listingId, null, async c => {
      const { rooms, days } = await this.capacity(c, listingId, range);
      return { listingId, from: range.from, to: range.to, observedAt: new Date().toISOString(), rooms: rooms.map(r => {
        const rows = days.filter(d => d.roomTypeId === r.id);
        return { id: r.id, available: rows.length !== range.dates.length || rows.some(d => d.available === null) ? null : Math.min(...rows.map(d => d.available!)) };
      }) };
    });
  }
  private async mutation(listingId: number, actorId: number, requestId: string, action: 'CREATE_BLOCK'|'REMOVE_BLOCK', input: unknown, run: (c: pg.PoolClient) => Promise<{ blockId: number }>) {
    const fingerprint = hash({ listingId, action, input });
    return this.scoped(listingId, actorId, async c => {
      // Serialize retries before touching capacity; retain receipts even after removal.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`calendar:${actorId}:${requestId}`]);
      const saved = (await c.query('SELECT fingerprint,result FROM calendar_operations WHERE actor_id=$1 AND request_id=$2', [actorId, requestId])).rows[0];
      if (saved) {
        if (saved.fingerprint !== fingerprint) throw new CalendarError(409, 'IDEMPOTENCY_CONFLICT', 'This request was already used for another calendar change.');
        return saved.result as { blockId: number };
      }
      const result = await run(c);
      await c.query('INSERT INTO calendar_operations(actor_id,listing_id,request_id,action,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)',
        [actorId, listingId, requestId, action, fingerprint, JSON.stringify(result)]);
      return result;
    });
  }
  async create(listing: unknown, actorId: number, body: unknown) {
    const listingId = positiveId.parse(listing), input = blockSchema.parse(body), range = dateWindow({ from: input.from, to: input.to });
    return this.mutation(listingId, actorId, input.requestId, 'CREATE_BLOCK', input, async c => {
      const room = (await c.query('SELECT inventory_count FROM room_types WHERE id=$1 AND listing_id=$2 FOR SHARE', [input.roomTypeId, listingId])).rows[0];
      if (!room) throw new CalendarError(404, 'ROOM_NOT_FOUND', 'Room type not found.');
      await c.query(`INSERT INTO inventory_days(listing_id,room_type_id,calendar_date,total_units)
        SELECT $1,$2,d::date,$4 FROM generate_series($3::date,$5::date-1,interval '1 day') d
        ON CONFLICT(room_type_id,calendar_date) DO NOTHING`, [listingId, input.roomTypeId, input.from, room.inventory_count, input.to]);
      await c.query('SELECT id FROM inventory_days WHERE room_type_id=$1 AND calendar_date=ANY($2::date[]) ORDER BY calendar_date FOR UPDATE', [input.roomTypeId, range.dates]);
      const { days } = await this.capacity(c, listingId, range);
      if (days.filter(d => d.roomTypeId === input.roomTypeId).some(d => d.available === null || d.available < 1))
        throw new CalendarError(409, 'CAPACITY_UNAVAILABLE', 'Capacity is unavailable or needs reconciliation for these dates.');
      const block = (await c.query(`INSERT INTO room_calendar_blocks(listing_id,room_type_id,start_date,end_date,block_source,note,mapping_status)
        VALUES($1,$2,$3,$4,$5,$6,'mapped') RETURNING id`, [listingId, input.roomTypeId, input.from, input.to, input.source, input.note || null])).rows[0];
      await c.query('UPDATE inventory_days SET blocked_units=blocked_units+1,updated_at=now() WHERE room_type_id=$1 AND calendar_date=ANY($2::date[])', [input.roomTypeId, range.dates]);
      return { blockId: block.id };
    });
  }
  async remove(listing: unknown, actorId: number, block: unknown, request: unknown) {
    const listingId = positiveId.parse(listing), blockId = positiveId.parse(block), requestId = z.uuid().parse(request);
    return this.mutation(listingId, actorId, requestId, 'REMOVE_BLOCK', { blockId }, async c => {
      const row = (await c.query('SELECT * FROM room_calendar_blocks WHERE listing_id=$1 AND id=$2 FOR UPDATE', [listingId, blockId])).rows[0];
      if (!row) throw new CalendarError(404, 'BLOCK_NOT_FOUND', 'Calendar block not found.');
      if (!row.room_type_id || row.mapping_status !== 'mapped' || row.room_tier_key === 'all') throw new CalendarError(409, 'RECONCILIATION_REQUIRED', 'This legacy block needs an inventory review before removal.');
      const range = dateWindow({ from: stamp(row.start_date), to: stamp(row.end_date) });
      const locked = await c.query('SELECT id FROM inventory_days WHERE room_type_id=$1 AND calendar_date=ANY($2::date[]) ORDER BY calendar_date FOR UPDATE', [row.room_type_id, range.dates]);
      const { days } = await this.capacity(c, listingId, range);
      if (locked.rows.length !== range.dates.length || days.filter(d => d.roomTypeId === row.room_type_id).some(d => d.issue || d.blocked < 1))
        throw new CalendarError(409, 'RECONCILIATION_REQUIRED', 'Inventory counters need review before this block can be removed.');
      await c.query('UPDATE inventory_days SET blocked_units=blocked_units-1,updated_at=now() WHERE room_type_id=$1 AND calendar_date=ANY($2::date[])', [row.room_type_id, range.dates]);
      await c.query('DELETE FROM room_calendar_blocks WHERE id=$1 AND listing_id=$2', [blockId, listingId]);
      return { blockId };
    });
  }
}

export function registerCalendarRoutes(app: Express, pool: pg.Pool, authenticate: RequestHandler, configured: () => boolean) {
  const service = new CalendarService(pool);
  const noCache: RequestHandler = (_req,res,next) => { res.set('Cache-Control','private, no-store'); res.vary('Authorization'); next(); };
  const handle = (operation: (req: Request & { user?: { id: number } }) => Promise<unknown>): RequestHandler => async (req,res) => {
    if (!configured()) { res.status(503).json({ code:'DATABASE_UNAVAILABLE',error:'Calendar is temporarily unavailable.' }); return; }
    try { res.json(await operation(req)); }
    catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ code:'INVALID_REQUEST',error:'Provide a valid listing, room and date range of up to 90 nights.' }); return; }
      if (error instanceof CalendarError) { res.status(error.status).json({ code:error.code,error:error.message }); return; }
      const correlationId = randomUUID();
      console.error('[CALENDAR_FAILURE]', { correlationId, code: (error as { code?: string }).code || 'UNEXPECTED' });
      res.status(500).json({ code:'CALENDAR_UNAVAILABLE',error:'Calendar could not be updated. Refresh before retrying.',correlationId });
    }
  };
  app.get('/api/listings/:id/room-calendar', noCache, authenticate, handle(req => service.read(req.params.id, req.user!.id, req.query)));
  app.post('/api/listings/:id/room-calendar/block', noCache, authenticate, handle(req => service.create(req.params.id, req.user!.id, req.body)));
  app.delete('/api/listings/:id/room-calendar/block/:blockId', noCache, authenticate, handle(req => service.remove(req.params.id, req.user!.id, req.params.blockId, req.get('Idempotency-Key'))));
  app.get('/api/listings/:id/availability', noCache, handle(req => service.availability(req.params.id, req.query)));
}
