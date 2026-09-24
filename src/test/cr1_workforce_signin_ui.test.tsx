import React from 'react';
import {createRequire} from 'node:module';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const google=vi.hoisted(()=>({clientId:'',nonce:'',success:null as null|((value:{credential:string})=>void)}));
vi.mock('@react-oauth/google',()=>({GoogleOAuthProvider:({clientId,children}:{clientId:string;children:React.ReactNode})=>{google.clientId=clientId;return children;},
 GoogleLogin:({nonce,onSuccess}:{nonce:string;onSuccess:(value:{credential:string})=>void})=>{google.nonce=nonce;google.success=onSuccess;return React.createElement('button',{onClick:()=>onSuccess({credential:'fixture-google-credential'.repeat(10)})},'Google fixture sign-in');}}));
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:{url:string})=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://ops.encho.test/operations'});
vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('HTMLElement',dom.window.HTMLElement);vi.stubGlobal('MutationObserver',dom.window.MutationObserver);vi.stubGlobal('localStorage',dom.window.localStorage);vi.stubGlobal('sessionStorage',dom.window.sessionStorage);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const{render,screen,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const{default:WorkforceSignIn}=await import('../../components/operations/WorkforceSignIn');
let fetcher:ReturnType<typeof vi.fn>;
const challenge=()=>({challengeId:'11111111-1111-4111-8111-111111111111',nonce:'a'.repeat(43),clientId:'workforce-fixture.apps.googleusercontent.com',expiresAt:new Date(Date.now()+120000).toISOString()});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('token','consumer-identity');fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);});
afterEach(()=>cleanup());afterAll(()=>{dom.window.close();vi.unstubAllGlobals();});
describe('CR1 workforce sign-in UI',()=>{
 it('starts explicitly and uses only server-provided workforce challenge metadata',async()=>{
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(challenge()),{status:200}));
  const completed=vi.fn();render(<WorkforceSignIn onComplete={completed} onCancel={()=>{}}/>);
  expect(fetcher).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Start workforce sign-in'}));
  await screen.findByRole('button',{name:'Google fixture sign-in'});expect(google.clientId).toBe(challenge().clientId);expect(google.nonce).toBe(challenge().nonce);
  expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'same-origin',cache:'no-store',body:'{}'});
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Authorization');expect(completed).not.toHaveBeenCalled();
 });
 it('confirms only a server receipt and never persists Google or staff credentials',async()=>{
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(challenge()),{status:200})).mockResolvedValueOnce(new Response(JSON.stringify({status:'AUTHENTICATED',expiresAt:new Date(Date.now()+600000).toISOString()}),{status:200}));
  const completed=vi.fn();render(<WorkforceSignIn onComplete={completed} onCancel={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Start workforce sign-in'}));fireEvent.click(await screen.findByRole('button',{name:'Google fixture sign-in'}));
  await waitFor(()=>expect(completed).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({challengeId:challenge().challengeId,credential:'fixture-google-credential'.repeat(10)});
  expect(localStorage.length).toBe(1);expect(localStorage.getItem('token')).toBe('consumer-identity');expect(sessionStorage.length).toBe(0);
 });
 it('keeps an unknown issuance result unconfirmed and offers a fresh sign-in',async()=>{
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(challenge()),{status:200})).mockResolvedValueOnce(new Response('{"code":"OUTCOME_UNKNOWN"}',{status:503}));
  const completed=vi.fn();render(<WorkforceSignIn onComplete={completed} onCancel={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Start workforce sign-in'}));fireEvent.click(await screen.findByRole('button',{name:'Google fixture sign-in'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','The session result could not be confirmed. Start a new sign-in.');expect(completed).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Start workforce sign-in'})).toBeTruthy();
 });
 it('does not let a canceled sign-in activate an unmounted workspace',async()=>{
  let resolveRequest!:(response:Response)=>void;fetcher.mockImplementation(()=>new Promise<Response>(resolve=>{resolveRequest=resolve;}));
  const completed=vi.fn();const view=render(<WorkforceSignIn onComplete={completed} onCancel={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Start workforce sign-in'}));view.unmount();resolveRequest(new Response(JSON.stringify(challenge()),{status:200}));
  await new Promise<void>(resolve=>setTimeout(resolve,0));expect(completed).not.toHaveBeenCalled();expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
 });
});
