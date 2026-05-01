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

export const addUserTransaction = async (userId: string, transaction: Omit<Transaction, 'id'>) => {
    const userRef = doc(db, "users", userId);
    await runTransaction(db, async (tx) => {
        const sfDoc = await tx.get(userRef);
        if (!sfDoc.exists()) throw new Error(`User ${userId} not found`);
        const newBalance = (sfDoc.data().balance || 0) + transaction.amount;
        // Prevent balance from going below zero atomically
        if (newBalance < 0) throw new Error('INSUFFICIENT_FUNDS');
        tx.update(userRef, { balance: newBalance });
        const txRef = doc(collection(db, "users", userId, "transactions"));
        tx.set(txRef, {
            ...transaction,
            timestamp: serverTimestamp(),
            date: new Date().toLocaleString()
        });
    });
};

/**
 * Idempotent deposit crediting.
 * Uses a `processed_payments/{transId}` sentinel document to guarantee
 * a given Fapshi transId is only credited ONCE.
 */
export const creditDepositIdempotent = async (
    userId: string,
    transId: string,
    amount: number
): Promise<boolean> => {
    const paymentRef = doc(db, 'processed_payments', transId);
    const userRef = doc(db, 'users', userId);
    try {
        await runTransaction(db, async (tx) => {
            const paymentSnap = await tx.get(paymentRef);
            if (paymentSnap.exists()) throw new Error('ALREADY_PROCESSED');

            const userSnap = await tx.get(userRef);
            if (!userSnap.exists()) throw new Error(`User ${userId} not found`);

            const newBalance = (userSnap.data().balance || 0) + amount;
            tx.update(userRef, { balance: newBalance });

            tx.set(paymentRef, {
                userId,
                amount,
                processedAt: serverTimestamp()
            });

            const txRef = doc(collection(db, 'users', userId, 'transactions'));
            tx.set(txRef, {
                type: 'deposit',
                amount,
                status: 'completed',
                date: new Date().toISOString(),
                timestamp: serverTimestamp(),
                transId
            });
        });
        return true;
    } catch (e: any) {
        if (e?.message === 'ALREADY_PROCESSED') return false;
        throw e;
    }
};
