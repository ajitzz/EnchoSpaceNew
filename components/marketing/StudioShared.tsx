import React, { useEffect, useState } from 'react';
import { Check, Clock3, ArrowUpRight, ShieldCheck, CircleHelp, AlertCircle } from 'lucide-react';
import type { StudioCampaign, CampaignQuote, MarketingListing } from './types';
import { humanStatus, money, observedTime, marketingRequest } from './api';
import { normalizeMediaMeterEvidence } from './MediaBudgetEvidence';
export { normalizeMediaMeterEvidence } from './MediaBudgetEvidence';
export type { MediaMeterReportState, NormalizedMediaMeterEvidence, NormalizeMediaEvidenceOptions } from './MediaBudgetEvidence';

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`mkt-notice ${error ? 'mkt-notice-error' : ''}`} role={error ? 'alert' : 'status'}><AlertCircle size={17}/><div>{children}</div></div>;
}
export function StatusPill({ children, good = false, attention = false, error = false }: { children: React.ReactNode; good?: boolean; attention?: boolean; error?: boolean }) {
  const variant = good ? 'mkt-pill-good' : attention ? 'mkt-pill-attention' : error ? 'mkt-pill-error' : '';
  return <span className={`mkt-pill ${variant}`}><span aria-hidden="true"/>{children}</span>;
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
  const meter = normalizeMediaMeterEvidence(campaign, { now });
  const showProviderTotals = ['AVAILABLE', 'REPORTED_ZERO', 'OVERRUN', 'STALE'].includes(meter.status);
  const recorded=(value:string|null|undefined)=>typeof value==='string'&&/^\d+$/.test(value)?BigInt(value).toLocaleString('en-IN'):'—';
  const count = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString('en-IN') : '—';
  const reportLabel = m?.report?.status === 'NO_REPORT' ? 'Waiting for the first network report'
    : m?.report?.status === 'NOT_STARTED' ? 'Campaign reporting has not started'
    : m?.report?.status === 'ERROR' ? 'Report refresh needs attention'
    : m?.observedAt ? 'Latest reported performance' : 'Performance not yet available';
  const metrics = [['Impressions', showProviderTotals ? count(m?.impressions) : '—'], ['Clicks', showProviderTotals ? count(m?.clicks) : '—'], ['Click-through rate', showProviderTotals && typeof m?.ctr === 'number' && Number.isFinite(m.ctr) ? `${(m.ctr * 100).toFixed(2)}%` : '—'], ['Consented property visits', recorded(outcomes?.propertyVisits)], ['Recorded guest inquiries', recorded(outcomes?.inquiries)], ['Verified attributed bookings', recorded(outcomes?.bookings)], ['Reported media spend', meter.reportedSpendMinor != null ? money(meter.reportedSpendMinor, meter.currency) : '—']];
  return <section className="mkt-panel"><div className="mkt-section-heading"><div><span className="mkt-eyebrow">Campaign performance</span><h3>From attention to bookings</h3></div><ArrowUpRight size={22}/></div>
    <StatusPill>{meter.status === 'STALE' ? meter.statusLabel : reportLabel}</StatusPill>
    <div className="mkt-metrics">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="mkt-caption">{m?.dateStart && m.dateEnd ? `Reporting period: ${m.dateStart} → ${m.dateEnd}${m.accountTimeZone ? ` (${m.accountTimeZone})` : ''}. ` : ''}Retrieved: {observedTime(m?.observedAt)}. {m?.dataAsOf ? `Data current through: ${observedTime(m.dataAsOf)}.` : 'The network has not confirmed how current these totals are.'}</p>
    <p className="mkt-caption">A dash means unavailable, not zero. Network reports can arrive late. Verified bookings and inquiries require Encho measurement; ad clicks are not bookings.</p>
    {outcomes&&<div className="mkt-first-party"><p className="mkt-caption">Encho events across this campaign’s revisions, checked {observedTime(outcomes.observedAt)}. Counts cover recorded consented activity; they do not include every visitor or booking. Cancelled and refunded bookings are excluded.</p>{outcomes.unreadMessages&&BigInt(outcomes.unreadMessages)>0n&&<p role="status"><a href="/#messages">{recorded(outcomes.unreadMessages)} unread campaign inquiry messages · Open your inbox</a></p>}</div>}
    <MediaBudgetMeter campaign={campaign}/>
    <ObservationRefresh key={`${campaign.id}:${campaign.revision}`} campaign={campaign}/>
  </section>;
}
export function MediaBudgetMeter({
  campaign,
  freshnessWindowMs,
  compact = false,
}: {
  campaign: StudioCampaign;
  freshnessWindowMs?: number;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const evidence = normalizeMediaMeterEvidence(campaign, { now, freshnessWindowMs });

  if (compact) {
    if (evidence.status === 'HISTORICAL_UNVERIFIED') {
      return (
        <div className="mkt-meter-compact" aria-label={evidence.ariaLabel} style={{ padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--mkt-muted, #6a716e)' }}>
            <span>Media spend</span>
            <span style={{ fontStyle: 'italic', color: '#b45309' }}>Historical (unbound)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--mkt-muted, #6a716e)', marginTop: '2px' }}>
            <span>{evidence.reportedSpendMinor ? money(evidence.reportedSpendMinor, evidence.currency) : '—'} reported</span>
            <span style={{ color: '#b45309' }}>Utilization unverified</span>
          </div>
          {evidence.refundableMinor && BigInt(evidence.refundableMinor) > 0n && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#047857', marginTop: '3px' }}>
              <span>Refundable</span>
              <span style={{ fontWeight: 600 }}>{money(evidence.refundableMinor, evidence.currency)}</span>
            </div>
          )}
          {campaign.funding?.pendingRefundMinor && BigInt(campaign.funding.pendingRefundMinor) > 0n && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginTop: '2px' }}>
              <span>Pending refund</span>
              <span style={{ fontWeight: 600 }}>{money(campaign.funding.pendingRefundMinor, evidence.currency)}</span>
            </div>
          )}
        </div>
      );
    }

    if (!evidence.isAvailable && !evidence.isStale) {
      return (
        <div className="mkt-meter-compact" aria-label={evidence.ariaLabel} style={{ padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--mkt-muted, #6a716e)' }}>
            <span>Media spend</span>
            <span style={{ fontStyle: 'italic' }}>{evidence.statusLabel}</span>
          </div>
          {evidence.refundableMinor && BigInt(evidence.refundableMinor) > 0n && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#047857', marginTop: '3px' }}>
              <span>Refundable</span>
              <span style={{ fontWeight: 600 }}>{money(evidence.refundableMinor, evidence.currency)}</span>
            </div>
          )}
          {campaign.funding?.pendingRefundMinor && BigInt(campaign.funding.pendingRefundMinor) > 0n && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginTop: '2px' }}>
              <span>Pending refund</span>
              <span style={{ fontWeight: 600 }}>{money(campaign.funding.pendingRefundMinor, evidence.currency)}</span>
            </div>
          )}
        </div>
      );
    }

    if (evidence.isStale) {
      return (
        <div className="mkt-meter-compact" aria-label={evidence.ariaLabel} style={{ padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--mkt-muted, #6a716e)' }}>Media (Older report)</span>
            <span style={{ fontWeight: 600, color: 'var(--mkt-ink, #173c32)' }}>{evidence.utilizationPercent!.toFixed(1)}%</span>
          </div>
          <div
            className="mkt-budget-track is-stale"
            role="progressbar"
            aria-label={evidence.ariaLabel}
            aria-valuenow={evidence.utilizationPercent!}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={evidence.ariaValueText}
            style={{ height: '6px', margin: '4px 0' }}
          >
            <span style={{ width: `${evidence.utilizationPercent}%`, background: '#b45309' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--mkt-muted, #6a716e)' }}>
            <span>{money(evidence.reportedSpendMinor!, evidence.currency)} / {money(evidence.plannedMediaMinor, evidence.currency)}</span>
            <span style={{ fontStyle: 'italic', color: '#b45309' }}>Refresh pending</span>
          </div>
          {evidence.refundableMinor && BigInt(evidence.refundableMinor) > 0n && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#047857', marginTop: '3px' }}>
              <span>Refundable</span>
              <span style={{ fontWeight: 600 }}>{money(evidence.refundableMinor, evidence.currency)}</span>
            </div>
          )}
          {campaign.funding?.pendingRefundMinor && BigInt(campaign.funding.pendingRefundMinor) > 0n && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginTop: '2px' }}>
              <span>Pending refund</span>
              <span style={{ fontWeight: 600 }}>{money(campaign.funding.pendingRefundMinor, evidence.currency)}</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="mkt-meter-compact" aria-label={evidence.ariaLabel} style={{ padding: '6px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
          <span style={{ color: 'var(--mkt-muted, #6a716e)' }}>Reported media</span>
          <span style={{ fontWeight: 600, color: evidence.isOverrun ? '#b91c1c' : 'var(--mkt-ink, #173c32)' }}>
            {evidence.utilizationPercent!.toFixed(1)}%
          </span>
        </div>
        <div
          className="mkt-budget-track"
          role="progressbar"
          aria-label={evidence.ariaLabel}
          aria-valuenow={evidence.utilizationPercent!}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={evidence.ariaValueText}
          style={{ height: '6px', margin: '4px 0' }}
        >
          <span style={{ width: `${evidence.utilizationPercent}%` }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--mkt-muted, #6a716e)' }}>
          <span>{money(evidence.reportedSpendMinor!, evidence.currency)} / {money(evidence.plannedMediaMinor, evidence.currency)}</span>
          {evidence.isReportedZero && <span style={{ color: '#047857', fontWeight: 600 }}>Reported {money('0', evidence.currency)} (delayed)</span>}
          {evidence.isOverrun && <span style={{ color: '#b91c1c', fontWeight: 600 }}>Overrun</span>}
        </div>
        {evidence.refundableMinor && BigInt(evidence.refundableMinor) > 0n && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#047857', marginTop: '3px' }}>
            <span>Refundable</span>
            <span style={{ fontWeight: 600 }}>{money(evidence.refundableMinor, evidence.currency)}</span>
          </div>
        )}
        {campaign.funding?.pendingRefundMinor && BigInt(campaign.funding.pendingRefundMinor) > 0n && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginTop: '2px' }}>
            <span>Pending refund</span>
            <span style={{ fontWeight: 600 }}>{money(campaign.funding.pendingRefundMinor, evidence.currency)}</span>
          </div>
        )}
      </div>
    );
  }

  if (evidence.status === 'HISTORICAL_UNVERIFIED') {
    return (
      <div className="mkt-budget-meter">
        <div className="mkt-section-heading">
          <strong>{evidence.headline}</strong>
          <StatusPill>{evidence.statusLabel}</StatusPill>
        </div>
        <p>
          Preserved spend evidence:{' '}
          {evidence.reportedSpendMinor ? money(evidence.reportedSpendMinor, evidence.currency) : '—'} /{' '}
          {money(evidence.plannedMediaMinor!, evidence.currency)} media plan
        </p>
        <p className="mkt-caption">
          {evidence.subtext}
        </p>
        {evidence.capturedHostChargeMinor && (
          <p className="mkt-caption">
            Accepted host charge: {money(evidence.capturedHostChargeMinor, campaign.quote?.currency || evidence.currency)}.
          </p>
        )}
        {evidence.refundableMinor && BigInt(evidence.refundableMinor) > 0n && (
          <p className="mkt-caption">
            Finance-confirmed refundable: {money(evidence.refundableMinor, evidence.currency)}.
          </p>
        )}
      </div>
    );
  }

  if (!evidence.isAvailable && !evidence.isStale) {
    return (
      <div className="mkt-budget-meter">
        <span className="mkt-eyebrow">Media budget</span>
        {evidence.status === 'ERROR' ? (
          <Notice error>{evidence.subtext}</Notice>
        ) : (
          <p>{evidence.subtext}</p>
        )}
        {evidence.mismatchReason && <p className="mkt-caption">{evidence.mismatchReason}</p>}
      </div>
    );
  }

  if (evidence.isStale) {
    return (
      <div className="mkt-budget-meter">
        <div className="mkt-section-heading">
          <strong>{evidence.headline}</strong>
          <StatusPill>{evidence.statusLabel}</StatusPill>
        </div>
        <div
          className="mkt-budget-track is-stale"
          role="progressbar"
          aria-label={evidence.ariaLabel}
          aria-valuenow={evidence.utilizationPercent!}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={evidence.ariaValueText}
        >
          <span style={{ width: `${evidence.utilizationPercent}%`, background: '#b45309' }} />
        </div>
        <p>
          Last successful report ({observedTime(evidence.lastSuccessfulObservedAt)}):{' '}
          {money(evidence.reportedSpendMinor!, evidence.currency)} reported /{' '}
          {money(evidence.plannedMediaMinor!, evidence.currency)} media plan
        </p>
        <p className="mkt-caption">
          Current utilization is unavailable because the network report exceeds the freshness threshold.
          Unused media allocation is not a refundable balance. Confirmed refundable funds are shown separately.
        </p>
        {evidence.capturedHostChargeMinor && (
          <p className="mkt-caption">
            Accepted host charge: {money(evidence.capturedHostChargeMinor, campaign.quote?.currency || evidence.currency)}.
          </p>
        )}
        {evidence.refundableMinor && BigInt(evidence.refundableMinor) > 0n && (
          <p className="mkt-caption">
            Finance-confirmed refundable: {money(evidence.refundableMinor, evidence.currency)}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mkt-budget-meter">
      <div className="mkt-section-heading">
        <strong>{evidence.headline}</strong>
        <span>{evidence.utilizationPercent!.toFixed(1)}%</span>
      </div>
      <div
        className="mkt-budget-track"
        role="progressbar"
        aria-label={evidence.ariaLabel}
        aria-valuenow={evidence.utilizationPercent!}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={evidence.ariaValueText}
      >
        <span style={{ width: `${evidence.utilizationPercent}%` }} />
      </div>
      <p>
        {money(evidence.reportedSpendMinor!, evidence.currency)} reported /{' '}
        {money(evidence.plannedMediaMinor!, evidence.currency)} media plan
      </p>
      {evidence.isReportedZero && (
        <p className="mkt-caption">
          Provider reported {money('0', evidence.currency)} for {evidence.dateStart && evidence.dateEnd ? `${evidence.dateStart} → ${evidence.dateEnd}` : 'flight window'}, retrieved {observedTime(evidence.observedAt)}; network reports can be delayed and later corrections remain possible.
        </p>
      )}
      {evidence.isOverrun && (
        <Notice error>Reported spend exceeds the media plan. Encho operations must reconcile the overage.</Notice>
      )}
      <div className="mkt-financial-separation">
        {evidence.capturedHostChargeMinor && (
          <p className="mkt-caption">
            Accepted host charge: {money(evidence.capturedHostChargeMinor, campaign.quote?.currency || evidence.currency)} (includes media, fees & taxes under accepted quote).
          </p>
        )}
        {evidence.refundableMinor && BigInt(evidence.refundableMinor) > 0n && (
          <p className="mkt-caption">
            Finance-confirmed refundable amount: {money(evidence.refundableMinor, evidence.currency)} (verified by finance settlement).
          </p>
        )}
        {evidence.desiredStatus && evidence.observedStatus && (
          <p className="mkt-caption">
            Network delivery status: Requested ({humanStatus(evidence.desiredStatus)}) · Confirmed ({humanStatus(evidence.observedStatus)}).
          </p>
        )}
      </div>
      <p className="mkt-caption">
        Latest report retrieved at {observedTime(evidence.observedAt)}. {evidence.dataAsOf ? `Data current through ${observedTime(evidence.dataAsOf)}.` : 'Network data currency unknown (provider reports delayed data).'}
      </p>
      <p className="mkt-caption">
        Media spend excludes Encho fees. Reports can be delayed; unused media allocation is not a refundable balance. Confirmed refundable funds are shown separately.
      </p>
    </div>
  );
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
export function DeliveryStatusBadge({
  delivery,
  now: observedNow,
}: {
  delivery?: StudioCampaign['delivery'];
  now?: number;
}) {
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (observedNow !== undefined) return;
    const timer = setInterval(() => setClockNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [observedNow]);
  const now = observedNow ?? clockNow;
  if (!delivery) {
    return <StatusPill>Awaiting confirmation</StatusPill>;
  }

  if (delivery.statusCheck === 'ERROR') {
    return <StatusPill attention>Status check error</StatusPill>;
  }

  const isPauseRequested =
    delivery.configuredStatus === 'PAUSED' && delivery.observedStatus !== 'PAUSED';
  if (isPauseRequested) {
    return <StatusPill attention>Pause requested</StatusPill>;
  }

  const observed = Date.parse(delivery.observedAt || '');
  const isStale = !Number.isFinite(observed) || now - observed > 20 * 60 * 1000 || observed > now + 60_000;
  if (isStale) {
    return <StatusPill attention>Stale status · check pending</StatusPill>;
  }

  if (delivery.observedStatus === 'PAUSED') {
    return <StatusPill>Paused at network</StatusPill>;
  }

  if (delivery.readiness === 'BLOCKED') {
    return <StatusPill error>Delivery blocked</StatusPill>;
  }
  if (delivery.readiness === 'LIMITED') {
    return <StatusPill attention>Eligible with limits</StatusPill>;
  }
  if (delivery.readiness === 'LEARNING') {
    return <StatusPill attention>Bidding learning</StatusPill>;
  }
  if (delivery.readiness === 'REVIEWING') {
    return <StatusPill>Under review</StatusPill>;
  }
  if (delivery.readiness === 'PENDING') {
    return <StatusPill>Awaiting eligibility</StatusPill>;
  }

  if (delivery.observedStatus === 'ACTIVE') {
    if (delivery.readiness !== 'ELIGIBLE') {
      return <StatusPill attention>Active · readiness unconfirmed</StatusPill>;
    }
    if (delivery.deliveryConfirmed !== true) {
      return <StatusPill attention>Active · unconfirmed delivery</StatusPill>;
    }
    return <StatusPill good>Active at network</StatusPill>;
  }

  return <StatusPill>{humanStatus(delivery.observedStatus || 'Awaiting confirmation')}</StatusPill>;
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
