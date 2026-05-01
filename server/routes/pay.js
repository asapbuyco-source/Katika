import admin from 'firebase-admin';

const FAPSHI_BASE_URL = process.env.FAPSHI_BASE_URL || 'https://live.fapshi.com';
const FAPSHI_API_KEY = process.env.FAPSHI_API_KEY || '';
const FAPSHI_USER_TOKEN = process.env.FAPSHI_USER_TOKEN || '';

let ioInstance;
export const setIO = (io) => { ioInstance = io; };

const pendingDeposits = new Map();

export const registerPayRoutes = (app, verifyAuth, blockGuests) => {
    app.get('/api/time', (_req, res) => {
        res.json({ time: Date.now() });
    });

    app.post('/api/pay/initiate', verifyAuth, blockGuests, async (req, res) => {
        try {
            const { amount, userId, redirectUrl } = req.body;
            if (!amount || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount))
                return res.status(400).json({ error: 'Invalid amount. Must be a positive integer in FCFA.' });
            if (!userId || typeof userId !== 'string' || userId.trim().length === 0)
                return res.status(400).json({ error: 'Invalid userId.' });
            if (req.user.uid !== userId)
                return res.status(403).json({ error: 'Forbidden: Cannot initiate payment for another user' });
            if (amount < 100)
                return res.status(400).json({ error: 'Minimum deposit amount is 100 FCFA.' });
            if (amount > 1_000_000)
                return res.status(400).json({ error: 'Amount exceeds maximum allowed deposit.' });

            const email = String(userId).includes('@') ? userId : 'guest@vantagegaming.cm';
            const rawBase = process.env.SERVER_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
            const webhookUrl = rawBase ? `${rawBase}/api/pay/webhook` : undefined;

            const response = await fetch(`${FAPSHI_BASE_URL}/initiate-pay`, {
                method: 'POST',
                headers: { 'apiuser': FAPSHI_USER_TOKEN, 'apikey': FAPSHI_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, email, userId, redirectUrl, ...(webhookUrl ? { webhook: webhookUrl } : {}) })
            });
            const data = await response.json();
            if (!response.ok) return res.status(response.status).json(data);

            if (data.transId) {
                pendingDeposits.set(data.transId, { userId, depositAmount: amount });
                setTimeout(() => pendingDeposits.delete(data.transId), 2 * 60 * 60 * 1000);
                const db = admin.apps.length > 0 ? admin.firestore() : null;
                if (db) {
                    db.collection('pending_payments').doc(data.transId).set({
                        userId, depositAmount: amount,
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

    app.post('/api/pay/webhook', async (req, res) => {
        res.status(200).json({ received: true });
        try {
            const { transId, status } = req.body || {};
            if (!transId || status !== 'SUCCESSFUL') return;

            const verifyRes = await fetch(`${FAPSHI_BASE_URL}/payment-status/${transId}`, {
                headers: { 'apiuser': FAPSHI_USER_TOKEN, 'apikey': FAPSHI_API_KEY }
            });
            if (!verifyRes.ok) {
                console.error(`[Webhook Security] Fapshi returned ${verifyRes.status} for transId ${transId}`);
                return;
            }
            const verifyData = await verifyRes.json();
            if (verifyData.status !== 'SUCCESSFUL') {
                console.warn(`[Webhook Security] Rejecting transId ${transId} - Verify API returned ${verifyData.status}`);
                return;
            }

            let userId = verifyData.userId || verifyData.externalId;
            let depositAmount = verifyData.amount;

            if (!userId) {
                const pending = pendingDeposits.get(transId);
                const db = admin.apps.length > 0 ? admin.firestore() : null;
                if (pending) {
                    userId = pending.userId;
                    depositAmount = pending.depositAmount;
                } else if (db) {
                    const pendingDoc = await db.collection('pending_payments').doc(transId).get();
                    if (pendingDoc.exists) {
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

            const db = admin.apps.length > 0 ? admin.firestore() : null;
            if (!db) {
                console.error('[Webhook] Firestore unavailable — cannot credit deposit');
                return;
            }

            const paymentRef = db.collection('processed_payments').doc(transId);
            const userRef = db.collection('users').doc(userId);

            await db.runTransaction(async (tx) => {
                const [paySnap, userSnap] = await Promise.all([tx.get(paymentRef), tx.get(userRef)]);
                if (paySnap.exists) {
                    console.log(`[Webhook] transId=${transId} already processed — skipping.`);
                    return;
                }
                if (!userSnap.exists) {
                    console.error(`[Webhook] User ${userId} not found for transId=${transId}`);
                    return;
                }

                const userData = userSnap.data();
                let referrerRef, referrerSnap;
                if (userData.referredBy && !userData.referralBonusPaid) {
                    referrerRef = db.collection('users').doc(userData.referredBy);
                    referrerSnap = await tx.get(referrerRef);
                }

                const newBalance = (userData.balance || 0) + depositAmount;
                const updatePayload = { balance: newBalance };
                if (referrerSnap && referrerSnap.exists) {
                    updatePayload.referralBonusPaid = true;
                    tx.update(referrerRef, { promoBalance: (referrerSnap.data().promoBalance || 0) + 100 });
                    tx.set(referrerRef.collection('transactions').doc(), {
                        type: 'winnings', amount: 100, status: 'completed',
                        date: new Date().toISOString(),
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        transId: `ref-${transId}`
                    });
                    console.log(`[Webhook] Paid 100 FCFA promo bonus to ${userData.referredBy}`);
                }

                tx.update(userRef, updatePayload);
                tx.set(paymentRef, { userId, amount: depositAmount, processedAt: admin.firestore.FieldValue.serverTimestamp(), source: 'webhook' });
                tx.set(userRef.collection('transactions').doc(), {
                    type: 'deposit', amount: depositAmount, status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp(), transId
                });
            });

            console.log(`[Webhook] Credited ${depositAmount} FCFA to ${userId} (transId=${transId})`);
            pendingDeposits.delete(transId);

            const socketId = (await import('../connection.js')).userSockets?.get(userId);
            if (socketId && ioInstance) {
                const sock = ioInstance.sockets.sockets.get(socketId);
                if (sock) {
                    sock.emit('payment_confirmed', { transId, amount: depositAmount });
                    console.log(`[Webhook] Emitted payment_confirmed to socket ${socketId}`);
                }
            }
        } catch (err) {
            console.error('[Webhook] Error processing payment:', err);
        }
    });

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

            const db = admin.apps.length > 0 ? admin.firestore() : null;
            if (!db) return res.status(503).json({ error: 'Database unavailable' });

            const cleanPhone = phone.replace(/\s/g, '');
            const userRef = db.collection('users').doc(userId);
            let pendingTxRef = null;

            try {
                await db.runTransaction(async (tx) => {
                    const userDoc = await tx.get(userRef);
                    if (!userDoc.exists) throw new Error('USER_NOT_FOUND');
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

            const fapshiRes = await fetch(`${FAPSHI_BASE_URL}/payout`, {
                method: 'POST',
                headers: { 'apiuser': FAPSHI_USER_TOKEN, 'apikey': FAPSHI_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, phone: cleanPhone, userId, message: 'Katika withdrawal' })
            });
            const fapshiData = await fapshiRes.json();

            if (!fapshiRes.ok) {
                console.error(`[Disburse] Fapshi payout failed for ${userId}. Issuing refund.`, fapshiData);
                await db.runTransaction(async (tx) => {
                    const userDoc = await tx.get(userRef);
                    if (userDoc.exists) tx.update(userRef, { balance: (userDoc.data().balance || 0) + amount });
                    if (pendingTxRef) tx.update(pendingTxRef, { status: 'failed', failedAt: admin.firestore.FieldValue.serverTimestamp() });
                }).catch(e => console.error('[Disburse] Refund transaction failed:', e));
                return res.status(fapshiRes.status).json(fapshiData);
            }

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

    app.get('/api/pay/status/:transId', verifyAuth, async (req, res) => {
        try {
            const { transId } = req.params;
            const response = await fetch(`${FAPSHI_BASE_URL}/payment-status/${transId}`, {
                headers: { 'apiuser': FAPSHI_USER_TOKEN, 'apikey': FAPSHI_API_KEY }
            });
            const data = await response.json();
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch payment status' });
        }
    });
};

export { pendingDeposits };