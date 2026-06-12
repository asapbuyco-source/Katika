import { useCallback, useRef, useEffect } from 'react';
import { ViewState, Table, SocketGameState, Tournament } from '../types';
import { useAppState } from '../services/AppContext';
import { useSocket } from '../services/SocketContext';
import { useToast } from '../services/toast';
import { auth, createBotMatch, respondToChallenge, setTournamentMatchActive, logout, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const useGameController = () => {
    const { state, dispatch } = useAppState();
    const { socket, isConnected, bypassConnection, socketGame, setSocketGame } = useSocket();
    const toast = useToast();

    const { user, offlineTable, incomingChallenge } = state;
    const isTransitioningRef = useRef(false);
    const activeTournamentMatchIdRef = useRef<string | null>(null);

    const constructTableFromSocket = useCallback((game: SocketGameState): Table => {
        if (!user) return {} as Table;
        const opponentId = game.players.find(id => id !== user.id) ?? '';
        const hostProfile = game.profiles?.[opponentId] ?? { id: opponentId, name: 'Opponent', avatar: 'https://i.pravatar.cc/150?u=opp', elo: 0, rankTier: 'Silver' as const };
        return {
            id: game.roomId || game.id || '',
            gameType: game.gameType as any,
            stake: game.stake, players: 2, maxPlayers: 2, status: 'active',
            host: hostProfile,
            tournamentMatchId: game.tournamentMatchId || game.privateRoomId
        };
    }, [user]);

    const activeGameTable = socketGame ? constructTableFromSocket(socketGame) : offlineTable;

    // ── Matchmaking ───────────────────────────────────────────────────────────
    const refreshSocketAuth = useCallback(async () => {
        if (!socket?.connected) return;
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Please log in again before joining a match.');
        const token = await currentUser.getIdToken();
        await new Promise<void>((resolve, reject) => {
            socket.timeout(5000).emit('refresh_token', { token }, (err: Error | null, ack?: { success?: boolean; error?: string }) => {
                if (err || !ack?.success) {
                    reject(new Error(ack?.error || 'Could not verify your game session.'));
                    return;
                }
                resolve();
            });
        });
    }, [socket]);

    const startMatchmaking = useCallback(async (stake: number, gameType: string, specificGameId?: string, difficulty?: string, isTournament = false) => {
        if (!user) return;
        const validGames = ['Dice', 'Checkers', 'Chess', 'TicTacToe', 'Cards', 'Ludo', 'Pool'];
        if (!validGames.includes(gameType)) { toast.info('This game is coming soon!'); return; }

        dispatch({ type: 'SET_GAME_RESULT', payload: null });
        dispatch({ type: 'SET_REMATCH_STATUS', payload: 'idle' });

        if ((!isConnected || bypassConnection) && stake !== -1) {
            toast.error('Offline mode active. P2P matchmaking unavailable.');
            return;
        }

        if (stake === -1) {
            try {
                const gameId = await createBotMatch(user, gameType, difficulty);
                const table: Table = {
                    id: gameId, gameType: gameType as any, stake: stake,
                    players: 2, maxPlayers: 2, status: 'active',
                    host: user
                };
                dispatch({ type: 'SET_OFFLINE_TABLE', payload: table });
                dispatch({ type: 'SET_VIEW', payload: 'game' });
            } catch (error) {
                console.error('[App] Bot match failed:', error);
                toast.error('Could not start bot match. Try again.');
            }
            return;
        }

        if (!socket) return;
        try {
            await refreshSocketAuth();
        } catch (e: any) {
            console.error('[App] Socket auth refresh failed:', e);
            toast.error(e?.message || 'Could not verify your game session. Please try again.');
            return;
        }
        dispatch({ type: 'SET_MATCHMAKING_CONFIG', payload: { stake, gameType, isTournament } });
        dispatch({ type: 'SET_VIEW', payload: 'matchmaking' });
        socket.emit('join_game', { stake, userProfile: user, privateRoomId: specificGameId, gameType });
    }, [user, isConnected, bypassConnection, socket, dispatch, toast, refreshSocketAuth]);

    const cancelMatchmaking = useCallback(() => {
        if (socket) socket.emit('leave_queue');
        dispatch({ type: 'SET_MATCHMAKING_CONFIG', payload: null });
        dispatch({ type: 'SET_VIEW', payload: 'lobby' });
    }, [dispatch, socket]);

    const handleAcceptChallenge = useCallback(async () => {
        if (!incomingChallenge || !user) return;
        try {
            const { gameId } = await respondToChallenge(incomingChallenge.id, 'accepted');
            if (!gameId) throw new Error('Challenge accepted without a private room id.');
            await startMatchmaking(incomingChallenge.stake, incomingChallenge.gameType, gameId);
            dispatch({ type: 'SET_INCOMING_CHALLENGE', payload: null });
        } catch (e) {
            console.error('[App] Failed to create challenge game:', e);
            toast.error('Could not accept challenge. Please try again.');
        }
    }, [incomingChallenge, user, startMatchmaking, dispatch, toast]);

    useEffect(() => {
        if (!socket) return;
        const onChallengeAccepted = ({ gameId, gameType, stake }: { gameId: string, gameType: string, stake: number }) => {
            // Sender receives this notification when recipient accepts
            startMatchmaking(stake, gameType, gameId);
        };
        socket.on('challenge_accepted', onChallengeAccepted);
        return () => {
            socket.off('challenge_accepted', onChallengeAccepted);
        };
    }, [socket, startMatchmaking]);

    const handleMatchFound = useCallback((table: Table) => {
        // FIX: Reset the transitioning guard so that the new game (or rematch)
        // can end normally. Without this reset, isTransitioningRef stays `true`
        // from the previous game's handleGameEnd, causing the new game's end
        // to silently return early and freeze the UI.
        isTransitioningRef.current = false;

        if (table.tournamentMatchId) {
            setTournamentMatchActive(table.tournamentMatchId)
                .catch(e => console.error('[Tournament] Failed to activate match:', e));
            activeTournamentMatchIdRef.current = table.tournamentMatchId;
        }
    }, []);

    // ── Game Event Flow ───────────────────────────────────────────────────────
    const handleGameEnd = useCallback(async (result: 'win' | 'loss' | 'quit' | 'draw') => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;

        let tournamentPot = 0;
        const tournamentMatchId = activeGameTable?.tournamentMatchId;

        if (tournamentMatchId) {
            localStorage.setItem('vantage_active_tournament_match', tournamentMatchId);
            activeTournamentMatchIdRef.current = tournamentMatchId;
            if (user) {
                try {
                    const parts = tournamentMatchId.split('-');
                    if (parts.length > 1) {
                        const tId = parts[1];
                        const tDoc = await getDoc(doc(db, 'tournaments', tId));
                        if (tDoc.exists()) {
                            const tData = tDoc.data() as Tournament;
                            tournamentPot = tData.prizePool || 0;
                        }
                    }
                } catch (e) { console.error('[App] Error fetching tournament pot:', e); }
            }
        }

        // FIX: For bot/offline games, clear the offline table BEFORE setting
        // the result so the game view renders the result overlay instead of
        // keeping the game board visible. Without this, the UI freezes showing
        // the game with no interactive elements after the final bot move.
        if (offlineTable) {
            dispatch({ type: 'SET_OFFLINE_TABLE', payload: null });
        }

        dispatch({ type: 'SET_GAME_RESULT', payload: { result, amount: 0, tournamentPot } });
    }, [activeGameTable, user, offlineTable, dispatch]);

    // BUG-S3: Reset isTransitioningRef when view transitions away from 'game'
    // using a effect that watches currentView — more reliable than setTimeout
    useEffect(() => {
        if (state.currentView === 'game') return;
        if (isTransitioningRef.current) {
            isTransitioningRef.current = false;
        }
    }, [state.currentView]);

    // REMATCH FIX: Reset isTransitioningRef whenever a new socketGame appears.
    // handleMatchFound (which also resets the ref) is only called via the
    // MatchmakingScreen onMatchFound prop — but during a rematch the user is on
    // the result overlay so MatchmakingScreen is unmounted and onMatchFound never
    // fires. Watching socketGame directly covers match_found, rematch, and rejoin.
    const prevSocketGameIdRef = useRef<string | null>(null);
    useEffect(() => {
        const newId = socketGame?.roomId ?? socketGame?.id ?? null;
        if (newId && newId !== prevSocketGameIdRef.current) {
            isTransitioningRef.current = false;
        }
        prevSocketGameIdRef.current = newId;
    }, [socketGame]);

    const finalizeGameEnd = useCallback(() => {
        // Prevent the App.tsx safety-guard effect (currentView='game', no table,
        // no result → lobby after 3s) from racing with our navigation below.
        isTransitioningRef.current = true;

        if (socket && socketGame) {
            socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_DECLINE' } });
        }

        // FIX: Derive tournament ID from socketGame FIRST (still available before
        // setSocketGame(null) is called below), then fall back to the ref.
        // Background: activeTournamentMatchIdRef is set inside handleGameEnd, but
        // handleGameEnd is never called for P2P games other than Checkers (the
        // server emits game_over → SocketContext dispatches SET_GAME_RESULT
        // directly, bypassing handleGameEnd entirely). This caused ALL tournament
        // losers to be redirected to 'lobby' instead of 'tournaments' because
        // the ref was null. Reading socketGame.tournamentMatchId directly here
        // ensures the correct destination for every game type.
        const socketTournamentMatchId = socketGame?.tournamentMatchId || socketGame?.privateRoomId || null;
        const tournamentMatchId = socketTournamentMatchId || activeTournamentMatchIdRef.current;
        const isTournament = !!tournamentMatchId;

        let pendingTournamentId: string | null = null;
        if (tournamentMatchId) {
            const parts = tournamentMatchId.split('-');
            if (parts.length > 1) pendingTournamentId = parts[1];
        }

        setSocketGame(null);
        dispatch({ type: 'SET_OFFLINE_TABLE', payload: null });
        dispatch({ type: 'SET_MATCHMAKING_CONFIG', payload: null });
        dispatch({ type: 'SET_REMATCH_STATUS', payload: 'idle' });
        dispatch({ type: 'SET_OPPONENT_DISCONNECTED', payload: { disconnected: false } });

        if (isTournament) {
            dispatch({ type: 'SET_PRE_SELECTED_GAME', payload: pendingTournamentId });
            dispatch({ type: 'SET_VIEW', payload: 'tournaments' });
        } else {
            dispatch({ type: 'SET_VIEW', payload: 'lobby' });
        }

        dispatch({ type: 'SET_GAME_RESULT', payload: null });
        localStorage.removeItem('vantage_active_tournament_match');
        activeTournamentMatchIdRef.current = null;
    }, [socket, socketGame, setSocketGame, dispatch]);

    const handleRematchRequest = useCallback(() => {
        if (!user || !socket || !socketGame) return;
        if (user.balance < (socketGame.stake || 0)) {
            toast.error(`Insufficient funds for rematch. You need ${socketGame.stake} FCFA.`);
            return;
        }
        // FIX: Guard against duplicate REMATCH_REQUEST emissions. If the player
        // already sent a request (status === 'requested'), do nothing — the server
        // deduplicates via rematchVotes.has(userId) but this stops a second
        // dispatch from resetting the UI back to 'requested' and re-showing
        // the waiting state unnecessarily, which appeared as a loop.
        if (state.rematchStatus === 'requested') return;
        dispatch({ type: 'SET_REMATCH_STATUS', payload: 'requested' });
        socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_REQUEST' } });
    }, [user, socket, socketGame, toast, dispatch, state.rematchStatus]);

    // ── Globals ───────────────────────────────────────────────────────────────
    const handleLogout = useCallback(async () => {
        await logout();
        dispatch({ type: 'SET_USER', payload: null });
        dispatch({ type: 'SET_VIEW', payload: 'landing' });
    }, [dispatch]);

    const handleDashboardQuickMatch = useCallback((gameId?: string) => {
        dispatch({ type: 'SET_PRE_SELECTED_GAME', payload: gameId || null });
        dispatch({ type: 'SET_VIEW', payload: 'lobby' });
    }, [dispatch]);

    const handleTournamentMatchJoin = useCallback((gameType: string, tournamentMatchId: string) => {
        if (!user || !socket) return;
        startMatchmaking(0, gameType, tournamentMatchId, undefined, true);
    }, [user, socket, startMatchmaking]);

    const setView = useCallback((view: ViewState) => dispatch({ type: 'SET_VIEW', payload: view }), [dispatch]);

    return {
        activeGameTable,
        isTransitioningRef,
        startMatchmaking,
        cancelMatchmaking,
        handleAcceptChallenge,
        handleMatchFound,
        handleGameEnd,
        finalizeGameEnd,
        handleRematchRequest,
        handleLogout,
        handleDashboardQuickMatch,
        handleTournamentMatchJoin,
        setView
    };
};
