# Implementation Plan — Game Bug Fixes

## Priority Legend
- **P0**: Financial/data integrity bug — real-money impact
- **P1**: Gameplay-breaking bug — game doesn't work or can be cheated
- **P2**: Logic error — operates but produces wrong result
- **P3**: Code quality / hardening

---

## Sprint 1: P0 — Financial Integrity (Draw/Refund Bugs)

### Fix 1.1: Chess bot draws call `onGameEnd('quit')` instead of `onGameEnd('draw')`
**File:** `components/ChessGame.tsx` line 412  
**Bug:** `if (!currentIsP2P) onGameEnd('quit')` in the draw branch (else clause of `isCheckmate`). In a real-money game, `'quit'` means forfeit, so both players lose their stake. A draw should refund both via `'draw'`.  
**Fix:** Change `onGameEnd('quit')` → `onGameEnd('draw')` on line 412.

### Fix 1.2: Checkers draw calls `onGameEnd('quit')` instead of `onGameEnd('draw')`
**File:** `components/CheckersGame.tsx` line 285  
**Bug:** `else onGameEnd('quit')` for the case where the Lidraughts API returns neither 'white' nor 'black' as winner (i.e., draw).  
**Fix:** Change `onGameEnd('quit')` → `onGameEnd('draw')`.

### Fix 1.3: TicTacToe 3-draw streak calls `onGameEnd('quit')` instead of `onGameEnd('draw')`
**File:** `components/TicTacToeGame.tsx` line 216  
**Bug:** When 3 consecutive draws happen in a bot game, `onGameEnd('quit')` fires, treating it as a forfeit.  
**Fix:** Change `onGameEnd('quit')` → `onGameEnd('draw')`.

### Fix 1.4: Update all component `onGameEnd` type signatures to include `'draw'`
**Files:**
- `components/ChessGame.tsx` line 16: `'win' | 'loss' | 'quit'` → `'win' | 'loss' | 'quit' | 'draw'`
- `components/CheckersGame.tsx` line 19: same
- `components/DiceGame.tsx` line 17: same
- `components/TicTacToeGame.tsx` line 14: same
- `components/PoolGame.tsx` line 26: same
- `components/GameRoom.tsx` line 13: same

**Note:** `AppContext.tsx` line 24 and `useGameController.ts` line 96 already accept `'draw'`. `GameResultOverlay.tsx` already renders draw UI. `SocketContext.tsx` line 189 already dispatches `'draw'` results from server. Server `endGame()` line 1660-1666 already refunds escrows on `winnerId === null` (draw). **Only the game component types and the draw-branch calls need fixing.**

### Fix 1.5: Verify server `endGame` draw path refunds correctly
**File:** `server.js` lines 1658-1667  
**Status:** Already correct. When `winnerId === null && room.stake > 0`, both players' escrow splits are refunded via `refundEscrow()`. No changes needed.

---

## Sprint 2: P1 — Ludo Server Validation Bugs

### Fix 2.1: `MAX_STEP = 56` should be `57` (server rejects valid finish moves)
**File:** `server/ludoLogic.js` line 6  
**Bug:** `MAX_STEP = 56` but client uses `GOAL_STEP = 57`. The `canMove()` function returns `false` when `piece.step + diceValue > 56`, meaning a piece at step 51 with a roll of 6 would compute `51 + 6 = 57 > 56` and be rejected. The client allows this move (57 ≤ 57). This means finish moves are blocked by the `canLudoMove` server validation.  
**Note:** The inline server validation in `server.js` (lines 2840-2852) checks `stepDiff > diceValue` but does NOT check against a max step bound, so `canLudoMove` is likely not called during Ludo validation. However, the constant is still wrong and will cause bugs if `canLudoMove` is ever used.  
**Fix:** Change `MAX_STEP = 56` → `MAX_STEP = 57` in `server/ludoLogic.js`. Also add a step upper-bound check in `server.js` Ludo MOVE_PIECE validation.

### Fix 2.2: Server Ludo validation rejects captures (opponent pieces going home)
**File:** `server.js` lines 2813-2823  
**Bug:** The teleportation check:
```javascript
const movedIllegally = action.pieces.some((p, i) => {
    const prev = prevPieces[i];
    if (p.owner !== userId) return p.step !== prev.step;
    return false;
});
```
When a player captures an opponent piece, the opponent's piece goes from `step: X` to `step: -1` (home). The check flags this as illegal because `p.step !== prev.step` for opponent pieces. **This means every Ludo P2P capture is rejected by the server.**  
**Fix:** Allow opponent pieces to change step only to HOME (-1):
```javascript
const movedIllegally = action.pieces.some((p, i) => {
    const prev = prevPieces[i];
    if (p.owner !== userId) {
        // Opponent pieces can only go to home (captured) — not move forward
        if (p.step === -1 && prev.step >= 0) return false; // capture is legal
        return p.step !== prev.step;
    }
    return false;
});
```

### Fix 2.3: Server Ludo path-blocking check is overly aggressive
**File:** `server.js` lines 2855-2872  
**Bug:** The path-blocking validation iterates from `startStep` (0 for Red, 28 for Blue) all the way to the mover's current position, checking if ANY opponent piece is on ANY step in that range. This incorrectly blocks moves where the piece has already passed the opponent — it only needs to check if the path from the mover's **previous** step to the **new** step is blocked.  
Additionally, the check uses `pathSteps` from start to current position, which means a Red piece at step 40 with an opponent at step 5 would be blocked from moving to step 42, even though the piece already passed step 5 forty moves ago.  
**Fix:** Replace with a step-delta check that only validates the path the piece is actually traversing:
```javascript
const moverPiece = action.pieces.find(p => p.id === action.pieceId);
if (moverPiece && moverPiece.step >= 0 && moverPiece.step < 57) {
    const pieceFrom = prevPieces.find(p => p.id === action.pieceId);
    if (pieceFrom && pieceFrom.step >= 0) {
        const startStep = (moverPiece.color === 'Red') ? 0 : 28;
        const fromRel = (pieceFrom.step - startStep + 57) % 57;
        const toRel = (moverPiece.step - startStep + 57) % 57;
        // Check if any opponent piece is on a step between fromRel and toRel (exclusive)
        const prevOppPieces = prevPieces.filter(p => p.color !== moverPiece.color && p.step >= 0 && p.step < 52);
        const blocked = prevOppPieces.some(opp => {
            const oppRel = (opp.step - startStep + 57) % 57;
            if (fromRel < toRel) return oppRel > fromRel && oppRel < toRel;
            // Wrap-around path: check both segments
            return oppRel > fromRel || oppRel < toRel;
        });
        if (blocked) {
            console.warn(`[Ludo][${roomId}] Piece jumped over opponent from ${userId}. Rejected.`);
            return;
        }
    }
}
```

### Fix 2.4: Server Ludo validation has no upper-bound step check
**File:** `server.js` lines 2840-2852  
**Bug:** The `movedTooFar` check only validates `stepDiff > diceVal`, not whether the final step exceeds the track length. A piece at step 55 with dice 6 could move to step 61, which is impossible (track is 57 cells).  
**Fix:** Add step-bound check after `movedTooFar`:
```javascript
const outOfBounds = action.pieces.some(p => {
    if (p.owner !== userId) return false;
    if (p.step > 56 && !p.finished) return true; // step 57 = finished, >57 = invalid
    if (p.step < -1) return true;
    return false;
});
if (outOfBounds) {
    console.warn(`[Ludo][${roomId}] Piece out of bounds from ${userId}. Rejected.`);
    return;
}
```

---

## Sprint 3: P1 — Pool Group Assignment Not Persisted

### Fix 3.1: Pool `myGroupP1`/`myGroupP2` never sent to server
**Files:** `components/PoolGame.tsx`, `server.js`  
**Bug:** The client tracks `myGroupP1` state (line 53) and `next[turn].group` assignments (lines 258-267) but NEVER includes `myGroupP1` or `myGroupP2` in any `game_action` payload. The server reads `room.gameState.myGroupP1` and `room.gameState.myGroupP2` for win validation (lines 2614, 2694), but these are always `undefined`. This means:
- The early-8-ball loss detection (lines 2686-2712) always skips the group-cleared check because `winnerGrp` is always `undefined`/falsy
- A player can pocket the 8-ball without clearing their group and still win

**Fix:** When groups are assigned in PoolGame.tsx (lines 258-267), emit a `game_action` with `myGroupP1` and `myGroupP2`:
```javascript
// In PoolGame.tsx, after group assignment:
if (next[turn].group === null && (solids > 0 || stripes > 0)) {
    // ... existing group logic ...
    if (socket) {
        socket.emit('game_action', {
            roomId: table.id,
            action: {
                type: 'GROUP_ASSIGN',
                myGroupP1: next[0].group,
                myGroupP2: next[1].group
            }
        });
    }
}
```

In `server.js`, handle `GROUP_ASSIGN`:
```javascript
if (action.type === 'GROUP_ASSIGN') {
    if (!room.players.includes(userId)) return;
    room.gameState.myGroupP1 = action.myGroupP1;
    room.gameState.myGroupP2 = action.myGroupP2;
    io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
    return;
}
```

And in the Pool `game_update` handler, send group assignments to P2P clients:
```javascript
// When receiving game_update for Pool, rehydrate group state:
if (room.gameState.myGroupP1 && !myGroupP1) {
    setMyGroupP1(/* based on which player we are */);
}
```

---

## Sprint 4: P1 — Chess Timer Cheating Vector

### Fix 4.1: Server does not validate timer values in Chess MOVE payloads
**File:** `server.js` ~lines 2550-2543 (inside action.newState handler for Chess)  
**Bug:** The client sends arbitrary `timers` in the MOVE payload:
```javascript
timers: {
    [user.id]: incrementedTime,
    [opponentId]: opponentTime
}
```
The server stores these directly with NO validation. A cheating client can:
1. Give themselves more time than they actually have
2. Set opponent's time to 0 (instant timeout win)
3. Bypass the 1800-second cap (30 min limit)

**Fix:** After the PGN validation succeeds and before applying `newState`, validate timers:
```javascript
if (action.newState.timers) {
    const maxTime = 1800; // 30 min cap
    for (const [pid, t] of Object.entries(action.newState.timers)) {
        if (!room.players.includes(pid)) continue;
        if (typeof t !== 'number' || t < 0 || t > maxTime) {
            console.warn(`[Chess][${roomId}] Invalid timer from ${userId}: ${pid}=${t}. Rejected.`);
            return;
        }
        // Timer must not INCREASE (except increment, which is handled separately)
        const prevTime = room.gameState.timers?.[pid];
        if (prevTime !== undefined && t > prevTime + TIMER_INCREMENT + 1) {
            // Allow +TIMER_INCREMENT+1 seconds of tolerance for latency
            console.warn(`[Chess][${roomId}] Timer increased suspiciously from ${userId}: ${pid} ${prevTime}->${t}. Rejected.`);
            return;
        }
    }
}
```

### Fix 4.2: Chess P2P game_over handler doesn't call `onGameEnd` for local state
**File:** `components/ChessGame.tsx` lines 349-361  
**Bug:** The local `handleGameOver` socket listener only does `setIsGameOver(true)` for P2P games, relying on SocketContext's global `SET_GAME_RESULT` dispatch. However, `setIsGameOver(true)` is needed to stop timers and disable the board. The current code is actually correct for the result dispatch — SocketContext handles it. But there's a subtle bug: when a P2P game ends via `game_over`, the Chess component's `checkGameOver` effect (which depends on `[onGameEnd]`) may ALSO fire and attempt to call `onGameEnd('loss')` or `onGameEnd('win')` based on the game state at that moment, potentially double-dispatching.  
**Status:** NOT A BUG — the `isGameOver` state prevents `checkGameOver` from re-triggering, and `useGameController`'s `isTransitioningRef` prevents double dispatch. No change needed.

---

## Sprint 5: P2 — Chess PGN Race Condition & Stabilization

### Fix 5.1: Stabilize `onGameEnd` dependency in ChessGame with useRef
**File:** `components/ChessGame.tsx` line 415  
**Bug:** `checkGameOver` depends on `[onGameEnd]`, which is recreated on every render in most parent components, causing unnecessary re-renders of the entire chess board.  
**Fix:** Use a ref pattern:
```javascript
const onGameEndRef = useRef(onGameEnd);
onGameEndRef.current = onGameEnd;
// Inside checkGameOver and other callbacks, use onGameEndRef.current instead of onGameEnd
```

### Fix 5.2: PGN update race condition — apply only if longer
**File:** `components/ChessGame.tsx` lines 324-346  
**Bug:** When two rapid P2P socket updates arrive, the second `setGame(newGame)` can overwrite the first if the first hasn't been committed yet. The `wasLatest` check (line 324) uses the old `game.history().length`, which can be stale.  
**Fix:** In the `socketGame` update effect, only apply the PGN if it's strictly longer than the current game:
```javascript
if (gs.pgn && gs.pgn.length > game.pgn().length) {
    // ... apply the update
}
```

---

## Sprint 6: P1 — Tournament Shuffle Uses `Math.random()`

### Fix 6.1: Replace `Math.random()` with `crypto.randomInt()` in tournament bracket shuffling
**File:** `server.js` line 772  
**Bug:** `const j = Math.floor(Math.random() * (i + 1));` — `Math.random()` is not cryptographically secure. In a real-money tournament, a knowledgeable attacker could predict or influence the bracket order.  
**Fix:** Replace with `crypto.randomInt()`:
```javascript
const j = crypto.randomInt(i + 1);
```
`crypto` is already imported and used elsewhere in `server.js` (line 2790 for dice rolls).

---

## Sprint 7: P2 — Checkers/Lidraughts Draw Handling

### Fix 7.1: Checkers Lidraughts API draw handling
**File:** `components/CheckersGame.tsx` lines 283-285  
**Bug:** The Lidraughts status check returns `status: 'draw'` with no `winner` field, so the `if/else if/else` chain falls through to `else onGameEnd('quit')`.  
**Fix:** After checking for winner, add an explicit draw check:
```javascript
if (data.winner === 'white') onGameEnd('win');
else if (data.winner === 'black') onGameEnd('loss');
else onGameEnd('draw'); // draw or unknown
```

Wait — this is identical to Fix 1.2 above. Confirmed.

### Fix 7.2: Checkers bot no-moves detection calls `onGameEnd('win')`
**File:** `components/CheckersGame.tsx` line 606  
**Bug:** When the bot has no moves, `onGameEnd('win')` is called. This is correct for checkmate/stalemate-where-opponent-is-blocking. In standard checkers, having no moves IS a loss for the player who can't move. But in international draughts, this could be a draw depending on rules. Platform decision needed — keeping as `'win'` for now.

### Fix 7.3: Checkers P2P `game_over` event doesn't handle draw
**File:** `components/CheckersGame.tsx` lines 258-260  
**Current code:**
```javascript
// SocketContext handles global SET_GAME_RESULT for P2P
```
**Status:** Correct — P2P draws are handled by SocketContext which correctly dispatches `'draw'` when `winner === null`.

---

## Sprint 8: P2 — TicTacToe Draw Streak Logic

### Fix 8.1: TicTacToe 3-draw-streak calls `onGameEnd('quit')`
**File:** `components/TicTacToeGame.tsx` line 216  
**Bug:** After 3 consecutive draws in bot mode, the game ends with `onGameEnd('quit')`. Three draws should result in a draw outcome, not a forfeit.  
**Fix:** Change `onGameEnd('quit')` → `onGameEnd('draw')`. (Already captured in Fix 1.3.)

### Fix 8.2: TicTacToe P2P draw detection
**File:** `components/TicTacToeGame.tsx` lines 76-88  
**Current behavior:** When `socketGame.status === 'draw'`, the component sets `isDraw` true and plays a sound, but doesn't call `onGameEnd`. The server handles incrementing `drawCount` and emitting `game_over` with `winner: null` after 3 draws. SocketContext dispatches `SET_GAME_RESULT: { result: 'draw' }`.  
**Status:** This is correct for P2P — the server handles draw escalation.

---

## Sprint 9: P2 — DiceGame `onGameEnd` Type Signature

### Fix 9.1: DiceGame type signature missing `'draw'`
**File:** `components/DiceGame.tsx` line 17  
**Fix:** Add `'draw'` to the type union: `'win' | 'loss' | 'quit' | 'draw'`. (Captured in Fix 1.4.)

**Note:** DiceGame currently has no draw condition (games end when someone reaches 3 points). The type update is for consistency and future-proofing.

---

## Sprint 10: P3 — Code Quality & Hardening

### Fix 10.1: Chess bot `Math.random()` for move selection
**File:** `components/ChessGame.tsx` lines 167, 221-222  
**Bug:** Uses `Math.random()` for move selection. Not exploitable (bot plays against user), but inconsistent with server-side `crypto.randomInt()` usage.  
**Priority:** P3 — low impact. Can defer.

### Fix 10.2: Delete duplicate chess validation comment
**File:** `server.js` lines 2544-2545  
**Bug:** `// --- End chess validation ---` appears twice.  
**Fix:** Delete one.

### Fix 10.3: Chess forfeit emits before server confirmation (P2P)
**File:** `components/ChessGame.tsx` lines 593-598  
**Bug:** `handleQuit` calls `onGameEnd('quit')` immediately after emitting FORFEIT, without waiting for server `game_over`. If the socket is disconnected, the local state becomes inconsistent.  
**Fix:** For P2P mode, rely on SocketContext's `game_over` handler to dispatch the result:
```javascript
const handleQuit = () => {
    if (isP2P && socket) {
        socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
        // SocketContext will dispatch SET_GAME_RESULT on game_over
        // Still call onGameEnd locally for immediate UI feedback
    }
    onGameEnd('quit');
};
```
**Status:** This is actually acceptable behavior — forfeit should be immediate in the UI, and the server will confirm it. If disconnected, the server's `endGame` handles escrow correctly on reconnect. No change needed.

---

## Implementation Order

| Order | Fix | Sprint | Files | Risk | Test |
|-------|-----|--------|-------|------|------|
| 1 | 1.1-1.4 | Draw type + draw calls | 6 component files | Low | Bot draw in each game shows "Draw" overlay |
| 2 | 2.1 | Ludo MAX_STEP=57 | ludoLogic.js | Low | Ludo finish move accepted by server |
| 3 | 2.2 | Ludo capture exemption | server.js | Medium | P2P capture move accepted by server |
| 4 | 2.3 | Ludo path-block fix | server.js | Medium | P2P move past opponent allowed when no blocking |
| 5 | 2.4 | Ludo step bounds check | server.js | Low | Step > 57 rejected |
| 6 | 3.1 | Pool group persistence | PoolGame.tsx, server.js | High | P2P Pool group-cleared validation works |
| 7 | 4.1 | Chess timer validation | server.js | Medium | Invalid timer values rejected |
| 8 | 6.1 | Tournament crypto shuffle | server.js | Low | Tournament start logs show shuffled order |
| 9 | 5.1 | Chess onGameEnd stabilization | ChessGame.tsx | Low | Chess bot games render without flicker |
| 10 | 5.2 | Chess PGN race guard | ChessGame.tsx | Low | Rapid P2P moves don't overwrite each other |

---

## Risk Assessment

| Fix | Regression Risk | Mitigation |
|-----|----------------|------------|
| 1.1-1.4 (draw type) | Very low — additive change | Bot draw test per game |
| 2.2 (Ludo capture) | Medium — allows opponent step changes | Test P2P Ludo captures |
| 2.3 (Ludo path block) | Medium — changes blocking logic | Test P2P Ludo: moving past vs onto opponent |
| 3.1 (Pool groups) | High — new server action + client event | Test full P2P Pool game flow |
| 4.1 (Chess timer) | Medium — could reject valid moves with latency | Test with 1-2s tolerance |
| 6.1 (crypto shuffle) | Very low — drop-in replacement | Test tournament start |

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `components/ChessGame.tsx` | Draw call fix (1.1), type sig (1.4), onGameEnd ref (5.1), PGN guard (5.2) |
| `components/CheckersGame.tsx` | Draw call fix (1.2), type sig (1.4) |
| `components/TicTacToeGame.tsx` | Draw call fix (1.3), type sig (1.4) |
| `components/DiceGame.tsx` | Type sig (1.4 only — no draw condition exists) |
| `components/PoolGame.tsx` | Type sig (1.4), group emit (3.1) |
| `components/GameRoom.tsx` | Type sig (1.4 only) |
| `server/ludoLogic.js` | MAX_STEP=57 (2.1) |
| `server.js` | Ludo capture fix (2.2), path block fix (2.3), step bounds (2.4), Pool group handler (3.1), Chess timer validation (4.1), tournament crypto (6.1), duplicate comment delete (10.2) |
| `tests/chessLogic.test.js` | No changes needed (existing tests pass) |

**Total estimated effort:** 6-8 hours across all sprints.