// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import AdtechWorkspace from '../../../components/marketing/AdtechWorkspace';
import {marketingRequest} from '../../../components/marketing/api';
vi.mock('../../../components/marketing/api',()=>({marketingRequest:vi.fn()}));
vi.mock('../../../components/marketing/AdtechMap',()=>({AdtechMap:()=> React.createElement('div',null,'Public feeder map')}));
const configs=JSON.parse(readFileSync('src/migrations/032_marketing_adtech_registry.sql','utf8').split('$profiles$')[1]);
const fixture=()=>({profiles:configs.map((config:any,i:number)=>({id:i+1,version:1,version_id:i+1,tier_code:config.tier,config,capabilityIssues:{META:[],GOOGLE:[]}})),versions:configs.map((config:any,i:number)=>({id:i+1,config})),currentReleaseId:1,releases:[{id:1,reason:'Seeded founder hypotheses',version_ids:[1,2,3]}],audits:[]});
beforeEach(()=>{vi.mocked(marketingRequest).mockReset();vi.mocked(marketingRequest).mockImplementation(async(path)=>path.endsWith('/corridors')?{corridors:[],versions:[],published:[]} as any:fixture());});
afterEach(cleanup);
describe('admin AdTech release workspace',()=>{
 it('loads published state, exposes clear controls and blocks unexplained changes',async()=>{
  render(React.createElement(AdtechWorkspace));await screen.findByText('BUDGET · v1');expect((screen.getByRole('button',{name:'Publish reviewed saved versions'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByLabelText('Minimum nightly price · paise')).toHaveProperty('value','100000');
  fireEvent.click(screen.getByRole('button',{name:'COMFORT · v1'}));expect(screen.getByLabelText('Minimum nightly price · paise')).toHaveProperty('value','400000');
 });
 it('saves an immutable profile with its CAS version and stable retry identity',async()=>{
  render(React.createElement(AdtechWorkspace));await screen.findByText('BUDGET · v1');fireEvent.change(screen.getByLabelText('Maximum age'),{target:{value:'34'}});fireEvent.change(screen.getByLabelText('Reason for change'),{target:{value:'Test future campaign age change'}});
  fireEvent.click(screen.getByRole('button',{name:'Save immutable profile version'}));await waitFor(()=>expect(marketingRequest).toHaveBeenCalledWith('/admin/adtech/profiles/1',expect.objectContaining({method:'PUT'})));
  const call=vi.mocked(marketingRequest).mock.calls.find(c=>c[0]==='/admin/adtech/profiles/1')!;expect(JSON.parse(call[1]!.body as string)).toMatchObject({expectedVersion:1,profile:{meta:{ageMax:34}}});expect((call[1]?.headers as any)['Idempotency-Key']).toMatch(/^[a-f0-9-]{36}$/);
 });
 it('publishes saved versions with expected release identity, not unsaved form data',async()=>{
  render(React.createElement(AdtechWorkspace));await screen.findByText('BUDGET · v1');fireEvent.change(screen.getByLabelText('Reason for change'),{target:{value:'Publish reviewed release versions'}});fireEvent.change(screen.getByLabelText('Maximum age'),{target:{value:'34'}});fireEvent.click(screen.getByRole('button',{name:'Publish reviewed saved versions'}));
  await waitFor(()=>expect(marketingRequest).toHaveBeenCalledWith('/admin/adtech/releases',expect.objectContaining({body:JSON.stringify({expectedReleaseId:1,versionIds:[1,2,3],reason:'Publish reviewed release versions'})})));
 });
 it('presents authorization failures without rendering editable strategy data',async()=>{
  vi.mocked(marketingRequest).mockRejectedValue(new Error('Administrator access required.'));render(React.createElement(AdtechWorkspace));expect(await screen.findByRole('alert')).toHaveProperty('textContent','Administrator access required.');expect(screen.queryByLabelText('Minimum nightly price · paise')).toBeNull();
 });
});
