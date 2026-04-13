import { useEffect, useState } from "react";
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
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { BackButton } from "@/components/BackButton";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import { subscribeToMatches } from "@/lib/matches";
import type { MatchRecord } from "@/lib/match-types";

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

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          title="Fixtures"
          leftSlot={<BackButton fallbackHref="/(tabs)/home" />}
          rightSlot={<AppMenuButton onPress={() => setIsMenuOpen(true)} />}
          edgeToEdge
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageShell}>
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tableScrollContent}
          >
            <View style={styles.tableWrap}>
              <View style={styles.tableHeader}>
                <View style={[styles.matchCol, styles.headerCellLeft]}>
                  <Text style={styles.tableHeaderText}>#</Text>
                </View>
                <View style={[styles.timeCol, styles.headerCellCenter]}>
                  <Text style={styles.tableHeaderText}>Start</Text>
                </View>
                <View style={[styles.teamsCol, styles.headerCellCenter]}>
                  <Text style={styles.tableHeaderText}>Teams</Text>
                </View>
                <View style={[styles.venueCol, styles.headerCellLeft]}>
                  <Text style={styles.tableHeaderText}>Venue</Text>
                </View>
                <View style={[styles.statusCol, styles.statusHeaderCell]}>
                  <Text style={styles.tableHeaderText}>Status</Text>
                </View>
              </View>
              {isLoading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator size="large" color="#2463EB" />
                  <Text style={styles.loadingText}>Loading fixtures...</Text>
                </View>
              ) : matches.length ? (
                matches.map((match) => (
                  <FixtureRow key={match.id} match={match} isCompact={isCompact} />
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No fixtures yet</Text>
                  <Text style={styles.emptyText}>Scheduled fixtures will appear here automatically.</Text>
                </View>
              )}
            </View>
          </ScrollView>
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
  match: MatchRecord;
  isCompact: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowMatchText, styles.matchCol]}>
        #{match.matchNumber}
      </Text>

      <View style={[styles.timeCol, styles.timeCell]}>
        <Text style={styles.rowPrimary}>{formatFixtureDate(match.startAt)}</Text>
        <Text style={styles.rowSecondary}>{formatFixtureTime(match.startAt)}</Text>
      </View>

      <View style={[styles.teamsCol, styles.teamsCellInline]}>
        <Text style={styles.teamsInlineText} numberOfLines={1}>
          {match.teamAShort} <Text style={styles.teamsInlineVs}>vs</Text> {match.teamBShort}
        </Text>
      </View>

      <View style={styles.venueCol}>
        <Text style={styles.venueText} numberOfLines={isCompact ? 3 : 2}>
          {match.venue || "-"}
        </Text>
      </View>

      <View style={[styles.statusCol, styles.statusCell]}>
        <View style={[styles.statusChip, getStatusChipStyle(match.status)]}>
          <Text style={styles.statusText}>{formatStatus(match.status)}</Text>
        </View>
      </View>
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
    paddingHorizontal: 14,
    paddingBottom: 40,
    paddingTop: 14,
  },
  topBannerWrap: {
    overflow: "hidden",
  },
  pageShell: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    gap: 18,
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
    borderRadius: 22,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderColor: "#2F507E",
    backgroundColor: "#173055",
    overflow: "hidden",
    minWidth: 520,
  },
  tableScrollContent: {
    paddingBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: "#132445",
    borderBottomWidth: 1,
    borderBottomColor: "#223A63",
    gap: 2,
  },
  tableHeaderText: {
    color: "#7FAAFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 14,
    gap: 2,
    backgroundColor: "#19325A",
    borderBottomWidth: 1,
    borderBottomColor: "#1B2B4A",
  },
  matchCol: {
    width: 28,
    paddingLeft: 6,
  },
  teamsCol: {
    width: 102,
  },
  venueCol: {
    width: 144,
  },
  timeCol: {
    width: 62,
  },
  statusCol: {
    width: 96,
  },
  statusHeaderCell: {
    alignItems: "center",
  },
  headerCellLeft: {
    alignItems: "flex-start",
  },
  headerCellCenter: {
    alignItems: "center",
  },
  rowMatchText: {
    color: "#DDE5F7",
    fontSize: 12,
    fontWeight: "700",
  },
  venueText: {
    color: "#A8B5D0",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  teamsCellInline: {
    justifyContent: "center",
  },
  teamsInlineText: {
    color: "#F7FAFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  teamsInlineVs: {
    color: "#60759D",
    fontSize: 12,
    fontWeight: "900",
  },
  rowPrimary: {
    color: "#F5F8FF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  rowSecondary: {
    color: "#8EA0C1",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  timeCell: {
    alignItems: "center",
  },
  statusCell: {
    alignItems: "flex-end",
  },
  statusChip: {
    minWidth: 84,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
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
    textAlign: "center",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    backgroundColor: "#173055",
    gap: 12,
  },
  loadingText: {
    color: "#D8E3FF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: "#173055",
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
