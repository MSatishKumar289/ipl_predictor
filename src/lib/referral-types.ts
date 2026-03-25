export type ReferralStatus =
  | "pending"
  | "signed_up"
  | "first_bet_pending_settlement"
  | "rewarded";

export type ReferralRecord = {
  id: string;
  referrerUserId: string;
  referrerDisplayName: string;
  referredPhoneNumber: string;
  referredName?: string | null;
  referredUserId?: string | null;
  status: ReferralStatus;
  rewardAmount: number;
  firstPredictionId?: string | null;
  firstMatchId?: string | null;
  rewardTransactionId?: string | null;
  rewardedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
