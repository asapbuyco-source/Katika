// Games module — matchmaking, game creation, game state subscriptions.
// Does NOT import Firebase SDK directly; uses db from init.ts.
import {
    doc, getDoc, setDoc, collection, query, where, orderBy, limit,
    getDocs, addDoc, updateDoc, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { db } from './init';
import { User, Challenge } from '../../types';

// NOTE: findOrCreateMatch was removed in Phase 1.3.
// Matchmaking now goes exclusively through the Socket.IO server to ensure
// server-side escrow deduction. Do NOT re-add client-side match creation here.
// (Audit: the old export was a live trap — any accidental import would bypass escrow.)

export const createBotMatch = async (user: User, gameType: string, difficulty?: string): Promise<string> => {
    // Bot games must be created server-side (Admin SDK) because the client SDK
    // is blocked from writing to bot_games by Firestore security rules.
    // See: firestore.rules — match /bot_games/{gameId} { allow create: if false; }
    const { auth } = await import('./init');
    const currentUser = auth.currentUser;
    const token = currentUser ? await currentUser.getIdToken() : null;
    if (!token) throw new Error('Not authenticated.');

    const socketUrl = import.meta.env.VITE_SOCKET_URL?.replace(/\/$/, '') || '';
    const response = await fetch(`${socketUrl}/api/games/bot`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ gameType, difficulty: difficulty || 'medium' })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create bot match.');
    }
    const data = await response.json();
    return data.gameId;
};


export const subscribeToGame = (gameId: string, callback: (data: any) => void) => {
    return onSnapshot(doc(db, "games", gameId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() });
        }
    }, (error) => {
        console.error('[subscribeToGame] Firestore snapshot failed for game', gameId, error);
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

// NOTE: setGameResult was removed — clients must never write game results to Firestore
// directly. Game outcomes are written exclusively by the server Admin SDK.
// (Audit: client-side game result writing violates Firestore security rules.)

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
    }, (error) => {
        console.error('[subscribeToGameConfigs] Firestore snapshot failed:', error);
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
    }, (error) => {
        console.error('[subscribeToIncomingChallenges] Firestore snapshot failed:', error);
    });
};

export const subscribeToChallengeStatus = (challengeId: string, callback: (data: Challenge) => void) => {
    return onSnapshot(doc(db, "challenges", challengeId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as Challenge);
        }
    }, (error) => {
        console.error('[subscribeToChallengeStatus] Firestore snapshot failed for challenge', challengeId, error);
    });
};

export const sendChallenge = async (sender: User, targetId: string, gameType: string, stake: number) => {
    // AUDIT FIX: Include Authorization header so server verifyAuth middleware accepts this request.
    // Without it, all challenge sends were silently rejected with 401.
    const { auth } = await import('./init');
    const currentUser = auth.currentUser;
    const token = currentUser ? await currentUser.getIdToken() : null;
    if (!token) throw new Error('Not authenticated.');

    const response = await fetch('/api/challenges/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetId, gameType, stake })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to send challenge.');
    }
    const data = await response.json();
    return data.challengeId;
};

export const respondToChallenge = async (challengeId: string, status: 'accepted' | 'declined', gameId?: string) => {
    const response = await fetch('/api/challenges/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, action: status, gameId })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to respond to challenge.');
    }
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
