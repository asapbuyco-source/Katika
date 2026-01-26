
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, ViewState } from '../types';
import { auth, syncUserProfile, subscribeToUser } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { io, Socket } from 'socket.io-client';
import { playSFX } from './sound';

// --- TYPES ---
// (Keeping existing types...)
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
  socketGame: any | null;
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
  requestFullSync: () => void;
}

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
          unsubscribeUser = subscribeToUser(appUser.id, (updatedUser) => setUser(updatedUser));
        } catch (error) { console.error("Profile sync failed:", error); }
      } else {
        setUser(null);
        if (unsubscribeUser) unsubscribeUser();
      }
      setLoading(false);
    });
    return () => { unsubscribeAuth(); if (unsubscribeUser) unsubscribeUser(); };
  }, []);

  const logout = async () => { await auth.signOut(); setUser(null); };

  return <UserContext.Provider value={{ user, loading, logout }}>{children}</UserContext.Provider>;
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

  return <NavigationContext.Provider value={{ currentView, setView, history, goBack }}>{children}</NavigationContext.Provider>;
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
  const [gameResult, setGameResult] = useState<any>(null);
  const [rematchStatus, setRematchStatus] = useState<any>('idle');
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  // Helper to persist active room ID for reconnection
  const saveRoomId = (id: string | null) => {
      if (id) localStorage.setItem('vantage_room_id', id);
      else localStorage.removeItem('vantage_room_id');
  };

  useEffect(() => {
    if (!user) { if (socket) { socket.disconnect(); setSocket(null); } return; }

    const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || "https://katika-production.up.railway.app";
    setIsConnecting(true);

    const newSocket = io(SOCKET_URL, {
      reconnectionAttempts: 10, timeout: 20000, transports: ['polling', 'websocket'], autoConnect: true,
    });
    setSocket(newSocket);

    const handleConnect = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError(null);
        // Attempt rejoin
        const savedRoomId = localStorage.getItem('vantage_room_id');
        if (savedRoomId) {
            newSocket.emit('rejoin_game', { userProfile: user, roomId: savedRoomId });
        }
    };

    const handleMatchFound = (gameState: any) => {
        setSocketGame(gameState);
        saveRoomId(gameState.roomId || gameState.id);
        setMatchmakingStatus('found');
        setGameResult(null);
        setRematchStatus('idle');
        setOpponentDisconnected(false);
        setSearchingGameDetails(null);
        playSFX('notification');
    };

    const handleGameUpdate = (update: any) => {
        setSocketGame((prev: any) => {
            if (!prev) return update;
            // Full Sync or Partial
            if (update.gameState && !update.partial) {
                // If it looks like a full state replace (e.g. from sync)
                // We'll trust our smart merge unless explicitly told to replace
            }
            const newGameState = { ...(prev.gameState || {}) };
            if (update.gameState) {
                Object.keys(update.gameState).forEach(key => {
                    if (update.gameState[key] !== null && update.gameState[key] !== undefined) {
                        newGameState[key] = update.gameState[key];
                    }
                });
            }
            return {
                ...prev, ...update,
                gameState: newGameState,
                roomId: update.roomId || update.id || prev.roomId
            };
        });
    };

    const handleGameOver = ({ winner, financials }: any) => {
        setOpponentDisconnected(false);
        saveRoomId(null); // Clear saved room
        if (user && winner === user.id) {
            setGameResult({ result: 'win', amount: financials ? financials.winnings : 0, financials }); 
        } else if (winner === null) {
            setGameResult({ result: 'quit', amount: financials ? financials.amount : 0 }); // Draw
        } else {
            setGameResult({ result: 'loss', amount: 0 });
        }
    };

    const handleRejoinFailed = (data: { reason: string }) => {
        console.warn("Rejoin failed:", data.reason);
        saveRoomId(null);
        setSocketGame(null);
        setMatchmakingStatus('idle');
    };

    const handleFullSync = (data: any) => {
        console.log("Full Sync Received");
        setSocketGame(data);
        setMatchmakingStatus('found');
    };

    newSocket.on('connect', handleConnect);
    newSocket.on('match_found', handleMatchFound);
    newSocket.on('game_update', handleGameUpdate);
    newSocket.on('full_state_sync', handleFullSync); // ISSUE 6
    newSocket.on('game_over', handleGameOver);
    newSocket.on('rejoin_failed', handleRejoinFailed); // ISSUE 8
    newSocket.on('opponent_disconnected', () => { setOpponentDisconnected(true); playSFX('error'); });
    newSocket.on('opponent_reconnected', () => { setOpponentDisconnected(false); playSFX('notification'); });
    
    // Move Rejection Handling (Global Toast fallback)
    newSocket.on('move_rejected', (data: any) => {
        alert(`Move Rejected: ${data.reason}`); // Simple fallback
        if (socketGame) newSocket.emit('request_full_sync', { roomId: socketGame.roomId });
    });

    return () => { newSocket.close(); };
  }, [user]);

  const joinGame = (gameType: string, stake: number, specificGameId?: string) => {
      if (!socket || !user) return;
      setMatchmakingStatus('searching');
      setSocketGame(null); 
      setSearchingGameDetails({ gameType, stake });
      socket.emit('join_game', { stake, userProfile: user, privateRoomId: specificGameId, gameType });
  };

  const leaveGame = () => {
      if (matchmakingStatus === 'searching' && socket) socket.emit('leave_queue');
      if (matchmakingStatus === 'found' && socket && socketGame) {
          socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
      }
      setSocketGame(null);
      saveRoomId(null);
      setMatchmakingStatus('idle');
      setSearchingGameDetails(null);
      setGameResult(null);
  };

  const sendGameAction = (action: any) => {
      if (!socket || !socketGame) return;
      socket.emit('game_action', { roomId: socketGame.roomId, action });
  };

  const requestFullSync = () => {
      if (!socket || !socketGame) return;
      socket.emit('request_full_sync', { roomId: socketGame.roomId });
  };

  // ... (resetGameResult, requestRematch same as before)
  const resetGameResult = () => {
      if (socket && socketGame) socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_DECLINE' } });
      setGameResult(null); setSocketGame(null); saveRoomId(null); setMatchmakingStatus('idle'); setRematchStatus('idle');
  };
  const requestRematch = () => {
      if (!user || !socket || !socketGame) return;
      setRematchStatus('requested');
      socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_REQUEST', balance: user.balance } });
  };

  return (
    <SocketContext.Provider value={{
        socket, isConnected, isConnecting, socketGame, matchmakingStatus, connectionError,
        joinGame, leaveGame, sendGameAction, gameResult, resetGameResult, rematchStatus, requestRematch, opponentDisconnected, searchingGameDetails,
        requestFullSync
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser error');
  return context;
};
export const useNav = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNav error');
  return context;
};
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket error');
  return context;
};
