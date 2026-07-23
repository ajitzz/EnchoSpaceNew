import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { ArrowLeft } from 'lucide-react';
import { AdminInboxSkeleton } from './Skeletons';

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

interface AdminInboxProps {
    adminMode: 'stays' | 'experiences';
}

const AdminInbox = ({ adminMode }: AdminInboxProps) => {
    const { user, token } = useAuth();
    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThread, setActiveThread] = useState<Thread | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch All Threads as Admin
    useEffect(() => {
        setTimeout(() => setLoading(true), 0);
        fetch(`/api/admin/threads?type=${adminMode}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
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
    }, [token, adminMode]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    // Fetch Messages for Admin
    useEffect(() => {
        if (!activeThread) return;

        fetch(`/api/admin/threads/${activeThread.id}/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                setMessages(data);
                scrollToBottom();
            }
        })
        .catch(console.error);
    }, [activeThread, token]);

    const renderThreadItem = (thread: Thread) => {
        return (
            <div 
                key={thread.id} 
                onClick={() => setActiveThread(thread)}
                className={`p-4 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors flex flex-col gap-2 ${activeThread?.id === thread.id ? 'bg-gray-50' : ''}`}
            >
                <div className="flex items-center gap-4">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                        <img src={thread.listing_image || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa'} alt="listing" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                            <h4 className="font-semibold text-canvas truncate text-sm">{thread.listing_title}</h4>
                            <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(thread.updated_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                            {thread.guest_name || 'Guest'} ↔ {thread.host_name || 'Host'}
                        </p>
                    </div>
                </div>
                <p className={`text-sm truncate text-gray-500 bg-dune p-2 rounded-lg border border-gray-100`}>
                    {thread.last_message || 'No messages yet'}
                </p>
            </div>
        );
    };

    if (loading) {
        return <AdminInboxSkeleton />;
    }

    return (
        <div className="bg-dune rounded-2xl shadow-sm border border-gray-200 h-[600px] flex overflow-hidden">
            {/* Threads List Sidebar */}
            <div className={`${activeThread ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r border-gray-200 flex-col bg-slate-50/50`}>
                <div className="p-4 border-b border-gray-100 bg-dune/50 backdrop-blur-md sticky top-0 z-10">
                    <h2 className="font-bold text-canvas">All Platform Conversations</h2>
                    <p className="text-xs text-gray-500 mt-1">{threads.length} total threads</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {threads.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">No conversations found.</div>
                    ) : (
                        threads.map(renderThreadItem)
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className={`${!activeThread ? 'hidden md:flex' : 'flex'} w-full md:w-2/3 flex-col bg-dune`}>
                {activeThread ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 bg-dune border-b border-gray-100 flex items-center gap-4 sticky top-0 z-10">
                            <button className="md:hidden p-2 hover:bg-gray-100 rounded-full" onClick={() => setActiveThread(null)}>
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="flex-1">
                                <div className="font-bold text-canvas text-sm">
                                    {activeThread.guest_name} ↔ {activeThread.host_name}
                                </div>
                                <div className="text-xs text-brand-dark font-medium">
                                    {activeThread.listing_title}
                                </div>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                            {messages.map(msg => {
                                const isGuest = msg.sender_id === activeThread.guest_id;
                                const isHost = msg.sender_id === activeThread.host_id;
                                
                                return (
                                    <div key={msg.id} className={`flex flex-col ${isHost ? 'items-end' : 'items-start'}`}>
                                        <div className="text-[10px] text-gray-500 mb-1 font-semibold uppercase tracking-wider px-1">
                                            {isHost ? 'Host' : isGuest ? 'Guest' : 'Admin'} • {msg.sender_name}
                                        </div>
                                        <div className="flex items-center gap-2 group">
                                            {isHost && (
                                                <button 
                                                    onClick={async () => {
                                                        if (!confirm('Delete this message?')) return;
                                                        try {
                                                            await fetch(`/api/admin/messages/${msg.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                                                            setMessages(prev => prev.filter(m => m.id !== msg.id));
                                                        } catch(e) { console.error('Delete failed:', e); }
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-50 rounded"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                            <div className={`max-w-md rounded-2xl px-5 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border ${isHost ? 'bg-black text-white rounded-tr-sm border-black' : 'bg-dune text-canvas rounded-tl-sm border-gray-100'}`}>
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                            </div>
                                            {!isHost && (
                                                <button 
                                                    onClick={async () => {
                                                        if (!confirm('Delete this message?')) return;
                                                        try {
                                                            await fetch(`/api/admin/messages/${msg.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                                                            setMessages(prev => prev.filter(m => m.id !== msg.id));
                                                        } catch(e) { console.error('Delete failed:', e); }
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-50 rounded"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-[10px] mt-1.5 text-gray-400 font-medium px-1">
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-dune border-t border-gray-100 mt-auto">
                            <form 
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const input = form.elements.namedItem('msg') as HTMLInputElement;
                                    const msgStr = input.value.trim();
                                    if (!msgStr || !activeThread) return;
                                    input.value = '';

                                    try {
                                        const res = await fetch(`/api/threads/${activeThread.id}/messages`, {
                                            method: 'POST',
                                            headers: { 
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${token}`
                                            },
                                            // Send to guest by default, or you can enhance this later
                                            body: JSON.stringify({ receiverId: activeThread.guest_id, content: `[Admin] ${msgStr}` })
                                        });
                                        if (res.ok) {
                                            const newMsg = await res.json();
                                            setMessages(prev => [...prev, newMsg]);
                                            scrollToBottom();
                                        }
                                    } catch (err) {
                                        console.error(err);
                                    }
                                }} 
                                className="flex items-end gap-3 relative"
                            >
                                <div className="flex-1 relative group">
                                    <input 
                                        id="admin-msg-input"
                                        type="text"
                                        name="msg"
                                        placeholder="Type an admin message..."
                                        className="w-full pl-4 pr-12 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all text-sm"
                                        autoComplete="off"
                                    />
                                    <button 
                                        type="button"
                                        title="AI Co-pilot: Draft a reply"
                                        onClick={async () => {
                                            try {
                                                const history = messages.slice(-5).map(m => `${m.sender_name}: ${m.content}`).join('\n');
                                                const res = await fetch('/api/ai/suggest-reply', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                    body: JSON.stringify({
                                                        threadId: activeThread?.id,
                                                        history,
                                                        propertyTitle: activeThread?.listing_title,
                                                        isHost: false
                                                    })
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    if (data.reply) {
                                                        const input = document.getElementById('admin-msg-input') as HTMLInputElement;
                                                        if (input) input.value = data.reply;
                                                    }
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
                                    className="px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-colors shadow-sm text-sm font-bold"
                                >
                                    Send
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-4 bg-slate-50/50">
                        <div className="w-16 h-16 rounded-full bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center">
                            <svg className="w-6 h-6 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <p className="font-medium text-sm">Select a thread to view messages cross-platform</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminInbox;
