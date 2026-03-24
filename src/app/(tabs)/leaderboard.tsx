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

import { subscribeToLeaderboardUsers } from "@/lib/auth";
import type { UserProfileRecord } from "@/lib/auth-types";
import { useAuth } from "@/providers/AuthProvider";

export default function LeaderboardTab() {
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const [users, setUsers] = useState<UserProfileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const currentUserEntry = useMemo(() => {
    return user ? rankedUsers.find((entry) => entry.uid === user.uid) ?? null : null;
  }, [rankedUsers, user]);

  const topThree = rankedUsers.slice(0, 3);
  const remainingUsers = rankedUsers.slice(3);

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
            <Text style={styles.eyebrow}>Season Standings</Text>
            <Text style={[styles.title, isDesktop && styles.headerTextDesktop]}>Leaderboard</Text>
            <Text style={[styles.subtitle, isDesktop && styles.headerTextDesktop]}>
              Ranked by points first, then wins, then fewer losses.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {currentUserEntry ? (
            <View style={styles.meCard}>
              <Text style={styles.meLabel}>Your Rank</Text>
              <View style={styles.meRow}>
                <Text style={styles.meRank}>#{currentUserEntry.rank}</Text>
                <View style={styles.meBody}>
                  <Text style={styles.meName}>{currentUserEntry.displayName}</Text>
                  <Text style={styles.meMeta}>
                    {currentUserEntry.points} pts - {currentUserEntry.wins}W -{" "}
                    {currentUserEntry.losses}L - {currentUserEntry.totalPredictions} picks
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {rankedUsers.length ? (
            <>
              <View style={[styles.podiumRow, isDesktop && styles.podiumRowDesktop]}>
                {topThree.map((entry, index) => (
                  <View
                    key={entry.uid}
                    style={[
                      styles.podiumCard,
                      index === 0 && styles.podiumCardFirst,
                      index === 1 && styles.podiumCardSecond,
                      index === 2 && styles.podiumCardThird,
                    ]}
                  >
                    <Text style={styles.podiumRank}>#{entry.rank}</Text>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(entry.displayName)}</Text>
                    </View>
                    <Text style={styles.podiumName}>{entry.displayName}</Text>
                    <Text style={styles.podiumPoints}>{entry.points} pts</Text>
                    <Text style={styles.podiumMeta}>
                      {entry.wins}W / {entry.losses}L
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.listCard}>
                <Text style={styles.listTitle}>Full Table</Text>
                {remainingUsers.map((entry) => {
                  const isCurrentUser = user?.uid === entry.uid;

                  return (
                    <View
                      key={entry.uid}
                      style={[styles.row, isCurrentUser && styles.rowCurrentUser]}
                    >
                      <Text style={styles.rowRank}>#{entry.rank}</Text>
                      <View style={styles.rowAvatar}>
                        <Text style={styles.rowAvatarText}>{getInitials(entry.displayName)}</Text>
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowName}>{entry.displayName}</Text>
                        <Text style={styles.rowMeta}>
                          {entry.wins}W - {entry.losses}L - {entry.totalPredictions} picks
                        </Text>
                      </View>
                      <Text style={styles.rowPoints}>{entry.points}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Full Table</Text>
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
    </SafeAreaView>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "P";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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
  meCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#355AA8",
    backgroundColor: "#102042",
    padding: 20,
    gap: 12,
  },
  meLabel: {
    color: "#7FAAFF",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  meRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  meRank: {
    color: "#F5F8FF",
    fontSize: 34,
    fontWeight: "900",
  },
  meBody: {
    flex: 1,
    gap: 4,
  },
  meName: {
    color: "#F5F8FF",
    fontSize: 22,
    fontWeight: "800",
  },
  meMeta: {
    color: "#AFC0E0",
    fontSize: 15,
    lineHeight: 22,
  },
  podiumRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  podiumRowDesktop: {
    justifyContent: "center",
  },
  podiumCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 10,
  },
  podiumCardFirst: {
    backgroundColor: "#1E2B4C",
    borderColor: "#5E83D1",
  },
  podiumCardSecond: {
    backgroundColor: "#16233F",
    borderColor: "#485F8E",
  },
  podiumCardThird: {
    backgroundColor: "#142038",
    borderColor: "#3D4D73",
  },
  podiumRank: {
    color: "#DCE7FF",
    fontSize: 18,
    fontWeight: "800",
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: "#2456C9",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#F5F8FF",
    fontSize: 22,
    fontWeight: "800",
  },
  podiumName: {
    color: "#F5F8FF",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  podiumPoints: {
    color: "#7FB0FF",
    fontSize: 18,
    fontWeight: "900",
  },
  podiumMeta: {
    color: "#9FB0CF",
    fontSize: 13,
    fontWeight: "600",
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 18,
    gap: 12,
  },
  listTitle: {
    color: "#F7FAFF",
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#0E1B36",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowCurrentUser: {
    borderWidth: 1,
    borderColor: "#355AA8",
  },
  rowRank: {
    width: 34,
    color: "#8EA0C1",
    fontSize: 16,
    fontWeight: "800",
  },
  rowAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
  },
  rowAvatarText: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
  rowMeta: {
    color: "#9FB0CF",
    fontSize: 13,
  },
  rowPoints: {
    color: "#7FB0FF",
    fontSize: 20,
    fontWeight: "900",
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
