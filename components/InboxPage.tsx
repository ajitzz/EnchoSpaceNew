import React, { useState, useEffect, useRef } from 'react';
import { SEO } from './SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './AuthContext';
import { Send, ArrowLeft } from 'lucide-react';
import { io } from 'socket.io-client';
import { uiAudio } from './audio';
import { fetchWithCache, queueMutation } from '../lib/syncService';
import { InboxSkeleton } from './Skeletons';

let socket: any = null;

interface Thread {
    id: number;
    listing_id: number;
    guest_id: number;
    host_id: number;
    last_message: string;
    unread_count_guest: number;
    unread_count_host: number;
    updated_at: string;
    listing_title: string;
    listing_image: string;
    guest_name: string;
    guest_avatar: string;
    host_name: string;
    host_avatar: string;
}

interface Message {
    id: number;
    thread_id: number;
    sender_id: number;
    receiver_id: number;
    content: string;
    is_read: boolean;
    created_at: string;
    sender_name?: string;
}

const InboxPage = ({ onBack, role }: { onBack: () => void, role?: 'guest' | 'host' }) => {
    const { user } = useAuth();
    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThread, setActiveThread] = useState<Thread | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch Threads
    useEffect(() => {
        if (!user) return;
        const url = role ? `/api/threads?role=${role}` : '/api/threads';
        fetchWithCache(url, `threads_${role}_${user.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
        .then(data => {
            if (Array.isArray(data)) {
                setThreads(data);
            }
            setLoading(false);
        })
        .catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, [user]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    // Fetch Messages when active thread changes
    useEffect(() => {
        if (!activeThread) return;

        const fetchMessages = () => {
            fetchWithCache(`/api/threads/${activeThread.id}/messages`, `messages_${activeThread.id}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            })
            .then(data => {
                if (Array.isArray(data)) {
                    setMessages(data);
                    scrollToBottom();
                }
            })
            .catch(console.error);
        };

         
        setMessages([]);
        fetchMessages();
        
        if (!socket) {
          socket = io();
        }
        
        socket.emit('join_thread', activeThread.id);
        
        const handleNewMessage = (message: Message) => {
          if (message.sender_id !== user?.id) {
              uiAudio.playPop();
          }
          setMessages(prev => {
            // Avoid adding optimistic duplicate
            if (prev.find(m => m.id === message.id)) return prev;
            return [...prev, message];
          });
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

        socket.on('new_message', handleNewMessage);
        socket.on('user_typing', handleUserTyping);
        socket.on('user_stopped_typing', handleUserStoppedTyping);

        return () => {
            socket.off('new_message', handleNewMessage);
            socket.off('user_typing', handleUserTyping);
            socket.off('user_stopped_typing', handleUserStoppedTyping);
            socket.emit('leave_thread', activeThread.id);
        };
    }, [activeThread, user]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeThread || !user) return;

        const receiverId = user.id === activeThread.guest_id ? activeThread.host_id : activeThread.guest_id;
        const msgStr = newMessage;
        setNewMessage('');
        uiAudio.playClick();

        if (socket) {
             if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
             socket.emit('typing_stop', { threadId: activeThread.id, userId: user.id });
        }

        // Optimistic UI
        const tempMsg: Message = {
            id: Date.now(),
            thread_id: activeThread.id,
            sender_id: user.id,
            receiver_id: receiverId,
            content: msgStr,
            is_read: false,
            created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, tempMsg]);
        scrollToBottom();

        try {
            const success = await queueMutation(`/api/threads/${activeThread.id}/messages`, 'POST', { receiverId, content: msgStr }, { 'Authorization': `Bearer ${localStorage.getItem('token')}` });
            if (!success && !navigator.onLine) {
                 // Nothing special, it was queued.
            } else if (success) {
                // Background update of threads list
                const url = role ? `/api/threads?role=${role}` : '/api/threads';
                fetch(url, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                })
                .then(r => r.json())
                .then(d => {
                    if (Array.isArray(d)) setThreads(d);
                });
            }
        } catch (err) {
            console.error('Failed to send message', err);
        }
    };

    const renderThreadItem = (thread: Thread) => {
        const isGuest = user?.id === thread.guest_id;
        const unreadCount = isGuest ? thread.unread_count_guest : thread.unread_count_host;
        const otherPartyName = isGuest ? thread.host_name : thread.guest_name;
        //const targetAvatar = isGuest ? thread.host_avatar : thread.guest_avatar;

        return (
            <div 
                key={thread.id} 
                onClick={() => setActiveThread(thread)}
                className={`p-4 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-4 ${activeThread?.id === thread.id ? 'bg-gray-50' : ''}`}
            >
                <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                    <img src={thread.listing_image || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa'} alt="listing" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-gray-900 truncate">{otherPartyName || 'Unknown'}</h4>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(thread.updated_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{thread.listing_title}</p>
                    <p className={`text-sm mt-1 truncate ${unreadCount > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                        {thread.last_message || 'No messages yet'}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                        {unreadCount}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return <InboxSkeleton />;
    }

    return (
        <>
            <SEO title="Messages" description="Your conversations on Encho Space" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-80px)]">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors xl:hidden">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 h-[calc(100%-4rem)] flex overflow-hidden">
                {/* Threads List Sidebar */}
                <div className={`${activeThread ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r border-gray-200 flex-col`}>
                    <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <h2 className="font-semibold text-gray-700">All Conversations</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {threads.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No conversations found.</div>
                        ) : (
                            threads.map(renderThreadItem)
                        )}
                    </div>
                </div>

                {/* Chat Area */}
                <div className={`${!activeThread ? 'hidden md:flex' : 'flex'} w-full md:w-2/3 flex-col bg-gray-50/30`}>
                    {activeThread ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-4 bg-white border-b border-gray-200 flex items-center gap-4">
                                <button className="md:hidden p-2 hover:bg-gray-100 rounded-full" onClick={() => setActiveThread(null)}>
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div className="font-semibold">
                                    {user?.id === activeThread.guest_id ? activeThread.host_name : activeThread.guest_name}
                                </div>
                                <div className="text-sm text-gray-500 line-clamp-1 ml-auto">
                                    {activeThread.listing_title}
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <AnimatePresence initial={false}>
                                {messages.map(msg => {
                                    const isMe = msg.sender_id === user?.id;
                                    return (
                                        <motion.div 
                                            key={msg.id} 
                                            initial={{ opacity: 0, scale: 0.9, y: 10, originX: isMe ? 1 : 0 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                            className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`max-w-[70%] xl:max-w-[60%] rounded-2xl px-5 py-3 shadow-sm ${isMe ? 'bg-[#0284C7] text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-900 rounded-tl-sm'}`}>
                                                <p className="text-sm">{msg.content}</p>
                                                <span className={`text-[10px] mt-2 block opacity-70 ${isMe ? 'text-right' : 'text-left'}`}>
                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
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
                                            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                        </div>
                                    </motion.div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Area */}
                            <div className="p-4 bg-white border-t border-gray-200">
                                <form onSubmit={handleSendMessage} className="flex items-end gap-3 relative">
                                    <div className="flex-1 relative group">
                                        <input 
                                            type="text"
                                            placeholder="Type a message..."
                                            className="w-full pl-4 pr-12 py-3 rounded-2xl border border-gray-300 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                                            value={newMessage}
                                            onChange={e => {
                                                setNewMessage(e.target.value);
                                                if (socket && activeThread && user) {
                                                    socket.emit('typing_start', { threadId: activeThread.id, userId: user.id });
                                                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                                    typingTimeoutRef.current = setTimeout(() => {
                                                        socket.emit('typing_stop', { threadId: activeThread.id, userId: user.id });
                                                    }, 2000);
                                                }
                                            }}
                                        />
                                        <button 
                                            type="button"
                                            title="AI Co-pilot: Draft a reply based on conversation"
                                            onClick={async () => {
                                                try {
                                                    const token = localStorage.getItem('token');
                                                    // Prepare history
                                                    const history = messages.slice(-5).map(m => `${m.sender_id === user?.id ? 'Me' : 'Them'}: ${m.content}`).join('\n');
                                                    
                                                    const res = await fetch('/api/ai/suggest-reply', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                        body: JSON.stringify({
                                                            threadId: activeThread?.id,
                                                            history,
                                                            propertyTitle: activeThread?.listing_title,
                                                            isHost: user?.id === activeThread?.host_id
                                                        })
                                                    });
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        if (data.reply) setNewMessage(data.reply);
                                                    }
                                                } catch (e) {
                                                    console.error("AI Reply failed:", e);
                                                }
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-full transition-colors z-10"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        </button>
                                    </div>
                                    <button 
                                        type="submit"
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
