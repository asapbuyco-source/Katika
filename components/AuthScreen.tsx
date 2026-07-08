
import React, { useState } from 'react';
import { motion as originalMotion } from 'framer-motion';
import { ChevronRight, Lock, AlertTriangle, User, Mail, ArrowLeft, KeyRound, CheckCircle, Smartphone } from 'lucide-react';
import { signInWithGoogle, registerWithEmail, loginWithEmail, syncUserProfile, triggerPasswordReset } from '../services/firebase';
import { User as AppUser, ViewState } from '../types';
import { useLanguage } from '../services/i18n';

// Fix for Framer Motion type mismatches in current environment
const motion = originalMotion as any;

interface AuthScreenProps {
    onAuthenticated: (user?: AppUser) => void;
    onNavigate: (view: ViewState) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated, onNavigate }) => {
  const { t } = useLanguage();
  const [method, setMethod] = useState<'menu' | 'email' | 'forgotPassword'>('menu');
    const [isRegistering, setIsRegistering] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [resetEmail, setResetEmail] = useState('');
    const [resetSent, setResetSent] = useState(false);
    const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGoogleLogin = async () => {
        if (!eligibilityConfirmed) {
            setError(t('confirm_18_to_continue'));
            return;
        }
        setIsLoading(true);
        setError('');
        if (isRegistering && referralCode) {
            sessionStorage.setItem('pendingReferral', referralCode);
        }
        try {
            const firebaseUser = await signInWithGoogle();
            if (!firebaseUser) {
                setError('');
                setIsLoading(false);
            }
        } catch (err: any) {
            console.error("Google Auth Error:", err);
            if (err.code === 'auth/popup-blocked') {
                setError('Popup was blocked. Please allow popups for this site, or use Email & Password instead.');
            } else if (err.code === 'auth/popup-closed-by-user') {
                setError('');
            } else if (err.code === 'auth/network-request-failed') {
                setError('Network error. Check your connection and try again.');
            } else {
                setError('Google sign-in failed. Please try Email & Password.');
            }
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!resetEmail) { setError(t('fill_all_fields')); return; }
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
            setError(t('fill_all_fields'));
            return;
        }
        if (password.length < 6) {
            setError(t('password_min_6'));
            return;
        }
        if (isRegistering && !eligibilityConfirmed) {
            setError(t('confirm_18_to_create'));
            return;
        }
        const cleanPhone = phone.replace(/\D/g, '').replace(/^237/, '');
        if (isRegistering && !/^6\d{8}$/.test(cleanPhone)) {
            setError(t('valid_cam_phone'));
            return;
        }

        setIsLoading(true);
        setError('');

        if (isRegistering && referralCode) {
            sessionStorage.setItem('pendingReferral', referralCode);
        }
        if (isRegistering) {
            sessionStorage.setItem('pendingSignupPhone', cleanPhone);
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
                    <h1 className="text-3xl font-display font-bold text-white mb-2">{isRegistering ? t('create_account_title') : t('welcome_back')}</h1>
                    <p className="text-slate-400">{isRegistering ? t('join_arena') : t('secure_access')}</p>
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
                            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={eligibilityConfirmed}
                                    onChange={(e) => setEligibilityConfirmed(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 accent-gold-500"
                                />
                                <span>{t('confirm_18_plus')}</span>
                            </label>

                            {/* Standard Logins */}
                            <button
                                onClick={handleGoogleLogin}
                                disabled={isLoading}
                                className="w-full bg-white hover:bg-slate-100 text-royal-900 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3 relative group"
                            >
                                {isLoading ? (
                                    <span className="animate-pulse">{t('connecting')}</span>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                        </svg>
                                        <span>{t('continue_google')}</span>
                                        <ChevronRight size={18} className="absolute right-4 text-slate-400 group-hover:text-royal-900 transition-colors" />
                                    </>
                                )}
                            </button>

                            <div className="relative py-2">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-royal-900/80 px-2 text-slate-500">{t('or_email')}</span></div>
                            </div>

                            <button
                                onClick={() => setMethod('email')}
                                className="w-full bg-royal-800/50 hover:bg-royal-800 border border-white/10 text-white font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3 relative group"
                            >
                                <Mail size={20} className="text-gold-400" />
                                <span>{t('email_pass')}</span>
                                <ChevronRight size={18} className="absolute right-4 text-slate-400 group-hover:text-white transition-colors" />
                            </button>
                        </motion.div>
                    )}

                    {/* EMAIL / PASSWORD INPUT */}
                    {method === 'email' && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                            <div className="text-center mb-6">
                                <h3 className="text-white font-bold text-xl">{isRegistering ? t('create_account') : t('sign_in')}</h3>
                                <p className="text-xs text-slate-400">{t('enter_credentials')}</p>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('email_label')}</label>
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
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('pass_label')}</label>
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
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('momo_phone_number')}</label>
                                        <div className="relative">
                                            <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-400" size={18} />
                                            <input
                                                type="tel"
                                                inputMode="numeric"
                                                placeholder="6XXXXXXXX"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="w-full bg-royal-900/50 border border-royal-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors font-sans"
                                            />
                                        </div>
                                        <p className="mt-1 text-[11px] text-slate-500">{t('momo_phone_hint')}</p>
                                    </div>
                                )}
                                
                                {isRegistering && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('referral_code_optional')}</label>
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
                                    {isLoading ? <span className="animate-pulse">{t('processing')}</span> : <span>{isRegistering ? t('create_account') : t('sign_in')}</span>}
                                </button>
                            </div>

                            <div className="mt-4 flex flex-col items-center gap-2">
                                <button
                                    onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                                    className="text-xs text-gold-400 hover:text-white transition-colors font-medium underline-offset-4 hover:underline"
                                >
                                    {isRegistering ? t('already_have_account') : t('dont_have_account')}
                                </button>
                                {!isRegistering && (
                                    <button
                                        onClick={() => { setMethod('forgotPassword'); setError(''); setResetSent(false); setResetEmail(email); }}
                                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        {t('forgot_password')}
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
                                <h3 className="text-white font-bold text-xl">{t('reset_password_title')}</h3>
                                <p className="text-xs text-slate-400 mt-1">{t('we_send_link')}</p>
                            </div>

                            {resetSent ? (
                                <div className="flex flex-col items-center gap-3 py-4">
                                    <CheckCircle size={40} className="text-green-400" />
                                    <p className="text-white font-bold text-center">{t('reset_email_sent')}</p>
                                    <p className="text-slate-400 text-xs text-center">{t('check_inbox')}</p>
                                    <button
                                        onClick={() => { setMethod('email'); setError(''); setIsRegistering(false); }}
                                        className="mt-3 text-gold-400 text-sm font-bold hover:text-white transition-colors"
                                    >
                                        {t('back_sign_in')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-4 mb-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('email_label')}</label>
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
                                            {isLoading ? <span className="animate-pulse">{t('sending')}</span> : t('send_reset_link')}
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
