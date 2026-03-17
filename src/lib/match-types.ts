export type MatchOutcome = "teamA" | "teamB" | "no_result" | null;

export type MatchStatus = "upcoming" | "locked" | "completed" | "settled" | "no_result";

export type MatchRecord = {
  id: string;
  matchNumber: number;
  teamAName: string;
  teamBName: string;
  teamAShort: string;
  teamBShort: string;
  startAt: string;
  lockAt: string;
  status: MatchStatus;
  winner: MatchOutcome;
  isEditableBeforeLock: boolean;
  createdBy: string;
  settledAt?: string | null;
  settledBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CreateMatchInput = {
  matchNumber: number;
  teamAName: string;
  teamBName: string;
  teamAShort: string;
  teamBShort: string;
  startAt: string;
  isEditableBeforeLock: boolean;
};
