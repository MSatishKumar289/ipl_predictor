import { useEffect, useMemo, useState, type ReactNode } from "react";
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

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { CoinAmount } from "@/components/CoinAmount";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import type { MatchRecord } from "@/lib/match-types";
import type { PredictionRecord } from "@/lib/prediction-types";
import { useAppData } from "@/providers/AppDataProvider";

type BetFilter = "active" | "settled" | "all";

type EnrichedBet = PredictionRecord & {
  match: MatchRecord | null;
};

const filters: { key: BetFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "settled", label: "Settled" },
  { key: "all", label: "All" },
];

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

export default function MyBetsTab() {
  const {
    matches,
    userPredictions: predictions,
    isMatchesLoading: isLoadingMatches,
    isUserPredictionsLoading: isLoadingPredictions,
    matchesError,
    userPredictionsError,
  } = useAppData();
  const { width } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState<BetFilter>("active");
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isDesktop = width >= 1024;
  const isCompact = width < 820;

  useEffect(() => {
    setError(matchesError ?? userPredictionsError ?? null);
  }, [matchesError, userPredictionsError]);

  const bets = useMemo<EnrichedBet[]>(
    () =>
      predictions
        .map((prediction) => ({
          ...prediction,
          match: matches.find((match) => match.id === prediction.matchId) ?? null,
        }))
        .sort((left, right) => {
          const leftDate = getTimestampValue(left.settledAt ?? left.updatedAt ?? left.createdAt);
          const rightDate = getTimestampValue(
            right.settledAt ?? right.updatedAt ?? right.createdAt
          );
          return rightDate - leftDate;
        }),
    [matches, predictions]
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
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          title="My Bets"
          rightSlot={<AppMenuButton onPress={() => setIsMenuOpen(true)} />}
          centered={isDesktop}
          edgeToEdge
        />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.summaryWrap}>
            <View style={styles.summaryRow}>
              <SummaryCard label="Active" value={String(totals.active)} />
              <SummaryCard label="Settled" value={String(totals.settled)} />
            </View>
            <SummaryCard
              label="Net"
              value={
                <CoinAmount
                  value={Math.abs(totals.profit).toLocaleString("en-IN")}
                  prefix={totals.profit < 0 ? "-" : undefined}
                  size={20}
                  weight="800"
                  iconSize={15}
                  color="#F7FAFF"
                />
              }
              accent={totals.profit >= 0}
              fullWidth
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

          <View style={styles.tableWrap}>
            <View style={[styles.tableHeader, isCompact && styles.tableHeaderCompact]}>
              <View style={[styles.matchCol, isCompact && styles.matchColCompact, styles.headerCellLeft]}>
                <Text style={styles.tableHeaderText}>Match</Text>
              </View>
              <View style={[styles.teamsCol, isCompact && styles.teamsColCompact, styles.headerCellCenter]}>
                <Text style={styles.tableHeaderText}>Teams</Text>
              </View>
              <View style={[styles.pickCol, isCompact && styles.pickColCompact, styles.headerCellCenter]}>
                <Text style={styles.tableHeaderText}>Bet</Text>
              </View>
              <View style={[styles.statusCol, isCompact && styles.statusColCompact, styles.headerCellRight]}>
                <Text style={styles.tableHeaderText}>Status</Text>
              </View>
            </View>

            {filteredBets.length ? (
              filteredBets.map((bet) => (
                <BetTableRow
                  key={bet.id}
                  bet={bet}
                  isCompact={isCompact}
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
                  Place a prediction from Home and it will show up here.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

function BetTableRow({
  bet,
  isCompact,
  onOpen,
}: {
  bet: EnrichedBet;
  isCompact: boolean;
  onOpen: () => void;
}) {
  const matchLabel = bet.match ? `Match ${bet.match.matchNumber}` : "Unknown";
  const pickedShortCode =
    bet.match == null
      ? "Unknown"
      : bet.selectedTeam === "teamA"
        ? bet.match.teamAShort
        : bet.match.teamBShort;
  const teamsContent = isCompact ? (
    <View style={[styles.teamsCol, styles.teamsColCompact, styles.teamsCellCompact]}>
      <Text style={styles.teamCodeCompact}>{bet.match?.teamAShort ?? "--"}</Text>
      <Text style={[styles.vsText, styles.vsTextCompactStack]}>VS</Text>
      <Text style={styles.teamCodeCompact}>{bet.match?.teamBShort ?? "--"}</Text>
    </View>
  ) : (
    <View style={[styles.teamsCol, styles.teamsCell]}>
      <TeamCell
        shortCode={bet.match?.teamAShort ?? "--"}
        fullName={bet.match?.teamAName ?? "Unknown"}
        align="left"
        isCompact={false}
      />
      <Text style={styles.vsText}>VS</Text>
      <TeamCell
        shortCode={bet.match?.teamBShort ?? "--"}
        fullName={bet.match?.teamBName ?? "Unknown"}
        align="right"
        isCompact={false}
      />
    </View>
  );

  return (
    <Pressable
      style={[styles.row, isCompact && styles.rowCompact, bet.match && styles.rowPressable]}
      onPress={bet.match ? onOpen : undefined}
      disabled={!bet.match}
    >
      <Text style={[styles.rowMatchText, styles.matchCol, isCompact && styles.matchColCompact]}>
        {matchLabel}
      </Text>

      {teamsContent}

      <View style={[styles.pickCol, isCompact && styles.pickColCompact]}>
        <CoinAmount
          value={bet.amount.toLocaleString("en-IN")}
          size={13}
          weight="700"
          iconSize={11}
          align="center"
          textStyle={styles.rowPrimary}
        />
        <Text style={styles.rowSecondary}>on {pickedShortCode}</Text>
      </View>

      <View style={[styles.statusCol, isCompact && styles.statusColCompact, styles.statusCell]}>
        <View style={[styles.statusChip, getStatusChipStyle(bet.status)]}>
          <Text style={styles.statusText}>{formatBetStatus(bet.status)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TeamCell({
  shortCode,
  fullName,
  align,
  isCompact,
}: {
  shortCode: string;
  fullName: string;
  align: "left" | "right";
  isCompact: boolean;
}) {
  return (
    <View
      style={[
        styles.teamCell,
        isCompact && styles.teamCellCompact,
        align === "right" && styles.teamCellRight,
      ]}
    >
      {isCompact ? (
        <>
          <Text style={styles.teamCodeCompact}>{shortCode}</Text>
        </>
      ) : (
        <>
          <View style={[styles.teamTextWrap, align === "right" && styles.teamTextWrapRight]}>
            <Text style={styles.teamCode}>{shortCode}</Text>
            <Text style={styles.teamName} numberOfLines={2}>
              {fullName}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
  fullWidth = false,
}: {
  label: string;
  value: string | ReactNode;
  accent?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, fullWidth && styles.summaryCardFullWidth, accent && styles.summaryCardAccent]}>
      <Text style={[styles.summaryLabel, accent && styles.summaryLabelAccent]}>{label}</Text>
      {typeof value === "string" ? <Text style={styles.summaryValue}>{value}</Text> : value}
    </View>
  );
}

function formatBetStatus(status: PredictionRecord["status"]) {
  switch (status) {
    case "pending":
      return "Active";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    case "refunded":
      return "Refunded";
    default:
      return status;
  }
}

function getStatusChipStyle(status: PredictionRecord["status"]) {
  switch (status) {
    case "pending":
      return styles.statusActive;
    case "won":
      return styles.statusWon;
    case "lost":
      return styles.statusLost;
    case "refunded":
      return styles.statusRefunded;
    default:
      return styles.statusActive;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    paddingTop: 14,
  },
  contentDesktop: {
  },
  topBannerWrap: {
    overflow: "hidden",
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  pageShellDesktop: {
    maxWidth: 1120,
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
  summaryWrap: {
    gap: 12,
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
  summaryCardFullWidth: {
    flexBasis: "100%",
    width: "100%",
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
  tableWrap: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#132445",
    borderBottomWidth: 1,
    borderBottomColor: "#223A63",
    gap: 12,
  },
  tableHeaderCompact: {
    paddingHorizontal: 12,
    gap: 8,
  },
  tableHeaderText: {
    color: "#7FAAFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    textAlign: "center",
  },
  headerCellLeft: {
    alignItems: "flex-start",
  },
  headerCellCenter: {
    alignItems: "center",
  },
  headerCellRight: {
    alignItems: "flex-end",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1B2B4A",
  },
  rowCompact: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  rowPressable: {
    backgroundColor: "#102042",
  },
  matchCol: {
    width: 82,
  },
  matchColCompact: {
    width: 58,
  },
  teamsCol: {
    flex: 1,
  },
  teamsColCompact: {
    width: 46,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 46,
  },
  pickCol: {
    width: 120,
    alignItems: "center",
  },
  pickColCompact: {
    width: 86,
  },
  statusCol: {
    width: 84,
    alignItems: "center",
  },
  statusColCompact: {
    width: 74,
    alignItems: "flex-end",
  },
  rowMatchText: {
    color: "#DDE5F7",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "left",
  },
  teamsCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  teamsCellCompact: {
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  teamCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamCellCompact: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  teamCellRight: {
    justifyContent: "flex-end",
  },
  teamTextWrap: {
    flexShrink: 1,
    gap: 2,
  },
  teamTextWrapRight: {
    alignItems: "flex-end",
  },
  teamCode: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  teamCodeCompact: {
    color: "#F7FAFF",
    fontSize: 13,
    fontWeight: "800",
  },
  teamName: {
    color: "#8EA0C1",
    fontSize: 13,
    lineHeight: 18,
  },
  vsText: {
    color: "#60759D",
    fontSize: 14,
    fontWeight: "900",
  },
  vsTextCompact: {
    fontSize: 10,
    marginHorizontal: 2,
  },
  vsTextCompactStack: {
    fontSize: 10,
    marginHorizontal: 0,
    lineHeight: 12,
  },
  rowPrimary: {
    color: "#F5F8FF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  rowSecondary: {
    color: "#8EA0C1",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
    textAlign: "center",
  },
  statusCell: {
    alignItems: "flex-end",
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  statusActive: {
    backgroundColor: "#16356D",
    borderColor: "#2E5DB0",
  },
  statusWon: {
    backgroundColor: "#103222",
    borderColor: "#1D6E49",
  },
  statusLost: {
    backgroundColor: "#35191B",
    borderColor: "#7A2A2A",
  },
  statusRefunded: {
    backgroundColor: "#342A1A",
    borderColor: "#7A5A1A",
  },
  statusText: {
    color: "#F7FAFF",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  emptyCard: {
    padding: 22,
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
