# Game Audit & Implementation Plan

## Critical Fixes (P0 — Must Fix Before Next Deploy)

### C1. Ludo GOAL_STEP Desync (BLOCKS P2P LUDO)
**Problem:** Client uses `GOAL_STEP = 57` (index 57 = finished), server validates with `MAX_STEP = 56`.
A piece at step 57 (finished) has `57 + dice > 56` so `canMove()` returns `false`.
Client sends `finished: true` with `step: 57`, server's `movedTooFar` check at line 2846
calculates `stepDiff = 57 - (-1) = 58 > diceValue`, causing the move to be rejected.

**Fix:**
1. In `server/ludoLogic.js`, change `MAX_STEP = 56` to `MAX_STEP = 57`.
2. In `server.js` inline Ludo validation (line ~2846), change the step comparison to match `MAX_STEP = 57`.
3. In `server.js` `createInitialGameState` Ludo case, verify `finished` flag is set when `step === GOAL_STEP`.
4. Add a unit test verifying a piece can reach `step=57` with `finished=true`.

**Files:** `server/ludoLogic.js` line 6, `server.js` lines ~2840-2855, `tests/ludoLogic.test.js`

---

### C2. Ludo Capture Rejection by Server Teleportation Check (BLOCKS P2P LUDO)
**Problem:** Client's `checkCaptures()` mutates opponent pieces, setting `step = -1` for captured pieces.
Server's teleportation check at line 2815-2818 rejects this because opponent pieces changed `step`.

**Fix:** Add capture exemption to the server's teleportation check:
```javascript
const movedIllegally = action.pieces.some((p, i) => {
    const prev = prevPieces[i];
    if (p.owner !== userId) {
        // Allow opponent capture: step -1 means sent home
        if (p.step === -1 && prev.step >= 0) return false;
        return p.step !== prev.step;
    }
    return false;
});
```

**Files:** `server.js` lines 2813-2819

---

### C3. Pool Group Assignment Never Set on Server (DISABLES EARLY-8-BALL)
**Problem:** `room.gameState.myGroupP1` and `myGroupP2` are `undefined` on the server.
The early-8-ball detection at lines 2614 and 2694 reads these values and the
`groupIds.every()` check on `undefined` group returns `true`, meaning every
shot that pockets the 8-ball with a cleared group could be incorrectly accepted
OR the `!allCleared && ...` branch could auto-loss players incorrectly.

**Fix:** When a group is first assigned (first pocketed ball after break in
PoolGame.tsx), emit a `game_action` with `{ type: 'MOVE', newState: { myGroupP1, myGroupP2 } }`
and have the server persist these on `room.gameState`. Alternatively, have the
server compute groups itself based on the first pocketed ball.

**Files:** `components/PoolGame.tsx`, `server.js` lines ~2560-2740

---

### C4. Timer Values Not Server-Validated (ALL GAMES)
**Problem:** All game timers are client-authoritative. The `timers` object is sent
in `game_action` payloads and stored in `room.gameState.timers` without validation.
A cheating client can send any timer values.

**Fix:** For each `MOVE`/`ROLL` action, the server should:
1. Store `lastMoveTime` (already done via `room.gameState.lastMoveTime`).
2. Validate that `timers[opponentId] <= previousTimers[opponentId]` (timer can only decrease).
3. Validate that `timers[currentPlayerId] <= previousTimers[currentPlayerId] + TIMER_INCREMENT`.
4. Clamp timer values to `[0, MAX_TIME]`.
5. On `TIMEOUT_CLAIM`, verify server-side that the elapsed time since `lastMoveTime`
   exceeds the game-specific timeout.

**Files:** `server.js` lines ~2127-2780 (game_action handler)

---

## High Priority Fixes (P1 — Fix Within 1 Sprint)

### H1. Draw Results in `onGameEnd('quit')` (ALL LOCAL GAMES)
**Problem:** Chess `checkGameOver()` calls `onGameEnd('quit')` for draws.
TicTacToe 3-draw streak calls `onGameEnd('quit')`. Checkers stalemate calls
`onGameEnd('quit')`. The `onGameEnd` type is `'win' | 'loss' | 'quit'` — no `'draw'` variant.
This means draws are financially settled as forfeits, costing both players their stake.

**Fix:**
1. Add `'draw'` to the `onGameEnd` type: `onGameEnd: (result: 'win' | 'loss' | 'quit' | 'draw') => void`.
2. In `GameRoom.tsx`, handle the `'draw'` result by calling `socket.emit('game_action', { type: 'DRAW_ROUND' })`
or a new `DRAW` action type.
3. In the server, handle `DRAW` by calling `endGame(roomId, null, 'Draw')` which
already triggers the escrow refund path in `endGame`.

**Files:** `components/ChessGame.tsx`, `components/TicTacToeGame.tsx`,
`components/CheckersGame.tsx`, `components/DiceGame.tsx`, `components/GameRoom.tsx`,
`types.ts` (ViewState-onGameEnd type), `server.js` game_action handler

---

### H2. Dice `diceLogic.js` Is Dead Code With Wrong Rules
**Problem:** `server/diceLogic.js` has different scoring rules than the actual
server inline logic. The module awards a point only on `roll === 6` or `roll === 1`,
while the server compares sums. This module is never imported by `server.js`.

**Fix:** Either update `diceLogic.js` to match the server's actual rules and
use it in the server's dice handler, or delete it.

**Files:** `server/diceLogic.js`, `tests/diceLogic.test.js`

---

### H3. Pool: No Break Shot Validation, No Foul Detection
**Problem:** Pool has zero validation for:
- Break shot must contact rack and drive 4+ balls to rails
- Player must hit their own group first after assignment
- Scratch-and-pocket on same shot
- Not hitting any ball (foul)
- Ball off table (foul)

**Fix:** Add server-side foul detection in the Pool MOVE handler:
1. Track break shot status (`room.gameState.breakShotDone`).
2. On break, validate at least 4 balls moved.
3. After group assignment, validate first contact is with own group.
4. Track cue ball scratch (pocketed cue ball).
5. Auto-assign groups after first legal pocket post-break.
6. Emit foul state to client; ball-in-hand on opponent's next turn.

**Files:** `server.js` lines ~2548-2740, `components/PoolGame.tsx`

---

### H4. Pool: P2P State Lost on Refresh
**Problem:** On page refresh, `players[].group` and `ballsPocketed` are not
restored from `room.gameState.balls` or any server-persisted state.

**Fix:** In the Pool socket `game_update` handler, include group assignment
and pocket tracking in the game state. On reconnect, restore from `room.gameState`.

**Files:** `components/PoolGame.tsx`, `server.js`

---

### H5. Tournament `Math.random()` for Bracket Shuffling
**Problem:** `server/routes/tournaments.js` and `server.js` use `Math.random()`
for bracket shuffle and dice rolls. For real-money tournaments, this should be
cryptographically secure.

**Fix:** Replace `Math.random()` with `crypto.randomInt()` in tournament shuffling.
Dice already uses `crypto.randomInt(1, 7)` — verify all other uses.

**Files:** `server/routes/tournaments.js`, `server.js`

---

## Medium Priority Fixes (P2 — Fix Within 2 Sprints)

### M1. Ludo `bonusTurn` Is Client-Authoritative
**Problem:** The `bonusTurn` flag in `MOVE_PIECE` actions is entirely determined
by the client. A cheating client can always send `bonusTurn: true`.

**Fix:** Server should validate `bonusTurn`:
1. If `diceValue === 6`, bonus turn is valid.
2. If a capture occurred (check piece positions for `step === -1` change), bonus is valid.
3. If piece reached home (`finished === true`), bonus is valid.
4. Otherwise, reject `bonusTurn: true`.

**Files:** `server.js` lines ~2888-2893

---

### M2. TicTacToe Bot Is Purely Random
**Problem:** The bot picks a random empty cell, making the game trivially exploitable
in a money context.

**Fix:** Implement minimax with alpha-beta pruning for difficulty levels:
- Easy: random (current)
- Medium: block winning moves, take winning moves, otherwise random
- Hard: full minimax (unbeatable)

**Files:** `components/TicTacToeGame.tsx` lines 233-238

---

### M3. Checkers Bot Uses Wrong `forwardDir` for King Promotion
**Problem:** Line 616 in the bot: `const kingRow = forwardDir === -1 ? 7 : 0`
uses `forwardDir` from player state, not the bot's own direction.

**Fix:** Compute the bot's `forwardDir` based on which player index the bot is
(player 0 → -1, player 1 → 1), not use the human player's direction.

**Files:** `components/CheckersGame.tsx` line 616

---

### M4. Dice: No Maximum Round Cap
**Problem:** If both players keep drawing, the game runs indefinitely.

**Fix:** Add a maximum round count (e.g., 20 rounds). If no winner after 20 rounds,
declare a draw and refund both players.

**Files:** `components/DiceGame.tsx`, `server.js` dice handler

---

### M5. `checkersLogic.js` Is Dead Code
**Problem:** The server uses inline validation, not the `checkersLogic.js` module.

**Fix:** Either integrate the module into the server's Checkers handler, or delete it.

**Files:** `server/checkersLogic.js`, `tests/checkersLogic.test.js`

---

### M6. Lidraughts/Lichess Tokens in Client Bundle
**Problem:** `VITE_LICHESS_TOKEN` and `VITE_LIDRAUGHTS_TOKEN` are embedded in the
client bundle at build time. Anyone can extract them.

**Fix:** Bot games should proxy through the server. Remove direct API calls from
the client, or accept that these tokens are public-facing bot tokens.

**Files:** `services/lichess.ts`, `services/lidraughts.ts`

---

## Low Priority / Future Improvements (P3)

### L1. All Bot/Solo Games Run Client-Side Without Validation
**Risk:** Modified clients can always win bot games.
**Mitigation:** Low priority since bot games have zero financial stake. Consider
adding server-side validation for future anti-cheat requirements.

### L2. Pool Has No Stalemate Detection
**Risk:** If both players have no legal shot, the game stalls indefinitely.
**Mitigation:** Add a shot clock per turn (e.g., 3 minutes) and auto-forfeit
on timeout.

### L3. `grid-cols-15` and `grid-rows-15` in Ludo
**Risk:** These are custom Tailwind classes that must be defined in the config.
Already defined in `tailwind.config.ts` but should be verified.
**Mitigation:** Check build output includes these utilities.

### L4. Chat Sanitization Is Minimal (150 chars, HTML stripped)
**Risk:** Unicode abuse, zalgo text, spam.
**Mitigation:** Add rate limiting per user and max message frequency.

### L5. Behavioral Anomaly Detection Uses 85% Win Rate Threshold
**Risk:** Skilled players get flagged.
**Mitigation:** Adjust threshold per game type (Chess should allow higher win rates
than random-entry games).

---

## Implementation Order

| Sprint | Items | Estimated Effort |
|--------|-------|-----------------|
| Sprint 1 | C1, C2, C3, C4 | 3-4 days |
| Sprint 2 | H1, H2, H5 | 2-3 days |
| Sprint 3 | H3, H4, M1 | 4-5 days |
| Sprint 4 | M2, M3, M4, M5, M6 | 3-4 days |
| Sprint 5 | L1-L5 | 3-5 days |

Total estimated effort: **15-21 days**