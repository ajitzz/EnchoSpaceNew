import React, { useState, useEffect, useRef } from 'react';
import { SEO } from './SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Users, Send, X, ShieldCheck, Clock, Crown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { Experience } from '../types';

interface Message {
  id: number;
  user_id: number;
  user_name: string;
  user_role: string;
  is_host: boolean;
  content: string;
  created_at: string;
}

interface Participant {
  id: number;
  name: string;
  role: string;
}

interface TravelerLobbyProps {
  experience: Experience;
  onClose: () => void;
}

export const TravelerLobby: React.FC<TravelerLobbyProps> = ({ experience, onClose }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLobbyData();
    // In a real app, we'd use websockets or polling here for live updates.
    const interval = setInterval(fetchLobbyData, 10000);
    return () => clearInterval(interval);
  }, [experience.id]);

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchLobbyData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [msgRes, partRes] = await Promise.all([
        fetch(`/api/experiences/${experience.id}/lobby/messages`, { headers }),
        fetch(`/api/experiences/${experience.id}/lobby/participants`, { headers })
      ]);

      if (msgRes.ok && partRes.ok) {
        const msgs = msgRes.headers.get('content-type')?.includes('json') ? await msgRes.json() : { error: 'Server returned non-JSON response: ' + (await msgRes.text()).slice(0, 150) } as any;
        const parts = partRes.headers.get('content-type')?.includes('json') ? await partRes.json() : { error: 'Server returned non-JSON response: ' + (await partRes.text()).slice(0, 150) } as any;
        setMessages(msgs);
        setParticipants(parts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/experiences/${experience.id}/lobby/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: newMessage })
      });

      if (res.ok) {
        const addedMsg = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        setMessages(prev => [...prev, addedMsg]);
        setNewMessage('');
      } else {
        addToast("Error", "Failed to send message.", "error");
      }
    } catch (e) {
      addToast("Error", "Network error.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-4xl h-[95dvh] md:h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row mt-auto md:mt-0"
      >
        {/* Sidebar / Participants */}
        <div className="w-full md:w-80 bg-[#111] border-r border-white/5 flex flex-col shrink-0">
          <div className="p-6 border-b border-white/5 bg-[#151515] flex justify-between items-center">
            <div>
              <h2 className="text-white font-bold text-lg tracking-tight">Traveler Lobby</h2>
              <p className="text-xs text-blue-400 mt-1 font-medium">{experience.title}</p>
            </div>
            <button 
              onClick={onClose}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex md:hidden border-b border-white/5">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-gray-500'}`}
            >
              Group Chat
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'participants' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-gray-500'}`}
            >
              Passengers ({participants.length})
            </button>
          </div>

          <div className={`flex-1 overflow-y-auto p-4 md:block ${activeTab === 'participants' ? 'block' : 'hidden'}`}>
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users className="w-3 h-3" />
              Manifest & Manifest
            </h3>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                      p.id === experience.host_id ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/10 text-gray-300'
                    }`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-white text-sm font-bold">{p.name}</span>
                        {p.id === experience.host_id && (
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                        )}
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                        {p.id === experience.host_id ? 'Verified Guide' : 'Traveler'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col bg-black md:flex ${activeTab === 'chat' ? 'flex' : 'hidden'}`}>
          <div className="hidden md:flex p-6 border-b border-white/5 bg-[#0d0d0d] justify-between items-center">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-gray-400" />
              <div>
                <h3 className="text-white font-bold">Group Discussion</h3>
                <p className="text-xs text-gray-500">Coordinate and meet your fellow travelers</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-3">
                <Crown className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="text-white font-bold">Welcome to the Lobby!</h4>
              <p className="text-xs text-gray-400 max-w-sm mx-auto mt-2">
                This is a private space for confirmed travelers and the host to coordinate details. Say hello!
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMe = msg.user_id === user?.id;
                const isHost = msg.is_host;
                const showHeader = idx === 0 || messages[idx - 1].user_id !== msg.user_id;

                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {showHeader && (
                      <div className={`flex items-center gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        <span className="text-xs font-bold text-gray-300">
                          {isMe ? 'You' : msg.user_name}
                        </span>
                        {isHost && !isMe && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            Host
                          </span>
                        )}
                        <span className="text-[10px] text-gray-600">
                          {format(new Date(msg.created_at), 'MMM d, p')}
                        </span>
                      </div>
                    )}
                    <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      isMe 
                        ? 'bg-blue-600 text-white rounded-tr-sm' 
                        : isHost
                          ? 'bg-[#1a1a1a] text-blue-50 border border-blue-500/20 rounded-tl-sm'
                          : 'bg-white/10 text-gray-100 rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-[#0d0d0d] border-t border-white/5">
            <form onSubmit={handleSendMessage} className="flex gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Message the group..."
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
              />
              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="w-12 h-12 shrink-0 bg-blue-500 hover:bg-blue-400 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
