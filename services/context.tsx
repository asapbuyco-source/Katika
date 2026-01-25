
import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { User, ViewState, Table, Challenge } from '../types';
import { auth, syncUserProfile, subscribeToUser, loginAsGuest as apiLoginAsGuest, subscribeToIncomingChallenges } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { io, Socket } from 'socket.io-client';
import { playSFX } from './sound';

// --- TYPES ---

interface UserContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

interface NavigationContextType {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  history: ViewState[];
  goBack: () => void;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  socketGame: any | null; // The live game state from server
  matchmakingStatus: 'idle' | 'searching' | 'found';
  connectionError: string | null;
  joinGame: (gameType: string, stake: number, specificGameId?: string) => void;
  leaveGame: () => void;
  sendGameAction: (action: any) => void;
  gameResult: { result: 'win' | 'loss' | 'quit', amount: number, financials?: any } | null;
  resetGameResult: () => void;
  rematchStatus: 'idle' | 'requested' | 'opponent_requested' | 'declined';
  requestRematch: () => void;
  opponentDisconnected: boolean;
  searchingGameDetails: { gameType: string, stake: number } | null;
}

// --- CONTEXTS ---

const UserContext = createContext<UserContextType | undefined>(undefined);
const NavigationContext = createContext<NavigationContextType | undefined>(undefined);
const SocketContext = createContext<SocketContextType | undefined>(undefined);

// --- PROVIDERS ---

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUser: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const appUser = await syncUserProfile(firebaseUser);
          setUser(appUser);
          
          // Real-time listener for balance/profile changes
          unsubscribeUser = subscribeToUser(appUser.id, (updatedUser) => {
            setUser(updatedUser);
          });
        } catch (error) {
          console.error("Profile sync failed:", error);
        }
      } else {
        setUser(null);
        if (unsubscribeUser) unsubscribeUser();
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  const logout = async () => {
    await auth.signOut();
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, loading, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<ViewState>('landing');
  const [history, setHistory] = useState<ViewState[]>([]);

  const setView = (view: ViewState) => {
    if (view === currentView) return;
    setHistory(prev => [...prev, currentView]);
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const goBack = () => {
    setHistory(prev => {
      const newHistory = [...prev];
      const lastView = newHistory.pop();
      if (lastView) setCurrentView(lastView);
      return newHistory;
    });
  };

  return (
    <NavigationContext.Provider value={{ currentView, setView, history, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [socketGame, setSocketGame] = useState<any>(null);
  const [matchmakingStatus, setMatchmakingStatus] = useState<'idle' | 'searching' | 'found'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [searchingGameDetails, setSearchingGameDetails] = useState<{ gameType: string, stake: number } | null>(null);
  
  // Game End / Rematch States
  const [gameResult, setGameResult] = useState<{ result: 'win' | 'loss' | 'quit', amount: number, financials?: any } | null>(null);
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'requested' | 'opponent_requested' | 'declined'>('idle');
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  // Initialize Socket
  useEffect(() => {
    // Only connect if we have a user
    if (!user) {
        if (socket) {
            socket.disconnect();
            setSocket(null);
        }
        return;
    }

    const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || "https://katika-production.up.railway.app";
    setIsConnecting(true);

    const newSocket = io(SOCKET_URL, {
      reconnectionAttempts: 10,
      timeout: 20000, 
      transports: ['polling', 'websocket'],
      autoConnect: true,
    });

    setSocket(newSocket);

    const handleConnect = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError(null);
        // Attempt rejoin if we were in a game
        newSocket.emit('rejoin_game', { userProfile: user });
    };

    const handleDisconnect = () => {
        setIsConnected(false);
    };

    const handleError = (err: any) => {
        console.error("Socket Error:", err);
        setConnectionError("Connection unstable");
        setIsConnecting(false);
    };

    // Game Listeners
    const handleMatchFound = (gameState: any) => {
        setSocketGame(gameState);
        setMatchmakingStatus('found');
        setGameResult(null);
        setRematchStatus('idle');
        setOpponentDisconnected(false);
        setSearchingGameDetails(null);
        playSFX('notification');
    };

    const handleGameUpdate = (gameState: any) => {
        setSocketGame((prev: any) => ({
            ...(prev || {}),
            ...gameState,
            roomId: gameState.roomId || gameState.id || (prev ? prev.roomId : undefined),
            id: gameState.id || gameState.roomId || (prev ? prev.id : undefined)
        }));
    };

    const handleGameOver = ({ winner, financials }: { winner: string, financials?: any }) => {
        setOpponentDisconnected(false);
        if (user && winner === user.id) {
            setGameResult({ 
                result: 'win', 
                amount: financials ? financials.winnings : 0,
                financials: financials 
            }); 
        } else {
            setGameResult({ result: 'loss', amount: 0 });
        }
    };

    const handleOpponentDisc = () => {
        setOpponentDisconnected(true);
        setRematchStatus('declined');
        playSFX('error');
    };

    const handleOpponentRecon = () => {
        setOpponentDisconnected(false);
        playSFX('notification');
    };

    const handleRematchStatus = ({ requestorId, status, reason }: { requestorId: string, status: string, reason?: string }) => {
        if (status === 'requested') {
            if (requestorId !== user?.id) {
                setRematchStatus('opponent_requested');
                playSFX('notification');
            }
        } else if (status === 'declined') {
            setRematchStatus('declined');
            if (reason === 'Insufficient Funds') {
                alert("Rematch declined: Opponent has insufficient funds.");
            }
        }
    };

    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('connect_error', handleError);
    newSocket.on('match_found', handleMatchFound);
    newSocket.on('game_update', handleGameUpdate);
    newSocket.on('game_over', handleGameOver);
    newSocket.on('opponent_disconnected', handleOpponentDisc);
    newSocket.on('opponent_reconnected', handleOpponentRecon);
    newSocket.on('rematch_status', handleRematchStatus);
    newSocket.on('waiting_for_opponent', () => setMatchmakingStatus('searching'));

    return () => {
        newSocket.close();
    };
  }, [user]); // Re-run if user changes (e.g. login)

  const joinGame = (gameType: string, stake: number, specificGameId?: string) => {
      if (!socket || !user) return;
      setMatchmakingStatus('searching');
      setSocketGame(null); 
      setSearchingGameDetails({ gameType, stake });
      socket.emit('join_game', { 
          stake, 
          userProfile: user, 
          privateRoomId: specificGameId, 
          gameType 
      });
  };

  const leaveGame = () => {
      if (matchmakingStatus === 'searching' && socket) {
          socket.emit('leave_queue');
      }
      if (socket && socketGame) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      setSocketGame(null);
      setMatchmakingStatus('idle');
      setSearchingGameDetails(null);
      setGameResult(null);
  };

  const sendGameAction = (action: any) => {
      if (!socket || !socketGame) return;
      socket.emit('game_action', { roomId: socketGame.roomId, action });
  };

  const resetGameResult = () => {
      if (socket && socketGame) {
          // Tell server we are declining/leaving if game over
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_DECLINE' } });
      }
      setGameResult(null);
      setSocketGame(null);
      setMatchmakingStatus('idle');
      setRematchStatus('idle');
  };

  const requestRematch = () => {
      if (!user || !socket || !socketGame) return;
      const stake = socketGame.stake || 0;
      if (user.balance < stake) {
          alert(`Insufficient funds for rematch. You need ${stake} FCFA.`);
          return;
      }
      setRematchStatus('requested');
      socket.emit('game_action', { 
          roomId: socketGame.roomId, 
          action: { type: 'REMATCH_REQUEST', balance: user.balance } 
      });
  };

  return (
    <SocketContext.Provider value={{
        socket, isConnected, isConnecting, socketGame, matchmakingStatus, connectionError,
        joinGame, leaveGame, sendGameAction,
        gameResult, resetGameResult, rematchStatus, requestRematch, opponentDisconnected,
        searchingGameDetails
    }}>
      {children}
    </SocketContext.Provider>
  );
};

// --- HOOKS ---

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};

export const useNav = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNav must be used within a NavigationProvider');
  return context;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
