
import React, { useState, useEffect, useRef, useMemo, ErrorInfo } from 'react';
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
    auth, syncUserProfile, logout, subscribeToUser, createBotMatch, 
    subscribeToIncomingChallenges, respondToChallenge, getGame 
} from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { Loader2, WifiOff, AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// --- Error Boundary to prevent White Screens ---
class GameErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Game Critical Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-royal-950">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
             <AlertTriangle size={40} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Game Error</h2>
          <p className="text-slate-400 mb-8 max-w-xs mx-auto">
            A synchronization issue occurred. Your funds are safe. Please return to the lobby.
          </p>
          <button 
            onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }}
            className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold transition-all border border-white/10"
          >
            Return to Lobby
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Loading Component ---
const LoadingScreen = ({ message = "Loading..." }: { message?: string }) => (
    <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 size={48} className="text-gold-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">{message}</h2>
        <p className="text-slate-400 text-sm">Syncing with Vantage Network...</p>
    </div>
);

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
  const [socketGame, setSocketGame] = useState<any>(null); 
  const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
  
  // Ref to track user without triggering re-renders in socket listeners
  const userRef = useRef<User | null>(null);

  // Sync Ref
  useEffect(() => {
      userRef.current = user;
  }, [user]);

  // 1. Initialize Socket Connection
  useEffect(() => {
    const newSocket = io("https://katika-n8q5.onrender.com");

    newSocket.on('connect', () => {
        console.log("Connected to Vantage Referee");
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

    newSocket.on('game_over', ({ winner }) => {
        const currentUser = userRef.current;
        if (currentUser) {
            if (winner === currentUser.id) {
                setGameResult({ result: 'win', amount: 0 }); 
            } else {
                setGameResult({ result: 'loss', amount: 0 });
            }
        }
        setSocketGame(null);
    });

    setSocket(newSocket);

    return () => {
        newSocket.close();
    };
  }, []); 

  // 2. Firebase Auth
  useEffect(() => {
      const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
              try {
                  const appUser = await syncUserProfile(firebaseUser);
                  setUser(appUser);
                  subscribeToUser(appUser.id, setUser);
                  subscribeToIncomingChallenges(appUser.id, setIncomingChallenge);
              } catch (error) {
                  console.error("Profile sync failed:", error);
              }
          } else {
              setUser(null);
          }
          setAuthLoading(false);
      });
      return () => unsubscribeAuth();
  }, []);

  // 3. Navigation Guard
  useEffect(() => {
      if (authLoading) return;
      if (user) {
          if (currentView === 'landing' || currentView === 'auth') setView('dashboard');
      } else {
          if (['dashboard', 'lobby', 'matchmaking', 'game', 'profile', 'finance'].includes(currentView)) {
              setView('landing');
          }
      }
  }, [user, currentView, authLoading]);

  // Matchmaking
  const startMatchmaking = async (stake: number, gameType: string, specificGameId?: string) => {
      if (!user || !socket) return;

      if (specificGameId) {
          setMatchmakingConfig({ stake, gameType });
          setView('matchmaking');
          socket.emit('join_game', { stake, userProfile: user, privateRoomId: specificGameId, gameType });
          return;
      }

      if (stake === -1) {
          // Bot match
          try {
              const gameId = await createBotMatch(user, gameType);
              const gameData = await getGame(gameId);
              if (gameData) {
                  setActiveTable({
                      id: gameData.id,
                      gameType: gameData.gameType as any,
                      stake: gameData.stake,
                      players: 2,
                      maxPlayers: 2,
                      status: 'active',
                      host: gameData.host,
                      guest: gameData.guest
                  });
                  setView('game');
              }
          } catch (error) {
              console.error("Bot match failed:", error);
          }
          return;
      }

      setMatchmakingConfig({ stake, gameType });
      setView('matchmaking');
      socket.emit('join_game', { stake, userProfile: user, gameType });
  };

  const cancelMatchmaking = () => {
      setMatchmakingConfig(null);
      setIsWaitingForSocketMatch(false);
      setView('lobby');
  };

  const handleAcceptChallenge = async () => {
      if (!incomingChallenge || !user) return;
      await respondToChallenge(incomingChallenge.id, 'accepted', incomingChallenge.id);
      startMatchmaking(incomingChallenge.stake, incomingChallenge.gameType, incomingChallenge.id);
      setIncomingChallenge(null);
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
  
  // Safe Socket Table Construction
  const socketTable: Table | null = useMemo(() => {
      if (!socketGame || !user) return null;
      
      const players = Array.isArray(socketGame.players) ? socketGame.players : [];
      const hostId = players[0] || 'unknown';
      const guestId = players[1] || 'unknown';

      return {
          id: socketGame.roomId || 'temp_room',
          gameType: socketGame.gameType as any,
          stake: socketGame.stake || 0,
          players: players.length,
          maxPlayers: 2,
          status: 'active',
          host: { 
              id: hostId, 
              name: hostId === user.id ? user.name : 'Player 1', 
              avatar: 'https://i.pravatar.cc/150?u=' + hostId, 
              elo: 1000, 
              rankTier: 'Bronze' 
          },
          guest: { 
              id: guestId, 
              name: guestId === user.id ? user.name : 'Player 2', 
              avatar: 'https://i.pravatar.cc/150?u=' + guestId, 
              elo: 1000, 
              rankTier: 'Bronze' 
          }
      };
  }, [socketGame, user]);

  // --- RENDER ---

  if (authLoading) return <LoadingScreen message="Authenticating..." />;

  const renderGameView = () => {
      // 1. Socket Game Mode
      if (socketGame) {
          if (!socketTable) return <LoadingScreen message="Initializing Match..." />;

          const gameComponent = () => {
              switch (socketGame.gameType) {
                  case 'Dice':
                      return <DiceGame table={socketTable} user={user!} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />;
                  case 'Ludo':
                      return (
                          <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
                              <h2 className="text-2xl font-bold text-white mb-4">Ludo Arena (P2P)</h2>
                              <p className="text-slate-400 mb-6">Game Active. Please use the mobile app for full Ludo experience.</p>
                              <button onClick={() => setView('lobby')} className="px-6 py-3 bg-white/10 rounded-xl text-white">Back to Lobby</button>
                          </div>
                      );
                  case 'Checkers':
                      return <CheckersGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'TicTacToe':
                      return <TicTacToeGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'Chess':
                      return <ChessGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'Cards':
                      return <CardGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />;
                  default:
                      return (
                          <div className="min-h-screen flex flex-col items-center justify-center text-white">
                              <h2 className="text-xl font-bold mb-2">Unknown Game Type: {socketGame.gameType}</h2>
                              <button onClick={() => setView('lobby')} className="px-4 py-2 bg-white/10 rounded-lg">Return to Lobby</button>
                          </div>
                      );
              }
          };

          return (
              <GameErrorBoundary onReset={() => setView('lobby')}>
                  {gameComponent()}
              </GameErrorBoundary>
          );
      }

      // 2. Local/Bot Game Mode
      if (activeTable) {
          const localGame = () => {
              switch (activeTable.gameType) {
                  case 'Ludo': return <GameRoom table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'TicTacToe': return <TicTacToeGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'Checkers': return <CheckersGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'Chess': return <ChessGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'Dice': return <DiceGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
                  case 'Cards': return <CardGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
                  default: return <div>Unknown Game Type</div>;
              }
          };
          
          return (
              <GameErrorBoundary onReset={() => setView('lobby')}>
                  {localGame()}
              </GameErrorBoundary>
          );
      }

      // 3. Fallback Loading
      return <LoadingScreen message="Preparing Game Environment..." />;
  };

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans md:flex">
      {user && ['dashboard', 'lobby', 'profile', 'finance', 'admin', 'forum'].includes(currentView) && (
        <Navigation currentView={currentView} setView={setView} user={user} />
      )}

      {/* Overlays */}
      <AnimatePresence>
          {incomingChallenge && (
              <ChallengeRequestModal 
                  challenge={incomingChallenge}
                  onAccept={handleAcceptChallenge}
                  onDecline={() => setIncomingChallenge(null)}
              />
          )}
          {gameResult && (
              <GameResultOverlay 
                 result={gameResult.result} 
                 amount={gameResult.amount} 
                 onContinue={finalizeGameEnd} 
              />
          )}
      </AnimatePresence>

      <main id="main-scroll-container" className="flex-1 relative overflow-y-auto h-screen scrollbar-hide">
        {/* Background FX */}
        {currentView !== 'landing' && currentView !== 'auth' && (
             <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-600/10 rounded-full blur-[100px]"></div>
            </div>
        )}

        {/* Connection Indicator - Non-blocking now */}
        {user && !isConnected && currentView !== 'landing' && currentView !== 'auth' && (
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-xs font-bold backdrop-blur-sm shadow-lg">
                <WifiOff size={14} className="animate-pulse" /> Offline
            </div>
        )}

        {/* Views */}
        {currentView === 'landing' && (
            <LandingPage onLogin={() => setView('auth')} onHowItWorks={() => setView('how-it-works')} />
        )}

        {currentView === 'auth' && (
            <AuthScreen onAuthenticated={(u) => { if(u) { setUser(u); setView('dashboard'); } }} />
        )}

        {user && (
            <>
                {currentView === 'dashboard' && (
                    <Dashboard 
                        user={user} 
                        setView={setView} 
                        onTopUp={() => setView('finance')} 
                        onQuickMatch={(id) => { if(id) setPreSelectedGame(id); else setPreSelectedGame(null); setView('lobby'); }}
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
                        onMatchFound={() => {}} 
                        onCancel={cancelMatchmaking}
                        isSocketMode={true} 
                    />
                )}

                {currentView === 'game' && renderGameView()}

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
