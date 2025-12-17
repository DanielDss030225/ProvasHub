import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyASa8uMK4O1U_bQC5Ykl-OflJttFSJFNnM",
    authDomain: "orange-proof.firebaseapp.com",
    projectId: "orange-proof",
    storageBucket: "orange-proof.firebasestorage.app",
    messagingSenderId: "619099154724",
    appId: "1:619099154724:web:e61ff7ce22e29be929ebb1",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
