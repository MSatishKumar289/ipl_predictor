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
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { CoinAmount } from "@/components/CoinAmount";
import { LockIcon } from "@/components/LockIcon";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import { getBettingState, subscribeToMatches } from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";
import { subscribeToUserPredictions } from "@/lib/predictions";
import type { PredictionRecord } from "@/lib/prediction-types";
import {
  getWeeklySpinConfig,
  getWeeklySpinStatus,
  hasUserPlayedAnyWeeklySpin,
} from "@/lib/spin";
import { useAuth } from "@/providers/AuthProvider";

type MatchFilter = "upcoming" | "live" | "completed";
const appTimeZone = "Asia/Kolkata";

const filters: { key: MatchFilter; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
  { key: "completed", label: "Completed" },
];

export default function HomeTab() {
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState<MatchFilter>("upcoming");
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [predictions, setPredictions] = useState<Record<string, PredictionRecord>>({});
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isClientReady, setIsClientReady] = useState(false);
  const [isSpinLoading, setIsSpinLoading] = useState(true);
  const [isSpinEligible, setIsSpinEligible] = useState(false);
  const [hasUsedSpin, setHasUsedSpin] = useState(false);
  const [nextSpinStartAt, setNextSpinStartAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const isDesktop = width >= 1024;

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToMatches(
      (nextMatches) => {
        setMatches(nextMatches);
        setError(null);
        setIsLoadingMatches(false);
      },
      (snapshotError) => {
        setError(`Matches read failed: ${snapshotError.message}`);
        setIsLoadingMatches(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setPredictions({});
      return;
    }

    const unsubscribe = subscribeToUserPredictions(
      user.uid,
      (nextPredictions) => {
        setPredictions(
          nextPredictions.reduce<Record<string, PredictionRecord>>((accumulator, prediction) => {
            accumulator[prediction.matchId] = prediction;
            return accumulator;
          }, {})
        );
      },
      (snapshotError) => {
        setError((current) => current ?? `Predictions read failed: ${snapshotError.message}`);
      }
    );

    return unsubscribe;
  }, [user]);

  useFocusEffect(() => {
    let isActive = true;

    if (!user) {
      setIsSpinEligible(false);
      setIsSpinLoading(false);

      return () => {
        isActive = false;
      };
    }

    setIsSpinLoading(true);

    void getWeeklySpinStatus(user.uid)
      .then(async (status) => {
        if (!isActive) {
          return;
        }

        setIsSpinEligible(status.eligible);
        const hasPlayedAnySpin = status.hasUsedSpin || (await hasUserPlayedAnyWeeklySpin(user.uid));
        if (!isActive) {
          return;
        }
        setHasUsedSpin(hasPlayedAnySpin);

        if (hasPlayedAnySpin) {
          const config = await getWeeklySpinConfig();
          if (!isActive) {
            return;
          }
          const publishedStartAt = config.activeCampaignStartAt ?? null;
          const publishedStartAtMs = publishedStartAt ? Date.parse(publishedStartAt) : 0;
          setNextSpinStartAt(
            publishedStartAt && publishedStartAtMs > Date.now() ? publishedStartAt : null
          );
          return;
        }

        setNextSpinStartAt(null);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setIsSpinEligible(false);
        setHasUsedSpin(false);
        setNextSpinStartAt(null);
      })
      .finally(() => {
        if (!isActive) {
          return;
        }

        setIsSpinLoading(false);
      });

    return () => {
      isActive = false;
    };
  });

  useEffect(() => {
    if (!hasUsedSpin || !nextSpinStartAt) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [hasUsedSpin, nextSpinStartAt]);

  const sections = useMemo(() => buildSections(matches), [matches]);

  const activeMatches =
    activeFilter === "upcoming"
      ? sections.upcoming
      : activeFilter === "live"
        ? sections.live
        : sections.completed;
  const visibleMatches = activeFilter === "upcoming" ? sections.upcoming.slice(0, 3) : activeMatches;
  const nextSpinStartMs = nextSpinStartAt ? Date.parse(nextSpinStartAt) : 0;
  const nextSpinCountdownSeconds = nextSpinStartAt
    ? Math.max(0, Math.floor((nextSpinStartMs - nowMs) / 1000))
    : 0;

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          eyebrow="FPL"
          title={`Welcome back, ${profile?.displayName || "Player"}`}
          rightSlot={<AppMenuButton onPress={() => setIsMenuOpen(true)} />}
          edgeToEdge
        />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageShell}>
          <View style={styles.balanceCard}>
            <Text style={styles.cardLabel}>Current Balance</Text>
            <CoinAmount
              value={(profile?.balance ?? 0).toLocaleString("en-IN")}
              size={30}
              weight="800"
              iconSize={20}
              style={styles.balanceValueRow}
            />
          </View>

          {!isSpinLoading && isSpinEligible ? (
            <Pressable style={styles.spinCard} onPress={() => router.push("/weekly-spin")}>
              <View style={styles.spinCardBody}>
                <Text style={styles.spinEyebrow}>Weekly Contest</Text>
                <Text style={styles.spinTitle}>Spin The Wheel</Text>
                <Text style={styles.spinText}>
                  You have 1 weekly spin available. Try for coins, points, Free Bet Ticket, or
                  Bet Insurance.
                </Text>
              </View>
              <View style={styles.spinActionPill}>
                <Text style={styles.spinActionText}>Spin Now</Text>
              </View>
            </Pressable>
          ) : null}

          {!isSpinLoading &&
          !isSpinEligible &&
          hasUsedSpin &&
          nextSpinCountdownSeconds > 0 ? (
            <View style={styles.nextSpinCard}>
              <Text style={styles.nextSpinLabel}>Next Spin</Text>
              <Text style={styles.nextSpinCountdown}>{formatCountdown(nextSpinCountdownSeconds)}</Text>
            </View>
          ) : null}

          <View style={styles.matchesSection}>
            <View style={styles.matchesHeader}>
              <Text style={styles.matchesTitle}>Matches</Text>
              {isLoadingMatches ? (
                <View style={styles.loadingChip}>
                  <ActivityIndicator size="small" color="#F2B84B" />
                  <Text style={styles.loadingChipText}>Loading</Text>
                </View>
              ) : (
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>
                    {activeMatches.length} {activeMatches.length === 1 ? "Game" : "Games"}
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.filterRow, isDesktop && styles.filterRowDesktop]}>
              {filters.map((filter) => (
                <Pressable
                  key={filter.key}
                  style={[styles.filterItem, isDesktop && styles.filterItemDesktop]}
                  onPress={() => setActiveFilter(filter.key)}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      activeFilter === filter.key && styles.filterLabelActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                  {activeFilter === filter.key ? <View style={styles.filterUnderline} /> : null}
                </Pressable>
              ))}
            </View>

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Firestore error</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {isLoadingMatches || !isClientReady ? (
              <View style={styles.sectionLoadingState}>
                <ActivityIndicator size="large" color="#F2B84B" />
                <Text style={styles.sectionLoadingText}>Loading matches...</Text>
              </View>
            ) : (
              <>
                {visibleMatches.length ? (
                  <View style={styles.featuredList}>
                    {visibleMatches.map((match) => (
                      <FeaturedMatchCard
                        key={match.id}
                        match={match}
                        prediction={predictions[match.id] ?? null}
                        compact={width < 768}
                        onOpen={() => openMatch(match.id)}
                      />
                    ))}
                  </View>
                ) : null}
                {!visibleMatches.length ? <EmptyState filter={activeFilter} /> : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>
      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

function FeaturedMatchCard({
  match,
  prediction,
  compact = false,
  onOpen,
}: {
  match: MatchRecord;
  prediction: PredictionRecord | null;
  compact?: boolean;
  onOpen: () => void;
}) {
  const badge = getMatchBadge(match, prediction);

  return (
    <Pressable style={styles.featuredCard} onPress={onOpen}>
      <View style={styles.featuredSummary}>
        <View style={styles.featuredSummaryBody}>
          <Text
            style={styles.featuredSummaryTeams}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {match.teamAShort} vs {match.teamBShort}
          </Text>
          {match.venue ? (
            <Text style={styles.featuredVenue}>
              {match.venue}
            </Text>
          ) : null}
          {compact ? (
            <View style={styles.featuredSummaryMetaWrap}>
              <Text style={styles.featuredSummaryMeta}>
                {getCollapsedScheduleLabel(match)}
              </Text>
              <LockTimeRow value={getBetLockTimeLabel(match)} />
            </View>
          ) : (
            <View style={styles.featuredSummaryMetaInline}>
              <Text style={styles.featuredSummaryMeta}>{getCollapsedScheduleLabel(match)}</Text>
              <Text style={styles.featuredSummaryMetaDivider}>|</Text>
              <LockTimeRow value={getBetLockTimeLabel(match)} />
            </View>
          )}
        </View>
        <View style={styles.featuredSummarySide}>
          <Text style={styles.featuredMatchNumber}>Match {match.matchNumber}</Text>
          <StatusBadge label={badge.label} tone={badge.tone} compact />
          {prediction ? (
            <View style={styles.featuredBetHintRow}>
              <Text style={styles.featuredBetHint}>Your Bet:</Text>
              <CoinAmount
                value={prediction.amount.toLocaleString("en-IN")}
                color="#AFC0DE"
                size={12}
                weight="700"
                iconSize={10}
              />
              <Text style={styles.featuredBetHint}>
                | {prediction.selectedTeam === "teamA" ? match.teamAShort : match.teamBShort}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function LockTimeRow({ value }: { value: string }) {
  return (
    <View style={styles.lockTimeRow}>
      <LockIcon />
      <Text style={styles.featuredSummaryMeta}>{value}</Text>
    </View>
  );
}

function EmptyState({ filter }: { filter: MatchFilter }) {
  const message =
    filter === "upcoming"
      ? "No upcoming matches right now."
      : filter === "live"
        ? "No live matches right now."
        : "No completed matches right now.";

  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{message}</Text>
      <Text style={styles.emptyText}>New match activity will appear here automatically.</Text>
    </View>
  );
}

function buildSections(matches: MatchRecord[]) {
  const upcoming = matches.filter((match) => match.status === "upcoming");
  const live = matches.filter((match) => match.status === "locked" || match.status === "completed");
  const completed = matches.filter(
    (match) => match.status === "settled" || match.status === "no_result"
  );

  return { upcoming, live, completed };
}

function getMatchBadge(match: MatchRecord, prediction: PredictionRecord | null = null) {
  const bettingState = getBettingState(match);

  if (bettingState === "bet_open") {
    return {
      label: prediction ? "Edit Bet" : "Bet Open",
      tone: prediction ? ("edit" as const) : ("success" as const),
    };
  }

  if (bettingState === "bet_locked") {
    return { label: "Bet Locked", tone: "neutral" as const };
  }

  if (bettingState === "closed") {
    return { label: "Closed", tone: "muted" as const };
  }

  return { label: "Completed", tone: "muted" as const };
}

function getBetLockTimeLabel(match: MatchRecord) {
  const timeLabel = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: appTimeZone,
  }).format(new Date(match.lockAt));

  return timeLabel;
}

function getCollapsedScheduleLabel(match: MatchRecord) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: appTimeZone,
  }).format(new Date(match.startAt));
}

function formatCountdown(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function openMatch(matchId: string) {
  router.push({
    pathname: "/match/[id]",
    params: { id: matchId },
  });
}

function StatusBadge({
  label,
  tone,
  compact = false,
}: {
  label: string;
  tone: "success" | "edit" | "neutral" | "muted";
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.statusBadge,
        tone === "success" && styles.statusBadgeSuccess,
        tone === "edit" && styles.statusBadgeEdit,
        tone === "neutral" && styles.statusBadgeNeutral,
        tone === "muted" && styles.statusBadgeMuted,
        compact && styles.statusBadgeCompact,
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          tone === "success" && styles.statusBadgeTextSuccess,
          tone === "edit" && styles.statusBadgeTextEdit,
          tone === "neutral" && styles.statusBadgeTextNeutral,
          tone === "muted" && styles.statusBadgeTextMuted,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0C1A34",
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    paddingTop: 14,
    width: "100%",
    alignSelf: "center",
  },
  contentDesktop: {
    maxWidth: 960,
  },
  topBannerWrap: {
    overflow: "hidden",
  },
  pageShell: {
    gap: 18,
  },
  balanceCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#233C62",
    backgroundColor: "#15294F",
    padding: 22,
    gap: 8,
  },
  cardLabel: {
    color: "#9FB0CF",
    fontSize: 14,
  },
  balanceValue: {
    color: "#F7FAFF",
    fontSize: 30,
    fontWeight: "800",
  },
  balanceValueRow: {
    minHeight: 38,
  },
  matchesSection: {
    gap: 18,
  },
  spinCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#556D1E",
    backgroundColor: "#22340D",
    padding: 20,
    gap: 16,
  },
  spinCardBody: {
    gap: 8,
  },
  spinEyebrow: {
    color: "#C9E77D",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  spinTitle: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  spinText: {
    color: "#D8E5BB",
    fontSize: 14,
    lineHeight: 21,
  },
  spinActionPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#F2B84B",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  spinActionText: {
    color: "#102042",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  nextSpinCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A4A78",
    backgroundColor: "#12294F",
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nextSpinLabel: {
    color: "#AFC0DE",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nextSpinCountdown: {
    color: "#66DDA1",
    fontSize: 14,
    fontWeight: "800",
  },
  matchesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  matchesTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  loadingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#17315B",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadingChipText: {
    color: "#7FA6FF",
    fontSize: 13,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#46628F",
    paddingBottom: 2,
    marginBottom: 8,
  },
  filterRowDesktop: {
    alignSelf: "flex-start",
    gap: 12,
  },
  filterItem: {
    marginRight: 32,
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "center",
  },
  filterItemDesktop: {
    marginRight: 0,
    minWidth: 108,
  },
  filterLabel: {
    color: "#7485A8",
    fontSize: 17,
    fontWeight: "700",
  },
  filterLabelActive: {
    color: "#2463EB",
  },
  filterUnderline: {
    marginTop: 12,
    width: "100%",
    height: 3,
    borderRadius: 999,
    backgroundColor: "#2463EB",
  },
  sectionLoadingState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#27466E",
    backgroundColor: "#162B54",
    padding: 28,
  },
  sectionLoadingText: {
    color: "#D8E3FF",
    fontSize: 16,
    fontWeight: "600",
  },
  countChip: {
    borderRadius: 999,
    backgroundColor: "#173B83",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countChipText: {
    color: "#3C7CFF",
    fontSize: 13,
    fontWeight: "700",
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
  featuredCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#27466E",
    backgroundColor: "#1A2F5A",
  },
  featuredList: {
    gap: 16,
  },
  featuredSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  featuredSummaryBody: {
    flex: 1,
    gap: 6,
  },
  featuredSummaryTeams: {
    color: "#F5F8FF",
    fontSize: 21,
    fontWeight: "800",
  },
  featuredVenue: {
    color: "#8FA5CC",
    fontSize: 12,
    fontWeight: "600",
  },
  featuredSummaryMeta: {
    color: "#A8B5D0",
    fontSize: 14,
    fontWeight: "600",
  },
  featuredSummaryMetaWrap: {
    gap: 2,
  },
  featuredSummaryMetaInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  featuredSummaryMetaDivider: {
    color: "#6F7F9F",
    fontSize: 13,
    fontWeight: "700",
  },
  featuredSummarySide: {
    alignSelf: "center",
    marginLeft: 12,
    alignItems: "flex-end",
    gap: 8,
  },
  featuredMatchNumber: {
    color: "#8FA5CC",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  featuredBetHint: {
    color: "#AFC0DE",
    fontSize: 12,
    fontWeight: "700",
  },
  featuredBetHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    flexWrap: "wrap",
  },
  lockTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  confirmationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1D6E49",
    backgroundColor: "#103222",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  confirmationCardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  confirmationDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#35D483",
    marginTop: 5,
  },
  confirmationBody: {
    flex: 1,
    gap: 2,
  },
  confirmationTitle: {
    color: "#69E5A2",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  confirmationTitleCompact: {
    fontSize: 12,
  },
  confirmationText: {
    color: "#CDEEDB",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  confirmationTextCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  listSection: {
    gap: 18,
  },
  listSectionTitle: {
    color: "#6F7F9F",
    fontSize: 18,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2D4F7C",
    backgroundColor: "#162C4E",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  rowLeading: {
    flexDirection: "row",
    marginRight: 6,
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: {
    color: "#F5F8FF",
    fontSize: 18,
    fontWeight: "800",
  },
  rowDay: {
    color: "#7E90B4",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  rowSubtitle: {
    color: "#667999",
    fontSize: 14,
  },
  rowPrediction: {
    color: "#8EA7D0",
    fontSize: 14,
    fontWeight: "600",
  },
  rowActions: {
    alignItems: "flex-end",
    gap: 12,
  },
  rowLink: {
    color: "#3C7CFF",
    fontSize: 16,
    fontWeight: "800",
  },
  teamBadge: {
    width: 74,
    height: 74,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#33476D",
    backgroundColor: "#162645",
    alignItems: "center",
    justifyContent: "center",
  },
  teamBadgeCompact: {
    width: 52,
    height: 52,
    marginRight: -10,
  },
  teamCode: {
    color: "#F5F8FF",
    fontSize: 22,
    fontWeight: "800",
  },
  teamCodeCompact: {
    fontSize: 14,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  statusBadgeCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgeSuccess: {
    backgroundColor: "#103222",
    borderColor: "#1D6E49",
  },
  statusBadgeEdit: {
    backgroundColor: "#3A2E0D",
    borderColor: "#B88A12",
  },
  statusBadgeNeutral: {
    backgroundColor: "#18253F",
    borderColor: "#46597D",
  },
  statusBadgeMuted: {
    backgroundColor: "#2A3448",
    borderColor: "#3D4B66",
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  statusBadgeTextSuccess: {
    color: "#3DDE8C",
  },
  statusBadgeTextEdit: {
    color: "#FFD34F",
  },
  statusBadgeTextNeutral: {
    color: "#B7C4DE",
  },
  statusBadgeTextMuted: {
    color: "#97A5BF",
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2D4F7C",
    backgroundColor: "#162C4E",
    padding: 22,
    gap: 8,
  },
  emptyTitle: {
    color: "#F5F8FF",
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: "#8EA0C1",
    fontSize: 15,
    lineHeight: 22,
  },
});
