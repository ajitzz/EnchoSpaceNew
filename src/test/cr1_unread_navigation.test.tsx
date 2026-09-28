import React from 'react';
import {createRequire} from 'node:module';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {PlatformDomainError,toPublicApiError} from '../shared/platform/apiError.js';

const auth=vi.hoisted(()=>({user:{id:10,name:'Guest',role:'user'} as {id:number;name:string;role:string}|null,token:'session-10' as string|null}));
vi.mock('../../components/AuthContext',()=>({useAuth:()=>({...auth,logout:vi.fn()})}));
vi.mock('../../components/ToastContext',()=>({useToast:()=>({addToast:vi.fn()})}));
vi.mock('../../components/audio',()=>({uiAudio:{playClick:vi.fn(),playPop:vi.fn()}}));
vi.mock('@vis.gl/react-google-maps',()=>({useMapsLibrary:()=>null}));
vi.mock('../../components/CurrencySelector',()=>({CurrencySelector:()=>null}));
vi.mock('../../lib/usePWAInstall',()=>({usePWAInstall:()=>({isInstallable:false,promptInstall:vi.fn()})}));
vi.mock('framer-motion',()=>({AnimatePresence:({children}:{children:React.ReactNode})=>children,motion:new Proxy({}, {get:(_target,tag)=>React.forwardRef<HTMLElement,Record<string,unknown>>(({initial:_initial,animate:_animate,exit:_exit,transition:_transition,layoutId:_layoutId,...props},ref)=>React.createElement(String(tag),{...props,ref}))})}));
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://encho.test/'});
for(const key of ['window','document','navigator','HTMLElement','MutationObserver','localStorage'] as const)vi.stubGlobal(key,key==='window'?dom.window:dom.window[key]);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const {render,screen,waitFor,cleanup,act}=await import('@testing-library/react');
const {BottomNav}=await import('../../components/BottomNav');
const {default:Header}=await import('../../components/Header');
const {useUnreadCount,unreadCountDescription}=await import('../../lib/useUnreadCount');
const noop=()=>{};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let fetcher:ReturnType<typeof vi.fn<typeof fetch>>;
const unavailable=()=>toPublicApiError(new PlatformDomainError('FEATURE_UNAVAILABLE'),{correlationId:'unread-fixture-correlation',operationId:'unread-fixture-operation'}).body;
function nav(){return <><Header currentCity="Wayanad" onSearch={noop} onWishlistClick={noop} onReservesClick={noop} onHostClick={noop} onLoginClick={noop} reservesCount={0} wishlistCount={0}/><BottomNav currentView="SEARCH" appMode="travel" onNavigate={noop} onProfileClick={noop}/></>;}
function hookView(){return <HookFixture/>;}
function HookFixture(){const state=useUnreadCount(auth.user?.id,auth.token);return <div role="status">{unreadCountDescription(state)}</div>;}
beforeEach(()=>{
 auth.user={id:10,name:'Guest',role:'user'};auth.token='session-10';localStorage.clear();
 fetcher=vi.fn<typeof fetch>(async input=>String(input)==='/api/unread-counts'?reply({unread:0}):reply({enabled:false}));vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
afterAll(()=>{dom.window.close();vi.unstubAllGlobals();});

describe('CR1 canonical unread availability in actual navigation',()=>{
 it('shows an explicit unavailable state and safe reference on both desktop and mobile navigation',async()=>{
  fetcher.mockImplementation(async input=>String(input)==='/api/unread-counts'?reply({...unavailable(),error:'This action is not available yet.'},503):reply({enabled:false}));
  render(nav());
  await waitFor(()=>expect(screen.getAllByRole('button',{name:/^Inbox\. Unread count unavailable/})).toHaveLength(2));
  for(const button of screen.getAllByRole('button',{name:/^Inbox\./}))expect(button.title).toContain('unread-fixture-correlation');
  expect(screen.getByText('Inbox unavailable')).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Inbox\. No unread messages/})).toBeNull();
 });
 it('keeps genuine zero distinct and recovers from unavailable after focus',async()=>{
  let up=false;fetcher.mockImplementation(async input=>String(input)==='/api/unread-counts'?up?reply({unread:0}):reply(unavailable(),503):reply({enabled:false}));
  render(nav());await screen.findAllByRole('button',{name:/^Inbox\. Unread count unavailable/});
  up=true;await act(async()=>window.dispatchEvent(new window.Event('focus')));
  await waitFor(()=>expect(screen.getAllByRole('button',{name:'Inbox. No unread messages.'})).toHaveLength(2));
  expect(screen.queryByText('Inbox unavailable')).toBeNull();
 });
 it.each([{unread:-1},{unread:'0'},{},{unread:0,privateContact:'private@example.test'}])('rejects malformed count evidence %j',async body=>{
  fetcher.mockResolvedValue(reply(body));render(hookView());await screen.findByText('Unread count unavailable.');
  expect(document.body.textContent).not.toMatch(/No unread|private@example/);
 });
 it('does not retain a previously known count after the next network failure',async()=>{
  fetcher.mockResolvedValueOnce(reply({unread:7})).mockRejectedValue(new Error('Private network detail'));
  render(hookView());await screen.findByText('7 unread messages.');await act(async()=>window.dispatchEvent(new window.Event('online')));
  await screen.findByText('Unread count unavailable.');expect(document.body.textContent).not.toContain('7 unread');
 });
 it('fences old-account and old-token responses through switch, rotation and logout',async()=>{
  const pending:Array<(value:Response)=>void>=[];fetcher.mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
  const view=render(hookView());expect(screen.getByText('Checking unread messages.')).toBeTruthy();
  auth.user={id:20,name:'Host',role:'user'};auth.token='session-20';view.rerender(hookView());
  await act(async()=>pending[0](reply({unread:99})));expect(document.body.textContent).not.toContain('99');
  await act(async()=>pending[1](reply({unread:3})));expect(screen.getByText('3 unread messages.')).toBeTruthy();
  auth.token='rotated-session-20';view.rerender(hookView());expect(screen.getByText('Checking unread messages.')).toBeTruthy();
  auth.user=null;auth.token=null;view.rerender(hookView());
  await act(async()=>pending[2](reply({unread:33})));expect(screen.getByText('Sign in to view messages.')).toBeTruthy();expect(document.body.textContent).not.toContain('33');
 });
 it('times out a missing count without zero or overlapping refreshes',async()=>{
  vi.useFakeTimers();fetcher.mockImplementation(()=>new Promise(()=>{}));render(hookView());
  await act(async()=>{window.dispatchEvent(new window.Event('focus'));await vi.advanceTimersByTimeAsync(8001);});
  expect(screen.getByText('Unread count unavailable.')).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(1);
  const signal=fetcher.mock.calls[0]?.[1]?.signal;expect(signal?.aborted).toBe(true);
 });
});
