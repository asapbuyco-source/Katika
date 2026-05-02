# FINAL IMPLEMENTATION PLAN

## Phase 0 — Emergency Hotfixes (Deploy Immediately, Server-Only, No Client Change)

### Step 0.1: Add positive-amount validation to all financial endpoints
**Files:** `server.js` lines 452, 227

`/api/pay/disburse` checks `amount` is integer and within bounds but does NOT reject negative values. A negative withdrawal of `-1` passes `typeof amount === 'number'` and `Number.isInteger(amount)` and `amount >= 1000` (false, caught), but `amount < 0` is not explicit. Add explicit `amount <= 0` rejection to both endpoints and `/api/tournaments/register` entry fee debit.

In `/api/pay/disburse`, add before line 452:
```javascript
if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive.' });
```

In `/api/pay/initiate`, line 227 already has `amount <= 0` check. Verify `/api/tournaments/register` entry fee path also validates `amount > 0`.

### Step 0.2: Add AbortController timeout to all outbound Fapshi fetch calls
**Files:** `server.js` lines 258, 494

Wrap every `fetch()` call to Fapshi with a 15-second timeout using `AbortController`:
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000);
try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    // ... existing logic
} catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Payment service timeout. Please try again.' });
    throw err;
}
```

Apply to: `/api/pay/initiate` (line 258), `/api/pay/disburse` (line 494), `/api/pay/status/:transId` (if it exists).

### Step 0.3: Rotate Fapshi withdrawal keys and remove from `.env`
**Files:** `.env` lines 34-36

1. Generate new `FAPSHI_API_KEY_WITHDRAWAL` and `FAPSHI_USER_TOKEN_WITHDRAWAL` in the Fapshi dashboard.
2. Set the new values as Railway environment variables (`FAPSHI_API_KEY_WITHDRAWAL`, `FAPSHI_USER_TOKEN_WITHDRAWAL`).
3. Replace lines 34-37 in `.env` with comments pointing to Railway env vars (keep the file as template only):
   ```
   # FAPSHI_API_KEY_WITHDRAWAL — set in Railway env vars
   # FAPSHI_USER_TOKEN_WITHDRAWAL — set in Railway env vars
   ```
4. Revoke the old keys `525da0f3-...` and `FAK_2543028c...` in the Fapshi dashboard.
5. Verify `.env` is in `.gitignore` (it is, line 2). Verify `.env` was never committed to git history (confirmed: `git log -- ".env"` returns empty).

### Step 0.4: Fix CSP wildcard in connectSrc
**File:** `server.js` line 102

Replace:
```javascript
connectSrc: ["'self'",
    (process.env.FRONTEND_URL || '*'),
```
With:
```javascript
connectSrc: ["'self'",
    process.env.FRONTEND_URL || 'http://localhost:5173',
```

The server already validates `FRONTEND_URL` in production (lines 42-47). The fallback `*` is only used in development. Replace with a safe development default.

### Step 0.5: Bound in-memory Maps with eviction
**Files:** `server.js` lines 217, 1546, 1559, 166

Add size caps:
- `pendingDeposits` (line 217): Already evicts after 2h. Add max cap of 10,000 entries. Oldest entries evicted first.
- `gameActionTimestamps` (line 1546): Already filters stale entries. Add max cap of 50,000 users.
- `gameOutcomeHistory` (line 1559): No eviction. Add LRU with max 10,000 users. Remove entries older than 24h.
- `connectionsByIP` (line 166): Already decrements. Add max cap of 10,000 IPs.

### Step 0.6: Target admin socket broadcasts to admin room
**Files:** `server.js` lines 654, 1117, 1331, 1581

Replace `io.emit(...)` for admin-targeted events with `io.to('admins').emit(...)`:
- `tournament_completed` (line 654): Keep as `io.emit` — all users should see tournament results.
- `admin_alert` (line 1331, 1581): Change to `io.to('admins').emit`.
- `maintenance_update` (line 1117): Keep as `io.emit` since all clients need maintenance status.

Add admin socket join in the `join_game` handler and `verifyAdmin` success path:
```javascript
// After admin auth verification succeeds:
socket.join('admins');
```

---

## Phase 1 — Socket.IO Authentication (Coordinated Server + Client)

### Step 1.1: Add Socket.IO auth middleware with tri-mode env flag
**File:** `server.js`

Add a new `io.use()` middleware BEFORE the IP rate limiter:
```javascript
const SOCKET_AUTH_MODE = process.env.SOCKET_AUTH || 'off'; // 'off' | 'log' | 'enforce'

io.use(async (socket, next) => {
    if (SOCKET_AUTH_MODE === 'off') return next();

    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
        if (SOCKET_AUTH_MODE === 'log') {
            console.warn(`[Auth] Socket ${socket.id} connected without token (log mode)`);
            return next(); // Allow in log mode
        }
        return next(new Error('Authentication required'));
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        socket.user = decoded;
        if (SOCKET_AUTH_MODE === 'log') {
            console.log(`[Auth] Socket ${socket.id} authenticated as ${decoded.uid} (log mode)`);
        }
        next();
    } catch (err) {
        if (SOCKET_AUTH_MODE === 'log') {
            console.warn(`[Auth] Socket ${socket.id} failed token verification (log mode): ${err.message}`);
            return next(); // Allow in log mode
        }
        next(new Error('Invalid token'));
    }
});
```

Store `socket.user.uid` on the socket for later use in `join_game` and `rejoin_game`.

### Step 1.2: Replace client-declared `userId` with `socket.user.uid`
**Files:** `server.js` lines 1874, 2096

In `join_game` handler (line 1874), replace:
```javascript
const userId = userProfile.id;
```
With:
```javascript
const userId = (socket.user && socket.user.uid) || userProfile.id;
if (socket.user && socket.user.uid && socket.user.uid !== userProfile.id) {
    console.warn(`[Auth] Socket userId mismatch: socket=${socket.user.uid} profile=${userProfile.id}`);
    return;
}
```

In `rejoin_game` handler (line 2096), same pattern:
```javascript
const userId = (socket.user && socket.user.uid) || userProfile.id;
```

### Step 1.3: Update client to pass ID token on Socket.IO connection
**Files:** `services/SocketContext.tsx`

Pass the Firebase ID token in the Socket.IO connection:
```javascript
import { auth } from './firebase';

const getToken = async () => {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
};

// On socket connection:
const token = await getToken();
const socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['polling', 'websocket']
});
```

### Step 1.4: Add `onIdTokenChanged` listener for mid-session token refresh
**Files:** `services/SocketContext.tsx`

Firebase ID tokens expire after 1 hour. Add a listener that refreshes the socket auth:
```javascript
import { onIdTokenChanged } from 'firebase/auth';

useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
        if (user && socket) {
            const token = await user.getIdToken();
            socket.emit('refresh_token', { token });
        }
    });
    return unsubscribe;
}, [socket]);
```

The server already has a `refresh_token` handler (line 1839) that verifies the token and resets the expiry timer. Extend it to also store `socket.user = decodedToken`.

### Step 1.5: Socket.IO verifyIdToken caching for transport upgrades
**File:** `server.js`

In the auth middleware (Step 1.1), cache the decoded token on the socket during the initial handshake. On transport upgrade (polling → websocket), Socket.IO re-fires the middleware. Check if `socket.user` already exists and skip `verifyIdToken`:
```javascript
if (socket.user) {
    // Already authenticated during polling handshake; skip re-verification
    return next();
}
```

### Step 1.6: Deployment sequence for auth
1. Deploy server with `SOCKET_AUTH=log` — all connections allowed, warnings logged for unauthenticated.
2. Deploy updated client that passes token.
3. Monitor logs for 24 hours. Confirm all connections have valid tokens.
4. Set `SOCKET_AUTH=enforce` in Railway env vars.

---

## Phase 2 — Broken Client-Side Firestore Write Replacements

### Step 2.1: Verify dead-code call sites before deleting
**Execution:** Before removing any client-side Firestore write function, search the entire codebase:

```
rg "creditDepositIdempotent|addUserTransaction|setTournamentMatchActive|updateTournamentStatus|reportTournamentMatchResult" --type ts --type tsx
```

Results as of audit:
- `creditDepositIdempotent`: Called from `Finance.tsx` line 147. **NOT dead code.** But Firestore rules block it (`allow write: if false` on transactions). It silently fails while the server webhook succeeds.
- `addUserTransaction`: Only exported, not called from any UI component. Dead code.
- `setTournamentMatchActive`: Called from `useGameController.ts` line 91 and `SocketContext.tsx` line 119. **NOT dead code.** But Firestore rules block it. Tournament matches never get marked "active" — they stay "pending" forever.
- `updateTournamentStatus`: Called from `AdminDashboard.tsx`. **NOT dead code.** But Firestore rules block it. Admin tournament management is broken.
- `reportTournamentMatchResult`: Called from `App.tsx` line 16 and `SocketContext.tsx`. Needs verification.

### Step 2.2: Remove `creditDepositIdempotent` fallback from client, enhance server status endpoint
**Files:** `components/Finance.tsx`, `server.js`

The client-side `creditDepositIdempotent` is a fallback that never succeeds (Firestore blocks it). The server webhook is the only working crediting path.

Remove lines 143-148 from `Finance.tsx` (the `creditDepositIdempotent` call). Remove the import.

On the server `/api/pay/status/:transId` endpoint, add idempotent crediting: if the payment status is SUCCESSFUL and no `processed_payments` doc exists yet for that `transId`, credit the user immediately.

### Step 2.3: Create server endpoint for tournament match activation
**Files:** `server.js`, `hooks/useGameController.ts`, `services/SocketContext.tsx`

Add `POST /api/tournaments/match-activate`:
```javascript
app.post('/api/tournaments/match-activate', verifyAuth, blockGuests, async (req, res) => {
    const { matchId } = req.body;
    const userId = req.user.uid;
    if (!matchId) return res.status(400).json({ error: 'matchId required' });
    const matchSnap = await db.collection('tournament_matches').doc(matchId).get();
    if (!matchSnap.exists) return res.status(404).json({ error: 'Match not found' });
    const matchData = matchSnap.data();
    if (!matchData.players.includes(userId)) return res.status(403).json({ error: 'Not a player in this match' });
    if (matchData.status !== 'pending') return res.status(409).json({ error: 'Match already active' });
    await db.collection('tournament_matches').doc(matchId).update({ status: 'active', startedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
});
```

Replace client call in `useGameController.ts` line 91:
```javascript
// Before: setTournamentMatchActive(table.tournamentMatchId);
await fetch('/api/tournaments/match-activate', { method: 'POST', headers: authHeader, body: JSON.stringify({ matchId: table.tournamentMatchId }) });
```

Replace client call in `SocketContext.tsx` line 119 similarly.

### Step 2.4: Create server endpoint for tournament status update
**File:** `server.js`, `components/AdminDashboard.tsx`

Add `POST /api/tournaments/update-status` (admin only):
```javascript
app.post('/api/tournaments/update-status', verifyAdmin, async (req, res) => {
    const { tournamentId, status } = req.body;
    // ... validation ...
    await db.collection('tournaments').doc(tournamentId).update({ status });
    res.json({ success: true });
});
```

Replace client call in `AdminDashboard.tsx` to use this server endpoint instead of direct Firestore write.

### Step 2.5: Create server endpoint for reporting match results
Search for all call sites of `reportTournamentMatchResult` and create a corresponding server endpoint, then replace the client-side Firestore write.

### Step 2.6: Delete unused `addUserTransaction` export
After verifying zero call sites, remove:
- `addUserTransaction` function from `services/firebase/finance.ts`
- Export from `services/firebase.ts` barrel file

### Step 2.7: Delete dead route modules
`server/routes/pay.js`: Never imported or registered. Has separate `pendingDeposits` Map. Delete.
`server/routes/admin.js`: Never imported or registered. No auth middleware, missing `ADMIN_EMAILS` import. Delete.
`server/routes/tournaments.js`: Verify if registered in `server.js`. If not, delete.

---

## Phase 3 — Game Logic Fixes (P0/P1)

### Step 3.1: Add `'draw'` to all game `onGameEnd` type signatures
**Files:**
- `components/ChessGame.tsx` line 16: `'win' | 'loss' | 'quit'` → `'win' | 'loss' | 'quit' | 'draw'`
- `components/CheckersGame.tsx` line 19: same
- `components/DiceGame.tsx` line 17: same
- `components/TicTacToeGame.tsx` line 14: same
- `components/PoolGame.tsx` line 26: same
- `components/GameRoom.tsx` line 13: same

### Step 3.2: Fix Chess draw calling `onGameEnd('quit')`
**File:** `components/ChessGame.tsx` line 412

Change `onGameEnd('quit')` → `onGameEnd('draw')` in the draw branch (else clause of `isCheckmate`).

### Step 3.3: Fix Checkers draw calling `onGameEnd('quit')`
**File:** `components/CheckersGame.tsx` line 285

Change `else onGameEnd('quit')` → `else onGameEnd('draw')`.

### Step 3.4: Fix TicTacToe 3-draw streak calling `onGameEnd('quit')`
**File:** `components/TicTacToeGame.tsx` line 216

Change `onGameEnd('quit')` → `onGameEnd('draw')`.

### Step 3.5: Fix Chess P2P game_over handler
**File:** `components/ChessGame.tsx` lines 349-361

In `handleGameOver` for P2P, add `onGameEnd` calls:
```javascript
const handleGameOver = (data) => {
    setIsGameOver(true);
    if (data.winner === user.id) onGameEnd('win');
    else if (data.winner === null) onGameEnd('draw');
    else onGameEnd('loss');
};
```

### Step 3.6: Fix Ludo `MAX_STEP = 57`
**File:** `server/ludoLogic.js` line 6

Change `MAX_STEP = 56` → `MAX_STEP = 57`.

Also add a step upper-bound check in `server.js` Ludo MOVE_PIECE validation:
```javascript
const outOfBounds = action.pieces.some(p => {
    if (p.owner !== userId) return false;
    if (p.step > 56 && !p.finished) return true;
    if (p.step < -1) return true;
    return false;
});
if (outOfBounds) {
    console.warn(`[Ludo][${roomId}] Piece out of bounds from ${userId}. Rejected.`);
    return;
}
```

### Step 3.7: Fix Ludo capture rejection in server teleportation check
**File:** `server.js` lines 2813-2823

Add capture exemption for opponent pieces going home:
```javascript
const movedIllegally = action.pieces.some((p, i) => {
    const prev = prevPieces[i];
    if (p.owner !== userId) {
        if (p.step === -1 && prev.step >= 0) return false; // capture is legal
        return p.step !== prev.step;
    }
    return false;
});
```

### Step 3.8: Fix Ludo path-blocking check (overly aggressive)
**File:** `server.js` lines 2855-2872

Replace with a step-delta check that only validates the path the piece is actually traversing, not the full track from start:
```javascript
const moverPiece = action.pieces.find(p => p.id === action.pieceId);
if (moverPiece && moverPiece.step >= 0 && moverPiece.step < 57) {
    const pieceFrom = prevPieces.find(p => p.id === action.pieceId);
    if (pieceFrom && pieceFrom.step >= 0) {
        const startStep = (moverPiece.color === 'Red') ? 0 : 28;
        const fromRel = (pieceFrom.step - startStep + 57) % 57;
        const toRel = (moverPiece.step - startStep + 57) % 57;
        const prevOppPieces = prevPieces.filter(p => p.color !== moverPiece.color && p.step >= 0 && p.step < 52);
        const blocked = prevOppPieces.some(opp => {
            const oppRel = (opp.step - startStep + 57) % 57;
            if (fromRel < toRel) return oppRel > fromRel && oppRel < toRel;
            return oppRel > fromRel || oppRel < toRel;
        });
        if (blocked) {
            console.warn(`[Ludo][${roomId}] Piece jumped over opponent from ${userId}. Rejected.`);
            return;
        }
    }
}
```

### Step 3.9: Add Ludo step bounds check
**File:** `server.js` (after the movedTooFar check, combined with Step 3.6)

### Step 3.10: Add Pool group assignment persistence
**Files:** `components/PoolGame.tsx`, `server.js`

Client: When groups are assigned in PoolGame.tsx (after first pocket post-break), emit `GROUP_ASSIGN` action via `socket.emit('game_action', ...)` with `myGroupP1` and `myGroupP2`.

Server: Add `GROUP_ASSIGN` handler in the `game_action` switch:
```javascript
if (action.type === 'GROUP_ASSIGN') {
    if (!room.players.includes(userId)) return;
    room.gameState.myGroupP1 = action.myGroupP1;
    room.gameState.myGroupP2 = action.myGroupP2;
    io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
    return;
}
```

Client: On reconnect/game_update, rehydrate group state from `room.gameState.myGroupP1/myGroupP2`.

### Step 3.11: Add Chess timer validation on server
**File:** `server.js` Chess MOVE handler

After PGN validation succeeds, validate timers:
```javascript
if (action.newState.timers) {
    const maxTime = 1800;
    for (const [pid, t] of Object.entries(action.newState.timers)) {
        if (!room.players.includes(pid)) continue;
        if (typeof t !== 'number' || t < 0 || t > maxTime) {
            console.warn(`[Chess][${roomId}] Invalid timer from ${userId}: ${pid}=${t}`);
            return;
        }
        const prevTime = room.gameState.timers?.[pid];
        if (prevTime !== undefined && t > prevTime + 3) {
            console.warn(`[Chess][${roomId}] Timer increased suspiciously: ${pid} ${prevTime}->${t}`);
            return;
        }
    }
}
```

Allow +3 seconds tolerance for network latency.

### Step 3.12: Replace `Math.random()` with `crypto.randomInt()` in tournament shuffle
**File:** `server.js` line 772

Replace:
```javascript
const j = Math.floor(Math.random() * (i + 1));
```
With:
```javascript
const j = crypto.randomInt(i + 1);
```

### Step 3.13: Stabilize `onGameEnd` in ChessGame with useRef
**File:** `components/ChessGame.tsx`

Add:
```javascript
const onGameEndRef = useRef(onGameEnd);
onGameEndRef.current = onGameEnd;
```
Replace all `onGameEnd(...)` calls inside effects and callbacks with `onGameEndRef.current(...)`.

### Step 3.14: Fix PGN race condition in Chess P2P
**File:** `components/ChessGame.tsx` lines 324-346

Only apply PGN updates if the incoming PGN is strictly longer than current:
```javascript
if (gs.pgn && gs.pgn.length > game.pgn().length) {
    // apply update
}
```

### Step 3.15: Cache Chess instance on room state for server validation
**File:** `server.js` Chess MOVE handler

Instead of creating a new `Chess()` and replaying full PGN on every move, cache the instance:
```javascript
if (!room.gameState._chessInstance) {
    room.gameState._chessInstance = new Chess();
    if (room.gameState.pgn) room.gameState._chessInstance.loadPgn(room.gameState.pgn);
}
const serverGame = room.gameState._chessInstance;
const moveResult = serverGame.move({ from, to, promotion });
```

After successful move, update `room.gameState.pgn = serverGame.pgn()` and `room.gameState.fen = serverGame.fen()`.

---

## Phase 4 — Security & Infrastructure Hardening

### Step 4.1: Add Firestore composite index for disputes and idempotency
The dispute query `where('roomId', '==', ...).where('filedBy', '==', ...)` requires a composite index. Create `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "disputes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "roomId", "order": "ASCENDING" },
        { "fieldPath": "filedBy", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Deploy with `firebase deploy --only firestore:indexes`. Wait for index build to complete before relying on it.

### Step 4.2: Add referral validation on server
**Files:** `server.js`, `services/firebase/users.ts`

On the server, when processing referral bonuses (the referral reward path at line ~390), add validation:
1. Referrer must not equal referee (no self-referral).
2. Referrer must exist in `users` collection.
3. Referrer's `referredBy` must not point back to the referee (no circular chains).

Additionally, in `users.ts` line 29-31, validate `storedReferral` server-side. The current code trusts client-side `sessionStorage` — an attacker can set any referral ID. Move referral processing to a Cloud Function triggered on user creation, or add server-side validation in the user sync endpoint.

### Step 4.3: Fix `connectionsByIP` behind Railway proxy
**File:** `server.js` lines 168-169

Replace:
```javascript
const ip = socket.handshake.address;
```
With:
```javascript
const ip = (socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket.handshake.address;
```

### Step 4.4: Remove Tailwind CDN from CSP `scriptSrc`
**File:** `server.js` line 97

Replace:
```javascript
scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
```
With:
```javascript
scriptSrc: ["'self'", "'unsafe-inline'"],
```

If Tailwind CSS is built locally (it should be — the project uses `tailwind.config.ts`), the CDN is unnecessary. Remove it to prevent supply-chain attacks.

### Step 4.5: Fix `findOrCreateMatch` race condition
**File:** `services/firebase/games.ts` lines 10-47

Replace query-then-write with a Firestore transaction:
```javascript
const docRef = await db.runTransaction(async (transaction) => {
    const q = query(gamesRef, where('gameType', '==', gameType), where('stake', '==', stake), where('status', '==', 'waiting'), limit(1));
    const snapshot = await transaction.get(q);
    if (!snapshot.empty) {
        const gameDoc = snapshot.docs[0];
        if (gameDoc.data().host.id !== user.id) {
            transaction.update(doc(db, 'games', gameDoc.id), { status: 'active', guest: {...}, players: [...], updatedAt: serverTimestamp() });
            return gameDoc.id;
        }
    }
    const newDocRef = doc(collection(db, 'games'));
    transaction.set(newDocRef, { gameType, stake, status: 'waiting', host: {...}, players: [user.id], createdAt: serverTimestamp(), turn: user.id, gameState: {} });
    return newDocRef.id;
});
return docRef;
```

### Step 4.6: Await Firestore writes in match logic
**File:** `services/firebase/games.ts`

All `updateDoc` and `setDoc` calls in `findOrCreateMatch` and `createBotMatch` should be awaited, not fire-and-forget, to detect failures.

---

## Phase 5 — Architecture: Reconcile Dead/Duplicate Logic Modules

### Step 5.1: Diff and reconcile `server/checkersLogic.js` with inline Checkers validation
Compare the exported functions in `server/checkersLogic.js` with the inline Checkers validation in `server.js`. If the module is identical or a subset, keep it and import it. If it's outdated or has different rules, update it to match the inline code, then import it in `server.js`.

### Step 5.2: Diff and reconcile `server/diceLogic.js` with inline Dice validation
`diceLogic.js` uses different scoring rules (awarding points only on roll === 6 or roll === 1) than the inline server code (compares sums). Update `diceLogic.js` to match the server's actual rules, then import it. Update `tests/diceLogic.test.js` to match.

### Step 5.3: Verify `server/chessLogic.js` matches inline Chess validation
`chessLogic.js` is already imported (line 12). Verify it matches the inline validation. Merge any additional inline checks into the module.

### Step 5.4: Update `server/ludoLogic.js` with MAX_STEP=57 and reconcile
`ludoLogic.js` is already imported (line 14). Update `MAX_STEP` to 57 (Step 3.6). Verify other constants and functions match the inline code. Ensure `canLudoMove`, `isLudoPathBlocked` are used in the server handler, not bypassed by inline code.

### Step 5.5: Verify `server/tictactoeLogic.js` matches inline TicTacToe validation
Verify the module matches inline code. Update as needed.

### Step 5.6: Delete `server/routes/pay.js` and `server/routes/admin.js`
After Steps 2.2-2.5 have created server endpoints for all functionality these modules attempted (but failed) to provide, delete them. They are never imported or registered.

### Step 5.7: Verify `server/routes/tournaments.js` registration status
If this file's `registerTournamentRoutes` function is never called in `server.js`, delete it. The tournament logic in `server.js` lines 526+ is the active code.

---

## Phase 6 — Room Recovery & Server Resilience

### Step 6.1: Fix hydration timing — hydrate rooms BEFORE accepting connections
**File:** `server.js` line 1543

Replace:
```javascript
setTimeout(() => hydrateRoomsFromFirestore(), 5000);
```
With async server startup:
```javascript
async function startServer() {
    await hydrateRoomsFromFirestore();
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
```

This ensures rooms are restored before any client can connect and create duplicate rooms.

### Step 6.2: Handle `userSockets` restoration after hydration
**File:** `server.js`

In `join_game`, before creating a new room, check if a hydrated room already exists for this user:
```javascript
for (const [existingRoomId, existingRoom] of rooms.entries()) {
    if (existingRoom.players.includes(userId) && existingRoom.status === 'active') {
        socket.join(existingRoomId);
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);
        socket.emit('game_update', sanitizeRoomForClient(existingRoom, existingRoomId));
        return;
    }
}
```

### Step 6.3: Add graceful shutdown with room persistence
**File:** `server.js` lines 3046-3092

Before closing rooms on SIGTERM, persist all active rooms:
```javascript
const gracefulShutdown = async (signal) => {
    console.log(`[Shutdown] ${signal} received, persisting rooms...`);
    for (const [roomId, room] of rooms.entries()) {
        if (room.status === 'active') {
            await persistRoomToFirestore(roomId, room);
        }
    }
    // ... existing room teardown ...
    server.close();
    process.exit(0);
};
```

### Step 6.4: Add 20-round maximum to Dice games (infinite loop prevention)
**Files:** `server.js` Dice handler, `components/DiceGame.tsx`

On the server, after each scored round, check a round counter. If round > 20, call `endGame(roomId, null, 'Draw')`.

On the client, when `round > 20`, show a draw result.

---

## Phase 7 — Verification & Testing

### Step 7.1: Integration tests for Phase 0
- Test: negative amount withdrawal is rejected
- Test: positive amount withdrawal succeeds
- Test: Fapshi timeout returns 504
- Test: CSP header contains FRONTEND_URL but not `*`

### Step 7.2: Integration tests for Phase 1 (Socket.IO auth)
- Test: connect without token in `enforce` mode → rejected
- Test: connect with valid token → accepted, `socket.user.uid` populated
- Test: connect with expired token → rejected
- Test: `refresh_token` resets expiry timer

### Step 7.3: Integration tests for Phase 2 (broken Firestore writes)
- Test: `/api/tournaments/match-activate` returns 403 for non-player
- Test: `/api/tournaments/match-activate` sets status to 'active'
- Test: deposit crediting works via `/api/pay/status/:transId` without client-side fallback

### Step 7.4: Unit tests for game logic fixes
- Test: Ludo piece at step 51 with dice 6 → step 57, finished=true (accepted)
- Test: Ludo capture sends opponent piece home (accepted)
- Test: Ludo path blocking correctly identifies blocking positions
- Test: Pool group assignment persists across game updates
- Test: Chess timer validation rejects spoofed values
- Test: Chess draw result triggers `onGameEnd('draw')`
- Test: Checkers draw result triggers `onGameEnd('draw')`
- Test: TicTacToe 3-draw streak triggers `onGameEnd('draw')`

### Step 7.5: Smoke test deployment sequence
1. Deploy Phase 0 server changes with `SOCKET_AUTH=off`
2. Monitor error logs for 1 hour
3. Deploy Phase 1 server changes with `SOCKET_AUTH=log`
4. Deploy Phase 1 client changes
5. Monitor for 24 hours — all sockets should have valid tokens
6. Switch `SOCKET_AUTH=enforce`
7. Monitor for 24 hours — no disconnections from auth failures

---

## Implementation Order & Dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
  │             │           │           │           │           │           │
  │             │           │           │           │           │        Step 6.1
  │             │           │           │           │        Step 5.6    depends on
  │             │           │           │           │        (delete      Phase 4
  │             │           │           │           │        routes)     done
  │          Step 1.4     Step 2.2    Step 3.6    Step 4.5
  │          (client     (remove     (ludoLogic  (findOrCreate
  │           token)     creditDep)  .js MAX)    Match race)
  │             │           │           │
  │          Step 1.6     Step 2.3    Step 3.7
  │          (deploy     (tourn.      (ludo capture
  │           sequence)   match API)  fix)
  │
  Step 0.3
  (rotate keys)
```

- Phase 0 is server-only, deploys immediately with zero client coordination.
- Phase 1 requires coordinated server + client deploy, with a gate (`SOCKET_AUTH` env flag).
- Phase 2 requires client changes (replace Firestore writes with API calls).
- Phase 3 is pure bug fixes, can proceed in parallel with Phase 2.
- Phase 4 requires some server + some client changes.
- Phase 5 is refactoring, best done after Phase 3 game logic is stable.
- Phase 6 depends on Phase 5 being complete (no more game logic changes).

---

## Rollback Procedures

| Phase | Rollback |
|-------|----------|
| Phase 0 | Revert commit, redeploy. No data migration needed. |
| Phase 1 | Set `SOCKET_AUTH=off` in Railway env vars, redeploy server. Client continues working (token is sent but ignored). |
| Phase 2 | Revert client changes. Server endpoints remain (no harm). Client falls back to broken Firestore writes (same as before). |
| Phase 3 | Revert per-game fix. Each fix is independent and can be rolled back individually. |
| Phase 4 | Revert individual fixes. Security hardening changes are additive. |
| Phase 5 | Keep modules, delete imports, restore inline code from git. |
| Phase 6 | Remove async startup, restore `setTimeout`. Remove room-check-before-create logic. |

---

## Summary of All Fixes

| ID | Fix | Phase | Files Modified | Risk |
|----|-----|-------|---------------|------|
| 0.1 | Positive-amount validation | 0 | server.js | Very Low |
| 0.2 | Fapshi fetch timeout (AbortController) | 0 | server.js | Low |
| 0.3 | Rotate withdrawal keys, remove from .env | 0 | .env, server.js | Low |
| 0.4 | CSP connectSrc safe fallback | 0 | server.js | Very Low |
| 0.5 | Bound in-memory Maps | 0 | server.js | Low |
| 0.6 | Admin socket room targeting | 0 | server.js | Low |
| 1.1 | Socket.IO auth middleware (tri-mode) | 1 | server.js | Medium |
| 1.2 | Replace client-declared userId | 1 | server.js | Medium |
| 1.3 | Client passes ID token on connection | 1 | SocketContext.tsx | Medium |
| 1.4 | onIdTokenChanged refresh | 1 | SocketContext.tsx | Medium |
| 1.5 | Auth caching for transport upgrade | 1 | server.js | Low |
| 1.6 | Auth deployment sequence | 1 | (ops) | Medium |
| 2.1 | Verify call sites before deletion | 2 | (search only) | N/A |
| 2.2 | Remove creditDepositIdempotent fallback | 2 | Finance.tsx, server.js | Medium |
| 2.3 | Server endpoint: match-activate | 2 | server.js, useGameController.ts, SocketContext.tsx | Medium |
| 2.4 | Server endpoint: tournament status update | 2 | server.js, AdminDashboard.tsx | Medium |
| 2.5 | Server endpoint: match result report | 2 | server.js, App.tsx, SocketContext.tsx | Medium |
| 2.6 | Delete unused addUserTransaction | 2 | finance.ts, firebase.ts | Very Low |
| 2.7 | Delete dead route modules | 2 | routes/pay.js, routes/admin.js | Very Low |
| 3.1 | Draw type in onGameEnd signatures | 3 | 6 component files | Very Low |
| 3.2 | Chess draw → onGameEnd('draw') | 3 | ChessGame.tsx | Very Low |
| 3.3 | Checkers draw → onGameEnd('draw') | 3 | CheckersGame.tsx | Very Low |
| 3.4 | TicTacToe draw → onGameEnd('draw') | 3 | TicTacToeGame.tsx | Very Low |
| 3.5 | Chess P2P game_over handler | 3 | ChessGame.tsx | Medium |
| 3.6 | Ludo MAX_STEP = 57 | 3 | ludoLogic.js, server.js | Low |
| 3.7 | Ludo capture exemption | 3 | server.js | Medium |
| 3.8 | Ludo path-blocking fix | 3 | server.js | Medium |
| 3.9 | Ludo step bounds check | 3 | server.js | Low |
| 3.10 | Pool group assignment persistence | 3 | PoolGame.tsx, server.js | High |
| 3.11 | Chess timer validation | 3 | server.js | Medium |
| 3.12 | Tournament crypto shuffle | 3 | server.js | Very Low |
| 3.13 | Chess onGameEnd useRef stabilization | 3 | ChessGame.tsx | Low |
| 3.14 | Chess PGN race guard | 3 | ChessGame.tsx | Low |
| 3.15 | Chess PGN cache on room state | 3 | server.js | Medium |
| 4.1 | Dispute idempotency + Firestore index | 4 | server.js, firestore.indexes.json | Low |
| 4.2 | Server-side referral validation | 4 | server.js | Medium |
| 4.3 | Fix connectionsByIP behind proxy | 4 | server.js | Low |
| 4.4 | Remove Tailwind CDN from CSP | 4 | server.js | Low |
| 4.5 | findOrCreateMatch transaction | 4 | games.ts | Medium |
| 4.6 | Await Firestore writes in match logic | 4 | games.ts | Low |
| 5.1-5.5 | Reconcile logic modules | 5 | server/*.js, server.js | Medium |
| 5.6 | Delete dead route modules | 5 | routes/*.js | Very Low |
| 5.7 | Verify tournaments.js registration | 5 | routes/tournaments.js | Very Low |
| 6.1 | Hydrate rooms before listening | 6 | server.js | High |
| 6.2 | Rejoin existing hydrated rooms | 6 | server.js | High |
| 6.3 | Graceful shutdown with persistence | 6 | server.js | Medium |
| 6.4 | Dice 20-round maximum | 6 | server.js, DiceGame.tsx | Low |

**Total estimated effort:** 40-55 hours across all phases.