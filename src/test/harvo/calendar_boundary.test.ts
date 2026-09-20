import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createLocalPostgresFixture } from './postgres.js';
import { CalendarService, registerCalendarRoutes } from '../../server/calendar.js';

describe('private calendar and public capacity boundary, isolated PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>, service: CalendarService, applicationPool: pg.Pool;
  const from='2026-10-01',to='2026-10-03';
  beforeAll(async () => {
    fixture=await createLocalPostgresFixture(); const pool=fixture.pool;
    await pool.query('CREATE TABLE users(id INT PRIMARY KEY,role TEXT NOT NULL)');
    const source=readFileSync(new URL('../../../server.ts',import.meta.url),'utf8');
    for (const table of ['bookings','room_calendar_blocks']) {
      const ddl=source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\s*\\);`))?.[0];
      if(!ddl) throw new Error(`Missing ${table} DDL`); await pool.query(ddl);
    }
    const rooms=readFileSync(new URL('../../migrations/003_canonical_room_and_media_authority.sql',import.meta.url),'utf8');
    const roomDDL=rooms.match(/CREATE TABLE IF NOT EXISTS room_types \([\s\S]*?\n\);/)?.[0];
    if(!roomDDL)throw new Error('Missing canonical room DDL');await pool.query(roomDDL);
    for(const name of ['005_inventory_days_and_atomic_holds.sql','006_legacy_calendar_block_mapping.sql','017_calendar_operation_audit.sql'])
      await pool.query(readFileSync(new URL(`../../migrations/${name}`,import.meta.url),'utf8'));
    await pool.query("CREATE ROLE calendar_app LOGIN NOSUPERUSER NOBYPASSRLS; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO calendar_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO calendar_app; ALTER TABLE bookings ENABLE ROW LEVEL SECURITY; ALTER TABLE bookings FORCE ROW LEVEL SECURITY; CREATE POLICY booking_tenant ON bookings USING(user_id::text=current_setting('app.current_user_id',true) OR listing_id IN(SELECT id FROM listings WHERE user_id::text=current_setting('app.current_user_id',true)) OR current_setting('app.bypass_rls',true)='true')");
    applicationPool=new pg.Pool({...pool.options,user:'calendar_app',max:3});
    service=new CalendarService(applicationPool);
  });
  afterAll(async()=>{await applicationPool?.end();await fixture?.close();});
  beforeEach(async()=>{
    await fixture.pool.query('TRUNCATE users,listings,room_types,bookings,room_calendar_blocks,inventory_days,calendar_operations CASCADE');
    await fixture.pool.query("INSERT INTO users VALUES(10,'host'),(11,'host'),(90,'admin')");
    await fixture.pool.query("INSERT INTO listings VALUES(20,10,'Private guest test',NULL,'published'),(21,11,'Other host',NULL,'draft')");
    await fixture.pool.query("INSERT INTO room_types(id,listing_id,name,type,base_price,inventory_count) VALUES(30,20,'Garden room','garden',1500,2),(31,21,'Other room','garden',1500,2)");
  });
  const block=(overrides={})=>({requestId:randomUUID(),roomTypeId:30,from,to,source:'manual',note:'private test note',...overrides});
  it('denies other hosts for every private operation before disclosing records',async()=>{
    await expect(service.read(20,11,{from,to})).rejects.toMatchObject({status:404});
    await expect(service.create(20,11,block())).rejects.toMatchObject({status:404});
    await expect(service.remove(20,11,1,randomUUID())).rejects.toMatchObject({status:404});
    expect((await fixture.pool.query('SELECT * FROM calendar_operations')).rows).toHaveLength(0);
  });
  it('rechecks the persisted admin role and audits privileged reads without guest contents',async()=>{
    const result=await service.read(20,90,{from,to}); expect(result.rooms[0].name).toBe('Garden room');
    const saved=(await fixture.pool.query('SELECT * FROM calendar_operations')).rows;
    expect(saved).toHaveLength(1);expect(saved[0].result).toEqual({from,to});
    await fixture.pool.query("UPDATE users SET role='host' WHERE id=90");
    await expect(service.read(20,90,{from,to})).rejects.toMatchObject({status:404});
  });
  it('returns only public capacities, with no owner, booking, guest or block identity',async()=>{
    await service.create(20,10,block());
    const result=await service.availability(20,{from,to});
    expect(result.rooms).toEqual([{id:30,available:1}]);
    expect(Object.keys(result).sort()).toEqual(['from','listingId','observedAt','rooms','to']);
    expect(JSON.stringify(result)).not.toContain('private test note');
    await expect(service.availability(21,{from,to})).rejects.toMatchObject({status:404});
  });
  it('does not fabricate room types or a first physical unit',async()=>{
    await fixture.pool.query('DELETE FROM room_types WHERE listing_id=20');
    expect((await service.read(20,10,{from,to})).rooms).toEqual([]);
    expect((await service.availability(20,{from,to})).rooms).toEqual([]);
  });
  it('makes concurrent create retries idempotent and preserves identity conflicts',async()=>{
    const input=block();const results=await Promise.all([service.create(20,10,input),service.create(20,10,input)]);
    expect(results[0]).toEqual(results[1]);
    expect((await fixture.pool.query('SELECT blocked_units FROM inventory_days')).rows).toEqual([{blocked_units:1},{blocked_units:1}]);
    await expect(service.create(20,10,{...input,note:'changed'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  });
  it('competing blocks cannot exceed capacity and checkout is excluded',async()=>{
    const results=await Promise.allSettled([service.create(20,10,block()),service.create(20,10,block()),service.create(20,10,block())]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
    expect((await service.availability(20,{from,to})).rooms[0].available).toBe(0);
    expect((await service.availability(20,{from:to,to:'2026-10-04'})).rooms[0].available).toBe(2);
  });
  it('removes each counted block exactly once, with immutable evidence',async()=>{
    const {blockId}=await service.create(20,10,block());const requestId=randomUUID();
    const removed=await Promise.all([service.remove(20,10,blockId,requestId),service.remove(20,10,blockId,requestId)]);
    expect(removed[0]).toEqual(removed[1]);expect((await service.availability(20,{from,to})).rooms[0].available).toBe(2);
    await expect(fixture.pool.query("UPDATE calendar_operations SET result='{}'")).rejects.toThrow('immutable');
  });
  it('refuses to reopen inventory when the block counter is inconsistent',async()=>{
    const {blockId}=await service.create(20,10,block());
    await fixture.pool.query('UPDATE inventory_days SET blocked_units=0');
    await expect(service.remove(20,10,blockId,randomUUID())).rejects.toMatchObject({code:'RECONCILIATION_REQUIRED'});
    expect((await service.availability(20,{from,to})).rooms[0].available).toBeNull();
    expect((await fixture.pool.query('SELECT * FROM room_calendar_blocks')).rows).toHaveLength(1);
  });
  it('keeps legacy unassigned bookings and ambiguous blocks unavailable without guessing zeros',async()=>{
    await fixture.pool.query("INSERT INTO bookings(user_id,listing_id,move_in_date,name,phone,total_rent,status) VALUES(10,20,'2026-10-01','Private Guest','private-phone',100,'Confirmed')");
    expect((await service.availability(20,{from,to})).rooms[0].available).toBeNull();
    const privateData=await service.read(20,10,{from,to});
    expect(privateData.bookings[0]).toMatchObject({guestName:'Private Guest',startDate:null,endDate:null});
    expect(JSON.stringify(privateData)).not.toContain('private-phone');
  });
  it.each([{from,to:from},{from:'2026-02-30',to},{from,to:'2027-01-31'}])('rejects invalid or unbounded ranges %j',async range=>{
    await expect(service.availability(20,range)).rejects.toMatchObject({status:400});
  });
  it('enforces route authentication and no-store on success and error responses',async()=>{
    const app=express();app.use(express.json());registerCalendarRoutes(app,applicationPool,(req,res,next)=>{
      if(req.get('Authorization')!=='Bearer host-test'){res.status(401).json({error:'Sign in'});return;}
      (req as typeof req & {user:{id:number}}).user={id:10};next();
    },()=>true);
    const denied=await request(app).get(`/api/listings/20/room-calendar?from=${from}&to=${to}`);
    expect(denied.status).toBe(401);expect(denied.headers['cache-control']).toContain('no-store');
    const allowed=await request(app).get(`/api/listings/20/room-calendar?from=${from}&to=${to}`).set('Authorization','Bearer host-test');
    expect(allowed.status).toBe(200);expect(allowed.body.rooms).toHaveLength(1);
    const aggregate=await request(app).get(`/api/listings/20/availability?from=${from}&to=${to}`);
    expect(aggregate.status).toBe(200);expect(aggregate.body).not.toHaveProperty('bookings');
  });
});
