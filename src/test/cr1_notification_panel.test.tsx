import React from 'react';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {PlatformDomainError,toPublicApiError} from '../shared/platform/apiError.js';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://encho.test/messages'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);
vi.stubGlobal('navigator',dom.window.navigator);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);
vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const {render,screen,fireEvent,cleanup,waitFor,act}=await import('@testing-library/react');
const {ConversationNotificationPanel}=await import('../../components/ConversationNotificationPanel');

const uuid='11111111-1111-4111-8111-111111111111';
const channels=[
 {channel:'EMAIL',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
 {channel:'PUSH',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
 {channel:'SMS',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
];
const preference=(accountId:number,enabled:boolean,version='0')=>({accountId,version,inAppAlerts:enabled,
 source:version==='0'?'DEFAULT':'SAVED',updatedAt:version==='0'?null:'2026-10-01T00:00:00+00:00',externalChannels:channels});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const failure=(code:ConstructorParameters<typeof PlatformDomainError>[0])=>{
 const value=toPublicApiError(new PlatformDomainError(code),{correlationId:'test-correlation',operationId:'test-operation'});
 return json(value.body,value.status);
};
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
afterAll(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));await new Promise<void>(resolve=>setImmediate(resolve));dom.window.close();vi.unstubAllGlobals();});

describe('R4-01 participant notification panel',()=>{
 it('shows unavailable rather than invented counts or delivered channels',async()=>{
  const onAlertPreference=vi.fn();fetcher.mockResolvedValue(json({error:'unavailable'},503));
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={onAlertPreference}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  expect(await screen.findByText(/Notification settings are unavailable/)).toBeTruthy();
  expect(screen.queryByText(/No recent notification records/)).toBeNull();
  expect(onAlertPreference).toHaveBeenCalledWith(null);
 });

 it('does not offer futile retry when the initial preferences read is explicitly disabled',async()=>{
  const onAlertPreference=vi.fn();fetcher.mockResolvedValue(failure('FEATURE_UNAVAILABLE'));
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={onAlertPreference}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  expect(await screen.findByText(/not configured for this service/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Retry settings'})).toBeNull();
  expect(screen.queryByRole('switch',{name:'In-app inquiry alerts'})).toBeNull();
  expect(onAlertPreference).toHaveBeenCalledWith(null);
 });

 it('commits a CAS change and distinguishes socket dispatch from device delivery',async()=>{
  const onAlertPreference=vi.fn();let reads=0;
  fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
   if(url.endsWith('/notifications/preferences')&&options.method==='GET')return json(preference(10,reads++>0?false:true,reads>1?'1':'0'));
   if(url.endsWith('/notifications/preferences')&&options.method==='PUT'){
    const body=JSON.parse(String(options.body)) as {requestId:string;expectedVersion:string;inAppAlerts:boolean};
    expect(options.headers).toMatchObject({'X-Encho-Conversation-Command':'1'});
    expect(body).toMatchObject({expectedVersion:'0',inAppAlerts:false});
    return json({accountId:10,requestId:body.requestId,inAppAlerts:body.inAppAlerts,previousVersion:'0',version:'1',recordedAt:'2026-10-01T00:00:00+00:00'});
   }
   if(url.endsWith('/notifications/evidence'))return json({accountId:10,items:[{
    notificationId:uuid,threadId:4,messageId:7,createdAt:'2026-10-01T00:00:00+00:00',queueState:'SUCCEEDED',attempts:1,
    socketHint:{state:'DISPATCH_RECORDED',recordedAt:'2026-10-01T00:00:01+00:00'},deviceDelivery:'NOT_RECORDED',
    readAcknowledgement:{state:'NOT_RECORDED',recordedAt:null},
   }],nextBeforeId:null});
   throw new Error(`Unexpected request ${url}`);
  });
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={onAlertPreference}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  const control=await screen.findByRole('switch',{name:'In-app inquiry alerts'});
  expect(control.getAttribute('aria-checked')).toBe('true');fireEvent.click(control);
  await waitFor(()=>expect(control.getAttribute('aria-checked')).toBe('false'));
  expect(onAlertPreference).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole('button',{name:'Load recent activity'}));
  expect(await screen.findByText(/Device delivery: not recorded/)).toBeTruthy();
  expect(screen.getByText(/Socket hint: dispatch recorded/)).toBeTruthy();
 });

 it('retries an ambiguous mutation with the identical request UUID',async()=>{
  let reads=0,puts=0;const ids:string[]=[];
  fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
   if(url.endsWith('/notifications/preferences')&&options.method==='GET')return json(preference(10,reads++>0?false:true,reads>1?'1':'0'));
   if(url.endsWith('/notifications/preferences')&&options.method==='PUT'){
    const body=JSON.parse(String(options.body)) as {requestId:string;expectedVersion:string;inAppAlerts:boolean};ids.push(body.requestId);
    if(puts++===0)throw new Error('lost acknowledgement');
    return json({accountId:10,requestId:body.requestId,inAppAlerts:body.inAppAlerts,previousVersion:'0',version:'1',recordedAt:'2026-10-01T00:00:00+00:00'});
   }
   throw new Error(`Unexpected request ${url}`);
  });
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  fireEvent.click(await screen.findByRole('switch',{name:'In-app inquiry alerts'}));
  expect(await screen.findByText(/result is not confirmed/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Retry same change'}));
  await waitFor(()=>expect(screen.getByRole('switch',{name:'In-app inquiry alerts'}).getAttribute('aria-checked')).toBe('false'));
  expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
 });

 it('does not retry a conflicting request ID and refreshes canonical state before another change',async()=>{
  const puts:string[]=[];let reads=0;
  fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
   if(url.endsWith('/notifications/preferences')&&options.method==='GET')return json(preference(10,reads++===0,reads===1?'0':'1'));
   if(url.endsWith('/notifications/preferences')&&options.method==='PUT'){
    puts.push(String(options.body));
    return failure('IDEMPOTENCY_CONFLICT');
   }
   throw new Error(`Unexpected request ${url}`);
  });
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  fireEvent.click(await screen.findByRole('switch',{name:'In-app inquiry alerts'}));
  expect(await screen.findByText(/request ID conflicts/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Retry same change'})).toBeNull();
  await waitFor(()=>expect(screen.getByRole('switch',{name:'In-app inquiry alerts'}).getAttribute('aria-checked')).toBe('false'));
  expect(screen.getByRole('switch',{name:'In-app inquiry alerts'}).hasAttribute('disabled')).toBe(false);
  expect(reads).toBe(2);
  expect(puts).toHaveLength(1);
 });

 it.each(['FEATURE_UNAVAILABLE','AUTHENTICATION_REQUIRED','ACCESS_DENIED','INVALID_REQUEST','RATE_LIMITED','DEPENDENCY_UNAVAILABLE'] as const)(
  'does not call definite %s rejection an uncertain commit',async code=>{
   fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
    if(url.endsWith('/notifications/preferences')&&options.method==='GET')return json(preference(10,true));
    if(url.endsWith('/notifications/preferences')&&options.method==='PUT')return failure(code);
    throw new Error(`Unexpected request ${url}`);
   });
   render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={vi.fn()}/>);
   fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
   fireEvent.click(await screen.findByRole('switch',{name:'In-app inquiry alerts'}));
   if(['FEATURE_UNAVAILABLE','AUTHENTICATION_REQUIRED','ACCESS_DENIED'].includes(code))
    await waitFor(()=>expect(screen.queryByRole('switch',{name:'In-app inquiry alerts'})).toBeNull());
   else await waitFor(()=>expect(screen.getByRole('switch',{name:'In-app inquiry alerts'}).hasAttribute('disabled')).toBe(false));
   if(code==='FEATURE_UNAVAILABLE')expect(screen.queryByRole('button',{name:'Retry settings'})).toBeNull();
   expect(screen.queryByRole('button',{name:'Retry same change'})).toBeNull();
   expect(screen.queryByText(/result is not confirmed/)).toBeNull();
  });

 it('treats the pre-route legacy 429 limiter response as a definite delay',async()=>{
  fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
   if(url.endsWith('/notifications/preferences')&&options.method==='GET')return json(preference(10,true));
   if(url.endsWith('/notifications/preferences')&&options.method==='PUT')
    return json({error:'Message rate limit exceeded. Please wait before sending more.'},429);
   throw new Error(`Unexpected request ${url}`);
  });
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  fireEvent.click(await screen.findByRole('switch',{name:'In-app inquiry alerts'}));
  expect(await screen.findByText(/Too many requests/)).toBeTruthy();
  expect(screen.getByRole('switch',{name:'In-app inquiry alerts'}).hasAttribute('disabled')).toBe(false);
  expect(screen.queryByRole('button',{name:'Retry same change'})).toBeNull();
 });

 it('keeps the same request UUID when an unknown intermediary returns an unclassified 429',async()=>{
  const ids:string[]=[];
  fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
   if(url.endsWith('/notifications/preferences')&&options.method==='GET')return json(preference(10,true));
   if(url.endsWith('/notifications/preferences')&&options.method==='PUT'){
    ids.push((JSON.parse(String(options.body)) as {requestId:string}).requestId);
    return json({error:'Unknown gateway rejection'},429);
   }
   throw new Error(`Unexpected request ${url}`);
  });
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  fireEvent.click(await screen.findByRole('switch',{name:'In-app inquiry alerts'}));
  expect(await screen.findByText(/result is not confirmed/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Retry same change'}));
  await waitFor(()=>expect(ids).toHaveLength(2));
  expect(ids[0]).toBe(ids[1]);
 });

 it('refreshes the current version after a definite CAS conflict',async()=>{
  let reads=0;
  fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
   if(url.endsWith('/notifications/preferences')&&options.method==='GET'){
    const first=reads++===0;return json(preference(10,first,first?'0':'1'));
   }
   if(url.endsWith('/notifications/preferences')&&options.method==='PUT')return json({
    code:'VERSION_CONFLICT',message:'This item changed. Refresh it before submitting again.',
    correlationId:'test-correlation',operationId:'test-operation',retryability:'AFTER_CORRECTION',details:{},
   },409);
   throw new Error(`Unexpected request ${url}`);
  });
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  fireEvent.click(await screen.findByRole('switch',{name:'In-app inquiry alerts'}));
  expect(await screen.findByText(/setting changed elsewhere/)).toBeTruthy();
  expect(screen.getByRole('switch',{name:'In-app inquiry alerts'}).getAttribute('aria-checked')).toBe('false');
  expect(screen.queryByRole('button',{name:'Retry same change'})).toBeNull();
 });

 it('ignores a late prior-account response after a keyed account switch',async()=>{
  let resolveOld:((value:Response)=>void)|undefined;
  fetcher.mockImplementation((url:string,options:RequestInit)=>{
   if(!url.endsWith('/notifications/preferences'))throw new Error(`Unexpected request ${url}`);
   const token=(options.headers as Record<string,string>).Authorization;
   return token==='Bearer token-10'?new Promise<Response>(resolve=>{resolveOld=resolve;}):Promise.resolve(json(preference(20,false,'1')));
  });
  const onAlertPreference=vi.fn();
  const view=render(<ConversationNotificationPanel key="10" accountId={10} token="token-10" onAlertPreference={onAlertPreference}/>);
  await waitFor(()=>expect(resolveOld).toBeDefined());
  view.rerender(<ConversationNotificationPanel key="20" accountId={20} token="token-20" onAlertPreference={onAlertPreference}/>);
  await act(async()=>resolveOld?.(json(preference(10,true))));
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  await waitFor(()=>expect(screen.getByRole('switch',{name:'In-app inquiry alerts'}).getAttribute('aria-checked')).toBe('false'));
  expect(onAlertPreference.mock.calls.at(-1)).toEqual([false]);
 });

 it('retains newer activity while paging back and can refresh the latest page',async()=>{
  const first='11111111-1111-4111-8111-111111111111';
  const older='22222222-2222-4222-8222-222222222222';
  const newest='33333333-3333-4333-8333-333333333333';
  const item=(notificationId:string)=>({notificationId,threadId:4,messageId:7,
   createdAt:'2026-10-01T00:00:00+00:00',queueState:'PENDING',attempts:0,
   socketHint:{state:'NOT_RECORDED',recordedAt:null},deviceDelivery:'NOT_RECORDED',
   readAcknowledgement:{state:'NOT_RECORDED',recordedAt:null}});
  let latestReads=0;
  fetcher.mockImplementation(async(url:string,options:RequestInit)=>{
   if(url.endsWith('/notifications/preferences')&&options.method==='GET')return json(preference(10,true));
   if(url.endsWith(`/notifications/evidence?beforeId=${first}`))return json({accountId:10,items:[item(older)],nextBeforeId:null});
   if(url.endsWith('/notifications/evidence')){
    latestReads++;
    return json({accountId:10,items:latestReads===1?[item(first)]:[item(newest),item(first)],nextBeforeId:first});
   }
   throw new Error(`Unexpected request ${url}`);
  });
  render(<ConversationNotificationPanel accountId={10} token="token-10" onAlertPreference={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Notification settings'}));
  expect(await screen.findByText(/Recent notification activity/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Load recent activity'}));
  await waitFor(()=>expect(screen.getAllByRole('listitem')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button',{name:'Load earlier activity'}));
  await waitFor(()=>expect(screen.getAllByRole('listitem')).toHaveLength(2));
  fireEvent.click(screen.getByRole('button',{name:'Refresh recent activity'}));
  await waitFor(()=>expect(screen.getAllByRole('listitem')).toHaveLength(3));
  expect(latestReads).toBe(2);
 });
});
