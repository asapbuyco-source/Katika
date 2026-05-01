// Admin module — ban user, maintenance mode, server status.
// All admin operations go through the server API (not client Firestore rules).
import { db, getApiUrl } from './init';
import { auth } from './init';
import { doc, getDoc, collection, query, orderBy, limit, getDocs, onSnapshot } from "firebase/firestore";

export const banUser = async (userId: string, ban: boolean): Promise<void> => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/admin/ban-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, ban })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ban failed');
    }
};

export const setMaintenanceMode = async (enabled: boolean): Promise<void> => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ enabled })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to set maintenance mode');
    }
};

export const subscribeToMaintenanceMode = (callback: (enabled: boolean) => void) => {
    return onSnapshot(doc(db, 'settings', 'maintenance'), (snap: any) => {
        callback(snap.exists() ? (snap.data().enabled ?? false) : false);
    });
};

export const getSystemLogs = async () => {
    try {
        const q = query(collection(db, "games"), orderBy("createdAt", "desc"), limit(10));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            let time = 'Just now';
            if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                time = data.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return {
                id: doc.id,
                action: data.status === 'waiting' ? 'Match Created' : 'Match Started',
                target: `${data.gameType} - ${data.stake} FCFA`,
                time: time,
                type: data.stake > 5000 ? 'warning' : 'info'
            };
        });
    } catch (e) { return []; }
};
