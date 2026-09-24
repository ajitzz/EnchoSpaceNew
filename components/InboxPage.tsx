import React, { useState, useEffect, useRef } from 'react';
import { SEO } from './SEO';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from './AuthContext';
import { Send, ArrowLeft, Languages, Sparkles, House } from 'lucide-react';
import { io,type Socket } from 'socket.io-client';
import { uiAudio } from './audio';
import { OFFLINE_MUTATION_COMMITTED_EVENT, fetchWithCache, queueMutationWithReceipt } from '../lib/syncService';
import { InboxSkeleton } from './Skeletons';
import {acknowledgeInquiryRead} from '../lib/inquiryReadReceipts';
import {canonicalInquiryMessageSchema,parseInquiryHistory,mergeInquiryMessages,inquiryMessageRenderKey,type InboxMessage as Message,parseInquiryThreads,mergeInquiryThreads,type InquiryThread as Thread} from '../lib/inquiryMessages';
import {conversationNotificationPayloadSchema} from '../src/shared/conversation/delivery';
import ConversationAssistance from './operations/ConversationAssistance';

let socket: Socket | null = null;

function isCanonicalMessage(value: unknown): value is Message {
    return canonicalInquiryMessageSchema.safeParse(value).success;
}

const InboxPage = ({ onBack, role }: { onBack: () => void, role?: 'guest' | 'host' }) => {
    const { user, token } = useAuth();
    const reduceMotion=useReducedMotion();
    const nextOptimisticId=useRef(-1);
    const messageViewport=useRef<HTMLDivElement|null>(null);
    const [observedMessage,setObservedMessage]=useState<{threadId:number;messageId:number}|null>(null);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThread, setActiveThread] = useState<Thread | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [olderAvailable,setOlderAvailable]=useState(false);
    const [olderBusy,setOlderBusy]=useState(false);
    const [olderError,setOlderError]=useState('');
    const activeThreadId=useRef<number|undefined>(undefined);useEffect(()=>{activeThreadId.current=activeThread?.id;return()=>{activeThreadId.current=undefined;};},[activeThread?.id]);
    async function loadOlder(){
      const first=messages.find(message=>message.id>0);
      if(!activeThread||!first||!token||olderBusy)return;
      const threadId=activeThread.id,sessionToken=token;setOlderBusy(true);setOlderError('');
      const current=()=>activeThreadId.current===threadId&&localStorage.getItem('token')===sessionToken;
      try{
        const response=await fetch(`/api/threads/${threadId}/messages?before=${first.id}`,{headers:{Authorization:`Bearer ${sessionToken}`},signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('Earlier messages could not be loaded.');
        const data=parseInquiryHistory(await response.json(),threadId);
        if(!current())return;
        setMessages(previous=>mergeInquiryMessages(previous,data,threadId));setOlderAvailable(data.length===200);
      }catch{if(current())setOlderError('Earlier messages could not be loaded.');}
      finally{if(current())setOlderBusy(false);}
    }
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [historyError,setHistoryError]=useState('');
    const [threadsError,setThreadsError]=useState('');
    const [threadCursor,setThreadCursor]=useState<string|null>(null);
    const [threadsBusy,setThreadsBusy]=useState(false);
    const roleRef=useRef(role);useEffect(()=>{roleRef.current=role;},[role]);
    async function loadEarlierThreads(){
      if(!threadCursor||threadsBusy||!user||!token)return;
      const actorId=user.id,sessionToken=token,requestedRole=role;setThreadsBusy(true);
      const current=()=>localStorage.getItem('token')===sessionToken&&roleRef.current===requestedRole;
      try{
        const query=new URLSearchParams({before:threadCursor,...(role?{role}:{})});
        const response=await fetch(`/api/threads?${query}`,{headers:{Authorization:`Bearer ${sessionToken}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('Conversation page unavailable.');
        const rows=parseInquiryThreads(await response.json(),actorId,requestedRole);
        if(!current())return;
        setThreads(previous=>mergeInquiryThreads(previous,rows));setThreadCursor(rows.length===100?rows.at(-1)!.list_cursor:null);setThreadsError('');
      }catch{if(current())setThreadsError('Earlier conversations could not be loaded. Please try again.');}
      finally{if(current())setThreadsBusy(false);}
    }
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [readStatusError,setReadStatusError]=useState('');
    const acknowledgedReads=useRef(new Map<string,number>());

    useEffect(()=>{
      setObservedMessage(null);setThreads([]);setThreadCursor(null);setThreadsBusy(false);setMessages([]);setActiveThread(null);setNewMessage('');
      acknowledgedReads.current.clear();setReadStatusError('');setHistoryError('');setThreadsError('');
    },[user?.id,token]);

    useEffect(()=>{
      const viewport=messageViewport.current;
      if(!viewport||!activeThread||!token)return;
      if(typeof IntersectionObserver==='undefined'){setReadStatusError('Read acknowledgements are unavailable in this browser.');return;}
      const threadId=activeThread.id;
      const observer=new IntersectionObserver(entries=>{
        if(document.visibilityState!=='visible'||localStorage.getItem('token')!==token||activeThreadId.current!==threadId)return;
        for(const entry of entries){
          if(!entry.isIntersecting||entry.intersectionRect.height<Math.min(40,entry.boundingClientRect.height))continue;
          const messageId=Number((entry.target as HTMLElement).dataset.inquiryReadId);
          if(Number.isSafeInteger(messageId)&&messageId>0)setObservedMessage(previous=>({threadId,messageId:previous?.threadId===threadId?Math.max(previous.messageId,messageId):messageId}));
        }
      },{root:viewport,threshold:[0,0.25,0.5,1]});
      const observe=()=>{observer.disconnect();if(document.visibilityState==='visible')viewport.querySelectorAll('[data-inquiry-read-id]').forEach(node=>observer.observe(node));};
      observe();document.addEventListener('visibilitychange',observe);
      return()=>{observer.disconnect();document.removeEventListener('visibilitychange',observe);};
    },[activeThread?.id,messages,token]);

    useEffect(()=>{
      if(!activeThread||!user||!token)return;
      const through=observedMessage?.threadId===activeThread.id?observedMessage.messageId:0;
      if(!through)return;
      const controller=new AbortController();
      const key=`${user.id}:${activeThread.id}`;
      const current=()=>!controller.signal.aborted&&activeThreadId.current===activeThread.id
        &&document.visibilityState==='visible'&&localStorage.getItem('token')===token;
      let pending=false;
      const acknowledge=async()=>{
        if(pending||!current()||through<=(acknowledgedReads.current.get(key)??0))return;
        pending=true;
        try{
          const receipt=await acknowledgeInquiryRead({threadId:activeThread.id,throughMessageId:through,token,signal:controller.signal,current});
          if(!receipt)return;
          acknowledgedReads.current.set(key,Math.max(through,acknowledgedReads.current.get(key)??0));
          setReadStatusError('');
          setThreads(previous=>previous.map(thread=>thread.id!==receipt.threadId?thread:{...thread,
            ...(thread.guest_id===user.id?{unread_count_guest:receipt.unread}:{unread_count_host:receipt.unread})}));
        }catch{if(current())setReadStatusError('Read status has not synced. It will retry when you reconnect.');}
        finally{pending=false;}
      };
      void acknowledge();
      const retry=()=>{void acknowledge();};
      window.addEventListener('online',retry);document.addEventListener('visibilitychange',retry);
      return()=>{controller.abort();window.removeEventListener('online',retry);document.removeEventListener('visibilitychange',retry);};
    },[activeThread,observedMessage,user,token]);

    useEffect(() => {
      const reconcileCommittedMutation = (event: Event) => {
        const detail = (event as CustomEvent<{ actorId?: string; url?: string; data?: unknown }>).detail;
        if (!user || detail?.actorId !== String(user.id) || !detail.url?.includes('/messages')) return;
        if (!isCanonicalMessage(detail.data) || !detail.data.client_event_id) return;
        const canonicalMessage = detail.data;
        if (canonicalMessage.thread_id !== activeThreadId.current) return;
        if(canonicalMessage.sender_id!==user.id)return;
        setMessages(previous=>mergeInquiryMessages(previous,[canonicalInquiryMessageSchema.parse(canonicalMessage)],canonicalMessage.thread_id));
      };
      window.addEventListener(OFFLINE_MUTATION_COMMITTED_EVENT, reconcileCommittedMutation);
      return () => window.removeEventListener(OFFLINE_MUTATION_COMMITTED_EVENT, reconcileCommittedMutation);
    }, [user]);

    // Neutral drafts never assert availability, prices or property amenities.
    const getSuggestionChips = () => user?.id === activeThread?.host_id
      ? ["Thanks for your message. Which dates are you considering?", "How many guests will be joining you?", "What would you like to know about the stay?"]
      : ["Is this stay available for my dates?", "Could you explain the cancellation policy?", "Which room would suit our group?"];

    // Every result is fenced to the current session, including role switches.
    useEffect(() => {
        if (!user||!token){setLoading(false);return;}
        let active=true;
        const current=()=>active&&localStorage.getItem('token')===token;
        const url = role ? `/api/threads?role=${role}` : '/api/threads';
        let pending=false,firstPage=true;
        const refresh=async()=>{
          if(pending||!current()||document.visibilityState!=='visible')return;
          pending=true;
          try{
            const data=await fetchWithCache(url, `threads_${role}_${user.id}`, {headers:{Authorization:`Bearer ${token}`}});
            const rows=parseInquiryThreads(data,user.id,role);
            if(current()){setThreads(previous=>mergeInquiryThreads(previous,rows));if(firstPage){setThreadCursor(rows.length===100?rows.at(-1)!.list_cursor:null);firstPage=false;}setThreadsError('');}
          }catch{if(current())setThreadsError('Conversations could not be refreshed. Your saved history may be out of date.');}
          finally{pending=false;if(current())setLoading(false);}
        };
        setThreads([]);setThreadCursor(null);setThreadsBusy(false);setLoading(true);void refresh();
        const interval=window.setInterval(()=>void refresh(),30000);
        const visible=()=>void refresh();
        window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
        return()=>{active=false;window.clearInterval(interval);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);};
    }, [user?.id,token,role]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion?'instant':'smooth' });
        }, 100);
    };

    // Fetch Messages when active thread changes
    useEffect(() => {
        if (!activeThread) return;

        let active=true,pending=false;
        const current=()=>active&&activeThreadId.current===activeThread.id&&localStorage.getItem('token')===token;
        const fetchMessages = async () => {
            if(pending||!current()||document.visibilityState!=='visible')return;
            pending=true;
            try{
              const data=await fetchWithCache(`/api/threads/${activeThread.id}/messages`, `messages_${activeThread.id}`, {
                headers: {Authorization:`Bearer ${token}`}
              });
              const canonical=parseInquiryHistory(data,activeThread.id);
              if(!current())return;
              setMessages(previous=>mergeInquiryMessages(previous,canonical,activeThread.id));
              setOlderAvailable(canonical.length===200);setHistoryError('');
            }catch{if(current())setHistoryError('Message history could not be refreshed. Reconnect to check for new replies.');}
            finally{pending=false;}
        };

        setMessages([]);setOlderAvailable(false);setOlderBusy(false);setOlderError('');setReadStatusError('');setHistoryError('');
        void fetchMessages();
        const interval=window.setInterval(()=>void fetchMessages(),30000);
        const visible=()=>{void fetchMessages();};
        window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);

        if (!socket) {
          socket = io({ auth: { token } });
        }

        const threadSocket = socket;
        const seenHints=new Set<string>();
        const handleHint=(value:unknown)=>{
          const hint=conversationNotificationPayloadSchema.safeParse(value);
          if(!current()||!hint.success||hint.data.threadId!==activeThread.id||seenHints.has(hint.data.notificationId))return;
          seenHints.add(hint.data.notificationId);
          if(seenHints.size>200)seenHints.delete(seenHints.values().next().value!);
          // Socket membership can age between checks. Hints carry no content;
          // the HTTP read revalidates current participation under RLS.
          void fetchMessages();
        };
        const joinThread = () => {threadSocket.emit('join_thread', activeThread.id);void fetchMessages();};
        threadSocket.on('connect', joinThread);
        if (threadSocket.connected) joinThread();

        const handleNewMessage = (message: Message) => {
          if (!current()||!isCanonicalMessage(message) || message.thread_id !== activeThreadId.current) return;
          if (message.sender_id !== user?.id) {
              uiAudio.playPop();
          }
          setMessages(previous=>mergeInquiryMessages(previous,[canonicalInquiryMessageSchema.parse(message)],activeThread.id));
          scrollToBottom();
        };

        const handleUserTyping = (data: { userId: number }) => {
            if (data.userId !== user?.id) {
                setIsTyping(true);
            }
        };

        const handleUserStoppedTyping = (data: { userId: number }) => {
            if (data.userId !== user?.id) {
                setIsTyping(false);
            }
        };

        threadSocket.on('new_message', handleNewMessage);
        threadSocket.on('conversation_changed',handleHint);
        threadSocket.on('notification',handleHint);
        threadSocket.on('user_typing', handleUserTyping);
        threadSocket.on('user_stopped_typing', handleUserStoppedTyping);

        return () => {
            active=false;window.clearInterval(interval);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);
            if(typingTimeoutRef.current)clearTimeout(typingTimeoutRef.current);setIsTyping(false);
            threadSocket.off('new_message', handleNewMessage);
            threadSocket.off('conversation_changed',handleHint);
            threadSocket.off('notification',handleHint);
            threadSocket.off('user_typing', handleUserTyping);
            threadSocket.off('user_stopped_typing', handleUserStoppedTyping);
            threadSocket.emit('leave_thread', activeThread.id);
            threadSocket.off('connect', joinThread);
            threadSocket.disconnect(); if (socket === threadSocket) socket = null;
        };
    }, [activeThread, user, token]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeThread || !user||!token) return;
        const threadId=activeThread.id,sessionToken=token;
        const current=()=>activeThreadId.current===threadId&&localStorage.getItem('token')===sessionToken;

        const receiverId = user.id === activeThread.guest_id ? activeThread.host_id : activeThread.guest_id;
        const msgStr = newMessage;
        setNewMessage('');
        uiAudio.playClick();

        if (socket) {
             if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
             socket?.emit('typing_stop', { threadId: activeThread.id, userId: user.id });
        }

        // Optimistic UI
        const clientEventId = crypto.randomUUID();
        const tempMsg: Message = {
            id: nextOptimisticId.current--,
            thread_id: activeThread.id,
            sender_id: user.id,
            receiver_id: receiverId,
            content: msgStr,
            is_read: false,
            created_at: new Date().toISOString(),
            client_event_id: clientEventId,
            sync_state: 'PENDING',
        };
        setMessages(prev => [...prev, tempMsg]);
        scrollToBottom();

        try {
            const result = await queueMutationWithReceipt<Message>(`/api/threads/${activeThread.id}/messages`, 'POST', { receiverId, content: msgStr, clientEventId, ...(()=>{try{const id=sessionStorage.getItem('encho-measurement-visit');return id?{measurementVisitId:id}:{};}catch{return {};}})() }, { 'Authorization': `Bearer ${localStorage.getItem('token')}` });
            if(!current())return;
            if (result.status === 'COMMITTED' && result.data) {
                const canonical=canonicalInquiryMessageSchema.parse(result.data);
                if(canonical.thread_id!==threadId||canonical.client_event_id!==clientEventId||canonical.sender_id!==user.id||canonical.receiver_id!==receiverId)throw new Error('Message receipt did not match this conversation command.');
                setMessages(previous=>mergeInquiryMessages(previous,[canonical],threadId));
                // Background update of threads list
                const url = role ? `/api/threads?role=${role}` : '/api/threads';
                fetch(url, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                })
                .then(r => r.json())
                .then(d => {
                    if(current())setThreads(previous=>mergeInquiryThreads(previous,parseInquiryThreads(d,user.id,role)));
                }).catch(()=>{if(current())setThreadsError('Your message was confirmed, but the conversation list could not be refreshed.');});
            } else if (result.status === 'QUEUED') {
                setMessages(previous => previous.map(message => message.id<0&&message.sender_id===user.id&&message.client_event_id === clientEventId
                    ? { ...message, sync_state: 'QUEUED' }
                    : message));
            } else {
                setMessages(previous => previous.map(message => message.id<0&&message.sender_id===user.id&&message.client_event_id === clientEventId
                    ? { ...message, sync_state: 'FAILED' }
                    : message));
            }
        } catch (err) {
            if(current()){setMessages(previous=>previous.map(message=>message.id<0&&message.sender_id===user.id&&message.client_event_id===clientEventId?{...message,sync_state:'FAILED'}:message));setHistoryError('Your send response could not be verified. Refresh the conversation to check its recorded status.');}
        }
    };

    const renderThreadItem = (thread: Thread) => {
        const isGuest = user?.id === thread.guest_id;
        const unreadCount = isGuest ? thread.unread_count_guest : thread.unread_count_host;
        const otherPartyName = isGuest ? thread.host_name : thread.guest_name;
        //const targetAvatar = isGuest ? thread.host_avatar : thread.guest_avatar;

        return (
            <button type="button"
                key={thread.id}
                onClick={() => setActiveThread(thread)}
                className={`w-full text-left p-4 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-4 ${activeThread?.id === thread.id ? 'bg-gray-50' : ''}`}
            >
                <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                    {thread.listing_image?<img src={thread.listing_image} alt="" className="w-full h-full object-cover"/>:<div className="w-full h-full grid place-items-center bg-gray-100"><House aria-hidden="true" className="w-6 h-6 text-gray-400"/></div>}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-gray-900 truncate">{otherPartyName || 'Unknown'}</h4>
                        <span className="text-xs text-gray-600 whitespace-nowrap">{new Date(thread.updated_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{thread.listing_title}</p>
                    <p className={`text-sm mt-1 truncate ${unreadCount > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                        {thread.last_message || 'No messages yet'}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <div className="w-5 h-5 rounded-full bg-red-700 text-white flex items-center justify-center text-xs font-bold">
                        {unreadCount}
                    </div>
                )}
            </button>
        );
    };

    if (loading) {
        return <InboxSkeleton />;
    }

    return (
        <>
            <SEO title="Messages" description="Your conversations on Encho Space" />
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 h-[calc(100dvh-80px)] min-h-[420px] flex flex-col">
            <div className="flex items-center gap-4 mb-6">
                <button aria-label="Back" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors xl:hidden">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex-1 min-h-0 flex overflow-hidden">
                {/* Threads List Sidebar */}
                <div className={`${activeThread ? 'hidden md:flex' : 'flex'} w-full min-w-0 md:w-1/3 border-r border-gray-200 flex-col`}>
                    <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <h2 className="font-semibold text-gray-700">All Conversations</h2>
                    </div>
                    {threadsError&&<p className="p-4 text-sm text-amber-800" role="status">{threadsError}</p>}
                    <div className="flex-1 overflow-y-auto">
                        {threads.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No conversations found.</div>
                        ) : (
                            threads.map(renderThreadItem)
                        )}
                        {threadCursor&&<button type="button" disabled={threadsBusy} onClick={()=>void loadEarlierThreads()} className="w-full p-4 text-sm underline disabled:opacity-50">{threadsBusy?'Loading conversations…':'Load earlier conversations'}</button>}
                    </div>
                </div>

                {/* Chat Area */}
                <div className={`${!activeThread ? 'hidden md:flex' : 'flex'} w-full min-w-0 md:w-2/3 flex-col bg-gray-50/30`}>
                    {activeThread ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-4 bg-white border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="flex items-center gap-3">
                                    <button aria-label="Back to conversations" className="md:hidden p-2 hover:bg-gray-100 rounded-full" onClick={() => setActiveThread(null)}>
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div>
                                        <div className="font-semibold text-zinc-950">
                                            {user?.id === activeThread.guest_id ? activeThread.host_name : activeThread.guest_name}
                                        </div>
                                        <div className="text-xs text-zinc-400 line-clamp-1">
                                             {activeThread.listing_title}
                                        </div>
                                    </div>
                                </div>

                                {/* Inline Translation Tool */}
                                <div className="flex items-center gap-1.5 self-end sm:self-auto bg-zinc-50 border border-zinc-200 px-2.5 py-1 rounded-xl shadow-xs">
                                    <Languages className="w-3.5 h-3.5 text-zinc-400" />
                                    <span className="text-xs text-zinc-600">Original messages · verified translation unavailable</span>
                                </div>
                            </div>

                            {/* Chat Messages */}
                            {historyError&&<p className="px-6 py-2 text-xs text-amber-800" role="status">{historyError}</p>}
                            {readStatusError&&<p className="px-6 py-2 text-xs text-amber-800" role="status">{readStatusError}</p>}
                            <div ref={messageViewport} role="log" aria-label="Conversation messages" aria-live="polite" className="flex-1 overflow-y-auto p-6 space-y-6">
                                <AnimatePresence initial={false}>
                                {olderAvailable&&<button disabled={olderBusy} onClick={()=>void loadOlder()} className="text-sm underline">{olderBusy?'Loading earlier messages…':'Load earlier messages'}</button>}
                                {olderError&&<p role="alert">{olderError}</p>}
                                {messages.map(msg => {
                                    const isMe = msg.sender_id === user?.id;
                                    return (
                                        <motion.div
                                            key={inquiryMessageRenderKey(msg)}
                                            data-inquiry-read-id={!isMe&&msg.id>0?msg.id:undefined}
                                            initial={reduceMotion?false:{ opacity: 0, scale: 0.9, y: 10, originX: isMe ? 1 : 0 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                            className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`max-w-[70%] xl:max-w-[60%] rounded-2xl px-5 py-3 shadow-sm relative group ${isMe ? 'bg-[#0369A1] text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-900 rounded-tl-sm'}`}>
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>

                                                <div className="flex items-center justify-between gap-4 mt-2">
                                                    <span className={`text-xs block ${isMe ? 'text-white' : 'text-gray-600'}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {msg.sync_state === 'PENDING' && ' • Sending'}
                                                        {msg.sync_state === 'QUEUED' && ' • Awaiting confirmation'}
                                                        {msg.sync_state === 'FAILED' && ' • Not confirmed'}
                                                    </span>


                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                                </AnimatePresence>
                                {isTyping && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9, originX: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex justify-start"
                                    >
                                        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                                            <motion.div animate={reduceMotion?undefined:{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                            <motion.div animate={reduceMotion?undefined:{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                            <motion.div animate={reduceMotion?undefined:{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                        </div>
                                    </motion.div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {token&&<ConversationAssistance key={`${user?.id}:${token}:${activeThread.id}`} threadId={activeThread.id} token={token}/>}
                            {/* Input Area */}
                            <div className="p-4 bg-white border-t border-gray-200">
                                {/* Suggestion Chips */}
                                <div className="pb-3 overflow-x-auto flex gap-2 no-scrollbar scroll-smooth">
                                    <span className="text-xs text-zinc-600 font-bold uppercase tracking-wider self-center mr-1 flex items-center gap-1 shrink-0 select-none">
                                        <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-amber-700" /> Drafts:
                                    </span>
                                    {getSuggestionChips().map((chip, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                setNewMessage(chip);
                                                uiAudio.playPop();
                                            }}
                                            className="text-xs min-h-11 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 px-3.5 py-1.5 rounded-full hover:border-zinc-900 transition-all whitespace-nowrap active:scale-95 cursor-pointer"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                    <span className="text-xs text-zinc-500 self-center shrink-0">AI reply drafts unavailable</span>
                                </div>

                                <form onSubmit={handleSendMessage} className="flex items-end gap-3 relative">
                                    <div className="flex-1 relative group">
                                        <input
                                            type="text"
                                            aria-label="Message"
                                            maxLength={10000}
                                            placeholder="Type a message..."
                                            className="w-full pl-4 pr-12 py-3 rounded-2xl border border-gray-300 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                                            value={newMessage}
                                            onChange={e => {
                                                setNewMessage(e.target.value);
                                                if (socket && activeThread && user) {
                                                    socket?.emit('typing_start', { threadId: activeThread.id, userId: user.id });
                                                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                                    typingTimeoutRef.current = setTimeout(() => {
                                                        socket?.emit('typing_stop', { threadId: activeThread.id, userId: user.id });
                                                    }, 2000);
                                                }
                                            }}
                                        />

                                    </div>
                                    <button
                                        type="submit"
                                        aria-label="Send message"
                                        disabled={!newMessage.trim()}
                                        className="p-3 mb-0.5 bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                    >
                                        <Send className="w-5 h-5" />
                                    </button>
                                </form>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-4">
                            <svg className="w-16 h-16 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            <p>Select a conversation to start messaging</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};

export default InboxPage;
