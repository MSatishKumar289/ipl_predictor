import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { CoinAmount } from "@/components/CoinAmount";
import {
  REFERRAL_REWARD_AMOUNT,
  getReferralStatusLabel,
  subscribeToUserReferrals,
} from "@/lib/referrals";
import type { ReferralRecord } from "@/lib/referral-types";
import { useAuth } from "@/providers/AuthProvider";

function getTimestampValue(value: unknown) {
  if (!value) {
    return 0;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (
    typeof value === "object" &&
    value &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value === "object" &&
    value &&
    "seconds" in value &&
    typeof value.seconds === "number"
  ) {
    return value.seconds * 1000;
  }

  return 0;
}

function formatDateTime(value: unknown) {
  const timestamp = getTimestampValue(value);

  if (!timestamp) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function StatusChip({ status }: { status: ReferralRecord["status"] }) {
  const isRewarded = status === "rewarded";
  const isPending = status === "pending";

  return (
    <View
      style={[
        styles.statusChip,
        isRewarded
          ? styles.statusChipRewarded
          : isPending
            ? styles.statusChipPending
            : styles.statusChipProgress,
      ]}
    >
      <Text style={styles.statusChipText}>{getReferralStatusLabel(status)}</Text>
    </View>
  );
}

function ReferralRow({
  referral,
  isCompact,
}: {
  referral: ReferralRecord;
  isCompact: boolean;
}) {
  return (
    <View style={[styles.row, isCompact && styles.rowCompact]}>
      <Text style={[styles.cellText, styles.nameCol]} numberOfLines={2}>
        {referral.referredName?.trim() || "--"}
      </Text>
      <Text style={[styles.cellText, styles.mobileCol]} numberOfLines={1}>
        {referral.referredPhoneNumber}
      </Text>
      <View style={[styles.statusCol, styles.statusCell]}>
        <StatusChip status={referral.status} />
      </View>
      {referral.status === "rewarded" ? (
        <CoinAmount
          value={referral.rewardAmount.toLocaleString("en-IN")}
          color="#5FE4A9"
          size={14}
          weight="700"
          iconSize={11}
          style={styles.rewardCol}
          textStyle={styles.cellText}
        />
      ) : (
        <Text style={[styles.cellText, styles.rewardCol, styles.pendingText]} numberOfLines={1}>
          Pending
        </Text>
      )}
      <Text style={[styles.cellText, styles.dateCol]} numberOfLines={2}>
        {formatDateTime(referral.rewardedAt ?? referral.createdAt)}
      </Text>
    </View>
  );
}

export default function MyReferralsScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isCompact = width < 720;

  useEffect(() => {
    if (!user) {
      setReferrals([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubscribe = subscribeToUserReferrals(
      user.uid,
      (nextReferrals) => {
        setReferrals(nextReferrals);
        setError(null);
        setIsLoading(false);
      },
      (nextError) => {
        setReferrals([]);
        setError(`Referrals read failed: ${nextError.message}`);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const totals = useMemo(
    () => ({
      total: referrals.length,
      rewarded: referrals.filter((entry) => entry.status === "rewarded").length,
      earned: referrals
        .filter((entry) => entry.status === "rewarded")
        .reduce((sum, entry) => sum + (entry.rewardAmount || REFERRAL_REWARD_AMOUNT), 0),
    }),
    [referrals]
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
                <Text style={styles.title}>My Referrals</Text>
              </View>
              <AppMenuButton onPress={() => setIsMenuOpen(true)} />
            </View>
            <Text style={styles.subtitle}>
              Track sent referrals, signup progress, and bonus credit status.
            </Text>
          </View>

          <View style={styles.summaryWrap}>
            <View style={styles.summaryRow}>
              <SummaryCard label="Total" value={String(totals.total)} accent />
              <SummaryCard label="Rewarded" value={String(totals.rewarded)} />
            </View>
            <SummaryCard
              label="Earned"
              value={
                <CoinAmount
                  value={totals.earned.toLocaleString("en-IN")}
                  size={26}
                  weight="800"
                  iconSize={18}
                />
              }
              fullWidth
            />
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Firestore error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.tableWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={[styles.tableHeader, isCompact && styles.tableHeaderCompact]}>
                  <Text style={[styles.tableHeaderText, styles.nameCol]}>Name</Text>
                  <Text style={[styles.tableHeaderText, styles.mobileCol]}>Mobile</Text>
                  <Text style={[styles.tableHeaderText, styles.statusCol]}>Status</Text>
                  <Text style={[styles.tableHeaderText, styles.rewardCol]}>Bonus</Text>
                  <Text style={[styles.tableHeaderText, styles.dateCol]}>Date Time</Text>
                </View>

                {isLoading ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator size="large" color="#2463EB" />
                    <Text style={styles.loadingText}>Loading referrals...</Text>
                  </View>
                ) : referrals.length ? (
                  referrals.map((referral) => (
                    <ReferralRow key={referral.id} referral={referral} isCompact={isCompact} />
                  ))
                ) : (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyTitle}>No referrals sent yet</Text>
                    <Text style={styles.emptyText}>
                      Referred users and their bonus status will appear here automatically.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
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
    <View
      style={[
        styles.summaryCard,
        fullWidth && styles.summaryCardFullWidth,
        accent && styles.summaryCardAccent,
      ]}
    >
      <Text style={[styles.summaryLabel, accent && styles.summaryLabelAccent]}>{label}</Text>
      {typeof value === "string" ? <Text style={styles.summaryValue}>{value}</Text> : value}
    </View>
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
  summaryWrap: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: 160,
    minHeight: 84,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "space-between",
  },
  summaryCardFullWidth: {
    flexBasis: "100%",
    width: "100%",
  },
  summaryCardAccent: {
    borderColor: "#2D8F68",
  },
  summaryLabel: {
    color: "#8EA0C1",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  summaryLabelAccent: {
    color: "#5FE4A9",
  },
  summaryValue: {
    color: "#F7FAFF",
    fontSize: 26,
    fontWeight: "800",
  },
  errorCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#5F2E44",
    backgroundColor: "#2A1320",
    padding: 18,
    gap: 8,
  },
  errorTitle: {
    color: "#FFD7E2",
    fontSize: 16,
    fontWeight: "800",
  },
  errorText: {
    color: "#F2B7C9",
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
    paddingHorizontal: 14,
  },
  tableHeaderText: {
    color: "#7FAAFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 74,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A2B4B",
    gap: 12,
  },
  rowCompact: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nameCol: {
    width: 180,
  },
  mobileCol: {
    width: 130,
  },
  statusCol: {
    width: 170,
  },
  rewardCol: {
    width: 110,
  },
  dateCol: {
    width: 130,
  },
  cellText: {
    color: "#F1F5FF",
    fontSize: 14,
    fontWeight: "700",
  },
  statusCell: {
    alignItems: "flex-start",
  },
  statusChip: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statusChipPending: {
    backgroundColor: "#253557",
    borderColor: "#38507C",
  },
  statusChipProgress: {
    backgroundColor: "#193561",
    borderColor: "#2E69C4",
  },
  statusChipRewarded: {
    backgroundColor: "#153728",
    borderColor: "#2D8F68",
  },
  statusChipText: {
    color: "#F7FAFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pendingText: {
    color: "#AFC0DE",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 12,
  },
  loadingText: {
    color: "#AFC0DE",
    fontSize: 15,
    fontWeight: "600",
  },
  emptyRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 34,
    paddingHorizontal: 18,
    gap: 8,
  },
  emptyTitle: {
    color: "#F7FAFF",
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: "#AFC0DE",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 420,
  },
});
