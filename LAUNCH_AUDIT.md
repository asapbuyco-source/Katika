# Katika Launch Readiness Audit — First 100 Users

**Date:** July 7, 2026  
**App:** Vantage Gaming (Katika)  
**Market:** Cameroon — real-money P2P skill gaming

---

## Verdict: NOT READY for 100 real users

The backend is solid. The frontend has critical trust-breaking issues, deceptive UX, missing localization, and a "ghost town" problem that will drive first-time users away within minutes. Below is every issue categorized by severity with exact file:line references.

---

## BLOCKERS — Fix before any real users

### 1. Remove fake player counts on Dashboard
**`components/Dashboard.tsx:69-76`** — Every game shows hardcoded fake player counts (1240, 842, 156, 320, 85).  
**`components/Lobby.tsx:26-29,33-38`** — The Lobby shows all `playersOnline: 0` and `players: 0`.  
**Problem:** User clicks Dice (shows "1,240 players"), gets to lobby where it shows "0 in Arena" for everything. Instant trust destruction.  
**Fix:** Either remove all fake counts (show nothing or "—" dash) or add real-time active player counts from server.

### 2. Add prominent "Play vs Computer" button on Dashboard
The only way a user can actually play without real opponents is the "Practice vs AI" button buried in `Lobby.tsx:713-717` — visible only after picking a game AND advancing to stake selection. A new user with nobody to play against just leaves.  
**Fix:** Add a primary "Play vs AI" card on the Dashboard above the game list, or add a solo play button visible alongside each game.

### 3. Onboarding lies about the 100 FCFA bonus
**`components/Onboarding.tsx:20-21`** — Unconditionally says "We've credited your account with 100 FCFA to get you started."  
**Problem:** If a Google user skips phone number → no bonus. If device already claimed → no bonus. The check only fires as a toast in `App.tsx:466-472` but the onboarding screen doesn't check `welcomeBonusStatus`. User sees "you got 100 FCFA!" then opens dashboard to 0 FCFA.  
**Fix:** Read `user.welcomeBonusStatus` or `user.balance > 0` before rendering the bonus slide. Show a different slide if no bonus was granted.

### 4. Referral bonus amount mismatch (100 vs 200 FCFA)
- Server credits: **100 FCFA** (`server.js:2292`)
- Profile screen & onboarding: **100 FCFA**
- `WinShareCard.tsx:24,103` — Share text says **"200 FCFA bonus"**
**Problem:** Referred friends expect 200 FCFA, get 100. Feels like a bait-and-switch.  
**Fix:** Pick one amount and use it everywhere.

### 5. Auth screen always says "Welcome Back"
**`components/AuthScreen.tsx:171-172`** — The heading is hardcoded "Welcome Back" + "Secure Access Portal" regardless of whether the user is registering or signing in.  
**Fix:** Show "Create Your Account" / "Welcome Back" dynamically based on `isRegistering` state.

### 6. Landing page promises Pool — but Pool is excluded from default launch
**`components/LandingPage.tsx:134`** — Hero says "Challenge real players in Chess, Checkers, Dice, **and Pool**."  
**`vite.config.ts:12`** — `VITE_LAUNCH_GAMES` default is `'Chess,Checkers,Dice'` (no Pool).  
**Fix:** Either add Pool to launch scope, or remove Pool from landing page copy.

### 7. "50,000 FCFA" stake claim is misleading
**`components/HowItWorks.tsx:29`** — "From 500 FCFA casual games to **50,000 FCFA** pro tables."  
**`components/Lobby.tsx:29`** — Actual max tier is **5,000 FCFA** (High Roller).  
**Fix:** Change HowItWorks to match reality (5,000 FCFA max) or add that tier.

---

## HIGH PRIORITY — Fix within first 10 users

### 8. French translation is missing for most user-facing text
The app auto-detects French via `services/i18n.tsx:296-300` and has a French translation dictionary loaded. But these critical screens are entirely hardcoded English:
- **`components/AuthScreen.tsx`** — All headings, buttons, error messages, placeholders, phone field, forgots password, sign-in/register toggle, 18+ checkbox
- **`components/LandingPage.tsx`** — Entire marketing page, hero, features, footer
- **`components/Onboarding.tsx`** — All 4 onboarding steps
- **`components/HowItWorks.tsx`** — All steps, features, descriptions
- **`components/Lobby.tsx`** — Stake tier names, "Insufficient Funds", "Processing", payment method names, challenge flow, search UI
- **`components/Dashboard.tsx`** — "Ranked & Casual Tables", "Under Development", "No recent activity"

Cameroon is bilingual French/English. Users auto-detected as French will see an English app.  
**Fix:** Wire all hardcoded strings through `t()` function. Add missing keys to `services/i18n.tsx`.

### 9. Deposit fee (3%) is undisclosed
**`components/Finance.tsx`** — Fee is calculated server-side and shown in the deposit summary. But it's never mentioned on the landing page, onboarding, or how-it-works.  
**Fix:** Add fee disclosure to landing page pricing/features section and onboarding flow.

### 10. Minimum withdrawal of 600 FCFA traps small balances
**`components/Finance.tsx:181`** — `minWithdrawal = 600`  
A user who gets the 100 FCFA welcome bonus cannot withdraw it. Even winning a 100 FCFA starter match (~162 FCFA net after fee) leaves you below threshold. Users feel their money is trapped.  
**Fix:** Either lower the minimum to 100 FCFA or explain clearly on deposit/withdraw screens.

### 11. Update stale legal dates
- **`components/TermsOfService.tsx:27`** — "Last Updated: March 15, 2024" (2+ years old)
- **`components/PrivacyPolicy.tsx:26`** — "Effective Date: March 15, 2024"
**Fix:** Update to current date. Stale dates undermine trust for a real-money platform.

---

## MEDIUM PRIORITY — Fix within first 50 users

### 12. No guided CTA after onboarding completes
After finishing the 4-step onboarding, user is dropped on Dashboard with no guidance. The most prominent CTA is "DEPOSIT FUNDS" (`Dashboard.tsx:172-183`). There's no:
- "Play your first free game vs AI" prompt
- "Invite a friend and get 100 FCFA" prompt
- Explanation of what to do next

### 13. "Play vs AI" is hidden and obscure
`Lobby.tsx:713-717` — Small purple button, top-right, only visible after selecting a game AND advancing past stake selection. New users won't find it.

### 14. Empty-state "ghost town" problem
With no real users:
- Live wins ticker is invisible (`Dashboard.tsx:124-147` — renders only when `winners.length > 0`)
- `LiveWinFeed` shows nothing
- All lobbies show "0 Online"
- Matchmaking searches forever with no opponent
- Dashboard says "No recent activity found. Start playing to see stats!" (`Dashboard.tsx:290`)

A first-time user sees a completely empty, unused platform.  
**Fix:** Seed the live win feed with 3-5 example wins (clearly marked as system). Show a "No one online right now? Play against AI while you wait" prompt.

### 14. Remove duplicate 18+ checkbox on auth
`AuthScreen.tsx:188,306` — The eligibility checkbox appears twice (menu screen AND inside registration form). If user already checked it, they must check again.

### 15. Referral code is a raw ugly Firebase UID
**`components/Profile.tsx:582`** — `user.id.substring(0, 8).toUpperCase()` produces junk like `AB3XY9KL`.  
**Fix:** Generate clean 6-character alphanumeric codes or use user's chosen display name.

### 16. Chat message field has a typo
Type definitions use `senderId` instead of `senderId` (already typed wrong from the start — both are `senderId`). Not user-facing but worth cleaning up.

---

## LOW PRIORITY — Nice-to-have within first 100 users

### 17. Cards/Kmer Cards listed but not implemented
Dashboard shows Cards (Whot) as "Coming Soon" / disabled. Clicking it from the Lobby shows "Game Mode Not Available". Either remove it or implement it.

### 18. Settings and Collection views are dead
Defined in `ViewState` type (`types.ts`) but no component and no route. Remove or implement.

### 19. Guest mode code exists but is unreachable
`loginAsGuest` is exported in `services/firebase/auth.ts`, translation key `guest_mode` exists, but there is no button in AuthScreen. Either add to UI or remove dead code.

### 20. External avatar dependencies
10+ hardcoded references to `pravatar.cc` and `dicebear.com` as avatar fallbacks. If either goes down, broken images everywhere.

### 21. Browser zoom locked
`index.html` has `user-scalable=no` — blocks pinch-to-zoom. Bad for accessibility.

### 22. No back-button support
State-driven routing means browser back button doesn't navigate between app views. Users can't share URLs to specific screens.

---

## BACKEND — Important fixes (won't block launch but needed soon)

### 23. Admin balance edits have no audit trail
`server.js` — `/api/admin/edit-balance` directly overwrites `balance` with no record of previous value, who changed it, or when. Critical for financial integrity.

### 24. No alerting for failed settlements
Settlements that fail are written to `failed_settlements` collection but with no Telegram alert, email, or external notification. Only console.log.

### 25. Leaderboard generation has a reference error
`server.js:2831` — `idx` is undefined (should reference loop variable). This code throws at runtime.

### 26. Pending withdrawal reconciliation scans ALL users
`server.js` — Every 10 minutes, iterates over all user documents via `listDocuments()`. Won't scale beyond ~10K users.

### 27. `SOCKET_AUTH_MODE` defaults to `'off'` in non-production
Environments without `SOCKET_AUTH_MODE` set allow unauthenticated socket connections.

### 28. In-memory game state lost on crash
Between move-and-persist, a server crash can lose the latest game state. Escrow is protected via startup reconciliation but active games are interrupted.

---

## Fix Checklist (in order)

| # | Task | Time | Lines affected |
|---|------|------|----------------|
| 1 | Remove fake player counts from Dashboard | 5 min | Dashboard.tsx:69-76 |
| 2 | Add "Play vs AI" button to Dashboard | 30 min | Dashboard.tsx (new card) |
| 3 | Fix onboarding bonus check | 10 min | Onboarding.tsx:20-21 |
| 4 | Unify referral bonus to 100 FCFA everywhere | 5 min | WinShareCard.tsx:24,103 |
| 5 | Dynamic "Welcome Back" / "Create Account" heading | 5 min | AuthScreen.tsx:171-172 |
| 6 | Fix landing page Pool/launch scope mismatch | 5 min | LandingPage.tsx:134 or vite.config.ts:12 |
| 7 | Fix "50,000 FCFA" claim to "5,000 FCFA" | 2 min | HowItWorks.tsx:29 |
| 8 | Wire AuthScreen through i18n (French) | 1 hour | AuthScreen.tsx |
| 9 | Wire LandingPage through i18n (French) | 30 min | LandingPage.tsx |
| 10 | Wire Onboarding through i18n (French) | 15 min | Onboarding.tsx |
| 11 | Wire HowItWorks through i18n (French) | 15 min | HowItWorks.tsx |
| 12 | Wire Lobby through i18n (French) | 30 min | Lobby.tsx |
| 13 | Add deposit fee disclosure | 10 min | LandingPage, HowItWorks |
| 14 | Lower min withdrawal or explain threshold | 5 min | Finance.tsx:181 |
| 15 | Update legal dates to current | 2 min | TermsOfService, PrivacyPolicy |
| 16 | Seed live win feed with 3-5 examples | 15 min | LiveWinFeed or Dashboard |
| 17 | Add post-onboarding guided CTA | 20 min | Dashboard or Onboarding |
| 18 | Remove duplicate 18+ checkbox | 5 min | AuthScreen.tsx |
| 19 | Generate clean referral codes | 15 min | Profile.tsx, server.js |
| 20 | Fix leaderboard `idx` reference error | 2 min | server.js:2831 |

**Total estimated time: ~5-6 hours**

---

## What's Actually Good

- **Server-authoritative game validation** for all 7 game types — properly anti-cheat
- **Atomic Firestore transactions** for all financial operations — no double-spend possible
- **Payment webhook defense-in-depth** — IP validation + API re-verification + idempotency
- **Firestore security rules** — correctly block client-side financial writes
- **Socket.IO reconnection** — well-handled with emission queues, gap detection, 240s opponent timeout
- **PWA with offline shell** — works on poor connections
- **Comprehensive error boundaries** and loading states
- **Dark mode UI** looks polished on screenshots
- **10% platform fee** is competitive for African market

**The core engine is production-ready. The layer between the engine and the user needs work.**
