// Users module — user profiles, subscriptions, search.
// Does NOT import Firebase SDK directly; uses db from init.ts.
import type { User as FirebaseUser } from "firebase/auth";
import { PlayerProfile, User } from "../../types";
import { doc, getDoc, setDoc, collection, query, where, orderBy, limit, startAfter, getDocs, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from './init';

export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    // SECURITY: Admin authority is server-only via ADMIN_EMAILS env var.
    // Client trusts only the isAdmin field from Firestore (populated by server.js during creation).
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        return userSnap.data() as User;
    } else {
        const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || `Player-${firebaseUser.uid.slice(0, 4)}`,
            avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
            balance: 100,
            elo: 1000,
            rankTier: 'Bronze',
            isAdmin: false,
            isBanned: false,
            hasSeenOnboarding: firebaseUser.isAnonymous ? true : false,
        };

        const storedReferral = sessionStorage.getItem('pendingReferral');
        if (storedReferral && !firebaseUser.isAnonymous) {
            newUser.referredBy = storedReferral;
        }

        await setDoc(userRef, newUser);
        return newUser;
    }
};

export const subscribeToUser = (uid: string, callback: (user: User) => void) => {
    if (!uid) return () => {};
    return onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data() as User);
        }
    });
};

export const searchUsers = async (searchTerm: string): Promise<PlayerProfile[]> => {
    if (!searchTerm || searchTerm.length < 3) return [];
    const term = searchTerm;
    const q = query(
        collection(db, "users"),
        orderBy("name"),
        where("name", ">=", term),
        where("name", "<=", term + '\uf8ff'),
        limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data() as User;
        return {
            id: data.id,
            name: data.name,
            elo: data.elo,
            avatar: data.avatar,
            rankTier: data.rankTier
        };
    });
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
