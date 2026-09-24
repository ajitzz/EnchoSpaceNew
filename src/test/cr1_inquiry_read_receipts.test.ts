import {describe,expect,it,vi} from 'vitest';
import {acknowledgeInquiryRead} from '../../lib/inquiryReadReceipts.js';

describe('explicit inquiry read receipts',()=>{
  const input=()=>({threadId:7,throughMessageId:31,token:'current-account-token',signal:new AbortController().signal,current:()=>true});
  it('does not submit for a hidden or replaced actor/thread',async()=>{
    const fetcher=vi.fn();
    expect(await acknowledgeInquiryRead({...input(),current:()=>false,fetcher})).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires the committed matching receipt before changing displayed unread state',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({threadId:7,throughMessageId:31,unread:2}),{headers:{'Content-Type':'application/json'}}));
    expect(await acknowledgeInquiryRead({...input(),fetcher})).toEqual({threadId:7,throughMessageId:31,unread:2});
    expect(fetcher).toHaveBeenCalledWith('/api/threads/7/read',expect.objectContaining({method:'POST',body:'{"throughMessageId":31}'}));
    const wrong=vi.fn(async()=>new Response(JSON.stringify({threadId:8,throughMessageId:31,unread:0})));
    await expect(acknowledgeInquiryRead({...input(),fetcher:wrong})).rejects.toThrow('did not match');
  });
  it('discards a receipt when the current actor changes during the request',async()=>{
    let current=true;
    const fetcher=vi.fn(async()=>{current=false;return new Response(JSON.stringify({threadId:7,throughMessageId:31,unread:0}));});
    expect(await acknowledgeInquiryRead({...input(),current:()=>current,fetcher})).toBeNull();
  });
  it('does not convert offline or rejected acknowledgements into local success',async()=>{
    await expect(acknowledgeInquiryRead({...input(),fetcher:vi.fn(async()=>new Response('',{status:503}))})).rejects.toThrow('could not be synchronized');
    await expect(acknowledgeInquiryRead({...input(),fetcher:vi.fn(async()=>{throw new TypeError('Offline');})})).rejects.toThrow('Offline');
  });
});
