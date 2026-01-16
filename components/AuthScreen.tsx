
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Scan, Smartphone, ChevronRight, Fingerprint, Lock, Globe, Mail } from 'lucide-react';
import { signInWithGoogle, setupRecaptcha, auth } from '../services/firebase';
import { signInWithPhoneNumber } from 'firebase/auth';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [method, setMethod] = useState<'menu' | 'phone' | 'otp'>('menu');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Google Sign In Handler
  const handleGoogleLogin = async () => {
      setIsLoading(true);
      setError('');
      try {
          await signInWithGoogle();
          // onAuthenticated will be triggered by the App.tsx onAuthStateChanged listener
      } catch (err: any) {
          setError("Login failed. Please try again.");
          setIsLoading(false);
      }
  };

  // Phone Auth Step 1: Send SMS
  const handleSendCode = async () => {
      if(phoneNumber.length < 9) {
          setError("Invalid phone number format.");
          return;
      }
      setIsLoading(true);
      setError('');
      
      try {
          const verifier = setupRecaptcha('recaptcha-container');
          // Format phone for Cameroon (assuming input is local e.g. 6...)
          const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+237${phoneNumber}`;
          
          const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
          window.confirmationResult = confirmationResult;
          
          setIsLoading(false);
          setMethod('otp');
      } catch (err: any) {
          console.error(err);
          setError("Failed to send SMS. Verify the number.");
          setIsLoading(false);
          // Reset captcha if failed
          if(window.recaptchaVerifier) {
              window.recaptchaVerifier.clear();
              window.recaptchaVerifier = null;
          }
      }
  };

  // Phone Auth Step 2: Verify OTP
  const handleVerifyOtp = async () => {
      if(otp.length < 6) return;
      setIsLoading(true);
      try {
          await window.confirmationResult.confirm(otp);
          // Success handled by App.tsx listener
      } catch (err) {
          setError("Invalid Code.");
          setIsLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Hidden container for ReCAPTCHA */}
      <div id="recaptcha-container"></div>

      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-20%] right-[-20%] w-[80vw] h-[80vw] bg-gradient-to-br from-royal-800/20 to-purple-900/20 rounded-full blur-[100px]" 
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-gradient-to-tr from-gold-600/10 to-transparent rounded-full blur-[100px]" 
          />
      </div>

      <div className="w-full max-w-md relative z-10">
        <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-10"
        >
            <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mx-auto flex items-center justify-center text-royal-950 font-black text-3xl shadow-[0_0_40px_rgba(251,191,36,0.3)] mb-4">
                V
            </div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Welcome Back</h1>
            <p className="text-slate-400">Secure Access Portal</p>
        </motion.div>

        <div className="glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden min-h-[400px] flex flex-col justify-center">
            
            {/* Error Message */}
            {error && (
                <div className="absolute top-0 left-0 w-full p-3 bg-red-500/80 text-white text-xs text-center font-bold">
                    {error}
                </div>
            )}

            {/* METHOD SELECTION */}
            {method === 'menu' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <button 
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className="w-full bg-white hover:bg-slate-100 text-royal-900 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3 relative group"
                    >
                        {isLoading ? (
                            <span className="animate-pulse">Connecting...</span>
                        ) : (
                            <>
                                <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
                                <span>Continue with Google</span>
                                <ChevronRight size={18} className="absolute right-4 text-slate-400 group-hover:text-royal-900 transition-colors" />
                            </>
                        )}
                    </button>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-royal-900/80 px-2 text-slate-500">Or use phone</span></div>
                    </div>

                    <button 
                        onClick={() => setMethod('phone')}
                        className="w-full bg-royal-800/50 hover:bg-royal-800 border border-white/10 text-white font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3 relative group"
                    >
                        <Smartphone size={20} className="text-gold-400" />
                        <span>Mobile Number</span>
                        <ChevronRight size={18} className="absolute right-4 text-slate-400 group-hover:text-white transition-colors" />
                    </button>
                    
                    <div className="mt-4 text-center">
                        <p className="text-[10px] text-slate-500">Secure, Passwordless Authentication</p>
                    </div>
                </motion.div>
            )}

            {/* PHONE INPUT */}
            {method === 'phone' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mobile Number</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-400 font-bold text-sm">+237</span>
                            <input 
                                type="tel" 
                                placeholder="6XX XXX XXX"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 pl-16 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors font-mono text-lg"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => { setMethod('menu'); setError(''); }}
                            className="px-4 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400"
                        >
                            Back
                        </button>
                        <button 
                            onClick={handleSendCode}
                            disabled={isLoading || phoneNumber.length < 8}
                            className="flex-1 bg-gold-500 text-black font-bold py-4 rounded-xl hover:bg-gold-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isLoading ? <span className="animate-pulse">Sending...</span> : <>Send Code <ChevronRight size={18}/></>}
                        </button>
                    </div>
                </motion.div>
            )}

            {/* OTP VERIFICATION */}
            {method === 'otp' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="text-center mb-6">
                        <div className="mx-auto w-12 h-12 bg-royal-800 rounded-full flex items-center justify-center mb-2">
                            <Lock className="text-gold-400" size={24} />
                        </div>
                        <h3 className="text-white font-bold">Verification Code</h3>
                        <p className="text-xs text-slate-400">Sent to +237 {phoneNumber}</p>
                    </div>

                    <div className="mb-8">
                        <input 
                            type="text" 
                            placeholder="Enter 6-digit code"
                            maxLength={6}
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 text-center text-white placeholder:text-slate-700 focus:outline-none focus:border-gold-500 transition-colors font-mono text-2xl tracking-[0.5em]"
                            autoFocus
                        />
                    </div>
                    
                    <button 
                         onClick={handleVerifyOtp}
                         disabled={isLoading || otp.length < 6}
                         className="w-full bg-gold-500 text-black font-bold py-4 rounded-xl hover:bg-gold-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20"
                    >
                        {isLoading ? "Verifying..." : "Confirm Access"}
                    </button>
                    <button onClick={() => setMethod('phone')} className="w-full mt-4 text-xs text-slate-500 hover:text-white">Wrong Number?</button>
                </motion.div>
            )}
        </div>
        
        <p className="text-center text-xs text-slate-600 mt-8">
            By connecting, you agree to Vantage Ludo's <span className="text-slate-400 underline">Terms of Service</span>.
        </p>
      </div>
    </div>
  );
};
