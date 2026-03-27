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
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { getFirebaseFunctions, getFirebaseServices } from "./firebase";
import { normalizeAccessControlSettings } from "./access-control";
import type { UserProfile, UserProfileRecord } from "./auth-types";
import { REFERRAL_REWARD_AMOUNT } from "./referrals";

const SIGNUP_BONUS = 50000;
const PHONE_AUTH_DOMAIN = "phone.friendspremierleague.app";

function normalizeDisplayName(displayName: string) {
  return displayName.trim();
}

function validateDisplayName(displayName: string) {
  const normalized = normalizeDisplayName(displayName);

  if (!normalized) {
    throw new Error("Display name is required.");
  }

  return normalized;
}

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
  const normalizedDisplayName = validateDisplayName(displayName);
  const normalizedPhoneNumber = validatePhoneNumber(phoneNumber);
  const authEmail = buildPhoneAuthEmail(normalizedPhoneNumber);

  const credential = await createUserWithEmailAndPassword(auth, authEmail, password);

  await updateProfile(credential.user, { displayName: normalizedDisplayName });
  await ensureUserProfile(credential.user, {
    displayName: normalizedDisplayName,
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

export function subscribeToAllUsers(
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
        .sort((left, right) => left.displayName.localeCompare(right.displayName));

      callback(users);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function approveUserAccess(uid: string) {
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, "users", uid), {
    accessStatus: "active",
    updatedAt: serverTimestamp(),
  });
}

export async function rejectPendingUser(uid: string) {
  const functions = getFirebaseFunctions();
  const callable = httpsCallable(functions, "rejectPendingUser");
  await callable({ targetUserId: uid });
}

export async function deleteUserRecords(uid: string) {
  const { db } = getFirebaseServices();
  const userRef = doc(db, "users", uid);
  const predictionsQuery = query(collection(db, "predictions"), where("userId", "==", uid));
  const transactionsQuery = query(collection(db, "transactions"), where("userId", "==", uid));
  const referralsByReferrerQuery = query(
    collection(db, "referrals"),
    where("referrerUserId", "==", uid)
  );
  const referralsByReferredQuery = query(
    collection(db, "referrals"),
    where("referredUserId", "==", uid)
  );

  const [predictionSnapshots, transactionSnapshots, referrerReferralSnapshots, referredReferralSnapshots] =
    await Promise.all([
      getDocs(predictionsQuery),
      getDocs(transactionsQuery),
      getDocs(referralsByReferrerQuery),
      getDocs(referralsByReferredQuery),
    ]);

  const refsToDelete = new Map<string, ReturnType<typeof doc>>();
  refsToDelete.set(userRef.path, userRef);

  for (const snapshot of predictionSnapshots.docs) {
    refsToDelete.set(snapshot.ref.path, snapshot.ref);
  }

  for (const snapshot of transactionSnapshots.docs) {
    refsToDelete.set(snapshot.ref.path, snapshot.ref);
  }

  for (const snapshot of referrerReferralSnapshots.docs) {
    refsToDelete.set(snapshot.ref.path, snapshot.ref);
  }

  for (const snapshot of referredReferralSnapshots.docs) {
    refsToDelete.set(snapshot.ref.path, snapshot.ref);
  }

  const refs = [...refsToDelete.values()];

  for (let index = 0; index < refs.length; index += 400) {
    const batch = writeBatch(db);

    for (const ref of refs.slice(index, index + 400)) {
      batch.delete(ref);
    }

    await batch.commit();
  }
}

export async function ensureUserProfile(
  user: User,
  {
    displayName,
    phoneNumber,
    authEmail,
    grantSignupBonusIfNew = true,
    profileKnownMissing = false,
  }: {
    displayName?: string;
    phoneNumber?: string;
    authEmail?: string;
    grantSignupBonusIfNew?: boolean;
    profileKnownMissing?: boolean;
  }
) {
  const { db } = getFirebaseServices();
  const userRef = doc(db, "users", user.uid);

  if (profileKnownMissing) {
    const resolvedDisplayName = validateDisplayName(
      displayName ?? user.displayName ?? user.email?.split("@")[0] ?? ""
    );

    await createUserProfileFromMissingSnapshot(user, {
      displayName: resolvedDisplayName,
      phoneNumber,
      authEmail,
      grantSignupBonus: grantSignupBonusIfNew,
    });

    return null;
  }

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

    const nextDisplayName = looksLikePhoneLabel(profile.displayName)
      ? resolvedDisplayName
      : profile.displayName;

    const profileUpdates: Partial<UserProfile> & { updatedAt?: ReturnType<typeof serverTimestamp> } = {};

    if (normalizedPhoneNumber && profile.phoneNumber !== normalizedPhoneNumber) {
      profileUpdates.phoneNumber = normalizedPhoneNumber;
    }

    if (resolvedAuthEmail && profile.email !== resolvedAuthEmail) {
      profileUpdates.email = resolvedAuthEmail;
    }

    if (nextDisplayName !== profile.displayName) {
      profileUpdates.displayName = nextDisplayName;
    }

    if (normalizedPhoneNumber && profile.loginMethod !== "phone") {
      profileUpdates.loginMethod = "phone";
    }

    if (Object.keys(profileUpdates).length) {
      profileUpdates.updatedAt = serverTimestamp();
      await updateDoc(userRef, profileUpdates);

      return {
        ...profile,
        ...profileUpdates,
      } as UserProfile;
    }

    return profile;
  }

  const resolvedDisplayName = validateDisplayName(
    displayName ?? user.displayName ?? user.email?.split("@")[0] ?? ""
  );

  await createUserProfile(user, {
    displayName: resolvedDisplayName,
    phoneNumber,
    authEmail,
    grantSignupBonus: grantSignupBonusIfNew,
  });

  return null;
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
  const normalizedDisplayName = validateDisplayName(displayName);
  const resolvedAuthEmail = authEmail ?? user.email ?? "";
  const normalizedPhoneNumber =
    (phoneNumber ? normalizePhoneNumber(phoneNumber) : null) ??
    getPhoneNumberFromAuthEmail(resolvedAuthEmail);
  const userRef = doc(db, "users", user.uid);
  const signupBonusRef = doc(collection(db, "transactions"), `signup_bonus_${user.uid}`);
  const referralRef = normalizedPhoneNumber ? doc(db, "referrals", normalizedPhoneNumber) : null;
  const accessControlRef = doc(db, "app_settings", "access_control");

  await runTransaction(db, async (transaction) => {
    const existingUser = await transaction.get(userRef);

    if (existingUser.exists()) {
      return;
    }

    const referralSnapshot = referralRef ? await transaction.get(referralRef) : null;
    const accessControlSnapshot = await transaction.get(accessControlRef);
    const accessControlSettings = normalizeAccessControlSettings(
      accessControlSnapshot.exists()
        ? (accessControlSnapshot.data() as { requireReferralForInstantAccess?: boolean })
        : null
    );
    const referralData =
      referralSnapshot?.exists() &&
      (referralSnapshot.data() as { status?: string; referrerUserId?: string; referrerDisplayName?: string })
        .status === "pending"
        ? (referralSnapshot.data() as {
            status: string;
            referrerUserId: string;
            referrerDisplayName: string;
          })
        : null;
    const accessStatus =
      referralData || !accessControlSettings.requireReferralForInstantAccess
        ? "active"
        : "pending_approval";

    const now = serverTimestamp();
    const openingBalance = grantSignupBonus ? SIGNUP_BONUS : 0;

    transaction.set(userRef, {
      displayName: normalizedDisplayName,
      email: resolvedAuthEmail,
      phoneNumber: normalizedPhoneNumber,
      loginMethod: normalizedPhoneNumber ? "phone" : "email",
      referralId: referralData && referralRef ? referralRef.id : null,
      referredByUserId: referralData?.referrerUserId ?? null,
      referredByDisplayName: referralData?.referrerDisplayName ?? null,
      hasSeenReferralMessage: referralData ? false : true,
      accessStatus,
      role: "user",
      balance: openingBalance,
      points: 0,
      wins: 0,
      losses: 0,
      totalPredictions: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (referralData && referralRef) {
      transaction.update(referralRef, {
        referredUserId: user.uid,
        status: "signed_up",
        rewardAmount: REFERRAL_REWARD_AMOUNT,
        updatedAt: now,
      });
    }

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

async function createUserProfileFromMissingSnapshot(
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
  const normalizedDisplayName = validateDisplayName(displayName);
  const resolvedAuthEmail = authEmail ?? user.email ?? "";
  const normalizedPhoneNumber =
    (phoneNumber ? normalizePhoneNumber(phoneNumber) : null) ??
    getPhoneNumberFromAuthEmail(resolvedAuthEmail);
  const userRef = doc(db, "users", user.uid);
  const signupBonusRef = doc(collection(db, "transactions"), `signup_bonus_${user.uid}`);
  const referralRef = normalizedPhoneNumber ? doc(db, "referrals", normalizedPhoneNumber) : null;
  const accessControlRef = doc(db, "app_settings", "access_control");

  const [referralSnapshot, accessControlSnapshot] = await Promise.all([
    referralRef ? getDoc(referralRef) : Promise.resolve(null),
    getDoc(accessControlRef),
  ]);

  const accessControlSettings = normalizeAccessControlSettings(
    accessControlSnapshot.exists()
      ? (accessControlSnapshot.data() as { requireReferralForInstantAccess?: boolean })
      : null
  );
  const referralData =
    referralSnapshot?.exists() &&
    (referralSnapshot.data() as {
      status?: string;
      referrerUserId?: string;
      referrerDisplayName?: string;
    }).status === "pending"
      ? (referralSnapshot.data() as {
          status: string;
          referrerUserId: string;
          referrerDisplayName: string;
        })
      : null;
  const accessStatus =
    referralData || !accessControlSettings.requireReferralForInstantAccess
      ? "active"
      : "pending_approval";
  const now = serverTimestamp();
  const openingBalance = grantSignupBonus ? SIGNUP_BONUS : 0;
  const batch = writeBatch(db);

  batch.set(userRef, {
    displayName: normalizedDisplayName,
    email: resolvedAuthEmail,
    phoneNumber: normalizedPhoneNumber,
    loginMethod: normalizedPhoneNumber ? "phone" : "email",
    referralId: referralData && referralRef ? referralRef.id : null,
    referredByUserId: referralData?.referrerUserId ?? null,
    referredByDisplayName: referralData?.referrerDisplayName ?? null,
    hasSeenReferralMessage: referralData ? false : true,
    accessStatus,
    role: "user",
    balance: openingBalance,
    points: 0,
    wins: 0,
    losses: 0,
    totalPredictions: 0,
    createdAt: now,
    updatedAt: now,
  });

  if (referralData && referralRef) {
    batch.update(referralRef, {
      referredUserId: user.uid,
      status: "signed_up",
      rewardAmount: REFERRAL_REWARD_AMOUNT,
      updatedAt: now,
    });
  }

  if (grantSignupBonus) {
    batch.set(signupBonusRef, {
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

  await batch.commit();
}
