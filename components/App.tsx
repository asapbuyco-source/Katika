import React, { Component, useState, useEffect, useRef, useMemo, ErrorInfo } from 'react';
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
import { Forum } from './Forum';
import { GameResultOverlay } from './GameResultOverlay';
import { ChallengeRequestModal } from './ChallengeRequestModal';
import { 
    auth, syncUserProfile, logout, subscribeToUser, addUserTransaction, 
    createBotMatch, subscribeToIncomingChallenges, respondToChallenge, createChallengeGame, getGame, subscribeToForum
} from '../services/firebase';
import { playSFX } from '../services/sound';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { Loader2, Wifi, WifiOff, Clock, AlertTriangle, Play, ServerOff, RefreshCw } from 'lucide-react';
import { LanguageProvider } from '../services/i18n';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children?: React.ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class GameErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setView] = useState<ViewState>('landing');
  const [activeTable, setActiveTable] = useState<Table | null>(null);
  const [matchmakingConfig, setMatchmakingConfig] = useState<{stake: number, gameType: string} | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Game End State
  const [gameResult, setGameResult] = useState<{ result: 'win' | 'loss' | 'quit', amount: number } | null>(null);
  
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
  const [timeLeft, setTimeLeft] = useState<number>(20); 
  
  // Connection Handling
  const [bypassConnection, setBypassConnection] = useState(false);
  const [connectionTime, setConnectionTime] = useState(0);

  // Update view ref whenever view changes (for the forum listener)
  useEffect(() => {
      viewRef.current = currentView;
      if (currentView === 'forum') {
          setUnreadForum(false);
      }
  }, [currentView]);

  // 1. Initialize Socket Connection with Fallback Logic
  useEffect(() => {
    const SOCKET_URL = "https://katika-production.up.railway.app";
    
    // Timer to track connection duration
    const timerInterval = setInterval(() => {
        setConnectionTime(prev => prev + 1);
    }, 1000);

    const newSocket = io(SOCKET_URL, {
        reconnectionAttempts: 5,
        timeout: 10000, 
        transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
        console.log("Connected to Vantage Referee (Railway)");
        setIsConnected(true);
        setHasConnectedOnce(true);
        setBypassConnection(false); // Auto-recover from offline mode
        clearInterval(timerInterval);
    });

    newSocket.on('disconnect', () => {
        setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
        console.warn("Socket Connection Error:", err.message);
    });

    newSocket.on('match_found', (gameState) => {
        console.log("Socket Match Found/Restored!", gameState);
        setSocketGame(gameState);
        setIsWaitingForSocketMatch(false);
        setBypassConnection(false);
        setView('game');
    });

    newSocket.on('waiting_for_opponent', () => {
        setIsWaitingForSocketMatch(true);
    });

    newSocket.on('game_update', (gameState) => {
        setSocketGame(gameState);
    });

    newSocket.on('turn_timeout', (data) => {
        console.log("Turn timed out");
    });

    newSocket.on('dice_rolled', ({ value }) => {
        console.log("Dice rolled:", value);
    });

    setSocket(newSocket);

    return () => {
        clearInterval(timerInterval);
        newSocket.close();
    };
  }, []);

  // 1.5 Automatic Rejoin & Refresh Warning
  useEffect(() => {
      // Rejoin Logic
      if (socket && isConnected && user) {
          socket.emit('rejoin_game', { userProfile: user });
      }
  }, [socket, isConnected, user]);

  useEffect(() => {
      // Prevent Refresh Warning
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          // If in a socket game and no result yet
          if (currentView === 'game' && socketGame && !gameResult) {
              const message = "You have an active game! Refreshing may cause you to disconnect and lose.";
              e.preventDefault();
              e.returnValue = message; // Chrome requires returnValue to be set
              return message;
          }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentView, socketGame, gameResult]);

  // 2. Automatic Fallback Logic
  useEffect(() => {
      // If 15 seconds pass and not connected, auto-enable offline mode
      if (connectionTime >= 15 && !isConnected && !bypassConnection && !hasConnectedOnce && !socketGame) {
          console.log("Connection timeout reached. Switching to Offline Mode.");
          setBypassConnection(true);
      }
  }, [connectionTime, isConnected, bypassConnection, hasConnectedOnce, socketGame]);

  // 3. Safety: If game exists, ensure we aren't in offline mode
  useEffect(() => {
      if (socketGame && bypassConnection) {
          setBypassConnection(false);
      }
  }, [socketGame, bypassConnection]);

  // Handle Game Over Logic with access to 'user' state
  useEffect(() => {
      if (!socket) return;
      
      const handleGameOver = ({ winner }: { winner: string }) => {
          if (user && winner === user.id) {
              setGameResult({ result: 'win', amount: 0 }); 
          } else {
              setGameResult({ result: 'loss', amount: 0 });
          }
      };

      socket.on('game_over', handleGameOver);
      return () => { socket.off('game_over', handleGameOver); };
  }, [socket, user]);


  // 4. Timer Logic
  useEffect(() => {
      if (!socketGame || !socketGame.turnExpiresAt) return;

      const interval = setInterval(() => {
          const delta = Math.max(0, Math.ceil((socketGame.turnExpiresAt - Date.now()) / 1000));
          setTimeLeft(delta);
      }, 1000);

      return () => clearInterval(interval);
  }, [socketGame]);

  // 5. Firebase Auth & Global Listeners
  useEffect(() => {
      let unsubscribeSnapshot: (() => void) | undefined;
      let unsubscribeChallenges: (() => void) | undefined;
      let unsubscribeForum: (() => void) | undefined;

      const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
              try {
                  const appUser = await syncUserProfile(firebaseUser);
                  setUser(appUser);

                  // User Data Listener
                  unsubscribeSnapshot = subscribeToUser(appUser.id, (updatedUser) => {
                      setUser(updatedUser);
                  });

                  // Challenge Listener
                  unsubscribeChallenges = subscribeToIncomingChallenges(appUser.id, (challenge) => {
                      setIncomingChallenge(challenge);
                  });

                  // Forum Notification Listener
                  unsubscribeForum = subscribeToForum((posts) => {
                      if (posts.length > 0) {
                          const latestId = posts[0].id;
                          // If we have a stored last ID, and it's different from new latest
                          if (lastForumMsgId.current && lastForumMsgId.current !== latestId) {
                              // And we are NOT currently looking at the forum
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
          // If viewing How It Works, don't redirect to landing
          if (currentView === 'how-it-works') return;

          const protectedViews: ViewState[] = ['dashboard', 'lobby', 'matchmaking', 'game', 'profile', 'finance', 'admin', 'help-center', 'report-bug', 'terms', 'forum'];
          if (protectedViews.includes(currentView)) {
              setView('landing');
          }
      }
  }, [user, currentView, authLoading]);

  // Modified Matchmaking to use Socket
  const startMatchmaking = async (stake: number, gameType: string, specificGameId?: string) => {
      if (!user) return;

      // OFFLINE MODE CHECK
      if ((!isConnected || bypassConnection) && stake !== -1) {
          alert("You are currently in Offline Mode. Please check your internet or wait for the server to reconnect to play P2P matches. Bot matches are available.");
          return;
      }

      // Bot match (Firebase/Local)
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
              console.error("Failed to start bot match:", error);
          }
          return;
      }

      if (!socket) return;

      // Handle Private Matches via Socket
      if (specificGameId) {
          setMatchmakingConfig({ stake, gameType });
          setView('matchmaking');
          socket.emit('join_game', { stake: stake, userProfile: user, privateRoomId: specificGameId, gameType });
          return;
      }

      // Use Socket.io for Real-time Public Matchmaking
      setMatchmakingConfig({ stake, gameType });
      setView('matchmaking');
      
      // Emit to backend with User Profile for ID tracking
      socket.emit('join_game', { stake: stake, userProfile: user, gameType });
  };

  const cancelMatchmaking = () => {
      setMatchmakingConfig(null);
      setIsWaitingForSocketMatch(false);
      setView('lobby');
  };

  const handleAcceptChallenge = async () => {
      if (!incomingChallenge || !user) return;
      const gameId = incomingChallenge.id; // Use challenge ID as shared game ID
      
      // 1. Notify Sender via Firebase
      await respondToChallenge(incomingChallenge.id, 'accepted', gameId);
      
      // 2. Join the Private Socket Room
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
    setGameResult(null);
    setActiveTable(null);
    setSocketGame(null);
    setView('dashboard');
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

  // Helper to construct a Table object from socketGame for components
  const constructTableFromSocket = (game: any): Table => {
      if (!user) return {} as Table;
      const opponentId = game.players.find((id: string) => id !== user.id);
      
      // If profiles are available in game state, use them
      const hostProfile = game.profiles ? game.profiles[opponentId] : { id: opponentId, name: 'Opponent', avatar: 'https://i.pravatar.cc/150?u=opp', elo: 0, rankTier: 'Silver' };
      
      return {
          id: game.roomId,
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

  // Socket Connection Loading Screen with Auto-Fallback
  if (!isConnected && !hasConnectedOnce && user && !bypassConnection) {
      return (
          <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 size={48} className="text-gold-500 animate-spin mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Connecting to Vantage Network...</h2>
              <p className="text-slate-400 max-w-md mb-8">
                  {connectionTime > 3 ? "Waking up server..." : "Establishing secure connection..."}
              </p>
              
              <div className="w-64 h-2 bg-royal-800 rounded-full overflow-hidden mb-4">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 7, ease: "linear" }}
                    className="h-full bg-gold-500"
                  />
              </div>
              <p className="text-xs text-slate-500">Entering Offline Mode in {Math.max(0, 15 - connectionTime)}s...</p>
              
              <button 
                onClick={() => setBypassConnection(true)}
                className="mt-8 text-white/50 hover:text-white text-sm underline"
              >
                  Skip & Play Offline Now
              </button>
          </div>
      );
  }

  return (
    <LanguageProvider>
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans md:flex">
      {user && ['dashboard', 'lobby', 'profile', 'finance', 'admin', 'forum'].includes(currentView) && (
        <Navigation 
            currentView={currentView} 
            setView={setView} 
            user={user} 
            hasUnreadMessages={unreadForum} 
        />
      )}

      {/* Connection Status Indicators */}
      {user && (!isConnected && bypassConnection && !socketGame) && currentView !== 'landing' && currentView !== 'auth' && (
          <div className="fixed top-4 right-4 z-50 animate-pulse">
              <div className="bg-red-500/20 border border-red-500/50 backdrop-blur-md text-red-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
                  <WifiOff size={12} /> Offline Mode
              </div>
          </div>
      )}

      {user && (!isConnected && !bypassConnection && hasConnectedOnce) && (
          <div className="fixed top-4 right-4 z-50">
              <div className="bg-yellow-500/20 border border-yellow-500/50 backdrop-blur-md text-yellow-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
                  <RefreshCw size={12} className="animate-spin" /> Reconnecting...
              </div>
          </div>
      )}

      <AnimatePresence>
          {incomingChallenge && (
              <ChallengeRequestModal 
                  challenge={incomingChallenge}
                  onAccept={handleAcceptChallenge}
                  onDecline={() => setIncomingChallenge(null)}
              />
          )}
      </AnimatePresence>

      {gameResult && (
          <GameResultOverlay 
             result={gameResult.result} 
             amount={gameResult.amount} 
             onContinue={finalizeGameEnd} 
              />
      )}

      <main id="main-scroll-container" className="flex-1 relative overflow-y-auto h-screen scrollbar-hide">
        {currentView !== 'landing' && currentView !== 'auth' && currentView !== 'how-it-works' && (
             <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-600/10 rounded-full blur-[100px]"></div>
            </div>
        )}

        {currentView === 'landing' && <LandingPage onLogin={() => setView('auth')} onHowItWorks={() => setView('how-it-works')} />}
        {currentView === 'how-it-works' && <HowItWorks onBack={() => setView('landing')} onLogin={() => setView('auth')} />}
        {currentView === 'auth' && <AuthScreen onAuthenticated={(guestUser?: User) => { if (guestUser) { setUser(guestUser); setView('dashboard'); } }} />}

        {user && (
            <>
                {currentView === 'dashboard' && <Dashboard user={user} setView={setView} onTopUp={() => setView('finance')} onQuickMatch={handleDashboardQuickMatch} />}
                {currentView === 'lobby' && <Lobby user={user} setView={setView} onQuickMatch={startMatchmaking} initialGameId={preSelectedGame} onClearInitialGame={() => setPreSelectedGame(null)} />}
                {currentView === 'matchmaking' && (
                    <MatchmakingScreen 
                        user={user} 
                        gameType={matchmakingConfig?.gameType || 'Ludo'}
                        stake={matchmakingConfig?.stake || 100}
                        onMatchFound={() => {}} 
                        onCancel={cancelMatchmaking}
                        isSocketMode={true} 
                    />
                )}

                {/* SOCKET GAME RENDERING - UNIVERSAL */}
                {currentView === 'game' && socketGame ? (
                     <GameErrorBoundary onReset={() => setView('lobby')}>
                         {socketGame.gameType === 'Dice' && <DiceGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />}
                         {socketGame.gameType === 'TicTacToe' && <TicTacToeGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />}
                         {socketGame.gameType === 'Checkers' && <CheckersGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />}
                         {socketGame.gameType === 'Chess' && <ChessGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />}
                         {socketGame.gameType === 'Cards' && <CardGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />}
                         {socketGame.gameType === 'Ludo' && <GameRoom table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />}
                     </GameErrorBoundary>
                ) : (
                    // Fallback to original Game Room (Local/Firebase Mode)
                    currentView === 'game' && activeTable && (
                        <GameErrorBoundary onReset={() => setView('lobby')}>
                            {activeTable.gameType === 'Ludo' && <GameRoom table={activeTable} user={user} onGameEnd={handleGameEnd} />}
                            {activeTable.gameType === 'TicTacToe' && <TicTacToeGame table={activeTable} user={user} onGameEnd={handleGameEnd} />}
                            {activeTable.gameType === 'Checkers' && <CheckersGame table={activeTable} user={user} onGameEnd={handleGameEnd} />}
                            {activeTable.gameType === 'Chess' && <ChessGame table={activeTable} user={user} onGameEnd={handleGameEnd} />}
                            {activeTable.gameType === 'Dice' && <DiceGame table={activeTable} user={user} onGameEnd={handleGameEnd} />}
                            {activeTable.gameType === 'Cards' && <CardGame table={activeTable} user={user} onGameEnd={handleGameEnd} />}
                        </GameErrorBoundary>
                    )
                )}

                {/* Other Views */}
                {currentView === 'finance' && <Finance user={user} onTopUp={() => {}} />}
                {currentView === 'profile' && <Profile user={user} onLogout={handleLogout} onUpdateProfile={() => {}} onNavigate={setView} />}
                {currentView === 'admin' && <AdminDashboard user={user} />}
                {currentView === 'help-center' && <HelpCenter onBack={() => setView('profile')} />}
                {currentView === 'report-bug' && <ReportBug onBack={() => setView('profile')} />}
                {currentView === 'terms' && <TermsOfService onBack={() => setView('profile')} />}
                {currentView === 'forum' && <Forum user={user} />}
            </>
        )}
      </main>
    </div>
    </LanguageProvider>
  );
}