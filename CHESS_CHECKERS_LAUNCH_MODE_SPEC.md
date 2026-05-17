# Chess + Checkers Launch Mode Spec

**Objective:** Restrict platform to Chess + Checkers for safe Cameroon launch; enable staged reintroduction of other games.  
**Date:** 2026-05-15  

---

## Scope Lock Architecture

Two-layer enforcement (defense-in-depth):

### Layer 1: Build-time constant (UI layer)
`VITE_LAUNCH_GAMES` is baked into the production bundle via Vite `define`:
```typescript
// vite.config.ts
define: {
    'import.meta.env.VITE_LAUNCH_GAMES': JSON.stringify(
        process.env.VITE_LAUNCH_GAMES || 'Chess,Checkers'
    )
}
```
Used in `Lobby.tsx` and `Dashboard.tsx` to filter the game list before rendering.

### Layer 2: Server enforcement (socket layer)
`LAUNCH_GAMES` env var is read at server startup and applied to every `join_game`:
```javascript
// server.js:104-107
const LAUNCH_GAMES = (process.env.LAUNCH_GAMES || 'Chess,Checkers')
    .split(',').map(g => g.trim()).filter(Boolean);
const isGameInLaunchScope = (gameType) => LAUNCH_GAMES.includes(gameType);
```
Client socket attacks (manipulating the client to send non-scope game types) are rejected at the server.

---

## Environment Configuration

| Env Var | Values | Effect |
|---------|--------|--------|
| `LAUNCH_GAMES` | `Chess,Checkers` (default) | Launch mode — only Chess + Checkers |
| `LAUNCH_GAMES` | `Chess,Checkers,Dice,Ludo,TicTacToe,Pool,Cards` | Full platform (all games) |
| `LAUNCH_GAMES` | `Chess,Checkers,Dice,Ludo` | Partial rollout (staged) |
| `VITE_LAUNCH_GAMES` | Must match server-side `LAUNCH_GAMES` | Frontend build-time constant |

**Railway Configuration:**
```
LAUNCH_GAMES=Chess,Checkers
VITE_LAUNCH_GAMES=Chess,Checkers
```

---

## Game Scope Matrix

| Game | Launch Mode | Staged Phase 2 | Full Launch |
|------|-------------|----------------|-------------|
| Chess | ✅ Active | ✅ | ✅ |
| Checkers | ✅ Active | ✅ | ✅ |
| Dice | ❌ Hidden | ✅ | ✅ |
| Ludo | ❌ Hidden | ✅ | ✅ |
| TicTacToe | ❌ Hidden | ✅ | ✅ |
| Pool | ❌ Hidden | ✅ | ✅ |
| Cards (Whot) | ❌ Hidden | ❌ | ✅ (needs special ops) |

---

## Scope Lock Verification

After deployment, verify:
1. Dashboard shows only Chess + Checkers game cards
2. Lobby shows only Chess + Checkers game tiles
3. Attempting to `join_game` with `gameType: 'Dice'` returns error: `"Dice is not available in this region yet."`
4. `/health` returns `status: 'ok'` (no auth misconfiguration)

---

## Staged Reintroduction (Phase 2)

When ready to add more games:
1. Update `LAUNCH_GAMES` env var in Railway
2. Rebuild frontend with updated `VITE_LAUNCH_GAMES`
3. Deploy frontend + restart backend
4. Verify new games appear in UI and socket matchmaking works

---

## Verification Test Cases

| Test | Expected Behavior |
|------|------------------|
| Fresh user opens Dashboard | Sees only Chess + Checkers cards |
| Fresh user opens Lobby | Sees only Chess + Checkers game tiles |
| Bot game: Chess | ✅ Works (server API bypasses scope lock) |
| Bot game: Dice | ❌ Rejected with "not available" message |
| Matchmaking: Checkers | ✅ Works |
| Challenge: Checkers vs Chess | ❌ Game type selection filtered to scope |
| Admin sets `game_configs/Dice` to `active` | UI still hides Dice (scope lock overrides admin config) |