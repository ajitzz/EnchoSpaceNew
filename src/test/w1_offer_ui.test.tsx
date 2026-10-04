import React from 'react';
import {createRequire} from 'node:module';
import {afterAll,afterEach,describe,expect,it,vi} from 'vitest';
import type {Listing} from '../../types.js';

const{JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://encho.test/host'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('navigator',dom.window.navigator);
vi.stubGlobal('HTMLElement',dom.window.HTMLElement);vi.stubGlobal('MutationObserver',dom.window.MutationObserver);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const{cleanup,fireEvent,render,screen,waitFor}=await import('@testing-library/react');
const{HostAcceptedOfferPanel}=await import('../../components/offers/HostAcceptedOfferPanel.js');
const{AdminAcceptedOfferReview}=await import('../../components/offers/AdminAcceptedOfferReview.js');
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);
  vi.stubGlobal('navigator',dom.window.navigator);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);
  vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);});
afterAll(()=>dom.window.close());

describe('W1 Host and staff offer controls',()=>{
  it('creates a draft against the selected canonical ID when two rooms share one name',async()=>{
    const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      if(url.includes('/rooms'))return json({rooms:[{id:101,name:'Royal Suite',capacity:2,min_stay_nights:1},
        {id:102,name:'Royal Suite',capacity:3,min_stay_nights:2}]});
      if(url.includes('/drafts'))return json({offerId:'22222222-2222-4222-8222-222222222222',revision:1,version:1,status:'DRAFT'});
      return json([]);
    });vi.stubGlobal('fetch',fetch);
    render(<HostAcceptedOfferPanel listingId={7} publicationStatus="published" token="host-session"/>);
    await screen.findByRole('option',{name:'Royal Suite · #102'});
    fireEvent.change(screen.getByLabelText('Canonical room'),{target:{value:'102'}});
    fireEvent.change(screen.getByLabelText('Proposed room-night price (INR)'),{target:{value:'6200'}});
    fireEvent.change(screen.getByLabelText('Stay start'),{target:{value:'2099-01-01'}});
    fireEvent.change(screen.getByLabelText('Stay end (exclusive)'),{target:{value:'2099-01-04'}});
    fireEvent.change(screen.getByLabelText('Effective from'),{target:{value:'2098-12-01'}});
    fireEvent.change(screen.getByLabelText('Effective until (exclusive)'),{target:{value:'2099-01-03'}});
    fireEvent.click(screen.getByRole('button',{name:'Save draft revision'}));
    await waitFor(()=>expect(fetch.mock.calls.some(call=>String(call[0]).includes('/drafts'))).toBe(true));
    const draftCall=fetch.mock.calls.find(call=>String(call[0]).includes('/drafts'))!;
    expect(JSON.parse(String(draftCall[1]?.body))).toMatchObject({roomTypeId:102,amountMinor:'620000',maxGuests:3,minNights:2});
    expect(JSON.parse(String(draftCall[1]?.body))).toMatchObject({effectiveFrom:'2098-11-30T18:30:00.000Z',effectiveUntil:'2099-01-02T18:30:00.000Z'});
    expect(JSON.parse(String(draftCall[1]?.body))).not.toHaveProperty('hostAccountId');
  });

  it('reuses the same draft command ID after an unknown network outcome',async()=>{
    let draftAttempts=0;
    const fetch=vi.fn(async(input:RequestInfo|URL,_init?:RequestInit)=>{
      const url=String(input);
      if(url.includes('/rooms'))return json({rooms:[{id:101,name:'Royal Suite',capacity:2,min_stay_nights:1}]});
      if(url.includes('/drafts')){
        draftAttempts++;
        if(draftAttempts===1)throw new Error('Connection lost after possible commit');
        return json({offerId:'22222222-2222-4222-8222-222222222222',revision:1,version:1,status:'DRAFT'});
      }
      return json([]);
    });
    vi.stubGlobal('fetch',fetch);
    render(<HostAcceptedOfferPanel listingId={8} publicationStatus="published" token="host-session"/>);
    await screen.findByRole('option',{name:'Royal Suite · #101'});
    fireEvent.change(screen.getByLabelText('Canonical room'),{target:{value:'101'}});
    fireEvent.change(screen.getByLabelText('Proposed room-night price (INR)'),{target:{value:'5500'}});
    fireEvent.change(screen.getByLabelText('Stay start'),{target:{value:'2099-01-01'}});
    fireEvent.change(screen.getByLabelText('Stay end (exclusive)'),{target:{value:'2099-01-04'}});
    fireEvent.change(screen.getByLabelText('Effective from'),{target:{value:'2098-12-01'}});
    fireEvent.change(screen.getByLabelText('Effective until (exclusive)'),{target:{value:'2099-01-03'}});
    const save=screen.getByRole('button',{name:'Save draft revision'});
    fireEvent.click(save);
    await screen.findByText(/draft outcome is unknown/i);
    fireEvent.click(save);
    await waitFor(()=>expect(draftAttempts).toBe(2));
    const calls=fetch.mock.calls.filter(call=>String(call[0]).includes('/drafts'));
    const first=JSON.parse(String(calls[0][1]?.body)),second=JSON.parse(String(calls[1][1]?.body));
    expect(first.commandId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    expect(second.commandId).toBe(first.commandId);
  });

  it('accepts a displayed exact revision through the staff cookie command boundary',async()=>{
    const offer={offerId:'11111111-1111-4111-8111-111111111111',listingId:7,roomTypeId:101,revision:7,
      version:3,status:'SUBMITTED',amountMinor:'550000',currency:'INR',priceBasis:'ROOM_NIGHT',
      stayStart:'2099-01-01',stayEnd:'2099-01-04',effectiveFrom:'2098-12-01',effectiveUntil:'2099-01-03',
      maxGuests:2,minNights:1,sourceHash:'a'.repeat(64),mediaHash:'b'.repeat(64)};
    const fetch=vi.fn(async(input:RequestInfo|URL,_init?:RequestInit)=>json(String(input).endsWith('/accepted')?[]:
      String(input).endsWith('/accept')?{...offer,status:'ACCEPTED'}:[offer]));
    vi.stubGlobal('fetch',fetch);
    render(<AdminAcceptedOfferReview listings={[{id:7,title:'Wayanad Estate'} as unknown as Listing]}/>);
    fireEvent.change(screen.getByLabelText('Property ID'),{target:{value:'7'}});
    await screen.findByRole('button',{name:'Accept exact revision'});
    fireEvent.click(screen.getByRole('button',{name:'Accept exact revision'}));
    await waitFor(()=>expect(fetch.mock.calls.some(call=>String(call[0]).endsWith('/accept'))).toBe(true));
    const call=fetch.mock.calls.find(call=>String(call[0]).endsWith('/accept'))!;
    expect(String(call[0])).toContain(`/offers/${offer.offerId}/revisions/7/accept`);
    expect(call[1]).toMatchObject({credentials:'include',headers:{'X-Encho-Workforce-Command':'1'}});
    expect(JSON.parse(String(call[1]?.body))).toEqual({expectedVersion:3});
    expect((call[1]?.headers as Record<string,string>).Authorization).toBeUndefined();
  });

  it('explains a stale submitted revision using the service error code',async()=>{
    const offer={offerId:'11111111-1111-4111-8111-111111111111',listingId:7,roomTypeId:101,revision:7,
      version:3,status:'SUBMITTED',amountMinor:'550000',currency:'INR',priceBasis:'PER_ROOM_NIGHT',
      stayStart:'2099-01-01',stayEnd:'2099-01-04',effectiveFrom:'2098-12-01T00:00:00+05:30',
      effectiveUntil:'2099-01-03T00:00:00+05:30',maxGuests:2,minNights:1,
      sourceHash:'a'.repeat(64),mediaHash:'b'.repeat(64)};
    const fetch=vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/accept')
      ?new Response(JSON.stringify({code:'OFFER_STALE_REVIEW'}),{status:409,headers:{'Content-Type':'application/json'}})
      :json(String(input).endsWith('/accepted')?[]:[offer]));
    vi.stubGlobal('fetch',fetch);
    render(<AdminAcceptedOfferReview listings={[]}/>);
    fireEvent.change(screen.getByLabelText('Property ID'),{target:{value:'7'}});
    fireEvent.click(await screen.findByRole('button',{name:'Accept exact revision'}));
    expect(await screen.findByRole('status')).toHaveProperty('textContent',
      'Submitted facts changed. The Host must create and submit a fresh revision.');
  });

  it('requires an explicit second action before retiring the current accepted revision',async()=>{
    const offer={offerId:'22222222-2222-4222-8222-222222222222',listingId:7,roomTypeId:102,revision:2,
      version:5,status:'ACCEPTED',amountMinor:'620000',currency:'INR',priceBasis:'PER_ROOM_NIGHT',
      stayStart:'2099-02-01',stayEnd:'2099-02-05',effectiveFrom:'2099-01-01T00:00:00+05:30',
      effectiveUntil:'2099-02-05T00:00:00+05:30',maxGuests:3,minNights:2,
      sourceHash:'a'.repeat(64),mediaHash:'b'.repeat(64)};
    const fetch=vi.fn(async(input:RequestInfo|URL,_init?:RequestInit)=>json(String(input).endsWith('/submitted')?[]:
      String(input).endsWith('/retire')?{...offer,status:'RETIRED'}:[offer]));
    vi.stubGlobal('fetch',fetch);
    render(<AdminAcceptedOfferReview listings={[]}/>);
    fireEvent.change(screen.getByLabelText('Property ID'),{target:{value:'7'}});
    fireEvent.click(await screen.findByRole('button',{name:'Retire exact revision'}));
    expect(fetch.mock.calls.some(call=>String(call[0]).endsWith('/retire'))).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'Confirm retirement'}));
    await waitFor(()=>expect(fetch.mock.calls.some(call=>String(call[0]).endsWith('/retire'))).toBe(true));
    const call=fetch.mock.calls.find(call=>String(call[0]).endsWith('/retire'))!;
    expect(String(call[0])).toContain(`/offers/${offer.offerId}/revisions/2/retire`);
    expect(JSON.parse(String(call[1]?.body))).toEqual({expectedVersion:5});
  });
});
