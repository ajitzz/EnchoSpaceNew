// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import HostCalendar from '../../../components/HostCalendar.js';
import {MetricsPanel,MediaBudgetMeter,CampaignProgress} from '../../../components/marketing/StudioShared.js';
import {marketingRequest} from '../../../components/marketing/api.js';
import type {StudioCampaign} from '../../../components/marketing/types.js';
import type {Listing} from '../../../types.js';
const auth=vi.hoisted(()=>({token:'host-a'}));
vi.mock('../../../components/AuthContext.js',()=>({useAuth:()=>auth}));
vi.mock('../../../components/marketing/api.js',async importOriginal=>({...await importOriginal<typeof import('../../../components/marketing/api.js')>(),marketingRequest:vi.fn()}));
const listing=(id:number,title:string)=>({id,title} as unknown as Listing);
const properties=[listing(20,'Lake House'),listing(21,'Hill House')];
const calendar=(listingId:number,guestName:string)=>({listingId,observedAt:new Date().toISOString(),rooms:[{id:listingId,name:`Room ${listingId}`,inventoryCount:2}],days:[],blocks:[],bookings:[{id:listingId,guestName,startDate:'2026-09-20',endDate:'2026-09-22',status:'confirmed',totalPrice:'1000.00'}]});
const response=(payload:unknown,status=200)=>({ok:status===200,status,json:async()=>payload} as Response);
const campaign=():StudioCampaign=>({id:1,revision:2,listingId:20,title:'Lake House',provider:'GOOGLE',status:'PROVIDER_REVIEW',startDate:'2026-09-01',mediaBudgetMinor:'100000',ai:{status:'PASSED',score:9,notes:[]},quote:{currency:'INR',costMinor:'100000',markupPercent:5,profitMinor:'5000',totalMinor:'105000',status:'ACCEPTED',lines:[]},funding:{status:'CAPTURED',capturedMinor:'105000',reservedMinor:'100000',released:true},contentApproval:{status:'APPROVED',revision:2},delivery:{configuredStatus:'ACTIVE',observedStatus:'ACTIVE',observedAt:new Date().toISOString(),externalCampaignId:'provider-1',deliveryConfirmed:false},blockers:[],metrics:{impressions:100,clicks:2,ctr:0.02,leads:null,bookings:null,spendMinor:'20000',currency:'INR',source:'GOOGLE',dateStart:'2026-09-01',dateEnd:'2026-09-20',observedAt:new Date().toISOString(),dataAsOf:null,report:{status:'AVAILABLE',attemptedAt:new Date().toISOString(),dateStart:'2026-09-01',dateEnd:'2026-09-20'}}});
beforeEach(()=>{auth.token='host-a';vi.mocked(marketingRequest).mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('private calendar selection boundaries',()=>{
 it('discards a late response from the previous property',async()=>{
  let first!:(response:Response)=>void;
  const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;})).mockResolvedValueOnce(response(calendar(21,'Hill guest')));vi.stubGlobal('fetch',fetcher);
  render(React.createElement(HostCalendar,{listings:properties}));
  fireEvent.change(screen.getByLabelText('Property'),{target:{value:'21'}});
  await screen.findByText('Hill guest');await act(async()=>first(response(calendar(20,'Lake guest'))));
  expect(screen.queryByText('Lake guest')).toBeNull();expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
 });
 it('clears private data on logout and failed refresh',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(response(calendar(20,'Private guest'))).mockResolvedValueOnce(response({error:'Not authorized'},403));vi.stubGlobal('fetch',fetcher);
  const view=render(React.createElement(HostCalendar,{listings:properties}));await screen.findByText('Private guest');
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByRole('alert');expect(screen.queryByText('Private guest')).toBeNull();
  auth.token='';view.rerender(React.createElement(HostCalendar,{listings:properties}));expect(screen.getByText('Sign in to view your private calendar.')).toBeTruthy();
 });
 it('keeps a stable mutation identity after an uncertain response',async()=>{
  const payload=calendar(20,'Guest');const fetcher=vi.fn().mockResolvedValue(response(payload));vi.stubGlobal('fetch',fetcher);
  render(React.createElement(HostCalendar,{listings:properties}));await screen.findByText('Guest');
  fireEvent.change(screen.getByLabelText('Room type'),{target:{value:'20'}});
  fetcher.mockRejectedValueOnce(new Error('Connection interrupted'));
  fireEvent.click(screen.getByRole('button',{name:'Block one room'}));await screen.findByText('Connection interrupted');
  fireEvent.click(screen.getByRole('button',{name:'Block one room'}));await waitFor(()=>expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(2));
  const requests=fetcher.mock.calls.filter(call=>call[1]?.method==='POST');expect(requests[0][1].body).toBe(requests[1][1].body);
  expect(JSON.parse(requests[0][1].body).roomTypeId).toBe(20);
 });
});
describe('campaign evidence and budget truth',()=>{
 it('explains no-report while keeping unavailable attribution distinct from zero',()=>{
  const value=campaign();value.metrics!.report!.status='NO_REPORT';render(React.createElement(MetricsPanel,{campaign:value}));
  expect(screen.getByText('Waiting for the first network report')).toBeTruthy();expect(screen.getByText('Verified attributed bookings').parentElement?.textContent).toContain('—');expect(screen.getByText('Guest inquiries').parentElement?.textContent).toContain('—');expect(screen.getByText('2.00%')).toBeTruthy();
  expect(screen.getByText(/network has not confirmed how current/)).toBeTruthy();
 });
 it.each([{currency:'USD'},{dateStart:'2026-09-03'}])('does not display a budget percentage for incompatible evidence %j',change=>{
  const value=campaign();Object.assign(value.metrics!,change);render(React.createElement(MediaBudgetMeter,{campaign:value}));expect(screen.queryByRole('progressbar')).toBeNull();
 });
 it('bounds the meter and discloses an overage without inventing a host liability or refund',()=>{
  const value=campaign();value.metrics!.spendMinor='120000';render(React.createElement(MediaBudgetMeter,{campaign:value}));expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');expect(screen.getByRole('alert').textContent).toContain('reconcile the overage');expect(screen.getByText(/not a refundable balance/)).toBeTruthy();
 });
 it('does not mark configured ACTIVE as confirmed delivery',()=>{
  render(React.createElement(CampaignProgress,{campaign:campaign()}));const gate=screen.getByText('Delivery confirmation').closest('li');expect(gate?.classList.contains('is-complete')).toBe(false);
 });
 it('requests a revision-bound observation without publishing or duplicating the click',async()=>{
  let finish!:(value:unknown)=>void;vi.mocked(marketingRequest).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(React.createElement(MetricsPanel,{campaign:campaign()}));fireEvent.click(screen.getByRole('button',{name:'Refresh network evidence'}));
  expect((screen.getByRole('button',{name:'Requesting…'}) as HTMLButtonElement).disabled).toBe(true);
  expect(marketingRequest).toHaveBeenCalledWith('/campaigns/1/refresh',{method:'POST',body:JSON.stringify({revision:2})});
  await act(async()=>finish({status:'RUNNING',jobId:'read-1',coalesced:true}));expect(screen.getByText(/existing refresh is running/)).toBeTruthy();expect(marketingRequest).toHaveBeenCalledTimes(1);
 });
});
