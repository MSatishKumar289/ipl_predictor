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

import { getFirebaseServices } from "./firebase";
import type { UserProfile, UserProfileRecord } from "./auth-types";
import { REFERRAL_REWARD_AMOUNT } from "./referrals";

const SIGNUP_BONUS = 50000;
const PHONE_AUTH_DOMAIN = "phone.fpl.app";

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

function getTimestampValue(value: unknown) {
  if (!value) {
    return 0;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (
    typeof value === "object" &&
    value &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value === "object" &&
    value &&
    "seconds" in value &&
    typeof value.seconds === "number"
  ) {
    return value.seconds * 1000;
  }

  return 0;
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
  callback: (payload: {
    listedUsers: UserProfileRecord[];
    unlistedUsers: UserProfileRecord[];
    totalCompletedMatches: number;
  }) => void,
  onError?: (error: Error) => void
) {
  const { db } = getFirebaseServices();
  const LEADERBOARD_PARTICIPATION_THRESHOLD = 0.35;
  let latestUsers: UserProfileRecord[] = [];
  let latestSpinResults: Array<{
    userId?: string;
    rewardKind?: string;
    rewardValue?: number | null;
    createdAt?: unknown;
  }> = [];
  let latestPredictions: Array<{
    userId?: string;
    status?: string;
    matchId?: string;
    amount?: number;
    payout?: number;
    settledAt?: unknown;
  }> = [];
  let latestMatches: Array<{
    id: string;
    status?: string;
  }> = [];

  function emitLeaderboard() {
    callback(
      buildLeaderboardPayload({
        users: latestUsers,
        spinResults: latestSpinResults,
        predictions: latestPredictions,
        matches: latestMatches,
        threshold: LEADERBOARD_PARTICIPATION_THRESHOLD,
      })
    );
  }

  const unsubscribeUsers = onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      latestUsers = snapshot.docs.map((userDoc) => ({
        uid: userDoc.id,
        ...(userDoc.data() as UserProfile),
      }));
      emitLeaderboard();
    },
    (error) => {
      onError?.(error);
    }
  );

  const unsubscribeSpinResults = onSnapshot(
    collection(db, "weekly_spin_results"),
    (snapshot) => {
      latestSpinResults = snapshot.docs.map((entry) => entry.data() as {
        userId?: string;
        rewardKind?: string;
        rewardValue?: number | null;
        createdAt?: unknown;
      });
      emitLeaderboard();
    },
    (error) => {
      onError?.(error);
    }
  );

  const unsubscribePredictions = onSnapshot(
    collection(db, "predictions"),
    (snapshot) => {
      latestPredictions = snapshot.docs.map((entry) => entry.data() as {
        userId?: string;
        status?: string;
        matchId?: string;
        amount?: number;
        payout?: number;
        settledAt?: unknown;
      });
      emitLeaderboard();
    },
    (error) => {
      onError?.(error);
    }
  );

  const unsubscribeMatches = onSnapshot(
    collection(db, "matches"),
    (snapshot) => {
      latestMatches = snapshot.docs.map((entry) => ({
        id: entry.id,
        status: (entry.data() as { status?: string }).status,
      }));
      emitLeaderboard();
    },
    (error) => {
      onError?.(error);
    }
  );

  return () => {
    unsubscribeUsers();
    unsubscribeSpinResults();
    unsubscribePredictions();
    unsubscribeMatches();
  };
}

function buildLeaderboardPayload({
  users: latestUsers,
  spinResults: latestSpinResults,
  predictions: latestPredictions,
  matches: latestMatches,
  threshold,
}: {
  users: UserProfileRecord[];
  spinResults: Array<{
    userId?: string;
    rewardKind?: string;
    rewardValue?: number | null;
    createdAt?: unknown;
  }>;
  predictions: Array<{
    userId?: string;
    status?: string;
    matchId?: string;
    amount?: number;
    payout?: number;
    settledAt?: unknown;
  }>;
  matches: Array<{
    id: string;
    status?: string;
  }>;
  threshold: number;
}) {
    const completedMatchIdSet = new Set(
      latestMatches
        .filter((entry) =>
          entry.status === "completed" ||
          entry.status === "settled" ||
          entry.status === "no_result"
        )
        .map((entry) => entry.id)
    );
    const totalCompletedMatches = completedMatchIdSet.size;
    const metricsByUser = new Map<string, { wheelPointsEarned: number; wheelCoinsEarned: number }>();
    const participationByUser = new Map<
      string,
      { playedCompletedMatches: number; participationRate: number }
    >();

    for (const user of latestUsers) {
      const events: Array<
        | {
            type: "spin";
            at: number;
            rewardKind: string;
            rewardValue: number | null;
          }
        | {
            type: "prediction";
            at: number;
            status: string;
            amount: number;
            payout: number;
          }
      > = [];

      for (const entry of latestSpinResults) {
        if (entry.userId !== user.uid) {
          continue;
        }

        events.push({
          type: "spin",
          at: getTimestampValue(entry.createdAt),
          rewardKind: entry.rewardKind ?? "",
          rewardValue: entry.rewardValue ?? null,
        });
      }

      for (const entry of latestPredictions) {
        if (entry.userId !== user.uid) {
          continue;
        }

        const amount = typeof entry.amount === "number" ? entry.amount : 0;
        const payout = typeof entry.payout === "number" ? entry.payout : 0;
        events.push({
          type: "prediction",
          at: getTimestampValue(entry.settledAt),
          status: entry.status ?? "",
          amount,
          payout,
        });
      }

      const playedCompletedMatchIds = new Set(
        latestPredictions
          .filter((entry) => entry.userId === user.uid)
          .map((entry) => entry.matchId)
          .filter((matchId): matchId is string => !!matchId && completedMatchIdSet.has(matchId))
      );
      const playedCompletedMatches = playedCompletedMatchIds.size;
      const participationRate =
        totalCompletedMatches > 0 ? playedCompletedMatches / totalCompletedMatches : 1;
      participationByUser.set(user.uid, { playedCompletedMatches, participationRate });

      events.sort((left, right) => {
        if (left.at !== right.at) {
          return left.at - right.at;
        }

        if (left.type === right.type) {
          return 0;
        }

        return left.type === "spin" ? -1 : 1;
      });

      let hasPendingDoublePointsNextWin = false;
      let hasPendingDoubleCoinNextMatchWin = false;
      let wheelPointsEarned = 0;
      let wheelCoinsEarned = 0;

      for (const event of events) {
        if (event.type === "spin") {
          if (event.rewardKind === "points" && event.rewardValue) {
            wheelPointsEarned += event.rewardValue;
            continue;
          }

          if (event.rewardKind === "coins" && event.rewardValue) {
            wheelCoinsEarned += event.rewardValue;
            continue;
          }

          if (event.rewardKind === "points_x2_next_win") {
            hasPendingDoublePointsNextWin = true;
            continue;
          }

          if (event.rewardKind === "coins_x2_next_match_win") {
            hasPendingDoubleCoinNextMatchWin = true;
          }

          continue;
        }

        if (event.status === "won") {
          if (hasPendingDoublePointsNextWin) {
            wheelPointsEarned += 3;
            hasPendingDoublePointsNextWin = false;
          }

          if (hasPendingDoubleCoinNextMatchWin) {
            const normalPayout = event.amount * 2;
            const bonusCoins = Math.max(0, event.payout - normalPayout);
            wheelCoinsEarned += bonusCoins;
            hasPendingDoubleCoinNextMatchWin = false;
          }

          continue;
        }

        if (event.status === "lost") {
          hasPendingDoublePointsNextWin = false;
          hasPendingDoubleCoinNextMatchWin = false;
        }
      }

      metricsByUser.set(user.uid, {
        wheelPointsEarned,
        wheelCoinsEarned,
      });
    }

    const users = latestUsers
      .map((user) => {
        const computed = metricsByUser.get(user.uid);
        return {
          ...user,
          wheelPointsEarned: computed?.wheelPointsEarned ?? user.wheelPointsEarned ?? 0,
          wheelCoinsEarned: computed?.wheelCoinsEarned ?? user.wheelCoinsEarned ?? 0,
        };
      })
      .filter((user) => user.totalPredictions > 0);

    const sortByRank = (left: UserProfileRecord, right: UserProfileRecord) => {
      if (right.points !== left.points) {
        return right.points - left.points;
      }

      return right.balance - left.balance;
    };

    const listedUsers = users
      .filter((user) => {
        const participationRate = participationByUser.get(user.uid)?.participationRate ?? 1;
        return participationRate >= threshold;
      })
      .sort(sortByRank);

    const unlistedUsers = users
      .filter((user) => {
        const participationRate = participationByUser.get(user.uid)?.participationRate ?? 1;
        return participationRate < threshold;
      })
      .sort(sortByRank);

    return {
      listedUsers,
      unlistedUsers,
      totalCompletedMatches,
  };
}

export async function getLeaderboardUsersSnapshot() {
  const { db } = getFirebaseServices();
  const LEADERBOARD_PARTICIPATION_THRESHOLD = 0.35;
  const [usersSnapshot, spinResultsSnapshot, predictionsSnapshot, matchesSnapshot] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "weekly_spin_results")),
    getDocs(collection(db, "predictions")),
    getDocs(collection(db, "matches")),
  ]);

  const users = usersSnapshot.docs.map((userDoc) => ({
    uid: userDoc.id,
    ...(userDoc.data() as UserProfile),
  }));
  const spinResults = spinResultsSnapshot.docs.map((entry) => entry.data() as {
    userId?: string;
    rewardKind?: string;
    rewardValue?: number | null;
    createdAt?: unknown;
  });
  const predictions = predictionsSnapshot.docs.map((entry) => entry.data() as {
    userId?: string;
    status?: string;
    matchId?: string;
    amount?: number;
    payout?: number;
    settledAt?: unknown;
  });
  const matches = matchesSnapshot.docs.map((entry) => ({
    id: entry.id,
    status: (entry.data() as { status?: string }).status,
  }));

  return buildLeaderboardPayload({
    users,
    spinResults,
    predictions,
    matches,
    threshold: LEADERBOARD_PARTICIPATION_THRESHOLD,
  });
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

export async function applyGlobalBonus({
  adminUserId,
  bonusPoints,
  bonusCoins,
  reason,
}: {
  adminUserId: string;
  bonusPoints: number;
  bonusCoins: number;
  reason: string;
}) {
  const { db } = getFirebaseServices();
  const points = Math.max(0, Math.floor(bonusPoints || 0));
  const coins = Math.max(0, Math.floor(bonusCoins || 0));
  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    throw new Error("Bonus reason is required.");
  }

  if (points <= 0 && coins <= 0) {
    throw new Error("Enter bonus points or bonus coins.");
  }

  const usersSnapshot = await getDocs(collection(db, "users"));
  const targetUsers = usersSnapshot.docs.filter((entry) => {
    const data = entry.data() as UserProfile;
    return data.role !== "admin";
  });

  if (!targetUsers.length) {
    throw new Error("No eligible users found for bonus.");
  }

  const grantRef = doc(collection(db, "bonus_grants"));
  const grantId = grantRef.id;
  const issuedAt = serverTimestamp();
  const noticeTitle =
    points > 0 && coins > 0
      ? "Admin Bonus: Points + Coins"
      : points > 0
        ? "Admin Bonus: Points"
        : "Admin Bonus: Coins";
  const noticeMessage =
    points > 0 && coins > 0
      ? `You received ${points} bonus points and ${coins.toLocaleString("en-IN")} bonus coins.`
      : points > 0
        ? `You received ${points} bonus points.`
        : `You received ${coins.toLocaleString("en-IN")} bonus coins.`;

  await writeBatch(db)
    .set(grantRef, {
      points,
      coins,
      reason: trimmedReason,
      createdBy: adminUserId,
      recipientCount: targetUsers.length,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    })
    .commit();

  const CHUNK_SIZE = 140;
  for (let index = 0; index < targetUsers.length; index += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const userDoc of targetUsers.slice(index, index + CHUNK_SIZE)) {
      const currentUser = userDoc.data() as UserProfile;
      const nextPoints = (currentUser.points ?? 0) + points;
      const nextBalance = (currentUser.balance ?? 0) + coins;

      batch.update(userDoc.ref, {
        points: nextPoints,
        balance: nextBalance,
        updatedAt: serverTimestamp(),
      });

      if (coins > 0) {
        const transactionRef = doc(collection(db, "transactions"));
        batch.set(transactionRef, {
          userId: userDoc.id,
          type: "admin_bonus_coin_credit",
          amount: coins,
          balanceBefore: currentUser.balance ?? 0,
          balanceAfter: nextBalance,
          referenceType: "admin_bonus",
          referenceId: grantId,
          note: trimmedReason,
          createdAt: serverTimestamp(),
        });
      }

      const notificationRef = doc(db, "user_notifications", `${grantId}_${userDoc.id}`);
      batch.set(notificationRef, {
        userId: userDoc.id,
        type: "admin_bonus",
        title: noticeTitle,
        message: noticeMessage,
        reason: trimmedReason,
        points,
        coins,
        bonusGrantId: grantId,
        seen: false,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return {
    grantId,
    recipientCount: targetUsers.length,
    points,
    coins,
  };
}

export async function deleteUserRecords(uid: string) {
  const { db } = getFirebaseServices();
  const userRef = doc(db, "users", uid);
  const predictionsQuery = query(collection(db, "predictions"), where("userId", "==", uid));
  const transactionsQuery = query(collection(db, "transactions"), where("userId", "==", uid));
  const userRewardsQuery = query(collection(db, "user_rewards"), where("userId", "==", uid));
  const weeklySpinResultsQuery = query(
    collection(db, "weekly_spin_results"),
    where("userId", "==", uid)
  );
  const referralsByReferrerQuery = query(
    collection(db, "referrals"),
    where("referrerUserId", "==", uid)
  );
  const referralsByReferredQuery = query(
    collection(db, "referrals"),
    where("referredUserId", "==", uid)
  );

  const [
    predictionSnapshots,
    transactionSnapshots,
    rewardSnapshots,
    spinResultSnapshots,
    referrerReferralSnapshots,
    referredReferralSnapshots,
  ] =
    await Promise.all([
      getDocs(predictionsQuery),
      getDocs(transactionsQuery),
      getDocs(userRewardsQuery),
      getDocs(weeklySpinResultsQuery),
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

  for (const snapshot of rewardSnapshots.docs) {
    refsToDelete.set(snapshot.ref.path, snapshot.ref);
  }

  for (const snapshot of spinResultSnapshots.docs) {
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

export async function updateCurrentUserDisplayName(user: User, displayName: string) {
  const { db } = getFirebaseServices();
  const normalizedDisplayName = validateDisplayName(displayName);
  const userRef = doc(db, "users", user.uid);
  const predictionsQuery = query(collection(db, "predictions"), where("userId", "==", user.uid));
  const referralsQuery = query(
    collection(db, "referrals"),
    where("referrerUserId", "==", user.uid)
  );
  const referredUsersQuery = query(
    collection(db, "users"),
    where("referredByUserId", "==", user.uid)
  );

  const [userSnapshot, predictionSnapshots, referralSnapshots, referredUserSnapshots] =
    await Promise.all([
      getDoc(userRef),
      getDocs(predictionsQuery),
      getDocs(referralsQuery),
      getDocs(referredUsersQuery),
    ]);

  if (!userSnapshot.exists()) {
    throw new Error("User profile not found.");
  }

  const currentProfile = userSnapshot.data() as UserProfile;
  if (currentProfile.displayName === normalizedDisplayName && user.displayName === normalizedDisplayName) {
    return currentProfile;
  }

  const updates = [
    {
      ref: userRef,
      data: {
        displayName: normalizedDisplayName,
        updatedAt: serverTimestamp(),
      },
    },
    ...predictionSnapshots.docs.map((snapshot) => ({
      ref: snapshot.ref,
      data: {
        userDisplayName: normalizedDisplayName,
        updatedAt: serverTimestamp(),
      },
    })),
    ...referralSnapshots.docs.map((snapshot) => ({
      ref: snapshot.ref,
      data: {
        referrerDisplayName: normalizedDisplayName,
        updatedAt: serverTimestamp(),
      },
    })),
    ...referredUserSnapshots.docs.map((snapshot) => ({
      ref: snapshot.ref,
      data: {
        referredByDisplayName: normalizedDisplayName,
        updatedAt: serverTimestamp(),
      },
    })),
  ];

  for (let index = 0; index < updates.length; index += 400) {
    const batch = writeBatch(db);

    for (const updateEntry of updates.slice(index, index + 400)) {
      batch.update(updateEntry.ref, updateEntry.data);
    }

    await batch.commit();
  }

  if (user.displayName !== normalizedDisplayName) {
    await updateProfile(user, { displayName: normalizedDisplayName });
  }

  return {
    ...currentProfile,
    displayName: normalizedDisplayName,
  } as UserProfile;
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

  await runTransaction(db, async (transaction) => {
    const existingUser = await transaction.get(userRef);

    if (existingUser.exists()) {
      return;
    }

    const referralSnapshot = referralRef ? await transaction.get(referralRef) : null;
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

    if (!referralData) {
      throw new Error("Referral required for sign up. Contact admin to get access.");
    }

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
      role: "user",
      balance: openingBalance,
      points: 0,
      wins: 0,
      losses: 0,
      totalPredictions: 0,
      hasReceivedSpinAgain: false,
      hasPendingDoublePointsNextWin: false,
      hasPendingDoubleCoinNextMatchWin: false,
      wheelPointsEarned: 0,
      wheelCoinsEarned: 0,
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

  const referralSnapshot = referralRef ? await getDoc(referralRef) : null;
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

  if (!referralData) {
    throw new Error("Referral required for sign up. Contact admin to get access.");
  }
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
    role: "user",
    balance: openingBalance,
    points: 0,
    wins: 0,
    losses: 0,
    totalPredictions: 0,
    hasReceivedSpinAgain: false,
    hasPendingDoublePointsNextWin: false,
    hasPendingDoubleCoinNextMatchWin: false,
    wheelPointsEarned: 0,
    wheelCoinsEarned: 0,
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
