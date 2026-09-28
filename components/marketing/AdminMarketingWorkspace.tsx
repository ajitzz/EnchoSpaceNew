import {SpatialStoryWorkspace} from './SpatialStoryWorkspace';
import {DestinationPools} from './DestinationPools';
import {PortfolioShadowPanel} from './PortfolioShadowPanel';
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, ChevronRight, ClipboardCheck, FileCheck2, Loader2, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { humanStatus, marketingRequest, money, observedTime, toMinor, useMarketingWorkspace } from './api';
import type { StudioCampaign } from './types';
import { CampaignPlanDetails, CampaignProgress, CreativePreview, DeliveryEvidence, MetricsPanel, Notice, QuoteCard, StatusPill } from './StudioShared';
import './marketing.css';
import {WorkspacePagination} from './WorkspacePagination';
import {OperationsPanel} from './OperationsPanel';
import {RecoveryPanel} from './RecoveryPanel';
import {AdminSettlementWorkspace} from './SettlementWorkspace';
import {AdminCreativeWorkspace} from './CreativeWorkspace';

export default function AdminMarketingWorkspace() {
  const { workspace, loading, error, reload,search,setSearch,filter,setFilter,campaignPage,previousPage,nextPage } = useMarketingWorkspace(true);
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [mediaConfirmed, setMediaConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [storyListingId,setStoryListingId]=useState('');
  const [financialOpen,setFinancialOpen]=useState(false);
  const [creativesOpen,setCreativesOpen]=useState(false);
  const [markupPercent, setMarkupPercent] = useState('');
  const [policyReason, setPolicyReason] = useState('');
  const [policyVersion, setPolicyVersion] = useState<number | undefined>();
  const keys = useRef(new Map<string, string>());
  const keyFor = (scope: string) => { if (!keys.current.has(scope)) keys.current.set(scope, crypto.randomUUID()); return keys.current.get(scope)!; };
  const campaign = workspace?.campaigns.find(item => String(item.id) === selected);
  const listing = [...(workspace?.listings||[]),...(workspace?.campaignListings||[])].find(item => String(item.id) === String(campaign?.listingId));
  const campaigns = workspace?.campaigns || [];
  const approved = campaign?.contentApproval?.status === 'APPROVED' && campaign.contentApproval.revision === campaign.revision;
  const inReview = campaign?.status === 'PENDING_ADMIN';
  const lastRevision = useRef('');
  useEffect(() => {
    const current = campaign ? `${campaign.id}:${campaign.revision}` : '';
    if (lastRevision.current && lastRevision.current !== current) {
      setPolicyConfirmed(false); setMediaConfirmed(false); setNote('');
      if (campaign && lastRevision.current.startsWith(`${campaign.id}:`)) setNotice('This campaign revision changed. Review the new evidence before recording a decision.');
    }
    lastRevision.current = current;
  }, [campaign?.id, campaign?.revision]);
  const selectCampaign = (item: StudioCampaign) => { setSelected(String(item.id)); setPolicyConfirmed(false); setMediaConfirmed(false); setNote(''); setActionError(''); setNotice(''); };
  async function action(name: string, extra: Record<string, unknown> = {}) {
    if (!campaign) return;
    setBusy(name); setActionError(''); setNotice('');
    try {
      const body = { revision: campaign.revision, ...extra };
      const intentScope = `${campaign.id}:${name}:${JSON.stringify(body)}`;
      await marketingRequest(`/campaigns/${encodeURIComponent(String(campaign.id))}/${name}`, { method: 'POST',
        headers: { 'Idempotency-Key': keyFor(intentScope) }, body: JSON.stringify(body) });
      setNotice(name === 'review' ? 'Content review recorded. Funding and provider delivery remain independent.' : 'Operation requested. Provider observation determines the confirmed outcome.');
      keys.current.delete(intentScope); setPolicyConfirmed(false); setMediaConfirmed(false); await reload();
    } catch (e) { setActionError(e instanceof Error ? e.message : 'The operation could not be completed.'); }
    finally { setBusy(''); }
  }
  async function savePolicy() {
    const rate = Number(markupPercent);
    if (!Number.isFinite(rate) || rate < 3 || rate > 5 || policyReason.trim().length < 10) {
      setActionError('Set a markup from 3–5%, explain the policy change in at least 10 characters.'); return;
    }
    setBusy('policy'); setActionError('');
    try {
      await marketingRequest('/admin/policy', { method: 'POST', headers: { 'Idempotency-Key': keyFor(`policy:${markupPercent}:${policyReason}:${policyVersion}`) },
        body: JSON.stringify({ markupPercent: rate, expectedVersion: policyVersion,
          reason: policyReason.trim() }) });
      keys.current.delete(`policy:${markupPercent}:${policyReason}:${policyVersion}`);
      await reload(); setNotice('Prospective cost policy recorded. Existing accepted quotes retain their recorded terms.'); setPolicyOpen(false);
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Policy could not be saved.'); }
    finally { setBusy(''); }
  }
  return <div className="mkt-studio mkt-admin" data-testid="admin-marketing-workspace"><header className="mkt-header"><div><span className="mkt-eyebrow"><span className="mkt-brand-dot"/> ENCHO / MARKETING OPERATIONS</span><h1>Consider the details.<br/><em>Protect the promise.</em></h1><p>Review creative, understand the money and follow the provider evidence. Every decision belongs to an exact campaign revision.</p></div><div className="mkt-header-actions"><StatusPill>Admin workspace</StatusPill><button className="mkt-secondary" disabled={!workspace} onClick={() => { setPolicyOpen(open => !open); setPolicyVersion(workspace?.policy.version); setMarkupPercent(String(workspace?.policy.markupPercent ?? '')); }}>Cost policy <ChevronRight size={16}/></button></div></header>
    {workspace&&<DestinationPools admin campaigns={workspace.campaigns} listings={workspace.listings}/> }
    <div className="mkt-workspace-strip"><span><ShieldCheck size={16}/> Content approval ≠ payment clearance</span><span><FileCheck2 size={16}/> Revision-bound decisions</span><button onClick={() => void reload()} disabled={loading}><RefreshCw size={15}/> Refresh evidence</button></div>
    {(error || actionError) && <Notice error>{actionError || error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {loading && <div className="mkt-loading" role="status"><Loader2 className="mkt-spin"/> Loading the operations workspace</div>}
    {workspace && <OperationsPanel/>}
    {workspace&&<><button className="mkt-secondary" aria-expanded={creativesOpen} onClick={()=>setCreativesOpen(value=>!value)}>{creativesOpen?'Close image review':'Review campaign images'}</button>{creativesOpen&&<><AdminCreativeWorkspace/><label>Property spatial stories<select value={storyListingId} onChange={e=>setStoryListingId(e.target.value)}><option value="">Choose a property to review</option>{workspace.listings.map(listing=><option key={listing.id} value={listing.id}>{listing.title}</option>)}</select></label>{storyListingId&&<SpatialStoryWorkspace key={storyListingId} admin listingId={Number(storyListingId)}/>}</>}</>}
    {workspace && <><button className="mkt-secondary" aria-expanded={financialOpen} onClick={()=>setFinancialOpen(value=>!value)}>{financialOpen?'Close financial workspace':'Open financial close'}</button>{financialOpen&&<AdminSettlementWorkspace/>}</>}
    <AnimatePresence initial={false}>{policyOpen && workspace && <motion.section className="mkt-panel mkt-policy" initial={reduceMotion ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><div className="mkt-section-heading"><div><span className="mkt-eyebrow">Prospective policy · version {workspace.policy.version ?? 'not configured'}</span><h3>Profit markup on campaign costs</h3></div><button className="mkt-text-button" onClick={() => setPolicyOpen(false)}>Close</button></div><div className="mkt-policy-grid"><div className="mkt-fields"><label>Encho profit markup · % of defined costs<input type="number" min="3" max="5" step="0.1" value={markupPercent} onChange={e => setMarkupPercent(e.target.value)}/></label><label>Reason for this policy<textarea value={policyReason} onChange={e => setPolicyReason(e.target.value)} rows={3}/></label></div><div><span className="mkt-eyebrow">Fixed cost components · {workspace.policy.currency}</span><dl className="mkt-review-list">{workspace.policy.costItems?.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{money(item.amountMinor, workspace.policy.currency)}</dd></div>)}</dl><p className="mkt-caption">Fixed expense rules are read-only here. Variable charges appear in the itemized quote. This control changes the profit markup prospectively; it cannot invent expenses or establish statutory tax treatment.</p></div></div><div className="mkt-form-footer"><p className="mkt-caption">Profit target = C × p. Charge for the cost base = C × (1 + p). Separately payable tax appears in the quote. Existing quotes are not repriced.</p><button className="mkt-primary" disabled={!!busy} onClick={() => void savePolicy()}>{busy === 'policy' ? 'Saving…' : 'Save prospective policy'}</button></div></motion.section>}</AnimatePresence>
    {workspace && <div className="mkt-admin-grid"><aside className="mkt-queue"><div className="mkt-queue-heading"><span className="mkt-eyebrow">Campaign journal · newest created</span><h2>Review queue <span>{workspace.campaigns.length}</span></h2></div><label className="mkt-search"><Search size={17}/><span className="mkt-sr-only">Search campaigns</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search campaigns" maxLength={100}/></label><div className="mkt-filter" aria-label="Campaign filters">{[['all', 'All'], ['review', 'Review'], ['exceptions', 'Exceptions']].map(([value, label]) => <button key={value} className={filter === value ? 'is-selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="mkt-queue-items">{campaigns.map(item => <button key={item.id} className={`mkt-queue-item ${String(item.id) === selected ? 'is-selected' : ''}`} onClick={() => selectCampaign(item)}><span className="mkt-eyebrow">{item.provider} · REV {item.revision}</span><strong>{item.title}</strong><small>{item.hostName || item.listingTitle || 'Host identity available in campaign records'}</small><StatusPill>{humanStatus(item.contentApproval?.status)}</StatusPill>{item.blockers?.length > 0 && <small className="mkt-exception-count">{item.blockers.length} unresolved {item.blockers.length === 1 ? 'item' : 'items'}</small>}</button>)}</div>{!campaigns.length && <p className="mkt-empty-small">No campaigns match this view.</p>}<WorkspacePagination page={campaignPage} hasNext={!!workspace.page?.nextCursor} loading={loading} onPrevious={()=>{setSelected(null);previousPage();}} onNext={()=>{setSelected(null);nextPage();}}/></aside>
      <div className="mkt-review-workspace">{campaign ? <><div className="mkt-detail-heading"><div><span className="mkt-eyebrow">CAMPAIGN {campaign.id} / REVISION {campaign.revision}</span><h2>{campaign.title}</h2><p>{campaign.listingTitle || listing?.title}</p></div><StatusPill>{humanStatus(campaign.status)}</StatusPill></div>{campaign.blockers?.length > 0 && <Notice>{campaign.blockers.join(' ')}</Notice>}<CampaignProgress campaign={campaign}/><div className="mkt-review-grid"><div><CreativePreview provider={campaign.provider} headline={campaign.headline || ''} description={campaign.description || ''} mediaIds={campaign.mediaIds || []} listing={listing} creative={campaign.creativePreview} compact/><CampaignPlanDetails campaign={campaign} currency={workspace?.policy.currency}/>
        <section className="mkt-panel"><div className="mkt-section-heading"><div><span className="mkt-eyebrow">Review the evidence</span><h3>AI assessment & human judgment</h3></div><ClipboardCheck size={22}/></div><div className="mkt-ai-score"><strong>{typeof campaign.ai?.score === 'number' ? `${campaign.ai.score}/10` : 'No verified score'}</strong><StatusPill>{humanStatus(campaign.ai?.status)}</StatusPill></div>{campaign.ai?.notes?.length ? <ul className="mkt-notes">{campaign.ai.notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : <p className="mkt-caption">No AI evidence is available. An unavailable assessment is not a passing score.</p>}<p className="mkt-caption">Assessed: {observedTime(campaign.ai?.evaluatedAt)}</p><div className="mkt-fields"><label className="mkt-checkbox"><input type="checkbox" checked={policyConfirmed} onChange={e => setPolicyConfirmed(e.target.checked)}/><span>I reviewed the copy and targeting against the applicable provider policy.</span></label><label className="mkt-checkbox"><input type="checkbox" checked={mediaConfirmed} onChange={e => setMediaConfirmed(e.target.checked)}/><span>I verified the selected property media and its advertising permission.</span></label><label>Review notes<textarea value={note} onChange={e => setNote(e.target.value)} rows={3}/><small>Explain the decision for this exact revision. Minimum 10 characters.</small></label></div><div className="mkt-review-actions"><button className="mkt-secondary" disabled={!!busy || !inReview || note.trim().length < 10} onClick={() => void action('review', { decision: 'REJECT', note: note.trim(), policyConfirmed, mediaConfirmed })}>Return with notes</button><button className="mkt-primary" disabled={!!busy || !inReview || !['PASSED', 'REQUIRES_REVIEW'].includes(campaign.ai?.status) || !policyConfirmed || !mediaConfirmed || note.trim().length < 10 || typeof campaign.ai?.score === 'number' && campaign.ai.score < 8} onClick={() => void action('review', { decision: 'APPROVE', note: note.trim(), policyConfirmed, mediaConfirmed })}><Check size={16}/> Approve content</button></div><p className="mkt-caption">Content approval does not capture funds, release a risk hold or activate advertising.</p></section></div>
        <aside><QuoteCard quote={campaign.quote}/><section className="mkt-panel"><span className="mkt-eyebrow">Payment event authority</span><h3>Funding & clearance</h3><dl className="mkt-review-list"><div><dt>Status</dt><dd>{humanStatus(campaign.funding?.status)}</dd></div><div><dt>Verified captured</dt><dd>{money(campaign.funding?.capturedMinor, campaign.quote?.currency)}</dd></div><div><dt>Reserved</dt><dd>{money(campaign.funding?.reservedMinor, campaign.quote?.currency)}</dd></div><div><dt>Risk hold</dt><dd>{campaign.funding?.released ? 'Released' : 'Not released'}</dd></div><div><dt>Refundable unreserved</dt><dd>{money(campaign.funding?.refundableMinor, campaign.quote?.currency)}</dd></div><div><dt>Refund pending</dt><dd>{money(campaign.funding?.pendingRefundMinor, campaign.quote?.currency)}</dd></div><div><dt>Refund completed</dt><dd>{money(campaign.funding?.refundedMinor, campaign.quote?.currency)}</dd></div></dl><p className="mkt-caption">Payment capture is established by verified payment events. This workspace cannot manually mark a campaign paid.</p></section><DeliveryEvidence campaign={campaign} showProviderIdentity/><div className="mkt-action-stack"><button className="mkt-primary" disabled={!!busy || campaign.status !== 'APPROVED' || !approved || !workspace.capabilities.publish} onClick={() => void action('publish')}>Send for provider review <ArrowRight size={16}/></button><p className="mkt-caption">Creates the provider campaign paused. It does not authorize active spending.</p><button className="mkt-secondary" disabled={!!busy || !['PROVIDER_PAUSED', 'PAUSED'].includes(campaign.status) || !approved || !campaign.funding?.released || workspace.capabilities.activate !== true || !!campaign.activationBlockers?.length} onClick={() => void action('activate')}>Request verified activation</button><button className="mkt-text-button" disabled={!!busy || !campaign.delivery?.submitted || !['PROVIDER_REVIEW', 'LIVE', 'PROVIDER_PAUSED', 'RECONCILIATION_REQUIRED'].includes(campaign.status)} onClick={() => void action('pause')}>Request provider pause</button><p className="mkt-caption">{workspace.capabilities.reason}</p></div></aside></div><MetricsPanel campaign={campaign}/>{campaign.provider==='GOOGLE'&&<PortfolioShadowPanel key={`portfolio:${campaign.id}:${campaign.revision}`} campaignId={campaign.id} revision={campaign.revision}/>}<RecoveryPanel key={`${campaign.id}:${campaign.revision}`} campaignId={campaign.id} revision={campaign.revision}/></> : <div className="mkt-empty mkt-admin-empty"><div className="mkt-empty-orbit"><FileCheck2 size={35}/></div><span className="mkt-eyebrow">Good decisions leave evidence</span><h3>A clear view.<br/><em>A considered decision.</em></h3><p>Select a campaign to inspect its creative, revision, AI assessment, financial records and provider status.</p></div>}</div></div>}
    <footer className="mkt-footer"><span>ENCHO OPERATIONS</span><p>Clear authority. Recorded decisions.</p><span>CONTENT · FUNDING · DELIVERY</span></footer>
  </div>;
}
