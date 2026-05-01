// Social module — forum posts, bug reports.
// Does NOT import Firebase SDK directly; uses db from init.ts.
import {
    doc, getDoc, setDoc, collection, query, where, orderBy, limit,
    getDocs, addDoc, updateDoc, onSnapshot, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { db } from './init';
import { ForumPost, BugReport, User } from '../../types';

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

export const subscribeToGlobalWinners = (callback: (winners: any[]) => void) => {
    try {
        const q = query(
            collection(db, "games"),
            where("status", "==", "completed"),
            orderBy("updatedAt", "desc"),
            limit(10)
        );
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
    } catch (e) { return () => {}; }
};
