export type WeeklySpinRewardKind =
  | "coins"
  | "points"
  | "free_bet_ticket"
  | "bet_insurance"
  | "points_x2_next_win"
  | "coins_x2_next_match_win"
  | "spin_again"
  | "miss";

export type WeeklySpinSegmentConfig = {
  id: string;
  label: string;
  kind: WeeklySpinRewardKind;
  value: number | null;
  capAmount: number | null;
  weight: number;
};

export type WeeklySpinResultRecord = {
  id: string;
  userId: string;
  cycleId: string;
  rewardId: string;
  rewardLabel: string;
  rewardKind: WeeklySpinRewardKind;
  rewardValue: number | null;
  rewardCapAmount: number | null;
  segmentIndex: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type WeeklySpinAudience = "disabled" | "all_active_users" | "eligible_users_only";

export type WeeklySpinConfig = {
  audience: WeeklySpinAudience;
  activeCampaignId?: string | null;
  activeCampaignNumber?: number | null;
  activeCampaignStartAt?: string | null;
  activeCampaignEndAt?: string | null;
  updatedAt?: unknown;
  updatedBy?: string | null;
};

export type WeeklySpinCampaignStatus = "scheduled" | "live" | "ended" | "cancelled";

export type WeeklySpinCampaignRecord = {
  id: string;
  campaignNumber: number;
  startAt: string;
  endAt: string;
  status: WeeklySpinCampaignStatus;
  createdBy: string;
  updatedBy?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type UserRewardType = "free_bet_ticket" | "bet_insurance";

export type UserRewardStatus = "available" | "used";

export type UserRewardRecord = {
  id: string;
  userId: string;
  type: UserRewardType;
  label: string;
  status: UserRewardStatus;
  sourceType: "weekly_spin";
  sourceCycleId: string;
  sourceSpinResultId: string;
  capAmount: number | null;
  usedPredictionId?: string | null;
  usedMatchId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  usedAt?: unknown;
};

export type WeeklySpinStatus = {
  cycleId: string;
  campaignId: string | null;
  campaignNumber: number | null;
  audience: WeeklySpinAudience;
  eligible: boolean;
  hasUsedSpin: boolean;
  playedAnyMatch: boolean;
  totalCompletedMatches: number;
  playedCompletedMatches: number;
  participationRate: number;
  result: WeeklySpinResultRecord | null;
};
