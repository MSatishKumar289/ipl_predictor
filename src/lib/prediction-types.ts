export type PredictionSelection = "teamA" | "teamB";

export type PredictionStatus = "pending" | "won" | "lost" | "refunded";

export type PredictionRecord = {
  id: string;
  matchId: string;
  userId: string;
  userDisplayName: string;
  selectedTeam: PredictionSelection;
  amount: number;
  walletDebitAmount: number;
  appliedRewardId?: string | null;
  appliedRewardType?:
    | "free_bet_ticket"
    | "bet_insurance"
    | "points_x2_next_win"
    | "coins_x2_next_match_win"
    | null;
  appliedRewardLabel?: string | null;
  appliedRewardCapAmount?: number | null;
  status: PredictionStatus;
  payout: number;
  profit: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  settledAt?: string | null;
};
