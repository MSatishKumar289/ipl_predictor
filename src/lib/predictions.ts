import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import type { UserProfile } from "./auth-types";
import { isBettingOpen } from "./matches";
import type { MatchRecord } from "./match-types";
import type { PredictionRecord, PredictionSelection } from "./prediction-types";

export const MINIMUM_BET = 100;
export const BET_STEP = 100;
export const SEVENTY_PERCENT_RESTRICTION_THRESHOLD = 10000;
export const FIFTY_PERCENT_RESTRICTION_THRESHOLD = 20000;

export function getMaximumAllowedBet(availableBalance: number) {
  if (availableBalance <= SEVENTY_PERCENT_RESTRICTION_THRESHOLD) {
    return null;
  }

  const capRatio =
    availableBalance > FIFTY_PERCENT_RESTRICTION_THRESHOLD ? 0.5 : 0.7;

  return Math.floor((availableBalance * capRatio) / BET_STEP) * BET_STEP;
}

function predictionId(matchId: string, userId: string) {
  return `${matchId}_${userId}`;
}

export function subscribeToUserPrediction(
  matchId: string,
  userId: string,
  callback: (prediction: PredictionRecord | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "predictions", predictionId(matchId, userId)),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback({
        id: snapshot.id,
        ...(snapshot.data() as Omit<PredictionRecord, "id">),
      });
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToUserPredictions(
  userId: string,
  callback: (predictions: PredictionRecord[]) => void,
  onError?: (error: Error) => void
) {
  const predictionsQuery = query(collection(db, "predictions"), where("userId", "==", userId));

  return onSnapshot(
    predictionsQuery,
    (snapshot) => {
      const predictions = snapshot.docs.map((predictionDoc) => ({
        id: predictionDoc.id,
        ...(predictionDoc.data() as Omit<PredictionRecord, "id">),
      }));

      callback(predictions);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToMatchPredictions(
  matchId: string,
  callback: (predictions: PredictionRecord[]) => void,
  onError?: (error: Error) => void
) {
  const predictionsQuery = query(
    collection(db, "predictions"),
    where("matchId", "==", matchId)
  );

  return onSnapshot(
    predictionsQuery,
    (snapshot) => {
      const predictions = snapshot.docs
        .map((predictionDoc) => ({
          id: predictionDoc.id,
          ...(predictionDoc.data() as Omit<PredictionRecord, "id">),
        }))
        .sort((left, right) => right.amount - left.amount);

      callback(predictions);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function placeOrEditPrediction({
  match,
  userId,
  userDisplayName,
  selection,
  amount,
}: {
  match: MatchRecord;
  userId: string;
  userDisplayName: string;
  selection: PredictionSelection;
  amount: number;
}) {
  if (amount < MINIMUM_BET) {
    throw new Error(`Minimum bet is ${MINIMUM_BET} coins.`);
  }

  if (amount % BET_STEP !== 0) {
    throw new Error(`Bets must be in multiples of ${BET_STEP} coins.`);
  }

  const matchRef = doc(db, "matches", match.id);
  const userRef = doc(db, "users", userId);
  const predictionRef = doc(db, "predictions", predictionId(match.id, userId));

  await runTransaction(db, async (transaction) => {
    const [matchSnapshot, userSnapshot, predictionSnapshot] = await Promise.all([
      transaction.get(matchRef),
      transaction.get(userRef),
      transaction.get(predictionRef),
    ]);

    if (!matchSnapshot.exists()) {
      throw new Error("Match not found.");
    }

    if (!userSnapshot.exists()) {
      throw new Error("User profile not found.");
    }

    const liveMatch = matchSnapshot.data() as MatchRecord;
    const liveUser = userSnapshot.data() as UserProfile;
    const existingPrediction = predictionSnapshot.exists()
      ? (predictionSnapshot.data() as Omit<PredictionRecord, "id">)
      : null;
    const referralRef = liveUser.referralId ? doc(db, "referrals", liveUser.referralId) : null;
    const referralSnapshot = referralRef ? await transaction.get(referralRef) : null;
    const referralData = referralSnapshot?.exists()
      ? (referralSnapshot.data() as {
          status?: string;
          firstPredictionId?: string | null;
        })
      : null;

    if (!isBettingOpen(liveMatch)) {
      if (Date.now() >= new Date(liveMatch.lockAt).getTime()) {
        throw new Error("Predictions are locked for this match.");
      }

      throw new Error("Betting opens 24 hours before the match starts.");
    }

    if (Date.now() >= new Date(liveMatch.lockAt).getTime()) {
      throw new Error("Predictions are locked for this match.");
    }

    if (existingPrediction && !liveMatch.isEditableBeforeLock) {
      throw new Error("Prediction editing is disabled for this match.");
    }

    const previousAmount = existingPrediction?.amount ?? 0;
    const availableBalance = liveUser.balance + previousAmount;
    const maximumAllowedBet = getMaximumAllowedBet(availableBalance);
    const nextBalance = availableBalance - amount;

    if (maximumAllowedBet !== null && amount > maximumAllowedBet) {
      throw new Error(
        `Maximum allowed bet is ${maximumAllowedBet.toLocaleString("en-IN")} coins for your current balance tier. Bets must also be in multiples of ${BET_STEP} coins.`
      );
    }

    if (nextBalance < 0) {
      throw new Error("Insufficient balance for this prediction.");
    }

    const settlementDefaults = {
      status: "pending",
      payout: 0,
      profit: 0,
      settledAt: null,
      updatedAt: serverTimestamp(),
    } as const;

    if (!existingPrediction) {
      transaction.set(predictionRef, {
        matchId: match.id,
        userId,
        userDisplayName,
        selectedTeam: selection,
        amount,
        createdAt: serverTimestamp(),
        ...settlementDefaults,
      });

      transaction.update(userRef, {
        balance: nextBalance,
        totalPredictions: liveUser.totalPredictions + 1,
        updatedAt: serverTimestamp(),
      });

      transaction.set(doc(collection(db, "transactions")), {
        userId,
        type: "bet_placed",
        amount: -amount,
        balanceBefore: liveUser.balance,
        balanceAfter: nextBalance,
        referenceType: "match",
        referenceId: match.id,
        note: `Placed prediction for match ${match.matchNumber}`,
        createdAt: serverTimestamp(),
      });

      if (
        referralRef &&
        referralData?.status === "signed_up" &&
        !referralData.firstPredictionId
      ) {
        transaction.update(referralRef, {
          status: "first_bet_pending_settlement",
          firstPredictionId: predictionRef.id,
          firstMatchId: match.id,
          updatedAt: serverTimestamp(),
        });
      }

      return;
    }

    transaction.update(predictionRef, {
      selectedTeam: selection,
      amount,
      ...settlementDefaults,
    });

    transaction.update(userRef, {
      balance: nextBalance,
      updatedAt: serverTimestamp(),
    });

    transaction.set(doc(collection(db, "transactions")), {
      userId,
      type: "bet_edit_refund",
      amount: previousAmount,
      balanceBefore: liveUser.balance,
      balanceAfter: liveUser.balance + previousAmount,
      referenceType: "match",
      referenceId: match.id,
      note: `Refunded previous prediction before edit for match ${match.matchNumber}`,
      createdAt: serverTimestamp(),
    });

    transaction.set(doc(collection(db, "transactions")), {
      userId,
      type: "bet_edit_placed",
      amount: -amount,
      balanceBefore: liveUser.balance + previousAmount,
      balanceAfter: nextBalance,
      referenceType: "match",
      referenceId: match.id,
      note: `Updated prediction for match ${match.matchNumber}`,
      createdAt: serverTimestamp(),
    });
  });
}

export async function deletePrediction({
  match,
  userId,
}: {
  match: MatchRecord;
  userId: string;
}) {
  const matchRef = doc(db, "matches", match.id);
  const userRef = doc(db, "users", userId);
  const predictionRef = doc(db, "predictions", predictionId(match.id, userId));

  await runTransaction(db, async (transaction) => {
    const [matchSnapshot, userSnapshot, predictionSnapshot] = await Promise.all([
      transaction.get(matchRef),
      transaction.get(userRef),
      transaction.get(predictionRef),
    ]);

    if (!matchSnapshot.exists()) {
      throw new Error("Match not found.");
    }

    if (!userSnapshot.exists()) {
      throw new Error("User profile not found.");
    }

    if (!predictionSnapshot.exists()) {
      throw new Error("Prediction not found.");
    }

    const liveMatch = matchSnapshot.data() as MatchRecord;
    const liveUser = userSnapshot.data() as UserProfile;
    const livePrediction = predictionSnapshot.data() as Omit<PredictionRecord, "id">;
    const referralRef = liveUser.referralId ? doc(db, "referrals", liveUser.referralId) : null;
    const referralSnapshot = referralRef ? await transaction.get(referralRef) : null;
    const referralData = referralSnapshot?.exists()
      ? (referralSnapshot.data() as {
          status?: string;
          firstPredictionId?: string | null;
        })
      : null;

    if (!isBettingOpen(liveMatch)) {
      if (Date.now() >= new Date(liveMatch.lockAt).getTime()) {
        throw new Error("Predictions are locked for this match.");
      }

      throw new Error("Betting opens 24 hours before the match starts.");
    }

    if (Date.now() >= new Date(liveMatch.lockAt).getTime()) {
      throw new Error("Predictions are locked for this match.");
    }

    if (!liveMatch.isEditableBeforeLock) {
      throw new Error("Prediction editing is disabled for this match.");
    }

    const nextBalance = liveUser.balance + livePrediction.amount;

    transaction.delete(predictionRef);

    transaction.update(userRef, {
      balance: nextBalance,
      totalPredictions: Math.max(0, liveUser.totalPredictions - 1),
      updatedAt: serverTimestamp(),
    });

    transaction.set(doc(collection(db, "transactions")), {
      userId,
      type: "bet_deleted_refund",
      amount: livePrediction.amount,
      balanceBefore: liveUser.balance,
      balanceAfter: nextBalance,
      referenceType: "match",
      referenceId: match.id,
      note: `Deleted prediction for match ${match.matchNumber}`,
      createdAt: serverTimestamp(),
    });

    if (
      referralRef &&
      referralData?.status === "first_bet_pending_settlement" &&
      referralData.firstPredictionId === predictionRef.id
    ) {
      transaction.update(referralRef, {
        status: "signed_up",
        firstPredictionId: null,
        firstMatchId: null,
        updatedAt: serverTimestamp(),
      });
    }
  });
}
