import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {iamRolloutGrants} from '../../../server/deployment/iamReadiness.js';
import {applyIsolatedMigration} from './isolatedMigration.js';
import {createLocalPostgresFixture} from '../postgres.js';

const organizationId='00000000-0000-4000-8000-000000000001';
const reviewerMembershipId='11111111-1111-4111-8111-111111111111';
const reviewerSessionId='22222222-2222-4222-8222-222222222222';
const foreignMembershipId='33333333-3333-4333-8333-333333333333';
const foreignSessionId='44444444-4444-4444-8444-444444444444';
const hostMembershipId='55555555-5555-4555-8555-555555555555';
const hostSessionId='66666666-6666-4666-8666-666666666666';
const staffToken=`wfs_${Buffer.alloc(32,0x51).toString('base64url')}`;
const foreignStaffToken=`wfs_${Buffer.alloc(32,0x52).toString('base64url')}`;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const mediaUrl=(room:number,n:number)=>`https://images.example.test/${room}/${n}.jpg`;
const indiaDate=(instant:Date)=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const value=(kind:string)=>parts.find(part=>part.type===kind)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
export const addDays=(day:string,count:number)=>new Date(Date.parse(`${day}T00:00:00Z`)+count*86400000).toISOString().slice(0,10);

/** Isolated, real PostgreSQL W1 schema. No external DATABASE_URL is read. */
export async function createW1AcceptedOfferFixture(options:{serverCompatible?:boolean}={}){
  const local=await createLocalPostgresFixture({schema:'empty'});
  let migratorPool:pg.Pool|undefined,hostPool:pg.Pool|undefined,staffPool:pg.Pool|undefined,publicPool:pg.Pool|undefined;
  try{
    await local.pool.query(`
      CREATE TABLE users(id INT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL,is_active BOOLEAN NOT NULL DEFAULT true);
      CREATE TABLE listings(id INT PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id),title TEXT NOT NULL,
        slug TEXT NOT NULL,publication_status TEXT NOT NULL,price NUMERIC NOT NULL,currency TEXT NOT NULL);
      CREATE TABLE room_calendar_blocks(id SERIAL PRIMARY KEY,listing_id INT NOT NULL REFERENCES listings(id),
        room_tier_key TEXT NOT NULL,room_name TEXT,start_date DATE NOT NULL,end_date DATE NOT NULL);
      CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        checksum TEXT NOT NULL);
    `);
    for(const file of ['003_canonical_room_and_media_authority.sql','004_canonical_constraints.sql',
      '005_inventory_days_and_atomic_holds.sql','006_legacy_calendar_block_mapping.sql']){
      await applyIsolatedMigration(local.pool,file);
    }
    await local.pool.query(`
      CREATE ROLE w1_offer_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      GRANT USAGE,CREATE ON SCHEMA public TO w1_offer_migrator;
      GRANT SELECT,INSERT,UPDATE ON schema_migrations TO w1_offer_migrator;
      GRANT REFERENCES ON users,listings,room_types TO w1_offer_migrator;
      GRANT SELECT ON users,listings,room_types,media_assets,inventory_days,room_calendar_blocks TO w1_offer_migrator;
      GRANT UPDATE ON room_types,media_assets,inventory_days,room_calendar_blocks TO w1_offer_migrator;
    `);
    migratorPool=new pg.Pool({...local.pool.options,user:'w1_offer_migrator'});
    await applyIsolatedMigration(migratorPool,'036_internal_organization_iam.sql');
    await applyIsolatedMigration(migratorPool,'049_accepted_sellable_offers.sql');
    if(options.serverCompatible)await local.pool.query(`
      ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT 'Fixture user';
      ALTER TABLE users ADD COLUMN password_hash TEXT;
      ALTER TABLE users ADD COLUMN phone TEXT;
      ALTER TABLE users ADD COLUMN avatar TEXT;
      ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
      ALTER TABLE listings ADD COLUMN description TEXT;
      ALTER TABLE listings ADD COLUMN type TEXT NOT NULL DEFAULT 'Villa';
      ALTER TABLE listings ADD COLUMN address TEXT;
      ALTER TABLE listings ADD COLUMN city TEXT NOT NULL DEFAULT 'Jaipur';
      ALTER TABLE listings ADD COLUMN country TEXT DEFAULT 'India';
      ALTER TABLE listings ADD COLUMN image_url TEXT;
      ALTER TABLE listings ADD COLUMN image_urls JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE listings ADD COLUMN photos JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE listings ADD COLUMN rooms JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE listings ADD COLUMN max_guests INT DEFAULT 3;
      ALTER TABLE listings ADD COLUMN bedrooms INT DEFAULT 2;
      ALTER TABLE listings ADD COLUMN beds INT DEFAULT 2;
      ALTER TABLE listings ADD COLUMN bathrooms INT DEFAULT 1;
      ALTER TABLE listings ADD COLUMN amenities JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE listings ADD COLUMN amenity_clusters JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE listings ADD COLUMN child_safety_specs JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE listings ADD COLUMN nearby JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE listings ADD COLUMN lat NUMERIC DEFAULT 26.9124;
      ALTER TABLE listings ADD COLUMN lng NUMERIC DEFAULT 75.7873;
      ALTER TABLE listings ADD COLUMN dynamic_pricing JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE listings ADD COLUMN seo_title TEXT;
      ALTER TABLE listings ADD COLUMN seo_description TEXT;
      ALTER TABLE listings ADD COLUMN seo_keywords TEXT;
      ALTER TABLE listings ADD COLUMN seo_image_url TEXT;
      ALTER TABLE listings ADD COLUMN hero_video_url TEXT;
      ALTER TABLE listings ADD COLUMN hero_fallback_url TEXT;
      ALTER TABLE listings ADD COLUMN dominant_color_hex TEXT;
      ALTER TABLE listings ADD COLUMN raw_rules TEXT;
      ALTER TABLE listings ADD COLUMN curated_guidelines TEXT;
      ALTER TABLE listings ADD COLUMN experience_tags JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE listings ADD COLUMN concierge_privileges TEXT;
      ALTER TABLE listings ADD COLUMN host_philosophy TEXT;
      ALTER TABLE listings ADD COLUMN brand TEXT;
      ALTER TABLE listings ADD COLUMN brand_font TEXT;
      ALTER TABLE listings ADD COLUMN brand_color TEXT;
      ALTER TABLE listings ADD COLUMN video_url TEXT;
      ALTER TABLE listings ADD COLUMN rental_mode TEXT NOT NULL DEFAULT 'private_rooms';
      ALTER TABLE listings ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
      CREATE TABLE calendar_prices(id SERIAL PRIMARY KEY,listing_id INT,date DATE,price NUMERIC,offer_id INT);
      CREATE TABLE listings_drafts(id SERIAL PRIMARY KEY,host_id INT,published_listing_id INT,status TEXT,draft_data JSONB);
    `);
    await local.pool.query(`
      INSERT INTO users(id,email,role) VALUES
        (10,'host-a@example.test','user'),(11,'host-b@example.test','user'),
        (90,'reviewer@example.test','admin'),(91,'foreign@example.test','admin');
      INSERT INTO listings(id,user_id,title,slug,publication_status,price,currency) VALUES
        (1,10,'Amber House','amber-house','published',999,'INR'),
        (2,11,'Blue House','blue-house','published',700,'INR');
      INSERT INTO room_types(id,listing_id,name,type,base_price,currency,max_occupancy,inventory_count,min_stay_nights)
      VALUES (101,1,'Royal Suite','suite',5,'INR',3,1,1),
        (102,1,'Royal Suite','suite',7,'INR',3,1,1),
        (201,2,'Royal Suite','suite',1,'INR',3,1,1);
      INSERT INTO media_assets(entity_type,entity_id,room_type_id,url,category,moderation_status,is_sleeping_area)
      SELECT 'listing',CASE WHEN room_id=201 THEN 2 ELSE 1 END,room_id,
        'https://images.example.test/'||room_id||'/'||n||'.jpg',
        CASE WHEN n=1 THEN 'bedroom' ELSE 'interior' END,'approved',n=1
      FROM unnest(ARRAY[101,102,201]) AS room_id CROSS JOIN generate_series(1,3) AS n;
      CREATE ROLE w1_offer_host LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE w1_offer_staff LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      CREATE ROLE w1_offer_public LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      GRANT USAGE ON SCHEMA public TO w1_offer_host,w1_offer_staff,w1_offer_public;
      GRANT SELECT ON users,listings,room_types,media_assets,inventory_days,room_calendar_blocks
        TO w1_offer_host,w1_offer_staff,w1_offer_public;
      GRANT UPDATE ON listings TO w1_offer_host,w1_offer_staff;
      GRANT SELECT,INSERT,UPDATE ON sellable_offers TO w1_offer_host;
      GRANT SELECT,INSERT ON sellable_offer_revisions,sellable_offer_events TO w1_offer_host;
      GRANT SELECT,INSERT ON sellable_offer_draft_receipts TO w1_offer_host;
      GRANT SELECT,UPDATE ON sellable_offers TO w1_offer_staff;
      GRANT SELECT ON sellable_offer_revisions TO w1_offer_staff;
      GRANT SELECT,INSERT ON sellable_offer_events TO w1_offer_staff;
      GRANT EXECUTE ON FUNCTION sellable_offer_public_rows(INT,INT) TO w1_offer_public;
      GRANT EXECUTE ON FUNCTION sellable_offer_source_snapshot(INT,INT) TO w1_offer_host,w1_offer_staff;
      GRANT EXECUTE ON FUNCTION sellable_offer_public_state(INT,INT) TO w1_offer_public;
      GRANT EXECUTE ON FUNCTION sellable_offer_lock_evidence(INT,INT,DATE,DATE,UUID) TO w1_offer_host,w1_offer_staff;
      GRANT EXECUTE ON FUNCTION internal_iam_current_organization_id(),internal_iam_current_membership_id(),
        internal_iam_has_permission(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT)
        TO w1_offer_host,w1_offer_staff;
    `);
    for(const statement of iamRolloutGrants('w1_offer_staff'))await local.pool.query(statement);
    await local.pool.query(`
      INSERT INTO internal_organization_memberships(id,organization_id,user_id,status,accepted_at,changed_by,change_reason)
      VALUES ('${reviewerMembershipId}','${organizationId}',90,'ACTIVE',clock_timestamp(),90,'Fixture reviewer membership.'),
        ('${foreignMembershipId}','${organizationId}',91,'ACTIVE',clock_timestamp(),90,'Fixture foreign staff membership.'),
        ('${hostMembershipId}','${organizationId}',10,'ACTIVE',clock_timestamp(),90,'Fixture dual Host and staff membership.');
      INSERT INTO internal_staff_sessions(id,organization_id,membership_id,token_hash,status,assurance_level,
        authenticated_at,idle_expires_at,absolute_expires_at,environment)
      VALUES ('${reviewerSessionId}','${organizationId}','${reviewerMembershipId}','${digest(staffToken)}','ACTIVE','AAL2',
        clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours','LOCAL'),
        ('${foreignSessionId}','${organizationId}','${foreignMembershipId}','${digest(foreignStaffToken)}','ACTIVE','AAL2',
        clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours','LOCAL'),
        ('${hostSessionId}','${organizationId}','${hostMembershipId}',repeat('c',64),'ACTIVE','AAL2',
        clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '4 hours','LOCAL');
    `);
    const today=indiaDate(new Date());
    await local.pool.query(`INSERT INTO inventory_days(listing_id,room_type_id,calendar_date,total_units)
      SELECT CASE WHEN room_id=201 THEN 2 ELSE 1 END,room_id,$1::date+n,1
      FROM unnest(ARRAY[101,102,201]) AS room_id CROSS JOIN generate_series(0,89) AS n`,[today]);
    hostPool=new pg.Pool({...local.pool.options,user:'w1_offer_host'});
    staffPool=new pg.Pool({...local.pool.options,user:'w1_offer_staff'});
    publicPool=new pg.Pool({...local.pool.options,user:'w1_offer_public'});
    const principal=(accountId:number,actorKind:'ACCOUNT'|'STAFF'='ACCOUNT')=>({accountId,actorKind,
      assuranceLevel:(actorKind==='STAFF'?'AAL2':'AAL1') as 'AAL1'|'AAL2',
      ...(actorKind==='STAFF'?{organizationId,membershipId:accountId===90?reviewerMembershipId:
        accountId===10?hostMembershipId:foreignMembershipId,
        sessionId:accountId===90?reviewerSessionId:accountId===10?hostSessionId:foreignSessionId}:{}),
      authenticatedAt:new Date().toISOString(),correlationId:randomUUID(),operationId:randomUUID()});
    const grantOffer=async(offerId:string,accountId=90)=>{
      const membershipId=accountId===90?reviewerMembershipId:accountId===10?hostMembershipId:foreignMembershipId;
      const version=(await local.pool.query(`SELECT v.id FROM internal_role_versions v
        JOIN internal_role_definitions r ON r.id=v.role_id WHERE r.role_key='offer_reviewer' AND v.version=1`)).rows[0].id;
      await local.pool.query(`INSERT INTO internal_membership_grants(organization_id,membership_id,role_version_id,
        scope_type,scope_id,environment,grant_hash,granted_by,reason)
        VALUES($1,$2,$3,'OFFER',$4,'LOCAL',$5,90,'Fixture exact offer review authority.')`,
        [organizationId,membershipId,version,offerId,randomUUID().replaceAll('-','').padEnd(64,'a'),]);
    };
    const close=async()=>{await Promise.all([migratorPool?.end(),hostPool?.end(),staffPool?.end(),publicPool?.end()]);await local.close();};
    const socketPath=String(local.pool.options.host),port=Number(local.pool.options.port);
    const urlFor=(role:'w1_offer_host'|'w1_offer_staff'|'w1_offer_public')=>
      `postgresql://${role}@localhost/postgres?host=${encodeURIComponent(socketPath)}&port=${port}`;
    return {owner:local.pool,hostPool,staffPool,publicPool,principal,grantOffer,today,
      staffToken,foreignStaffToken,socketPath,port,urlFor,mediaUrl,close};
  }catch(error){await Promise.all([migratorPool?.end(),hostPool?.end(),staffPool?.end(),publicPool?.end()]);await local.close();throw error;}
}
