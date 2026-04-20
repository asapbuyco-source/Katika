
import React, { useState } from 'react';
import { motion as originalMotion } from 'framer-motion';
import { ChevronRight, Lock, AlertTriangle, User, Mail, ArrowLeft, KeyRound, CheckCircle } from 'lucide-react';
import { signInWithGoogle, registerWithEmail, loginWithEmail, syncUserProfile, triggerPasswordReset } from '../services/firebase';
import { User as AppUser, ViewState } from '../types';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

interface AuthScreenProps {
    onAuthenticated: (user?: AppUser) => void;
    onNavigate: (view: ViewState) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated, onNavigate }) => {
    const [method, setMethod] = useState<'menu' | 'email' | 'forgotPassword'>('menu');
    const [isRegistering, setIsRegistering] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [resetEmail, setResetEmail] = useState('');
    const [resetSent, setResetSent] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError('');
        if (isRegistering && referralCode) {
            sessionStorage.setItem('pendingReferral', referralCode);
        }
        try {
            const firebaseUser = await signInWithGoogle();
            // For real Firebase users, onAuthStateChanged in App.tsx handles navigation.
            // No manual onAuthenticated call needed here.
            if (!firebaseUser) {
                // Popup was closed without signing in
                setError('');
                setIsLoading(false);
            }
        } catch (err: any) {
            console.error("Google Auth Error:", err);
            if (err.code === 'auth/popup-blocked') {
                setError('Popup was blocked. Please allow popups for this site, or use Email & Password instead.');
            } else if (err.code === 'auth/popup-closed-by-user') {
                setError(''); // User cancelled — not an error
            } else if (err.code === 'auth/network-request-failed') {
                setError('Network error. Check your connection and try again.');
            } else {
                setError('Google sign-in failed. Please try Email & Password.');
            }
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!resetEmail) { setError('Please enter your email address.'); return; }
        setIsLoading(true);
        setError('');
        try {
            await triggerPasswordReset(resetEmail);
            setResetSent(true);
        } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
                setError('No account found with this email.');
            } else {
                setError('Failed to send reset email. Try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };



    const handleEmailAuth = async () => {
        if (!email || !password) {
            setError("Please fill in all fields.");
            return;
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setIsLoading(true);
        setError('');

        if (isRegistering && referralCode) {
            sessionStorage.setItem('pendingReferral', referralCode);
        }

        try {
            let resultUser;
            if (isRegistering) {
                resultUser = await registerWithEmail(email, password);
            } else {
                resultUser = await loginWithEmail(email, password);
            }

            // Real Firebase users are handled by onAuthStateChanged in App.tsx.
            // We do NOT manually call onAuthenticated here to avoid double-trigger.
            // The listener in App.tsx will pick it up and navigate automatically.

        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError('This email is already registered. Please sign in instead.');
            } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError('Incorrect email or password. Please try again.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many failed attempts. Please reset your password or try again later.');
            } else if (err.code === 'auth/network-request-failed') {
                setError('Network error. Check your connection and try again.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. Use at least 6 characters.');
            } else {
                setError(`Authentication failed: ${err.message || 'Unknown error'}`);
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
                                
                                {isRegistering && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Referral Code (Optional)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="e.g. A93B2X1F"
                                                value={referralCode}
                                                onChange={(e) => setReferralCode(e.target.value)}
                                                className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 px-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors font-mono tracking-widest uppercase"
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setMethod('menu'); setError(''); }}
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

                            <div className="mt-4 flex flex-col items-center gap-2">
                                <button
                                    onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                                    className="text-xs text-gold-400 hover:text-white transition-colors font-medium underline-offset-4 hover:underline"
                                >
                                    {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                                </button>
                                {!isRegistering && (
                                    <button
                                        onClick={() => { setMethod('forgotPassword'); setError(''); setResetSent(false); setResetEmail(email); }}
                                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        Forgot password?
                                    </button>
                                )}
                            </div>

                        </motion.div>
                    )}

                    {/* FORGOT PASSWORD FLOW */}
                    {method === 'forgotPassword' && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                            <div className="text-center mb-6">
                                <KeyRound size={32} className="text-gold-400 mx-auto mb-3" />
                                <h3 className="text-white font-bold text-xl">Reset Password</h3>
                                <p className="text-xs text-slate-400 mt-1">We'll send a reset link to your email</p>
                            </div>

                            {resetSent ? (
                                <div className="flex flex-col items-center gap-3 py-4">
                                    <CheckCircle size={40} className="text-green-400" />
                                    <p className="text-white font-bold text-center">Reset email sent!</p>
                                    <p className="text-slate-400 text-xs text-center">Check your inbox and follow the instructions.</p>
                                    <button
                                        onClick={() => { setMethod('email'); setError(''); setIsRegistering(false); }}
                                        className="mt-3 text-gold-400 text-sm font-bold hover:text-white transition-colors"
                                    >
                                        Back to Sign In
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-4 mb-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-400" size={18} />
                                                <input
                                                    type="email"
                                                    placeholder="name@example.com"
                                                    value={resetEmail}
                                                    onChange={(e) => setResetEmail(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                                                    className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors font-sans"
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => { setMethod('email'); setError(''); }}
                                            className="px-4 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 transition-colors"
                                        >
                                            <ArrowLeft size={20} />
                                        </button>
                                        <button
                                            onClick={handleForgotPassword}
                                            disabled={isLoading}
                                            className="flex-1 bg-gold-500 text-black font-bold py-4 rounded-xl hover:bg-gold-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isLoading ? <span className="animate-pulse">Sending...</span> : 'Send Reset Link'}
                                        </button>
                                    </div>
                                </>
                            )}
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
