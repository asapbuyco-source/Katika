# Katika Implementation Plan — Based on Full Technical Audit
**Drafted:** 2026-05-17  
**Source:** Vantage Gaming (Katika) — Deep Technical & Business Audit  
**Grade:** B- (72/100) — Business-ready with work  

---

## Overview

The audit identified **4 critical issues** that could destroy the business financially, legally, or operationally. Everything else is optimization. This plan is organized in **3 phases** — only proceed to later phases when earlier ones are verified complete.

| Phase | Goal | Deadline |
|-------|------|----------|
| **Phase 1** | Kill the fatal blockers | Week 2 |
| **Phase 2** | Polish, security, trust | Week 4 |
| **Phase 3** | Soft beta + legal | Week 6 |

---

## PHASE 1 — Kill the Fatal Blockers (Week 1–2)

> These issues can lose real money or shut you down. Do not skip.

---

### 1.1 — Remove Lidraughts Dependency (P0-Fatal)

**Problem:** Checkers depends on Lidraughts.org API. If it goes down, rate-limits, or changes URLs, the game breaks for all users. Also: Lidraughts uses 10×10 International Draughts — not the 8×8 that Cameroonians know.

**What to do:**

Create `server/checkersEngine.js` — a native 8×8 English Draughts engine:

```
Features needed:
- Board: 8×8, pieces on dark squares only
- Regular pieces move diagonally forward 1 square
- Captures are jumps over opponent pieces (mandatory)
- Multiple jumps in one turn (chain captures)
- Kings move diagonally forward OR backward 1 square
- Kings can capture backward
- King promotion when reaching the opposite end
- Win condition: capture all opponent pieces OR opponent has no legal moves

AI depth: minimax with alpha-beta pruning, depth 4–6
- Material scoring: regular piece = 1, King = 3
- Position scoring: center squares = +0.1, back row penalty
- Mobility scoring: number of legal moves
- Hash table / transposition table for speed (optional at depth 4)
```

**Est. time:** ~15 hours for a solid engine  
**Verification:** Play 20 bot games. Check: captures work, kings move correctly, promotion works, AI provides challenge.

**Fallback if engine isn't ready:** Keep client-side rendering but remove the Lidraughts API dependency entirely. Ship a simple random-move bot for now — it's embarrassing but doesn't break the game.

---

### 1.2 — Bundle Chess Piece SVGs Locally (P1-High)

**Problem:** Chess pieces load from `lichess1.org/assets/piece/cburnett/`. On slow 3G or if Lichess changes URLs, the board is empty.

**What to do:**

1. Download the 12 SVG files from `lichess1.org/assets/piece/cburnett/`:
   - wK.svg, wQ.svg, wR.svg, wB.svg, wN.svg, wP.svg (white pieces)
   - bK.svg, bQ.svg, bR.svg, bB.svg, bN.svg, bP.svg (black pieces)
2. Convert each to a base64 data URI
3. Replace the image `src` in `ChessGame.tsx` with the data URI

```typescript
// Example — add to ChessGame.tsx
const PIECES = {
  wK: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
  bK: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
  // ... all 12 pieces
};
```

**Est. time:** 2–3 hours  
**Bundle size:** ~30KB total — negligible  
**Verification:** Open Chess game with DevTools Network tab throttled to "Slow 3G" — pieces must render.

---

### 1.3 — Integrate Stockfish.js for Chess Practice (P1-High)

**Problem:** Current "Hard" AI is depth-2 greedy. Any beginner beats it in seconds. This destroys the practice mode value proposition before users deposit.

**What to do:**

```bash
# 1. Download Stockfish WASM build
npm install stockfish.js
# OR download from https://github.com/nmrugg/stockfish.js

# 2. Add to ChessGame.tsx as a web worker
import Stockfish from 'stockfish.js';
```

```typescript
// ChessGame.tsx — replace existing bot logic
const initStockfish = (depth: number = 12) => {
    const stockfish = STOCKFISH();

    stockfish.addMessage('uci');
    stockfish.addMessage(`setoption name Skill Level value ${depth}`);
    stockfish.addMessage('isready');

    stockfish.addMessage('position fen ' + currentFen);
    stockfish.addMessage('go depth ' + depth);

    stockfish.addMessage('stop');
    // Parse best move from output
};

const levelMap = {
    easy: 5,
    medium: 10,
    hard: 18
};
```

**Est. time:** 2–4 hours (Stockfish WASM is well-documented)  
**Verification:** Play 10 games vs "Hard" — the AI should actually challenge a casual player.

---

### 1.4 — Disable Non-Launch Games at Stakes (P0-Fatal)

**Problem:** Pool game has zero server-side move validation. Cheaters can send forged payloads and steal winnings. The code comment exists but enforcement is bypassable.

**What to do:**

Current launch scope: `Chess,Checkers,Dice`

Add Pool, Ludo, TicTacToe to the disabled scope:

```javascript
// server.js — ensure Pool is NOT in LAUNCH_GAMES
const LAUNCH_GAMES = (process.env.LAUNCH_GAMES || 'Chess,Checkers,Dice')
```

**Also:** In the UI, explicitly block real-money matchmaking for disabled games. Currently the scope lock hides them from the lobby, but verify the server also rejects `join_game` with Pool/Ludo/TicTacToe (already enforced by `isGameInLaunchScope`).

**Verification:** Attempt to `join_game` with `gameType: 'Pool'` via socket — server must reject.

**Long-term:** Properly implement server-side physics validation for Pool before re-enabling. This means:
- Server runs the same physics simulation as client
- Client sends ball states, server verifies plausibility
- This is ~40 hours of work — not a launch blocker.

---

### 1.5 — Phone Number Verification at Registration (P1-High)

**Problem:** No phone verification at registration. Withdrawal uses MTN Momo number — without verification, fraud via fake accounts is trivial.

**What to do:**

1. Add `phone` field to registration form (`App.tsx` AuthScreen or registration flow)
2. Validate format: must match `^6[579]\d{8}$` (MTN/Orange Cameroon format)
3. Send OTP via SMS (use Twilio or a local Cameroon SMS provider like Orange SMS API)
4. Verify OTP before activating account

```typescript
// services/sms.ts (new file)
export const sendOTP = async (phone: string, otp: string) => {
    // Twilio or Orange SMS API
    await fetch('https://api.orange.com/oauth/v3/token', { ... });
    await fetch('https://api.orange.com/smsmessaging/v1/outbound/sms/requests', { ... });
};

// Registration flow
const handleRegister = async ({ email, password, name, phone, otp }) => {
    const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone, otp })
    });
    // Proceed only if OTP verified
};
```

**Est. time:** 4–6 hours  
**Verification:** Create account without valid OTP — registration should fail.

---

## PHASE 2 — Security & Trust Hardening (Week 2–4)

---

### 2.1 — Webhook Retry Queue

**Problem:** Failed webhooks are lost if Fapshi doesn't retry in time. No fallback for failed webhook processing.

**What to do:**

```javascript
// server.js — add webhook failure queue
app.post('/api/pay/webhook', async (req, res) => {
    res.status(200).json({ received: true });

    try {
        // ... existing verification logic ...
    } catch (err) {
        // Write failed event to Firestore instead of dropping it
        if (db) {
            await db.collection('webhook_failures').add({
                payload: req.body,
                receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                retryCount: 0,
                nextRetry: new Date(Date.now() + 5 * 60 * 1000) // 5 min
            });
        }
    }
});

// Background: retry failed webhooks every 5 minutes
const WEBHOOK_RETRY_INTERVAL = 5 * 60 * 1000;
const MAX_WEBHOOK_RETRIES = 12; // 1 hour total retry window

const retryFailedWebhooks = async () => {
    if (!db) return;
    const now = new Date();
    const failures = await db.collection('webhook_failures')
        .where('nextRetry', '<=', now)
        .where('retryCount', '<', MAX_WEBHOOK_RETRIES)
        .get();

    for (const doc of failures.docs) {
        // Re-process the webhook...
        await processWebhook(doc.data().payload);
        await doc.ref.update({
            retryCount: doc.data().retryCount + 1,
            nextRetry: new Date(Date.now() + Math.pow(2, doc.data().retryCount) * 5 * 60 * 1000)
        });
    }
};
setInterval(retryFailedWebhooks, WEBHOOK_RETRY_INTERVAL);
```

**Est. time:** 4 hours  
**Verification:** Block the `/api/pay/webhook` endpoint temporarily, send test payment, unblock, verify retry processes correctly.

---

### 2.2 — Per-Game ELO Separation

**Problem:** ELO is pooled across all games. A Chess master and a Checkers master have the same rank.

**What to do:**

In `firestore.rules` — add separate ELO fields. In `server.js` — update `settleGame` to track `chessElo` and `checkersElo` separately.

```javascript
// server.js — in settleGame, update game-specific ELO
tx.update(winnerRef, {
    balance: (winnerDoc.data().balance || 0) + winnings,
    elo: newWinnerElo,
    chessElo: room.gameType === 'Chess' ? newWinnerElo : (winnerDoc.data().chessElo || 1000),
    checkersElo: room.gameType === 'Checkers' ? newWinnerElo : (winnerDoc.data().checkersElo || 1000),
    gamesPlayed: (winnerDoc.data().gamesPlayed || 0) + 1,
    mostPlayedGame: room.gameType
});
```

**UI:** Profile/leaderboard shows game-specific ELO when that game is selected.

**Est. time:** 3 hours  
**Verification:** Play Chess, check `chessElo` updates but `checkersElo` stays same. Play Checkers, check `checkersElo` updates.

---

### 2.3 — Account Creation Rate Limiting

**Problem:** No rate limit on account creation. A bad actor can create hundreds of accounts to drain referral promo.

**What to do:**

```javascript
// server.js — add account creation rate limit middleware
const accountCreationLimit = new Map(); // ip -> timestamp[]

const checkAccountCreationLimit = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const timestamps = (accountCreationLimit.get(ip) || []).filter(t => now - t < 24 * 60 * 60 * 1000);

    if (timestamps.length >= 2) {
        return res.status(429).json({ error: 'Max 2 accounts per IP per 24 hours.' });
    }

    timestamps.push(now);
    accountCreationLimit.set(ip, timestamps);
    next();
};

// Apply to registration endpoint
app.post('/api/auth/register', checkAccountCreationLimit, async (req, res) => { ... });
```

**Est. time:** 2 hours  
**Verification:** Create 3 accounts from same IP within 1 hour — 3rd should be rejected.

---

### 2.4 — Firebase Custom Claims for Admin

**Problem:** Currently using email-list approach for admin (works, but custom claims is more secure and scalable).

**What to do:**

```javascript
// One-time script to set custom claims for existing admins
const admin = require('firebase-admin');
admin.initializeApp();

const adminEmails = ['your@email.com', 'other@email.com'];
for (const email of adminEmails) {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Set admin claim for ${email}`);
}
```

Then update `server.js` to check `decoded.admin` instead of email list (or keep email-list as fallback).

**Est. time:** 1 hour  
**Verification:** Login as admin → Firebase console → Users → check custom claims show `{admin: true}`.

---

### 2.5 — Firestore Balance Write Block (Verify)

**Problem:** Client could theoretically write to `users/{uid}/balance` directly.

**Current state:** `firestore.rules` has `noFinancialEscalation` function blocking balance writes from clients. **Verify it's active:**

1. Go to Firebase Console → Firestore → Rules
2. Confirm this rule is present and published:
   ```
   allow update: if isOwner(uid) && noAdminEscalation() && noFinancialEscalation();
   ```
3. Try in browser console:
   ```javascript
   import { doc, updateDoc } from 'firebase/firestore';
   updateDoc(doc(db, 'users', 'YOUR_UID'), { balance: 99999999 });
   ```
   Must return **PERMISSION_DENIED**.

---

### 2.6 — Dispute Filing from GameResultOverlay

**Problem:** Users must hunt for how to dispute a match result. Make it obvious inside the result screen.

**What to do:**

In `GameResultOverlay.tsx` — add a "Report Issue" or "File Dispute" button that calls `/api/disputes/file`.

```typescript
// Inside GameResultOverlay — add dispute button
<button
    onClick={() => {
        fetch('/api/disputes/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ roomId: socketGame.roomId, reason: 'Outcome disputed' })
        });
        toast.success('Dispute filed. You will be contacted within 30 minutes.');
    }}
    className="text-xs text-slate-500 hover:text-red-400 underline mt-2"
>
    Report an issue with this match
</button>
```

**Est. time:** 1 hour  
**Verification:** Complete a game, check dispute button appears, file a dispute, check Firestore `disputes` collection.

---

## PHASE 3 — UX Polish for Cameroonian Users (Week 3–4)

---

### 3.1 — In-Game Tutorial for Chess

**What to do:**

Create a 5-step interactive tutorial that shows before the user's first real-money Chess game:

1. "Chess pieces have different values — learn them before playing"
2. "Your goal: checkmate the opponent's king"
3. "Control the center of the board early"
4. "Don't just attack — protect your king"
5. "Practice mode is available — try it before betting"

Track completion in Firestore (`user.hasSeenChessTutorial: true`).

---

### 3.2 — In-Game Tutorial for Checkers

**What to do:**

1. "Checkers is played on a dark square board — only dark squares count"
2. "Pieces move diagonally forward only"
3. "Captures are MANDATORY — if you can jump, you must"
4. "Chain captures: one jump can become many if they're in line"
5. "Kings can move backward — use them to protect"

---

### 3.3 — "Free Practice" Mode Prominent in Lobby

**Problem:** Users must understand the game before depositing.

**What to do:**

In `Lobby.tsx` — add a big green "FREE PRACTICE" button that launches a free (zero-stake) bot match. This should be the first thing a new user sees.

---

### 3.4 — 3G Optimization

**What to do:**

1. Lazy-load all game components (already using Suspense — verify it's working)
2. Add loading skeleton for Chess board (SVG pieces while loading)
3. Reduce image sizes: compress all PNGs in `/public`
4. Add `networkInformation` API detection:
   ```typescript
   if (navigator.connection?.effectiveType === '2g' || navigator.connection?.effectiveType === 'slow-2g') {
       // Use smaller board, fewer animations
   }
   ```

**Est. time:** 3 hours  
**Verification:** Test on Chrome throttled to "Slow 3G" — page loads in under 8 seconds, board renders in under 5 seconds.

---

### 3.5 — Reconnection UI Polish

**Problem:** If socket disconnects mid-game, user experience is unclear.

**What to do:**

The `WeakNetworkBanner` already exists. Ensure it:
- Shows countdown timer to opponent's forfeit
- Has a manual "I've reconnected" button that calls `rejoin_game`
- Persists correctly when the app is backgrounded on mobile

---

## PHASE 4 — Legal & Payment (Week 4–6)

---

### 4.1 — Register SARL in Cameroon (Non-Negotiable)

**Problem:** No legal entity. Personal liability for all financial disputes. Cannot partner with Fapshi at scale. BEAC can shut down unregistered fintech.

**What to do:**
1. Contact a notary in Yaoundé or Douala (search: "notaire société Yaoundé")
2. Estimated cost: 150,000–250,000 FCFA
3. Documents needed: CNI of partners, business plan, registered address
4. Timeline: 2–4 weeks

**Without this, nothing else matters.**

---

### 4.2 — CinetPay as Backup Payment Processor

**Problem:** Single payment processor is an existential risk. If Fapshi goes down, business stops.

**What to do:**

1. Sign up for CinetPay (https://cinetpay.com) — they support MTN Momo and Orange Money
2. Add second `initiatePayment` flow in `services/fapshi.ts` or create `services/cinetpay.ts`
3. On deposit page, show both options: "Pay with MTN" and "Pay with Orange"
4. Route 50% of traffic to CinetPay as a split test

**Est. time:** 6 hours  
**Verification:** Test a deposit via CinetPay flow — balance increases correctly.

---

### 4.3 — Add Responsible Gambling Controls

**What to do:**

1. Add deposit limits in `Finance.tsx`:
   - Max deposit per day: settable by user (1000–50000 FCFA)
   - Stored in Firestore `users/{uid}/dailyDepositLimit`
   - Server enforces: `if (todayDeposits + newDeposit > dailyLimit) reject`
2. Add self-exclusion option in Profile:
   - "Exclude myself for 7/30/90 days"
   - Sets `users/{uid}/selfExcludedUntil: timestamp`
   - Server blocks all game actions while excluded

---

### 4.4 — Update Terms of Service

**Problem:** Current ToS says "regulated by OHADA" — doesn't reflect real Cameroonian law. Missing responsible gambling language.

**What to do:**

Consult a Yaoundé-based tech lawyer. Key sections to add:
- Age verification (18+)
- Skill gaming disclosure ("this is a skill game, not gambling")
- Responsible gambling policy
- Dispute resolution process
- AML/KYC requirements

---

## PHASE 5 — Soft Beta Launch (Week 6)

---

### 5.1 — Seed the Platform

Before public launch:
1. Identify 10 chess club players in Douala (Akwa, Bonanjo) and Yaoundé
2. Give each 5,000 FCFA promo credit
3. Ask them to post match results to WhatsApp groups
4. Record 2–3 videos of real players withdrawing real money

**This is the single highest-impact marketing activity.**

---

### 5.2 — Run the Launch Tournament

**What to do:**

- Entry: 2,000 FCFA
- Prize pool: 40,000 FCFA (house-funded)
- Format: Single-elimination bracket, 16 players
- Date: Launch day or day after

Post the results everywhere. Tournament winners become your ambassadors.

---

### 5.3 — Set Up Error Tracking (Sentry)

**What to do:**

```bash
npm install @sentry/react
```

```typescript
// main.tsx
import * as Sentry from '@sentry/react';
Sentry.init({
    dsn: 'YOUR_SENTRY_DSN',
    environment: import.meta.env.MODE
});
```

**This tells you about every crash before users complain.**

---

### 5.4 — Load Test

**What to do:**

Use a tool like `k6` or `artillery` to simulate:
- 200 concurrent socket connections
- 50 users matchmaking simultaneously
- 10 payment webhook events per second

Railway hobby instance should handle 200+ concurrent users. If it drops below 100ms response time, upgrade.

---

## PHASE 6 — Post-Launch Growth (Month 2+)

---

### 6.1 — Weekly Saturday Cup

Already partially implemented in `server.js` (tournament scheduler). Verify and activate:
- Every Saturday, 1,000 FCFA entry, guaranteed 20,000 FCFA pot
- Use existing tournament infrastructure

### 6.2 — Campus Ambassador Program

1. Identify 3 university reps (Université de Yaoundé I, IRIC, ENSP)
2. Give them a unique referral code
3. Pay them 500 FCFA per active referral who deposits

### 6.3 — Facebook Ad Campaign

Target: Cameroon, 18-35, interests: chess, jeux de dames, mobile money  
Budget: 5,000 FCFA/day  
Creative: Use real withdrawal video screenshots

### 6.4 — Enable More Games (When DAU > 200)

Once you have 200+ daily active users:
1. Add Dice (fast games, high volume)
2. Add Ludo (family appeal)
3. Track game performance — let users vote on which to add next

---

## Quick Reference — Priority Order

| # | Task | Priority | Est. Hours | Blocker? |
|---|------|----------|-----------|---------|
| 1 | Remove Lidraughts → native checkers engine | P0-Fatal | 15h | YES |
| 2 | Bundle chess SVGs locally | P1-High | 3h | - |
| 3 | Integrate Stockfish.js | P1-High | 4h | - |
| 4 | Disable Pool for stakes | P0-Fatal | 1h | YES |
| 5 | Phone verification at registration | P1-High | 6h | - |
| 6 | Webhook retry queue | P2-Medium | 4h | - |
| 7 | Per-game ELO separation | P2-Medium | 3h | - |
| 8 | Account rate limiting | P2-Medium | 2h | - |
| 9 | Firebase admin custom claims | P2-Medium | 1h | - |
| 10 | Dispute button in GameResultOverlay | P2-Medium | 1h | - |
| 11 | Chess tutorial | P3-Low | 4h | - |
| 12 | Checkers tutorial | P3-Low | 4h | - |
| 13 | Free practice mode prominent | P3-Low | 2h | - |
| 14 | 3G optimization | P3-Low | 3h | - |
| 15 | CinetPay backup payment | P4-Legal | 6h | - |
| 16 | Responsible gambling controls | P4-Legal | 3h | - |
| 17 | Legal entity (SARL) | P4-Legal | ~3 weeks + lawyer | YES |
| 18 | Sentry error tracking | P5-Launch | 1h | - |
| 19 | Load test | P5-Launch | 2h | - |
| 20 | Weekly Saturday Cup | P6-Growth | 4h | - |

**Total estimated hours (excluding legal):** ~60 hours over 6 weeks  
**Legal:** ~3 weeks of process + 150,000–250,000 FCFA