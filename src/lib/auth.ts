import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";

const SIGNUP_BONUS = 50000;

export async function signUpWithEmail({
  displayName,
  email,
  password,
  phoneNumber,
}: {
  displayName: string;
  email: string;
  password: string;
  phoneNumber?: string;
}) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, { displayName });
  await createUserProfile(credential.user, { displayName, phoneNumber });

  return credential.user;
}

export async function signInWithEmail({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  await signOut(auth);
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

async function createUserProfile(
  user: User,
  {
    displayName,
    phoneNumber,
  }: {
    displayName: string;
    phoneNumber?: string;
  }
) {
  const now = serverTimestamp();

  await setDoc(doc(db, "users", user.uid), {
    displayName,
    email: user.email,
    phoneNumber: phoneNumber || null,
    role: "user",
    balance: SIGNUP_BONUS,
    points: 0,
    wins: 0,
    losses: 0,
    totalPredictions: 0,
    createdAt: now,
    updatedAt: now,
  });

  await addDoc(collection(db, "transactions"), {
    userId: user.uid,
    type: "signup_bonus",
    amount: SIGNUP_BONUS,
    balanceBefore: 0,
    balanceAfter: SIGNUP_BONUS,
    referenceType: "system",
    referenceId: user.uid,
    note: "Signup bonus credited on account creation",
    createdAt: now,
  });
}
