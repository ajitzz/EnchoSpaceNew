import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { marketingRequest, observedTime } from './api';
import { Notice } from './StudioShared';
import { guidanceResponseSchema, type GuidanceResponse, type GuidanceApply } from '../../src/lib/marketing/guidanceContract';
export type { GuidanceApply } from '../../src/lib/marketing/guidanceContract';

export function CampaignGuidance({ listingId, provider, disabled = false, onApply }: {
  listingId: string; provider: 'GOOGLE' | 'META'; disabled?: boolean; onApply: (value: GuidanceApply) => void;
}) {
  const [result, setResult] = useState<GuidanceResponse | null>(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [applied, setApplied] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort(); setResult(null); setError(''); setConfirmed(false); setApplied(false); setBusy(false);
    return () => request.current?.abort();
  }, [listingId, provider]);
  const generate = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setResult(null); setConfirmed(false); setApplied(false);
    try {
      const raw = await marketingRequest<unknown>('/campaign-guidance', { method: 'POST', signal: controller.signal, body: JSON.stringify({ listingId, provider }) });
      const response = guidanceResponseSchema.parse(raw);
      if (String(response.listingId) !== listingId || response.provider !== provider) throw new Error('The guidance belongs to a different property or channel. Request it again.');
      if (!controller.signal.aborted) setResult(response);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error && e.name !== 'ZodError' ? e.message : 'The AI response could not be verified. Continue editing your draft or try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const apply = () => {
    if (!confirmed || !result?.suggestions || disabled || applied || String(result.listingId) !== listingId || result.provider !== provider) return;
    const s = result.suggestions;
    onApply({ headline: s.headlines[0].text, description: s.descriptions[0].text,
      ...(provider === 'GOOGLE' ? { googleSearch: { headlines: s.headlines.map(item => item.text), descriptions: s.descriptions.map(item => item.text), keywords: s.keywords.map(({ text, matchType }) => ({ text, matchType })) } } : {}) });
    setApplied(true);
  };
  return <section className="mkt-panel" aria-label="AI drafting guidance" aria-busy={busy}>
    <div className="mkt-section-heading"><div><span className="mkt-eyebrow">A starting point, grounded in your listing</span><h3>Shape your campaign with AI</h3></div><Sparkles size={22} aria-hidden="true"/></div>
    <p className="mkt-caption">Explore copy drawn from your property details. Review the source, choose what fits and keep control of your campaign.</p>
    <button type="button" className="mkt-secondary" onClick={() => void generate()} disabled={disabled || busy || !listingId}>{busy ? 'Reading your property details…' : result ? 'Request fresh suggestions' : 'Suggest campaign copy'}</button>
    <p className="mkt-caption">Up to five requests per hour. Suggestions use listing text; they do not certify photos, video, policies or booking performance.</p>
    {error && <Notice error>{error}</Notice>}
    {result?.status === 'UNAVAILABLE' && <Notice>AI drafting is unavailable for this request. Your draft remains editable. No suggestions or approval were generated.</Notice>}
    {result?.suggestions && <>
      <p className="mkt-caption">Generated {observedTime(result.generatedAt)}{result.model ? ` · ${result.model}` : ''}</p>
      {[['Headlines', result.suggestions.headlines], ['Descriptions', result.suggestions.descriptions], ...(provider === 'GOOGLE' ? [['Search keywords', result.suggestions.keywords] as const] : [])].map(([label, items]) => <div key={label as string}>
        <span className="mkt-eyebrow">{label as string}</span><ul className="mkt-notes">{(items as NonNullable<GuidanceResponse['suggestions']>['headlines']).map((item, i) => <li key={i}>
          <strong>{'matchType' in item ? `${item.matchType}: ` : ''}{item.text}</strong>
          <details className="mkt-details"><summary>View listing evidence</summary>{item.evidence.map((e, j) => <p key={j} className="mkt-caption">{e.field}: “{e.quote}”</p>)}</details>
        </li>)}</ul>
      </div>)}
      <ul className="mkt-notes">{result.suggestions.notes.map(note => <li key={note}>{note}</li>)}</ul>
      <label className="mkt-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={disabled || applied}/><span>I reviewed the source text and confirm this copy accurately describes my property.</span></label>
      <button type="button" className="mkt-primary" disabled={disabled || !confirmed || applied} onClick={apply}>{applied ? 'Applied to your editable draft' : <>Apply reviewed copy <ArrowRight size={16}/></>}</button>
      {applied && <Notice>Copy added to the editor. Review your full draft, then save and run its campaign assessment.</Notice>}
    </>}
  </section>;
}
