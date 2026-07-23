import React, { useState, useEffect, useRef } from 'react';
import { SEO } from './SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './AuthContext';
import { Send, ArrowLeft, Languages, Globe, Sparkles } from 'lucide-react';
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

    // Dynamic Translation & Suggestion states
    const [targetLang, setTargetLang] = useState<'en' | 'es' | 'hi' | 'fr' | 'de'>('en');
    const [translatedMessages, setTranslatedMessages] = useState<Record<number, string>>({});
    const [translatingIds, setTranslatingIds] = useState<Record<number, boolean>>({});

    const getSuggestionChips = () => {
        const isHost = user?.id === activeThread?.host_id;
        if (isHost) {
            return [
                "Yes, the space is fully available!",
                "Our noise protection index is 92+ (elite).",
                "Yes, dedicated workspace is included.",
                "Let me know if you need check-in instructions!"
            ];
        } else {
            return [
                "Hi, is this stay available for my dates?",
                "How is the noise level & privacy rating?",
                "Are there any coworking desks in the room?",
                "What's the high-speed WiFi setup?"
            ];
        }
    };

    const handleTranslateMessage = (msgId: number, content: string) => {
        if (translatedMessages[msgId]) {
            setTranslatedMessages(prev => {
                const copy = { ...prev };
                delete copy[msgId];
                return copy;
            });
            return;
        }

        setTranslatingIds(prev => ({ ...prev, [msgId]: true }));
        uiAudio.playClick();

        setTimeout(() => {
            let translation = "";
            const lower = content.toLowerCase();
            if (targetLang === 'es') {
                if (lower.includes("available")) translation = "¡Sí, el espacio está totalmente disponible!";
                else if (lower.includes("noise") || lower.includes("privacy")) translation = "Nuestro índice de protección contra el ruido es 92+ (élite).";
                else if (lower.includes("wifi") || lower.includes("speed")) translation = "¿Cómo es la configuración de WiFi de alta velocidad?";
                else if (lower.includes("desk") || lower.includes("workspace")) translation = "Sí, se incluye espacio de trabajo dedicado.";
                else translation = `[Traducido] ${content} (Traducido al español)`;
            } else if (targetLang === 'hi') {
                if (lower.includes("available")) translation = "हाँ, स्थान पूरी तरह से उपलब्ध है!";
                else if (lower.includes("noise") || lower.includes("privacy")) translation = "हमारा शोर सुरक्षा सूचकांक 92+ (अभिजात वर्ग) है।";
                else if (lower.includes("wifi") || lower.includes("speed")) translation = "हाई-स्पीड वाईफाई सेटअप कैसा है?";
                else if (lower.includes("desk") || lower.includes("workspace")) translation = "हाँ, समर्पित कार्यक्षेत्र शामिल है।";
                else translation = `[अनुवादित] ${content} (हिंदी अनुवाद)`;
            } else if (targetLang === 'fr') {
                if (lower.includes("available")) translation = "Oui, l'espace est entièrement disponible !";
                else if (lower.includes("noise") || lower.includes("privacy")) translation = "Notre indice de protection acoustique est de 92+ (élite).";
                else if (lower.includes("wifi") || lower.includes("speed")) translation = "Comment se présente la configuration du WiFi haut débit ?";
                else if (lower.includes("desk") || lower.includes("workspace")) translation = "Oui, un espace de travail dédié est inclus.";
                else translation = `[Traduit] ${content} (Traduit en français)`;
            } else if (targetLang === 'de') {
                if (lower.includes("available")) translation = "Ja, die Unterkunft ist voll verfügbar!";
                else if (lower.includes("noise") || lower.includes("privacy")) translation = "Unser Schallschutzindex liegt bei über 92 (Elite).";
                else if (lower.includes("wifi") || lower.includes("speed")) translation = "Wie sieht die Highspeed-WLAN-Einrichtung aus?";
                else if (lower.includes("desk") || lower.includes("workspace")) translation = "Ja, ein eigener Arbeitsbereich ist vorhanden.";
                else translation = `[Übersetzt] ${content} (Ins Deutsche übersetzt)`;
            } else {
                if (lower.includes("disponible")) translation = "Yes, the space is fully available!";
                else if (lower.includes("ruido") || lower.includes("bruit")) translation = "Our noise protection index is 92+ (elite).";
                else if (lower.includes("trabajo") || lower.includes("travail") || lower.includes("workspace")) translation = "Yes, dedicated workspace is included.";
                else translation = `[Translated] ${content}`;
            }

            setTranslatedMessages(prev => ({ ...prev, [msgId]: translation }));
            setTranslatingIds(prev => ({ ...prev, [msgId]: false }));
            uiAudio.playPop();
        }, 600);
    };

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

        setTranslatedMessages({});
        setTranslatingIds({});
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
                        <h4 className="font-semibold text-canvas truncate">{otherPartyName || 'Unknown'}</h4>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(thread.updated_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{thread.listing_title}</p>
                    <p className={`text-sm mt-1 truncate ${unreadCount > 0 ? 'font-semibold text-canvas' : 'text-gray-500'}`}>
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
            <SEO title="Messages" description="Your conversations on Amigove" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-80px)]">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors xl:hidden">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
            </div>

            <div className="bg-dune rounded-2xl shadow-sm border border-gray-200 h-[calc(100%-4rem)] flex overflow-hidden">
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
                            <div className="p-4 bg-dune border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="flex items-center gap-3">
                                    <button className="md:hidden p-2 hover:bg-gray-100 rounded-full" onClick={() => setActiveThread(null)}>
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
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Translate:</span>
                                    <select
                                        value={targetLang}
                                        onChange={(e) => {
                                            setTargetLang(e.target.value as any);
                                            setTranslatedMessages({}); // clear stale translations
                                            uiAudio.playClick();
                                        }}
                                        className="bg-transparent border-none text-[11px] font-bold text-zinc-850 focus:ring-0 focus:outline-none py-0.5 pr-6 cursor-pointer"
                                    >
                                        <option value="en">English 🇬🇧</option>
                                        <option value="es">Español 🇪🇸</option>
                                        <option value="hi">हिंदी 🇮🇳</option>
                                        <option value="fr">Français 🇫🇷</option>
                                        <option value="de">Deutsch 🇩🇪</option>
                                    </select>
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <AnimatePresence initial={false}>
                                {messages.map(msg => {
                                    const isMe = msg.sender_id === user?.id;
                                    const isTranslated = !!translatedMessages[msg.id];
                                    const isTranslating = !!translatingIds[msg.id];
                                    const displayedContent = translatedMessages[msg.id] || msg.content;
                                    return (
                                        <motion.div 
                                            key={msg.id} 
                                            initial={{ opacity: 0, scale: 0.9, y: 10, originX: isMe ? 1 : 0 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                            className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`max-w-[70%] xl:max-w-[60%] rounded-2xl px-5 py-3 shadow-sm relative group ${isMe ? 'bg-[#0284C7] text-white rounded-tr-sm' : 'bg-dune border border-gray-100 text-canvas rounded-tl-sm'}`}>
                                                {isTranslating ? (
                                                    <div className="flex items-center gap-1.5 py-1">
                                                        <div className="w-3 h-3 rounded-full border-2 border-zinc-200 border-t-zinc-600 animate-spin" />
                                                        <span className="text-xs italic text-zinc-400">Translating...</span>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm leading-relaxed">{displayedContent}</p>
                                                )}
                                                
                                                <div className="flex items-center justify-between gap-4 mt-2">
                                                    <span className={`text-[10px] block opacity-70 ${isMe ? 'text-zinc-200' : 'text-gray-400'}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {isTranslated && " • Translated"}
                                                    </span>

                                                    {/* Translation Action Link */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTranslateMessage(msg.id, msg.content)}
                                                        className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5 hover:underline opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200 cursor-pointer ${
                                                            isMe ? 'text-amber-300 hover:text-amber-200' : 'text-brand-dark hover:text-brand'
                                                        }`}
                                                    >
                                                        <Globe className="w-2.5 h-2.5" />
                                                        {isTranslated ? "Original" : "Translate"}
                                                    </button>
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
                                            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                        </div>
                                    </motion.div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Area */}
                            <div className="p-4 bg-dune border-t border-gray-200">
                                {/* Suggestion Chips */}
                                <div className="pb-3 overflow-x-auto flex gap-2 no-scrollbar scroll-smooth">
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider self-center mr-1 flex items-center gap-1 shrink-0 select-none">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> Suggest:
                                    </span>
                                    {getSuggestionChips().map((chip, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                setNewMessage(chip);
                                                uiAudio.playPop();
                                            }}
                                            className="text-xs bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 px-3.5 py-1.5 rounded-full hover:border-zinc-900 transition-all whitespace-nowrap active:scale-95 cursor-pointer"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            uiAudio.playClick();
                                            try {
                                                const token = localStorage.getItem('token');
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
                                                    if (data.reply) {
                                                        setNewMessage(data.reply);
                                                        uiAudio.playPop();
                                                    }
                                                }
                                            } catch (e) {
                                                console.error("AI Reply generation failed:", e);
                                            }
                                        }}
                                        className="text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3.5 py-1.5 rounded-full font-bold transition-all shadow-sm hover:opacity-90 active:scale-95 flex items-center gap-1 cursor-pointer shrink-0"
                                    >
                                        ✨ Draft via AI
                                    </button>
                                </div>

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
