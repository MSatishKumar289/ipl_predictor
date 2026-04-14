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
import type { UserRewardRecord } from "./spin-types";

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
  appliedReward,
}: {
  match: MatchRecord;
  userId: string;
  userDisplayName: string;
  selection: PredictionSelection;
  amount: number;
  appliedReward: UserRewardRecord | null;
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
  const nextRewardRef = appliedReward ? doc(db, "user_rewards", appliedReward.id) : null;

  await runTransaction(db, async (transaction) => {
    const [matchSnapshot, userSnapshot, predictionSnapshot, nextRewardSnapshot] = await Promise.all([
      transaction.get(matchRef),
      transaction.get(userRef),
      transaction.get(predictionRef),
      nextRewardRef ? transaction.get(nextRewardRef) : Promise.resolve(null),
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
    const previousRewardRef = existingPrediction?.appliedRewardId
      ? doc(db, "user_rewards", existingPrediction.appliedRewardId)
      : null;
    const previousRewardSnapshot = previousRewardRef
      ? await transaction.get(previousRewardRef)
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

    const previousWalletDebitAmount =
      existingPrediction?.walletDebitAmount ?? existingPrediction?.amount ?? 0;
    const availableBalance = liveUser.balance + previousWalletDebitAmount;
    const maximumAllowedBet = getMaximumAllowedBet(availableBalance);

    if (
      appliedReward?.type === "free_bet_ticket" &&
      amount > appliedReward.capAmount
    ) {
      throw new Error(
        `Free Bet Ticket can only be used for bets up to ${appliedReward.capAmount.toLocaleString("en-IN")} coins.`
      );
    }

    const nextWalletDebitAmount =
      appliedReward?.type === "free_bet_ticket" ? 0 : amount;
    const nextBalance = availableBalance - nextWalletDebitAmount;

    if (
      appliedReward?.type !== "free_bet_ticket" &&
      maximumAllowedBet !== null &&
      amount > maximumAllowedBet
    ) {
      throw new Error(
        `Maximum allowed bet is ${maximumAllowedBet.toLocaleString("en-IN")} coins for your current balance tier. Bets must also be in multiples of ${BET_STEP} coins.`
      );
    }

    if (appliedReward?.type !== "free_bet_ticket" && nextBalance < 0) {
      throw new Error("Insufficient balance for this prediction.");
    }

    const settlementDefaults = {
      status: "pending",
      payout: 0,
      profit: 0,
      settledAt: null,
      updatedAt: serverTimestamp(),
    } as const;
    const previousRewardId = existingPrediction?.appliedRewardId ?? null;
    const nextRewardId = appliedReward?.id ?? null;

    if (
      nextRewardSnapshot &&
      (!nextRewardSnapshot.exists() ||
        (nextRewardSnapshot.data() as UserRewardRecord).userId !== userId ||
        ((nextRewardSnapshot.data() as UserRewardRecord).status !== "available" &&
          nextRewardId !== previousRewardId))
    ) {
      throw new Error("Selected reward is no longer available.");
    }

    if (previousRewardId && previousRewardId !== nextRewardId && previousRewardSnapshot?.exists()) {
      transaction.update(previousRewardRef!, {
        status: "available",
        usedPredictionId: null,
        usedMatchId: null,
        usedAt: null,
        updatedAt: serverTimestamp(),
      });
    }

    if (nextRewardRef && nextRewardId !== previousRewardId) {
      transaction.update(nextRewardRef, {
        status: "used",
        usedPredictionId: predictionRef.id,
        usedMatchId: match.id,
        usedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const rewardFields = {
      walletDebitAmount: nextWalletDebitAmount,
      appliedRewardId: appliedReward?.id ?? null,
      appliedRewardType: appliedReward?.type ?? null,
      appliedRewardLabel: appliedReward?.label ?? null,
      appliedRewardCapAmount: appliedReward?.capAmount ?? null,
    };

    if (!existingPrediction) {
      transaction.set(predictionRef, {
        matchId: match.id,
        userId,
        userDisplayName,
        selectedTeam: selection,
        amount,
        ...rewardFields,
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
        type:
          appliedReward?.type === "free_bet_ticket"
            ? "bet_placed_with_free_ticket"
            : "bet_placed",
        amount: -nextWalletDebitAmount,
        balanceBefore: liveUser.balance,
        balanceAfter: nextBalance,
        referenceType: "match",
        referenceId: match.id,
        note:
          appliedReward?.type === "free_bet_ticket"
            ? `Placed prediction for match ${match.matchNumber} using Free Bet Ticket`
            : appliedReward?.type === "bet_insurance"
              ? `Placed prediction for match ${match.matchNumber} using Bet Insurance`
              : `Placed prediction for match ${match.matchNumber}`,
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
      ...rewardFields,
      ...settlementDefaults,
    });

    transaction.update(userRef, {
      balance: nextBalance,
      updatedAt: serverTimestamp(),
    });

    if (previousWalletDebitAmount > 0) {
      transaction.set(doc(collection(db, "transactions")), {
        userId,
        type: "bet_edit_refund",
        amount: previousWalletDebitAmount,
        balanceBefore: liveUser.balance,
        balanceAfter: liveUser.balance + previousWalletDebitAmount,
        referenceType: "match",
        referenceId: match.id,
        note: `Refunded previous prediction before edit for match ${match.matchNumber}`,
        createdAt: serverTimestamp(),
      });
    }

    transaction.set(doc(collection(db, "transactions")), {
      userId,
      type:
        appliedReward?.type === "free_bet_ticket"
          ? "bet_edit_placed_with_free_ticket"
          : "bet_edit_placed",
      amount: -nextWalletDebitAmount,
      balanceBefore: liveUser.balance + previousWalletDebitAmount,
      balanceAfter: nextBalance,
      referenceType: "match",
      referenceId: match.id,
      note:
        appliedReward?.type === "free_bet_ticket"
          ? `Updated prediction for match ${match.matchNumber} using Free Bet Ticket`
          : appliedReward?.type === "bet_insurance"
            ? `Updated prediction for match ${match.matchNumber} using Bet Insurance`
            : `Updated prediction for match ${match.matchNumber}`,
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

    const refundedDebitAmount =
      livePrediction.walletDebitAmount ?? livePrediction.amount;
    const nextBalance = liveUser.balance + refundedDebitAmount;

    transaction.delete(predictionRef);

    transaction.update(userRef, {
      balance: nextBalance,
      totalPredictions: Math.max(0, liveUser.totalPredictions - 1),
      updatedAt: serverTimestamp(),
    });

    if (livePrediction.appliedRewardId) {
      transaction.update(doc(db, "user_rewards", livePrediction.appliedRewardId), {
        status: "available",
        usedPredictionId: null,
        usedMatchId: null,
        usedAt: null,
        updatedAt: serverTimestamp(),
      });
    }

    if (refundedDebitAmount > 0) {
      transaction.set(doc(collection(db, "transactions")), {
        userId,
        type: "bet_deleted_refund",
        amount: refundedDebitAmount,
        balanceBefore: liveUser.balance,
        balanceAfter: nextBalance,
        referenceType: "match",
        referenceId: match.id,
        note: `Deleted prediction for match ${match.matchNumber}`,
        createdAt: serverTimestamp(),
      });
    }

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
