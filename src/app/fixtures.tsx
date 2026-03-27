import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { BackButton } from "@/components/BackButton";
import { IPL_TEAMS } from "@/lib/ipl-teams";
import { subscribeToMatches } from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";

type TeamVisual = {
  name: string;
  shortCode: string;
};

const teamByShortCode = new Map(
  IPL_TEAMS.map((team) => [team.shortCode, team] as const)
);

export default function FixturesScreen() {
  const { width } = useWindowDimensions();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isCompact = width < 720;

  useEffect(() => {
    const unsubscribe = subscribeToMatches(
      (nextMatches) => {
        setMatches(nextMatches);
        setError(null);
        setIsLoading(false);
      },
      (snapshotError) => {
        setError(`Fixtures read failed: ${snapshotError.message}`);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const fixtureRows = useMemo(
    () =>
      matches.map((match) => ({
        ...match,
        teamA: teamByShortCode.get(match.teamAShort) ?? null,
        teamB: teamByShortCode.get(match.teamBShort) ?? null,
      })),
    [matches]
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageShell}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <BackButton fallbackHref="/(tabs)/home" />
              <View style={styles.headerTextWrap}>
                <Text style={styles.eyebrow}>Menu</Text>
                <Text style={styles.title}>Fixtures</Text>
              </View>
              <AppMenuButton onPress={() => setIsMenuOpen(true)} />
            </View>
            <Text style={styles.subtitle}>Season fixture list with match timing and current status.</Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.tableWrap}>
            <View style={[styles.tableHeader, isCompact && styles.tableHeaderCompact]}>
              <View style={[styles.matchCol, isCompact && styles.matchColCompact, styles.headerCellLeft]}>
                <Text style={styles.tableHeaderText}>Match</Text>
              </View>
              <View style={[styles.teamsCol, isCompact && styles.teamsColCompact, styles.headerCellCenter]}>
                <Text style={styles.tableHeaderText}>Teams</Text>
              </View>
              <View style={[styles.timeCol, isCompact && styles.timeColCompact, styles.headerCellLeft]}>
                <Text style={styles.tableHeaderText}>Start</Text>
              </View>
              <View style={[styles.statusCol, isCompact && styles.statusColCompact, styles.statusHeaderCell]}>
                <Text style={styles.tableHeaderText}>Status</Text>
              </View>
            </View>

            {isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color="#2463EB" />
                <Text style={styles.loadingText}>Loading fixtures...</Text>
              </View>
            ) : fixtureRows.length ? (
              fixtureRows.map((match) => (
                <FixtureRow key={match.id} match={match} isCompact={isCompact} />
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No fixtures yet</Text>
                <Text style={styles.emptyText}>Scheduled fixtures will appear here automatically.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

function FixtureRow({
  match,
  isCompact,
}: {
  match: MatchRecord & { teamA: TeamVisual | null; teamB: TeamVisual | null };
  isCompact: boolean;
}) {
  const teamsContent = isCompact ? (
    <View style={[styles.teamsCol, styles.teamsColCompact, styles.teamsCellCompact]}>
      <Text style={styles.teamCodeCompact}>{match.teamAShort}</Text>
      <Text style={[styles.vsText, styles.vsTextCompactStack]}>VS</Text>
      <Text style={styles.teamCodeCompact}>{match.teamBShort}</Text>
    </View>
  ) : (
    <View style={[styles.teamsCol, styles.teamsCell]}>
      <TeamCell
        shortCode={match.teamAShort}
        fullName={match.teamAName}
        align="left"
        isCompact={false}
      />
      <Text style={styles.vsText}>VS</Text>
      <TeamCell
        shortCode={match.teamBShort}
        fullName={match.teamBName}
        align="right"
        isCompact={false}
      />
    </View>
  );

  return (
    <View style={[styles.row, isCompact && styles.rowCompact]}>
      <Text style={[styles.rowMatchText, styles.matchCol, isCompact && styles.matchColCompact]}>
        Match {match.matchNumber}
      </Text>

      {teamsContent}

      <View style={[styles.timeCol, isCompact && styles.timeColCompact]}>
        <Text style={styles.rowPrimary}>{formatFixtureDate(match.startAt)}</Text>
        <Text style={styles.rowSecondary}>{formatFixtureTime(match.startAt)}</Text>
      </View>

      <View style={[styles.statusCol, isCompact && styles.statusColCompact, styles.statusCell]}>
        <View style={[styles.statusChip, getStatusChipStyle(match.status)]}>
          <Text style={styles.statusText}>{formatStatus(match.status)}</Text>
        </View>
      </View>
    </View>
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
        <Text style={styles.teamCodeCompact}>{shortCode}</Text>
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

function formatFixtureDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatFixtureTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatStatus(status: MatchRecord["status"]) {
  switch (status) {
    case "upcoming":
      return "Yet To Start";
    case "locked":
      return "Live";
    case "completed":
      return "Completed";
    case "settled":
      return "Completed";
    case "no_result":
      return "Draw";
    default:
      return status;
  }
}

function getStatusChipStyle(status: MatchRecord["status"]) {
  switch (status) {
    case "upcoming":
      return styles.statusScheduled;
    case "locked":
      return styles.statusLive;
    case "completed":
      return styles.statusCompleted;
    case "settled":
      return styles.statusSettled;
    case "no_result":
      return styles.statusNoResult;
    default:
      return styles.statusScheduled;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  content: {
    padding: 18,
    paddingTop: 36,
    paddingBottom: 40,
  },
  pageShell: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    gap: 22,
  },
  header: {
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  headerTextWrap: {
    flex: 1,
    gap: 6,
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
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#8EA0C1",
    fontSize: 16,
    lineHeight: 24,
    paddingRight: 8,
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
  matchCol: {
    width: 74,
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
  timeCol: {
    width: 88,
    paddingLeft: 12,
  },
  timeColCompact: {
    width: 72,
    paddingLeft: 0,
  },
  statusCol: {
    width: 96,
  },
  statusColCompact: {
    width: 88,
  },
  statusHeaderCell: {
    alignItems: "flex-end",
  },
  headerCellLeft: {
    alignItems: "flex-start",
  },
  headerCellCenter: {
    alignItems: "center",
  },
  rowMatchText: {
    color: "#DDE5F7",
    fontSize: 13,
    fontWeight: "700",
  },
  teamsCell: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  rowSecondary: {
    color: "#8EA0C1",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
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
  statusScheduled: {
    backgroundColor: "#16356D",
    borderColor: "#2E5DB0",
  },
  statusLive: {
    backgroundColor: "#352A12",
    borderColor: "#A37A1F",
  },
  statusCompleted: {
    backgroundColor: "#143323",
    borderColor: "#2B7B57",
  },
  statusSettled: {
    backgroundColor: "#103222",
    borderColor: "#1D6E49",
  },
  statusNoResult: {
    backgroundColor: "#342A1A",
    borderColor: "#7A5A1A",
  },
  statusText: {
    color: "#F7FAFF",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    color: "#D8E3FF",
    fontSize: 16,
    fontWeight: "600",
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
