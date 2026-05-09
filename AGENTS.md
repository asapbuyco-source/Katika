# AGENTS.md — Vantage Gaming (Katika)

## Project Overview

Full-stack P2P real-money skill gaming platform for the Cameroonian market. Supports Chess, Checkers, Dice, Ludo, TicTacToe, Pool, and Cards (Whot).

- **Frontend:** React 18 SPA (Vite-bundled), PWA with offline support
- **Backend:** Node.js Express + Socket.IO server (monolithic, ~3300 lines in `server.js`)
- **Database:** Firebase Firestore (NoSQL, real-time subscriptions)
- **Auth:** Firebase Auth (email/password, Google, anonymous)
- **Payments:** Fapshi API (MTN Mobile Money, Orange Money — Cameroon, FCFA)

## Quick Commands

| Command            | What it does                        |
|--------------------|-------------------------------------|
| `npm run dev`      | Start Vite dev server (HMR)         |
| `npm run build`    | Production build + CSP hash gen     |
| `npm run preview`  | Preview production build locally    |
| `npm start`        | Start Express + Socket.IO backend   |
| `npm test`         | Run all tests (vitest)              |

## Directory Structure

```
├── components/       # React UI components (App.tsx, game screens, admin, etc.)
│   └── utils/        # Shared UI helpers
├── services/         # Client-side service layer
│   ├── AppContext.tsx    # Global state (useReducer)
│   ├── SocketContext.tsx # Socket.IO client wrapper
│   ├── firebase/         # Firebase sub-modules (auth, games, users, etc.)
│   ├── fapshi.ts         # Payment gateway client
│   └── i18n.tsx          # Internationalization
├── hooks/            # Custom React hooks (useGameController.ts)
├── server.js         # Monolithic backend: Express + Socket.IO + game logic + API
├── server/           # Modular game logic (chess, checkers, dice, ludo, tictactoe, tournaments)
├── game-graphics/    # Pool game physics/rendering engine
├── tests/            # Vitest test suite
├── types.ts          # Central TypeScript type definitions
├── scripts/          # Build helpers (CSP hashes, icons, admin claims)
├── public/           # Static assets (favicon, icons, robots.txt, sitemap)
├── dist/             # Vite build output
├── vite.config.ts    # Vite + PWA plugin config
├── vitest.config.ts  # Test runner config
├── tsconfig.json     # TypeScript config (strict mode)
├── tailwind.config.js
└── postcss.config.js
```

## Key Architecture

- **View routing:** Manual state-driven (`view` state in App.tsx, no React Router), uses `AnimatePresence` for transitions.
- **State management:** React Context + `useReducer` (AppContext for global state, SocketContext for real-time).
- **Real-time:** Socket.IO 4.7 — server-authoritative game state, client sends actions, server validates and broadcasts.
- **Anti-cheat:** Server-authoritative move validation for all games, rate limiting, behavioral anomaly detection, ghost-win prevention, shot replay detection.
- **Styling:** Tailwind CSS 3.4, dark mode via `class` strategy, custom `royal`/`gold`/`cam` color scheme.
- **CSP:** Helmet on server + post-build hash generation (`scripts/generate-csp-hashes.mjs`).

## Testing

- **Framework:** Vitest 4.x (`vitest run`)
- **Config:** `vitest.config.ts` — environment: `node`, test files in `tests/`
- **Test suite:** 10+ test files covering all game logic modules (chess, checkers, dice, ludo, tictactoe, tournaments, pool integration, pool physics)
- **E2E:** `tests/e2e_p2p.test.mjs` is excluded from vitest (run manually)

## Code Conventions

- TypeScript strict mode (`"strict": true`) for frontend
- Server is plain JavaScript (CommonJS mix — some ESM, some require-style)
- No linting/formatting tools configured (ESLint/Prettier absent)
- Follow existing patterns: functional components with hooks, JSDoc comments, consistent camelCase
- Central type definitions in `types.ts`
- Firebase writes for financial/tournament data go exclusively through server Admin SDK (`firestore.rules` enforces this)

## Environment Variables

Copy `.env.example` → `.env` and fill in:
- `VITE_FIREBASE_*` (6 Firebase config keys)
- `VITE_SOCKET_URL`
- `FAPSHI_API_KEY`, `FAPSHI_USER_TOKEN`
- `FRONTEND_URL`, `ADMIN_SECRET`, `NODE_ENV`
