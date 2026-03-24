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
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import type { UserProfile } from "./auth-types";
import type { CreateMatchInput, MatchOutcome, MatchRecord, MatchStatus } from "./match-types";
import type { PredictionRecord } from "./prediction-types";

const MATCH_LOCK_MINUTES = 5;
const BETTING_OPEN_HOURS = 24;
const WIN_POINTS = 3;

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

    for (const predictionSnapshot of predictionSnapshots.docs) {
      const prediction = predictionSnapshot.data() as Omit<PredictionRecord, "id">;
      const userRef = doc(db, "users", prediction.userId);
      const userSnapshot = await transaction.get(userRef);

      if (!userSnapshot.exists()) {
        continue;
      }

      const userData = userSnapshot.data() as UserProfile;
      const predictionRef = doc(db, "predictions", predictionSnapshot.id);
      const transactionRef = doc(collection(db, "transactions"));

      if (winner === "no_result") {
        const refundedBalance = userData.balance + prediction.amount;

        transaction.update(userRef, {
          balance: refundedBalance,
          updatedAt: serverTimestamp(),
        });

        transaction.update(predictionRef, {
          status: "refunded",
          payout: prediction.amount,
          profit: 0,
          settledAt: settlementTime,
          updatedAt: serverTimestamp(),
        });

        transaction.set(transactionRef, {
          userId: prediction.userId,
          type: "match_refund_no_result",
          amount: prediction.amount,
          balanceBefore: userData.balance,
          balanceAfter: refundedBalance,
          referenceType: "match",
          referenceId: matchId,
          note: `Refund for match ${latestMatch.matchNumber} due to no result`,
          createdAt: serverTimestamp(),
        });

        continue;
      }

      if (prediction.selectedTeam === winner) {
        const payout = prediction.amount * 2;
        const nextBalance = userData.balance + payout;

        transaction.update(userRef, {
          balance: nextBalance,
          points: userData.points + WIN_POINTS,
          wins: userData.wins + 1,
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

        continue;
      }

      transaction.update(userRef, {
        losses: userData.losses + 1,
        updatedAt: serverTimestamp(),
      });

      transaction.update(predictionRef, {
        status: "lost",
        payout: 0,
        profit: -prediction.amount,
        settledAt: settlementTime,
        updatedAt: serverTimestamp(),
      });
    }

    transaction.update(matchRef, {
      winner,
      status: winner === "no_result" ? "no_result" : "settled",
      settledAt: settlementTime,
      settledBy: adminUserId,
      updatedAt: serverTimestamp(),
    });
  });
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
