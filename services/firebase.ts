
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User as FirebaseUser
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where,
  orderBy, 
  limit, 
  getDocs, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp,
  runTransaction
} from "firebase/firestore";
import { User, Transaction, Table, PlayerProfile } from "../types";

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

// Auth Providers
const googleProvider = new GoogleAuthProvider();

// --- AUTH ---

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error("Google Sign In Error:", error);
    throw error;
  }
};

export const registerWithEmail = async (email: string, pass: string) => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error: any) {
        throw error;
    }
};

export const loginWithEmail = async (email: string, pass: string) => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error: any) {
        throw error;
    }
};

export const logout = async () => {
    await firebaseSignOut(auth);
};

// --- USER MANAGEMENT ---

export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        const isAdmin = firebaseUser.email === 'abrackly@gmail.com' || firebaseUser.email?.includes('admin');

        if (userSnap.exists()) {
            const data = userSnap.data() as User;
            if (isAdmin && !data.isAdmin) {
                await setDoc(userRef, { ...data, isAdmin: true, rankTier: 'Diamond' }, { merge: true });
                return { ...data, isAdmin: true, rankTier: 'Diamond' };
            }
            return data;
        } else {
            const newUser: User = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || `Player-${firebaseUser.uid.slice(0, 4)}`,
                avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
                balance: isAdmin ? 1000000 : 1000, 
                elo: 1000,
                rankTier: 'Bronze',
                isAdmin: isAdmin
            };
            await setDoc(userRef, newUser);
            return newUser;
        }
    } catch (e) {
        console.error("Profile sync error", e);
        throw e;
    }
};

export const subscribeToUser = (uid: string, callback: (user: User) => void) => {
    return onSnapshot(doc(db, "users", uid), (doc) => {
        if (doc.exists()) {
            callback(doc.data() as User);
        }
    });
};

export const searchUsers = async (searchTerm: string): Promise<PlayerProfile[]> => {
    if (!searchTerm || searchTerm.length < 3) return [];
    
    // Simple client-side filtering for demo since Firestore full-text search requires third-party (Algolia/Typesense)
    // We fetch a batch of recent users and filter. In production, use Algolia.
    const q = query(collection(db, "users"), limit(50)); 
    const snapshot = await getDocs(q);
    
    const results: PlayerProfile[] = [];
    snapshot.forEach(doc => {
        const data = doc.data() as User;
        if (data.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push({
                name: data.name,
                elo: data.elo,
                avatar: data.avatar,
                rankTier: data.rankTier
            });
        }
    });
    return results;
};

// --- TRANSACTION MANAGEMENT ---

export const getUserTransactions = async (userId: string): Promise<Transaction[]> => {
    const q = query(
        collection(db, "users", userId, "transactions"),
        orderBy("timestamp", "desc"),
        limit(20)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return { 
            id: doc.id, 
            type: data.type,
            amount: data.amount,
            status: data.status,
            date: data.date
        } as Transaction;
    });
};

export const addUserTransaction = async (userId: string, transaction: Omit<Transaction, 'id'>) => {
    await addDoc(collection(db, "users", userId, "transactions"), {
        ...transaction,
        timestamp: serverTimestamp(),
        date: new Date().toLocaleString()
    });

    const userRef = doc(db, "users", userId);
    await runTransaction(db, async (transactionDb) => {
        const sfDoc = await transactionDb.get(userRef);
        if (!sfDoc.exists()) return;
        const newBalance = (sfDoc.data().balance || 0) + transaction.amount;
        transactionDb.update(userRef, { balance: newBalance });
    });
};

// --- REAL-TIME GAME MATCHMAKING & STATE ---

// Find an open table or create one
export const findOrCreateMatch = async (user: User, gameType: string, stake: number): Promise<string> => {
    // 1. Look for waiting games
    const gamesRef = collection(db, "games");
    const q = query(
        gamesRef, 
        where("gameType", "==", gameType), 
        where("stake", "==", stake),
        where("status", "==", "waiting"),
        limit(1)
    );
    
    const snapshot = await getDocs(q);

    // 2. Join existing if found (and not created by self)
    if (!snapshot.empty) {
        const gameDoc = snapshot.docs[0];
        const gameData = gameDoc.data();
        
        if (gameData.host.id !== user.id) {
            await updateDoc(doc(db, "games", gameDoc.id), {
                status: "active",
                guest: {
                    id: user.id,
                    name: user.name,
                    avatar: user.avatar,
                    elo: user.elo,
                    rankTier: user.rankTier
                },
                players: [gameData.host.id, user.id],
                updatedAt: serverTimestamp()
            });
            return gameDoc.id;
        }
    }

    // 3. Create new game
    const newGame = {
        gameType,
        stake,
        status: "waiting",
        host: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            elo: user.elo,
            rankTier: user.rankTier
        },
        players: [user.id],
        createdAt: serverTimestamp(),
        turn: user.id, // Host starts first usually
        gameState: {} // Initial empty state, will be populated by game component
    };

    const docRef = await addDoc(collection(db, "games"), newGame);
    return docRef.id;
};

// Subscribe to game changes
export const subscribeToGame = (gameId: string, callback: (data: any) => void) => {
    return onSnapshot(doc(db, "games", gameId), (doc) => {
        if (doc.exists()) {
            callback({ id: doc.id, ...doc.data() });
        }
    });
};

// Update game state (generic)
export const updateGameState = async (gameId: string, newState: any) => {
    const gameRef = doc(db, "games", gameId);
    await updateDoc(gameRef, {
        gameState: newState,
        updatedAt: serverTimestamp()
    });
};

// Update turn
export const updateTurn = async (gameId: string, nextPlayerId: string) => {
    const gameRef = doc(db, "games", gameId);
    await updateDoc(gameRef, {
        turn: nextPlayerId
    });
};

// End Game
export const setGameResult = async (gameId: string, winnerId: string | null) => {
    const gameRef = doc(db, "games", gameId);
    await updateDoc(gameRef, {
        status: "completed",
        winner: winnerId
    });
};

export const loginAsGuest = async (): Promise<User> => {
    // For "High-Trust", we discourage guests, but keeping for dev fallback
    // We create an anonymous auth user in Firebase actually
    const { signInAnonymously } = await import("firebase/auth");
    const cred = await signInAnonymously(auth);
    return syncUserProfile(cred.user);
};
