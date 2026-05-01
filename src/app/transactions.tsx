import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { AppScreenBackground } from "@/components/AppScreenBackground";
import { BackButton } from "@/components/BackButton";
import { CoinAmount } from "@/components/CoinAmount";
import { StickyHeaderBar } from "@/components/StickyHeaderBar";
import { db } from "@/lib/firebase";
import type { PredictionRecord } from "@/lib/prediction-types";
import { useAppData } from "@/providers/AppDataProvider";
import { useAuth } from "@/providers/AuthProvider";

type TransactionRecord = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  note: string;
  createdAt?: unknown;
};

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

export default function TransactionsScreen() {
  const { user, profile } = useAuth();
  const { userPredictions } = useAppData();
  const { width } = useWindowDimensions();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [predictions, setPredictions] = useState<Record<string, PredictionRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isCompact = width < 720;

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setTransactions([]);
        setPredictions({});
        setIsLoading(false);
        return () => {};
      }

      setIsLoading(true);
      const transactionsQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));

      const unsubscribe = onSnapshot(
        transactionsQuery,
        (snapshot) => {
          const nextTransactions = snapshot.docs
            .map((entry) => ({
              id: entry.id,
              ...(entry.data() as Omit<TransactionRecord, "id">),
            }))
            .sort(
              (left, right) =>
                getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt)
            );

          setTransactions(nextTransactions);
          setError(null);
          setIsLoading(false);
        },
        (snapshotError) => {
          setTransactions([]);
          setError(`Transactions read failed: ${snapshotError.message}`);
          setIsLoading(false);
        }
      );

      return unsubscribe;
    }, [user])
  );

  useEffect(() => {
    if (!user || !userPredictions.length) {
      setPredictions({});
      return;
    }

    setPredictions(
      userPredictions.reduce<Record<string, PredictionRecord>>((accumulator, prediction) => {
        accumulator[prediction.matchId] = prediction;
        return accumulator;
      }, {})
    );
  }, [user, userPredictions]);

  const totals = useMemo(
    () => ({
      credits: transactions
        .filter((entry) => isVisibleTransaction(entry, predictions))
        .filter((entry) => entry.amount > 0).length,
      debits: transactions
        .filter((entry) => isVisibleTransaction(entry, predictions))
        .filter((entry) => entry.amount < 0).length,
    }),
    [predictions, transactions]
  );

  const visibleTransactions = useMemo(
    () => getVisibleTransactions(transactions, predictions),
    [predictions, transactions]
  );

  return (
    <SafeAreaView style={styles.screen}>
      <AppScreenBackground />
      <View style={styles.topBannerWrap}>
        <StickyHeaderBar
          title="Transactions"
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

          <View style={styles.summaryWrap}>
            <View style={styles.summaryRow}>
              <SummaryCard label="Credits" value={String(totals.credits)} accent />
              <SummaryCard label="Debits" value={String(totals.debits)} />
            </View>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <CoinAmount
                value={(profile?.balance ?? 0).toLocaleString("en-IN")}
                size={20}
                weight="800"
                iconSize={15}
                style={styles.balanceAmountRow}
              />
            </View>
          </View>

          <View style={styles.tableWrap}>
            <View style={[styles.tableHeader, isCompact && styles.tableHeaderCompact]}>
              <Text
                style={[
                  styles.tableHeaderText,
                  styles.descriptionCol,
                  styles.descriptionHeaderText,
                ]}
              >
                Ref
              </Text>
              <Text
                style={[
                  styles.tableHeaderText,
                  styles.amountCol,
                  isCompact && styles.amountColCompact,
                ]}
              >
                Amount
              </Text>
              <Text
                style={[
                  styles.tableHeaderText,
                  styles.operationCol,
                  isCompact && styles.operationColCompact,
                ]}
              >
                Txn
              </Text>
              <Text
                style={[
                  styles.tableHeaderText,
                  styles.dateCol,
                  isCompact && styles.dateColCompact,
                ]}
              >
                Date
              </Text>
            </View>
            {isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color="#2463EB" />
                <Text style={styles.loadingText}>Loading transactions...</Text>
              </View>
            ) : visibleTransactions.length ? (
              visibleTransactions.map((entry) => (
                <TransactionRow
                  key={entry.id}
                  entry={entry}
                  prediction={getLinkedPrediction(entry, predictions)}
                  isCompact={isCompact}
                />
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No transactions yet</Text>
                <Text style={styles.emptyText}>
                  Your wallet activity will appear here automatically.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <AppMenuSheet visible={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </SafeAreaView>
  );
}

function isVisibleTransaction(
  entry: TransactionRecord,
  predictions: Record<string, PredictionRecord>
) {
  if (
    entry.type === "bet_edit_refund" ||
    entry.type === "bet_edit_placed" ||
    entry.type === "bet_edit_placed_with_free_ticket" ||
    entry.type === "bet_deleted_refund" ||
    entry.type === "match_refund_no_result"
  ) {
    return false;
  }

  if (entry.type !== "bet_placed" && entry.type !== "bet_placed_with_free_ticket") {
    return true;
  }

  const linkedPrediction = getLinkedPrediction(entry, predictions);

  if (!linkedPrediction) {
    return false;
  }

  return linkedPrediction.status !== "refunded";
}

function getVisibleTransactions(
  transactions: TransactionRecord[],
  predictions: Record<string, PredictionRecord>
) {
  const latestBetPlacedByMatch = new Map<string, string>();

  for (const entry of transactions) {
    if (
      (entry.type !== "bet_placed" && entry.type !== "bet_placed_with_free_ticket") ||
      entry.referenceType !== "match" ||
      !entry.referenceId
    ) {
      continue;
    }

    if (!latestBetPlacedByMatch.has(entry.referenceId)) {
      latestBetPlacedByMatch.set(entry.referenceId, entry.id);
    }
  }

  return transactions.filter((entry) => {
    if (!isVisibleTransaction(entry, predictions)) {
      return false;
    }

    if (
      (entry.type !== "bet_placed" && entry.type !== "bet_placed_with_free_ticket") ||
      entry.referenceType !== "match" ||
      !entry.referenceId
    ) {
      return true;
    }

    return latestBetPlacedByMatch.get(entry.referenceId) === entry.id;
  });
}

function getLinkedPrediction(
  entry: TransactionRecord,
  predictions: Record<string, PredictionRecord>
) {
  if (entry.referenceType !== "match" || !entry.referenceId) {
    return null;
  }

  return predictions[entry.referenceId] ?? null;
}

function getDisplayAmount(entry: TransactionRecord, prediction: PredictionRecord | null) {
  if (
    (entry.type === "bet_placed" || entry.type === "bet_placed_with_free_ticket") &&
    prediction
  ) {
    return -(prediction.walletDebitAmount ?? prediction.amount);
  }

  return entry.amount;
}

function TransactionRow({
  entry,
  prediction,
  isCompact,
}: {
  entry: TransactionRecord;
  prediction: PredictionRecord | null;
  isCompact: boolean;
}) {
  const displayAmount = getDisplayAmount(entry, prediction);
  const isPointTransaction = entry.type === "bet_insurance_bonus_point";
  const isCredit = displayAmount > 0 || isPointTransaction;

  return (
    <View style={[styles.row, isCompact && styles.rowCompact]}>
      <Text style={[styles.rowDescription, styles.descriptionCol]} numberOfLines={2}>
        {formatDescription(entry)}
      </Text>

      <View style={[styles.amountCol, isCompact && styles.amountColCompact, styles.amountCell]}>
        {isPointTransaction ? (
          <Text style={[styles.rowAmount, styles.operationCreditText]}>+{displayAmount} Pt</Text>
        ) : (
          <CoinAmount
            value={Math.abs(displayAmount).toLocaleString("en-IN")}
            prefix={isCredit ? "+" : "-"}
            color={isCredit ? "#4AE39A" : "#F6B1B1"}
            size={13}
            weight="800"
            iconSize={11}
            align="center"
            textStyle={styles.rowAmount}
          />
        )}
      </View>

      <View
        style={[styles.operationCol, isCompact && styles.operationColCompact, styles.operationCell]}
      >
        <Text
          style={[
            styles.operationText,
            isCredit ? styles.operationCreditText : styles.operationDebitText,
          ]}
        >
          {isCredit ? "Credit" : "Debit"}
        </Text>
      </View>

      <View style={[styles.dateCol, isCompact && styles.dateColCompact]}>
        <Text style={styles.rowPrimary}>{formatDate(entry.createdAt)}</Text>
        <Text style={styles.rowSecondary}>{formatTime(entry.createdAt)}</Text>
      </View>
    </View>
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

function formatDescription(entry: TransactionRecord) {
  if (entry.type === "bet_insurance_bonus_point") {
    return "Bet Insurance Bonus (+1 Pt)";
  }

  if (entry.referenceType === "match") {
    const matchNumber = entry.note.match(/match\s+(\d+)/i)?.[1];
    return matchNumber ? `Match ${matchNumber}` : "Match";
  }

  if (entry.referenceType === "referral") {
    return "Referral Bonus";
  }

  if (entry.referenceType === "weekly_spin") {
    return "Weekly Spin";
  }

  return "System";
}

function formatDate(value: unknown) {
  const time = getTimestampValue(value);
  if (!time) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(time));
}

function formatTime(value: unknown) {
  const time = getTimestampValue(value);
  if (!time) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
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
  content: {
    paddingHorizontal: 18,
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
    gap: 22,
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
  summaryWrap: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 16,
    gap: 8,
  },
  summaryCardFullWidth: {
    flex: 0,
    width: "100%",
  },
  balanceCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  balanceLabel: {
    color: "#9FB0CF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  balanceAmountRow: {
    minHeight: 28,
    alignSelf: "flex-start",
  },
  summaryCardAccent: {
    borderColor: "#2A7D56",
  },
  summaryLabel: {
    color: "#9FB0CF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryLabelAccent: {
    color: "#66DDA1",
  },
  summaryValue: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "800",
  },
  tableWrap: {
    borderRadius: 24,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
    paddingVertical: 12,
    gap: 8,
  },
  tableHeaderText: {
    color: "#7FAAFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    textAlign: "center",
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
    paddingVertical: 14,
    gap: 8,
  },
  descriptionCol: {
    flex: 2.7,
  },
  amountCol: {
    width: 138,
  },
  amountColCompact: {
    width: 86,
  },
  operationCol: {
    width: 74,
  },
  operationColCompact: {
    width: 64,
  },
  dateCol: {
    width: 92,
  },
  dateColCompact: {
    width: 72,
  },
  rowDescription: {
    color: "#DDE5F7",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "left",
  },
  descriptionHeaderText: {
    textAlign: "left",
  },
  amountCell: {
    alignItems: "center",
  },
  rowAmount: {
    fontSize: 13,
    fontWeight: "800",
  },
  operationCell: {
    alignItems: "center",
  },
  operationText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  operationCreditText: {
    color: "#4AE39A",
  },
  operationDebitText: {
    color: "#F6B1B1",
  },
  rowPrimary: {
    color: "#F5F8FF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  rowSecondary: {
    color: "#8EA0C1",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
    textAlign: "center",
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
