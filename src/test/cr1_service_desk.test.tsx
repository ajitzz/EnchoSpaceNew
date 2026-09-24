import React from 'react';
import {afterAll,afterEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import ServiceDesk from '../../components/operations/ServiceDesk.js';
import {serviceCaseContentSchema} from '../shared/conversation/serviceCases.js';
import {serviceContent,serviceWorkspace,serviceCaseId} from '../../scripts/testing/cr1-service-desk-browser/fixture.js';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://encho.test/operations/service'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const {cleanup,fireEvent,render,screen,waitFor,act}=await import('@testing-library/react');
const time=Date.parse('2026-09-24T10:00:00Z');
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const fetcher=()=>vi.spyOn(globalThis,'fetch');
function select(){fireEvent.click(screen.getByRole('button',{name:/Help with a stay inquiry/}));}
function open(){fireEvent.click(screen.getByRole('button',{name:'Open audited conversation'}));}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
afterAll(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));await new Promise<void>(resolve=>setImmediate(resolve));dom.window.close();vi.unstubAllGlobals();});

describe('CR1 assigned Service Desk privacy and command contract',()=>{
 it('does not fetch or expose content until staff explicitly opens the assigned case',async()=>{
  const request=fetcher().mockResolvedValue(response(serviceContent(time)));
  render(<ServiceDesk workspace={serviceWorkspace(time)} now={()=>time}/>);select();
  expect(request).not.toHaveBeenCalled();expect(screen.queryByText('Does the stay have a quiet workspace?')).toBeNull();
  open();await screen.findByText('Does the stay have a quiet workspace?');
  expect(request).toHaveBeenCalledTimes(1);
  const [url,init]=request.mock.calls[0];expect(url).toBe('/api/operations/v1/service/read');
  expect(init).toMatchObject({method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Encho-Workforce-Command':'1'}});
  expect(JSON.parse(String(init?.body))).toMatchObject({caseId:serviceCaseId,assignmentVersion:2,assignmentFence:'1',limit:50});
 });
 it('does not fabricate assignments and requires a noncredential session identity',()=>{
  const request=fetcher();const workspace=serviceWorkspace(time);delete workspace.session.id;
  const view=render(<ServiceDesk workspace={workspace} now={()=>time}/>);
  expect(screen.getByText('Case access needs a fresh workforce session')).toBeTruthy();
  const empty=serviceWorkspace(time);empty.work={items:[],nextCursor:null,total:0};view.rerender(<ServiceDesk workspace={empty} now={()=>time}/>);
  expect(screen.getByText('No assigned service cases')).toBeTruthy();expect(request).not.toHaveBeenCalled();
 });
 it('requires a current claimed assignment rather than interpreting its display label',()=>{
  const request=fetcher();const data=serviceWorkspace(time);data.work.items[0].state='ASSIGNED';data.work.items[0].leaseExpiresAt=null;data.work.items[0].permittedActions=['CLAIM'];
  render(<ServiceDesk workspace={data} now={()=>time}/>);select();
  expect(screen.getByText('Claim this work first')).toBeTruthy();expect(screen.queryByRole('button',{name:'Open audited conversation'})).toBeNull();expect(request).not.toHaveBeenCalled();
 });
 it('rejects an authenticated-looking response for a different case',async()=>{
  fetcher().mockResolvedValue(response({...serviceContent(time),caseId:'88888888-8888-4888-8888-888888888888'}));
  render(<ServiceDesk workspace={serviceWorkspace(time)} now={()=>time}/>);select();open();
  await screen.findByText('Conversation access could not be confirmed. Try an audited read again.');
  expect(screen.queryByText('Does the stay have a quiet workspace?')).toBeNull();
 });
 it('purges previously loaded history immediately when the assignment fence changes',async()=>{
  fetcher().mockImplementation(async()=>response(serviceContent(time)));
  const data=serviceWorkspace(time);const view=render(<ServiceDesk workspace={data} now={()=>time}/>);select();open();await screen.findByText('Does the stay have a quiet workspace?');
  const changed=serviceWorkspace(time);changed.work.items[0].fence='2';changed.work.items[0].version=3;
  view.rerender(<ServiceDesk workspace={changed} now={()=>time}/>);
  expect(screen.queryByText('Does the stay have a quiet workspace?')).toBeNull();expect(screen.getByRole('button',{name:'Open audited conversation'})).toBeTruthy();
 });
 it('aborts an old session request and ignores its late private response',async()=>{
  let finish:((result:Response)=>void)|undefined;
  const request=fetcher().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  const view=render(<ServiceDesk workspace={serviceWorkspace(time)} now={()=>time}/>);select();open();
  const replacement=serviceWorkspace(time);replacement.session.id='99999999-9999-4999-8999-999999999999';
  view.rerender(<ServiceDesk workspace={replacement} now={()=>time}/>);
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async()=>{finish?.(response(serviceContent(time)));});
  expect(screen.queryByText('Does the stay have a quiet workspace?')).toBeNull();
 });
 it('clears private history at the claim deadline without waiting for another server response',async()=>{
  vi.useFakeTimers();let now=time;fetcher().mockImplementation(async()=>response(serviceContent(time)));
  const workspace=serviceWorkspace(time);workspace.work.items[0].leaseExpiresAt=new Date(time+1000).toISOString();
  render(<ServiceDesk workspace={workspace} now={()=>now}/>);select();open();
  await act(async()=>{await Promise.resolve();await Promise.resolve();});
  expect(screen.getByText('Does the stay have a quiet workspace?')).toBeTruthy();
  now=time+1010;await act(async()=>{await vi.advanceTimersByTimeAsync(1010);});
  expect(screen.queryByText('Does the stay have a quiet workspace?')).toBeNull();expect(screen.getByText('This claim is no longer active')).toBeTruthy();
 });
 it('uses a stable note UUID on unknown outcome, then verifies receipt before audited refresh',async()=>{
  const request=fetcher().mockImplementation(async()=>response(serviceContent(time)));
  render(<ServiceDesk workspace={serviceWorkspace(time)} now={()=>time}/>);select();open();await screen.findByText('Does the stay have a quiet workspace?');
  request.mockResolvedValueOnce(response({code:'OUTCOME_UNKNOWN'},503));
  fireEvent.change(screen.getByLabelText('Internal case note'),{target:{value:'Check accessibility details with the host.'}});
  fireEvent.click(screen.getByRole('button',{name:'Save internal note and refresh'}));
  await screen.findByRole('button',{name:'Retry the same note'});expect((screen.getByLabelText('Internal case note') as HTMLTextAreaElement).disabled).toBe(true);
  const noteResult={id:'1',caseId:serviceCaseId};request.mockResolvedValueOnce(response(noteResult)).mockResolvedValueOnce(response({...serviceContent(time),internalNotes:[{id:'1',body:'Check accessibility details with the host.',author_membership_id:serviceWorkspace(time).member.membershipId,created_at:new Date(time).toISOString()}]}));
  fireEvent.click(screen.getByRole('button',{name:'Retry the same note'}));await screen.findByText('Internal note saved. Conversation access has been recorded again.');
  const notes=request.mock.calls.filter(([url])=>String(url).endsWith('/notes')).map(([,init])=>JSON.parse(String(init?.body)));
  expect(notes).toHaveLength(2);expect(notes[0]).toEqual(notes[1]);expect(notes[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(request.mock.calls.filter(([url])=>String(url).endsWith('/read'))).toHaveLength(2);
 });
 it('hides note controls without projected note permission and exposes no staff reply',async()=>{
  fetcher().mockResolvedValue(response(serviceContent(time)));const data=serviceWorkspace(time);data.desks[0].permittedActions=['service.read'];
  render(<ServiceDesk workspace={data} now={()=>time}/>);select();open();await screen.findByText('Does the stay have a quiet workspace?');
  expect(screen.queryByLabelText('Internal case note')).toBeNull();expect(screen.queryByRole('button',{name:/Reply/})).toBeNull();
 });
 it('closes case content and draft when fresh authorization is denied',async()=>{
  const request=fetcher().mockResolvedValueOnce(response(serviceContent(time))).mockResolvedValueOnce(response({code:'ASSIGNMENT_REQUIRED'},403));
  const refresh=vi.fn();render(<ServiceDesk workspace={serviceWorkspace(time)} now={()=>time} onRefresh={refresh}/>);select();open();await screen.findByText('Does the stay have a quiet workspace?');
  fireEvent.change(screen.getByLabelText('Internal case note'),{target:{value:'Private unsaved draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Refresh audited conversation'}));await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));await screen.findByText('Current case access was not accepted. Refresh the workforce workspace.');
  expect(screen.queryByText('Does the stay have a quiet workspace?')).toBeNull();expect(screen.queryByLabelText('Internal case note')).toBeNull();expect(refresh).toHaveBeenCalledOnce();
 });
 it('rejects cross-thread, duplicate and out-of-order message projections',()=>{
  const valid=serviceContent(time);expect(serviceCaseContentSchema.safeParse(valid).success).toBe(true);
  expect(serviceCaseContentSchema.safeParse({...valid,messages:[...valid.messages].reverse()}).success).toBe(false);
  expect(serviceCaseContentSchema.safeParse({...valid,messages:[valid.messages[0],valid.messages[0]]}).success).toBe(false);
  expect(serviceCaseContentSchema.safeParse({...valid,threadId:11}).success).toBe(false);
 });
});
