import React from 'react';
import {afterAll,afterEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import WorkforceDesk,{type WorkforceDeskState} from '../../components/operations/WorkforceDesk.js';
import {workforceReviewSchema,type WorkforceReview} from '../shared/iam/workforceReview.js';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://encho.test/operations/workforce'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);
vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const{cleanup,fireEvent,render,screen}=await import('@testing-library/react');
afterEach(()=>{cleanup();vi.restoreAllMocks();});
afterAll(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));dom.window.close();vi.unstubAllGlobals();});
const uuid=(n:number)=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`;
const observed='2026-09-24T10:00:00Z',now=()=>Date.parse(observed);
function evidence():WorkforceReview{return workforceReviewSchema.parse({
  schemaVersion:1,kind:'CURRENT_WORKFORCE_EVIDENCE',generatedAt:observed,freshUntil:'2026-09-24T10:00:30Z',
  correlationId:'review.test:1',receiptId:uuid(9),organization:{id:uuid(1),displayName:'Encho'},environment:'LOCAL',
  policy:{hash:'a'.repeat(64),approvalStatus:'PENDING_FOUNDER_OPERATIONAL_APPROVAL'},formalReviewAccepted:false,
  members:{items:[{id:uuid(2),accountId:90,state:'ACTIVE',effectiveState:'ACTIVE',version:1,acceptedAt:observed,expiresAt:null,updatedAt:observed}],total:2,nextCursor:uuid(2)},
  grants:{items:[{id:uuid(3),membershipId:uuid(2),accountId:90,role:{versionId:uuid(4),key:'platform_owner',name:'Platform Owner',version:1},
    scope:{type:'ORGANIZATION',id:uuid(1)},provider:null,environment:'LOCAL',maxAmountMinor:null,validFrom:observed,validUntil:null,revokedAt:null,state:'CURRENT'}],total:1,nextCursor:null},
  invitations:{items:[{id:uuid(5),environment:'LOCAL',status:'EXPIRED_PENDING',createdAt:'2026-09-23T10:00:00Z',expiresAt:'2026-09-24T09:00:00Z'}],total:1,nextCursor:null},
  protectedActions:[{permission:'workforce.grant',permissionGranted:true,stepUpRequired:true,independentApprovalRequired:true,execution:'SEPARATE_PROTECTED_COMMAND'},
    {permission:'workforce.invite',permissionGranted:false,stepUpRequired:true,independentApprovalRequired:false,execution:'SEPARATE_PROTECTED_COMMAND'}],
});}
describe('CR1 workforce review contract and desk',()=>{
  it('shows bounded current evidence and protected requirements without mutation controls',()=>{
    render(<WorkforceDesk state={{status:'READY',review:evidence()}} onRefresh={vi.fn()} now={now}/>);
    expect(screen.getByRole('heading',{name:'Workforce desk'})).toBeTruthy();
    expect(screen.getByText('Current evidence, not an approved access review.')).toBeTruthy();
    expect(screen.getByText(/Showing 1 of 2 members/)).toBeTruthy();
    expect(screen.getByText('Expired; stored as pending')).toBeTruthy();
    expect(screen.getByText(/independent approval required/)).toBeTruthy();
    expect(screen.getByText('Permission not granted')).toBeTruthy();
    expect(screen.queryByRole('button',{name:/Change role|Invite|Approve|Revoke|Suspend/})).toBeNull();
    expect(screen.getByText(/Operational policy approval is pending/)).toBeTruthy();
  });
  it('supports explicit independent pagination and refresh',()=>{
    const page=vi.fn(),refresh=vi.fn();render(<WorkforceDesk state={{status:'READY',review:evidence()}} onRefresh={refresh} onPage={page} now={now}/>);
    fireEvent.click(screen.getByRole('button',{name:'Next members'}));expect(page).toHaveBeenCalledWith('members',uuid(2));
    fireEvent.click(screen.getByRole('button',{name:'Refresh workforce evidence'}));expect(refresh).toHaveBeenCalledOnce();
  });
  it('marks stale evidence and prevents navigation based on it',()=>{
    const page=vi.fn();render(<WorkforceDesk state={{status:'READY',review:evidence()}} onRefresh={vi.fn()} onPage={page} now={()=>now()+31000}/>);
    expect(screen.getByRole('status').textContent).toContain('stale');
    fireEvent.click(screen.getByRole('button',{name:'Next members'}));expect(page).not.toHaveBeenCalled();
  });
  it.each(['LOADING','ACCESS_DENIED','SESSION_STALE','UNAVAILABLE','ERROR'] as const)('clears private evidence for %s',status=>{
    const state:WorkforceDeskState={status};render(<WorkforceDesk state={state} onRefresh={vi.fn()} now={now}/>);
    expect(screen.queryByText('Staff account #90')).toBeNull();expect(screen.queryByText('Platform Owner · v1')).toBeNull();
    expect(screen.queryByRole('button',{name:'Next members'})).toBeNull();
  });
  it('shows honest empty states and does not invent workforce members',()=>{
    const data=evidence();for(const section of ['members','grants','invitations'] as const)data[section]={items:[],total:0,nextCursor:null};
    render(<WorkforceDesk state={{status:'READY',review:data}} onRefresh={vi.fn()} now={now}/>);
    expect(screen.getByText('No members in this page.')).toBeTruthy();expect(screen.getByText('No role grants in this page.')).toBeTruthy();
    expect(screen.getByText('No pending invitations in this page.')).toBeTruthy();
  });
  it('rejects hidden secrets, formal acceptance, cross-environment grants and contradictory page cursors',()=>{
    const data=evidence();
    expect(workforceReviewSchema.safeParse({...data,token:'private'}).success).toBe(false);
    expect(workforceReviewSchema.safeParse({...data,formalReviewAccepted:true}).success).toBe(false);
    const cross=evidence();cross.grants.items[0].environment='PRODUCTION';expect(workforceReviewSchema.safeParse(cross).success).toBe(false);
    const cursor=evidence();cursor.members.nextCursor=uuid(30);expect(workforceReviewSchema.safeParse(cursor).success).toBe(false);
    render(<WorkforceDesk state={{status:'READY',review:{...data,email:'secret@example.test'}}} onRefresh={vi.fn()} now={now}/>);
    expect(screen.getByRole('alert').textContent).toContain('could not be verified');expect(screen.queryByText('Staff account #90')).toBeNull();
  });
});
