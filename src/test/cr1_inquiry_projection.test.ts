import {describe,expect,it} from 'vitest';
import {parseInquiryHistory,mergeInquiryMessages,inquiryMessageRenderKey,parseInquiryThreads,mergeInquiryThreads,type InboxMessage} from '../../lib/inquiryMessages.js';
import {parseInquiryAlert,inquiryAlertPreview} from '../shared/platform/inquiryAlert.js';
const event='70b384ae-5d4e-4b58-8176-4ab2eedff2f9';
const message=(id:number):InboxMessage=>({id,thread_id:3,sender_id:7,receiver_id:8,content:'A private question',is_read:false,created_at:'2026-09-24T12:00:00Z'});
describe('CR1 inquiry projections and convergence',()=>{
  it('strips private notification fields and never uses guest text in device previews',()=>{
    expect(parseInquiryAlert({type:'new_message',threadId:3,message:{content:'Guest private text'},phone:'private'})).toEqual({type:'new_message',threadId:3});
    expect(inquiryAlertPreview).toBe('You have a new message in your Encho inbox.');
    expect(parseInquiryAlert({type:'new_message',threadId:'3'})).toBeNull();
  });
  it('rejects corrupt or foreign-thread history instead of rendering it',()=>{
    expect(()=>parseInquiryHistory([{...message(1),thread_id:4}],3)).toThrow();
    expect(()=>parseInquiryHistory([{...message(1),id:-1}],3)).toThrow();
  });
  it('converges overlapping reconnect/socket/replay while preserving a queued draft',()=>{
    const optimistic={...message(-1),client_event_id:event,sync_state:'QUEUED' as const};
    const canonical={...message(9),client_event_id:event};
    const merged=mergeInquiryMessages([message(4),optimistic,message(-2)],[message(4),canonical],3);
    expect(merged.map(row=>row.id)).toEqual([4,9,-2]);
    expect(merged[1].sync_state).toBeUndefined();
    expect(mergeInquiryMessages(merged,[canonical],3)).toEqual(merged);
  });
  it('keeps the same render identity through optimistic, receipt and socket states',()=>{
    const optimistic={...message(-1),client_event_id:event,sync_state:'PENDING' as const};
    const canonical={...message(12),client_event_id:event};
    expect(inquiryMessageRenderKey(optimistic)).toBe(inquiryMessageRenderKey(canonical));
    expect(mergeInquiryMessages([canonical,optimistic],[],3)).toEqual([canonical]);
    expect(inquiryMessageRenderKey(message(12))).not.toBe(inquiryMessageRenderKey(canonical));
  });
  it('never merges distinct senders who use the same client event UUID',()=>{
    const own={...message(-1),client_event_id:event,sync_state:'QUEUED' as const};
    const other={...message(12),sender_id:8,receiver_id:7,client_event_id:event};
    const result=mergeInquiryMessages([own],[other],3);
    expect(result.map(row=>row.id)).toEqual([12,-1]);
    expect(inquiryMessageRenderKey(own)).not.toBe(inquiryMessageRenderKey(other));
  });
  it('validates thread participant/role and merges activity pages without losing older history',()=>{
    const thread={id:1,listing_id:4,experience_id:null,guest_id:7,host_id:8,last_message:'Question',unread_count_guest:0,unread_count_host:1,updated_at:'2026-09-24T12:00:00Z',listing_title:'Stay',listing_image:null,guest_name:'Guest',host_name:'Host',list_cursor:'cursor'};
    const older={...thread,id:2,updated_at:'2026-09-23T12:00:00Z'};
    expect(parseInquiryThreads([thread],7,'guest')).toEqual([thread]);
    expect(()=>parseInquiryThreads([thread],9)).toThrow();expect(()=>parseInquiryThreads([thread],7,'host')).toThrow();
    expect(mergeInquiryThreads([older,thread],[{...thread,last_message:'New reply'}]).map(row=>[row.id,row.last_message])).toEqual([[1,'New reply'],[2,'Question']]);
  });
  it('uses exact server sequence and never regresses an observed read receipt',()=>{
    const merged=mergeInquiryMessages([{...message(4),is_read:true}],[message(4),{...message(10),conversation_sequence:'9007199254740993'},{...message(9),conversation_sequence:'9007199254740994'}],3);
    expect(merged.map(row=>row.id)).toEqual([4,10,9]);
    expect(merged[0].is_read).toBe(true);
    expect(()=>mergeInquiryMessages([], [{...message(5),thread_id:9}],3)).toThrow();
  });
});
