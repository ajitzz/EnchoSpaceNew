import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';

interface AuthModalProps {
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  
  const dragControls = useDragControls();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
        setError('Please enter a mobile number');
        return;
    }
    setError('');
    setLoading(true);
    try {
        const res = await fetch('/api/auth/otp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
        });
        const data = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
        setIsOtpSent(true);
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return setError('Please enter the verification code');
    setError('');
    setLoading(true);
    try {
        const res = await fetch('/api/auth/otp/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp, name }),
        });
        const data = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        if (!res.ok) throw new Error(data.error || 'Invalid verification code');
        login(data.user, data.token);
        onClose();
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      setLoading(true);
      setError('');
      if (!credentialResponse.credential) throw new Error('Google Sign-In failed');
      const decoded: any = jwtDecode(credentialResponse.credential);
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleId: decoded.sub,
          email: decoded.email,
          name: decoded.name || 'Google User'
        }),
      });
      const data = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
      if (!res.ok) throw new Error(data.error || 'Google authentication failed');
      login(data.user, data.token);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[999] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={(e, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                    onClose();
                }
            }}
            className="bg-white w-full md:max-w-md rounded-t-[32px] md:rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            <div 
                className="w-full flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={(e) => dragControls.start(e)}
            >
                <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </div>
            
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <div className="p-6 pb-safe">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-6 flex items-center">
                 <span className="text-[#0284C7] mr-2">Encho</span>Space
              </h2>
              <div className="text-lg font-semibold text-gray-900 mb-6">Continue with Mobile Number</div>
              
              {error && (
                <div className="p-3 mb-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              {!isOtpSent ? (
                   <form onSubmit={handleSendOTP} className="space-y-4">
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                       <input
                         type="tel"
                         value={phone}
                         onChange={(e) => setPhone(e.target.value)}
                         className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7] transition-all bg-gray-50 focus:bg-white"
                         placeholder="+91 9999999999"
                         required
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">Your Name (Optional)</label>
                       <input
                         type="text"
                         value={name}
                         onChange={(e) => setName(e.target.value)}
                         className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7] transition-all bg-gray-50 focus:bg-white"
                         placeholder="John Doe"
                       />
                     </div>
                     <motion.button
                       whileTap={{ scale: 0.95 }}
                       type="submit"
                       disabled={loading || !phone}
                       className="w-full bg-[#0284C7] hover:bg-[#D11855] text-white py-3.5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                     >
                       {loading ? 'Sending...' : 'Send Verification Code'}
                     </motion.button>
                   </form>
              ) : (
                   <form onSubmit={handleVerifyOTP} className="space-y-4">
                     <div className="text-sm text-gray-600 mb-4">
                        We've sent a verification code to <span className="font-bold text-gray-900">{phone}</span>.
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
                       <input
                         type="text"
                         value={otp}
                         onChange={(e) => setOtp(e.target.value)}
                         className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7] transition-all bg-gray-50 focus:bg-white text-center font-mono tracking-[0.5em] text-lg"
                         placeholder="••••••"
                         maxLength={6}
                         required
                       />
                     </div>
                     <motion.button
                       whileTap={{ scale: 0.95 }}
                       type="submit"
                       disabled={loading || otp.length < 4}
                       className="w-full bg-black hover:bg-gray-800 text-white py-3.5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                     >
                       {loading ? 'Verifying...' : 'Verify & Continue'}
                     </motion.button>
                     <div className="text-center mt-4">
                         <button
                             type="button"
                             onClick={() => { setIsOtpSent(false); setOtp(''); }}
                             className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                         >
                             Change mobile number
                         </button>
                     </div>
                   </form>
              )}

              <div className="relative mb-6 mt-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">or continue with</span>
                </div>
              </div>

              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google Sign-In failed')}
                  useOneTap={!isIframe}
                  theme="outline"
                  size="large"
                  shape="rectangular"
                  text="continue_with"
                  width="100%"
                />
              </div>
            </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
