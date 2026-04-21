
import React, { useEffect, useRef, ReactNode, ErrorInfo, Component, lazy, Suspense, useCallback, useState } from 'react';
import { ViewState, Table, SocketGameState, GameAction } from '../types';
import { Navigation } from './Navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, AlertTriangle, RefreshCw, WifiOff, X } from 'lucide-react';
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
    createBotMatch, createChallengeGame, db
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
interface ErrorBoundaryState { hasError: boolean; }

class GameErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[GameErrorBoundary]', { error: error.message, stack: errorInfo.componentStack });
    }

    handleReset = () => {
        this.setState({ hasError: false });
        this.props.onReset();
    };

    render() {
        if (this.state.hasError) {
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

// ─── Weak Network Modal ────────────────────────────────────────────────────────
const WeakNetworkModal = ({ onReconnect }: { onReconnect: () => void }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl">
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-royal-900 border border-yellow-500 rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden shadow-2xl shadow-yellow-900/50"
        >
            <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-yellow-500/30">
                <WifiOff size={40} className="text-yellow-500" />
            </div>
            <h2 className="text-xl font-display font-bold text-white mb-2">Connection Lost</h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                Your device has lost connection to the server.<br />
                <span className="text-yellow-400 font-bold">Please check your internet.</span>
            </p>
            <div className="space-y-3">
                <button
                    onClick={() => window.location.reload()}
                    className="w-full py-3.5 bg-yellow-500 hover:bg-yellow-400 text-royal-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    <RefreshCw size={18} /> Refresh Page
                </button>
                <button
                    onClick={onReconnect}
                    className="w-full py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors"
                >
                    Try Reconnecting
                </button>
            </div>
        </motion.div>
    </div>
);

// ─── Motion helper ─────────────────────────────────────────────────────────────
const MV = ({ children, k }: { children: ReactNode; k: string }) => (
    <motion.div key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
        {children}
    </motion.div>
);

// ─── AppContent — the main routing/logic shell ─────────────────────────────────
const AppContent = () => {
    const { state, dispatch, viewRef, lastForumMsgId } = useAppState();
    const { socket, isConnected, hasConnectedOnce, socketGame, bypassConnection, setBypassConnection } = useSocket();
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

    useEffect(() => {
        const storedRoom = sessionStorage.getItem('vantage_active_room');
        if (storedRoom && !socketGame && isConnected) {
            setIsRejoining(true);
            setRejoinFailed(false);
            const timer = setTimeout(() => {
                 if (!socketGame) {
                     setRejoinFailed(true);
                 }
            }, 5000); // Timeout fallback
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
    useEffect(() => {
        if (!socket) return;
        
        const handleDailyBonus = (data: { amount: number; message?: string }) => {
            playSFX('win');
            toast.success(`🎁 Daily First Win Bonus: +${data.amount} FCFA!`);
            if (user) {
                dispatch({ type: 'UPDATE_USER', payload: { balance: user.balance + data.amount } });
            }
        };

        const handleStreakBonus = (data: { streak: number; amount: number }) => {
            playSFX('notification');
            toast.success(`🔥 Login Streak x${data.streak}! +${data.amount} FCFA unlocked!`);
            if (user) {
                dispatch({ type: 'UPDATE_USER', payload: { balance: user.balance + data.amount } });
            }
        };

        socket.on('daily_bonus', handleDailyBonus);
        socket.on('streak_bonus', handleStreakBonus);

        return () => {
            socket.off('daily_bonus', handleDailyBonus);
            socket.off('streak_bonus', handleStreakBonus);
        };
    }, [socket, user, dispatch, toast]);

    // ─── EFFECTS ────────────────────────────────────────────────────────────────
    // Escape key handler removed (Bug M1 fix): it was clearing
    // SET_GAME_RESULT without calling finalizeGameEnd, leaving the
    // app stuck in 'game' view with no active game.

    // ── Auth listener ────────────────────────────────────────────────────────
    useEffect(() => {
        let unsubUser: (() => void) | undefined;
        let unsubChallenges: (() => void) | undefined;
        let unsubForum: (() => void) | undefined;

        const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    const appUser = await syncUserProfile(firebaseUser);
                    dispatch({ type: 'SET_USER', payload: appUser });

                    unsubUser = subscribeToUser(appUser.id, updated => dispatch({ type: 'SET_USER', payload: updated }));
                    unsubChallenges = subscribeToIncomingChallenges(appUser.id, challenge => dispatch({ type: 'SET_INCOMING_CHALLENGE', payload: challenge }));
                    unsubForum = subscribeToForum(posts => {
                        if (posts.length > 0) {
                            const latestId = posts[0].id;
                            if (lastForumMsgId.current && lastForumMsgId.current !== latestId && viewRef.current !== 'forum') {
                                dispatch({ type: 'SET_UNREAD_FORUM', payload: true });
                                playSFX('notification');
                            }
                            lastForumMsgId.current = latestId;
                        }
                    });
                } catch (error) {
                    console.error('[Auth] Profile sync failed:', error);
                }
            } else {
                unsubUser?.();
                unsubChallenges?.();
                unsubForum?.();
                dispatch({ type: 'SET_USER', payload: null });
            }
            dispatch({ type: 'SET_AUTH_LOADING', payload: false });
        });

        return () => {
            unsubAuth();
            unsubUser?.();
            unsubChallenges?.();
            unsubForum?.();
        };
    }, [dispatch, lastForumMsgId, viewRef]);

    // ── Auth-based navigation ─────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading) return;
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
    }, [user, currentView, authLoading, dispatch]);

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
        if (isTransitioningRef.current) return;
        if (currentView === 'game' && !activeGameTable && !gameResult) {
            dispatch({ type: 'SET_VIEW', payload: 'lobby' });
        }
    }, [currentView, activeGameTable, gameResult, dispatch]);

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

    if (!isConnected && !hasConnectedOnce && user && !bypassConnection) {
        return (
            <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center gap-4">
                <Loader2 size={48} className="text-gold-500 animate-spin" />
                <h2 className="text-xl font-bold text-white">Connecting to Vantage Network...</h2>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => { socket?.connect(); }}
                        className="px-6 py-2 bg-royal-800 border border-white/10 rounded-lg text-white font-bold hover:bg-royal-700 transition-colors flex items-center justify-center gap-2"
                        aria-label="Retry connection"
                    >
                        <RefreshCw size={16} /> Retry Connection
                    </button>
                    <button
                        onClick={() => setBypassConnection(true)}
                        className="text-white/50 hover:text-white text-sm underline mt-2"
                    >
                        Play Offline
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-royal-950 text-white font-sans overflow-x-hidden transition-colors duration-500">
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
                <GameErrorBoundary onReset={() => { dispatch({ type: 'RESET_GAME_STATE' }); dispatch({ type: 'SET_VIEW', payload: user ? 'dashboard' : 'landing' }); }}>
                    <Suspense fallback={<ViewLoader />}>
                        <AnimatePresence>
                            {currentView === 'landing' && <MV k="landing">    <LandingPage onLogin={() => setView('auth')} onNavigate={setView} /></MV>}
                            {currentView === 'auth' && <MV k="auth">       <AuthScreen onAuthenticated={u => dispatch({ type: 'SET_USER', payload: u || null })} onNavigate={setView} /></MV>}
                            {currentView === 'dashboard' && user && <MV k="dashboard">  <Dashboard user={user} setView={setView} onTopUp={() => setView('finance')} onQuickMatch={handleDashboardQuickMatch} /></MV>}
                            {currentView === 'lobby' && user && <MV k="lobby">      <Lobby user={user} setView={setView} onQuickMatch={startMatchmaking} initialGameId={preSelectedGame} onClearInitialGame={() => dispatch({ type: 'SET_PRE_SELECTED_GAME', payload: null })} /></MV>}
                            {currentView === 'matchmaking' && matchmakingConfig && user && (
                                <MV k="matchmaking">
                                    <MatchmakingScreen user={user} gameType={matchmakingConfig.gameType} stake={matchmakingConfig.stake} onMatchFound={handleMatchFound} onCancel={cancelMatchmaking} isSocketMode={matchmakingConfig.stake !== -1} isTournament={matchmakingConfig.isTournament} />
                                </MV>
                            )}
                            {currentView === 'tournaments' && user && <MV k="tournaments"><Tournaments user={user} onJoinMatch={handleTournamentMatchJoin} socket={socket} pendingTournamentId={preSelectedGame} onClearPendingTournament={() => dispatch({ type: 'SET_PRE_SELECTED_GAME', payload: null })} /></MV>}
                            {currentView === 'game' && user && (
                                <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full h-full">
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
                                        <div className="flex flex-col items-center justify-center h-full gap-4">
                                            <Loader2 className="w-8 h-8 text-gold-500 animate-spin" />
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Finalizing Match Result...</p>
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
                {opponentDisconnected && <ReconnectionModal timeout={opponentTimeout} opponent={opponentProfile} />}
                {!isConnected && hasConnectedOnce && <WeakNetworkModal onReconnect={() => { socket?.connect(); }} />}
                {gameResult && (
                    <GameResultOverlay
                        result={gameResult.result}
                        amount={gameResult.amount}
                        financials={gameResult.financials}
                        onContinue={finalizeGameEnd}
                        // No rematch for tournament games — bracket advances automatically
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
                    <SocketProvider>
                        <ToastProvider>
                            <AppContent />
                        </ToastProvider>
                    </SocketProvider>
                </AppStateProvider>
            </ThemeProvider>
        </LanguageProvider>
    );
}
