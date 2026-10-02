import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalPostgresFixture } from './postgres.js';
import { CalendarService, registerCalendarRoutes, registerLegacyCalendarRoutes } from '../../server/calendar.js';

describe('P0-1 isolated legacy calendar containment and canonical migration on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  let applicationPool: pg.Pool;
  let canonicalService: CalendarService;
  const from = '2026-10-01';
  const to = '2026-10-03';

  beforeAll(async () => {
    fixture = await createLocalPostgresFixture();
    const pool = fixture.pool;

    await pool.query('CREATE TABLE users (id INT PRIMARY KEY, role TEXT NOT NULL)');

    const source = readFileSync(new URL('../../../server.ts', import.meta.url), 'utf8');
    for (const table of ['bookings', 'room_calendar_blocks']) {
      const ddl = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\s*\\);`))?.[0];
      if (!ddl) throw new Error(`Missing ${table} DDL`);
      await pool.query(ddl);
    }

    const rooms = readFileSync(new URL('../../migrations/003_canonical_room_and_media_authority.sql', import.meta.url), 'utf8');
    const roomDDL = rooms.match(/CREATE TABLE IF NOT EXISTS room_types \([\s\S]*?\n\);/)?.[0];
    if (!roomDDL) throw new Error('Missing canonical room DDL');
    await pool.query(roomDDL);

    for (const name of ['005_inventory_days_and_atomic_holds.sql', '006_legacy_calendar_block_mapping.sql', '017_calendar_operation_audit.sql']) {
      await pool.query(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
    }

    // Seed legacy tables offers and calendar_prices
    await pool.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        discount_percentage DECIMAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_prices (
        id SERIAL PRIMARY KEY,
        listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
        date_string VARCHAR(10) NOT NULL,
        price DECIMAL,
        offer_id INT REFERENCES offers(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'available',
        UNIQUE(listing_id, date_string)
      )
    `);

    await pool.query(`
      CREATE ROLE calendar_legacy_app LOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO calendar_legacy_app;
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO calendar_legacy_app;
    `);

    applicationPool = new pg.Pool({ ...pool.options, user: 'calendar_legacy_app', max: 5 });
    canonicalService = new CalendarService(applicationPool);
  });

  afterAll(async () => {
    await applicationPool?.end();
    await fixture?.close();
  });

  beforeEach(async () => {
    await fixture.pool.query('TRUNCATE users,listings,offers,calendar_prices,room_types,bookings,room_calendar_blocks,inventory_days,calendar_operations CASCADE');
    // Seed users: 10 is owner, 11 is foreign host, 90 is admin
    await fixture.pool.query("INSERT INTO users VALUES(10,'host'),(11,'host'),(90,'admin')");
    // Seed listings: Listing 20 belongs to User 10, Listing 21 belongs to User 11
    await fixture.pool.query("INSERT INTO listings VALUES(20,10,'Owner Listing',NULL,'published'),(21,11,'Foreign Listing',NULL,'published')");
    // Seed canonical room for listing 20
    await fixture.pool.query("INSERT INTO room_types(id,listing_id,name,type,base_price,inventory_count) VALUES(30,20,'Luxury Villa Suite','villa',10000,2)");
  });

  interface AuthenticatedRequest extends Request {
    user?: { id: number; role: string };
  }

  const authenticate: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. No token provided.' });
      return;
    }
    const token = authHeader.slice(7).trim();
    const authenticatedReq = req as AuthenticatedRequest;
    if (token === 'token-owner-10') {
      authenticatedReq.user = { id: 10, role: 'host' };
      next();
    } else if (token === 'token-foreign-11') {
      authenticatedReq.user = { id: 11, role: 'host' };
      next();
    } else if (token === 'token-admin-90') {
      authenticatedReq.user = { id: 90, role: 'admin' };
      next();
    } else {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };

  describe('mounted production route execution on PostgreSQL', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      // Directly mount the extracted production routes without cloning handler logic
      registerLegacyCalendarRoutes(app, applicationPool, authenticate, () => true);
      registerCalendarRoutes(app, applicationPool, authenticate, () => true);
    });

    it('rejects unauthenticated legacy POST requests with 401', async () => {
      const response = await request(app)
        .post('/api/listings/20/calendar')
        .send({ dates: ['2026-10-05'], price: 9999, status: 'blocked' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required. No token provided.' });
    });

    it('fail-closes foreign host legacy POST with HTTP 410 and canonical migration hint, mutating 0 rows', async () => {
      const response = await request(app)
        .post('/api/listings/20/calendar')
        .set('Authorization', 'Bearer token-foreign-11')
        .send({ dates: ['2026-10-05', '2026-10-06'], price: 25000, status: 'blocked' });

      expect(response.status).toBe(410);
      expect(response.body).toMatchObject({
        code: 'LEGACY_CALENDAR_MUTATION_RETIRED',
        error: expect.stringContaining('retired'),
        migrationHint: '/api/listings/:id/room-calendar/block',
      });

      const rows = (await fixture.pool.query('SELECT * FROM calendar_prices WHERE listing_id = 20')).rows;
      expect(rows).toHaveLength(0);
    });

    it('fail-closes owner host legacy POST with HTTP 410 and canonical migration hint, mutating 0 rows', async () => {
      const response = await request(app)
        .post('/api/listings/20/calendar')
        .set('Authorization', 'Bearer token-owner-10')
        .send({ dates: ['2026-10-05'], price: 15000, status: 'available' });

      expect(response.status).toBe(410);
      expect(response.body).toMatchObject({
        code: 'LEGACY_CALENDAR_MUTATION_RETIRED',
        error: expect.stringContaining('retired'),
        migrationHint: '/api/listings/:id/room-calendar/block',
      });

      const rows = (await fixture.pool.query('SELECT * FROM calendar_prices WHERE listing_id = 20')).rows;
      expect(rows).toHaveLength(0);
    });

    it('fail-closes admin legacy POST with HTTP 410 and canonical migration hint, mutating 0 rows', async () => {
      const response = await request(app)
        .post('/api/listings/20/calendar')
        .set('Authorization', 'Bearer token-admin-90')
        .send({ dates: ['2026-10-05'], price: 18000, status: 'blocked' });

      expect(response.status).toBe(410);
      expect(response.body).toMatchObject({
        code: 'LEGACY_CALENDAR_MUTATION_RETIRED',
        error: expect.stringContaining('retired'),
        migrationHint: '/api/listings/:id/room-calendar/block',
      });

      const rows = (await fixture.pool.query('SELECT * FROM calendar_prices WHERE listing_id = 20')).rows;
      expect(rows).toHaveLength(0);
    });

    it('preserves public GET /api/listings/:id/calendar with existing pricing records', async () => {
      const offer = (await fixture.pool.query("INSERT INTO offers (title, discount_percentage) VALUES ('Monsoon Special', 15) RETURNING id")).rows[0];
      await fixture.pool.query(
        `INSERT INTO calendar_prices (listing_id, date_string, price, offer_id, status)
        VALUES ($1, $2, $3, $4, $5)`,
        [20, '2026-10-10', 12000, offer.id, 'available']
      );

      const response = await request(app).get('/api/listings/20/calendar');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        listing_id: 20,
        date_string: '2026-10-10',
        price: '12000',
        status: 'available',
        offer: {
          id: offer.id,
          title: 'Monsoon Special',
        },
      });
    });

    it('proves canonical owner routes still work for listing owner and deny foreign host', async () => {
      // Owner (User 10) reads canonical room calendar
      const readRes = await request(app)
        .get(`/api/listings/20/room-calendar?from=${from}&to=${to}`)
        .set('Authorization', 'Bearer token-owner-10');

      expect(readRes.status).toBe(200);
      expect(readRes.body.rooms).toHaveLength(1);
      expect(readRes.body.rooms[0].name).toBe('Luxury Villa Suite');

      // Owner (User 10) creates block on room 30
      const blockRes = await request(app)
        .post('/api/listings/20/room-calendar/block')
        .set('Authorization', 'Bearer token-owner-10')
        .send({
          requestId: randomUUID(),
          roomTypeId: 30,
          from,
          to,
          source: 'manual',
          note: 'Owner maintenance block',
        });

      expect(blockRes.status).toBe(200);
      expect(blockRes.body).toHaveProperty('blockId');

      // Foreign host (User 11) attempts to block dates on Listing 20
      const foreignBlockRes = await request(app)
        .post('/api/listings/20/room-calendar/block')
        .set('Authorization', 'Bearer token-foreign-11')
        .send({
          requestId: randomUUID(),
          roomTypeId: 30,
          from,
          to,
          source: 'manual',
          note: 'Foreign host intrusion attempt',
        });

      // Canonical route rejects foreign host (404 Not Found to prevent tenant enumeration)
      expect(foreignBlockRes.status).toBe(404);
    });
  });

  describe('server.ts production wiring assertion', () => {
    it('proves server.ts mounts registerLegacyCalendarRoutes and removes raw calendar_prices mutations', () => {
      const serverSource = readFileSync(new URL('../../../server.ts', import.meta.url), 'utf8');

      // Verify import
      expect(serverSource).toContain("import { registerCalendarRoutes, registerLegacyCalendarRoutes } from './src/server/calendar.js';");

      // Verify invocation
      expect(serverSource).toContain('registerLegacyCalendarRoutes(app, pool, authenticateToken, () => isDbConfigured);');
      expect(serverSource).toContain('registerCalendarRoutes(app, pool, authenticateToken, () => isDbConfigured);');

      // Verify legacy mutation loop is absent from server.ts
      expect(serverSource).not.toContain('INSERT INTO calendar_prices');
      expect(serverSource).not.toContain('ON CONFLICT (listing_id, date_string)');
      expect(serverSource).not.toContain('MANUAL_BLOCK_');
    });
  });
});
