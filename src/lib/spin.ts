import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import type { PredictionRecord } from "./prediction-types";
import type {
  WeeklySpinAudience,
  WeeklySpinConfig,
  UserRewardRecord,
  UserRewardType,
  WeeklySpinResultRecord,
  WeeklySpinSegmentConfig,
  WeeklySpinStatus,
} from "./spin-types";

const INDIA_OFFSET_MINUTES = 330;
const WEEKLY_SPIN_PARTICIPATION_THRESHOLD = 0.3;
const WEEKLY_SPIN_CONFIG_DOC = doc(db, "app_settings", "weekly_spin");

export const SPECIAL_REWARD_CAP_AMOUNT = 8000;
export const DEFAULT_WEEKLY_SPIN_AUDIENCE: WeeklySpinAudience = "all_active_users";

export const WEEKLY_SPIN_SEGMENTS: WeeklySpinSegmentConfig[] = [
  { id: "coins_5000", label: "5000 Coins", kind: "coins", value: 5000, capAmount: null, weight: 18 },
  { id: "coins_10000", label: "10000 Coins", kind: "coins", value: 10000, capAmount: null, weight: 14 },
  { id: "miss_a", label: "Better luck next time", kind: "miss", value: null, capAmount: null, weight: 28 },
  { id: "coins_30000", label: "30000 Coins", kind: "coins", value: 30000, capAmount: null, weight: 1 },
  { id: "coins_1000", label: "1000 Coins", kind: "coins", value: 1000, capAmount: null, weight: 20 },
  { id: "points_2", label: "2 Points", kind: "points", value: 2, capAmount: null, weight: 2 },
  { id: "miss_b", label: "Better luck next time", kind: "miss", value: null, capAmount: null, weight: 24 },
  { id: "points_5", label: "5 Points", kind: "points", value: 5, capAmount: null, weight: 1 },
  {
    id: "ticket_a",
    label: "Free Bet Ticket",
    kind: "free_bet_ticket",
    value: null,
    capAmount: SPECIAL_REWARD_CAP_AMOUNT,
    weight: 5,
  },
  {
    id: "insurance",
    label: "Bet Insurance",
    kind: "bet_insurance",
    value: null,
    capAmount: SPECIAL_REWARD_CAP_AMOUNT,
    weight: 5,
  },
  { id: "miss_c", label: "Better luck next time", kind: "miss", value: null, capAmount: null, weight: 24 },
  {
    id: "ticket_b",
    label: "Free Bet Ticket",
    kind: "free_bet_ticket",
    value: null,
    capAmount: SPECIAL_REWARD_CAP_AMOUNT,
    weight: 6,
  },
];

function normalizeWeeklySpinConfig(
  snapshot: Partial<WeeklySpinConfig> | null | undefined
): WeeklySpinConfig {
  const audience = snapshot?.audience;

  if (
    audience === "disabled" ||
    audience === "all_active_users" ||
    audience === "eligible_users_only"
  ) {
    return {
      audience,
      updatedAt: snapshot?.updatedAt ?? null,
      updatedBy: snapshot?.updatedBy ?? null,
    };
  }

  return {
    audience: DEFAULT_WEEKLY_SPIN_AUDIENCE,
    updatedAt: snapshot?.updatedAt ?? null,
    updatedBy: snapshot?.updatedBy ?? null,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getIndiaShiftedDate(date: Date) {
  return new Date(date.getTime() + INDIA_OFFSET_MINUTES * 60 * 1000);
}

function getCycleStartDate(now = new Date()) {
  const indiaDate = getIndiaShiftedDate(now);
  const year = indiaDate.getUTCFullYear();
  const month = indiaDate.getUTCMonth();
  const day = indiaDate.getUTCDate();
  const weekday = indiaDate.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  return new Date(Date.UTC(year, month, day - daysSinceMonday));
}

export function getWeeklySpinCycleId(now = new Date()) {
  const cycleStart = getCycleStartDate(now);
  return `${cycleStart.getUTCFullYear()}-${pad(cycleStart.getUTCMonth() + 1)}-${pad(
    cycleStart.getUTCDate()
  )}`;
}

export function formatSpinRewardLabel(type: UserRewardType, capAmount: number) {
  if (type === "free_bet_ticket") {
    return `Free Bet Ticket (${capAmount.toLocaleString("en-IN")} cap)`;
  }

  return `Bet Insurance (${capAmount.toLocaleString("en-IN")} cap)`;
}

function normalizeSpinResult(snapshot: { id: string; data: Omit<WeeklySpinResultRecord, "id"> }) {
  return {
    id: snapshot.id,
    ...snapshot.data,
  } satisfies WeeklySpinResultRecord;
}

function normalizeUserReward(snapshot: { id: string; data: Omit<UserRewardRecord, "id"> }) {
  return {
    id: snapshot.id,
    ...snapshot.data,
  } satisfies UserRewardRecord;
}

function pickWeightedSegment() {
  const totalWeight = WEEKLY_SPIN_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);
  let cursor = Math.random() * totalWeight;

  for (let index = 0; index < WEEKLY_SPIN_SEGMENTS.length; index += 1) {
    const segment = WEEKLY_SPIN_SEGMENTS[index];
    cursor -= segment.weight;

    if (cursor <= 0) {
      return { segment, segmentIndex: index };
    }
  }

  return {
    segment: WEEKLY_SPIN_SEGMENTS[WEEKLY_SPIN_SEGMENTS.length - 1],
    segmentIndex: WEEKLY_SPIN_SEGMENTS.length - 1,
  };
}

async function getCompletedMatchIds() {
  const snapshot = await getDocs(
    query(collection(db, "matches"), where("status", "in", ["completed", "settled", "no_result"]))
  );

  return snapshot.docs.map((entry) => entry.id);
}

export async function getWeeklySpinStatus(userId: string): Promise<WeeklySpinStatus> {
  const cycleId = getWeeklySpinCycleId();
  const [configSnapshot, completedMatchIds, predictionSnapshot, spinSnapshot] = await Promise.all([
    getDoc(WEEKLY_SPIN_CONFIG_DOC),
    getCompletedMatchIds(),
    getDocs(query(collection(db, "predictions"), where("userId", "==", userId))),
    getDoc(doc(db, "weekly_spin_results", `${cycleId}_${userId}`)),
  ]);
  const config = normalizeWeeklySpinConfig(
    configSnapshot.exists() ? (configSnapshot.data() as Partial<WeeklySpinConfig>) : null
  );

  const completedMatchIdSet = new Set(completedMatchIds);
  const playedMatchIds = new Set(
    predictionSnapshot.docs
      .map((entry) => entry.data() as Omit<PredictionRecord, "id">)
      .map((entry) => entry.matchId)
  );
  const playedCompletedMatches = new Set(
    predictionSnapshot.docs
      .map((entry) => entry.data() as Omit<PredictionRecord, "id">)
      .map((entry) => entry.matchId)
      .filter((matchId) => completedMatchIdSet.has(matchId))
  ).size;
  const totalCompletedMatches = completedMatchIds.length;
  const participationRate =
    totalCompletedMatches > 0 ? playedCompletedMatches / totalCompletedMatches : 0;
  const playedAnyMatch = playedMatchIds.size > 0;
  const result = spinSnapshot.exists()
    ? normalizeSpinResult({
        id: spinSnapshot.id,
        data: spinSnapshot.data() as Omit<WeeklySpinResultRecord, "id">,
      })
    : null;

  return {
    cycleId,
    audience: config.audience,
    eligible: !result && isEligibleForAudience(config.audience, playedAnyMatch, totalCompletedMatches, participationRate),
    hasUsedSpin: !!result,
    playedAnyMatch,
    totalCompletedMatches,
    playedCompletedMatches,
    participationRate,
    result,
  };
}

function isEligibleForAudience(
  audience: WeeklySpinAudience,
  playedAnyMatch: boolean,
  totalCompletedMatches: number,
  participationRate: number
) {
  if (audience === "disabled") {
    return false;
  }

  if (audience === "all_active_users") {
    return true;
  }

  return (
    totalCompletedMatches > 0 &&
    participationRate >= WEEKLY_SPIN_PARTICIPATION_THRESHOLD
  );
}

export async function getWeeklySpinConfig() {
  const snapshot = await getDoc(WEEKLY_SPIN_CONFIG_DOC);
  return normalizeWeeklySpinConfig(
    snapshot.exists() ? (snapshot.data() as Partial<WeeklySpinConfig>) : null
  );
}

export function subscribeToWeeklySpinConfig(
  callback: (config: WeeklySpinConfig) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    WEEKLY_SPIN_CONFIG_DOC,
    (snapshot) => {
      callback(
        normalizeWeeklySpinConfig(
          snapshot.exists() ? (snapshot.data() as Partial<WeeklySpinConfig>) : null
        )
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function updateWeeklySpinConfig(audience: WeeklySpinAudience, updatedBy: string) {
  await runTransaction(db, async (transaction) => {
    transaction.set(
      WEEKLY_SPIN_CONFIG_DOC,
      {
        audience,
        updatedAt: serverTimestamp(),
        updatedBy,
      } satisfies WeeklySpinConfig,
      { merge: true }
    );
  });
}

export async function spinWeeklyWheel(userId: string) {
  const status = await getWeeklySpinStatus(userId);

  if (!status.eligible) {
    throw new Error("You are not eligible for this week's spin.");
  }

  const { segment, segmentIndex } = pickWeightedSegment();
  const cycleId = status.cycleId;
  const resultRef = doc(db, "weekly_spin_results", `${cycleId}_${userId}`);
  const userRef = doc(db, "users", userId);
  const rewardRef =
    segment.kind === "free_bet_ticket" || segment.kind === "bet_insurance"
      ? doc(collection(db, "user_rewards"))
      : null;

  await runTransaction(db, async (transaction) => {
    const [existingResultSnapshot, userSnapshot] = await Promise.all([
      transaction.get(resultRef),
      transaction.get(userRef),
    ]);

    if (existingResultSnapshot.exists()) {
      throw new Error("You have already used this week's spin.");
    }

    if (!userSnapshot.exists()) {
      throw new Error("User profile not found.");
    }

    const userData = userSnapshot.data() as {
      balance: number;
      points: number;
    };

    const resultPayload = {
      userId,
      cycleId,
      rewardId: segment.id,
      rewardLabel: segment.label,
      rewardKind: segment.kind,
      rewardValue: segment.value,
      rewardCapAmount: segment.capAmount,
      segmentIndex,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<WeeklySpinResultRecord, "id">;

    transaction.set(resultRef, resultPayload);

    if (segment.kind === "coins" && segment.value) {
      const nextBalance = userData.balance + segment.value;

      transaction.update(userRef, {
        balance: nextBalance,
        updatedAt: serverTimestamp(),
      });

      transaction.set(doc(collection(db, "transactions")), {
        userId,
        type: "weekly_spin_coin_reward",
        amount: segment.value,
        balanceBefore: userData.balance,
        balanceAfter: nextBalance,
        referenceType: "weekly_spin",
        referenceId: resultRef.id,
        note: `Weekly spin reward: ${segment.label}`,
        createdAt: serverTimestamp(),
      });

      return;
    }

    if (segment.kind === "points" && segment.value) {
      transaction.update(userRef, {
        points: userData.points + segment.value,
        updatedAt: serverTimestamp(),
      });

      return;
    }

    if (
      rewardRef &&
      (segment.kind === "free_bet_ticket" || segment.kind === "bet_insurance") &&
      segment.capAmount
    ) {
      transaction.set(rewardRef, {
        userId,
        type: segment.kind,
        label: segment.label,
        status: "available",
        sourceType: "weekly_spin",
        sourceCycleId: cycleId,
        sourceSpinResultId: resultRef.id,
        capAmount: segment.capAmount,
        usedPredictionId: null,
        usedMatchId: null,
        usedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } satisfies Omit<UserRewardRecord, "id">);
    }
  });

  return {
    ...status,
    eligible: false,
    hasUsedSpin: true,
    result: {
      id: `${cycleId}_${userId}`,
      userId,
      cycleId,
      rewardId: segment.id,
      rewardLabel: segment.label,
      rewardKind: segment.kind,
      rewardValue: segment.value,
      rewardCapAmount: segment.capAmount,
      segmentIndex,
    } satisfies WeeklySpinResultRecord,
  };
}

export function subscribeToAvailableRewards(
  userId: string,
  callback: (rewards: UserRewardRecord[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(
      collection(db, "user_rewards"),
      where("userId", "==", userId),
      where("status", "==", "available")
    ),
    (snapshot) => {
      callback(
        snapshot.docs.map((entry) =>
          normalizeUserReward({
            id: entry.id,
            data: entry.data() as Omit<UserRewardRecord, "id">,
          })
        )
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToAllRewards(
  userId: string,
  callback: (rewards: UserRewardRecord[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(collection(db, "user_rewards"), where("userId", "==", userId)),
    (snapshot) => {
      callback(
        snapshot.docs.map((entry) =>
          normalizeUserReward({
            id: entry.id,
            data: entry.data() as Omit<UserRewardRecord, "id">,
          })
        )
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToWeeklySpinHistory(
  userId: string,
  callback: (results: WeeklySpinResultRecord[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(collection(db, "weekly_spin_results"), where("userId", "==", userId)),
    (snapshot) => {
      callback(
        snapshot.docs
          .map((entry) =>
            normalizeSpinResult({
              id: entry.id,
              data: entry.data() as Omit<WeeklySpinResultRecord, "id">,
            })
          )
          .sort((left, right) => getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt))
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToRecentSpinResults(
  callback: (results: WeeklySpinResultRecord[]) => void,
  onError?: (error: Error) => void,
  maxResults = 50
) {
  return onSnapshot(
    query(collection(db, "weekly_spin_results"), orderBy("createdAt", "desc"), limit(maxResults)),
    (snapshot) => {
      callback(
        snapshot.docs.map((entry) =>
          normalizeSpinResult({
            id: entry.id,
            data: entry.data() as Omit<WeeklySpinResultRecord, "id">,
          })
        )
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function getTimestampValue(value: unknown) {
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

export function formatRewardUsageLabel(reward: UserRewardRecord) {
  if (reward.type === "free_bet_ticket") {
    return `Free Bet Ticket up to ${reward.capAmount.toLocaleString("en-IN")} coins`;
  }

  return `Bet Insurance up to ${reward.capAmount.toLocaleString("en-IN")} coins`;
}
