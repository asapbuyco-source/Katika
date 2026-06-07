# Pre-Launch Manual Steps — Katika Cameroon

**Last updated:** 2026-05-17  
**For:** Vantage Engineering / Ops  

---

## SECTION A — Critical (Must Do Before Any User Plays)

### A1. Railway Environment Variables

Go to your Railway project dashboard → each service (backend) → Environment Variables. Set ALL of these before deploying:

| Variable | Value | Why |
|----------|-------|-----|
| `NODE_ENV` | `production` | Enables security guards, blocks dev fallbacks |
| `SOCKET_AUTH` | `enforce` | Blocks unauthenticated socket connections (P0-1) |
| `LAUNCH_GAMES` | `Chess,Checkers,Dice` | Restricts matchmaking to launch scope (P1-1) |
| `FRONTEND_URL` | `https://your-frontend.netlify.app` | Blocks wildcard CORS (P0 security) |
| `ADMIN_EMAILS` | `your@email.com,other@email.com` | Your comma-separated admin emails |
| `FAPSHI_API_KEY` | `FAK_xxx` | Payment gateway — REQUIRED |
| `FAPSHI_USER_TOKEN` | `xxxx-xxxx` | Payment gateway — REQUIRED |
| `FIREBASE_SERVICE_ACCOUNT` | `{ "type": "service_account", ... }` | Firebase Admin SDK JSON |

**IMPORTANT:** `SOCKET_AUTH` must be `enforce`, not `off` or `log`. If unset, server forces `log` mode and logs a FATAL warning.

---

### A2. Frontend Build

Before deploying frontend:

```bash
# Set the launch scope for the frontend build
VITE_LAUNCH_GAMES=Chess,Checkers,Dice npm run build

# Then deploy the dist/ folder to Netlify/Vercel
```

Or set `VITE_LAUNCH_GAMES=Chess,Checkers,Dice` in your frontend host's environment variables before triggering the build.

---

### A3. Deploy Server

```bash
# After setting all Railway env vars
# Push to your git repo — Railway auto-deploys

# OR manually trigger redeploy from Railway dashboard
```

After deploy, verify:
1. Go to `https://your-backend.up.railway.app/health`
2. Check response:
   - `status`: `"ok"` ✅
   - `misconfiguredAuth`: `false` ✅
   - `dependencies.firestore`: `"ok"` ✅

If `misconfiguredAuth` is `true`, fix `SOCKET_AUTH` env var immediately.

---

### A4. Firebase Firestore Rules

Go to Firebase Console → Firestore → Rules. Replace all content with the rules in `firestore.rules` file in the repo.

Then click **Publish**.

Test by trying to write to `processed_payments` or change another user's balance via the browser console — it should be **DENIED**.

---

### A5. Test Payment Flow (LIVE TEST — CRITICAL)

Do this on your OWN account with real MTN/Orange Money. Do not use a test account that doesn't reflect real user flow.

**Step 1 — Deposit:**
1. Login to Katika on your phone
2. Go to Finance → Deposit
3. Deposit 500 FCFA via MTN Mobile Money
4. Wait 2 minutes
5. Check balance — should be exactly +500 FCFA
6. Check `users/{your_uid}/transactions` in Firestore — should show a `deposit` entry with `status: completed`

**Step 2 — Withdraw:**
1. Ensure balance is at least 1,000 FCFA
2. Go to Finance → Withdraw
3. Enter your own MTN number (or a second phone you control)
4. Withdraw 500 FCFA
5. Wait up to 5 minutes — you should receive the Momo notification
6. Check balance — should be exactly -500 FCFA
7. Check `users/{your_uid}/transactions` — should show `withdrawal` with `status: completed`

**If withdrawal takes more than 5 minutes:**
- Wait 6 minutes total
- Check balance — if refunded automatically, the auto-refund is working ✅
- If NOT refunded and money didn't arrive, escalate to Fapshi support

**Step 3 — Replay attack test:**
1. Deposit 500 FCFA
2. Wait for webhook to fire
3. Manually call the webhook URL again with the same `transId`
4. Balance should NOT increase twice (should still be +500, not +1000)

---

### A6. Test Matchmaking (LIVE)

1. Login on two different devices (or two browsers, or get a friend)
2. Both go to Lobby → Dice → select stake (100 FCFA)
3. Both tap "Find Match"
4. Match should form within 10 seconds
5. Play one full round — complete the game
6. Winner should receive winnings (+180 FCFA for 100 stake)
7. Check balance of both players in Firestore

---

## SECTION B — Verification Tests (Carry Out in Order)

Run these tests in staging or on a private beta URL before going public.

### B1. Auth Security Tests

| Test | How | Expected Result |
|------|-----|-----------------|
| Open incognito window, try to join game without logging in | Socket sends `join_game` without token | Server emits `auth_required` |
| Login, change `userProfile.id` in local state to another user's ID, try to join | Manipulate client payload | Server rejects with "Authentication mismatch" |
| Try to `join_game` with `gameType: 'Ludo'` | Send non-scope game type | Server rejects: "Ludo is not available in this region yet" |
| Open `/health` endpoint | Browser or curl | `misconfiguredAuth: false`, `status: ok` |

---

### B2. Financial Security Tests

| Test | How | Expected Result |
|------|-----|-----------------|
| Deposit 500 FCFA, replay webhook | Use Postman/curl to re-send webhook with same `transId` | Balance increases only once |
| Deposit with `depositAmount > amount` | Client manipulates depositAmount | Server rejects (validation) |
| Withdraw with insufficient balance | Try to withdraw more than balance | Server rejects with "Insufficient balance" |
| Withdraw with balance exactly equal to amount | Withdraw all balance | Balance goes to 0 (not negative) |
| Try to write to `processed_payments` | Browser console attempt | Firestore: DENIED |

---

### B3. Game Integrity Tests

| Test | How | Expected Result |
|------|-----|-----------------|
| Play Dice — check both players' balance after | Play one game | Winner: +180, Loser: -100 |
| Play Chess — make illegal move | Try to move wrong piece | Server rejects move |
| Play Checkers — check winner after all pieces captured | Capture all opponent pieces | Server awards win to correct player |
| Disconnect mid-game | Turn off WiFi during active game | 60-240s timer starts, opponent can claim timeout win |
| Reconnect after disconnect | Turn WiFi back on before timer expires | Game resumes normally |
| Try to rematch 4 times in a row (stake game) | Accept rematch 3 times | 4th rematch shows 60s wait message |

---

### B4. Leaderboard Test

1. Play 3+ games (any stake amount)
2. Go to Profile → Leaderboard tab
3. Select "Chess" and "Checkers" — both should load
4. Your name/ELO should appear if you're in top 100

---

### B5. Referral Anti-Fraud Test

1. Create account B (referee) using account A's referral code
2. Account A deposits 500 FCFA (referral eligible flag sets)
3. Account B deposits 500 FCFA (referral eligible flag sets)
4. Account B plays 3+ games and loses at least 1 stake game
5. Check account A's balance — should have received 100 FCFA promo bonus
6. Check account A's `referralBonusPaid: true` in Firestore

---

### B6. Error Recovery Tests

| Test | How | Expected Result |
|------|-----|-----------------|
| Server restart during active game | Deploy new version while game is in progress | Game resumes from Firestore after restart |
| Pending withdrawal auto-refund | Call disburse endpoint, don't complete on Fapshi side | After 5 min, balance refunded automatically |
| Challenge expiry | Send challenge, don't accept within 24h | Challenge disappears from Firestore |

---

## SECTION C — Admin Checks Before Launch

### C1. Admin Access

1. Login with your admin email
2. Go to Profile → confirm you see the Admin Dashboard link
3. Go to Admin Dashboard → Server Status — confirm all systems green

### C2. Maintenance Mode

1. In Admin Dashboard, toggle Maintenance Mode ON
2. Try to join a game — should see maintenance screen
3. Toggle OFF — game should work again

### C3. Ban User

1. In Admin Dashboard, ban a test account
2. Try to login with that account — should be blocked
3. Unban — should work again

---

## SECTION D — Monitoring Setup

These are NOT code — manual setup required:

### D1. Set Up Alert for `/health` Misconfiguration

1. Use a free service like UptimeRobot or Better Uptime
2. Add `https://your-backend.up.railway.app/health` as a monitor
3. Alert if:
   - Response body does not contain `"ok"`
   - HTTP status code is not 200
   - Response time > 5 seconds

### D2. Firestore Indexes (Required for Leaderboard + Search)

In Firebase Console → Firestore → Indexes, add these composite indexes to avoid errors:

| Collection | Fields |
|------------|--------|
| `users` | `name` (Ascending) |
| `users` | `elo` (Descending) |
| `games` | `status` (Ascending), `createdAt` (Descending) |
| `games` | `winner` (Ascending), `updatedAt` (Descending) |
| `tournament_matches` | `tournamentId` (Ascending), `round` (Ascending) |
| `leaderboard_snapshots` | `gameType` (Ascending), `snapshotDate` (Descending) |

### D3. Discord/Slack Alert Channel

Create a channel called `#katika-alerts` and add an incoming webhook. Point it to your phone so you get notified immediately if:
- `/health` returns `misconfiguredAuth: true`
- `failed_settlements` collection has more than 5 entries in 1 hour

---

## Rollback Quick Reference

If something goes wrong on launch day:

| Problem | Fix |
|---------|-----|
| Payments going wrong | Set `MAINTENANCE_MODE=true` via Admin Dashboard. All stakes auto-refunded. |
| Webhook causing double-credits | Comment out `app.post('/api/pay/webhook', ...)` in server.js and redeploy |
| Socket exploit discovered | Set `SOCKET_AUTH=off` to block all socket connections, then fix and redeploy |
| User balance corruption | Roll back to previous server deployment in Railway |
| Frontend deployed with bug | Roll back to previous Netlify/Vercel deployment |

---

## Sign-Off Checklist

Before publicly announcing the launch, confirm:

- [ ] All Section A steps completed
- [ ] All Section B tests passed
- [ ] All Section C admin checks verified
- [ ] `/health` returns `status: ok`, `misconfiguredAuth: false`
- [ ] `SOCKET_AUTH=enforce` set in Railway
- [ ] Firestore rules deployed and published
- [ ] Live deposit + withdrawal tested with real money
- [ ] Firestore composite indexes created
- [ ] Monitoring/alert configured on `/health` endpoint
- [ ] At least 2 people on the ops team know how to handle `failed_settlements`
