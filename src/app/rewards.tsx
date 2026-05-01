import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { BackButton } from "@/components/BackButton";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import {
  getTimestampValue,
  subscribeToAllRewards,
  subscribeToWeeklySpinHistory,
} from "@/lib/spin";
import type { UserRewardRecord, WeeklySpinResultRecord } from "@/lib/spin-types";
import { useAuth } from "@/providers/AuthProvider";

type RewardsTab = "available" | "used" | "history";

export default function RewardsScreen() {
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [rewards, setRewards] = useState<UserRewardRecord[]>([]);
  const [spinHistory, setSpinHistory] = useState<WeeklySpinResultRecord[]>([]);
  const [activeTab, setActiveTab] = useState<RewardsTab>("available");

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setRewards([]);
        setSpinHistory([]);
        setIsLoading(false);
        return () => {};
      }

      setIsLoading(true);

      const unsubscribeRewards = subscribeToAllRewards(user.uid, (nextRewards) => {
        setRewards(nextRewards);
        setIsLoading(false);
      });
      const unsubscribeHistory = subscribeToWeeklySpinHistory(user.uid, (nextHistory) => {
        setSpinHistory(nextHistory);
        setIsLoading(false);
      });

      return () => {
        unsubscribeRewards();
        unsubscribeHistory();
      };
    }, [user])
  );

  const activeRewards = useMemo(() => {
    const now = Date.now();
    return rewards.filter((reward) => {
      if (reward.status !== "available") {
        return false;
      }
      if (
        reward.type !== "points_x2_next_win" &&
        reward.type !== "coins_x2_next_match_win"
      ) {
        return true;
      }
      const expiryTime = getTimestampValue(reward.expiresAt);
      return expiryTime <= 0 || expiryTime > now;
    });
  }, [rewards]);
  const usedRewards = useMemo(
    () =>
      rewards
        .filter((reward) => {
          if (reward.status === "used" || reward.status === "expired") {
            return true;
          }
          if (
            reward.status === "available" &&
            (reward.type === "points_x2_next_win" ||
              reward.type === "coins_x2_next_match_win")
          ) {
            const expiryTime = getTimestampValue(reward.expiresAt);
            return expiryTime > 0 && expiryTime <= Date.now();
          }
          return false;
        })
        .sort((left, right) => getTimestampValue(right.usedAt) - getTimestampValue(left.usedAt)),
    [rewards]
  );

  const activeRewardRows = activeRewards.map((reward) => ({
    id: reward.id,
    title: reward.label,
    detail: reward.capAmount ? `up to ${reward.capAmount.toLocaleString("en-IN")} coins` : null,
    subtitle: "You can apply this during bet placement.",
    statusLabel: "Available",
  }));

  const usedRewardRows = usedRewards.map((reward) => ({
    id: reward.id,
    title: reward.label,
    detail: reward.capAmount ? `up to ${reward.capAmount.toLocaleString("en-IN")} coins` : null,
    subtitle:
      reward.status === "used"
        ? formatDateTime(reward.usedAt)
        : `Expired ${formatDateTime(reward.expiresAt)}`,
    statusLabel: reward.status === "used" ? "Used" : "Expired",
  }));

  const spinHistoryRows = spinHistory.map((entry) => ({
    id: entry.id,
    title: entry.rewardLabel,
    detail: null,
    subtitle: `${entry.cycleId} | ${formatDateTime(entry.createdAt)}`,
    statusLabel: entry.rewardKind === "miss" ? "Miss" : "Won",
  }));
  const tabMeta =
    activeTab === "available"
      ? {
          title: "Available Rewards",
          rows: activeRewardRows,
          primaryHeader: "Reward",
          secondaryHeader: "Use",
          statusHeader: "State",
          emptyText: "No active rewards right now.",
        }
      : activeTab === "used"
        ? {
            title: "Used Rewards",
            rows: usedRewardRows,
            primaryHeader: "Reward",
            secondaryHeader: "Last Used",
            statusHeader: "State",
            emptyText: "No rewards used yet.",
          }
        : {
            title: "Weekly Spin History",
            rows: spinHistoryRows,
            primaryHeader: "Result",
            secondaryHeader: "Cycle",
            statusHeader: "Type",
            emptyText: "Your weekly spin history will appear here.",
          };

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          title="Rewards"
          leftSlot={<BackButton fallbackHref="/(tabs)/profile" />}
          rightSlot={<AppMenuButton onPress={() => setIsMenuOpen(true)} />}
          edgeToEdge
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageShell}>
          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color="#F2B84B" />
              <Text style={styles.loadingText}>Loading rewards...</Text>
            </View>
          ) : null}

          <View style={styles.tabBar}>
            <TabButton
              label="Available"
              active={activeTab === "available"}
              onPress={() => setActiveTab("available")}
            />
            <TabButton
              label="Used"
              active={activeTab === "used"}
              onPress={() => setActiveTab("used")}
            />
            <TabButton
              label="History"
              active={activeTab === "history"}
              onPress={() => setActiveTab("history")}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{tabMeta.title}</Text>
            <RewardsTable
              rows={tabMeta.rows}
              primaryHeader={tabMeta.primaryHeader}
              secondaryHeader={tabMeta.secondaryHeader}
              statusHeader={tabMeta.statusHeader}
              emptyText={tabMeta.emptyText}
            />
          </View>
        </View>
      </ScrollView>
      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Text
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive, active && styles.tabButtonTextActive]}
    >
      {label}
    </Text>
  );
}

function RewardRow({
  title,
  detail,
  subtitle,
  statusLabel,
}: {
  title: string;
  detail: string | null;
  subtitle: string;
  statusLabel: string;
}) {
  return (
    <View style={styles.rewardRow}>
      <View style={styles.rewardMainCell}>
        <Text style={styles.rewardTitle}>{title}</Text>
        {detail ? <Text style={styles.rewardTitleDetail}>{detail}</Text> : null}
      </View>
      <View style={styles.rewardMetaCell}>
        <Text style={styles.rewardSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.rewardStatusCell}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{statusLabel}</Text>
        </View>
      </View>
    </View>
  );
}

function RewardsTable({
  rows,
  primaryHeader,
  secondaryHeader,
  statusHeader,
  emptyText,
}: {
  rows: Array<{
    id: string;
    title: string;
    detail: string | null;
    subtitle: string;
    statusLabel: string;
  }>;
  primaryHeader: string;
  secondaryHeader: string;
  statusHeader: string;
  emptyText: string;
}) {
  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderText, styles.rewardMainCell]}>{primaryHeader}</Text>
        <Text style={[styles.tableHeaderText, styles.rewardMetaCell]}>{secondaryHeader}</Text>
        <Text style={[styles.tableHeaderText, styles.rewardStatusCell]}>{statusHeader}</Text>
      </View>
      {rows.length ? (
        <View style={styles.tableBody}>
          {rows.map((row) => (
            <RewardRow
              key={row.id}
              title={row.title}
              detail={row.detail}
              subtitle={row.subtitle}
              statusLabel={row.statusLabel}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

function formatDateTime(value: unknown) {
  const time = getTimestampValue(value);

  if (!time) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(time));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#091327",
  },
  topBannerWrap: {
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 40,
  },
  pageShell: {
    gap: 18,
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 36,
  },
  loadingText: {
    color: "#DDE5F7",
    fontSize: 16,
    fontWeight: "600",
  },
  sectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    paddingHorizontal: 14,
    paddingVertical: 18,
    gap: 12,
  },
  sectionTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
  },
  sectionHint: {
    color: "#8EA0C1",
    fontSize: 14,
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row",
    gap: 10,
  },
  tabButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    paddingVertical: 12,
    textAlign: "center",
    color: "#8EA0C1",
    fontSize: 14,
    fontWeight: "700",
  },
  tabButtonActive: {
    borderColor: "#F2B84B",
    backgroundColor: "#3A2E0D",
  },
  tabButtonTextActive: {
    color: "#F7D88D",
  },
  tableWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#223A63",
    overflow: "hidden",
    backgroundColor: "#0E1B36",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#132445",
    borderBottomWidth: 1,
    borderBottomColor: "#223A63",
    gap: 12,
  },
  tableHeaderText: {
    color: "#7FAAFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tableBody: {
    gap: 0,
  },
  emptyState: {
    paddingHorizontal: 12,
    paddingVertical: 18,
  },
  emptyText: {
    color: "#8EA0C1",
    fontSize: 14,
    lineHeight: 20,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1B2B4A",
  },
  rewardMainCell: {
    flex: 1.4,
  },
  rewardMetaCell: {
    flex: 1.2,
  },
  rewardStatusCell: {
    width: 86,
    alignItems: "flex-end",
  },
  rewardTitle: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  rewardTitleDetail: {
    color: "#8EA0C1",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  rewardSubtitle: {
    color: "#8EA0C1",
    fontSize: 13,
    lineHeight: 18,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: "#16356D",
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 72,
    alignItems: "center",
  },
  statusPillText: {
    color: "#DCE8FF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
