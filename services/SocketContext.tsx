import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    ReactNode
} from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketGameState } from '../types';
import { useAppState } from './AppContext';
import { setTournamentMatchActive, reportTournamentMatchResult, addUserTransaction } from './firebase';
import { playSFX } from './sound';

// ─── Context Shape ─────────────────────────────────────────────────────────────

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
    const [socketGame, setSocketGame] = useState<SocketGameState | null>(null);
    const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [bypassConnection, setBypassConnection] = useState(false);
    const [connectionTime, setConnectionTime] = useState(0);

    // Keep a ref to socketGame so event handlers don't go stale
    const socketGameRef = useRef<SocketGameState | null>(null);
    socketGameRef.current = socketGame;

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

    // ── Attach Game Event Handlers ─────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const handleMatchFound = (gameState: SocketGameState) => {
            if (gameState.tournamentMatchId) {
                setTournamentMatchActive(gameState.tournamentMatchId)
                    .catch(e => console.error('Failed to activate tournament match:', e));
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
            if (status === 'requested' && requestorId !== state.user?.id) {
                dispatch({ type: 'SET_REMATCH_STATUS', payload: 'opponent_requested' });
                playSFX('notification');
            } else if (status === 'declined') {
                dispatch({ type: 'SET_REMATCH_STATUS', payload: 'declined' });
            }
        };

        const handleGameOver = ({ winner, financials }: { winner: string; financials?: any }) => {
            dispatch({ type: 'SET_OPPONENT_DISCONNECTED', payload: { disconnected: false } });
            const currentGame = socketGameRef.current;

            if (state.user && winner === state.user.id && currentGame?.tournamentMatchId) {
                reportTournamentMatchResult(currentGame.tournamentMatchId, winner)
                    .catch(e => console.error('Tournament result report failed:', e));
            }

            if (state.user && winner === state.user.id) {
                const winnings = financials?.winnings ?? 0;
                // Bug D fix: Write payout to Firebase immediately on game_over, not waiting for
                // the overlay 'Continue' click. This prevents fund loss on disconnect/refresh.
                if (winnings > 0 && !state.user.id.startsWith('guest-') && currentGame?.stake) {
                    addUserTransaction(state.user.id, {
                        type: 'winnings',
                        amount: winnings,
                        status: 'completed',
                        date: new Date().toISOString()
                    }).catch(e => console.error('[SocketContext] Failed to record winnings:', e));
                }
                dispatch({
                    type: 'SET_GAME_RESULT',
                    payload: { result: 'win', amount: winnings, financials }
                });
            } else {
                dispatch({ type: 'SET_GAME_RESULT', payload: { result: 'loss', amount: 0 } });
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
    }, [socket, state.user, dispatch, viewRef]);

    // ── Rejoin on reconnect (only when there's an active game to rejoin) ──────
    useEffect(() => {
        if (socket && isConnected && state.user && socketGameRef.current && viewRef.current === 'game') {
            socket.emit('rejoin_game', { userProfile: state.user });
        }
    }, [socket, isConnected, state.user, viewRef]);

    // ── Auto-bypass if connection takes too long ───────────────────────────────
    useEffect(() => {
        if (connectionTime >= 20 && !isConnected && !bypassConnection && !hasConnectedOnce && !socketGame) {
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
