import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { getFirebaseServices } from "./firebase";
import type { UserProfile, UserProfileRecord } from "./auth-types";

const SIGNUP_BONUS = 50000;
const PHONE_AUTH_DOMAIN = "phone.friendspremierleague.app";

function normalizePhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/[^0-9]/g, "");
}

function validatePhoneNumber(phoneNumber: string) {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (normalized.length < 10) {
    throw new Error("Enter a valid mobile number.");
  }

  return normalized;
}

function buildPhoneAuthEmail(phoneNumber: string) {
  return `${phoneNumber}@${PHONE_AUTH_DOMAIN}`;
}

function getPhoneNumberFromAuthEmail(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const suffix = `@${PHONE_AUTH_DOMAIN}`;

  if (!normalized.endsWith(suffix)) {
    return null;
  }

  const phoneNumber = normalized.slice(0, -suffix.length);
  return /^[0-9]{10,}$/.test(phoneNumber) ? phoneNumber : null;
}

function looksLikePhoneLabel(value?: string | null) {
  if (!value) {
    return false;
  }

  return /^[0-9]{10,}$/.test(value.trim());
}

export async function signUpWithPhone({
  displayName,
  phoneNumber,
  password,
}: {
  displayName: string;
  phoneNumber: string;
  password: string;
}) {
  const { auth } = getFirebaseServices();
  const normalizedPhoneNumber = validatePhoneNumber(phoneNumber);
  const authEmail = buildPhoneAuthEmail(normalizedPhoneNumber);

  const credential = await createUserWithEmailAndPassword(auth, authEmail, password);

  await updateProfile(credential.user, { displayName });

  return credential.user;
}

export async function signInWithPhone({
  phoneNumber,
  password,
}: {
  phoneNumber: string;
  password: string;
}) {
  const { auth } = getFirebaseServices();
  const normalizedPhoneNumber = validatePhoneNumber(phoneNumber);
  const authEmail = buildPhoneAuthEmail(normalizedPhoneNumber);
  const credential = await signInWithEmailAndPassword(auth, authEmail, password);
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
    authEmail,
    grantSignupBonusIfNew = true,
  }: {
    displayName?: string;
    phoneNumber?: string;
    authEmail?: string;
    grantSignupBonusIfNew?: boolean;
  }
) {
  const { db } = getFirebaseServices();
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    const profile = snapshot.data() as UserProfile;
    const resolvedAuthEmail = authEmail ?? profile.email ?? user.email ?? null;
    const normalizedPhoneNumber =
      (phoneNumber ? normalizePhoneNumber(phoneNumber) : profile.phoneNumber) ??
      getPhoneNumberFromAuthEmail(resolvedAuthEmail);
    const resolvedDisplayName =
      displayName ??
      (!looksLikePhoneLabel(user.displayName) ? user.displayName : null) ??
      profile.displayName;

    if (normalizedPhoneNumber && resolvedAuthEmail) {
      await updateDoc(userRef, {
        displayName: looksLikePhoneLabel(profile.displayName) ? resolvedDisplayName : profile.displayName,
        phoneNumber: normalizedPhoneNumber,
        email: resolvedAuthEmail,
        loginMethod: "phone",
        updatedAt: serverTimestamp(),
      });
    }

    const updatedSnapshot = await getDoc(userRef);
    return updatedSnapshot.exists() ? (updatedSnapshot.data() as UserProfile) : profile;
  }

  await createUserProfile(user, {
    displayName: displayName ?? user.displayName ?? user.email?.split("@")[0] ?? "Player",
    phoneNumber,
    authEmail,
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
    authEmail,
    grantSignupBonus,
  }: {
    displayName: string;
    phoneNumber?: string;
    authEmail?: string;
    grantSignupBonus: boolean;
  }
) {
  const { db } = getFirebaseServices();
  const resolvedAuthEmail = authEmail ?? user.email ?? "";
  const normalizedPhoneNumber =
    (phoneNumber ? normalizePhoneNumber(phoneNumber) : null) ??
    getPhoneNumberFromAuthEmail(resolvedAuthEmail);
  const userRef = doc(db, "users", user.uid);
  const signupBonusRef = doc(collection(db, "transactions"), `signup_bonus_${user.uid}`);

  await runTransaction(db, async (transaction) => {
    const existingUser = await transaction.get(userRef);

    if (existingUser.exists()) {
      return;
    }

    const now = serverTimestamp();
    const openingBalance = grantSignupBonus ? SIGNUP_BONUS : 0;

    transaction.set(userRef, {
      displayName,
      email: resolvedAuthEmail,
      phoneNumber: normalizedPhoneNumber,
      loginMethod: normalizedPhoneNumber ? "phone" : "email",
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
      transaction.set(signupBonusRef, {
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
  });
}
