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

import { useAuth } from "@/providers/AuthProvider";
import { createDemoMatches } from "@/lib/demoMatches";
import { formatMatchDate, isMatchLocked, subscribeToMatches } from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";
import { subscribeToUserPredictions } from "@/lib/predictions";
import type { PredictionRecord } from "@/lib/prediction-types";

type MatchFilter = "upcoming" | "live" | "completed";

const filters: { key: MatchFilter; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
  { key: "completed", label: "Completed" },
];

export default function MatchesTab() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState<MatchFilter>("upcoming");
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [predictions, setPredictions] = useState<Record<string, PredictionRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMatches(
      (nextMatches) => {
        setMatches(nextMatches);
        setError(null);
        setIsLoading(false);
      },
      (snapshotError) => {
        setError(`Matches read failed: ${snapshotError.message}`);
        setIsLoading(false);
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

  const displayMatches = matches.length ? matches : createDemoMatches();
  const sections = useMemo(() => buildSections(displayMatches), [displayMatches]);

  const activeMatches =
    activeFilter === "upcoming"
      ? sections.upcoming
      : activeFilter === "live"
        ? sections.live
        : sections.completed;

  const featuredMatch =
    activeFilter === "upcoming"
      ? sections.today[0] ?? sections.upcoming[0] ?? null
      : activeFilter === "live"
        ? sections.live[0] ?? null
      : sections.completed[0] ?? null;
  const isDesktop = width >= 1024;

  const remainingMatches = featuredMatch
    ? activeMatches.filter((match) => match.id !== featuredMatch.id)
    : activeMatches;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#2463EB" />
          <Text style={styles.loadingText}>Loading matches...</Text>
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
        <View style={styles.header}>
          <Text style={styles.title}>IPL 2024 Schedule</Text>
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

        {!matches.length ? (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerText}>Showing demo matches for UI testing.</Text>
          </View>
        ) : null}

        {activeFilter === "upcoming" ? (
          <SectionHeader title="Today's Matches" count={sections.today.length} />
        ) : activeFilter === "live" ? (
          <SectionHeader title="Live Matches" count={sections.live.length} />
        ) : (
          <SectionHeader title="Completed Matches" count={sections.completed.length} />
        )}

        {featuredMatch ? (
          <FeaturedMatchCard
            match={featuredMatch}
            prediction={predictions[featuredMatch.id] ?? null}
            onOpen={() => openMatch(featuredMatch.id)}
          />
        ) : (
          <EmptyState filter={activeFilter} />
        )}

        {remainingMatches.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {activeFilter === "completed" ? "More results" : "Upcoming matches"}
            </Text>
            {remainingMatches.map((match) => (
              <CompactMatchRow
                key={match.id}
                match={match}
                prediction={predictions[match.id] ?? null}
                onOpen={() => openMatch(match.id)}
              />
            ))}
          </View>
        ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeaturedMatchCard({
  match,
  prediction,
  onOpen,
}: {
  match: MatchRecord;
  prediction: PredictionRecord | null;
  onOpen: () => void;
}) {
  const badge = getMatchBadge(match);

  return (
    <View style={styles.featuredCard}>
      <View style={styles.featuredTop}>
        <TeamBadge code={match.teamAShort} />
        <View style={styles.versusWrap}>
          <Text style={styles.vsLabel}>VS</Text>
          <Text style={styles.venueText}>Match {match.matchNumber}</Text>
        </View>
        <TeamBadge code={match.teamBShort} />
      </View>

      <View style={styles.featuredBody}>
        <View style={styles.featuredTitleRow}>
          <Text style={styles.featuredTitle}>
            {match.teamAName} <Text style={styles.featuredTitleMuted}>vs</Text> {match.teamBName}
          </Text>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>

        <Text style={styles.featuredMeta}>{getScheduleLabel(match)}</Text>
        {prediction ? (
          <ConfirmationBlock
            title="Prediction Confirmed"
            detail={`Your pick: ${
              prediction.selectedTeam === "teamA" ? match.teamAShort : match.teamBShort
            } - Rs. ${prediction.amount.toLocaleString("en-IN")}`}
          />
        ) : null}
        {match.winner ? (
          <Text style={styles.resultMeta}>Result: {getWinnerLabel(match)}</Text>
        ) : null}

        <Pressable style={styles.primaryButton} onPress={onOpen}>
          <Text style={styles.primaryButtonText}>
            {match.status === "settled" || match.status === "no_result" ? "View Stats" : "View Match"}
          </Text>
        </Pressable>
      </View>
    </View>
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
  const badge = getMatchBadge(match);

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
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <View style={[styles.sectionHeader, isDesktop && styles.sectionHeaderDesktop]}>
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
      ? "No upcoming matches available yet."
      : filter === "live"
        ? "No live matches right now."
        : "No completed matches yet.";

  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{message}</Text>
      <Text style={styles.emptyText}>
        Once match data is available in Firestore, this list will fill automatically.
      </Text>
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
  const today = matches.filter((match) => isToday(match.startAt) && match.status !== "settled" && match.status !== "no_result");
  const upcoming = matches.filter((match) => match.status === "upcoming");
  const live = matches.filter((match) => match.status === "locked" || match.status === "completed");
  const completed = matches.filter((match) => match.status === "settled" || match.status === "no_result");

  return { today, upcoming, live, completed };
}

function getMatchBadge(match: MatchRecord) {
  if (match.status === "upcoming") {
    return { label: isMatchLocked(match.lockAt) ? "Locked" : "Open", tone: "success" as const };
  }

  if (match.status === "locked" || match.status === "completed") {
    return { label: "Locked", tone: "neutral" as const };
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

function getScheduleLabel(match: MatchRecord) {
  return match.status === "settled" || match.status === "no_result"
    ? `Started ${formatMatchDate(match.startAt)}`
    : `Starts ${formatMatchDate(match.startAt)}`;
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
    backgroundColor: "#0A1325",
  },
  content: {
    paddingBottom: 40,
  },
  contentDesktop: {
    paddingTop: 12,
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
  },
  pageShellDesktop: {
    maxWidth: 1040,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#0A1325",
  },
  loadingText: {
    color: "#D8E3FF",
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#1B2943",
    alignItems: "center",
  },
  title: {
    color: "#F5F8FF",
    fontSize: 28,
    fontWeight: "800",
  },
  filterRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1B2943",
    paddingHorizontal: 24,
  },
  filterRowDesktop: {
    alignSelf: "flex-start",
    gap: 12,
  },
  filterItem: {
    marginRight: 32,
    paddingTop: 18,
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 14,
  },
  sectionHeaderDesktop: {
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
    marginHorizontal: 24,
    marginTop: 20,
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
    marginHorizontal: 24,
    marginTop: 18,
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
  featuredCard: {
    marginHorizontal: 24,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#213456",
    backgroundColor: "#101C34",
  },
  featuredTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#14244D",
    paddingHorizontal: 28,
    paddingVertical: 22,
  },
  versusWrap: {
    alignItems: "center",
    gap: 6,
  },
  vsLabel: {
    color: "#2667F5",
    fontSize: 18,
    fontWeight: "800",
  },
  venueText: {
    color: "#A8B5D0",
    fontSize: 15,
    fontWeight: "600",
  },
  featuredBody: {
    padding: 24,
    gap: 14,
  },
  featuredTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  featuredTitle: {
    flex: 1,
    color: "#F5F8FF",
    fontSize: 25,
    fontWeight: "800",
  },
  featuredTitleMuted: {
    color: "#A7B4D0",
    fontWeight: "700",
  },
  featuredMeta: {
    color: "#7E90B4",
    fontSize: 16,
    fontWeight: "500",
  },
  predictionMeta: {
    color: "#9CC3FF",
    fontSize: 14,
    fontWeight: "600",
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
  resultMeta: {
    color: "#B7C4DE",
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#2463EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#F5F8FF",
    fontSize: 18,
    fontWeight: "800",
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 18,
  },
  sectionTitle: {
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
    marginHorizontal: 24,
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
