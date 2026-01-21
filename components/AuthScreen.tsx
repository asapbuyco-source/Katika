
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Lock, AlertTriangle, User, Mail, ArrowLeft } from 'lucide-react';
import { signInWithGoogle, registerWithEmail, loginWithEmail, loginAsGuest, syncUserProfile } from '../services/firebase';
import { User as AppUser, ViewState } from '../types';

interface AuthScreenProps {
  onAuthenticated: (user?: AppUser) => void;
  onNavigate: (view: ViewState) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated, onNavigate }) => {
  const [method, setMethod] = useState<'menu' | 'email'>('menu');
  const [isRegistering, setIsRegistering] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showGuest, setShowGuest] = useState(false);

  // Google Sign In Handler
  const handleGoogleLogin = async () => {
      setIsLoading(true);
      setError('');
      try {
          const firebaseUser = await signInWithGoogle();
          // If we got a simulated user back immediately, we might need to manually trigger the parent callback
          // because onAuthStateChanged might not fire for custom mock objects
          if (firebaseUser && (firebaseUser as any).uid.startsWith('google-user-')) {
               const appUser = await syncUserProfile(firebaseUser as any);
               onAuthenticated(appUser);
          }
          // For real firebase users, the listener in App.tsx handles it
      } catch (err: any) {
          console.error("Auth Error:", err);
          setError("Login failed. Trying Guest Mode...");
          setTimeout(handleGuestLogin, 1500);
          setIsLoading(false);
      }
  };

  const handleGuestLogin = async () => {
      setIsLoading(true);
      try {
          const guest = await loginAsGuest();
          // Pass the guest user up to App.tsx
          onAuthenticated(guest);
      } catch (e) {
          setError("Guest login failed");
          setIsLoading(false);
      }
  };

  const handleEmailAuth = async () => {
      if(!email || !password) {
          setError("Please fill in all fields.");
          return;
      }
      if(password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
      }

      setIsLoading(true);
      setError('');

      try {
          let resultUser;
          if (isRegistering) {
              resultUser = await registerWithEmail(email, password);
          } else {
              resultUser = await loginWithEmail(email, password);
          }
          
          // Check if it's a simulated user (which won't trigger standard Firebase listeners automatically if not actually in auth state)
          // Real users trigger App.tsx listener. Simulated ones need manual push.
          // Note: our simulated user follows partial FirebaseUser shape
          if (resultUser) {
              const appUser = await syncUserProfile(resultUser as any);
              onAuthenticated(appUser);
          }

      } catch (err: any) {
          console.error(err);
          // Fallback if manual simulation inside service also threw (unlikely now)
          if (err.code === 'auth/email-already-in-use') {
              setError("Email already registered. Please login.");
          } else {
              setError("Authentication failed. Try Guest Mode.");
              setShowGuest(true);
          }
          setIsLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
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
                <div className="absolute top-0 left-0 w-full p-3 bg-red-500/80 text-white text-xs text-center font-bold flex items-center justify-center gap-2 z-20">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* METHOD SELECTION */}
            {method === 'menu' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    
                    {/* Standard Logins */}
                    {!showGuest && (
                        <>
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
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-royal-900/80 px-2 text-slate-500">Or use email</span></div>
                            </div>

                            <button 
                                onClick={() => setMethod('email')}
                                className="w-full bg-royal-800/50 hover:bg-royal-800 border border-white/10 text-white font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3 relative group"
                            >
                                <Mail size={20} className="text-gold-400" />
                                <span>Email & Password</span>
                                <ChevronRight size={18} className="absolute right-4 text-slate-400 group-hover:text-white transition-colors" />
                            </button>
                        </>
                    )}

                    {/* Guest Fallback - Shows if error occurs or always available for dev */}
                    {showGuest && (
                        <motion.button 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            onClick={handleGuestLogin}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-3 hover:scale-105 transition-transform"
                        >
                            <User size={20} />
                            <span>Continue as Guest (Dev Mode)</span>
                        </motion.button>
                    )}
                    
                    <div className="mt-4 text-center">
                        <button onClick={() => setShowGuest(!showGuest)} className="text-[10px] text-slate-500 hover:text-white">
                            {showGuest ? "Hide Guest Option" : "Having trouble? Try Guest Mode"}
                        </button>
                    </div>
                </motion.div>
            )}

            {/* EMAIL / PASSWORD INPUT */}
            {method === 'email' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="text-center mb-6">
                        <h3 className="text-white font-bold text-xl">{isRegistering ? 'Create Account' : 'Sign In'}</h3>
                        <p className="text-xs text-slate-400">Enter your credentials below</p>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-400" size={18} />
                                <input 
                                    type="email" 
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors font-sans"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-400" size={18} />
                                <input 
                                    type="password" 
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors font-sans"
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-3">
                        <button 
                            onClick={() => { setMethod('menu'); setError(''); setShowGuest(false); }}
                            className="px-4 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <button 
                            onClick={handleEmailAuth}
                            disabled={isLoading}
                            className="flex-1 bg-gold-500 text-black font-bold py-4 rounded-xl hover:bg-gold-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isLoading ? <span className="animate-pulse">Processing...</span> : <span>{isRegistering ? 'Create Account' : 'Sign In'}</span>}
                        </button>
                    </div>

                    <div className="mt-6 text-center">
                        <button 
                            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                            className="text-xs text-gold-400 hover:text-white transition-colors font-medium underline-offset-4 hover:underline"
                        >
                            {isRegistering ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
                        </button>
                    </div>

                </motion.div>
            )}
        </div>
        
        <p className="text-center text-xs text-slate-600 mt-8">
            By connecting, you agree to Vantage Gaming's <button onClick={() => onNavigate('terms')} className="text-slate-400 underline hover:text-white transition-colors">Terms of Service</button>.
        </p>
      </div>
    </div>
  );
};
