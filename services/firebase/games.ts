// Games module — matchmaking, game creation, game state subscriptions.
// Does NOT import Firebase SDK directly; uses db from init.ts.
import {
    doc, getDoc, setDoc, collection, query, where, orderBy, limit,
    getDocs, addDoc, updateDoc, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { db } from './init';
import { User, PlayerProfile, Challenge } from '../../types';

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
    return onSnapshot(doc(db, "games", gameId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() });
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

export const sendChallenge = async (sender: User, targetId: string, gameType: string, stake: number) => {
    const sAvailable = (sender.balance || 0) + (sender.promoBalance || 0);
    if (sAvailable < stake) {
        throw new Error("Insufficient total funds (Real + Promo) to send this challenge.");
    }
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

export const respondToChallenge = async (challengeId: string, status: 'accepted' | 'declined', gameId?: string) => {
    await updateDoc(doc(db, "challenges", challengeId), { status: status, gameId: gameId || null });
};

export const createChallengeGame = async (challenge: Challenge, receiver: User): Promise<string> => {
    if (challenge.stake > 0) {
        const receiverDoc = await getDoc(doc(db, "users", receiver.id));
        if (!receiverDoc.exists()) {
            throw new Error('Receiver not found.');
        }
        const rData = receiverDoc.data() as User;
        const rAvailable = (rData.balance || 0) + (rData.promoBalance || 0);
        if (rAvailable < challenge.stake) {
            throw new Error('Insufficient funds to accept this challenge.');
        }

        if (challenge.sender.id) {
            const senderDoc = await getDoc(doc(db, "users", challenge.sender.id));
            if (!senderDoc.exists()) {
                throw new Error('Sender not found.');
            }
            const sData = senderDoc.data() as User;
            const sAvailable = (sData.balance || 0) + (sData.promoBalance || 0);
            if (sAvailable < challenge.stake) {
                throw new Error('Challenge sender has insufficient funds.');
            }
        }
    }
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
