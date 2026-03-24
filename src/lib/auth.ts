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
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

function looksLikePhoneLabel(value?: string | null) {
  if (!value) {
    return false;
  }

  return /^[0-9]{10,}$/.test(value.trim());
}

async function getLoginIndexEntry(phoneNumber: string) {
  const { db } = getFirebaseServices();
  const snapshot = await getDoc(doc(db, "login_index", phoneNumber));
  return snapshot.exists()
    ? (snapshot.data() as { authEmail: string; userId: string; phoneNumber: string })
    : null;
}

async function ensurePhoneLoginAvailable(phoneNumber: string) {
  const existingEntry = await getLoginIndexEntry(phoneNumber);

  if (existingEntry) {
    throw new Error("That mobile number is already registered. Try logging in instead.");
  }
}

async function upsertPhoneLoginIndex({
  userId,
  phoneNumber,
  authEmail,
}: {
  userId: string;
  phoneNumber?: string | null;
  authEmail?: string | null;
}) {
  if (!phoneNumber || !authEmail) {
    return;
  }

  const { db } = getFirebaseServices();

  await setDoc(
    doc(db, "login_index", phoneNumber),
    {
      userId,
      phoneNumber,
      authEmail,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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

  await ensurePhoneLoginAvailable(normalizedPhoneNumber);

  const credential = await createUserWithEmailAndPassword(auth, authEmail, password);

  await updateProfile(credential.user, { displayName });
  await ensureUserProfile(credential.user, {
    displayName,
    phoneNumber: normalizedPhoneNumber,
    authEmail,
    grantSignupBonusIfNew: true,
  });

  return credential.user;
}

export async function signInWithPhone({
  phoneNumber,
  password,
}: {
  phoneNumber: string;
  password: string;
}) {
  const { auth, db } = getFirebaseServices();
  const normalizedPhoneNumber = validatePhoneNumber(phoneNumber);
  const loginIndexEntry = await getLoginIndexEntry(normalizedPhoneNumber);
  const authEmail = loginIndexEntry?.authEmail ?? buildPhoneAuthEmail(normalizedPhoneNumber);
  const credential = await signInWithEmailAndPassword(auth, authEmail, password);

  const userQuery = query(collection(db, "users"), where("phoneNumber", "==", normalizedPhoneNumber));
  const userSnapshot = await getDocs(userQuery);

  if (userSnapshot.size === 1) {
    await updateDoc(userSnapshot.docs[0].ref, {
      email: authEmail,
      loginMethod: "phone",
      updatedAt: serverTimestamp(),
    });
  }

  await ensureUserProfile(credential.user, {
    phoneNumber: normalizedPhoneNumber,
    authEmail,
    grantSignupBonusIfNew: false,
  });

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
    const normalizedPhoneNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : profile.phoneNumber;
    const resolvedAuthEmail = authEmail ?? profile.email ?? user.email ?? null;
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

      await upsertPhoneLoginIndex({
        userId: user.uid,
        phoneNumber: normalizedPhoneNumber,
        authEmail: resolvedAuthEmail,
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
  const now = serverTimestamp();
  const openingBalance = grantSignupBonus ? SIGNUP_BONUS : 0;
  const normalizedPhoneNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
  const resolvedAuthEmail = authEmail ?? user.email ?? "";

  await setDoc(doc(db, "users", user.uid), {
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

  await upsertPhoneLoginIndex({
    userId: user.uid,
    phoneNumber: normalizedPhoneNumber,
    authEmail: resolvedAuthEmail,
  });
}
