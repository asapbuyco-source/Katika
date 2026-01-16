
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithPhoneNumber, 
  RecaptchaVerifier,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User as FirebaseUser
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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

export const logout = async () => {
    await firebaseSignOut(auth);
};

// Database Helpers
export const syncUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        return userSnap.data() as User;
    } else {
        // Create new user profile
        const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || `Player-${firebaseUser.uid.slice(0, 4)}`,
            avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
            balance: 1000, // Starting bonus
            elo: 1000,
            rankTier: 'Bronze'
        };
        await setDoc(userRef, newUser);
        return newUser;
    }
};

export const setupRecaptcha = (elementId: string) => {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, elementId, {
            'size': 'invisible',
            'callback': () => {
                // reCAPTCHA solved, allow signInWithPhoneNumber.
            }
        });
    }
    return window.recaptchaVerifier;
};

// Types for window extension
declare global {
    interface Window {
        recaptchaVerifier: any;
        confirmationResult: any;
    }
}
