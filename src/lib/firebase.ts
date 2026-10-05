import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

export const firebaseConfig = {
  apiKey: "AIzaSyAxWwwls23kFhcLL00jW3pgWGyGOwkHfYM",
  authDomain: "talentumhq-33753.firebaseapp.com",
  projectId: "talentumhq-33753",
  storageBucket: "talentumhq-33753.firebasestorage.app",
  messagingSenderId: "427134211196",
  appId: "1:427134211196:web:c2be7e0695652cfac0a5f9",
  measurementId: "G-5MSX1KCYPB"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Analytics conditionally to avoid SSR issues
let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { app, auth, db, analytics };
