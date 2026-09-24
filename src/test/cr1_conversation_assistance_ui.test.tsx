import React from 'react';
import {createRequire} from 'node:module';
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
const{JSDOM}=createRequire(import.meta.url)('jsdom') as{JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://encho.test/messages'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('localStorage',dom.window.localStorage);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const{render,screen,fireEvent,cleanup,waitFor,act}=await import('@testing-library/react');
const{default:ConversationAssistance}=await import('../../components/operations/ConversationAssistance');
const caseId='11111111-1111-4111-8111-111111111111';
const activeCase={id:caseId,threadId:1,state:'OPEN',version:1,disclosureVersion:'cr1-service-assistance-v1'};
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{localStorage.setItem('token','current-session');fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);});afterEach(()=>cleanup());afterAll(()=>{dom.window.close();vi.unstubAllGlobals();});
function open(){const view=render(<ConversationAssistance threadId={1} token="current-session"/>);const details=view.container.querySelector('details')!;details.open=true;fireEvent(details,new dom.window.Event('toggle'));return view;}
describe('CR1 participant disclosure and assistance',()=>{
 it('does not restore withdrawn access from a stale status request',async()=>{
  let resolveStatus!:(value:Response)=>void;
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({case:activeCase,disclosureVersion:activeCase.disclosureVersion})))
   .mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveStatus=resolve;}))
   .mockResolvedValueOnce(new Response(JSON.stringify({...activeCase,state:'WITHDRAWN',version:2})));
  open();await screen.findByRole('button',{name:'Stop new support access'});
  fireEvent.click(screen.getByRole('button',{name:'Refresh assistance status'}));
  fireEvent.click(screen.getByRole('button',{name:'Stop new support access'}));
  await screen.findByRole('button',{name:'Request assistance'});
  await act(async()=>resolveStatus(new Response(JSON.stringify({case:activeCase,disclosureVersion:activeCase.disclosureVersion}))));
  expect(screen.queryByRole('button',{name:'Stop new support access'})).toBeNull();
 });
 it('does not request staff assistance merely by opening an inbox',()=>{
  render(<ConversationAssistance threadId={1} token="current-session"/>);expect(fetcher).not.toHaveBeenCalled();
 });
 it('requires deliberate disclosure acceptance and sends a stable request identity',async()=>{
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({case:null,disclosureVersion:activeCase.disclosureVersion}))).mockResolvedValueOnce(new Response(JSON.stringify(activeCase)));
  open();const button=await screen.findByRole('button',{name:'Request assistance'});expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);await screen.findByRole('button',{name:'Stop new support access'});
  const body=JSON.parse(fetcher.mock.calls[1][1].body);expect(body).toMatchObject({threadId:1,disclosureVersion:activeCase.disclosureVersion,acceptAssistance:true});expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
 });
 it('denies unknown disclosure versions and preserves uncertainty on failed mutation',async()=>{
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({case:null,disclosureVersion:'unknown-version'})));open();await screen.findByText(/awaiting the current disclosure/);expect(screen.queryByRole('checkbox')).toBeNull();
 });
 it('stops new access with the current case version and no offline queue',async()=>{
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({case:activeCase,disclosureVersion:activeCase.disclosureVersion}))).mockResolvedValueOnce(new Response('{"code":"OUTCOME_UNKNOWN"}',{status:503}));
  open();fireEvent.click(await screen.findByRole('button',{name:'Stop new support access'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toMatch(/not confirmed/));
  expect(fetcher.mock.calls[1][0]).toBe(`/api/conversations/v1/cases/${caseId}/withdraw`);expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expectedVersion:1});
  expect(screen.getByRole('button',{name:'Stop new support access'})).toBeTruthy();
 });
});
