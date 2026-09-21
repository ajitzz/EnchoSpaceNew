// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {AdtechInference} from '../../../components/marketing/AdtechInference';
import {marketingRequest} from '../../../components/marketing/api';
vi.mock('../../../components/marketing/api',()=>({marketingRequest:vi.fn()}));
vi.mock('../../../components/marketing/AdtechMap',()=>({AdtechMap:()=>React.createElement('div',null,'Verified public feeder map')}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('requires a reason and sends the immutable hash plus latest saved corridor version',async()=>{
 const proposal={id:1,destination_name:'Wayanad',provider:'META',tier_code:'BUDGET',state:'PROPOSED',content_hash:'a'.repeat(64),content:{destination:{districtName:'Wayanad'},geography:[],feeders:[{city:'Bengaluru',radiusKm:30,rationale:'Transport hypothesis for review.'}],assumptions:['Commercial suitability requires review.']}};
 vi.mocked(marketingRequest).mockImplementation(async(path)=>path.endsWith('/inference')?{jobs:[],proposals:[proposal]}:{corridors:[{id:10,name:'Wayanad'}],versions:[{corridor_id:10,tier_code:'BUDGET',provider:'META',version:2}]});
 const run=vi.fn(async()=>{proposal.state='APPROVED';});render(React.createElement(AdtechInference,{run,busy:false}));const approve=await screen.findByRole('button',{name:'Approve as saved corridor version'});expect(approve).toHaveProperty('disabled',true);
 fireEvent.change(screen.getByLabelText('Review reason for Wayanad'),{target:{value:'Reviewed provider evidence and feeder suitability.'}});fireEvent.click(approve);
 await waitFor(()=>expect(run).toHaveBeenCalledWith('/inference/1/review',{action:'APPROVE',expectedHash:'a'.repeat(64),expectedVersion:2,reason:'Reviewed provider evidence and feeder suitability.'}));expect(run.mock.calls).toHaveLength(1);
 await screen.findByText('Review status: APPROVED');expect(screen.queryByRole('button',{name:'Approve as saved corridor version'})).toBeNull();
});
it('shows an actionable unavailable state without fabricating research',async()=>{
 vi.mocked(marketingRequest).mockRejectedValue(new Error('Destination research is unavailable.'));render(React.createElement(AdtechInference,{run:vi.fn(),busy:false}));expect(await screen.findByRole('alert')).toHaveProperty('textContent','Destination research is unavailable.');expect(screen.queryByRole('button',{name:'Approve as saved corridor version'})).toBeNull();
});
