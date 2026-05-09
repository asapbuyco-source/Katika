# Katika (Vantage Gaming) — Gaps & Missing Considerations Analysis

**Date:** 2026-05-08  
**Scope:** Identify what was NOT fully considered in prior audit  
**Constraint:** No repetition of existing findings; focus exclusively on omissions  

---

## 1. CONTEXT GAPS

### CG-1: Multi-Tab User Session Collapse
**Missing Consideration:** The `userSockets` Map stores exactly one `socketId` per `userId`. When a user opens a second browser tab and emits `join_game`, the new socket ID overwrites the old mapping. When the first tab's socket disconnects (e.g., user closes Tab 1), the `disconnect` handler executes `userSockets.delete(userId)`, which deletes the **second tab's** active socket mapping. The `disconnectTimers` forfeit timer starts, and the user is forcibly disconnected in the second tab despite still being connected. This is a silent state corruption that the existing audit did not trace through the full multi-tab lifecycle.

### CG-2: Firebase Auth Token → Socket Auth Desynchronization Window
**Missing Consideration:** Firebase ID tokens expire after 60 minutes. The server enforces a 55-minute forced disconnect (`tokenExpiryTimer`, server.js:2013). However, when `SOCKET_AUTH_MODE` is `'log'` or `'enforce'`, the auth middleware (line 171) only verifies the token at connection time. If a user's Firebase token is revoked (e.g., password change, admin ban, account deletion), the socket remains authenticated until the 55-minute timer fires. During this window, the banned user can initiate games, place stakes, and withdraw funds.

### CG-3: Escrow Refund vs. Active Game Race Condition
**Missing Consideration:** The `disconnect` handler refunds queue escrows (server.js:3208-3214) by scanning all queues. It does not check whether the user is also in an `active` room. A race condition exists where: (1) user joins queue and gets escrow deducted, (2) match is found and room created before disconnect handler runs, (3) disconnect handler refunds the escrow, (4) game proceeds with the user having their stake refunded. The existing audit identified queue escrow refunding but did not model the temporal overlap with room creation.

### CG-4: Dispute Filing → Financial Settlement Ordering
**Missing Consideration:** `settleGame` is called non-blocking inside `endGame` (server.js:1837). `endGame` also writes the audit log to Firestore (line 1862). A player can file a dispute via `/api/disputes/file` (line 1455) after the audit log is written but before `settleGame` completes its Firestore transaction. The dispute auto-resolution (line 1473) reads the audit log and sees a winner, resolving in favor of the server-recorded winner. But if `settleGame` later fails (e.g., Firestore contention), the dispute resolution is inconsistent with the actual financial state. No atomic coordination exists between dispute creation and settlement.

### CG-5: Fapshi Webhook → Client Notification Targeting
**Missing Consideration:** The webhook handler emits `payment_confirmed` to `userSockets.get(userId)` (server.js:496-502). Since `userSockets` only tracks the most recent socket ID, users with multiple tabs receive the notification on only one tab. Other tabs rely on Firestore `subscribeToUser` to eventually see the balance update. If the notified tab is closed before the user notices, they may not realize their deposit succeeded until they refresh or navigate.

### CG-6: Tournament Match Result → Game Engine Double Trigger
**Missing Consideration:** `recordTournamentMatchResult` (server.js:955) is called from two sources: (1) `endGame` when a tournament match room completes (line 1903), and (2) the admin `/api/tournaments/force-result` endpoint (line 1215). If an admin forces a result while the game engine is simultaneously calling `endGame` for the same match, both paths execute `recordTournamentMatchResult` concurrently. While `mData.status === 'completed'` provides idempotency at the document level, `checkAndAdvanceTournamentLogic` (line 965) is called in both paths, and the next-round match creation (line 830-864) is not guarded against concurrent execution beyond a simple `limit(1)` query that still allows a race.

### CG-7: Maintenance Mode State Propagation to New Connections
**Missing Consideration:** The `/api/maintenance` endpoint (server.js:1235) emits `maintenance_update` via `io.emit()` to all currently connected sockets. A socket that connects AFTER maintenance is enabled never receives this event unless it independently subscribes to Firestore `settings/maintenance`. The `App.tsx` component does not dispatch a maintenance check on initial mount; it only reacts to socket events. New users can log in and play during maintenance.

### CG-8: Anonymous Account Linking → Balance Loss
**Missing Consideration:** Firebase anonymous users can be linked to permanent accounts (Google/Email). The `syncUserProfile` function (services/firebase/users.ts:8-37) creates a new Firestore document keyed by the Firebase UID. Anonymous accounts have one UID; linked accounts get a different UID. The code does not migrate balance, transaction history, ELO, or rank tier from the anonymous document to the linked document. A user with 50,000 FCFA who links their account starts at 100 FCFA.

### CG-9: Game Component Unmount → Orphaned Socket Room Membership
**Missing Consideration:** When a user navigates away from the game view (e.g., clicks "Dashboard"), the game component unmounts but the socket remains joined to the room namespace. The server continues broadcasting `game_update` events to that socket. The client ignores them (view is no longer `'game'`), but the bandwidth and server CPU are wasted. More critically, the user's socket is still considered "active" in the room, so the orphan reaper (server.js:1602-1625) does not evict the room even if the user has effectively abandoned the game.

### CG-10: Login Streak Bonus Double-Award on Concurrent Connections
**Missing Consideration:** The login streak logic (server.js:2066-2094) reads `lastLoginDate` from Firestore and, if it differs from today, increments the streak and awards a bonus. This is a read-then-write pattern without transaction isolation at the application level. If a user connects from two devices simultaneously (e.g., phone + laptop), both connections read `lastLoginDate === yesterday` before either writes `lastLoginDate = today`. Both award the streak bonus, resulting in double-credit.

---

## 2. EDGE CASES

### EC-1: Server Crash During `withRetry` Settlement Loop
**Missing Consideration:** `settleGame` uses `withRetry(fn, 3, 500)` (server.js:1380-1388) which retries the entire Firestore transaction on failure. If the server process crashes (SIGKILL, OOM) during the retry delay (`await new Promise(r => setTimeout(r, delayMs))`), the settlement is permanently lost. The `failed_settlements` write (line 1445) only occurs if all retries are exhausted. A mid-retry crash leaves no trace.

### EC-2: Fapshi Webhook Duplicate Processing Under Contention
**Missing Consideration:** The webhook handler responds with HTTP 200 before processing (server.js:360). Fapshi will not retry. The idempotency check (`processed_payments` sentinel) is inside a Firestore transaction (line 436). If Fapshi sends two webhooks simultaneously for the same `transId`, both could enter the transaction before either commits. Firestore serializability guarantees one fails on retry, but the retry happens inside the same request handler. If the first request's transaction is slow, the second request might time out its own Firebase client before the retry succeeds, returning an uncaught error without writing `failed_settlements`.

### EC-3: Disbursement Timeout → Refund Transaction Failure Cascade
**Missing Consideration:** The disbursement endpoint (server.js:518-615) creates a pending transaction, debits the user, then calls Fapshi. If Fapshi times out, a refund transaction is attempted (lines 580-584). If the refund transaction ALSO fails (e.g., Firestore is temporarily unavailable), the user's balance remains debited and the pending transaction stays in `status: 'pending'`. The existing audit noted the missing reconciliation job but did not model the double-failure cascade where neither the payout nor the refund succeeds.

### EC-4: Tournament Cancellation Mid-Game
**Missing Consideration:** The `/api/tournaments/cancel` endpoint (server.js:1252) refunds all participants. It does not check whether any tournament matches are currently `active`. If a tournament is cancelled while matches are in progress, players in active matches receive a refund but the game engine continues running the match. The winner of that match would then receive tournament prize pool credits via `finaliseTournament` when `recordTournamentMatchResult` is called, despite the tournament being `cancelled`.

### EC-5: Negative Balance After Dispute Resolution
**Missing Consideration:** The dispute resolution endpoint (`/api/disputes/resolve`, server.js:1529) updates the dispute document but does not reverse financial settlements. If an admin resolves a dispute in favor of the original loser, the winner has already been credited. There is no mechanism to debit the winner and credit the loser. The winner could withdraw the disputed winnings before the admin acts.

### EC-6: Rematch Request During Insufficient Funds for One Player
**Missing Consideration:** The rematch escrow transaction (server.js:2411) atomically deducts both players. If Player A has sufficient funds but Player B does not, the entire transaction fails. However, Player A's `REMATCH_REQUEST` vote is already added to `rematchVotes` (line 2398). Player B never receives a clear error message explaining why the rematch failed; they just see no rematch start.

### EC-7: Game Action Buffered During Reconnection Exceeds Turn Timeout
**Missing Consideration:** SocketContext.tsx queues `game_action` emissions when disconnected (line 405-407). When reconnected, the queue flushes (line 186-187). If a user was disconnected during their turn in TicTacToe (15-second timeout) and reconnects after 20 seconds, their buffered `game_action` is sent. The opponent may have already claimed timeout. The server processes the buffered action anyway because `TIMEOUT_CLAIM` and `MOVE` are independent event handlers with no cross-check.

### EC-8: Stale `socketGame` After Server Restart
**Missing Consideration:** If the server restarts, non-Pool rooms are lost. The client's `socketGame` state in React persists. The `rejoin_game` handler (server.js:2283) returns `{ success: false }` when the room is gone. SocketContext.tsx clears `sessionStorage` (line 221) but does NOT clear `socketGame` state. The user sees a stale game screen with no active game until they manually navigate away.

### EC-9: Chat Message ID Collision
**Missing Consideration:** Chat message IDs are generated with `Date.now().toString()` (server.js:2351). On high-frequency chat or automated spam, two messages can be created in the same millisecond, producing identical IDs. React's `key` prop uses these IDs, causing duplicate key warnings and potential rendering artifacts.

### EC-10: Pool `aim_sync` Room Spoofing
**Missing Consideration:** The `aim_sync` event (server.js:3141-3145) emits to `data.roomId` without verifying the sender's socket is actually in that room. A malicious client can send `aim_sync` to arbitrary room IDs, flooding unrelated games with fake aim data.

### EC-11: Reconciliation Script Timestamp Edge Case
**Missing Consideration:** `reconcileOrphanedEscrows` (server.js:3220) checks for `escrow_refund`, `winnings`, or `stake_loss` transactions with `date >= txData.date`. The comparison uses `new Date(td.date).getTime() >= new Date(txData.date).getTime()`. If a game ended and settled in the exact same millisecond as the escrow lock (possible under server load), the settlement transaction has the same timestamp and passes the `>=` check, marking the escrow as resolved. However, if the settlement write and escrow lock write are in the same millisecond but the settlement was for a DIFFERENT game, the script incorrectly skips the refund.

### EC-12: Graceful Shutdown Refund vs. Active Game Preservation Conflict
**Missing Consideration:** The graceful shutdown handler (server.js:3302-3355) refunds games where `timeSinceLastMove > 60000` OR `bothDisconnected`. For games with a recent move, it persists the room. But if the server receives SIGKILL immediately after starting the graceful shutdown, some rooms are neither refunded nor persisted. The orphan reaper on restart refunds ALL orphaned escrows, including those from games that were about to be persisted. This could refund active games mid-play.

---

## 3. SCALABILITY RISKS

### SR-1: Horizontal Scaling Is Impossible Due to In-Memory State
**Missing Consideration:** The existing audit noted the monolithic server but did not analyze the horizontal scaling blocker. `rooms`, `queues`, `userSockets`, `socketUsers`, `pendingDeposits`, `connectionsByIP`, `gameActionTimestamps`, and `gameOutcomeHistory` are all pure in-memory JavaScript Maps. If Railway deploys a second instance (horizontal scaling), users on Instance A cannot be matched with users on Instance B because `queues` and `rooms` are not shared. Load balancing distributes connections round-robin, causing matchmaking to fail silently for users on different instances.

### SR-2: Firestore Collection Group Query Cost Explosion
**Missing Consideration:** `reconcileOrphanedEscrows` uses `db.collectionGroup('transactions')` (server.js:3227). This scans every `transactions` subcollection under every `users/{uid}` document. At 100,000 users with 100 transactions each, each reconciliation run scans 10 million documents. Firestore bills per document read. This single job could cost hundreds of dollars per day at scale. The existing audit identified the reconciler but did not calculate its cost scaling.

### SR-3: Real-Time Listener Proliferation
**Missing Consideration:** Each active user maintains 3-4 Firestore `onSnapshot` listeners: `users/{uid}`, `challenges` (targeted), `forum_posts`, and `game_configs`. At 1,000 concurrent users, this is 3,000-4,000 active listeners. Firestore charges per listener per hour. At 10,000 users, this becomes 30,000-40,000 listeners. The existing audit did not model listener cost scaling or the Firebase project quota limits (50,000 concurrent listeners per project).

### SR-4: Socket.IO Polling Fallback Under Flash Crowd
**Missing Consideration:** Socket.IO falls back to HTTP long-polling when WebSocket is unavailable. Each polling client sends an HTTP request every ping interval (45s configured, but actual polling is more frequent). With 5,000 concurrent users on polling fallback, the server handles ~100 HTTP requests per second just for Socket.IO polling. The existing rate limiter (100 req/15min per IP) is bypassed for Socket.IO requests, but the Express server itself can be overwhelmed by polling volume.

### SR-5: Tournament Batch Write Limit
**Missing Consideration:** `checkAndAdvanceTournamentLogic` (server.js:830-864) creates all next-round matches in a single `db.batch()`. Firestore limits batch writes to 500 operations. For a tournament with 1,024 players (512 matches in a round), the batch exceeds the limit and fails. The code has no chunking logic. The existing audit mentioned distributed locking but did not identify the batch size limit.

### SR-6: Live Win Feed Write Amplification
**Missing Consideration:** Every staked game writes to `live_winners` (server.js:1911) and schedules a 1-hour auto-delete (line 1922). At 1,000 staked games per hour, this generates 2,000 Firestore writes per hour (1,000 creates + 1,000 deletes). This scales linearly with game volume. The existing audit did not model this write amplification.

### SR-7: Admin Dashboard Full-Table Scan
**Missing Consideration:** `getAllUsers` (services/firebase/users.ts:71-79) fetches 100 users ordered by name with no caching. Each admin dashboard load triggers this query. If 10 admins refresh the dashboard once per minute, that's 600 queries per hour scanning the entire `users` collection. At 100,000 users, each query reads 100 documents. Scale this to 1,000 admin actions per day and costs grow proportionally.

### SR-8: In-Memory Map Unbounded Growth Under DDoS
**Missing Consideration:** `connectionsByIP`, `gameActionTimestamps`, `gameOutcomeHistory`, and `pendingDeposits` have size caps (10,000 or 50,000) with FIFO eviction. But `rooms`, `queues`, `userSockets`, `socketUsers`, and `disconnectTimers` have NO size limits. Under a DDoS attack or flash crowd, these Maps grow until the process runs out of memory and crashes.

### SR-9: Tournament Participant Profile Parallel Read Storm
**Missing Consideration:** `startTournamentLogic` (server.js:904-909) fetches each participant's profile with individual `db.collection('users').doc(uid).get()` calls wrapped in `Promise.all`. For a 256-player tournament, this is 256 parallel Firestore reads. Firestore has a concurrency limit of 100 for parallel reads from a single client. Exceeding this causes some reads to queue or fail, potentially leaving player profiles as `{ name: 'Unknown', ... }`.

---

## 4. INTEGRATION RISKS

### IR-1: Firebase Auth Token Revocation Lag
**Missing Consideration:** When `banUser` is called (services/firebase/admin.ts:7-20), the server updates Firestore `isBanned: true` and optionally disconnects the socket. But the user's Firebase ID token remains cryptographically valid for up to 60 minutes. During this window, the user can call REST API endpoints (`/api/pay/initiate`, `/api/pay/disburse`, `/api/tournaments/register`) using their still-valid Bearer token. The `blockGuests` middleware checks `sign_in_provider` but not `isBanned`. The `verifyAuth` middleware decodes the token but does not query Firestore for the ban status.

### IR-2: Fapshi API Unavailability → No Retry Queue
**Missing Consideration:** If Fapshi's API is down, deposit initiation and withdrawal disbursement return 504 errors immediately. There is no queue, retry mechanism, or dead-letter store for failed payment operations. A user who encounters a timeout must manually retry. At scale, transient Fapshi outages could block all financial operations with no recovery path.

### IR-3: Firestore Snapshot Listener Silent Failure
**Missing Consideration:** Client-side `onSnapshot` listeners (e.g., `subscribeToUser`, `subscribeToForum`, `subscribeToIncomingChallenges`) have no error handlers for snapshot failures. If Firestore experiences a regional outage or the listener hits a quota limit, the subscription fails silently. The UI shows stale data without indicating the subscription is broken. Users might believe their balance is correct when the listener has stopped updating.

### IR-4: Netlify CDN ↔ Railway Backend Version Skew
**Missing Consideration:** The frontend is deployed to Netlify (CDN edge-cached) and the backend to Railway. Netlify's CDN caches static assets aggressively. If a breaking API change is deployed to Railway before the new frontend propagates to all CDN edges, stale frontend clients connect to the updated backend. Since there is no API versioning (`/api/v1/...`), backward compatibility must be maintained for the duration of CDN cache propagation (potentially hours). The existing audit did not analyze deployment coordination.

### IR-5: Firebase Service Account Key Compromise
**Missing Consideration:** `FIREBASE_SERVICE_ACCOUNT` is a full JSON service account key passed as an environment variable. If this key is leaked (via `.env` file exposure, Railway env var breach, or logging), an attacker gains full Firebase Admin access to all data. There is no key rotation mechanism, no short-lived token exchange, and no monitoring for unauthorized Admin SDK usage.

### IR-6: Railway SIGKILL During Firestore Transaction
**Missing Consideration:** Railway deploys replace running instances. The graceful shutdown handler (server.js:3302-3355) has a 60-second timeout for `httpServer.close()`. But Railway can send SIGKILL at any time if the instance exceeds memory limits or the deploy is urgent. If SIGKILL arrives during a Firestore transaction (e.g., `settleGame`, `deductEscrow`, `finaliseTournament`), the transaction may be partially committed or left in an unknown state. Firestore transactions are atomic at the database level, but application-level side effects (socket emits, in-memory Map updates) are not rolled back.

### IR-7: Webhook Endpoint DDoS Vulnerability
**Missing Consideration:** `/api/pay/webhook` accepts POST requests from any IP with no rate limiting, no IP whitelist, and no signature verification of the incoming request. While the handler verifies the transaction with Fapshi's API, a high-volume DDoS attack on this endpoint could exhaust server CPU/memory and queue capacity, causing legitimate Fapshi webhooks to be dropped or time out. Fapshi's retry logic might then delay deposit confirmations.

### IR-8: Helmet CSP Conflict with Firebase Auth Popup
**Missing Consideration:** The CSP `scriptSrc: ["'self'", "'unsafe-inline'"]` and `connectSrc` includes `https://*.googleapis.com` and `https://*.firebaseio.com`. Firebase Auth's Google sign-in popup loads scripts from `https://accounts.google.com` and redirects to `https://katika-8eef2.firebaseapp.com`. Neither domain is in the `scriptSrc` or `frameSrc` directives. Google sign-in via popup may be blocked by CSP on some browsers, silently failing.

### IR-9: Lidraughts / Lichess External API Dependencies
**Missing Consideration:** The codebase includes `services/lidraughts.ts`, `services/lichess.ts`, and `services/lidraughts.test.ts`. These import external APIs (`lidraughts.org`, `lichess.org`). If these APIs change their endpoints, rate limits, or CORS policies, any feature relying on them fails. The existing audit did not identify whether these integrations are active or dormant, nor did it assess their reliability.

### IR-10: GDPR / Data Privacy Compliance for Firebase Analytics
**Missing Consideration:** `VITE_FIREBASE_MEASUREMENT_ID` (Firebase Analytics) is embedded in the frontend bundle. User behavioral data is sent to Google Analytics without explicit consent management, opt-out mechanism, or data processing agreement visibility. For a platform handling financial transactions in Cameroon, this may violate local data protection regulations or GDPR if serving EU users.

### IR-11: PWA Service Worker Cache Invalidation Delay
**Missing Consideration:** The Vite PWA config uses `registerType: 'autoUpdate'` with `CacheFirst` for Google Fonts and `StaleWhileRevalidate` for images. Critical security patches deployed to the frontend may be cached by the service worker for hours. Users with the old service worker continue running potentially vulnerable client code. There is no forced update mechanism or kill-switch for outdated service workers.

### IR-12: Multiple Deployment Configuration Files
**Missing Consideration:** The repository contains `netlify.toml`, `railway.json`, `railway.toml`, and `Procfile` simultaneously. This creates ambiguity about the actual deployment target and configuration precedence. If `railway.json` and `railway.toml` specify different settings, Railway's resolution order is undefined. Deployment drift between environments is likely.
