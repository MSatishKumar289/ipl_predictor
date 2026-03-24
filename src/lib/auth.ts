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
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { getFirebaseServices } from "./firebase";
import type { UserProfile, UserProfileRecord } from "./auth-types";

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
  const { auth } = getFirebaseServices();
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, { displayName });
  await ensureUserProfile(credential.user, {
    displayName,
    phoneNumber,
    grantSignupBonusIfNew: true,
  });

  return credential.user;
}

export async function signInWithEmail({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const { auth } = getFirebaseServices();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}

export async function getUserProfile(uid: string) {
  const { db } = getFirebaseServices();
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
}

export function subscribeToUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void,
  onError?: (error: Error) => void
) {
  const { db } = getFirebaseServices();
  return onSnapshot(
    doc(db, "users", uid),
    (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToLeaderboardUsers(
  callback: (users: UserProfileRecord[]) => void,
  onError?: (error: Error) => void
) {
  const { db } = getFirebaseServices();
  return onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      const users = snapshot.docs
        .map((userDoc) => ({
          uid: userDoc.id,
          ...(userDoc.data() as UserProfile),
        }))
        .filter((user) => user.totalPredictions > 0)
        .sort((left, right) => {
          if (right.points !== left.points) {
            return right.points - left.points;
          }

          if (right.wins !== left.wins) {
            return right.wins - left.wins;
          }

          if (left.losses !== right.losses) {
            return left.losses - right.losses;
          }

          return right.totalPredictions - left.totalPredictions;
        });

      callback(users);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function ensureUserProfile(
  user: User,
  {
    displayName,
    phoneNumber,
    grantSignupBonusIfNew = true,
  }: {
    displayName?: string;
    phoneNumber?: string;
    grantSignupBonusIfNew?: boolean;
  }
) {
  const { db } = getFirebaseServices();
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    return snapshot.data() as UserProfile;
  }

  await createUserProfile(user, {
    displayName: displayName ?? user.displayName ?? user.email?.split("@")[0] ?? "Player",
    phoneNumber,
    grantSignupBonus: grantSignupBonusIfNew,
  });

  const createdSnapshot = await getDoc(userRef);
  return createdSnapshot.exists() ? (createdSnapshot.data() as UserProfile) : null;
}

async function createUserProfile(
  user: User,
  {
    displayName,
    phoneNumber,
    grantSignupBonus,
  }: {
    displayName: string;
    phoneNumber?: string;
    grantSignupBonus: boolean;
  }
) {
  const { db } = getFirebaseServices();
  const now = serverTimestamp();
  const openingBalance = grantSignupBonus ? SIGNUP_BONUS : 0;

  await setDoc(doc(db, "users", user.uid), {
    displayName,
    email: user.email,
    phoneNumber: phoneNumber || null,
    role: "user",
    balance: openingBalance,
    points: 0,
    wins: 0,
    losses: 0,
    totalPredictions: 0,
    createdAt: now,
    updatedAt: now,
  });

  if (grantSignupBonus) {
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
}
