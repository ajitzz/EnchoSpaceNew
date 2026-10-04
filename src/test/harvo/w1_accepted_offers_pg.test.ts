import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PostgresWorkforceAuthorization} from '../../lib/iam/postgresAuthorization.js';
import {verifyIamCatalog} from '../../server/deployment/iamReadiness.js';
import {AcceptedOfferService,OfferAuthorityError,readPublicOfferAuthority} from '../../server/offers/acceptedOfferService.js';
import {createW1AcceptedOfferFixture,addDays} from './helpers/w1AcceptedOfferFixture.js';

describe('W1 accepted dated sellable offers on isolated PostgreSQL',()=>{
  let fixture:Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>;
  let service:AcceptedOfferService;
  let acceptedOfferId:string;
  let seasonalOfferId:string;
  beforeAll(async()=>{
    fixture=await createW1AcceptedOfferFixture();
    service=new AcceptedOfferService(fixture.hostPool,new PostgresWorkforceAuthorization(fixture.staffPool,'LOCAL'),
      'LOCAL',fixture.staffPool);
    const staff=await fixture.staffPool.connect();
    try{expect((await verifyIamCatalog(staff)).ready).toBe(true);}finally{staff.release();}
  },90000);
  afterAll(async()=>{await fixture?.close();});

  const offerInput=(fixture:Awaited<ReturnType<typeof createW1AcceptedOfferFixture>>,roomTypeId=101,amountMinor='550000')=>({
    commandId:randomUUID(),listingId:roomTypeId===201?2:1,roomTypeId,amountMinor,stayStart:fixture.today,
    stayEnd:addDays(fixture.today,30),effectiveFrom:new Date(Date.now()-3600000).toISOString(),
    effectiveUntil:new Date(Date.now()+30*86400000).toISOString(),maxGuests:2,minNights:1,
  });

  it('migrates a durable draft, exact Host submission and exact scoped staff acceptance',async()=>{
    const host=fixture.principal(10),staff=fixture.principal(90,'STAFF');
    const draft=await service.createDraft(host,offerInput(fixture));
    expect(draft).toMatchObject({revision:1,version:1,status:'DRAFT',amountMinor:'550000'});
    const submitted=await service.submit(host,{offerId:draft.offerId,revision:1,expectedVersion:1});
    expect(submitted).toMatchObject({status:'SUBMITTED',version:2});
    const submissionEvidence=(await fixture.owner.query(`SELECT evidence FROM sellable_offer_events
      WHERE offer_id=$1 AND revision=1 AND event_type='SUBMITTED'`,[draft.offerId])).rows[0].evidence;
    expect(submissionEvidence.inventoryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(submissionEvidence.inventorySqlHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await service.submit(host,{offerId:draft.offerId,revision:1,expectedVersion:1})).status).toBe('SUBMITTED');
    await fixture.grantOffer(draft.offerId);
    expect(await service.listSubmittedForStaff(staff,1)).toContainEqual(expect.objectContaining({offerId:draft.offerId,status:'SUBMITTED'}));
    expect(await service.listSubmittedForStaff(fixture.principal(91,'STAFF'),1)).toEqual([]);
    const accepted=await service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2});
    acceptedOfferId=draft.offerId;
    expect(accepted).toMatchObject({status:'ACCEPTED',version:3});
    expect(await service.listCurrentAcceptedForStaff(staff,1)).toContainEqual(expect.objectContaining({offerId:draft.offerId,status:'ACCEPTED'}));
    const publicResult=await readPublicOfferAuthority(fixture.publicPool,[1],new Date());
    expect(publicResult.eligibleOffers).toContainEqual(expect.objectContaining({offerId:draft.offerId,
      roomTypeId:101,amountMinor:'550000',currency:'INR',priceBasis:'PER_ROOM_NIGHT'}));
    expect((await service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2})).status).toBe('ACCEPTED');
    const events=(await fixture.owner.query(`SELECT event_type,count(*)::int AS count FROM sellable_offer_events
      WHERE offer_id=$1 GROUP BY event_type`,[draft.offerId])).rows;
    expect(events).toEqual(expect.arrayContaining([
      {event_type:'DRAFT_CREATED',count:1},{event_type:'SUBMITTED',count:1},{event_type:'ACCEPTED',count:1}]));
  });

  it('denies foreign hosts, cross-property rooms, self-acceptance, and ungranted staff',async()=>{
    await expect(service.createDraft(fixture.principal(11),offerInput(fixture,101)))
      .rejects.toMatchObject({code:'OFFER_FORBIDDEN',status:403});
    await expect(service.createDraft(fixture.principal(10),{...offerInput(fixture,201),listingId:1}))
      .rejects.toMatchObject({code:'OFFER_ROOM_INVALID'});
    await expect(service.submit(fixture.principal(11),{offerId:acceptedOfferId,revision:1,expectedVersion:3}))
      .rejects.toMatchObject({code:'OFFER_NOT_FOUND'});
    await expect(service.accept(fixture.principal(10),{offerId:acceptedOfferId,revision:1,expectedVersion:3}))
      .rejects.toMatchObject({code:'STAFF_REQUIRED'});
    await expect(service.accept(fixture.principal(91,'STAFF'),{offerId:acceptedOfferId,revision:1,expectedVersion:3}))
      .rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await fixture.grantOffer(acceptedOfferId,10);
    await expect(service.accept(fixture.principal(10,'STAFF'),{offerId:acceptedOfferId,revision:1,expectedVersion:3}))
      .rejects.toMatchObject({code:'OFFER_FORBIDDEN',status:403});
    const selfDraft=await service.createDraft(fixture.principal(10),offerInput(fixture,102,'610000'));
    await service.submit(fixture.principal(10),{offerId:selfDraft.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(selfDraft.offerId,10);
    const ownStaff=fixture.principal(10,'STAFF'),raw=await fixture.staffPool.connect();
    try{
      await raw.query('BEGIN');
      await raw.query(`SELECT set_config('app.current_user_id','10',true),
        set_config('app.organization_id',$1,true),set_config('app.membership_id',$2,true),
        set_config('app.staff_session_id',$3,true),set_config('app.workforce_environment','LOCAL',true)`,
      [ownStaff.organizationId,ownStaff.membershipId,ownStaff.sessionId]);
      await expect(raw.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,
        actor_account_id,actor_membership_id,offer_version,source_hash,evidence)
        SELECT offer_id,revision,'ACCEPTED',10,$2::uuid,3,source_hash,'{}'::jsonb
        FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1`,[selfDraft.offerId,ownStaff.membershipId]))
        .rejects.toThrow(/row-level security|policy/);
      await raw.query('ROLLBACK');
    }finally{raw.release();}
    expect((await fixture.owner.query('SELECT current_accepted_revision FROM sellable_offers WHERE id=$1',
      [selfDraft.offerId])).rows[0].current_accepted_revision).toBeNull();
    await expect(service.createDraft(fixture.principal(10),{...offerInput(fixture),amountMinor:'900719925474100'}))
      .rejects.toMatchObject({code:'INPUT_INVALID',status:400});
  });

  it('stores immutable Host-scoped SaveOfferDraft command receipts',async()=>{
    const commandId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const client=await fixture.hostPool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id','10',true)");
      await client.query(`INSERT INTO sellable_offer_draft_receipts
        (host_account_id,command_id,payload_hash,offer_id,revision,result)
        VALUES(10,$1,$2,$3,1,$4::jsonb)`,
      [commandId,'a'.repeat(64),acceptedOfferId,JSON.stringify({offerId:acceptedOfferId,revision:1,status:'DRAFT',version:1})]);
      expect((await client.query(`SELECT offer_id,revision,result FROM sellable_offer_draft_receipts
        WHERE host_account_id=10 AND command_id=$1`,[commandId])).rows[0])
        .toMatchObject({offer_id:acceptedOfferId,revision:1,
          result:{offerId:acceptedOfferId,revision:1,status:'DRAFT',version:1}});
      await client.query('COMMIT');
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id','11',true)");
      expect((await client.query('SELECT * FROM sellable_offer_draft_receipts')).rows).toEqual([]);
      await expect(client.query(`INSERT INTO sellable_offer_draft_receipts
        (host_account_id,command_id,payload_hash,offer_id,revision,result)
        VALUES(11,$1,$2,$3,1,'{}'::jsonb)`,
      ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b'.repeat(64),acceptedOfferId])).rejects.toThrow();
      await client.query('ROLLBACK');
    }finally{client.release();}
    await expect(fixture.owner.query(`UPDATE sellable_offer_draft_receipts SET payload_hash=$1
      WHERE host_account_id=10 AND command_id=$2`,['b'.repeat(64),commandId]))
      .rejects.toThrow(/SELLABLE_OFFER_EVIDENCE_IMMUTABLE/);
    await expect(fixture.publicPool.query('SELECT * FROM sellable_offer_draft_receipts'))
      .rejects.toThrow(/permission denied/);
    await expect(fixture.staffPool.query('SELECT * FROM sellable_offer_draft_receipts'))
      .rejects.toThrow(/permission denied/);
  });

  it('rejects raw mutation of accepted revisions, audit events, parent identity and unaudited version',async()=>{
    await expect(fixture.owner.query(`UPDATE sellable_offer_revisions SET amount_minor=1
      WHERE offer_id=$1 AND revision=1`,[acceptedOfferId])).rejects.toThrow(/SELLABLE_OFFER_EVIDENCE_IMMUTABLE/);
    await expect(fixture.owner.query(`UPDATE sellable_offer_events SET evidence='{}'
      WHERE offer_id=$1 AND event_type='ACCEPTED'`,[acceptedOfferId])).rejects.toThrow(/SELLABLE_OFFER_EVIDENCE_IMMUTABLE/);
    await expect(fixture.owner.query('UPDATE sellable_offers SET room_type_id=102,version=version+1 WHERE id=$1',
      [acceptedOfferId])).rejects.toThrow(/SELLABLE_OFFER_IDENTITY_OR_VERSION_INVALID/);
    await expect(fixture.owner.query('UPDATE sellable_offers SET version=version+1 WHERE id=$1',
      [acceptedOfferId])).rejects.toThrow(/SELLABLE_OFFER_VERSION_EVENT_REQUIRED/);
    const client=await fixture.hostPool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id','10',true)");
      await expect(client.query('UPDATE sellable_offer_revisions SET amount_minor=1 WHERE offer_id=$1',
        [acceptedOfferId])).rejects.toThrow();
      await client.query('ROLLBACK');
    }finally{client.release();}
    expect((await fixture.owner.query('SELECT amount_minor::text AS amount FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1',
      [acceptedOfferId])).rows[0].amount).toBe('550000');
    await expect(fixture.publicPool.query('SELECT * FROM sellable_offer_events'))
      .rejects.toThrow(/permission denied/);
    await expect(fixture.publicPool.query('SELECT public.sellable_offer_source_snapshot(1,101)'))
      .rejects.toThrow(/permission denied/);
    const safeRow=(await fixture.publicPool.query('SELECT * FROM public.sellable_offer_public_rows(1,101)')).rows[0];
    expect(safeRow).toMatchObject({offer_id:acceptedOfferId,amount_minor:'550000',currency:'INR'});
    expect(JSON.stringify(safeRow)).not.toMatch(/host_account_id|hostAccountId|created_by|source_facts|media_facts/);
    expect(Object.keys(safeRow).sort()).toEqual([
      'amount_minor','currency','effective_from','effective_until','listing_id','max_guests',
      'media_urls','min_nights','offer_id','price_basis','revision','room_type_id','stay_end','stay_start']);
    const mediaSafety=(await fixture.owner.query(`SELECT
      public.sellable_offer_media_url_safe('https://images.example.test/101/1.jpg') AS approved,
      public.sellable_offer_media_url_safe('javascript:alert(1)') AS executable,
      public.sellable_offer_media_url_safe('https://169.254.169.254/secret') AS private_network`)).rows[0];
    expect(mediaSafety).toEqual({approved:true,executable:false,private_network:false});
    await expect(fixture.publicPool.query("SELECT public.sellable_offer_media_url_safe('https://images.example.test/a.jpg')"))
      .rejects.toThrow(/permission denied/);
    await expect(fixture.publicPool.query('SELECT public.sellable_offer_revision_state($1,1)',[acceptedOfferId]))
      .rejects.toThrow(/permission denied/);
    await expect(readPublicOfferAuthority(fixture.hostPool,[1],new Date()))
      .rejects.toMatchObject({code:'OFFER_AUTHORITY_UNAVAILABLE',status:503});
    await fixture.owner.query('GRANT INSERT ON sellable_offer_events TO w1_offer_public');
    try{
      await expect(readPublicOfferAuthority(fixture.publicPool,[1],new Date()))
        .rejects.toMatchObject({code:'OFFER_AUTHORITY_UNAVAILABLE',status:503});
    }finally{await fixture.owner.query('REVOKE INSERT ON sellable_offer_events FROM w1_offer_public');}
    await fixture.owner.query('GRANT SELECT ON sellable_offers TO w1_offer_public');
    try{
      await expect(readPublicOfferAuthority(fixture.publicPool,[1],new Date()))
        .rejects.toMatchObject({code:'OFFER_AUTHORITY_UNAVAILABLE',status:503});
    }finally{await fixture.owner.query('REVOKE SELECT ON sellable_offers FROM w1_offer_public');}
    await expect(readPublicOfferAuthority(fixture.owner,[1],new Date()))
      .rejects.toMatchObject({code:'OFFER_AUTHORITY_UNAVAILABLE',status:503});
  });

  it('fails closed when submitted room or inventory facts change before review',async()=>{
    const host=fixture.principal(10),staff=fixture.principal(90,'STAFF');
    const draft=await service.createDraft(host,offerInput(fixture,102,'620000'));
    await service.submit(host,{offerId:draft.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(draft.offerId);
    await fixture.owner.query("UPDATE room_types SET description='Changed after submission' WHERE id=102");
    await expect(service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW',status:409});
    await fixture.owner.query('UPDATE room_types SET description=NULL WHERE id=102');
    await fixture.owner.query('UPDATE inventory_days SET total_units=2 WHERE room_type_id=102 AND calendar_date=$1::date',
      [fixture.today]);
    await expect(service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW',status:409});
    const raw=await fixture.staffPool.connect();
    try{
      await raw.query('BEGIN');
      await raw.query(`SELECT set_config('app.current_user_id','90',true),
        set_config('app.organization_id',$1,true),set_config('app.membership_id',$2,true),
        set_config('app.staff_session_id',$3,true),set_config('app.workforce_environment','LOCAL',true)`,
      [staff.organizationId,staff.membershipId,staff.sessionId]);
      await raw.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,
        actor_account_id,actor_membership_id,offer_version,source_hash,evidence)
        SELECT offer_id,revision,'ACCEPTED',90,$2::uuid,3,source_hash,'{}'::jsonb
        FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1`,[draft.offerId,staff.membershipId]);
      await expect(raw.query(`UPDATE sellable_offers SET current_accepted_revision=1,
        public_disposition='ACCEPTED',version=3 WHERE id=$1`,[draft.offerId]))
        .rejects.toThrow(/SELLABLE_OFFER_SUBMISSION_INVENTORY_CHANGED/);
      await raw.query('ROLLBACK');
    }finally{raw.release();}
    expect((await fixture.owner.query('SELECT current_accepted_revision FROM sellable_offers WHERE id=$1',
      [draft.offerId])).rows[0].current_accepted_revision).toBeNull();
    await fixture.owner.query('UPDATE inventory_days SET total_units=1 WHERE room_type_id=102 AND calendar_date=$1::date',
      [fixture.today]);
    await fixture.owner.query('UPDATE inventory_days SET held_units=1 WHERE room_type_id=102 AND calendar_date=$1::date',
      [fixture.today]);
    await expect(service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STALE_REVIEW',status:409});
    await fixture.owner.query('UPDATE inventory_days SET held_units=0 WHERE room_type_id=102 AND calendar_date=$1::date',
      [fixture.today]);
    const accepted=await service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2});
    expect(accepted.status).toBe('ACCEPTED');
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).eligibleOffers)
      .toContainEqual(expect.objectContaining({roomTypeId:102,amountMinor:'620000'}));
  });

  it('rejects raw staff acceptance without durable Host submission and unpublished review',async()=>{
    const host=fixture.principal(11),staff=fixture.principal(90,'STAFF');
    const draft=await service.createDraft(host,offerInput(fixture,201,'700000'));
    await fixture.grantOffer(draft.offerId);
    const client=await fixture.staffPool.connect();
    try{
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id','90',true),
        set_config('app.organization_id',$1,true),set_config('app.membership_id',$2,true),
        set_config('app.staff_session_id',$3,true),set_config('app.workforce_environment','LOCAL',true)`,
        [staff.organizationId,staff.membershipId,staff.sessionId]);
      await client.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
        actor_membership_id,offer_version,source_hash,evidence)
        SELECT offer_id,revision,'ACCEPTED',90,$2::uuid,2,source_hash,'{}'::jsonb
        FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1`,[draft.offerId,staff.membershipId]);
      await expect(client.query(`UPDATE sellable_offers SET current_accepted_revision=1,
        public_disposition='ACCEPTED',version=2 WHERE id=$1`,[draft.offerId]))
        .rejects.toThrow(/SELLABLE_OFFER_SUBMISSION_REQUIRED/);
      await client.query('ROLLBACK');
    }finally{client.release();}
    expect((await fixture.owner.query(`SELECT count(*)::int AS count FROM sellable_offer_events
      WHERE offer_id=$1 AND event_type='ACCEPTED'`,[draft.offerId])).rows[0].count).toBe(0);
    await service.submit(host,{offerId:draft.offerId,revision:1,expectedVersion:1});
    const attemptRawAccept=async()=>{
      const raw=await fixture.staffPool.connect();
      try{
        await raw.query('BEGIN');
        await raw.query(`SELECT set_config('app.current_user_id','90',true),
          set_config('app.organization_id',$1,true),set_config('app.membership_id',$2,true),
          set_config('app.staff_session_id',$3,true),set_config('app.workforce_environment','LOCAL',true)`,
        [staff.organizationId,staff.membershipId,staff.sessionId]);
        await raw.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
          actor_membership_id,offer_version,source_hash,evidence)
          SELECT offer_id,revision,'ACCEPTED',90,$2::uuid,3,source_hash,'{}'::jsonb
          FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1`,[draft.offerId,staff.membershipId]);
        await expect(raw.query(`UPDATE sellable_offers SET current_accepted_revision=1,
          public_disposition='ACCEPTED',version=3 WHERE id=$1`,[draft.offerId]))
          .rejects.toThrow(/SELLABLE_OFFER_CURRENT_AUTHORITY_INVALID/);
      }finally{await raw.query('ROLLBACK');raw.release();}
    };
    await fixture.owner.query("UPDATE listings SET publication_status='draft' WHERE id=2");
    await expect(service.accept(staff,{offerId:draft.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_PROPERTY_INELIGIBLE'});
    await attemptRawAccept();
    expect((await readPublicOfferAuthority(fixture.publicPool,[2],new Date())).eligibleOffers).toEqual([]);
    await fixture.owner.query("UPDATE listings SET publication_status='published' WHERE id=2");
    await fixture.owner.query("UPDATE room_types SET description='Changed after Host submission' WHERE id=201");
    await attemptRawAccept();
    await fixture.owner.query('UPDATE room_types SET description=NULL WHERE id=201');
    const orphan=await fixture.staffPool.connect();
    try{
      await orphan.query('BEGIN');
      await orphan.query(`SELECT set_config('app.current_user_id','90',true),
        set_config('app.organization_id',$1,true),set_config('app.membership_id',$2,true),
        set_config('app.staff_session_id',$3,true),set_config('app.workforce_environment','LOCAL',true)`,
      [staff.organizationId,staff.membershipId,staff.sessionId]);
      await orphan.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,actor_account_id,
        actor_membership_id,offer_version,source_hash,evidence)
        SELECT offer_id,revision,'ACCEPTED',90,$2::uuid,3,source_hash,'{}'::jsonb
        FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1`,[draft.offerId,staff.membershipId]);
      await expect(orphan.query('COMMIT')).rejects.toThrow(/SELLABLE_OFFER_EVENT_PARENT_MISMATCH/);
      await orphan.query('ROLLBACK');
    }finally{orphan.release();}
    expect((await fixture.owner.query(`SELECT current_accepted_revision FROM sellable_offers
      WHERE id=$1`,[draft.offerId])).rows[0].current_accepted_revision).toBeNull();
    expect((await fixture.owner.query(`SELECT count(*)::int AS count FROM sellable_offer_events
      WHERE offer_id=$1 AND event_type='ACCEPTED'`,[draft.offerId])).rows[0].count).toBe(0);

    const orphanHostDraft=await service.createDraft(host,offerInput(fixture,201,'720000'));
    const rawHost=await fixture.hostPool.connect();
    try{
      await rawHost.query('BEGIN');
      await rawHost.query("SELECT set_config('app.current_user_id','11',true)");
      await rawHost.query(`INSERT INTO sellable_offer_events(offer_id,revision,event_type,
        actor_account_id,offer_version,source_hash,evidence)
        SELECT offer_id,revision,'SUBMITTED',11,2,source_hash,'{}'::jsonb
        FROM sellable_offer_revisions WHERE offer_id=$1 AND revision=1`,[orphanHostDraft.offerId]);
      await expect(rawHost.query('COMMIT')).rejects.toThrow(/SELLABLE_OFFER_EVENT_PARENT_MISMATCH/);
      await rawHost.query('ROLLBACK');
    }finally{rawHost.release();}
    expect((await service.readForHost(host,orphanHostDraft.offerId))[0].status).toBe('DRAFT');
  });

  it('keeps accepted revision 1 public until immutable successor revision 2 is accepted',async()=>{
    const host=fixture.principal(10),staff=fixture.principal(90,'STAFF');
    const successor=await service.createDraft(host,{...offerInput(fixture,101,'600000'),offerId:acceptedOfferId,expectedVersion:3});
    expect(successor).toMatchObject({revision:2,status:'DRAFT',version:4});
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).eligibleOffers)
      .toContainEqual(expect.objectContaining({offerId:acceptedOfferId,revision:1,amountMinor:'550000'}));
    await service.submit(host,{offerId:acceptedOfferId,revision:2,expectedVersion:4});
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).eligibleOffers)
      .toContainEqual(expect.objectContaining({offerId:acceptedOfferId,revision:1,amountMinor:'550000'}));
    const accepted=await service.accept(staff,{offerId:acceptedOfferId,revision:2,expectedVersion:5});
    expect(accepted).toMatchObject({revision:2,status:'ACCEPTED',amountMinor:'600000',version:6});
    const revisions=await service.readForHost(host,acceptedOfferId);
    expect(revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({revision:1,status:'SUPERSEDED',amountMinor:'550000'}),
      expect.objectContaining({revision:2,status:'ACCEPTED',amountMinor:'600000'})]));
    const superseded=(await fixture.owner.query(`SELECT e.source_hash,r.source_hash AS expected
      FROM sellable_offer_events e JOIN sellable_offer_revisions r USING(offer_id,revision)
      WHERE e.offer_id=$1 AND e.event_type='SUPERSEDED'`,[acceptedOfferId])).rows[0];
    expect(superseded.source_hash).toBe(superseded.expected);
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).eligibleOffers)
      .toContainEqual(expect.objectContaining({offerId:acceptedOfferId,revision:2,amountMinor:'600000'}));
    await fixture.owner.query("UPDATE media_assets SET url='https://images.example.test/101/review-changed.jpg' WHERE room_type_id=101 AND category='bedroom'");
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).states)
      .toContainEqual(expect.objectContaining({roomTypeId:101,offerId:null,state:'OFFER_STALE_REVIEW'}));
    await fixture.owner.query("UPDATE media_assets SET url='https://images.example.test/101/1.jpg' WHERE room_type_id=101 AND category='bedroom'");
  });

  it('rejects overlapping independent same-room offers but permits disjoint dated scopes',async()=>{
    const host=fixture.principal(10),staff=fixture.principal(90,'STAFF');
    const overlapping=await service.createDraft(host,offerInput(fixture,101,'100000'));
    await service.submit(host,{offerId:overlapping.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(overlapping.offerId);
    await expect(service.accept(staff,{offerId:overlapping.offerId,revision:1,expectedVersion:2}))
      .rejects.toMatchObject({code:'OFFER_STATE_CONFLICT',status:409});
    const seasonal=await service.createDraft(host,{...offerInput(fixture,101,'750000'),
      stayStart:addDays(fixture.today,31),stayEnd:addDays(fixture.today,60)});
    seasonalOfferId=seasonal.offerId;
    await service.submit(host,{offerId:seasonal.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(seasonal.offerId);
    expect((await service.accept(staff,{offerId:seasonal.offerId,revision:1,expectedVersion:2})).status).toBe('ACCEPTED');
    const publicOffers=(await readPublicOfferAuthority(fixture.publicPool,[1],new Date())).eligibleOffers;
    expect(publicOffers.filter(offer=>offer.roomTypeId===101)).toEqual(expect.arrayContaining([
      expect.objectContaining({offerId:acceptedOfferId,amountMinor:'600000'}),
      expect.objectContaining({offerId:seasonal.offerId,amountMinor:'750000'})]));
    expect(publicOffers.some(offer=>offer.offerId===overlapping.offerId)).toBe(false);
  });

  it('distinguishes future effective, expiry, retirement and unavailable inventory',async()=>{
    const now=new Date(),staff=fixture.principal(90,'STAFF');
    const before=new Date(now.valueOf()-2*3600000);
    const future=(await readPublicOfferAuthority(fixture.publicPool,[1],before)).states;
    expect(future).toContainEqual(expect.objectContaining({roomTypeId:101,state:'OFFER_NOT_YET_EFFECTIVE'}));
    const expired=(await readPublicOfferAuthority(fixture.publicPool,[1],new Date(now.valueOf()+31*86400000))).states;
    expect(expired).toContainEqual(expect.objectContaining({roomTypeId:101,state:'OFFER_EXPIRED'}));
    const futureDraft=await service.createDraft(fixture.principal(11),{...offerInput(fixture,201,'710000'),
      effectiveFrom:new Date(now.valueOf()+86400000).toISOString()});
    await service.submit(fixture.principal(11),{offerId:futureDraft.offerId,revision:1,expectedVersion:1});
    await fixture.grantOffer(futureDraft.offerId);
    expect((await service.accept(staff,{offerId:futureDraft.offerId,revision:1,expectedVersion:2})).status).toBe('ACCEPTED');
    expect((await fixture.publicPool.query('SELECT * FROM public.sellable_offer_public_rows(2,201)')).rows).toEqual([]);
    expect((await fixture.publicPool.query('SELECT public.sellable_offer_public_state(2,201) AS state')).rows[0].state)
      .toBe('OFFER_NOT_YET_EFFECTIVE');
    await fixture.owner.query("UPDATE media_assets SET url='https://images.example.test/101/stale.jpg' WHERE room_type_id=101 AND category='bedroom'");
    expect((await fixture.publicPool.query('SELECT * FROM public.sellable_offer_public_rows(1,101)')).rows).toEqual([]);
    expect((await fixture.publicPool.query('SELECT public.sellable_offer_public_state(1,101) AS state')).rows[0].state)
      .toBe('OFFER_STALE_REVIEW');
    await fixture.owner.query("UPDATE media_assets SET url='https://images.example.test/101/1.jpg' WHERE room_type_id=101 AND category='bedroom'");
    await fixture.owner.query('UPDATE inventory_days SET held_units=1 WHERE room_type_id=102');
    expect((await fixture.publicPool.query('SELECT * FROM public.sellable_offer_public_rows(1,102)')).rows).toEqual([]);
    const stockless=await readPublicOfferAuthority(fixture.publicPool,[1],now);
    expect(stockless.states).toContainEqual(expect.objectContaining({roomTypeId:102,state:'ROOM_UNAVAILABLE'}));
    await fixture.owner.query('UPDATE inventory_days SET held_units=0 WHERE room_type_id=102');
    await fixture.owner.query(`INSERT INTO room_calendar_blocks(listing_id,room_tier_key,room_name,start_date,end_date,mapping_status)
      VALUES(1,'legacy','Royal Suite',$1::date,$1::date,'unmapped')`,[fixture.today]);
    expect((await readPublicOfferAuthority(fixture.publicPool,[1],now)).states)
      .toContainEqual(expect.objectContaining({roomTypeId:102,state:'LEGACY_DATA_UNRECONCILED'}));
    await fixture.owner.query("DELETE FROM room_calendar_blocks WHERE room_tier_key='legacy'");
    const retired=await service.retire(staff,{offerId:acceptedOfferId,revision:2,expectedVersion:6});
    expect(retired).toMatchObject({status:'RETIRED',version:7});
    const withSeasonal=await readPublicOfferAuthority(fixture.publicPool,[1],new Date());
    expect(withSeasonal.states).toContainEqual(expect.objectContaining({offerId:seasonalOfferId,state:'VERIFIED_OFFER_AVAILABLE'}));
    await service.retire(staff,{offerId:seasonalOfferId,revision:1,expectedVersion:3});
    const publicAfter=await readPublicOfferAuthority(fixture.publicPool,[1],new Date());
    expect(publicAfter.states).toContainEqual(expect.objectContaining({roomTypeId:101,offerId:null,state:'OFFER_RETIRED'}));
    expect(publicAfter.eligibleOffers.some(offer=>offer.offerId===acceptedOfferId)).toBe(false);
    await expect(fixture.publicPool.query('SELECT * FROM sellable_offers')).rejects.toThrow(/permission denied/);
    await expect(fixture.publicPool.query('SELECT * FROM sellable_offer_revisions')).rejects.toThrow(/permission denied/);
    await expect(fixture.publicPool.query('SELECT * FROM sellable_offer_events')).rejects.toThrow(/permission denied/);
  });
});
