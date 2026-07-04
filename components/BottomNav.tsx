import React from 'react';
import { SearchIcon, HeartIcon, CalendarIcon, MessageCircleIcon, UserIcon } from './Icons';
import { useAuth } from './AuthContext';
import { uiAudio } from './audio';
import { useToast } from './ToastContext';

interface BottomNavProps {
  currentView: string;
  appMode: 'travel' | 'host';
  onNavigate: (view: string) => void;
  onProfileClick: () => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, appMode, onNavigate, onProfileClick }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
     if (user) {
         fetch('/api/unread-counts', {
             headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
         })
         .then(res => res.json())
         .then(data => setUnreadCount(data.unread || 0))
         .catch(console.error);
         
         const interval = setInterval(() => {
             fetch('/api/unread-counts', {
                 headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
             })
             .then(res => res.json())
             .then(data => setUnreadCount(data.unread || 0));
         }, 30000);
         return () => clearInterval(interval);
     } else {
         setUnreadCount(0);
     }
  }, [user]);

  if (appMode === 'host') return null; // Host might have its own bottom nav or not. For now, keep it simple.

  const tabs = [
    { id: 'SEARCH', label: 'Explore', icon: SearchIcon },
    { id: 'WISHLIST', label: 'Wishlists', icon: HeartIcon },
    { id: 'RESERVATIONS', label: 'Trips', icon: CalendarIcon },
    { id: 'MESSAGES', label: 'Inbox', icon: MessageCircleIcon, badge: unreadCount },
    { id: 'PROFILE', label: 'Profile', icon: UserIcon },
  ];

  const isActive = (id: string) => {
    if (id === 'SEARCH' && (currentView === 'SEARCH' || currentView === 'EXPERIENCES')) return true;
    if (id === currentView) return true;
    return false;
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl saturate-150 border-t border-gray-100/50 pb-safe z-[200]">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(tab => {
          const active = isActive(tab.id);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                uiAudio.playClick();
                if (tab.id === 'PROFILE') {
                  onProfileClick();
                } else {
                  if (tab.id === 'MESSAGES' && !user) {
                     addToast("Login Required", "Please login to view messages", "info");
                     onProfileClick();
                     return;
                  }
                  if (tab.id === 'RESERVATIONS' && !user) {
                     addToast("Login Required", "Please login to view trips", "info");
                     onProfileClick();
                     return;
                  }
                  onNavigate(tab.id);
                }
              }}
              className="flex flex-col items-center justify-center w-full h-full gap-1 active:scale-95 transition-transform relative"
            >
              <div className={`transition-colors duration-300 ${active ? 'text-[#e51d53]' : 'text-gray-400'}`}>
                <Icon className={`w-6 h-6 ${active && tab.id === 'WISHLIST' ? 'fill-current' : ''}`} />
                {tab.badge && tab.badge > 0 && (
                   <span className="absolute top-2 right-1/4 translate-x-1/2 -translate-y-1/2 bg-[#e51d53] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                      {tab.badge}
                   </span>
                )}
              </div>
              <span className={`text-[10px] font-medium transition-colors duration-300 ${active ? 'text-[#e51d53]' : 'text-gray-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
