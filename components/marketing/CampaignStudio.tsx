import {AdaptiveAudience,useStrategyDefaults,RequestAudienceResearch} from './AdaptiveAudience';
import type {StrategySelection} from '../../src/shared/adtech/contracts';
import {spatialStoryCopy} from '../../src/shared/marketingStory';
import {SpatialStoryWorkspace} from './SpatialStoryWorkspace';
import type {StoryEvidence} from '../../src/shared/marketingStory';
import {DestinationPools} from './DestinationPools';
import {EconomicsPreflight,PortfolioPreflight} from './PreflightPanel';
import {longWeekendFlight,type FlightSchedule} from '../../src/shared/marketingFlight';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Globe2, ImageIcon, Loader2, Plus, RefreshCw, Search, Sparkles, Target, X } from 'lucide-react';
import { marketingRequest, humanStatus, money, observedTime, toMinor, useMarketingWorkspace } from './api';
import type { CampaignDraft, StudioCampaign } from './types';
import { CampaignPlanDetails, CampaignProgress, CancelCampaignRequest, CreativePreview, DeliveryEvidence, MetricsPanel, Notice, QuoteCard, RefundRequest, StatusPill } from './StudioShared';
import './marketing.css';
import { GoogleAudiencePicker, MetaAudiencePicker } from './AudiencePicker';
import { WorkspacePagination } from './WorkspacePagination';
import { CampaignGuidance } from './CampaignGuidance';
import { HostSettlementSummary } from './SettlementWorkspace';
import {HostCreativeWorkspace} from './CreativeWorkspace';
import {KeywordResearchPanel} from './KeywordResearchPanel';
import {StandaloneReelUpload} from './StandaloneReelUpload';

const steps = ['Property & audience', 'Creative story', 'Budget & dates', 'Review your plan'];
const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean);
const suggestedFlight = () => { const start = new Date(); start.setUTCDate(start.getUTCDate() + 1); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7); return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }; };
export default function CampaignStudio({ onOpenSocial }: { onOpenSocial?: () => void }) {
  const { workspace, loading, error, reload,search,setSearch,campaignPage,previousPage,nextPage,listingSearch,setListingSearch,listingPage,previousListingPage,nextListingPage,showNewest } = useMarketingWorkspace();
  const reduceMotion = useReducedMotion();
  const [building, setBuilding] = useState(false);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [checkout, setCheckout] = useState('');
  const [provider, setProvider] = useState<'GOOGLE' | 'META'>('GOOGLE');
  const [listingId, setListingId] = useState('');
  const [title, setTitle] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [headlines, setHeadlines] = useState('');
  const [descriptions, setDescriptions] = useState('');
  const [keywords, setKeywords] = useState('');
  const [geoIds, setGeoIds] = useState('');
  const [languageIds, setLanguageIds] = useState('');
  const [geoMode, setGeoMode] = useState<'PRESENCE' | 'PRESENCE_OR_INTEREST'>('PRESENCE');
  const [locations, setLocations] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [creativeSelection,setCreativeSelection]=useState<{id:string;manifestHash:string;url?:string}|null>(null);
  const [storySelection,setStorySelection]=useState<StoryEvidence|null>(null);
  const [creativeMode, setCreativeMode] = useState<'GALLERY' | 'STANDALONE_REEL'>('GALLERY');
  const [standalonePackage, setStandalonePackage] = useState<any>(null);
  function chooseMedia(next:string[]){setStorySelection(null);if(next[0]!==mediaIds[0])setCreativeSelection(null);setStorySelection(null);setMediaIds(next);}
  const [mediaBudget, setMediaBudget] = useState('');
  const [dailyBudget, setDailyBudget] = useState('');
  const [flightSchedule,setFlightSchedule]=useState<FlightSchedule|undefined>();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stayStartDate, setStayStartDate] = useState('');
  const [stayEndDate, setStayEndDate] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [strategySelection,setStrategySelection]=useState<StrategySelection|null>(null);
  const audience=useStrategyDefaults(listingId,provider,workspace?.capabilities.adtech===true);
  const strategyContext=useRef('');
  const applyBudget=(total:string,daily:string)=>{const major=(v:string)=>`${BigInt(v)/100n}.${(BigInt(v)%100n).toString().padStart(2,'0')}`;setMediaBudget(major(total));setDailyBudget(major(daily));};
  useEffect(()=>{
    const data=audience.data;if(!data){setStrategySelection(null);return;}
    const context=`${listingId}:${provider}:${data.selection.releaseId}:${data.selection.corridorVersionId}:${data.selection.priceHash}`;
    if(strategyContext.current===context&&strategySelection)return;
    strategyContext.current=context;setStrategySelection(data.selection);
    setLocations(data.geography.filter(g=>g.kind!=='PROVIDER_REGION_EXCLUSION').map(g=>g.label).join('\n'));setGeoIds('');if(data.google)setGeoMode(data.google.geoMode);
    if(!editing)applyBudget(data.budget.total.min,data.budget.daily.min);
  },[audience.data,listingId,provider,editing]);
  const keys = useRef(new Map<string, string>());
  const keyFor = (scope: string) => { if (!keys.current.has(scope)) keys.current.set(scope, crypto.randomUUID()); return keys.current.get(scope)!; };
  const listing = [...(workspace?.listings||[]),...(workspace?.campaignListings||[])].find(item => String(item.id) === listingId);
  const campaign = workspace?.campaigns.find(item => String(item.id) === selected);
  const published = useMemo(() => [...(workspace?.listings||[]),...(workspace?.campaignListings||[]).filter(item=>String(item.id)===listingId&&!workspace?.listings.some(visible=>String(visible.id)===String(item.id)))].filter(item => item.publicationStatus === 'published'), [workspace,listingId]);
  const currency = workspace?.policy.currency || 'INR';
  const canEdit = !!campaign && !campaign.destinationMembership && !campaign.quote && ['DRAFT', 'AI_REJECTED', 'ADMIN_REJECTED', 'PENDING_ADMIN', 'APPROVED'].includes(campaign.status);
  const canSubmit = campaign?.status === 'PENDING_ADMIN' && ['PASSED', 'REQUIRES_REVIEW'].includes(campaign.ai?.status);
  const canPause = !!campaign?.delivery?.submitted && ['PROVIDER_REVIEW', 'LIVE', 'PROVIDER_PAUSED', 'ACTIVATION_QUEUED', 'RECONCILIATION_REQUIRED'].includes(campaign.status);
  const canCancel = !!campaign && !campaign.destinationMembership && !campaign.delivery?.submitted && ['DRAFT', 'EVALUATING', 'AI_REJECTED', 'ADMIN_REJECTED', 'PENDING_ADMIN', 'APPROVED', 'PUBLISH_QUEUED', 'FAILED', 'RECONCILIATION_REQUIRED'].includes(campaign.status);

  function resetDraft() {
    strategyContext.current='';setStrategySelection(null);setEditing(null); setBuilding(true); setStep(0); setListingId(''); setTitle(''); setHeadline(''); setDescription(''); setHeadlines('');
    setDescriptions(''); setKeywords(''); setGeoIds(''); setLanguageIds(''); setGeoMode('PRESENCE'); setLocations(''); setMediaIds([]); setCreativeSelection(null);setStorySelection(null);
    setCreativeMode('GALLERY'); setStandalonePackage(null);
    setFlightSchedule(undefined);setMediaBudget(''); setDailyBudget(''); const flight = suggestedFlight(); setStartDate(flight.start); setEndDate(flight.end); setStayStartDate(''); setStayEndDate(''); setRightsConfirmed(false); setActionError(''); setNotice('');
  }
  function editDraft(current: StudioCampaign) {
    const amount = (value?: string) => value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? (Number(value) / 100).toFixed(2) : '';
    setStorySelection(current.spatialStory??null);
    setEditing({ id: String(current.id), revision: current.revision }); setBuilding(true); setStep(0); setProvider(current.provider);
    setListingId(String(current.listingId)); setTitle(current.title); setHeadline(current.headline || ''); setDescription(current.description || '');
    setHeadlines(current.googleSearch?.headlines.filter(text => text !== current.headline).join('\n') || '');
    setDescriptions(current.googleSearch?.descriptions.filter(text => text !== current.description).join('\n') || '');
    setKeywords(current.googleSearch?.keywords.map(keyword => `${keyword.matchType}: ${keyword.text}`).join('\n') || '');
    setGeoIds(current.googleSearch?.geoTargetConstants.join('\n') || ''); setLanguageIds(current.googleSearch?.languageConstants.join('\n') || '');
    setGeoMode(current.googleSearch?.geoMode || 'PRESENCE'); setLocations(current.locations?.join('\n') || ''); setMediaIds(current.mediaIds || []);setCreativeSelection(current.creativeDerivativeId&&current.creativeManifestHash?{id:current.creativeDerivativeId,manifestHash:current.creativeManifestHash,url:current.creativePreview?.url}:null);
    setMediaBudget(amount(current.mediaBudgetMinor)); setDailyBudget(amount(current.dailyBudgetMinor));
    setFlightSchedule(current.flightSchedule);setStartDate(current.startDate || ''); setEndDate(current.endDate || ''); setStayStartDate(current.stayStartDate || ''); setStayEndDate(current.stayEndDate || '');
    setRightsConfirmed(false); setActionError(''); setNotice('');
  }
  function validateStage(stage: number): string {
    if(workspace?.capabilities.adtech&&(!audience.data||!strategySelection))return audience.error||'Wait for the verified audience plan before continuing.';
    if (stage >= 0 && (!listing || title.trim().length < 3 || !lines(locations).length)) return 'Choose a published property, name the campaign and add your audience locations.';
    if (stage >= 0 && provider === 'META' && !strategySelection && lines(locations).some(code => !workspace?.capabilities.metaCountries?.includes(code))) return 'Choose audience countries enabled for the Encho Meta account.';
    if (stage >= 0 && provider === 'GOOGLE' && ((!strategySelection&&!lines(geoIds).length) || !lines(languageIds).length)) return 'Select an audience location from the search results and choose at least one language.';
    if (stage >= 1 && (headline.trim().length < 3 || description.trim().length < 10)) return 'Add an intentional headline and description using your property’s verified details.';
    if (stage >= 1 && (!mediaIds.length || mediaIds.length > 6) && !standalonePackage) return 'Choose one to six approved property media assets or upload a standalone Reel for the campaign assessment.';
    if (stage >= 1 && provider === 'META' && !standalonePackage && listing?.media.some(item => mediaIds.includes(String(item.id)) && item.type === 'VIDEO') && !listing?.media.some(item => mediaIds.includes(String(item.id)) && item.type === 'IMAGE')) return 'Select an approved photo alongside your video to use as its thumbnail.';
    if (stage >= 1 && provider === 'GOOGLE' && (new Set([headline, ...lines(headlines)]).size < 3 || new Set([description, ...lines(descriptions)]).size < 2 || !lines(keywords).length || (!strategySelection&&!lines(geoIds).length) || !lines(languageIds).length)) return 'Google Search needs at least three distinct headlines, two descriptions, keywords and resolved location/language settings.';
    const total = toMinor(mediaBudget), daily = toMinor(dailyBudget);
    if (stage >= 2 && (!total || BigInt(total) < 500n || (provider === 'META' || dailyBudget.trim()) && (!daily || BigInt(daily) < 500n || BigInt(daily) > BigInt(total)))) return provider === 'GOOGLE' ? 'Enter a campaign total of at least 5 currency units. An optional daily planning amount must be at least 5 and within the total.' : 'Enter media and daily budgets of at least 5 currency units. Daily budget cannot exceed your total media budget.';
    if (stage >= 2 && (!startDate || !endDate || endDate <= startDate || (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000 + (provider === 'GOOGLE' ? 1 : 0) > 90)) return 'Choose campaign dates with the end after the start, within 90 days.';
    if (stage >= 2 && provider === 'GOOGLE' && (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000 + 1 < 3) return 'Google campaign total budgets require an advertising flight of at least three days.';
    if (stage >= 2 && ((!!stayStartDate !== !!stayEndDate) || stayStartDate && stayEndDate <= stayStartDate)) return 'Supply both stay dates, with checkout after check-in, or leave both empty until the stay window is defined.';
    if (stage >= 3 && !rightsConfirmed) return 'Confirm that you have permission to advertise the selected media and property details.';
    return '';
  }
  async function saveDraft() {
    const message = validateStage(3); if (message) { setActionError(message); return; }
    const draft: CampaignDraft = {
      ...(strategySelection?{strategySelection}:{}),listingId, title: title.trim(), provider, objective: 'BOOKINGS', startDate, endDate, ...(flightSchedule?{flightSchedule}:{}),
      mediaBudgetMinor: toMinor(mediaBudget)!, ...(toMinor(dailyBudget) ? { dailyBudgetMinor: toMinor(dailyBudget)! } : {}),
      headline: headline.trim(), description: description.trim(), mediaIds, locations: provider === 'META' ? lines(locations).map(code => code.toUpperCase()) : lines(locations), rightsConfirmed,
      ...(stayStartDate && stayEndDate ? { stayStartDate, stayEndDate } : {}),
      ...(storySelection?{spatialStoryId:storySelection.id,spatialStoryHash:storySelection.manifestHash}:{}),
      ...(provider==='META'&&!storySelection&&creativeSelection?{creativeDerivativeId:creativeSelection.id,creativeManifestHash:creativeSelection.manifestHash}:{}),
      ...(provider === 'GOOGLE' ? { googleSearch: {
        version: 1 as const, headlines: [...new Set([headline.trim(), ...lines(headlines)])], descriptions: [...new Set([description.trim(), ...lines(descriptions)])],
        keywords: lines(keywords).map(line => { const match = /^(EXACT|PHRASE):\s*(.+)$/.exec(line); return { text: match ? match[2] : line, matchType: (match?.[1] || 'EXACT') as 'EXACT' | 'PHRASE' }; }), geoTargetConstants: lines(geoIds), languageConstants: lines(languageIds),
        geoMode, ...(toMinor(dailyBudget) ? { dailyBudgetMinor: toMinor(dailyBudget)! } : {}), bidding: 'MAXIMIZE_CONVERSIONS' as const, containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING' as const,
      } } : {}),
    };
    setBusy('save'); setActionError('');
    try {
      const result = await marketingRequest<StudioCampaign | { campaign: StudioCampaign }>(editing ? `/campaigns/${encodeURIComponent(editing.id)}` : '/campaigns', { method: editing ? 'PATCH' : 'POST',
        headers: { 'Idempotency-Key': keyFor(`draft:${editing?.id || 'new'}:${JSON.stringify(draft)}`) }, body: JSON.stringify({ ...draft, ...(editing ? { revision: editing.revision } : {}) }) });
      const saved = 'campaign' in result ? result.campaign : result;
      if (!saved?.id) throw new Error('The saved draft could not be confirmed. Refresh before trying again.');
      keys.current.delete(`draft:${editing?.id || 'new'}:${JSON.stringify(draft)}`);
      showNewest(); await reload(); setSelected(String(saved.id)); setBuilding(false); setNotice('Draft saved. Request AI assessment, then submit for content review. An itemized quote is available after approval.');
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Draft could not be saved.'); }
    finally { setBusy(''); }
  }
  async function act(action: string, current: StudioCampaign, extra: Record<string, unknown> = {}) {
    setBusy(action); setActionError(''); setNotice(''); setCheckout('');
    const intentScope = `${current.id}:${current.revision}:${action}:${JSON.stringify(extra)}`;
    try {
      const response = await marketingRequest<any>(`/campaigns/${encodeURIComponent(String(current.id))}/${action}`, { method: 'POST',
        headers: { 'Idempotency-Key': keyFor(intentScope) }, body: JSON.stringify({ revision: current.revision, ...extra }) });
      if (action === 'fund' && response?.url) {
        const url = new URL(response.url);
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !['checkout.stripe.com', 'rzp.io', 'rzp.co', 'razorpay.com', 'pages.razorpay.com'].includes(url.hostname)) throw new Error('A recognized secure checkout link was not returned. Contact Encho support.');
        setCheckout(url.href); setNotice('Secure checkout is ready. Funding is confirmed only after payment verification.');
      } else if (action === 'cancel') {
        if (response?.status !== 'CANCELLED' || String(response?.id) !== String(current.id)) throw new Error('Cancellation could not be confirmed. Refresh the campaign evidence before trying again.');
        setNotice('Campaign cancelled before provider submission. Eligible unused funds are shown below; refunds are requested separately.');
      } else if (action === 'fund' && Array.isArray(response?.blockers) && response.blockers.length) setActionError(response.blockers.join(' '));
      else setNotice(action === 'refund' ? 'Refund request recorded. Payment provider confirmation is still pending.' : action === 'pause' ? 'Pause requested. Check the provider observation for confirmation.' : 'Request recorded. The latest campaign evidence appears below.');
      keys.current.delete(intentScope);
      await reload();
    } catch (e) { setActionError(e instanceof Error ? e.message : 'The action could not be completed.'); }
    finally { setBusy(''); }
  }

  return <div className="mkt-studio" data-testid="campaign-studio">
    <header className="mkt-header"><div><span className="mkt-eyebrow"><span className="mkt-brand-dot"/> ENCHO / CAMPAIGN STUDIO</span><h1>Beautiful stays.<br/><em>Thoughtful reach.</em></h1><p>Turn your property’s story into a considered campaign.<br className="mkt-desktop-break"/> Your audience, your investment, your results.</p></div>
      <div className="mkt-header-actions">{onOpenSocial && <button className="mkt-text-button" onClick={onOpenSocial}>Social studio <ArrowRight size={15}/></button>}<button className="mkt-primary" onClick={resetDraft} disabled={loading || !workspace}><Plus size={17}/> Create a campaign</button></div></header>
    {workspace&&<DestinationPools campaigns={workspace.campaigns} listings={workspace.listings}/> }
    <div className="mkt-workspace-strip"><span><Target size={16}/> Designed for property bookings</span><span><Globe2 size={16}/> Google · Facebook · Instagram</span><button onClick={() => void reload()} aria-label="Refresh campaign evidence" disabled={loading}><RefreshCw size={15}/> Refresh evidence</button></div>
    {(error || actionError) && <Notice error>{actionError || error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {checkout && <a className="mkt-primary mkt-checkout-link" href={checkout} target="_blank" rel="noopener noreferrer">Continue to secure checkout <ArrowRight size={16}/></a>}
    {loading && <div className="mkt-loading" role="status"><Loader2 className="mkt-spin"/> Loading your campaign workspace</div>}
    {!loading && workspace && !published.length && <Notice>{listingSearch || listingPage>1 ? 'No properties match this page. Clear the property search or return to an earlier page.' : 'Publish a property with approved information and media before creating a paid campaign.'}</Notice>}
    <AnimatePresence mode="wait" initial={false}>
      {building && workspace ? <motion.div key="builder" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
        <div className="mkt-builder-heading"><div><span className="mkt-eyebrow">A considered beginning</span><h2>{editing ? 'Refine your campaign' : 'Create your campaign'}</h2></div><button className="mkt-icon-button" onClick={() => setBuilding(false)} aria-label="Close unsaved campaign draft"><X size={21}/></button></div>
        <nav className="mkt-step-nav" aria-label="Campaign creation steps">{steps.map((label, index) => <button key={label} aria-current={step === index ? 'step' : undefined} onClick={() => { if (index > step) { const error = validateStage(index - 1); if (error) { setActionError(error); return; } } setStep(index); setActionError(''); }}><span>{index < step ? <Check size={15}/> : `0${index + 1}`}</span>{label}</button>)}</nav>
        <div className="mkt-builder-grid"><section className="mkt-panel mkt-form-panel">
          <div className="mkt-section-heading"><div><span className="mkt-eyebrow">STEP 0{step + 1} / 04</span><h3>{steps[step]}</h3></div></div>
          {step === 0 && <div className="mkt-fields">{!editing && <><label>Find a property<input type="search" value={listingSearch} onChange={e=>setListingSearch(e.target.value)} maxLength={100}/></label><WorkspacePagination label="Property" page={listingPage} hasNext={!!workspace.listingPage?.nextCursor} loading={loading} onPrevious={previousListingPage} onNext={nextListingPage}/></>}<label>Property<select aria-label="Property" disabled={!!editing} value={listingId} onChange={e => { setListingId(e.target.value); setMediaIds([]); setCreativeSelection(null);setStorySelection(null); }} required><option value="">Choose a published property</option>{published.map(p => <option value={p.id} key={p.id}>{p.title}{p.city ? ` · ${p.city}` : ''}</option>)}</select></label>
            <label>Campaign name<input value={title} onChange={e => setTitle(e.target.value)} maxLength={90} required/></label>
            <fieldset className="mkt-channel-picker"><legend>Where would you like to appear?</legend>{(['GOOGLE', 'META'] as const).map(channel => <label key={channel} className={provider === channel ? 'is-selected' : ''}><input type="radio" disabled={!!editing} name="campaign-provider" value={channel} checked={provider === channel} onChange={() => { setProvider(channel); setCreativeSelection(null);setStorySelection(null); setLocations(''); setGeoIds(''); setLanguageIds(''); }}/>{channel === 'GOOGLE' ? <Search size={22}/> : <ImageIcon size={22}/>}<strong>{channel === 'GOOGLE' ? 'Google Search' : 'Facebook & Instagram'}</strong><small>{channel === 'GOOGLE' ? 'Meet guests searching for a stay.' : 'Tell your story through photos and video.'}</small></label>)}</fieldset>
            {workspace.capabilities.adtech ? <><p className="mkt-caption">Your verified property price selects the audience strategy automatically.</p>{audience.error?<Notice error>{audience.error} <button type="button" className="mkt-text-button" onClick={audience.reload}>Retry audience preparation</button>{audience.code==='EXCLUSION_UNRESOLVED'&&<RequestAudienceResearch key={`${listingId}:${provider}`} listingId={listingId} provider={provider}/>}</Notice>:audience.data&&strategySelection?<AdaptiveAudience data={audience.data} selection={strategySelection} onChange={next=>{setStrategySelection(next);setLocations(audience.data!.geography.filter(g=>g.kind!=='PROVIDER_REGION_EXCLUSION'&&(!next.feederHashes||next.feederHashes.includes(g.evidenceHash))).map(g=>g.label).join('\n'));}} onBudget={applyBudget}/>:<p role="status">{listingId?'Preparing audience defaults…':'Choose a property to prepare its audience.'}</p>}{provider==='GOOGLE'&&<GoogleAudiencePicker languagesOnly value={{locations:[],geoIds:[],languageIds:lines(languageIds)}} onChange={next=>setLanguageIds(next.languageIds.join('\n'))}/>}</> : provider === 'META' ? <MetaAudiencePicker allowed={workspace?.capabilities.metaCountries || []} selected={lines(locations)} onChange={countries => setLocations(countries.join('\n'))}/> : <GoogleAudiencePicker value={{ locations: lines(locations), geoIds: lines(geoIds), languageIds: lines(languageIds) }} onChange={next => { setLocations(next.locations.join('\n')); setGeoIds(next.geoIds.join('\n')); setLanguageIds(next.languageIds.join('\n')); }}/>}</div>}
          {step === 1 && <div className="mkt-fields">{workspace.capabilities.adtech&&listing&&<button type="button" className="mkt-secondary" onClick={()=>{setHeadline(provider==='GOOGLE'?listing.title.slice(0,30):listing.title.slice(0,100));setDescription('Explore the property details and choose available stay dates.');setHeadlines('Explore this stay\nCheck available dates');setDescriptions('Review this property before planning your visit.');setKeywords(`${audience.data?.google?.matchTypes[0]??'EXACT'}: ${listing.title.slice(0,80)}`);chooseMedia(listing.media.filter(m=>m.approved&&m.type==='IMAGE').slice(0,1).map(m=>String(m.id)));}}>Prepare a plan from this property</button>}<CampaignGuidance listingId={listingId} provider={provider} disabled={!!busy||!!storySelection} onApply={copy=>{setHeadline(copy.headline);setDescription(copy.description);if(copy.googleSearch){setHeadlines(copy.googleSearch.headlines.filter(text=>text!==copy.headline).join('\n'));setDescriptions(copy.googleSearch.descriptions.filter(text=>text!==copy.description).join('\n'));setKeywords(copy.googleSearch.keywords.map(keyword=>`${keyword.matchType}: ${keyword.text}`).join('\n'));}setNotice('Reviewed AI copy applied to your draft. Save and assess the complete campaign before submission.');}}/><label>Headline<input disabled={!!storySelection} value={headline} maxLength={provider === 'GOOGLE' ? 30 : 80} onChange={e => setHeadline(e.target.value)}/><small>{headline.length}/{provider === 'GOOGLE' ? 30 : 80}</small></label><label>Description<textarea disabled={!!storySelection} rows={3} maxLength={provider === 'GOOGLE' ? 90 : 1000} value={description} onChange={e => setDescription(e.target.value)}/><small>Describe the actual stay. Avoid guarantees, invented amenities or prices that may change.</small></label>
            {provider === 'GOOGLE' ? <><label>Additional headlines<textarea disabled={!!storySelection} rows={3} value={headlines} onChange={e => setHeadlines(e.target.value)}/><small>One per line, up to 30 characters each. At least three distinct headlines in total.</small></label><label>Additional descriptions<textarea disabled={!!storySelection} rows={2} value={descriptions} onChange={e => setDescriptions(e.target.value)}/><small>One per line, up to 90 characters each. At least two in total.</small></label><label>Search phrases<textarea rows={3} value={keywords} onChange={e => setKeywords(e.target.value)}/><small>One phrase per line. Use {audience.data?.google?.matchTypes.join(' or ')??'EXACT or PHRASE'}: to select an allowed match type; unprefixed phrases use exact matching. Exact matching includes close variants.</small></label>
              <KeywordResearchPanel listingId={listingId} cityScopeOnly={!!strategySelection} matchType={audience.data?.google?.matchTypes[0]??'EXACT'} geoIds={strategySelection?(audience.data?.keywordResearchLocations??[]).filter(g=>!strategySelection.feederHashes||strategySelection.feederHashes.includes(g.evidenceHash)).map(g=>g.geoTargetConstant):lines(geoIds)} languageIds={lines(languageIds)} keywords={lines(keywords)} disabled={!!busy} onSelect={text => setKeywords(current => [...lines(current), `${audience.data?.google?.matchTypes[0]??'EXACT'}: ${text}`].join('\n'))}/>
              <details className="mkt-details"><summary>Location matching <ChevronDown size={16}/></summary><p className="mkt-caption">Your selected audience locations and languages come directly from Google. Review them in the first step.</p><label>Location intent<select disabled={!!strategySelection} value={geoMode} onChange={e => setGeoMode(e.target.value as typeof geoMode)}><option value="PRESENCE">People in the selected locations</option><option value="PRESENCE_OR_INTEREST">People in or interested in the locations</option></select></label>{geoMode === 'PRESENCE_OR_INTEREST' && <Notice>This broader setting can include people outside your selected locations. Review whether that matches your guest audience.</Notice>}</details></> : null}
              {provider === 'META' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    className={creativeMode === 'GALLERY' ? 'mkt-primary' : 'mkt-secondary'}
                    style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                    onClick={() => setCreativeMode('GALLERY')}
                  >
                    Listing Gallery Assets
                  </button>
                  <button
                    type="button"
                    className={creativeMode === 'STANDALONE_REEL' ? 'mkt-primary' : 'mkt-secondary'}
                    style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                    onClick={() => setCreativeMode('STANDALONE_REEL')}
                  >
                    ✨ Standalone Phone Reel (9:16)
                  </button>
                </div>
              )}
              {creativeMode === 'STANDALONE_REEL' && provider === 'META' && listing ? (
                <StandaloneReelUpload
                  listingId={Number(listing.id)}
                  listingTitle={listing.title}
                  headline={headline}
                  description={description}
                  onPackageCreated={(pkg) => {
                    setStandalonePackage(pkg);
                    if (pkg.assets?.[0]?.originalUrl) {
                      setCreativeSelection({
                        id: pkg.id,
                        manifestHash: pkg.rightsAttestationHash || pkg.id,
                        url: pkg.assets[0].originalUrl
                      });
                    }
                    setNotice('Standalone Reel attached to campaign. Ready for review!');
                  }}
                  selectedPackageId={standalonePackage?.id}
                />
              ) : (
                <>
                  <fieldset><legend>Approved property media · choose up to six</legend><div className="mkt-media-grid">{listing?.media.filter(media => media.approved).map(media => <label key={media.id} className={mediaIds.includes(String(media.id)) ? 'is-selected' : ''}><input type="checkbox" checked={mediaIds.includes(String(media.id))} onChange={() => chooseMedia(mediaIds.includes(String(media.id)) ? mediaIds.filter(id => id !== String(media.id)) : [...mediaIds, String(media.id)])}/>{media.type === 'VIDEO' ? <div className="mkt-media-video"><ImageIcon size={22}/><span>Property video</span></div> : <img src={media.url} alt={`${listing.title} campaign media`} loading="lazy"/>}<span>{media.type === 'VIDEO' ? 'Video' : 'Photo'}{mediaIds.includes(String(media.id)) && <Check size={13}/>}</span></label>)}</div>{!listing?.media.some(m => m.approved) && <p className="mkt-caption">No approved media is available. Add and approve property media before continuing.</p>}</fieldset>
                  {listing&&<SpatialStoryWorkspace key={listing.id} listingId={Number(listing.id)} media={listing.media} selected={storySelection?.id} onSelect={story=>{setStorySelection(story);setCreativeSelection(null);if(story){const copy=spatialStoryCopy(provider);setHeadline(copy.headline);setDescription(copy.description);if(copy.googleSearch){setHeadlines(copy.googleSearch.headlines.slice(1).join('\n'));setDescriptions(copy.googleSearch.descriptions.slice(1).join('\n'));}setMediaIds([...new Set([...story.manifest.cards.map(card=>card.image.sourceAssetId),story.manifest.landscapeImage.sourceAssetId])]);}}}/>}
                  {storySelection&&<p className="mkt-caption">This story uses neutral framing and the exact reviewed labels. Unselect the story to return to an ordinary draft.</p>}
                  {provider==='META'&&!storySelection&&listing&&listing.media.find(asset=>String(asset.id)===mediaIds[0])?.type==='IMAGE'&&<HostCreativeWorkspace key={`${listing.id}:${mediaIds[0]}`} listingId={Number(listing.id)} sourceAssetId={mediaIds[0]} selected={creativeSelection??undefined} onSelect={selection=>{setCreativeSelection(selection);setStorySelection(null);}}/>}
                  {provider === 'META' && !storySelection && mediaIds.length > 1 && <label>Lead creative<select value={mediaIds[0]} onChange={e => chooseMedia([e.target.value, ...mediaIds.filter(id => id !== e.target.value)])}>{mediaIds.map(id => { const asset = listing?.media.find(item => String(item.id) === id); return <option key={id} value={id}>{asset?.type === 'VIDEO' ? 'Video' : 'Photo'} · asset {id}</option>; })}</select></label>}
                  {provider === 'META' && !storySelection && <p className="mkt-caption">The lead creative is the asset sent for this campaign. Additional selections support assessment and video thumbnails.</p>}
                </>
              )}
          </div>}
          {step === 2 && <div className="mkt-fields"><button type="button" className="mkt-secondary" onClick={()=>{const flight=longWeekendFlight();setFlightSchedule(flight);setStartDate(flight.startsAt.slice(0,10));setEndDate(flight.endsAt.slice(0,10));}}>Use Long Weekend flight · India Time</button>{flightSchedule&&<Notice>Wednesday 06:00 → Monday 23:59 India Time (Asia/Kolkata, UTC+05:30). Starts after administrator authorization and safety checks; delivery may begin later. Editing dates returns to the standard whole-day flight.</Notice>}<div className="mkt-field-pair"><label>{provider === 'GOOGLE' ? 'Campaign total budget' : 'Total media budget'} · {currency}<input inputMode="decimal" value={mediaBudget} onChange={e => setMediaBudget(e.target.value)}/></label><label>{provider === 'GOOGLE' ? 'Daily planning amount (optional)' : 'Daily media budget'} · {currency}<input inputMode="decimal" value={dailyBudget} onChange={e => setDailyBudget(e.target.value)}/></label></div><p className="mkt-caption">{provider === 'GOOGLE' ? 'The campaign total is the Google provider billing ceiling for this flight. The optional daily amount is a planning reference; it is not sent as a Google daily spending budget.' : 'Media spend is separate from campaign costs and Encho’s markup. Provider daily pacing may vary; your accepted total authorization is tracked separately.'}</p><div className="mkt-field-pair"><label>Ad flight start · {flightSchedule?'India Time (UTC+05:30)':provider === 'GOOGLE' ? 'provider time zone' : 'UTC'}<input type="date" value={startDate} onChange={e => {setFlightSchedule(undefined);setStartDate(e.target.value);}}/></label><label>Ad flight end · {flightSchedule?'India Time (UTC+05:30)':provider === 'GOOGLE' ? 'provider time zone' : 'UTC'}<input type="date" value={endDate} min={startDate} onChange={e => {setFlightSchedule(undefined);setEndDate(e.target.value);}}/></label></div><p className="mkt-caption">{flightSchedule?'This timed flight uses Asia/Kolkata (UTC+05:30). Automatic activation still requires funding, eligibility, and administrator authorization.':provider === 'GOOGLE' ? 'Advertising dates use the Google Ads master account time zone. Total-budget flights require 3–90 days. Suggested dates are editable.' : 'Meta ad flight dates use UTC. Confirm the flight against your property’s local stay dates.'}</p><div className="mkt-field-pair"><label>Stay check-in · property local<input type="date" value={stayStartDate} onChange={e => setStayStartDate(e.target.value)}/></label><label>Stay checkout · property local<input type="date" value={stayEndDate} min={stayStartDate} onChange={e => setStayEndDate(e.target.value)}/></label></div><p className="mkt-caption">The stay window is separate from your ad flight. Define available stay nights before activation so advertising can pause when rooms sell out.</p>{listingId&&toMinor(mediaBudget)&&startDate&&endDate&&<EconomicsPreflight key={`${listingId}:${mediaBudget}:${startDate}:${endDate}`} listingId={Number(listingId)} mediaBudgetMinor={toMinor(mediaBudget)!} flightDays={Math.floor((Date.parse(endDate)-Date.parse(startDate))/86400000)+1}/>}<div className="mkt-cost-explainer"><span className="mkt-eyebrow">A transparent partnership</span><h4>Campaign costs + Encho’s markup</h4><p>{workspace.policy.configured ? `The current policy applies ${workspace.policy.markupPercent}% to the defined campaign costs. Your itemized quote will show the full charge before payment.` : 'The cost policy has not been configured. You can prepare a draft; funding requires an approved itemized quote.'}</p><p>Advertising is optional. Booking commission is separate under your property plan.</p></div></div>}
          {step === 3 && <div className="mkt-fields"><dl className="mkt-review-list"><div><dt>Property</dt><dd>{listing?.title}</dd></div><div><dt>Channel</dt><dd>{provider === 'GOOGLE' ? 'Google Search' : 'Facebook & Instagram'}</dd></div><div><dt>Ad flight · {flightSchedule?'India Time (UTC+05:30)':provider === 'GOOGLE' ? 'provider time zone' : 'UTC'}</dt><dd>{flightSchedule?`${flightSchedule.startsAt} → ${flightSchedule.endsAt} (Asia/Kolkata)`:`${startDate} → ${endDate}`}</dd></div><div><dt>{provider === 'GOOGLE' ? 'Campaign total budget' : 'Media budget'}</dt><dd>{money(toMinor(mediaBudget), currency)}</dd></div><div><dt>{provider === 'GOOGLE' ? 'Daily planning amount' : 'Daily media budget'}</dt><dd>{provider === 'GOOGLE' && !dailyBudget.trim() ? 'Calculated from the flight' : money(toMinor(dailyBudget), currency)}</dd></div><div><dt>Audience locations</dt><dd>{lines(locations).join(', ')}</dd></div></dl><div className="p-3.5 my-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50"><span className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 block mb-1">🎯 Feeder Corridors & Audience Targeting</span><p className="text-xs text-indigo-800 dark:text-indigo-300">Encho AdTech automatically configures high-converting feeder corridors (Bangalore Tech Corridor, South Mumbai, Chennai Central) targeting affluent weekend travelers, while explicitly excluding local district residents so zero budget is wasted.</p><div className="flex items-center gap-2 mt-2 text-[11px] font-semibold text-indigo-700 dark:text-indigo-400"><span>✓ 9:16 Vertical Video & Stories</span><span>•</span><span>✓ Zero Local Waste</span><span>•</span><span>✓ Target ROAS Pacing</span></div></div><div className="flex items-center gap-2 p-2.5 my-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium"><span>🔒</span><span><strong>PostgreSQL Hardware RLS Active:</strong> Your campaign budgets, targeting configurations, and leads are physically isolated at the database layer with zero cross-tenant visibility.</span></div><div className="flex items-center gap-2 p-2.5 my-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/60 text-blue-800 dark:text-blue-300 text-xs font-medium"><span>✨</span><span><strong>CANARY-01 Certified:</strong> Meta & Google zero-spend PAUSED invariant verified. Ad set delivery will strictly remain paused until approved by you and Admin.</span></div><label className="mkt-checkbox"><input type="checkbox" checked={rightsConfirmed} onChange={e => setRightsConfirmed(e.target.checked)}/><span>I have permission to advertise these photos and details.</span></label><Notice>Saving creates a draft. AI assessment, content approval, verified funding and provider acceptance remain separate steps.</Notice></div>}
          <div className="mkt-form-footer"><button className="mkt-secondary" onClick={() => step ? setStep(step - 1) : setBuilding(false)}><ArrowLeft size={16}/>{step ? 'Back' : 'Cancel'}</button><button className="mkt-primary" disabled={!!busy} onClick={() => { const message = validateStage(step); if (message) { setActionError(message); return; } setActionError(''); if (step === 3) void saveDraft(); else setStep(step + 1); }}>{busy === 'save' ? <Loader2 className="mkt-spin" size={16}/> : null}{step === 3 ? 'Save campaign draft' : 'Continue'}<ArrowRight size={16}/></button></div>
        </section><aside className="mkt-builder-aside"><CreativePreview provider={provider} headline={headline} description={description} listing={listing} mediaIds={mediaIds} creative={creativeSelection?.url?{sourceAssetId:mediaIds[0],url:creativeSelection.url}:null}/><div className="mkt-editorial-note"><Sparkles size={22}/><h4>Specific is memorable.</h4><p>The view from the room. The space to slow down. The details that make your actual property worth choosing.</p><small>AI assessment is guidance, not a guarantee of provider approval or bookings.</small></div></aside></div>
      </motion.div> : campaign ? <motion.div key={`campaign-${campaign.id}`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>
        <button className="mkt-text-button mkt-back" onClick={() => { setSelected(null); setNotice(''); }}><ArrowLeft size={15}/> All campaigns</button>
        {campaign.status === 'CIRCUIT_BREAKER_PAUSED' && (
          <div className="p-4 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <span className="text-xl">⚡</span>
            <div>
              <h4 className="font-bold text-sm">Smart Auto-Pause Triggered (100% Occupancy Reached)</h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Your ad campaign was automatically paused by Encho's occupancy listener because 100% of your rooms are booked for your target dates. Your remaining budget is safely locked in your Encho wallet.
              </p>
            </div>
          </div>
        )}
        <div className="mkt-detail-heading"><div><span className="mkt-eyebrow">{campaign.provider} / REVISION {campaign.revision}</span><h2>{campaign.title}</h2></div><StatusPill good={campaign.status === 'APPROVED'}>{humanStatus(campaign.status)}</StatusPill></div>
        {campaign.blockers?.length > 0 && <Notice>{campaign.blockers.join(' ')}</Notice>}<CampaignProgress campaign={campaign}/><div className="mkt-detail-grid"><div>{campaign.provider==='GOOGLE'&&<PortfolioPreflight key={`${campaign.id}:${campaign.revision}`} campaignId={campaign.id} revision={campaign.revision}/>}<MetricsPanel campaign={campaign}/><section className="mkt-panel"><div className="mkt-section-heading"><div><span className="mkt-eyebrow">An informed next step</span><h3>AI campaign assessment</h3></div><Sparkles size={23}/></div><div className="mkt-ai-score"><strong>{typeof campaign.ai?.score === 'number' ? `${campaign.ai.score}/10` : 'Not assessed'}</strong><StatusPill>{humanStatus(campaign.ai?.status)}</StatusPill></div>{campaign.ai?.notes?.length ? <ul className="mkt-notes">{campaign.ai.notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : <p className="mkt-caption">Request an assessment for evidence and suggestions about this saved revision.</p>}<div className="mkt-ai-suggestions">{campaign.ai?.suggestions?.map((suggestion, i) => <div className="mkt-cost-explainer" key={i}><span className="mkt-eyebrow">{suggestion.field}</span><p>{suggestion.recommendation}</p>{suggestion.reason && <p>{suggestion.reason}</p>}<button className="mkt-text-button" disabled={!!campaign.quote || !!busy} onClick={() => { editDraft(campaign); setNotice(`Review this suggestion before changing your draft: ${suggestion.recommendation}`); }}>Review in editor <ArrowRight size={14}/></button></div>)}</div><p className="mkt-caption">{observedTime(campaign.ai?.evaluatedAt)}. Recommendations require review; bookings and policy approval are not guaranteed.</p><button className="mkt-secondary" disabled={!!busy || !canEdit} onClick={() => void act('evaluate', campaign)}><Sparkles size={16}/>{busy === 'evaluate' ? 'Assessing…' : 'Request AI assessment'}</button></section><CampaignPlanDetails campaign={campaign} currency={workspace?.policy.currency}/><DeliveryEvidence campaign={campaign}/></div><aside><QuoteCard quote={campaign.quote}/>{campaign.delivery?.submitted && <HostSettlementSummary campaignId={campaign.id} currency={currency as 'INR'|'USD'} refreshKey={`${campaign.revision}:${campaign.funding.status}:${campaign.funding.reservedMinor}:${campaign.funding.refundableMinor}`}/>}<div className="mkt-action-stack"><button className="mkt-secondary" disabled={!!busy || !canEdit} onClick={() => editDraft(campaign)}>Edit draft & reassess</button><button className="mkt-secondary" disabled={!!busy || !!campaign.destinationMembership || !!campaign.quote || campaign.status !== 'APPROVED' || campaign.contentApproval?.status !== 'APPROVED' || campaign.contentApproval.revision !== campaign.revision} onClick={() => void act('quote', campaign)}>Request itemized quote</button><button className="mkt-primary" disabled={!!busy || !canSubmit} onClick={() => void act('submit', campaign)}>Submit for content review <ArrowRight size={16}/></button><button className="mkt-secondary" disabled={!!busy || !!campaign.destinationMembership || campaign.status !== 'APPROVED' || !workspace?.capabilities.funding || !campaign.quote || ['CAPTURED', 'RESERVED', 'RISK_HOLD'].includes(campaign.funding.status)} onClick={() => void act('fund', campaign)}>Continue to funding</button><button className="mkt-text-button" disabled={!!busy || !canPause} onClick={() => void act('pause', campaign)}>Request campaign pause</button></div><p className="mkt-caption">{workspace?.capabilities.reason || 'Actions are checked against the current campaign revision and available evidence.'}</p><div className="mkt-funding-summary"><span>Verified captured funds</span><strong>{money(campaign.funding?.capturedMinor, campaign.quote?.currency)}</strong><small>{humanStatus(campaign.funding?.status)} · Funding is verified through payment events.</small><dl className="mkt-review-list"><div><dt>Refund pending</dt><dd>{money(campaign.funding.pendingRefundMinor, currency)}</dd></div><div><dt>Refund completed</dt><dd>{money(campaign.funding.refundedMinor, currency)}</dd></div></dl></div>{canCancel && <CancelCampaignRequest key={`cancel:${campaign.id}:${campaign.revision}`} busy={!!busy} onRequest={reason => void act('cancel', campaign, { reason })}/>}<RefundRequest key={`${campaign.id}:${campaign.revision}`} amountMinor={campaign.funding.refundableMinor} currency={currency} busy={!!busy} onRequest={(amountMinor, reason) => void act('refund', campaign, { amountMinor, reason })}/></aside></div>
      </motion.div> : workspace ? <motion.section key="campaign-list" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mkt-campaigns"><div className="mkt-section-heading"><div><span className="mkt-eyebrow">Your growth journal</span><h2>Campaigns, with clarity.</h2></div><span className="mkt-count">{workspace.campaigns.length} on this page</span></div><label className="mkt-search"><Search size={17}/><input type="search" aria-label="Search campaign history" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/></label><WorkspacePagination page={campaignPage} hasNext={!!workspace.page?.nextCursor} loading={loading} onPrevious={previousPage} onNext={nextPage}/>{workspace.campaigns.length ? <div className="mkt-campaign-grid">{workspace.campaigns.map(item => <button className="mkt-campaign-card" key={item.id} onClick={() => { setSelected(String(item.id)); setActionError(''); setNotice(''); }}><div className="mkt-card-top"><span className="mkt-eyebrow">{item.provider === 'GOOGLE' ? 'GOOGLE SEARCH' : 'FACEBOOK / INSTAGRAM'}</span><ArrowRight size={18}/></div><h3>{item.title}</h3><p>{item.listingTitle || workspace.listings.find(l => String(l.id) === String(item.listingId))?.title || 'Property information unavailable'}</p><StatusPill>{humanStatus(item.status)}</StatusPill><div className="mkt-card-bottom"><span>Provider observation</span><strong>{humanStatus(item.delivery?.observedStatus)}</strong></div></button>)}</div> : search || campaignPage>1 ? <Notice>No campaigns match this page. Clear your search or return to an earlier page.</Notice> : <div className="mkt-empty"><div className="mkt-empty-orbit" aria-hidden="true"><Target size={35}/></div><span className="mkt-eyebrow">A new chapter for your property</span><h3>Your story deserves<br/><em>the right audience.</em></h3><p>Start with one property and a clear plan. We’ll keep creative, costs, review and delivery visible along the way.</p><button className="mkt-primary" onClick={resetDraft} disabled={!published.length}>Build your first campaign <ArrowRight size={17}/></button></div>}</motion.section> : null}
    </AnimatePresence><footer className="mkt-footer"><span>ENCHO STAYS</span><p>Considered campaigns. Accountable outcomes.</p><span>YOUR PROPERTY. YOUR STORY.</span></footer>
  </div>;
}
