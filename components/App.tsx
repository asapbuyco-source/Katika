import React, { useState, useEffect, useRef, ReactNode, ErrorInfo } from 'react';
import { ViewState, User, Table, Challenge } from '../types';
import { Dashboard } from './Dashboard';
import { Lobby } from './Lobby';
import { GameRoom } from './GameRoom'; 
import { CheckersGame } from './CheckersGame';
import { DiceGame } from './DiceGame';
import { TicTacToeGame } from './TicTacToeGame';
import { ChessGame } from './ChessGame';
import { CardGame } from './CardGame';
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

// --- Internal Reconnection Modal Component ---
const ReconnectionModal = ({ timeout }: { timeout: number }) => {
    const [timeLeft, setTimeLeft] = useState(timeout);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-royal-900 border border-red-500/50 rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-royal-800">
                    <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: timeout, ease: 'linear' }}
                        className="h-full bg-red-500"
                    />
                </div>
                
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <WifiOff size={40} className="text-red-500" />
                </div>
                
                <h2 className="text-2xl font-bold text-white mb-2">Opponent Disconnected</h2>
                <p className="text-slate-400 text-sm mb-6">
                    Waiting for them to reconnect. If they don't return, you win automatically.
                </p>

                <div className="flex items-center justify-center gap-2 text-3xl font-mono font-bold text-red-400">
                    <Clock size={28} /> {timeLeft}s
                </div>
            </motion.div>
        </div>
    );
};

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
  
  // State to handle game selection from Dashboard -> Lobby
  const [preSelectedGame, setPreSelectedGame] = useState<string | null>(null);

  // Challenge System State
  const [incomingChallenge, setIncomingChallenge] = useState<Challenge | null>(null);

  // Notification State
  const [unreadForum, setUnreadForum] = useState(false);
  const lastForumMsgId = useRef<string | null>(null);
  const viewRef = useRef<ViewState>('landing'); // Ref to track view inside listeners

  // --- SOCKET.IO STATE ---
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [socketGame, setSocketGame] = useState<any>(null); // Simplified Socket Game State
  const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Connection Handling
  const [bypassConnection, setBypassConnection] = useState(false);
  const [connectionTime, setConnectionTime] = useState(0);

  // Theme Hook
  const { theme } = useTheme();

  // Apply Theme CSS Variables
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.style.setProperty('--c-royal-950', '15 10 31'); // #0f0a1f
      root.style.setProperty('--c-royal-900', '26 16 60'); // #1a103c
      root.style.setProperty('--c-royal-800', '45 27 105'); // #2d1b69
      root.style.setProperty('--c-text-white', '255 255 255');
      root.style.setProperty('--c-text-base', '226 232 240');
    } else {
      // Light Mode Mapping
      root.style.setProperty('--c-royal-950', '248 250 252'); // Slate 50 (Main BG)
      root.style.setProperty('--c-royal-900', '255 255 255'); // White (Cards)
      root.style.setProperty('--c-royal-800', '226 232 240'); // Slate 200 (Accents/Borders)
      root.style.setProperty('--c-text-white', '15 23 42'); // Slate 900 (Headings)
      root.style.setProperty('--c-text-base', '51 65 85'); // Slate 700 (Body)
    }
  }, [theme]);

  // Update view ref whenever view changes (for the forum listener) and handle scrolling
  useEffect(() => {
      viewRef.current = currentView;
      if (currentView === 'forum') {
          setUnreadForum(false);
      }
      
      // Auto-scroll to top when view changes
      const mainContainer = document.getElementById('main-scroll-container');
      if (mainContainer) {
          mainContainer.scrollTo({ top: 0, behavior: 'instant' });
      } else {
          window.scrollTo(0, 0);
      }
  }, [currentView]);

  // 1. Initialize Socket Connection (Singleton Logic)
  useEffect(() => {
    // Use Environment Variable or Fallback
    const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || "https://katika-production.up.railway.app";
    
    const timerInterval = setInterval(() => {
        setConnectionTime(prev => prev + 1);
    }, 1000);

    console.log("Attempting socket connection to:", SOCKET_URL);

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

  // 1.1 Attach Game Listeners (Depends on socket & user to ensure fresh closure)
  useEffect(() => {
      if (!socket) return;

      const handleMatchFound = (gameState: any) => {
          setSocketGame(gameState);
          setIsWaitingForSocketMatch(false);
          setBypassConnection(false);
          setOpponentDisconnected(false);
          // Clear old results if this is a rematch or new game
          setGameResult(null);
          setRematchStatus('idle');
          setView('game');
      };

      const handleGameUpdate = (gameState: any) => {
          // Robust state merging: Prioritize incoming roomId, fallback to id, then previous state
          setSocketGame((prev: any) => ({
              ...(prev || {}),
              ...gameState,
              roomId: gameState.roomId || gameState.id || (prev ? prev.roomId : undefined),
              id: gameState.id || gameState.roomId || (prev ? prev.id : undefined)
          }));
      };

      const handleOpponentDisconnected = () => {
          setOpponentDisconnected(true);
          setRematchStatus('declined');
          playSFX('error');
      };

      const handleRematchStatus = ({ requestorId, status }: { requestorId: string, status: string }) => {
          if (status === 'requested') {
              // Now 'user' is fresh because this effect depends on [user]
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
  }, [socket, user]); // Re-bind when user or socket changes

  // 1.5 Automatic Rejoin
  useEffect(() => {
      if (socket && isConnected && user) {
          socket.emit('rejoin_game', { userProfile: user });
      }
  }, [socket, isConnected, user]);

  // Prevent Refresh
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

  // 2. Automatic Fallback
  useEffect(() => {
      if (connectionTime >= 20 && !isConnected && !bypassConnection && !hasConnectedOnce && !socketGame) {
          setBypassConnection(true);
      }
  }, [connectionTime, isConnected, bypassConnection, hasConnectedOnce, socketGame]);


  // 5. Firebase Auth
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

  // 6. Navigation Guard
  useEffect(() => {
      if (authLoading) return;

      if (user) {
          if (currentView === 'landing' || currentView === 'auth') {
              setView('dashboard');
          }
      } else {
          const publicViews: ViewState[] = ['landing', 'auth', 'how-it-works', 'terms', 'privacy', 'help-center', 'report-bug'];
          if (!publicViews.includes(currentView)) {
              setView('landing');
          }
      }
  }, [user, currentView, authLoading]);

  // Actions
  const startMatchmaking = async (stake: number, gameType: string, specificGameId?: string) => {
      if (!user) return;
      if ((!isConnected || bypassConnection) && stake !== -1) {
          alert("Offline Mode active. P2P unavailable.");
          return;
      }
      if (stake === -1) {
          try {
              const gameId = await createBotMatch(user, gameType);
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
    setGameResult(null);
    setActiveTable(null);
    setSocketGame(null);
    setOpponentDisconnected(false);
    setRematchStatus('idle');
    setView('dashboard');
  };

  const handleRematchRequest = () => {
      if (!user || !socket || !socketGame) return;
      
      const stake = socketGame.stake || 0;
      
      // Balance Check
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
          id: game.roomId || game.id, // Prefer roomId, fallback to id
          gameType: game.gameType,
          stake: game.stake,
          players: 2,
          maxPlayers: 2,
          status: 'active',
          host: hostProfile
      };
  };

  // --- RENDER ---

  if (authLoading) {
      return (
          <div className="min-h-screen bg-royal-950 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
      );
  }

  // Socket Connection Loading
  if (!isConnected && !hasConnectedOnce && user && !bypassConnection) {
      return (
          <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 size={48} className="text-gold-500 animate-spin mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Connecting to Vantage Network...</h2>
              <p className="text-slate-400 max-w-md mb-8">
                  {connectionTime > 5 ? "Waking up server..." : "Establishing connection..."}
                  <br/><span className="text-xs text-slate-600">({connectionTime}s)</span>
                  {connectionError && (
                      <span className="block text-red-400 text-xs mt-2 bg-red-900/20 p-1 rounded">
                          {connectionError}
                      </span>
                  )}
              </p>
              
              <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => { setConnectionError(null); socket?.connect(); }}
                    className="px-6 py-2 bg-royal-800 border border-white/10 rounded-lg text-white font-bold hover:bg-royal-700 transition-colors flex items-center justify-center gap-2"
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
        <Navigation 
            currentView={currentView} 
            setView={setView} 
            user={user} 
            hasUnreadMessages={unreadForum}
        />
      )}
      
      <main id="main-scroll-container" className="flex-1 relative w-full h-screen overflow-y-auto">
        <GameErrorBoundary onReset={() => {
            if (user) setView('dashboard');
            else setView('landing');
            window.location.reload();
        }}>
            {/* Added mode="wait" back to fix navigation animations */}
            <AnimatePresence mode="wait">
            {currentView === 'landing' && (
                <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <LandingPage onLogin={() => setView('auth')} onNavigate={setView} />
                </motion.div>
            )}

            {currentView === 'auth' && (
                <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <AuthScreen onAuthenticated={(u) => { setUser(u || null); }} onNavigate={setView} />
                </motion.div>
            )}

            {currentView === 'dashboard' && user && (
                <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <Dashboard 
                    user={user} 
                    setView={setView} 
                    onTopUp={() => setView('finance')} 
                    onQuickMatch={handleDashboardQuickMatch}
                />
                </motion.div>
            )}

            {currentView === 'lobby' && user && (
                <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <Lobby 
                    user={user} 
                    setView={setView} 
                    onQuickMatch={startMatchmaking} 
                    initialGameId={preSelectedGame}
                    onClearInitialGame={() => setPreSelectedGame(null)}
                />
                </motion.div>
            )}

            {currentView === 'matchmaking' && matchmakingConfig && user && (
                <motion.div key="matchmaking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <MatchmakingScreen
                    user={user}
                    gameType={matchmakingConfig.gameType}
                    stake={matchmakingConfig.stake}
                    onMatchFound={handleMatchFound}
                    onCancel={cancelMatchmaking}
                    isSocketMode={matchmakingConfig.stake !== -1}
                />
                </motion.div>
            )}

            {currentView === 'game' && user && (activeTable || socketGame) && (
                <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full h-full">
                    {/* Game-specific rendering */}
                    {(activeTable?.gameType === 'Checkers' || socketGame?.gameType === 'Checkers') ? (
                        <CheckersGame table={activeTable || constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />
                    ) : (activeTable?.gameType === 'Dice' || socketGame?.gameType === 'Dice') ? (
                        <DiceGame table={activeTable || constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />
                    ) : (activeTable?.gameType === 'TicTacToe' || socketGame?.gameType === 'TicTacToe') ? (
                        <TicTacToeGame table={activeTable || constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />
                    ) : (activeTable?.gameType === 'Chess' || socketGame?.gameType === 'Chess') ? (
                        <ChessGame table={activeTable || constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />
                    ) : (activeTable?.gameType === 'Cards' || socketGame?.gameType === 'Cards') ? (
                        <CardGame table={activeTable || constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />
                    ) : (
                        <GameRoom table={activeTable || constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />
                    )}
                </motion.div>
            )}

            {currentView === 'profile' && user && (
                <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="w-full min-h-full">
                <Profile user={user} onLogout={handleLogout} onUpdateProfile={(u) => setUser({...user, ...u})} onNavigate={setView} />
                </motion.div>
            )}

            {currentView === 'finance' && user && (
                <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <Finance user={user} onTopUp={() => {}} />
                </motion.div>
            )}

            {currentView === 'how-it-works' && (
                <motion.div key="how-it-works" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <HowItWorks onBack={() => setView('landing')} onLogin={() => setView('auth')} />
                </motion.div>
            )}

            {currentView === 'admin' && user && user.isAdmin && (
                <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <AdminDashboard user={user} />
                </motion.div>
            )}

            {currentView === 'help-center' && (
                <motion.div key="help" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <HelpCenter onBack={() => setView(user ? 'profile' : 'landing')} />
                </motion.div>
            )}

            {currentView === 'report-bug' && (
                <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <ReportBug onBack={() => setView(user ? 'profile' : 'landing')} />
                </motion.div>
            )}

            {currentView === 'terms' && (
                <motion.div key="terms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <TermsOfService onBack={() => setView(user ? 'profile' : 'landing')} />
                </motion.div>
            )}

            {currentView === 'privacy' && (
                <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <PrivacyPolicy onBack={() => setView(user ? 'profile' : 'landing')} />
                </motion.div>
            )}

            {currentView === 'forum' && user && (
                <motion.div key="forum" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                <Forum user={user} />
                </motion.div>
            )}

            </AnimatePresence>
        </GameErrorBoundary>
      </main>

      {/* GLOBAL OVERLAYS */}
      <AnimatePresence>
          {opponentDisconnected && (
              <ReconnectionModal timeout={60} />
          )}
          {gameResult && (
              <GameResultOverlay 
                  result={gameResult.result} 
                  amount={gameResult.amount}
                  financials={gameResult.financials}
                  onContinue={finalizeGameEnd}
                  // Rematch Props (Only for P2P games with active socket)
                  onRematch={socketGame && isConnected ? handleRematchRequest : undefined}
                  rematchStatus={rematchStatus}
                  stake={socketGame?.stake}
                  userBalance={user?.balance}
              />
          )}
          {incomingChallenge && (
              <ChallengeRequestModal 
                  challenge={incomingChallenge}
                  onAccept={handleAcceptChallenge}
                  onDecline={async () => {
                      if (incomingChallenge) await respondToChallenge(incomingChallenge.id, 'declined');
                      setIncomingChallenge(null);
                  }}
              />
          )}
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