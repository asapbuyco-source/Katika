
import React, { useState, useEffect } from 'react';
import { ViewState, User, Table } from './types';
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
import { CURRENT_USER } from './services/mockData';
import { auth, syncUserProfile, logout } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

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

  // 1. Firebase Auth Listener: Sync User State ONLY
  useEffect(() => {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
              try {
                  const appUser = await syncUserProfile(firebaseUser);
                  setUser(appUser);
              } catch (error) {
                  console.error("Profile sync failed:", error);
              }
          } else {
              if (!user || user.id.startsWith('guest-')) {
                  // Keep guest or null handling
              } else {
                 setUser(null);
              }
          }
          setAuthLoading(false);
      });

      return () => unsubscribe();
  }, []);

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

  const handleTopUp = () => {
    if(!user) return;
    const amount = 5000;
    setUser(prev => prev ? ({ ...prev, balance: prev.balance + amount }) : null);
  };
  
  const handleFinanceTopUp = () => {
      if(!user) return;
      const amount = 5000;
      setUser(prev => prev ? ({ ...prev, balance: prev.balance + amount }) : null);
  };

  const startMatchmaking = (stake: number, gameType: string) => {
      setMatchmakingConfig({ stake, gameType });
      setView('matchmaking');
  };

  const cancelMatchmaking = () => {
      setMatchmakingConfig(null);
      setView('lobby');
  };

  const handleMatchFound = (table: Table) => {
      if (!user) return;
      if (table.stake > 0) {
          if (user.balance < table.stake) {
              alert("Match found but insufficient balance.");
              setView('lobby');
              return;
          }
          setUser(prev => prev ? ({ ...prev, balance: prev.balance - table.stake }) : null);
      }
      setActiveTable(table);
      setView('game');
  };

  const handleGameEnd = (result: 'win' | 'loss' | 'quit') => {
    let amountChanged = 0;

    if (activeTable && activeTable.stake > 0) {
        if (result === 'win') {
            const totalPot = activeTable.stake * 2;
            const fee = totalPot * 0.10;
            const payout = totalPot - fee;
            amountChanged = payout; // Full payout shown (includes return of stake)
            
            // NOTE: Stake was already deducted at start. 
            // We add the full payout to balance here.
            setUser(prev => prev ? ({ ...prev, balance: prev.balance + payout }) : null);
        } else if (result === 'loss') {
            // For loss, we just show what they lost (stake). 
            // Balance doesn't change now because it was deducted at start.
            amountChanged = -activeTable.stake;
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
  
  // Dashboard Action Handler
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
