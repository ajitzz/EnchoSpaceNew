import React, { useEffect, useState } from 'react';
import { Check, Clock3, ArrowUpRight, ShieldCheck, CircleHelp, AlertCircle } from 'lucide-react';
import type { StudioCampaign, CampaignQuote, MarketingListing } from './types';
import { humanStatus, money, observedTime, marketingRequest } from './api';

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`mkt-notice ${error ? 'mkt-notice-error' : ''}`} role={error ? 'alert' : 'status'}><AlertCircle size={17}/><div>{children}</div></div>;
}
export function StatusPill({ children, good = false }: { children: React.ReactNode; good?: boolean }) {
  return <span className={`mkt-pill ${good ? 'mkt-pill-good' : ''}`}><span aria-hidden="true"/>{children}</span>;
}
export function CancelCampaignRequest({ busy, onRequest }: { busy: boolean; onRequest: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return <section className="mkt-panel"><span className="mkt-eyebrow">Before provider submission</span><h3>Cancel this campaign</h3>
    <p className="mkt-caption">Cancellation can release a wholly unspent reservation before submission. The server checks that no provider operation has begun. Refunds are requested separately.</p>
    <div className="mkt-fields"><label>Reason for cancelling<textarea rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/><small>Explain why this campaign should end. Minimum 10 characters.</small></label></div>
    <button className="mkt-secondary" disabled={busy || reason.trim().length < 10} onClick={() => onRequest(reason.trim())}>{busy ? 'Action in progress…' : 'Cancel before provider submission'}</button>
  </section>;
}
export function RefundRequest({ amountMinor, currency, busy, onRequest }: {
  amountMinor?: string; currency?: string; busy: boolean; onRequest: (amount: string, reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const available = typeof amountMinor === 'string' && /^\d+$/.test(amountMinor) && BigInt(amountMinor) > 0n && Number.isSafeInteger(Number(amountMinor));
  if (!available) return null;
  return <section className="mkt-panel"><span className="mkt-eyebrow">Unreserved campaign funds</span><h3>Request a refund</h3>
    <p className="mkt-caption">Available for a refund: {money(amountMinor, currency)}. This amount comes from verified funding records; pausing an ad does not automatically release its committed budget.</p>
    <div className="mkt-fields"><label>Reason for the refund<textarea rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/><small>Tell us why you are requesting the unused funds. Minimum 10 characters.</small></label></div>
    <button className="mkt-secondary" disabled={busy || reason.trim().length < 10} onClick={() => onRequest(amountMinor!, reason.trim())}>Request refund of {money(amountMinor, currency)}</button>
    <p className="mkt-caption">A request records a refund obligation. Completion and bank timing depend on verified payment provider settlement.</p>
  </section>;
}
export function QuoteCard({ quote }: { quote: CampaignQuote | null }) {
  return <section className="mkt-quote" aria-label="Campaign cost breakdown">
    <span className="mkt-eyebrow">Every charge, explained</span><h3>Your campaign investment</h3>
    {quote ? <><div className="mkt-line-items">{quote.lines?.map((line, i) => <div key={`${line.label}-${i}`}><span>{line.label}</span><strong>{money(line.amountMinor, quote.currency)}</strong></div>)}</div>
      <p className="mkt-caption">Recognized campaign costs: {money(quote.costMinor, quote.currency)}. Encho’s profit target is {quote.markupPercent}% of these costs: {money(quote.profitMinor, quote.currency)}.</p>
      <div className="mkt-total"><span>Total campaign charge</span><strong>{money(quote.totalMinor, quote.currency)}</strong></div>
      <p className="mkt-caption">Quote status: {humanStatus(quote.status)}. Booking commission remains separate under your property plan.</p></>
      : <div className="mkt-empty-small"><CircleHelp size={28}/><p>Request an itemized quote after content approval. Costs, Encho’s markup and your total will appear here.</p></div>}
  </section>;
}
export function CampaignProgress({ campaign }: { campaign: StudioCampaign }) {
  const capture = campaign.funding?.capturedMinor, total = campaign.quote?.totalMinor;
  const fullyCaptured = typeof capture === 'string' && typeof total === 'string' && /^\d+$/.test(capture) && /^\d+$/.test(total)
    && BigInt(total) > 0n && BigInt(capture) >= BigInt(total);
  const gates = [
    { label: 'AI assessment', value: humanStatus(campaign.ai?.status), done: ['PASSED', 'APPROVED'].includes(campaign.ai?.status) },
    { label: 'Content review', value: humanStatus(campaign.contentApproval?.status), done: campaign.contentApproval?.status === 'APPROVED' && campaign.contentApproval.revision === campaign.revision },
    { label: 'Captured funding', value: humanStatus(campaign.funding?.status), done: fullyCaptured },
    { label: 'Risk clearance', value: campaign.funding?.released ? 'Released' : 'Awaiting clearance', done: campaign.funding?.released === true },
    { label: 'Delivery confirmation', value: campaign.delivery?.deliveryConfirmed ? 'Delivery observed' : campaign.delivery?.observedStatus === 'PAUSED' ? 'Paused at the network' : 'Awaiting confirmation', done: campaign.delivery?.deliveryConfirmed === true },
  ];
  return <ol className="mkt-progress" aria-label="Independent campaign gates">{gates.map(g => <li key={g.label} className={g.done ? 'is-complete' : ''}><span className="mkt-progress-icon">{g.done ? <Check size={15}/> : <Clock3 size={15}/>}</span><div><strong>{g.label}</strong><small>{g.value}</small></div></li>)}</ol>;
}
export function MetricsPanel({ campaign }: { campaign: StudioCampaign }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const m = campaign.metrics;
  const outcomes=campaign.firstPartyOutcomes;
  const recorded=(value:string|null|undefined)=>typeof value==='string'&&/^\d+$/.test(value)?BigInt(value).toLocaleString('en-IN'):'—';
  const count = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString('en-IN') : '—';
  const reportLabel = m?.report?.status === 'NO_REPORT' ? 'Waiting for the first network report'
    : m?.report?.status === 'NOT_STARTED' ? 'Campaign reporting has not started'
    : m?.report?.status === 'ERROR' ? 'Report refresh needs attention'
    : m?.observedAt ? 'Latest reported performance' : 'Performance not yet available';
  const metrics = [['Impressions', count(m?.impressions)], ['Clicks', count(m?.clicks)], ['Click-through rate', typeof m?.ctr === 'number' && Number.isFinite(m.ctr) ? `${(m.ctr * 100).toFixed(2)}%` : '—'], ['Consented property visits', recorded(outcomes?.propertyVisits)], ['Recorded guest inquiries', recorded(outcomes?.inquiries)], ['Verified attributed bookings', recorded(outcomes?.bookings)], ['Reported media spend', m?.spendMinor != null && m.currency ? money(m.spendMinor, m.currency) : '—']];
  const stale = !!m?.observedAt && (!Number.isFinite(Date.parse(m.observedAt)) || now-Date.parse(m.observedAt)>20*60*1000);
  return <section className="mkt-panel"><div className="mkt-section-heading"><div><span className="mkt-eyebrow">Campaign performance</span><h3>From attention to bookings</h3></div><ArrowUpRight size={22}/></div>
    <StatusPill>{stale ? 'Older report · refresh pending' : reportLabel}</StatusPill>
    <div className="mkt-metrics">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="mkt-caption">{m?.dateStart && m.dateEnd ? `Reporting period: ${m.dateStart} → ${m.dateEnd}${m.accountTimeZone ? ` (${m.accountTimeZone})` : ''}. ` : ''}Retrieved: {observedTime(m?.observedAt)}. {m?.dataAsOf ? `Data current through: ${observedTime(m.dataAsOf)}.` : 'The network has not confirmed how current these totals are.'}</p>
    <p className="mkt-caption">A dash means unavailable, not zero. Network reports can arrive late. Verified bookings and inquiries require Encho measurement; ad clicks are not bookings.</p>
    {outcomes&&<div className="mkt-first-party"><p className="mkt-caption">Encho events across this campaign’s revisions, checked {observedTime(outcomes.observedAt)}. Counts cover recorded consented activity; they do not include every visitor or booking. Cancelled and refunded bookings are excluded.</p>{outcomes.unreadMessages&&BigInt(outcomes.unreadMessages)>0n&&<p role="status"><a href="/#messages">{recorded(outcomes.unreadMessages)} unread campaign inquiry messages · Open your inbox</a></p>}</div>}
    <MediaBudgetMeter campaign={campaign}/>
    <ObservationRefresh key={`${campaign.id}:${campaign.revision}`} campaign={campaign}/>
  </section>;
}
export function MediaBudgetMeter({ campaign }: { campaign: StudioCampaign }) {
  const m=campaign.metrics, budget=campaign.mediaBudgetMinor;
  const valid = typeof budget==='string' && /^[1-9]\d*$/.test(budget) && typeof m?.spendMinor==='string' && /^\d+$/.test(m.spendMinor)
    && !!m.currency && m.currency === campaign.quote?.currency && m.dateStart===campaign.startDate;
  if(!valid) return <div className="mkt-budget-meter"><span className="mkt-eyebrow">Media budget</span><p>Budget usage will appear when a compatible report is available.</p></div>;
  const spent=BigInt(m!.spendMinor!), planned=BigInt(budget!), basisPoints=spent*10000n/planned;
  const percent=Number(basisPoints>10000n?10000n:basisPoints)/100;
  return <div className="mkt-budget-meter"><div className="mkt-section-heading"><strong>Reported media usage</strong><span>{percent.toFixed(1)}%</span></div>
    <div className="mkt-budget-track" role="progressbar" aria-label="Reported media budget consumed" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${money(m!.spendMinor,m!.currency!)} reported against ${money(budget,m!.currency!)} planned media`}><span style={{width:`${percent}%`}}/></div>
    <p>{money(m!.spendMinor,m!.currency!)} reported / {money(budget,m!.currency!)} media plan</p>
    {spent>planned && <Notice error>Reported spend exceeds the media plan. Encho operations must reconcile the overage.</Notice>}
    <p className="mkt-caption">Media spend excludes Encho fees. Reports can be delayed; unused media allocation is not a refundable balance. Confirmed refundable funds are shown separately.</p>
  </div>;
}
function ObservationRefresh({campaign}:{campaign:StudioCampaign}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function refresh(){
    setBusy(true);setError('');setMessage('');
    try{
      const result=await marketingRequest<{status:string;jobId:string;coalesced:boolean}>(`/campaigns/${campaign.id}/refresh`,{method:'POST',body:JSON.stringify({revision:campaign.revision})});
      setMessage(result.coalesced ? `An existing refresh is ${humanStatus(result.status).toLowerCase()}. The workspace updates automatically.` : 'A network refresh is queued. New evidence will appear automatically when it arrives.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Refresh could not be queued.');}finally{setBusy(false);}
  }
  return <div className="mkt-observation-refresh"><button className="mkt-secondary" disabled={busy || !campaign.delivery?.submitted} onClick={()=>void refresh()}>{busy?'Requesting…':'Refresh network evidence'}</button>
    {campaign.observationJob && <p className="mkt-caption">Last refresh: {humanStatus(campaign.observationJob.status)} · {observedTime(campaign.observationJob.updatedAt)}.</p>}
    {!campaign.delivery?.submitted && <p className="mkt-caption">Network refresh becomes available after this campaign is submitted.</p>}
    {message && <p role="status">{message}</p>}{error && <Notice error>{error}</Notice>}
  </div>;
}
export function DeliveryEvidence({ campaign, showProviderIdentity = false }: { campaign: StudioCampaign; showProviderIdentity?: boolean }) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const delivery=campaign.delivery;
  const observed=Date.parse(delivery?.observedAt||'');
  const stale=!Number.isFinite(observed)||now-observed>20*60*1000||observed>now+60000;
  const label=delivery?.statusCheck==='ERROR'?'Status refresh needs attention':stale?'Waiting for current network status'
    :delivery?.readiness==='ELIGIBLE'?'Eligible at the network'
    :delivery?.readiness==='LIMITED'?'Eligible with network limits'
    :delivery?.readiness==='PENDING'?'Waiting for network eligibility'
    :delivery?.readiness==='LEARNING'?'Network bidding is learning'
    :delivery?.readiness==='REVIEWING'?'Network review in progress'
    :delivery?.readiness==='BLOCKED'?'Network delivery needs attention'
    :delivery?.observedStatus==='PAUSED'?'Paused at the network':'Delivery not yet confirmed';
  return <div className="mkt-evidence"><ShieldCheck size={20}/><div><strong>Campaign delivery</strong><dl><div><dt>Requested state</dt><dd>{humanStatus(campaign.delivery?.configuredStatus)}</dd></div><div><dt>Last confirmed state</dt><dd>{humanStatus(campaign.delivery?.observedStatus)}</dd></div><div><dt>Last observation</dt><dd>{observedTime(campaign.delivery?.observedAt)}</dd></div></dl>
    <StatusPill>{label}</StatusPill>
    {delivery?.statusCheck==='ERROR'&&<p className="mkt-caption">The latest status check failed at {observedTime(delivery.statusAttemptedAt)}. The previous observation above is retained; it does not establish the current state.</p>}
    {showProviderIdentity && campaign.delivery?.externalCampaignId && <code>{campaign.delivery.externalCampaignId}</code>}
    <p className="mkt-caption">Eligibility means the reviewed campaign can compete for delivery. It does not confirm that an ad is being shown now. Performance totals and status checks update separately.</p></div></div>;
}
export function CampaignPlanDetails({ campaign, currency }: { campaign: StudioCampaign; currency?: string }) {
  const google = campaign.provider === 'GOOGLE';
  const range = (start?: string, end?: string) => start && end ? `${start} → ${end}` : 'Not defined';
  return <section className="mkt-panel"><span className="mkt-eyebrow">Revision {campaign.revision} · Delivery plan</span><h3>The campaign being reviewed</h3>
    <dl className="mkt-review-list">
      <div><dt>Campaign product</dt><dd>{campaign.destinationMembership?'Destination contribution plan':'Dedicated stay'}{!campaign.destinationMembership&&campaign.product?.kind==='DEDICATED_STAY' && /^\/stay\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(campaign.product.canonicalPath) && <><br/><a href={campaign.product.canonicalPath}>View the advertised property</a><br/><small>Property evidence is bound to this revision.</small></>}</dd></div>
      <div><dt>Channel</dt><dd>{google ? 'Google Search' : 'Facebook & Instagram'}</dd></div>
      <div><dt>Ad flight</dt><dd>{range(campaign.startDate, campaign.endDate)}<br/><small>{google ? 'Google Ads account time zone' : 'UTC'}</small></dd></div>
      <div><dt>Guest stay nights</dt><dd>{range(campaign.stayStartDate, campaign.stayEndDate)}<br/><small>Property local · checkout exclusive</small></dd></div>
      <div><dt>{google ? 'Campaign total budget' : 'Total media budget'}</dt><dd>{money(campaign.mediaBudgetMinor, campaign.quote?.currency || currency)}</dd></div>
      <div><dt>{google ? 'Audience brief' : 'Audience countries'}</dt><dd>{campaign.locations?.join(', ') || 'Not defined'}</dd></div>
      <div><dt>Selected media</dt><dd>{campaign.mediaIds?.length ? `${campaign.mediaIds.join(', ')}${google ? '' : ` · lead: ${campaign.mediaIds[0]}`}` : 'Not defined'}</dd></div>
      <div><dt>Host media rights</dt><dd>{campaign.rightsConfirmed ? 'Confirmed for this draft' : 'Not confirmed'}</dd></div>
    </dl>
    {google && campaign.googleSearch && <details className="mkt-details"><summary>Search copy & targeting</summary>
      <dl className="mkt-review-list"><div><dt>Location resources</dt><dd>{campaign.googleSearch.geoTargetConstants.join(', ')}</dd></div><div><dt>Languages</dt><dd>{campaign.googleSearch.languageConstants.join(', ')}</dd></div><div><dt>Location intent</dt><dd>{humanStatus(campaign.googleSearch.geoMode)}</dd></div></dl>
      <span className="mkt-eyebrow">Responsive headlines</span><ul className="mkt-notes">{campaign.googleSearch.headlines.map((text, i) => <li key={i}>{text}</li>)}</ul>
      <span className="mkt-eyebrow">Responsive descriptions</span><ul className="mkt-notes">{campaign.googleSearch.descriptions.map((text, i) => <li key={i}>{text}</li>)}</ul>
      <span className="mkt-eyebrow">Keyword match types</span><ul className="mkt-notes">{campaign.googleSearch.keywords.map((keyword, i) => <li key={i}>{keyword.matchType}: {keyword.text}</li>)}</ul>
    </details>}
  </section>;
}
export function CreativePreview({ provider, headline, description, listing, mediaIds, compact = false,creative }: {
  provider: string; headline: string; description: string; listing?: MarketingListing; mediaIds: string[]; compact?: boolean;creative?:{sourceAssetId:string;url:string}|null;
}) {
  const [vertical, setVertical] = useState(false);
  const original = listing?.media?.find(item => String(item.id) === mediaIds[0] && item.approved);
  const selected=original&&provider==='META'&&creative?.sourceAssetId===String(original.id)?{...original,url:creative.url,type:'IMAGE' as const}:original;
  return <section className={`mkt-preview ${compact ? 'mkt-preview-compact' : ''}`} aria-label="Creative preview">
    <div className="mkt-preview-top"><span className="mkt-monogram">e.</span><div><strong>Encho Stays</strong><small>Sponsored · Creative preview</small></div><span className="mkt-preview-channel">{provider === 'GOOGLE' ? 'Search' : 'Meta'}</span></div>
    {provider === 'META' && <><div className="mkt-preview-formats" aria-label="Preview layout"><span>Preview layout</span><button type="button" aria-pressed={!vertical} onClick={() => setVertical(false)}>Feed</button><button type="button" aria-pressed={vertical} onClick={() => setVertical(true)}>Vertical</button></div><div className="mkt-preview-media" style={{ aspectRatio: vertical ? '9 / 16' : '4 / 5' }}>{selected ? selected.type === 'VIDEO' ? <video src={selected.url} controls preload="metadata" playsInline/> : <img src={selected.url} alt={listing?.title || 'Selected property media'} loading="lazy"/> : <div className="mkt-media-empty">Select approved property media<br/><small>Your actual room or stay experience</small></div>}</div></>}
    <div className="mkt-preview-copy">{provider === 'GOOGLE' && <small className="mkt-caption">{listing?.slug ? `/stay/${listing.slug}` : 'Your property’s booking page'}</small>}<h4>{headline || 'Headline not added'}</h4><p>{description || 'Description not added'}</p>{provider === 'META' && <span className="mkt-preview-cta">Check availability <ArrowUpRight size={15}/></span>}</div>
    <p className="mkt-preview-note">{creative?'Reviewed image variant. ':''}Layout preview only. Final appearance and approval depend on the ad placement.</p>
  </section>;
}
