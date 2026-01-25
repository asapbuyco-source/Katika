import React, { Component, ReactNode, ErrorInfo, useEffect, useState } from 'react';
import { UserProvider, NavigationProvider, SocketProvider, useUser, useNav, useSocket } from '../services/context';
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
import { subscribeToIncomingChallenges, respondToChallenge, createBotMatch, getGame } from '../services/firebase';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Clock, WifiOff, Loader2 } from 'lucide-react';
import { LanguageProvider } from '../services/i18n';
import { ThemeProvider } from '../services/theme';
import { playSFX } from '../services/sound';
import { Challenge, Table } from '../types';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children?: ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class GameErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

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
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-royal-900 border border-red-500/50 rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-royal-800">
                    <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: timeout, ease: 'linear' }} className="h-full bg-red-500"/>
                </div>
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <WifiOff size={40} className="text-red-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Opponent Disconnected</h2>
                <p className="text-slate-400 text-sm mb-6">Waiting for reconnection...</p>
                <div className="flex items-center justify-center gap-2 text-3xl font-mono font-bold text-red-400"><Clock size={28} /> {timeLeft}s</div>
            </motion.div>
        </div>
    );
};

// --- MAIN CONTENT WRAPPER ---
const AppContent = () => {
  const { user, loading: authLoading } = useUser();
  const { currentView, setView } = useNav();
  const { 
      socket, socketGame, matchmakingStatus, isConnecting,
      leaveGame, gameResult, resetGameResult, 
      rematchStatus, requestRematch, opponentDisconnected 
  } = useSocket();
  
  const [incomingChallenge, setIncomingChallenge] = useState<Challenge | null>(null);
  
  // Initialize activeTable from localStorage if available (for persisting Bot games on refresh)
  const [activeTable, setActiveTable] = useState<Table | null>(() => {
      const saved = localStorage.getItem('vantage_active_table');
      return saved ? JSON.parse(saved) : null;
  });

  // Persist activeTable (Bot games only, P2P is handled by socket state)
  useEffect(() => {
      if (activeTable) {
          localStorage.setItem('vantage_active_table', JSON.stringify(activeTable));
      } else {
          localStorage.removeItem('vantage_active_table');
      }
  }, [activeTable]);

  // Auth Redirects
  useEffect(() => {
      if (authLoading) return;
      
      // If we have a stored bot game and user is logged in, ensure we are on 'game' view
      // But only if NOT in P2P mode (socketGame takes precedence)
      if (user && activeTable && !socketGame && currentView !== 'game') {
          setView('game');
      }
      else if (user) {
          if (currentView === 'landing' || currentView === 'auth') setView('dashboard');
      } else {
          const publicViews = ['landing', 'auth', 'how-it-works', 'terms', 'privacy', 'help-center', 'report-bug'];
          if (!publicViews.includes(currentView)) setView('landing');
      }
  }, [user, currentView, authLoading, setView, activeTable, socketGame]);

  // Handle Socket Game State Changes (P2P Reconnection Logic)
  useEffect(() => {
      if (matchmakingStatus === 'searching') {
          setView('matchmaking');
          setActiveTable(null); // Clear local bot table if entering P2P
      } else if (matchmakingStatus === 'found' && socketGame) {
          setView('game');
          setActiveTable(null); // Clear local bot table if entering P2P
      }
  }, [matchmakingStatus, socketGame, setView]);

  // Challenge Listener
  useEffect(() => {
      if (!user) return;
      const unsub = subscribeToIncomingChallenges(user.id, (challenge) => {
          setIncomingChallenge(challenge);
          playSFX('notification');
      });
      return () => unsub();
  }, [user]);

  // Auto-scroll on view change
  useEffect(() => {
      const mainContainer = document.getElementById('main-scroll-container');
      if (mainContainer) {
          mainContainer.scrollTop = 0;
          mainContainer.scrollTo({ top: 0, behavior: 'instant' });
      } else {
          window.scrollTo(0, 0);
      }
  }, [currentView]);

  // Bot Match Handler (Local logic mostly, but synced for UI)
  const handleBotMatch = async (gameType: string) => {
      if (!user) return;
      try {
          const gameId = await createBotMatch(user, gameType);
          const gameData = await getGame(gameId);
          if (gameData) {
              const newTable = {
                  id: gameData.id,
                  gameType: gameData.gameType as any,
                  stake: gameData.stake,
                  players: 2,
                  maxPlayers: 2,
                  status: 'active',
                  host: gameData.host,
                  guest: gameData.guest
              } as Table;
              setActiveTable(newTable);
              setView('game');
          }
      } catch (e) {
          console.error(e);
      }
  };

  const handleGameEnd = (result: 'win' | 'loss' | 'quit') => {
      // If it's a local/bot game, we manually trigger result overlay locally if needed
      // But typically we let the socket events drive this for P2P.
      if (!socketGame) {
          // Local Bot Game End
          leaveGame(); // Just resets view vars
          setActiveTable(null);
          setView('lobby');
      }
  };

  const constructTableFromSocket = (game: any): Table => {
      if (!user) return {} as Table;
      const opponentId = game.players?.find((id: string) => id !== user.id) || 'opponent';
      const hostProfile = game.profiles ? game.profiles[opponentId] : { id: opponentId, name: 'Opponent', avatar: 'https://i.pravatar.cc/150?u=opp' };
      return {
          id: game.roomId || game.id,
          gameType: game.gameType,
          stake: game.stake,
          players: 2,
          maxPlayers: 2,
          status: 'active',
          host: hostProfile
      };
  };

  // Improved Loading State: Wait for Auth AND Socket Reconnection check
  // This prevents Dashboard from flashing if we are about to rejoin a game
  if (authLoading || (user && isConnecting)) {
      return (
          <div className="min-h-screen bg-royal-950 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gold-400 font-bold text-sm animate-pulse">
                  {authLoading ? "Authenticating..." : "Reconnecting to Network..."}
              </p>
          </div>
      );
  }

  const activeGameTable = socketGame ? constructTableFromSocket(socketGame) : activeTable;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-royal-950 text-white font-sans overflow-x-hidden transition-colors duration-500">
      {user && currentView !== 'game' && currentView !== 'matchmaking' && <Navigation />}
      
      <main id="main-scroll-container" className="flex-1 relative w-full h-[100dvh] md:h-screen overflow-y-auto">
        <GameErrorBoundary onReset={() => { user ? setView('dashboard') : setView('landing'); window.location.reload(); }}>
            <AnimatePresence mode="wait">
                {currentView === 'landing' && <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><LandingPage onLogin={() => setView('auth')} onNavigate={setView} /></motion.div>}
                {currentView === 'auth' && <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><AuthScreen onAuthenticated={() => {}} onNavigate={setView} /></motion.div>}
                {currentView === 'dashboard' && user && <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Dashboard /></motion.div>}
                {currentView === 'lobby' && user && <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Lobby onBotMatch={handleBotMatch} /></motion.div>}
                
                {currentView === 'matchmaking' && user && (
                    <motion.div key="matchmaking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full">
                        <MatchmakingScreen onBotMatch={handleBotMatch} />
                    </motion.div>
                )}

                {currentView === 'game' && user && activeGameTable && (
                    <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full h-full">
                        {activeGameTable.gameType === 'Checkers' ? <CheckersGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                         activeGameTable.gameType === 'Dice' ? <DiceGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                         activeGameTable.gameType === 'TicTacToe' ? <TicTacToeGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                         activeGameTable.gameType === 'Chess' ? <ChessGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                         activeGameTable.gameType === 'Cards' ? <CardGame table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} /> :
                         <GameRoom table={activeGameTable} user={user} onGameEnd={handleGameEnd} socket={socket} socketGame={socketGame} />}
                    </motion.div>
                )}

                {currentView === 'profile' && user && <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Profile /></motion.div>}
                {currentView === 'finance' && user && <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Finance /></motion.div>}
                {currentView === 'how-it-works' && <motion.div key="how-it-works" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><HowItWorks onBack={() => setView('landing')} onLogin={() => setView('auth')} /></motion.div>}
                {currentView === 'admin' && user?.isAdmin && <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><AdminDashboard user={user} /></motion.div>}
                {currentView === 'help-center' && <motion.div key="help" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><HelpCenter onBack={() => setView(user ? 'profile' : 'landing')} /></motion.div>}
                {currentView === 'report-bug' && <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><ReportBug onBack={() => setView(user ? 'profile' : 'landing')} user={user} /></motion.div>}
                {currentView === 'terms' && <motion.div key="terms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><TermsOfService onBack={() => setView(user ? 'profile' : 'landing')} /></motion.div>}
                {currentView === 'privacy' && <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><PrivacyPolicy onBack={() => setView(user ? 'profile' : 'landing')} /></motion.div>}
                {currentView === 'forum' && user && <motion.div key="forum" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-full"><Forum user={user} /></motion.div>}
            </AnimatePresence>
        </GameErrorBoundary>
      </main>

      {/* GLOBAL OVERLAYS */}
      <AnimatePresence>
          {opponentDisconnected && <ReconnectionModal timeout={60} />}
          {gameResult && (
              <GameResultOverlay 
                  result={gameResult.result} 
                  amount={gameResult.amount}
                  financials={gameResult.financials}
                  onContinue={resetGameResult}
                  onRematch={socketGame && !gameResult.financials ? requestRematch : undefined} // Only rematch if clean
                  rematchStatus={rematchStatus}
                  stake={socketGame?.stake}
                  userBalance={user?.balance}
              />
          )}
          {incomingChallenge && (
              <ChallengeRequestModal 
                  challenge={incomingChallenge}
                  onAccept={async () => {
                      if(!user || !socket) return;
                      await respondToChallenge(incomingChallenge.id, 'accepted');
                      socket.emit('join_game', { stake: incomingChallenge.stake, userProfile: user, privateRoomId: incomingChallenge.gameId, gameType: incomingChallenge.gameType });
                      setIncomingChallenge(null);
                  }}
                  onDecline={async () => {
                      await respondToChallenge(incomingChallenge.id, 'declined');
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
        <UserProvider>
          <NavigationProvider>
            <SocketProvider>
              <AppContent />
            </SocketProvider>
          </NavigationProvider>
        </UserProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}