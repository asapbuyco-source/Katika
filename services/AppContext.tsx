import React, {
    createContext,
    useContext,
    useReducer,
    useRef,
    useEffect,
    useCallback,
    ReactNode
} from 'react';
import { ViewState, User, Table, Challenge, Tournament } from '../types';
import { SocketGameState } from '../types';

// ─── State Shape ───────────────────────────────────────────────────────────────

export interface AppState {
    user: User | null;
    currentView: ViewState;
    // BUG-S1 FIX: offlineTable is ONLY for bot/solo games.
    // Socket (P2P) game state lives exclusively in SocketContext.socketGame.
    offlineTable: Table | null;
    matchmakingConfig: { stake: number; gameType: string; isTournament?: boolean } | null;
    authLoading: boolean;

    // Network status (for UI feedback) — driven by SocketContext
    networkStatus: 'online' | 'degraded' | 'offline';

    // Game End
    gameResult: {
        result: 'win' | 'loss' | 'quit' | 'draw';
        amount: number;
        financials?: any;
        tournamentPot?: number;
    } | null;

    // Rematch
    rematchStatus: 'idle' | 'requested' | 'opponent_requested' | 'declined';

    // Disconnection
    opponentDisconnected: boolean;
    opponentTimeout: number;

    // Lobby
    preSelectedGame: string | null;

    // Challenges
    incomingChallenge: Challenge | null;

    // Notifications
    unreadForum: boolean;
}

// ─── Actions ───────────────────────────────────────────────────────────────────

export type AppAction =
    | { type: 'SET_USER'; payload: User | null }
    | { type: 'SET_VIEW'; payload: ViewState }
    // BUG-S1 FIX: renamed from SET_ACTIVE_TABLE — only for offline/bot tables
    | { type: 'SET_OFFLINE_TABLE'; payload: Table | null }
    | { type: 'SET_MATCHMAKING_CONFIG'; payload: { stake: number; gameType: string; isTournament?: boolean } | null }
    | { type: 'SET_AUTH_LOADING'; payload: boolean }
    | { type: 'SET_GAME_RESULT'; payload: AppState['gameResult'] }
    | { type: 'SET_REMATCH_STATUS'; payload: AppState['rematchStatus'] }
    | { type: 'SET_OPPONENT_DISCONNECTED'; payload: { disconnected: boolean; timeout?: number } }
    | { type: 'SET_PRE_SELECTED_GAME'; payload: string | null }
    | { type: 'SET_INCOMING_CHALLENGE'; payload: Challenge | null }
    | { type: 'SET_UNREAD_FORUM'; payload: boolean }
    | { type: 'UPDATE_USER'; payload: Partial<User> }
    // BUG-S5 FIX: optimistic balance update — applied immediately on game_over,
    // reconciled when Firestore confirms via subscribeToUser.
    | { type: 'OPTIMISTIC_BALANCE_UPDATE'; payload: number }
    // NET: track network state for UI feedback
    | { type: 'SET_NETWORK_STATUS'; payload: AppState['networkStatus'] }
    | { type: 'RESET_GAME_STATE' };

// ─── Reducer ───────────────────────────────────────────────────────────────────

const initialState: AppState = {
    user: null,
    currentView: 'landing',
    offlineTable: null,
    matchmakingConfig: null,
    authLoading: true,
    networkStatus: 'online',
    gameResult: null,
    rematchStatus: 'idle',
    opponentDisconnected: false,
    opponentTimeout: 240,
    preSelectedGame: null,
    incomingChallenge: null,
    unreadForum: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_USER':
            return { ...state, user: action.payload };
        case 'UPDATE_USER':
            return { ...state, user: state.user ? { ...state.user, ...action.payload } : null };
        case 'OPTIMISTIC_BALANCE_UPDATE':
            // Apply expected winnings immediately; Firestore will reconcile the real value
            if (!state.user) return state;
            return { ...state, user: { ...state.user, balance: Math.max(0, state.user.balance + action.payload) } };
        case 'SET_VIEW':
            return { ...state, currentView: action.payload };
        case 'SET_OFFLINE_TABLE':
            return { ...state, offlineTable: action.payload };
        case 'SET_MATCHMAKING_CONFIG':
            return { ...state, matchmakingConfig: action.payload };
        case 'SET_AUTH_LOADING':
            return { ...state, authLoading: action.payload };
        case 'SET_GAME_RESULT':
            return { ...state, gameResult: action.payload };
        case 'SET_REMATCH_STATUS':
            return { ...state, rematchStatus: action.payload };
        case 'SET_OPPONENT_DISCONNECTED':
            return {
                ...state,
                opponentDisconnected: action.payload.disconnected,
                opponentTimeout: action.payload.timeout ?? state.opponentTimeout,
            };
        case 'SET_PRE_SELECTED_GAME':
            return { ...state, preSelectedGame: action.payload };
        case 'SET_INCOMING_CHALLENGE':
            return { ...state, incomingChallenge: action.payload };
        case 'SET_UNREAD_FORUM':
            return { ...state, unreadForum: action.payload };
        case 'SET_NETWORK_STATUS':
            return { ...state, networkStatus: action.payload };
        case 'RESET_GAME_STATE':
            // BUG-S2 NOTE: socketGame is cleared by SocketContext via setSocketGame(null).
            // This action only clears AppContext-owned fields.
            return {
                ...state,
                currentView: 'lobby',
                gameResult: null,
                rematchStatus: 'idle',
                opponentDisconnected: false,
                offlineTable: null,
                matchmakingConfig: null,
            };
        default:
            return state;
    }
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface AppContextValue {
    state: AppState;
    dispatch: React.Dispatch<AppAction>;
    /** Ref that tracks the current view without triggering re-renders in callbacks */
    viewRef: React.MutableRefObject<ViewState>;
    /** Ref that tracks the last forum message id */
    lastForumMsgId: React.MutableRefObject<string | null>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

// ─── Provider ──────────────────────────────────────────────────────────────────

export const AppStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const viewRef = useRef<ViewState>('landing');
    const lastForumMsgId = useRef<string | null>(null);

    // Keep viewRef in sync with state.currentView
    useEffect(() => {
        viewRef.current = state.currentView;
    }, [state.currentView]);

    const value: AppContextValue = { state, dispatch, viewRef, lastForumMsgId };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

export const useAppState = (): AppContextValue => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
    return ctx;
};
