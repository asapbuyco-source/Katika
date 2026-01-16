
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User as FirebaseUser
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { User } from "../types";

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

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google Sign In Error:", error);
    throw error;
  }
};

export const registerWithEmail = async (email: string, pass: string) => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error) {
        console.error("Registration Error:", error);
        throw error;
    }
};

export const loginWithEmail = async (email: string, pass: string) => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
};

export const logout = async () => {
    await firebaseSignOut(auth);
};

// Database Helpers
export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    // Hardcoded Admin Logic
    const isAdmin = firebaseUser.email === 'abrackly@gmail.com';

    if (userSnap.exists()) {
        const data = userSnap.data() as User;
        // Ensure admin status is updated if it matches specific email
        if (isAdmin && !data.isAdmin) {
            await setDoc(userRef, { ...data, isAdmin: true, rankTier: 'Diamond' }, { merge: true });
            return { ...data, isAdmin: true, rankTier: 'Diamond' };
        }
        return data;
    } else {
        // Create new user profile
        const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || `Player-${firebaseUser.uid.slice(0, 4)}`,
            avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
            balance: isAdmin ? 1000000 : 1000, // Admin gets 1M start
            elo: isAdmin ? 2500 : 1000,
            rankTier: isAdmin ? 'Diamond' : 'Bronze',
            isAdmin: isAdmin
        };
        await setDoc(userRef, newUser);
        return newUser;
    }
};

export const loginAsGuest = async (): Promise<User> => {
    // Return a mock user for development when Firebase is blocked
    return {
        id: 'guest-' + Date.now(),
        name: 'Guest Player',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`,
        balance: 5000,
        elo: 1000,
        rankTier: 'Bronze'
    };
};
