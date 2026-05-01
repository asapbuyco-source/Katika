// Auth module — all authentication functions.
// No Firestore SDK imports; uses auth instance from init.ts.
import {
    GoogleAuthProvider as GoogleProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
    updateEmail,
    deleteUser,
    signInAnonymously,
    User as FirebaseUser
} from "firebase/auth";
import { auth } from './init';
import { User } from '../../types';
import { syncUserProfile } from './users';

const googleProvider = new GoogleProvider();

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

export const loginAsGuest = async (): Promise<User> => {
    const cred = await signInAnonymously(auth);
    return syncUserProfile(cred.user);
};

export const getIdToken = () => auth.currentUser?.getIdToken();
