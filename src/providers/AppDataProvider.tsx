import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { subscribeToMatches } from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";
import { subscribeToUserPredictions } from "@/lib/predictions";
import type { PredictionRecord } from "@/lib/prediction-types";
import { useAuth } from "@/providers/AuthProvider";

type AppDataContextValue = {
  matches: MatchRecord[];
  matchesById: Record<string, MatchRecord>;
  isMatchesLoading: boolean;
  matchesError: string | null;
  userPredictions: PredictionRecord[];
  userPredictionsByMatchId: Record<string, PredictionRecord>;
  isUserPredictionsLoading: boolean;
  userPredictionsError: string | null;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);
const MATCHES_CACHE_KEY = "cache:matches:v1";
const USER_PREDICTIONS_CACHE_KEY_PREFIX = "cache:user_predictions:v1:";

function logReadMetric(name: string, count: number, source: "cache" | "network") {
  if (!__DEV__) {
    return;
  }

  // Keeps phase-1 telemetry lightweight without introducing external tooling.
  console.info(`[read-metric] ${name} source=${source} count=${count}`);
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isMatchesLoading, setIsMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [userPredictions, setUserPredictions] = useState<PredictionRecord[]>([]);
  const [isUserPredictionsLoading, setIsUserPredictionsLoading] = useState(true);
  const [userPredictionsError, setUserPredictionsError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void AsyncStorage.getItem(MATCHES_CACHE_KEY)
      .then((raw) => {
        if (!isActive || !raw) {
          return;
        }

        const parsed = JSON.parse(raw) as MatchRecord[];
        if (!Array.isArray(parsed)) {
          return;
        }

        setMatches(parsed);
        setIsMatchesLoading(false);
        logReadMetric("matches", parsed.length, "cache");
      })
      .catch(() => {});

    const unsubscribe = subscribeToMatches(
      (nextMatches) => {
        if (!isActive) {
          return;
        }

        setMatches(nextMatches);
        setMatchesError(null);
        setIsMatchesLoading(false);
        logReadMetric("matches", nextMatches.length, "network");
        void AsyncStorage.setItem(MATCHES_CACHE_KEY, JSON.stringify(nextMatches)).catch(() => {});
      },
      (snapshotError) => {
        if (!isActive) {
          return;
        }

        setMatchesError(`Matches read failed: ${snapshotError.message}`);
        setIsMatchesLoading(false);
      }
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!user) {
      setUserPredictions([]);
      setUserPredictionsError(null);
      setIsUserPredictionsLoading(false);
      return () => {
        isActive = false;
      };
    }

    const cacheKey = `${USER_PREDICTIONS_CACHE_KEY_PREFIX}${user.uid}`;
    setIsUserPredictionsLoading(true);

    void AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!isActive || !raw) {
          return;
        }

        const parsed = JSON.parse(raw) as PredictionRecord[];
        if (!Array.isArray(parsed)) {
          return;
        }

        setUserPredictions(parsed);
        setIsUserPredictionsLoading(false);
        logReadMetric("user_predictions", parsed.length, "cache");
      })
      .catch(() => {});

    const unsubscribe = subscribeToUserPredictions(
      user.uid,
      (nextPredictions) => {
        if (!isActive) {
          return;
        }

        setUserPredictions(nextPredictions);
        setUserPredictionsError(null);
        setIsUserPredictionsLoading(false);
        logReadMetric("user_predictions", nextPredictions.length, "network");
        void AsyncStorage.setItem(cacheKey, JSON.stringify(nextPredictions)).catch(() => {});
      },
      (snapshotError) => {
        if (!isActive) {
          return;
        }

        setUserPredictionsError(`Predictions read failed: ${snapshotError.message}`);
        setIsUserPredictionsLoading(false);
      }
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [user]);

  const value = useMemo<AppDataContextValue>(() => {
    const matchesById = matches.reduce<Record<string, MatchRecord>>((accumulator, match) => {
      accumulator[match.id] = match;
      return accumulator;
    }, {});
    const userPredictionsByMatchId = userPredictions.reduce<Record<string, PredictionRecord>>(
      (accumulator, prediction) => {
        accumulator[prediction.matchId] = prediction;
        return accumulator;
      },
      {}
    );

    return {
      matches,
      matchesById,
      isMatchesLoading,
      matchesError,
      userPredictions,
      userPredictionsByMatchId,
      isUserPredictionsLoading,
      userPredictionsError,
    };
  }, [
    isMatchesLoading,
    isUserPredictionsLoading,
    matches,
    matchesError,
    userPredictions,
    userPredictionsError,
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }

  return context;
}
