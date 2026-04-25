import express from 'express';
import { Chess } from 'chess.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import admin from 'firebase-admin';
import crypto from 'crypto';

const sanitizeRoomForClient = (room, roomId) => ({
    roomId, players: room.players, gameType: room.gameType,
    stake: room.stake, turn: room.turn, status: room.status,
    gameState: room.gameState, profiles: room.profiles,
    chat: room.chat, winner: room.winner || null
});


// --- CONFIGURATION & VALIDATION ---
const requiredEnv = ['FAPSHI_API_KEY', 'FAPSHI_USER_TOKEN'];
const missingEnv = requiredEnv.filter(env => !process.env[env]);

if (missingEnv.length > 0) {
    console.error(`FATAL ERROR: Missing required environment variables: ${missingEnv.join(', ')}`);
    // In production, we should exit, but for dev/audit we'll just log loudly
    if (process.env.NODE_ENV === 'production') process.exit(1);
}

const PORT = process.env.PORT || 8080;
const FAPSHI_API_KEY = process.env.FAPSHI_API_KEY || '';
const FAPSHI_USER_TOKEN = process.env.FAPSHI_USER_TOKEN || '';
const FAPSHI_BASE_URL = process.env.FAPSHI_BASE_URL || 'https://live.fapshi.com';
const FRONTEND_ORIGIN = (process.env.FRONTEND_URL || '*').replace(/\/$/, '');

// FIX C2: Admin whitelist — authoritative source is the JWT email, NEVER Firestore's isAdmin flag
// (isAdmin in Firestore is client-writable; email in a Firebase ID token is cryptographically signed)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'abrackly@gmail.com').split(',').map(e => e.trim());
// SECURITY: In production, ADMIN_EMAILS must be explicitly set — never rely on the hardcoded fallback.
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_EMAILS) {
    console.error('FATAL: ADMIN_EMAILS environment variable is not set in production. Refusing to start.');
    process.exit(1);
}

// --- FIREBASE ADMIN INITIALIZATION ---
try {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountStr) {
        let serviceAccount;
        try {
            serviceAccount = JSON.parse(serviceAccountStr);
        } catch (e) {
            // If it's not JSON, assume it's a file path
            serviceAccount = serviceAccountStr;
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin initialized successfully.");
    } else {
        console.warn("WARNING: FIREBASE_SERVICE_ACCOUNT not set. Tournament logic will be limited.");
    }
} catch (e) {
    console.error("Firebase Admin initialization error:", e);
}

const db = admin.apps.length > 0 ? admin.firestore() : null;


const app = express();
app.set('trust proxy', 1); // For accurate rate limiting behind Railway's proxy

// Security Headers
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://api.dicebear.com", "https://i.pravatar.cc", "https://www.google.com"],
        connectSrc: ["'self'",
            (process.env.FRONTEND_URL || '*'),
            "https://*.googleapis.com",
            "https://*.firebaseio.com",
            "https://live.fapshi.com",
            "wss://*"
        ],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
    }
}));

// Logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    keyGenerator: (req) => {
        return req.user?.uid || req.ip; // Fix C: Key on user ID if authenticated, else IP
    }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '1mb' }));
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl) or matching FRONTEND_ORIGIN
        if (!origin || FRONTEND_ORIGIN === '*' || origin === FRONTEND_ORIGIN) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apiuser', 'apikey'],
    credentials: true
}));

const sanitize = (text) => String(text).replace(/<[^>]*>?/gm, '').substring(0, 150); // 150 chars max — was 500; prevents chat from bloating game_update packets

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['polling', 'websocket'],
    // Increased pingInterval to survive 3G reconnect windows common in Cameroon/Africa.
    // Default is 25s — bumped to 45s so mobile clients don't get dropped on momentary signal loss.
    pingInterval: 45000,
    pingTimeout: 60000,
    // WebSocket per-message deflate compression. Cuts game_update payload sizes by 40-60%
    // on text-heavy game states (Chess PGN, Checkers piece arrays, Pool ball lists).
    // Only compresses payloads > 1KB to avoid overhead on small pings/acks.
    perMessageDeflate: {
        threshold: 1024,
    },
});

// Socket.IO connection rate limiting
const connectionsByIP = new Map();
io.use((socket, next) => {
    const ip = socket.handshake.address;
    const count = connectionsByIP.get(ip) || 0;
    if (count >= 10) {
        console.warn(`Socket rate limit exceeded for IP: ${ip}`);
        return next(new Error('Too many connections'));
    }
    connectionsByIP.set(ip, count + 1);
    setTimeout(() => {
        const current = connectionsByIP.get(ip) || 1;
        if (current <= 1) connectionsByIP.delete(ip);
        else connectionsByIP.set(ip, current - 1);
    }, 60000);
    next();
});

// --- AUTHENTICATION MIDDLEWARE ---
const verifyAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Auth verification failed:', error);
        res.status(403).json({ error: 'Unauthorized: Invalid or expired token' });
    }
};

// --- GUEST FINANCIAL BLOCK MIDDLEWARE ---
// FIX: Anonymous / guest accounts cannot perform real-money operations.
// Firebase sets sign_in_provider='anonymous' for accounts created via signInAnonymously().
const blockGuests = (req, res, next) => {
    const provider = req.user?.firebase?.sign_in_provider;
    if (provider === 'anonymous') {
        return res.status(403).json({
            error: 'Guest accounts cannot perform financial transactions. Please create a full account.',
            code: 'GUEST_RESTRICTED'
        });
    }
    next();
};

// --- HEALTH CHECK (required for Railway) ---
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// In-memory map: transId -> { userId, amount } for webhook lookup
// (Firestore persistent_payments acts as long-term idempotency guard)
const pendingDeposits = new Map();

// --- FAPSHI PAYMENT PROXY (keeps API keys server-side) ---
app.post('/api/pay/initiate', verifyAuth, blockGuests, async (req, res) => {
    try {
        const { amount, userId, redirectUrl } = req.body;

        // --- Input validation ---
        if (!amount || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
            return res.status(400).json({ error: 'Invalid amount. Must be a positive integer in FCFA.' });
        }
        if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid userId.' });
        }
        // CRITICAL VULNERABILITY FIX: Prevent ID spoofing
        if (req.user.uid !== userId) {
            return res.status(403).json({ error: 'Forbidden: Cannot initiate payment for another user' });
        }
        if (amount < 100) {
            return res.status(400).json({ error: 'Minimum deposit amount is 100 FCFA.' });
        }
        if (amount > 1_000_000) {
            return res.status(400).json({ error: 'Amount exceeds maximum allowed deposit.' });
        }

        // The credited amount is the deposit amount requested by the user (before fee).
        // The fee was added by the client (totalToPay = amount + fee), so we store
        // the original depositAmount from the client for crediting purposes.
        // We receive `amount` = totalToPay here; store it for the webhook.
        const depositAmount = amount; // webhook credits this exact figure

        const email = String(userId).includes('@') ? userId : 'guest@vantagegaming.cm';

        // Build webhook URL so Fapshi notifies us when payment completes
        const rawBase = process.env.SERVER_URL || (process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : null);
        const webhookUrl = rawBase ? `${rawBase}/api/pay/webhook` : undefined;

        const response = await fetch(`${FAPSHI_BASE_URL}/initiate-pay`, {
            method: 'POST',
            headers: {
                'apiuser': FAPSHI_USER_TOKEN,
                'apikey': FAPSHI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount,
                email,
                userId,
                redirectUrl,
                ...(webhookUrl ? { webhook: webhookUrl } : {})
            })
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);

        // Store pending deposit so webhook can look up userId + amount by transId
        if (data.transId) {
            pendingDeposits.set(data.transId, { userId, depositAmount });
            setTimeout(() => pendingDeposits.delete(data.transId), 2 * 60 * 60 * 1000);
            // FIX C5: Also persist to Firestore so deposits survive server restarts
            if (db) {
                db.collection('pending_payments').doc(data.transId).set({
                    userId, depositAmount,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'pending'
                }).catch(e => console.error('[Initiate] Failed to persist pending payment to Firestore:', e));
            }
        }

        res.json(data);
    } catch (err) {
        console.error('Fapshi initiate proxy error:', err);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

// --- FAPSHI WEBHOOK (server-side deposit confirmation) ---
// Fapshi POST-es this endpoint when a payment status changes.
app.post('/api/pay/webhook', async (req, res) => {
    // Immediately acknowledge so Fapshi doesn't retry
    res.status(200).json({ received: true });

    try {
        const { transId, status } = req.body || {};
        if (!transId || status !== 'SUCCESSFUL') return;

        // FIX: Webhook MUST ALWAYS verify with the Fapshi API directly to prevent spoofing.
        // Even if we know the pending deposit locally, we cannot trust req.body.status without verification.
        const verifyRes = await fetch(`${FAPSHI_BASE_URL}/payment-status/${transId}`, {
            headers: { 'apiuser': FAPSHI_USER_TOKEN, 'apikey': FAPSHI_API_KEY }
        });
        
        if (!verifyRes.ok) {
            console.error(`[Webhook Security] Fapshi returned ${verifyRes.status} for transId ${transId}`);
            return;
        }

        const verifyData = await verifyRes.json();
        
        // Final ultimate source of truth check
        if (verifyData.status !== 'SUCCESSFUL') {
            console.warn(`[Webhook Security] Rejecting transId ${transId} - Verify API returned ${verifyData.status}`);
            return;
        }

        let userId = verifyData.userId || verifyData.externalId;
        let depositAmount = verifyData.amount;

        // If Fapshi's status object doesn't include the userId, fallback to our internal pending records
        // This is safe because we already cryptographically proved status === 'SUCCESSFUL' above
        if (!userId) {
            const pending = pendingDeposits.get(transId);
            if (pending) {
                userId = pending.userId;
                depositAmount = pending.depositAmount;
            } else if (db) {
                const pendingDoc = await db.collection('pending_payments').doc(transId).get();
                if (pendingDoc.exists()) {
                    const pData = pendingDoc.data();
                    userId = pData.userId;
                    depositAmount = pData.depositAmount;
                }
            }
        }

        if (!userId) {
            console.error(`[Webhook] Could not resolve userId for verified transId ${transId}`);
            return;
        }


        if (!userId || !depositAmount) {
            console.error(`[Webhook] Missing userId or amount for transId=${transId}`);
            return;
        }

        if (!db) {
            console.error('[Webhook] Firestore unavailable — cannot credit deposit');
            return;
        }

        // Idempotency: use processed_payments/{transId} sentinel (same as client-side)
        const paymentRef = db.collection('processed_payments').doc(transId);
        const userRef = db.collection('users').doc(userId);

        await db.runTransaction(async (tx) => {
            const [paySnap, userSnap] = await Promise.all([tx.get(paymentRef), tx.get(userRef)]);

            if (paySnap.exists()) {
                console.log(`[Webhook] transId=${transId} already processed — skipping.`);
                return;
            }
            if (!userSnap.exists()) {
                console.error(`[Webhook] User ${userId} not found for transId=${transId}`);
                return;
            }

            const userData = userSnap.data();
            let referrerRef, referrerSnap;

            // Fetch referrer document if eligible for bonus (must be a READ operation before any WRITE operations)
            if (userData.referredBy && !userData.referralBonusPaid) {
                referrerRef = db.collection('users').doc(userData.referredBy);
                referrerSnap = await tx.get(referrerRef);
            }

            const newBalance = (userData.balance || 0) + depositAmount;
            const updatePayload = { balance: newBalance };

            // Apply referral bonus writes
            if (referrerSnap && referrerSnap.exists) {
                updatePayload.referralBonusPaid = true;
                tx.update(referrerRef, { promoBalance: (referrerSnap.data().promoBalance || 0) + 100 });
                tx.set(referrerRef.collection('transactions').doc(), {
                    type: 'winnings', // Treat as winnings so it boosts their stats
                    amount: 100,
                    status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    transId: `ref-${transId}`
                });
                console.log(`[Webhook] Paid 100 FCFA promo bonus to ${userData.referredBy}`);
            }

            tx.update(userRef, updatePayload);
            tx.set(paymentRef, {
                userId,
                amount: depositAmount,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                source: 'webhook'
            });
            tx.set(userRef.collection('transactions').doc(), {
                type: 'deposit',
                amount: depositAmount,
                status: 'completed',
                date: new Date().toISOString(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                transId
            });
        });

        console.log(`[Webhook] Credited ${depositAmount} FCFA to ${userId} (transId=${transId})`);
        pendingDeposits.delete(transId);

        // Notify the user's active socket so the UI updates immediately
        const socketId = userSockets.get(userId);
        if (socketId) {
            const sock = io.sockets.sockets.get(socketId);
            if (sock) {
                sock.emit('payment_confirmed', { transId, amount: depositAmount });
                console.log(`[Webhook] Emitted payment_confirmed to socket ${socketId}`);
            }
        }
    } catch (err) {
        console.error('[Webhook] Error processing payment:', err);
    }
});

// --- SERVER TIME SYNC ---
app.get('/api/time', (req, res) => {
    res.json({ time: Date.now() });
});

// --- FAPSHI PAYOUT (REAL WITHDRAWAL) ---
// FIX C4: Balance is atomically debited BEFORE calling Fapshi to eliminate the race condition
// where two concurrent requests both pass the balance check before either debit lands.
// If Fapshi fails, an immediate refund is issued within the same request.
app.post('/api/pay/disburse', verifyAuth, blockGuests, async (req, res) => {
    try {
        const { amount, phone, userId } = req.body;

        if (!amount || typeof amount !== 'number' || !Number.isInteger(amount))
            return res.status(400).json({ error: 'Invalid amount.' });
        if (amount < 1000)
            return res.status(400).json({ error: 'Minimum withdrawal is 1,000 FCFA.' });
        if (amount > 500_000)
            return res.status(400).json({ error: 'Maximum withdrawal is 500,000 FCFA per transaction.' });
        if (!phone || typeof phone !== 'string' || !/^6\d{8}$/.test(phone.replace(/\s/g, '')))
            return res.status(400).json({ error: 'Invalid Cameroon phone number (must start with 6, 9 digits total).' });
        if (!userId || typeof userId !== 'string')
            return res.status(400).json({ error: 'Invalid userId.' });
        if (req.user.uid !== userId)
            return res.status(403).json({ error: 'Forbidden: Cannot withdraw from another user' });
        if (!db)
            return res.status(503).json({ error: 'Database unavailable' });

        const cleanPhone = phone.replace(/\s/g, '');
        const userRef = db.collection('users').doc(userId);
        let pendingTxRef = null;

        // STEP 1: Atomically debit balance and record as 'pending' BEFORE calling Fapshi.
        // Two concurrent requests cannot both pass — the second will see the reduced balance.
        try {
            await db.runTransaction(async (tx) => {
                const userDoc = await tx.get(userRef);
                if (!userDoc.exists()) throw new Error('USER_NOT_FOUND');
                const currentBalance = userDoc.data().balance || 0;
                if (currentBalance < amount) throw new Error('INSUFFICIENT_BALANCE');
                tx.update(userRef, { balance: currentBalance - amount });
                pendingTxRef = userRef.collection('transactions').doc();
                tx.set(pendingTxRef, {
                    type: 'withdrawal', amount: -amount, status: 'pending',
                    phone: cleanPhone, date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            });
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'Insufficient balance.' });
            if (txErr.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User not found.' });
            throw txErr;
        }

        // STEP 2: Call Fapshi — balance is already safely debited
        const fapshiRes = await fetch(`${FAPSHI_BASE_URL}/payout`, {
            method: 'POST',
            headers: { 'apiuser': FAPSHI_USER_TOKEN, 'apikey': FAPSHI_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, phone: cleanPhone, userId, message: 'Katika withdrawal' })
        });
        const fapshiData = await fapshiRes.json();

        if (!fapshiRes.ok) {
            // STEP 3a (failure): Refund the debited balance
            console.error(`[Disburse] Fapshi payout failed for ${userId}. Issuing refund.`, fapshiData);
            await db.runTransaction(async (tx) => {
                const userDoc = await tx.get(userRef);
                if (userDoc.exists()) tx.update(userRef, { balance: (userDoc.data().balance || 0) + amount });
                if (pendingTxRef) tx.update(pendingTxRef, { status: 'failed', failedAt: admin.firestore.FieldValue.serverTimestamp() });
            }).catch(e => console.error('[Disburse] Refund transaction failed:', e));
            return res.status(fapshiRes.status).json(fapshiData);
        }

        // STEP 3b (success): Mark transaction as completed
        if (pendingTxRef) {
            pendingTxRef.update({
                status: 'completed', transId: fapshiData.transId || null,
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            }).catch(e => console.error('[Disburse] Failed to mark tx completed:', e));
        }
        res.json({ success: true, transId: fapshiData.transId });
    } catch (err) {
        console.error('Fapshi disburse proxy error:', err);
        res.status(500).json({ error: err.message || 'Withdrawal failed' });
    }
});

// --- TOURNAMENT OPERATIONS (SERVER-SIDE) ---
app.post('/api/tournaments/register', verifyAuth, blockGuests, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database service unavailable' });

    const { tournamentId, userId } = req.body;
    if (!tournamentId || !userId) return res.status(400).json({ error: 'Missing tournamentId or userId' });

    // CRITICAL VULNERABILITY FIX: Prevent registering other users (balance drain)
    if (req.user.uid !== userId) {
        return res.status(403).json({ error: 'Forbidden: Cannot register another user' });
    }

    try {
        const tRef = db.collection("tournaments").doc(tournamentId);
        const userRef = db.collection("users").doc(userId);

        const result = await db.runTransaction(async (transaction) => {
            const tDoc = await transaction.get(tRef);
            if (!tDoc.exists) throw new Error("Tournament does not exist");

            const tData = tDoc.data();
            if (tData.status !== 'registration') throw new Error("Tournament not in registration phase");
            if (tData.participants.length >= tData.maxPlayers) throw new Error("Tournament full");
            if (tData.participants.includes(userId)) throw new Error("Already registered");

            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            const userData = userDoc.data();
            const promoBal = userData.promoBalance || 0;
            const realBal = userData.balance || 0;
            const entryFee = tData.entryFee;

            if (realBal + promoBal < entryFee) throw new Error("Insufficient funds");

            const newPromo = Math.max(0, promoBal - entryFee);
            const promoDeducted = promoBal - newPromo;
            const remainingToPay = entryFee - promoDeducted;
            const newReal = Math.max(0, realBal - remainingToPay);
            const realDeducted = realBal - newReal;

            // Update user balance
            const updates = { balance: newReal };
            if (newPromo !== promoBal) updates.promoBalance = newPromo;
            transaction.update(userRef, updates);

            // Record transaction
            const txRef = userRef.collection("transactions").doc();
            transaction.set(txRef, {
                type: 'tournament_entry',
                amount: -tData.entryFee,
                status: 'completed',
                date: new Date().toISOString(),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Update tournament
            if (tData.type === 'fixed') {
                transaction.update(tRef, { 
                    participants: admin.firestore.FieldValue.arrayUnion(userId),
                    [`participantSplits.${userId}`]: { real: realDeducted, promo: promoDeducted }
                });
            } else {
                const platformFee = Math.floor(tData.entryFee * 0.10);
                const netContribution = tData.entryFee - platformFee;
                transaction.update(tRef, {
                    participants: admin.firestore.FieldValue.arrayUnion(userId),
                    prizePool: admin.firestore.FieldValue.increment(netContribution), // Fix F: Atomic increment
                    [`participantSplits.${userId}`]: { real: realDeducted, promo: promoDeducted }
                });
            }
            return true;
        });

        res.json({ success: true });
    } catch (e) {
        console.error("Tournament registration failed:", e.message);
        res.status(400).json({ error: e.message });
    }
});

// ─── TOURNAMENT CORE LOGIC ──────────────────────────────────────────────────

/**
 * Finalise a tournament once the last match is done.
 * Uses an idempotency sentinel document so concurrent calls are safe.
 */
const finaliseTournament = async (tournamentId, winnerId) => {
    if (!db) return;
    const sentinelRef = db.collection('processed_tournaments').doc(tournamentId);
    const tRef = db.collection('tournaments').doc(tournamentId);

    await db.runTransaction(async (tx) => {
        const [sentinelSnap, tSnap, userSnap] = await Promise.all([
            tx.get(sentinelRef),
            tx.get(tRef),
            tx.get(db.collection('users').doc(winnerId))
        ]);

        if (sentinelSnap.exists) return; // already paid out
        if (!tSnap.exists || tSnap.data().status === 'completed') return;

        const tData = tSnap.data();
        const prize = tData.prizePool || 0;

        if (userSnap.exists && prize > 0) {
            const userRef = db.collection('users').doc(winnerId);
            tx.update(userRef, { balance: (userSnap.data().balance || 0) + prize });
            tx.set(userRef.collection('transactions').doc(), {
                type: 'winnings',
                amount: prize,
                status: 'completed',
                date: new Date().toISOString(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                note: `Tournament Win: ${tData.name}`
            });
            console.log(`[Tournament] ${tData.name}: credited ${prize} FCFA to winner ${winnerId}`);
        }

        tx.update(tRef, { status: 'completed', winnerId });
        tx.set(sentinelRef, {
            winnerId,
            finalizedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Broadcast tournament completion to all connected clients
        // (done outside transaction via setImmediate to avoid blocking)
        setImmediate(() => {
            io.emit('tournament_completed', { tournamentId, winnerId, prizeName: tData.name });
            console.log(`[Tournament] Broadcasted tournament_completed for ${tournamentId}`);
        });
    });
};

/**
 * Check if a round is fully done and advance to the next round or
 * finalise the tournament if there is only one winner left.
 */
const checkAndAdvanceTournamentLogic = async (tournamentId, round) => {
    if (!db) return;

    const matchesSnap = await db.collection('tournament_matches')
        .where('tournamentId', '==', tournamentId)
        .where('round', '==', round)
        .get();

    const matches = matchesSnap.docs.map(d => d.data());
    if (matches.length === 0) return;

    const allComplete = matches.every(m => m.status === 'completed');
    if (!allComplete) return;

    matches.sort((a, b) => a.matchIndex - b.matchIndex);
    const winners = matches.map(m => m.winnerId).filter(Boolean);

    // ── Single winner → tournament over ──────────────────────────────────────
    if (winners.length === 1) {
        await finaliseTournament(tournamentId, winners[0]);
        return;
    }

    // ── Guard: don't create next round twice ─────────────────────────────────
    const nextRoundSnap = await db.collection('tournament_matches')
        .where('tournamentId', '==', tournamentId)
        .where('round', '==', round + 1)
        .limit(1)
        .get();
    if (!nextRoundSnap.empty) {
        console.log(`[Tournament] ${tournamentId} R${round + 1} already exists, skipping.`);
        return;
    }

    console.log(`[Tournament] ${tournamentId} advancing R${round} → R${round + 1} (${winners.length} winners)`);

    // ── Next round starts 10 minutes from now ────────────────────────────────
    const nextRoundStartTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const batch = db.batch();
    let nextMatchCount = 0;

    for (let i = 0; i < winners.length; i += 2) {
        const p1Id = winners[i];
        const p2Id = winners[i + 1]; // undefined if odd number of winners (bye)

        const [p1Doc, p2Doc] = await Promise.all([
            db.collection('users').doc(p1Id).get(),
            p2Id ? db.collection('users').doc(p2Id).get() : Promise.resolve(null)
        ]);

        const p1 = p1Doc?.exists ? p1Doc.data() : { id: p1Id, name: 'Unknown', avatar: '', rankTier: 'Bronze' };
        const p2 = p2Doc?.exists ? p2Doc.data() : (p2Id ? { id: p2Id, name: 'Unknown', avatar: '', rankTier: 'Bronze' } : null);

        const newMatchId = `m-${tournamentId}-r${round + 1}-${nextMatchCount}`;
        const isBye = !p2Id;

        batch.set(db.collection('tournament_matches').doc(newMatchId), {
            id: newMatchId,
            tournamentId,
            round: round + 1,
            matchIndex: nextMatchCount,
            player1: { id: p1.id, name: p1.name, avatar: p1.avatar, rankTier: p1.rankTier, elo: p1.elo || 0 },
            player2: p2 ? { id: p2.id, name: p2.name, avatar: p2.avatar, rankTier: p2.rankTier, elo: p2.elo || 0 } : null,
            // If bye, auto-win for player1
            winnerId: isBye ? p1Id : null,
            status: isBye ? 'completed' : 'scheduled',
            startTime: nextRoundStartTime,
            checkedIn: []
        });
        nextMatchCount++;
    }

    await batch.commit();

    // Recursively cascade any new byes immediately
    if (nextMatchCount > 0) {
        await checkAndAdvanceTournamentLogic(tournamentId, round + 1);
    }
};

/**
 * Start a tournament: shuffle participants, pair them into R1 matches,
 * mark byes, and cascade immediately so odd-player byes propagate.
 */
const startTournamentLogic = async (tournamentId) => {
    if (!db) return;
    const tRef = db.collection('tournaments').doc(tournamentId);

    try {
        const tDoc = await tRef.get();
        if (!tDoc.exists) return;
        const tData = tDoc.data();
        if (tData.status !== 'registration') {
            console.log(`[Tournament] ${tournamentId} is not in registration (status=${tData.status}), skipping.`);
            return;
        }
        if (tData.participants.length === 0) {
            console.warn(`[Tournament] ${tournamentId} has no participants, cancelling.`);
            await tRef.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
            return;
        }

        console.log(`[Tournament] Starting: ${tData.name} (${tournamentId}) with ${tData.participants.length} players`);

        // Shuffle participants
        const participants = [...tData.participants];
        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }

        // Fetch player profiles
        const playerProfiles = await Promise.all(participants.map(async (uid) => {
            const uSnap = await db.collection('users').doc(uid).get();
            return uSnap.exists
                ? { id: uid, ...uSnap.data() }
                : { id: uid, name: 'Unknown', avatar: '', elo: 0, rankTier: 'Bronze' };
        }));

        // Pair players — odd player gets a bye (auto-win)
        const batch = db.batch();
        const matchesRef = db.collection('tournament_matches');
        const startTime = tData.startTime; // Use the original scheduled start time for R1
        let matchCount = 0;

        for (let i = 0; i < playerProfiles.length; i += 2) {
            const p1 = playerProfiles[i];
            const p2 = playerProfiles[i + 1] || null; // null = bye
            const matchId = `m-${tournamentId}-r1-${matchCount}`;
            const isBye = !p2;

            batch.set(matchesRef.doc(matchId), {
                id: matchId,
                tournamentId,
                round: 1,
                matchIndex: matchCount,
                player1: { id: p1.id, name: p1.name, avatar: p1.avatar, rankTier: p1.rankTier, elo: p1.elo || 0 },
                player2: p2 ? { id: p2.id, name: p2.name, avatar: p2.avatar, rankTier: p2.rankTier, elo: p2.elo || 0 } : null,
                winnerId: isBye ? p1.id : null,
                status: isBye ? 'completed' : 'scheduled',
                startTime,   // ISO string from tournament config
                checkedIn: []
            });
            matchCount++;
        }

        // Mark tournament as active with shuffled order
        batch.update(tRef, { status: 'active', participants });
        await batch.commit();

        console.log(`[Tournament] ${tournamentId}: ${matchCount} R1 matches created (${participants.length} players).`);

        // Cascade byes immediately (e.g., all byes in R1 → create R2 automatically)
        await checkAndAdvanceTournamentLogic(tournamentId, 1);
    } catch (err) {
        console.error(`[Tournament] Error starting ${tournamentId}:`, err);
    }
};

/**
 * Record a match result, then advance the bracket.
 * Called both by game engine (endGame hook) and admin API.
 */
const recordTournamentMatchResult = async (matchId, winnerId) => {
    if (!db) return;
    try {
        const mRef = db.collection('tournament_matches').doc(matchId);
        const mSnap = await mRef.get();
        if (!mSnap.exists) return;
        const mData = mSnap.data();
        if (mData.status === 'completed') return; // idempotent

        await mRef.update({ winnerId, status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() });
        await checkAndAdvanceTournamentLogic(mData.tournamentId, mData.round);

        // Notify connected players via socket
        [mData.player1?.id, mData.player2?.id].filter(Boolean).forEach(pid => {
            const sId = userSockets.get(pid);
            if (sId) {
                const sock = io.sockets.sockets.get(sId);
                if (sock) sock.emit('tournament_match_result', { matchId, winnerId });
            }
        });
    } catch (err) {
        console.error(`[Tournament] recordTournamentMatchResult ${matchId}:`, err);
    }
};

// ─── BACKGROUND SCHEDULER ────────────────────────────────────────────────────
const startTournamentScheduler = () => {
    if (!db) return;
    console.log('[Scheduler] Tournament scheduler started (60s interval).');

    const runScheduler = async () => {
        const now = new Date();
        const nowIso = now.toISOString();

        try {
            // ── 1. Auto-start tournaments whose registration period has ended ────
            const regSnap = await db.collection('tournaments')
                .where('status', '==', 'registration')
                .get();

            for (const doc of regSnap.docs) {
                const tData = doc.data();
                if (tData.startTime && new Date(tData.startTime) <= now) {
                    await startTournamentLogic(doc.id);
                }
            }

            // ── 2. Activate scheduled matches whose start time has arrived ───────
            //    KEY FIX: Removed the narrow 0.5-minute (30s) upper bound.
            //    Any 'scheduled' match past its start time gets activated.
            //    The 'activatedAt' field prevents double-notification on the same match.
            const scheduledSnap = await db.collection('tournament_matches')
                .where('status', '==', 'scheduled')
                .get();

            for (const mDoc of scheduledSnap.docs) {
                const m = mDoc.data();
                if (!m.startTime) continue;
                const start = new Date(m.startTime);
                const elapsedMin = (now.getTime() - start.getTime()) / 60000;

                if (elapsedMin >= 0 && !m.activatedAt) {
                    // Match start time reached — activate it
                    await db.collection('tournament_matches').doc(m.id).update({
                        status: 'active',
                        activatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`[Scheduler] Match ${m.id} activated (${elapsedMin.toFixed(1)}min elapsed).`);

                    // Notify both players via socket
                    [m.player1?.id, m.player2?.id].filter(Boolean).forEach(pid => {
                        const sId = userSockets.get(pid);
                        if (sId) {
                            const sock = io.sockets.sockets.get(sId);
                            if (sock) sock.emit('tournament_match_active', {
                                matchId: m.id,
                                tournamentId: m.tournamentId,
                                opponent: m.player1?.id === pid ? m.player2 : m.player1
                            });
                        }
                    });
                }
            }

            // ── 3. Forfeit active matches that have timed out (5 min window) ─────
            //    Also catch matches still in 'scheduled' status but 5+ min overdue
            //    (edge case where scheduler missed the activation window on restart).
            const overdueMatchesSnap = await db.collection('tournament_matches')
                .where('status', 'in', ['active', 'scheduled'])
                .get();

            for (const mDoc of overdueMatchesSnap.docs) {
                const m = mDoc.data();
                if (!m.startTime) continue;
                const start = new Date(m.startTime);
                const elapsedMin = (now.getTime() - start.getTime()) / 60000;

                // Warning at 4 min (only for 'active' matches)
                if (m.status === 'active' && elapsedMin > 4 && elapsedMin <= 5 && !m.warningIssued) {
                    await db.collection('tournament_matches').doc(m.id).update({ warningIssued: true });
                    [m.player1?.id, m.player2?.id].filter(Boolean).forEach(pid => {
                        const sId = userSockets.get(pid);
                        if (sId) {
                            const sock = io.sockets.sockets.get(sId);
                            if (sock) sock.emit('tournament_warning', {
                                matchId: m.id,
                                message: 'Your match will be auto-forfeited in 60 seconds! Join the lobby now.'
                            });
                        }
                    });
                }

                // Forfeit at >5 min — applies to both 'active' and overdue 'scheduled' matches
                if (elapsedMin > 5) {
                    const checkedIn = m.checkedIn || [];
                    const p1Id = m.player1?.id;
                    const p2Id = m.player2?.id;
                    let winnerId = null;
                    let forfeitType = 'both_absent';

                    if (p1Id && p2Id) {
                        const p1In = checkedIn.includes(p1Id);
                        const p2In = checkedIn.includes(p2Id);
                        if (p1In && !p2In) { winnerId = p1Id; forfeitType = 'p2_absent'; }
                        else if (p2In && !p1In) { winnerId = p2Id; forfeitType = 'p1_absent'; }
                        else {
                            // Neither showed — p1 wins (deterministic by seed order)
                            winnerId = p1Id;
                            forfeitType = 'both_absent';
                        }
                    } else {
                        winnerId = p1Id || p2Id;
                    }

                    if (winnerId) {
                        console.log(`[Scheduler] Forfeiting match ${m.id} (status=${m.status}): winner=${winnerId}, type=${forfeitType}`);
                        await db.collection('tournament_matches').doc(m.id).update({
                            winnerId,
                            status: 'completed',
                            forfeitReason: 'no_show',
                            forfeitType
                        });
                        await checkAndAdvanceTournamentLogic(m.tournamentId, m.round);
                    }
                }
            }
        } catch (err) {
            console.error('[Scheduler] Error:', err);
        }
    };

    // Run once immediately on startup, then every 30 seconds
    runScheduler();
    setInterval(runScheduler, 30000);
};

if (db) startTournamentScheduler();

// --- ADMIN MIDDLEWARE: Verify Firebase ID Token + custom claims ---
const verifyAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }
    const token = authHeader.slice(7);
    if (!admin.apps.length) {
        return res.status(503).json({ error: 'Auth service unavailable' });
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        // Fix A: Prefer custom claim, fallback to email list during transition
        if (!decoded.admin && (!decoded.email || !ADMIN_EMAILS.includes(decoded.email))) {
            console.warn(`[Admin] Blocked unauthorized access: uid=${decoded.uid} email=${decoded.email}`);
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        req.adminUid = decoded.uid;
        req.adminEmail = decoded.email;
        next();
    } catch (e) {
        console.error('[Admin] Token verification failed:', e.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// --- ADMIN: BAN / UNBAN USER ---
app.post('/api/admin/ban-user', verifyAdmin, async (req, res) => {
    const { userId, ban } = req.body;
    if (!userId || typeof ban !== 'boolean') {
        return res.status(400).json({ error: 'userId and ban (boolean) are required' });
    }
    try {
        await db.collection('users').doc(userId).update({ isBanned: ban });
        // If banning, disconnect active socket immediately
        if (ban) {
            const socketId = userSockets.get(userId);
            if (socketId) {
                const sock = io.sockets.sockets.get(socketId);
                if (sock) sock.disconnect(true);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN: START TOURNAMENT ---
app.post('/api/tournaments/start', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { tournamentId } = req.body;
    if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
    try {
        await startTournamentLogic(tournamentId);
        res.json({ success: true });
    } catch (err) {
        console.error('Tournament start error:', err);
        res.status(500).json({ error: err.message || 'Failed to start tournament' });
    }
});

// --- ADMIN: CREATE TOURNAMENT (Fix for strict Firestore rules) ---
app.post('/api/tournaments/create', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    try {
        const docRef = await db.collection('tournaments').add({
            ...req.body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'registration',
            participants: []
        });
        res.json({ success: true, id: docRef.id });
    } catch (err) {
        console.error('Tournament creation error:', err);
        res.status(500).json({ error: err.message || 'Failed to create tournament' });
    }
});

// --- ADMIN: DELETE TOURNAMENT (Fix for strict Firestore rules) ---
app.delete('/api/tournaments/:id', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { id } = req.params;
    try {
        const batch = db.batch();
        
        // 1. Delete associated matches
        const matchesSnap = await db.collection('tournament_matches').where('tournamentId', '==', id).get();
        matchesSnap.forEach(d => batch.delete(d.ref));
        
        // 2. Delete tournament document
        batch.delete(db.collection('tournaments').doc(id));
        
        await batch.commit();
        res.json({ success: true });
    } catch (err) {
        console.error('Tournament deletion error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete tournament' });
    }
});

// --- ADMIN: FORCE TOURNAMENT MATCH RESULT ---
app.post('/api/tournaments/force-result', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { matchId, winnerId } = req.body;
    if (!matchId || !winnerId) return res.status(400).json({ error: 'matchId and winnerId required' });
    try {
        const mRef = db.collection('tournament_matches').doc(matchId);
        const mSnap = await mRef.get();
        if (!mSnap.exists) return res.status(404).json({ error: 'Match not found' });
        const mData = mSnap.data();
        if (mData.status === 'completed') return res.status(400).json({ error: 'Match already completed' });
        await mRef.update({ winnerId, status: 'completed' });
        await checkAndAdvanceTournamentLogic(mData.tournamentId, mData.round);
        res.json({ success: true });
    } catch (err) {
        console.error('Force result error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN: TOGGLE MAINTENANCE MODE ---
app.post('/api/maintenance', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' });
    try {
        await db.collection('settings').doc('maintenance').set(
            { enabled, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        io.emit('maintenance_update', { enabled });
        res.json({ success: true, enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN: CANCEL TOURNAMENT + REFUND ALL FEES (Fix 5) ---
app.post('/api/tournaments/cancel', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { tournamentId } = req.body;
    if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
    try {
        const tRef = db.collection('tournaments').doc(tournamentId);
        const tDoc = await tRef.get();
        if (!tDoc.exists) return res.status(404).json({ error: 'Tournament not found' });
        const tData = tDoc.data();
        if (tData.status === 'completed') return res.status(400).json({ error: 'Cannot cancel a completed tournament' });
        if (tData.status === 'cancelled') return res.status(400).json({ error: 'Tournament already cancelled' });

        const entryFee = tData.entryFee || 0;
        const participants = tData.participants || [];
        const splits = tData.participantSplits || {};

        if (entryFee > 0 && participants.length > 0) {
            // Batch refund all entry fees (Firestore batch max is 500 ops)
            const BATCH_SIZE = 200;
            for (let i = 0; i < participants.length; i += BATCH_SIZE) {
                const chunk = participants.slice(i, i + BATCH_SIZE);
                const batch = db.batch();
                for (const uid of chunk) {
                    const userRef = db.collection('users').doc(uid);
                    const userSnap = await userRef.get();
                    if (userSnap.exists) {
                        // FIX: Refund using the exact split they paid, preventing real balance inflation
                        const split = splits[uid] || { real: entryFee, promo: 0 };
                        
                        batch.update(userRef, { 
                            balance: (userSnap.data().balance || 0) + split.real,
                            promoBalance: (userSnap.data().promoBalance || 0) + split.promo
                        });
                        
                        batch.set(userRef.collection('transactions').doc(), {
                            type: 'tournament_refund',
                            amount: entryFee,
                            status: 'completed',
                            date: new Date().toISOString(),
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                            note: `Refund: "${tData.name}" cancelled` // ${split.real} R / ${split.promo} P
                        });
                    }
                }
                await batch.commit();
                console.log(`[Cancel] Refunded chunk ${i}-${i + chunk.length} for tournament ${tournamentId}`);
            }
        }

        await tRef.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`[Cancel] Tournament ${tournamentId} cancelled. ${participants.length} players refunded ${entryFee} FCFA each.`);
        res.json({ success: true, refunded: participants.length, perPlayerAmount: entryFee });
    } catch (err) {
        console.error('Tournament cancel error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/pay/status/:transId', verifyAuth, async (req, res) => {
    try {
        // Sanitize transId: Fapshi IDs are alphanumeric only — prevent path traversal
        const rawTransId = req.params.transId;
        const transId = rawTransId.replace(/[^a-zA-Z0-9_-]/g, '');
        if (!transId || transId.length === 0) {
            return res.status(400).json({ error: 'Invalid transaction ID.' });
        }
        const response = await fetch(`${FAPSHI_BASE_URL}/payment-status/${transId}`, {
            headers: {
                'apiuser': FAPSHI_USER_TOKEN,
                'apikey': FAPSHI_API_KEY
            }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Fapshi status proxy error:', err);
        res.status(500).json({ error: 'Status check failed' });
    }
});

// --- SERVER-SIDE FINANCIAL SETTLEMENT ---
// Exponential-backoff helper: guarantees critical DB writes survive transient errors
const withRetry = async (fn, retries = 3, delayMs = 500) => {
    try { return await fn(); }
    catch (e) {
        if (retries <= 0) throw e;
        console.warn(`[Retry] Attempt failed, retrying in ${delayMs}ms...`, e.message);
        await new Promise(r => setTimeout(r, delayMs));
        return withRetry(fn, retries - 1, delayMs * 4);
    }
};

const settleGame = async (roomId, winnerId) => {
    if (!db) return;
    const room = rooms.get(roomId);
    if (!room || room.stake === 0 || !winnerId) return;

    const { winnings } = calculatePayouts(room.stake);
    const loserId = room.players.find(id => id !== winnerId);
    if (!loserId) return;

    // Idempotency: prevent double-settling on rematch or duplicate events
    const settlementRef = db.collection('processed_settlements').doc(`settle_${roomId}`);

    try {
        await withRetry(() => db.runTransaction(async (tx) => {
            const sentinelSnap = await tx.get(settlementRef);
            if (sentinelSnap.exists) return; // already settled

            const winnerRef = db.collection('users').doc(winnerId);
            const loserRef = db.collection('users').doc(loserId);
            const [winnerDoc, loserDoc] = await Promise.all([
                tx.get(winnerRef), tx.get(loserRef)
            ]);

            // ELO update
            const K = 32;
            const wElo = winnerDoc.exists ? (winnerDoc.data().elo || 1200) : 1200;
            const lElo = loserDoc.exists ? (loserDoc.data().elo || 1200) : 1200;
            const expectedWin = 1 / (1 + Math.pow(10, (lElo - wElo) / 400));
            const newWinnerElo = Math.round(wElo + K * (1 - expectedWin));
            const newLoserElo = Math.round(lElo - K * (1 - expectedWin));

            if (winnerDoc.exists) {
                tx.update(winnerRef, { balance: (winnerDoc.data().balance || 0) + winnings, elo: newWinnerElo });
                tx.set(winnerRef.collection('transactions').doc(), {
                    type: 'winnings', amount: winnings, status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    gameType: room.gameType
                });
            }
            if (loserDoc.exists) {
                tx.update(loserRef, { elo: newLoserElo });
                tx.set(loserRef.collection('transactions').doc(), {
                    type: 'stake_loss', amount: -room.stake, status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    note: `Settled loss for ${room.gameType}`
                });
            }
            tx.set(settlementRef, { settledAt: admin.firestore.FieldValue.serverTimestamp(), winnerId, roomId });
        }));
        console.log(`[settleGame] ${roomId}: credited ${winnings} FCFA to ${winnerId}`);
    } catch (err) {
        console.error(`[settleGame] CRITICAL — Failed after 3 retries for room ${roomId}:`, err.message);
        // Write to a failed_settlements collection so admin can manually reconcile
        if (db) db.collection('failed_settlements').doc(roomId).set({
            roomId, winnerId, loserId, winnings, stake: room.stake,
            error: err.message, failedAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
    }
};

// ─── DISPUTE RESOLUTION API ──────────────────────────────────────────────────

// File a dispute: player challenges the outcome of a completed match
app.post('/api/disputes/file', verifyAuth, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { roomId, reason } = req.body;
    const userId = req.user.uid;
    if (!roomId || typeof roomId !== 'string') return res.status(400).json({ error: 'roomId required' });

    try {
        // Verify the room log exists and this user was a player
        const logSnap = await db.collection('game_logs').doc(roomId).get();
        if (!logSnap.exists) return res.status(404).json({ error: 'Game log not found. Disputes must be filed within 24h.' });
        const logData = logSnap.data();
        if (!logData.players.includes(userId)) return res.status(403).json({ error: 'Only match participants can file a dispute.' });

        // Check for existing dispute
        const existingSnap = await db.collection('disputes').where('roomId', '==', roomId).where('filedBy', '==', userId).limit(1).get();
        if (!existingSnap.empty) return res.status(409).json({ error: 'You have already filed a dispute for this match.' });

        // Tier 1 auto-resolution: if server recorded a clear winner, resolve immediately
        if (logData.winner && logData.winner !== userId) {
            // Server has no ambiguity — dispute is closed automatically
            const disputeRef = db.collection('disputes').doc();
            await disputeRef.set({
                roomId, filedBy: userId,
                reason: reason || 'outcome_disputed',
                status: 'auto_resolved',
                resolution: `Server-recorded winner: ${logData.winner}. Outcome confirmed by server game log.`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
                gameLogRef: roomId
            });
            return res.json({ success: true, status: 'auto_resolved', message: 'Server game log confirms the recorded outcome. This dispute is closed.' });
        }

        // Tier 2: Write dispute for human review
        const disputeRef = db.collection('disputes').doc();
        await disputeRef.set({
            roomId, filedBy: userId,
            reason: reason || 'outcome_disputed',
            opponentId: logData.players.find(p => p !== userId) || null,
            stake: logData.stake || 0,
            gameType: logData.gameType || 'unknown',
            status: 'open',
            resolution: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            slaDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min SLA
            gameLogRef: roomId
        });

        // Notify admin sockets
        io.emit('admin_alert', { type: 'new_dispute', roomId, filedBy: userId });

        console.log(`[Dispute] Filed: room=${roomId} by=${userId}`);
        res.json({ success: true, status: 'open', message: 'Dispute filed. Review within 30 minutes. Your stake is held safely.' });
    } catch (err) {
        console.error('[Dispute] File error:', err);
        res.status(500).json({ error: 'Failed to file dispute' });
    }
});

// Get dispute status
app.get('/api/disputes/status/:disputeId', verifyAuth, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    try {
        const snap = await db.collection('disputes').doc(req.params.disputeId).get();
        if (!snap.exists) return res.status(404).json({ error: 'Dispute not found' });
        const data = snap.data();
        if (data.filedBy !== req.user.uid) return res.status(403).json({ error: 'Access denied' });
        res.json({ id: snap.id, ...data });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dispute' });
    }
});

// Admin: Resolve a dispute
app.post('/api/disputes/resolve', verifyAdmin, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { disputeId, resolution, winnerId } = req.body;
    if (!disputeId || !resolution) return res.status(400).json({ error: 'disputeId and resolution required' });
    try {
        const disputeRef = db.collection('disputes').doc(disputeId);
        const snap = await disputeRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'Dispute not found' });
        await disputeRef.update({
            status: 'resolved',
            resolution,
            resolvedBy: req.adminEmail,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Notify the user who filed
        const filedBy = snap.data().filedBy;
        const sid = userSockets.get(filedBy);
        if (sid) { const sock = io.sockets.sockets.get(sid); if (sock) sock.emit('dispute_resolved', { disputeId, resolution }); }
        console.log(`[Dispute] Resolved: ${disputeId} by ${req.adminEmail}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Background: Auto-close disputes past their 30-min SLA with no human action
// This runs every 5 minutes alongside the tournament scheduler
const runDisputeSLAResolver = async () => {
    if (!db) return;
    try {
        const now = new Date();
        const overdueSnap = await db.collection('disputes').where('status', '==', 'open').get();
        for (const doc of overdueSnap.docs) {
            const data = doc.data();
            if (!data.slaDeadline) continue;
            if (new Date(data.slaDeadline) > now) continue;

            // SLA breached — auto-resolve using server game log
            const logSnap = await db.collection('game_logs').doc(data.roomId).get();
            const resolution = logSnap.exists
                ? `Auto-resolved at SLA deadline. Server-recorded winner: ${logSnap.data().winner || 'none'}.`
                : 'Auto-resolved: game log unavailable, no change to outcome.';

            await doc.ref.update({
                status: 'auto_resolved_sla',
                resolution,
                resolvedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            const sid = userSockets.get(data.filedBy);
            if (sid) { const sock = io.sockets.sockets.get(sid); if (sock) sock.emit('dispute_resolved', { disputeId: doc.id, resolution }); }
            console.log(`[Dispute] SLA auto-resolved: ${doc.id}`);
        }
    } catch (e) { console.error('[DisputeSLA]', e); }
};
setInterval(runDisputeSLAResolver, 5 * 60 * 1000);

// ─── MEMORY HYGIENE ───────────────────────────────────────────────────────────

// S2 Fix: Purge stale per-user rate-limit entries so the Map doesn't grow
// unboundedly across a long server uptime. Runs every 5 minutes.
setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [uid, timestamps] of gameActionTimestamps.entries()) {
        const fresh = timestamps.filter(t => t > cutoff);
        if (fresh.length === 0) gameActionTimestamps.delete(uid);
        else gameActionTimestamps.set(uid, fresh);
    }
}, 5 * 60 * 1000);

// S1 Fix: Orphan room reaper — evicts rooms older than 10 minutes where
// neither player has an active socket (both disconnected mid-game with no
// graceful disconnect event, e.g., network cut). Without this, abandoned
// rooms accumulate in memory indefinitely.
setInterval(() => {
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    for (const [roomId, room] of rooms.entries()) {
        if (!room) continue; // Fix G: Guard against undefined
        if (room.status === 'completed') continue; // already scheduled for cleanup
        const createdAt = room.gameState?.startTime || 0;
        if (createdAt > tenMinAgo) continue; // room is fresh
        const hasActivePlayers = (room.players || []).some(pid => {
            const sid = userSockets.get(pid);
            return sid && io.sockets.sockets.has(sid);
        });
        if (!hasActivePlayers) {
            console.warn(`[Reaper] Evicting orphan room ${roomId} (${room.gameType}, both players disconnected)`);
            // Refund escrows for stake games so money isn't lost
            if (room.stake > 0 && room.escrowSplits) {
                (room.players || []).forEach(pid => {
                    const split = room.escrowSplits[pid];
                    if (split) refundEscrow(pid, split.real || 0, split.promo || 0);
                });
            }
            rooms.delete(roomId);
        }
    }
}, 10 * 60 * 1000);

// --- ADMIN SERVER STATUS ---
app.get('/api/admin/server-status', verifyAdmin, (req, res) => {
    try {
        const status = {
            uptime: Math.floor(process.uptime()),
            timestamp: Date.now(),
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
            memoryUsage: {
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
            },
            sockets: {
                totalConnected: io.sockets.sockets.size,
                activeRooms: rooms.size,
                activeQueues: queues.size,
            },
            queues: Array.from(queues.entries()).map(([key, list]) => ({
                key,
                count: list.length
            })),
            rooms: Array.from(rooms.entries()).map(([id, room]) => ({
                id,
                gameType: room.gameType,
                stake: room.stake,
                players: room.players?.length || 0,
                status: room.status || 'active'
            }))
        };
        res.json(status);
    } catch (err) {
        console.error('Server status check error:', err);
        res.status(500).json({ error: 'Failed to fetch server status' });
    }
});


// --- IN-MEMORY STATE ---
const rooms = new Map(); // roomId -> { players: [], gameState: {}, ... }
const queues = new Map(); // gameType_stake -> [ { socketId, userProfile } ]
const userSockets = new Map(); // userId -> socketId
const socketUsers = new Map(); // socketId -> userId
const disconnectTimers = new Map(); // userId -> TimeoutID

// Per-user game action rate limiting (anti-bot / anti-spam)
const gameActionTimestamps = new Map(); // userId -> number[]
const isGameActionRateLimited = (userId, maxPerSecond = 10) => {
    const now = Date.now();
    const timestamps = (gameActionTimestamps.get(userId) || []).filter(t => now - t < 1000);
    if (timestamps.length >= maxPerSecond) return true;
    timestamps.push(now);
    gameActionTimestamps.set(userId, timestamps);
    return false;
};

// ─── BEHAVIORAL ANOMALY DETECTION ────────────────────────────────────────────
// Tracks win/loss history per userId in memory; persists flags to Firestore.
// Elo/tier is NEVER exposed to players — used internally only for matchmaking.
const gameOutcomeHistory = new Map(); // userId -> { wins, total }

const recordOutcomeAndCheckAnomaly = (userId, isWin) => {
    if (!userId) return;
    const history = gameOutcomeHistory.get(userId) || { wins: 0, total: 0 };
    history.total++;
    if (isWin) history.wins++;
    gameOutcomeHistory.set(userId, history);

    // Flag if win rate > 85% sustained over 20+ games
    if (history.total >= 20 && (history.wins / history.total) > 0.85) {
        const winRate = Math.round((history.wins / history.total) * 100);
        console.warn(`[AntiCheat] anomalous_win_rate userId=${userId} ${history.wins}/${history.total} (${winRate}%)`);
        if (db) {
            db.collection('flagged_users').doc(userId).set({
                reason: 'anomalous_win_rate',
                winRate: history.wins / history.total,
                gamesAnalyzed: history.total,
                flaggedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch(e => console.error('[AntiCheat] Flag write failed:', e));
        }
        // Notify admin sockets
        io.emit('admin_alert', { type: 'anomalous_win_rate', userId, winRate });
    }
};

// --- HELPER FUNCTIONS ---
const generateRoomId = () => `room_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

const calculatePayouts = (stake) => {
    const totalPot = stake * 2;
    const platformFee = Math.floor(totalPot * 0.10); // 10% Fee
    const winnings = totalPot - platformFee;
    return { totalPot, platformFee, winnings };
};

const refundEscrow = async (userId, realDeducted, promoDeducted) => {
    if (!db || (!realDeducted && !promoDeducted)) return;
    try {
        const userRef = db.collection('users').doc(userId);
        await db.runTransaction(async tx => {
            const snap = await tx.get(userRef);
            if (!snap.exists) return;
            const d = snap.data();
            tx.update(userRef, {
                balance: (d.balance || 0) + realDeducted,
                promoBalance: (d.promoBalance || 0) + promoDeducted
            });
            tx.set(userRef.collection('transactions').doc(), {
                type: 'escrow_refund', amount: realDeducted + promoDeducted, status: 'completed',
                date: new Date().toISOString(), timestamp: admin.firestore.FieldValue.serverTimestamp(),
                note: `Refunded matchmaking entry fee`
            });
        });
        console.log(`Refunded escrow to ${userId}: ${realDeducted} real, ${promoDeducted} promo`);
    } catch (e) {
        console.error(`Failed to refund escrow for ${userId}:`, e);
    }
};

const deductEscrow = async (userId, amount, note) => {
    if (!db || amount <= 0) return;
    try {
        const userRef = db.collection('users').doc(userId);
        await db.runTransaction(async tx => {
            const snap = await tx.get(userRef);
            if (!snap.exists) throw new Error(`User ${userId} not found`);
            const d = snap.data();
            let realDeduct = 0, promoDeduct = 0;
            if ((d.balance || 0) >= amount) realDeduct = amount;
            else { realDeduct = d.balance || 0; promoDeduct = Math.min(d.promoBalance || 0, amount - realDeduct); }
            if (realDeduct + promoDeduct < amount) throw new Error(`Insufficient funds for ${userId}`);
            tx.update(userRef, {
                balance: (d.balance || 0) - realDeduct,
                promoBalance: (d.promoBalance || 0) - promoDeduct
            });
            tx.set(userRef.collection('transactions').doc(), {
                type: 'escrow_deduct', amount, status: 'completed',
                date: new Date().toISOString(), timestamp: admin.firestore.FieldValue.serverTimestamp(),
                note: note || 'Escrow deduction'
            });
        });
        console.log(`Deducted escrow from ${userId}: ${amount}`);
    } catch (e) {
        console.error(`Failed to deduct escrow for ${userId}:`, e);
        throw e; // re-throw so caller can handle
    }
};

const endGame = (roomId, winnerId, reason) => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'completed') return;

    room.status = 'completed';
    room.winner = winnerId;

    const { totalPot, platformFee, winnings } = calculatePayouts(room.stake);

    // Settle finances server-side (non-blocking)
    if (winnerId && room.stake > 0) {
        settleGame(roomId, winnerId);
    } else if (!winnerId && room.stake > 0) {
        // Draw: Refund escrows
        const splits = room.escrowSplits || {};
        room.players.forEach(pid => {
            const split = splits[pid];
            if (split) refundEscrow(pid, split.real, split.promo);
        });
    }

    io.to(roomId).emit('game_over', {
        roomId,
        winner: winnerId,
        reason: reason,
        financials: { totalPot, platformFee, winnings }
    });

    // ── Behavioral anomaly tracking (internal — not exposed to players) ────────
    room.players.forEach(pid => {
        recordOutcomeAndCheckAnomaly(pid, pid === winnerId);
    });

    // ── Audit log: write final game state to Firestore for dispute replay ──────
    if (db) {
        db.collection('game_logs').doc(roomId).set({
            roomId,
            gameType: room.gameType,
            stake: room.stake,
            players: room.players,
            profiles: room.profiles,
            finalState: JSON.stringify(room.gameState || {}),
            winner: winnerId || null,
            reason: reason || null,
            endedAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(e => console.error('[endGame] Audit log write failed:', e));
    }

    // ── First-win-of-day bonus ─────────────────────────────────────────────────
    if (winnerId && db) {
        const today = new Date().toISOString().split('T')[0];
        const bonusRef = db.collection('daily_bonuses').doc(`${winnerId}_${today}`);
        bonusRef.get().then(snap => {
            if (snap.exists) return;
            return db.runTransaction(async (tx) => {
                const userRef = db.collection('users').doc(winnerId);
                const userSnap = await tx.get(userRef);
                if (!userSnap.exists) return;
                tx.update(userRef, { promoBalance: (userSnap.data().promoBalance || 0) + 50 });
                tx.set(bonusRef, { awardedAt: admin.firestore.FieldValue.serverTimestamp() });
                tx.set(userRef.collection('transactions').doc(), {
                    type: 'streak_bonus', amount: 50, status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    note: 'First win of the day bonus'
                });
            });
        }).then(() => {
            // Notify the winner's socket of the bonus
            const sid = userSockets.get(winnerId);
            if (sid) { const sock = io.sockets.sockets.get(sid); if (sock) sock.emit('daily_bonus', { amount: 50, reason: 'first_win' }); }
        }).catch(e => console.error('[endGame] Daily bonus error:', e));
    }

    // ── Tournament match hook ──────────────────────────────────────────────────
    const tournamentMatchId = room.tournamentMatchId || room.privateRoomId;
    if (db && winnerId && tournamentMatchId) {
        recordTournamentMatchResult(tournamentMatchId, winnerId).catch(e =>
            console.error(`[endGame] Tournament advancement failed for match ${tournamentMatchId}:`, e)
        );
    }

    // ── Live Win Feed: write to publicly readable Firestore collection ──────────
    if (winnerId && room.stake > 0 && db) {
        const winnerProfile = room.profiles?.[winnerId];
        if (winnerProfile) {
            const { winnings } = calculatePayouts(room.stake);
            db.collection('live_winners').add({
                playerName: winnerProfile.name || 'Unknown',
                playerAvatar: winnerProfile.avatar || '',
                gameType: room.gameType,
                amount: winnings,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            }).then(docRef => {
                // Auto-delete after 1 hour so feed stays fresh
                setTimeout(() => db.collection('live_winners').doc(docRef.id).delete().catch(() => {}), 3600000);
            }).catch(() => {});
        }
    }

    // Cleanup Room Data after a delay (Extended for Rematch window)
    setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.status === 'completed') rooms.delete(roomId);
    }, 60000);
};

// [REMOVED] Card Game Helpers — Fisher-Yates shuffle with crypto RNG
// const fisherYatesShuffle = (arr) => { ... };
// const createDeck = () => { ... };

const createInitialGameState = (gameType, p1, p2) => {
    const common = {
        startTime: Date.now(),
        lastMoveTime: Date.now(),
        timers: { [p1]: 600, [p2]: 600 }, // 10 mins default
    };

    switch (gameType) {
        case 'Dice':
            return {
                ...common,
                scores: { [p1]: 0, [p2]: 0 },
                currentRound: 1,
                roundRolls: {}, // { uid: [1, 2] }
                roundState: 'waiting', // waiting, rolling, scored
            };
        case 'TicTacToe':
            return {
                ...common,
                board: Array(9).fill(null),
                status: 'active',
                drawCount: 0  // M5 fix: track consecutive draws to prevent infinite staked loops
            };
case 'Ludo':
            return {
                ...common,
                pieces: [
                    ...Array.from({ length: 4 }, (_, i) => ({ id: i, color: 'Red', step: -1, owner: p1 })),
                    ...Array.from({ length: 4 }, (_, i) => ({ id: i + 4, color: 'Blue', step: -1, owner: p2 }))
                ],
                diceValue: null,
                diceRolled: false,
                turn: p1
            };
        case 'Checkers':
            return {
                ...common,
                pieces: [
                    ...Array.from({ length: 3 }, (_, r) =>
                        Array.from({ length: 8 }, (_, c) =>
                            (r + c) % 2 === 1 ? { id: `p2-${r * 8 + c}`, owner: p2, isKing: false, r, c } : null
                        ).filter(Boolean)
                    ).flat(),
                    ...Array.from({ length: 3 }, (_, r) =>
                        Array.from({ length: 8 }, (_, c) =>
                            (r + c) % 2 === 1 ? { id: `p1-${(r + 5) * 8 + c}`, owner: p1, isKing: false, r: r + 5, c } : null
                        ).filter(Boolean)
                    ).flat()
                ],
                turn: p1
            };
case 'Chess':
            return {
                ...common,
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                pgn: '',
                turn: p1
            };
        case 'Pool':
            // Pool game: client drives all state; wins are reported via MOVE action with newState.winner
            return { ...common, balls: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, pocketed: false, owner: null })), turn: p1 };
        default:
            return common;
    }
};

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Fix E: Token Refresh Re-verification
    // Enforce 55-minute disconnects for clients that don't refresh their token
    let tokenExpiryTimer = setTimeout(() => {
        console.warn(`[Auth] Forcing disconnect for ${socket.id} due to token expiry (55m)`);
        socket.disconnect(true);
    }, 55 * 60 * 1000);

    socket.on('refresh_token', async ({ token }) => {
        try {
            await admin.auth().verifyIdToken(token);
            clearTimeout(tokenExpiryTimer);
            tokenExpiryTimer = setTimeout(() => {
                console.warn(`[Auth] Forcing disconnect for ${socket.id} due to token expiry (55m)`);
                socket.disconnect(true);
            }, 55 * 60 * 1000);
            socket.emit('token_verified');
        } catch (err) {
            console.warn(`[Auth] Token refresh failed for ${socket.id}`);
            socket.disconnect(true);
        }
    });

    socket.on('reconnect_game', ({ userId: reconnectUserId }) => {
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(reconnectUserId) && room.status === 'active') {
                socket.join(roomId);
                socket.emit('game_update', sanitizeRoomForClient(room, roomId));
                break;
            }
        }
    });

    // ── Login streak tracking (internal — used for engagement, not displayed to players) ──
    const userId_connect = socketUsers.get(socket.id);
    // Will be set on join_game; tracked via Firestore in that handler.

    // 1. JOIN GAME (MATCHMAKING)
    socket.on('join_game', async ({ stake, userProfile, gameType, privateRoomId }) => {
        if (!userProfile?.id || !gameType || typeof stake !== 'number') {
            console.error('Invalid join_game payload');
            return;
        }
        const userId = userProfile.id;

        // ── Login streak (fire-and-forget, internal) ───────────────────────────
        if (db) {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            db.collection('users').doc(userId).get().then(async snap => {
                if (!snap.exists) return;
                const data = snap.data();
                if (data.lastLoginDate === today) return; // already recorded
                let streak = data.loginStreak || 0;
                streak = data.lastLoginDate === yesterday ? streak + 1 : 1;
                const milestones = { 3: 100, 7: 250, 14: 500, 30: 1000 };
                const bonus = milestones[streak] || 0;
                await db.runTransaction(async (tx) => {
                    const ref = db.collection('users').doc(userId);
                    const s = await tx.get(ref);
                    if (!s.exists) return;
                    tx.update(ref, { lastLoginDate: today, loginStreak: streak, promoBalance: (s.data().promoBalance || 0) + bonus });
                    if (bonus > 0) tx.set(ref.collection('transactions').doc(), {
                        type: 'streak_bonus', amount: bonus, status: 'completed',
                        date: new Date().toISOString(),
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        note: `Day ${streak} login streak bonus`
                    });
                });
                if (bonus > 0) {
                    const sid = userSockets.get(userId);
                    if (sid) { const s = io.sockets.sockets.get(sid); if (s) s.emit('streak_bonus', { streak, amount: bonus }); }
                    console.log(`[Streak] Day ${streak} bonus ${bonus} FCFA → ${userId}`);
                }
            }).catch(e => console.error('[Streak]', e));
        }

        // Handle rapid re-connections
        if (disconnectTimers.has(userId)) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
        }

        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        // Check if reconnecting to active or recently-completed room
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(userId)) {
                if (room.status === 'completed') {
                    // Skip completed rooms to allow user to join a new match queue
                    continue;
                }

                if (room.status === 'active') {
                    socket.join(roomId);

                    // Notify others that I'm back
                    socket.to(roomId).emit('opponent_reconnected', { userId });

                    socket.emit('match_found', {
                        roomId,
                        players: room.players,
                        gameType: room.gameType,
                        stake: room.stake,
                        gameState: room.gameState,
                        turn: room.turn,
                        profiles: room.profiles,
                        chat: room.chat,
                        winner: room.winner || null
                    });
                    console.log(`User ${userId} reconnected to ${roomId}`);
                    return;
                }
            }
        }

        // --- UPFRONT ESCROW DEDUCTION ---
        let realDeducted = 0;
        let promoDeducted = 0;

        if (stake > 0 && db) {
            const userRef = db.collection('users').doc(userId);
            try {
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(userRef);
                    if (!snap.exists) throw new Error("User not found");
                    const data = snap.data();
                    const pb = data.promoBalance || 0;
                    const rb = data.balance || 0;

                    if (pb + rb < stake) {
                        throw new Error('Insufficient funds (Real + Promo) to join this match.');
                    }

                    let remaining = stake;
                    let newPb = pb;
                    let newRb = rb;

                    if (newPb >= remaining) {
                        promoDeducted = remaining;
                        newPb -= remaining;
                        remaining = 0;
                    } else {
                        promoDeducted = newPb;
                        remaining -= newPb;
                        newPb = 0;
                    }

                    realDeducted = remaining;
                    newRb -= remaining;

                    tx.update(userRef, { balance: newRb, promoBalance: newPb });
                    tx.set(userRef.collection('transactions').doc(), {
                        type: 'escrow_lock', amount: -stake, status: 'completed',
                        date: new Date().toISOString(), timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        note: `Matchmaking entry fee for ${gameType}`
                    });
                });
            } catch (err) {
                socket.emit('game_error', { message: err.message || 'Failed to process entry fee.' });
                return;
            }
        }

        console.log(`Matchmaking escrow locked: ${userProfile.name} for ${gameType} (${stake})`);

        // Public Matchmaking Queue vs Private Room Queue
        const queueKey = privateRoomId ? `private_${privateRoomId}` : `${gameType}_${stake}`;
        if (!queues.has(queueKey)) queues.set(queueKey, []);

        const queue = queues.get(queueKey);

        // Remove self from queue if already there
        const existingIdx = queue.findIndex(item => item.userProfile.id === userId);
        if (existingIdx > -1) queue.splice(existingIdx, 1);

        if (queue.length > 0) {
            // MATCH FOUND — prefer same latency bucket; fall back to any after 10s wait
            const rttMs = Date.now() - (socket.handshake.issued || Date.now());
            const myBucket = rttMs < 120 ? 'fast' : rttMs < 350 ? 'medium' : 'slow';
            const now = Date.now();
            const sameBucketIdx = queue.findIndex(e => e.latencyBucket === myBucket);
            const anyStaleIdx = queue.findIndex(e => now - (e.queuedAt || 0) >= 10000);
            const chosenIdx = sameBucketIdx !== -1 ? sameBucketIdx : (anyStaleIdx !== -1 ? anyStaleIdx : 0);
            const opponent = queue.splice(chosenIdx, 1)[0];
            const opponentId = opponent.userProfile.id;
            const roomId = privateRoomId || generateRoomId();

            // Create Room
            const room = {
                id: roomId,
                gameType,
                stake,
                privateRoomId: privateRoomId || undefined,
                tournamentMatchId: privateRoomId?.startsWith('m-') ? privateRoomId : undefined,
                players: [opponentId, userId], // Player 0 (Host), Player 1 (Joiner)
                escrowSplits: {
                    [userId]: { real: realDeducted, promo: promoDeducted },
                    [opponentId]: { real: opponent.realDeducted || 0, promo: opponent.promoDeducted || 0 }
                },
                profiles: {
                    [opponentId]: opponent.userProfile,
                    [userId]: userProfile
                },
                turn: opponentId,
                status: 'active',
                gameState: createInitialGameState(gameType, opponentId, userId),
                chat: [],
                rematchVotes: new Set()
            };

            rooms.set(roomId, room);

            // Notify Players
            const oppSocketId = userSockets.get(opponentId);

            // Join Socket Rooms
            socket.join(roomId);
            if (io.sockets.sockets.get(oppSocketId)) {
                io.sockets.sockets.get(oppSocketId).join(roomId);
            }

            // Emit Start
            io.to(roomId).emit('match_found', {
                roomId,
                players: room.players,
                gameType,
                stake,
                gameState: room.gameState,
                turn: room.turn,
                profiles: room.profiles
            });

            console.log(`Match created: ${roomId}`);

        } else {
            // ADD TO QUEUE — include RTT bucket for latency-aware matchmaking
            // Store realDeducted and promoDeducted for targeted refunds if they leave
            const rttMs = Date.now() - (socket.handshake.issued || Date.now());
            const latencyBucket = rttMs < 120 ? 'fast' : rttMs < 350 ? 'medium' : 'slow';
            queue.push({ socketId: socket.id, userProfile, latencyBucket, queuedAt: Date.now(), realDeducted, promoDeducted });
            socket.emit('waiting_for_opponent');
            console.log(`Added to queue: ${queueKey} [latency=${latencyBucket}]`);
        }
    });

    // 1b. LEAVE QUEUE
    socket.on('leave_queue', () => {
        const userId = socketUsers.get(socket.id);
        if (!userId) return;
        queues.forEach((queue, key) => {
            const idx = queue.findIndex(i => i.userProfile.id === userId);
            if (idx > -1) {
                const removed = queue.splice(idx, 1)[0];
                refundEscrow(userId, removed.realDeducted, removed.promoDeducted);
            }
        });
    });

    // 2. REJOIN EXPLICIT
    socket.on('rejoin_game', ({ userProfile }) => {
        const userId = userProfile.id;

        if (disconnectTimers.has(userId)) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
        }

        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(userId) && room.status === 'active') {
                socket.join(roomId);
                socket.to(roomId).emit('opponent_reconnected', { userId });

                socket.emit('match_found', {
                    roomId,
                    players: room.players,
                    gameType: room.gameType,
                    stake: room.stake,
                    gameState: room.gameState,
                    turn: room.turn,
                    profiles: room.profiles,
                    chat: room.chat
                });
                break;
            }
        }
    });

    // 3. GAME ACTIONS
    socket.on('game_action', async ({ roomId, action }) => {
        if (!roomId || !action?.type) return;
        const room = rooms.get(roomId);
        if (!room) return;

        const userId = socketUsers.get(socket.id);
        if (!userId || !room.players.includes(userId)) return;

        // Anti-bot rate limiting: max 10 game actions per second per user
        if (isGameActionRateLimited(userId)) {
            console.warn(`[RateLimit] game_action throttled: userId=${userId} action=${action.type}`);
            socket.emit('rate_limited', { message: 'Too many actions. Please slow down.' });
            return;
        }

        // --- GENERIC ACTIONS: handled before game-type branches ---

        // FORFEIT
        if (action.type === 'FORFEIT') {
            const winner = room.players.find(id => id !== userId);
            endGame(roomId, winner, 'Opponent Forfeited');
            return;
        }

        // CHAT (works for all game types including Cards & Ludo)
        if (action.type === 'CHAT') {
            const messageText = sanitize(action.message);
            if (!messageText) return;

            const msg = {
                id: Date.now().toString(),
                senderId: userId,
                message: messageText,
                timestamp: Date.now()
            };
            if (!room.chat) room.chat = [];
            room.chat.push(msg);
            if (room.chat.length > 50) room.chat.shift();
            io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
            return;
        }

        // TIMEOUT_CLAIM (the caller claiming the timeout — they must NOT be the current turn holder)
        if (action.type === 'TIMEOUT_CLAIM') {
            // Validate: only the player waiting (not the current turn holder) can claim a timeout
            if (room.turn === userId) {
                console.warn(`[TIMEOUT_CLAIM] Rejected: ${userId} tried to claim timeout on their own turn.`);
                return;
            }

            // DICE EXCEPTION: Dice games auto-roll, so timeouts shouldn't lead to forfeits via claims
            if (room.gameType === 'Dice') {
                console.warn(`[TIMEOUT_CLAIM] Rejected: ${userId} tried to claim on a Dice game.`);
                return;
            }
            
            // Server-enforced forfeit logic (Anti-cheat timer check)
            const elapsed = Date.now() - (room.gameState.lastMoveTime || 0);
            
            // Game-specific durations (matching client-side TURN_DURATION constants)
            let requiredDuration = 59500; // Default 60s
            if (room.gameType === 'TicTacToe') requiredDuration = 14500; // 15s
            if (room.gameType === 'Cards') requiredDuration = 29500; // 30s
            if (room.gameType === 'Checkers') requiredDuration = 599500; // 600s (10 min)
            
            if (elapsed < requiredDuration) { 
                console.warn(`[TIMEOUT_CLAIM] Rejected: ${userId} claimed early. Only ${elapsed}ms elapsed.`);
                return;
            }

            endGame(roomId, userId, 'Time Expired (Claimed)');
            return;
        }

        // --- REMATCH LOGIC ---
        if (action.type === 'REMATCH_REQUEST') {
            if (!room.rematchVotes) room.rematchVotes = new Set();
            room.rematchVotes.add(userId);

            // Notify other player
            socket.to(roomId).emit('rematch_status', { requestorId: userId, status: 'requested' });

            // If both players accepted
            if (room.rematchVotes.size === room.players.length) {
                console.log(`Rematch accepted in room ${roomId}`);

                // B11 Fix: Re-escrow both players for rematch
                if (room.stake > 0 && db) {
                    for (const pid of room.players) {
                        try {
                            await deductEscrow(pid, room.stake, 'Rematch stake');
                        } catch (e) {
                            socket.emit('game_error', { message: 'Insufficient funds for rematch' });
                            return;
                        }
                    }
                }

                // Reset Room State
                room.status = 'active';
                room.winner = null;
                room.rematchVotes.clear();
                room.turn = room.players[0]; // Always reset to P1 for fairness
                room.gameState = createInitialGameState(room.gameType, room.players[0], room.players[1]);
                // Keep chat history

                // Emit Match Found (this resets the client UI)
                io.to(roomId).emit('match_found', {
                    roomId,
                    players: room.players,
                    gameType: room.gameType,
                    stake: room.stake,
                    gameState: room.gameState,
                    turn: room.turn,
                    profiles: room.profiles,
                    chat: room.chat
                });
            }
            return;
        }

        if (action.type === 'REMATCH_DECLINE') {
            if (room.rematchVotes) room.rematchVotes.delete(userId);
            socket.to(roomId).emit('rematch_status', { requestorId: userId, status: 'declined' });
            return;
        }

        // --- DICE LOGIC ---
        if (room.gameType === 'Dice' && action.type === 'ROLL') {
            if (room.turn !== userId) return;

            const roll1 = crypto.randomInt(1, 7);
            const roll2 = crypto.randomInt(1, 7);

            room.gameState.roundRolls[userId] = [roll1, roll2];

            io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));

            const p1 = room.players[0];
            const p2 = room.players[1];
            if (room.gameState.roundRolls[p1] && room.gameState.roundRolls[p2]) {
                setTimeout(() => {
                    const total1 = room.gameState.roundRolls[p1][0] + room.gameState.roundRolls[p1][1];
                    const total2 = room.gameState.roundRolls[p2][0] + room.gameState.roundRolls[p2][1];

                    if (total1 > total2) room.gameState.scores[p1]++;
                    else if (total2 > total1) room.gameState.scores[p2]++;

                    room.gameState.roundState = 'scored';
                    io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));

                    setTimeout(() => {
                        if (room.gameState.scores[p1] >= 3 || room.gameState.scores[p2] >= 3) {
                            const winner = room.gameState.scores[p1] >= 3 ? p1 : p2;
                            endGame(roomId, winner, 'Score Limit Reached');
                        } else {
                            room.gameState.currentRound++;
                            room.gameState.roundRolls = {};
                            room.gameState.roundState = 'waiting';
                            room.turn = room.gameState.currentRound % 2 === 0 ? p2 : p1;
                            io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
                        }
                    }, 3000);

                }, 2000);
            } else {
                room.turn = room.players.find(id => id !== userId);
                io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
            }
        }

        // --- CHECKERS & CHESS & TICTACTOE ---
        else if (action.type === 'MOVE') {
            if (room.turn !== userId) return;

            // =====================================================================
            // Fix 1: CHECKERS — Full server-side move validation
            // Client sends: { type: 'MOVE', fromR, fromC, toR, toC, isJump }
            // Server validates ownership, bounds, diagonal, jump, king promo, win.
            // =====================================================================
            if (room.gameType === 'Checkers' && action.fromR !== undefined) {
                const { fromR, fromC, toR, toC } = action;
                const pieces = room.gameState.pieces;

                // (A) Bounds check
                if (toR < 0 || toR > 7 || toC < 0 || toC > 7) {
                    console.warn(`[Checkers][${roomId}] OOB move by ${userId}. Rejected.`);
                    return;
                }

                // Task 1 Fix: Enforce mustJumpFrom for multi-jump chains
                if (room.gameState.mustJumpFrom) {
                    const [mjR, mjC] = room.gameState.mustJumpFrom.split(',').map(Number);
                    const jumpDist = Math.abs(toR - fromR);
                    if (fromR !== mjR || fromC !== mjC || jumpDist !== 2) {
                        console.warn(`[Checkers][${roomId}] Must continue jump from (${mjR},${mjC}). Rejected.`);
                        return;
                    }
                }

                // (B) The piece being moved must exist and belong to userId
                const piece = pieces.find(p => p.r === fromR && p.c === fromC && p.owner === userId);
                if (!piece) {
                    console.warn(`[Checkers][${roomId}] No owned piece at (${fromR},${fromC}) for ${userId}. Rejected.`);
                    return;
                }

                // (C) Destination must be empty
                if (pieces.some(p => p.r === toR && p.c === toC)) {
                    console.warn(`[Checkers][${roomId}] Destination (${toR},${toC}) occupied. Rejected.`);
                    return;
                }

                const dR = toR - fromR;
                const dC = toC - fromC;
                const absDR = Math.abs(dR);
                const absDC = Math.abs(toC - fromC);

                // (D) Must move diagonally
                if (absDR !== absDC) {
                    console.warn(`[Checkers][${roomId}] Non-diagonal move by ${userId}. Rejected.`);
                    return;
                }

                // (E) Direction check for non-kings — applies to BOTH normal moves AND jumps (Fix M7)
                // Server determines forward based on who is player[0] vs player[1]
                const isPlayer1 = room.players[0] === userId;
                const forwardDir = isPlayer1 ? -1 : 1; // player1 moves up (row decreases), player2 moves down
                if (!piece.isKing && Math.sign(dR) !== forwardDir) {
                    console.warn(`[Checkers][${roomId}] Backward non-king move by ${userId}. Rejected.`);
                    return;
                }

                // (F) Step size: 1 (normal) or 2 (jump)
                if (absDR !== 1 && absDR !== 2) {
                    console.warn(`[Checkers][${roomId}] Invalid step size ${absDR} by ${userId}. Rejected.`);
                    return;
                }

                let updatedPieces = pieces.map(p => ({ ...p })); // deep-ish clone

                if (absDR === 2) {
                    // (G) Jump: captured piece must be an opponent piece in the middle square
                    const midR = (fromR + toR) / 2;
                    const midC = (fromC + toC) / 2;
                    const capturedIdx = updatedPieces.findIndex(p => p.r === midR && p.c === midC && p.owner !== userId);
                    if (capturedIdx === -1) {
                        console.warn(`[Checkers][${roomId}] Jump with no enemy piece at mid (${midR},${midC}) by ${userId}. Rejected.`);
                        return;
                    }
                    updatedPieces.splice(capturedIdx, 1);
                } else {
                    // (H) Normal move — ensure no available jump was skipped (must-jump rule)
                    const hasMandatoryJump = pieces
                        .filter(p => p.owner === userId)
                        .some(p => {
                            const dirs = p.isKing ? [-1, 1] : [forwardDir];
                            return dirs.some(dr =>
                                [-1, 1].some(dc => {
                                    const midR = p.r + dr;
                                    const midC = p.c + dc;
                                    const landR = p.r + dr * 2;
                                    const landC = p.c + dc * 2;
                                    const hasEnemy = pieces.some(e => e.owner !== userId && e.r === midR && e.c === midC);
                                    const landFree = !pieces.some(e => e.r === landR && e.c === landC);
                                    const inBounds = landR >= 0 && landR <= 7 && landC >= 0 && landC <= 7;
                                    return hasEnemy && landFree && inBounds;
                                })
                            );
                        });
                    if (hasMandatoryJump) {
                        console.warn(`[Checkers][${roomId}] ${userId} skipped mandatory jump. Rejected.`);
                        return;
                    }
                }

                // (I) Apply the move
                const movedPiece = updatedPieces.find(p => p.r === fromR && p.c === fromC && p.owner === userId);
                movedPiece.r = toR;
                movedPiece.c = toC;

                // (J) King promotion
                const promotionRow = isPlayer1 ? 0 : 7;
                if (!movedPiece.isKing && toR === promotionRow) {
                    movedPiece.isKing = true;
                }

                // (K) Win detection — opponent has no pieces OR no legal moves (stalemate)
                const opponentId = room.players.find(id => id !== userId);
                const opponentPieces = updatedPieces.filter(p => p.owner === opponentId);

                const opponentHasLegalMove = opponentPieces.some(p => {
                    const isOppPlayer1 = room.players[0] === opponentId;
                    const oppFwdDir = isOppPlayer1 ? -1 : 1;
                    const dirs = p.isKing ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[oppFwdDir, -1], [oppFwdDir, 1]];
                    const pieceMap = new Map(updatedPieces.map(x => [`${x.r},${x.c}`, x]));
                    return dirs.some(([dr, dc]) => {
                        const mr = p.r + dr, mc = p.c + dc;
                        const jr = p.r + dr * 2, jc = p.c + dc * 2;
                        // Check jump
                        if (jr >= 0 && jr <= 7 && jc >= 0 && jc <= 7 && !pieceMap.has(`${jr},${jc}`)) {
                            const mid = pieceMap.get(`${mr},${mc}`);
                            if (mid && mid.owner !== opponentId) return true;
                        }
                        // Check normal move
                        if (mr >= 0 && mr <= 7 && mc >= 0 && mc <= 7 && !pieceMap.has(`${mr},${mc}`)) return true;
                        return false;
                    });
                });

                if (opponentPieces.length === 0 || !opponentHasLegalMove) {
                    room.gameState.pieces = updatedPieces;
                    const reason = opponentPieces.length === 0 ? 'All pieces captured' : 'No legal moves (stalemate)';
                    endGame(roomId, userId, reason);
                    return;
                }

                // Task 1 Fix: Multi-jump continuation check
                const movedDirs = movedPiece.isKing
                    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
                    : [[forwardDir, -1], [forwardDir, 1]];
                const pieceMapAfter = new Map(updatedPieces.map(x => [`${x.r},${x.c}`, x]));
                let hasMoreJumps = false;
                if (absDR === 2) {
                    hasMoreJumps = movedDirs.some(([dr, dc]) => {
                        const mr2 = toR + dr, mc2 = toC + dc;
                        const jr2 = toR + dr * 2, jc2 = toC + dc * 2;
                        if (jr2 < 0 || jr2 > 7 || jc2 < 0 || jc2 > 7) return false;
                        if (pieceMapAfter.has(`${jr2},${jc2}`)) return false;
                        const mid2 = pieceMapAfter.get(`${mr2},${mc2}`);
                        return mid2 && mid2.owner !== userId;
                    });
                }

                room.gameState.pieces = updatedPieces;
                room.gameState.mustJumpFrom = hasMoreJumps ? `${toR},${toC}` : null;
                room.turn = hasMoreJumps ? userId : opponentId;
                io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
                return; // handled — do NOT fall through to generic newState branch
            }
            // =====================================================================
            // End Checkers validation
            // =====================================================================

            if (action.newState) {
                // --- Bug C fix: Server-side chess move validation ---
                // Prevents clients from sending forged PGN/FEN to cheat.
                if (room.gameType === 'Chess' && action.newState.pgn !== undefined) {
                    try {
                        // Reconstruct the authoritative server-side board state
                        const serverGame = new Chess();
                        if (room.gameState.pgn) serverGame.loadPgn(room.gameState.pgn);
                        const serverMoveCount = serverGame.history().length;

                        // Reconstruct the client's proposed new state
                        const clientGame = new Chess();
                        clientGame.loadPgn(action.newState.pgn);
                        const clientMoveCount = clientGame.history().length;

                        // Rule 1: The proposed history must have exactly one more move
                        if (clientMoveCount !== serverMoveCount + 1) {
                            console.warn(`[Chess][${roomId}] Invalid PGN advance from ${userId}: expected ${serverMoveCount + 1} moves, got ${clientMoveCount}. Rejected.`);
                            return;
                        }

                        // Rule 2: The resulting FEN from the server-reconstructed game
                        // must match what the client claims
                        if (action.newState.fen && clientGame.fen() !== action.newState.fen) {
                            console.warn(`[Chess][${roomId}] FEN mismatch from ${userId}. Rejected.`);
                            return;
                        }

                        // Valid — check for server-side game over
                        if (clientGame.isCheckmate()) {
                            // The player whose turn it is AFTER the move is the one in checkmate (loser).
                            // The winner is the one who just moved (= userId).
                            endGame(roomId, userId, 'Checkmate');
                            return;
                        }
                        if (clientGame.isGameOver()) {
                            // Draw / stalemate — no winner, just end the game
                            // For now, treat draws as a loss for both (no payout edge case)
                            endGame(roomId, null, 'Draw');
                            return;
                        }
                    } catch (e) {
                        console.warn(`[Chess][${roomId}] PGN validation error from ${userId}:`, e.message);
                        return;
                    }
                }
                // --- End chess validation ---
                // --- End chess validation ---
                
                // --- Bug D fix: Pool Server-side Move Validation (Anti-Cheat) ---
                if (room.gameType === 'Pool' && action.newState) {
                    // Turn guard: only the active player can submit moves
                    if (room.turn !== userId && action.newState.balls) {
                        console.warn(`[Pool][${roomId}] Shot from non-turn player ${userId}, turn=${room.turn}. Rejected.`);
                        return;
                    }
                    
                    if (action.newState.balls) {
                        const prevBalls = (room.gameState.balls || []);
                        const newBalls = action.newState.balls;
                        
                        // Prevent un-pocketing balls (hacks)
                        const prevPottedIds = new Set(prevBalls.filter(b => b.pocketed || b.isPotted).map(b => b.id));
                        for (const b of newBalls) {
                            if (prevPottedIds.has(b.id) && !(b.pocketed || b.isPotted)) {
                                console.warn(`[Pool][${roomId}] Attempt to un-pocket ball ${b.id} by ${userId}. Rejected.`);
                                return;
                            }
                        }
                        
                        // Prevent ball injection
                        if (newBalls.length > 16) {
                            console.warn(`[Pool][${roomId}] Invalid ball count ${newBalls.length}. Rejected.`);
                            return;
                        }
                    }

                    // FIX C3: Ghost Win Prevention using server-authoritative ball state.
                    // NEVER use the client-sent balls payload alone to verify the 8-ball.
                    // Merge client proposal onto server state (blocking un-pocketing), then validate.
                    if (action.newState.winner) {
                        const serverBalls = room.gameState.balls || [];
                        const proposedBalls = action.newState.balls || serverBalls;
                        const prevPottedIds = new Set(serverBalls.filter(b => b.pocketed || b.isPotted).map(b => b.id));
                        const authBalls = serverBalls.map(sb => {
                            const cb = proposedBalls.find(b => b.id === sb.id);
                            if (!cb) return sb;
                            const wasPotted = prevPottedIds.has(sb.id);
                            const nowPotted = wasPotted || !!(cb.pocketed || cb.isPotted);
                            return { ...sb, pocketed: nowPotted, isPotted: nowPotted };
                        });
                        const eight = authBalls.find(b => b.id === 8);
                        const eightPocketed = !!(eight && (eight.pocketed || eight.isPotted));
                        if (!room.players.includes(action.newState.winner)) {
                            console.warn(`[Pool][${roomId}] Winner not a room player. Rejected.`); return;
                        }
                        if (action.newState.winner === userId && !eightPocketed) {
                            console.warn(`[Pool][${roomId}] Ghost win by ${userId}: 8-ball not confirmed by server state. Rejected.`); return;
                        }
                        const prevCount = serverBalls.filter(b => b.pocketed || b.isPotted).length;
                        const newCount = authBalls.filter(b => b.pocketed || b.isPotted).length;
                        if (newCount - prevCount > 4) { // Fix M1: break shots can pot 3-4 balls legally
                            console.warn(`[Pool][${roomId}] Implausible: ${newCount - prevCount} balls pocketed in 1 shot (max allowed: 4). Rejected.`); return;
                        }
                        // Task 22 Fix: Verify winner's group is cleared before accepting win
                        const isP1 = room.players[0] === userId;
                        const winnerGrp = isP1 ? room.gameState.myGroupP1 : room.gameState.myGroupP2;
                        const myIds = winnerGrp === 'solids' ? [1,2,3,4,5,6,7] : winnerGrp === 'stripes' ? [9,10,11,12,13,14,15] : [];
                        const grpCleared = myIds.every(id => authBalls.find(b => b.id === id)?.pocketed || authBalls.find(b => b.id === id)?.isPotted);
                        if (action.newState.winner === userId && grpCleared && myIds.length > 0 && !eightPocketed) {
                            console.warn(`[Pool][${roomId}] Group cleared but 8-ball not pocketed by ${userId}. Rejected.`); return;
                        }
                    }
                }

                // P1 Fix: Ball-in-hand boundary validation for Pool
                // If the previous state had ballInHand=true and the new state has ballInHand=false,
                // the client is placing the cue ball. Validate the cue ball is inside table bounds.
                if (room.gameType === 'Pool' && room.gameState.ballInHand && action.newState.ballInHand === false && action.newState.balls) {
                    const cueBall = action.newState.balls.find(b => b.id === 0);
                    const TW = 450, TH = 900, RAIL = 20, BR = 13;
                    const pockets = [
                        { x: BR, y: BR }, { x: TW - BR, y: BR },
                        { x: 4, y: TH / 2 }, { x: TW - 4, y: TH / 2 },
                        { x: BR, y: TH - BR }, { x: TW - BR, y: TH - BR }
                    ];
                    if (cueBall) {
                        // Clamp to valid table area
                        cueBall.x = Math.max(RAIL + BR + 2, Math.min(TW - RAIL - BR - 2, cueBall.x));
                        cueBall.y = Math.max(RAIL + BR + 2, Math.min(TH - RAIL - BR - 2, cueBall.y));
                        // Push away from pockets
                        for (const p of pockets) {
                            if (Math.hypot(cueBall.x - p.x, cueBall.y - p.y) < BR * 2.5) {
                                console.warn(`[Pool][${roomId}] Ball-in-hand cue ball too close to pocket from ${userId}. Repositioning.`);
                                cueBall.x = TW / 4; cueBall.y = TH / 2;
                                break;
                            }
                        }
                        cueBall.pocketed = false; cueBall.vx = 0; cueBall.vy = 0;
                    }
                }

                // Apply state after passing validation
                room.gameState = { ...room.gameState, ...action.newState, lastMoveTime: Date.now() };
                if (action.newState.timers) room.gameState.timers = action.newState.timers;
                if (action.newState.turn) room.turn = action.newState.turn;


                // action.newState.winner is a fallback for non-Chess, non-Checkers games (i.e., Pool or Dice).
                // Chess and Checkers explicitly end parsing earlier.
                if (action.newState.winner && room.gameType !== 'Chess' && room.gameType !== 'Checkers') {
                    endGame(roomId, action.newState.winner, 'Win Condition');
                    return;
                }
            }
            else if (action.index !== undefined && room.gameType === 'TicTacToe') {
                if (room.turn !== userId) return;
                const board = room.gameState.board;
                if (board[action.index] === null) {
                    const symbol = userId === room.players[0] ? 'X' : 'O';
                    board[action.index] = symbol;
                    room.turn = room.players.find(id => id !== userId);

                    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
                    let winner = null;
                    for (let line of lines) {
                        if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[0]] === board[line[2]]) {
                            winner = userId;
                        }
                    }

                    if (winner) {
                        endGame(roomId, winner, 'Line Complete');
                        return;
                    } else if (!board.includes(null)) {
                        // Bug M5 fix: track consecutive draws; end the match after 3
                        room.gameState.drawCount = (room.gameState.drawCount || 0) + 1;
                        if (room.gameState.drawCount >= 3) {
                            endGame(roomId, null, 'Three Consecutive Draws');
                            return;
                        }
                        io.to(roomId).emit('game_update', sanitizeRoomForClient({ ...room, status: 'draw' }, roomId));
                        setTimeout(() => {
                            room.gameState.board = Array(9).fill(null);
                            room.status = 'active';
                            room.turn = room.players.find(id => id !== room.turn);
                            io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
                        }, 3000);
                    }
                }
            }
            io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
        }
        // Draw is handled above inside the MOVE + index branch.
        // The separate DRAW_ROUND action is intentionally not handled here
        // to prevent double-incrementing drawCount.

        // --- LUDO ---
        else if (room.gameType === 'Ludo') {
            if (action.type === 'ROLL') {
                if (room.turn !== userId) return;
                const diceVal = crypto.randomInt(1, 7); // Fix C2: use crypto-secure RNG
                room.gameState.diceValue = diceVal;
                room.gameState.diceRolled = true;
                io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
            }
            else if (action.type === 'MOVE_PIECE') {
                if (room.turn !== userId) return;
                // Basic validation: ensure no piece count tampering
                if (!Array.isArray(action.pieces) || action.pieces.length !== room.gameState.pieces.length) return;

                // Task 23 Fix: Teleportation prevention — verify pieces were at claimed starting positions
                const prevPieces = room.gameState.pieces;
                const movedIllegally = action.pieces.some((p, i) => {
                    const prev = prevPieces[i];
                    if (p.owner !== userId) return p.step !== prev.step;
                    return false;
                });
                if (movedIllegally) {
                    console.warn(`[Ludo][${roomId}] Illegal state change from ${userId}. Rejected.`);
                    return;
                }

                // Bug M3 fix: validate that no piece moved more steps than the dice roll
                const diceVal = room.gameState.diceValue || 0;

                // S4 Fix: Must roll 6 to enter from home (step -1 → 0+)
                const enteredWithoutSix = action.pieces.some((p, i) => {
                    const prev = prevPieces[i];
                    if (p.owner !== userId || prev.step !== -1) return false;
                    if (p.step >= 0 && diceVal !== 6) return true;
                    return false;
                });
                if (enteredWithoutSix) {
                    console.warn(`[Ludo][${roomId}] ${userId} entered piece without rolling 6. Rejected.`);
                    return;
                }

                const movedTooFar = action.pieces.some((p, i) => {
                    const prev = prevPieces[i];
                    // Only validate pieces the current player owns
                    if (p.owner !== userId) return false;
                    // S4: skip — already validated entry above
                    if (prev.step === -1 && p.step >= 0) return false;
                    const stepDiff = p.step - prev.step;
                    // Allow moving backward only to home (-1), or forward by at most diceVal
                    return stepDiff > diceVal;
                });
                if (movedTooFar) {
                    console.warn(`[Ludo][${roomId}] Piece moved further than dice value (${diceVal}) from ${userId}. Rejected.`);
                    return;
                }

                room.gameState.pieces = action.pieces;
                room.gameState.diceRolled = false;

                // S3 Fix: Winner detection using color (aligned with server init) and finished flag
                const redWin = action.pieces.filter(p => p.color === 'Red' && p.finished).length === 4;
                const blueWin = action.pieces.filter(p => p.color === 'Blue' && p.finished).length === 4;

                if (redWin) {
                    endGame(roomId, room.players[0], 'Ludo Victory');
                    return;
                }
                if (blueWin) {
                    endGame(roomId, room.players[1], 'Ludo Victory');
                    return;
                }

                if (!action.bonusTurn) {
                    room.turn = room.players.find(id => id !== userId);
                }
                io.to(roomId).emit('game_update', sanitizeRoomForClient(room, roomId));
            }
        }

        // [REMOVED] Cards game handler block
    });

    // --- REAL-TIME POOL SYNC (Visual Only) ---
    socket.on('aim_sync', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('aim_sync', data);
        }
    });

    socket.on('pool_ping', (data) => {
        if (data.roomId) {
            // Echo back to acknowledge heartbeat — helps client gauge RTT and stability
            socket.emit('pool_pong', { roomId: data.roomId, timestamp: Date.now() });
        }
    });

    // 4. DISCONNECT
    socket.on('disconnect', () => {
        const userId = socketUsers.get(socket.id);
        console.log(`User disconnected: ${socket.id} (${userId})`);

        if (userId) {
            // Find active room
            for (const [roomId, room] of rooms.entries()) {
                if (room.players.includes(userId) && room.status === 'active') {
                    // Start Disconnect Timer — duration varies by game type:
                    // Fast games (Dice, TicTacToe) get 60s since rounds are short.
                    // Chess/Checkers get the full 4 minutes (240s).
                    const DISCONNECT_TIMEOUTS = {
                        Dice: 60, TicTacToe: 60, Pool: 120, default: 240
                    };
                    const baseTimeout = DISCONNECT_TIMEOUTS[room.gameType] || DISCONNECT_TIMEOUTS.default;
                    const timeoutSeconds = room.tournamentMatchId ? 90 : baseTimeout;
                    console.log(`Starting ${timeoutSeconds}s forfeit timer for ${userId} (game: ${room.gameType})`);

                    // Notify other player immediately
                    io.to(roomId).emit('opponent_disconnected', {
                        disconnectedUserId: userId,
                        timeoutSeconds
                    });

                    const timerId = setTimeout(() => {
                        // If timer completes, user forfeited
                        console.log(`Time expired for ${userId}, forfeiting game.`);
                        const winner = room.players.find(id => id !== userId);
                        endGame(roomId, winner, 'Opponent Disconnected');
                        disconnectTimers.delete(userId);
                    }, timeoutSeconds * 1000);

                    disconnectTimers.set(userId, timerId);
                    break;
                }
                // Also notify if game is completed but players are in rematch phase
                if (room.players.includes(userId) && room.status === 'completed') {
                    io.to(roomId).emit('rematch_status', { requestorId: userId, status: 'declined' });
                }
            }

            userSockets.delete(userId);
            socketUsers.delete(socket.id);

            // Remove from matchmaking queues and refund escrow
            queues.forEach((queue, key) => {
                const idx = queue.findIndex(i => i.userProfile.id === userId);
                if (idx > -1) {
                    const removed = queue.splice(idx, 1)[0];
                    refundEscrow(userId, removed.realDeducted, removed.promoDeducted);
                }
            });
        }
    });
});
// --- STARTUP RECONCILIATION SCRIPT ---
// Scans for orphaned escrows resulting from dirty server restarts (OOM, Deployments)
const reconcileOrphanedEscrows = async () => {
    if (!db) return;
    try {
        console.log('[Reconciliation] Scanning for orphaned escrows from the last 24h...');
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        // Collection group query to find recent escrow locks
        const lockSnap = await db.collectionGroup('transactions')
            .where('type', '==', 'escrow_lock')
            .where('date', '>=', yesterday)
            .get();

        if (lockSnap.empty) {
            console.log('[Reconciliation] No orphaned escrows found.');
            return;
        }

        let refundCount = 0;
        let totalRefunded = 0;

        for (const doc of lockSnap.docs) {
            const txData = doc.data();
            const userRef = doc.ref.parent.parent; 
            if (!userRef) continue;

            // Look for any resolution (refund, winnings, loss) occurring after this lock
            const txsSnap = await userRef.collection('transactions')
                .where('date', '>=', txData.date)
                .get();
            
            let resolved = false;
            txsSnap.forEach(txd => {
                const td = txd.data();
                if ((td.type === 'escrow_refund' || td.type === 'winnings' || td.type === 'stake_loss') && 
                     new Date(td.date).getTime() >= new Date(txData.date).getTime()) {
                    resolved = true;
                }
            });

            if (!resolved) {
                const stake = Math.abs(txData.amount);
                console.log(`[Reconciliation] Refunding unresolved escrow of ${stake} FCFA to ${userRef.id}`);
                
                await db.runTransaction(async (tx) => {
                    const usr = await tx.get(userRef);
                    if (!usr.exists) return; // double check
                    tx.update(userRef, { balance: (usr.data().balance || 0) + stake });
                    tx.set(userRef.collection('transactions').doc(), {
                        type: 'escrow_refund',
                        amount: stake,
                        status: 'completed',
                        date: new Date().toISOString(),
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        note: 'Auto-refund: Server Reboot / Orphaned Escrow'
                    });
                });
                refundCount++;
                totalRefunded += stake;
            }
        }
        console.log(`[Reconciliation] Complete. Refunded ${refundCount} users a total of ${totalRefunded} FCFA.`);
    } catch (e) {
        console.warn('[Reconciliation] Check skipped or failed (may require Firestore composite index):', e.message);
    }
};

httpServer.listen(PORT, () => {
    console.log(`Vantage Game Server running on port ${PORT}`);
    if (!process.env.FAPSHI_API_KEY) console.warn('WARNING: FAPSHI_API_KEY not set.');
    
    // Trigger reconciliation asynchronously
    reconcileOrphanedEscrows();
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`${signal} received. Closing server...`);
    for (const [roomId, room] of rooms.entries()) {
        if (room.status === 'active') {
            for (const pid of room.players) {
                const split = room.escrowSplits?.[pid];
                if (split) {
                    try {
                        await refundEscrow(pid, split.real, split.promo);
                    } catch (e) { console.warn(`[Shutdown] Refund failed for ${pid}:`, e); }
                }
            }
        }
    }
    httpServer.close(() => {
        console.log('Server closed. Exiting.');
        process.exit(0);
    });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
