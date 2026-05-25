import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import type { UserProfile } from "./auth-types";
import type { CreateMatchInput, MatchOutcome, MatchRecord, MatchStatus } from "./match-types";
import type { PredictionRecord } from "./prediction-types";
import type { ReferralRecord } from "./referral-types";
import { REFERRAL_REWARD_AMOUNT } from "./referrals";

const MATCH_LOCK_MINUTES = 35;
const BETTING_OPEN_HOURS = 24;
const DEFAULT_WIN_POINTS = 3;
const LEADERBOARD_PARTICIPATION_THRESHOLD = 0.35;
const INACTIVITY_PENALTY_POINTS = 1;
const SETTLEMENT_TRANSACTION_TYPES = new Set([
  "match_win_payout",
  "match_refund_no_result",
  "match_inactivity_penalty",
]);

type SettlementSnapshotMeta = {
  matchId: string;
  matchNumber: number;
  matchLabel: string;
  teamAShort: string;
  teamBShort: string;
  createdBy: string;
  reason: "pre_settlement_backup";
  statusBeforeSettlement: MatchStatus;
  winnerBeforeSettlement: MatchOutcome;
  settledAtBeforeSettlement: string | null;
  settledByBeforeSettlement: string | null;
  isSettlementApplied: boolean;
  settlementAppliedAt: unknown;
  isRestored: boolean;
  restoredAt: unknown;
  restoredBy: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
export type SettlementBackupAvailability = Record<
  string,
  {
    snapshotId: string;
    hasBackup: boolean;
    createdAt: unknown;
  }
>;

export type BettingState = "closed" | "bet_open" | "bet_locked" | "completed";

export function isMatchLocked(lockAt: string) {
  return Date.now() >= new Date(lockAt).getTime();
}

export function isBettingOpen(match: Pick<MatchRecord, "startAt" | "lockAt" | "status">) {
  return getBettingState(match) === "bet_open";
}

export function getBettingState(
  match: Pick<MatchRecord, "startAt" | "lockAt" | "status">
): BettingState {
  if (
    match.status === "completed" ||
    match.status === "settled" ||
    match.status === "no_result"
  ) {
    return "completed";
  }

  if (isMatchLocked(match.lockAt) || match.status === "locked") {
    return "bet_locked";
  }

  const bettingOpenAt = new Date(match.startAt).getTime() - BETTING_OPEN_HOURS * 60 * 60 * 1000;

  if (Date.now() >= bettingOpenAt) {
    return "bet_open";
  }

  return "closed";
}

function deriveStatus({
  lockAt,
  winner,
  status,
  settledAt,
}: {
  lockAt: string;
  winner: MatchOutcome;
  status?: MatchStatus;
  settledAt?: string | null;
}) {
  if (winner === "no_result") {
    return "no_result" as const;
  }

  if (settledAt || status === "settled") {
    return "settled" as const;
  }

  if (winner === "teamA" || winner === "teamB") {
    return "completed" as const;
  }

  if (isMatchLocked(lockAt)) {
    return "locked" as const;
  }

  return "upcoming" as const;
}

function normalizeMatch(matchDoc: { id: string; data: Omit<MatchRecord, "id"> }): MatchRecord {
  const data = matchDoc.data;

  return {
    id: matchDoc.id,
    ...data,
    status: deriveStatus({
      lockAt: data.lockAt,
      winner: data.winner,
      status: data.status,
      settledAt: data.settledAt,
    }),
  };
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

async function createSettlementSnapshot(
  match: MatchRecord,
  predictionDocs: Awaited<ReturnType<typeof getDocs>>["docs"],
  adminUserId: string
) {
  const snapshotRef = doc(collection(db, "settlement_snapshots"));
  const userIds = [
    ...new Set(
      predictionDocs.map((entry) => (entry.data() as Omit<PredictionRecord, "id">).userId)
    ),
  ];
  const userSnapshots = await Promise.all(userIds.map((userId) => getDoc(doc(db, "users", userId))));
  const referralIds = [
    ...new Set(
      userSnapshots
        .filter((entry) => entry.exists())
        .map((entry) => (entry.data() as UserProfile).referralId)
        .filter((value): value is string => !!value)
    ),
  ];
  const referralSnapshots = await Promise.all(
    referralIds.map((referralId) => getDoc(doc(db, "referrals", referralId)))
  );
  const batch = writeBatch(db);

  batch.set(snapshotRef, {
    matchId: match.id,
    matchNumber: match.matchNumber,
    matchLabel: `${match.teamAShort} vs ${match.teamBShort}`,
    teamAShort: match.teamAShort,
    teamBShort: match.teamBShort,
    createdBy: adminUserId,
    reason: "pre_settlement_backup",
    statusBeforeSettlement: match.status,
    winnerBeforeSettlement: match.winner,
    settledAtBeforeSettlement: match.settledAt ?? null,
    settledByBeforeSettlement: match.settledBy ?? null,
    isSettlementApplied: false,
    settlementAppliedAt: null,
    isRestored: false,
    restoredAt: null,
    restoredBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies SettlementSnapshotMeta);

  for (const userSnapshot of userSnapshots) {
    if (!userSnapshot.exists()) {
      continue;
    }

    batch.set(doc(db, "settlement_snapshots", snapshotRef.id, "users", userSnapshot.id), {
      ...(userSnapshot.data() as UserProfile),
    });
  }

  for (const predictionDoc of predictionDocs) {
    batch.set(doc(db, "settlement_snapshots", snapshotRef.id, "predictions", predictionDoc.id), {
      ...(predictionDoc.data() as Omit<PredictionRecord, "id">),
    });
  }

  for (const referralSnapshot of referralSnapshots) {
    if (!referralSnapshot.exists()) {
      continue;
    }

    batch.set(doc(db, "settlement_snapshots", snapshotRef.id, "referrals", referralSnapshot.id), {
      ...(referralSnapshot.data() as Omit<ReferralRecord, "id">),
    });
  }

  await batch.commit();

  return snapshotRef;
}

export function subscribeToMatches(
  callback: (matches: MatchRecord[]) => void,
  onError?: (error: Error) => void
) {
  const matchesQuery = query(collection(db, "matches"), orderBy("startAt", "asc"));

  return onSnapshot(
    matchesQuery,
    (snapshot) => {
      const matches = snapshot.docs.map((matchDoc) =>
        normalizeMatch({
          id: matchDoc.id,
          data: matchDoc.data() as Omit<MatchRecord, "id">,
        })
      );

      callback(matches);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToMatch(
  matchId: string,
  callback: (match: MatchRecord | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "matches", matchId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(
        normalizeMatch({
          id: snapshot.id,
          data: snapshot.data() as Omit<MatchRecord, "id">,
        })
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function createMatch(input: CreateMatchInput, createdBy: string) {
  const startAtDate = new Date(input.startAt);
  const lockAt = new Date(startAtDate.getTime() - MATCH_LOCK_MINUTES * 60 * 1000);
  const now = serverTimestamp();

  await addDoc(collection(db, "matches"), {
    matchNumber: input.matchNumber,
    teamAName: input.teamAName.trim(),
    teamBName: input.teamBName.trim(),
    teamAShort: input.teamAShort.trim().toUpperCase(),
    teamBShort: input.teamBShort.trim().toUpperCase(),
    startAt: startAtDate.toISOString(),
    lockAt: lockAt.toISOString(),
    status: "upcoming",
    winner: null,
    winnerPoints:
      Number.isFinite(input.winnerPoints) && (input.winnerPoints ?? 0) >= 0
        ? Math.floor(input.winnerPoints as number)
        : DEFAULT_WIN_POINTS,
    isEditableBeforeLock: input.isEditableBeforeLock,
    createdBy,
    settledAt: null,
    settledBy: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateMatchSettings(matchId: string, isEditableBeforeLock: boolean) {
  await updateDoc(doc(db, "matches", matchId), {
    isEditableBeforeLock,
    updatedAt: serverTimestamp(),
  });
}

export async function updateMatchDetails(
  matchId: string,
  input: {
    matchNumber: number;
    teamAName: string;
    teamBName: string;
    teamAShort: string;
    teamBShort: string;
    startAt: string;
    winnerPoints: number;
  }
) {
  const matchRef = doc(db, "matches", matchId);
  const startAtDate = new Date(input.startAt);
  const lockAt = new Date(startAtDate.getTime() - MATCH_LOCK_MINUTES * 60 * 1000);

  if (Number.isNaN(startAtDate.getTime())) {
    throw new Error("Invalid match start date/time.");
  }

  if (!Number.isFinite(input.winnerPoints) || input.winnerPoints < 0) {
    throw new Error("Winner points must be a valid non-negative number.");
  }

  await runTransaction(db, async (transaction) => {
    const matchSnapshot = await transaction.get(matchRef);

    if (!matchSnapshot.exists()) {
      throw new Error("Match not found.");
    }

    const liveMatch = normalizeMatch({
      id: matchSnapshot.id,
      data: matchSnapshot.data() as Omit<MatchRecord, "id">,
    });

    if (
      liveMatch.status === "settled" ||
      liveMatch.status === "completed" ||
      liveMatch.status === "no_result"
    ) {
      throw new Error("Settled/completed matches cannot be edited.");
    }

    transaction.update(matchRef, {
      matchNumber: Math.floor(input.matchNumber),
      teamAName: input.teamAName.trim(),
      teamBName: input.teamBName.trim(),
      teamAShort: input.teamAShort.trim().toUpperCase(),
      teamBShort: input.teamBShort.trim().toUpperCase(),
      startAt: startAtDate.toISOString(),
      lockAt: lockAt.toISOString(),
      winnerPoints: Math.floor(input.winnerPoints),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function deleteMatchBeforeBettingOpens(matchId: string) {
  const matchRef = doc(db, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const matchSnapshot = await transaction.get(matchRef);

    if (!matchSnapshot.exists()) {
      throw new Error("Match not found.");
    }

    const liveMatch = normalizeMatch({
      id: matchSnapshot.id,
      data: matchSnapshot.data() as Omit<MatchRecord, "id">,
    });

    if (
      liveMatch.status === "settled" ||
      liveMatch.status === "completed" ||
      liveMatch.status === "no_result"
    ) {
      throw new Error("Settled/completed matches cannot be deleted.");
    }

    if (getBettingState(liveMatch) !== "closed") {
      throw new Error("Match can be deleted only before betting opens.");
    }

    transaction.delete(matchRef);
  });
}

export async function settleMatchOutcome(matchId: string, winner: MatchOutcome, adminUserId: string) {
  const matchRef = doc(db, "matches", matchId);
  const matchSnapshot = await getDoc(matchRef);

  if (!matchSnapshot.exists()) {
    throw new Error("Match not found.");
  }

  const match = normalizeMatch({
    id: matchSnapshot.id,
    data: matchSnapshot.data() as Omit<MatchRecord, "id">,
  });

  if (match.status === "settled" || match.status === "no_result") {
    throw new Error("This match has already been settled.");
  }

  const predictionSnapshots = await getDocs(
    query(collection(db, "predictions"), where("matchId", "==", matchId))
  );
  const snapshotRef = await createSettlementSnapshot(match, predictionSnapshots.docs, adminUserId);

  await runTransaction(db, async (transaction) => {
    const latestMatchSnapshot = await transaction.get(matchRef);
    if (!latestMatchSnapshot.exists()) {
      throw new Error("Match not found.");
    }

    const latestMatch = normalizeMatch({
      id: latestMatchSnapshot.id,
      data: latestMatchSnapshot.data() as Omit<MatchRecord, "id">,
    });

    if (latestMatch.status === "settled" || latestMatch.status === "no_result") {
      throw new Error("This match has already been settled.");
    }

    const settlementTime = new Date().toISOString();
    const predictionUsers = new Map<
      string,
      {
        prediction: Omit<PredictionRecord, "id">;
        predictionRef: ReturnType<typeof doc>;
        userRef: ReturnType<typeof doc>;
        userData: UserProfile;
        referralRef: ReturnType<typeof doc> | null;
        referralData: {
          referrerUserId?: string;
          status?: string;
          firstPredictionId?: string | null;
        } | null;
        referrerRef: ReturnType<typeof doc> | null;
        referrerData: UserProfile | null;
      }
    >();

    for (const predictionSnapshot of predictionSnapshots.docs) {
      const prediction = predictionSnapshot.data() as Omit<PredictionRecord, "id">;
      const userRef = doc(db, "users", prediction.userId);
      const userSnapshot = await transaction.get(userRef);

      if (!userSnapshot.exists()) {
        continue;
      }

      const userData = userSnapshot.data() as UserProfile;
      const referralRef = userData.referralId ? doc(db, "referrals", userData.referralId) : null;
      const referralSnapshot = referralRef ? await transaction.get(referralRef) : null;
      const referralData = referralSnapshot?.exists()
        ? (referralSnapshot.data() as {
            referrerUserId?: string;
            status?: string;
            firstPredictionId?: string | null;
          })
        : null;
      const referrerRef =
        referralData?.referrerUserId && referralData.status === "first_bet_pending_settlement"
          ? doc(db, "users", referralData.referrerUserId)
          : null;
      const referrerSnapshot = referrerRef ? await transaction.get(referrerRef) : null;

      predictionUsers.set(predictionSnapshot.id, {
        prediction,
        predictionRef: doc(db, "predictions", predictionSnapshot.id),
        userRef,
        userData,
        referralRef,
        referralData,
        referrerRef,
        referrerData: referrerSnapshot?.exists() ? (referrerSnapshot.data() as UserProfile) : null,
      });
    }

    for (const [predictionId, predictionEntry] of predictionUsers.entries()) {
      const {
        prediction,
        predictionRef,
        userRef,
        userData,
        referralRef,
        referralData,
        referrerRef,
        referrerData,
      } = predictionEntry;
      const transactionRef = doc(collection(db, "transactions"));
      const shouldFinalizeReferral =
        !!referralRef &&
        !!referrerRef &&
        !!referrerData &&
        referralData?.status === "first_bet_pending_settlement" &&
        referralData.firstPredictionId === predictionId;
      const shouldRewardReferral = shouldFinalizeReferral && referrerData.role !== "admin";

      if (winner === "no_result") {
        const refundedDebitAmount = prediction.walletDebitAmount ?? prediction.amount;
        const refundedBalance = userData.balance + refundedDebitAmount;

        transaction.update(userRef, {
          balance: refundedBalance,
          updatedAt: serverTimestamp(),
        });

        transaction.update(predictionRef, {
          status: "refunded",
          payout: refundedDebitAmount,
          profit: 0,
          settledAt: settlementTime,
          updatedAt: serverTimestamp(),
        });

        if (refundedDebitAmount > 0) {
          transaction.set(transactionRef, {
            userId: prediction.userId,
            type: "match_refund_no_result",
            amount: refundedDebitAmount,
            balanceBefore: userData.balance,
            balanceAfter: refundedBalance,
            referenceType: "match",
            referenceId: matchId,
            note: `Refund for match ${latestMatch.matchNumber} due to no result`,
            createdAt: serverTimestamp(),
          });
        }

        if (prediction.appliedRewardId) {
          transaction.update(doc(db, "user_rewards", prediction.appliedRewardId), {
            status: "available",
            usedPredictionId: null,
            usedMatchId: null,
            usedAt: null,
            updatedAt: serverTimestamp(),
          });
        }

        if (shouldRewardReferral) {
          const referrerNextBalance = referrerData.balance + REFERRAL_REWARD_AMOUNT;
          const rewardTransactionRef = doc(collection(db, "transactions"));

          transaction.update(referrerRef, {
            balance: referrerNextBalance,
            updatedAt: serverTimestamp(),
          });

          transaction.update(referralRef, {
            status: "rewarded",
            rewardTransactionId: rewardTransactionRef.id,
            rewardedAt: settlementTime,
            updatedAt: serverTimestamp(),
          });

          transaction.set(rewardTransactionRef, {
            userId: referralData?.referrerUserId,
            type: "referral_bonus",
            amount: REFERRAL_REWARD_AMOUNT,
            balanceBefore: referrerData.balance,
            balanceAfter: referrerNextBalance,
            referenceType: "referral",
            referenceId: referralRef.id,
            note: `Referral bonus credited after first settled bet by ${prediction.userDisplayName}`,
            createdAt: serverTimestamp(),
          });
        } else if (shouldFinalizeReferral) {
          transaction.update(referralRef, {
            status: "rewarded",
            rewardTransactionId: null,
            rewardedAt: settlementTime,
            updatedAt: serverTimestamp(),
          });
        }

        continue;
      }

      if (prediction.selectedTeam === winner) {
        const hasPendingDoublePointsBoost = !!userData.hasPendingDoublePointsNextWin;
        const hasPendingDoubleCoinBoost = !!userData.hasPendingDoubleCoinNextMatchWin;
        const hasAppliedDoublePointsReward =
          prediction.appliedRewardType === "points_x2_next_win";
        const hasAppliedDoubleCoinReward =
          prediction.appliedRewardType === "coins_x2_next_match_win";
        const hasDoublePointsBoost = hasPendingDoublePointsBoost || hasAppliedDoublePointsReward;
        const hasDoubleCoinBoost = hasPendingDoubleCoinBoost || hasAppliedDoubleCoinReward;
        const payoutMultiplier = hasDoubleCoinBoost ? 2 : 1;
        const pointsMultiplier = hasDoublePointsBoost ? 2 : 1;
        const payout = prediction.amount * 2 * payoutMultiplier;
        const baseWinnerPoints = latestMatch.winnerPoints ?? DEFAULT_WIN_POINTS;
        const pointsAwarded = baseWinnerPoints * pointsMultiplier;
        const wheelPointsBonus = hasDoublePointsBoost ? baseWinnerPoints : 0;
        const wheelCoinsBonus = hasDoubleCoinBoost ? prediction.amount * 2 : 0;
        const nextBalance = userData.balance + payout;
        const nextWheelPointsEarned = (userData.wheelPointsEarned ?? 0) + wheelPointsBonus;
        const nextWheelCoinsEarned = (userData.wheelCoinsEarned ?? 0) + wheelCoinsBonus;

        transaction.update(userRef, {
          balance: nextBalance,
          points: userData.points + pointsAwarded,
          wins: userData.wins + 1,
          wheelPointsEarned: nextWheelPointsEarned,
          wheelCoinsEarned: nextWheelCoinsEarned,
          hasPendingDoublePointsNextWin: hasPendingDoublePointsBoost ? false : userData.hasPendingDoublePointsNextWin ?? false,
          hasPendingDoubleCoinNextMatchWin: hasPendingDoubleCoinBoost ? false : userData.hasPendingDoubleCoinNextMatchWin ?? false,
          updatedAt: serverTimestamp(),
        });

        transaction.update(predictionRef, {
          status: "won",
          payout,
          profit: prediction.amount,
          settledAt: settlementTime,
          updatedAt: serverTimestamp(),
        });

        transaction.set(transactionRef, {
          userId: prediction.userId,
          type: "match_win_payout",
          amount: payout,
          balanceBefore: userData.balance,
          balanceAfter: nextBalance,
          referenceType: "match",
          referenceId: matchId,
          note: `Winning payout for match ${latestMatch.matchNumber}`,
          createdAt: serverTimestamp(),
        });

        if (shouldRewardReferral) {
          const referrerNextBalance = referrerData.balance + REFERRAL_REWARD_AMOUNT;
          const rewardTransactionRef = doc(collection(db, "transactions"));

          transaction.update(referrerRef, {
            balance: referrerNextBalance,
            updatedAt: serverTimestamp(),
          });

          transaction.update(referralRef, {
            status: "rewarded",
            rewardTransactionId: rewardTransactionRef.id,
            rewardedAt: settlementTime,
            updatedAt: serverTimestamp(),
          });

          transaction.set(rewardTransactionRef, {
            userId: referralData?.referrerUserId,
            type: "referral_bonus",
            amount: REFERRAL_REWARD_AMOUNT,
            balanceBefore: referrerData.balance,
            balanceAfter: referrerNextBalance,
            referenceType: "referral",
            referenceId: referralRef.id,
            note: `Referral bonus credited after first settled bet by ${prediction.userDisplayName}`,
            createdAt: serverTimestamp(),
          });
        } else if (shouldFinalizeReferral) {
          transaction.update(referralRef, {
            status: "rewarded",
            rewardTransactionId: null,
            rewardedAt: settlementTime,
            updatedAt: serverTimestamp(),
          });
        }

        continue;
      }

      const insuranceRefund =
        prediction.appliedRewardType === "bet_insurance" && prediction.appliedRewardCapAmount
          ? Math.min(prediction.amount, prediction.appliedRewardCapAmount)
          : 0;
      const insuranceBonusPoints = insuranceRefund > 0 ? 1 : 0;
      const walletDebitAmount = prediction.walletDebitAmount ?? prediction.amount;
      const nextBalance = userData.balance + insuranceRefund;
      const hasPendingDoublePointsBoost = !!userData.hasPendingDoublePointsNextWin;
      const hasPendingDoubleCoinBoost = !!userData.hasPendingDoubleCoinNextMatchWin;

      transaction.update(userRef, {
        balance: nextBalance,
        losses: userData.losses + 1,
        points: userData.points + insuranceBonusPoints,
        hasPendingDoublePointsNextWin: hasPendingDoublePointsBoost ? false : userData.hasPendingDoublePointsNextWin ?? false,
        hasPendingDoubleCoinNextMatchWin: hasPendingDoubleCoinBoost ? false : userData.hasPendingDoubleCoinNextMatchWin ?? false,
        updatedAt: serverTimestamp(),
      });

      transaction.update(predictionRef, {
        status: "lost",
        payout: insuranceRefund,
        profit: insuranceRefund - walletDebitAmount,
        settledAt: settlementTime,
        updatedAt: serverTimestamp(),
      });

      if (insuranceRefund > 0) {
        transaction.set(transactionRef, {
          userId: prediction.userId,
          type: "bet_insurance_refund",
          amount: insuranceRefund,
          balanceBefore: userData.balance,
          balanceAfter: nextBalance,
          referenceType: "match",
          referenceId: matchId,
          note: `Bet Insurance refund for match ${latestMatch.matchNumber}`,
          createdAt: serverTimestamp(),
        });

        transaction.set(doc(collection(db, "transactions")), {
          userId: prediction.userId,
          type: "bet_insurance_bonus_point",
          amount: insuranceBonusPoints,
          balanceBefore: nextBalance,
          balanceAfter: nextBalance,
          referenceType: "match",
          referenceId: matchId,
          note: `Bet Insurance bonus: +${insuranceBonusPoints} point for match ${latestMatch.matchNumber}`,
          createdAt: serverTimestamp(),
        });
      }

      if (shouldRewardReferral) {
        const referrerNextBalance = referrerData.balance + REFERRAL_REWARD_AMOUNT;
        const rewardTransactionRef = doc(collection(db, "transactions"));

        transaction.update(referrerRef, {
          balance: referrerNextBalance,
          updatedAt: serverTimestamp(),
        });

        transaction.update(referralRef, {
          status: "rewarded",
          rewardTransactionId: rewardTransactionRef.id,
          rewardedAt: settlementTime,
          updatedAt: serverTimestamp(),
        });

        transaction.set(rewardTransactionRef, {
          userId: referralData?.referrerUserId,
          type: "referral_bonus",
          amount: REFERRAL_REWARD_AMOUNT,
          balanceBefore: referrerData.balance,
          balanceAfter: referrerNextBalance,
          referenceType: "referral",
          referenceId: referralRef.id,
          note: `Referral bonus credited after first settled bet by ${prediction.userDisplayName}`,
          createdAt: serverTimestamp(),
        });
      } else if (shouldFinalizeReferral) {
        transaction.update(referralRef, {
          status: "rewarded",
          rewardTransactionId: null,
          rewardedAt: settlementTime,
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(matchRef, {
      winner,
      status: winner === "no_result" ? "no_result" : "settled",
      settledAt: settlementTime,
      settledBy: adminUserId,
      updatedAt: serverTimestamp(),
    });

    transaction.update(snapshotRef, {
      isSettlementApplied: true,
      settlementAppliedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  if (winner !== "no_result") {
    await applyInactivityPenaltyForMatch(matchId, match.matchNumber);
  }
}

async function applyInactivityPenaltyForMatch(matchId: string, matchNumber: number) {
  const [usersSnapshot, predictionsSnapshot, matchesSnapshot, currentMatchPredictionsSnapshot] =
    await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "predictions")),
      getDocs(collection(db, "matches")),
      getDocs(query(collection(db, "predictions"), where("matchId", "==", matchId))),
    ]);
  const usersWhoPlayedThisMatch = new Set(
    currentMatchPredictionsSnapshot.docs
      .map((entry) => (entry.data() as Omit<PredictionRecord, "id">).userId)
      .filter((userId): userId is string => !!userId)
  );
  const completedMatchIdSet = new Set(
    matchesSnapshot.docs
      .filter((entry) => {
        const status = (entry.data() as { status?: string }).status;
        return status === "completed" || status === "settled" || status === "no_result";
      })
      .map((entry) => entry.id)
  );
  const totalCompletedMatches = completedMatchIdSet.size;

  if (totalCompletedMatches <= 0) {
    return;
  }

  const playedCompletedMatchesByUser = new Map<string, Set<string>>();

  for (const entry of predictionsSnapshot.docs) {
    const data = entry.data() as Omit<PredictionRecord, "id">;
    if (!data.userId || !data.matchId || !completedMatchIdSet.has(data.matchId)) {
      continue;
    }

    const playedMatches = playedCompletedMatchesByUser.get(data.userId) ?? new Set<string>();
    playedMatches.add(data.matchId);
    playedCompletedMatchesByUser.set(data.userId, playedMatches);
  }

  const batch = writeBatch(db);

  for (const userSnapshot of usersSnapshot.docs) {
    const userId = userSnapshot.id;

    if (usersWhoPlayedThisMatch.has(userId)) {
      continue;
    }

    const userData = userSnapshot.data() as UserProfile;
    if ((userData.totalPredictions ?? 0) <= 0) {
      continue;
    }

    const playedCompletedMatches = playedCompletedMatchesByUser.get(userId)?.size ?? 0;
    const participationRate = playedCompletedMatches / totalCompletedMatches;

    if (participationRate < LEADERBOARD_PARTICIPATION_THRESHOLD) {
      continue;
    }

    batch.update(doc(db, "users", userId), {
      points: userData.points - INACTIVITY_PENALTY_POINTS,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(collection(db, "transactions")), {
      userId,
      type: "match_inactivity_penalty",
      amount: -INACTIVITY_PENALTY_POINTS,
      balanceBefore: userData.balance,
      balanceAfter: userData.balance,
      referenceType: "match",
      referenceId: matchId,
      note: `Inactivity penalty: -${INACTIVITY_PENALTY_POINTS} point for match ${matchNumber}`,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export function subscribeToSettlementBackupAvailability(
  callback: (availability: SettlementBackupAvailability) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, "settlement_snapshots"),
    (snapshot) => {
      const nextAvailability = snapshot.docs
        .map((entry) => ({
          id: entry.id,
          ...(entry.data() as SettlementSnapshotMeta),
        }))
        .sort((left, right) => getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt))
        .reduce<SettlementBackupAvailability>((accumulator, entry) => {
          if (accumulator[entry.matchId]) {
            return accumulator;
          }

          accumulator[entry.matchId] = {
            snapshotId: entry.id,
            hasBackup: entry.isSettlementApplied && !entry.isRestored,
            createdAt: entry.createdAt,
          };

          return accumulator;
        }, {});

      callback(nextAvailability);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function revertMatchSettlement(matchId: string, adminUserId: string) {
  const snapshotQuery = await getDocs(
    query(collection(db, "settlement_snapshots"), where("matchId", "==", matchId))
  );
  const latestSnapshot = snapshotQuery.docs
    .map((entry) => ({
      id: entry.id,
      ...(entry.data() as SettlementSnapshotMeta),
    }))
    .filter((entry) => entry.isSettlementApplied && !entry.isRestored)
    .sort((left, right) => getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt))[0];

  if (!latestSnapshot) {
    throw new Error("No settlement backup is available for this match.");
  }

  const snapshotId = latestSnapshot.id;
  const [userSnapshots, predictionSnapshots, referralSnapshots, settlementTransactions] =
    await Promise.all([
      getDocs(collection(db, "settlement_snapshots", snapshotId, "users")),
      getDocs(collection(db, "settlement_snapshots", snapshotId, "predictions")),
      getDocs(collection(db, "settlement_snapshots", snapshotId, "referrals")),
      getDocs(
        query(
          collection(db, "transactions"),
          where("referenceType", "==", "match"),
          where("referenceId", "==", matchId)
        )
      ),
    ]);

  const rewardTransactionIds = referralSnapshots.docs
    .map((entry) => entry.data().rewardTransactionId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const batch = writeBatch(db);

  for (const userSnapshot of userSnapshots.docs) {
    const data = userSnapshot.data() as UserProfile;
    batch.update(doc(db, "users", userSnapshot.id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  for (const predictionSnapshot of predictionSnapshots.docs) {
    const data = predictionSnapshot.data() as Omit<PredictionRecord, "id">;
    batch.update(doc(db, "predictions", predictionSnapshot.id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  for (const referralSnapshot of referralSnapshots.docs) {
    const data = referralSnapshot.data() as Omit<ReferralRecord, "id">;
    batch.update(doc(db, "referrals", referralSnapshot.id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  for (const transactionSnapshot of settlementTransactions.docs) {
    const data = transactionSnapshot.data();
    if (SETTLEMENT_TRANSACTION_TYPES.has(String(data.type))) {
      batch.delete(doc(db, "transactions", transactionSnapshot.id));
    }
  }

  for (const rewardTransactionId of rewardTransactionIds) {
    batch.delete(doc(db, "transactions", rewardTransactionId));
  }

  batch.update(doc(db, "matches", matchId), {
    winner: latestSnapshot.winnerBeforeSettlement,
    status: latestSnapshot.statusBeforeSettlement,
    settledAt: latestSnapshot.settledAtBeforeSettlement,
    settledBy: latestSnapshot.settledByBeforeSettlement,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, "settlement_snapshots", snapshotId), {
    isRestored: true,
    restoredAt: serverTimestamp(),
    restoredBy: adminUserId,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export function formatMatchDate(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(dateString));
}
