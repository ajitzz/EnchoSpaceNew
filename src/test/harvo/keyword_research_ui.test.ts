// @vitest-environment jsdom
import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {KeywordResearchPanel} from '../../../components/marketing/KeywordResearchPanel.js';
import {marketingRequest} from '../../../components/marketing/api.js';
const auth = vi.hoisted(() => ({token:'host-a'}));
vi.mock('../../../components/AuthContext.js', () => ({useAuth: () => auth}));
vi.mock('../../../components/marketing/api.js', async original => ({...await original<typeof import('../../../components/marketing/api.js')>(), marketingRequest:vi.fn()}));
const props = () => ({listingId:'20',geoIds:['geoTargetConstants/2356'],languageIds:['languageConstants/1000'],keywords:['EXACT: garden villa'],onSelect:vi.fn()});
const result = () => ({status:'AVAILABLE',cached:false,evidence:{source:'GOOGLE_KEYWORD_PLAN_IDEA',apiVersion:'v25',currency:'INR',historical:true,observedAt:'2026-09-21T00:00:00Z',truncated:false,ideas:[{text:'garden stay',averageMonthlySearches:'0',competition:'UNKNOWN',competitionIndex:null,lowTopOfPageBidMicros:'1234567',highTopOfPageBidMicros:null,monthlySearchVolumes:[]}]}});
beforeEach(() => {auth.token='host-a';vi.mocked(marketingRequest).mockReset();});
afterEach(cleanup);
describe('historical keyword evidence and intentional selection', () => {
 it('binds to the owned preview, preserves zero/missing, and never applies an idea automatically', async () => {
  vi.mocked(marketingRequest).mockResolvedValueOnce({factHash:'a'.repeat(64)}).mockResolvedValueOnce(result());
  const input=props();render(React.createElement(KeywordResearchPanel,input));
  expect(marketingRequest).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Research keyword ideas'}));
  await screen.findByText('garden stay');expect(screen.getByText('0')).toBeTruthy();expect(screen.getByText('INR 1.23 – Unavailable')).toBeTruthy();
  expect(JSON.parse(vi.mocked(marketingRequest).mock.calls[1][1]!.body as string)).toMatchObject({factHash:'a'.repeat(64),listingId:20,keywords:['garden villa']});
  expect(input.onSelect).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Add exact phrase: garden stay'}));expect(input.onSelect).toHaveBeenCalledExactlyOnceWith('garden stay');
 });
 it.each(['tenant','location'])('discards in-flight evidence after %s changes',async change=>{
  let finish!:(value:unknown)=>void;
  vi.mocked(marketingRequest).mockResolvedValueOnce({factHash:'a'.repeat(64)}).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
  const input=props(),view=render(React.createElement(KeywordResearchPanel,input));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Research keyword ideas'}));});
  if(change==='tenant')auth.token='host-b';else input.geoIds=['geoTargetConstants/2040'];
  view.rerender(React.createElement(KeywordResearchPanel,input));await act(async()=>finish(result()));
  expect(screen.queryByText('garden stay')).toBeNull();expect(vi.mocked(marketingRequest).mock.calls[1][1]!.signal!.aborted).toBe(true);
 });
 it('keeps a pending report distinct from no demand and makes no automatic retry',async()=>{
  vi.mocked(marketingRequest).mockResolvedValueOnce({factHash:'a'.repeat(64)}).mockResolvedValueOnce({status:'PENDING',evidence:null});
  render(React.createElement(KeywordResearchPanel,props()));fireEvent.click(screen.getByRole('button',{name:'Research keyword ideas'}));await screen.findByText(/Research is already running/);
  expect(marketingRequest).toHaveBeenCalledTimes(2);expect(screen.queryByText(/No ideas were returned/)).toBeNull();
 });
 it('requires one research language instead of silently researching only the first',()=>{
  render(React.createElement(KeywordResearchPanel,{...props(),languageIds:['languageConstants/1000','languageConstants/1001']}));
  expect((screen.getByRole('button',{name:'Research keyword ideas'}) as HTMLButtonElement).disabled).toBe(true);
 });
});
