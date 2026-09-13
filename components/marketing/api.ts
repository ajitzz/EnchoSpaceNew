import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioWorkspace } from './types';

export async function marketingRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Sign in again to access your campaign workspace.');
  const response = await fetch(`/api/marketing/v2${path}`, { ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  let body: any;
  try { body = await response.json(); } catch { throw new Error('The campaign service returned an unreadable response. Please refresh.'); }
  if (!response.ok) {
    const fields = Array.isArray(body?.fields) ? body.fields.filter((field: any) => typeof field?.path === 'string' && typeof field?.message === 'string') : [];
    const message = fields.length ? `Campaign fields need attention. ${fields.slice(0, 6).map((field: any) => `${field.path}: ${field.message}`).join(' ')}`
      : typeof body?.error === 'string' ? body.error : 'This campaign action could not be completed. Please refresh and try again.';
    const correlation = typeof body?.correlationId === 'string' && /^[a-f0-9-]{36}$/i.test(body.correlationId) ? ` Support reference: ${body.correlationId}.` : '';
    throw new Error(`${message}${correlation}`);
  }
  return body as T;
}

export function useMarketingWorkspace(admin = false) {
  const [workspace, setWorkspace] = useState<StudioWorkspace | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search,setSearch]=useState(''),[listingSearch,setListingSearch]=useState(''),[filter,setFilter]=useState('all');
  const [querySearch,setQuerySearch]=useState(''),[queryListingSearch,setQueryListingSearch]=useState('');
  const [cursors,setCursors]=useState<number[]>([]),[listingCursors,setListingCursors]=useState<number[]>([]);
  useEffect(()=>{if(search.trim()===querySearch)return;const timer=setTimeout(()=>{setQuerySearch(search.trim());setCursors([]);},350);return()=>clearTimeout(timer);},[search,querySearch]);
  useEffect(()=>{if(listingSearch.trim()===queryListingSearch)return;const timer=setTimeout(()=>{setQueryListingSearch(listingSearch.trim());setListingCursors([]);},350);return()=>clearTimeout(timer);},[listingSearch,queryListingSearch]);
  const params=new URLSearchParams();
  if(cursors.length)params.set('before',String(cursors.at(-1)));
  if(listingCursors.length)params.set('listingBefore',String(listingCursors.at(-1)));
  if(querySearch)params.set('search',querySearch);
  if(queryListingSearch)params.set('listingSearch',queryListingSearch);
  if(filter!=='all')params.set('filter',filter);
  const query=params.toString();
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await marketingRequest<StudioWorkspace>(`${admin ? '/admin/workspace' : '/workspace'}${query?'?'+query:''}`, { signal: controller.signal });
      if (!Array.isArray(result?.campaigns) || !Array.isArray(result?.listings) || !result.policy || !result.capabilities) {
        throw new Error('Campaign workspace data is incomplete. Please refresh.');
      }
      if (!controller.signal.aborted) { setWorkspace(result); setError(''); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'The campaign workspace is unavailable.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [admin,query]);
  useEffect(() => {
    setLoading(true);
    void reload();
    const timer = setInterval(() => { if (!document.hidden) void reload(); }, 30000);
    const onVisible = () => { if (!document.hidden) void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); request.current?.abort(); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]);
  return { workspace, loading, error, reload, search,setSearch,listingSearch,setListingSearch,filter,
    setFilter:(value:string)=>{setFilter(value);setCursors([]);},
    campaignPage:cursors.length+1,listingPage:listingCursors.length+1,
    previousPage:()=>setCursors(values=>values.slice(0,-1)),
    nextPage:()=>{if(workspace?.page?.nextCursor)setCursors(values=>[...values,workspace.page!.nextCursor!]);},
    previousListingPage:()=>setListingCursors(values=>values.slice(0,-1)),
    nextListingPage:()=>{if(workspace?.listingPage?.nextCursor)setListingCursors(values=>[...values,workspace.listingPage!.nextCursor!]);},
    showNewest:()=>{setSearch('');setQuerySearch('');setFilter('all');setCursors([]);},
  };
}

export function money(value: string | null | undefined, currency = 'INR'): string {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return 'Unavailable';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) / 100); }
  catch { return 'Unavailable'; }
}

export function toMinor(value: string): string | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return minor > 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? minor.toString() : null;
}

export const humanStatus = (value: string | null | undefined) => value ? value.replaceAll('_', ' ').toLowerCase() : 'Not observed';
export const observedTime = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No observation yet';
