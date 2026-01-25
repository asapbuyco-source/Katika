import { initializeApp } from 'firebase/app';
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, 
  updateEmail, deleteUser, User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, 
  onSnapshot, query, where, orderBy, limit, addDoc, deleteDoc, 
  serverTimestamp, getDocs, runTransaction 
} from 'firebase/firestore';
import { User, Transaction, PlayerProfile, ForumPost, Challenge, BugReport } from "../types";
import { MOCK_TRANSACTIONS } from './mockData';

// Hardcoded configuration to ensure login works without .env files
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
    // Simulate a guest user without Firebase Auth
    const guestId = `guest-${Math.random().toString(36).substr(2, 9)}`;
    const guestUser: User = {
        id: guestId,
        name: `Guest_${guestId.substr(6)}`,
        balance: 1000,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestId}`,
        elo: 1000,
        rankTier: 'Bronze'
    };
    // We don't persist guest to Firestore in this simple implementation, or we could if needed.
    // Let's create a doc so other functions work.
    try {
        await setDoc(doc(db, "users", guestId), guestUser);
    } catch (e) {
        console.warn("Could not save guest to Firestore (likely permission/mock mode)", e);
    }
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
        // Also update firestore
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
            balance: 500, // Starting bonus
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
    
    const q = query(
        collection(db, `users/${userId}/transactions`),
        orderBy("date", "desc"),
        limit(20)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
};

export const addUserTransaction = async (userId: string, transaction: Omit<Transaction, 'id'>) => {
    if (userId.startsWith('guest')) return;
    
    // Add transaction
    await addDoc(collection(db, `users/${userId}/transactions`), transaction);
    
    // Update balance
    const userRef = doc(db, "users", userId);
    await runTransaction(db, async (transactionBatch) => {
        const userDoc = await transactionBatch.get(userRef);
        if (!userDoc.exists()) return;
        
        const newBalance = (userDoc.data().balance || 0) + transaction.amount;
        transactionBatch.update(userRef, { balance: newBalance });
    });
};

// --- MATCHMAKING & GAMES ---

export const searchUsers = async (queryStr: string): Promise<PlayerProfile[]> => {
    const q = query(
        collection(db, "users"), 
        where("name", ">=", queryStr),
        where("name", "<=", queryStr + '\uf8ff'),
        limit(5)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const d = doc.data() as User;
        return {
            id: d.id,
            name: d.name,
            elo: d.elo,
            avatar: d.avatar,
            rankTier: d.rankTier
        };
    });
};

export const createBotMatch = async (user: User, gameType: string): Promise<string> => {
    const gameRef = await addDoc(collection(db, "games"), {
        gameType,
        stake: 0,
        players: [user.id, 'bot'],
        host: { id: user.id, name: user.name, avatar: user.avatar, elo: user.elo, rankTier: user.rankTier },
        guest: { id: 'bot', name: 'V-Bot', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=bot', elo: 1000, rankTier: 'Bronze' },
        status: 'active',
        createdAt: serverTimestamp()
    });
    return gameRef.id;
};

export const findOrCreateMatch = async (user: User, gameType: string, stake: number): Promise<string> => {
    // Simplified: Just create a waiting game for now
    // Real implementation would query for waiting games with same stake/type
    const q = query(
        collection(db, "games"),
        where("gameType", "==", gameType),
        where("stake", "==", stake),
        where("status", "==", "waiting"),
        limit(1)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
        // Join existing
        const gameDoc = snapshot.docs[0];
        await updateDoc(doc(db, "games", gameDoc.id), {
            status: 'active',
            players: [...gameDoc.data().players, user.id],
            guest: { id: user.id, name: user.name, avatar: user.avatar, elo: user.elo, rankTier: user.rankTier }
        });
        return gameDoc.id;
    } else {
        // Create new
        const gameRef = await addDoc(collection(db, "games"), {
            gameType,
            stake,
            players: [user.id],
            host: { id: user.id, name: user.name, avatar: user.avatar, elo: user.elo, rankTier: user.rankTier },
            status: 'waiting',
            createdAt: serverTimestamp()
        });
        return gameRef.id;
    }
};

export const getGame = async (gameId: string): Promise<any> => {
    const snap = await getDoc(doc(db, "games", gameId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const subscribeToGame = (gameId: string, callback: (game: any) => void) => {
    return onSnapshot(doc(db, "games", gameId), (doc) => {
        if (doc.exists()) callback({ id: doc.id, ...doc.data() });
    });
};

export const getActiveGamesCount = async (): Promise<number> => {
    // In real app, maybe use a counter doc or aggregation query
    const q = query(collection(db, "games"), where("status", "==", "active"));
    const snapshot = await getDocs(q);
    return snapshot.size;
};

export const getGameActivityStats = async (): Promise<number[]> => {
    // Mock data for graph
    return Array(24).fill(0).map(() => Math.floor(Math.random() * 100));
};

// --- CHALLENGES ---

export const sendChallenge = async (sender: User, targetId: string, gameType: string, stake: number): Promise<string> => {
    const challengeRef = await addDoc(collection(db, "challenges"), {
        sender: { id: sender.id, name: sender.name, avatar: sender.avatar, elo: sender.elo, rankTier: sender.rankTier },
        targetId,
        gameType,
        stake,
        status: 'pending',
        timestamp: Date.now()
    });
    return challengeRef.id;
};

export const subscribeToChallengeStatus = (challengeId: string, callback: (data: any) => void) => {
    return onSnapshot(doc(db, "challenges", challengeId), (doc) => {
        if (doc.exists()) callback(doc.data());
    });
};

export const subscribeToIncomingChallenges = (userId: string, callback: (challenge: Challenge) => void) => {
    const q = query(
        collection(db, "challenges"),
        where("targetId", "==", userId),
        where("status", "==", "pending")
    );
    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                callback({ id: change.doc.id, ...change.doc.data() } as Challenge);
            }
        });
    });
};

export const respondToChallenge = async (challengeId: string, response: 'accepted' | 'declined', gameId?: string) => {
    await updateDoc(doc(db, "challenges", challengeId), {
        status: response,
        gameId: gameId || null
    });
};

// --- FORUM ---

export const subscribeToForum = (callback: (posts: ForumPost[]) => void) => {
    const q = query(
        collection(db, "forum_posts"),
        orderBy("timestamp", "desc"),
        limit(50)
    );
    return onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as ForumPost)).reverse();
        callback(posts);
    }, (error) => {
        console.warn("Forum sync failed", error);
        callback([]);
    });
};

export const sendForumMessage = async (user: User, content: string) => {
    if (user.id.startsWith('guest')) return;
    await addDoc(collection(db, "forum_posts"), {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        userRank: user.rankTier,
        content: content,
        timestamp: serverTimestamp(),
        likes: 0
    });
};

export const deleteForumMessage = async (postId: string) => {
    await deleteDoc(doc(db, "forum_posts", postId));
};

// --- SYSTEM & ADMIN ---

export const getSystemLogs = async (): Promise<any[]> => {
    // Mock logs
    return [
        { id: 1, action: "System Check", target: "Server 1", time: "2m ago", type: "info" },
        { id: 2, action: "User Report", target: "u-123", time: "15m ago", type: "warning" },
    ];
};

export const getBugReports = async (): Promise<BugReport[]> => {
    const q = query(collection(db, "bug_reports"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BugReport));
};

export const submitBugReport = async (report: any) => {
    await addDoc(collection(db, "bug_reports"), {
        ...report,
        status: 'open',
        timestamp: serverTimestamp()
    });
};

export const resolveBugReport = async (reportId: string) => {
    await updateDoc(doc(db, "bug_reports", reportId), { status: 'resolved' });
};

export const subscribeToGameMaintenance = (callback: (status: Record<string, boolean>) => void) => {
    return onSnapshot(doc(db, "system_settings", "game_maintenance"), (doc) => {
        if (doc.exists()) {
            callback(doc.data() as Record<string, boolean>);
        } else {
            callback({});
        }
    }, () => callback({}));
};

export const updateGameMaintenance = async (gameId: string, maintenanceMode: boolean) => {
    try {
        const ref = doc(db, "system_settings", "game_maintenance");
        await setDoc(ref, { [gameId]: maintenanceMode }, { merge: true });
    } catch (e) {
        console.error("Failed to update maintenance status", e);
    }
};