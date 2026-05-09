# Katika (Vantage Gaming) — Full System Audit

**Date:** 2026-05-08  
**Auditor:** Senior Software Architect  
**Codebase:** `C:\Users\pc\Desktop\katika\Katika`  
**Commit:** b346947 (latest)  

---

## 1. SYSTEM OVERVIEW

### Purpose
Katika (branded "Vantage Gaming") is a real-money gaming platform targeting Cameroon (FCFA currency). Users deposit money via Fapshi payment gateway, play head-to-head games (Ludo, Chess, Checkers, Dice, TicTacToe, Pool) with stakes, and withdraw winnings. The platform supports tournaments with bracket-style progression, a forum, live win feeds, and admin tooling.

### Key Components

| Component | Path | Role |
|---|---|---|
| Backend Server | `server.js` (3,357 lines) | Express + Socket.IO — game engine, payments, tournaments, matchmaking, admin APIs |
| Client Entry | `index.tsx` → `components/App.tsx` | React 18 SPA, lazy-loaded routes |
| State Management | `services/AppContext.tsx`, `services/SocketContext.tsx` | React Context + useReducer (app state), Socket.IO (real-time game state) |
| Firebase Client | `services/firebase/init.ts` + `firebase/` modules | Auth, Firestore, real-time subscriptions |
| Payment Gateway | `services/fapshi.ts` → `server.js /api/pay/*` | Fapshi proxy — deposits, withdrawals, webhook |
| Firestore Rules | `firestore.rules` | Security rules (165 lines) |
| Game Logic (Server) | `server/chessLogic.js`, `server/checkersLogic.js`, `server/diceLogic.js`, `server/tictactoeLogic.js`, `server/ludoLogic.js` | Server-side move validation |
| Game Components | `components/ChessGame.tsx`, `CheckersGame.tsx`, `DiceGame.tsx`, `TicTacToeGame.tsx`, `PoolGame.tsx`, `GameRoom.tsx` (Ludo) | Client-side game rendering |
| PWA Config | `vite.config.ts` (VitePWA) | Service worker, offline caching |
| Infrastructure | `netlify.toml`, `railway.json`, `railway.toml`, `Procfile` | Netlify (frontend), Railway (backend) |

### Architecture Summary
- **Frontend:** React 18 + TypeScript, Vite bundler, Tailwind CSS, Framer Motion, deployed to Netlify
- **Backend:** Single monolithic Node.js/Express server with Socket.IO, deployed to Railway
- **Database:** Firebase Firestore (client SDK for reads, Admin SDK for server writes)
- **Auth:** Firebase Authentication (Google, Email/Password, Anonymous)
- **Payments:** Fapshi (Cameroon-specific mobile money gateway) — proxied through server to keep API keys server-side
- **Real-time:** Socket.IO with per-message deflate compression, ping interval 45s for 3G connections

---

## 2. ISSUES

### ID: 1
**Description:** Socket authentication is disabled by default. The `SOCKET_AUTH_MODE` environment variable defaults to `'off'` (server.js:169), meaning all socket connections are accepted without authentication. In this mode, any client can connect and impersonate any user by sending a crafted `userProfile.id` in the `join_game` event (server.js:2054). The server only verifies `socket.user.uid !== userProfile.id` when `socket.user` exists (line 2055), which is never true when auth is off.  
**Root Cause:** Default `SOCKET_AUTH_MODE=off` was intended for development convenience, but there is no warning log or guard preventing production deployment with auth disabled. The production startup check (lines 42-47) forces `FRONTEND_URL` and `ADMIN_EMAILS` but does not enforce `SOCKET_AUTH=enforce`.  
**Severity:** Critical

### ID: 2
**Description:** The `/api/tournaments/create` endpoint (server.js:1176-1189) spreads `req.body` directly into the Firestore document with no field whitelist. A malicious admin (or anyone who obtains an admin JWT) can inject arbitrary fields such as `prizePool: 999999999`, `participants: ['attacker_user_id']`, or overwrite `status` to `completed` to trigger payout.  
**Root Cause:** `db.collection('tournaments').add({ ...req.body, createdAt: ..., status: 'registration', participants: [] })` — the spread operator copies all client-supplied fields before the safe defaults. Since `status` and `participants` appear after the spread, they are overridden, but `prizePool`, `entryFee`, `maxPlayers`, `name`, `gameType`, and any other arbitrary fields pass through unchecked.  
**Severity:** Critical

### ID: 3
**Description:** All game state for non-Pool games is held exclusively in the `rooms` in-memory Map. If the server restarts (Railway deploys, OOM kills, crashes), all active Chess, Checkers, Dice, TicTacToe, and Ludo games are lost. Players' escrow stakes are at risk of permanent loss. Only Pool games persist state via `persistRoomToFirestore` (server.js:2955-2957). The shutdown handler attempts to refund stale games (lines 3302-3355), but games with a move in the last 60 seconds are only persisted, not refunded — and if the shutdown is unclean (SIGKILL, OOM), even the persistence cycle doesn't complete.  
**Root Cause:** `rooms = new Map()` (line 1666) is the single source of truth for game state. No periodic persistence occurs for most game types.  
**Severity:** Critical

### ID: 4
**Description:** The `creditDepositIdempotent` function in `services/firebase/finance.ts` (lines 58-97) is imported and available in client code. It attempts to write to the `processed_payments` collection, which has `allow read, write: if false` in Firestore rules (line 90). This function will always fail from the client but its presence creates a false security assumption and could be called by a compromised client to attempt double-crediting if rules are ever relaxed. Similarly, `addUserTransaction` (finance.ts:35-51) attempts client-side balance manipulation that would also fail under current rules.  
**Root Cause:** Financial functions that should only exist server-side are exported from the client SDK barrel file (`services/firebase.ts`).  
**Severity:** High

### ID: 5
**Description:** The `findOrCreateMatch` function in `services/firebase/games.ts` (lines 10-47) has a classic TOCTOU race condition. It queries for an open game, and if none exists, creates one. Two simultaneous clients can both find no open game and create two separate games instead of joining each other. This results in orphaned games where one player waits indefinitely.  
**Root Cause:** Firestore does not support atomic "find or create" transactions across queries and writes in the client SDK.  
**Severity:** High

### ID: 6
**Description:** The `setGameResult` function in `services/firebase/games.ts` (lines 100-103) directly writes `status: "completed"` and `winner: winnerId` to a Firestore game document from the client. If used for staked games (not just bot matches), a malicious client could declare itself the winner. While the server-authoritative socket path is the primary game flow, this function remains importable and could be called by modified clients for Firestore-based games.  
**Root Cause:** No server-side validation gate for Firestore game result writes. The Firestore rules (line 60) allow any authenticated user in the game's `players` array to update the game document.  
**Severity:** High

### ID: 7
**Description:** The `pendingDeposits` Map (server.js:260) stores deposit metadata in server memory. On server restart, all pending deposits are lost from memory. While there is a Firestore fallback (`pending_payments` collection, line 341-346), the webhook handler checks the in-memory map first (line 402). If a Fapshi webhook arrives after a server restart but before the Firestore `pending_payments` document is written (tiny race window), the deposit will still be found via the Firestore fallback. However, the `depositAmount` field in the webhook flow (line 289) is set to the total amount including the fee, not the user's intended deposit. The comment on line 286-289 indicates this is intentional ("The fee was added by the client (totalToPay = amount + fee), so we store the original depositAmount from the client for crediting purposes"), but the variable name `depositAmount` is set to `amount` which is actually `totalToPay` (the full amount the user paid including fee). This means users are credited the full payment amount including the platform fee, effectively receiving more than they should.  
**Root Cause:** Variable naming confusion. Line 289: `const depositAmount = amount;` but `amount` is the total payment (deposit + fee). The web page comment says "the original depositAmount from the client", but the client sends `totalToPay` as `amount`.  
**Severity:** High

### ID: 8
**Description:** User profile names and other fields sent via `userProfile` in the `join_game` socket event are not sanitized beyond the chat `sanitize()` function which only strips HTML tags. A malicious user could set their name to contain script content that, when rendered by the opponent's client, could execute XSS. The `sanitize` function (line 143) is only applied to chat messages, not user names.  
**Root Cause:** No server-side input validation on `userProfile.name`, `userProfile.avatar`, or other user-supplied fields in the `join_game` handler.  
**Severity:** High

### ID: 9
**Description:** The entire backend is a single 3,357-line `server.js` file containing authentication middleware, payment processing, tournament logic, game engines, socket handlers, scheduling, admin routes, and static file serving. This makes testing impossible (no unit tests for server code), deployment risky (any change requires full redeploy), and debugging failures extremely difficult. Game logic functions (Checkers, Chess, Dice, TicTacToe, Ludo) are defined inline rather than imported from the `server/` directory modules.  
**Root Cause:** Rapid development without architectural decomposition. Game logic modules exist in `server/` (*.js files) but the Chess validation uses the `chess.js` library inline rather than the imported `validateChessMove` from `server/chessLogic.js`.  
**Severity:** High

### ID: 10
**Description:** The CORS configuration (server.js:128-141) uses a callback that allows requests with `!origin` (line 131). While this is standard for mobile/native apps, it allows any server-side script (curl, server-to-server) to bypass CORS entirely. Combined with the socket auth being off by default, this means any HTTP client can interact with all API endpoints without a browser enforcing origin checks.  
**Root Cause:** `!origin` passthrough is intentional for mobile but reduces defense-in-depth.  
**Severity:** Medium

### ID: 11
**Description:** Content Security Policy (server.js:96-111) allows `'unsafe-inline'` for scripts and styles. This significantly weakens XSS protection. If an XSS vulnerability exists (see Issue #8), CSP will not prevent inline script execution.  
**Root Cause:** React's styling approach likely requires `'unsafe-inline'` for styles, but script `'unsafe-inline'` can be avoided with nonces or hashes.  
**Severity:** Medium

### ID: 12
**Description:** Tournament scheduler (server.js:981-1109) runs every 30 seconds with no distributed locking. If multiple Railway instances are running, both will attempt to start the same tournament, create duplicate matches, and potentially double-credit winners. The `startTournamentLogic` checks `status !== 'registration'` but this read-then-write is non-atomic across instances.  
**Root Cause:** No Redis/database-level advisory lock. The `startTournamentLogic` reads tournament status, then updates it — a classic race condition in multi-instance deployments.  
**Severity:** Medium

### ID: 13
**Description:** The game room cleanup timer (server.js:1928) uses a 60-second `setTimeout` to delete completed rooms from memory. If many games end simultaneously (e.g., tournament round completion), all rooms persist in memory for 60 seconds. Combined with the in-memory `rooms` Map holding full game state including chat history (capped at 50 messages), this creates a transient memory spike. With 100+ concurrent games, this could reach 50-100MB of transient data.  
**Root Cause:** Fixed cleanup delay with no memory-aware eviction policy.  
**Severity:** Medium

### ID: 14
**Description:** The `sendChallenge` function in `services/firebase/games.ts` (lines 145-161) creates a challenge document directly from the client. The sender's balance is checked client-side (line 146-148) but this can be bypassed by a modified client. The `createChallengeGame` function (lines 167-204) also does client-side balance checking. When a challenge is accepted, the escrow deduction occurs later via socket, meaning a user with insufficient funds can send challenges that appear valid.  
**Root Cause:** No server-side API endpoint for challenge creation/acceptance. All challenge logic runs through the client Firestore SDK.  
**Severity:** Medium

### ID: 15
**Description:** The disbursement flow (server.js:518-615) debits the user atomically before calling Fapshi (lines 546-558). If Fapshi times out after the debit, the refund transaction (lines 580-584) is wrapped in a `.catch()` block, meaning a crash at that exact point would leave the user debited with no refund. The `pendingTxRef` record is created in the debit transaction as `status: 'pending'`, but there's no background job to reconcile failed withdrawals. The orphaned escrow reconciler (server.js:3219-3283) only handles `escrow_lock` transactions, not `withdrawal` type transactions with `status: 'pending'`.  
**Root Cause:** Missing reconciliation for pending withdrawal transactions.  
**Severity:** Medium

### ID: 16
**Description:** The Ludo move validation (server.js:3018-3133) trusts the client's `action.pieces` array for non-current-player pieces with only a step-comparison check (lines 3038-3045). The check `if (p.owner !== userId)` returns `p.step !== prev.step`, meaning opponent pieces must not change step. But the check doesn't validate `p.finished`, `p.color`, or `p.id` fields — a malicious client could change an opponent piece's `finished` flag to `true`, causing a spurious win detection.  
**Root Cause:** Incomplete validation of opponent piece mutation in Ludo's `MOVE_PIECE` handler.  
**Severity:** Medium

### ID: 17
**Description:** The `.env` file (not tracked by git) contains hardcoded production values: `VITE_FIREBASE_API_KEY`, `VITE_SOCKET_URL` pointing to the production Railway server. While VITE_ prefixed variables are by design embedded in the frontend bundle, having them in a local `.env` file with production values increases the risk of accidental server-side secret leakage. The comments in the file also reference `ADMIN_EMAILS=abrackly@gmail.com` (line 31, commented out) which is the default admin email used in development mode.  
**Root Cause:** Development convenience prioritized over secret hygiene.  
**Severity:** Medium

### ID: 18
**Description:** The Pool game validation (server.js:2771-2947) passes client-submitted `action.newState.balls` array which is merged onto server state. While there are position-teleportation, velocity, un-pocketing, and ball count checks, the validation allows up to 4 balls to be pocketed in a single shot (line 2832: `newCount - prevCount > 4`). This threshold could allow a cheating client to pocket 4 balls in a single shot, which is physically impossible in real pool.  
**Root Cause:** The `4` threshold is likely meant for break shots, but breaks rarely pocket more than 2. A threshold of 2 with a special break-shot exception would be tighter.  
**Severity:** Low

### ID: 19
**Description:** The `createBotMatch` function in `services/firebase/games.ts` (lines 49-69) creates a Firestore document with `stake: 0` and `guest` set to a bot profile. The `players` array contains `[user.id, 'bot']`. Since bot games are stored in the same `games` collection as real games, they appear in activity stats and admin dashboards. More critically, the `subscribeToGame` listener on the client would receive updates for bot games without any server-side game logic, meaning a malicious client could modify the bot game document directly via Firestore to declare a false win.  
**Root Cause:** Bot games share the same Firestore collection (`games`) as real games, with no server-side game engine proctoring them.  
**Severity:** Medium

### ID: 20
**Description:** TypeScript configuration (`tsconfig.json`) has `noUnusedLocals: false` and `noUnusedParameters: false`, reducing compile-time safety. The server code is entirely JavaScript (`.js`) with no type checking. Game logic modules in `server/` are `.js` files that would benefit from TypeScript's type system for financial calculations and game state structures.  
**Root Cause:** Incremental development without strict TS configuration; server code was never migrated from JS.  
**Severity:** Low

### ID: 21
**Description:** The `searchUsers` function (services/firebase/users.ts:48-68) uses `orderBy("name")` with `where("name", ">=", term)` which requires a composite Firestore index. If this index hasn't been created (it's not in `firestore.indexes.json`), the query will fail silently (returning an empty array). The `firestore.indexes.json` file only contains an empty indexes array.  
**Root Cause:** Missing composite index definition for user name search.  
**Severity:** Medium

### ID: 22
**Description:** The `escape` function for XSS (line 143) only strips HTML tags: `String(text).replace(/<[^>]*>?/gm, '').substring(0, 150)`. This does not handle event handlers in attributes, JavaScript URIs, or unicode-encoded XSS payloads. For example, an avatar URL or user name containing `javascript:alert(1)` or `onerror=alert(1)` would pass through this sanitizer.  
**Root Cause:** Homegrown sanitizer instead of a library like `DOMPurify`.  
**Severity:** Medium

### ID: 23
**Description:** The disbursement endpoint (server.js:518) uses the same `FAPSHI_API_KEY` and `FAPSHI_USER_TOKEN` for both deposits and withdrawals. The `.env.example` comments reference separate `FAPSHI_API_KEY_WITHDRAWAL` keys (line 34) that are never used. If the deposit credentials are compromised, an attacker could also withdraw funds.  
**Root Cause:** Separate withdrawal keys were planned but never implemented.  
**Severity:** Low

### ID: 24
**Description:** The server's socket rate limiter (server.js:202-222) uses a `connectionsByIP` Map with a limit of `10` connections per IP. However, in cloud deployments behind a reverse proxy, all connections may share the same `x-forwarded-for` header IP, effectively limiting all users to 10 total connections. The `trust proxy` setting (line 90) enables this. For a platform with many users in the same network (e.g., Cameroonian ISPs using CGNAT), this could block legitimate users.  
**Root Cause:** Per-IP socket rate limiting doesn't account for shared IPs in cloud deployments and CGNAT environments.  
**Severity:** Medium

### ID: 25
**Description:** The `connectionsByIP` Map eviction (lines 211-213) removes the oldest key when the Map exceeds 10,000 entries, but this eviction strategy is FIFO rather than LRU. Legitimate connections from long-lived IPs can be evicted while recent attack IPs remain. Additionally, the `setTimeout` decrement (lines 216-220) can cause race conditions where the count goes negative.  
**Root Cause:** Naive Map eviction without considering connection age or stability.  
**Severity:** Low

---

## 3. IMPROVEMENT STRATEGY

### Issue #1 (Critical — Socket auth off by default)
**Fix Approach:** Add a production guard in the server startup sequence that refuses to start if `SOCKET_AUTH_MODE` is not `enforce` when `NODE_ENV === 'production'`. Add this check immediately after the existing `ADMIN_EMAILS` production check (after line 62):
```
if (process.env.NODE_ENV === 'production' && (!process.env.SOCKET_AUTH || process.env.SOCKET_AUTH === 'off')) {
    console.error('FATAL: SOCKET_AUTH must be set to "enforce" or "log" in production. Connection auth is required.');
    process.exit(1);
}
```

### Issue #2 (Critical — Unvalidated tournament creation)
**Fix Approach:** Replace `req.body` spread with an explicit whitelist of allowed fields:
```javascript
const ALLOWED_TOURNAMENT_FIELDS = ['name', 'gameType', 'entryFee', 'prizePool', 'maxPlayers', 'type', 'startTime'];
const sanitizedBody = {};
for (const key of ALLOWED_TOURNAMENT_FIELDS) {
    if (req.body[key] !== undefined) sanitizedBody[key] = req.body[key];
}
// Validate types: name (string), gameType (enum), entryFee (positive integer), etc.
db.collection('tournaments').add({ ...sanitizedBody, createdAt: ..., status: 'registration', participants: [] });
```

### Issue #3 (Critical — In-memory game state for non-Pool games)
**Fix Approach:** Add `persistRoomToFirestore(roomId, room)` calls after every `game_update` emission for all game types, not just Pool. In `server.js`, after each `io.to(roomId).emit('game_update', ...)` call for non-Pool games, add a debounced persist call. On server restart, `hydrateRoomsFromFirestore` (already exists at line 1674) will restore state. Also add a periodic flush (every 10s) that persists all active rooms.

### Issue #4 (High — Client-side financial functions)
**Fix Approach:** Remove `creditDepositIdempotent` and `addUserTransaction` from the client-facing barrel file (`services/firebase.ts`) and from the `services/firebase/finance.ts` module. These functions should only exist server-side. Replace any client imports with server API calls. Since `addUserTransaction` appears unused in client code, simply remove the exports. Keep `getUserTransactions` (read-only, safe for client).

### Issue #5 (High — TOCTOU in findOrCreateMatch)
**Fix Approach:** Create a server-side matchmaking endpoint `/api/games/find-or-create` that performs the find-or-create atomically using a Firestore transaction. Replace the client-side `findOrCreateMatch` call with a fetch to this endpoint. Alternatively, use a Firestore transaction with `read-only` then `write` pattern where the client first checks for an open game, and if none exists, the server creates one in a transaction.

### Issue #6 (High — Client can set game results)
**Fix Approach:** Restrict the Firestore `games` collection update rule to only allow updates from authenticated users who are players AND only allow specific field changes. Change `allow update: if isAuth() && request.auth.uid in resource.data.players` to require that `status` and `winner` fields can only change from `'active'` to `'completed'`, and that only `gameState` and `turn` are writable from clients. For bot games, add a `bot: true` flag and ensure the server validates wins.

### Issue #7 (High — Deposit amount includes fee)
**Fix Approach:** On the server's `/api/pay/initiate` handler (line 265), the client sends `amount` which is actually the total payment including fee. Add a separate `depositAmount` parameter that represents the amount to credit to the user's balance. The server should validate that `depositAmount < amount` and `depositAmount >= 100`. On the webhook side, use `depositAmount` from the stored `pendingDeposits` record rather than `verifyData.amount` (which is the total including fee).

### Issue #8 (High — XSS via unsanitized names)
**Fix Approach:** Apply the existing `sanitize()` function (or a proper HTML entity encoder) to all user-supplied text fields before broadcasting via socket. In the `join_game` handler (line 2049), sanitize `userProfile.name` before storing it in the room. Additionally, replace the homegrown `sanitize` function with the `dompurify` library for HTML sanitization. On the client side, always use React's JSX (which auto-escapes) and never use `dangerouslySetInnerHTML`.

### Issue #9 (High — Monolithic server)
**Fix Approach:** Decompose `server.js` into modules:  
- `server/routes/payments.js` — Fapshi proxy, webhook, status  
- `server/routes/tournaments.js` — Tournament CRUD, scheduler  
- `server/routes/admin.js` — Admin ban, maintenance, force-result  
- `server/routes/disputes.js` — Dispute filing and resolution  
- `server/gameEngine.js` — Room management, game state, matchmaking  
- `server/gameLogic/checkers.js`, `server/gameLogic/ludo.js`, etc. — Individual game validators  
- `server/middleware/auth.js` — verifyAuth, verifyAdmin, blockGuests  
- `server/middleware/rateLimit.js` — Rate limiting config  
This allows unit testing per module and independent deployment.

### Issue #11 (Medium — weak CSP)
**Fix Approach:** Replace `'unsafe-inline'` in `scriptSrc` with a nonce-based approach. Generate a nonce per request using `crypto.randomBytes(16).toString('base64')`, inject it into the CSP header, and add it as a `<meta>` tag in `index.html`. For `styleSrc`, keep `'unsafe-inline'` since Tailwind CSS requires it.

### Issue #12 (Medium — Tournament race condition)
**Fix Approach:** Use Firestore transactions with atomic status updates. In `startTournamentLogic`, wrap the status check and update in a transaction:
```javascript
await db.runTransaction(async (tx) => {
    const snap = await tx.get(tRef);
    if (snap.data().status !== 'registration') return;
    tx.update(tRef, { status: 'starting' }); // intermediate state
});
// then create matches
await tRef.update({ status: 'active' });
```
This prevents two instances from both reading `status: 'registration'` and proceeding.

### Issue #14 (Medium — Client-side challenge creation)
**Fix Approach:** Create server-side endpoints `/api/challenges/send` and `/api/challenges/respond` that validate balances atomically before creating challenge documents. The client should call these endpoints instead of writing directly to Firestore. Remove `allow create: if isFullAccount()` from the `challenges` collection rule and replace with `allow write: if false`.

### Issue #15 (Medium — Withdrawal reconciliation gap)
**Fix Approach:** Add a scheduled job (similar to the tournament scheduler) that runs every 5 minutes and queries `transactions` with `type === 'withdrawal'` and `status === 'pending'` created more than 10 minutes ago. For each, verify with Fapshi and either complete the withdrawal or refund the user.

### Issue #19 (Medium — Bot games in same collection)
**Fix Approach:** Store bot games in a separate Firestore collection `bot_games` with `allow create: if isAuth()` and `allow update: if isAuth() && request.auth.uid in resource.data.players`. Only real money games should be in `games`. Alternatively, add a `bot: userId` field and exclude bot games from activity stats and admin dashboards.

### Issue #21 (Medium — Missing Firestore index)
**Fix Approach:** Add the required composite index to `firestore.indexes.json`:
```json
{
  "indexes": [
   {"collectionId": "users", "fields": [{"fieldPath": "name", "mode": "ASCENDING"}]},
   {"collectionId": "games", "fields": [{"fieldPath": "createdAt", "mode": "DESCENDING"}]},
   {"collectionId": "transactions", "fields": [{"fieldPath": "type", "mode": "ASCENDING"}, {"fieldPath": "date", "mode": "DESCENDING"}]}
  ]
}
```
Firebase will auto-create indexes when queries fail in development, but production requires explicit definition.

### Issue #24 (Medium — Per-IP rate limit blocks CGNAT users)
**Fix Approach:** Change the socket rate limiter to use `socket.user?.uid || ip` as the key (already done for HTTP at line 122). For sockets, combine IP with the authenticated user ID. Increase the per-IP limit from 10 to 50 for Socket.IO connections (which use multiple connections per tab including polling fallback). Add circuit-breaker logic that validates the socket auth token before counting.

---

## 4. IMPLEMENTATION PLAN

### Phase 1: Critical Security Fixes (Day 1-2)

| Step | Action | File | Detail |
|------|--------|------|--------|
| 1.1 | Enforce SOCKET_AUTH in production | `server.js` | Add production guard after line 62 that `process.exit(1)` if `SOCKET_AUTH` is `'off'` in production |
| 1.2 | Validate tournament creation fields | `server.js` | Replace `...req.body` with explicit field whitelist + type validation in `/api/tournaments/create` handler |
| 1.3 | Fix deposit amount variable | `server.js` | Add `depositAmount` as separate field in initiate request, store and use it in webhook instead of full `amount` |
| 1.4 | Remove client-side financial functions | `services/firebase.ts`, `services/firebase/finance.ts` | Remove `creditDepositIdempotent` and `addUserTransaction` exports and implementations |
| 1.5 | Sanitize user profile fields on join | `server.js` | Apply `sanitize()` to `userProfile.name` and validate `userProfile.id` against `socket.user.uid` in `join_game` handler |
| 1.6 | Add withdrawal reconciliation scheduler | `server.js` | Add 5-minute interval job that queries pending withdrawals older than 10min, verifies with Fapshi, and completes/refunds |

### Phase 2: State Persistence & Data Integrity (Day 3-4)

| Step | Action | File | Detail |
|------|--------|------|--------|
| 2.1 | Persist all game rooms on state change | `server.js` | Call `persistRoomToFirestore(roomId, room)` after every `io.to(roomId).emit('game_update', ...)` for all game types |
| 2.2 | Add periodic room flush | `server.js` | Add `setInterval` every 10s that persists all active rooms to Firestore |
| 2.3 | Move matchfind to server API | `server.js`, `services/firebase/games.ts` | Create `/api/games/find-or-create` endpoint with Firestore transaction; update client to call API instead of direct Firestore |
| 2.4 | Restrict Firestore game updates | `firestore.rules` | Change games `allow update` to restrict `status`/`winner` fields from client writes; add `bot` field handling |
| 2.5 | Separate bot game collection | `services/firebase/games.ts`, `firestore.rules` | Move `createBotMatch` to use `bot_games` collection |

### Phase 3: Architecture Decomposition (Day 5-8)

| Step | Action | File | Detail |
|------|--------|------|--------|
| 3.1 | Extract payment routes | `server/routes/payments.js` | Move `/api/pay/*` endpoints and webhook handler |
| 3.2 | Extract tournament routes | `server/routes/tournaments.js` | Move `/api/tournaments/*` endpoints and scheduler |
| 3.3 | Extract admin routes | `server/routes/admin.js` | Move `/api/admin/*`, `/api/maintenance`, `/api/pay/disburse` |
| 3.4 | Extract dispute routes | `server/routes/disputes.js` | Move `/api/disputes/*` endpoints |
| 3.5 | Extract game engine | `server/gameEngine.js` | Move `rooms`, `queues`, `userSockets`, `socketUsers`, `endGame`, `settleGame`, matchmaking, game action handlers |
| 3.6 | Extract game logic modules | `server/gameLogic/*.js` | Move Checkers, Dice, TicTacToe, Ludo validation to separate testable modules |
| 3.7 | Extract auth middleware | `server/middleware/auth.js` | Move `verifyAuth`, `verifyAdmin`, `blockGuests`, socket auth |
| 3.8 | Add unit tests for game logic | `tests/` | Create tests for each extracted game logic module |

### Phase 4: Security Hardening (Day 9-10)

| Step | Action | File | Detail |
|------|--------|------|--------|
| 4.1 | Upgrade CSP to nonce-based | `server.js`, `index.html` | Generate nonce per request, add to CSP header and meta tag, remove `'unsafe-inline'` from `scriptSrc` |
| 4.2 | Add DOMPurify sanitization | `package.json`, `server.js` | Install `dompurify` (server) and `isomorphic-dompurify`; replace homegrown `sanitize()` |
| 4.3 | Move challenge creation server-side | `server.js`, `services/firebase/games.ts`, `firestore.rules` | Create `/api/challenges/send` and `/api/challenges/respond` endpoints; remove client Firestore writes for challenges |
| 4.4 | Add Firestore indexes | `firestore.indexes.json` | Add composite indexes for `users` name search, `games` status+gameType, `transactions` type+date |
| 4.5 | Split withdrawal API credentials | `server.js` | Use `FAPSHI_API_KEY_WITHDRAWAL` / `FAPSHI_USER_TOKEN_WITHDRAWAL` for disbursement endpoint |
| 4.6 | Strengthen Ludo validation | `server.js` | Validate `finished`, `color`, `id` immutability for opponent pieces in `MOVE_PIECE` handler |

### Phase 5: Resilience & Operations (Day 11-12)

| Step | Action | File | Detail |
|------|--------|------|--------|
| 5.1 | Add distributed locks for tournaments | `server.js` | Use Firestore transaction-based locks (`processed_tournaments` sentinel pattern) for scheduler operations |
| 5.2 | Improve socket rate limiter | `server.js` | Change per-IP limit from 10 to 50; use `uid || ip` as key after auth; add separate rate limits for authenticated vs anonymous sockets |
| 5.3 | Add memory-aware room eviction | `server.js` | Replace fixed 60s cleanup with priority-based eviction: completed rooms first, then stale rooms by age |
| 5.4 | Convert server to TypeScript | `server/`, `tsconfig.json` | Migrate server modules to `.ts` files with strict type checking |
| 5.5 | Add health check with dependency status | `server.js` | Enhance `/health` endpoint to report Firestore connectivity, Fapshi API reachability, and active room count |
| 5.6 | Add structured logging | `server.js` | Replace `console.log/warn/error` with structured JSON logs including requestId, userId, and timestamp |