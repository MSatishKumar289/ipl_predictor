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
import { SafeAreaView } from "react-native-safe-area-context";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { CoinAmount } from "@/components/CoinAmount";
import { subscribeToLeaderboardUsers } from "@/lib/auth";
import type { UserProfileRecord } from "@/lib/auth-types";
import { useAuth } from "@/providers/AuthProvider";

export default function LeaderboardTab() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [users, setUsers] = useState<UserProfileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToLeaderboardUsers(
      (nextUsers) => {
        setUsers(nextUsers);
        setError(null);
        setIsLoading(false);
      },
      (snapshotError) => {
        setUsers([]);
        setError(`Leaderboard read failed: ${snapshotError.message}`);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const isDesktop = width >= 1024;

  const rankedUsers = useMemo(
    () =>
      users.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      })),
    [users]
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#2463EB" />
          <Text style={styles.loadingText}>Loading leaderboard...</Text>
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
            <View style={[styles.headerTopRow, isDesktop && styles.headerTopRowDesktop]}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.eyebrow}>Season Standings</Text>
                <Text style={[styles.title, isDesktop && styles.headerTextDesktop]}>
                  Leaderboard
                </Text>
                <Text style={[styles.subtitle, isDesktop && styles.headerTextDesktop]}>
                  Ranked by points first, then wins, then fewer losses.
                </Text>
              </View>
              <AppMenuButton onPress={() => setIsMenuOpen(true)} />
            </View>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {rankedUsers.length ? (
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.rankCol]}>#</Text>
                <Text style={[styles.tableHeaderText, styles.nameCol]}>Name</Text>
                <Text style={[styles.tableHeaderText, styles.pointsCol]}>Pts</Text>
                {isDesktop ? (
                  <>
                    <Text style={[styles.tableHeaderText, styles.recordCol]}>W/L</Text>
                    <Text style={[styles.tableHeaderText, styles.picksCol]}>Picks</Text>
                  </>
                ) : null}
                <Text style={[styles.tableHeaderText, styles.balanceCol]}>Pocket</Text>
              </View>
              {rankedUsers.map((entry) => {
                const isCurrentUser = user?.uid === entry.uid;
                const isExpanded = expandedUserId === entry.uid;

                return isDesktop ? (
                  <View key={entry.uid} style={[styles.tableRow, isCurrentUser && styles.tableRowCurrentUser]}>
                    <Text style={[styles.tableCell, styles.rankCol, styles.rankCell]}>#{entry.rank}</Text>
                    <View style={[styles.nameCol, styles.nameCell]}>
                      <Text style={styles.nameText} numberOfLines={1}>
                        {entry.displayName}
                      </Text>
                    </View>
                    <Text style={[styles.tableCell, styles.pointsCol, styles.pointsCell]}>{entry.points}</Text>
                    <Text style={[styles.tableCell, styles.recordCol]}>
                      {entry.wins}/{entry.losses}
                    </Text>
                    <Text style={[styles.tableCell, styles.picksCol]}>{entry.totalPredictions}</Text>
                    <CoinAmount
                      value={entry.balance.toLocaleString("en-IN")}
                      color="#73E2A8"
                      size={12}
                      weight="700"
                      iconSize={10}
                      align="right"
                      style={styles.balanceCol}
                      textStyle={styles.balanceCell}
                    />
                  </View>
                ) : (
                  <View key={entry.uid} style={isCurrentUser && styles.mobileCurrentUserWrap}>
                    <Pressable
                      style={[styles.tableRow, isCurrentUser && styles.tableRowCurrentUser]}
                      onPress={() =>
                        setExpandedUserId((current) => (current === entry.uid ? null : entry.uid))
                      }
                    >
                      <Text style={[styles.tableCell, styles.rankCol, styles.rankCell]}>#{entry.rank}</Text>
                      <View style={[styles.nameCol, styles.nameCell]}>
                        <Text style={styles.nameText} numberOfLines={1}>
                          {entry.displayName}
                        </Text>
                      </View>
                      <Text style={[styles.tableCell, styles.pointsCol, styles.pointsCell]}>{entry.points}</Text>
                      <CoinAmount
                        value={entry.balance.toLocaleString("en-IN")}
                        color="#73E2A8"
                        size={12}
                        weight="700"
                        iconSize={10}
                        align="right"
                        style={styles.balanceCol}
                        textStyle={styles.balanceCell}
                      />
                    </Pressable>
                    {isExpanded ? (
                      <View style={[styles.expandedRow, isCurrentUser && styles.expandedRowCurrentUser]}>
                        <View style={styles.expandedItem}>
                          <Text style={styles.expandedLabel}>W/L</Text>
                          <Text style={styles.expandedValue}>
                            {entry.wins}/{entry.losses}
                          </Text>
                        </View>
                        <View style={styles.expandedItem}>
                          <Text style={styles.expandedLabel}>Picks</Text>
                          <Text style={styles.expandedValue}>{entry.totalPredictions}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.tableCard}>
              <Text style={styles.listTitle}>Leaderboard</Text>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No leaderboard data yet</Text>
                <Text style={styles.emptyText}>
                  Once users place and settle predictions, rankings will appear here.
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
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
    gap: 24,
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
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  headerTopRowDesktop: {
    width: "100%",
    maxWidth: 720,
  },
  headerTextWrap: {
    flex: 1,
    gap: 8,
  },
  headerDesktop: {
    alignItems: "center",
    marginBottom: 6,
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
  tableCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    overflow: "hidden",
  },
  listTitle: {
    color: "#F7FAFF",
    fontSize: 21,
    fontWeight: "700",
    paddingHorizontal: 18,
    paddingTop: 18,
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#132445",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tableHeaderText: {
    color: "#7FAAFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0E1B36",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#1B2B4A",
  },
  tableRowCurrentUser: {
    backgroundColor: "#11254A",
  },
  mobileCurrentUserWrap: {
    backgroundColor: "#11254A",
  },
  expandedRow: {
    flexDirection: "row",
    gap: 18,
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 14,
    backgroundColor: "#0E1B36",
  },
  expandedRowCurrentUser: {
    backgroundColor: "#11254A",
  },
  expandedItem: {
    flex: 1,
    gap: 4,
    alignItems: "center",
  },
  expandedLabel: {
    color: "#8EA0C1",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  expandedValue: {
    color: "#F7FAFF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  tableCell: {
    color: "#DDE5F7",
    fontSize: 13,
    fontWeight: "600",
  },
  rankCol: {
    width: 40,
  },
  rankCell: {
    color: "#8EA0C1",
    fontWeight: "800",
  },
  nameCol: {
    flex: 1,
  },
  nameCell: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  nameText: {
    color: "#F7FAFF",
    fontSize: 14,
    fontWeight: "700",
  },
  pointsCol: {
    width: 40,
  },
  pointsCell: {
    color: "#7FB0FF",
    fontWeight: "900",
    textAlign: "center",
  },
  recordCol: {
    width: 44,
    textAlign: "center",
  },
  picksCol: {
    width: 42,
    textAlign: "center",
  },
  balanceCol: {
    width: 86,
    textAlign: "right",
  },
  balanceCell: {
    color: "#73E2A8",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: "#0E1B36",
    margin: 18,
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
