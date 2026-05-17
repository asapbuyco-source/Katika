# Socket Auth Hardening Notes — Katika

**Purpose:** Document socket authentication architecture, hardening decisions, and operational guidance.  
**Date:** 2026-05-15  

---

## Architecture

### Three-mode Socket Authentication (server.js:99)

| Mode | Behavior | Use Case |
|------|----------|----------|
| `off` | Allow all connections (no token required) | Dev only |
| `log` | Allow all, log all auth events | Staging verification |
| `enforce` | Reject unauthenticated connections | Production |

The mode is controlled by the `SOCKET_AUTH` environment variable:
```
SOCKET_AUTH=off    # Dev
SOCKET_AUTH=log     # Staging
SOCKET_AUTH=enforce # Production (REQUIRED)
```

### Production Guard (server.js:88-99)
If `SOCKET_AUTH` is absent or `off` in production, the server:
1. Prints a loud FATAL warning to console
2. Sets `misconfiguredSocketAuth = true`
3. Forces mode to `log` (NOT crash — Railway would crash-loop)
4. Exposes `misconfiguredAuth: true` in the `/health` endpoint

---

## Critical Security Properties

### 1. Server-verified UID Only
`join_game` always uses `socket.user.uid` (from verified Firebase ID token):
```javascript
// server.js:2554
const userId = socket.user.uid; // ALWAYS use server-verified uid, never client-supplied
if (userId !== userProfile.id) {
    console.warn(`[Auth] Socket userId mismatch: socket=${userId} profile=${userProfile.id}`);
    socket.emit('error', { message: 'Authentication mismatch' });
    return;
}
```
**Effect:** Prevents impersonation via forged `userProfile.id` payloads.

### 2. Token Refresh Mechanism (server.js:2415-2439)
Tokens expire after 60 minutes. The client sends `refresh_token` with a new token:
```javascript
socket.on('refresh_token', async ({ token }) => {
    const decoded = await admin.auth().verifyIdToken(token);
    socket.user = decoded;
    // Reset expiry timer...
});
```
A 55-minute forced disconnect ensures expired tokens cannot persist indefinitely.

### 3. Scope Lock Enforcement (server.js:2571-2576)
Every `join_game` is validated against the launch scope:
```javascript
if (!isGameInLaunchScope(gameType)) {
    socket.emit('game_error', { message: `${gameType} is not available in this region yet.` });
    return;
}
```
Even if a user manipulates the client to show a hidden game, the server rejects it.

---

## Identity Verification Flow

```
Client                         Server                          Firebase
  |                               |                                |
  |-- 'refresh_token' token ----->|                                |
  |                               |-- verifyIdToken() ---------->|
  |                               |<-- decoded { uid, email } ----|
  |                               |                                |
  |-- 'join_game' { userId } ---->|                                |
  |                               |-- uid from token (NOT client) |
  |                               |                                |
  |                          match uid?
  |                               |
  |<-- 'match_found' OR error ----|
```

**Key invariant:** `socket.user.uid` is always the authoritative identity. Client-supplied `userId` in payload is compared against it and rejected on mismatch.

---

## Monitoring & Alerting

- `[Auth] Socket userId mismatch` → Admin alerted via `admin_alert` socket event
- `[Auth] Token refresh failed` → Connection terminated, log entry
- `/health` `misconfiguredAuth: true` → PagerDuty/Raise alert trigger

---

## Deployment Checklist

- [ ] Set `SOCKET_AUTH=enforce` in Railway environment variables
- [ ] Verify `/health` returns `misconfiguredAuth: false` in production
- [ ] Confirm no `auth_required` events during normal gameplay (staging soak test)
- [ ] Verify all socket events check `socket.user.uid` before executing privileged actions