import React, { Component, useState, useEffect, useRef, useMemo, ErrorInfo } from 'react';
import { ViewState, User, Table, Challenge } from './types';
import { Dashboard } from './components/Dashboard';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom'; 
import { CheckersGame } from './components/CheckersGame';
import { DiceGame } from './components/DiceGame';
import { TicTacToeGame } from './components/TicTacToeGame';
import { ChessGame } from './components/ChessGame';
import { CardGame } from './components/CardGame';
import { Finance } from './components/Finance';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/LandingPage';
import { MatchmakingScreen } from './components/MatchmakingScreen';
import { AuthScreen } from './components/AuthScreen';
import { Profile } from './components/Profile';
import { HowItWorks } from './components/HowItWorks';
import { AdminDashboard } from './components/AdminDashboard';
import { HelpCenter } from './components/HelpCenter';
import { ReportBug } from './components/ReportBug';
import { TermsOfService } from './components/TermsOfService';
import { Forum } from './components/Forum';
import { GameResultOverlay } from './components/GameResultOverlay';
import { ChallengeRequestModal } from './components/ChallengeRequestModal';
import { 
    auth, syncUserProfile, logout, subscribeToUser, addUserTransaction, 
    createBotMatch, subscribeToIncomingChallenges, respondToChallenge, createChallengeGame, getGame 
} from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { Loader2, Wifi, WifiOff, Clock, AlertTriangle, Play, ServerOff, RefreshCw } from 'lucide-react';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children?: React.ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class GameErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
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

  // 1. Initialize Socket Connection with Fallback Logic
  useEffect(() => {
    const SOCKET_URL = "https://katika-production.up.railway.app";
    
    // Timer to track connection duration
    const timerInterval = setInterval(() => {
        setConnectionTime(prev => prev + 1);
    }, 1000);

    console.log("Initializing Socket Connection to:", SOCKET_URL);

    const newSocket = io(SOCKET_URL, {
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 20000, 
        transports: ['websocket', 'polling'] // Try both transports
    });

    newSocket.on('connect', () => {
        console.log("Connected to Vantage Referee (Railway)");
        setIsConnected(true);
        setHasConnectedOnce(true);
        setBypassConnection(false); // Auto-recover from offline mode
        clearInterval(timerInterval); // Stop the countdown
    });

    newSocket.on('disconnect', () => {
        setIsConnected(false);
        // Do NOT reset hasConnectedOnce here, to prevent offline mode screen from flashing
    });

    newSocket.on('connect_error', (err) => {
        console.warn("Socket Connection Error:", err.message);
    });

    newSocket.on('match_found', (gameState) => {
        console.log("Socket Match Found!", gameState);
        setSocketGame(gameState);
        setIsWaitingForSocketMatch(false);
        // Ensure we exit offline mode if a match is found (even if socket flaked)
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

  // 2. Automatic Fallback Logic
  useEffect(() => {
      // If 15 seconds pass and not connected, auto-enable offline mode
      // CRITICAL FIX: Do NOT switch to offline mode if we have ever connected OR if a game is currently loaded
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
          // Do not immediately nullify socketGame to prevent UI flash, handled by finalize
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

  // 5. Firebase Auth & Real-time Database Listener
  useEffect(() => {
      let unsubscribeSnapshot: (() => void) | undefined;
      let unsubscribeChallenges: (() => void) | undefined;

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

              } catch (error) {
                  console.error("Profile sync failed:", error);
              }
          } else {
              if (unsubscribeSnapshot) unsubscribeSnapshot();
              if (unsubscribeChallenges) unsubscribeChallenges();
              setUser(null);
          }
          setAuthLoading(false);
      });

      return () => {
          unsubscribeAuth();
          if (unsubscribeSnapshot) unsubscribeSnapshot();
          if (unsubscribeChallenges) unsubscribeChallenges();
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
  // Only show this if we have NEVER connected and we haven't bypassed yet
  if (!isConnected && !hasConnectedOnce && user && !bypassConnection) {
      return (
          <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 size={48} className="text-gold-500 animate-spin mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Connecting to Vantage Network...</h2>
              <p className="text-slate-400 max-w-md mb-8">
                  {connectionTime > 3 ? "Waking up server..." : "Establishing secure connection..."}
              </p>
              
              {/* Progress Indicator */}
              <div className="w-64 h-2 bg-royal-800 rounded-full overflow-hidden mb-4">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 7, ease: "linear" }}
                    className="h-full bg-gold-500"
                  />
              </div>
              <p className="text-xs text-slate-500">Entering Offline Mode in {Math.max(0, 7 - connectionTime)}s...</p>
              
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
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans md:flex">
      {user && ['dashboard', 'lobby', 'profile', 'finance', 'admin', 'forum'].includes(currentView) && (
        <Navigation currentView={currentView} setView={setView} user={user} />
      )}

      {/* Connection Status Indicator - OFFLINE MODE (Only show if NOT in a socket game) */}
      {user && (!isConnected && bypassConnection && !socketGame) && currentView !== 'landing' && currentView !== 'auth' && (
          <div className="fixed top-4 right-4 z-50 animate-pulse">
              <div className="bg-red-500/20 border border-red-500/50 backdrop-blur-md text-red-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
                  <WifiOff size={12} /> Offline Mode
              </div>
          </div>
      )}

      {/* Connection Status Indicator - RECONNECTING (For subsequent drops during gameplay) */}
      {user && (!isConnected && !bypassConnection && hasConnectedOnce) && (
          <div className="fixed top-4 right-4 z-50">
              <div className="bg-yellow-500/20 border border-yellow-500/50 backdrop-blur-md text-yellow-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
                  <RefreshCw size={12} className="animate-spin" /> Reconnecting...
              </div>
          </div>
      )}

      {/* Challenge Request Modal */}
      <AnimatePresence>
          {incomingChallenge && (
              <ChallengeRequestModal 
                  challenge={incomingChallenge}
                  onAccept={handleAcceptChallenge}
                  onDecline={() => setIncomingChallenge(null)}
              />
          )}
      </AnimatePresence>

      {/* Game Result Overlay */}
      {gameResult && (
          <GameResultOverlay 
             result={gameResult.result} 
             amount={gameResult.amount} 
             onContinue={finalizeGameEnd} 
              />
      )}

      <main id="main-scroll-container" className="flex-1 relative overflow-y-auto h-screen scrollbar-hide">
        {currentView !== 'landing' && currentView !== 'auth' && (
             <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-600/10 rounded-full blur-[100px]"></div>
            </div>
        )}

        {currentView === 'landing' && (
            <LandingPage 
                onLogin={() => setView('auth')} 
                onHowItWorks={() => setView('how-it-works')}
            />
        )}

        {currentView === 'auth' && (
            <AuthScreen onAuthenticated={(guestUser?: User) => {
                if (guestUser) {
                    setUser(guestUser);
                    setView('dashboard');
                }
            }} />
        )}

        {user && (
            <>
                {currentView === 'dashboard' && (
                    <Dashboard 
                        user={user} 
                        setView={setView} 
                        onTopUp={() => setView('finance')} 
                        onQuickMatch={handleDashboardQuickMatch}
                    />
                )}
                
                {currentView === 'lobby' && (
                    <Lobby 
                        user={user}
                        setView={setView} 
                        onQuickMatch={startMatchmaking}
                        initialGameId={preSelectedGame}
                        onClearInitialGame={() => setPreSelectedGame(null)}
                    />
                )}

                {currentView === 'matchmaking' && (
                    <MatchmakingScreen 
                        user={user} 
                        gameType={matchmakingConfig?.gameType || 'Ludo'}
                        stake={matchmakingConfig?.stake || 100}
                        onMatchFound={() => {}} // Handled by socket event
                        onCancel={cancelMatchmaking}
                        isSocketMode={true} // ENABLE SOCKET MODE FOR MATCHMAKING
                    />
                )}

                {/* SOCKET GAME RENDERING */}
                {currentView === 'game' && socketGame ? (
                     <GameErrorBoundary onReset={() => setView('lobby')}>
                         {socketGame.gameType === 'Dice' && (
                             <DiceGame 
                                table={constructTableFromSocket(socketGame)}
                                user={user}
                                onGameEnd={handleGameEnd}
                                socket={socket}
                                socketGame={socketGame}
                             />
                         )}
                         {socketGame.gameType === 'TicTacToe' && (
                             <TicTacToeGame 
                                table={constructTableFromSocket(socketGame)}
                                user={user}
                                onGameEnd={handleGameEnd}
                                socket={socket}
                                socketGame={socketGame}
                             />
                         )}
                         {/* Fallback for other games: render as local for now, but prevent the 'Connecting...' hang */}
                         {['Checkers', 'Chess', 'Cards', 'Ludo'].includes(socketGame.gameType) && (
                             <div className="relative">
                                 {/* Overlay to inform P2P limitation for unfinished games */}
                                 <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs text-white flex items-center gap-2">
                                     <AlertTriangle size={14} className="text-yellow-500" />
                                     <span>Full P2P not yet supported for {socketGame.gameType}. Playing Local Mode.</span>
                                 </div>
                                 
                                 {socketGame.gameType === 'Checkers' && <CheckersGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} />}
                                 {socketGame.gameType === 'Chess' && <ChessGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} />}
                                 {socketGame.gameType === 'Cards' && <CardGame table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} />}
                                 {socketGame.gameType === 'Ludo' && <GameRoom table={constructTableFromSocket(socketGame)} user={user} onGameEnd={handleGameEnd} />}
                             </div>
                         )}
                     </GameErrorBoundary>
                ) : (
                    // Fallback to original Game Room (Local/Firebase Mode)
                    currentView === 'game' && activeTable && (
                        <GameErrorBoundary onReset={() => setView('lobby')}>
                            {activeTable.gameType === 'Ludo' && (
                                <GameRoom table={activeTable} user={user} onGameEnd={handleGameEnd} />
                            )}
                            {activeTable.gameType === 'TicTacToe' && (
                                <TicTacToeGame table={activeTable} user={user} onGameEnd={handleGameEnd} />
                            )}
                            {activeTable.gameType === 'Checkers' && (
                                <CheckersGame table={activeTable} user={user} onGameEnd={handleGameEnd} />
                            )}
                            {activeTable.gameType === 'Chess' && (
                                <ChessGame table={activeTable} user={user} onGameEnd={handleGameEnd} />
                            )}
                            {activeTable.gameType === 'Dice' && (
                                <DiceGame table={activeTable} user={user} onGameEnd={handleGameEnd} />
                            )}
                            {activeTable.gameType === 'Cards' && (
                                <CardGame table={activeTable} user={user} onGameEnd={handleGameEnd} />
                            )}
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
  );
}