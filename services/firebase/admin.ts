// Admin module — ban user, maintenance mode, server status.
// All admin operations go through the server API (not client Firestore rules).
import { db, getApiUrl } from './init';
import { auth } from './init';
import { doc, getDoc, collection, query, orderBy, limit, getDocs, onSnapshot } from "firebase/firestore";

export interface AdminWithdrawalRequest {
    id: string;
    userId: string;
    amount: number;
    phone: string;
    momoName?: string;
    status: 'pending' | 'completed' | 'rejected' | 'failed';
    payoutMode?: 'manual' | 'automatic';
    requestedAt?: string;
    slaDeadline?: string;
    transactionPath?: string;
    userSnapshot?: {
        name?: string;
        email?: string;
        avatar?: string;
        balanceBefore?: number;
        balanceAfter?: number;
    };
    audit?: {
        summary?: Record<string, number>;
        recentTransactions?: Array<{
            id: string;
            type: string;
            amount: number;
            status: string;
            date?: string | null;
            note?: string;
        }>;
    };
    proofImage?: string | null;
    proofNote?: string;
    externalReference?: string;
    rejectionReason?: string;
}

const adminApiFetch = async (path: string, options: RequestInit = {}) => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
    const res = await fetch(`${SOCKET_URL}${path}`, { ...options, headers });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
};

export const getAdminWithdrawals = async (status: AdminWithdrawalRequest['status'] = 'pending'): Promise<AdminWithdrawalRequest[]> => {
    const data = await adminApiFetch(`/api/admin/withdrawals?status=${encodeURIComponent(status)}`);
    return data.withdrawals || [];
};

export const markWithdrawalPaid = async (
    id: string,
    payload: { proofImage?: string; proofNote?: string; externalReference?: string }
): Promise<void> => {
    await adminApiFetch(`/api/admin/withdrawals/${id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
};

export const rejectWithdrawal = async (id: string, reason: string): Promise<void> => {
    await adminApiFetch(`/api/admin/withdrawals/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
};

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

export const editUserBalance = async (userId: string, newBalance: number): Promise<void> => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/admin/edit-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, newBalance })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Edit balance failed');
    }
};

export const deleteUserAccount = async (userId: string): Promise<void> => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/admin/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Delete account failed');
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
    }, (error) => {
        console.error('[subscribeToMaintenanceMode] Firestore snapshot failed:', error);
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
