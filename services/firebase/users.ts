// Users module — user profiles, subscriptions, search.
// Does NOT import Firebase SDK directly; uses db from init.ts.
import type { User as FirebaseUser } from "firebase/auth";
import { PlayerProfile, User } from "../../types";
import { doc, getDoc, collection, query, where, orderBy, limit, startAfter, getDocs, onSnapshot } from "firebase/firestore";
import { db, getApiUrl } from './init';

const getOrCreateDeviceId = () => {
    let deviceId = localStorage.getItem('vantage_device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('vantage_device_id', deviceId);
    }
    return deviceId;
};

export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    const token = await firebaseUser.getIdToken();
    const deviceId = getOrCreateDeviceId();
    const storedReferral = sessionStorage.getItem('pendingReferral') || '';
    const signupPhone = sessionStorage.getItem('pendingSignupPhone') || '';

    const response = await fetch(`${getApiUrl()}/api/auth/sync-profile`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            deviceId,
            phone: signupPhone,
            referralCode: storedReferral
        })
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
        throw new Error(data?.error || 'Could not create your profile. Please try again.');
    }

    sessionStorage.removeItem('pendingReferral');
    sessionStorage.removeItem('pendingSignupPhone');

    return data.user as User;
};

export const subscribeToUser = (uid: string, callback: (user: User) => void) => {
    if (!uid) return () => {};
    return onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data() as User);
        }
    }, (error) => {
        console.error('[subscribeToUser] Firestore snapshot failed:', error);
    });
};

export const searchUsers = async (searchTerm: string): Promise<PlayerProfile[]> => {
    if (!searchTerm || searchTerm.length < 3) return [];
    
    const results: PlayerProfile[] = [];
    const term = searchTerm;

    // 1. Try exact ID match first
    try {
        const idDoc = await getDoc(doc(db, "users", term));
        if (idDoc.exists()) {
            const data = idDoc.data() as User;
            results.push({
                id: data.id,
                name: data.name,
                elo: data.elo,
                avatar: data.avatar,
                rankTier: data.rankTier
            });
        }
    } catch (e) {
        // Ignore invalid ID errors
    }

    // 2. Name prefix search (case-sensitive)
    const q = query(
        collection(db, "users"),
        orderBy("name"),
        where("name", ">=", term),
        where("name", "<=", term + '\uf8ff'),
        limit(10)
    );
    const snapshot = await getDocs(q);
    
    snapshot.docs.forEach(d => {
        if (d.id !== term) { // Prevent duplicates
            const data = d.data() as User;
            results.push({
                id: data.id,
                name: data.name,
                elo: data.elo,
                avatar: data.avatar,
                rankTier: data.rankTier
            });
        }
    });

    // 3. Fallback: Case-insensitive scan of recent/active users if no results
    if (results.length === 0) {
        const fallbackQ = query(collection(db, "users"), limit(200));
        const fallbackSnap = await getDocs(fallbackQ);
        const lowerTerm = term.toLowerCase();
        
        for (const d of fallbackSnap.docs) {
            const data = d.data() as User;
            if (data.name.toLowerCase().includes(lowerTerm)) {
                results.push({
                    id: data.id,
                    name: data.name,
                    elo: data.elo,
                    avatar: data.avatar,
                    rankTier: data.rankTier
                });
                if (results.length >= 10) break;
            }
        }
    }

    return results;
};

export const getAllUsers = async (lastId?: string): Promise<User[]> => {
    let q = query(collection(db, "users"), orderBy("name"), limit(100));
    if (lastId) {
        const lastDoc = await getDoc(doc(db, "users", lastId));
        if (lastDoc.exists()) q = query(collection(db, "users"), orderBy("name"), startAfter(lastDoc), limit(100));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as User);
};
