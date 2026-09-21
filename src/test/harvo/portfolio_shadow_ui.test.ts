// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {PortfolioShadowPanel} from '../../../components/marketing/PortfolioShadowPanel.js';
import {marketingRequest} from '../../../components/marketing/api.js';
vi.mock('../../../components/marketing/api.js',async original=>({...await original<typeof import('../../../components/marketing/api.js')>(),marketingRequest:vi.fn()}));
const receipt={id:'7108f67a-61b5-41ea-a83a-e2514f14501d',created_at:'2026-09-21T00:00:00Z',evidence:{mode:'SHADOW_ONLY',blocking:false,candidateCount:0,truncated:false,skippedCampaignIds:[],limitations:['Semantic overlap is unmeasured.'],conflicts:[]}};
beforeEach(()=>{vi.mocked(marketingRequest).mockReset();});afterEach(cleanup);
describe('admin shadow review receipts',()=>{
 it('keeps inspection manual and retries an uncertain annotation with its original identity',async()=>{
  vi.mocked(marketingRequest).mockResolvedValueOnce(receipt).mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce({id:'review-receipt'});
  render(React.createElement(PortfolioShadowPanel,{campaignId:1,revision:1}));expect(marketingRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Inspect shadow overlap'}));await screen.findByRole('form',{name:'Review shadow observation'});
  const submit=screen.getByRole('button',{name:'Record review'});expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Evidence reference'),{target:{value:'search-terms-observation-2026'}});
  fireEvent.change(screen.getByLabelText('Review notes'),{target:{value:'Current observations do not establish auction harm or geographic overlap.'}});
  fireEvent.click(submit);await screen.findByText('Connection interrupted');fireEvent.click(submit);await screen.findByText('Immutable review receipt: review-receipt');
  const calls=vi.mocked(marketingRequest).mock.calls;expect(calls[1][1]!.headers).toEqual(calls[2][1]!.headers);expect(calls[1][1]!.body).toEqual(calls[2][1]!.body);
  expect((screen.getByRole('button',{name:'Review recorded'}) as HTMLButtonElement).disabled).toBe(true);
  expect(calls.every(([path])=>path.includes('portfolio'))).toBe(true);
 });
 it('aborts stale inspection when its campaign drawer closes',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(marketingRequest).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const view=render(React.createElement(PortfolioShadowPanel,{campaignId:1,revision:1}));fireEvent.click(screen.getByRole('button',{name:'Inspect shadow overlap'}));view.unmount();
  await act(async()=>resolve(receipt));expect(vi.mocked(marketingRequest).mock.calls[0][1]!.signal!.aborted).toBe(true);
 });
});
