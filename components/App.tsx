import React, { useState, useEffect, useRef, useMemo, Component, ErrorInfo } from 'react';
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
import { WifiOff, AlertTriangle } from 'lucide-react';

// --- Error Boundary ---
class GameErrorBoundary extends React.Component<{ children: React.ReactNode, onReset: () => void }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode, onReset: () => void }) {
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
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Game Error</h2>
          <button 
            onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }}
            className="px-6 py-3 bg-white/10 rounded-xl text-white font-bold"
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
  const [preSelectedGame, setPreSelectedGame] = useState<string | null>(null);
  const [incomingChallenge, setIncomingChallenge] = useState<Challenge | null>(null);

  // --- SOCKET.IO STATE ---
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // 2. THE BLANK SCREEN FIX: Create state gameState
  const [gameState, setGameState] = useState<any>(null); // Replaces socketGame
  
  const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
      userRef.current = user;
  }, [user]);

  // 1. Connect using Railway URL
  useEffect(() => {
    const newSocket = io("https://katika-production.up.railway.app");

    newSocket.on('connect', () => {
        console.log("Connected to Vantage Referee");
        setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
        setIsConnected(false);
    });

    newSocket.on('match_found', (data) => {
        console.log("Socket Match Found!", data);
        setGameState(data); // Set the game state
        setIsWaitingForSocketMatch(false);
        setView('game');
    });

    newSocket.on('waiting_for_opponent', () => {
        setIsWaitingForSocketMatch(true);
    });

    newSocket.on('game_update', (data) => {
        setGameState(data);
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
        setGameState(null);
    });

    setSocket(newSocket);

    return () => {
        newSocket.close();
    };
  }, []); 

  // Firebase Auth
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

  // Navigation Guard
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
          // Private match logic (simplified)
          return;
      }

      if (stake === -1) {
          // Bot match logic
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
          } catch (error) { console.error(error); }
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
    setGameState(null);
    setView('dashboard');
  };

  const handleLogout = async () => {
      await logout();
      setUser(null);
      setView('landing');
  };
  
  // Safe Socket Table Construction
  const socketTable: Table | null = useMemo(() => {
      if (!gameState || !user) return null;
      
      const players = Array.isArray(gameState.players) ? gameState.players : [];
      const hostId = players[0] || 'unknown';
      const guestId = players[1] || 'unknown';

      return {
          id: gameState.roomId || 'temp_room',
          gameType: gameState.gameType as any,
          stake: gameState.stake || 0,
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
  }, [gameState, user]);

  // --- RENDER ---

  // 3. THE BLANK SCREEN FIX: Guard Clause
  // Note: Only apply this when in 'game' view waiting for socket, otherwise it blocks the whole app
  if (currentView === 'game' && !gameState && !activeTable) {
     return (
       <div className="flex h-screen bg-indigo-950 items-center justify-center text-yellow-400">
         <div className="text-center">
            <div className="animate-spin h-10 w-10 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Connecting to Vantage Referee...</p>
         </div>
       </div>
     );
  }

  // 4. Only render Game Board if gameState is NOT null (Implicitly handled above, but explicit here)
  const renderGameView = () => {
      if (gameState) {
          if (!socketTable) return null; // Should be caught by guard clause

          return (
              <GameErrorBoundary onReset={() => setView('lobby')}>
                  {gameState.gameType === 'Dice' && <DiceGame table={socketTable} user={user!} onGameEnd={handleGameEnd} socket={socket} socketGame={gameState} />}
                  {gameState.gameType === 'Checkers' && <CheckersGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />}
                  {gameState.gameType === 'TicTacToe' && <TicTacToeGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />}
                  {gameState.gameType === 'Chess' && <ChessGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />}
                  {gameState.gameType === 'Cards' && <CardGame table={socketTable} user={user!} onGameEnd={handleGameEnd} />}
                  {gameState.gameType === 'Ludo' && (
                      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
                          <h2 className="text-2xl font-bold text-white mb-4">Ludo Arena (P2P)</h2>
                          <p className="text-slate-400 mb-6">Game Active. Use Mobile.</p>
                          <button onClick={() => setView('lobby')} className="px-6 py-3 bg-white/10 rounded-xl text-white">Back</button>
                      </div>
                  )}
              </GameErrorBoundary>
          );
      }

      // Local/Bot Games
      if (activeTable) {
          return (
              <GameErrorBoundary onReset={() => setView('lobby')}>
                  {activeTable.gameType === 'Ludo' && <GameRoom table={activeTable} user={user!} onGameEnd={handleGameEnd} />}
                  {activeTable.gameType === 'TicTacToe' && <TicTacToeGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />}
                  {activeTable.gameType === 'Checkers' && <CheckersGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />}
                  {activeTable.gameType === 'Chess' && <ChessGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />}
                  {activeTable.gameType === 'Dice' && <DiceGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />}
                  {activeTable.gameType === 'Cards' && <CardGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />}
              </GameErrorBoundary>
          );
      }
      
      return null;
  };

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans md:flex">
      {user && ['dashboard', 'lobby', 'profile', 'finance', 'admin', 'forum'].includes(currentView) && (
        <Navigation currentView={currentView} setView={setView} user={user} />
      )}

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
        {currentView !== 'landing' && currentView !== 'auth' && (
             <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-600/10 rounded-full blur-[100px]"></div>
            </div>
        )}

        {/* Connection Indicator */}
        {user && !isConnected && currentView !== 'landing' && currentView !== 'auth' && (
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-xs font-bold backdrop-blur-sm shadow-lg">
                <WifiOff size={14} className="animate-pulse" /> Offline
            </div>
        )}

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