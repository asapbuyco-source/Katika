
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateEmail,
  deleteUser,
  User as FirebaseUser,
  signInAnonymously
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
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { User, Transaction, Table, PlayerProfile, ForumPost, Challenge, BugReport, Tournament, TournamentMatch } from "../types";

// ... existing config and auth ...
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

const googleProvider = new GoogleAuthProvider();

// ... (keep auth/user/transaction/game functions as is until Tournaments section) ...

export const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
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

export const logout = async () => {
    await firebaseSignOut(auth);
};

export const triggerPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
};

export const updateUserEmail = async (newEmail: string) => {
    if (auth.currentUser) {
        await updateEmail(auth.currentUser, newEmail);
    }
};

export const deleteAccount = async () => {
    if (auth.currentUser) {
        await deleteUser(auth.currentUser);
    }
};

export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    const isAdmin = firebaseUser.email === 'abrackly@gmail.com' || firebaseUser.email?.includes('admin');
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

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
            isAdmin: isAdmin,
            isBanned: false
        };
        await setDoc(userRef, newUser);
        return newUser;
    }
};

export const subscribeToUser = (uid: string, callback: (user: User) => void) => {
    if (!uid) return () => {};
    return onSnapshot(doc(db, "users", uid), (doc) => {
        if (doc.exists()) {
            callback(doc.data() as User);
        }
    });
};

export const searchUsers = async (searchTerm: string): Promise<PlayerProfile[]> => {
    if (!searchTerm || searchTerm.length < 3) return [];
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
};

export const getAllUsers = async (): Promise<User[]> => {
    const q = query(collection(db, "users"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as User);
};

export const updateGameStatus = async (gameId: string, status: 'active' | 'coming_soon') => {
    await setDoc(doc(db, "game_configs", gameId), { status }, { merge: true });
};

export const subscribeToGameConfigs = (callback: (configs: Record<string, string>) => void) => {
    return onSnapshot(collection(db, "game_configs"), (snapshot) => {
        const configs: Record<string, string> = {};
        snapshot.forEach(doc => {
            configs[doc.id] = doc.data().status;
        });
        callback(configs);
    });
};

export const getUserTransactions = async (userId: string): Promise<Transaction[]> => {
    if (!userId) return [];
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
        console.error("Error fetching transactions", e);
        return [];
    }
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

export const findOrCreateMatch = async (user: User, gameType: string, stake: number): Promise<string> => {
    const gamesRef = collection(db, "games");
    const q = query(
        gamesRef, 
        where("gameType", "==", gameType), 
        where("stake", "==", stake),
        where("status", "==", "waiting"),
        limit(1)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        const gameDoc = snapshot.docs[0];
        const gameData = gameDoc.data();
        if (gameData.host.id !== user.id) {
            await updateDoc(doc(db, "games", gameDoc.id), {
                status: "active",
                guest: { id: user.id, name: user.name, avatar: user.avatar, elo: user.elo, rankTier: user.rankTier },
                players: [gameData.host.id, user.id],
                updatedAt: serverTimestamp()
            });
            return gameDoc.id;
        }
    }

    const newGame = {
        gameType,
        stake,
        status: "waiting",
        host: { id: user.id, name: user.name, avatar: user.avatar, elo: user.elo, rankTier: user.rankTier },
        players: [user.id],
        createdAt: serverTimestamp(),
        turn: user.id,
        gameState: {} 
    };
    const docRef = await addDoc(collection(db, "games"), newGame);
    return docRef.id;
};

export const createBotMatch = async (user: User, gameType: string, difficulty?: string): Promise<string> => {
    const botProfile: PlayerProfile = {
        name: "Vantage AI",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=vantage_bot_9000",
        elo: 1200,
        rankTier: 'Silver'
    };
    const newGame = {
        gameType,
        stake: 0,
        status: "active",
        host: { id: user.id, name: user.name, avatar: user.avatar, elo: user.elo, rankTier: user.rankTier },
        guest: { id: 'bot', ...botProfile },
        players: [user.id, 'bot'],
        createdAt: serverTimestamp(),
        turn: user.id,
        gameState: { difficulty: difficulty || 'medium' }
    };
    const docRef = await addDoc(collection(db, "games"), newGame);
    return docRef.id;
};

export const subscribeToGame = (gameId: string, callback: (data: any) => void) => {
    return onSnapshot(doc(db, "games", gameId), (doc) => {
        if (doc.exists()) {
            callback({ id: doc.id, ...doc.data() });
        }
    });
};

export const getGame = async (gameId: string): Promise<any> => {
    const docSnap = await getDoc(doc(db, "games", gameId));
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
};

export const updateGameState = async (gameId: string, newState: any) => {
    const gameRef = doc(db, "games", gameId);
    await updateDoc(gameRef, {
        gameState: newState,
        updatedAt: serverTimestamp()
    });
};

export const updateTurn = async (gameId: string, nextPlayerId: string) => {
    const gameRef = doc(db, "games", gameId);
    await updateDoc(gameRef, { turn: nextPlayerId });
};

export const setGameResult = async (gameId: string, winnerId: string | null) => {
    const gameRef = doc(db, "games", gameId);
    await updateDoc(gameRef, { status: "completed", winner: winnerId });
};

export const loginAsGuest = async (): Promise<User> => {
    const cred = await signInAnonymously(auth);
    return syncUserProfile(cred.user);
};

export const sendChallenge = async (sender: User, targetId: string, gameType: string, stake: number) => {
    const challengeData = {
        sender: { id: sender.id, name: sender.name, avatar: sender.avatar, elo: sender.elo, rankTier: sender.rankTier },
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
    if (!userId) return () => {};
    const q = query(collection(db, "challenges"), where("targetId", "==", userId), where("status", "==", "pending"));
    return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const challenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge));
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
    return onSnapshot(doc(db, "challenges", challengeId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as Challenge);
        }
    });
};

export const respondToChallenge = async (challengeId: string, status: 'accepted' | 'declined', gameId?: string) => {
    await updateDoc(doc(db, "challenges", challengeId), { status: status, gameId: gameId || null });
};

export const createChallengeGame = async (challenge: Challenge, receiver: User): Promise<string> => {
    const newGame = {
        gameType: challenge.gameType,
        stake: challenge.stake,
        status: "active",
        host: challenge.sender, 
        guest: { id: receiver.id, name: receiver.name, avatar: receiver.avatar, elo: receiver.elo, rankTier: receiver.rankTier },
        players: [challenge.sender.id!, receiver.id],
        createdAt: serverTimestamp(),
        turn: challenge.sender.id,
        gameState: {}
    };
    const docRef = await addDoc(collection(db, "games"), newGame);
    return docRef.id;
};

// --- TOURNAMENTS ---

export const getTournaments = async (): Promise<Tournament[]> => {
    const q = query(collection(db, "tournaments"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
};

// NEW: Subscribe to single tournament for real-time updates
export const subscribeToTournament = (tournamentId: string, callback: (t: Tournament) => void) => {
    return onSnapshot(doc(db, "tournaments", tournamentId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as Tournament);
        }
    });
};

export const createTournament = async (data: Omit<Tournament, 'id'>) => {
    await addDoc(collection(db, "tournaments"), data);
};

export const deleteTournament = async (tournamentId: string) => {
    await deleteDoc(doc(db, "tournaments", tournamentId));
    const q = query(collection(db, "tournament_matches"), where("tournamentId", "==", tournamentId));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
};

export const updateTournamentStatus = async (tournamentId: string, status: 'active' | 'completed' | 'registration') => {
    await updateDoc(doc(db, "tournaments", tournamentId), { status });
};

export const startTournament = async (tournamentId: string) => {
    const tRef = doc(db, "tournaments", tournamentId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) return;
    const tData = tSnap.data() as Tournament;

    const participants = [...tData.participants];
    for (let i = participants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [participants[i], participants[j]] = [participants[j], participants[i]];
    }

    const batch = writeBatch(db);
    const matchesRef = collection(db, "tournament_matches");

    let matchCount = 0;
    const round = 1;

    const playerProfiles = await Promise.all(participants.map(async (uid) => {
        const uSnap = await getDoc(doc(db, 'users', uid));
        return uSnap.exists() ? uSnap.data() as User : { id: uid, name: 'Unknown', avatar: '', elo: 0, rankTier: 'Bronze' };
    }));

    while (playerProfiles.length > 0) {
        const p1 = playerProfiles.pop();
        const p2 = playerProfiles.pop(); 

        const matchId = `m-${tournamentId}-r${round}-${matchCount}`;
        const matchRef = doc(matchesRef, matchId); 

        const matchData: any = {
            id: matchId,
            tournamentId,
            round,
            matchIndex: matchCount,
            player1: p1 ? { id: p1.id, name: p1.name, avatar: p1.avatar, rankTier: p1.rankTier, elo: p1.elo } : null,
            player2: p2 ? { id: p2.id, name: p2.name, avatar: p2.avatar, rankTier: p2.rankTier, elo: p2.elo } : null,
            winnerId: p2 ? null : p1?.id, 
            status: p2 ? 'scheduled' : 'completed',
            startTime: tData.startTime, 
            nextMatchId: null 
        };

        batch.set(matchRef, matchData);
        matchCount++;
    }

    batch.update(tRef, { status: 'active', participants: participants });
    await batch.commit();
};

export const setTournamentMatchActive = async (matchId: string) => {
    await updateDoc(doc(db, "tournament_matches", matchId), { status: 'active' });
};

export const checkTournamentTimeouts = async (tournamentId: string) => {
    const q = query(
        collection(db, "tournament_matches"), 
        where("tournamentId", "==", tournamentId),
        where("status", "==", "scheduled")
    );
    const snapshot = await getDocs(q);
    const now = new Date();

    for (const docSnap of snapshot.docs) {
        const m = docSnap.data() as TournamentMatch;
        const start = new Date(m.startTime);
        const diffMins = (now.getTime() - start.getTime()) / 60000;

        if (diffMins > 3) { // Reduced to 3 minutes for faster auto-forfeit in production/demo
             console.log(`Auto-forfeiting match ${m.id} due to no-show`);
             
             // If neither joined, pick random winner to advance bracket
             let winnerId;
             if (m.player1 && m.player2) {
                 winnerId = Math.random() > 0.5 ? m.player1.id : m.player2.id;
             } else {
                 winnerId = m.player1?.id || m.player2?.id || 'bye';
             }

             // Check if match status changed in meantime (safety)
             const freshSnap = await getDoc(docSnap.ref);
             if (freshSnap.exists() && freshSnap.data().status === 'scheduled') {
                 await reportTournamentMatchResult(m.id, winnerId!);
             }
        }
    }
};

export const reportTournamentMatchResult = async (matchId: string, winnerId: string) => {
    await updateDoc(doc(db, "tournament_matches", matchId), {
        winnerId,
        status: 'completed'
    });

    const mSnap = await getDoc(doc(db, "tournament_matches", matchId));
    if (!mSnap.exists()) return;
    const mData = mSnap.data() as TournamentMatch;

    await checkAndAdvanceTournament(mData.tournamentId, mData.round);
}

const checkAndAdvanceTournament = async (tournamentId: string, round: number) => {
    const q = query(
        collection(db, "tournament_matches"),
        where("tournamentId", "==", tournamentId),
        where("round", "==", round)
    );
    const snapshot = await getDocs(q);
    const matches = snapshot.docs.map(d => d.data() as TournamentMatch);

    const allComplete = matches.every(m => m.status === 'completed');
    if (!allComplete || matches.length === 0) return; 

    // Double Check: Ensure next round doesn't already exist to prevent race conditions
    const nextRoundCheck = query(
        collection(db, "tournament_matches"),
        where("tournamentId", "==", tournamentId),
        where("round", "==", round + 1),
        limit(1)
    );
    const nextRoundSnap = await getDocs(nextRoundCheck);
    if (!nextRoundSnap.empty) return; // Next round already generated by another process

    matches.sort((a,b) => a.matchIndex - b.matchIndex);
    const winners = matches.map(m => m.winnerId).filter(Boolean) as string[];

    // Ensure it is truly the final match of the bracket (Single winner from a single match round)
    if (winners.length === 1 && matches.length === 1) {
        const winnerId = winners[0];
        await runTransaction(db, async (transaction) => {
            const tourneyRef = doc(db, "tournaments", tournamentId);
            const tourneyDoc = await transaction.get(tourneyRef);
            if (!tourneyDoc.exists()) throw "Tournament not found";
            
            const tData = tourneyDoc.data() as Tournament;
            if (tData.status === 'completed') return; 

            const winnerRef = doc(db, "users", winnerId);
            const winnerDoc = await transaction.get(winnerRef);
            
            if (winnerDoc.exists()) {
                const currentBal = winnerDoc.data().balance || 0;
                // Accumulate prize if dynamic (ensure we use the latest pool value from DB)
                const finalPrize = tData.prizePool || 0;

                transaction.update(winnerRef, { 
                    balance: currentBal + finalPrize 
                });
                
                const txRef = doc(collection(db, "users", winnerId, "transactions"));
                transaction.set(txRef, {
                    type: 'winnings', 
                    amount: finalPrize,
                    status: 'completed',
                    date: new Date().toISOString(),
                    timestamp: serverTimestamp(),
                    note: `Tournament Win: ${tData.name}`
                });
            }

            transaction.update(tourneyRef, {
                status: 'completed',
                winnerId: winnerId
            });
        });
        return;
    }

    const batch = writeBatch(db);
    const matchesRef = collection(db, "tournament_matches");
    let nextRoundMatchCount = 0;

    for (let i = 0; i < winners.length; i += 2) {
        const p1Id = winners[i];
        const p2Id = winners[i+1]; 

        const p1Doc = await getDoc(doc(db, "users", p1Id));
        const p1Data = p1Doc.exists() ? p1Doc.data() : { id: p1Id, name: 'Unknown', avatar: '' };
        
        let p2Data = null;
        if (p2Id) {
            const p2Doc = await getDoc(doc(db, "users", p2Id));
            p2Data = p2Doc.exists() ? p2Doc.data() : { id: p2Id, name: 'Unknown', avatar: '' };
        }

        const newMatchId = `m-${tournamentId}-r${round+1}-${nextRoundMatchCount}`;
        
        const matchData: any = {
            id: newMatchId,
            tournamentId,
            round: round + 1,
            matchIndex: nextRoundMatchCount,
            player1: { id: p1Data.id, name: p1Data.name, avatar: p1Data.avatar, rankTier: p1Data.rankTier },
            player2: p2Data ? { id: p2Data.id, name: p2Data.name, avatar: p2Data.avatar, rankTier: p2Data.rankTier } : null,
            winnerId: p2Id ? null : p1Id,
            status: p2Id ? 'scheduled' : 'completed', 
            startTime: new Date(Date.now() + 60000).toISOString() 
        };

        batch.set(doc(matchesRef, newMatchId), matchData);
        nextRoundMatchCount++;
    }
    await batch.commit();
};

export const registerForTournament = async (tournamentId: string, user: User) => {
    const tRef = doc(db, "tournaments", tournamentId);
    try {
        await runTransaction(db, async (transaction) => {
            const tDoc = await transaction.get(tRef);
            if (!tDoc.exists()) throw "Tournament does not exist";
            
            const tData = tDoc.data() as Tournament;
            if (tData.status !== 'registration') throw "Tournament not in registration phase";
            if (tData.participants.length >= tData.maxPlayers) throw "Tournament full";
            if (tData.participants.includes(user.id)) throw "Already registered";

            const userRef = doc(db, "users", user.id);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User not found";
            
            const userData = userDoc.data() as User;
            if (userData.balance < tData.entryFee) throw "Insufficient funds";

            transaction.update(userRef, { balance: userData.balance - tData.entryFee });
            
            const newTxRef = doc(collection(db, "users", user.id, "transactions"));
            transaction.set(newTxRef, {
                type: 'tournament_entry',
                amount: -tData.entryFee,
                status: 'completed',
                date: new Date().toISOString(),
                timestamp: serverTimestamp()
            });

            if (tData.type === 'fixed') {
                transaction.update(tRef, { participants: [...tData.participants, user.id] });
            } else {
                const platformFee = Math.floor(tData.entryFee * 0.10);
                const netContribution = tData.entryFee - platformFee;
                transaction.update(tRef, {
                    participants: [...tData.participants, user.id],
                    prizePool: (tData.prizePool || 0) + netContribution
                });
            }
        });
        return true;
    } catch (e) {
        console.error("Tournament registration failed:", e);
        return false;
    }
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

// ... (stats, bug reports, forum, live winners functions - keep unchanged)
export const getActiveGamesCount = async (): Promise<number> => {
    try {
        const q = query(collection(db, "games"), where("status", "in", ["active", "waiting"]));
        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (e) { return 0; }
};

export const getGameActivityStats = async (): Promise<number[]> => {
    try {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        const q = query(collection(db, "games"), where("createdAt", ">=", yesterday), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(q);
        const buckets = new Array(24).fill(0);
        const now = new Date().getTime();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.createdAt) {
                const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                const diffMs = now - date.getTime();
                const hourIndex = 23 - Math.floor(diffMs / (1000 * 60 * 60));
                if (hourIndex >= 0 && hourIndex < 24) buckets[hourIndex]++;
            }
        });
        return buckets;
    } catch (e) { return new Array(24).fill(0); }
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
    } catch (e) { return []; }
};

export const submitBugReport = async (report: Omit<BugReport, 'id' | 'timestamp' | 'status'>) => {
    await addDoc(collection(db, "bug_reports"), { ...report, status: 'open', timestamp: serverTimestamp() });
    return true;
};

export const getBugReports = async (): Promise<BugReport[]> => {
    try {
        const q = query(collection(db, "bug_reports"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BugReport));
    } catch (e) { return []; }
};

export const resolveBugReport = async (id: string) => {
    await updateDoc(doc(db, "bug_reports", id), { status: 'resolved' });
};

export const subscribeToForum = (callback: (posts: ForumPost[]) => void) => {
    const q = query(collection(db, "forum_posts"), orderBy("timestamp", "desc"), limit(50));
    return onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ForumPost)).reverse(); 
        callback(posts);
    });
};

export const sendForumMessage = async (user: User, content: string) => {
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

export const subscribeToGlobalWinners = (callback: (winners: any[]) => void) => {
    try {
        const q = query(collection(db, "games"), where("status", "==", "completed"), orderBy("updatedAt", "desc"), limit(10));
        return onSnapshot(q, (snapshot) => {
            const winners: any[] = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.winner && d.gameState?.scores) { 
                    const winnerId = d.winner;
                    const winnerProfile = d.host.id === winnerId ? d.host : d.guest;
                    if (winnerProfile) {
                        winners.push({
                            name: winnerProfile.name,
                            avatar: winnerProfile.avatar,
                            amount: (d.stake * 2 * 0.9).toLocaleString(), 
                            game: d.gameType
                        });
                    }
                } else if (d.winner) {
                     winners.push({
                        name: "Player", 
                        avatar: "https://i.pravatar.cc/150",
                        amount: (d.stake * 1.8).toLocaleString(),
                        game: d.gameType
                     });
                }
            });
            callback(winners);
        }, (error) => {
            console.warn("Live Winners Sync skipped", error);
            callback([]);
        });
    } catch(e) { return () => {}; }
};
