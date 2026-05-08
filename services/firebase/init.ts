import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// NET-1: Enable Firestore offline persistence with graceful fallback for incognito
if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('[Firestore] Offline persistence failed: multiple tabs open. Caching disabled.');
        } else if (err.code === 'unimplemented') {
            console.warn('[Firestore] Offline persistence failed: browser not supported. Caching disabled.');
        }
    });
}

export const getApiUrl = () => {
    const rawUrl = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '');
    return rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
};