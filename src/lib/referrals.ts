import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import type { ReferralRecord } from "./referral-types";

export const REFERRAL_REWARD_AMOUNT = 5000;

export function normalizeReferralPhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/[^0-9]/g, "");
}

function validateReferralPhoneNumber(phoneNumber: string) {
  const normalized = normalizeReferralPhoneNumber(phoneNumber);

  if (normalized.length < 10) {
    throw new Error("Enter a valid mobile number.");
  }

  return normalized;
}

function referralIdFromPhoneNumber(phoneNumber: string) {
  return normalizeReferralPhoneNumber(phoneNumber);
}

function getTimestampValue(value: unknown) {
  if (!value) {
    return 0;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value === "object" && value && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "object" && value && "seconds" in value && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  return 0;
}

export async function createReferral({
  referrerUserId,
  referrerDisplayName,
  referrerPhoneNumber,
  referredName,
  referredPhoneNumber,
}: {
  referrerUserId: string;
  referrerDisplayName: string;
  referrerPhoneNumber?: string | null;
  referredName?: string;
  referredPhoneNumber: string;
}) {
  const normalizedReferralPhone = validateReferralPhoneNumber(referredPhoneNumber);
  const normalizedReferrerPhone = referrerPhoneNumber
    ? normalizeReferralPhoneNumber(referrerPhoneNumber)
    : null;

  if (normalizedReferrerPhone && normalizedReferrerPhone === normalizedReferralPhone) {
    throw new Error("You cannot refer your own mobile number.");
  }

  const existingUsers = await getDocs(
    query(collection(db, "users"), where("phoneNumber", "==", normalizedReferralPhone))
  );

  if (!existingUsers.empty) {
    throw new Error("Cannot refer already existing user.");
  }

  const referralRef = doc(db, "referrals", referralIdFromPhoneNumber(normalizedReferralPhone));
  const referralSnapshot = await getDoc(referralRef);

  if (referralSnapshot.exists()) {
    throw new Error("Referral already sent.");
  }

  const referredNameValue = referredName?.trim() || null;

  await runTransaction(db, async (transaction) => {
    const existingReferral = await transaction.get(referralRef);

    if (existingReferral.exists()) {
      throw new Error("Referral already sent.");
    }

    transaction.set(referralRef, {
      referrerUserId,
      referrerDisplayName: referrerDisplayName.trim(),
      referredPhoneNumber: normalizedReferralPhone,
      referredName: referredNameValue,
      referredUserId: null,
      status: "pending",
      rewardAmount: REFERRAL_REWARD_AMOUNT,
      firstPredictionId: null,
      firstMatchId: null,
      rewardTransactionId: null,
      rewardedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export function subscribeToUserReferrals(
  referrerUserId: string,
  callback: (referrals: ReferralRecord[]) => void,
  onError?: (error: Error) => void
) {
  const referralsQuery = query(
    collection(db, "referrals"),
    where("referrerUserId", "==", referrerUserId)
  );

  return onSnapshot(
    referralsQuery,
    (snapshot) => {
      const referrals = snapshot.docs
        .map((referralDoc) => ({
          id: referralDoc.id,
          ...(referralDoc.data() as Omit<ReferralRecord, "id">),
        }))
        .sort((left, right) => {
          return getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt);
        });

      callback(referrals);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function markReferralMessageSeen(uid: string) {
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists()) {
      return;
    }

    transaction.update(userRef, {
      hasSeenReferralMessage: true,
      updatedAt: serverTimestamp(),
    });
  });
}

export function getReferralStatusLabel(status: ReferralRecord["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "signed_up":
      return "Signed Up";
    case "first_bet_pending_settlement":
      return "First Bet Pending";
    case "rewarded":
      return "Rewarded";
    default:
      return status;
  }
}
