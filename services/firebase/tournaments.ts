// Tournaments module — tournament CRUD, registration, match management.
// SERVER is the authoritative source for all tournament operations.
// Client-side tournament functions delegate to the server API.
import {
    doc, getDoc, setDoc, collection, query, where, orderBy, limit,
    getDocs, addDoc, updateDoc, onSnapshot, serverTimestamp, runTransaction, writeBatch
} from "firebase/firestore";
import { db } from './init';
import { Tournament, TournamentMatch } from '../../types';
import { getApiUrl } from './init';
import { auth } from './init';

let _serverTimeOffset = 0;

export const fetchServerTimeOffset = async () => {
    try {
        const before = Date.now();
        const res = await fetch(`${getApiUrl()}/api/time`);
        const after = Date.now();
        if (res.ok) {
            const { serverTime } = await res.json();
            const roundTrip = after - before;
            _serverTimeOffset = serverTime - (before + roundTrip / 2);
        }
    } catch { /* silently skip */ }
};

export const getServerTime = () => Date.now() + _serverTimeOffset;

export const getTournaments = async (): Promise<Tournament[]> => {
    const q = query(collection(db, "tournaments"), orderBy("startTime", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
};

export const subscribeToTournament = (tournamentId: string, callback: (t: Tournament) => void) => {
    return onSnapshot(doc(db, "tournaments", tournamentId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as Tournament);
        }
    });
};

export const subscribeToTournamentMatches = (tournamentId: string, callback: (matches: TournamentMatch[]) => void) => {
    const q = query(collection(db, "tournament_matches"), where("tournamentId", "==", tournamentId));
    return onSnapshot(q, (snapshot) => {
        const matches = snapshot.docs.map(doc => doc.data() as TournamentMatch);
        matches.sort((a, b) => {
            if (a.round === b.round) return a.matchIndex - b.matchIndex;
            return a.round - b.round;
        });
        callback(matches);
    });
};

export const getTournamentMatches = async (tournamentId: string): Promise<TournamentMatch[]> => {
    try {
        const q = query(collection(db, "tournament_matches"), where("tournamentId", "==", tournamentId));
        const snapshot = await getDocs(q);
        const matches = snapshot.docs.map(doc => doc.data() as TournamentMatch);
        return matches.sort((a, b) => {
            if (a.round === b.round) return a.matchIndex - b.matchIndex;
            return a.round - b.round;
        });
    } catch (e) {
        console.error("Fetch Matches Error", e);
        return [];
    }
};

// Delegate tournament creation to the server API (admin-only).
export const createTournament = async (data: Omit<Tournament, 'id'>) => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/tournaments/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create tournament');
    }
    return res.json();
};

export const deleteTournament = async (tournamentId: string) => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/tournaments/${tournamentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete tournament');
    }
};

export const updateTournamentStatus = async (tournamentId: string, status: 'active' | 'completed' | 'registration') => {
    await updateDoc(doc(db, "tournaments", tournamentId), { status });
};

// Delegate tournament start to the server API (admin-only).
export const startTournament = async (tournamentId: string) => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/tournaments/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tournamentId })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start tournament');
    }
};

export const setTournamentMatchActive = async (matchId: string) => {
    await updateDoc(doc(db, "tournament_matches", matchId), { status: 'active' });
};

export const setTournamentMatchCheckedIn = async (matchId: string, userId: string) => {
    const matchRef = doc(db, "tournament_matches", matchId);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) return;
    const existing = matchSnap.data().checkedIn || [];
    if (!existing.includes(userId)) {
        await updateDoc(matchRef, { checkedIn: [...existing, userId] });
    }
};

// Delegate result reporting to the server API (handles bracket advancement atomically).
export const reportTournamentMatchResult = async (matchId: string, winnerId: string) => {
    const SOCKET_URL = getApiUrl();
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${SOCKET_URL}/api/tournaments/force-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ matchId, winnerId })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to report match result');
    }
};

export const registerForTournament = async (tournamentId: string, user: { id: string }) => {
    try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${getApiUrl()}/api/tournaments/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                tournamentId,
                userId: user.id
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Registration failed');
        }
        return true;
    } catch (e) {
        console.error("Tournament registration failed:", e);
        return false;
    }
};