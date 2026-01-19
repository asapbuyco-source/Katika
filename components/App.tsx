
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ViewState, User, Table, Challenge } from '../types';
import { Dashboard } from './Dashboard';
import { Lobby } from './Lobby';
import { GameRoom } from './GameRoom'; // Keep for non-socket fallback or reference
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
    createBotMatch, subscribeToIncomingChallenges, respondToChallenge, createChallengeGame, getGame 
} from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { Loader2, Wifi, WifiOff, Clock, AlertCircle } from 'lucide-react';

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

  // Ref to track user without triggering re-renders in socket listeners
  const userRef = useRef<User | null>(null);

  // Sync Ref
  useEffect(() => {
      userRef.current = user;
  }, [user]);

  // 1. Initialize Socket Connection (Run Once)
  useEffect(() => {
    // Connect to Render Backend
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

    newSocket.on('turn_timeout', (data) => {
        // Optional: Show toast or feedback
        console.log("Turn timed out");
    });

    newSocket.on('dice_rolled', ({ value }) => {
        console.log("Dice rolled:", value);
    });

    // Handle Win/Loss based on User ID
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
          socket.emit('join_game', { stake: stake, userProfile: user, privateRoomId: specificGameId, gameType: gameType });
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
      socket.emit('join_game', { stake: stake, userProfile: user, gameType: gameType });
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

  // Robustly Construct socketTable using useMemo to avoid recalculations and null crashes
  const socketTable: Table | null = useMemo(() => {
      if (!socketGame || !user) return null;
      
      // Safe access to players array
      const players = socketGame.players || [];
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

  if (authLoading) {
      return (
          <div className="min-h-screen bg-royal-950 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
      );
  }

  // --- REMOVED BLOCKING SCREEN FOR DISCONNECT ---
  // Users (especially Admin) can now access the app even if socket is disconnected.
  // Connection status is handled via UI indicators.

  const renderGameView = () => {
      // 1. Socket Game Mode (Priority)
      if (socketGame) {
          if (!socketTable) return <div className="min-h-screen flex items-center justify-center text-white">Loading Match Data...</div>;

          switch (socketGame.gameType) {
              case 'Dice':
                  return <DiceGame table={socketTable} user={user!} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />;
              case 'Ludo':
                  // Ludo Fallback Render
                  return (
                      <div className="min-h-screen flex flex-col items-center justify-center p-4">
                          <div className="max-w-3xl w-full glass-panel p-8 rounded-3xl border border-gold-500/30 bg-royal-900/80 shadow-2xl text-center">
                              <h2 className="text-2xl font-bold text-white mb-4">Ludo Arena (P2P Beta)</h2>
                              <div className="text-slate-400 mb-6">Game in progress...</div>
                              <button 
                                  onClick={() => socket!.emit('game_action', { roomId: socketGame.roomId, action: { type: 'ROLL' } })}
                                  className="px-8 py-4 bg-gold-500 text-royal-950 font-black rounded-xl hover:scale-105 transition-transform"
                              >
                                  ROLL DICE ({socketGame.diceValue || '-'})
                              </button>
                          </div>
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
                  // Generic fallback for unmapped socket games
                  return (
                      <div className="min-h-screen flex items-center justify-center text-white">
                          <div className="text-center">
                              <h2 className="text-xl font-bold mb-2">Game Type: {socketGame.gameType}</h2>
                              <p className="text-slate-400">P2P sync active. Using generic view.</p>
                              <button onClick={() => setView('lobby')} className="mt-4 px-4 py-2 bg-white/10 rounded-lg">Return to Lobby</button>
                          </div>
                      </div>
                  );
          }
      }

      // 2. Firebase/Local Game Mode (Fallback)
      if (activeTable) {
          switch (activeTable.gameType) {
              case 'Ludo': return <GameRoom table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
              case 'TicTacToe': return <TicTacToeGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
              case 'Checkers': return <CheckersGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
              case 'Chess': return <ChessGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
              case 'Dice': return <DiceGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
              case 'Cards': return <CardGame table={activeTable} user={user!} onGameEnd={handleGameEnd} />;
              default: return <div>Unknown Game Type</div>;
          }
      }

      // 3. Error/Loading State if in 'game' view but no data
      return <div className="min-h-screen flex items-center justify-center text-white">Initializing Game...</div>;
  };

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

        {/* CONNECTION STATUS INDICATOR */}
        {user && !isConnected && currentView !== 'landing' && currentView !== 'auth' && (
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-xs font-bold backdrop-blur-sm">
                <WifiOff size={14} className="animate-pulse" /> Offline
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

                {/* UNIFIED GAME RENDERER */}
                {currentView === 'game' && renderGameView()}

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
