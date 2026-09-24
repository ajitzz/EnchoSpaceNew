import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createLocalPostgresFixture} from './postgres.js';
import {CanonicalRoomOfferReader} from '../../lib/offers/canonicalRoomReader.js';
import {canonicalRoomPriceMinor,verifyRoomOfferObservation} from '../../lib/offers/evidence.js';
import {classifyRoomOffer,readCurrentOfferTierRelease,type ReleasedOfferTierEvidence} from '../../lib/offers/releasedTierResolver.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';
import {fingerprint} from '../../lib/marketing/domain.js';

describe('CR1 canonical room offer preflight on real PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createLocalPostgresFixture>>;let runtime:pg.Pool;let reader:CanonicalRoomOfferReader;let release:ReleasedOfferTierEvidence;
  const account=(id=10)=>parsePrincipalContext({actorKind:'ACCOUNT',accountId:id,assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId:'offer-fixture',operationId:'offer-read'});
  const request=(roomTypeId=10)=>({listingId:1,roomTypeId,checkIn:'2026-10-01',checkOut:'2026-10-04',units:1,guestCount:2});
  beforeAll(async()=>{
    fixture=await createLocalPostgresFixture({schema:'empty'});
    await fixture.pool.query(`CREATE TABLE users(id INT PRIMARY KEY,role TEXT NOT NULL);
      INSERT INTO users VALUES(10,'user'),(11,'user'),(90,'admin');
      CREATE TABLE listings(id INT PRIMARY KEY,user_id INT REFERENCES users,title TEXT,slug TEXT,publication_status TEXT,price NUMERIC,private_address TEXT,lat NUMERIC);
      INSERT INTO listings VALUES(1,10,'Synthetic mixed resort','synthetic-mixed-resort-1','published',1,'PRIVATE TEST ADDRESS',11.123456),
        (2,11,'Other tenant resort','other-tenant-2','published',99999,'OTHER PRIVATE ADDRESS',12.654321);
      CREATE TABLE room_calendar_blocks(id SERIAL PRIMARY KEY,listing_id INT REFERENCES listings,room_tier_key TEXT NOT NULL,room_name TEXT,start_date DATE NOT NULL,end_date DATE NOT NULL);
      CREATE TABLE admin_audit_logs(id SERIAL PRIMARY KEY,admin_id INT REFERENCES users,entity_type TEXT,entity_id INT,action TEXT,previous_state JSONB,new_state JSONB,created_at TIMESTAMPTZ DEFAULT now());`);
    const migration=await fixture.pool.connect();
    try{
      await migration.query('BEGIN');await migration.query('SELECT pg_advisory_xact_lock(82749102)');
      for(const file of ['003_canonical_room_and_media_authority.sql','004_canonical_constraints.sql','005_inventory_days_and_atomic_holds.sql','006_legacy_calendar_block_mapping.sql','032_marketing_adtech_registry.sql'])await migration.query(readFileSync(`src/migrations/${file}`,'utf8'));
      await migration.query('COMMIT');
    }catch(error){await migration.query('ROLLBACK');throw error;}finally{migration.release();}
    await fixture.pool.query(`CREATE ROLE cr1_offer_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO cr1_offer_reader;
      GRANT SELECT ON users,listings,room_types,inventory_days,room_calendar_blocks,marketing_adtech_current_release,marketing_adtech_release_members,marketing_adtech_profile_versions TO cr1_offer_reader;`);
    runtime=new pg.Pool({...fixture.pool.options,user:'cr1_offer_reader'});reader=new CanonicalRoomOfferReader(runtime);
    const client=await runtime.connect();
    try{await client.query('BEGIN READ ONLY');await client.query("SELECT set_config('app.current_user_id','90',true),set_config('app.marketing_admin','true',true)");release=await readCurrentOfferTierRelease(client);await client.query('COMMIT');}finally{client.release();}
  });
  beforeEach(async()=>{
    await fixture.pool.query('DELETE FROM room_calendar_blocks;DELETE FROM inventory_days;DELETE FROM room_types');
    await fixture.pool.query("UPDATE listings SET publication_status='published',slug=CASE id WHEN 1 THEN 'synthetic-mixed-resort-1' ELSE 'other-tenant-2' END");
    await fixture.pool.query(`INSERT INTO room_types(id,listing_id,name,base_price,currency,max_occupancy,inventory_count,min_stay_nights) VALUES
      (10,1,'Garden room',3500.00,'INR',2,2,1),(11,1,'Honeymoon suite',5500.00,'INR',2,1,1),(12,1,'Presidential suite',8000.00,'INR',4,1,1),(20,2,'Other tenant room',1000,'INR',2,1,1);
      INSERT INTO inventory_days(listing_id,room_type_id,calendar_date,total_units)
        SELECT r.listing_id,r.id,d::date,r.inventory_count FROM room_types r CROSS JOIN generate_series('2026-10-01'::date,'2026-10-03'::date,interval '1 day') d;`);
  });
  afterAll(async()=>{await runtime?.end();await fixture?.close();});

  it('resolves three independent room tiers in one resort without using its listing price',async()=>{
    const snapshots=await Promise.all([10,11,12].map(id=>reader.forHost(account(),request(id))));
    expect(snapshots.map(s=>s.offer.price.amountMinor)).toEqual(['350000','550000','800000']);
    expect(snapshots.map(s=>classifyRoomOffer(s,release).tier)).toEqual(['BUDGET','COMFORT','PREMIUM']);
    for(const snapshot of snapshots){
      expect(snapshot.availability.state).toBe('OBSERVED_AVAILABLE');
      expect(snapshot.execution).toMatchObject({bookingAllowed:false,campaignPublicationAllowed:false,publicPriceClaimAllowed:false});
      expect(snapshot.offer.price.occupancyPriceBasis).toBe('UNSPECIFIED');
      expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');expect(JSON.stringify(snapshot)).not.toContain('11.123456');
    }
    expect(new Set(snapshots.map(s=>s.offer.versionHash)).size).toBe(3);
  });
  it.each([['1000.00','BUDGET'],['3999.99','BUDGET'],['4000.00','COMFORT'],['6999.99','COMFORT'],['7000.00','PREMIUM']])('preserves the exact released paise boundary %s',async(amount,tier)=>{
    await fixture.pool.query('UPDATE room_types SET base_price=$1 WHERE id=10',[amount]);
    expect(classifyRoomOffer(await reader.forHost(account(),request()),release).tier).toBe(tier);
  });
  it('does not round sub-paise, zero, negative, overflow or nondecimal money into a tier',async()=>{
    for(const value of [1000,'1e3','-1000','0','1000.001','NaN','1,000.00','92233720368547758.08'])expect(()=>canonicalRoomPriceMinor(value)).toThrow('PRICE_AUTHORITY_INVALID');
    expect(canonicalRoomPriceMinor('3500.00000')).toBe('350000');
    await fixture.pool.query('UPDATE room_types SET base_price=1000.001 WHERE id=10');
    await expect(reader.forHost(account(),request())).rejects.toMatchObject({code:'PRICE_AUTHORITY_INVALID'});
    await fixture.pool.query('UPDATE room_types SET base_price=999.99 WHERE id=10');
    const below=await reader.forHost(account(),request());expect(()=>classifyRoomOffer(below,release)).toThrow('STRATEGY_UNCLASSIFIED');
  });
  it('uses the selected released intervals and rejects fabricated or inaccessible release evidence',async()=>{
    const snapshot=await reader.forHost(account(),request());const custom=structuredClone(release);
    custom.versions[0].profile.maxPriceMinor='300000';custom.versions[1].profile.minPriceMinor='300000';
    expect(()=>classifyRoomOffer(snapshot,custom)).toThrow('STRATEGY_RELEASE_UNAVAILABLE');
    // A pure contract fixture demonstrates resolver boundaries; runtime profiles
    // must come from readCurrentOfferTierRelease, never an HTTP body.
    const{releaseHash:_hash,...content}=custom;
    expect(classifyRoomOffer(snapshot,{...content,releaseHash:fingerprint(content)}).tier).toBe('COMFORT');
    const client=await runtime.connect();try{await expect(readCurrentOfferTierRelease(client)).rejects.toMatchObject({code:'STRATEGY_RELEASE_UNAVAILABLE'});}finally{client.release();}
  });
  it('fails closed on wrong ownership, cross-property room selectors and legacy admin claims',async()=>{
    await expect(reader.forHost(account(11),request())).rejects.toMatchObject({code:'OFFER_NOT_AVAILABLE'});
    await expect(reader.forHost(account(90),request())).rejects.toMatchObject({code:'OFFER_NOT_AVAILABLE'});
    await expect(reader.forHost(account(),request(20))).rejects.toMatchObject({code:'OFFER_NOT_AVAILABLE'});
    await expect(reader.forHost({...account(),actorKind:'SERVICE'},request())).rejects.toMatchObject({code:'ACCOUNT_REQUIRED'});
    await expect(reader.forHost(account(),{...request(),hostId:10,price:1})).rejects.toMatchObject({code:'INPUT_INVALID'});
  });
  it('does not substitute missing room, unpublished property, currency or canonical landing authority',async()=>{
    await expect(reader.forHost(account(),request(999))).rejects.toMatchObject({code:'OFFER_NOT_AVAILABLE'});
    await fixture.pool.query("UPDATE listings SET publication_status='draft' WHERE id=1");
    await expect(reader.forHost(account(),request())).rejects.toMatchObject({code:'OFFER_NOT_AVAILABLE'});
    await fixture.pool.query("UPDATE listings SET publication_status='published',slug=NULL WHERE id=1");
    await expect(reader.forHost(account(),request())).rejects.toMatchObject({code:'ROOM_AUTHORITY_INVALID'});
    await fixture.pool.query("UPDATE listings SET slug='synthetic-mixed-resort-1' WHERE id=1;UPDATE room_types SET currency='USD' WHERE id=10");
    await expect(reader.forHost(account(),request())).rejects.toMatchObject({code:'PRICE_AUTHORITY_INVALID'});
  });
  it('records missing inventory as unknown while sold-out one-room inventory does not suppress other rooms',async()=>{
    await fixture.pool.query("DELETE FROM inventory_days WHERE room_type_id=10 AND calendar_date='2026-10-02'");
    expect((await reader.forHost(account(),request())).availability).toMatchObject({state:'AUTHORITY_MISSING',minimumAvailableUnits:null,reasons:['INVENTORY_DAY_MISSING']});
    await fixture.pool.query('UPDATE inventory_days SET booked_units=total_units WHERE room_type_id=11');
    expect((await reader.forHost(account(),request(11))).availability).toMatchObject({state:'OBSERVED_UNAVAILABLE',minimumAvailableUnits:0,reasons:['INSUFFICIENT_UNITS']});
    expect((await reader.forHost(account(),request(12))).availability.state).toBe('OBSERVED_AVAILABLE');
  });
  it('does not release expired holds heuristically or fabricate missing capacity',async()=>{
    await fixture.pool.query("UPDATE inventory_days SET held_units=2 WHERE room_type_id=10 AND calendar_date='2026-10-02'");
    const observed=await reader.forHost(account(),request());expect(observed.availability.reasons).toContain('INSUFFICIENT_UNITS');
    expect((await fixture.pool.query("SELECT held_units FROM inventory_days WHERE room_type_id=10 AND calendar_date='2026-10-02'")).rows[0].held_units).toBe(2);
    await fixture.pool.query("UPDATE inventory_days SET listing_id=2 WHERE room_type_id=10 AND calendar_date='2026-10-02'");
    expect((await reader.forHost(account(),request())).availability).toMatchObject({state:'AUTHORITY_MISSING',minimumAvailableUnits:null});
  });
  it('honors ambiguous and mapped legacy blocks without leaking or reallocating other room inventory',async()=>{
    await fixture.pool.query("INSERT INTO room_calendar_blocks(listing_id,room_tier_key,start_date,end_date) VALUES(1,'all','2026-10-02','2026-10-02')");
    expect((await reader.forHost(account(),request())).availability.reasons).toContain('LEGACY_BLOCK_UNRESOLVED');
    await fixture.pool.query("DELETE FROM room_calendar_blocks;INSERT INTO room_calendar_blocks(listing_id,room_tier_key,room_type_id,mapping_status,start_date,end_date) VALUES(1,'suite',11,'mapped','2026-10-02','2026-10-02')");
    expect((await reader.forHost(account(),request())).availability.state).toBe('OBSERVED_AVAILABLE');
    expect((await reader.forHost(account(),request(11))).availability).toMatchObject({state:'OBSERVED_UNAVAILABLE',minimumAvailableUnits:null,reasons:['CALENDAR_BLOCKED']});
  });
  it('validates real dates, checkout exclusion, minimum stay and selected room occupancy',async()=>{
    for(const invalid of [{checkIn:'2026-02-30'},{checkOut:'2026-10-01'},{checkOut:'2027-10-01'},{units:0}])await expect(reader.forHost(account(),{...request(),...invalid})).rejects.toMatchObject({code:'INPUT_INVALID'});
    const oneNight=await reader.forHost(account(),{...request(),checkOut:'2026-10-02'});expect(oneNight.availability.nights.map(n=>n.date)).toEqual(['2026-10-01']);
    await fixture.pool.query('UPDATE room_types SET min_stay_nights=4 WHERE id=10');
    const limited=await reader.forHost(account(),{...request(),guestCount:3});
    expect(limited.availability.reasons).toEqual(['MINIMUM_STAY_NOT_MET','OCCUPANCY_EXCEEDED']);
  });
  it('keeps canonical fact versions stable for scale-only updates and snapshots immutable across source changes',async()=>{
    const first=await reader.forHost(account(),request());
    await fixture.pool.query('UPDATE room_types SET base_price=3500.0000 WHERE id=10');
    expect((await reader.forHost(account(),request())).offer.versionHash).toBe(first.offer.versionHash);
    await fixture.pool.query('UPDATE room_types SET base_price=4000 WHERE id=10');
    const changed=await reader.forHost(account(),request());expect(changed.offer.versionHash).not.toBe(first.offer.versionHash);
    expect(first.offer.price.amountMinor).toBe('350000');expect(Object.isFrozen(first.offer.price)).toBe(true);
    expect(verifyRoomOfferObservation(first).snapshotHash).toBe(first.snapshotHash);
    const tampered=structuredClone(first);tampered.offer.price.amountMinor='1';expect(()=>verifyRoomOfferObservation(tampered)).toThrow('SNAPSHOT_INVALID');
    await expect(runtime.query('UPDATE room_types SET base_price=1')).rejects.toMatchObject({code:'42501'});
    expect((await runtime.query("SELECT current_setting('app.current_user_id',true) AS actor")).rows[0].actor).toBe('');
  });
});
