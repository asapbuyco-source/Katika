// Finance module — transactions, deposits, idempotency.
// Does NOT import Firebase SDK directly; uses db from init.ts.
import {
    doc, getDoc, setDoc, collection, query, where, orderBy, limit,
    getDocs, addDoc, updateDoc, onSnapshot, serverTimestamp, runTransaction
} from "firebase/firestore";
import { db } from './init';
import { Transaction } from '../../types';

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
