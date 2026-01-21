import React, { Component, useState, useEffect, useRef, useMemo, ErrorInfo, ReactNode } from 'react';
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
import { PrivacyPolicy } from './PrivacyPolicy';
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
import { Loader2, Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { LanguageProvider } from '../services/i18n';
import { ThemeProvider, useTheme } from '../services/theme';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children?: ReactNode;
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

// Internal app content wrapper to access useTheme context
const AppContent = () => {
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

  // Theme Hook
  const { theme } = useTheme();

  // Apply Theme CSS Variables
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.style.setProperty('--c-royal-950', '15 10 31'); // #0f0a1f
      root.style.setProperty('--c-royal-900', '26 16 60'); // #1a103c
      root.style.setProperty('--c-royal-800', '45 27 105'); // #2d1b69
      root.style.setProperty('--c-text-white', '255 255 255');
      root.style.setProperty('--c-text-base', '226 232 240');
    } else {
      // Light Mode Mapping
      root.style.setProperty('--c-royal-950', '248 250 252'); // Slate 50 (Main BG)
      root.style.setProperty('--c-royal-900', '255 255 255'); // White (Cards)
      root.style.setProperty('--c-royal-800', '226 232 240'); // Slate 200 (Accents/Borders)
      root.style.setProperty('--c-text-white', '15 23 42'); // Slate 900 (Headings)
      root.style.setProperty('--c-text-base', '51 65 85'); // Slate 700 (Body)
    }
  }, [theme]);

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
          // Safe public routes
          const publicViews: ViewState[] = ['landing', 'auth', 'how-it-works', 'terms', 'privacy', 'help-center', 'report-bug'];
          
          if (!publicViews.includes(currentView)) {
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
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </LanguageProvider>
  );
}