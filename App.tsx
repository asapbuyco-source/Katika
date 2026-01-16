

import React, { useState, useEffect } from 'react';
import { ViewState, User, Table, Challenge } from './types';
import { Dashboard } from './components/Dashboard';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { CheckersGame } from './components/CheckersGame';
import { DiceGame } from './components/DiceGame';
import { PoolGame } from './components/PoolGame';
import { ChessGame } from './components/ChessGame';
import { Finance } from './components/Finance';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/LandingPage';
import { MatchmakingScreen } from './components/MatchmakingScreen';
import { AuthScreen } from './components/AuthScreen';
import { Profile } from './components/Profile';
import { HowItWorks } from './components/HowItWorks';
import { AdminDashboard } from './components/AdminDashboard';
import { GameResultOverlay } from './components/GameResultOverlay';
import { ChallengeRequestModal } from './components/ChallengeRequestModal';
import { auth, syncUserProfile, logout, subscribeToUser, addUserTransaction, createBotMatch } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence } from 'framer-motion';

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

  // 1. Firebase Auth & Real-time Database Listener
  useEffect(() => {
      let unsubscribeSnapshot: (() => void) | undefined;

      const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
              try {
                  // Initial Sync
                  const appUser = await syncUserProfile(firebaseUser);
                  setUser(appUser);

                  // Setup Real-time Listener for Balance Updates
                  unsubscribeSnapshot = subscribeToUser(appUser.id, (updatedUser) => {
                      setUser(updatedUser);
                  });

              } catch (error) {
                  console.error("Profile sync failed:", error);
              }
          } else {
              if (unsubscribeSnapshot) unsubscribeSnapshot();
              if (!user || user.id.startsWith('guest-')) {
                  // Keep guest or null
              } else {
                 setUser(null);
              }
          }
          setAuthLoading(false);
      });

      return () => {
          unsubscribeAuth();
          if (unsubscribeSnapshot) unsubscribeSnapshot();
      };
  }, []); // Run once on mount

  // 2. Navigation Guard
  useEffect(() => {
      if (authLoading) return;

      if (user) {
          if (currentView === 'landing' || currentView === 'auth') {
              setView('dashboard');
          }
      } else {
          const protectedViews: ViewState[] = ['dashboard', 'lobby', 'matchmaking', 'game', 'profile', 'finance', 'admin'];
          if (protectedViews.includes(currentView)) {
              setView('landing');
          }
      }
  }, [user, currentView, authLoading]);

  // Finance Top Up Handler (Now handled inside Finance component mostly, but this serves as a fallback or event trigger)
  const handleFinanceTopUp = () => {
      // Balance update is handled via Finance component and Firestore listener
  };

  const startMatchmaking = async (stake: number, gameType: string) => {
      if (!user) return;

      if (stake === -1) {
          // BOT MATCH
          try {
              const gameId = await createBotMatch(user, gameType);
              // Fetch game data to construct table
              // In a real app we might just subscribe, but here we construct a table object
              // Since createBotMatch creates it, we can fetch it once or trust defaults
              // We'll trust defaults for speed:
              const table: Table = {
                  id: gameId,
                  gameType: gameType as any,
                  stake: 0,
                  players: 2,
                  maxPlayers: 2,
                  status: 'active',
                  host: { id: 'bot', name: "Vantage AI", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=vantage_bot_9000", elo: 1200, rankTier: 'Silver' }
              };
              setActiveTable(table);
              setView('game');
          } catch (e) {
              console.error("Failed to create bot match", e);
              alert("Could not start practice match.");
          }
      } else {
          setMatchmakingConfig({ stake, gameType });
          setView('matchmaking');
      }
  };

  const cancelMatchmaking = () => {
      setMatchmakingConfig(null);
      setView('lobby');
  };

  const handleMatchFound = async (table: Table) => {
      if (!user) return;
      if (table.stake > 0) {
          if (user.balance < table.stake) {
              alert("Match found but insufficient balance.");
              setView('lobby');
              return;
          }
          
          // Deduct Stake Immediately using DB transaction
          // For guests, we just update local state
          if (user.id.startsWith('guest-')) {
              setUser(prev => prev ? ({ ...prev, balance: prev.balance - table.stake }) : null);
          } else {
              await addUserTransaction(user.id, {
                  type: 'stake',
                  amount: -table.stake,
                  status: 'completed',
                  date: new Date().toISOString()
              });
          }
      }
      setActiveTable(table);
      setView('game');
  };

  // Challenge Response Handlers
  const handleAcceptChallenge = async () => {
      if (!incomingChallenge || !user) return;
      
      const table: Table = {
          id: `match-challenge-${Date.now()}`,
          gameType: incomingChallenge.gameType as any,
          stake: incomingChallenge.stake,
          players: 2,
          maxPlayers: 2,
          status: 'active',
          host: incomingChallenge.sender
      };

      setIncomingChallenge(null);
      await handleMatchFound(table);
  };

  const handleDeclineChallenge = () => {
      setIncomingChallenge(null);
  };

  const handleGameEnd = async (result: 'win' | 'loss' | 'quit') => {
    let amountChanged = 0;

    if (activeTable && activeTable.stake > 0 && user) {
        if (result === 'win') {
            const totalPot = activeTable.stake * 2;
            const fee = totalPot * 0.10;
            const payout = totalPot - fee;
            amountChanged = payout; 
            
            // Add Payout to DB
            if (!user.id.startsWith('guest-')) {
                await addUserTransaction(user.id, {
                    type: 'winnings',
                    amount: payout,
                    status: 'completed',
                    date: new Date().toISOString()
                });
            } else {
                setUser(prev => prev ? ({ ...prev, balance: prev.balance + payout }) : null);
            }

        } else if (result === 'loss') {
            amountChanged = -activeTable.stake;
            // Loss already handled by initial stake deduction
        }
    }
    
    // Trigger Overlay
    setGameResult({ result, amount: amountChanged });
  };

  const finalizeGameEnd = () => {
    setGameResult(null);
    setActiveTable(null);
    setView('dashboard');
  };

  const handleLogout = async () => {
      await logout();
      setUser(null);
      setView('landing');
  };
  
  const handleDashboardQuickMatch = (gameId?: string) => {
      if (gameId) {
          setPreSelectedGame(gameId);
      } else {
          setPreSelectedGame(null);
      }
      setView('lobby');
  };

  if (authLoading) {
      return (
          <div className="min-h-screen bg-royal-950 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans md:flex">
      {user && ['dashboard', 'lobby', 'profile', 'finance', 'admin'].includes(currentView) && (
        <Navigation currentView={currentView} setView={setView} user={user} />
      )}

      {/* Challenge Request Modal */}
      <AnimatePresence>
          {incomingChallenge && (
              <ChallengeRequestModal 
                  challenge={incomingChallenge}
                  onAccept={handleAcceptChallenge}
                  onDecline={handleDeclineChallenge}
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

      <main className="flex-1 relative overflow-y-auto h-screen scrollbar-hide">
        {currentView !== 'landing' && currentView !== 'auth' && currentView !== 'how-it-works' && (
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

        {currentView === 'how-it-works' && (
            <HowItWorks 
                onBack={() => setView('landing')} 
                onLogin={() => setView('auth')}
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
                
                {currentView === 'finance' && (
                    <Finance 
                        user={user} 
                        onTopUp={handleFinanceTopUp}
                    />
                )}
                
                {currentView === 'profile' && (
                    <Profile 
                        user={user} 
                        onLogout={handleLogout}
                        onUpdateProfile={(updates) => setUser(prev => prev ? ({ ...prev, ...updates }) : null)}
                        onNavigate={setView}
                    />
                )}
                
                {currentView === 'admin' && user.isAdmin && (
                    <AdminDashboard user={user} />
                )}
                
                {currentView === 'matchmaking' && matchmakingConfig && (
                    <MatchmakingScreen 
                        user={user} 
                        gameType={matchmakingConfig.gameType}
                        stake={matchmakingConfig.stake}
                        onMatchFound={handleMatchFound}
                        onCancel={cancelMatchmaking}
                    />
                )}

                {currentView === 'game' && activeTable && (
                    <>
                        {activeTable.gameType === 'Dice' ? (
                            <DiceGame 
                                table={activeTable}
                                user={user}
                                onGameEnd={handleGameEnd}
                            />
                        ) : activeTable.gameType === 'Checkers' ? (
                            <CheckersGame 
                                table={activeTable}
                                user={user}
                                onGameEnd={handleGameEnd}
                            />
                        ) : activeTable.gameType === 'Pool' ? (
                            <PoolGame 
                                table={activeTable}
                                user={user}
                                onGameEnd={handleGameEnd}
                            />
                        ) : activeTable.gameType === 'Chess' ? (
                            <ChessGame 
                                table={activeTable}
                                user={user}
                                onGameEnd={handleGameEnd}
                            />
                        ) : (
                            <GameRoom 
                                table={activeTable} 
                                user={user}
                                onGameEnd={handleGameEnd} 
                            />
                        )}
                    </>
                )}
            </>
        )}
      </main>
    </div>
  );
}