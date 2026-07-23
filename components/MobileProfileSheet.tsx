import React, { useEffect, useState } from 'react';
import { XIcon, UserIcon, LogInIcon, HouseIcon, PhoneIcon, MessageCircleIcon, MailIcon } from './Icons';
import { DownloadIcon } from 'lucide-react';
import { useAuth } from './AuthContext';
import { usePWAInstall } from '../lib/usePWAInstall';
import { uiAudio } from './audio';

interface MobileProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginClick: () => void;
  onHostClick: () => void;
  onNavigateToAdmin: () => void;
}

export const MobileProfileSheet: React.FC<MobileProfileSheetProps> = ({ isOpen, onClose, onLoginClick, onHostClick, onNavigateToAdmin }) => {
  const { user, logout } = useAuth();
  const { isInstallable, promptInstall } = usePWAInstall();
  const [whatsappConfig, setWhatsappConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [callConfig, setCallConfig] = useState<{ enabled: boolean, number: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/settings/whatsapp')
      .then(res => res.json())
      .then(data => { if (data?.enabled && data?.number) setWhatsappConfig(data); })
      .catch(() => {});
      
    fetch('/api/settings/call')
      .then(res => res.json())
      .then(data => { if (data?.enabled && data?.number) setCallConfig(data); })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] md:hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl transform transition-transform animate-slide-in-bottom max-h-[90vh] overflow-y-auto pb-safe">
        <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 flex items-center justify-between p-4 border-b border-gray-100">
           <h2 className="text-xl font-bold text-gray-900 ml-2">Profile</h2>
           <button onClick={() => { uiAudio.playClick(); onClose(); }} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
               <XIcon className="w-5 h-5 text-gray-600" />
           </button>
        </div>
        
        <div className="p-4 space-y-6">
           {/* Account Section */}
           <div>
               <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Account</h3>
               <div className="grid grid-cols-2 gap-3">
                 {isInstallable && (
                    <button onClick={() => { promptInstall(); onClose(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform col-span-2">
                        <DownloadIcon className="w-6 h-6 text-gray-700 mb-2" />
                        <span className="font-bold text-gray-900 text-sm">Install App</span>
                    </button>
                 )}
                 {user ? (
                    <>
                     <div className="col-span-2 flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                            <UserIcon className="w-6 h-6 text-gray-500" />
                        </div>
                        <div>
                            <div className="font-bold text-gray-900">{user.name}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                     </div>
                     <button onClick={() => { logout(); onClose(); }} className="flex items-center justify-center p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-colors col-span-2">
                         <span className="font-bold text-gray-900 text-sm">Log out</span>
                     </button>
                     {user.role === 'admin' && (
                         <button onClick={() => { onNavigateToAdmin(); onClose(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-black text-white active:scale-95 transition-transform col-span-2 shadow-md">
                             <span className="font-bold text-sm">Admin Dashboard</span>
                         </button>
                     )}
                    </>
                 ) : (
                    <>
                     <button onClick={() => { onLoginClick(); onClose(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-50 border border-gray-100 active:scale-95 transition-transform">
                         <LogInIcon className="w-6 h-6 text-gray-700 mb-2" />
                         <span className="font-bold text-gray-900 text-sm">Log in</span>
                     </button>
                     <button onClick={() => { onLoginClick(); onClose(); }} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-[#e51d53] text-white active:scale-95 transition-transform shadow-md">
                         <UserIcon className="w-6 h-6 mb-2" />
                         <span className="font-bold text-sm">Sign up</span>
                     </button>
                    </>
                 )}
               </div>
           </div>

           {/* Hosting Section */}
           <div>
               <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Hosting</h3>
               <div onClick={() => { onHostClick(); onClose(); }} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6 shadow-lg active:scale-[0.98] transition-transform cursor-pointer">
                   <div className="relative z-10">
                       <h3 className="font-bold text-xl mb-1">Airbnb your place</h3>
                       <p className="text-white/80 text-sm font-medium mb-4">It's simple to get set up and start earning.</p>
                       <div className="bg-white text-black self-start inline-block px-4 py-2 rounded-xl text-sm font-bold">Learn more</div>
                   </div>
                   <HouseIcon className="absolute -bottom-4 -right-4 w-24 h-24 text-white/10" />
               </div>
           </div>

           {/* Support Section */}
           <div>
               <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Support</h3>
               <div className="space-y-3">
                   {whatsappConfig?.enabled && whatsappConfig?.number && (
                     <button onClick={() => window.open(`https://wa.me/${whatsappConfig.number}`, '_blank')} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                         <MessageCircleIcon className="w-5 h-5" />
                         <div className="flex flex-col items-start">
                             <span className="text-xs font-semibold opacity-70">WhatsApp</span>
                             <span className="font-bold">Message Us</span>
                         </div>
                     </button>
                   )}
                   <div className="grid grid-cols-2 gap-3">
                       {callConfig?.enabled && callConfig?.number && (
                         <button onClick={() => window.open(`tel:${callConfig.number}`, '_self')} className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors">
                             <PhoneIcon className="w-4 h-4" />
                             <span className="font-semibold text-sm">Call</span>
                         </button>
                       )}
                       <button className={`flex items-center justify-center gap-2 p-4 rounded-2xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors ${!(callConfig?.enabled && callConfig?.number) ? 'col-span-2' : ''}`}>
                           <MailIcon className="w-4 h-4" />
                           <span className="font-semibold text-sm">Email</span>
                       </button>
                   </div>
               </div>
           </div>
           
           <div className="h-4"></div>
        </div>
      </div>
    </div>
  );
};
