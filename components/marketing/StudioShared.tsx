import React, { useState } from 'react';
import { Check, Clock3, ArrowUpRight, ShieldCheck, CircleHelp, AlertCircle } from 'lucide-react';
import type { StudioCampaign, CampaignQuote, MarketingListing } from './types';
import { humanStatus, money, observedTime } from './api';

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
    { label: 'Provider observation', value: humanStatus(campaign.delivery?.observedStatus), done: ['ACTIVE', 'LIVE'].includes(campaign.delivery?.observedStatus || '') },
  ];
  return <ol className="mkt-progress" aria-label="Independent campaign gates">{gates.map(g => <li key={g.label} className={g.done ? 'is-complete' : ''}><span className="mkt-progress-icon">{g.done ? <Check size={15}/> : <Clock3 size={15}/>}</span><div><strong>{g.label}</strong><small>{g.value}</small></div></li>)}</ol>;
}
export function MetricsPanel({ campaign }: { campaign: StudioCampaign }) {
  const m = campaign.metrics;
  const count = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString('en-IN') : '—';
  const metrics = [['Impressions', count(m?.impressions)], ['Clicks', count(m?.clicks)], ['Click-through rate', typeof m?.ctr === 'number' && Number.isFinite(m.ctr) ? `${(m.ctr * 100).toFixed(2)}%` : '—'], ['Profile visits', count(m?.profileVisits)], ['Guest leads', count(m?.leads)], ['Attributed bookings', count(m?.bookings)], ['Provider spend', m?.spendMinor != null ? money(m.spendMinor, campaign.quote?.currency) : '—']];
  return <section className="mkt-panel"><div className="mkt-section-heading"><div><span className="mkt-eyebrow">Observed outcomes</span><h3>From attention to bookings</h3></div><ArrowUpRight size={22}/></div>
    <div className="mkt-metrics">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="mkt-caption">{m?.source ? `Source: ${m.source}. ` : 'Provider metrics are not available yet. '}Updated: {observedTime(m?.observedAt)}. A dash means unavailable, not zero. Attributed bookings do not establish incremental bookings.</p>
  </section>;
}
export function DeliveryEvidence({ campaign }: { campaign: StudioCampaign }) {
  return <div className="mkt-evidence"><ShieldCheck size={20}/><div><strong>Provider delivery evidence</strong><dl><div><dt>Configured</dt><dd>{humanStatus(campaign.delivery?.configuredStatus)}</dd></div><div><dt>Observed</dt><dd>{humanStatus(campaign.delivery?.observedStatus)}</dd></div><div><dt>Last observation</dt><dd>{observedTime(campaign.delivery?.observedAt)}</dd></div></dl>
    {campaign.delivery?.externalCampaignId && <code>{campaign.delivery.externalCampaignId}</code>}
    <p className="mkt-caption">Submission, approval and active delivery are separate events. Provider updates may be delayed.</p></div></div>;
}
export function CampaignPlanDetails({ campaign, currency }: { campaign: StudioCampaign; currency?: string }) {
  const google = campaign.provider === 'GOOGLE';
  const range = (start?: string, end?: string) => start && end ? `${start} → ${end}` : 'Not defined';
  return <section className="mkt-panel"><span className="mkt-eyebrow">Revision {campaign.revision} · Delivery plan</span><h3>The campaign being reviewed</h3>
    <dl className="mkt-review-list">
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
