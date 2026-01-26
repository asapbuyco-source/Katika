
import { initializeApp } from 'firebase/app';
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, 
  updateEmail, deleteUser, User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, 
  onSnapshot, query, where, orderBy, limit, addDoc, deleteDoc, 
  serverTimestamp, getDocs, runTransaction, Timestamp 
} from 'firebase/firestore';
import { User, Transaction, PlayerProfile, ForumPost, Challenge, BugReport } from "../types";
import { MOCK_TRANSACTIONS } from './mockData';

const firebaseConfig = {
  apiKey: "AIzaSyAzcqlzZkfI8nwC_gmo2gRK6_IqVvZ1LzI",
  authDomain: "katika-8eef2.firebaseapp.com",
  projectId: "katika-8eef2",
  storageBucket: "katika-8eef2.firebasestorage.app",
  messagingSenderId: "758549221515",
  appId: "1:758549221515:web:67ff82bbb07e01556b448e",
  measurementId: "G-6882Y7PZ9Q"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Helper to safely convert Firestore Timestamps to strings
const convertDate = (val: any): string => {
    if (!val) return 'Unknown Date';
    if (typeof val === 'string') return val;
    if (val.toDate && typeof val.toDate === 'function') {
        return val.toDate().toLocaleString();
    }
    // Handle raw {seconds, nanoseconds} object if SDK doesn't auto-convert
    if (val.seconds) {
        return new Date(val.seconds * 1000).toLocaleString();
    }
    return 'Invalid Date';
};

// --- AUTHENTICATION ---

export const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
};

export const registerWithEmail = async (email: string, pass: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    return result.user;
};

export const loginWithEmail = async (email: string, pass: string) => {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
};

export const loginAsGuest = async (): Promise<User> => {
    const guestId = `guest-${Math.random().toString(36).substr(2, 9)}`;
    const guestUser: User = {
        id: guestId,
        name: `Guest_${guestId.substr(6)}`,
        balance: 1000,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestId}`,
        elo: 1000,
        rankTier: 'Bronze'
    };
    return guestUser;
};

export const logout = async () => {
    await signOut(auth);
};

export const triggerPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
};

export const updateUserEmail = async (email: string) => {
    if (auth.currentUser) {
        await updateEmail(auth.currentUser, email);
        await updateDoc(doc(db, "users", auth.currentUser.uid), { email });
    }
};

export const deleteAccount = async () => {
    if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        await deleteUser(auth.currentUser);
        await deleteDoc(doc(db, "users", uid));
    }
};

export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        return userSnap.data() as User;
    } else {
        const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "Player",
            balance: 500, 
            avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
            elo: 1000,
            rankTier: 'Bronze',
        };
        await setDoc(userRef, newUser);
        return newUser;
    }
};

export const subscribeToUser = (userId: string, callback: (user: User) => void) => {
    return onSnapshot(doc(db, "users", userId), (doc) => {
        if (doc.exists()) callback(doc.data() as User);
    });
};

export const getAllUsers = async (): Promise<User[]> => {
    const q = query(collection(db, "users"), limit(100));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as User);
};

// --- TRANSACTIONS ---

export const getUserTransactions = async (userId: string): Promise<Transaction[]> => {
    if (userId.startsWith('guest')) return MOCK_TRANSACTIONS;
    
    try {
        const q = query(
            collection(db, `users/${userId}/transactions`),
            orderBy("date", "desc"),
            limit(20)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            // CRITICAL FIX: Ensure date is a string to prevent React errors
            return {
                id: doc.id,
                type: data.type,
                amount: data.amount,
                status: data.status,
                date: convertDate(data.date || data.timestamp) // Handle both formats
            } as Transaction;
        });
    } catch (e) {
        console.error("Error fetching transactions", e);
        return [];
    }
};

export const addUserTransaction = async (userId: string, transaction: Omit<Transaction, 'id'>) => {
    if (userId.startsWith('guest')) return;
    
    // Add transaction
    await addDoc(collection(db, `users/${userId}/transactions`), {
        ...transaction,
        timestamp: serverTimestamp(), // Store as timestamp for sorting
        date: new Date().toISOString() // Store as string for easy display
    });
    
    // Update balance
    const userRef = doc(db, "users", userId);
    await runTransaction(db, async (transactionBatch) => {
        const userDoc = await transactionBatch.get(userRef);
        if (!userDoc.exists()) return;
        
        const newBalance = (userDoc.data().balance || 0) + transaction.amount;
        transactionBatch.update(userRef, { balance: newBalance });
    });
};

// --- GAMES & OTHER SERVICES (Simplified for audit update) ---
export const searchUsers = async (queryStr: string): Promise<PlayerProfile[]> => {
    // Basic search implementation
    const q = query(collection(db, "users"), limit(10));
    const snapshot = await getDocs(q);
    // Client side filtering for this mock implementation as Firestore basic text search is limited
    return snapshot.docs
        .map(d => d.data() as User)
        .filter(u => u.name.toLowerCase().includes(queryStr.toLowerCase()))
        .map(u => ({ id: u.id, name: u.name, elo: u.elo, avatar: u.avatar, rankTier: u.rankTier }));
};

export const createBotMatch = async (user: User, gameType: string): Promise<string> => {
    const gameRef = await addDoc(collection(db, "games"), {
        gameType,
        stake: 0,
        players: [user.id, 'bot'],
        status: 'active',
        createdAt: serverTimestamp()
    });
    return gameRef.id;
};

export const getGame = async (gameId: string): Promise<any> => {
    const snap = await getDoc(doc(db, "games", gameId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const getActiveGamesCount = async () => 0; 
export const getSystemLogs = async () => [];
export const getGameActivityStats = async () => Array(24).fill(0);
export const subscribeToGameMaintenance = (cb: (status: Record<string, boolean>) => void) => () => {};
export const updateGameMaintenance = async (gameId: string, status: boolean) => {};
export const getBugReports = async (): Promise<BugReport[]> => [];
export const submitBugReport = async (data: any) => {};
export const resolveBugReport = async (id: string) => {};
export const subscribeToIncomingChallenges = (uid: string, cb: (challenge: Challenge) => void) => () => {};
export const sendChallenge = async (user: User, targetId: string, gameType: string, stake: number) => "id";
export const subscribeToChallengeStatus = (id: string, cb: (data: any) => void) => () => {};
export const respondToChallenge = async (id: string, status: 'accepted' | 'declined') => {};
export const subscribeToForum = (cb: (posts: ForumPost[]) => void) => () => {};
export const sendForumMessage = async (user: User, content: string) => {};
export const deleteForumMessage = async (postId: string) => {};
