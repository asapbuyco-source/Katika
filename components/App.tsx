import React, { Component, useState, useEffect, useRef, ReactNode, ErrorInfo } from 'react';
import { ViewState, User, Table, Challenge } from '../types';
import { Dashboard } from './Dashboard';
import { Lobby } from './Lobby';
import { GameRoom } from './GameRoom'; // Generic room, used for Ludo/Others if active
import { CheckersGame } from './CheckersGame';
import { DiceGame } from './DiceGame';
import { ChessGame } from './ChessGame';
import { CardGame } from './CardGame'; 
import { TicTacToeGame } from './TicTacToeGame';
import { PoolGame } from './PoolGame';
import { Finance } from './Finance';
import { Navigation } from './Navigation';
import { LandingPage } from './LandingPage';
import { MatchmakingScreen } from './MatchmakingScreen';
import { AuthScreen } from './AuthScreen';
import { Profile } from './Profile';
import { HowItWorks } from './HowItWorks';
import { AdminDashboard } from './AdminDashboard';
import { HelpCenter } from './HelpCenter';
import { ReportBug } from './ReportBug';
import { TermsOfService } from './TermsOfService';
import { PrivacyPolicy } from './PrivacyPolicy';
import { Forum } from './Forum';
import { Tournaments } from './Tournaments';
import { GameResultOverlay } from './GameResultOverlay';
import { ChallengeRequestModal } from './ChallengeRequestModal';
import { 
    auth, syncUserProfile, logout, subscribeToUser, createBotMatch, 
    subscribeToIncomingChallenges, respondToChallenge, getGame, subscribeToForum
} from '../services/firebase';
import { playSFX } from '../services/sound';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { Loader2, AlertTriangle, RefreshCw, WifiOff, Clock } from 'lucide-react';
import { LanguageProvider } from '../services/i18n';
import { ThemeProvider, useTheme } from '../services/theme';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children?: ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class GameErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Game Critical Error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset();
  }

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

// --- Enhanced Reconnection Modal (For Opponent Disconnection) ---
const ReconnectionModal = ({ timeout, opponent }: { timeout: number, opponent?: any }) => {
    const [timeLeft, setTimeLeft] = useState(timeout);

    useEffect(() => {
        setTimeLeft(timeout); // Reset on mount or prop change
        const timer = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [timeout]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-royal-900 border border-red-500 rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden shadow-2xl shadow-red-900/50"
            >
                {/* Progress Bar Background */}
                <div className="absolute top-0 left-0 w-full h-1.5 bg-royal-800">
                    <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: timeout, ease: 'linear' }}
                        className="h-full bg-gradient-to-r from-red-600 to-red-400"
                    />
                </div>
                
                <div className="relative mb-6 inline-block">
                    <div className="w-24 h-24 rounded-full border-4 border-red-500 bg-royal-950 overflow-hidden relative">
                        <img src={opponent?.avatar || "https://i.pravatar.cc/150?u=opp"} className="w-full h-full object-cover opacity-70 grayscale" alt="Opponent" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-royal-900 rounded-full p-2 border border-red-500 shadow-lg animate-bounce">
                        <WifiOff size={24} className="text-red-500" />
                    </div>
                </div>
                
                <h2 className="text-xl font-display font-bold text-white mb-2">Opponent Offline</h2>
                <p className="text-slate-300 text-sm mb-6">
                    <span className="text-gold-400 font-bold">{opponent?.name || "Opponent"}</span> lost connection.
                </p>
                
                <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20 mb-6">
                    <p className="text-red-300 text-xs font-bold uppercase tracking-wider mb-1">
                        Waiting for Reconnect
                    </p>
                    <div className="text-4xl font-mono font-bold text-white tabular-nums">
                        {Math.floor(timeLeft / 60)}:{Math.floor(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        If they do not return, you will win by default.
                    </p>
                </div>

                <div className="flex gap-2 justify-center items-center">
                    <Loader2 size={16} className="text-slate-500 animate-spin" />
                    <span className="text-xs text-slate-500 font-mono">Syncing Game State...</span>
                </div>
            </motion.div>
        </div>
    );
};

// --- Weak Network Modal (For Local Disconnection) ---
const WeakNetworkModal = ({ onReconnect }: { onReconnect: () => void }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl">
        <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-royal-900 border border-yellow-500 rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden shadow-2xl shadow-yellow-900/50"
        >
            <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-yellow-500/30">
                <WifiOff size={40} className="text-yellow-500" />
            </div>
            <h2 className="text-xl font-display font-bold text-white mb-2">Connection Lost</h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                Your device has lost connection to the server. <br/>
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

// Internal app content wrapper to access useTheme context
const AppContent = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setView] = useState<ViewState>('landing');
  const [activeTable, setActiveTable] = useState<Table | null>(null);
  const [matchmakingConfig, setMatchmakingConfig] = useState<{stake: number, gameType: string} | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Game End State
  const [gameResult, setGameResult] = useState<{ result: 'win' | 'loss' | 'quit', amount: number, financials?: any } | null>(null);
  
  // Rematch State
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'requested' | 'opponent_requested' | 'declined'>('idle');

  // Disconnection State
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [opponentTimeout, setOpponentTimeout] = useState(240); // 4 minutes
  
  // State to handle game selection from Dashboard -> Lobby
  const [preSelectedGame, setPreSelectedGame] = useState<string | null>(null);

  // Challenge System State
  const [incomingChallenge, setIncomingChallenge] = useState<Challenge | null>(null);

  // Notification State
  const [unreadForum, setUnreadForum] = useState(false);
  const lastForumMsgId = useRef<string | null>(null);
  const viewRef = useRef<ViewState>('landing'); 

  // --- SOCKET.IO STATE ---
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [socketGame, setSocketGame] = useState<any>(null); 
  const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Connection Handling
  const [bypassConnection, setBypassConnection] = useState(false);
  const [connectionTime, setConnectionTime] = useState(0);

  const { theme } = useTheme();

  // Apply Theme CSS Variables
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
      viewRef.current = currentView;
      if (currentView === 'forum') {
          setUnreadForum(false);
      }
      
      const mainContainer = document.getElementById('main-scroll-container');
      if (mainContainer) {
          // Use a small timeout to ensure the scroll reset happens AFTER the DOM updates
          // and the new view is rendered.
          setTimeout(() => {
              mainContainer.scrollTo({ top: 0, behavior: 'instant' });
          }, 50);
      } else {
          window.scrollTo(0, 0);
      }
  }, [currentView]);

  useEffect(() => {
    const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || "https://katika-production.up.railway.app";
    const timerInterval = setInterval(() => {
        setConnectionTime(prev => prev + 1);
    }, 1000);

    const newSocket = io(SOCKET_URL, {
        reconnectionAttempts: 10,
        timeout: 20000, 
        transports: ['polling', 'websocket'],
        autoConnect: true,
    });

    newSocket.on('connect', () => {
        setIsConnected(true);
        setHasConnectedOnce(true);
        setBypassConnection(false);
        setConnectionError(null);
        clearInterval(timerInterval);
    });

    newSocket.on('disconnect', (reason) => setIsConnected(false));
    newSocket.on('connect_error', (err) => setConnectionError(err.message));

    setSocket(newSocket);

    return () => {
        clearInterval(timerInterval);
        newSocket.close();
    };
  }, []); 

  useEffect(() => {
      if (!socket) return;

      const handleMatchFound = (gameState: any) => {
          setSocketGame(gameState);
          setIsWaitingForSocketMatch(false);
          setBypassConnection(false);
          setOpponentDisconnected(false);
          setGameResult(null);
          setRematchStatus('idle');
          setView('game');
      };

      const handleGameUpdate = (gameState: any) => {
          if (viewRef.current !== 'game' && viewRef.current !== 'matchmaking') return;
          setSocketGame((prev: any) => ({
              ...(prev || {}),
              ...gameState,
              roomId: gameState.roomId || gameState.id || (prev ? prev.roomId : undefined),
              id: gameState.id || gameState.roomId || (prev ? prev.id : undefined)
          }));
      };

      const handleOpponentDisconnected = (data?: { timeoutSeconds?: number }) => {
          setOpponentDisconnected(true);
          setOpponentTimeout(data?.timeoutSeconds || 240);
          setRematchStatus('declined');
          playSFX('error');
      };

      const handleRematchStatus = ({ requestorId, status }: { requestorId: string, status: string }) => {
          if (status === 'requested') {
              if (requestorId !== user?.id) {
                  setRematchStatus('opponent_requested');
                  playSFX('notification');
              }
          } else if (status === 'declined') {
              setRematchStatus('declined');
          }
      };

      const handleGameOver = ({ winner, financials }: { winner: string, financials?: any }) => {
          setOpponentDisconnected(false);
          if (user && winner === user.id) {
              setGameResult({ 
                  result: 'win', 
                  amount: financials ? financials.winnings : 0,
                  financials: financials 
              }); 
          } else {
              setGameResult({ result: 'loss', amount: 0 });
          }
      };

      socket.on('match_found', handleMatchFound);
      socket.on('waiting_for_opponent', () => setIsWaitingForSocketMatch(true));
      socket.on('game_update', handleGameUpdate);
      socket.on('opponent_disconnected', handleOpponentDisconnected);
      socket.on('opponent_reconnected', () => { setOpponentDisconnected(false); playSFX('notification'); });
      socket.on('rematch_status', handleRematchStatus);
      socket.on('game_over', handleGameOver);

      return () => {
          socket.off('match_found', handleMatchFound);
          socket.off('waiting_for_opponent');
          socket.off('game_update', handleGameUpdate);
          socket.off('opponent_disconnected', handleOpponentDisconnected);
          socket.off('opponent_reconnected');
          socket.off('rematch_status', handleRematchStatus);
          socket.off('game_over', handleGameOver);
      };
  }, [socket, user]); 

  useEffect(() => {
      if (socket && isConnected && user) {
          socket.emit('rejoin_game', { userProfile: user });
      }
  }, [socket, isConnected, user]);

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (currentView === 'game' && socketGame && !gameResult) {
              const message = "You have an active game!";
              e.preventDefault();
              e.returnValue = message;
              return message;
          }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentView, socketGame, gameResult]);

  useEffect(() => {
      if (connectionTime >= 20 && !isConnected && !bypassConnection && !hasConnectedOnce && !socketGame) {
          setBypassConnection(true);
      }
  }, [connectionTime, isConnected, bypassConnection, hasConnectedOnce, socketGame]);

  useEffect(() => {
      let unsubscribeSnapshot: (() => void) | undefined;
      let unsubscribeChallenges: (() => void) | undefined;
      let unsubscribeForum: (() => void) | undefined;

      const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
              try {
                  const appUser = await syncUserProfile(firebaseUser);
                  setUser(appUser);

                  unsubscribeSnapshot = subscribeToUser(appUser.id, (updatedUser) => {
                      setUser(updatedUser);
                  });

                  unsubscribeChallenges = subscribeToIncomingChallenges(appUser.id, (challenge) => {
                      setIncomingChallenge(challenge);
                  });

                  unsubscribeForum = subscribeToForum((posts) => {
                      if (posts.length > 0) {
                          const latestId = posts[0].id;
                          if (lastForumMsgId.current && lastForumMsgId.current !== latestId) {
                              if (viewRef.current !== 'forum') {
                                  setUnreadForum(true);
                                  playSFX('notification');
                              }
                          }
                          lastForumMsgId.current = latestId;
                      }
                  });

              } catch (error) {
                  console.error("Profile sync failed:", error);
              }
          } else {
              if (unsubscribeSnapshot) unsubscribeSnapshot();
              if (unsubscribeChallenges) unsubscribeChallenges();
              if (unsubscribeForum) unsubscribeForum();
              setUser(null);
          }
          setAuthLoading(false);
      });

      return () => {
          unsubscribeAuth();
          if (unsubscribeSnapshot) unsubscribeSnapshot();
          if (unsubscribeChallenges) unsubscribeChallenges();
          if (unsubscribeForum) unsubscribeForum();
      };
  }, []);

  useEffect(() => {
      if (authLoading) return;

      if (user) {
          if (currentView === 'landing' || currentView === 'auth') {
              setView('dashboard');
          }
      } else {
          // Explicitly list all public views to prevent auto-redirect to landing
          const publicViews: ViewState[] = ['landing', 'auth', 'how-it-works', 'terms', 'privacy', 'help-center', 'report-bug'];
          if (!publicViews.includes(currentView)) {
              setView('landing');
          }
      }
  }, [user, currentView, authLoading]);

  const startMatchmaking = async (stake: number, gameType: string, specificGameId?: string, difficulty?: string) => {
      if (!user) return;
      
      const validGames = ['Dice', 'Checkers', 'Chess', 'TicTacToe', 'Cards', 'Ludo', 'Pool'];
      if (!validGames.includes(gameType)) {
          alert("This game is coming soon!");
          return;
      }

      if ((!isConnected || bypassConnection) && stake !== -1) {
          alert("Offline Mode active. P2P unavailable.");
          return;
      }
      if (stake === -1) {
          try {
              const gameId = await createBotMatch(user, gameType, difficulty);
              const gameData = await getGame(gameId);
              if (gameData) {
                  const table: Table = {
                      id: gameData.id,
                      gameType: gameData.gameType as any,
                      stake: gameData.stake,
                      players: 2,
                      maxPlayers: 2,
                      status: 'active',
                      host: gameData.host,
                      guest: gameData.guest
                  };
                  setActiveTable(table);
                  setView('game');
              }
          } catch (error) {
              console.error("Bot match failed:", error);
          }
          return;
      }
      if (!socket) return;
      
      setMatchmakingConfig({ stake, gameType });
      setView('matchmaking');
      socket.emit('join_game', { 
          stake: stake, 
          userProfile: user, 
          privateRoomId: specificGameId, 
          gameType 
      });
  };

  const cancelMatchmaking = () => {
      setMatchmakingConfig(null);
      setIsWaitingForSocketMatch(false);
      setView('lobby');
  };

  const handleAcceptChallenge = async () => {
      if (!incomingChallenge || !user) return;
      const gameId = incomingChallenge.id;
      await respondToChallenge(incomingChallenge.id, 'accepted', gameId);
      startMatchmaking(incomingChallenge.stake, incomingChallenge.gameType, gameId);
      setIncomingChallenge(null);
  };

  const handleMatchFound = async (table: Table) => {
      setActiveTable(table);
      setView('game');
  };

  const handleGameEnd = async (result: 'win' | 'loss' | 'quit') => {
      setGameResult({ result, amount: 0 }); 
  };

  const finalizeGameEnd = () => {
    if (socket && socketGame) {
        socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_DECLINE' } });
    }
    
    // Safety Reload
    window.location.reload();
  };

  const handleRematchRequest = () => {
      if (!user || !socket || !socketGame) return;
      const stake = socketGame.stake || 0;
      if (user.balance < stake) {
          alert(`Insufficient funds for rematch. You need ${stake} FCFA.`);
          return;
      }
      setRematchStatus('requested');
      socket.emit('game_action', { 
          roomId: socketGame.roomId, 
          action: { type: 'REMATCH_REQUEST' } 
      });
  };

  const handleLogout = async () => {
      await logout();
      setUser(null);
      setView('landing');
  };
  
  const handleDashboardQuickMatch = (gameId?: string) => {
      if (gameId) setPreSelectedGame(gameId);
      else setPreSelectedGame(null);
      setView('lobby');
  };

  const constructTableFromSocket = (game: any): Table => {
      if (!user) return {} as Table;
      const opponentId = game.players.find((id: string) => id !== user.id);
      const hostProfile = game.profiles ? game.profiles[opponentId] : { id: opponentId, name: 'Opponent', avatar: 'https://i.pravatar.cc/150?u=opp', elo: 0, rankTier: 'Silver' };
      return {
          id: game.roomId || game.id,
          gameType: game.gameType,
          stake: game.stake,
          players: 2,
          maxPlayers: 2,
          status: 'active',
          host: hostProfile
      };
  };

  // Tournament Logic Integration
  const handleTournamentMatchJoin = (gameType: string, tournamentMatchId: string) => {
      // 1. Find existing game or create logic if necessary
      // For now, we simulate joining a specific private room which the server associates
      // with the tournament match ID.
      if (!user || !socket) return;
      
      // We start matchmaking but pass the tournament match ID as a private room ID
      // The server (in a real implementation) would look up the specific players scheduled for this match
      startMatchmaking(0, gameType, tournamentMatchId); 
  };

  if (authLoading) {
      return (
          <div className="min-h-screen bg-royal-950 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
      );
  }

  // Initial Connection Screen (Only shown if never connected)
  if (!isConnected && !hasConnectedOnce && user && !bypassConnection) {
      return (
          <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 size={48} className="text-gold-500 animate-spin mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Connecting to Vantage Network...</h2>
              <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => { setConnectionError(null); socket?.connect(); }}
                    className="px-6 py-2 bg-royal-800 border border-white/10 rounded-lg text-white font-bold hover:bg-royal-700 transition-colors flex items-center justify-center gap-2"
                  >
                      <RefreshCw size={16} /> Retry Connection
                  </button>
                  <button onClick={() => setBypassConnection(true)} className="text-white/50 hover:text-white text-sm underline mt-2">Play Offline</button>
              </div>
          </div>
      );
  }

  const activeGameTable = socketGame ? constructTableFromSocket(socketGame) : activeTable;
  
  // Find opponent profile for reconnection modal
  let opponentProfile = null;
  if (socketGame && user && socketGame.profiles) {
      const oppId = socketGame.players.find((id: string) => id !== user.id);
      if (oppId) opponentProfile = socketGame.profiles[oppId];
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-royal-950 text-white font-sans overflow-x-hidden transition-colors duration-500">
      {user && currentView !== 'game' && currentView !== 'matchmaking' && (
        <Navigation currentView={currentView} setView={setView} user={user} hasUnreadMessages={unreadForum} />
      )}
      
      <main id="main-scroll-container" className="flex-1 relative w-full h-screen overflow-y-auto">
        <GameErrorBoundary onReset={() => { user ? setView('dashboard') : setView('landing'); window.location.reload(); }}>
            <AnimatePresence mode="wait">
            {currentView === 'landing' && <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><LandingPage onLogin={() => setView('auth')} onNavigate={setView} /></motion.div>}
            {currentView === 'auth' && <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><AuthScreen onAuthenticated={(u) => { setUser(u || null); }} onNavigate={setView} /></motion.div>}
            {currentView === 'dashboard' && user && <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Dashboard user={user} setView={setView} onTopUp={() => setView('finance')} onQuickMatch={handleDashboardQuickMatch} /></motion.div>}
            {currentView === 'lobby' && user && <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Lobby user={user} setView={setView} onQuickMatch={startMatchmaking} initialGameId={preSelectedGame} onClearInitialGame={() => setPreSelectedGame(null)} /></motion.div>}
            {currentView === 'matchmaking' && matchmakingConfig && user && <motion.div key="matchmaking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><MatchmakingScreen user={user} gameType={matchmakingConfig.gameType} stake={matchmakingConfig.stake} onMatchFound={handleMatchFound} onCancel={cancelMatchmaking} isSocketMode={matchmakingConfig.stake !== -1} /></motion.div>}
            {currentView === 'tournaments' && user && <motion.div key="tournaments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Tournaments user={user} onJoinMatch={handleTournamentMatchJoin} /></motion.div>}

            {currentView === 'game' && user && activeGameTable && (
                <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full h-full">
                    {activeGameTable.gameType === 'Checkers' ? <CheckersGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                     activeGameTable.gameType === 'Dice' ? <DiceGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                     activeGameTable.gameType === 'Chess' ? <ChessGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                     activeGameTable.gameType === 'TicTacToe' ? <TicTacToeGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                     activeGameTable.gameType === 'Cards' ? <CardGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                     activeGameTable.gameType === 'Pool' ? <PoolGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} /> :
                     activeGameTable.gameType === 'Ludo' ? <GameRoom table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                     <div className="flex items-center justify-center h-full text-2xl font-bold text-slate-500">Game Mode Not Available</div>}
                </motion.div>
            )}

            {currentView === 'profile' && user && <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Profile user={user} onLogout={handleLogout} onUpdateProfile={(u) => setUser({...user, ...u})} onNavigate={setView} /></motion.div>}
            {currentView === 'finance' && user && <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Finance user={user} onTopUp={() => {}} /></motion.div>}
            {currentView === 'how-it-works' && <motion.div key="how-it-works" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><HowItWorks onBack={() => setView('landing')} onLogin={() => setView('auth')} /></motion.div>}
            {currentView === 'admin' && user?.isAdmin && <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><AdminDashboard user={user} /></motion.div>}
            {currentView === 'help-center' && <motion.div key="help-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><HelpCenter onBack={() => setView(user ? 'profile' : 'landing')} /></motion.div>}
            {currentView === 'report-bug' && <motion.div key="report-bug" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><ReportBug onBack={() => setView(user ? 'profile' : 'landing')} /></motion.div>}
            {currentView === 'terms' && <motion.div key="terms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><TermsOfService onBack={() => setView(user ? 'profile' : 'landing')} /></motion.div>}
            {currentView === 'privacy' && <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><PrivacyPolicy onBack={() => setView(user ? 'profile' : 'landing')} /></motion.div>}
            {currentView === 'forum' && user && <motion.div key="forum" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Forum user={user} /></motion.div>}
            </AnimatePresence>
        </GameErrorBoundary>
      </main>

      <AnimatePresence>
          {/* Show when the opponent is the one disconnected */}
          {opponentDisconnected && <ReconnectionModal timeout={opponentTimeout} opponent={opponentProfile} />}
          
          {/* Show when I am the one disconnected (Local Failure) */}
          {!isConnected && hasConnectedOnce && <WeakNetworkModal onReconnect={() => { setConnectionError(null); socket?.connect(); }} />}

          {gameResult && <GameResultOverlay result={gameResult.result} amount={gameResult.amount} financials={gameResult.financials} onContinue={finalizeGameEnd} onRematch={socketGame && isConnected ? handleRematchRequest : undefined} rematchStatus={rematchStatus} stake={socketGame?.stake} userBalance={user?.balance} />}
          {incomingChallenge && <ChallengeRequestModal challenge={incomingChallenge} onAccept={handleAcceptChallenge} onDecline={async () => { if (incomingChallenge) await respondToChallenge(incomingChallenge.id, 'declined'); setIncomingChallenge(null); }} />}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </LanguageProvider>
  );
}