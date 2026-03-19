import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { createDemoMatches } from "@/lib/demoMatches";
import { subscribeToMatches } from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";
import { subscribeToUserPredictions } from "@/lib/predictions";
import type { PredictionRecord } from "@/lib/prediction-types";
import { useAuth } from "@/providers/AuthProvider";

type BetFilter = "active" | "settled" | "all";

type EnrichedBet = PredictionRecord & {
  match: MatchRecord | null;
};

function getTimestampValue(value: unknown) {
  if (!value) {
    return 0;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (
    typeof value === "object" &&
    "seconds" in value &&
    typeof value.seconds === "number"
  ) {
    return value.seconds * 1000;
  }

  return 0;
}

const filters: { key: BetFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "settled", label: "Settled" },
  { key: "all", label: "All" },
];

const demoPredictions: PredictionRecord[] = [
  {
    id: "demo-pred-1",
    matchId: "demo-1",
    userId: "demo-user",
    userDisplayName: "Player",
    selectedTeam: "teamA",
    amount: 500,
    status: "pending",
    payout: 0,
    profit: 0,
  },
  {
    id: "demo-pred-2",
    matchId: "demo-3",
    userId: "demo-user",
    userDisplayName: "Player",
    selectedTeam: "teamB",
    amount: 300,
    status: "pending",
    payout: 0,
    profit: 0,
  },
  {
    id: "demo-pred-3",
    matchId: "demo-4",
    userId: "demo-user",
    userDisplayName: "Player",
    selectedTeam: "teamA",
    amount: 700,
    status: "won",
    payout: 1400,
    profit: 700,
    settledAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export default function MyBetsTab() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState<BetFilter>("active");
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(true);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMatches(
      (nextMatches) => {
        setMatches(nextMatches);
        setIsLoadingMatches(false);
      },
      (snapshotError) => {
        setError((current) => current ?? `Matches read failed: ${snapshotError.message}`);
        setIsLoadingMatches(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setPredictions([]);
      setIsLoadingPredictions(false);
      return;
    }

    const unsubscribe = subscribeToUserPredictions(
      user.uid,
      (nextPredictions) => {
        setPredictions(nextPredictions);
        setError(null);
        setIsLoadingPredictions(false);
      },
      (snapshotError) => {
        setError(`Bets read failed: ${snapshotError.message}`);
        setIsLoadingPredictions(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const displayMatches = matches.length ? matches : createDemoMatches();
  const displayPredictions = predictions.length ? predictions : demoPredictions;

  const bets = useMemo<EnrichedBet[]>(
    () =>
      displayPredictions
        .map((prediction) => ({
          ...prediction,
          match: displayMatches.find((match) => match.id === prediction.matchId) ?? null,
        }))
        .sort((left, right) => {
          const leftDate = getTimestampValue(left.settledAt ?? left.updatedAt ?? left.createdAt);
          const rightDate = getTimestampValue(
            right.settledAt ?? right.updatedAt ?? right.createdAt
          );
          return rightDate - leftDate;
        }),
    [displayMatches, displayPredictions]
  );

  const filteredBets = useMemo(() => {
    if (activeFilter === "all") {
      return bets;
    }

    if (activeFilter === "active") {
      return bets.filter((bet) => bet.status === "pending");
    }

    return bets.filter((bet) => bet.status !== "pending");
  }, [activeFilter, bets]);

  const totals = useMemo(
    () => ({
      active: bets.filter((bet) => bet.status === "pending").length,
      settled: bets.filter((bet) => bet.status !== "pending").length,
      profit: bets.reduce((sum, bet) => sum + bet.profit, 0),
    }),
    [bets]
  );
  const isDesktop = width >= 1024;

  if (isLoadingPredictions || isLoadingMatches) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#2463EB" />
          <Text style={styles.loadingText}>Loading your bets...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
          <View style={[styles.header, isDesktop && styles.headerDesktop]}>
            <Text style={[styles.eyebrow, isDesktop && styles.headerTextDesktop]}>
              Bet History
            </Text>
            <Text style={[styles.title, isDesktop && styles.headerTextDesktop]}>My Bets</Text>
            <Text style={[styles.subtitle, isDesktop && styles.headerTextDesktop]}>
              Track active picks, settled outcomes, and profit across matches.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!predictions.length ? (
            <View style={styles.demoBanner}>
              <Text style={styles.demoBannerText}>Showing demo bets for UI testing.</Text>
            </View>
          ) : null}

          <View style={styles.summaryRow}>
            <SummaryCard label="Active" value={String(totals.active)} />
            <SummaryCard label="Settled" value={String(totals.settled)} />
            <SummaryCard
              label="Profit"
              value={`Rs. ${totals.profit.toLocaleString("en-IN")}`}
              accent={totals.profit >= 0}
            />
          </View>

          <View style={styles.filterRow}>
            {filters.map((filter) => (
              <Pressable
                key={filter.key}
                style={[
                  styles.filterChip,
                  activeFilter === filter.key && styles.filterChipActive,
                ]}
                onPress={() => setActiveFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    activeFilter === filter.key && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listTitle}>
              {activeFilter === "active"
                ? "Open Bets"
                : activeFilter === "settled"
                  ? "Settled Bets"
                  : "All Bets"}
            </Text>

            {filteredBets.length ? (
              filteredBets.map((bet) => (
                <BetRow
                  key={bet.id}
                  bet={bet}
                  onOpen={() => {
                    if (bet.match) {
                      router.push({
                        pathname: "/match/[id]",
                        params: { id: bet.match.id },
                      });
                    }
                  }}
                />
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No bets in this section</Text>
                <Text style={styles.emptyText}>
                  Place a prediction from the Matches tab and it will show up here.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BetRow({ bet, onOpen }: { bet: EnrichedBet; onOpen: () => void }) {
  const matchLabel = bet.match
    ? `${bet.match.teamAShort} vs ${bet.match.teamBShort}`
    : "Unknown match";
  const teamLabel =
    bet.match == null
      ? "Unknown"
      : bet.selectedTeam === "teamA"
        ? bet.match.teamAShort
        : bet.match.teamBShort;

  return (
    <View style={styles.betRow}>
      <View style={styles.betTop}>
        <Text style={styles.betMatch}>{matchLabel}</Text>
        <StatusBadge status={bet.status} />
      </View>

      <Text style={styles.betSubline}>
        Picked {teamLabel} - Rs. {bet.amount.toLocaleString("en-IN")}
      </Text>

      <View style={styles.betMetaRow}>
        <Text style={styles.betMeta}>
          {bet.status === "pending"
            ? "Awaiting result"
            : `Payout Rs. ${bet.payout.toLocaleString("en-IN")}`}
        </Text>
        <Text
          style={[
            styles.betProfit,
            bet.profit > 0 && styles.betProfitPositive,
            bet.profit < 0 && styles.betProfitNegative,
          ]}
        >
          {bet.profit > 0 ? "+" : ""}
          {bet.profit.toLocaleString("en-IN")}
        </Text>
      </View>

      {bet.match ? (
        <Pressable style={styles.linkButton} onPress={onOpen}>
          <Text style={styles.linkButtonText}>Open Match</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, accent && styles.summaryCardAccent]}>
      <Text style={[styles.summaryLabel, accent && styles.summaryLabelAccent]}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: PredictionRecord["status"] }) {
  return (
    <View
      style={[
        styles.statusBadge,
        status === "pending" && styles.statusPending,
        status === "won" && styles.statusWon,
        status === "lost" && styles.statusLost,
        status === "refunded" && styles.statusRefunded,
      ]}
    >
      <Text style={styles.statusBadgeText}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  content: {
    padding: 24,
    paddingTop: 36,
    paddingBottom: 40,
    gap: 18,
  },
  contentDesktop: {
    paddingTop: 28,
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  pageShellDesktop: {
    maxWidth: 1040,
    gap: 24,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#091327",
  },
  loadingText: {
    color: "#D8E3FF",
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    gap: 8,
  },
  headerDesktop: {
    alignItems: "center",
  },
  headerTextDesktop: {
    textAlign: "center",
  },
  eyebrow: {
    color: "#3F7DFF",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  title: {
    color: "#F5F8FF",
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    color: "#8EA0C1",
    fontSize: 16,
    lineHeight: 24,
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#7A2A2A",
    backgroundColor: "#311515",
    padding: 16,
    gap: 8,
  },
  errorTitle: {
    color: "#FFD7D7",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#F0B3B3",
    fontSize: 14,
    lineHeight: 20,
  },
  demoBanner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2C4C8F",
    backgroundColor: "#102347",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  demoBannerText: {
    color: "#A8C4FF",
    fontSize: 14,
    fontWeight: "600",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 16,
    gap: 8,
  },
  summaryCardAccent: {
    borderColor: "#2A7D56",
  },
  summaryLabel: {
    color: "#9FB0CF",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryLabelAccent: {
    color: "#66DDA1",
  },
  summaryValue: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "800",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#294063",
    backgroundColor: "#101C34",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChipActive: {
    borderColor: "#2463EB",
    backgroundColor: "#14316A",
  },
  filterChipText: {
    color: "#A5B3CF",
    fontSize: 14,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: "#F7FAFF",
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 18,
    gap: 14,
  },
  listTitle: {
    color: "#F7FAFF",
    fontSize: 21,
    fontWeight: "700",
  },
  betRow: {
    borderRadius: 18,
    backgroundColor: "#0E1B36",
    padding: 16,
    gap: 10,
  },
  betTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  betMatch: {
    flex: 1,
    color: "#F7FAFF",
    fontSize: 17,
    fontWeight: "800",
  },
  betSubline: {
    color: "#9FB0CF",
    fontSize: 15,
  },
  betMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  betMeta: {
    color: "#8EA0C1",
    fontSize: 14,
    fontWeight: "600",
  },
  betProfit: {
    color: "#D7E1F5",
    fontSize: 16,
    fontWeight: "800",
  },
  betProfitPositive: {
    color: "#4AE39A",
  },
  betProfitNegative: {
    color: "#F38B8B",
  },
  linkButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#14316A",
  },
  linkButtonText: {
    color: "#A8C4FF",
    fontSize: 13,
    fontWeight: "800",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPending: {
    backgroundColor: "#17345E",
  },
  statusWon: {
    backgroundColor: "#143323",
  },
  statusLost: {
    backgroundColor: "#3A1C1C",
  },
  statusRefunded: {
    backgroundColor: "#3A3346",
  },
  statusBadgeText: {
    color: "#F7FAFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  emptyCard: {
    borderRadius: 18,
    backgroundColor: "#0E1B36",
    padding: 18,
    gap: 8,
  },
  emptyTitle: {
    color: "#F7FAFF",
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: "#9FB0CF",
    fontSize: 15,
    lineHeight: 22,
  },
});
