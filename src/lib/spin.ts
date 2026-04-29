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
  WeeklySpinCampaignRecord,
  WeeklySpinCampaignStatus,
  WeeklySpinAudience,
  WeeklySpinConfig,
  UserRewardRecord,
  UserRewardType,
  WeeklySpinResultRecord,
  WeeklySpinSegmentConfig,
  WeeklySpinStatus,
} from "./spin-types";

const INDIA_OFFSET_MINUTES = 330;
const WEEKLY_SPIN_PARTICIPATION_THRESHOLD = 0.35;
const REWARD_EXPIRY_DAYS = 4;
const REWARD_EXPIRY_MS = REWARD_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const WEEKLY_SPIN_CONFIG_DOC = doc(db, "app_settings", "weekly_spin");
const WEEKLY_SPIN_CAMPAIGNS_COLLECTION = collection(db, "weekly_spin_campaigns");

export const SPECIAL_REWARD_CAP_AMOUNT = 8000;
export const DEFAULT_WEEKLY_SPIN_AUDIENCE: WeeklySpinAudience = "all_active_users";

export const WEEKLY_SPIN_SEGMENTS: WeeklySpinSegmentConfig[] = [
  { id: "coins_5000", label: "5000 Coins", kind: "coins", value: 5000, capAmount: null, weight: 34 },
  { id: "coins_10000", label: "10000 Coins", kind: "coins", value: 10000, capAmount: null, weight: 24 },
  {
    id: "points_x2_next_win",
    label: "Points x2 on next win",
    kind: "points_x2_next_win",
    value: null,
    capAmount: null,
    weight: 19,
  },
  { id: "coins_30000", label: "30000 Coins", kind: "coins", value: 30000, capAmount: null, weight: 24 },
  { id: "coins_1000", label: "1000 Coins", kind: "coins", value: 1000, capAmount: null, weight: 48 },
  { id: "points_2", label: "2 Points", kind: "points", value: 2, capAmount: null, weight: 12 },
  { id: "spin_again", label: "Spin Again", kind: "spin_again", value: null, capAmount: null, weight: 10 },
  { id: "points_5", label: "5 Points", kind: "points", value: 5, capAmount: null, weight: 7 },
  {
    id: "ticket_a",
    label: "Free Bet Ticket",
    kind: "free_bet_ticket",
    value: null,
    capAmount: null,
    weight: 13,
  },
  {
    id: "insurance",
    label: "Bet Insurance",
    kind: "bet_insurance",
    value: null,
    capAmount: SPECIAL_REWARD_CAP_AMOUNT,
    weight: 19,
  },
  {
    id: "coins_x2_next_match_win",
    label: "Coins x2 on next match win",
    kind: "coins_x2_next_match_win",
    value: null,
    capAmount: null,
    weight: 24,
  },
  {
    id: "ticket_b",
    label: "Free Bet Ticket",
    kind: "free_bet_ticket",
    value: null,
    capAmount: null,
    weight: 16,
  },
];

function normalizeWeeklySpinConfig(
  snapshot: Partial<WeeklySpinConfig> | null | undefined
): WeeklySpinConfig {
  const audience = snapshot?.audience;
  const activeCampaignId =
    typeof snapshot?.activeCampaignId === "string" ? snapshot.activeCampaignId : null;
  const activeCampaignNumber =
    typeof snapshot?.activeCampaignNumber === "number" ? snapshot.activeCampaignNumber : null;
  const activeCampaignStartAt =
    typeof snapshot?.activeCampaignStartAt === "string" ? snapshot.activeCampaignStartAt : null;
  const activeCampaignEndAt =
    typeof snapshot?.activeCampaignEndAt === "string" ? snapshot.activeCampaignEndAt : null;

  if (
    audience === "disabled" ||
    audience === "all_active_users" ||
    audience === "eligible_users_only"
  ) {
    return {
      audience,
      activeCampaignId,
      activeCampaignNumber,
      activeCampaignStartAt,
      activeCampaignEndAt,
      updatedAt: snapshot?.updatedAt ?? null,
      updatedBy: snapshot?.updatedBy ?? null,
    };
  }

  return {
    audience: DEFAULT_WEEKLY_SPIN_AUDIENCE,
    activeCampaignId,
    activeCampaignNumber,
    activeCampaignStartAt,
    activeCampaignEndAt,
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

export function formatSpinRewardLabel(type: UserRewardType, capAmount: number | null) {
  if (type === "free_bet_ticket") {
    return "Free Bet Ticket";
  }
  if (type === "points_x2_next_win") {
    return "2x Points on next win";
  }
  if (type === "coins_x2_next_match_win") {
    return "2x Coins on next match win";
  }

  const resolvedCapAmount = capAmount ?? SPECIAL_REWARD_CAP_AMOUNT;
  return `Bet Insurance (${resolvedCapAmount.toLocaleString("en-IN")} cap)`;
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

function pickWeightedSegment(
  segments: WeeklySpinSegmentConfig[] = WEEKLY_SPIN_SEGMENTS
) {
  const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
  let cursor = Math.random() * totalWeight;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    cursor -= segment.weight;

    if (cursor <= 0) {
      return { segment, segmentIndex: index };
    }
  }

  return {
    segment: segments[segments.length - 1],
    segmentIndex: segments.length - 1,
  };
}

function normalizeWeeklySpinCampaignStatus(value: unknown): WeeklySpinCampaignStatus {
  return value === "scheduled" || value === "live" || value === "ended" || value === "cancelled"
    ? value
    : "scheduled";
}

function normalizeWeeklySpinCampaign(snapshot: {
  id: string;
  data: Omit<WeeklySpinCampaignRecord, "id">;
}): WeeklySpinCampaignRecord {
  return {
    id: snapshot.id,
    campaignNumber: Number(snapshot.data.campaignNumber) || 0,
    startAt: snapshot.data.startAt,
    endAt: snapshot.data.endAt,
    status: normalizeWeeklySpinCampaignStatus(snapshot.data.status),
    createdBy: snapshot.data.createdBy,
    updatedBy: snapshot.data.updatedBy ?? null,
    createdAt: snapshot.data.createdAt,
    updatedAt: snapshot.data.updatedAt,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function resolveCampaignStatus(startAt: string, endAt: string, referenceIso = nowIso()) {
  if (referenceIso < startAt) {
    return "scheduled" as const;
  }

  if (referenceIso >= endAt) {
    return "ended" as const;
  }

  return "live" as const;
}

async function getCompletedMatchIds() {
  const snapshot = await getDocs(
    query(collection(db, "matches"), where("status", "in", ["completed", "settled", "no_result"]))
  );

  return snapshot.docs.map((entry) => entry.id);
}

export async function getWeeklySpinStatus(userId: string): Promise<WeeklySpinStatus> {
  const fallbackCycleId = getWeeklySpinCycleId();
  const [configSnapshot, completedMatchIds, predictionSnapshot, campaignsSnapshot] = await Promise.all([
    getDoc(WEEKLY_SPIN_CONFIG_DOC),
    getCompletedMatchIds(),
    getDocs(query(collection(db, "predictions"), where("userId", "==", userId))),
    getDocs(query(WEEKLY_SPIN_CAMPAIGNS_COLLECTION, orderBy("campaignNumber", "desc"), limit(100))),
  ]);
  const config = normalizeWeeklySpinConfig(
    configSnapshot.exists() ? (configSnapshot.data() as Partial<WeeklySpinConfig>) : null
  );
  const campaigns = campaignsSnapshot.docs
    .map((entry) =>
      normalizeWeeklySpinCampaign({
        id: entry.id,
        data: entry.data() as Omit<WeeklySpinCampaignRecord, "id">,
      })
    )
    .filter((entry) => entry.status !== "cancelled");
  const referenceIso = nowIso();
  const activeCampaignByTime =
    campaigns.find((entry) => entry.startAt <= referenceIso && referenceIso < entry.endAt) ?? null;
  const activeCampaign =
    activeCampaignByTime && config.activeCampaignId === activeCampaignByTime.id
      ? activeCampaignByTime
      : null;
  const cycleId = activeCampaign ? `campaign_${activeCampaign.campaignNumber}` : fallbackCycleId;
  const spinSnapshot = activeCampaign
    ? await getDoc(doc(db, "weekly_spin_results", `${cycleId}_${userId}`))
    : null;

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
  const result = spinSnapshot?.exists()
    ? normalizeSpinResult({
        id: spinSnapshot.id,
        data: spinSnapshot.data() as Omit<WeeklySpinResultRecord, "id">,
      })
    : null;

  return {
    cycleId,
    campaignId: activeCampaign?.id ?? null,
    campaignNumber: activeCampaign?.campaignNumber ?? null,
    audience: config.audience,
    eligible:
      !!activeCampaign &&
      !result &&
      isEligibleForAudience(config.audience, playedAnyMatch, totalCompletedMatches, participationRate),
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

export async function createWeeklySpinCampaign({
  startAt,
  endAt,
  createdBy,
}: {
  startAt: string;
  endAt: string;
  createdBy: string;
}) {
  if (!startAt || !endAt) {
    throw new Error("Start and end date/time are required.");
  }

  if (endAt <= startAt) {
    throw new Error("End date/time must be after start date/time.");
  }

  const campaignSnapshots = await getDocs(
    query(WEEKLY_SPIN_CAMPAIGNS_COLLECTION, orderBy("campaignNumber", "desc"), limit(200))
  );
  const campaigns = campaignSnapshots.docs.map((entry) =>
    normalizeWeeklySpinCampaign({
      id: entry.id,
      data: entry.data() as Omit<WeeklySpinCampaignRecord, "id">,
    })
  );
  const overlappingCampaign = campaigns.find((entry) => {
    if (entry.status === "cancelled") {
      return false;
    }

    return startAt < entry.endAt && endAt > entry.startAt;
  });

  if (overlappingCampaign) {
    throw new Error("Campaign dates overlap with an existing campaign. Please change date/time.");
  }

  const nextCampaignNumber =
    campaigns.reduce((max, entry) => Math.max(max, entry.campaignNumber), 0) + 1;

  await runTransaction(db, async (transaction) => {
    const latestCampaignSnapshots = await getDocs(
      query(WEEKLY_SPIN_CAMPAIGNS_COLLECTION, orderBy("campaignNumber", "desc"), limit(200))
    );
    const latestCampaigns = latestCampaignSnapshots.docs.map((entry) =>
      normalizeWeeklySpinCampaign({
        id: entry.id,
        data: entry.data() as Omit<WeeklySpinCampaignRecord, "id">,
      })
    );
    const overlappingCampaign = latestCampaigns.find((entry) => {
      if (entry.status === "cancelled") {
        return false;
      }

      return startAt < entry.endAt && endAt > entry.startAt;
    });

    if (overlappingCampaign) {
      throw new Error("Campaign dates overlap with an existing campaign. Please change date/time.");
    }
    const latestMaxCampaignNumber = latestCampaigns.reduce(
      (max, entry) => Math.max(max, entry.campaignNumber),
      0
    );
    const resolvedCampaignNumber = Math.max(nextCampaignNumber, latestMaxCampaignNumber + 1);
    const campaignRef = doc(WEEKLY_SPIN_CAMPAIGNS_COLLECTION);

    transaction.set(campaignRef, {
      campaignNumber: resolvedCampaignNumber,
      startAt,
      endAt,
      status: "scheduled",
      createdBy,
      updatedBy: createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<WeeklySpinCampaignRecord, "id">);
  });
}

export async function publishWeeklySpinCampaign(campaignId: string, updatedBy: string) {
  const campaignRef = doc(db, "weekly_spin_campaigns", campaignId);
  await runTransaction(db, async (transaction) => {
    const campaignSnapshot = await transaction.get(campaignRef);
    if (!campaignSnapshot.exists()) {
      throw new Error("Campaign not found.");
    }

    const campaign = normalizeWeeklySpinCampaign({
      id: campaignSnapshot.id,
      data: campaignSnapshot.data() as Omit<WeeklySpinCampaignRecord, "id">,
    });

    transaction.set(
      WEEKLY_SPIN_CONFIG_DOC,
      {
        activeCampaignId: campaign.id,
        activeCampaignNumber: campaign.campaignNumber,
        activeCampaignStartAt: campaign.startAt,
        activeCampaignEndAt: campaign.endAt,
        updatedAt: serverTimestamp(),
        updatedBy,
      } satisfies Partial<WeeklySpinConfig>,
      { merge: true }
    );
  });
}

export async function unpublishWeeklySpinCampaign(updatedBy: string) {
  await runTransaction(db, async (transaction) => {
    transaction.set(
      WEEKLY_SPIN_CONFIG_DOC,
      {
        activeCampaignId: null,
        activeCampaignNumber: null,
        activeCampaignStartAt: null,
        activeCampaignEndAt: null,
        updatedAt: serverTimestamp(),
        updatedBy,
      } satisfies Partial<WeeklySpinConfig>,
      { merge: true }
    );
  });
}

export async function deleteWeeklySpinCampaign(campaignId: string, updatedBy: string) {
  const campaignRef = doc(db, "weekly_spin_campaigns", campaignId);
  await runTransaction(db, async (transaction) => {
    const [campaignSnapshot, configSnapshot] = await Promise.all([
      transaction.get(campaignRef),
      transaction.get(WEEKLY_SPIN_CONFIG_DOC),
    ]);
    if (!campaignSnapshot.exists()) {
      throw new Error("Campaign not found.");
    }

    const config = normalizeWeeklySpinConfig(
      configSnapshot.exists() ? (configSnapshot.data() as Partial<WeeklySpinConfig>) : null
    );
    transaction.delete(campaignRef);

    if (config.activeCampaignId === campaignId) {
      transaction.set(
        WEEKLY_SPIN_CONFIG_DOC,
        {
          activeCampaignId: null,
          activeCampaignNumber: null,
          activeCampaignStartAt: null,
          activeCampaignEndAt: null,
          updatedAt: serverTimestamp(),
          updatedBy,
        } satisfies Partial<WeeklySpinConfig>,
        { merge: true }
      );
    }
  });
}

export async function getNextScheduledWeeklySpinCampaign(
  referenceDate = new Date()
): Promise<WeeklySpinCampaignRecord | null> {
  const referenceIso = referenceDate.toISOString();
  const snapshot = await getDocs(
    query(WEEKLY_SPIN_CAMPAIGNS_COLLECTION, orderBy("campaignNumber", "desc"), limit(100))
  );

  const upcoming = snapshot.docs
    .map((entry) =>
      normalizeWeeklySpinCampaign({
        id: entry.id,
        data: entry.data() as Omit<WeeklySpinCampaignRecord, "id">,
      })
    )
    .filter((entry) => entry.status !== "cancelled" && entry.startAt > referenceIso)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  if (!upcoming.length) {
    return null;
  }

  const nextCampaign = upcoming[0];
  return {
    ...nextCampaign,
    status: resolveCampaignStatus(nextCampaign.startAt, nextCampaign.endAt, referenceIso),
  };
}

export function subscribeToWeeklySpinCampaigns(
  callback: (campaigns: WeeklySpinCampaignRecord[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(WEEKLY_SPIN_CAMPAIGNS_COLLECTION, orderBy("campaignNumber", "desc"), limit(100)),
    (snapshot) => {
      const referenceIso = nowIso();
      callback(
        snapshot.docs.map((entry) => {
          const normalized = normalizeWeeklySpinCampaign({
            id: entry.id,
            data: entry.data() as Omit<WeeklySpinCampaignRecord, "id">,
          });

          if (normalized.status === "cancelled") {
            return normalized;
          }

          return {
            ...normalized,
            status: resolveCampaignStatus(normalized.startAt, normalized.endAt, referenceIso),
          };
        })
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function spinWeeklyWheel(userId: string) {
  const status = await getWeeklySpinStatus(userId);

  if (!status.eligible) {
    throw new Error("You are not eligible for this week's spin.");
  }

  const cycleId = status.cycleId;
  const resultRef = doc(db, "weekly_spin_results", `${cycleId}_${userId}`);
  const userRef = doc(db, "users", userId);
  let resolvedSegment: WeeklySpinSegmentConfig | null = null;
  let resolvedSegmentIndex = -1;

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
      hasReceivedSpinAgain?: boolean;
      hasPendingDoublePointsNextWin?: boolean;
      hasPendingDoubleCoinNextMatchWin?: boolean;
      wheelPointsEarned?: number;
      wheelCoinsEarned?: number;
    };
    const hasReceivedSpinAgain = !!userData.hasReceivedSpinAgain;
    const eligibleSegments = WEEKLY_SPIN_SEGMENTS.filter(
      (entry) => entry.kind !== "spin_again" || !hasReceivedSpinAgain
    );

    if (!eligibleSegments.length) {
      throw new Error("No eligible weekly spin rewards configured.");
    }

    let { segment } = pickWeightedSegment(eligibleSegments);
    let segmentIndex = WEEKLY_SPIN_SEGMENTS.findIndex((entry) => entry.id === segment.id);

    if (segmentIndex < 0) {
      throw new Error("Spin segment configuration is invalid.");
    }

    if (segment.kind === "spin_again") {
      const rerollSegments = WEEKLY_SPIN_SEGMENTS.filter((entry) => entry.kind !== "spin_again");
      if (!rerollSegments.length) {
        throw new Error("Spin Again requires at least one non Spin Again segment.");
      }

      const reroll = pickWeightedSegment(rerollSegments);
      segment = reroll.segment;
      segmentIndex = WEEKLY_SPIN_SEGMENTS.findIndex((entry) => entry.id === segment.id);
      if (segmentIndex < 0) {
        throw new Error("Spin segment configuration is invalid.");
      }

      transaction.update(userRef, {
        hasReceivedSpinAgain: true,
        updatedAt: serverTimestamp(),
      });
    }

    resolvedSegment = segment;
    resolvedSegmentIndex = segmentIndex;
    const rewardRef =
      segment.kind === "free_bet_ticket" ||
      segment.kind === "bet_insurance" ||
      segment.kind === "points_x2_next_win" ||
      segment.kind === "coins_x2_next_match_win"
        ? doc(collection(db, "user_rewards"))
        : null;

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
      const nextWheelCoinsEarned = (userData.wheelCoinsEarned ?? 0) + segment.value;

      transaction.update(userRef, {
        balance: nextBalance,
        wheelCoinsEarned: nextWheelCoinsEarned,
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
      const nextWheelPointsEarned = (userData.wheelPointsEarned ?? 0) + segment.value;
      transaction.update(userRef, {
        points: userData.points + segment.value,
        wheelPointsEarned: nextWheelPointsEarned,
        updatedAt: serverTimestamp(),
      });

      return;
    }

    if (
      rewardRef &&
      (segment.kind === "free_bet_ticket" ||
        segment.kind === "bet_insurance" ||
        segment.kind === "points_x2_next_win" ||
        segment.kind === "coins_x2_next_match_win")
    ) {
      const expiresAt =
        segment.kind === "points_x2_next_win" || segment.kind === "coins_x2_next_match_win"
          ? new Date(Date.now() + REWARD_EXPIRY_MS).toISOString()
          : null;
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
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } satisfies Omit<UserRewardRecord, "id">);
      return;
    }
  });

  if (!resolvedSegment || resolvedSegmentIndex < 0) {
    throw new Error("Unable to resolve weekly spin reward.");
  }
  const finalSegment = resolvedSegment as WeeklySpinSegmentConfig;

  return {
    ...status,
    eligible: false,
    hasUsedSpin: true,
    result: {
      id: `${cycleId}_${userId}`,
      userId,
      cycleId,
      rewardId: finalSegment.id,
      rewardLabel: finalSegment.label,
      rewardKind: finalSegment.kind,
      rewardValue: finalSegment.value,
      rewardCapAmount: finalSegment.capAmount,
      segmentIndex: resolvedSegmentIndex,
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
      const now = Date.now();
      callback(
        snapshot.docs
          .map((entry) =>
            normalizeUserReward({
              id: entry.id,
              data: entry.data() as Omit<UserRewardRecord, "id">,
            })
          )
          .filter((reward) => {
            if (
              reward.type !== "points_x2_next_win" &&
              reward.type !== "coins_x2_next_match_win"
            ) {
              return true;
            }
            const expiresAtMs = getTimestampValue(reward.expiresAt);
            return expiresAtMs <= 0 || expiresAtMs > now;
          })
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

export async function hasUserPlayedAnyWeeklySpin(userId: string): Promise<boolean> {
  const snapshot = await getDocs(
    query(collection(db, "weekly_spin_results"), where("userId", "==", userId), limit(1))
  );
  return !snapshot.empty;
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
    return "Free Bet Ticket";
  }
  if (reward.type === "points_x2_next_win") {
    return "2x Points on next win";
  }
  if (reward.type === "coins_x2_next_match_win") {
    return "2x Coins on next match win";
  }

  const resolvedCapAmount = reward.capAmount ?? SPECIAL_REWARD_CAP_AMOUNT;
  return `Bet Insurance up to ${resolvedCapAmount.toLocaleString("en-IN")} coins`;
}
