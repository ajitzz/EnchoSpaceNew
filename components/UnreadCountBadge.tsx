import React from 'react';
import {unreadCountDescription,type UnreadCountState} from '../lib/useUnreadCount';

/** Parent navigation buttons expose the full status through their accessible name. */
export function UnreadCountBadge({state,className='',compact=false}:{state:UnreadCountState;className?:string;compact?:boolean}){
 if(state.status==='SIGNED_OUT'||state.status==='AVAILABLE'&&state.count===0)return null;
 const label=state.status==='AVAILABLE'?(compact?'•':state.count>99?'99+':String(state.count)):state.status==='LOADING'?'…':'!';
 return <span aria-hidden="true" title={unreadCountDescription(state)}
  className={`${state.status==='UNAVAILABLE'?'bg-amber-100 text-amber-900 border border-amber-400':'bg-[#e51d53] text-white'} text-[10px] font-bold min-w-4 h-4 px-1 rounded-full inline-flex items-center justify-center ${className}`}>{label}</span>;
}
