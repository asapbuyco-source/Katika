// Firebase service — barrel re-export.
// All actual implementations live in named modules under this directory.
// Import from here to keep existing component imports working:
//   import { syncUserProfile, subscribeToUser } from '../services/firebase';
//
// Module map:
//   auth.ts       — signInWithGoogle, loginWithEmail, registerWithEmail, logout, loginAsGuest, getIdToken
//   users.ts      — syncUserProfile, subscribeToUser, searchUsers, getAllUsers
//   games.ts      — findOrCreateMatch, createBotMatch, subscribeToGame, getGame, updateGameState, sendChallenge, createChallengeGame, ...
//   tournaments.ts — getTournaments, subscribeToTournament, registerForTournament, ...
//   finance.ts    — getUserTransactions, addUserTransaction, creditDepositIdempotent
//   social.ts     — subscribeToForum, sendForumMessage, submitBugReport, subscribeToGlobalWinners, ...
//   admin.ts      — banUser, setMaintenanceMode, getSystemLogs
//   init.ts       — auth, db, getApiUrl (DO NOT import directly from here)

export { auth, db, getApiUrl } from './firebase/init';

export {
    signInWithGoogle, registerWithEmail, loginWithEmail, logout,
    triggerPasswordReset, updateUserEmail, deleteAccount, loginAsGuest, getIdToken
} from './firebase/auth';

export {
    syncUserProfile, subscribeToUser, searchUsers, getAllUsers
} from './firebase/users';

export {
    findOrCreateMatch, createBotMatch, subscribeToGame, getGame,
    updateGameState, updateTurn, setGameResult, updateGameStatus,
    subscribeToGameConfigs, subscribeToIncomingChallenges, subscribeToChallengeStatus,
    sendChallenge, respondToChallenge, createChallengeGame,
    getActiveGamesCount, getGameActivityStats
} from './firebase/games';

export {
    getTournaments, subscribeToTournament, subscribeToTournamentMatches,
    getTournamentMatches, createTournament, deleteTournament,
    updateTournamentStatus, startTournament, setTournamentMatchActive,
    setTournamentMatchCheckedIn, reportTournamentMatchResult, registerForTournament,
    fetchServerTimeOffset, getServerTime
} from './firebase/tournaments';

export {
    getUserTransactions, addUserTransaction, creditDepositIdempotent
} from './firebase/finance';

export {
    subscribeToForum, sendForumMessage, deleteForumMessage,
    submitBugReport, getBugReports, resolveBugReport, subscribeToGlobalWinners
} from './firebase/social';

export {
    banUser, setMaintenanceMode, subscribeToMaintenanceMode, getSystemLogs
} from './firebase/admin';

// ─── Re-export Timestamp for type annotations ─────────────────────────────────
export { serverTimestamp } from 'firebase/firestore';
