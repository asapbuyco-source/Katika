import admin from 'firebase-admin';

let ioInstance;
export const setIO = (io) => { ioInstance = io; };

export const registerTournamentRoutes = (app, verifyAuth, blockGuests, verifyAdmin) => {
    app.post('/api/tournaments/register', verifyAuth, blockGuests, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Database service unavailable' });

        const { tournamentId, userId } = req.body;
        if (!tournamentId || !userId) return res.status(400).json({ error: 'Missing tournamentId or userId' });
        if (req.user.uid !== userId)
            return res.status(403).json({ error: 'Forbidden: Cannot register another user' });

        try {
            const tRef = db.collection("tournaments").doc(tournamentId);
            const userRef = db.collection("users").doc(userId);

            await db.runTransaction(async (transaction) => {
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

                const updates = { balance: newReal };
                if (newPromo !== promoBal) updates.promoBalance = newPromo;
                transaction.update(userRef, updates);

                const txRef = userRef.collection("transactions").doc();
                transaction.set(txRef, {
                    type: 'tournament_entry', amount: -tData.entryFee, status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

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
                        prizePool: admin.firestore.FieldValue.increment(netContribution),
                        [`participantSplits.${userId}`]: { real: realDeducted, promo: promoDeducted }
                    });
                }
            });

            res.json({ success: true });
        } catch (e) {
            console.error("Tournament registration failed:", e.message);
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/tournaments/start', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
        const { tournamentId } = req.body;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });

        try {
            const tRef = db.collection('tournaments').doc(tournamentId);
            await db.runTransaction(async (tx) => {
                const tSnap = await tx.get(tRef);
                if (!tSnap.exists) throw new Error('Tournament not found');
                const tData = tSnap.data();
                if (tData.status !== 'registration') throw new Error('Tournament not in registration phase');
                if (tData.participants.length < 2) throw new Error('Need at least 2 participants to start');

                const shuffled = [...tData.participants].sort(() => Math.random() - 0.5);
                const rounds = Math.ceil(Math.log2(shuffled.length));
                const firstRoundSize = Math.pow(2, rounds - 1);
                const batch = db.batch();

                for (let i = 0; i < firstRoundSize; i++) {
                    const p1Id = shuffled[i];
                    const p2Id = shuffled[i + firstRoundSize];
                    const matchId = `m-${tournamentId}-r1-${i}`;

                    const [p1Doc, p2Doc] = await Promise.all([
                        p1Id ? db.collection('users').doc(p1Id).get() : Promise.resolve(null),
                        p2Id ? db.collection('users').doc(p2Id).get() : Promise.resolve(null)
                    ]);
                    const p1 = p1Doc?.exists ? p1Doc.data() : null;
                    const p2 = p2Doc?.exists ? p2Doc.data() : null;

                    batch.set(db.collection('tournament_matches').doc(matchId), {
                        id: matchId, tournamentId,
                        round: 1, matchIndex: i,
                        player1: p1 ? { id: p1.id, name: p1.name, avatar: p1.avatar, rankTier: p1.rankTier, elo: p1.elo || 0 } : null,
                        player2: p2 ? { id: p2.id, name: p2.name, avatar: p2.avatar, rankTier: p2.rankTier, elo: p2.elo || 0 } : null,
                        status: p1 && p2 ? 'scheduled' : (p1 ? 'completed' : 'scheduled'),
                        winnerId: p1 && !p2 ? p1Id : null,
                        startTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                        checkedIn: []
                    });
                }

                tx.update(tRef, { status: 'active', startedAt: admin.firestore.FieldValue.serverTimestamp() });
                await batch.commit();
            });

            res.json({ success: true });
        } catch (e) {
            console.error('[Start Tournament]', e.message);
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/tournaments/create', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
        const { name, gameType, entryFee, prizePool, type, maxPlayers, startTime } = req.body;
        if (!name || !gameType || entryFee == null || !type || !maxPlayers || !startTime)
            return res.status(400).json({ error: 'Missing required fields' });

        try {
            const docRef = await db.collection('tournaments').add({
                name, gameType, entryFee,
                prizePool: type === 'fixed' ? (prizePool || 0) : 0,
                type, maxPlayers, startTime,
                participants: [], status: 'registration',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            res.json({ id: docRef.id, success: true });
        } catch (e) {
            console.error('[Create Tournament]', e);
            res.status(500).json({ error: 'Failed to create tournament' });
        }
    });

    app.delete('/api/tournaments/:id', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
        const { id } = req.params;

        try {
            const tRef = db.collection('tournaments').doc(id);
            const tSnap = await tRef.get();
            if (!tSnap.exists) return res.status(404).json({ error: 'Not found' });

            const batch = db.batch();
            batch.delete(tRef);

            const matchesSnap = await db.collection('tournament_matches').where('tournamentId', '==', id).get();
            matchesSnap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            res.json({ success: true });
        } catch (e) {
            console.error('[Delete Tournament]', e);
            res.status(500).json({ error: 'Failed to delete tournament' });
        }
    });

    app.post('/api/tournaments/force-result', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
        const { matchId, winnerId } = req.body;
        if (!matchId || !winnerId) return res.status(400).json({ error: 'matchId and winnerId required' });

        try {
            const matchRef = db.collection('tournament_matches').doc(matchId);
            await db.runTransaction(async (tx) => {
                const matchSnap = await tx.get(matchRef);
                if (!matchSnap.exists) throw new Error('Match not found');
                tx.update(matchRef, { winnerId, status: 'completed' });
            });

            const matchData = (await matchRef.get()).data();
            if (matchData) {
                const { checkAndAdvanceTournamentLogic } = await import('../services/tournamentSvc.js');
                await checkAndAdvanceTournamentLogic(matchData.tournamentId, matchData.round);
            }

            res.json({ success: true });
        } catch (e) {
            console.error('[Force Result]', e.message);
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/tournaments/cancel', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
        const { tournamentId } = req.body;
        if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });

        try {
            const tRef = db.collection('tournaments').doc(tournamentId);
            await db.runTransaction(async (tx) => {
                const tSnap = await tx.get(tRef);
                if (!tSnap.exists) throw new Error('Tournament not found');
                const tData = tSnap.data();

                if (tData.type === 'dynamic' && tData.participants?.length > 0) {
                    for (const userId of tData.participants) {
                        const splits = tData.participantSplits?.[userId];
                        if (!splits) continue;
                        const userRef = db.collection('users').doc(userId);
                        const userSnap = await tx.get(userRef);
                        if (!userSnap.exists) continue;
                        const refund = (splits.real || 0) + (splits.promo || 0);
                        const uData = userSnap.data();
                        const updates = { balance: (uData.balance || 0) + refund };
                        if (splits.promo > 0) updates.promoBalance = (uData.promoBalance || 0) + splits.promo;
                        tx.update(userRef, updates);
                    }
                }

                tx.update(tRef, { status: 'cancelled' });
            });

            res.json({ success: true });
        } catch (e) {
            console.error('[Cancel Tournament]', e.message);
            res.status(400).json({ error: e.message });
        }
    });
};

export const finaliseTournament = async (tournamentId, winnerId) => {
    const db = admin.apps.length > 0 ? admin.firestore() : null;
    if (!db) return;
    const sentinelRef = db.collection('processed_tournaments').doc(tournamentId);
    const tRef = db.collection('tournaments').doc(tournamentId);

    await db.runTransaction(async (tx) => {
        const [sentinelSnap, tSnap, userSnap] = await Promise.all([
            tx.get(sentinelRef),
            tx.get(tRef),
            tx.get(db.collection('users').doc(winnerId))
        ]);

        if (sentinelSnap.exists) return;
        if (!tSnap.exists || tSnap.data().status === 'completed') return;

        const tData = tSnap.data();
        const prize = tData.prizePool || 0;

        if (userSnap.exists && prize > 0) {
            const userRef = db.collection('users').doc(winnerId);
            tx.update(userRef, { balance: (userSnap.data().balance || 0) + prize });
            tx.set(userRef.collection('transactions').doc(), {
                type: 'winnings', amount: prize, status: 'completed',
                date: new Date().toISOString(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                note: `Tournament Win: ${tData.name}`
            });
            console.log(`[Tournament] ${tData.name}: credited ${prize} FCFA to winner ${winnerId}`);
        }

        tx.update(tRef, { status: 'completed', winnerId });
        tx.set(sentinelRef, { winnerId, finalizedAt: admin.firestore.FieldValue.serverTimestamp() });

        setImmediate(() => {
            if (ioInstance) ioInstance.emit('tournament_completed', { tournamentId, winnerId, prizeName: tData.name });
        });
    });
};

export const checkAndAdvanceTournamentLogic = async (tournamentId, round) => {
    const db = admin.apps.length > 0 ? admin.firestore() : null;
    if (!db) return;

    const matchesSnap = await db.collection('tournament_matches').where('tournamentId', '==', tournamentId).where('round', '==', round).get();
    const matches = matchesSnap.docs.map(d => d.data());
    if (matches.length === 0) return;

    const allComplete = matches.every(m => m.status === 'completed');
    if (!allComplete) return;

    matches.sort((a, b) => a.matchIndex - b.matchIndex);
    const winners = matches.map(m => m.winnerId).filter(Boolean);

    if (winners.length === 1) {
        await finaliseTournament(tournamentId, winners[0]);
        return;
    }

    const nextRoundSnap = await db.collection('tournament_matches').where('tournamentId', '==', tournamentId).where('round', '==', round + 1).limit(1).get();
    if (!nextRoundSnap.empty) return;

    console.log(`[Tournament] ${tournamentId} advancing R${round} → R${round + 1} (${winners.length} winners)`);
    const nextRoundStartTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const batch = db.batch();
    let nextMatchCount = 0;

    for (let i = 0; i < winners.length; i += 2) {
        const p1Id = winners[i];
        const p2Id = winners[i + 1];

        const [p1Doc, p2Doc] = await Promise.all([
            db.collection('users').doc(p1Id).get(),
            p2Id ? db.collection('users').doc(p2Id).get() : Promise.resolve(null)
        ]);

        const p1 = p1Doc?.exists ? p1Doc.data() : { id: p1Id, name: 'Unknown', avatar: '', rankTier: 'Bronze' };
        const p2 = p2Doc?.exists ? p2Doc.data() : (p2Id ? { id: p2Id, name: 'Unknown', avatar: '', rankTier: 'Bronze' } : null);

        const newMatchId = `m-${tournamentId}-r${round + 1}-${nextMatchCount}`;
        const isBye = !p2Id;

        batch.set(db.collection('tournament_matches').doc(newMatchId), {
            id: newMatchId, tournamentId,
            round: round + 1, matchIndex: nextMatchCount,
            player1: { id: p1.id, name: p1.name, avatar: p1.avatar, rankTier: p1.rankTier, elo: p1.elo || 0 },
            player2: p2 ? { id: p2.id, name: p2.name, avatar: p2.avatar, rankTier: p2.rankTier, elo: p2.elo || 0 } : null,
            winnerId: isBye ? p1Id : null,
            status: isBye ? 'completed' : 'scheduled',
            startTime: nextRoundStartTime, checkedIn: []
        });
        nextMatchCount++;
    }

    await batch.commit();

    if (nextMatchCount > 0) {
        await checkAndAdvanceTournamentLogic(tournamentId, round + 1);
    }
};