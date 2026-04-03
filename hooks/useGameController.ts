import { useCallback, useRef, useEffect } from 'react';
import { ViewState, Table, SocketGameState, Tournament } from '../types';
import { useAppState } from '../services/AppContext';
import { useSocket } from '../services/SocketContext';
import { useToast } from '../services/toast';
import { createBotMatch, createChallengeGame, respondToChallenge, setTournamentMatchActive, logout, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const useGameController = () => {
    const { state, dispatch } = useAppState();
    const { socket, isConnected, bypassConnection, socketGame, setSocketGame } = useSocket();
    const toast = useToast();

    const { user, activeTable, incomingChallenge } = state;
    const isTransitioningRef = useRef(false);

    // ── Table helper ───────────────────────────────────────────────────────────
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

    const activeGameTable = socketGame ? constructTableFromSocket(socketGame) : activeTable;

    // ── Matchmaking ───────────────────────────────────────────────────────────
    const startMatchmaking = useCallback(async (stake: number, gameType: string, specificGameId?: string, difficulty?: string) => {
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
                dispatch({ type: 'SET_ACTIVE_TABLE', payload: table });
                dispatch({ type: 'SET_VIEW', payload: 'game' });
            } catch (error) {
                console.error('[App] Bot match failed:', error);
                toast.error('Could not start bot match. Try again.');
            }
            return;
        }

        if (!socket) return;
        dispatch({ type: 'SET_MATCHMAKING_CONFIG', payload: { stake, gameType } });
        dispatch({ type: 'SET_VIEW', payload: 'matchmaking' });
        socket.emit('join_game', { stake, userProfile: user, privateRoomId: specificGameId, gameType });
    }, [user, isConnected, bypassConnection, socket, dispatch, toast]);

    const cancelMatchmaking = useCallback(() => {
        dispatch({ type: 'SET_MATCHMAKING_CONFIG', payload: null });
        dispatch({ type: 'SET_VIEW', payload: 'lobby' });
    }, [dispatch]);

    const handleAcceptChallenge = useCallback(async () => {
        if (!incomingChallenge || !user) return;
        try {
            const gameId = await createChallengeGame(incomingChallenge, user);
            await respondToChallenge(incomingChallenge.id, 'accepted', gameId);
            startMatchmaking(incomingChallenge.stake, incomingChallenge.gameType, gameId);
        } catch (e) {
            console.error('[App] Failed to create challenge game:', e);
            toast.error('Could not accept challenge. Please try again.');
        }
        dispatch({ type: 'SET_INCOMING_CHALLENGE', payload: null });
    }, [incomingChallenge, user, startMatchmaking, dispatch, toast]);

    const handleMatchFound = useCallback((table: Table) => {
        dispatch({ type: 'SET_ACTIVE_TABLE', payload: table });
        if (table.tournamentMatchId) setTournamentMatchActive(table.tournamentMatchId);
        dispatch({ type: 'SET_VIEW', payload: 'game' });
    }, [dispatch]);

    // ── Game Event Flow ───────────────────────────────────────────────────────
    const handleGameEnd = useCallback(async (result: 'win' | 'loss' | 'quit' | 'draw') => {
        let tournamentPot = 0;
        const tournamentMatchId = activeGameTable?.tournamentMatchId;

        if (tournamentMatchId) {
            localStorage.setItem('vantage_active_tournament_match', tournamentMatchId);
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
        dispatch({ type: 'SET_GAME_RESULT', payload: { result, amount: 0, tournamentPot } });
    }, [activeGameTable, user, dispatch]);

    const finalizeGameEnd = useCallback(() => {
        isTransitioningRef.current = true;
        if (socket && socketGame) {
            socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_DECLINE' } });
        }
        const tournamentMatchId = activeGameTable?.tournamentMatchId;
        const isTournament = !!tournamentMatchId;

        let pendingTournamentId: string | null = null;
        if (tournamentMatchId) {
            const parts = tournamentMatchId.split('-');
            if (parts.length > 1) pendingTournamentId = parts[1];
        }

        setSocketGame(null);
        dispatch({ type: 'SET_ACTIVE_TABLE', payload: null });
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

        setTimeout(() => {
            isTransitioningRef.current = false;
        }, 500);
    }, [socket, socketGame, activeGameTable, setSocketGame, dispatch]);

    const handleRematchRequest = useCallback(() => {
        if (!user || !socket || !socketGame) return;
        if (user.balance < (socketGame.stake || 0)) {
            toast.error(`Insufficient funds for rematch. You need ${socketGame.stake} FCFA.`);
            return;
        }
        dispatch({ type: 'SET_REMATCH_STATUS', payload: 'requested' });
        socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'REMATCH_REQUEST' } });
    }, [user, socket, socketGame, toast, dispatch]);

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
        startMatchmaking(0, gameType, tournamentMatchId);
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
