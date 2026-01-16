
import React, { useState } from 'react';
import { ViewState, User, Table } from './types';
import { Dashboard } from './components/Dashboard';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { CheckersGame } from './components/CheckersGame';
import { DiceGame } from './components/DiceGame';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/LandingPage';
import { MatchmakingScreen } from './components/MatchmakingScreen';
import { AuthScreen } from './components/AuthScreen';
import { Profile } from './components/Profile';
import { CURRENT_USER } from './services/mockData';

export default function App() {
  const [user, setUser] = useState<User>(CURRENT_USER);
  const [currentView, setView] = useState<ViewState>('landing');
  const [activeTable, setActiveTable] = useState<Table | null>(null);
  const [matchmakingConfig, setMatchmakingConfig] = useState<{stake: number, gameType: string} | null>(null);

  const handleTopUp = () => {
    // Simulate a Mobile Money deposit
    const amount = 5000;
    setUser(prev => ({ ...prev, balance: prev.balance + amount }));
    alert(`Successfully deposited ${amount.toLocaleString()} FCFA via MTN Mobile Money!`);
  };

  const handleJoinTable = (table: Table) => {
    if (user.balance < table.stake) {
      alert("Insufficient balance! Please Top Up.");
      return;
    }
    // Lock funds in Escrow
    setUser(prev => ({ ...prev, balance: prev.balance - table.stake }));
    setActiveTable(table);
    setView('game');
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
      if (user.balance < table.stake) {
          alert("Match found but insufficient balance.");
          setView('lobby');
          return;
      }
      // Deduct stake for match
      setUser(prev => ({ ...prev, balance: prev.balance - table.stake }));
      setActiveTable(table);
      setView('game');
  };

  const handleGameEnd = (result: 'win' | 'loss' | 'quit') => {
    if (activeTable && result === 'win') {
        const totalPot = activeTable.stake * 2; // 1v1
        const fee = totalPot * 0.10; // 10% Service Fee
        const payout = totalPot - fee;
        
        setUser(prev => ({ ...prev, balance: prev.balance + payout }));
    }
    // If loss, money remains in escrow (burned/transferred to winner)
    
    setActiveTable(null);
    setView('dashboard');
  };

  const handleLogout = () => {
      setView('landing');
  };

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-slate-200 font-sans md:flex">
      {/* Sidebar / Bottom Nav - Only show on main app screens */}
      {['dashboard', 'lobby', 'profile'].includes(currentView) && (
        <Navigation currentView={currentView} setView={setView} />
      )}

      <main className="flex-1 relative overflow-y-auto h-screen scrollbar-hide">
        {/* Decorative background blobs - shared across app states (except landing which has its own) */}
        {currentView !== 'landing' && currentView !== 'auth' && (
             <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-600/10 rounded-full blur-[100px]"></div>
            </div>
        )}

        {currentView === 'landing' && (
            <LandingPage onLogin={() => setView('auth')} />
        )}

        {currentView === 'auth' && (
            <AuthScreen onAuthenticated={() => setView('dashboard')} />
        )}

        {currentView === 'dashboard' && (
            <Dashboard 
                user={user} 
                setView={setView} 
                onTopUp={handleTopUp} 
                onQuickMatch={() => setView('lobby')}
            />
        )}
        
        {currentView === 'lobby' && (
            <Lobby 
                user={user}
                setView={setView} 
                onQuickMatch={startMatchmaking}
            />
        )}
        
        {currentView === 'profile' && (
            <Profile 
                user={user} 
                onLogout={handleLogout}
            />
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
                ) : (
                    <GameRoom 
                        table={activeTable} 
                        user={user}
                        onGameEnd={handleGameEnd} 
                    />
                )}
            </>
        )}
      </main>
    </div>
  );
}
