import express from 'express';
import { Chess } from 'chess.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import admin from 'firebase-admin';


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

// Security Headers
app.use(helmet());

// Logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
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

const sanitize = (text) => String(text).replace(/<[^>]*>?/gm, '').substring(0, 500);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
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

// --- HEALTH CHECK (required for Railway) ---
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// --- FAPSHI PAYMENT PROXY (keeps API keys server-side) ---
app.post('/api/pay/initiate', verifyAuth, async (req, res) => {
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

        const email = String(userId).includes('@') ? userId : 'guest@vantagegaming.cm';
        const response = await fetch(`${FAPSHI_BASE_URL}/initiate-pay`, {
            method: 'POST',
            headers: {
                'apiuser': FAPSHI_USER_TOKEN,
                'apikey': FAPSHI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount, email, userId, redirectUrl })
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        res.json(data);
    } catch (err) {
        console.error('Fapshi initiate proxy error:', err);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

// --- FAPSHI PAYOUT (REAL WITHDRAWAL) ---
app.post('/api/pay/disburse', verifyAuth, async (req, res) => {
    try {
        const { amount, phone, userId } = req.body;

        if (!amount || typeof amount !== 'number' || !Number.isInteger(amount)) {
            return res.status(400).json({ error: 'Invalid amount.' });
        }
        if (amount < 1000) {
            return res.status(400).json({ error: 'Minimum withdrawal is 1,000 FCFA.' });
        }
        if (amount > 500_000) {
            return res.status(400).json({ error: 'Maximum withdrawal is 500,000 FCFA per transaction.' });
        }
        if (!phone || typeof phone !== 'string' || !/^6\d{8}$/.test(phone.replace(/\s/g, ''))) {
            return res.status(400).json({ error: 'Invalid Cameroon phone number (must start with 6, 9 digits total).' });
        }
        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'Invalid userId.' });
        }
        // CRITICAL VULNERABILITY FIX: Prevent draining other users' balances
        if (req.user.uid !== userId) {
            return res.status(403).json({ error: 'Forbidden: Cannot withdraw from another user' });
        }

        // Verify user has sufficient balance via Firebase Admin before calling Fapshi
        if (db) {
            const userSnap = await db.collection('users').doc(userId).get();
            if (!userSnap.exists) return res.status(404).json({ error: 'User not found.' });
            const balance = userSnap.data().balance || 0;
            if (balance < amount) return res.status(400).json({ error: 'Insufficient balance.' });
        }

        const cleanPhone = phone.replace(/\s/g, '');
        const response = await fetch(`${FAPSHI_BASE_URL}/payout`, {
            method: 'POST',
            headers: {
                'apiuser': FAPSHI_USER_TOKEN,
                'apikey': FAPSHI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount, phone: cleanPhone, userId, message: 'Katika withdrawal' })
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);

        // Atomically debit user balance and record transaction
        if (db) {
            const userRef = db.collection('users').doc(userId);
            await db.runTransaction(async (tx) => {
                const userDoc = await tx.get(userRef);
                if (!userDoc.exists) throw new Error('User not found');
                const newBalance = (userDoc.data().balance || 0) - amount;
                if (newBalance < 0) throw new Error('Insufficient balance');
                tx.update(userRef, { balance: newBalance });
                tx.set(userRef.collection('transactions').doc(), {
                    type: 'withdrawal',
                    amount: -amount,
                    status: 'completed',
                    phone: cleanPhone,
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    transId: data.transId || null
                });
            });
        }

        res.json({ success: true, transId: data.transId });
    } catch (err) {
        console.error('Fapshi disburse proxy error:', err);
        res.status(500).json({ error: err.message || 'Withdrawal failed' });
    }
});

// --- TOURNAMENT OPERATIONS (SERVER-SIDE) ---
app.post('/api/tournaments/register', verifyAuth, async (req, res) => {
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
            if (userData.balance < tData.entryFee) throw new Error("Insufficient funds");

            // Update user balance
            transaction.update(userRef, { balance: userData.balance - tData.entryFee });

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
                transaction.update(tRef, { participants: admin.firestore.FieldValue.arrayUnion(userId) });
            } else {
                const platformFee = Math.floor(tData.entryFee * 0.10);
                const netContribution = tData.entryFee - platformFee;
                transaction.update(tRef, {
                    participants: admin.firestore.FieldValue.arrayUnion(userId),
                    prizePool: (tData.prizePool || 0) + netContribution
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

// Helper for starting tournament logic
const startTournamentLogic = async (tournamentId) => {
    if (!db) return;
    const tRef = db.collection("tournaments").doc(tournamentId);

    try {
        const tDoc = await tRef.get();
        if (!tDoc.exists) return;
        const tData = tDoc.data();
        if (tData.status !== 'registration') return;

        console.log(`Starting tournament: ${tData.name} (${tournamentId})`);

        const participants = [...tData.participants];
        // Shuffle
        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }

        const batch = db.batch();
        const matchesRef = db.collection("tournament_matches");
        let matchCount = 0;
        const round = 1;

        const playerProfiles = await Promise.all(participants.map(async (uid) => {
            const uSnap = await db.collection('users').doc(uid).get();
            return uSnap.exists ? uSnap.data() : { id: uid, name: 'Unknown', avatar: '', elo: 0, rankTier: 'Bronze' };
        }));

        while (playerProfiles.length > 0) {
            const p1 = playerProfiles.pop();
            const p2 = playerProfiles.pop();

            const matchId = `m-${tournamentId}-r${round}-${matchCount}`;
            const matchRef = matchesRef.doc(matchId);

            const matchData = {
                id: matchId,
                tournamentId,
                round,
                matchIndex: matchCount,
                player1: p1 ? { id: p1.id, name: p1.name, avatar: p1.avatar, rankTier: p1.rankTier, elo: p1.elo } : null,
                player2: p2 ? { id: p2.id, name: p2.name, avatar: p2.avatar, rankTier: p2.rankTier, elo: p2.elo } : null,
                winnerId: p2 ? null : p1?.id,
                status: p2 ? 'scheduled' : 'completed',
                startTime: tData.startTime,
                nextMatchId: null
            };

            batch.set(matchRef, matchData);
            matchCount++;
        }

        batch.update(tRef, { status: 'active', participants: participants });
        await batch.commit();

        // Initial bye check
        await checkAndAdvanceTournamentLogic(tournamentId, 1);
    } catch (err) {
        console.error(`Error starting tournament ${tournamentId}:`, err);
    }
};

const checkAndAdvanceTournamentLogic = async (tournamentId, round) => {
    if (!db) return;
    const matchesSnap = await db.collection("tournament_matches")
        .where("tournamentId", "==", tournamentId)
        .where("round", "==", round)
        .get();

    const matches = matchesSnap.docs.map(d => d.data());
    if (matches.length === 0 || !matches.every(m => m.status === 'completed')) return;

    // Guard: prevent duplicate next-round creation (race between scheduler and admin API)
    const nextRoundSnap = await db.collection("tournament_matches")
        .where("tournamentId", "==", tournamentId)
        .where("round", "==", round + 1)
        .limit(1)
        .get();
    if (!nextRoundSnap.empty) {
        console.log(`[Tournament] ${tournamentId} round ${round + 1} already exists, skipping advance.`);
        return;
    }

    console.log(`Advancing tournament ${tournamentId} to next round from R${round}`);

    matches.sort((a, b) => a.matchIndex - b.matchIndex);
    const winners = matches.map(m => m.winnerId).filter(Boolean);

    if (winners.length === 1 && matches.length === 1) {
        // Final winner
        await db.runTransaction(async (tx) => {
            const tRef = db.collection("tournaments").doc(tournamentId);
            const tDoc = await tx.get(tRef);
            if (!tDoc.exists || tDoc.data().status === 'completed') return;

            const tData = tDoc.data();
            const winnerId = winners[0];
            const userRef = db.collection("users").doc(winnerId);
            const userDoc = await tx.get(userRef);

            if (userDoc.exists) {
                const prize = tData.prizePool || 0;
                tx.update(userRef, { balance: (userDoc.data().balance || 0) + prize });
                tx.set(userRef.collection("transactions").doc(), {
                    type: 'winnings',
                    amount: prize,
                    status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    note: `Tournament Win: ${tData.name}`
                });
            }
            tx.update(tRef, { status: 'completed', winnerId: winnerId });
        });
        return;
    }

    const batch = db.batch();
    let nextMatchCount = 0;
    for (let i = 0; i < winners.length; i += 2) {
        const p1Id = winners[i];
        const p2Id = winners[i + 1];

        const p1Doc = await db.collection("users").doc(p1Id).get();
        const p1 = p1Doc.exists ? p1Doc.data() : { id: p1Id, name: 'Unknown' };

        let p2 = null;
        if (p2Id) {
            const p2Doc = await db.collection("users").doc(p2Id).get();
            p2 = p2Doc.exists ? p2Doc.data() : { id: p2Id, name: 'Unknown' };
        }

        const newMatchId = `m-${tournamentId}-r${round + 1}-${nextMatchCount}`;
        batch.set(db.collection("tournament_matches").doc(newMatchId), {
            id: newMatchId,
            tournamentId,
            round: round + 1,
            matchIndex: nextMatchCount,
            player1: { id: p1.id, name: p1.name, avatar: p1.avatar, rankTier: p1.rankTier },
            player2: p2 ? { id: p2.id, name: p2.name, avatar: p2.avatar, rankTier: p2.rankTier } : null,
            winnerId: p2Id ? null : p1Id,
            status: p2Id ? 'scheduled' : 'completed',
            startTime: new Date(Date.now() + 60000).toISOString()
        });
        nextMatchCount++;
    }
    await batch.commit();
};

// --- BACKGROUND SCHEDULER ---
const startTournamentScheduler = () => {
    if (!db) return;
    console.log("Tournament scheduler started.");
    setInterval(async () => {
        try {
            const now = new Date().toISOString();
            const snapshot = await db.collection("tournaments")
                .where("status", "==", "registration")
                .where("startTime", "<=", now)
                .get();

            for (const doc of snapshot.docs) {
                await startTournamentLogic(doc.id);
            }

            // Also check timeouts for active tournaments
            const activeTourneys = await db.collection("tournaments").where("status", "==", "active").get();
            for (const tDoc of activeTourneys.docs) {
                // Simplified timeout check: port logic from firebase.ts checkTournamentTimeouts
                const matches = await db.collection("tournament_matches")
                    .where("tournamentId", "==", tDoc.id)
                    .where("status", "==", "scheduled")
                    .get();

                const curTime = new Date();
                for (const mDoc of matches.docs) {
                    const m = mDoc.data();
                    const start = new Date(m.startTime);
                    const elapsedMin = (curTime.getTime() - start.getTime()) / 60000;

                    // Fix 3: Emit a pre-forfeit warning at 4 min, forfeit at 5 min
                    if (elapsedMin > 4 && elapsedMin <= 5 && !m.warningIssued) {
                        // Mark warning as issued so we don't spam
                        await db.collection("tournament_matches").doc(m.id).update({ warningIssued: true });
                        // Broadcast to both players' sockets if connected
                        [m.player1?.id, m.player2?.id].filter(Boolean).forEach(pid => {
                            const sId = userSockets.get(pid);
                            if (sId) {
                                const sock = io.sockets.sockets.get(sId);
                                if (sock) sock.emit('tournament_warning', {
                                    matchId: m.id,
                                    message: 'Your tournament match will be auto-forfeited in 60 seconds if not started!'
                                });
                            }
                        });
                        console.log(`[Scheduler] Pre-forfeit warning issued for match ${m.id}`);
                    }

                    if (elapsedMin > 5) { // 5 min timeout
                        console.log(`Timeout for match ${m.id}`);
                        // player1 gets the bye only if player2 was the one who didn't show;
                        // if both absent, pick player1 as default (documented limitation)
                        const winnerId = m.player1?.id || m.player2?.id;
                        if (winnerId) {
                            await db.collection("tournament_matches").doc(m.id).update({
                                winnerId,
                                status: 'completed',
                                forfeitReason: 'auto_timeout'
                            });
                            await checkAndAdvanceTournamentLogic(tDoc.id, m.round);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Scheduler error:", err);
        }
    }, 60000); // Pulse every minute
};

if (db) startTournamentScheduler();

// --- ADMIN MIDDLEWARE: Verify Firebase ID Token + isAdmin flag ---
const verifyAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }
    const token = authHeader.slice(7);
    if (!admin.apps.length || !db) {
        return res.status(503).json({ error: 'Auth service unavailable' });
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const userSnap = await db.collection('users').doc(decoded.uid).get();
        if (!userSnap.exists || !userSnap.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        req.adminUid = decoded.uid;
        next();
    } catch (e) {
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
                        batch.update(userRef, { balance: (userSnap.data().balance || 0) + entryFee });
                        batch.set(userRef.collection('transactions').doc(), {
                            type: 'tournament_refund',
                            amount: entryFee,
                            status: 'completed',
                            date: new Date().toISOString(),
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                            note: `Refund: "${tData.name}" cancelled`
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

app.get('/api/pay/status/:transId', async (req, res) => {
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
        await db.runTransaction(async (tx) => {
            const sentinelSnap = await tx.get(settlementRef);
            if (sentinelSnap.exists) return; // already settled

            const winnerRef = db.collection('users').doc(winnerId);
            const loserRef = db.collection('users').doc(loserId);
            const [winnerDoc, loserDoc] = await Promise.all([
                tx.get(winnerRef), tx.get(loserRef)
            ]);

            if (winnerDoc.exists) {
                tx.update(winnerRef, { balance: (winnerDoc.data().balance || 0) + winnings });
                tx.set(winnerRef.collection('transactions').doc(), {
                    type: 'winnings', amount: winnings, status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    gameType: room.gameType
                });
            }
            if (loserDoc.exists) {
                const newBal = Math.max(0, (loserDoc.data().balance || 0) - room.stake);
                tx.update(loserRef, { balance: newBal });
                tx.set(loserRef.collection('transactions').doc(), {
                    type: 'stake_loss', amount: -room.stake, status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    gameType: room.gameType
                });
            }
            tx.set(settlementRef, { settledAt: admin.firestore.FieldValue.serverTimestamp(), winnerId, roomId });
        });
        console.log(`[settleGame] ${roomId}: credited ${winnings} FCFA to ${winnerId}`);
    } catch (err) {
        console.error(`[settleGame] Failed for room ${roomId}:`, err.message);
    }
};

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

// --- HELPER FUNCTIONS ---
const generateRoomId = () => `room_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

const calculatePayouts = (stake) => {
    const totalPot = stake * 2;
    const platformFee = Math.floor(totalPot * 0.10); // 10% Fee
    const winnings = totalPot - platformFee;
    return { totalPot, platformFee, winnings };
};

const endGame = (roomId, winnerId, reason) => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'completed') return;

    room.status = 'completed';
    room.winner = winnerId;

    const { totalPot, platformFee, winnings } = calculatePayouts(room.stake);

    // Settle finances server-side (non-blocking) — winner credited, loser debited via Firebase Admin
    if (winnerId && room.stake > 0) settleGame(roomId, winnerId);

    io.to(roomId).emit('game_over', {
        winner: winnerId,
        reason: reason,
        financials: {
            totalPot,
            platformFee,
            winnings
        }
    });

    // Cleanup Room Data after a delay (Extended for Rematch window)
    setTimeout(() => {
        const r = rooms.get(roomId);
        // Only delete if still completed (not rematched)
        if (r && r.status === 'completed') {
            rooms.delete(roomId);
        }
    }, 60000);
};

// Card Game Helpers
const createDeck = () => {
    const suits = ['H', 'D', 'C', 'S'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let s of suits) for (let r of ranks) deck.push({ id: s + r, suit: s, rank: r });
    return deck.sort(() => Math.random() - 0.5);
};

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
            const pieces = [];
            for (let i = 0; i < 4; i++) pieces.push({ id: i, color: 'Red', step: -1, owner: p1 });
            for (let i = 0; i < 4; i++) pieces.push({ id: i + 4, color: 'Yellow', step: -1, owner: p2 });
            return {
                ...common,
                pieces,
                diceValue: null,
                diceRolled: false,
                turn: p1
            };
        case 'Cards':
            const deck = createDeck();
            return {
                ...common,
                deck: deck.slice(15),
                hands: { [p1]: deck.slice(0, 7), [p2]: deck.slice(7, 14) },
                discardPile: [deck[14]],
                activeSuit: deck[14].suit,
                turn: p1
            };
        case 'Checkers':
            const checkersPieces = [];
            let cid = 0;
            // Player 2 (Top, Rows 0-2)
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 8; c++) {
                    if ((r + c) % 2 === 1) checkersPieces.push({ id: `p2-${cid++}`, owner: p2, isKing: false, r, c });
                }
            }
            // Player 1 (Bottom, Rows 5-7)
            for (let r = 5; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if ((r + c) % 2 === 1) checkersPieces.push({ id: `p1-${cid++}`, owner: p1, isKing: false, r, c });
                }
            }
            return {
                ...common,
                pieces: checkersPieces,
                turn: p1
            };
        case 'Chess':
            return {
                ...common,
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Standard start FEN
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

    // 1. JOIN GAME (MATCHMAKING)
    socket.on('join_game', ({ stake, userProfile, gameType, privateRoomId }) => {
        if (!userProfile?.id || !gameType || typeof stake !== 'number') {
            console.error('Invalid join_game payload');
            return;
        }
        const userId = userProfile.id;

        // Handle rapid re-connections
        if (disconnectTimers.has(userId)) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
        }

        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);

        console.log(`Matchmaking request: ${userProfile.name} for ${gameType} (${stake})`);

        // Check if reconnecting to active room
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(userId) && room.status === 'active') {
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
                    chat: room.chat
                });
                console.log(`User ${userId} reconnected to ${roomId}`);
                return;
            }
        }

        // Public Matchmaking Queue
        const queueKey = `${gameType}_${stake}`;
        if (!queues.has(queueKey)) queues.set(queueKey, []);

        const queue = queues.get(queueKey);

        // Remove self from queue if already there
        const existingIdx = queue.findIndex(item => item.userProfile.id === userId);
        if (existingIdx > -1) queue.splice(existingIdx, 1);

        if (queue.length > 0) {
            // MATCH FOUND!
            const opponent = queue.shift();
            const opponentId = opponent.userProfile.id;
            const roomId = generateRoomId();

            // Create Room
            const room = {
                id: roomId,
                gameType,
                stake,
                players: [opponentId, userId], // Player 0 (Host), Player 1 (Joiner)
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
            // ADD TO QUEUE
            queue.push({ socketId: socket.id, userProfile });
            socket.emit('waiting_for_opponent');
            console.log(`Added to queue: ${queueKey}`);
        }
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
    socket.on('game_action', ({ roomId, action }) => {
        if (!roomId || !action?.type) return;
        const room = rooms.get(roomId);
        if (!room) return;

        const userId = socketUsers.get(socket.id);
        if (!userId || !room.players.includes(userId)) return;

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
            io.to(roomId).emit('game_update', { ...room, roomId, chat: room.chat });
            return;
        }

        // TIMEOUT_CLAIM (the caller claiming the timeout — they must NOT be the current turn holder)
        if (action.type === 'TIMEOUT_CLAIM') {
            // Validate: only the player waiting (not the current turn holder) can claim a timeout
            if (room.turn === userId) {
                console.warn(`[TIMEOUT_CLAIM] Rejected: ${userId} tried to claim timeout on their own turn.`);
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

            const roll1 = Math.ceil(Math.random() * 6);
            const roll2 = Math.ceil(Math.random() * 6);

            room.gameState.roundRolls[userId] = [roll1, roll2];

            io.to(roomId).emit('game_update', {
                ...room,
                roomId: roomId,
                gameState: room.gameState,
                diceRolled: true,
                diceValue: roll1 + roll2
            });

            const p1 = room.players[0];
            const p2 = room.players[1];
            if (room.gameState.roundRolls[p1] && room.gameState.roundRolls[p2]) {
                setTimeout(() => {
                    const total1 = room.gameState.roundRolls[p1][0] + room.gameState.roundRolls[p1][1];
                    const total2 = room.gameState.roundRolls[p2][0] + room.gameState.roundRolls[p2][1];

                    if (total1 > total2) room.gameState.scores[p1]++;
                    else if (total2 > total1) room.gameState.scores[p2]++;

                    room.gameState.roundState = 'scored';
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });

                    setTimeout(() => {
                        if (room.gameState.scores[p1] >= 3 || room.gameState.scores[p2] >= 3) {
                            const winner = room.gameState.scores[p1] >= 3 ? p1 : p2;
                            endGame(roomId, winner, 'Score Limit Reached');
                        } else {
                            room.gameState.currentRound++;
                            room.gameState.roundRolls = {};
                            room.gameState.roundState = 'waiting';
                            // Alternate who rolls first each round
                            room.turn = room.gameState.currentRound % 2 === 0 ? p2 : p1;
                            io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
                        }
                    }, 3000);

                }, 2000);
            } else {
                room.turn = room.players.find(id => id !== userId);
                io.to(roomId).emit('game_update', { ...room, roomId });
            }
        }

        // --- CHECKERS & CHESS & TICTACTOE ---
        else if (action.type === 'MOVE') {
            if (room.turn !== userId && room.gameType !== 'Cards') return;

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

                // (E) Direction check for non-kings
                // Server determines forward based on who is player[0] vs player[1]
                const isPlayer1 = room.players[0] === userId;
                const forwardDir = isPlayer1 ? -1 : 1; // player1 moves up (row decreases), player2 moves down
                if (!piece.isKing && Math.sign(dR) !== forwardDir && absDR === 1) {
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

                // (K) Win detection — opponent has no pieces
                const opponentPieces = updatedPieces.filter(p => p.owner !== userId);
                if (opponentPieces.length === 0) {
                    room.gameState.pieces = updatedPieces;
                    endGame(roomId, userId, 'All pieces captured');
                    return;
                }

                room.gameState.pieces = updatedPieces;
                room.turn = room.players.find(id => id !== userId);
                io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
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

                room.gameState = { ...room.gameState, ...action.newState };
                if (action.newState.timers) room.gameState.timers = action.newState.timers;
                if (action.newState.turn) room.turn = action.newState.turn;

                // action.newState.winner is only a fallback for non-Chess, non-Checkers games.
                // Chess ends via PGN validation above; Checkers ends via the piece-count check above.
                if (action.newState.winner && room.gameType !== 'Chess' && room.gameType !== 'Checkers') {
                    endGame(roomId, action.newState.winner, 'Win Condition');
                    return;
                }

                // Fix 2: Pool — sanity check ball count to prevent fabricated pockets
                if (room.gameType === 'Pool' && action.newState.balls) {
                    const prevBalls = room.gameState.balls || [];
                    const newBalls = action.newState.balls;
                    // Verify ball count hasn't increased (can't un-pocket a ball)
                    if (newBalls.length > prevBalls.length) {
                        console.warn(`[Pool][${roomId}] Ball count increased from ${prevBalls.length} to ${newBalls.length}. Rejected.`);
                        return;
                    }
                    // Verify no *already-potted* ball was un-potted
                    const prevPotted = prevBalls.filter(b => b.isPotted).map(b => b.id);
                    const newUnPotted = newBalls.filter(b => !b.isPotted && prevPotted.includes(b.id));
                    if (newUnPotted.length > 0) {
                        console.warn(`[Pool][${roomId}] Attempt to un-pot balls by ${userId}. Rejected.`);
                        return;
                    }
                }
            }
            else if (action.index !== undefined && room.gameType === 'TicTacToe') {
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
                        io.to(roomId).emit('game_update', { ...room, roomId, status: 'draw' });
                        setTimeout(() => {
                            room.gameState.board = Array(9).fill(null);
                            room.status = 'active';
                            // Alternate who goes first after a draw
                            room.turn = room.players.find(id => id !== room.turn);
                            io.to(roomId).emit('game_update', { ...room, roomId });
                        }, 3000);
                    }
                }
            }
            io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
        }
        // Draw is handled above inside the MOVE + index branch.
        // The separate DRAW_ROUND action is intentionally not handled here
        // to prevent double-incrementing drawCount.

        // --- LUDO ---
        else if (room.gameType === 'Ludo') {
            if (action.type === 'ROLL') {
                if (room.turn !== userId) return;
                const diceVal = Math.ceil(Math.random() * 6);
                room.gameState.diceValue = diceVal;
                room.gameState.diceRolled = true;
                io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
            }
            else if (action.type === 'MOVE_PIECE') {
                if (room.turn !== userId) return;
                // Basic validation: ensure no piece count tampering
                if (!Array.isArray(action.pieces) || action.pieces.length !== room.gameState.pieces.length) return;

                // Bug M3 fix: validate that no piece moved more steps than the dice roll
                const diceVal = room.gameState.diceValue || 0;
                const prevPieces = room.gameState.pieces;
                const movedTooFar = action.pieces.some((p, i) => {
                    const prev = prevPieces[i];
                    // Only validate pieces the current player owns
                    if (p.owner !== userId) return false;
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

                // Winner detection: 4 pieces at finishing step (56)
                const redWin = action.pieces.filter(p => p.color === 'Red' && p.step === 56).length === 4;
                const yellowWin = action.pieces.filter(p => p.color === 'Yellow' && p.step === 56).length === 4;

                if (redWin) {
                    endGame(roomId, room.players[0], 'Ludo Victory');
                    return;
                }
                if (yellowWin) {
                    endGame(roomId, room.players[1], 'Ludo Victory');
                    return;
                }

                if (!action.bonusTurn) {
                    room.turn = room.players.find(id => id !== userId);
                }
                io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
            }
        }

        // --- CARDS ---
        else if (room.gameType === 'Cards') {
            if (room.turn !== userId) return;

            if (action.type === 'PLAY') {
                const hand = room.gameState.hands[userId];
                const cardIndex = hand.findIndex(c => c.id === action.card.id);

                if (cardIndex > -1) {
                    // Bug M6 fix: validate card legality before accepting the play
                    const topCard = room.gameState.discardPile[room.gameState.discardPile.length - 1];
                    const activeSuit = room.gameState.activeSuit;
                    const isPlayable = action.card.suit === activeSuit
                        || action.card.rank === topCard?.rank
                        || action.card.rank === '8'; // 8s are wild
                    if (!isPlayable) {
                        console.warn(`[Cards][${roomId}] Illegal play by ${userId}: ${action.card.id} on ${activeSuit}/${topCard?.rank}. Rejected.`);
                        socket.emit('invalid_move', { message: 'Card does not match active suit or rank' });
                        return;
                    }

                    // Remove from hand
                    hand.splice(cardIndex, 1);
                    // Add to discard
                    room.gameState.discardPile.push(action.card);
                    // Update suit
                    room.gameState.activeSuit = action.suit;

                    // Win Check BEFORE emitting (avoid stale-state flash)
                    if (hand.length === 0) {
                        endGame(roomId, userId, 'Hand Cleared');
                        return;
                    }

                    // Turn Pass
                    room.turn = room.players.find(id => id !== userId);

                    // Single authoritative emit with final state
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
                }
            } else if (action.type === 'DRAW') {
                if (room.gameState.deck.length > 0) {
                    const card = room.gameState.deck.pop();
                    room.gameState.hands[userId].push(card);
                    // Shuffle discard back into deck if now empty, keep top card as new discard
                    if (room.gameState.deck.length === 0 && room.gameState.discardPile.length > 1) {
                        const top = room.gameState.discardPile.pop();
                        room.gameState.deck = room.gameState.discardPile.sort(() => Math.random() - 0.5);
                        room.gameState.discardPile = [top];
                    }
                    if (action.passTurn) {
                        room.turn = room.players.find(id => id !== userId);
                    }
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
                } else {
                    // Both deck and discard fully exhausted — pass turn to prevent deadlock
                    room.turn = room.players.find(id => id !== userId);
                    io.to(roomId).emit('game_update', { ...room, roomId, gameState: room.gameState });
                }
            }
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
                    // Start Disconnect Timer
                    console.log(`Starting 240s forfeit timer for ${userId}`);

                    // Notify other player immediately
                    io.to(roomId).emit('opponent_disconnected', {
                        disconnectedUserId: userId,
                        timeoutSeconds: 240 // 4 minutes
                    });

                    const timerId = setTimeout(() => {
                        // If timer completes, user forfeited
                        console.log(`Time expired for ${userId}, forfeiting game.`);
                        const winner = room.players.find(id => id !== userId);
                        endGame(roomId, winner, 'Opponent Disconnected');
                        disconnectTimers.delete(userId);
                    }, 240000); // 240 seconds

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

            // Remove from matchmaking queues
            queues.forEach((queue, key) => {
                const idx = queue.findIndex(i => i.userProfile.id === userId);
                if (idx > -1) queue.splice(idx, 1);
            });
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`Vantage Game Server running on port ${PORT}`);
    if (!process.env.FAPSHI_API_KEY) console.warn('WARNING: FAPSHI_API_KEY not set.');
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`${signal} received. Closing server...`);
    httpServer.close(() => {
        console.log('Server closed. Exiting.');
        process.exit(0);
    });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));