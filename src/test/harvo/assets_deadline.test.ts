import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {loadApprovedImage} from '../../lib/marketing/assets.js';

vi.mock('node:https',()=>({default:{get:vi.fn()}}));
vi.mock('node:dns/promises',()=>({lookup:vi.fn()}));

describe('approved image retrieval absolute deadline without network access',()=>{
 const origin='https://approved-media.example';
 beforeEach(()=>{
  vi.useFakeTimers();vi.mocked(lookup).mockReset();vi.mocked(https.get).mockReset();
  // Native AbortSignal.timeout uses internal timers. A real controller driven by the test clock
  // preserves abort semantics while allowing the complete deadline to pass without a 15s sleep.
  vi.spyOn(AbortSignal,'timeout').mockImplementation(milliseconds=>{
   const controller=new AbortController();
   setTimeout(()=>controller.abort(new DOMException('Media deadline expired','TimeoutError')),milliseconds);
   return controller.signal;
  });
 });
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});

 it('rejects a DNS lookup that never completes without opening an HTTPS connection',async()=>{
  vi.mocked(lookup).mockImplementation(()=>new Promise(()=>{}));
  let settled=false;
  const result=loadApprovedImage(`${origin}/property.jpg`,new Set([origin])).then(value=>{settled=true;return value;},error=>{settled=true;return error;});
  await vi.advanceTimersByTimeAsync(14999);expect(settled).toBe(false);expect(https.get).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);expect(await result).toMatchObject({code:'MEDIA_TIMEOUT'});expect(https.get).not.toHaveBeenCalled();
 });

 it('aborts an image response despite continuous bytes that prevent an idle timeout',async()=>{
  vi.mocked(lookup).mockResolvedValue([{address:'8.8.8.8',family:4}] as never);
  let chunks=0,destroyed=false;
  vi.mocked(https.get).mockImplementation((_url:any,options:any,receive:any)=>{
   const response=Object.assign(new EventEmitter(),{statusCode:200,resume:vi.fn()});
   const request=Object.assign(new EventEmitter(),{destroy(error?:Error){destroyed=true;clearInterval(drip);request.emit('error',error);return request;}});
   const drip=setInterval(()=>{chunks++;response.emit('data',Buffer.from('partial-image'));},1000);
   options.signal.addEventListener('abort',()=>request.destroy(Object.assign(new Error('aborted'),{name:'AbortError',code:'ABORT_ERR'})),{once:true});
   receive(response);return request as never;
  });
  let settled=false;
  const result=loadApprovedImage(`${origin}/property.jpg`,new Set([origin])).then(value=>{settled=true;return value;},error=>{settled=true;return error;});
  await vi.advanceTimersByTimeAsync(14999);expect(chunks).toBeGreaterThanOrEqual(14);expect(settled).toBe(false);expect(destroyed).toBe(false);
  await vi.advanceTimersByTimeAsync(1);expect(await result).toMatchObject({code:'ABORT_ERR'});expect(destroyed).toBe(true);
  const atAbort=chunks;await vi.advanceTimersByTimeAsync(10000);expect(chunks).toBe(atAbort);
 });

 it('uses the same deadline across delayed DNS and the response body',async()=>{
  vi.mocked(lookup).mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve([{address:'8.8.8.8',family:4}] as never),12000)));
  const connections:number[]=[];
  vi.mocked(https.get).mockImplementation((_url:any,options:any,receive:any)=>{
   const response=Object.assign(new EventEmitter(),{statusCode:200,resume:vi.fn()});
   const request=Object.assign(new EventEmitter(),{destroy(error?:Error){request.emit('error',error);return request;}});
   connections.push(Date.now());options.signal.addEventListener('abort',()=>request.destroy(Object.assign(new Error('aborted'),{code:'ABORT_ERR'})),{once:true});receive(response);return request as never;
  });
  let settled=false;const result=loadApprovedImage(`${origin}/property.jpg`,new Set([origin])).then(value=>{settled=true;return value;},error=>{settled=true;return error;});
  await vi.advanceTimersByTimeAsync(12000);expect(connections).toHaveLength(1);expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(3000);expect(await result).toMatchObject({code:'ABORT_ERR'});
 });
});
