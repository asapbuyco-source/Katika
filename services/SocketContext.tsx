import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    ReactNode
} from 'react';
import { io, Socket } from 'socket.io-client';
import { onIdTokenChanged } from 'firebase/auth';
import { SocketGameState } from '../types';
import { useAppState } from './AppContext';
import { auth, reportTournamentMatchResult } from './firebase';
import { playSFX } from './sound';

// ─── Context Shaped ─────────────────────────────────────────────────────────────

interface SocketContextValue {
    socket: Socket | null;
    isConnected: boolean;
    hasConnectedOnce: boolean;
    socketGame: SocketGameState | null;
    isWaitingForSocketMatch: boolean;
    connectionError: string | null;
    bypassConnection: boolean;
    connectionTime: number;
    setSocketGame: (game: SocketGameState | null) => void;
    setIsWaitingForSocketMatch: (v: boolean) => void;
    setBypassConnection: (v: boolean) => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

// ─── Provider ──────────────────────────────────────────────────────────────────

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { state, dispatch, viewRef } = useAppState();

    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
    const [socketGame, setSocketGameRaw] = useState<SocketGameState | null>(null);

    const setSocketGame = React.useCallback((gameOrUpdater: SocketGameState | null | ((prev: SocketGameState | null) => SocketGameState | null)) => {
        if (gameOrUpdater === null) {
            sessionStorage.removeItem('vantage_active_room');
        } else if (typeof gameOrUpdater === 'object' && (gameOrUpdater as SocketGameState).roomId) {
            sessionStorage.setItem('vantage_active_room', (gameOrUpdater as SocketGameState).roomId!);
        }
        setSocketGameRaw(gameOrUpdater);
    }, []);
    const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [bypassConnection, setBypassConnection] = useState(false);
    const [connectionTime, setConnectionTime] = useState(0);

    // Keep a ref to socketGame so event handlers don't go stale
    const socketGameRef = useRef<SocketGameState | null>(null);
    socketGameRef.current = socketGame;

    // Bug C3 fix: keep a ref to state.user so handlers always access the latest user
    // without needing to re-register every time the balance changes.
    const userRef = useRef(state.user);
    userRef.current = state.user;

    // ── Initialize Socket ──────────────────────────────────────────────────────
    useEffect(() => {
        const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
        const timerInterval = setInterval(() => setConnectionTime(prev => prev + 1), 1000);
        if (!SOCKET_URL) {
            console.error('[SocketContext] VITE_SOCKET_URL is not set. Socket.IO will not connect.');
            clearInterval(timerInterval);
            setBypassConnection(true);
            return () => clearInterval(timerInterval);
        }

        const newSocket = io(SOCKET_URL, {
            reconnectionAttempts: 10,
            timeout: 20000,
            transports: ['polling', 'websocket'],
            autoConnect: true,
            auth: async () => {
                const user = auth.currentUser;
                if (!user) return {};
                const token = await user.getIdToken();
                return { token };
            }
        });

        newSocket.on('connect', () => {
            setIsConnected(true);
            setHasConnectedOnce(true);
            setBypassConnection(false);
            setConnectionError(null);
            clearInterval(timerInterval);
        });

        newSocket.on('disconnect', () => setIsConnected(false));
        newSocket.on('connect_error', (err) => setConnectionError(err.message));

        setSocket(newSocket);

        return () => {
            clearInterval(timerInterval);
            newSocket.close();
        };
    }, []);

    // ── Session Re-entry ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !isConnected || !state.user) return;

        const storedRoom = sessionStorage.getItem('vantage_active_room');
        if (storedRoom) {
            console.log(`[Socket] Attempting re-entry for room: ${storedRoom}`);
            socket.emit('rejoin_game', { userProfile: state.user });
        }
    }, [socket, isConnected, !!state.user]);

    // ── Attach Game Event Handlers ─────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const handleMatchFound = (gameState: SocketGameState) => {
            if (gameState.tournamentMatchId) {
                const user = auth.currentUser;
                if (user) {
                    user.getIdToken().then(token => {
                        fetch('/api/tournaments/match-activate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ matchId: gameState.tournamentMatchId })
                        }).catch(e => console.error('Failed to activate tournament match:', e));
                    });
                }
            }
            setSocketGame(gameState);
            setIsWaitingForSocketMatch(false);
            setBypassConnection(false);
            dispatch({ type: 'SET_OPPONENT_DISCONNECTED', payload: { disconnected: false } });
            dispatch({ type: 'SET_GAME_RESULT', payload: null });
            dispatch({ type: 'SET_REMATCH_STATUS', payload: 'idle' });
            dispatch({ type: 'SET_VIEW', payload: 'game' });
        };

        const handleGameUpdate = (gameState: SocketGameState) => {
            const currentView = viewRef.current;
            if (currentView !== 'game' && currentView !== 'matchmaking') return;
            setSocketGame(prev => prev ? ({
                ...prev,
                ...gameState,
                roomId: gameState.roomId || gameState.id || prev.roomId,
                id: gameState.id || gameState.roomId || prev.id,
            }) : gameState);
        };

        const handleOpponentDisconnected = (data?: { timeoutSeconds?: number }) => {
            dispatch({ type: 'SET_OPPONENT_DISCONNECTED', payload: { disconnected: true, timeout: data?.timeoutSeconds || 240 } });
            dispatch({ type: 'SET_REMATCH_STATUS', payload: 'declined' });
            playSFX('error');
        };

        const handleRematchStatus = ({ requestorId, status }: { requestorId: string; status: string }) => {
            if (status === 'requested' && requestorId !== userRef.current?.id) {
                dispatch({ type: 'SET_REMATCH_STATUS', payload: 'opponent_requested' });
                playSFX('notification');
            } else if (status === 'declined') {
                dispatch({ type: 'SET_REMATCH_STATUS', payload: 'declined' });
            }
        };

        const handleGameOver = ({ roomId, winner, financials }: { roomId?: string; winner: string; financials?: any }) => {
            dispatch({ type: 'SET_OPPONENT_DISCONNECTED', payload: { disconnected: false } });

            const currentGame = socketGameRef.current;
            const currentUser = userRef.current;

            // FIX: Stop old match results from popping up in new matches
            if (roomId && currentGame?.roomId && roomId !== currentGame.roomId) {
                console.warn(`[Socket] Ignored stale game_over for room ${roomId}. Current room: ${currentGame.roomId}`);
                return;
            }

            // Report tournament match result via server API (server also handles bracket advancement)
            if (currentUser && winner === currentUser.id && currentGame?.tournamentMatchId) {
                reportTournamentMatchResult(currentGame.tournamentMatchId, winner)
                    .catch(e => console.error('Tournament result report failed:', e));
            }

            // Financial settlement is handled entirely server-side by settleGame() in server.js.
            // The server uses Firebase Admin SDK to atomically credit winnings and debit stakes.
            // No client-side Firestore writes needed here — balance will update via subscribeToUser.

            if (currentUser && winner === currentUser.id) {
                const winnings = financials?.winnings ?? 0;
                dispatch({
                    type: 'SET_GAME_RESULT',
                    payload: { result: 'win', amount: winnings, financials }
                });
            } else if (winner) {
                dispatch({ type: 'SET_GAME_RESULT', payload: { result: 'loss', amount: 0 } });
            } else {
                // Draw — no financial movement
                dispatch({ type: 'SET_GAME_RESULT', payload: { result: 'draw', amount: 0 } });
            }
        };

        socket.on('match_found', handleMatchFound);
        socket.on('waiting_for_opponent', () => setIsWaitingForSocketMatch(true));
        socket.on('game_update', handleGameUpdate);
        socket.on('opponent_disconnected', handleOpponentDisconnected);
        socket.on('opponent_reconnected', () => {
            dispatch({ type: 'SET_OPPONENT_DISCONNECTED', payload: { disconnected: false } });
            playSFX('notification');
        });
        socket.on('rematch_status', handleRematchStatus);
        socket.on('game_over', handleGameOver);

        return () => {
            socket.off('match_found', handleMatchFound);
            socket.off('waiting_for_opponent');
            socket.off('game_update', handleGameUpdate);
            socket.off('opponent_disconnected', handleOpponentDisconnected);
            socket.off('opponent_reconnected');
            socket.off('rematch_status', handleRematchStatus);
            socket.off('game_over', handleGameOver);
        };
    }, [socket, dispatch, viewRef]); // state.user removed — userRef.current is used instead (Bug C3 fix)

    // ── Rejoin on reconnect (only when there's an active game to rejoin) ──────
    useEffect(() => {
        if (socket && isConnected && state.user && socketGameRef.current && viewRef.current === 'game') {
            socket.emit('rejoin_game', { userProfile: state.user });
        }
    }, [socket, isConnected, state.user, viewRef]);

    // ── Token refresh: keep socket auth valid for long-lived connections ──────
    useEffect(() => {
        if (!socket) return;
        const unsubscribe = onIdTokenChanged(auth, async (user) => {
            if (user && isConnected) {
                try {
                    const token = await user.getIdToken();
                    socket.emit('refresh_token', { token });
                } catch (e) {
                    console.warn('[Socket] Token refresh failed:', e);
                }
            }
        });
        return unsubscribe;
    }, [socket, isConnected]);

    // ── Auto-bypass if connection takes too long ───────────────────────────────
    // 45s gives 3G connections (common in Cameroon) enough time for the
    // polling → WebSocket upgrade handshake to complete before we give up.
    useEffect(() => {
        if (connectionTime >= 45 && !isConnected && !bypassConnection && !hasConnectedOnce && !socketGame) {
            setBypassConnection(true);
        }
    }, [connectionTime, isConnected, bypassConnection, hasConnectedOnce, socketGame]);

    const value: SocketContextValue = {
        socket,
        isConnected,
        hasConnectedOnce,
        socketGame,
        isWaitingForSocketMatch,
        connectionError,
        bypassConnection,
        connectionTime,
        setSocketGame,
        setIsWaitingForSocketMatch,
        setBypassConnection,
    };

    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

export const useSocket = (): SocketContextValue => {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error('useSocket must be used within SocketProvider');
    return ctx;
};
