// Firebase imports and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCvoJdOzp9v8aWdnWhGpoBrB_ZOBh-L648",
  authDomain: "women-saftey-a3bac.firebaseapp.com",
  projectId: "women-saftey-a3bac",
  storageBucket: "women-saftey-a3bac.firebasestorage.app",
  messagingSenderId: "40368489597",
  appId: "1:40368489597:web:cba8693d99900ea5461d14"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/**
 * Email/password signup flow.
 * - Creates user in Auth.
 * - Creates Firestore document with empty profile fields.
 * - Always redirects to completeProfile.html for profile completion.
 * @param {string} email
 * @param {string} password
 */
export async function signupWithEmailPassword(email, password) {
  // Create user in Firebase Authentication
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const user = result.user;
  // Create Firestore user document with empty profile fields
  const userDoc = doc(db, "users", user.uid);
  await setDoc(userDoc, {
    email: user.email,
    name: "",
    phone: "",
    contacts: [],
    tokens: []
  });
  // Always redirect to completeProfile.html (profile must be completed before accessing index.html)
  window.location.replace("completeProfile.html");
  return user;
}

/**
 * Email/password login flow.
 * - Signs in the user.
 * - Always redirects to completeProfile.html before accessing index.html.
 * @param {string} email
 * @param {string} password
 */
export async function loginWithEmailPassword(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const user = result.user;
  // Always redirect to completeProfile.html before accessing index.html
  window.location.replace("completeProfile.html");
  return user;
}

/**
 * Google login/signup flow.
 * - New Google users: create Firestore doc, redirect to completeProfile.html.
 * - Existing Google users: always redirect to completeProfile.html (profile completion required).
 */
export async function loginWithGoogle() {
  try {
    // Sign in with Google popup
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    // Reference to the user's Firestore document
    const userDoc = doc(db, "users", user.uid);
    const docSnap = await getDoc(userDoc);
    if (!docSnap.exists()) {
      // New Google user: create Firestore doc with empty profile fields
      await setDoc(userDoc, {
        email: user.email,
        name: "",
        phone: "",
        contacts: [],
        tokens: []
      });
    }
    // Always redirect to completeProfile.html for profile completion before accessing index.html
    window.location.replace("completeProfile.html");
    return user;
  } catch (error) {
    // Handle Google login errors
    console.error('Google login failed:', error);
    throw error;
  } 
}