import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC8rw1jLrmyibqvw1ykdIjwPs23yBMVs9k",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "fairlens-ac1da.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "fairlens-ac1da",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "fairlens-ac1da.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "436852557852",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:436852557852:web:641a2acc49d3ae9be977d9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const db = getFirestore(app);
