import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { marketingRequest } from './api';
import { Notice } from './StudioShared';
import './audience.css';

interface Location { resourceName: string; name: string; canonicalName: string; countryCode: string; targetType: string }
interface Language { resourceName: string; name: string; code: string }
interface GoogleAudience { locations: string[]; geoIds: string[]; languageIds: string[] }
const regionName = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; } };

export function MetaAudiencePicker({ allowed, selected, onChange }: { allowed: string[]; selected: string[]; onChange: (codes: string[]) => void }) {
  return <fieldset className="mkt-audience-picker"><legend>Where do your ideal guests live?</legend>
    <p className="mkt-caption">Choose countries your guests travel from. These are the countries enabled for Encho’s account.</p>
    {!allowed.length && <Notice>Country targeting needs to be configured before a Meta campaign can be prepared.</Notice>}
    <div className="mkt-country-options">{allowed.map(code => <label className="mkt-checkbox" key={code}><input type="checkbox" checked={selected.includes(code)} onChange={e => onChange(e.target.checked ? [...selected, code] : selected.filter(item => item !== code))}/><span>{regionName(code)}</span></label>)}</div>
    {selected.some(code => !allowed.includes(code)) && <Notice error>A previously selected country is no longer enabled. Remove it before saving. <button type="button" className="mkt-text-button" onClick={() => onChange(selected.filter(code => allowed.includes(code)))}>Remove unavailable countries</button></Notice>}
  </fieldset>;
}

export function GoogleAudiencePicker({ value, onChange }: { value: GoogleAudience; onChange: (next: GoogleAudience) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [selected, setSelected] = useState<Location[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [languageError, setLanguageError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(value.geoIds.length > 0);
  const [languageLoading, setLanguageLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const current = useRef({ value, onChange });
  useEffect(() => { current.current = { value, onChange }; }, [value, onChange]);
  const known = useRef(new Map<string, Location>());
  const geoKey = value.geoIds.join(',');

  useEffect(() => {
    const controller = new AbortController(); setLanguageLoading(true); setLanguageError('');
    void marketingRequest<{ languages: Language[] }>('/targeting/google/languages', { signal: controller.signal }).then(data => {
      if (!Array.isArray(data.languages) || data.languages.some(item => !/^languageConstants\/[1-9]\d*$/.test(item.resourceName) || typeof item.name !== 'string')) throw new Error('Language options could not be verified.');
      if (!controller.signal.aborted) setLanguages(data.languages);
    }).catch(error => { if (!controller.signal.aborted) setLanguageError(error instanceof Error ? error.message : 'Language options are unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setLanguageLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController(); const ids = current.current.value.geoIds;
    setResolveError('');
    const commit = (items: Location[]) => {
      if (controller.signal.aborted) return;
      items.forEach(item => known.current.set(item.resourceName, item)); setSelected(items); setResolving(false);
      const next = items.map(item => item.canonicalName);
      if (next.join('\n') !== current.current.value.locations.join('\n')) current.current.onChange({ ...current.current.value, locations: next });
    };
    if (!ids.length) { commit([]); return () => controller.abort(); }
    if (ids.every(id => known.current.has(id))) { commit(ids.map(id => known.current.get(id)!)); return () => controller.abort(); }
    setResolving(true);
    void marketingRequest<{ locations: Location[] }>('/targeting/google/resolve', { method: 'POST', signal: controller.signal, body: JSON.stringify({ locations: ids, languages: [] }) }).then(data => {
      if (!Array.isArray(data.locations) || data.locations.length !== ids.length || data.locations.some((item, index) => item.resourceName !== ids[index] || typeof item.canonicalName !== 'string')) throw new Error('Saved locations could not be verified.');
      commit(data.locations);
    }).catch(error => { if (!controller.signal.aborted) { setResolveError(error instanceof Error ? error.message : 'Saved locations are unavailable.'); setResolving(false); } });
    return () => controller.abort();
  }, [geoKey, refresh]);

  useEffect(() => {
    const controller = new AbortController(); setResults([]); setSearchError(''); setSearching(false);
    if (query.trim().length < 2) return () => controller.abort();
    setSearching(true);
    const timer = setTimeout(() => {
      void marketingRequest<{ locations: Location[] }>(`/targeting/google/locations?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(data => {
        if (!Array.isArray(data.locations) || data.locations.some(item => !/^geoTargetConstants\/[1-9]\d*$/.test(item.resourceName) || typeof item.canonicalName !== 'string')) throw new Error('Location results could not be verified.');
        if (!controller.signal.aborted) setResults(data.locations);
      }).catch(error => { if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Location search is unavailable.'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, refresh]);

  const changeLocations = (items: Location[]) => {
    items.forEach(item => known.current.set(item.resourceName, item)); setSelected(items);
    onChange({ ...value, geoIds: items.map(item => item.resourceName), locations: items.map(item => item.canonicalName) });
  };
  const usable = !resolving && !resolveError;
  return <fieldset className="mkt-audience-picker"><legend>Where do your ideal guests live?</legend>
    <p className="mkt-caption">Search for cities, regions or countries. Select the full location name to avoid places with similar names.</p>
    <label className="mkt-location-search"><span>Find an audience location</span><div><Search size={18}/><input type="search" maxLength={80} value={query} onChange={e => setQuery(e.target.value)} aria-label="Find an audience location" autoComplete="off"/></div></label>
    <div className="mkt-location-feedback" role="status" aria-live="polite">{searching ? <><Loader2 size={15} className="mkt-spin"/> Searching Google locations…</> : query.trim().length >= 2 && !searchError ? `${results.length} locations found` : 'Type at least two characters to search.'}</div>
    {searchError && <Notice error>{searchError}</Notice>}
    {!!results.length && <ul className="mkt-location-results" aria-label="Matching audience locations">{results.map(item => <li key={item.resourceName}><button type="button" disabled={!usable || value.geoIds.includes(item.resourceName) || value.geoIds.length >= 20} onClick={() => { changeLocations([...selected, item]); setQuery(''); }}><MapPin size={17}/><span><strong>{item.canonicalName}</strong><small>{item.targetType} · {regionName(item.countryCode)}</small></span>{value.geoIds.includes(item.resourceName) && <small>Selected</small>}</button></li>)}</ul>}
    {resolving && <p role="status" className="mkt-caption">Verifying saved locations…</p>}
    {resolveError && <Notice error>{resolveError} <button type="button" className="mkt-text-button" onClick={() => { known.current.clear(); changeLocations([]); }}>Clear unavailable selection</button></Notice>}
    <div className="mkt-audience-tags" aria-label="Selected audience locations">{selected.map(item => <span key={item.resourceName}>{item.canonicalName}<button type="button" aria-label={`Remove ${item.canonicalName}`} disabled={!usable} onClick={() => changeLocations(selected.filter(option => option.resourceName !== item.resourceName))}><X size={14}/></button></span>)}</div>
    <p className="mkt-caption">{value.geoIds.length}/20 locations selected. Your campaign targets the selected locations; text entered in the search box is not a selection.</p>
    <label>Audience languages<select aria-label="Add an audience language" value="" disabled={languageLoading || !!languageError || value.languageIds.length >= 10} onChange={e => { if (e.target.value) onChange({ ...value, languageIds: [...value.languageIds, e.target.value] }); }}><option value="">{languageLoading ? 'Loading supported languages…' : 'Choose a language'}</option>{languages.filter(item => !value.languageIds.includes(item.resourceName)).map(item => <option key={item.resourceName} value={item.resourceName}>{item.name}</option>)}</select></label>
    {languageError && <Notice error>{languageError}</Notice>}
    <div className="mkt-audience-tags" aria-label="Selected audience languages">{value.languageIds.map(id => <span key={id}>{languages.find(item => item.resourceName === id)?.name || (languageLoading ? 'Verifying language…' : 'Unavailable language')}<button type="button" aria-label={`Remove ${languages.find(item => item.resourceName === id)?.name || 'unavailable language'}`} onClick={() => onChange({ ...value, languageIds: value.languageIds.filter(item => item !== id) })}><X size={14}/></button></span>)}</div>
    <p className="mkt-caption">Choose languages your guests understand and that your listing can serve. Google supplies these targeting options.</p>
    {(searchError || languageError || resolveError) && <button type="button" className="mkt-text-button" onClick={() => { known.current.clear(); setRefresh(value => value + 1); }}>Retry targeting lookup</button>}
  </fieldset>;
}
