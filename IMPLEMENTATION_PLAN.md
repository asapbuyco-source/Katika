# Katika (Vantage Gaming) — Unified Implementation Plan

**Date:** 2026-05-08  
**Status:** Authoritative — supersedes AUDIT_SYSTEMATIC.md Phase 4 plan, AUDIT_GAPS.md, and PLAN_CHALLENGE.md  
**Timeline:** 5–6 weeks (34 working days), single senior engineer  
**Principle:** Financial correctness is paramount. Every step that touches money flows must be verified in isolation before merging.

---

## RESOLVED CONTRADICTIONS

The three source documents (audit, gaps, challenge) disagreed on the following points. This plan adopts the decision noted in the rightmost column.

| # | Original Plan Says | Challenge Says | Decision | Rationale |
|---|---|---|---|---|
| 1 | Nonce-based CSP (Step 4.1) | Nonce is impossible with static SPA on CDN (WA-1) | **Hash-based CSP at build time** | Nonce requires per-request HTML injection; Katika's `index.html` is a static Vite build artifact served by Netlify CDN. SHA-256 hashes of inline scripts/styles are computed at build time and injected into the CSP header by Express. |
| 2 | Persist on every `game_update` (Step 2.1) + periodic 10s flush (Step 2.2) | 2× writes for zero gain; $15K+/month at scale (WA-4, IA-1) | **State-transition persistence only** — persist on game start, each move/turn change, and game end. No periodic flush. No persistence on chat messages, timer ticks, or aim_sync. | A single strategy eliminates redundant writes. State-transition persistence costs 3–10 writes per game (vs. 30–200 per game on every update). Crash recovery via hydrate restores the last persisted state. |
| 3 | Create `/api/games/find-or-create` HTTP endpoint (Step 2.3) | Remove `findOrCreateMatch` instead; socket `join_game` already handles matchmaking (IA-2, RC-7) | **Remove the client function; do not build a new HTTP API** | The socket `join_game` handler is the authoritative matchmaking path. `findOrCreateMatch` in `services/firebase/games.ts` has a TOCTOU race and is not used by the main game flow. Building a parallel HTTP endpoint duplicates logic and increases attack surface. |
| 4 | TypeScript migration in Phase 5 (Step 5.4) | TypeScript should precede module extraction to avoid double-touch and catch circular imports (IA-5, RC-6) | **TypeScript migration in Phase 3, before module extraction** | Migrating to `.ts` first gives compile-time safety during risky refactoring. Extracting modules as typed files avoids re-understanding intent later. Circular imports are caught at compile time. |
| 5 | Extract game engine then game logic (Steps 3.5 → 3.6) | Extract game logic first; engine imports the tested modules (IA-4) | **Extract game logic modules first, then game engine** | Tests anchor extracted modules before the engine imports them. Extracting engine first then re-extracting logic out of the engine is a double-move that breaks intermediate tests. |
| 6 | Apply weak `sanitize()` first (Step 1.5), replace with DOMPurify later (Step 4.2) | Ships XSS exposure for 9 days (IA-3) | **Install and apply DOMPurify immediately in Phase 0** | The homegrown `sanitize()` strips HTML tags but not event handlers or `javascript:` URIs. Shipping it for any duration leaves a live vulnerability. DOMPurify is a one-time install-and-apply. |
| 7 | Firestore transactions as distributed locks (Step 5.1) | Firestore transactions are not mutual exclusion; use precondition-based status transitions (WA-2, RC-5) | **Atomic precondition updates** — `update({ status: 'starting' }, { precondition: { status: 'registration' } })` | Precondition updates atomically transition state. Exactly one instance succeeds. Transactions provide ACID within a single execution but do not prevent two instances from both reading `'registration'` and proceeding. |
| 8 | `process.exit(1)` for missing `SOCKET_AUTH` in production (Step 1.1) | Creates crash loop on Railway; no grace period (FP-1) | **Log FATAL error and degrade to `'log'` mode; do not crash** | A crash loop makes the platform unavailable. Instead: if `SOCKET_AUTH=off` in production, log a critical alert, force `'log'` mode (connections allowed but every unauthenticated action is logged), and set a health check flag so monitoring detects the misconfiguration. |
| 9 | 12-day timeline | Unrealistic by 3–5× (WA-6) | **5–6 weeks** | TypeScript migration alone takes 3–5 days. Module extraction with shared mutable state takes 1–2 weeks. Comprehensive test coverage for financial logic takes another week. |

---

## PHASE 0: P0 HOTFIXES (Days 1–3)

These steps address conditions that directly lose user money, allow impersonation, or silently corrupt financial state. Each is a targeted fix with no architectural scope creep.

### 0.1 Fix Disconnect Timer Race Condition

| Field | Value |
|---|---|
| **Source** | PLAN_CHALLENGE MI-5, RC-3; AUDIT_GAPS CG-1 |
| **Bug** | `disconnect` handler starts a `setTimeout` that calls `endGame` after `timeoutSeconds`. If the user reconnects within the timeout (via `join_game`), `clearTimeout` is called and `disconnectTimers.delete(userId)` removes the entry. However, the timer callback does not re-verify that the user is still disconnected. In multi-tab scenarios, Tab 1 disconnecting deletes Tab 2's socket mapping; the timer then forfeits the game for a still-active user. |
| **Fix** | In the timer callback (server.js ~line 3191), add a guard as the first line: check whether `disconnectTimers.has(userId)` AND whether the user has an active socket in `userSockets`. If either check fails (timer was cleared, or user reconnected), return without calling `endGame`. |
| **Files** | `server.js` |
| **Verification** | Open two tabs as the same user. Join a game in Tab 2. Close Tab 1. Verify that Tab 2 remains in the game and no forfeit timer fires. Verify that a genuine disconnect (close both tabs) still triggers forfeit after timeout. |

### 0.2 Add Escrow Rollback on Room Creation Failure

| Field | Value |
|---|---|
| **Source** | PLAN_CHALLENGE MI-1, RC-4; AUDIT_GAPS CG-3 |
| **Bug** | `join_game` deducts escrow (lines 2143–2181) before creating the room (line 2231). If `createInitialGameState`, `persistRoomToFirestore`, `socket.join`, or the emit calls throw, the escrow is permanently deducted with no rollback. Every failed matchmaking attempt loses user funds. |
| **Fix** | Wrap the room creation block (lines 2209–2254) in a `try/catch`. On any failure after escrow deduction, call `refundEscrow(userId, realDeducted, promoDeducted)` before emitting `game_error`. Also refund escrow in the `leave_queue` handler if the user was already deducted but not yet assigned a room. |
| **Files** | `server.js` |
| **Verification** | With two users in a queue, force an exception in `createInitialGameState` (e.g., pass an invalid game type). Verify both users' balances are restored. Verify that normal matchmaking still deducts and settles escrow correctly. |

### 0.3 Enforce Socket Auth in Production (Graceful, Not Crash-Loop)

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #1; PLAN_CHALLENGE FP-1 |
| **Bug** | `SOCKET_AUTH` defaults to `'off'`. Any client can impersonate any user by sending a crafted `userProfile.id`. Production deployment has no guard preventing auth-disabled mode. |
| **Fix** | At server startup (after line 62), if `NODE_ENV === 'production'` and `SOCKET_AUTH` is `'off'` or undefined: (1) log a `FATAL` alert with the misconfiguration, (2) force the effective auth mode to `'log'` (connections allowed, every unauthenticated action logged with full details), (3) set a `healthCheck.misconfiguredAuth = true` flag exposed via `/health` endpoint. Do NOT `process.exit(1)` — this prevents Railway crash loops. |
| **Files** | `server.js` |
| **Verification** | Start server with `NODE_ENV=production` and no `SOCKET_AUTH` env var. Confirm server starts, logs FATAL, and forces `'log'` mode. Confirm `/health` reports `misconfiguredAuth: true`. Confirm connections are allowed but every socket action logs the auth failure details. |

### 0.4 Install DOMPurify and Sanitize All User-Supplied Fields

| Field | Value |
|---|---|
| **Source** | AUDIT Issues #8, #22; PLAN_CHALLENGE IA-3 |
| **Bug** | The homegrown `sanitize()` function (line 143) strips HTML tags but does not handle event handler attributes, `javascript:` URIs, or unicode-encoded XSS. User names, avatars, and other profile fields in `join_game` are not sanitized at all. |
| **Fix** | (1) Install `isomorphic-dompurify` on the server. (2) Replace the `sanitize()` function body with `DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })` — this strips all HTML and dangerous content while preserving plain text. (3) Apply sanitization to `userProfile.name` and other user-supplied string fields in the `join_game` handler before storing them in the room. (4) On the client, audit all uses of `dangerouslySetInnerHTML` and confirm they do not exist; React's JSX auto-escaping handles the rest. |
| **Files** | `server.js`, `package.json` |
| **Verification** | Set a user name to `<img src=x onerror=alert(1)>` and `javascript:alert(1)`. Confirm the server stores and broadcasts a sanitized string. Confirm chat messages with `<script>alert(1)</script>` are stripped to plain text. |

### 0.5 Fix Deposit Amount Variable (Client + Server Coordinated Change)

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #7; PLAN_CHALLENGE WA-3 |
| **Bug** | The client sends `amount` (which is `totalToPay = depositAmount + fee`) to the `/api/pay/initiate` endpoint. The server stores `depositAmount = amount`, crediting the user for the total including fee. The variable name is misleading and the credit amount is wrong. |
| **Fix** | Both client and server must change simultaneously. (1) In `services/fapshi.ts`, add a `depositAmount` field to the request body alongside `amount`. (2) In `server.js` `/api/pay/initiate` handler, read `depositAmount` from `req.body`, validate that `0 < depositAmount <= amount`, and store `depositAmount` (not `amount`) in `pendingDeposits`. (3) In the webhook handler, use the stored `depositAmount` from `pendingDeposits` to credit the user, not the webhook `amount`. (4) Deploy both changes atomically in the same release. |
| **Files** | `server.js`, `services/fapshi.ts` |
| **Verification** | Initiate a deposit of 500 FCFA (with a 25 FCFA fee, totalToPay = 525). Confirm `pendingDeposits` stores `depositAmount: 500` and `amount: 525`. After webhook confirmation, confirm the user is credited 500 FCFA, not 525. |

### 0.6 Validate Tournament Creation Fields

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #2 |
| **Bug** | `/api/tournaments/create` spreads `req.body` directly into the Firestore document. A malicious or buggy request can inject arbitrary fields including `status: 'completed'`, `prizePool: 999999999`, or `participants: ['attacker_id']`. |
| **Fix** | Replace the `...req.body` spread with an explicit whitelist. Define `ALLOWED_TOURNAMENT_FIELDS = ['name', 'gameType', 'entryFee', 'prizePool', 'maxPlayers', 'type', 'startTime']`. Extract only those fields from `req.body`. Validate types: `name` (string, 1–100 chars), `gameType` (enum of supported games), `entryFee` (non-negative integer ≤ 100000), `prizePool` (non-negative integer), `maxPlayers` (integer 2–1024, must be power of 2 for bracket tournaments), `startTime` (ISO 8601, must be in the future). Reject with 400 if validation fails. |
| **Files** | `server.js` |
| **Verification** | Send a POST to `/api/tournaments/create` with `status: 'completed'` and `prizePool: 999999999` in the body. Confirm the response is 400 and the extra fields are not in the created document. Confirm valid tournaments still create successfully. |

### 0.7 Remove Client-Side Financial Functions

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #4 |
| **Bug** | `creditDepositIdempotent` and `addUserTransaction` are imported from the client SDK barrel file and could be called by compromised clients. Firestore rules block the writes, but their presence creates a false security assumption. |
| **Fix** | Remove `creditDepositIdempotent` and `addUserTransaction` from `services/firebase/finance.ts` and from the barrel exports in `services/firebase.ts`. Search the entire client codebase for any imports of these functions and remove/replace them. `creditDepositIdempotent` should only exist server-side if needed (it is currently called from the webhook handler in `server.js` which has its own server-side implementation). Confirm `addUserTransaction` has no client-side callers. |
| **Files** | `services/firebase/finance.ts`, `services/firebase.ts`, any client files importing these functions |
| **Verification** | `grep -r "creditDepositIdempotent\|addUserTransaction" services/ components/ hooks/` returns zero results (excluding `server.js` server-side code). Confirm deposit flow still works end-to-end. |

### 0.8 Add Error Handlers to All onSnapshot Listeners

| Field | Value |
|---|---|
| **Source** | PLAN_CHALLENGE MI-2, RC-8; AUDIT_GAPS IR-3 |
| **Bug** | Every `onSnapshot` call in the client codebase (`subscribeToUser`, `subscribeToForum`, `subscribeToIncomingChallenges`, `subscribeToMaintenanceMode`, `subscribeToGame`, `subscribeToTournament`, `subscribeToGlobalWinners`, `subscribeToGameConfigs`) omits the error callback. Permission errors, quota exceeded, or offline cache corruption silently stop the callback. The UI freezes on stale data. |
| **Fix** | Add a third argument to every `onSnapshot` call: an error callback that dispatches `networkStatus: 'degraded'` to the AppContext reducer and shows a non-blocking toast to the user. The toast message should indicate which subscription failed (e.g., "Live updates interrupted — your balance may not be current"). Include a retry mechanism: on error, attempt to re-subscribe after 5 seconds with exponential backoff (max 3 retries). |
| **Files** | `services/firebase/users.ts`, `services/firebase/games.ts`, `services/firebase/admin.ts`, and any other file containing `onSnapshot` calls |
| **Verification** | Temporarily revoke a Firestore rule to trigger a permission error. Confirm the UI shows a degradation toast instead of silently freezing. Confirm the subscription retries and recovers when permissions are restored. |

---

## PHASE 1: SECURITY HARDENING (Days 4–7)

### 1.1 Add Hash-Based Content Security Policy

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #11; PLAN_CHALLENGE WA-1, RC-1 |
| **Current** | CSP allows `'unsafe-inline'` for `scriptSrc` and `styleSrc`. This renders XSS protection ineffective. |
| **Fix** | Remove `'unsafe-inline'` from `scriptSrc`. Compute SHA-256 hashes of all inline `<script>` content at Vite build time using a Vite plugin (`vite-plugin-csp-hash` or custom). Write hashes to `csp-hashes.json` in the build output. The Express server reads this file at startup and constructs `Content-Security-Policy: script-src 'self' 'sha256-{hash1}' 'sha256-{hash2}' ...; style-src 'self' 'unsafe-inline'`. Keep `'unsafe-inline'` for `styleSrc` because Tailwind CSS requires it. Add `frame-src https://accounts.google.com` and `script-src https://accounts.google.com` for Firebase Auth Google sign-in popup (AUDIT_GAPS IR-8). |
| **Files** | `server.js`, `vite.config.ts`, new `scripts/generate-csp-hashes.js` or Vite plugin |
| **Verification** | Deploy to staging. Confirm the CSP header contains `sha256-` hashes and no `'unsafe-inline'` in `scriptSrc`. Confirm Google sign-in popup works. Confirm no inline script execution errors in browser console. |

### 1.2 Restrict Firestore Game Update Rules

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #6 |
| **Current** | `allow update: if isAuth() && request.auth.uid in resource.data.players` — any player can update any field including `status` and `winner`. |
| **Fix** | Change the `games` collection update rule to restrict which fields clients can modify. Allow clients to update only `gameState` and `turn` fields. Restrict `status` transitions to only `active → completed` (i.e., `request.resource.data.status == 'completed' && resource.data.status == 'active'`). Restrict `winner` to only be set when `status` is transitioning to `completed`. Document the new rules and add comments explaining the intent. |
| **Files** | `firestore.rules` |
| **Verification** | From a client with authenticated user in a game, attempt to write `status: 'completed'` and `winner: attacker_id` directly to Firestore. Confirm the write is denied. Confirm normal game play updates (move, turn change) still succeed via socket. |

### 1.3 Remove `findOrCreateMatch` and `setGameResult` from Client Exports

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #5; PLAN_CHALLENGE RC-7 |
| **Current** | `findOrCreateMatch` has a TOCTOU race condition. `setGameResult` allows client-side winner declaration. Neither is used by the authoritative socket game flow. |
| **Fix** | Audit `services/firebase/games.ts` and all client code for callers of `findOrCreateMatch` and `setGameResult`. If callers exist outside the main game flow, redirect them to the socket `join_game` event or the server's `endGame` path. Remove both function exports from `services/firebase/games.ts` and the barrel file `services/firebase.ts`. Add a comment block in `services/firebase/games.ts` warning that all game state writes must go through the socket layer. |
| **Files** | `services/firebase/games.ts`, `services/firebase.ts` |
| **Verification** | Full-text search confirms zero imports of either function in client code. Confirm that game creation and completion still work via the socket flow. |

### 1.4 Separate Bot Games into Dedicated Collection

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #19 |
| **Current** | Bot games share the `games` collection with real-money games. A compromised client could manipulate bot game documents directly via Firestore. |
| **Fix** | Create a `bot_games` Firestore collection. Move `createBotMatch` to write to `bot_games` instead of `games`. Add Firestore rules for `bot_games`: `allow create: if isAuth(); allow update: if isAuth() && request.auth.uid in resource.data.players`. Update all client-side subscriptions (`subscribeToGame`, `subscribeToActiveGames`) to read from both collections or add a `bot` flag filter. Exclude `bot_games` from admin dashboard stats and live win feeds. |
| **Files** | `services/firebase/games.ts`, `firestore.rules`, any client code subscribing to `games` collection |
| **Verification** | Create a bot match. Confirm it appears in `bot_games` collection, not `games`. Confirm real-money games still work. Confirm admin dashboard does not include bot games in activity stats. |

### 1.5 Add Ban Status Check to `verifyAuth` Middleware

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS IR-1; PLAN_CHALLENGE RC-9 |
| **Current** | `verifyAuth` decodes the Firebase ID token but does not check `isBanned` in Firestore. A banned user's token remains valid for up to 60 minutes. During this window, the banned user can call `/api/pay/initiate`, `/api/pay/disburse`, and other financial endpoints. |
| **Fix** | After token verification in `verifyAuth`, read the user's Firestore document: `db.collection('users').doc(decodedToken.uid).get()`. If the document exists and `isBanned === true`, return 403. Cache the ban check result in a `Map<string, { banned: boolean, checkedAt: number }>` with a 60-second TTL to avoid doubling Firestore reads on every request. Clear the cache entry when `banUser` is called. |
| **Files** | `server.js` |
| **Verification** | Ban a user via the admin endpoint. Confirm that within 5 seconds, all subsequent API calls from that user return 403 despite having a valid token. Confirm the 60-second TTL expires and the check re-queries Firestore. |

### 1.6 Move Challenge Creation Server-Side

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #14 |
| **Current** | `sendChallenge` and `createChallengeGame` in `services/firebase/games.ts` write directly to Firestore from the client. Balance checks are client-side only. A modified client can send challenges with insufficient funds. |
| **Fix** | Create `/api/challenges/send` endpoint: accepts `{ challengedId, stake, gameType }`, verifies the challenger's balance server-side via Firestore transaction, deducts escrow, creates the challenge document. Create `/api/challenges/respond` endpoint: accepts `{ challengeId, accept: boolean }`, verifies the responder's balance, creates or cancels the game. Update the client to call these endpoints instead of writing to Firestore directly. Change Firestore rules for `challenges` collection to `allow write: if false` (server-only). |
| **Files** | `server.js`, `services/firebase/games.ts`, `firestore.rules`, `components/` (challenge UI) |
| **Verification** | Attempt to send a challenge with a balance below the stake. Confirm the server returns 403 and no challenge document is created. Confirm valid challenges still work end-to-end. |

### 1.7 Add Webhook IP Validation and Rate Limiting

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS IR-7 |
| **Current** | `/api/pay/webhook` accepts POST requests from any IP with no rate limiting and no signature verification. |
| **Fix** | Add rate limiting to the webhook endpoint: 100 requests per minute per IP. Validate that the incoming IP is within Fapshi's documented IP ranges (add `FAPSHI_WEBHOOK_IPS` env var with comma-separated allowlist). If the IP is not in the allowlist and `NODE_ENV === 'production'`, return 403. In development mode, log a warning but allow the request. |
| **Files** | `server.js` |
| **Verification** | Send a webhook request from a non-Fapshi IP in production mode. Confirm 403 response. Confirm legitimate Fapshi IPs are accepted. |

---

## PHASE 2: DATA INTEGRITY & PERSISTENCE (Days 8–14)

### 2.1 Implement State-Transition Game Persistence

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #3; PLAN_CHALLENGE RC-2, RC-10, WA-4, FP-2 |
| **Current** | Only Pool games persist state to Firestore. All other game types exist only in the `rooms` in-memory Map. Server restart loses all active games and their escrowed stakes. |
| **Fix** | Call `persistRoomToFirestore(roomId, room)` on three state transitions only: (1) game start (after room creation and escrow deduction), (2) each move/turn change (skip chat messages, timer ticks, aim_sync), (3) game end (after `endGame`). Do NOT persist periodically (no `setInterval` flush). On server restart, `hydrateRoomsFromFirestore` restores state. After hydration, emit a `server_restarted` event to all connected sockets. The client must then emit `rejoin_game` for any game it was in. The server's `rejoin_game` handler must call `socket.join(roomId)` to restore the Socket.IO room membership (this is the critical missing step identified in PLAN_CHALLENGE FP-6). |
| **Files** | `server.js` |
| **Verification** | Start a Chess game, make 3 moves, restart the server. Confirm both players can rejoin and see the correct board state. Confirm the move count in Firestore matches. Confirm no periodic writes occur when a game is idle (no moves for 60+ seconds). |

### 2.2 Fix Private Room ID / Tournament Match ID Semantic Collapse

| Field | Value |
|---|---|
| **Source** | PLAN_CHALLENGE MI-4 |
| **Current** | `room.privateRoomId` and `room.tournamentMatchId` are used interchangeably. A private room ID starting with `m-` can be misclassified as a tournament match, triggering `recordTournamentMatchResult` for a non-tournament game. |
| **Fix** | Add a `room.type` field with values `'casual'`, `'ranked'`, `'private'`, `'tournament'`. Set this field at room creation time based on how the room was created. In `endGame`, check `room.type === 'tournament'` instead of checking whether `room.tournamentMatchId` exists. Ensure `privateRoomId` and `tournamentMatchId` are never checked for format (e.g., `startsWith('m-')`) to determine room type. |
| **Files** | `server.js` |
| **Verification** | Create a private room, complete the game, confirm `recordTournamentMatchResult` is NOT called. Create a tournament match, complete the game, confirm `recordTournamentMatchResult` IS called. |

### 2.3 Fix Multi-Tab Session Collapse

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS CG-1 |
| **Current** | `userSockets` Map stores one `socketId` per `userId`. Opening a second tab overwrites the mapping. Closing Tab 1 deletes Tab 2's mapping, starting a forfeit timer for a still-connected user. |
| **Fix** | Change `userSockets` from `Map<userId, socketId>` to `Map<userId, Set<socketId>>`. Update `join_game` to add the socket to the set. Update `disconnect` to remove the socket from the set; only start the forfeit timer if the set becomes empty. Update all other references to `userSockets.get(userId)` to handle a set (e.g., `emitToUser` sends to all sockets in the set). Update the webhook `payment_confirmed` emission to send to ALL sockets for the user, not just the latest one (AUDIT_GAPS CG-5). |
| **Files** | `server.js` |
| **Verification** | Open two tabs as the same user, join a game in Tab 2, close Tab 1. Confirm Tab 2 remains connected and in the game. Confirm payment notifications appear in both tabs. |

### 2.4 Implement Atomic Tournament Status Transitions

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #12; PLAN_CHALLENGE RC-5 |
| **Current** | `startTournamentLogic` reads `status: 'registration'` and then updates to `status: 'active'`. Two instances can both read `'registration'` and proceed, creating duplicate matches and double-crediting winners. |
| **Fix** | In `startTournamentLogic`, replace the read-then-write pattern with a Firestore precondition update: `tRef.update({ status: 'starting' })` with precondition `{ status: 'registration' }`. If the update fails (precondition not met), another instance already started the tournament — return immediately. After successful update, create matches. After matches are created, update to `{ status: 'active' }`. This introduces a three-state lifecycle: `registration → starting → active`. The `starting` state is visible in the admin dashboard as "matches being created." |
| **Files** | `server.js` |
| **Verification** | Deploy two server instances. Trigger tournament start simultaneously. Confirm only one instance creates matches. Confirm the tournament transitions to `starting` then `active`. Confirm no duplicate matches are created. |

### 2.5 Guard Tournament Double-Trigger from `endGame` and Admin Force-Result

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS CG-6; PLAN_CHALLENGE MI-6 |
| **Current** | Both `endGame` and `/api/tournaments/force-result` call `recordTournamentMatchResult`. If an admin forces a result while the game engine calls `endGame` for the same match, `checkAndAdvanceTournamentLogic` can be called twice, creating duplicate next-round matches. |
| **Fix** | In `checkAndAdvanceTournamentLogic`, add a precondition check before creating next-round matches: query for an existing match document with the same `round` and `matchIndex` in the `tournament_matches` subcollection. If found, skip creation. Additionally, add a Firestore write to a `processed_transitions` sentinel document with `tournamentId + round + matchIndex` as the document ID. Use a Firestore transaction with precondition `{ exists: false }` to ensure only one instance creates the transition. |
| **Files** | `server.js` |
| **Verification** | Force an admin result and simultaneously let the game end naturally. Confirm exactly one set of next-round matches is created. |

### 2.6 Add Withdrawal Reconciliation Scheduler

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #15; AUDIT_GAPS EC-1, EC-3; PLAN_CHALLENGE FP-5 |
| **Current** | Failed withdrawals with `status: 'pending'` have no reconciliation. If the Fapshi API call times out and the refund transaction also fails, funds are permanently debited. |
| **Fix** | Add a scheduler that runs every 5 minutes. Query `transactions` with `type: 'withdrawal'` and `status: 'pending'` created more than 10 minutes ago. For each: (1) Call Fapshi's transaction status API. (2) If Fapshi confirms the withdrawal completed, mark the transaction as `completed`. (3) If Fapshi confirms it failed or was never initiated, refund the user's balance and mark the transaction as `refunded`. (4) If Fapshi is unreachable, log the failure and retry on the next schedule. Also handle `failed_settlements` documents that have never been read: query `failed_settlements` collection and attempt to settle or refund each entry. |
| **Files** | `server.js` |
| **Verification** | Create a withdrawal, simulate a Fapshi timeout (return 504). Confirm the reconciliation scheduler picks up the pending withdrawal within 10 minutes, verifies with Fapshi, and either completes or refunds it. |

### 2.7 Fix Escrow Refund vs. Active Game Race Condition

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS CG-3 |
| **Current** | The `disconnect` handler refunds queue escrows by scanning all queues. It does not check whether the user is also in an active room. If a match is found and a room created between the escrow deduction and the disconnect handler running, the escrow is refunded while the game proceeds. |
| **Fix** | Before refunding a queue escrow in the `disconnect` handler, check whether the user is in any active room: `const isInActiveRoom = [...rooms.values()].some(r => r.players.some(p => p.id === userId) && r.status === 'active')`. If yes, skip the escrow refund (the room already holds the stake). Also add this check before the forfeit timer starts — if the user is in an active room, the stake is in the room's escrow, not the queue's. |
| **Files** | `server.js` |
| **Verification** | Join a queue, get matched, and immediately disconnect. Confirm the escrow is NOT refunded while the game is active. Confirm that a user who disconnects while only in a queue (not yet matched) IS refunded. |

### 2.8 Add Game Update Sequence Numbers and Acknowledgment

| Field | Value |
|---|---|
| **Source** | PLAN_CHALLENGE MI-3 |
| **Current** | Socket.IO `game_update` emissions use the default volatile mode with no acknowledgment. If a `game_update` is lost, players diverge in game state with no detection mechanism. |
| **Fix** | Add a `sequence` counter to each room (starting at 0, incrementing on each state-change emit). Include `sequence` in every `game_update` payload. On the client, track the last received sequence. If a received sequence is > lastSequence + 1, emit `game_resync_request` to the server. The server responds with the full current room state. This does not add per-message acknowledgments (which would increase latency) but provides a lightweight gap-detection mechanism. |
| **Files** | `server.js`, `services/SocketContext.tsx`, `hooks/useGameController.ts` |
| **Verification** | Simulate a dropped `game_update` by temporarily disabling a socket listener. Confirm the client detects the sequence gap and requests a resync. Confirm the server responds with the correct current state. |

### 2.9 Verify Pool `aim_sync` Room Membership

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-10 |
| **Current** | `aim_sync` emits to `data.roomId` without verifying the sender is in that room. A malicious client can flood arbitrary rooms with fake aim data. |
| **Fix** | In the `aim_sync` handler, verify that `socket.rooms.has(data.roomId)` before emitting. If the sender is not in the room, ignore the event and log a warning. |
| **Files** | `server.js` |
| **Verification** | Send `aim_sync` to a room the sender is not in. Confirm the server ignores the event. Confirm legitimate aim_sync within a game still works. |

### 2.10 Fix Secondary Settlement Failures and Graceful Shutdown Gaps

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-3, EC-12 |
| **Current** | If a withdrawal refund transaction fails after the initial debit, the user loses funds permanently. The graceful shutdown handler refunds some games but may lose in-progress games if SIGKILL arrives before persistence completes. |
| **Fix** | (1) In the disbursement endpoint, wrap the refund transaction in a `withRetry` call (3 retries, 500ms delay). If all retries fail, write to `failed_settlements` with full context including `userId`, `amount`, `type: 'withdrawal_refund'`, and `fapshiTransId`. The reconciliation scheduler from Step 2.6 will pick these up. (2) In the graceful shutdown handler, change the 60-second `timeSinceLastMove` threshold to 30 seconds for the "persist only" category. For games with moves in the last 30 seconds, persist immediately and mark `shutdownPending: true`. On next startup, `hydrateRoomsFromFirestore` restores these, and a startup sweep refunds any rooms still marked `shutdownPending` after 10 minutes (the users have likely disconnected). |
| **Files** | `server.js` |
| **Verification** | Trigger a withdrawal where the refund transaction fails twice. Confirm `failed_settlements` is written. Confirm the reconciliation scheduler picks it up. Simulate a graceful shutdown during an active game. Confirm the game is persisted and refundable on restart. |

---

## PHASE 3: TYPESCRIPT MIGRATION & MODULARIZATION (Days 15–25)

### 3.1 Migrate Server to TypeScript

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #20; PLAN_CHALLENGE RC-6, IA-5 |
| **Current** | Server is a single 3,357-line JavaScript file with closures over shared Maps. |
| **Fix** | (1) Add a server-specific `tsconfig.json` with `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. (2) Install `typescript`, `ts-node`, `@types/node`, `@types/express`, `@types/cors`, `@types/compression`, and other type packages. (3) Add a `build:server` script that compiles `server/` to `dist/server/`. (4) Rename `server.js` to `server.ts`. (5) Add type annotations to all shared Maps, functions, and constants: `rooms: Map<string, Room>`, `queues: Map<string, QueueEntry[]>`, `userSockets: Map<string, Set<string>>`, etc. (6) Define interfaces for `Room`, `QueueEntry`, `GameAction`, `Tournament`, `Dispute`, `UserProfile`, `Transaction`, etc. (7) Ensure the server compiles and runs correctly with `ts-node` before proceeding to extraction. |
| **Files** | `server.js` → `server.ts`, `tsconfig.json`, `package.json` |
| **Verification** | `npx tsc --noEmit` passes with zero errors. Server starts and all existing functionality works. |

### 3.2 Create Dependency Injection Container for Shared State

| Field | Value |
|---|---|
| **Source** | PLAN_CHALLENGE WA-5, FP-4 |
| **Current** | Socket handlers, game logic, payment routes, and admin routes all close over the same mutable Maps (`rooms`, `queues`, `userSockets`, etc.). Extracting these into separate modules creates circular imports. |
| **Fix** | Create `server/state.ts` that exports a `createAppState()` function returning an object with all shared Maps and constants: `{ rooms, queues, userSockets, socketUsers, disconnectTimers, pendingDeposits, gameActionTimestamps, gameOutcomeHistory, db, io, ADMIN_EMAILS }`. Each extracted module receives this state object as a parameter. This eliminates circular imports because no module imports another module's state — they all receive it via dependency injection from `server.ts` (the entry point). |
| **Files** | New `server/state.ts` |
| **Verification** | The application starts correctly. All Maps are accessible from all handlers. No module imports another module's state directly. |

### 3.3 Extract Game Logic Modules (with Immediate Tests)

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #9; PLAN_CHALLENGE IA-4 |
| **Fix** | Extract each game validator to its own `.ts` file, receiving state via dependency injection: `server/gameLogic/checkers.ts`, `server/gameLogic/chess.ts`, `server/gameLogic/dice.ts`, `server/gameLogic/tictactoe.ts`, `server/gameLogic/ludo.ts`, `server/gameLogic/pool.ts`. Each module exports a pure `validate(state, action, userId): ValidationResult` function. Write unit tests for each module immediately after extraction: `tests/gameLogic/checkers.test.ts`, etc. Tests should cover normal play, illegal moves, and cheat attempts. |
| **Files** | New `server/gameLogic/*.ts`, new `tests/gameLogic/*.test.ts` |
| **Verification** | All unit tests pass. Game logic extracted modules produce identical validation results to the inline code. No behavioral changes. |

### 3.4 Extract Game Engine Module

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #9 |
| **Fix** | Extract room management, matchmaking, escrow, game state, and `endGame`/`settleGame` into `server/gameEngine.ts`. This module receives `appState` from the DI container and imports game logic validators from `server/gameLogic/*.ts`. It exports functions like `createRoom()`, `joinQueue()`, `handleGameAction()`, `endGame()`, `settleGame()`, `refundEscrow()`, `deductEscrow()`. Unit test the escrow and settlement helpers with mock Firestore. |
| **Files** | New `server/gameEngine.ts`, new `tests/gameEngine.test.ts` |
| **Verification** | All unit tests pass. Existing integration still works. |

### 3.5 Extract Route Modules

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #9 |
| **Fix** | Extract each route group into its own module, receiving `appState` from the DI container: `server/routes/payments.ts` (`/api/pay/*`, webhook), `server/routes/tournaments.ts` (`/api/tournaments/*`), `server/routes/admin.ts` (`/api/admin/*`, `/api/maintenance`), `server/routes/disputes.ts` (`/api/disputes/*`). Each module exports an Express Router. The main `server.ts` imports and mounts them. The socket handler stays in `server.ts` but delegates game actions to `gameEngine.ts`. |
| **Files** | New `server/routes/*.ts` |
| **Verification** | All routes respond correctly. No behavioral changes. |

### 3.6 Extract Middleware Modules

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #9 |
| **Fix** | Extract into `server/middleware/auth.ts`: `verifyAuth`, `verifyAdmin`, `blockGuests`, socket auth middleware. Extract into `server/middleware/rateLimit.ts`: HTTP rate limiter config, socket rate limiter. Update `server.ts` to import and use these. |
| **Files** | New `server/middleware/*.ts` |
| **Verification** | Auth middleware correctly rejects unauthenticated requests. Rate limiter correctly throttles. |

### 3.7 Fix Ludo Validation for Opponent Piece Mutation

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #16 |
| **Current** | Ludo `MOVE_PIECE` handler validates `step` for opponent pieces but not `finished`, `color`, or `id` fields. A malicious client could set `finished: true` on an opponent's piece to trigger a false win. |
| **Fix** | In the Ludo move validation, add checks for opponent pieces: `finished`, `color`, and `id` must remain unchanged. If any opponent piece field has mutated from the server's copy, reject the move. |
| **Files** | `server/gameLogic/ludo.ts` (after extraction in Step 3.3) |
| **Verification** | Send a Ludo `MOVE_PIECE` with an opponent's `finished` field set to `true`. Confirm the server rejects the move. Confirm normal Ludo play still works. |

### 3.8 Lower Pool Ball Pocket Threshold

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #18 |
| **Current** | Pool validation allows up to 4 balls to be pocketed in a single shot. Threshold of 4 is too permissive for cheating. |
| **Fix** | Change the threshold from 4 to 2 for normal shots. Add a special case for the break shot (first shot of the game) where 4 is allowed. Detect break shot by checking if the game has zero previous moves. |
| **Files** | `server/gameLogic/pool.ts` (after extraction in Step 3.3) |
| **Verification** | Attempt to pocket 3 balls in a non-break shot. Confirm the server rejects the move. Pocket 4 balls on the break shot. Confirm this is allowed. |

---

## PHASE 4: RESILIENCE & EDGE CASES (Days 26–31)

### 4.1 Fix Anonymous-to-Permanent Account Linking Balance Loss

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS CG-8 |
| **Current** | Firebase anonymous users have one UID; linked permanent accounts get a different UID. `syncUserProfile` creates a new document for the new UID, losing the anonymous user's balance, transactions, ELO, and rank. |
| **Fix** | In `syncUserProfile`, detect when the auth provider changes from anonymous to permanent. If the new UID differs from the previous one: (1) Read the anonymous user's document. (2) Write the balance, ELO, and rank tier to the new UID's document using a Firestore transaction to ensure atomicity. (3) Mark the anonymous user's document as `migrated: true` and set a `migratedTo` field with the new UID. (4) When querying user data, check for `migratedTo` and redirect to the new document. Add a Firestore security rule that prevents creation of duplicate documents for the same email. |
| **Files** | `services/firebase/users.ts`, `firestore.rules` |
| **Verification** | Sign in anonymously, deposit funds. Link to a permanent account. Confirm the balance, ELO, and rank transfer to the new account. Confirm the old document is marked as migrated. |

### 4.2 Propagate Maintenance Mode to New Connections

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS CG-7 |
| **Current** | Maintenance mode is emitted via `io.emit()` to connected sockets. New connections after maintenance is enabled never receive the event. |
| **Fix** | In the socket `connection` handler, after authentication, check Firestore `settings/maintenance` document. If `maintenance.active === true`, emit `maintenance_update` to the newly connected socket. Also add an `onSnapshot` listener in the client's `AppContext` that subscribes to `settings/maintenance` and dispatches the maintenance state on change. |
| **Files** | `server.js` (or `server.ts` after migration), `services/AppContext.tsx` |
| **Verification** | Enable maintenance mode. Connect a new user. Confirm they receive the maintenance notification immediately. Disable maintenance. Confirm the client updates in real-time. |

### 4.3 Make Login Streak Bonus Idempotent

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS CG-10 |
| **Current** | The login streak logic reads `lastLoginDate` and, if different from today, increments the streak and awards a bonus. Two simultaneous connections can both read `yesterday` and both award the bonus. |
| **Fix** | Use a Firestore transaction for the login streak update: `db.runTransaction(async (tx) => { const doc = await tx.get(userRef); if (doc.data().lastLoginDate !== today) { tx.update(userRef, { lastLoginDate: today, streak: doc.data().streak + 1, balance: doc.data().balance + bonus }); } })`. The transaction's atomicity ensures only one connection can increment the streak. |
| **Files** | `server.js` |
| **Verification** | Connect from two devices simultaneously as the same user. Confirm the streak bonus is awarded exactly once. |

### 4.4 Clean Up Game Component Unmount Orphaned Socket Rooms

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS CG-9 |
| **Current** | When a user navigates away from the game view, the component unmounts but the socket remains in the room. The server continues broadcasting `game_update` events. The orphan reaper doesn't evict the room because the socket is still "active." |
| **Fix** | In the game component's `useEffect` cleanup function, emit a `leave_game_view` event to the server. The server tracks `room.activeViewers` as a counter per room. When the counter reaches 0, start a 30-second idle timer. If no viewers rejoin, persist the room state and remove it from memory. On `join_game_view` (sent when the component mounts), increment the counter and cancel the idle timer. |
| **Files** | `server.js`, game components |
| **Verification** | Start a game, navigate away from the game view. Confirm the server receives `leave_game_view` and starts the idle timer. Navigate back. Confirm the timer is cancelled and game updates resume. |

### 4.5 Fix Chat Message ID Collision

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-9 |
| **Current** | Chat message IDs use `Date.now().toString()`, which can collide in high-frequency scenarios. |
| **Fix** | Replace `Date.now().toString()` with `crypto.randomUUID()` or `${Date.now()}-${Math.random().toString(36).substring(2, 9)}` for unique IDs. |
| **Files** | `server.js` |
| **Verification** | Send multiple chat messages rapidly. Confirm all IDs are unique. |

### 4.6 Handle Tournament Cancellation Mid-Game

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-4 |
| **Current** | `/api/tournaments/cancel` refunds all participants but does not check for or stop active matches. Players in active games continue playing, and winning players can receive tournament prizes from the cancelled tournament. |
| **Fix** | In the tournament cancel handler, before refunding: (1) Query all tournament matches with `status: 'active'`. (2) For each active match, call `endGame` with a `cancelled` result (no winner, both players refunded). (3) Remove the rooms from the `rooms` Map. (4) Then proceed with participant refunds. |
| **Files** | `server.js` |
| **Verification** | Start a tournament with active matches. Cancel the tournament. Confirm active matches are ended with no winner. Confirm all participants are refunded. |

### 4.7 Add Dispute Resolution Financial Reversal

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-5 |
| **Current** | Dispute resolution updates the dispute document status but does not reverse financial settlements. If an admin resolves in favor of the loser, the winner keeps the credited amount. |
| **Fix** | In the `/api/disputes/resolve` handler, when resolving in favor of the loser (disputer): (1) Debit the winner's balance by the settlement amount. (2) Credit the loser's balance. (3) Create reversal transactions for both users. (4) If the winner's balance is insufficient, mark the dispute as `partially_reversed` and debit what is available. (5) Add a `reversalLimitCheck` that prevents a user from withdrawing if they have an active dispute where they are the winner. |
| **Files** | `server.js` |
| **Verification** | Complete a game where Player A wins. Player B files a dispute. Admin resolves in favor of Player B. Confirm Player A's balance is reduced and Player B's is increased. |

### 4.8 Add Rematch Insufficient Funds Error Message

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-6 |
| **Current** | If Player B has insufficient funds for a rematch, the escrow transaction fails silently. Player A's rematch vote is recorded but never fulfills. |
| **Fix** | In the rematch escrow transaction handler, catch the insufficient funds error and emit `rematch_error` to both players with a specific message: "Rematch failed: [PlayerName] has insufficient funds." Remove Player A's vote from `rematchVotes` since the rematch cannot proceed. |
| **Files** | `server.js` |
| **Verification** | Player A requests rematch with sufficient funds. Player B has insufficient funds. Confirm both players receive the error message. Confirm Player A's vote is cleared. |

### 4.9 Guard Against Buffered Game Actions Exceeding Turn Timeout

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-7 |
| **Current** | `SocketContext.tsx` queues `game_action` events when disconnected and flushes on reconnect. A buffered action sent after the turn timeout is processed anyway. |
| **Fix** | On the server, when receiving a `game_action`, check `gameActionTimestamps` for a `TIMEOUT_CLAIM` that occurred after the action's queue timestamp. If a timeout claim exists, discard the buffered action. On the client, clear the pending action queue when receiving a `game_update` that indicates a turn change or game end. |
| **Files** | `server.js`, `services/SocketContext.tsx` |
| **Verification** | Disconnect during a timed game. Let the turn timeout fire. Reconnect. Confirm the buffered action is discarded, not applied. |

### 4.10 Clear Stale `socketGame` State After Server Restart

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-8 |
| **Current** | After a server restart, the client's `socketGame` state persists in React memory even though the room no longer exists. The user sees a stale game screen. |
| **Fix** | In `SocketContext.tsx`, when the `rejoin_game` response is `{ success: false }`, clear `socketGame` state and navigate the user to the dashboard. Also add a `server_restarted` handler (from Step 2.1) that prompts the user to rejoin or go to dashboard. |
| **Files** | `services/SocketContext.tsx` |
| **Verification** | Be in an active game. Restart the server. Confirm the client clears the stale game view and shows a reconnection prompt or dashboard. |

### 4.11 Add Fapshi API Retry Queue

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS IR-2 |
| **Current** | Failed Fapshi API calls return 504 immediately with no retry. Users must manually retry. |
| **Fix** | Create an in-memory retry queue for Fapshi API calls. On 504 or network error, add the request to the queue with 3 retry attempts at 30s, 60s, 120s intervals. After all retries fail, write to `failed_api_calls` Firestore collection for manual review. For deposit initiations, return a "pending" status to the client and complete the initiation when the retry succeeds. |
| **Files** | `server.js` |
| **Verification** | Simulate a Fapshi API timeout. Confirm the server retries 3 times with increasing delays. Confirm the deposit eventually completes when Fapshi recovers. Confirm `failed_api_calls` is populated if all retries fail. |

### 4.12 Fix Reconciliation Timestamp Edge Case

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS EC-11 |
| **Current** | `reconcileOrphanedEscrows` uses `>=` comparison on timestamps. If a settlement and escrow lock have the same timestamp, the settlement for a DIFFERENT game can be matched, causing incorrect skips. |
| **Fix** | Change the comparison from `>=` to `>`. Add the `gameId` to the reconciliation check: a settlement transaction is only considered a match for the escrow if it has the same `gameId`. This ensures cross-game timestamp collisions don't cause false positives. |
| **Files** | `server.js` |
| **Verification** | Create two games that end in the same millisecond. Confirm the reconciler correctly processes each game's escrow independently. |

### 4.13 Split Withdrawal API Credentials

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #23 |
| **Current** | Deposit and withdrawal use the same Fapshi API credentials. Compromised deposit credentials could be used for withdrawals. |
| **Fix** | Add `FAPSHI_API_KEY_WITHDRAWAL` and `FAPSHI_USER_TOKEN_WITHDRAWAL` environment variables. In the `/api/pay/disburse` handler, use the withdrawal credentials instead of deposit credentials. Fall back to deposit credentials if withdrawal credentials are not set (backward compatibility). |
| **Files** | `server.js`, `.env.example` |
| **Verification** | Initiate a withdrawal. Confirm the server uses the withdrawal-specific API key. Confirm deposits still use the deposit API key. |

### 4.14 Add PWA Service Worker Forced Update Mechanism

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS IR-11 |
| **Current** | Service worker caches can serve outdated client code for hours. Security patches deployed to the frontend may not reach users. |
| **Fix** | Add a `version` field to the service worker's `precache-manifest` entries. Add a `/api/version` endpoint that returns the current deployed backend version and minimum client version. On the client, poll `/api/version` every 5 minutes. If the minimum client version is higher than the current version, force a service worker update via `registration.update()` and reload the page. |
| **Files** | `server.js`, `services/AppContext.tsx` or new `services/versionCheck.ts`, `vite.config.ts` |
| **Verification** | Deploy a version bump. Confirm clients detect the version mismatch within 5 minutes and force-update. |

### 4.15 Address Unbounded In-Memory Map Growth

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS SR-8 |
| **Current** | `rooms`, `queues`, `userSockets`, `socketUsers`, and `disconnectTimers` have no size limits. Under DDoS or flash crowd, these Maps grow until OOM crash. |
| **Fix** | Add a periodic cleanup job (every 60 seconds) that: (1) Removes rooms where `status === 'completed'` and `endedAt < now - 300000` (5 minutes). (2) Removes `userSockets` and `socketUsers` entries for socket IDs that no longer exist in Socket.IO's connected sockets. (3) Removes `disconnectTimers` entries where the timer has already fired. (4) Logs Map sizes to monitoring. For `rooms` specifically, replace the fixed 60-second cleanup with priority-based eviction: completed rooms first, then stale rooms (no moves for > 10 minutes). |
| **Files** | `server.js` |
| **Verification** | Create 1000 completed rooms. Confirm the cleanup job removes them within 5 minutes. Confirm active rooms are not evicted. |

---

## PHASE 5: SCALABILITY & OPERATIONS PREP (Days 32–34+)

### 5.1 Add Firestore Composite Indexes

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #21; AUDIT_GAPS SR-5 |
| **Current** | `firestore.indexes.json` has an empty indexes array. User name search, game status queries, and tournament batch writes are slow or failing without required indexes. |
| **Fix** | Add indexes to `firestore.indexes.json`: (1) `users` collection: `name ASCENDING` (for `searchUsers`). (2) `games` collection: `status ASCENDING, gameType ASCENDING, createdAt DESCENDING` (for active games queries). (3) `transactions` subcollection: `type ASCENDING, date DESCENDING` (for reconciliation queries). (4) `tournaments` collection: `status ASCENDING, gameType ASCENDING` (for scheduler queries). Deploy indexes via `firebase deploy --only firestore:indexes`. |
| **Files** | `firestore.indexes.json` |
| **Verification** | Run `searchUsers` query in production. Confirm it returns results without errors. Confirm all composite query paths use indexes. |

### 5.2 Chunk Tournament Batch Writes

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS SR-5 |
| **Current** | `checkAndAdvanceTournamentLogic` creates all next-round matches in a single `db.batch()`. Firestore limits batches to 500 operations. Tournaments with > 250 matches per round exceed this limit. |
| **Fix** | Split batch writes into chunks of 450 operations (leaving margin for metadata writes). Use a loop that creates and commits each chunk before proceeding to the next. Collect all chunk commit promises and `await Promise.all()` at the end. |
| **Files** | `server.js` (or `server/routes/tournaments.ts` after migration) |
| **Verification** | Create a tournament with 512 players (256 first-round matches). Confirm all matches are created without batch size errors. |

### 5.3 Optimize Reconciliation Query Cost

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS SR-2 |
| **Current** | `reconcileOrphanedEscrows` scans every `transactions` subcollection under every `users/{uid}` document. At 100K users, this reads 10M documents per run. |
| **Fix** | Instead of `collectionGroup('transactions')`, query `users` where `updatedAt > now - 24h` (requires an index on `updatedAt`) and then query each active user's `transactions` subcollection with `type == 'escrow_lock'` and `date > now - 24h`. This reduces the scan from all transactions to only recently active users' escrow locks. Maintain a `pendingEscrows` meta-collection that tracks which users have unresolved escrow locks. When an escrow is deducted, add a document. When it's settled or refunded, delete the document. The reconciler queries this collection instead of `collectionGroup`. |
| **Files** | `server.js` |
| **Verification** | With 1000 users, confirm the reconciler reads < 1000 documents instead of scanning the entire `transactions` collection group. |

### 5.4 Improve Socket Rate Limiter for CGNAT

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #24 |
| **Current** | Per-IP rate limiting with a limit of 10 connections blocks legitimate users behind CGNAT or cloud proxies. |
| **Fix** | Change the rate limiter key from IP address to `socket.user?.uid || ip`. After authentication, use the user ID. Before authentication, use the IP address. Increase the per-key limit from 10 to 50 for Socket.IO (which uses multiple connections per tab for polling fallback). Add separate limits for authenticated vs. anonymous sockets: authenticated users get 50 connections per UID; anonymous IPs get 10 connections per IP. |
| **Files** | `server.js` |
| **Verification** | Connect 20 tabs from the same authenticated user. Confirm all connections are accepted. Connect 15 anonymous connections from the same IP. Confirm the 11th is rejected. |

### 5.5 Add Structured Logging

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #25 (partial) |
| **Current** | All logging uses `console.log`, `console.warn`, `console.error` with no structured format. |
| **Fix** | Create a `server/logger.ts` module that wraps console methods with structured JSON output: `{ timestamp, level, message, requestId, userId, ...metadata }`. Replace all `console.log/warn/error` calls with `logger.info/warn/error`. Add `requestId` to every HTTP request (via middleware) and propagate to socket handlers. |
| **Files** | New `server/logger.ts`, all server modules |
| **Verification** | Start server. Make a deposit request. Confirm the log output is structured JSON with requestId, userId, and timestamp. |

### 5.6 Add Health Check with Dependency Status

| Field | Value |
|---|---|
| **Source** | AUDIT Issue #25 (partial) |
| **Current** | The `/health` endpoint returns a simple status without dependency checks. |
| **Fix** | Enhance `/health` to check: (1) Firestore connectivity (read/write a `health_check` document), (2) Fapshi API reachability (HEAD request to Fapshi's base URL), (3) active room count, (4) `misconfiguredAuth` flag from Step 0.3. Return `{ status: 'healthy' | 'degraded' | 'unhealthy', details: { firestore: 'ok' | 'error', fapshi: 'ok' | 'error', activeRooms: N, misconfiguredAuth: boolean } }`. |
| **Files** | `server.js` |
| **Verification** | Call `/health` with Firestore and Fapshi accessible. Confirm `status: 'healthy'`. Stop Firestore. Confirm `/health` returns `status: 'degraded'` with `firestore: 'error'`. |

### 5.7 Clean Up Deployment Configuration

| Field | Value |
|---|---|
| **Source** | AUDIT_GAPS IR-12 |
| **Current** | Repository contains `netlify.toml`, `railway.json`, `railway.toml`, and `Procfile` simultaneously, creating deployment ambiguity. |
| **Fix** | Choose one Railway configuration file (`railway.toml` preferred for explicit settings). Remove `railway.json` and `Procfile`. Add a comment in `railway.toml` explaining its role. Verify that `netlify.toml` only contains frontend deploy configuration and does not conflict with Railway settings. Add `CONTRIBUTING.md` or inline documentation explaining the dual-deployment setup. |
| **Files** | `railway.json`, `railway.toml`, `Procfile`, `netlify.toml` |
| **Verification** | Deploy to Railway and Netlify. Confirm both deploy correctly. Confirm no conflicting configuration. |

---

## CROSS-CUTTING CONCERNS

These items are not individual steps but constraints that apply throughout all phases.

### Financial Correctness Checklist
Every step that touches escrow, balance, settlement, or refund must:
1. Use Firestore transactions for multi-document writes.
2. Log the full context (userId, amount, gameId, transactionId) before and after the transaction.
3. Write to `failed_settlements` on any transaction failure.
4. Be covered by the reconciliation schedulers (withdrawal scheduler from Step 2.6, escrow reconciler).
5. Never debit a user's balance below zero.

### Anti-Regression Testing Protocol
After each phase is complete:
1. Run a full end-to-end test: deposit → match → play → endGame → withdrawal.
2. Verify no balance discrepancies between escrow, settlement, and user balance.
3. Test the disconnect-reconnect flow for each game type.
4. Test the tournament life cycle (create → register → start → play rounds → finalize → payout).
5. Verify server restart recovery (hydrateRoomsFromFirestore, rejoin_game).

### Deployment Coordination
- Steps 0.5 (deposit amount fix) and 1.6 (challenge creation server-side) require coordinated client+server deploys.
- All other steps can be deployed server-side only (Firestore rule changes deploy separately via `firebase deploy`).
- After Phase 3 (TypeScript migration), the server build pipeline changes from `node server.js` to `npx ts-node server.ts` (or `node dist/server.js` after compilation). Update Railway start command.

---

## DEFERRED ITEMS

These items are acknowledged but deferred to a future cycle because they require architectural changes beyond the current plan's scope or do not pose immediate risk.

| Item | Reason for Deferral |
|---|---|
| Horizontal scaling (SR-1) | Requires Redis or similar shared state layer. Current single-instance deployment is sufficient for current scale. Plan architecture for state extraction to prepare for future Redis migration. |
| Real-time listener cost optimization (SR-3) | Requires restructuring client subscriptions. Current user count is within Firestore listener quotas (4K listeners at 1K users). |
| Socket.IO polling fallback (SR-4) | Requires HTTP/2 upgrade or WebSocket premium tier. Current load is within capacity. |
| Live win feed write amplification (SR-6) | Architecturally correct; optimization requires moving to a time-series or pub/sub model. Current write volume is manageable. |
| Admin dashboard query optimization (SR-7) | Requires backend caching layer. Current admin user count is low. |
| CDN/backend version skew (IR-4) | Requires API versioning strategy. Add `/api/v1/` prefix when surface area stabilizes. |
| Firebase service account key rotation (IR-5) | Requires IAM setup and monitoring. Current key is in environment variables. |
| Lidraughts/Lichess dependency assessment (IR-9) | Requires product decision on whether these integrations are active. |
| GDPR/compliance (IR-10) | Requires legal review. |