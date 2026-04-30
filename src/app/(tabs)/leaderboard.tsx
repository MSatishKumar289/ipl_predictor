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
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { CoinAmount } from "@/components/CoinAmount";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import { subscribeToLeaderboardUsers } from "@/lib/auth";
import type { UserProfileRecord } from "@/lib/auth-types";
import {
  getTimestampValue,
  subscribeToRecentSpinResults,
  subscribeToWeeklySpinCampaigns,
  subscribeToWeeklySpinConfig,
} from "@/lib/spin";
import type {
  WeeklySpinCampaignRecord,
  WeeklySpinConfig,
  WeeklySpinResultRecord,
} from "@/lib/spin-types";
import { useAuth } from "@/providers/AuthProvider";

type LeaderboardViewTab = "leaderboard" | "unlisted_users" | "spin_winners";

export default function LeaderboardTab() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [listedUsers, setListedUsers] = useState<UserProfileRecord[]>([]);
  const [unlistedUsers, setUnlistedUsers] = useState<UserProfileRecord[]>([]);
  const [spinResults, setSpinResults] = useState<WeeklySpinResultRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSpinLoading, setIsSpinLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedCampaignKey, setExpandedCampaignKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeaderboardViewTab>("leaderboard");
  const [spinCampaigns, setSpinCampaigns] = useState<WeeklySpinCampaignRecord[]>([]);
  const [spinConfig, setSpinConfig] = useState<WeeklySpinConfig | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToLeaderboardUsers(
      ({ listedUsers: nextListedUsers, unlistedUsers: nextUnlistedUsers }) => {
        setListedUsers(nextListedUsers);
        setUnlistedUsers(nextUnlistedUsers);
        setError(null);
        setIsLoading(false);
      },
      (snapshotError) => {
        setListedUsers([]);
        setUnlistedUsers([]);
        setError(`Leaderboard read failed: ${snapshotError.message}`);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribeConfig = subscribeToWeeklySpinConfig(
      (nextConfig) => {
        setSpinConfig(nextConfig);
      },
      () => {
        setSpinConfig(null);
      }
    );
    const unsubscribeCampaigns = subscribeToWeeklySpinCampaigns(
      (nextCampaigns) => {
        setSpinCampaigns(nextCampaigns);
      },
      () => {
        setSpinCampaigns([]);
      }
    );

    return () => {
      unsubscribeConfig();
      unsubscribeCampaigns();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToRecentSpinResults(
      (nextResults) => {
        setSpinResults(nextResults);
        setSpinError(null);
        setIsSpinLoading(false);
      },
      (snapshotError) => {
        setSpinResults([]);
        setSpinError(`Spin winners read failed: ${snapshotError.message}`);
        setIsSpinLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const isDesktop = width >= 1024;

  const activeUsers = useMemo(
    () => (activeTab === "unlisted_users" ? unlistedUsers : listedUsers),
    [activeTab, listedUsers, unlistedUsers]
  );

  const rankedUsers = useMemo(
    () =>
      activeUsers.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      })),
    [activeUsers]
  );

  const userNameById = useMemo(
    () =>
      new Map(
        [...listedUsers, ...unlistedUsers].map(
          (entry) => [entry.uid, entry.displayName] as const
        )
      ),
    [listedUsers, unlistedUsers]
  );

  const winnersRows = useMemo(
    () =>
      spinResults
        .filter((entry) => entry.rewardKind !== "miss")
        .map((entry, index) => ({
          id: entry.id,
          rank: index + 1,
          cycleId: entry.cycleId,
          name: userNameById.get(entry.userId) ?? "Player",
          reward: entry.rewardLabel,
          createdAt: entry.createdAt,
        })),
    [spinResults, userNameById]
  );
  const campaignLabelByCycleId = useMemo(() => {
    return new Map<string, string>(
      spinCampaigns.map((campaign) => [
        `campaign_${campaign.campaignNumber}`,
        `Campaign #${campaign.campaignNumber}`,
      ] as const)
    );
  }, [spinCampaigns]);
  const activePublishedCampaign = useMemo(() => {
    if (!spinConfig?.activeCampaignId) {
      return null;
    }
    return (
      spinCampaigns.find(
        (campaign) =>
          campaign.id === spinConfig.activeCampaignId && campaign.status === "live"
      ) ?? null
    );
  }, [spinCampaigns, spinConfig]);
  const activeCampaignCycleId = activePublishedCampaign
    ? `campaign_${activePublishedCampaign.campaignNumber}`
    : null;
  const spinSections = useMemo(() => {
    const byCycle = new Map<
      string,
      {
        cycleId: string;
        campaignNumber: number | null;
        latestEntryMs: number;
        rows: typeof winnersRows;
      }
    >();

    for (const row of winnersRows) {
      const cycleId = row.cycleId;
      const campaignMatch = /^campaign_(\d+)$/.exec(cycleId);
      const campaignNumber = campaignMatch ? Number(campaignMatch[1]) : null;
      const rowMs = getTimestampValue(row.createdAt);
      const current = byCycle.get(cycleId);

      if (!current) {
        byCycle.set(cycleId, {
          cycleId,
          campaignNumber,
          latestEntryMs: rowMs,
          rows: [row],
        });
        continue;
      }

      current.rows.push(row);
      current.latestEntryMs = Math.max(current.latestEntryMs, rowMs);
    }

    return [...byCycle.values()]
      .map((section) => ({
        ...section,
        rows: [...section.rows].sort(
          (left, right) => getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt)
        ),
      }))
      .sort((left, right) => {
        if (left.campaignNumber != null && right.campaignNumber != null) {
          return right.campaignNumber - left.campaignNumber;
        }
        if (left.campaignNumber != null) {
          return -1;
        }
        if (right.campaignNumber != null) {
          return 1;
        }
        return right.latestEntryMs - left.latestEntryMs;
      });
  }, [winnersRows]);

  useEffect(() => {
    if (!spinSections.length) {
      setExpandedCampaignKey(null);
      return;
    }
    if (activeCampaignCycleId) {
      setExpandedCampaignKey(activeCampaignCycleId);
      return;
    }
    setExpandedCampaignKey((current) => current ?? spinSections[0].cycleId);
  }, [activeCampaignCycleId, spinSections]);

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
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          title="Leaderboard"
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
          {(activeTab === "leaderboard" || activeTab === "unlisted_users") && error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {activeTab === "spin_winners" && spinError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{spinError}</Text>
            </View>
          ) : null}

          <View style={styles.tabsWrap}>
            <View style={styles.tabBar}>
              <LeaderboardTabButton
                label="Leaderboard"
                active={activeTab === "leaderboard"}
                onPress={() => setActiveTab("leaderboard")}
              />
              <LeaderboardTabButton
                label="Unranked Users"
                active={activeTab === "unlisted_users"}
                onPress={() => setActiveTab("unlisted_users")}
              />
              <LeaderboardTabButton
                label="Spin Winners"
                active={activeTab === "spin_winners"}
                onPress={() => setActiveTab("spin_winners")}
              />
            </View>
            <View style={styles.tabsDivider} />
          </View>

          {activeTab === "leaderboard" || activeTab === "unlisted_users" ? (
            rankedUsers.length ? (
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.rankCol]}>#</Text>
                <Text style={[styles.tableHeaderText, styles.nameCol]}>Name</Text>
                <Text style={[styles.tableHeaderText, styles.pointsCol]}>Pts</Text>
                {isDesktop ? (
                  <>
                    <Text style={[styles.tableHeaderText, styles.recordCol]}>W/L</Text>
                    <Text style={[styles.tableHeaderText, styles.picksCol]}>Picks</Text>
                    <View style={[styles.metricHeaderCol, styles.wheelPointsCol]}>
                      <Text style={styles.metricEmoji}>🎡</Text>
                      <Text style={styles.tableHeaderText}>Pts</Text>
                    </View>
                    <View style={[styles.metricHeaderCol, styles.wheelCoinsCol]}>
                      <Text style={styles.metricEmoji}>🎡</Text>
                      <Text style={styles.tableHeaderText}>Coin</Text>
                    </View>
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
                    <View style={[styles.metricCell, styles.wheelPointsCol]}>
                      <Text style={styles.metricEmoji}>🎡</Text>
                      <Text style={[styles.tableCell, styles.metricValue]}>
                        {(entry.wheelPointsEarned ?? 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View style={[styles.metricCell, styles.wheelCoinsCol]}>
                      <Text style={styles.metricEmoji}>🎡</Text>
                      <Text style={[styles.tableCell, styles.metricValue]}>
                        {(entry.wheelCoinsEarned ?? 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
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
                        <View style={styles.expandedItem}>
                          <View style={styles.expandedIconLabel}>
                            <Text style={styles.metricEmoji}>🎡</Text>
                            <Text style={styles.expandedLabel}>Pts</Text>
                          </View>
                          <Text style={styles.expandedValue}>
                            {(entry.wheelPointsEarned ?? 0).toLocaleString("en-IN")}
                          </Text>
                        </View>
                        <View style={styles.expandedItem}>
                          <View style={styles.expandedIconLabel}>
                            <Text style={styles.metricEmoji}>🎡</Text>
                            <Text style={styles.expandedLabel}>Coin</Text>
                          </View>
                          <Text style={styles.expandedValue}>
                            {(entry.wheelCoinsEarned ?? 0).toLocaleString("en-IN")}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
            ) : (
            <View style={styles.tableCard}>
              <Text style={styles.listTitle}>
                {activeTab === "unlisted_users" ? "Unranked Users" : "Leaderboard"}
              </Text>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  {activeTab === "unlisted_users"
                    ? "No unranked users right now"
                    : "No leaderboard data yet"}
                </Text>
                <Text style={styles.emptyText}>
                  {activeTab === "unlisted_users"
                    ? "Users below the 35% participation threshold will appear here."
                    : "Once users place and settle predictions, rankings will appear here."}
                </Text>
              </View>
            </View>
            )
          ) : isSpinLoading ? (
            <View style={styles.tableCard}>
              <View style={styles.loadingInline}>
                <ActivityIndicator size="small" color="#2463EB" />
                <Text style={styles.loadingInlineText}>Loading spin winners...</Text>
              </View>
            </View>
          ) : spinSections.length ? (
            <View>
              {spinSections.map((section) => {
                const isExpanded = expandedCampaignKey === section.cycleId;
                const campaignLabel =
                  campaignLabelByCycleId.get(section.cycleId) ??
                  (section.campaignNumber != null
                    ? `Campaign #${section.campaignNumber}`
                    : section.cycleId);

                return (
                  <View key={section.cycleId} style={styles.campaignSection}>
                    <Pressable
                      style={styles.campaignSectionHeader}
                      onPress={() =>
                        setExpandedCampaignKey((current) =>
                          current === section.cycleId ? null : section.cycleId
                        )
                      }
                    >
                      <Text style={styles.campaignSectionTitle}>{campaignLabel}</Text>
                      <Text style={styles.campaignSectionToggle}>
                        {isExpanded ? "Hide" : "Show"}
                      </Text>
                    </Pressable>
                    {isExpanded ? (
                      <>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.tableHeaderText, styles.rankCol]}>#</Text>
                          <Text style={[styles.tableHeaderText, styles.nameCol]}>Name</Text>
                          <Text style={[styles.tableHeaderText, styles.spinRewardCol]}>Reward</Text>
                          <Text style={[styles.tableHeaderText, styles.spinTimeCol]}>When</Text>
                        </View>
                        {section.rows.map((entry, index) => (
                          <View key={entry.id} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.rankCol, styles.rankCell]}>
                              #{index + 1}
                            </Text>
                            <View style={[styles.nameCol, styles.nameCell]}>
                              <Text style={styles.nameText} numberOfLines={1}>
                                {entry.name}
                              </Text>
                            </View>
                            <Text style={[styles.tableCell, styles.spinRewardCol]} numberOfLines={1}>
                              {entry.reward}
                            </Text>
                            <Text style={[styles.tableCell, styles.spinTimeCol]}>
                              {formatSpinWinnerTime(entry.createdAt)}
                            </Text>
                          </View>
                        ))}
                      </>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.tableCard}>
              <Text style={styles.listTitle}>Spin Winners</Text>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No winners yet</Text>
                <Text style={styles.emptyText}>Recent winning spins will appear here.</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

function LeaderboardTabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
      {active ? <View style={styles.tabButtonUnderline} /> : null}
    </Pressable>
  );
}

function formatSpinWinnerTime(value: unknown) {
  const millis = getTimestampValue(value);

  if (!millis) {
    return "-";
  }

  return new Date(millis).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    gap: 24,
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
    maxWidth: 1040,
    gap: 24,
  },
  tabsWrap: {
    gap: 8,
  },
  tabBar: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 12,
  },
  tabsDivider: {
    borderBottomWidth: 2,
    borderBottomColor: "#2B426A",
  },
  tabButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingBottom: 10,
    position: "relative",
  },
  tabButtonText: {
    color: "#9FB0CF",
    fontSize: 14,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#2F7FFF",
  },
  tabButtonUnderline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#2F7FFF",
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
  loadingInline: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingInlineText: {
    color: "#D8E3FF",
    fontSize: 14,
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
  tableCard: {
    borderRadius: 24,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
  expandedIconLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  wheelPointsCol: {
    width: 64,
  },
  wheelCoinsCol: {
    width: 84,
  },
  balanceCol: {
    width: 86,
    textAlign: "right",
  },
  metricHeaderCol: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  metricEmoji: {
    fontSize: 12,
    lineHeight: 14,
  },
  metricCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  metricValue: {
    textAlign: "center",
  },
  spinRewardCol: {
    flex: 1,
    paddingHorizontal: 6,
  },
  spinTimeCol: {
    width: 88,
    textAlign: "right",
    color: "#9FB0CF",
    fontSize: 12,
    fontWeight: "600",
  },
  campaignSection: {
    borderWidth: 1,
    borderColor: "#27477D",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#0D1F43",
  },
  campaignSectionHeader: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1E3564",
  },
  campaignSectionTitle: {
    color: "#E9F1FF",
    fontSize: 16,
    fontWeight: "800",
  },
  campaignSectionToggle: {
    color: "#8FB2FF",
    fontSize: 13,
    fontWeight: "700",
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
