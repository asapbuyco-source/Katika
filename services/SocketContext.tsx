import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    useCallback,
    ReactNode
} from 'react';
import { io, Socket } from 'socket.io-client';
import { onIdTokenChanged } from 'firebase/auth';
import { SocketGameState } from '../types';
import { useAppState } from './AppContext';
import { auth, setTournamentMatchActive } from './firebase';
import { playSFX } from './sound';
import { useToast } from './toast';

interface QueuedEmission {
    event: string;
    data: any;
    timestamp: number;
}

interface SocketContextValue {
    socket: Socket | null;
    isConnected: boolean;
    hasConnectedOnce: boolean;
    socketGame: SocketGameState | null;
    isWaitingForSocketMatch: boolean;
    connectionError: string | null;
    bypassConnection: boolean;
    connectionTime: number;
    pingMs: number | null;
    signalStrength: 0 | 1 | 2 | 3 | 4;
    setSocketGame: (game: SocketGameState | null) => void;
    setIsWaitingForSocketMatch: (v: boolean) => void;
    setBypassConnection: (v: boolean) => void;
    resetAll: () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { state, dispatch, viewRef } = useAppState();
    const toast = useToast();

    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [hasConnectedOnce, setHasConnectedOnce] = useState(
        () => sessionStorage.getItem('vantage_connected_once') === '1'
    );
    const [socketGame, setSocketGameRaw] = useState<SocketGameState | null>(null);

    const setSocketGame = useCallback((gameOrUpdater: SocketGameState | null | ((prev: SocketGameState | null) => SocketGameState | null)) => {
        if (gameOrUpdater === null) {
            sessionStorage.removeItem('vantage_active_room');
        } else if (typeof gameOrUpdater === 'object' && (gameOrUpdater as SocketGameState).roomId) {
            sessionStorage.setItem('vantage_active_room', (gameOrUpdater as SocketGameState).roomId!);
        }
        setSocketGameRaw(gameOrUpdater);
    }, []);

    const resetAll = useCallback(() => {
        setSocketGame(null);
        dispatch({ type: 'RESET_GAME_STATE' });
    }, [setSocketGame, dispatch]);

    const [isWaitingForSocketMatch, setIsWaitingForSocketMatch] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [bypassConnection, setBypassConnection] = useState(false);
    const [connectionTime, setConnectionTime] = useState(0);
    const [pingMs, setPingMs] = useState<number | null>(null);

    const signalStrength: 0 | 1 | 2 | 3 | 4 = !isConnected
        ? 0
        : pingMs === null ? 4
        : pingMs < 80  ? 4
        : pingMs < 200 ? 3
        : pingMs < 400 ? 2
        : pingMs < 700 ? 1
        : 1;

    const socketGameRef = useRef<SocketGameState | null>(null);
    socketGameRef.current = socketGame;

    const userRef = useRef(state.user);
    userRef.current = state.user;

    // NET-2: Outbound emission queue for critical game actions.
    // Uses a socketRef to avoid stale closure — flushEmissionQueue fires inside
    // the 'connect' handler where React state (isConnected) is still false.
    const pendingEmissions = useRef<QueuedEmission[]>([]);
    const isReconnectingRef = useRef(false);
    const socketRef = useRef<Socket | null>(null);

    const flushEmissionQueue = useCallback(() => {
        const s = socketRef.current;
        if (!s || pendingEmissions.current.length === 0) return;
        const queued = [...pendingEmissions.current];
        pendingEmissions.current = [];
        console.log(`[Socket] Flushing ${queued.length} queued emission(s) after reconnect`);
        for (const emission of queued) {
            s.emit(emission.event, emission.data);
        }
    }, []);

    const queueEmission = useCallback((event: string, data: any) => {
        pendingEmissions.current.push({ event, data, timestamp: Date.now() });
    }, []);

    // NET-3: Page visibility handling - reconnect if tab was hidden > 30s
    const hiddenAtRef = useRef<number | null>(null);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
            } else if (document.visibilityState === 'visible' && hiddenAtRef.current) {
                const elapsed = Date.now() - hiddenAtRef.current;
                if (elapsed > 30_000 && socket && isConnected) {
                    console.log('[Socket] Tab hidden > 30s, forcing reconnect');
                    socket.disconnect();
                    socket.connect();
                }
                hiddenAtRef.current = null;
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [socket, isConnected]);

    // NET-4: getIdToken retry logic (3 attempts, 1s apart)
    const getIdTokenWithRetry = useCallback(async (user: any, retries = 3, delayMs = 1000): Promise<string> => {
        for (let i = 0; i < retries; i++) {
            try {
                const token = await user.getIdToken();
                return token;
            } catch (e) {
                if (i === retries - 1) throw e;
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
        return '';
    }, []);

    useEffect(() => {
        const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
        const timerInterval = setInterval(() => setConnectionTime(prev => prev + 1), 1000);
        if (!SOCKET_URL) {
            console.error('[SocketContext] VITE_SOCKET_URL is not set. Socket.IO will not connect.');
            clearInterval(timerInterval);
            setBypassConnection(true);
            return () => clearInterval(timerInterval);
        }

        // WAKE-UP: Fire an immediate HTTP ping to the Railway backend so the dyno
        // cold-start begins in parallel with the Socket.IO handshake. This shaves
        // 5-15s off the first connection delay for users loading after idle periods.
        try {
            const wakeUrl = SOCKET_URL.replace(/\/$/, '') + '/health';
            fetch(wakeUrl, { method: 'GET', mode: 'cors' }).catch(() => {});
            // Persist URL so index.html can ping on the NEXT page load (even earlier)
            localStorage.setItem('vantage_socket_url', SOCKET_URL.replace(/\/$/, ''));
        } catch { /* ignore */ }

        const newSocket = io(SOCKET_URL, {
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 20000,   // cap at 20s — server should be awake by then
            randomizationFactor: 0.5,
            timeout: 30000,               // 30s — enough for Railway cold-start (15-20s)
            transports: ['websocket', 'polling'],
            autoConnect: true,
            // Connect immediately without waiting for a Firebase token.
            // The server allows unauthenticated connections; we authenticate via
            // the 'refresh_token' event that fires after onIdTokenChanged.
            auth: {}
        });

        newSocket.on('connect', () => {
            socketRef.current = newSocket;  // update ref before flush
            setIsConnected(true);
            setHasConnectedOnce(true);
            sessionStorage.setItem('vantage_connected_once', '1');
            setBypassConnection(false);
            setConnectionError(null);
            clearInterval(timerInterval);
            isReconnectingRef.current = false;
            dispatch({ type: 'SET_NETWORK_STATUS', payload: 'online' });

            // CRITICAL: If a Firebase user is already logged in when the socket connects
            // (e.g. page refresh), send the token immediately so socket.user is set on
            // the server BEFORE any join_game or rejoin_game events fire.
            // onIdTokenChanged alone won't re-fire for an already-valid token.
            const currentUser = auth.currentUser;
            if (currentUser) {
                currentUser.getIdToken().then(token => {
                    newSocket.emit('refresh_token', { token });
                }).catch(() => {});
            }

            flushEmissionQueue();
        });

        // Single disconnect handler (deduped)
        newSocket.on('disconnect', () => {
            setIsConnected(false);
            setPingMs(null);
            dispatch({ type: 'SET_NETWORK_STATUS', payload: 'offline' });
        });

        newSocket.on('connect_error', (err) => {
            // Log the full error so devs can diagnose CORS / auth / URL problems
            console.error('[Socket] connect_error:', err.message, '| type:', (err as any).type, '| description:', (err as any).description);
            setConnectionError(err.message);
            dispatch({ type: 'SET_NETWORK_STATUS', payload: 'degraded' });
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        return () => {
            clearInterval(timerInterval);
            newSocket.close();
        };
    }, [getIdTokenWithRetry, flushEmissionQueue, dispatch]);

    // Session Re-entry with acknowledgement callback (NET-6)
    useEffect(() => {
        if (!socket || !isConnected || !state.user) return;

        const storedRoom = sessionStorage.getItem('vantage_active_room');
        if (storedRoom) {
            console.log(`[Socket] Attempting re-entry for room: ${storedRoom}`);
            socket.emit('rejoin_game', { userProfile: state.user }, (ack: any) => {
                if (!ack || !ack.success) {
                    console.warn('[Socket] Rejoin failed or timed out, clearing stored room');
                    sessionStorage.removeItem('vantage_active_room');
                }
            });
        }
    }, [socket, isConnected, !!state.user]);

    // Attach Game Event Handlers
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

            // [Step 2.8] Gap detection: if sequence jumps by more than 1, a update was dropped.
            // Request a full state resync from the server.
            const prevSeq = socketGameRef.current?.sequence ?? 0;
            if (gameState.sequence !== undefined && prevSeq > 0 && gameState.sequence > prevSeq + 1) {
                console.warn(`[Socket] Gap detected: lastSeq=${prevSeq} recvSeq=${gameState.sequence} — requesting resync for room ${gameState.roomId}`);
                socket?.emit('rejoin_game', { userProfile: state.user }, (ack: any) => {
                    if (!ack || !ack.success) {
                        sessionStorage.removeItem('vantage_active_room');
                    }
                });
            }

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
            } else if (status === 'failed') {
                dispatch({ type: 'SET_REMATCH_STATUS', payload: 'failed' });
            }
        };

        const handleGameError = (data?: { message?: string }) => {
            toast.error(data?.message || 'Game action failed. Please try again.');
            setIsWaitingForSocketMatch(false);
            if (viewRef.current === 'matchmaking') {
                dispatch({ type: 'SET_MATCHMAKING_CONFIG', payload: null });
                dispatch({ type: 'SET_VIEW', payload: 'lobby' });
            }
        };

        const handleGameOver = ({ roomId, winner, financials }: { roomId?: string; winner: string; financials?: any }) => {
            dispatch({ type: 'SET_OPPONENT_DISCONNECTED', payload: { disconnected: false } });

            const currentGame = socketGameRef.current;
            const currentUser = userRef.current;

            if (roomId && currentGame?.roomId && roomId !== currentGame.roomId) {
                console.warn(`[Socket] Ignored stale game_over for room ${roomId}. Current room: ${currentGame.roomId}`);
                return;
            }

            if (currentUser && winner === currentUser.id) {
                // BUG-S5 FIX: OPTIMISTIC_BALANCE_UPDATE immediately bumps the displayed
                // balance. The real value will reconcile when subscribeToUser fires.
                const winnings = financials?.winnings ?? 0;
                dispatch({ type: 'OPTIMISTIC_BALANCE_UPDATE', payload: winnings });
                dispatch({ type: 'SET_GAME_RESULT', payload: { result: 'win', amount: winnings, financials } });
            } else if (winner) {
                dispatch({ type: 'SET_GAME_RESULT', payload: { result: 'loss', amount: 0 } });
            } else {
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
        socket.on('game_error', handleGameError);

        return () => {
            socket.off('match_found', handleMatchFound);
            socket.off('waiting_for_opponent');
            socket.off('game_update', handleGameUpdate);
            socket.off('opponent_disconnected', handleOpponentDisconnected);
            socket.off('opponent_reconnected');
            socket.off('rematch_status', handleRematchStatus);
            socket.off('game_over', handleGameOver);
            socket.off('game_error', handleGameError);
        };
    }, [socket, dispatch, viewRef, toast]);

    // Rejoin on reconnect (only when there's an active game to rejoin)
    useEffect(() => {
        if (socket && isConnected && state.user && socketGameRef.current && viewRef.current === 'game') {
            socket.emit('rejoin_game', { userProfile: state.user }, (ack: any) => {
                if (!ack || !ack.success) {
                    sessionStorage.removeItem('vantage_active_room');
                }
            });
        }
    }, [socket, isConnected, state.user, viewRef]);

    // Token refresh: keep socket auth valid for long-lived connections,
    // and authenticate the socket when the user first logs in on a guest connection.
    useEffect(() => {
        if (!socket) return;
        const unsubscribe = onIdTokenChanged(auth, async (user) => {
            if (user) {
                // Send token whenever user state changes AND socket is connected.
                // This covers: login after cold-start, token refresh (hourly), re-login.
                try {
                    const token = await getIdTokenWithRetry(user);
                    if (socket.connected) {
                        socket.emit('refresh_token', { token });
                    }
                } catch (e) {
                    console.warn('[Socket] Token refresh failed:', e);
                }
            }
        });
        return unsubscribe;
    }, [socket, getIdTokenWithRetry]);

    // Handle auth_required: server rejected an action because socket.user is null.
    // Re-send the current token to elevate the guest socket to authenticated.
    useEffect(() => {
        if (!socket) return;
        const handleAuthRequired = async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
                const token = await getIdTokenWithRetry(user);
                socket.emit('refresh_token', { token });
                console.log('[Socket] Re-sent token after auth_required');
            } catch (e) {
                console.warn('[Socket] Could not re-send token after auth_required:', e);
            }
        };
        socket.on('auth_required', handleAuthRequired);
        return () => { socket.off('auth_required', handleAuthRequired); };
    }, [socket, getIdTokenWithRetry]);


    // Auto-bypass if connection takes too long
    useEffect(() => {
        if (connectionTime >= 60 && !isConnected && !bypassConnection && !hasConnectedOnce && !socketGame) {
            setBypassConnection(true);
        }
    }, [connectionTime, isConnected, bypassConnection, hasConnectedOnce, socketGame]);

    // Live ping measurement
    useEffect(() => {
        if (!socket || !isConnected) return;
        const measure = () => {
            const t0 = performance.now();
            socket.emit('client_ping', { t: t0 });
        };
        socket.on('client_pong', (data: { t: number }) => {
            const rtt = Math.round(performance.now() - data.t);
            setPingMs(rtt);
        });
        measure();
        const interval = setInterval(measure, 5000);
        return () => {
            clearInterval(interval);
            socket.off('client_pong');
        };
    }, [socket, isConnected]);

    // NOTE: No custom auto-reconnect interval here.
    // Socket.IO's built-in reconnection (reconnectionAttempts: Infinity,
    // reconnectionDelay: 1000, reconnectionDelayMax: 20000) handles this correctly.
    // Adding a manual setInterval that also calls socket.connect() causes duplicate
    // connection attempts and log spam — the engine already retries on its own.

    // NET-2: Wrapper around socket.emit that queues when disconnected
    const emit = useCallback((event: string, data: any, callback?: any) => {
        if (socket && isConnected) {
            if (callback) {
                socket.emit(event, data, callback);
            } else {
                socket.emit(event, data);
            }
        } else {
            // Queue critical game actions when disconnected
            if (event === 'game_action' || event === 'game_move') {
                queueEmission(event, data);
            }
        }
    }, [socket, isConnected, queueEmission]);

    const value: SocketContextValue = {
        socket,
        isConnected,
        hasConnectedOnce,
        socketGame,
        isWaitingForSocketMatch,
        connectionError,
        bypassConnection,
        connectionTime,
        pingMs,
        signalStrength,
        setSocketGame,
        setIsWaitingForSocketMatch,
        setBypassConnection,
        resetAll,
    };

    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = (): SocketContextValue => {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error('useSocket must be used within SocketProvider');
    return ctx;
};
