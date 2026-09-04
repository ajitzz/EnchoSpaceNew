import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchIcon, HeartIcon, MessageCircleIcon } from './Icons';
import { useAuth } from './AuthContext';
import { uiAudio } from './audio';
import { useToast } from './ToastContext';

interface BottomNavProps {
  currentView: string;
  appMode: 'travel' | 'host';
  onNavigate: (view: string) => void;
  onProfileClick: () => void;
  isVisible?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ 
  currentView, 
  appMode, 
  onNavigate, 
  onProfileClick,
  isVisible = true 
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [unreadCount, setUnreadCount] = React.useState(0);

   React.useEffect(() => {
      const token = localStorage.getItem('token');
      if (user && token) {
          fetch('/api/unread-counts', {
              headers: { 'Authorization': `Bearer ${token}` }
          })
          .then(res => res.ok ? res.json() : null)
          .then(data => data && setUnreadCount(data.unread || 0))
          .catch(() => {});
          
          const interval = setInterval(() => {
              const currentToken = localStorage.getItem('token');
              if (!currentToken) return;
              fetch('/api/unread-counts', {
                  headers: { 'Authorization': `Bearer ${currentToken}` }
              })
              .then(res => res.ok ? res.json() : null)
              .then(data => data && setUnreadCount(data.unread || 0))
              .catch(() => {});
          }, 30000);
          return () => clearInterval(interval);
      } else {
          setUnreadCount(0);
      }
   }, [user]);

  if (appMode === 'host') return null;

  // Exact 3 tabs requested by the user: Wishlist, Explore, Inbox
  const tabs = [
    { id: 'WISHLIST', label: 'Wishlist', icon: HeartIcon },
    { id: 'SEARCH', label: 'Explore', icon: SearchIcon },
    { id: 'MESSAGES', label: 'Inbox', icon: MessageCircleIcon, badge: unreadCount },
  ];

  const isActive = (id: string) => {
    if (id === 'SEARCH' && (currentView === 'SEARCH' || currentView === 'EXPERIENCES')) return true;
    if (id === currentView) return true;
    return false;
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ y: 80, x: "-50%", opacity: 0 }}
          animate={{ y: 0, x: "-50%", opacity: 1 }}
          exit={{ y: 80, x: "-50%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          style={{ left: "50%" }}
          className="md:hidden fixed bottom-6 w-[88%] max-w-[340px] bg-white/45 dark:bg-zinc-950/45 backdrop-blur-3xl saturate-[160%] border border-white/30 dark:border-white/10 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.12)] z-[200] p-1.5"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            {tabs.map(tab => {
              const active = isActive(tab.id);
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    uiAudio.playClick();
                    if (navigator.vibrate) navigator.vibrate(12);
                    if (tab.id === 'MESSAGES' && !user) {
                       addToast("Login Required", "Please login to view messages", "info");
                       onProfileClick();
                       return;
                    }
                    onNavigate(tab.id);
                  }}
                  className={`relative flex items-center justify-center transition-all duration-300 rounded-full select-none ${
                    active 
                      ? 'bg-[#EBE7D9] text-[#1c1917] px-5 py-2.5 font-black text-xs shadow-[0_4px_12px_rgba(0,0,0,0.08)]' 
                      : 'text-stone-600 dark:text-stone-300 hover:text-black dark:hover:text-white px-4 py-3'
                  }`}
                  style={{ flexGrow: active ? 1.5 : 1 }}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${active && tab.id === 'WISHLIST' ? 'fill-current' : ''}`} />
                    
                    {/* Active Label */}
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ type: "spring", stiffness: 350, damping: 28 }}
                          className="overflow-hidden whitespace-nowrap tracking-tight font-black"
                        >
                          {tab.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Badge */}
                  {typeof tab.badge === 'number' && tab.badge > 0 && !active && (
                    <span className="absolute top-1.5 right-3 bg-[#e51d53] text-white text-[8px] font-bold h-3.5 min-w-[14px] px-0.5 rounded-full flex items-center justify-center border border-[#1a1a1a]">
                       {tab.badge}
                    </span>
                  )}
                  {typeof tab.badge === 'number' && tab.badge > 0 && active && (
                    <span className="ml-1.5 bg-[#e51d53] text-white text-[8px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center">
                       {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
