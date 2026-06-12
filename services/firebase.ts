// Firebase service — barrel re-export.
// All actual implementations live in named modules under this directory.
// Import from here to keep existing component imports working:
//   import { syncUserProfile, subscribeToUser } from '../services/firebase';
//
// Module map:
//   auth.ts       — signInWithGoogle, loginWithEmail, registerWithEmail, logout, loginAsGuest, getIdToken
//   users.ts      — syncUserProfile, subscribeToUser, searchUsers, getAllUsers
//   games.ts      — createBotMatch, subscribeToGame, getGame, updateGameState,
    //                   updateTurn, updateGameStatus, subscribeToGameConfigs,
    //                   subscribeToIncomingChallenges, subscribeToChallengeStatus,
    //                   sendChallenge, respondToChallenge,
    //                   getActiveGamesCount, getGameActivityStats
    //                   NOTE: findOrCreateMatch and setGameResult REMOVED (Phase 1.3).
    //                   matchmaking uses socket join_game; game completion uses server
    //                   socket endGame path — never call these from client code.
//   tournaments.ts — getTournaments, subscribeToTournament, registerForTournament, ...
//   finance.ts    — getUserTransactions
//   social.ts     — subscribeToForum, sendForumMessage, submitBugReport, subscribeToGlobalWinners, ...
//   admin.ts      — banUser, setMaintenanceMode, getSystemLogs
//   init.ts       — auth, db, getApiUrl (DO NOT import directly from here)
//   leaderboard.ts — getLeaderboard

export { auth, db, getApiUrl } from './firebase/init';

export {
    signInWithGoogle, registerWithEmail, loginWithEmail, logout,
    triggerPasswordReset, updateUserEmail, deleteAccount, loginAsGuest, getIdToken
} from './firebase/auth';

export {
    syncUserProfile, subscribeToUser, searchUsers, getAllUsers
} from './firebase/users';

export {
    createBotMatch, subscribeToGame, getGame,
    updateGameState, updateTurn, updateGameStatus,
    subscribeToGameConfigs, subscribeToIncomingChallenges, subscribeToChallengeStatus,
    sendChallenge, respondToChallenge, cancelChallenge,
    getActiveGamesCount, getGameActivityStats
} from './firebase/games';

export {
    getTournaments, subscribeToTournament, subscribeToTournamentMatches,
    getTournamentMatches, createTournament, deleteTournament,
    updateTournamentStatus, startTournament, setTournamentMatchActive,
    setTournamentMatchCheckedIn, reportTournamentMatchResult, registerForTournament,
    fetchServerTimeOffset, getServerTime, normalizeTimestamp
} from './firebase/tournaments';

export {
    getUserTransactions
} from './firebase/finance';

export {
    subscribeToForum, sendForumMessage, deleteForumMessage,
    submitBugReport, getBugReports, resolveBugReport, subscribeToGlobalWinners
} from './firebase/social';

export {
    banUser, setMaintenanceMode, subscribeToMaintenanceMode, getSystemLogs,
    editUserBalance, deleteUserAccount, getAdminWithdrawals, markWithdrawalPaid,
    rejectWithdrawal
} from './firebase/admin';
export type { AdminWithdrawalRequest } from './firebase/admin';

export {
    getLeaderboard
} from './firebase/leaderboard';

// ─── Re-export Timestamp for type annotations ─────────────────────────────────
export { serverTimestamp } from 'firebase/firestore';
