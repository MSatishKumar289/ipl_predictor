export type PredictionSelection = "teamA" | "teamB";

export type PredictionStatus = "pending" | "won" | "lost" | "refunded";

export type PredictionRecord = {
  id: string;
  matchId: string;
  userId: string;
  userDisplayName: string;
  selectedTeam: PredictionSelection;
  amount: number;
  status: PredictionStatus;
  payout: number;
  profit: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  settledAt?: string | null;
};
