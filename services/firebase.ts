
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
  runTransaction,
  deleteDoc
} from "firebase/firestore";
import { User, Transaction, Table, PlayerProfile, ForumPost, Challenge } from "../types";

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
    console.warn("Google Sign In Error (Falling back to simulation):", error);
    // Simulate successful login for demo/preview environments where Google Auth might be blocked
    const mockUser: Partial<FirebaseUser> = {
        uid: `google-user-${Date.now()}`,
        displayName: "Google User (Sim)",
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`,
        email: "demo.user@gmail.com",
        emailVerified: true,
        isAnonymous: false,
    };
    return mockUser as FirebaseUser;
  }
};

export const registerWithEmail = async (email: string, pass: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    return result.user;
};

export const loginWithEmail = async (email: string, pass: string) => {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
};

export const logout = async () => {
    await firebaseSignOut(auth);
};

// --- USER MANAGEMENT ---

export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    // 1. Determine if Admin based on email
    const isAdmin = firebaseUser.email === 'abrackly@gmail.com' || firebaseUser.email?.includes('admin');

    try {
        // 2. Try to fetch/create in Firestore
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data() as User;
            // Force admin upgrade if email matches but record doesn't
            if (isAdmin && !data.isAdmin) {
                await setDoc(userRef, { ...data, isAdmin: true, rankTier: 'Diamond' }, { merge: true });
                return { ...data, isAdmin: true, rankTier: 'Diamond' };
            }
            return data;
        } else {
            // New User Registration in DB
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
        console.warn("Profile sync failed (using local fallback):", e);
        
        // 3. Fallback for when Firestore is unreachable or Permission Denied (e.g. Simulated Auth)
        // This ensures the user can still enter the app with a valid profile
        return {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || `Guest-${firebaseUser.uid.slice(0, 4)}`,
            avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
            balance: isAdmin ? 1000000 : 2500, // Slightly higher starting balance for demo
            elo: 1000,
            rankTier: 'Bronze',
            isAdmin: isAdmin
        };
    }
};

export const subscribeToUser = (uid: string, callback: (user: User) => void) => {
    // If it's a simulated user, we can't subscribe to Firestore. 
    // Just ignore or could set up a local interval if needed.
    if (uid.startsWith('google-user-') || uid.startsWith('guest-')) {
        return () => {}; // No-op unsubscribe
    }

    return onSnapshot(doc(db, "users", uid), (doc) => {
        if (doc.exists()) {
            callback(doc.data() as User);
        }
    });
};

export const searchUsers = async (searchTerm: string): Promise<PlayerProfile[]> => {
    if (!searchTerm || searchTerm.length < 3) return [];
    
    try {
        const q = query(collection(db, "users"), limit(50)); 
        const snapshot = await getDocs(q);
        
        const results: PlayerProfile[] = [];
        snapshot.forEach(doc => {
            const data = doc.data() as User;
            if (data.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                results.push({
                    id: data.id,
                    name: data.name,
                    elo: data.elo,
                    avatar: data.avatar,
                    rankTier: data.rankTier
                });
            }
        });
        return results;
    } catch (e) {
        console.warn("Search failed", e);
        return [];
    }
};

export const getAllUsers = async (): Promise<User[]> => {
    try {
        const q = query(collection(db, "users"), limit(100));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as User);
    } catch (e) {
        console.error("Failed to fetch users", e);
        return [];
    }
};

// --- TRANSACTION MANAGEMENT ---

export const getUserTransactions = async (userId: string): Promise<Transaction[]> => {
    // Return empty for simulated users to prevent crashes
    if (userId.startsWith('google-user-') || userId.startsWith('guest-')) return [];

    try {
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
    } catch (e) {
        return [];
    }
};

export const addUserTransaction = async (userId: string, transaction: Omit<Transaction, 'id'>) => {
    if (userId.startsWith('google-user-') || userId.startsWith('guest-')) return;

    try {
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
    } catch (e) {
        console.error("Transaction failed", e);
    }
};

// --- REAL-TIME GAME MATCHMAKING & STATE ---

export const findOrCreateMatch = async (user: User, gameType: string, stake: number): Promise<string> => {
    // Simulation for guests
    if (user.id.startsWith('google-user-') || user.id.startsWith('guest-')) {
        return `sim-match-${Date.now()}`;
    }

    try {
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
            turn: user.id,
            gameState: {} 
        };

        const docRef = await addDoc(collection(db, "games"), newGame);
        return docRef.id;
    } catch (e) {
        console.error("Matchmaking error", e);
        return `local-match-${Date.now()}`;
    }
};

export const createBotMatch = async (user: User, gameType: string): Promise<string> => {
    const botProfile: PlayerProfile = {
        name: "Vantage AI",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=vantage_bot_9000",
        elo: 1200,
        rankTier: 'Silver'
    };

    // If local user, return fake ID, data will be mocked by components
    if (user.id.startsWith('google-user-') || user.id.startsWith('guest-')) {
        // We create a "fake" game object in memory effectively by returning a special ID
        // The components usually fetch game data. We need to handle that.
        // Actually, for robust local play, we might need to rely on the fallback in getGame below.
        return `bot-match-${Date.now()}`;
    }

    try {
        const newGame = {
            gameType,
            stake: 0,
            status: "active",
            host: {
                id: user.id,
                name: user.name,
                avatar: user.avatar,
                elo: user.elo,
                rankTier: user.rankTier
            },
            guest: {
                id: 'bot',
                ...botProfile
            },
            players: [user.id, 'bot'],
            createdAt: serverTimestamp(),
            turn: user.id,
            gameState: {}
        };

        const docRef = await addDoc(collection(db, "games"), newGame);
        return docRef.id;
    } catch(e) {
        return `bot-match-fallback-${Date.now()}`;
    }
};

export const subscribeToGame = (gameId: string, callback: (data: any) => void) => {
    if (gameId.startsWith('sim-match') || gameId.startsWith('bot-match') || gameId.startsWith('local-match')) {
        // Return dummy data for local matches
        setTimeout(() => {
            callback({
                id: gameId,
                status: 'active',
                gameType: 'Dice', // Default
                stake: 100,
                host: { id: 'local-host', name: 'You', avatar: 'https://i.pravatar.cc/150' },
                guest: { id: 'bot', name: 'Vantage AI', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=bot' },
                turn: 'local-host',
                gameState: {}
            });
        }, 500);
        return () => {};
    }

    return onSnapshot(doc(db, "games", gameId), (doc) => {
        if (doc.exists()) {
            callback({ id: doc.id, ...doc.data() });
        }
    });
};

export const getGame = async (gameId: string): Promise<any> => {
    // Local Fallback
    if (gameId.startsWith('sim-match') || gameId.startsWith('bot-match') || gameId.startsWith('local-match')) {
        return {
            id: gameId,
            status: 'active',
            gameType: 'Dice',
            stake: 0,
            host: { id: 'local-me', name: 'You', avatar: 'https://i.pravatar.cc/150' },
            guest: { id: 'bot', name: 'Vantage AI', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=bot' },
            turn: 'local-me',
            gameState: {}
        };
    }

    try {
        const docSnap = await getDoc(doc(db, "games", gameId));
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const updateGameState = async (gameId: string, newState: any) => {
    if (gameId.startsWith('sim-match') || gameId.startsWith('bot-match') || gameId.startsWith('local-match')) return;
    try {
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            gameState: newState,
            updatedAt: serverTimestamp()
        });
    } catch (e) { console.warn("Game update failed", e); }
};

export const updateTurn = async (gameId: string, nextPlayerId: string) => {
    if (gameId.startsWith('sim-match') || gameId.startsWith('bot-match') || gameId.startsWith('local-match')) return;
    try {
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            turn: nextPlayerId
        });
    } catch (e) { console.warn("Turn update failed", e); }
};

export const setGameResult = async (gameId: string, winnerId: string | null) => {
    if (gameId.startsWith('sim-match') || gameId.startsWith('bot-match') || gameId.startsWith('local-match')) return;
    try {
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            status: "completed",
            winner: winnerId
        });
    } catch (e) { console.warn("Result update failed", e); }
};

export const loginAsGuest = async (): Promise<User> => {
    try {
        const { signInAnonymously } = await import("firebase/auth");
        const cred = await signInAnonymously(auth);
        return syncUserProfile(cred.user);
    } catch (e) {
        // Fallback for purely offline guest
        const fakeUid = `guest-${Date.now()}`;
        return {
            id: fakeUid,
            name: "Guest Player",
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${fakeUid}`,
            balance: 2000,
            elo: 1000,
            rankTier: 'Bronze',
            isAdmin: false
        };
    }
};

// --- CHALLENGES ---

export const sendChallenge = async (sender: User, targetId: string, gameType: string, stake: number) => {
    if (sender.id.startsWith('google-user-') || sender.id.startsWith('guest-')) return "local-challenge-id";

    const challengeData = {
        sender: {
            id: sender.id,
            name: sender.name,
            avatar: sender.avatar,
            elo: sender.elo,
            rankTier: sender.rankTier
        },
        targetId: targetId,
        gameType: gameType,
        stake: stake,
        status: 'pending',
        timestamp: serverTimestamp(),
        createdAt: Date.now()
    };
    const docRef = await addDoc(collection(db, "challenges"), challengeData);
    return docRef.id;
};

export const subscribeToIncomingChallenges = (userId: string, callback: (challenge: Challenge | null) => void) => {
    if (userId.startsWith('google-user-') || userId.startsWith('guest-')) return () => {};

    const q = query(
        collection(db, "challenges"),
        where("targetId", "==", userId),
        where("status", "==", "pending")
    );

    return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge));
            // Sort by timestamp descending
            challenges.sort((a, b) => {
                const tA = (a.timestamp as any)?.toMillis ? (a.timestamp as any).toMillis() : (a.timestamp || 0);
                const tB = (b.timestamp as any)?.toMillis ? (b.timestamp as any).toMillis() : (b.timestamp || 0);
                return tB - tA;
            });
            callback(challenges[0]);
        } else {
            callback(null);
        }
    });
};

export const subscribeToChallengeStatus = (challengeId: string, callback: (data: Challenge) => void) => {
    if (challengeId === 'local-challenge-id') return () => {};

    return onSnapshot(doc(db, "challenges", challengeId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as Challenge);
        }
    });
};

export const respondToChallenge = async (challengeId: string, status: 'accepted' | 'declined', gameId?: string) => {
    if (challengeId === 'local-challenge-id') return;
    await updateDoc(doc(db, "challenges", challengeId), {
        status: status,
        gameId: gameId || null
    });
};

export const createChallengeGame = async (challenge: Challenge, receiver: User): Promise<string> => {
    if (receiver.id.startsWith('google-user-') || receiver.id.startsWith('guest-')) return `sim-challenge-game-${Date.now()}`;

    const newGame = {
        gameType: challenge.gameType,
        stake: challenge.stake,
        status: "active",
        host: challenge.sender, 
        guest: {
            id: receiver.id,
            name: receiver.name,
            avatar: receiver.avatar,
            elo: receiver.elo,
            rankTier: receiver.rankTier
        },
        players: [challenge.sender.id!, receiver.id],
        createdAt: serverTimestamp(),
        turn: challenge.sender.id,
        gameState: {}
    };
    
    const docRef = await addDoc(collection(db, "games"), newGame);
    return docRef.id;
};

// --- ADMIN & STATS ---

export const getActiveGamesCount = async (): Promise<number> => {
    try {
        const q = query(collection(db, "games"), where("status", "in", ["active", "waiting"]));
        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (e) {
        return 0;
    }
};

export const getSystemLogs = async () => {
    try {
        const q = query(collection(db, "games"), orderBy("createdAt", "desc"), limit(10));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            let time = 'Just now';
            if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                time = data.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            return {
                id: doc.id,
                action: data.status === 'waiting' ? 'Match Created' : 'Match Started',
                target: `${data.gameType} - ${data.stake} FCFA`,
                time: time,
                type: data.stake > 5000 ? 'warning' : 'info'
            };
        });
    } catch (e) {
        return [];
    }
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
        // Fallback for forum
        callback([
            { id: '1', userId: 'bot', userName: 'Vantage Bot', userAvatar: '', userRank: 'Diamond', content: 'Welcome to the forum! (Offline Mode)', timestamp: null, likes: 0 }
        ] as any);
    });
};

export const sendForumMessage = async (user: User, content: string) => {
    if (user.id.startsWith('google-user-') || user.id.startsWith('guest-')) return;
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
