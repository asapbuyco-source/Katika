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
import { Loader2, Wifi, WifiOff, Clock, AlertTriangle } from 'lucide-react';

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

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-royal-950">
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Game Error</h2>
          <p className="text-slate-400 mb-6">We apologize for the interruption.</p>
          <button 
            onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }}
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
  const [socketGame, setSocketGame] = useState<any>(null); // Simplified Socket Game State
  const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(20); // Local countdown state

  // 1. Initialize Socket Connection
  useEffect(() => {
    // Connect to Railway Backend
    const newSocket = io("https://katika-production.up.railway.app");

    newSocket.on('connect', () => {
        console.log("Connected to Vantage Referee (Railway)");
        setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
        setIsConnected(false);
    });

    newSocket.on('match_found', (gameState) => {
        console.log("Socket Match Found!", gameState);
        setSocketGame(gameState);
        setIsWaitingForSocketMatch(false);
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

    // Handle Win/Loss based on User ID
    newSocket.on('game_over', ({ winner }) => {
        // Handled by specific game components or here if needed, 
        // but explicit handling inside effect below is safer for user context
    });

    setSocket(newSocket);

    return () => {
        newSocket.close();
    };
  }, []);

  // Handle Game Over Logic with access to 'user' state
  useEffect(() => {
      if (!socket) return;
      
      const handleGameOver = ({ winner }: { winner: string }) => {
          if (user && winner === user.id) {
              setGameResult({ result: 'win', amount: 0 }); 
          } else {
              setGameResult({ result: 'loss', amount: 0 });
          }
          setSocketGame(null);
      };

      socket.on('game_over', handleGameOver);
      return () => { socket.off('game_over', handleGameOver); };
  }, [socket, user]);


  // 2. Timer Logic
  useEffect(() => {
      if (!socketGame || !socketGame.turnExpiresAt) return;

      const interval = setInterval(() => {
          const delta = Math.max(0, Math.ceil((socketGame.turnExpiresAt - Date.now()) / 1000));
          setTimeLeft(delta);
      }, 1000);

      return () => clearInterval(interval);
  }, [socketGame]);

  // 3. Firebase Auth & Real-time Database Listener
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

  // 4. Navigation Guard
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
      if (!user || !socket) return;

      // Handle Private Matches via Socket
      if (specificGameId) {
          setMatchmakingConfig({ stake, gameType });
          setView('matchmaking');
          // Emit with privateRoomId
          socket.emit('join_game', { stake: stake, userProfile: user, privateRoomId: specificGameId, gameType });
          return;
      }

      if (stake === -1) {
          // Bot match (Firebase)
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

  // --- RENDER ---

  if (authLoading) {
      return (
          <div className="min-h-screen bg-royal-950 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
      );
  }

  // Socket Connection Loading Screen
  if (!isConnected && user) {
      return (
          <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 size={48} className="text-gold-500 animate-spin mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Connecting to Vantage Network...</h2>
              <p className="text-slate-400 max-w-md">
                  Establishing secure connection...
              </p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans md:flex">
      {user && ['dashboard', 'lobby', 'profile', 'finance', 'admin', 'forum'].includes(currentView) && (
        <Navigation currentView={currentView} setView={setView} user={user} />
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

                {/* SIMPLIFIED SOCKET GAME BOARD */}
                {currentView === 'game' && socketGame ? (
                     <GameErrorBoundary onReset={() => setView('lobby')}>
                         <div className="min-h-screen flex flex-col items-center justify-center p-4">
                            <div className="max-w-3xl w-full glass-panel p-8 rounded-3xl border border-gold-500/30 bg-royal-900/80 shadow-2xl">
                                {/* ... (Existing Socket Board UI) ... */}
                                <div className="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
                                    <div>
                                        <h2 className="text-3xl font-display font-bold text-white mb-1">Vantage Arena</h2>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 text-sm text-green-400">
                                                <Wifi size={16} /> Connected
                                            </div>
                                            {/* TURN TIMER */}
                                            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold font-mono transition-colors ${timeLeft < 10 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-royal-800 text-gold-400'}`}>
                                                <Clock size={12} /> {timeLeft}s
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-mono text-gold-400 uppercase tracking-widest mb-1">Pot Size</div>
                                        <div className="text-2xl font-bold text-white">{(socketGame.stake * 2).toLocaleString()} FCFA</div>
                                    </div>
                                </div>

                                {/* Simplified Track */}
                                <div className="relative mb-12">
                                    <div className="grid grid-cols-5 md:grid-cols-8 gap-3 md:gap-4">
                                        {[...Array(16)].map((_, i) => {
                                            // UPDATED: Use user.id instead of socket.id for state check
                                            const isMe = socketGame.positions && socketGame.positions[user.id] === i;
                                            // Opponent is anyone in players array who is NOT me
                                            const opponentId = socketGame.players ? socketGame.players.find((id: string) => id !== user.id) : null;
                                            const isOpp = socketGame.positions && opponentId && socketGame.positions[opponentId] === i;
                                            const isFinish = i === 15;

                                            return (
                                                <div key={i} className={`
                                                    aspect-square rounded-xl border-2 flex items-center justify-center relative transition-all duration-300
                                                    ${isMe ? 'border-gold-500 bg-gold-500/20 shadow-[0_0_15px_gold]' : 
                                                      isOpp ? 'border-red-500 bg-red-500/20 shadow-[0_0_15px_red]' : 
                                                      isFinish ? 'border-green-500/50 bg-green-500/10' : 'border-white/5 bg-black/20'}
                                                `}>
                                                    <span className="absolute bottom-1 right-2 text-xs font-mono text-slate-600">{i}</span>
                                                    {isFinish && <span className="text-[10px] text-green-400 font-bold uppercase">Finish</span>}
                                                    
                                                    {/* Player Markers */}
                                                    <AnimatePresence>
                                                        {isMe && (
                                                            <motion.div 
                                                                layoutId="my-piece"
                                                                className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gold-500 shadow-lg border-2 border-white z-10"
                                                            />
                                                        )}
                                                        {isOpp && (
                                                            <motion.div 
                                                                layoutId="opp-piece"
                                                                className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-red-500 shadow-lg border-2 border-white absolute top-1 left-1 z-0"
                                                            />
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex flex-col items-center gap-6">
                                    <div className="text-2xl font-bold text-white">
                                        {/* UPDATED: Check Turn against user.id */}
                                        {socketGame.turn === user.id ? (
                                            <motion.span 
                                                animate={{ opacity: [1, 0.5, 1] }} 
                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                                className="text-gold-400"
                                            >
                                                YOUR TURN
                                            </motion.span>
                                        ) : (
                                            <span className="text-slate-500">Opponent is thinking...</span>
                                        )}
                                    </div>
                                    
                                    <div className="h-24 flex items-center justify-center">
                                        <AnimatePresence mode="wait">
                                            {socketGame.diceValue ? (
                                                <motion.div 
                                                    key="dice"
                                                    initial={{ scale: 0, rotate: 180 }}
                                                    animate={{ scale: 1, rotate: 0 }}
                                                    className="text-6xl font-black text-white p-6 bg-white/5 rounded-2xl border border-white/10"
                                                >
                                                    {socketGame.diceValue}
                                                </motion.div>
                                            ) : (
                                                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center text-slate-600">
                                                    ?
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => socket!.emit('roll_dice', { roomId: socketGame.roomId })}
                                            disabled={socketGame.turn !== user.id || socketGame.diceValue !== null}
                                            className="px-8 py-4 bg-gold-500 text-royal-950 font-black rounded-xl hover:scale-105 transition-transform disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(251,191,36,0.3)]"
                                        >
                                            ROLL DICE
                                        </button>
                                        
                                        <button 
                                            onClick={() => socket!.emit('move_piece', { roomId: socketGame.roomId })}
                                            disabled={socketGame.turn !== user.id || socketGame.diceValue === null}
                                            className="px-8 py-4 bg-green-500 text-white font-black rounded-xl hover:scale-105 transition-transform disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                                        >
                                            MOVE PIECE
                                        </button>
                                    </div>
                                </div>

                            </div>
                         </div>
                     </GameErrorBoundary>
                ) : (
                    // Fallback to original Game Room if not socket game (or using Firebase mode)
                    currentView === 'game' && activeTable && (
                        <GameErrorBoundary onReset={() => setView('lobby')}>
                            {activeTable.gameType === 'Ludo' && (
                                <GameRoom 
                                    table={activeTable} 
                                    user={user}
                                    onGameEnd={handleGameEnd} 
                                />
                            )}
                            {activeTable.gameType === 'TicTacToe' && (
                                <TicTacToeGame 
                                    table={activeTable} 
                                    user={user} 
                                    onGameEnd={handleGameEnd} 
                                />
                            )}
                            {activeTable.gameType === 'Checkers' && (
                                <CheckersGame 
                                    table={activeTable} 
                                    user={user} 
                                    onGameEnd={handleGameEnd} 
                                />
                            )}
                            {activeTable.gameType === 'Chess' && (
                                <ChessGame 
                                    table={activeTable} 
                                    user={user} 
                                    onGameEnd={handleGameEnd} 
                                />
                            )}
                            {activeTable.gameType === 'Dice' && (
                                <DiceGame 
                                    table={activeTable} 
                                    user={user} 
                                    onGameEnd={handleGameEnd} 
                                />
                            )}
                            {activeTable.gameType === 'Cards' && (
                                <CardGame 
                                    table={activeTable} 
                                    user={user} 
                                    onGameEnd={handleGameEnd} 
                                />
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