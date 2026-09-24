import React from 'react';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import WorkforceWorkspace from '../../components/operations/WorkforceWorkspace.js';
import type {OperationsWorkspace} from '../shared/iam/workspace.js';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<html><body></body></html>',{url:'https://encho.test/operations/workforce'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);
vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const {render,screen,cleanup,waitFor,act}=await import('@testing-library/react');
const id=(n:number)=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`;
let fetcher:ReturnType<typeof vi.fn>;
function workspace(session=3):OperationsWorkspace{
 const generatedAt=new Date().toISOString(),freshUntil=new Date(Date.now()+60000).toISOString();
 return {schemaVersion:1,generatedAt,freshUntil,correlationId:'workspace.test',organization:{id:id(1),displayName:'Fixture organization'},
  member:{membershipId:id(2),state:'ACTIVE'},session:{id:id(session),state:'ACTIVE',expiresAt:freshUntil},desks:[{id:'workforce',permittedActions:['workforce.member.read']}],
  work:{items:[],total:0,nextCursor:null},audit:{state:'NOT_PERMITTED',latestReceiptAt:null},workforce:{state:'ACTIVE',explanation:null}};
}
function evidence(w:OperationsWorkspace){return {schemaVersion:1,kind:'CURRENT_WORKFORCE_EVIDENCE',generatedAt:w.generatedAt,freshUntil:w.freshUntil,
 correlationId:'workforce.review',receiptId:id(9),organization:w.organization,environment:'LOCAL',policy:{hash:'a'.repeat(64),approvalStatus:'PENDING_FOUNDER_OPERATIONAL_APPROVAL'},
 members:{items:[],total:0,nextCursor:null},grants:{items:[],total:0,nextCursor:null},invitations:{items:[],total:0,nextCursor:null},protectedActions:[],formalReviewAccepted:false};}
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
afterAll(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));dom.window.close();vi.unstubAllGlobals();});
describe('CR1 workforce evidence transport and session fencing',()=>{
 it('uses only the workforce cookie and rejects a response for a different organization',async()=>{
  const w=workspace();fetcher.mockResolvedValue(response({...evidence(w),organization:{id:id(50),displayName:'Another organization'}}));
  render(<WorkforceWorkspace workspace={w}/>);
  await screen.findByText('Workforce evidence could not be verified. Try refreshing.');
  expect(fetcher).toHaveBeenCalledWith('/api/operations/v1/workforce?',expect.objectContaining({credentials:'same-origin',cache:'no-store'}));
  expect(fetcher.mock.calls[0][1].headers).toBeUndefined();expect(screen.queryByText('Another organization')).toBeNull();
 });
 it('purges loaded evidence on revoked desk access without another read',async()=>{
  const w=workspace();fetcher.mockResolvedValue(response(evidence(w)));const view=render(<WorkforceWorkspace workspace={w}/>);
  await screen.findByText('No members in this page.');
  view.rerender(<WorkforceWorkspace workspace={{...w,desks:[]}}/>);
  expect(screen.queryByText('No members in this page.')).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('discards a late previous-session response after the workforce session changes',async()=>{
  const w=workspace();let resolveOld!:(value:Response)=>void;
  fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce(response({},403));
  const view=render(<WorkforceWorkspace workspace={w}/>);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<WorkforceWorkspace workspace={{...w,session:{...w.session,id:id(4)}}}/>);
  await screen.findByText('This staff session does not have workforce review access.');
  await act(async()=>resolveOld(response(evidence(w))));
  expect(screen.queryByText('No members in this page.')).toBeNull();
 });
 it('cannot fetch from a workspace missing current session evidence',()=>{
  const w=workspace();delete w.session.id;render(<WorkforceWorkspace workspace={w}/>);expect(fetcher).not.toHaveBeenCalled();
 });
});
