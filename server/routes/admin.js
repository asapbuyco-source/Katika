import admin from 'firebase-admin';

export const registerAdminRoutes = (app, verifyAdmin) => {
    app.post('/api/admin/ban-user', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
        const { userId, ban } = req.body;
        if (!userId || typeof ban !== 'boolean') return res.status(400).json({ error: 'userId and ban required' });

        try {
            await db.collection('users').doc(userId).update({ isBanned: ban });
            res.json({ success: true, banned: ban });
        } catch (e) {
            console.error('[Ban User]', e);
            res.status(500).json({ error: 'Failed to update ban status' });
        }
    });

    app.post('/api/maintenance', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' });

        try {
            await db.collection('settings').doc('maintenance').set({ enabled }, { merge: true });
            res.json({ success: true, maintenance: enabled });
        } catch (e) {
            console.error('[Maintenance]', e);
            res.status(500).json({ error: 'Failed to update maintenance mode' });
        }
    });

    app.get('/api/admin/server-status', verifyAdmin, (req, res) => {
        const mem = process.memoryUsage ? process.memoryUsage() : {};
        res.json({
            uptime: Math.floor(process.uptime()),
            memoryMB: Math.round((mem.heapUsed || 0) / 1024 / 1024),
            pid: process.pid,
            env: process.env.NODE_ENV || 'development',
            firebase: admin.apps.length > 0 ? 'connected' : 'disconnected'
        });
    });

    app.post('/api/disputes/file', async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Database unavailable' });

        const { gameId, roomId, reason } = req.body;
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!gameId || !reason) return res.status(400).json({ error: 'gameId and reason required' });

        try {
            const disputeId = `dispute_${Date.now()}_${userId}`;
            await db.collection('disputes').doc(disputeId).set({
                id: disputeId, gameId, roomId,
                filedBy: userId, reason,
                status: 'open',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                slaDeadline: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000))
            });
            res.json({ disputeId, success: true });
        } catch (e) {
            console.error('[File Dispute]', e);
            res.status(500).json({ error: 'Failed to file dispute' });
        }
    });

    app.get('/api/disputes/status/:disputeId', async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Database unavailable' });
        const { disputeId } = req.params;
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const docSnap = await db.collection('disputes').doc(disputeId).get();
            if (!docSnap.exists) return res.status(404).json({ error: 'Not found' });
            const data = docSnap.data();
            if (data.filedBy !== userId && !ADMIN_EMAILS.includes(req.user.email))
                return res.status(403).json({ error: 'Forbidden' });
            res.json({ status: data.status, resolution: data.resolution || null });
        } catch (e) {
            console.error('[Dispute Status]', e);
            res.status(500).json({ error: 'Failed to fetch dispute status' });
        }
    });

    app.post('/api/disputes/resolve', verifyAdmin, async (req, res) => {
        const db = admin.apps.length > 0 ? admin.firestore() : null;
        if (!db) return res.status(503).json({ error: 'Database unavailable' });
        const { disputeId, resolution, refund } = req.body;
        if (!disputeId || !resolution) return res.status(400).json({ error: 'disputeId and resolution required' });

        try {
            await db.collection('disputes').doc(disputeId).update({
                status: 'resolved', resolution,
                refund: refund || false,
                resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
                resolvedBy: req.user.email
            });
            res.json({ success: true });
        } catch (e) {
            console.error('[Resolve Dispute]', e);
            res.status(500).json({ error: 'Failed to resolve dispute' });
        }
    });
};