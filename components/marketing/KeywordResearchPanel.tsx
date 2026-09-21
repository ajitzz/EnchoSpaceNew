import React, {useEffect, useRef, useState} from 'react';
import {useAuth} from '../AuthContext';
import {marketingRequest, observedTime} from './api';
import type {KeywordResearchEvidence} from '../../src/lib/marketing/portfolio/keywordContract';

type Props = {listingId: string; geoIds: string[]; languageIds: string[]; keywords: string[]; disabled?: boolean; onSelect: (text: string) => void};
type Result = {status: string; cached: boolean; evidence: KeywordResearchEvidence | null};
const seedText = (value: string) => value.replace(/^(EXACT|PHRASE):\s*/, '').trim();
const integer = (value: string | null) => value === null ? 'Unavailable' : BigInt(value).toLocaleString('en-IN');
// Keep int64 micros exact; this is historical bid evidence, not a payable amount.
const bid = (value: string | null, currency: string) => {
  if (value === null) return 'Unavailable';
  const micros = BigInt(value), cents = (micros + 5000n) / 10000n;
  return `${currency} ${(cents / 100n).toLocaleString('en-IN')}.${(cents % 100n).toString().padStart(2, '0')}`;
};

/** Changing tenant or targeting unmounts the evidence, including any late response. */
export function KeywordResearchPanel(props: Props) {
  const {token} = useAuth();
  return token ? <Research key={JSON.stringify([token, props.listingId, props.geoIds, props.languageIds])} {...props}/> : null;
}
function Research({listingId, geoIds, languageIds, keywords, disabled, onSelect}: Props) {
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const seeds = [...new Set(keywords.map(seedText).filter(Boolean))];
  const ready = !!listingId && geoIds.length > 0 && languageIds.length === 1 && seeds.length <= 20;
  async function research() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(''); setResult(null);
    try {
      const facts = await marketingRequest<{factHash: string}>(`/listings/${encodeURIComponent(listingId)}/marketing-facts`, {signal: controller.signal});
      const response = await marketingRequest<Result>('/targeting/google/keyword-ideas', {method: 'POST', signal: controller.signal,
        body: JSON.stringify({listingId: Number(listingId), factHash: facts.factHash, keywords: seeds, geoTargetConstants: geoIds, languageConstant: languageIds[0]})});
      if (!controller.signal.aborted) setResult(response);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Keyword research is unavailable.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <section className="mkt-keyword-research" aria-label="Search demand research">
    <h4>Explore search demand</h4>
    <p className="mkt-caption">Research uses your published property, selected locations and search phrases. Historical search volume and bid ranges are guidance; they do not predict clicks, bookings or your campaign’s cost.</p>
    {!ready && <p className="mkt-caption">Choose a property, audience locations and exactly one research language. Use up to 20 seed phrases.</p>}
    <button type="button" className="mkt-secondary" disabled={!ready || disabled || loading} onClick={() => void research()}>{loading ? 'Reading search evidence…' : 'Research keyword ideas'}</button>
    <div aria-live="polite">
      {error && <p role="alert">{error}</p>}
      {result?.status === 'PENDING' && <p>Research is already running. Use the research button again shortly to read its result.</p>}
      {result?.status === 'UNAVAILABLE' && <p>Search evidence could not be retrieved. Your draft is unchanged; try again later.</p>}
      {result?.evidence && <>
        <p className="mkt-caption">Historical Google search evidence · {observedTime(result.evidence.observedAt)}{result.cached ? ' · Cached' : ''}{result.evidence.truncated ? ' · First 100 ideas' : ''}</p>
        {result.status === 'EMPTY' && <p>No ideas were returned for these seeds and locations. This does not mean there is no demand.</p>}
        <ul className="mkt-keyword-ideas">{result.evidence.ideas.map(idea => <li key={idea.text}>
          <strong>{idea.text}</strong>
          <dl><div><dt>Average monthly searches</dt><dd>{integer(idea.averageMonthlySearches)}</dd></div>
            <div><dt>Competition</dt><dd>{idea.competition === 'UNKNOWN' ? 'Unavailable' : idea.competition.toLowerCase()}{idea.competitionIndex !== null ? ` · ${idea.competitionIndex}/100` : ''}</dd></div>
            <div><dt>Historical top-of-page bid range</dt><dd>{idea.lowTopOfPageBidMicros===null&&idea.highTopOfPageBidMicros===null?'Unavailable':`${bid(idea.lowTopOfPageBidMicros, result.evidence!.currency)} – ${bid(idea.highTopOfPageBidMicros, result.evidence!.currency)}`}</dd></div></dl>
          <button type="button" className="mkt-secondary" disabled={disabled || seeds.some(seed => seed.toLocaleLowerCase() === idea.text.toLocaleLowerCase())} onClick={() => onSelect(idea.text)}>
            {seeds.some(seed => seed.toLocaleLowerCase() === idea.text.toLocaleLowerCase()) ? 'Selected' : `Add exact phrase: ${idea.text}`}
          </button>
        </li>)}</ul>
        <p className="mkt-caption">Only add phrases that truthfully describe your stay. Exact matching can include close variants. Missing values are unavailable, not zero.</p>
      </>}
    </div>
  </section>;
}
