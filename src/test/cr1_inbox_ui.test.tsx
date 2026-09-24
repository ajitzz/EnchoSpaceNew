import React from 'react';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const state=vi.hoisted(()=>({user:{id:10,name:'Guest fixture'},token:'session-10',cache:vi.fn(),dispatch:vi.fn(),socketHandlers:new Map<string,(value:unknown)=>void>()}));
vi.mock('../../components/AuthContext',()=>({useAuth:()=>({user:state.user,token:state.token})}));
vi.mock('../../components/SEO',()=>({SEO:()=>null}));
vi.mock('../../components/Skeletons',()=>({InboxSkeleton:()=>React.createElement('p',null,'Loading inbox')}));
vi.mock('../../components/audio',()=>({uiAudio:{playClick:vi.fn(),playPop:vi.fn()}}));
vi.mock('../../lib/syncService',()=>({fetchWithCache:state.cache,queueMutationWithReceipt:state.dispatch,OFFLINE_MUTATION_COMMITTED_EVENT:'encho:offline-mutation-committed'}));
vi.mock('socket.io-client',()=>({io:()=>({connected:true,emit:vi.fn(),on:(name:string,handler:(value:unknown)=>void)=>state.socketHandlers.set(name,handler),off:(name:string)=>state.socketHandlers.delete(name),disconnect:vi.fn()})}));
vi.mock('framer-motion',()=>({useReducedMotion:()=>true,AnimatePresence:({children}:{children:React.ReactNode})=>children,motion:{div:React.forwardRef<HTMLDivElement,Record<string,unknown>>(({initial:_initial,animate:_animate,transition:_transition,...props},ref)=>React.createElement('div',{...props,ref}))}}));
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://encho.test/messages'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('navigator',dom.window.navigator);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('localStorage',dom.window.localStorage);vi.stubGlobal('sessionStorage',dom.window.sessionStorage);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const {render,screen,fireEvent,cleanup,waitFor,act}=await import('@testing-library/react');
const {default:InboxPage}=await import('../../components/InboxPage');
const thread={id:1,listing_id:4,experience_id:null,guest_id:10,host_id:20,last_message:'Hello guest',unread_count_guest:1,unread_count_host:0,updated_at:'2026-09-24T12:00:00Z',listing_title:'Fixture stay',listing_image:null,guest_name:'Guest fixture',host_name:'Host fixture',list_cursor:'cursor'};
const message={id:7,thread_id:1,sender_id:20,receiver_id:10,content:'Hello guest',is_read:false,created_at:'2026-09-24T12:00:00Z',conversation_sequence:'1'};
let observerCallbacks:Array<IntersectionObserverCallback>=[];
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 state.user={id:10,name:'Guest fixture'};state.token='session-10';localStorage.setItem('token',state.token);localStorage.setItem('user',JSON.stringify(state.user));
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 HTMLElement.prototype.scrollIntoView=vi.fn();observerCallbacks=[];state.socketHandlers.clear();
 vi.stubGlobal('IntersectionObserver',class{constructor(callback:IntersectionObserverCallback){observerCallbacks.push(callback);}observe(){}disconnect(){}unobserve(){}});
 state.cache.mockReset().mockImplementation(async(url:string)=>url.includes('/messages')?[message]:[thread]);state.dispatch.mockReset();
 fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/read')?{threadId:1,throughMessageId:7,unread:0,lastReadSequence:'1'}:[thread]),{status:200,headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
afterAll(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));await new Promise<void>(resolve=>setImmediate(resolve));dom.window.close();vi.unstubAllGlobals();});
async function open(){render(<InboxPage role="guest" onBack={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:/Host fixture/}));await screen.findByRole('log',{name:'Conversation messages'});await waitFor(()=>expect(document.querySelector('[data-inquiry-read-id="7"]')).toBeTruthy());}
function observeVisible(){const target=document.querySelector('[data-inquiry-read-id="7"]')!;for(const callback of observerCallbacks)callback([{target,isIntersecting:true,intersectionRect:{height:50},boundingClientRect:{height:50}} as IntersectionObserverEntry],{} as IntersectionObserver);}
describe('CR1 participant Inbox UX',()=>{
 it('does not acknowledge history until incoming content enters the visible viewport',async()=>{
  await open();expect(fetcher).not.toHaveBeenCalled();
  await act(async()=>observeVisible());
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
  expect(fetcher.mock.calls[0][0]).toBe('/api/threads/1/read');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({throughMessageId:7});
 });
 it('does not acknowledge an intersecting message in a hidden page',async()=>{
  await open();Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
  await act(async()=>observeVisible());expect(fetcher).not.toHaveBeenCalled();
 });
 it('converges duplicate socket and reconnect history without fabricating translation',async()=>{
  await open();await act(async()=>{state.socketHandlers.get('new_message')?.(message);state.socketHandlers.get('new_message')?.(message);});
  expect(screen.getAllByText('Hello guest')).toHaveLength(2); // one thread preview and one canonical bubble
  expect(screen.getByText(/Original messages/)).toBeTruthy();expect(screen.queryByRole('button',{name:/Translate/})).toBeNull();
  await act(async()=>state.socketHandlers.get('new_message')?.({...message,id:9,thread_id:2,content:'Other guest private message'}));
  expect(screen.queryByText('Other guest private message')).toBeNull();
 });
 it('shows unconfirmed queued delivery honestly and sends a durable message UUID',async()=>{
  state.dispatch.mockResolvedValue({status:'QUEUED',mutationId:'test'});await open();
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'My date question'}});
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText(/Awaiting confirmation/);
  expect(state.dispatch.mock.calls[0][2]).toMatchObject({content:'My date question',receiverId:20,clientEventId:expect.stringMatching(/^[a-f0-9-]{36}$/)});
  expect(screen.queryByText(/Delivered/)).toBeNull();
 });
 it.each(['socket-first','receipt-first'] as const)('converges %s and durable replay without replacing the optimistic DOM row or losing another queued message',async order=>{
  let finish:((value:unknown)=>void)|undefined;
  state.dispatch.mockResolvedValueOnce({status:'QUEUED',mutationId:'pending'}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await open();
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Unrelated queued question'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));await screen.findByText(/Awaiting confirmation/);
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Converging question'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  const optimistic=screen.getByText('Converging question').parentElement!.parentElement;
  const body=state.dispatch.mock.calls[1][2];const canonical={...message,id:8,sender_id:10,receiver_id:20,content:body.content,client_event_id:body.clientEventId,conversation_sequence:'2'};
  await act(async()=>{
   if(order==='socket-first')state.socketHandlers.get('new_message')?.(canonical);
   finish?.({status:'COMMITTED',mutationId:'test',data:canonical});
  });
  await waitFor(()=>expect(screen.queryByText(/• Sending/)).toBeNull());
  await act(async()=>{
   state.socketHandlers.get('new_message')?.(canonical);
   window.dispatchEvent(new window.CustomEvent('encho:offline-mutation-committed',{detail:{actorId:'10',url:'/api/threads/1/messages',data:canonical}}));
  });
  expect(screen.getAllByText('Converging question')).toHaveLength(1);
  expect(screen.getByText('Converging question').parentElement!.parentElement).toBe(optimistic);
  expect(screen.getByText('Unrelated queued question')).toBeTruthy();expect(screen.getByText(/Awaiting confirmation/)).toBeTruthy();
 });
 it('does not downgrade socket-confirmed content when the request later reports queued',async()=>{
  state.dispatch.mockImplementation(async(_url,_method,body)=>{state.socketHandlers.get('new_message')?.({...message,id:8,sender_id:10,receiver_id:20,content:body.content,client_event_id:body.clientEventId,conversation_sequence:'2'});return {status:'QUEUED',mutationId:'test'};});
  await open();fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Already confirmed question'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText('Already confirmed question');await waitFor(()=>expect(screen.queryByText(/• Sending/)).toBeNull());
  expect(screen.queryByText(/Awaiting confirmation/)).toBeNull();
 });
 it('rejects a message receipt for a different client event and keeps the actual draft unconfirmed',async()=>{
  state.dispatch.mockResolvedValue({status:'COMMITTED',mutationId:'test',data:{...message,id:8,sender_id:10,receiver_id:20,content:'Wrong request text',client_event_id:'99999999-9999-4999-8999-999999999999'}});
  await open();fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Actual request text'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText(/Not confirmed/);expect(screen.getByText('Actual request text')).toBeTruthy();expect(screen.queryByText('Wrong request text')).toBeNull();
 });
 it('preserves the draft bubble when outcome is unknown without claiming it was not sent',async()=>{
  state.dispatch.mockRejectedValue(new Error('Unknown commit'));await open();
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Pending question'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText(/Not confirmed/);expect(screen.getByText('Pending question')).toBeTruthy();expect(screen.queryByText('Not sent')).toBeNull();
 });
 it('purges an open conversation when the authenticated actor changes',async()=>{
  const view=render(<InboxPage role="guest" onBack={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:/Host fixture/}));await screen.findByRole('log');
  state.user={id:30,name:'Next guest'};state.token='session-30';localStorage.setItem('token',state.token);state.cache.mockResolvedValue([]);
  view.rerender(<InboxPage role="guest" onBack={()=>{}}/>);
  await waitFor(()=>expect(screen.queryByText('Fixture stay')).toBeNull());expect(screen.queryByRole('log')).toBeNull();
 });
});
