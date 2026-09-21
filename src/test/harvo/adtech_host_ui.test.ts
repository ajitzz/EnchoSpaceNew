// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AdaptiveAudience,useStrategyDefaults,type AudienceDefaults} from '../../../components/marketing/AdaptiveAudience';
import {marketingRequest} from '../../../components/marketing/api';
vi.mock('../../../components/marketing/api',()=>({marketingRequest:vi.fn(),money:(value:string)=>`INR-paise ${value}`}));
vi.mock('../../../components/marketing/AdtechMap',()=>({AdtechMap:()=>React.createElement('div',null,'Public feeder map')}));
const data=(tier:'BUDGET'|'COMFORT'|'PREMIUM'='BUDGET'):AudienceDefaults=>({provider:'META',tier,price:{version:1,listingId:20,currency:'INR',amountMinor:'350000',basis:'ENTIRE_STAY_BASE_NIGHT',roomTypeId:null,sourceHash:'a'.repeat(64),observedAt:'2026-09-22T00:00:00.000Z'},budget:{total:{min:'150000',max:'250000'},daily:{min:'35000',max:'50000'},cacHypothesis:{min:'60000',max:'120000'}},limits:{enabled:true,minRadiusKm:17,maxRadiusKm:80,maxFeeders:10},selection:{releaseId:1,profileVersionId:1,corridorVersionId:1,priceHash:'a'.repeat(64),overrides:[]},geography:[{kind:'PROVIDER_CITY_RADIUS',label:'Bengaluru',latitude:12.97,longitude:77.59,radiusKm:30,evidenceHash:'b'.repeat(64)},{kind:'PROVIDER_REGION_EXCLUSION',label:'Wayanad',evidenceHash:'c'.repeat(64)}],assumptions:['Acquisition costs are hypotheses, not guarantees.']});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('adaptive host audience experience',()=>{
 it.each(['BUDGET','COMFORT','PREMIUM'] as const)('uses server-provided %s presets and never edits district exclusions',tier=>{
  const result=data(tier),budget=vi.fn(),change=vi.fn();render(React.createElement(AdaptiveAudience,{data:result,selection:result.selection,onBudget:budget,onChange:change}));
  fireEvent.click(screen.getByRole('button',{name:'INR-paise 200000 media'}));expect(budget).toHaveBeenCalledWith('200000','35000');expect(screen.getByText('Excluded: Wayanad district · locked')).toBeTruthy();expect(screen.getAllByRole('checkbox')).toHaveLength(1);expect(screen.getByRole('checkbox')).toHaveProperty('disabled',true);
  const slider=screen.getByRole('slider');expect(slider.getAttribute('min')).toBe('17');expect(slider.getAttribute('max')).toBe('80');fireEvent.change(slider,{target:{value:'40'}});expect(change).toHaveBeenCalledWith({...result.selection,overrides:[{evidenceHash:'b'.repeat(64),radiusKm:40}]});
 });
 it('discards stale defaults when a host switches properties',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(marketingRequest).mockImplementationOnce(()=>new Promise(r=>resolve=r));vi.mocked(marketingRequest).mockResolvedValueOnce({...data(),price:{...data().price,listingId:21}});
  function Harness({id}:{id:string}){const result=useStrategyDefaults(id,'META',true);return React.createElement('p',null,result.data?.price.listingId??'loading');}
  const view=render(React.createElement(Harness,{id:'20'}));view.rerender(React.createElement(Harness,{id:'21'}));await screen.findByText('21');await act(async()=>resolve(data()));expect(screen.queryByText('20')).toBeNull();expect(screen.getByText('21')).toBeTruthy();
 });
});
