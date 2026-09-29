// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {RecoveryPanel} from '../../../components/marketing/RecoveryPanel.js';
import HostCalendar from '../../../components/HostCalendar.js';
import {MetricsPanel,MediaBudgetMeter,CampaignProgress,DeliveryEvidence,DeliveryStatusBadge,PortfolioOutcomesSummary,normalizeMediaMeterEvidence} from '../../../components/marketing/StudioShared.js';
import CampaignStudio from '../../../components/marketing/CampaignStudio.js';
import {marketingRequest,MarketingRequestError} from '../../../components/marketing/api.js';
import type {StudioCampaign} from '../../../components/marketing/types.js';
import type {Listing} from '../../../types.js';
const auth=vi.hoisted(()=>({token:'host-a'}));
vi.mock('../../../components/AuthContext.js',()=>({useAuth:()=>auth}));
vi.mock('../../../components/marketing/api.js',async importOriginal=>({...await importOriginal<typeof import('../../../components/marketing/api.js')>(),marketingRequest:vi.fn()}));
const listing=(id:number,title:string)=>({id,title} as unknown as Listing);
const properties=[listing(20,'Lake House'),listing(21,'Hill House')];
const calendar=(listingId:number,guestName:string)=>({listingId,observedAt:new Date().toISOString(),rooms:[{id:listingId,name:`Room ${listingId}`,inventoryCount:2}],days:[],blocks:[],bookings:[{id:listingId,guestName,startDate:'2026-09-20',endDate:'2026-09-22',status:'confirmed',totalPrice:'1000.00'}]});
const response=(payload:unknown,status=200)=>({ok:status===200,status,json:async()=>payload} as Response);
const campaign=():StudioCampaign=>({id:1,revision:2,listingId:20,title:'Lake House',provider:'GOOGLE',status:'PROVIDER_REVIEW',startDate:'2026-09-01',endDate:'2026-09-30',mediaBudgetMinor:'100000',ai:{status:'PASSED',score:9,notes:[]},quote:{currency:'INR',costMinor:'100000',markupPercent:5,profitMinor:'5000',totalMinor:'105000',status:'ACCEPTED',lines:[]},funding:{status:'CAPTURED',capturedMinor:'105000',reservedMinor:'100000',released:true},contentApproval:{status:'APPROVED',revision:2},delivery:{submitted:true,configuredStatus:'ACTIVE',observedStatus:'ACTIVE',observedAt:new Date().toISOString(),externalCampaignId:'provider-1',deliveryConfirmed:false,readiness:'ELIGIBLE'},blockers:[],metrics:{campaignId:1,revision:2,budgetBasisMinor:'100000',impressions:100,clicks:2,ctr:0.02,leads:null,bookings:null,spendMinor:'20000',currency:'INR',source:'GOOGLE',accountTimeZone:'Asia/Kolkata',dateStart:'2026-09-01',dateEnd:'2026-09-20',observedAt:new Date().toISOString(),dataAsOf:null,report:{status:'AVAILABLE',attemptedAt:new Date().toISOString(),dateStart:'2026-09-01',dateEnd:'2026-09-20'}}});
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
 it('shows page-scoped distinct canonical outcomes without implying additive bookings or zero on missing verification',()=>{
  const verified={source:'CANONICAL_CHECKOUT' as const,scope:'CURRENT_WORKSPACE_PAGE' as const,completeness:'RECORDED_VERIFIED_EVENTS_ONLY' as const,observedAt:new Date().toISOString(),activeAttributedBookings:'2',capturedBookings:'1',fulfilledStays:'1',cancelledBookings:'1',refundedBookings:'0'};
  const view=render(React.createElement(PortfolioOutcomesSummary,{evidence:verified}));
  expect(screen.getByRole('region',{name:'Current page booking outcomes'})).toBeTruthy();
  expect(screen.getByText('Distinct attributed bookings').parentElement?.textContent).toContain('2');
  expect(screen.getByText('Captured bookings').parentElement?.textContent).toContain('1');
  expect(screen.getByText('Fulfilled stays').parentElement?.textContent).toContain('1');
  expect(screen.getByText(/stages of the same booking, not totals to add/)).toBeTruthy();
  expect(screen.getByText(/Attribution does not prove the ad caused the booking/)).toBeTruthy();
  view.unmount();
  render(React.createElement(PortfolioOutcomesSummary,{}));
  expect(screen.getByText('Distinct attributed bookings').parentElement?.textContent).toContain('—');
  expect(screen.getByRole('status').textContent).toContain('does not mean zero');
 });
 it('explains no-report while keeping unavailable attribution distinct from zero',()=>{
  const value=campaign();value.metrics!.report!.status='NO_REPORT';render(React.createElement(MetricsPanel,{campaign:value}));
  expect(screen.getAllByText('No new network report · older report retained').length).toBeGreaterThan(0);expect(screen.getByText('Verified attributed bookings').parentElement?.textContent).toContain('—');expect(screen.getByText('Recorded guest inquiries').parentElement?.textContent).toContain('—');expect(screen.getByText('2.00%')).toBeTruthy();
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
  const value=campaign();value.delivery.externalCampaignId=null;
  render(React.createElement(MetricsPanel,{campaign:value}));fireEvent.click(screen.getByRole('button',{name:'Refresh network evidence'}));
  expect((screen.getByRole('button',{name:'Requesting…'}) as HTMLButtonElement).disabled).toBe(true);
  expect(marketingRequest).toHaveBeenCalledWith('/campaigns/1/refresh',{method:'POST',body:JSON.stringify({revision:2})});
  await act(async()=>finish({status:'RUNNING',jobId:'read-1',coalesced:true}));expect(screen.getByText(/existing refresh is running/)).toBeTruthy();expect(marketingRequest).toHaveBeenCalledTimes(1);
 });
});


describe('status freshness and bounded administrator recovery',()=>{
 it('shows an external identity only in the administrative evidence view',()=>{
  const value=campaign();
  const view=render(React.createElement(DeliveryEvidence,{campaign:value}));
  expect(screen.queryByText('provider-1')).toBeNull();
  view.rerender(React.createElement(DeliveryEvidence,{campaign:value,showProviderIdentity:true}));
  expect(screen.getByText('provider-1')).toBeTruthy();
 });
 it('shows eligibility separately from live delivery and failed refreshes',()=>{
  const value=campaign();value.delivery.readiness='ELIGIBLE';value.delivery.statusCheck='AVAILABLE';
  const view=render(React.createElement(DeliveryEvidence,{campaign:value}));expect(screen.getByText('Eligible at the network')).toBeTruthy();
  value.delivery.statusCheck='ERROR';value.delivery.statusAttemptedAt=new Date().toISOString();view.rerender(React.createElement(DeliveryEvidence,{campaign:value}));
  expect(screen.getByText('Status refresh needs attention')).toBeTruthy();expect(screen.queryByText('Eligible at the network')).toBeNull();
  expect(screen.getByText(/previous observation above is retained/)).toBeTruthy();
 });
 it('does not show old or future-dated eligibility as current',()=>{
  const value=campaign();value.delivery.readiness='ELIGIBLE';value.delivery.observedAt='2000-01-01T00:00:00Z';
  const view=render(React.createElement(DeliveryEvidence,{campaign:value}));expect(screen.getByText('Waiting for current network status')).toBeTruthy();
  value.delivery.observedAt='2999-01-01T00:00:00Z';view.rerender(React.createElement(DeliveryEvidence,{campaign:value}));expect(screen.queryByText('Eligible at the network')).toBeNull();
 });
 it('allows an explicit new request identity only after a known terminal inspection',async()=>{
  vi.mocked(marketingRequest).mockResolvedValueOnce({revision:2,assessment:'QUARANTINED_REVIEW_REQUIRED',observedAt:new Date().toISOString(),entities:[],jobs:[],operations:[{id:1,provider:'META',operation_type:'PAUSE',publish_status:'COMMITTED'}],nextSteps:[]});
  render(React.createElement(RecoveryPanel,{campaignId:1,revision:2}));fireEvent.click(screen.getByRole('button',{name:'Inspect recovery'}));
  const reason=await screen.findByLabelText('Investigation reason');fireEvent.change(reason,{target:{value:'Investigated the original committed pause and fresh provider evidence.'}});
  vi.mocked(marketingRequest).mockRejectedValueOnce(new MarketingRequestError('Inspection timed out','RECOVERY_READ_TIMEOUT'));
  fireEvent.click(screen.getByRole('button',{name:'Verify and record paused state'}));
  fireEvent.click(await screen.findByRole('button',{name:'Start a new inspection after reviewing the evidence'}));
  vi.mocked(marketingRequest).mockResolvedValueOnce({id:'receipt-2'});fireEvent.click(screen.getByRole('button',{name:'Verify and record paused state'}));
  await screen.findByText(/Paused state recovered/);
  const calls=vi.mocked(marketingRequest).mock.calls.filter(call=>call[1]?.method==='POST');expect(calls).toHaveLength(2);expect(calls[0][1]?.headers).not.toEqual(calls[1][1]?.headers);
 });
 it('requires an investigation reason and preserves the request key after a lost recovery response',async()=>{
  const data={revision:2,observedAt:new Date().toISOString(),assessment:'QUARANTINED_REVIEW_REQUIRED',quoteId:null,automaticRetryAllowed:false,truncated:false,nextSteps:['Inspect original operation'],jobs:[],entities:[],operations:[{id:1,provider:'META',operation_type:'PAUSE',publish_status:'COMMITTED',correlation_id:'original-job'}]};
  vi.mocked(marketingRequest).mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('Response interrupted')).mockResolvedValueOnce({id:'recorded-receipt'});
  render(React.createElement(RecoveryPanel,{campaignId:1,revision:2}));fireEvent.click(screen.getByRole('button',{name:'Inspect recovery'}));
  await screen.findByText('Recover a recorded successful pause');const button=screen.getByRole('button',{name:'Verify and record paused state'}) as HTMLButtonElement;expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Investigation reason'),{target:{value:'Inspected the original committed pause receipt.'}});fireEvent.click(button);
  await screen.findByText('Response interrupted');fireEvent.click(button);await screen.findByRole('status');
  const calls=vi.mocked(marketingRequest).mock.calls.filter(call=>call[1]?.method==='POST');expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);expect(calls[0][0]).toBe('/admin/campaigns/1/recovery/adopt-pause');
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual({revision:2,reason:'Inspected the original committed pause receipt.'});
 });
});

it('distinguishes recorded zero inquiries from unavailable canonical booking evidence',()=>{
 const value={...campaign(),firstPartyOutcomes:{source:'ENCHO_CONSENTED_EVENTS',scope:'CAMPAIGN_ALL_REVISIONS',completeness:'RECORDED_EVENTS_ONLY',observedAt:new Date().toISOString(),propertyVisits:'12',inquiries:'0',unreadMessages:'0',bookings:null,lastInquiryAt:null}} as StudioCampaign;
 render(React.createElement(MetricsPanel,{campaign:value}));
 expect(screen.getByText('Recorded guest inquiries').parentElement?.textContent).toContain('0');
 expect(screen.getByText('Verified attributed bookings').parentElement?.textContent).toContain('—');
 expect(screen.getByText(/they do not include every visitor or booking/)).toBeTruthy();
});

describe('F0 truthful media budget meter evidence normalization and presentation', () => {
  it('distinguishes NO_REPORT, NOT_STARTED, and ERROR states from available numeric meter', () => {
    // NOT_STARTED
    const notStarted = campaign();
    notStarted.metrics!.report!.status = 'NOT_STARTED';
    const { unmount: u1 } = render(React.createElement(MediaBudgetMeter, { campaign: notStarted }));
    expect(screen.getByText('Campaign reporting has not started.')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    u1();

    // ERROR
    const errorCamp = campaign();
    errorCamp.metrics!.spendMinor = null;
    errorCamp.metrics!.report!.status = 'ERROR';
    const { unmount: u2 } = render(React.createElement(MediaBudgetMeter, { campaign: errorCamp }));
    expect(screen.getByText(/Report refresh needs attention/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    u2();

    // NO_REPORT
    const noReportCamp = campaign();
    noReportCamp.metrics!.spendMinor = null;
    noReportCamp.metrics!.report!.status = 'NO_REPORT';
    const { unmount: u3 } = render(React.createElement(MediaBudgetMeter, { campaign: noReportCamp }));
    expect(screen.getByText(/Waiting for the first network report/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    u3();
  });

  it('retains a compatible older total when a later network poll returns no rows', () => {
    const value = campaign();
    value.metrics!.report!.status = 'NO_REPORT';
    const evidence = normalizeMediaMeterEvidence(value);
    expect(evidence.status).toBe('STALE');
    expect(evidence.reportedSpendMinor).toBe('20000');
    const { unmount } = render(React.createElement(MetricsPanel, { campaign: value }));
    expect(screen.getAllByText('No new network report · older report retained').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹200.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/The network returned no new report/)).toBeTruthy();
    expect(screen.queryByText(/because the network report exceeds the freshness threshold/)).toBeNull();
    unmount();

    value.metrics!.revision = 3;
    render(React.createElement(MetricsPanel, { campaign: value }));
    expect(screen.getByText('Reported media spend').parentElement?.textContent).toContain('—');
    expect(screen.getByText('Impressions').parentElement?.textContent).toContain('—');
  });

  it('accurately normalizes explicit network zero (REPORTED_ZERO) with 0.0% utilization and clear confirmation', () => {
    const zeroSpend = campaign();
    zeroSpend.metrics!.spendMinor = '0';
    render(React.createElement(MediaBudgetMeter, { campaign: zeroSpend }));
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('0.0%')).toBeTruthy();
    expect(screen.getByText(/Provider reported ₹0.00 for/)).toBeTruthy();
  });

  it('calculates exact BigInt paise basis points for positive spend', () => {
    const camp = campaign();
    camp.mediaBudgetMinor = '100000'; // ₹1,000.00
    camp.metrics!.spendMinor = '33333'; // ₹333.33 -> 33.33% -> 33.3%
    render(React.createElement(MediaBudgetMeter, { campaign: camp }));
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('33.33');
    expect(screen.getByText('33.3%')).toBeTruthy();
  });

  it('correctly handles downward provider correction without state corruption', () => {
    const camp = campaign();
    camp.metrics!.spendMinor = '50000'; // 50%
    const view = render(React.createElement(MediaBudgetMeter, { campaign: camp }));
    expect(screen.getByText('50.0%')).toBeTruthy();

    // Provider reconciles/corrects cost downwards to 45000
    const corrected = campaign();
    corrected.metrics!.spendMinor = '45000';
    view.rerender(React.createElement(MediaBudgetMeter, { campaign: corrected }));
    expect(screen.getByText('45.0%')).toBeTruthy();
  });

  it('handles paise edge cases (1 paise) and large budget amounts without numeric loss', () => {
    // 1 paise spend
    const edgeCamp = campaign();
    edgeCamp.mediaBudgetMinor = '10000000'; // ₹100,000.00
    edgeCamp.metrics!.budgetBasisMinor = '10000000';
    edgeCamp.metrics!.spendMinor = '1'; // 1 paise
    const { unmount: u1 } = render(React.createElement(MediaBudgetMeter, { campaign: edgeCamp }));
    expect(screen.getByText('0.0%')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText(/₹0.01 reported \/ ₹1,00,000.00 media plan/)).toBeTruthy();
    u1();

    // Large amount (₹100M budget, ₹50M spend)
    const largeCamp = campaign();
    largeCamp.mediaBudgetMinor = '10000000000'; // 10,000,000,000 paise = ₹100,000,000
    largeCamp.metrics!.budgetBasisMinor = '10000000000';
    largeCamp.metrics!.spendMinor = '5000000000'; // 5,000,000,000 paise = ₹50,000,000
    const { unmount: u2 } = render(React.createElement(MediaBudgetMeter, { campaign: largeCamp }));
    expect(screen.getByText('50.0%')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText(/₹5,00,00,000.00 reported \/ ₹10,00,00,000.00 media plan/)).toBeTruthy();
    u2();
  });

  it('marks report older than freshness threshold as stale historical evidence with timestamp', () => {
    const staleCamp = campaign();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    staleCamp.metrics!.observedAt = thirtyMinAgo;
    render(React.createElement(MediaBudgetMeter, { campaign: staleCamp, freshnessWindowMs: 20 * 60 * 1000 }));
    expect(screen.getByText('Media budget (Older report)')).toBeTruthy();
    expect(screen.getByText('Older report · refresh pending')).toBeTruthy();
    expect(screen.getByText(/Older report · refresh pending \(Last successful report:.*Current utilization is unavailable/)).toBeTruthy();
    expect(screen.getAllByText(/Last successful report/).length).toBeGreaterThan(0);
  });

  it('renders financial separation: reported spend, accepted host charge, and confirmed refundable', () => {
    const fundedCamp = campaign();
    fundedCamp.mediaBudgetMinor = '100000';
    fundedCamp.metrics!.spendMinor = '20000';
    fundedCamp.funding = {
      status: 'CAPTURED',
      capturedMinor: '115000',
      reservedMinor: '100000',
      refundableMinor: '30000',
      released: true,
    };
    render(React.createElement(MediaBudgetMeter, { campaign: fundedCamp }));
    expect(screen.getByText(/₹200.00 reported \/ ₹1,000.00 media plan/)).toBeTruthy();
    expect(screen.getByText(/Accepted host charge: ₹1,150.00 \(includes media, fees & taxes under accepted quote\)/)).toBeTruthy();
    expect(screen.getByText(/Finance-confirmed refundable amount: ₹300.00 \(verified by finance settlement\)/)).toBeTruthy();
  });

  it('renders desired vs observed delivery state separately', () => {
    const stateCamp = campaign();
    stateCamp.delivery = {
      submitted: true,
      configuredStatus: 'PAUSE_REQUESTED',
      observedStatus: 'ACTIVE',
      observedAt: new Date().toISOString(),
      deliveryConfirmed: true,
    };
    render(React.createElement(MediaBudgetMeter, { campaign: stateCamp }));
    expect(screen.getByText(/Network delivery status: Requested \(Pause requested\) · Confirmed \(Active\)/i)).toBeTruthy();
  });

  it('supports host A/B account switching without cross-contamination', () => {
    const hostACamp = campaign();
    hostACamp.id = 101;
    hostACamp.metrics!.campaignId = 101;
    hostACamp.title = 'Host A Resort';
    hostACamp.mediaBudgetMinor = '100000';
    hostACamp.metrics!.budgetBasisMinor = '100000';
    hostACamp.metrics!.spendMinor = '40000';

    const hostBCamp = campaign();
    hostBCamp.id = 202;
    hostBCamp.metrics!.campaignId = 202;
    hostBCamp.title = 'Host B Villa';
    hostBCamp.mediaBudgetMinor = '200000';
    hostBCamp.metrics!.budgetBasisMinor = '200000';
    hostBCamp.metrics!.spendMinor = '0';

    const view = render(React.createElement(MediaBudgetMeter, { campaign: hostACamp }));
    expect(screen.getByText('40.0%')).toBeTruthy();
    expect(screen.getByText(/₹400.00 reported \/ ₹1,000.00 media plan/)).toBeTruthy();

    view.rerender(React.createElement(MediaBudgetMeter, { campaign: hostBCamp }));
    expect(screen.getByText('0.0%')).toBeTruthy();
    expect(screen.getByText(/₹0.00 reported \/ ₹2,000.00 media plan/)).toBeTruthy();
    expect(screen.getByText(/Provider reported ₹0.00 for/)).toBeTruthy();
  });

  it('supports 360px mobile and desktop responsive views with accessible progressbar properties', () => {
    const camp = campaign();
    camp.metrics!.spendMinor = '60000';

    // Simulate 360px mobile
    window.innerWidth = 360;
    const view = render(React.createElement(MediaBudgetMeter, { campaign: camp }));
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-label')).toBe('Reported media budget consumed');
    expect(bar.getAttribute('aria-valuetext')).toContain('₹600.00 reported against ₹1,000.00 planned media');

    // Simulate desktop
    window.innerWidth = 1280;
    view.rerender(React.createElement(MediaBudgetMeter, { campaign: camp }));
    expect(screen.getByText('60.0%')).toBeTruthy();
  });

  it('pure normalization function enforces version, currency and window compatibility', () => {
    const base = campaign();
    const result = normalizeMediaMeterEvidence(base);
    expect(result.status).toBe('AVAILABLE');
    expect(result.isAvailable).toBe(true);
    expect(result.utilizationPercent).toBe(20);
    expect(result.currency).toBe('INR');

    // Incompatible currency
    const badCurrency = campaign();
    badCurrency.metrics!.currency = 'EUR';
    const rCurrency = normalizeMediaMeterEvidence(badCurrency);
    expect(rCurrency.status).toBe('MISMATCH');
    expect(rCurrency.isAvailable).toBe(false);
    expect(rCurrency.mismatchReason).toContain('EUR');

    // Incompatible window
    const badWindow = campaign();
    badWindow.metrics!.dateStart = '2026-09-10';
    const rWindow = normalizeMediaMeterEvidence(badWindow);
    expect(rWindow.status).toBe('MISMATCH');
    expect(rWindow.isAvailable).toBe(false);
    expect(rWindow.mismatchReason).toContain('2026-09-10');
  });

  it('renders compact MediaBudgetMeter for portfolio cards truthfully without large narrative paragraphs', () => {
    const camp = campaign();
    camp.mediaBudgetMinor = '200000'; // ₹2,000.00
    camp.metrics!.budgetBasisMinor = '200000';
    camp.metrics!.spendMinor = '80000'; // ₹800.00 -> 40.0%
    const { unmount } = render(React.createElement(MediaBudgetMeter, { campaign: camp, compact: true }));

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(screen.getByText('40.0%')).toBeTruthy();
    expect(screen.getByText(/₹800.00 \/ ₹2,000.00/)).toBeTruthy();
    // Confirms large detail paragraphs are omitted in compact mode
    expect(screen.queryByText(/Media spend excludes Encho fees/)).toBeNull();
    unmount();
  });

  it('renders four simultaneous flight fixtures distinctly without cross-flight contamination (R6-02 F2)', () => {
    // Flight 1: Active Progressing
    const f1 = campaign();
    f1.id = 1;
    f1.metrics!.campaignId = 1;
    f1.title = 'Flight 1 · Active Monsoon';
    f1.mediaBudgetMinor = '100000';
    f1.metrics!.budgetBasisMinor = '100000';
    f1.metrics!.spendMinor = '45000'; // 45.0%

    // Flight 2: Review-pending / reporting not started
    const f2 = campaign();
    f2.id = 2;
    f2.metrics!.campaignId = 2;
    f2.title = 'Flight 2 · Review Pending';
    f2.metrics!.report!.status = 'NOT_STARTED';

    // Flight 3: Stale older report (> 20 min)
    const f3 = campaign();
    f3.id = 3;
    f3.metrics!.campaignId = 3;
    f3.title = 'Flight 3 · Stale Weekend';
    f3.metrics!.spendMinor = '30000';
    f3.metrics!.observedAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    // Flight 4: Paused with explicit provider zero and refundable funds
    const f4 = campaign();
    f4.id = 4;
    f4.metrics!.campaignId = 4;
    f4.title = 'Flight 4 · Paused Zero';
    f4.delivery = {
      submitted: true,
      configuredStatus: 'PAUSED',
      observedStatus: 'PAUSED',
      observedAt: new Date().toISOString(),
      deliveryConfirmed: true,
    };
    f4.metrics!.spendMinor = '0';
    f4.funding = {
      status: 'CAPTURED',
      capturedMinor: '100000',
      reservedMinor: '0',
      refundableMinor: '100000',
      released: false,
    };

    const flights = [f1, f2, f3, f4];
    const { unmount } = render(
      React.createElement('div', { 'data-testid': 'portfolio-grid' },
        flights.map(fl =>
          React.createElement('div', { key: fl.id, 'data-testid': `card-${fl.id}` },
            React.createElement('h4', null, fl.title),
            React.createElement(MediaBudgetMeter, { campaign: fl, compact: true })
          )
        )
      )
    );

    // Assert Flight 1
    const card1 = screen.getByTestId('card-1');
    expect(card1.textContent).toContain('45.0%');
    expect(card1.textContent).toContain('₹450.00 / ₹1,000.00');

    // Assert Flight 2
    const card2 = screen.getByTestId('card-2');
    expect(card2.textContent).toContain('Campaign reporting has not started');
    expect(card2.querySelector('[role="progressbar"]')).toBeNull();

    // Assert Flight 3
    const card3 = screen.getByTestId('card-3');
    expect(card3.textContent).toContain('Media (Older report)');
    expect(card3.textContent).toContain('Refresh pending');

    // Assert Flight 4
    const card4 = screen.getByTestId('card-4');
    expect(card4.textContent).toContain('0.0%');
    expect(card4.textContent).toContain('Reported ₹0.00 (delayed)');
    expect(card4.textContent).toContain('Refundable');
    expect(card4.textContent).toContain('₹1,000.00');

    unmount();
  });

  it('enforces provider source binding (rejects GOOGLE_ADS_API source on META campaign as MISMATCH)', () => {
    const metaCamp = campaign();
    metaCamp.provider = 'META';
    metaCamp.metrics!.source = 'GOOGLE_ADS_API';
    const result = normalizeMediaMeterEvidence(metaCamp);
    expect(result.status).toBe('MISMATCH');
    expect(result.isAvailable).toBe(false);
    expect(result.mismatchReason).toContain('Report source (GOOGLE_ADS_API) does not match Meta provider.');
  });

  it('validates ordinary in-progress flight with future-ended schedule and account-timezone boundary', () => {
    const liveCamp = campaign();
    liveCamp.startDate = '2026-09-01';
    liveCamp.endDate = '2026-10-31'; // Future-ended flight
    liveCamp.metrics!.dateStart = '2026-09-01';
    liveCamp.metrics!.dateEnd = '2026-09-29'; // In-progress observation window
    liveCamp.metrics!.accountTimeZone = 'Asia/Kolkata';

    const rLive = normalizeMediaMeterEvidence(liveCamp);
    expect(rLive.status).toBe('AVAILABLE');
    expect(rLive.isAvailable).toBe(true);

    // Date window missing dateEnd
    liveCamp.metrics!.dateEnd = null;
    const rMissing = normalizeMediaMeterEvidence(liveCamp);
    expect(rMissing.status).toBe('MISMATCH');
    expect(rMissing.mismatchReason).toContain('Report flight end date is missing.');

    // Inverted window: dateStart after dateEnd
    liveCamp.metrics!.dateStart = '2026-09-30';
    liveCamp.metrics!.dateEnd = '2026-09-20';
    const rInverted = normalizeMediaMeterEvidence(liveCamp);
    expect(rInverted.status).toBe('MISMATCH');
    expect(rInverted.mismatchReason).toContain('cannot be after end date');

    // Report window exceeding scheduled campaign endDate (+1 day timezone buffer)
    liveCamp.metrics!.dateStart = '2026-09-01';
    liveCamp.metrics!.dateEnd = '2026-11-05';
    const rExceed = normalizeMediaMeterEvidence(liveCamp);
    expect(rExceed.status).toBe('MISMATCH');
    expect(rExceed.mismatchReason).toContain('exceeds scheduled campaign end date');
  });

  it('enforces server-owned report identity (campaignId, revision, budgetBasisMinor, source)', () => {
    // Typed revision mismatch
    const campRev = campaign();
    campRev.revision = 3;
    campRev.metrics!.revision = 2;
    const rRev = normalizeMediaMeterEvidence(campRev);
    expect(rRev.status).toBe('MISMATCH');
    expect(rRev.mismatchReason).toContain('Report revision (2) does not match campaign revision (3).');

    // Campaign ID mismatch
    const campId = campaign();
    campId.id = 1;
    campId.metrics!.campaignId = 99;
    const rId = normalizeMediaMeterEvidence(campId);
    expect(rId.status).toBe('MISMATCH');
    expect(rId.mismatchReason).toContain('Report campaign ID (99) does not match campaign (1).');

    // Budget basis mismatch
    const campBudget = campaign();
    campBudget.mediaBudgetMinor = '100000';
    campBudget.metrics!.budgetBasisMinor = '50000';
    const rBudget = normalizeMediaMeterEvidence(campBudget);
    expect(rBudget.status).toBe('MISMATCH');
    expect(rBudget.mismatchReason).toContain('Report budget basis does not match planned media budget.');

    // Missing source
    const campSource = campaign();
    campSource.metrics!.source = null;
    const rSource = normalizeMediaMeterEvidence(campSource);
    expect(rSource.status).toBe('MISMATCH');
    expect(rSource.mismatchReason).toContain('Report provider source is missing.');
  });

  it('discloses retrieval time and notes data currency unknown when dataAsOf is null without claiming current or live', () => {
    const freshCamp = campaign();
    freshCamp.metrics!.observedAt = new Date().toISOString();
    freshCamp.metrics!.dataAsOf = null;
    const result = normalizeMediaMeterEvidence(freshCamp);
    expect(result.status).toBe('AVAILABLE');
    expect(result.subtext).toContain('network data currency unknown (provider reports delayed data)');
    expect(result.subtext).toContain('latest report retrieved at');
    expect(result.statusLabel).not.toMatch(/current|live/i);
  });

  it('retains prior spend on ERROR only when historical evidence is compatible, failing closed on incompatible data', () => {
    // Compatible historical spend -> retained as STALE
    const errorWithSpend = campaign();
    errorWithSpend.metrics!.spendMinor = '40000';
    errorWithSpend.metrics!.report!.status = 'ERROR';
    const rCompatible = normalizeMediaMeterEvidence(errorWithSpend);
    expect(rCompatible.status).toBe('STALE');
    expect(rCompatible.isStale).toBe(true);
    expect(rCompatible.isAvailable).toBe(false);
    expect(rCompatible.reportedSpendMinor).toBe('40000');
    expect(rCompatible.statusLabel).toContain('Report refresh error · older report retained');

    // Incompatible currency on ERROR -> fails closed to MISMATCH without spend retention
    const errorBadCurrency = campaign();
    errorBadCurrency.metrics!.spendMinor = '40000';
    errorBadCurrency.metrics!.currency = 'USD';
    errorBadCurrency.metrics!.report!.status = 'ERROR';
    const rBadCurr = normalizeMediaMeterEvidence(errorBadCurrency);
    expect(rBadCurr.status).toBe('MISMATCH');
    expect(rBadCurr.reportedSpendMinor).toBeNull();
    expect(rBadCurr.utilizationPercent).toBeNull();

    // Incompatible provider source on ERROR -> fails closed to MISMATCH
    const errorBadSource = campaign();
    errorBadSource.metrics!.spendMinor = '40000';
    errorBadSource.metrics!.source = 'META'; // on a GOOGLE campaign
    errorBadSource.metrics!.report!.status = 'ERROR';
    const rBadSrc = normalizeMediaMeterEvidence(errorBadSource);
    expect(rBadSrc.status).toBe('MISMATCH');
    expect(rBadSrc.reportedSpendMinor).toBeNull();

    // Inverted date window on ERROR -> fails closed to MISMATCH
    const errorBadDates = campaign();
    errorBadDates.metrics!.spendMinor = '40000';
    errorBadDates.metrics!.dateStart = '2026-09-25';
    errorBadDates.metrics!.dateEnd = '2026-09-10';
    errorBadDates.metrics!.report!.status = 'ERROR';
    const rBadDates = normalizeMediaMeterEvidence(errorBadDates);
    expect(rBadDates.status).toBe('MISMATCH');
    expect(rBadDates.reportedSpendMinor).toBeNull();
  });

  it('DeliveryStatusBadge truthfully ages every provider state and distinguishes confirmed impression delivery from unconfirmed active', () => {
    const now = Date.now();

    // 1. Fresh active delivery with confirmed impressions
    const confirmedActive = {
      submitted: true,
      configuredStatus: 'ACTIVE',
      observedStatus: 'ACTIVE',
      observedAt: new Date(now - 5 * 60 * 1000).toISOString(),
      readiness: 'ELIGIBLE' as const,
      deliveryConfirmed: true,
    };
    const { unmount: u1 } = render(React.createElement(DeliveryStatusBadge, { delivery: confirmedActive, now }));
    expect(screen.getByText('Active at network')).toBeTruthy();
    u1();

    // 2. Fresh active delivery but unconfirmed impression serving
    const unconfirmedActive = {
      ...confirmedActive,
      deliveryConfirmed: false,
    };
    const { unmount: u2 } = render(React.createElement(DeliveryStatusBadge, { delivery: unconfirmedActive, now }));
    expect(screen.getByText('Active · unconfirmed delivery')).toBeTruthy();
    expect(screen.queryByText('Active at network')).toBeNull();
    u2();

    // 3. Fresh active delivery with unknown readiness
    const unknownReadiness = {
      ...confirmedActive,
      readiness: null,
      deliveryConfirmed: false,
    };
    const { unmount: u3 } = render(React.createElement(DeliveryStatusBadge, { delivery: unknownReadiness, now }));
    expect(screen.getByText('Active · readiness unconfirmed')).toBeTruthy();
    u3();

    // 4. Fresh paused observation
    const freshPaused = {
      submitted: true,
      configuredStatus: 'PAUSED',
      observedStatus: 'PAUSED',
      observedAt: new Date(now - 5 * 60 * 1000).toISOString(),
    };
    const { unmount: u4 } = render(React.createElement(DeliveryStatusBadge, { delivery: freshPaused, now }));
    expect(screen.getByText('Paused at network')).toBeTruthy();
    u4();

    // 5. Stale PAUSED observation (> 20 min) -> MUST age to stale status
    const stalePaused = {
      ...freshPaused,
      observedAt: new Date(now - 30 * 60 * 1000).toISOString(),
    };
    const { unmount: u5 } = render(React.createElement(DeliveryStatusBadge, { delivery: stalePaused, now }));
    expect(screen.getByText('Stale status · check pending')).toBeTruthy();
    expect(screen.queryByText('Paused at network')).toBeNull();
    u5();

    // 6. Stale ACTIVE observation (> 20 min) -> MUST age to stale status
    const staleActive = {
      ...confirmedActive,
      observedAt: new Date(now - 30 * 60 * 1000).toISOString(),
    };
    const { unmount: u6 } = render(React.createElement(DeliveryStatusBadge, { delivery: staleActive, now }));
    expect(screen.getByText('Stale status · check pending')).toBeTruthy();
    expect(screen.queryByText('Active at network')).toBeNull();
    u6();

    // 7. Status check ERROR
    const errorDelivery = {
      ...confirmedActive,
      statusCheck: 'ERROR' as const,
    };
    const { unmount: u7 } = render(React.createElement(DeliveryStatusBadge, { delivery: errorDelivery, now }));
    expect(screen.getByText('Status check error')).toBeTruthy();
    u7();

    // 8. Pause requested (configured PAUSED while observed ACTIVE)
    const pauseRequestedDelivery = {
      ...confirmedActive,
      configuredStatus: 'PAUSED',
      observedStatus: 'ACTIVE',
    };
    const { unmount: u8 } = render(React.createElement(DeliveryStatusBadge, { delivery: pauseRequestedDelivery, now }));
    expect(screen.getByText('Pause requested')).toBeTruthy();
    u8();
  });

  it('mounts full CampaignStudio component and renders 4 simultaneous flight cards truthfully', async () => {
    const f1 = campaign();
    f1.id = 101;
    f1.metrics!.campaignId = 101;
    f1.title = 'Monsoon Flight 1';
    f1.mediaBudgetMinor = '100000';
    f1.metrics!.budgetBasisMinor = '100000';
    f1.metrics!.spendMinor = '45000';

    const f2 = campaign();
    f2.id = 102;
    f2.metrics!.campaignId = 102;
    f2.title = 'Review Flight 2';
    f2.metrics!.report!.status = 'NOT_STARTED';

    const f3 = campaign();
    f3.id = 103;
    f3.metrics!.campaignId = 103;
    f3.title = 'Stale Flight 3';
    f3.metrics!.spendMinor = '30000';
    f3.metrics!.observedAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    const f4 = campaign();
    f4.id = 104;
    f4.metrics!.campaignId = 104;
    f4.title = 'Paused Flight 4';
    f4.delivery = {
      submitted: true,
      configuredStatus: 'PAUSED',
      observedStatus: 'PAUSED',
      observedAt: new Date().toISOString(),
      deliveryConfirmed: true,
    };
    f4.metrics!.spendMinor = '0';
    f4.funding = {
      status: 'CAPTURED',
      capturedMinor: '100000',
      reservedMinor: '0',
      refundableMinor: '100000',
      released: false,
    };
    const portfolioOutcomes = { source: 'CANONICAL_CHECKOUT', scope: 'CURRENT_WORKSPACE_PAGE', completeness: 'RECORDED_VERIFIED_EVENTS_ONLY', observedAt: new Date().toISOString(), activeAttributedBookings: '2', capturedBookings: '1', fulfilledStays: '1', cancelledBookings: '0', refundedBookings: '0' };
    localStorage.setItem('token', 'host-a');
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/workspace')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            listings: [{ id: 20, title: 'Lake House', slug: 'lake-house', publicationStatus: 'PUBLISHED', media: [] }],
            campaigns: [f1, f2, f3, f4],
            portfolioOutcomes,
            policy: { currency: 'INR', markupPercent: 5, configured: true },
            capabilities: { funding: true, publish: true },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetcher);

    vi.mocked(marketingRequest).mockImplementation(async (path: string) => {
      if (path.startsWith('/workspace')) {
        return {
          listings: [{ id: 20, title: 'Lake House', slug: 'lake-house', publicationStatus: 'PUBLISHED', media: [] }],
          campaigns: [f1, f2, f3, f4],
          portfolioOutcomes,
          policy: { currency: 'INR', markupPercent: 5, configured: true },
          capabilities: { funding: true, publish: true },
        } as any;
      }
      return {} as any;
    });

    try {
      const { unmount } = render(React.createElement(CampaignStudio));

      await screen.findByText('Monsoon Flight 1');
      expect(screen.getByText('Review Flight 2')).toBeTruthy();
      expect(screen.getByText('Stale Flight 3')).toBeTruthy();
      expect(screen.getByText('Paused Flight 4')).toBeTruthy();
      expect(screen.getByRole('region',{name:'Current page booking outcomes'}).textContent).toContain('Distinct attributed bookings2');

      expect(screen.getByText('45.0%')).toBeTruthy();
      expect(screen.getByText('Campaign reporting has not started')).toBeTruthy();
      expect(screen.getByText('Media (Older report)')).toBeTruthy();
      expect(screen.getByText(/Reported ₹0.00 \(delayed\)/)).toBeTruthy();

      unmount();
    } finally {
      localStorage.removeItem('token');
    }
  });

  it('treats missing report identity as unbound historical evidence without normal utilization percentage, preserving durable spend', () => {
    // Missing campaignId
    const campMissingId = campaign();
    campMissingId.metrics!.campaignId = null;
    const rNoId = normalizeMediaMeterEvidence(campMissingId);
    expect(rNoId.status).toBe('HISTORICAL_UNVERIFIED');
    expect(rNoId.isAvailable).toBe(false);
    expect(rNoId.utilizationPercent).toBeNull();
    expect(rNoId.reportedSpendMinor).toBe('20000'); // Preserved durable data!
    expect(rNoId.statusLabel).toBe('Historical telemetry · unbound report identity');

    // Missing revision
    const campMissingRev = campaign();
    campMissingRev.metrics!.revision = null;
    const rNoRev = normalizeMediaMeterEvidence(campMissingRev);
    expect(rNoRev.status).toBe('HISTORICAL_UNVERIFIED');
    expect(rNoRev.utilizationPercent).toBeNull();
    expect(rNoRev.reportedSpendMinor).toBe('20000');

    // Missing budgetBasisMinor
    const campMissingBudget = campaign();
    campMissingBudget.metrics!.budgetBasisMinor = null;
    const rNoBudget = normalizeMediaMeterEvidence(campMissingBudget);
    expect(rNoBudget.status).toBe('HISTORICAL_UNVERIFIED');
    expect(rNoBudget.utilizationPercent).toBeNull();
    expect(rNoBudget.reportedSpendMinor).toBe('20000');

    // Error status with missing identity -> stays unbound without normal utilization
    const errorUnbound = campaign();
    errorUnbound.metrics!.campaignId = null;
    errorUnbound.metrics!.report!.status = 'ERROR';
    const rErrorUnbound = normalizeMediaMeterEvidence(errorUnbound);
    expect(rErrorUnbound.status).toBe('HISTORICAL_UNVERIFIED');
    expect(rErrorUnbound.utilizationPercent).toBeNull();
    expect(rErrorUnbound.reportedSpendMinor).toBe('20000');

    // Renders without progressbar in compact mode
    const { unmount: uCompact } = render(React.createElement(MediaBudgetMeter, { campaign: campMissingId, compact: true }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Historical (unbound)')).toBeTruthy();
    expect(screen.getByText(/₹200.00 reported/)).toBeTruthy();
    expect(screen.getByText('Utilization unverified')).toBeTruthy();
    uCompact();

    // Renders full panel with preserved evidence explanation
    const { unmount: uFull } = render(React.createElement(MediaBudgetMeter, { campaign: campMissingId }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Historical telemetry · unbound report identity')).toBeTruthy();
    expect(screen.getByText(/Preserved spend evidence: ₹200.00 \/ ₹1,000.00 media plan/)).toBeTruthy();
    expect(screen.getByText(/Reported spend is preserved as historical evidence, but utilization percentage is unavailable/)).toBeTruthy();
    uFull();
  });

  it('enforces timezone-aware observation window boundaries across India and Western timezones', () => {
    // Simulated time: Oct 1, 2026 at 01:30 UTC
    const simulatedNow = Date.parse('2026-10-01T01:30:00Z');

    // In India (Asia/Kolkata, UTC+5:30), local time is 07:00 on Oct 1, 2026 -> current calendar date is 2026-10-01
    const indiaCamp = campaign();
    indiaCamp.startDate = '2026-09-01';
    indiaCamp.endDate = '2026-10-15';
    indiaCamp.metrics!.dateStart = '2026-09-01';
    indiaCamp.metrics!.dateEnd = '2026-10-01';
    indiaCamp.metrics!.accountTimeZone = 'Asia/Kolkata';
    indiaCamp.metrics!.observedAt = new Date(simulatedNow - 5 * 60 * 1000).toISOString();

    const rIndia = normalizeMediaMeterEvidence(indiaCamp, { now: simulatedNow });
    expect(rIndia.status).toBe('AVAILABLE');
    expect(rIndia.isAvailable).toBe(true);

    // In Western US (America/Los_Angeles, UTC-7 PDT), local time is 18:30 on Sep 30, 2026 -> current calendar date is 2026-09-30
    // The same report with dateEnd '2026-10-01' is FUTURE-DATED for that account!
    const westernCamp = campaign();
    westernCamp.startDate = '2026-09-01';
    westernCamp.endDate = '2026-10-15';
    westernCamp.metrics!.dateStart = '2026-09-01';
    westernCamp.metrics!.dateEnd = '2026-10-01';
    westernCamp.metrics!.accountTimeZone = 'America/Los_Angeles';
    westernCamp.metrics!.observedAt = new Date(simulatedNow - 5 * 60 * 1000).toISOString();

    const rWesternFuture = normalizeMediaMeterEvidence(westernCamp, { now: simulatedNow });
    expect(rWesternFuture.status).toBe('MISMATCH');
    expect(rWesternFuture.mismatchReason).toContain('cannot be in the future (current date in America/Los_Angeles is 2026-09-30)');

    // But if Western account reports dateEnd '2026-09-30', it is valid!
    westernCamp.metrics!.dateEnd = '2026-09-30';
    const rWesternValid = normalizeMediaMeterEvidence(westernCamp, { now: simulatedNow });
    expect(rWesternValid.status).toBe('AVAILABLE');
    expect(rWesternValid.isAvailable).toBe(true);

    // Invalid account time zone string
    westernCamp.metrics!.accountTimeZone = 'Invalid/NonExistent_Zone';
    const rBadTz = normalizeMediaMeterEvidence(westernCamp, { now: simulatedNow });
    expect(rBadTz.status).toBe('MISMATCH');
    expect(rBadTz.mismatchReason).toContain("Report account time zone 'Invalid/NonExistent_Zone' is invalid.");
  });

  it('rejects invalid calendar dates in schedule and report without unsafe Date.parse rollovers', () => {
    // Non-leap year: 2026-02-29 does not exist
    const badLeapYearCamp = campaign();
    badLeapYearCamp.endDate = '2026-02-29';
    const rBadLeap = normalizeMediaMeterEvidence(badLeapYearCamp);
    expect(rBadLeap.status).toBe('MISMATCH');
    expect(rBadLeap.mismatchReason).toContain('Campaign scheduled end date (2026-02-29) is not a valid calendar date.');

    // Impossible day: 2026-04-31 (April has 30 days)
    const badAprilCamp = campaign();
    badAprilCamp.metrics!.dateEnd = '2026-04-31';
    const rBadApril = normalizeMediaMeterEvidence(badAprilCamp);
    expect(rBadApril.status).toBe('MISMATCH');
    expect(rBadApril.mismatchReason).toContain('Report flight end date (2026-04-31) is not a valid calendar date.');

    // Impossible day: 2026-02-31
    const badFebCamp = campaign();
    badFebCamp.startDate = '2026-02-31';
    const rBadFeb = normalizeMediaMeterEvidence(badFebCamp);
    expect(rBadFeb.status).toBe('MISMATCH');
    expect(rBadFeb.mismatchReason).toContain('Campaign scheduled start date (2026-02-31) is not a valid calendar date.');
  });
});
