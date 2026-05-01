# Chess Deep Audit & Fix Plan

## Audit Findings

### BUG 1: Draw Results in `onGameEnd('quit')` — FINANCIAL IMPACT
**File:** `ChessGame.tsx` line 412
**Problem:** When `checkGameOver` detects a draw (stalemate, threefold repetition,
insufficient material), it calls `onGameEnd('quit')` for bot games. The `onGameEnd`
type is `'win' | 'loss' | 'quit' | 'draw'` — the 'draw' variant exists but is NOT
used here. 'quit' is treated as a forfeit, meaning BOTH players lose their stake.

**Impact:** In a real-money game, a draw should refund both players. Calling 'quit'
causes the server's `endGame(roomId, null, reason)` to issue escrow refunds, but the
client-side `GameRoom.tsx` handler maps 'quit' to a loss result in the UI.

**Fix:** Change line 412 from `onGameEnd('quit')` to `onGameEnd('draw')`.

---

### BUG 2: P2P Game Over Not Handled (lines 338-344)
**File:** `ChessGame.tsx` lines 338-344
**Problem:** When a P2P game ends via socket, the `socketGame.winner` check at line 338
only calls `onGameEnd` if `!isP2P`. So for P2P games, when the server sends
`game_over` with a winner, the local game-over handler does nothing. The `handleGameOver`
effect (line 349) only calls `setIsGameOver(true)` but never calls `onGameEnd`.

**Impact:** P2P chess games never trigger the result screen. The player is stuck in
the game board after the game ends.

**Fix:** In the `handleGameOver` effect, resolve the winner and call `onGameEnd`:
```javascript
const handleGameOver = (data: any) => {
    setIsGameOver(true);
    if (data.winner === user.id) onGameEnd('win');
    else if (data.winner === null) onGameEnd('draw');
    else onGameEnd('loss');
};
```

---

### BUG 3: Timer Not Validated on Server — CHEATING VECTOR
**File:** `ChessGame.tsx` lines 449-468, `server.js` ~2525
**Problem:** The client sends arbitrary `timers` in the MOVE payload:
```javascript
timers: {
    [user.id]: incrementedTime,      // client claims this value
    [opponentId]: opponentTime       // client claims this value
}
```
The server stores this directly in `room.gameState.timers` with ZERO validation.
A cheating client can:
1. Claim more time than they actually have (infinite time exploit)
2. Set opponent time to 0 (instant win by timeout)
3. Bypass the 1800-second cap

**Fix:** In `server.js`, validate timers in the Chess MOVE handler:
```javascript
// After PGN validation succeeds and before applying newState:
if (action.newState.timers) {
    const maxTime = 1800;
    for (const [pid, t] of Object.entries(action.newState.timers)) {
        if (!room.players.includes(pid)) continue;
        if (typeof t !== 'number' || t < 0 || t > maxTime) {
            console.warn(`[Chess][${roomId}] Invalid timer from ${userId}: ${pid}=${t}. Rejected.`);
            return;
        }
    }
}
```

Additionally, add server-side timer enforcement:
1. Store `room.gameState.lastMoveTime = Date.now()` on every move.
2. On TIMEOUT_CLAIM, verify `Date.now() - room.gameState.lastMoveTime > requiredDuration`.
3. Decrement the server's authoritative timer by the elapsed seconds.

---

### BUG 4: PGN Reconstruction Race Condition
**File:** `ChessGame.tsx` lines 424-425
**Problem:** `const game = new Chess(); game.loadPgn(currentGame.pgn())` creates a new
instance from the PGN. If two rapid socket updates arrive, the second `loadPgn` can
overwrite the first. The `setGame(newGame)` at line 433 uses `newGame` which was
cloned from the PGN, but the `stateRef.current.game` could have been updated by a
concurrent socket event between the `loadPgn` and the `setGame`.

**Impact:** In fast-paced games, moves can be lost or duplicated.

**Fix:** Use a move queue or compare PGN lengths before applying:
```javascript
// Only apply if the incoming PGN is strictly longer than current
if (gs.pgn && gs.pgn.length > game.pgn().length) {
    try { ... } catch { ... }
}
```

---

### BUG 5: `viewIndex` Desync on P2P Update (line 324-326)
**File:** `ChessGame.tsx` lines 324-326
**Problem:** `wasLatest` is computed from the OLD `game.history().length` and the
previous `viewIndex`. When a P2P update arrives with a new PGN, `wasLatest` might be
wrong because `game` hasn't been updated yet.

**Fix:** Compute `wasLatest` after `setGame(newGame)` or use a ref to track the
previous move count.

---

### BUG 6: Bot Uses `Math.random()` Not `crypto`
**File:** `ChessGame.tsx` line 167, 221-222
**Problem:** `getBestMove` uses `Math.floor(Math.random() * moves.length)` for easy
mode and to break ties in medium/hard modes. `Math.random()` is not cryptographically
secure. For a real-money game, the bot's move selection should use `crypto.getRandomValues()`.

**Impact:** Low — the bot is playing against the user, so predicting the bot's move
doesn't give the user a financial advantage. But it's a best practice.

**Fix:** Replace `Math.floor(Math.random() * x)` with:
```javascript
const array = new Uint32Array(1);
crypto.getRandomValues(array);
const randomIndex = array[0] % x;
```

---

### BUG 7: No Castling Rights Validation
**File:** `server/chessLogic.js`, `server.js` lines 2501-2543
**Problem:** The server validates PGN move count and FEN consistency, but relies entirely
on `chess.js` for castling validation. While `chess.js` correctly validates castling rights
from the PGN/FEN, there is no explicit check that:
1. The king and rook haven't moved previously in the game
2. The king isn't castling through check
3. The path isn't blocked

However, **chess.js handles all of these correctly**, so this is not actually a bug.
The validation is sufficient because `chess.move()` rejects illegal castling.

**Status:** NOT A BUG — chess.js handles it correctly.

---

### BUG 8: No En Passant Falsification Check
**File:** `server/chessLogic.js`
**Problem:** A client could send a PGN that contains an en passant capture at a point
in the game where the opponent's pawn hasn't moved two squares. However, `chess.js`
validates this correctly — `chess.move()` will reject an en passant capture if the
opponent's last move wasn't a two-square pawn push.

**Status:** NOT A BUG — chess.js handles it correctly via PGN reconstruction.

---

### BUG 9: No Threefold Repetition Claim Mechanism
**File:** `ChessGame.tsx` line 411, `server.js`
**Problem:** `chess.isThreefoldRepetition()` is available in chess.js and the server
checks for it (line 2533: `clientGame.isGameOver()`), but the client doesn't provide a
way for players to CLAIM a draw by threefold repetition. In chess, threefold repetition
is a CLAIM, not an automatic draw. A player must explicitly offer/claim it.

**Impact:** In P2P games, the server auto-detects threefold as `isGameOver()` which
returns true after 3 repetitions. This is an automatic draw, which is the common
implementation for online chess. For a money game, this could be controversial if
a player deliberately avoids repetition to prolong the game.

**Status:** BEHAVIORAL DECISION — auto-detection is fine for this platform.

---

### BUG 10: No 50-Move Rule Enforcement
**File:** `server.js` line 2533
**Problem:** `clientGame.isGameOver()` includes `isInsufficientMaterial()` and
`isStalemate()` and `isDraw()`, which covers 50-move rule AND threefold repetition
AND stalemate AND insufficient material. This is correct behavior.

**Status:** NOT A BUG — all draw conditions are correctly detected.

---

### BUG 11: Forfeit Emits Before Server Confirmation
**File:** `ChessGame.tsx` lines 593-598
**Problem:** The forfit button handler:
```javascript
const handleQuit = () => {
    if (isP2P && socket) {
        socket.emit('game_action', { roomId: socketGame.roomId, action: { type: 'FORFEIT' } });
    }
    onGameEnd('quit');
};
```
The client calls `onGameEnd('quit')` immediately after emitting FORFEIT, without
waiting for the server's `game_over` confirmation. In P2P mode, this is fine because
the server WILL process the FORFEIT. But if the socket is disconnected, the FORFEIT
won't reach the server, and the local state becomes inconsistent.

**Fix:** For P2P, only call `onGameEnd('quit')` after receiving `game_over` from
the server. For bot games, it's fine to call immediately.

---

### BUG 12: Opponent Timer Continues During Disconnection Pause
**File:** `ChessGame.tsx` lines 363-397
**Problem:** When `opponentDisconnected` is true, the timer interval still runs. Line 367
checks `stateRef.current.opponentDisconnected` and returns early, but the interval
ITSELF is still active — it's just being skipped. When the opponent reconnects, all
the skipped decrements are NOT applied, so the opponent's timer hasn't actually
decremented during disconnection.

This is actually the CORRECT behavior — the timer pauses during disconnection.
However, there's a subtle bug: the player's OWN timer also checks `opponentDisconnected`
at line 367, but this only skips the decrement when it's the OPPONENT'S timer,
not the player's timer. So the player's timer continues to run during opponent
disconnection, which is correct.

**Status:** NOT A BUG — timer correctly pauses during disconnection.

---

### BUG 13: Timer Starts Immediately on Game Start
**File:** `ChessGame.tsx` lines 363-397
**Problem:** The timer `useEffect` starts counting down immediately when `isMyTurn`
becomes true, even before the opponent has connected. For P2P games, White's clock
starts ticking before Black has even seen the board.

**Fix:** Only start the timer after both players have connected. Add a `gameStarted`
state that's set to true after receiving the first `game_update`.

---

### BUG 14: `onGameEnd` Dependency Instability
**File:** `ChessGame.tsx` line 415
**Problem:** `checkGameOver` depends on `[onGameEnd]`. In most parent components,
`onGameEnd` is recreated on every render (it's an inline arrow function or a callback
from `GameRoom.tsx`). This causes `checkGameOver` to be recreated on every render,
which causes the `executeMove` callback to be recreated, which causes the entire
Chess component to re-render unnecessarily.

**Fix:** Stabilize `onGameEnd` in the parent component using `useCallback`, or
use a ref pattern in ChessGame.tsx:
```javascript
const onGameEndRef = useRef(onGameEnd);
onGameEndRef.current = onGameEnd;
// Use onGameEndRef.current inside callbacks instead of onGameEnd
```

---

### BUG 15: Missing `DRAW_ROUND` Action Type
**File:** `server.js`
**Problem:** The server handles `FORFEIT`, `CHAT`, `TIMEOUT_CLAIM`, `REMATCH_REQUEST`,
`REMATCH_DECLINE`, `ROLL`, `MOVE`, `DRAW_ROUND`, `MOVE_PIECE` actions. But `DRAW_ROUND`
is not handled in the Chess branch. If a player sends `{ type: 'DRAW_ROUND' }` in a
Chess game, it falls through to the generic `MOVE` handler which checks `action.newState`
and `action.index`, neither of which would be present in a DRAW_ROUND action. The
action would be silently ignored (no error, no effect).

**Status:** NOT A BUG — DRAW_ROUND is a TicTacToe-specific action. Chess doesn't
need it because draws are automatically detected via `isGameOver()`.

---

### BUG 16: Server PGN Validation Rebuilds from Scratch
**File:** `server.js` lines 2504-2505
**Problem:** On every Chess move, the server creates a new `Chess()` instance and
replays the ENTIRE PGN history with `loadPgn()`. For a 60-move game, this means
60 moves are replayed. For a 200-move game (drawn-out endgame), this could cause
noticeable server lag.

**Fix:** Cache the `Chess` instance on `room.gameState._chessInstance` and only
apply the last move:
```javascript
if (!room.gameState._chessInstance) {
    room.gameState._chessInstance = new Chess();
    if (room.gameState.pgn) room.gameState._chessInstance.loadPgn(room.gameState.pgn);
}
const serverGame = room.gameState._chessInstance;
const serverMoveCount = serverGame.history().length;
const moveResult = serverGame.move({ from, to, promotion });
// ...
// After successful move:
room.gameState.pgn = serverGame.pgn();
room.gameState.fen = serverGame.fen();
```

**Priority:** Medium — impacts server performance for long games.

---

## Implementation Order

| Priority | Bug | Fix | Effort |
|----------|-----|-----|--------|
| **P0** | BUG 2: P2P game over not handled | Add onGameEnd calls in handleGameOver | 1hr |
| **P0** | BUG 1: Draw calls onGameEnd('quit') | Change to onGameEnd('draw') | 15min |
| **P0** | BUG 3: Timer not validated on server | Add timer validation to server MOVE handler | 3hr |
| **P1** | BUG 14: onGameEnd instability | Stabilize with useRef pattern | 1hr |
| **P1** | BUG 4: PGN race condition | Add PGN length check before applying | 30min |
| **P1** | BUG 11: Forfeit emits before confirmation | Wait for game_over in P2P | 1hr |
| **P2** | BUG 16: Server PGN rebuilds from scratch | Cache chess instance on room state | 2hr |
| **P2** | BUG 13: Timer starts before both players connected | Add gameStarted gate | 1hr |
| **P3** | BUG 6: Bot uses Math.random | Switch to crypto.getRandomValues | 30min |