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

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { getBettingState, subscribeToMatches } from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";
import { subscribeToUserPredictions } from "@/lib/predictions";
import type { PredictionRecord } from "@/lib/prediction-types";
import { useAuth } from "@/providers/AuthProvider";

type MatchFilter = "upcoming" | "live" | "completed";

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
  const isDesktop = width >= 1024;

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

  const sections = useMemo(() => buildSections(matches), [matches]);

  const activeMatches =
    activeFilter === "upcoming"
      ? sections.upcoming
      : activeFilter === "live"
        ? sections.live
        : sections.completed;

  const todayMatches = activeFilter === "upcoming" ? sections.today : [];
  const futureUpcomingMatches =
    activeFilter === "upcoming"
      ? sections.upcoming.filter((match) => !sections.today.some((todayMatch) => todayMatch.id === match.id))
      : [];
  const visibleFutureUpcomingMatches = futureUpcomingMatches.slice(0, 2);
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.eyebrow}>Friends Premier League</Text>
              <Text style={styles.title}>Welcome back, {profile?.displayName || "Player"}</Text>
              <Text style={styles.subtitle}>Track fixtures, place picks, and follow standings.</Text>
            </View>
            <AppMenuButton onPress={() => setIsMenuOpen(true)} />
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.cardLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>
            Rs. {(profile?.balance ?? 0).toLocaleString("en-IN")}
          </Text>
          <Text style={styles.balanceHint}>Ready for tonight&apos;s fixtures</Text>
        </View>

        <View style={styles.matchesSection}>
          <View style={styles.matchesHeader}>
            <Text style={styles.matchesTitle}>Matches</Text>
            {isLoadingMatches ? (
              <View style={styles.loadingChip}>
                <ActivityIndicator size="small" color="#7FA6FF" />
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

          {isLoadingMatches ? (
            <View style={styles.sectionLoadingState}>
              <ActivityIndicator size="large" color="#2463EB" />
              <Text style={styles.sectionLoadingText}>Loading matches...</Text>
            </View>
          ) : (
            <>
              <SectionHeader
                title={
                  activeFilter === "upcoming"
                    ? "Today's Matches"
                    : activeFilter === "live"
                      ? "Live Matches"
                      : "Completed Matches"
                }
                count={
                  activeFilter === "upcoming"
                    ? sections.today.length
                    : activeFilter === "live"
                      ? sections.live.length
                      : sections.completed.length
                }
              />

              {activeFilter === "upcoming" ? (
                todayMatches.length ? (
                  <View style={styles.featuredList}>
                    {todayMatches.map((match) => (
                      <FeaturedMatchCard
                        key={match.id}
                        match={match}
                        prediction={predictions[match.id] ?? null}
                        compact={width < 768}
                        onOpen={() => openMatch(match.id)}
                      />
                    ))}
                  </View>
                ) : (
                  <EmptyState filter={activeFilter} />
                )
              ) : activeMatches.length ? (
                <View style={styles.featuredList}>
                  {activeMatches.map((match) => (
                    <FeaturedMatchCard
                      key={match.id}
                      match={match}
                      prediction={predictions[match.id] ?? null}
                      compact={width < 768}
                      onOpen={() => openMatch(match.id)}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState filter={activeFilter} />
              )}

              {activeFilter === "upcoming" && visibleFutureUpcomingMatches.length ? (
                <View style={styles.listSection}>
                  <Text style={styles.listSectionTitle}>Upcoming matches</Text>
                  <View style={styles.featuredList}>
                    {visibleFutureUpcomingMatches.map((match) => (
                      <FeaturedMatchCard
                        key={match.id}
                        match={match}
                        prediction={predictions[match.id] ?? null}
                        compact={width < 768}
                        onOpen={() => openMatch(match.id)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
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
          <Text style={styles.featuredSummaryTeams}>
            {match.teamAShort} vs {match.teamBShort}
          </Text>
          {compact ? (
            <View style={styles.featuredSummaryMetaWrap}>
              <Text style={styles.featuredSummaryMeta}>
                {getCollapsedScheduleLabel(match)}
              </Text>
              <Text style={styles.featuredSummaryMeta}>{getBetLockTimeLabel(match)}</Text>
            </View>
          ) : (
            <Text style={styles.featuredSummaryMeta}>
              {getCollapsedScheduleLabel(match)} | {getBetLockTimeLabel(match)}
            </Text>
          )}
        </View>
        <View style={styles.featuredSummarySide}>
          <Text style={styles.featuredMatchNumber}>Match {match.matchNumber}</Text>
          <StatusBadge label={badge.label} tone={badge.tone} compact />
          {prediction ? (
            <Text style={styles.featuredBetHint}>
              Your Bet: Rs. {prediction.amount.toLocaleString("en-IN")} |{" "}
              {prediction.selectedTeam === "teamA" ? match.teamAShort : match.teamBShort}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function CompactMatchRow({
  match,
  prediction,
  onOpen,
}: {
  match: MatchRecord;
  prediction: PredictionRecord | null;
  onOpen: () => void;
}) {
  const badge = getMatchBadge(match, prediction);

  return (
    <View style={styles.rowCard}>
      <View style={styles.rowLeading}>
        <TeamBadge code={match.teamAShort} compact />
        <TeamBadge code={match.teamBShort} compact />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle}>
            {match.teamAShort} vs {match.teamBShort}
          </Text>
          <Text style={styles.rowDay}>{getRelativeDayLabel(match)}</Text>
        </View>
        <Text style={styles.rowSubtitle}>
          {match.teamAName} vs {match.teamBName}
        </Text>
        {prediction ? (
          <ConfirmationBlock
            compact
            title="Prediction Confirmed"
            detail={`Picked ${
              prediction.selectedTeam === "teamA" ? match.teamAShort : match.teamBShort
            } - Rs. ${prediction.amount.toLocaleString("en-IN")}`}
          />
        ) : match.winner ? (
          <Text style={styles.rowPrediction}>{getWinnerSummary(match)}</Text>
        ) : null}
      </View>

      <View style={styles.rowActions}>
        <StatusBadge label={badge.label} tone={badge.tone} compact />
        <Pressable onPress={onOpen}>
          <Text style={styles.rowLink}>
            {match.status === "settled" || match.status === "no_result" ? "Stats" : "View"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function TeamBadge({ code, compact = false }: { code: string; compact?: boolean }) {
  return (
    <View style={[styles.teamBadge, compact && styles.teamBadgeCompact]}>
      <Text style={[styles.teamCode, compact && styles.teamCodeCompact]}>{code}</Text>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      <View style={styles.countChip}>
        <Text style={styles.countChipText}>
          {count} {count === 1 ? "Game" : "Games"}
        </Text>
      </View>
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

function ConfirmationBlock({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.confirmationCard, compact && styles.confirmationCardCompact]}>
      <View style={styles.confirmationDot} />
      <View style={styles.confirmationBody}>
        <Text style={[styles.confirmationTitle, compact && styles.confirmationTitleCompact]}>
          {title}
        </Text>
        <Text style={[styles.confirmationText, compact && styles.confirmationTextCompact]}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

function buildSections(matches: MatchRecord[]) {
  const today = matches.filter(
    (match) =>
      isToday(match.startAt) && match.status !== "settled" && match.status !== "no_result"
  );
  const upcoming = matches.filter((match) => match.status === "upcoming");
  const live = matches.filter((match) => match.status === "locked" || match.status === "completed");
  const completed = matches.filter(
    (match) => match.status === "settled" || match.status === "no_result"
  );

  return { today, upcoming, live, completed };
}

function getMatchBadge(match: MatchRecord, prediction: PredictionRecord | null = null) {
  const bettingState = getBettingState(match);

  if (bettingState === "bet_open") {
    return { label: prediction ? "Edit Bet" : "Bet Open", tone: "success" as const };
  }

  if (bettingState === "bet_locked") {
    return { label: "Bet Locked", tone: "neutral" as const };
  }

  if (bettingState === "closed") {
    return { label: "Closed", tone: "muted" as const };
  }

  return { label: "Completed", tone: "muted" as const };
}

function getWinnerLabel(match: MatchRecord) {
  if (match.winner === "teamA") {
    return match.teamAShort;
  }

  if (match.winner === "teamB") {
    return match.teamBShort;
  }

  return "No result";
}

function getWinnerSummary(match: MatchRecord) {
  return match.winner === "no_result"
    ? `Match ${match.matchNumber} ended with no result`
    : `${getWinnerLabel(match)} won match ${match.matchNumber}`;
}

function getBetLockTimeLabel(match: MatchRecord) {
  const timeLabel = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(match.lockAt));

  return `Betting Locks : ${timeLabel}`;
}

function getCollapsedScheduleLabel(match: MatchRecord) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(match.startAt));
}

function getRelativeDayLabel(match: MatchRecord) {
  const target = new Date(match.startAt);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  const dayOffset = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));

  if (dayOffset === 0) {
    return "Today";
  }

  if (dayOffset === 1) {
    return "Tomorrow";
  }

  if (dayOffset === -1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(target);
}

function isToday(dateString: string) {
  const value = new Date(dateString);
  const today = new Date();

  return (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  );
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
  tone: "success" | "neutral" | "muted";
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.statusBadge,
        tone === "success" && styles.statusBadgeSuccess,
        tone === "neutral" && styles.statusBadgeNeutral,
        tone === "muted" && styles.statusBadgeMuted,
        compact && styles.statusBadgeCompact,
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          tone === "success" && styles.statusBadgeTextSuccess,
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
    backgroundColor: "#07152E",
  },
  content: {
    padding: 24,
    paddingTop: 28,
    paddingBottom: 40,
    gap: 18,
    width: "100%",
    alignSelf: "center",
  },
  contentDesktop: {
    maxWidth: 960,
  },
  hero: {
    gap: 8,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  heroTextWrap: {
    flex: 1,
    gap: 8,
  },
  eyebrow: {
    color: "#1E5AE0",
    fontSize: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    color: "#F5F7FB",
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    color: "#93A1BC",
    fontSize: 16,
    lineHeight: 24,
  },
  balanceCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#21406E",
    backgroundColor: "#102042",
    padding: 22,
    gap: 8,
  },
  cardLabel: {
    color: "#9FB0CF",
    fontSize: 16,
  },
  balanceValue: {
    color: "#F7FAFF",
    fontSize: 30,
    fontWeight: "800",
  },
  balanceHint: {
    color: "#7FA6FF",
    fontSize: 14,
    fontWeight: "600",
  },
  matchesSection: {
    gap: 18,
  },
  matchesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  matchesTitle: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  loadingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#102A63",
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
    borderBottomWidth: 1,
    borderBottomColor: "#1B2943",
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
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 28,
  },
  sectionLoadingText: {
    color: "#D8E3FF",
    fontSize: 16,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  sectionHeaderTitle: {
    color: "#6F7F9F",
    fontSize: 17,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  countChip: {
    borderRadius: 999,
    backgroundColor: "#102A63",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countChipText: {
    color: "#3C7CFF",
    fontSize: 14,
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
    borderColor: "#213456",
    backgroundColor: "#14244D",
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
    fontSize: 24,
    fontWeight: "800",
  },
  featuredSummaryMeta: {
    color: "#A8B5D0",
    fontSize: 15,
    fontWeight: "600",
  },
  featuredSummaryMetaWrap: {
    gap: 2,
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
    borderColor: "#213456",
    backgroundColor: "#101C34",
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
    fontSize: 20,
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
    fontSize: 15,
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
  statusBadgeTextNeutral: {
    color: "#B7C4DE",
  },
  statusBadgeTextMuted: {
    color: "#97A5BF",
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#213456",
    backgroundColor: "#101C34",
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
