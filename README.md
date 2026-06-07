# Vantage Gaming (Katika)

A full-stack P2P real-money skill gaming platform for the Cameroonian market — Chess, Checkers, Dice, Ludo, TicTacToe, Pool, and Cards (Whot).

## Architecture

```
┌──────────────────────────┐       ┌──────────────────────────────────┐
│   Frontend (Vite + React) │       │     Backend (Express + Socket.IO) │
│   Netlify SPA + PWA       │◄─────►│     Railway / Node.js             │
│                          │  WSS  │                                  │
│   • React 18 + TypeScript │       │   • Socket.IO 4.7 (real-time)     │
│   • Tailwind CSS 3.4      │       │   • Express REST API              │
│   • Framer Motion         │       │   • Server-authoritative games    │
│   • Firebase Auth SDK     │       │   • Anti-cheat & anomaly detection│
│   • Firebase Firestore SDK│       │   • ELO rating engine (K=32)      │
│   • Socket.IO Client      │       │   • Escrow & settlement system    │
│   • PWA + Service Worker  │       │   • Tournament scheduler          │
│                          │       │   • Helmet + CSP + rate limiting   │
└──────────┬───────────────┘       └───────────────┬──────────────────┘
           │                                       │
           │              ┌──────────────┐         │
           └──────────────┤   Firebase    ├─────────┘
                          │  Firestore    │
                          │              │
                          │  • Users     │
                          │  • Games     │
                          │  • Tournaments│
                          │  • Payments  │
                          │  • Forum     │
                          │  • Disputes  │
                          └──────────────┘
                                    │
                           ┌────────┴────────┐
                           │  Fapshi Payments │
                           │  MTN Mobile Money│
                           │  Orange Money    │
                           │  (FCFA / XAF)    │
                           └─────────────────┘
```

## Tech Stack

| Layer          | Technology                                           |
|----------------|------------------------------------------------------|
| **Frontend**   | React 18, TypeScript (strict), Vite 5, Tailwind CSS  |
| **Backend**    | Node.js, Express 4, Socket.IO 4.7                    |
| **Database**   | Firebase Firestore (NoSQL, real-time subscriptions)  |
| **Auth**       | Firebase Auth (email/password, Google, anonymous)    |
| **Payments**   | Fapshi API (MTN MoMo, Orange Money — FCFA)           |
| **PWA**        | Vite PWA plugin + Workbox service worker             |
| **Testing**    | Vitest 4.x (10+ test suites)                          |
| **Deployment** | Netlify (frontend) + Railway (backend)               |

## Features

### Games
- **Chess** — full PGN/FEN validation via chess.js, server-side move verification
- **Checkers** — custom engine with multi-jump, king promotion, capture enforcement
- **Dice** — server-side crypto random rolls, provably fair
- **Ludo** — anti-teleportation, capture validation, dice entry enforcement
- **TicTacToe** — draw streak detection (3 consecutive = match end)
- **Pool** — full physics engine (collision, friction, pockets), ghost-win prevention, ball-in-hand clamping
- **Cards (Whot)** — classic West African card game

### Platform
- **Real-time P2P matchmaking** with latency-aware pairing and server-side escrow
- **Tournaments** — bracketed tournaments with auto-scheduling, forfeits, and cascading byes
- **ELO ratings** — K=32 ELO calculations after every match
- **Anti-cheat** — behavioral anomaly detection (flags >85% win rate at 20+ games), server-authoritative move validation, rate limiting, shot replay detection
- **Escrow system** — double-escrow deduction with targeted refunds (promo + real balance tracking)
- **Dispute resolution** — file, resolve, and SLA-based auto-resolution (30-min deadline)
- **Bilingual UI** — English & French with auto-detection (services/i18n.tsx)
- **Progressive Web App** — offline support, installable, service worker with runtime caching
- **Dark/Light theme** — class-based Tailwind dark mode, custom `royal`/`gold`/`cam` color scheme
- **Real-time chat** — in-game chat with DOMPurify sanitization
- **Live winner feed** — real-time recent winner broadcast
- **Community forum** — user posts with author-based access control
- **Bug report system** — user-submitted bug reports
- **Referral system** — referral codes with promo balance rewards
- **Sound effects** — Web Audio API synthesized sounds (no audio files needed)

### Admin Dashboard
- User ban/unban management
- Tournament creation, start, cancel, force-result
- Maintenance mode toggle
- Server status & metrics
- Financial oversight

### Security
- **CSP** — Helmet on server + post-build hash generation
- **Rate limiting** — Express (100 req/15min) + per-user socket action (10/sec)
- **Firestore rules** — financial collections strictly server-write-only
- **API key isolation** — Fapshi keys server-side only, never in client bundle
- **Token verification** — Firebase Admin SDK on all authenticated routes
- **IP-validated webhooks** — Fapshi payment webhook restricted to Fapshi IP range
- **Content sanitization** — DOMPurify on all user-generated content

## Directory Structure

```
├── components/           # React UI (App.tsx, game screens, admin, lobby, etc.)
│   └── utils/            # Shared UI helpers (currency formatting)
├── services/             # Client-side service layer
│   ├── AppContext.tsx     # Global state management (useReducer)
│   ├── SocketContext.tsx  # Socket.IO client wrapper with reconnection
│   ├── i18n.tsx           # Bilingual translations (EN/FR)
│   ├── sound.ts           # Web Audio API sound synthesis
│   ├── theme.tsx          # Dark/light theme context
│   ├── fapshi.ts          # Payment gateway client proxy
│   └── firebase/          # Firebase sub-modules (auth, games, users, finance, etc.)
├── hooks/                # Custom React hooks (useGameController.ts)
├── server.js             # Monolithic backend (~3300 lines) — Express + Socket.IO + game logic
├── server/               # Modular game logic & route handlers
│   ├── chessLogic.js
│   ├── checkersLogic.js
│   ├── diceLogic.js
│   ├── ludoLogic.js
│   ├── tictactoeLogic.js
│   └── routes/
├── game-graphics/        # Pool game physics engine (constants, physics, renderer, setup)
├── tests/                # Vitest test suite (10+ files)
├── types.ts              # Central TypeScript type definitions
├── scripts/              # Build helpers (CSP hashes, icons, admin claims)
├── public/               # Static assets (favicon, icons, robots.txt, sitemap)
└── dist/                 # Vite build output
```

## Getting Started

### Prerequisites
- **Node.js** >= 18
- **Firebase project** with Firestore, Auth, and Admin SDK enabled
- **Fapshi account** (for mobile money payments)

### 1. Clone & Install

```bash
git clone <repo-url>
cd Katika
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

#### Client-side (.env)
| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase measurement ID |
| `VITE_SOCKET_URL` | Backend Socket.IO server URL |

#### Server-side (Railway env vars — NEVER in client .env)
| Variable | Description |
|----------|-------------|
| `FAPSHI_API_KEY` | Fapshi API key |
| `FAPSHI_USER_TOKEN` | Fapshi user token |
| `FAPSHI_PAYOUT_API_KEY` | Optional separate Fapshi payout API key |
| `FAPSHI_PAYOUT_USER_TOKEN` | Optional separate Fapshi payout user token |
| `FRONTEND_URL` | CORS origin (Netlify URL) |
| `ADMIN_EMAILS` | Comma-separated admin account emails |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK JSON |
| `SOCKET_AUTH` | Use `enforce` in production |
| `LAUNCH_GAMES` | Server launch scope, default `Chess,Checkers,Dice` |
| `NODE_ENV` | `production` or `development` |

### 3. Firebase Setup

1. Enable **Firestore** in native mode
2. Enable **Firebase Auth** (Email/Password, Google, Anonymous)
3. Generate a service account key and set it as `FIREBASE_SERVICE_ACCOUNT` on the server
4. Deploy `firestore.rules` and `firestore.indexes.json`
5. Set a user's admin claim via `scripts/setAdminClaim.mjs`

### 4. Run Locally

```bash
# Terminal 1 — Frontend dev server (Vite HMR)
npm run dev

# Terminal 2 — Backend server (Express + Socket.IO)
npm start
```

### 5. Build for Production

```bash
npm run build     # Vite build + CSP hash generation
npm run preview   # Preview production build locally
```

## Testing

```bash
npm test                    # Run all tests (vitest)
node tests/e2e_p2p.test.mjs # Manual E2E P2P test
```

Test coverage includes all game logic modules: chess, checkers, dice, ludo, tictactoe, tournaments, pool integration, and pool physics.

## Deployment

### Frontend (Netlify)
- Build command: `npm run build`
- Publish directory: `dist`
- SPA fallback: enabled (`netlify.toml` already configured)

### Backend (Railway)
- Build: Nixpacks auto-detect (`nixpacks.toml`)
- Start command: `node server.js`
- Health check: `GET /health`
- Deploy `railway.toml` for configuration

### Environment Checklist
- [ ] All Firebase config set (both client and server)
- [ ] Fapshi API keys set on server only
- [ ] `FRONTEND_URL` matches Netlify domain (CORS)
- [ ] `ADMIN_EMAILS` set
- [ ] `SOCKET_AUTH=enforce` set
- [ ] `LAUNCH_GAMES=Chess,Checkers,Dice` set
- [ ] `NODE_ENV=production` on both hosts
- [ ] Firestore indexes deployed
- [ ] Firestore rules deployed
- [ ] Service account key available on Railway

## Key Architecture Decisions

- **Monolithic server** — single `server.js` handles Express routes, Socket.IO events, game logic, payments, and scheduling. Favors simplicity and co-location over microservice separation.
- **Server-authoritative** — all game state validated server-side. Client sends actions, server validates and broadcasts. No trust in client game state.
- **View-based routing** — no React Router. Navigation via `view` state reducer + `AnimatePresence` transitions. Lighter bundle, simpler debugging.
- **Double-escrow** — players deposit stakes before matchmaking. Upon game end, winner receives both stakes minus platform fee. Handles promo balance + real balance separation.
- **Idempotent payments** — every payment transaction tracked in `processed_payments` with status checks before crediting. Survives server restarts.

## License

Proprietary — all rights reserved.
