import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
    initializeFirestore,
    getFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from "firebase/firestore";

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

// NET-1: Persistent offline cache via the modern FirestoreSettings.cache API.
// persistentMultipleTabManager allows multiple browser tabs to share the cache.
// Falls back to the default (memory-only) instance if already initialized (e.g. Vite HMR)
// or in unsupported environments (incognito mode).
export const db = (() => {
    try {
        return initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager(),
            }),
        });
    } catch {
        // initializeFirestore throws if the app was already initialized — use the
        // existing instance instead. This happens during Vite HMR hot reloads.
        return getFirestore(app);
    }
})();

export const getApiUrl = () => {
    const rawUrl = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '');
    return rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
};