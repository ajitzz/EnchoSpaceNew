// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {useMarketingWorkspace} from '../../../components/marketing/api.js';
const auth=vi.hoisted(()=>({token:'host-a'}));
vi.mock('../../../components/AuthContext.js',()=>({useAuth:()=>auth}));
const payload=(title:string)=>({listings:[],campaigns:[{title}],policy:{},capabilities:{}});
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();auth.token='host-a';});
it('never retains another session workspace or accepts its late response',async()=>{
 localStorage.setItem('token','host-a');let late!:(value:Response)=>void;
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{late=resolve;})).mockResolvedValue({ok:true,json:async()=>payload('Host B')});vi.stubGlobal('fetch',fetcher);
 const view=renderHook(()=>useMarketingWorkspace());auth.token='host-b';localStorage.setItem('token','host-b');view.rerender();
 await waitFor(()=>expect(view.result.current.workspace?.campaigns[0].title).toBe('Host B'));
 await act(async()=>late({ok:true,json:async()=>payload('Host A')} as Response));expect(view.result.current.workspace?.campaigns[0].title).toBe('Host B');
 expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
 auth.token='';localStorage.clear();view.rerender();expect(view.result.current.workspace).toBeNull();
});
it('clears the last snapshot after authorization fails',async()=>{
 localStorage.setItem('token','host-a');const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>payload('Host A')}).mockResolvedValueOnce({ok:false,json:async()=>({error:'Session expired'})});vi.stubGlobal('fetch',fetcher);
 const view=renderHook(()=>useMarketingWorkspace());await waitFor(()=>expect(view.result.current.workspace).not.toBeNull());await act(async()=>{await view.result.current.reload();});expect(view.result.current.workspace).toBeNull();expect(view.result.current.error).toBe('Session expired');
});
