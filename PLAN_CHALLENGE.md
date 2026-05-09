# Katika Audit Plan — Aggressive Challenge

**Date:** 2026-05-08  
**Scope:** Attack every assumption, step, and strategy in the existing audit plan  
**Constraint:** Do not rewrite; identify only weaknesses and failure modes  

---

## 1. MISSED ISSUES

### MI-1: The Plan Never Addresses the Primary Money-Burning Bug
**Problem Not Identified:** The `join_game` handler (server.js:2140-2182) deducts escrow from the user's Firestore balance BEFORE the room is created. If the room creation fails for ANY reason (e.g., opponent vanished between queue check and room creation, uncaught exception in `createInitialGameState`, or the `persistRoomToFirestore` call throws), the escrow is already deducted and there is NO rollback. The `refundEscrow` function is only called on explicit `leave_queue` or `disconnect` — not on room creation failure. This means every failed matchmaking attempt permanently loses user funds if the failure occurs after escrow deduction but before the `rooms.set()` at line 2231. The plan has zero steps addressing this.

### MI-2: The Plan Ignores the Client-Side `onSnapshot` Error Propagation Gap
**Problem Not Identified:** `subscribeToUser` (users.ts:39-46) passes `(docSnap) => { if (docSnap.exists()) callback(docSnap.data() as User); }` to `onSnapshot`. Firestore's `onSnapshot` takes an optional third parameter for error handling. Without it, permission errors, quota exceeded errors, or offline cache corruption silently stop the callback. The UI freezes on an old balance. The plan's step 4.4 adds indexes but never adds error handlers to the snapshot listeners that the entire UI depends on.

### MI-3: The Plan Assumes the Server's `game_update` Event Is Always Delivered
**Problem Not Identified:** Socket.IO emit uses the default volatile flag (`false`), but Socket.IO does NOT guarantee delivery — it guarantees delivery *if the transport succeeds*. If the recipient's TCP connection drops mid-packet, the `game_update` is lost. There is no acknowledgment callback, no sequence number on game updates, and no re-sync mechanism. If a `game_update` is lost for a non-Pool game (where state persists only in memory), the players are now in divergent game states with no way to know it. The plan's step 2.1 (persist after every update) helps for crash recovery but does not solve live desynchronization.

### MI-4: The Plan Does Not Address the `privateRoomId` / `tournamentMatchId` Semantic Collapse
**Problem Not Identified:** The code treats `room.privateRoomId` and `room.tournamentMatchId` interchangeably (server.js:1902-1903, line 2214). A private room ID can start with `m-` and be misclassified as a tournament match, triggering tournament advancement logic for a non-tournament game. The plan's tournament steps (3.2, 5.1) don't mention fixing this identification logic.

### MI-5: The Plan Omits the `disconnect` Handler Forfeiting a Reconnected User
**Problem Not Identified:** The `disconnect` handler (server.js:3187-3193) starts a `setTimeout` to forfeit the game after `timeoutSeconds` seconds. It stores the `timerId` in `disconnectTimers` keyed by `userId`. But the timer's callback (line 3191) does NOT re-check whether the user has reconnected before calling `endGame`. If a user disconnects, reconnects 5 seconds later, and plays normally, the disconnect timer fires after `timeoutSeconds` seconds anyway and calls `endGame` with the still-connected user as the loser. The plan's reconnection handling (step none) is silent on this bug. The existing audit's gap analysis CG-1 identifies this as a multi-tab issue, but the plan's implementation steps don't fix it.

### MI-6: The Plan Never Addresses Race Between `endGame` Tournament Hook and Admin Force-Result
**Problem Not Identified:** `endGame` (server.js:1902-1906) calls `recordTournamentMatchResult` asynchronously with `.catch()`. An admin force-result (line 1215) also calls `recordTournamentMatchResult`. Both check `mData.status === 'completed'` idempotently, but both then call `checkAndAdvanceTournamentLogic`. If both paths complete `checkAndAdvanceTournamentLogic` concurrently, duplicate next-round matches are created before either's guard query (line 815-822) returns results. The plan's step 5.1 (distributed locks) mentions "sentinel pattern" but doesn't specify WHERE the sentinel is placed — the next-round creation check at line 815 is a `limit(1).get()` query that reads before writing, which is the exact non-atomic pattern the lock is supposed to prevent.

---

## 2. WRONG ASSUMPTIONS

### WA-1: Nonce-Based CSP Works with a Statically-Built Vite SPA (Step 4.1)
**Incorrect Reasoning:** The plan says "Generate a nonce per request using crypto.randomBytes(16).toString('base64'), inject it into the CSP header, and add it as a `<meta>` tag in `index.html`." This requires `index.html` to be dynamically served with a fresh nonce on every response. But the application is a Vite SPA where `index.html` is a static build artifact served by Netlify CDN, NOT by the Express server. The Express server only serves the API — it never serves `index.html`. A per-request nonce in the CSP header must match a nonce in the HTML's `<script>` tags. Without a server-side rendering layer, the nonce in the header and the nonce in the HTML will NEVER match. All inline scripts will be blocked by CSP, breaking the entire frontend.
**What Actually Works:** Hash-based CSP (compute SHA-256 hashes of known inline script contents at build time, inject into the CSP header at the Express level) OR a build-time CSP generation that writes hashes to a JSON file read by the server.

### WA-2: Firestore Transactions = Distributed Locks (Step 5.1)
**Incorrect Reasoning:** The plan says "Use Firestore transaction-based locks (`processed_tournaments` sentinel pattern) for scheduler operations." Firestore transactions provide ACID guarantees within a SINGLE transaction execution. They do NOT prevent two separate transactions from reading the same document and both deciding to proceed. The sentinel pattern (write a marker document) is an idempotency guard — it prevents the SAME transaction from executing twice. It does NOT prevent Instance A and Instance B from both reading `status: 'registration'` at time T0, both deciding to start the tournament, and both writing conflicting match documents.
**What Actually Works:** A compare-and-swap update (Firestore `update` with a precondition) that atomically transitions `status` from `'registration'` to `'starting'` before proceeding, OR an external mutex (Redis `SETNX`).

### WA-3: The Client-Side `fapshi.ts` Will Transparently Accept a New `depositAmount` Parameter (Step 1.3)
**Incorrect Reasoning:** Step 1.3 says "Add depositAmount as separate field in initiate request." But the client-side `fapshi.ts` `initiateFapshiPayment` function (line 15-43) sends `{ amount, userId, redirectUrl }` in the request body. The server-side `amount` variable (line 265) receives whatever the client sends. Adding `depositAmount` to the server-side handler without updating the client means `depositAmount` is `undefined` on every request, and the webhook will fail to credit because the stored `pendingDeposits` entry has `depositAmount: undefined`. Both client AND server must change simultaneously — a coordinated deploy that the plan doesn't acknowledge.

### WA-4: Persisting Every `game_update` to Firestore Is Cost-Neutral (Step 2.1)
**Incorrect Reasoning:** Step 2.1 says persist after every `io.to(roomId).emit('game_update', ...)`. At 1,000 concurrent Chess games with 30-second average move time, that's 2,000 writes/minute. At 10,000 concurrent Dice games (fast rounds), that's potentially 200,000 writes/minute. Firestore pricing is $0.18 per 100,000 document writes. At 200,000 writes/minute, this costs $0.36/minute = $21.60/hour = $518/day = $15,552/month — JUST for game state persistence. And Firestore has a soft limit of 10,000 writes/second per project. The plan doesn't mention cost modeling or Firestore quotas at all.

### WA-5: Extracting Modules from `server.js` Does Not Break Closure Dependencies (Phase 3)
**Incorrect Reasoning:** Steps 3.1-3.7 each say "Move [X] to [Y]". But the socket handler at `io.on('connection', (socket) => { ... })` (server.js:2008) is a single massive closure that captures: `rooms`, `queues`, `userSockets`, `socketUsers`, `disconnectTimers`, `db`, `io`, `pendingDeposits`, `gameActionTimestamps`, `gameOutcomeHistory`, `ADMIN_EMAILS`, and the functions `endGame`, `settleGame`, `refundEscrow`, `deductEscrow`, `sanitizeRoomForClient`, `createInitialGameState`, `calculatePayouts`, `persistRoomToFirestore`, `cleanupRoomFromFirestore`, `isGameActionRateLimited`, `recordOutcomeAndCheckAnomaly`, `recordTournamentMatchResult`, `startTournamentLogic`, `checkAndAdvanceTournamentLogic`, `finaliseTournament`, `hydrateRoomsFromFirestore`, and `reconcileOrphanedEscrows`.

Moving ANY of these out of the file requires either: (a) passing them as parameters (which changes function signatures everywhere), (b) making them module-level exports (which mutate global state in a way that prevents testing), or (c) creating a dependency injection container. The plan doesn't specify which approach, and none of the 8 steps acknowledge this fundamental restructuring requirement.

### WA-6: The Plan's 12-Day Timeline Is Feasible
**Incorrect Reasoning:** The plan schedules 28 implementation steps across 5 phases in 12 days. A single-step TypeScript migration of 3,357 lines of mission-critical financial server code takes 3-5 engineer-days minimum with regression testing. Decomposition of a monolith into 7+ modules with shared mutable state typically takes 1-2 weeks with a senior engineer. Adding comprehensive test coverage for previously untested financial logic takes another week. The plan is off by a factor of 3-5x in time estimation.

---

## 3. INEFFICIENT APPROACHES

### IA-1: Double Persistence Pattern (Steps 2.1 + 2.2)
**Problem:** Step 2.1 persists on every `game_update`. Step 2.2 persists every 10 seconds in a `setInterval`. For an active game, this means TWO writes per update (one on-emit, one on-interval). For an idle game with no updates, the 10-second interval still writes the unchanged state to Firestore. This is burning Firestore quotas for zero value.
**Better Alternative:** Persist only on meaningful state transitions (game start, player move that changes turn, game end). Add a single heartbeat write every 60 seconds if `lastMoveTime` is older than 60s. Remove the `setInterval` entirely. This reduces writes by 80-90%.

### IA-2: Building a New HTTP API for Matchmaking When Socket.IO Already Handles It (Step 2.3)
**Problem:** Step 2.3 says "Create `/api/games/find-or-create` endpoint." But `server.js` already has a `join_game` socket event that: queues users, matches opponents, creates rooms, handles private rooms, tracks escrow deduction amounts, and handles reconnect. The `findOrCreateMatch` function in `games.ts` is a CLIENT-SIDE Firestore function that the socket flow doesn't use. The bug is that `findOrCreateMatch` exists in client code and has a TOCTOU race — the fix is to REMOVE it from the client, not to build a parallel HTTP API that duplicates existing socket matchmaking logic.
**Better Alternative:** Delete `findOrCreateMatch` and `setGameResult` from `services/firebase/games.ts` exports. Add a comment block warning that game state writes must go through the socket. One-line fix vs. building, testing, securing, and maintaining a new endpoint.

### IA-3: Weak Interim Sanitizer Before Strong One (Step 1.5 → Step 4.2)
**Problem:** Step 1.5 applies the existing homegrown `sanitize()` function to user names. Step 4.2 (3 phases later, Days 9-10) replaces it with DOMPurify. This means the system ships with a weak sanitizer for Days 1-9 while the team works on other phases. Any XSS payload exploiting the gap between these steps becomes a live vulnerability.
**Better Alternative:** Install `dompurify` and `isomorphic-dompurify` as Step 1.5bis — immediately after step 1.5. Apply it to ALL user-supplied text fields (name, chat message, forum post, bug report description) in a single pass. Do not ship an inferior fix and promise to replace it later.

### IA-4: Phase 3 Module Extraction Order Creates Circular Work (Steps 3.5 → 3.6 → 3.8)
**Problem:** Step 3.5 extracts the game engine first. Step 3.6 extracts game logic (Checkers, Dice, etc.) AFTER. Step 3.8 writes unit tests AFTER extraction. But the game engine extraction will move inline game logic (Checkers validation ~160 lines, Pool validation ~170 lines) into the game engine module. Then step 3.6 extracts it OUT of the game engine module into separate files. The team writes tests for step 3.8 after step 3.6, but the code moved TWICE — tests written against the intermediate structure break after re-extraction.
**Better Alternative:** Extract game logic FIRST (step 3.6 before 3.5). Write tests immediately after extraction (step 3.8 immediately after 3.6). Then extract the game engine which IMPORTS the already-tested game logic modules. This is a one-pass extraction with tests anchoring each module.

### IA-5: TypeScript Migration at Phase 5 After All Other Changes (Step 5.4)
**Problem:** The plan migrates to TypeScript in Phase 5, after 4 phases of moving code between files. Every file extraction in Phase 3 produces `.js` files. The Phase 5 TypeScript migration renames them to `.ts` and adds types. But the extraction in Phase 3 introduces new function signatures and module boundaries that the Phase 5 migration must type-annotate from scratch, re-understanding the intent of each interface after the code has already been reshuffled.
**Better Alternative:** TypeScript migration should be Phase 2 or Phase 3, concurrent with module extraction. Extract a module as a `.ts` file with types from day one. This avoids the double-touch problem and uses TypeScript's compiler as a safety net during the risky extraction work.

---

## 4. FAILURE POINTS

### FP-1: Production Crash Loop from Step 1.1 Guard
**Where Execution Breaks:** Step 1.1 adds `process.exit(1)` if `SOCKET_AUTH` is `'off'` in production. Railway detects the crash and auto-restarts the instance. The restarted instance hits the same guard and `process.exit(1)` again. This creates an infinite crash loop. Railway's health check fails, the deployment is rolled back, OR the instance sits in "Crashed → Restarting → Crashed" until the deployment is manually reverted.
**Why It Breaks:** The guard assumes the operator can fix the env var before the next restart. In practice, the operator discovers this after the deploy crashes — while the platform is down for all users. There's no grace period, no warning-only mode, no log-and-continue fallback.

### FP-2: Firestore Write Quota Exhaustion from Step 2.1
**Where Execution Breaks:** After step 2.1, every `game_update` emission triggers `persistRoomToFirestore`. For a high-traffic period (tournament finals, weekend peak), Firestore hits the 10,000 writes/second soft limit. Write requests are throttled with exponential backoff. `persistRoomToFirestore` (line 1693-1703) catches errors with `console.error` — it does NOT retry. Game state updates are silently lost. The in-memory room diverges from the persisted state. If the server then crashes and `hydrateRoomsFromFirestore` restores stale state, players lose moves or see incorrect game outcomes.
**Why It Breaks:** No write budget, no backpressure mechanism, no degraded mode, no move sequence checkpointing. Every game update is treated as equally important when in reality only the final state matters for crash recovery.

### FP-3: Nonce CSP Breaks Frontend on First Deploy (Step 4.1)
**Where Execution Breaks:** The server starts injecting `Content-Security-Policy: script-src 'nonce-{random}';` headers. The `index.html` at Netlify has NO matching nonce in its `<script>` tags (it's a static build artifact). Browsers block ALL inline scripts — which includes the Vite-bundled JavaScript loading. The frontend loads as a blank white page. No user can access the application. This is a total platform outage.
**Why It Breaks:** The plan's assumption that nonce can be injected into a static HTML file via a `<meta>` tag at request time is architecturally impossible without server-side rendering. The `index.html` served by Netlify CDN cannot contain a server-generated nonce.

### FP-4: Phase 3 Extraction Creates Unresolvable Circular Imports
**Where Execution Breaks:** `server/routes/payments.js` needs `db` and `pendingDeposits`. `server/gameEngine.js` needs `db`, `io`, `rooms`, `queues`, `userSockets`, and `refundEscrow` from `server/routes/payments.js` (for queue refunds). `server/routes/admin.js` needs `db`, `io`, `userSockets`, and `startTournamentLogic` from `server/routes/tournaments.js`. `server/routes/tournaments.js` needs `db`, `io`, `userSockets`, `recordTournamentMatchResult` from `server/gameEngine.js`.

This creates: `gameEngine → payments → admin → tournaments → gameEngine`. A circular dependency that Node.js resolves to a partially-loaded module. At runtime, `recordTournamentMatchResult` is `undefined` when `tournaments.js` calls it because the module hasn't finished loading.
**Why It Breaks:** No dependency graph analysis preceded the extraction plan. The shared mutable state (Maps) creates implicit dependencies that become explicit circular imports when code is split.

### FP-5: `withRetry` Settlement Loss on Process Crash (Already Identified — But the Plan's Fix Is Insufficient)
**Where Execution Breaks:** The gaps analysis (EC-1) identifies that `withRetry` can lose settlements on mid-retry crash. The plan's step 1.6 adds a withdrawal reconciliation scheduler. But step 1.6 only handles `type === 'withdrawal'` with `status === 'pending'` — it does NOT handle `settleGame` failures where the transaction partially commits (ELO updated but balance update lost due to Firestore contention). The `failed_settlements` collection is written but never read by any background job. The plan assumes the reconciliation scheduler covers all settlement gaps when it only covers one narrow case (withdrawal timeout).
**Why It Breaks:** The scheduler's query scope is too narrow. `settleGame` failures produce `escrow_lock` transactions that were supposed to be resolved by `winnings` / `stake_loss` transactions — but those writes might have failed within the transaction (atomic rollback means NONE of the writes happened). The settlement sentinel was NOT written, so the reconciler can't distinguish "game was settled" from "game settlement failed entirely."

### FP-6: HydrateRoomsFromFirestore Does Not Restore Socket Memberships
**Where Execution Breaks:** Step 2.1 persists rooms to Firestore. Step 2.2 does periodic flushes. The existing `hydrateRoomsFromFirestore` (server.js:1674-1690) restores rooms to the `rooms` Map on startup. But it does NOT call `socket.join(roomId)` for any connected clients. When players reconnect after a server restart, the server has the room in memory but the players' sockets are NOT in the room's Socket.IO channel. `game_update` emits do not reach them. The `rejoin_game` handler (line 2283) looks for the user in `room.players` and calls `socket.join(roomId)` — but only if the user explicitly emits `rejoin_game`. If the user doesn't emit it (the client-side rejoin is triggered by React effects that may not fire in all cases), the player is silently excluded from the game.
**Why It Breaks:** Room persistence without socket channel restoration is incomplete state recovery. The hydration step restores data but not connectivity.

---

## 5. REQUIRED CORRECTIONS

### RC-1: Replace Nonce CSP (Step 4.1) with Hash-Based CSP
**Correction:** Compute SHA-256 hashes of all inline `<script>` and `<style>` content at Vite build time using the `vite-plugin-csp-hash` or a custom Vite plugin. Write the hashes to a JSON manifest. The Express server reads the manifest at startup and constructs the CSP header with `'sha256-{hash}'` directives instead of `'nonce-{random}'`. This works with static HTML and avoids the nonce synchronization problem entirely. Remove the `<meta>` tag approach.

### RC-2: Replace Per-Update Persistence (Steps 2.1 + 2.2) with a Write-Once-On-End Pattern + Dedicated State Log
**Correction:** Do NOT persist on every `game_update`. Instead, maintain a structured event log per room: append each game state transition as a new document in `game_logs/{roomId}/events/{sequenceNumber}` (ordered by sequence number). On game end, write the final state once. On server restart, replay the event log to reconstruct room state. This costs O(1) per move instead of O(1) per move for the full room document (same write count) but avoids the redundancy of overwriting the full room document every time. Firestore subcollection writes are charged the same as document writes — the benefit is atomicity (each event is independently written; a failure on event N doesn't corrupt events 1 through N-1).

### RC-3: Fix the `disconnect` Timer Race BEFORE Any Other Phase
**Correction:** The `disconnect` handler (server.js:3187-3193) callback must check whether the `disconnectTimers` entry still exists AND whether the user has an active socket before calling `endGame`. After `clearTimeout` is called in `join_game` (line 2098), `disconnectTimers.delete(userId)` removes the entry. The timer callback should check `if (!disconnectTimers.has(userId)) return;` as its first line. This prevents reconnected users from being forfeited. This bug directly loses user funds and should be Priority 0 — before any other step in the plan.

### RC-4: Add Escrow Rollback on Room Creation Failure in `join_game`
**Correction:** The escrow deduction at server.js:2143-2181 runs before room creation at line 2231. Between these two points, the `createInitialGameState` call (line 2226), the `persistRoomToFirestore` call (line 2234), or any exception in the `socket.join` / emit section (line 2240-2254) can fail. Wrap lines 2209-2254 in a try/catch block: on any failure after escrow deduction, call `refundEscrow(userId, realDeducted, promoDeducted)` before emitting the `game_error` to the socket. Without this, matchmaking failures are a direct money loss for users.

### RC-5: Replace Firestore Transaction Locks (Step 5.1) with Atomic Status Transitions
**Correction:** The tournament scheduler's `startTournamentLogic` must use Firestore's precondition syntax: `db.collection('tournaments').doc(tournamentId).update({ status: 'starting' }, { precondition: { status: 'registration' } })`. If two instances race, exactly ONE succeeds (the first to write). The loser sees a failed precondition error and aborts. After the status update succeeds, proceed to create matches. Replace `status: 'active'` with `status: 'starting'` as an intermediate state to prevent double-starts even with the precondition pattern.

### RC-6: Move TypeScript Migration to Phase 3, Before Module Extraction
**Correction:** Swap steps 3.5-3.8 and 5.4. Migrate `server.js` to TypeScript first (rename to `server.ts`, add types to shared Maps and functions, configure `tsconfig.json` for the server). Then extract modules as `.ts` files with pre-existing type annotations. This ensures the extraction is type-safe and catches circular imports at compile time rather than at runtime.

### RC-7: Remove Instead of Replace (Step 2.3)
**Correction:** Step 2.3 says "Create `/api/games/find-or-create` endpoint." The correct action is: audit the codebase for all callers of `findOrCreateMatch` from `services/firebase/games.ts`. If no active callers exist in the main game flow (the socket `join_game` handler is the authoritative path), remove the export and delete the function. Do not build a new HTTP API endpoint that duplicates existing socket logic. If a caller DOES exist, redirect it to emit a socket event instead. The existing `join_game` handler with its queue-based matchmaking is already the correct architecture.

### RC-8: Add Error Handlers to ALL `onSnapshot` Listeners
**Correction:** Every `onSnapshot` call (at minimum: `subscribeToUser`, `subscribeToForum`, `subscribeToIncomingChallenges`, `subscribeToMaintenanceMode`, `subscribeToGame`, `subscribeToTournament`, `subscribeToGlobalWinners`, `subscribeToGameConfigs`) must receive a third argument — an error callback that dispatches a `networkStatus: 'degraded'` update to the AppContext reducer or shows a non-blocking toast. Without this, the UI silently stagnates when Firestore subscriptions fail. This is a one-line per listener change that prevents user confusion during any Firestore outage.

### RC-9: Add Ban Status Check to `verifyAuth` Middleware
**Correction:** The `verifyAuth` middleware (server.js:225-239) verifies the Firebase token and sets `req.user`. Add a Firestore read after token verification: `const userDoc = await db.collection('users').doc(decodedToken.uid).get()`. If `userDoc.exists() && userDoc.data().isBanned`, return 403. This closes the 60-minute window between a ban and token expiry where banned users can still call financial endpoints. Cache the result in a short-lived Map (TTL 60s) to avoid doubling Firestore reads on every authenticated request.

### RC-10: Remove Phase 2 Duplicate Persistence Strategy
**Correction:** Merge steps 2.1 and 2.2 into a single strategy. Choose one of:
- **A) On-Event Persistence:** Persist after `game_update` emits where game state actually changed (`lastMoveTime` updated, pieces moved, scores changed). Skip persistence for chat messages and timer updates (which are transient).
- **B) Periodic Snapshot:** Persist a snapshot every 30 seconds. On startup, `hydrateRoomsFromFirestore` recovers the last snapshot. Mark snapshot age so clients know they may need to re-sync.
Do not implement both. Combined they burn 2x Firestore writes for zero additional safety.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="todowrite">
<｜｜DSML｜｜parameter name="todos" string="false">[{"priority":"high","content":"Challenge the audit plan against system realities","status":"completed"},{"priority":"high","content":"Identify missed issues and wrong assumptions","status":"completed"},{"priority":"high","content":"Expose inefficient approaches and failure points","status":"completed"},{"priority":"high","content":"Produce required corrections","status":"completed"}]