
import React, { useEffect, useRef, ReactNode, ErrorInfo, Component, lazy, Suspense, useCallback, useState } from 'react';
import { ViewState, Table, SocketGameState, GameAction } from '../types';
import { Navigation } from './Navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, AlertTriangle, RefreshCw, WifiOff, X, Smartphone, ChevronRight } from 'lucide-react';
import { LanguageProvider } from '../services/i18n';
import { ThemeProvider, useTheme } from '../services/theme';
import { AppStateProvider, useAppState } from '../services/AppContext';
import { SocketProvider, useSocket } from '../services/SocketContext';
import { ToastProvider, useToast } from '../services/toast';
import {
    auth, syncUserProfile, logout,
    subscribeToUser, subscribeToIncomingChallenges,
    respondToChallenge, getGame, subscribeToForum,
    reportTournamentMatchResult, setTournamentMatchActive,
    createBotMatch, db, getApiUrl
} from '../services/firebase';
import { playSFX } from '../services/sound';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Tournament } from '../types';
import { ChallengeRequestModal } from './ChallengeRequestModal';
import { useGameController } from '../hooks/useGameController.ts';
import { GameResultOverlay } from './GameResultOverlay';
import { Onboarding } from './Onboarding';
import { LiveWinFeed } from './LiveWinFeed';

// ─── Lazy-loaded route views ───────────────────────────────────────────────────
const LandingPage = lazy(() => import('./LandingPage').then(m => ({ default: m.LandingPage })));
const AuthScreen = lazy(() => import('./AuthScreen').then(m => ({ default: m.AuthScreen })));
const Dashboard = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })));
const Lobby = lazy(() => import('./Lobby').then(m => ({ default: m.Lobby })));
const MatchmakingScreen = lazy(() => import('./MatchmakingScreen').then(m => ({ default: m.MatchmakingScreen })));
const Tournaments = lazy(() => import('./Tournaments').then(m => ({ default: m.Tournaments })));
const Profile = lazy(() => import('./Profile').then(m => ({ default: m.Profile })));
const Finance = lazy(() => import('./Finance').then(m => ({ default: m.Finance })));
const AdminDashboard = lazy(() => import('./AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const HowItWorks = lazy(() => import('./HowItWorks').then(m => ({ default: m.HowItWorks })));
const HelpCenter = lazy(() => import('./HelpCenter').then(m => ({ default: m.HelpCenter })));
const ReportBug = lazy(() => import('./ReportBug').then(m => ({ default: m.ReportBug })));
const TermsOfService = lazy(() => import('./TermsOfService').then(m => ({ default: m.TermsOfService })));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const Forum = lazy(() => import('./Forum').then(m => ({ default: m.Forum })));
const GameRoom = lazy(() => import('./GameRoom').then(m => ({ default: m.GameRoom })));
const CheckersGame = lazy(() => import('./CheckersGame').then(m => ({ default: m.CheckersGame })));
const DiceGame = lazy(() => import('./DiceGame').then(m => ({ default: m.DiceGame })));
const ChessGame = lazy(() => import('./ChessGame').then(m => ({ default: m.ChessGame })));
const TicTacToeGame = lazy(() => import('./TicTacToeGame').then(m => ({ default: m.TicTacToeGame })));
const PoolGame = lazy(() => import('./PoolGame').then(m => ({ default: m.PoolGame })));

// ─── Full-screen spinner (used inside Suspense) ───────────────────────────────
const ViewLoader = () => (
    <div className="min-h-screen bg-royal-950 flex items-center justify-center">
        <Loader2 size={36} className="text-gold-500 animate-spin" />
    </div>
);

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface ErrorBoundaryProps { children?: ReactNode; onReset: () => void; }
interface ErrorBoundaryState { hasError: boolean; isChunkError: boolean; }

class GameErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, isChunkError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        // Detect ALL forms of chunk/module load failures:
        // - Chrome/Edge:  "Failed to fetch dynamically imported module: …"
        // - Webpack/Vite: "Loading chunk N failed"
        // - Legacy:       error.name === 'ChunkLoadError'
        const isChunkError =
            error.name === 'ChunkLoadError' ||
            /loading chunk/i.test(error.message) ||
            /failed to fetch dynamically imported module/i.test(error.message) ||
            /failed to load module script/i.test(error.message);

        if (isChunkError) {
            // Reload loop guard: only auto-reload up to 2 times per session.
            // If the JS assets are genuinely missing (broken deploy), reloading
            // infinitely harms users — show a "clear cache and retry" screen instead.
            const key = 'vantage_chunk_reload_count';
            const attempts = parseInt(sessionStorage.getItem(key) || '0', 10);
            if (attempts < 2) {
                sessionStorage.setItem(key, String(attempts + 1));
                window.location.reload();
            }
            // Max reloads hit — fall through to render the error UI below
        }
        return { hasError: true, isChunkError };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[GameErrorBoundary]', { error: error.message, stack: errorInfo.componentStack });
    }

    handleReset = () => {
        this.setState({ hasError: false, isChunkError: false });
        this.props.onReset();
    };

    render() {
        if (this.state.hasError && !this.state.isChunkError) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-royal-950">
                    <AlertTriangle size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Game Error</h2>
                    <p className="text-slate-400 mb-6">We apologize for the interruption.</p>
                    <button
                        onClick={this.handleReset}
                        className="px-6 py-3 bg-white/10 rounded-xl text-white font-bold hover:bg-white/20"
                    >
                        Return to Lobby
                    </button>
                </div>
            );
        }
        // ChunkLoadError: show spinner while reloading, or "Update available" after max retries
        if (this.state.hasError && this.state.isChunkError) {
            const attempts = parseInt(sessionStorage.getItem('vantage_chunk_reload_count') || '0', 10);
            const exhausted = attempts >= 2;
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-royal-950 gap-5 p-6 text-center">
                    {exhausted ? (
                        <>
                            <RefreshCw size={40} className="text-gold-500" />
                            <h2 className="text-xl font-bold text-white">Update Available</h2>
                            <p className="text-slate-400 text-sm max-w-xs">
                                A new version of Vantage was deployed. Clear your browser cache and reload to get the latest build.
                            </p>
                            <button
                                onClick={() => {
                                    sessionStorage.removeItem('vantage_chunk_reload_count');
                                    window.location.reload();
                                }}
                                className="px-6 py-3 bg-gold-500 rounded-xl text-black font-bold hover:bg-gold-400 transition-colors"
                            >
                                Reload Now
                            </button>
                        </>
                    ) : (
                        <>
                            <Loader2 size={36} className="text-gold-500 animate-spin" />
                            <p className="text-slate-400 text-sm">Loading update...</p>
                        </>
                    )}
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Reconnection Modal (opponent disconnected) ────────────────────────────────
const ReconnectionModal = ({ timeout, opponent }: { timeout: number; opponent?: any }) => {
    const [timeLeft, setTimeLeft] = React.useState(timeout);
    useEffect(() => {
        setTimeLeft(timeout);
        const timer = setInterval(() => setTimeLeft(prev => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(timer);
    }, [timeout]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-royal-900 border border-red-500 rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden shadow-2xl shadow-red-900/50"
            >
                <div className="absolute top-0 left-0 w-full h-1.5 bg-royal-800">
                    <motion.div
                        initial={{ width: '100%' }} animate={{ width: '0%' }}
                        transition={{ duration: timeout, ease: 'linear' }}
                        className="h-full bg-gradient-to-r from-red-600 to-red-400"
                    />
                </div>
                <div className="relative mb-6 inline-block">
                    <div className="w-24 h-24 rounded-full border-4 border-red-500 bg-royal-950 overflow-hidden relative">
                        <img src={opponent?.avatar || 'https://i.pravatar.cc/150?u=opp'} className="w-full h-full object-cover opacity-70 grayscale" alt="Opponent" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-royal-900 rounded-full p-2 border border-red-500 shadow-lg animate-bounce">
                        <WifiOff size={24} className="text-red-500" />
                    </div>
                </div>
                <h2 className="text-xl font-display font-bold text-white mb-2">Opponent Offline</h2>
                <p className="text-slate-300 text-sm mb-6">
                    <span className="text-gold-400 font-bold">{opponent?.name || 'Opponent'}</span> lost connection.
                </p>
                <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20 mb-6">
                    <p className="text-red-300 text-xs font-bold uppercase tracking-wider mb-1">Waiting for Reconnect</p>
                    <div className="text-4xl font-mono font-bold text-white tabular-nums">
                        {Math.floor(timeLeft / 60)}:{Math.floor(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">If they do not return, you will win by default.</p>
                </div>
                <div className="flex gap-2 justify-center items-center">
                    <Loader2 size={16} className="text-slate-500 animate-spin" />
                    <span className="text-xs text-slate-500 font-mono">Syncing Game State...</span>
                </div>
            </motion.div>
        </div>
    );
};

// ─── Weak Network Banner (non-blocking) ────────────────────────────────────────
// Replaces the old full-screen modal — shows a small fixed banner so the user
// can still use the app while the connection is being re-established.
const WeakNetworkBanner = ({ onReconnect }: { onReconnect: () => void }) => {
    const [dotCount, setDotCount] = React.useState(1);
    useEffect(() => {
        const d = setInterval(() => setDotCount(p => (p % 3) + 1), 600);
        return () => clearInterval(d);
    }, []);

    return (
        <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-[200] bg-yellow-900/95 backdrop-blur-sm border-t border-yellow-600/50 px-4 py-3 flex items-center justify-between gap-3"
        >
            <div className="flex items-center gap-2 min-w-0">
                <WifiOff size={16} className="text-yellow-400 shrink-0" />
                <span className="text-yellow-200 text-sm font-medium truncate">
                    Reconnecting{'.'.repeat(dotCount)}
                </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={onReconnect}
                    className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-royal-950 text-xs font-bold rounded-lg transition-colors"
                >
                    Retry
                </button>
                <button
                    onClick={() => window.location.reload()}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                >
                    <RefreshCw size={12} /> Reload
                </button>
            </div>
        </motion.div>
    );
};

// ─── Connection status badge (shown during initial cold-start wait) ────────────
const ConnectingBadge = ({ onBypass }: { onBypass: () => void }) => (
    <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-2 bg-royal-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg"
    >
        <Loader2 size={13} className="text-gold-500 animate-spin" />
        <span className="text-xs text-slate-300 font-medium">Connecting to server…</span>
        <button
            onClick={onBypass}
            className="text-xs text-slate-500 hover:text-white underline ml-1 transition-colors"
        >
            skip
        </button>
    </motion.div>
);

// ─── Motion helper ─────────────────────────────────────────────────────────────
const MV = ({ children, k }: { children: ReactNode; k: string }) => (
    <motion.div key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
        {children}
    </motion.div>
);


// ─── Google New-User Phone Collection Modal ────────────────────────────────────
// Shown after Google sign-in when no Firestore profile exists yet.
// Collects a Cameroon phone number so the same device+phone anti-abuse checks
// used for email signups apply, and the 100 FCFA welcome bonus can be granted.
interface GooglePhoneModalProps {
    googleUser: any;
    onSubmit: (phone: string) => Promise<void>;
    onSkip: () => Promise<void>;
    isLoading: boolean;
    error: string;
}
const GooglePhoneModal = ({ googleUser, onSubmit, onSkip, isLoading, error }: GooglePhoneModalProps) => {
    const [phone, setPhone] = React.useState('');
    const [localError, setLocalError] = React.useState('');

    const validateAndSubmit = async () => {
        const raw = phone.trim().replace(/\s+/g, '');
        const clean = raw.startsWith('+237') ? raw.slice(4) : raw.startsWith('237') ? raw.slice(3) : raw;
        if (!/^6\d{8}$/.test(clean)) {
            setLocalError('Enter a valid Cameroon number starting with 6 (e.g. 650 123 456)');
            return;
        }
        setLocalError('');
        await onSubmit(clean);
    };

    const displayName = googleUser?.displayName || 'there';
    const avatarUrl = googleUser?.photoURL || '';

    return (
        <motion.div
            key="google-phone-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        >
            <motion.div
                initial={{ scale: 0.92, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.92, y: 20, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="w-full max-w-sm bg-royal-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="relative bg-gradient-to-br from-royal-800 to-royal-900 px-6 pt-8 pb-6 text-center border-b border-white/10">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.08),transparent_60%)]" />
                    {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} className="w-16 h-16 rounded-full border-2 border-gold-400/50 mx-auto mb-3 object-cover" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-royal-800 border-2 border-gold-400/50 mx-auto mb-3 flex items-center justify-center">
                            <span className="text-2xl font-bold text-gold-400">{displayName.charAt(0).toUpperCase()}</span>
                        </div>
                    )}
                    <h2 className="text-lg font-display font-bold text-white relative">Welcome, {displayName.split(' ')[0]}!</h2>
                    <p className="text-slate-400 text-xs mt-1 relative">One last step to claim your welcome bonus</p>
                </div>

                {/* Bonus Banner */}
                <div className="mx-4 mt-4 bg-gradient-to-r from-gold-500/15 to-yellow-500/10 border border-gold-400/30 rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gold-500/20 flex items-center justify-center shrink-0">
                        <span className="text-xl">🎁</span>
                    </div>
                    <div>
                        <p className="text-gold-300 font-bold text-sm">100 FCFA Welcome Bonus</p>
                        <p className="text-slate-400 text-xs leading-snug">Add your phone to verify eligibility. One bonus per person.</p>
                    </div>
                </div>

                {/* Phone Input */}
                <div className="px-4 pt-4 pb-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        <Smartphone size={11} className="inline mr-1 -mt-0.5" />
                        Cameroon Phone Number
                    </label>
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-gold-400/50 transition-colors">
                        <span className="px-3 text-slate-400 text-sm font-mono border-r border-white/10 py-3 bg-white/5 shrink-0">+237</span>
                        <input
                            type="tel"
                            inputMode="numeric"
                            placeholder="6XX XXX XXX"
                            value={phone}
                            onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setLocalError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter' && !isLoading) validateAndSubmit(); }}
                            maxLength={9}
                            autoFocus
                            className="flex-1 bg-transparent px-3 py-3 text-white text-sm font-mono placeholder:text-slate-600 outline-none"
                        />
                    </div>
                    {(localError || error) && (
                        <p className="text-red-400 text-xs mt-2 flex items-start gap-1">
                            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                            {localError || error}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="px-4 pt-3 pb-6 flex flex-col gap-2">
                    <button
                        id="google-phone-claim-btn"
                        onClick={validateAndSubmit}
                        disabled={isLoading || !phone}
                        className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2
                            bg-gradient-to-r from-gold-500 to-yellow-500 text-royal-950
                            hover:from-gold-400 hover:to-yellow-400 active:scale-[0.98]
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        {isLoading ? (
                            <><Loader2 size={15} className="animate-spin" /> Verifying...</>
                        ) : (
                            <><ChevronRight size={15} /> Claim 100 FCFA Bonus</>
                        )}
                    </button>
                    <button
                        id="google-phone-skip-btn"
                        onClick={onSkip}
                        disabled={isLoading}
                        className="w-full py-2.5 rounded-xl text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                        Skip for now (no bonus)
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ─── AppContent — the main routing/logic shell ─────────────────────────────────
const AppContent = () => {
    const { state, dispatch, viewRef, lastForumMsgId } = useAppState();
    const { socket, isConnected, hasConnectedOnce, socketGame, bypassConnection, setBypassConnection, resetAll } = useSocket();
    const { theme } = useTheme();
    const toast = useToast();

    const { user, currentView, matchmakingConfig, authLoading, gameResult, rematchStatus, opponentDisconnected, opponentTimeout, preSelectedGame, incomingChallenge, unreadForum } = state;

    const {
        activeGameTable,
        isTransitioningRef,
        startMatchmaking,
        cancelMatchmaking,
        handleAcceptChallenge,
        handleMatchFound,
        handleGameEnd,
        finalizeGameEnd,
        handleRematchRequest,
        handleLogout,
        handleDashboardQuickMatch,
        handleTournamentMatchJoin,
        setView
    } = useGameController();

    // Rejoining State
    const [isRejoining, setIsRejoining] = React.useState(false);
    const [rejoinFailed, setRejoinFailed] = React.useState(false);

    // Google new-user phone collection — holds the Firebase user until phone is submitted
    const [pendingGoogleAuth, setPendingGoogleAuth] = useState<any>(null);
    const [googlePhoneLoading, setGooglePhoneLoading] = useState(false);
    const [googlePhoneError, setGooglePhoneError] = useState('');

    // Grace delay before showing "Connecting…" badge.
    // Only shown when a logged-in user hasn't connected yet after 5s.
    // Does NOT block navigation — it's a non-intrusive top badge.
    const [showConnectingBadge, setShowConnectingBadge] = React.useState(false);
    const badgeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!isConnected && !hasConnectedOnce && user && !bypassConnection) {
            badgeTimerRef.current = setTimeout(() => setShowConnectingBadge(true), 5000);
        } else {
            if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
            setShowConnectingBadge(false);
        }
        return () => { if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current); };
    }, [isConnected, hasConnectedOnce, user, bypassConnection]);

    // ── Complete Google sign-up after phone is collected ──────────────────
    // Stores phone in sessionStorage (where syncUserProfile reads it from),
    // then runs the normal profile-sync + subscription setup. The existing
    // /api/auth/sync-profile endpoint applies all device+phone uniqueness checks.
    const completeGoogleSignup = useCallback(async (phone: string) => {
        if (!pendingGoogleAuth) return;
        setGooglePhoneLoading(true);
        setGooglePhoneError('');
        try {
            // Store phone so syncUserProfile picks it up (same path as email signup)
            sessionStorage.setItem('pendingSignupPhone', phone);
            const appUser = await syncUserProfile(pendingGoogleAuth);
            dispatch({ type: 'SET_USER', payload: appUser });
            prevUserIdRef.current = appUser.id;

            // Show bonus notification
            if (appUser.welcomeBonusStatus === 'granted') {
                toast.success('Welcome bonus added: 100 FCFA! 🎉');
            } else if (appUser.welcomeBonusStatus === 'device_already_claimed') {
                toast.info('This device has already received the 100 FCFA bonus on another account.', { duration: 10000 });
            } else if (appUser.welcomeBonusStatus === 'phone_already_claimed') {
                toast.info('This phone number has already received the 100 FCFA bonus on another account.', { duration: 10000 });
            }

            // Device verification (fire-and-forget, same as normal flow)
            let deviceId = localStorage.getItem('vantage_device_id');
            if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem('vantage_device_id', deviceId); }
            pendingGoogleAuth.getIdToken().then((token: string) => {
                fetch(`${getApiUrl()}/api/auth/verify-device`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ userId: appUser.id, deviceId })
                }).then(async r => {
                    if (!r.ok) return null;
                    const ct = r.headers.get('content-type') || '';
                    return ct.includes('application/json') ? r.json() : null;
                }).then(data => {
                    if (data?.status === 'warning') toast.warning(data.message, { duration: 10000 });
                    if (data?.status === 'banned') toast.error(data.message, { duration: 10000 });
                }).catch(console.error);
            });

            // Start Firestore subscriptions
            firestoreUnsubRef.current.user = subscribeToUser(appUser.id, updated => dispatch({ type: 'SET_USER', payload: updated }));
            setTimeout(() => {
                if (prevUserIdRef.current === appUser.id)
                    firestoreUnsubRef.current.challenges = subscribeToIncomingChallenges(appUser.id, c => dispatch({ type: 'SET_INCOMING_CHALLENGE', payload: c }));
            }, 200);
            setTimeout(() => {
                if (prevUserIdRef.current === appUser.id)
                    firestoreUnsubRef.current.forum = subscribeToForum(posts => {
                        if (posts.length > 0) {
                            const lid = posts[0].id;
                            if (lastForumMsgId.current && lastForumMsgId.current !== lid && viewRef.current !== 'forum') {
                                dispatch({ type: 'SET_UNREAD_FORUM', payload: true });
                                playSFX('notification');
                            }
                            lastForumMsgId.current = lid;
                        }
                    });
            }, 500);

            setPendingGoogleAuth(null);
        } catch (err: any) {
            console.error('[Auth] Google phone signup failed:', err);
            setGooglePhoneError(err.message || 'Could not complete sign-up. Please try again.');
            sessionStorage.removeItem('pendingSignupPhone');
        } finally {
            setGooglePhoneLoading(false);
        }
    }, [pendingGoogleAuth, dispatch, toast, lastForumMsgId, viewRef]);

    // Skip phone — proceed without bonus (user gets balance:0, can add phone later via profile)
    const skipGooglePhone = useCallback(async () => {
        if (!pendingGoogleAuth) return;
        setGooglePhoneLoading(true);
        try {
            // No phone stored — syncUserProfile sends phone:'' → server gives welcomeBonusStatus:'not_granted'
            const appUser = await syncUserProfile(pendingGoogleAuth);
            dispatch({ type: 'SET_USER', payload: appUser });
            prevUserIdRef.current = appUser.id;
            let deviceId = localStorage.getItem('vantage_device_id');
            if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem('vantage_device_id', deviceId); }
            firestoreUnsubRef.current.user = subscribeToUser(appUser.id, updated => dispatch({ type: 'SET_USER', payload: updated }));
            setTimeout(() => {
                if (prevUserIdRef.current === appUser.id)
                    firestoreUnsubRef.current.challenges = subscribeToIncomingChallenges(appUser.id, c => dispatch({ type: 'SET_INCOMING_CHALLENGE', payload: c }));
            }, 200);
            setPendingGoogleAuth(null);
        } catch (err: any) {
            console.error('[Auth] Google skip phone failed:', err);
            setGooglePhoneError(err.message || 'Could not complete sign-up. Please try again.');
        } finally {
            setGooglePhoneLoading(false);
        }
    }, [pendingGoogleAuth, dispatch]);

    useEffect(() => {
        const storedRoom = sessionStorage.getItem('vantage_active_room');
        if (storedRoom && !socketGame && isConnected) {
            setIsRejoining(true);
            setRejoinFailed(false);
            // NET-6: Use acknowledgement callback to resolve early, with 12s fallback
            const timer = setTimeout(() => {
                if (!socketGame) {
                    setRejoinFailed(true);
                }
            }, 12000);
            return () => clearTimeout(timer);
        } else if (socketGame) {
            setIsRejoining(false);
            setRejoinFailed(false);
        }
    }, [socketGame, isConnected]);

    // ── Apply Theme CSS Variables ────────────────────────────────────────────
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.style.setProperty('--c-royal-950', '15 10 31');
            root.style.setProperty('--c-royal-900', '26 16 60');
            root.style.setProperty('--c-royal-800', '45 27 105');
            root.style.setProperty('--c-text-white', '255 255 255');
            root.style.setProperty('--c-text-base', '226 232 240');
        } else {
            root.style.setProperty('--c-royal-950', '248 250 252');
            root.style.setProperty('--c-royal-900', '255 255 255');
            root.style.setProperty('--c-royal-800', '226 232 240');
            root.style.setProperty('--c-text-white', '15 23 42');
            root.style.setProperty('--c-text-base', '51 65 85');
        }
    }, [theme]);

    useEffect(() => {
        if (currentView === 'forum') dispatch({ type: 'SET_UNREAD_FORUM', payload: false });
        const container = document.getElementById('main-scroll-container');
        setTimeout(() => {
            container ? container.scrollTo({ top: 0, behavior: 'instant' }) : window.scrollTo(0, 0);
        }, 50);
    }, [currentView, dispatch]);

    // ── Global socket listeners (bonuses, etc.) ──────────────────────────────
    // Use a ref so handlers always see the latest user without re-registering
    // the socket event every time user.balance changes (which caused double-shows).
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);

    useEffect(() => {
        if (!socket) return;

        const handleDailyBonus = (data: { amount: number; message?: string }) => {
            playSFX('win');
            toast.success(`🎁 Daily First Win Bonus: +${data.amount} FCFA!`);
            if (userRef.current) {
                dispatch({ type: 'UPDATE_USER', payload: { promoBalance: (userRef.current as any).promoBalance + data.amount } });
            }
        };

        const handleStreakBonus = (data: { streak: number; amount: number }) => {
            playSFX('notification');
            toast.success(`🔥 Login Streak x${data.streak}! +${data.amount} FCFA unlocked!`);
            if (userRef.current) {
                dispatch({ type: 'UPDATE_USER', payload: { promoBalance: (userRef.current as any).promoBalance + data.amount } });
            }
        };

        socket.on('daily_bonus', handleDailyBonus);
        socket.on('streak_bonus', handleStreakBonus);

        return () => {
            socket.off('daily_bonus', handleDailyBonus);
            socket.off('streak_bonus', handleStreakBonus);
        };
    }, [socket, dispatch, toast]); // ← no 'user': avoids re-registering on every balance change

    // ─── EFFECTS ────────────────────────────────────────────────────────────────
    // Escape key handler removed (Bug M1 fix): it was clearing
    // SET_GAME_RESULT without calling finalizeGameEnd, leaving the
    // app stuck in 'game' view with no active game.

    // ── Auth listener ────────────────────────────────────────────────────────
    // BUG-S4 fix: Track whether Firestore subscriptions are already active.
    // Only re-subscribe if the user UID changes, not on token refresh.
    const firestoreUnsubRef = useRef<{ user?: () => void; challenges?: () => void; forum?: () => void }>({});
    const prevUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            const currentUid = firebaseUser?.uid ?? null;

            // Only re-subscribe if the UID actually changed (not on token refresh)
            if (currentUid === prevUserIdRef.current) {
                dispatch({ type: 'SET_AUTH_LOADING', payload: false });
                return;
            }

            // Clean up previous subscriptions if UID is changing
            if (prevUserIdRef.current !== null && currentUid !== prevUserIdRef.current) {
                firestoreUnsubRef.current.user?.();
                firestoreUnsubRef.current.challenges?.();
                firestoreUnsubRef.current.forum?.();
            }

            if (firebaseUser) {
                try {
                    // ── Google new-user intercept ─────────────────────────────────────
                    // For new Google sign-ups: collect phone BEFORE creating the profile
                    // so the same device+phone anti-abuse checks apply (same as email).
                    // We use Firestore existence as the reliable new-user signal.
                    const isGoogleProvider = firebaseUser.providerData?.[0]?.providerId === 'google.com';
                    const phoneAlreadyPending = !!sessionStorage.getItem('pendingSignupPhone');
                    if (isGoogleProvider && !phoneAlreadyPending) {
                        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
                        if (!userSnap.exists()) {
                            // New Google user — show phone modal; don't create profile yet
                            setPendingGoogleAuth(firebaseUser);
                            prevUserIdRef.current = firebaseUser.uid; // prevent re-trigger on token refresh
                            dispatch({ type: 'SET_AUTH_LOADING', payload: false });
                            return;
                        }
                    }
                    // ── Normal profile sync (email users + returning Google users) ────
                    const appUser = await syncUserProfile(firebaseUser);
                    dispatch({ type: 'SET_USER', payload: appUser });
                    prevUserIdRef.current = appUser.id;
                    if (appUser.welcomeBonusStatus === 'granted') {
                        toast.success('Welcome bonus added: 100 FCFA.');
                    } else if (appUser.welcomeBonusStatus === 'device_already_claimed') {
                        toast.info('This device has already received the 100 FCFA new account bonus on another account.', { duration: 10000 });
                    } else if (appUser.welcomeBonusStatus === 'phone_already_claimed') {
                        toast.info('This phone number has already received the 100 FCFA new account bonus on another account.', { duration: 10000 });
                    }

                    // --- DEVICE VERIFICATION (Multi-Account check) ---
                    let deviceId = localStorage.getItem('vantage_device_id');
                    if (!deviceId) {
                        deviceId = crypto.randomUUID();
                        localStorage.setItem('vantage_device_id', deviceId);
                    }
                    firebaseUser.getIdToken().then(token => {
                        fetch(`${getApiUrl()}/api/auth/verify-device`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ userId: appUser.id, deviceId })
                        }).then(async r => {
                            if (!r.ok) return null;
                            const contentType = r.headers.get('content-type') || '';
                            if (!contentType.includes('application/json')) return null;
                            return r.json();
                        }).then(data => {
                            if (!data) return;
                            if (data.status === 'warning') {
                                toast.warning(data.message, { duration: 10000 });
                            } else if (data.status === 'banned') {
                                toast.error(data.message, { duration: 10000 });
                            }
                        }).catch(console.error);
                    });

                    // NET-5: Stagger subscription restart: user → 0ms, challenges → 200ms, forum → 500ms
                    firestoreUnsubRef.current.user = subscribeToUser(appUser.id, updated => dispatch({ type: 'SET_USER', payload: updated }));

                    setTimeout(() => {
                        if (prevUserIdRef.current === appUser.id) {
                            firestoreUnsubRef.current.challenges = subscribeToIncomingChallenges(appUser.id, challenge => dispatch({ type: 'SET_INCOMING_CHALLENGE', payload: challenge }));
                        }
                    }, 200);

                    setTimeout(() => {
                        if (prevUserIdRef.current === appUser.id) {
                            firestoreUnsubRef.current.forum = subscribeToForum(posts => {
                                if (posts.length > 0) {
                                    const latestId = posts[0].id;
                                    if (lastForumMsgId.current && lastForumMsgId.current !== latestId && viewRef.current !== 'forum') {
                                        dispatch({ type: 'SET_UNREAD_FORUM', payload: true });
                                        playSFX('notification');
                                    }
                                    lastForumMsgId.current = latestId;
                                }
                            });
                        }
                    }, 500);
                } catch (error) {
                    console.error('[Auth] Profile sync failed:', error);
                }
            } else {
                firestoreUnsubRef.current.user?.();
                firestoreUnsubRef.current.challenges?.();
                firestoreUnsubRef.current.forum?.();
                prevUserIdRef.current = null;
                dispatch({ type: 'SET_USER', payload: null });
            }
            dispatch({ type: 'SET_AUTH_LOADING', payload: false });
        });

        return () => {
            unsubAuth();
            firestoreUnsubRef.current.user?.();
            firestoreUnsubRef.current.challenges?.();
            firestoreUnsubRef.current.forum?.();
        };
    }, [dispatch, lastForumMsgId, viewRef]);

    // ── Auth-based navigation ─────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading || pendingGoogleAuth) return;
        if (user) {
            // FIX M2 + M5: Check if user was in an active game before page refresh
            const activeTournamentMatch = localStorage.getItem('vantage_active_tournament_match');
            if (activeTournamentMatch && currentView === 'dashboard') {
                // Restore tournament match
                dispatch({ type: 'SET_PRE_SELECTED_GAME', payload: activeTournamentMatch.split('-')[1] });
                dispatch({ type: 'SET_VIEW', payload: 'tournaments' });
                return;
            }

            // Auto-navigate to appropriate view on first auth
            if (currentView === 'landing' || currentView === 'auth') {
                dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
            }
        } else {
            const publicViews: ViewState[] = ['landing', 'auth', 'how-it-works', 'terms', 'privacy', 'help-center', 'report-bug'];
            if (!publicViews.includes(currentView)) dispatch({ type: 'SET_VIEW', payload: 'landing' });
        }
    }, [user, currentView, authLoading, dispatch, pendingGoogleAuth]);

    // ── Warn before closing mid-game ────────────────────────────────────────
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (currentView === 'game' && socketGame && !gameResult) {
                e.preventDefault();
                e.returnValue = 'You have an active game!';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [currentView, socketGame, gameResult]);


    // ── Safety guard: if view is 'game' but no table exists (e.g. after page
    // refresh or stale state), redirect to lobby immediately ───────────────
    useEffect(() => {
        // UX-2 Fix: Auto-redirect from ghost "Finalizing" state after 3s if no result appears
        if (currentView === 'game' && !activeGameTable && !gameResult) {
            const timer = setTimeout(() => {
                isTransitioningRef.current = false;
                dispatch({ type: 'SET_VIEW', payload: 'lobby' });
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [currentView, activeGameTable, gameResult, dispatch]);

    // ── Clear game result when navigating away from game ───────────────
    useEffect(() => {
        if (gameResult && currentView !== 'game') {
            dispatch({ type: 'SET_GAME_RESULT', payload: null });
        }
    }, [gameResult, currentView, dispatch]);

    // ── Find opponent for reconnection modal ─────────────────────────────────
    let opponentProfile = null;
    if (socketGame && user && socketGame.profiles) {
        const oppId = socketGame.players.find(id => id !== user.id);
        if (oppId) opponentProfile = socketGame.profiles[oppId];
    }

    // ── Loading screens ───────────────────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="min-h-screen bg-royal-950 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }


    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-royal-950 text-white font-sans overflow-x-hidden transition-colors duration-500 relative">
            {/* Cinematic Background Atmosphere */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full bg-royal-700/20 blur-[120px] mix-blend-screen"></div>
                <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-gold-600/5 blur-[150px] mix-blend-screen"></div>
            </div>

            {user && currentView !== 'game' && currentView !== 'matchmaking' && (
                <Navigation currentView={currentView} setView={setView} user={user} hasUnreadMessages={unreadForum} />
            )}
            {/* Global live win feed — visible on dashboard, lobby, not during games */}
            {user && !['game', 'matchmaking', 'auth', 'landing'].includes(currentView) && (
                <LiveWinFeed />
            )}

            {isRejoining && (
                <div className="fixed inset-0 z-[200] bg-royal-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center"
                    >
                        {!rejoinFailed ? (
                            <>
                                <div className="relative mb-6">
                                    <div className="absolute inset-0 bg-gold-500/20 blur-2xl rounded-full animate-pulse"></div>
                                    <Loader2 className="w-16 h-16 text-gold-500 animate-spin relative z-10" />
                                </div>
                                <h2 className="text-2xl font-black text-white mb-2 tracking-tighter uppercase">Resuming Match</h2>
                                <p className="text-slate-400 text-sm max-w-xs">Wait a moment while we reconnect you to your active game session...</p>
                            </>
                        ) : (
                            <>
                                <div className="relative mb-6">
                                    <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center border border-red-500/50">
                                        <X size={32} />
                                    </div>
                                </div>
                                <h2 className="text-2xl font-black text-white mb-2 tracking-tighter uppercase">Room Expired</h2>
                                <p className="text-slate-400 text-sm max-w-xs mb-6">The match may have ended while you were disconnected.</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            sessionStorage.removeItem('vantage_active_room');
                                            setIsRejoining(false);
                                            dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
                                        }}
                                        className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-bold tracking-wide"
                                    >
                                        Return to Dashboard
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}

            <main id="main-scroll-container" className="flex-1 relative w-full h-screen overflow-y-auto">
                <GameErrorBoundary onReset={() => { resetAll(); dispatch({ type: 'SET_VIEW', payload: user ? 'dashboard' : 'landing' }); }}>
                    <Suspense fallback={<ViewLoader />}>
                        <AnimatePresence>
                            {currentView === 'landing' && <MV k="landing">    <LandingPage onLogin={() => setView('auth')} onNavigate={setView} /></MV>}
                            {currentView === 'auth' && <MV k="auth">       <AuthScreen onAuthenticated={u => dispatch({ type: 'SET_USER', payload: u || null })} onNavigate={setView} /></MV>}
                            {currentView === 'dashboard' && user && <MV k="dashboard">  <Dashboard user={user} setView={setView} onTopUp={() => setView('finance')} onQuickMatch={handleDashboardQuickMatch} onSoloPlay={() => handleDashboardQuickMatch()} /></MV>}
                            {currentView === 'lobby' && user && <MV k="lobby">      <Lobby user={user} setView={setView} onQuickMatch={startMatchmaking} initialGameId={preSelectedGame} onClearInitialGame={() => dispatch({ type: 'SET_PRE_SELECTED_GAME', payload: null })} /></MV>}
                            {currentView === 'matchmaking' && matchmakingConfig && user && (
                                <MV k="matchmaking">
                                    <MatchmakingScreen user={user} gameType={matchmakingConfig.gameType} stake={matchmakingConfig.stake} onMatchFound={handleMatchFound} onCancel={cancelMatchmaking} isSocketMode={matchmakingConfig.stake !== -1} isTournament={matchmakingConfig.isTournament} />
                                </MV>
                            )}
                            {currentView === 'tournaments' && user && <MV k="tournaments"><Tournaments user={user} onJoinMatch={handleTournamentMatchJoin} socket={socket} pendingTournamentId={preSelectedGame} onClearPendingTournament={() => dispatch({ type: 'SET_PRE_SELECTED_GAME', payload: null })} /></MV>}
                            {currentView === 'game' && user && (
                                <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[50] w-full h-full overflow-hidden bg-royal-950">
                                    {activeGameTable ? (
                                        <>
                                            {activeGameTable.gameType === 'Checkers' ? <CheckersGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                                                activeGameTable.gameType === 'Dice' ? <DiceGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                                                    activeGameTable.gameType === 'Chess' ? <ChessGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                                                        activeGameTable.gameType === 'TicTacToe' ? <TicTacToeGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                                                            activeGameTable.gameType === 'Pool' ? <PoolGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                                                                activeGameTable.gameType === 'Ludo' ? <GameRoom table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                                                                    <div className="flex items-center justify-center h-full text-2xl font-bold text-slate-500">Game Mode Not Available</div>}
                                        </>
                                    ) : (
                                        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-royal-950 z-[45]">
                                            <Loader2 className="w-8 h-8 text-gold-500 animate-spin" />
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Finalizing Match Result...</p>
                                            <p className="text-slate-600 text-xs">Returning to lobby shortly...</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                            {currentView === 'profile' && user && <MV k="profile">     <Profile user={user} onLogout={handleLogout} onUpdateProfile={u => dispatch({ type: 'UPDATE_USER', payload: u })} onNavigate={setView} /></MV>}
                            {currentView === 'finance' && user && <MV k="finance">     <Finance user={user} onTopUp={(newBalance?: number) => { if (newBalance !== undefined) dispatch({ type: 'UPDATE_USER', payload: { balance: newBalance } }); }} /></MV>}
                            {currentView === 'how-it-works' && <MV k="how-it-works"><HowItWorks onBack={() => setView('landing')} onLogin={() => setView('auth')} /></MV>}
                            {currentView === 'admin' && user?.isAdmin && <MV k="admin"><AdminDashboard user={user} /></MV>}
                            {currentView === 'help-center' && <MV k="help-center"><HelpCenter onBack={() => setView(user ? 'profile' : 'landing')} /></MV>}
                            {currentView === 'report-bug' && <MV k="report-bug"> <ReportBug onBack={() => setView(user ? 'profile' : 'landing')} /></MV>}
                            {currentView === 'terms' && <MV k="terms">      <TermsOfService onBack={() => setView(user ? 'profile' : 'landing')} /></MV>}
                            {currentView === 'privacy' && <MV k="privacy">    <PrivacyPolicy onBack={() => setView(user ? 'profile' : 'landing')} /></MV>}
                            {currentView === 'forum' && user && <MV k="forum">       <Forum user={user} /></MV>}
                            {!['landing', 'auth', 'dashboard', 'lobby', 'matchmaking', 'game', 'profile', 'finance', 'how-it-works', 'admin', 'help-center', 'report-bug', 'terms', 'privacy', 'forum', 'tournaments', 'settings'].includes(currentView) && (
                                <MV k="not-found">
                                    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
                                        <AlertTriangle size={48} className="text-gold-500 mb-4" />
                                        <h2 className="text-2xl font-bold text-white mb-2">Page Not Found</h2>
                                        <button onClick={() => setView(user ? 'dashboard' : 'landing')} className="mt-4 px-6 py-3 bg-gold-500 text-royal-950 font-bold rounded-xl">Go Home</button>
                                    </div>
                                </MV>
                            )}
                        </AnimatePresence>
                    </Suspense>
                </GameErrorBoundary>
            </main>

            <AnimatePresence>
                {user && user.hasSeenOnboarding === false && currentView !== 'game' && currentView !== 'matchmaking' && (
                    <Onboarding
                        user={user}
                        onComplete={() => dispatch({ type: 'UPDATE_USER', payload: { hasSeenOnboarding: true } })}
                    />
                )}
                {/* Non-blocking connection status indicators */}
                {showConnectingBadge && !isConnected && !hasConnectedOnce && user && !bypassConnection && (
                    <ConnectingBadge onBypass={() => setBypassConnection(true)} />
                )}
                {user && !isConnected && hasConnectedOnce && currentView !== 'game' && (
                    <WeakNetworkBanner onReconnect={() => socket?.connect()} />
                )}
                {gameResult && (
                    <GameResultOverlay
                        result={gameResult.result}
                        amount={gameResult.amount}
                        financials={gameResult.financials}
                        onContinue={finalizeGameEnd}
                        onRematch={socketGame && isConnected && !activeGameTable?.tournamentMatchId ? handleRematchRequest : undefined}
                        rematchStatus={rematchStatus}
                        stake={socketGame?.stake}
                        userBalance={user?.balance}
                        isTournament={!!activeGameTable?.tournamentMatchId}
                        tournamentPot={gameResult.tournamentPot}
                    />
                )}
                {incomingChallenge && (
                    <ChallengeRequestModal
                        challenge={incomingChallenge}
                        onAccept={handleAcceptChallenge}
                        onDecline={async () => {
                            if (incomingChallenge) await respondToChallenge(incomingChallenge.id, 'declined');
                            dispatch({ type: 'SET_INCOMING_CHALLENGE', payload: null });
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
// ─── Root export — full provider stack ────────────────────────────────────────
export default function App() {
    return (
        <LanguageProvider>
            <ThemeProvider>
                <AppStateProvider>
                    {/* ToastProvider MUST wrap SocketProvider — SocketContext calls useToast() */}
                    <ToastProvider>
                        <SocketProvider>
                            <AppContent />
                        </SocketProvider>
                    </ToastProvider>
                </AppStateProvider>
            </ThemeProvider>
        </LanguageProvider>
    );
}
