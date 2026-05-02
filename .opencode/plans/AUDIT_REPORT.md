## 1. PLAN COVERAGE

### CORRECTLY IMPLEMENTED

| Step | Description | Status |
|------|-------------|--------|
| 0.1 | Positive-amount validation in `/api/pay/disburse` | CORRECT — `amount <= 0` check added before `amount < 1000` |
| 0.2 | AbortController to `/api/pay/initiate` fetch | CORRECT — 15s timeout with 504 response |
| 0.2 | AbortController to `/api/pay/disburse` fetch | CORRECT — 15s timeout + refund on timeout |
| 0.2 | AbortController to `/api/pay/status/:transId` fetch | CORRECT |
| 0.3 | Remove leaked keys from `.env` | CORRECT — keys replaced with comments |
| 0.4 | CSP connectSrc wildcard fix | CORRECT — `*` → `http://localhost:5173` |
| 0.5 | `connectionsByIP` max cap + LRU eviction | CORRECT — `MAX_CONNECTIONS_PER_IP = 10000` + oldest-key eviction |
| 0.6 | `admin_alert` → `io.to('admins').emit` | CORRECT — both instances changed |
| 0.6 | Admin socket join on authenticated admin | CORRECT — `socket.join('admins')` at line 2004 |
| 1.1 | Socket.IO tri-mode auth middleware | CORRECT — `off`/`log`/`enforce` working |
| 1.2 | `join_game` uses `socket.user.uid` | CORRECT — with mismatch detection |
| 1.2 | `rejoin_game` uses `socket.user.uid` | CORRECT |
| 1.3 | Client passes ID token via `auth` callback | CORRECT — SocketContext.tsx |
| 1.4 | `onIdTokenChanged` listener for refresh | CORRECT — SocketContext.tsx |
| 1.5 | `socket.user` caching for transport upgrade | CORRECT — `if (socket.user) return next()` |
| 2.2 | Status endpoint idempotent deposit crediting | CORRECT — `/api/pay/status/:transId` fallback crediting |
| 2.3 | SocketContext replaced `setTournamentMatchActive` with fetch call | CORRECT — but endpoint doesn't exist (see MISSED) |
| 3.1 | `ChessGame.tsx` draw type | CORRECT |
| 3.1 | `CheckersGame.tsx` draw type | CORRECT |
| 3.1 | `TicTacToeGame.tsx` draw type | CORRECT |
| 3.1 | `PoolGame.tsx` draw type | CORRECT |
| 3.1 | `GameRoom.tsx` draw type | CORRECT |
| 3.2 | Chess draw → `onGameEnd('draw')` | CORRECT |
| 3.3 | Checkers draw → `onGameEnd('draw')` | CORRECT |
| 3.4 | TicTacToe 3-draw streak → `onGameEnd('draw')` | CORRECT |
| 3.5 | Chess P2P game_over handler | CORRECT |
| 3.6 | `ludoLogic.js` MAX_STEP = 57 | CORRECT |
| 3.7 | Ludo capture exemption | CORRECT — allows opponent step → -1 |
| 3.8 | Ludo path-blocking step-delta fix | CORRECT — replaced full-path check |
| 3.9 | Ludo step bounds check | CORRECT — `outOfBounds` check added |
| 3.10 | Pool GROUP_ASSIGN handler | CORRECT — server handler at line 2418 |
| 3.11 | Chess timer validation | CORRECT — 1800s max, +3s tolerance, correctly placed outside try block |
| 3.12 | Tournament crypto shuffle | CORRECT — `crypto.randomInt(i + 1)` |
| 6.1 | Hydrate rooms before `server.listen` | CORRECT — async `startServer()` |
| 6.3 | Graceful shutdown persists rooms | CORRECT — `persistRoomToFirestore` loop |
| 6.4 | Dice 20-round maximum | CORRECT — `currentRound >= 20` check |
| 4.1 | Firestore index for disputes | CORRECT — `(roomId, filedBy)` index |
| 4.3 | `connectionsByIP` behind proxy | CORRECT — `x-forwarded-for` header |

### MISSED (Not Implemented)

| Step | Description | Severity |
|------|-------------|----------|
| **2.3** | Server endpoint `POST /api/tournaments/match-activate` | CRITICAL — client calls fetch to non-existent endpoint |
| **2.4** | Server endpoint `POST /api/tournaments/update-status` | CRITICAL — admin tournament status update broken |
| **2.6** | Delete `addUserTransaction` export | LOW — dead code still present |
| **2.7** | Delete `server/routes/pay.js` | LOW — dead code still present |
| **2.7** | Delete `server/routes/admin.js` | LOW — dead code still present |
| **2.2** | Remove `creditDepositIdempotent` from Finance.tsx | HIGH — broken client Firestore write still called |
| **0.2** | AbortController to webhook `verifyRes` fetch (line 364) | MEDIUM — outbound HTTP call without timeout |
| **0.5** | `pendingDeposits` max 10,000 cap | MEDIUM — unbounded growth |
| **0.5** | `gameOutcomeHistory` max 10,000 LRU + 24h eviction | MEDIUM — unbounded growth |
| **0.5** | `gameActionTimestamps` max 50,000 users cap | LOW — already filters stale, but no hard cap |
| **3.1** | `DiceGame.tsx` onGameEnd type → include `'draw'` | LOW — inconsistent type signatures |
| **4.4** | Remove Tailwind CDN from CSP `scriptSrc` | MEDIUM — supply-chain attack vector |

---

## 2. BUGS & ERRORS

1. **CRITICAL** — `server.js` has no `/api/tournaments/match-activate` route, but `SocketContext.tsx` was modified to `fetch('/api/tournaments/match-activate')`. All tournament match activations will fail with HTTP 404 responses. Game rooms will silently never transition from 'pending' to 'active', breaking the tournament bracket advancement flow.

2. **HIGH** — `Finance.tsx` line 147 still calls `await creditDepositIdempotent(user.id, response.transId, depositAmount)`. Firestore rules (`allow write: if false` on transactions sub-collection) will continue to silently reject this write. The function is dead code that runs but always fails.

3. **MEDIUM** — Webhook verification at line 364 (`fetch` to `/payment-status/${transId}`) has no AbortController timeout. If Fapshi hangs during webhook processing, the webhook handler hangs indefinitely.

4. **MEDIUM** — `pendingDeposits` Map at line 260 has no size cap. It evicts entries after 2 hours via `setTimeout`, but a burst of payment initiations could cause unbounded memory growth during that window.

5. **LOW** — `DiceGame.tsx` type signature still uses `'win' | 'loss' | 'quit'` without `'draw'`. The Dice game has no current draw condition, but if the 20-round maximum triggers `endGame(roomId, null, 'Draw')` (Step 6.4), the client type signature won't cover it, causing a TypeScript type error cascade if `onGameEnd('draw')` is ever called from DiceGame.

---

## 3. DEVIATIONS

| Plan Requirement | Implementation | Impact |
|-----------------|----------------|--------|
| Delete `server/routes/pay.js` | Not deleted | Dead code with separate `pendingDeposits` Map remains |
| Delete `server/routes/admin.js` | Not deleted | Dead code without auth middleware remains |
| Delete `addUserTransaction` | Not deleted | Dead code remains in barrel export |
| `creditDepositIdempotent` must be removed from Finance.tsx | Still imported and called | Broken code path still executes silently |
| Create `/api/tournaments/match-activate` | Not created | Client calls 404 |
| Tailwind CDN removal from CSP | Not removed | Supply-chain vector remains |
| All 4 Maps must have size caps | Only 1 of 4 (`connectionsByIP`) has cap | 3 Maps still unbounded |
| All Fapshi fetch calls must have timeout | Webhook verifyRes fetch (line 364) missed | 1 call unguarded |

---

## 4. RISK POINTS

1. **Tournament bracket stall** — Without the `match-activate` endpoint, tournaments proceed through registration and bracket creation but never start actual matches. The client polls for game starts that never come. Timeout → bracket advancement broken.

2. **Webhook timeout cascade** — If Fapshi's `/payment-status` endpoint hangs during the webhook verification step, the Node.js event loop stalls on that handler. Since the webhook's `res.status(200).json({ received: true })` fires immediately at line 356 before verification, Fapshi won't retry, and the deposit is orphaned.

3. **Memory leak under payment spam** — An attacker initiating payments in a tight loop could fill `pendingDeposits` beyond reasonable bounds, causing process memory exhaustion.

4. **`gameOutcomeHistory` unbounded** — Every game outcome writes to this Map. Over weeks of runtime with thousands of games, this grows without bound. The anomaly detection uses it, but eviction should occur at startup reconciliation.

---

## 5. VERDICT

**FAIL** — 2 CRITICAL items (match-activate endpoint, tournament-update-status endpoint) are unimplemented. The plan says to create these server endpoints, and the client code already calls them, but the routes don't exist. All tournament matches will fail to activate.

---

## 6. REQUIRED FIXES

### Fix A: Create `/api/tournaments/match-activate` endpoint in server.js
Insert after line ~695 (after tournament registration):
```javascript
app.post('/api/tournaments/match-activate', verifyAuth, blockGuests, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database service unavailable' });
    const { matchId } = req.body;
    const userId = req.user.uid;
    if (!matchId) return res.status(400).json({ error: 'matchId required' });
    try {
        const matchSnap = await db.collection('tournament_matches').doc(matchId).get();
        if (!matchSnap.exists) return res.status(404).json({ error: 'Match not found' });
        const matchData = matchSnap.data();
        if (!(matchData.players || []).includes(userId)) return res.status(403).json({ error: 'Not a player in this match' });
        if (matchData.status !== 'pending') return res.status(409).json({ error: 'Match already active or completed' });
        await db.collection('tournament_matches').doc(matchId).update({ status: 'active', startedAt: admin.firestore.FieldValue.serverTimestamp() });
        res.json({ success: true });
    } catch (e) {
        console.error('[MatchActivate]', e);
        res.status(500).json({ error: 'Failed to activate match' });
    }
});
```

### Fix B: Create `/api/tournaments/update-status` endpoint in server.js
Insert after the match-activate endpoint:
```javascript
app.post('/api/tournaments/update-status', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database service unavailable' });
    const { tournamentId, status } = req.body;
    if (!tournamentId || !status) return res.status(400).json({ error: 'tournamentId and status required' });
    const validStatuses = ['registration', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    try {
        await db.collection('tournaments').doc(tournamentId).update({ status });
        res.json({ success: true, tournamentId, status });
    } catch (e) {
        console.error('[TournamentStatus]', e);
        res.status(500).json({ error: 'Failed to update tournament status' });
    }
});
```

### Fix C: Delete dead route modules
```bash
rm server/routes/pay.js
rm server/routes/admin.js
```

### Fix D: Delete `addUserTransaction` export
Remove from `services/firebase/finance.ts` lines 35-56.
Remove `addUserTransaction,` from `services/firebase.ts` line 44.

### Fix E: Remove `creditDepositIdempotent` from Finance.tsx
Remove import from line 4: change `{ getUserTransactions, creditDepositIdempotent, auth }` → `{ getUserTransactions, auth }`
Remove lines 141-148 (the `creditedTransIds` guard + `creditDepositIdempotent` call).

### Fix F: Add AbortController timeout to webhook verifyRes fetch (line 364)
```javascript
const verifyController = new AbortController();
const verifyTimeout = setTimeout(() => verifyController.abort(), 15000);
let verifyRes;
try {
    verifyRes = await fetch(`${FAPSHI_BASE_URL}/payment-status/${transId}`, {
        headers: { 'apiuser': FAPSHI_USER_TOKEN, 'apikey': FAPSHI_API_KEY },
        signal: verifyController.signal
    });
} catch (e) {
    clearTimeout(verifyTimeout);
    console.error('[Webhook] Fapshi verification timed out for transId:', transId);
    return;
}
clearTimeout(verifyTimeout);
```

### Fix G: Add size cap to `pendingDeposits` before set (line 333)
Add before `pendingDeposits.set(data.transId, ...)`:
```javascript
if (pendingDeposits.size >= 10000) {
    const oldestKey = pendingDeposits.keys().next().value;
    pendingDeposits.delete(oldestKey);
}
```

### Fix H: Remove Tailwind CDN from CSP `scriptSrc` (line 97)
Replace:
```javascript
scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
```
With:
```javascript
scriptSrc: ["'self'", "'unsafe-inline'"],
```

### Fix I: Add `'draw'` to `DiceGame.tsx` onGameEnd type (line 17)
Replace `'win' | 'loss' | 'quit'` → `'win' | 'loss' | 'quit' | 'draw'`
