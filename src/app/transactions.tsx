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
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { AppMenuButton, AppMenuSheet } from "@/components/AppMenuSheet";
import { BackButton } from "@/components/BackButton";
import { db } from "@/lib/firebase";
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

  if (typeof value === "object" && value && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "object" && value && "seconds" in value && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  return 0;
}

export default function TransactionsScreen() {
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isCompact = width < 720;

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    const transactionsQuery = query(
      collection(db, "transactions"),
      where("userId", "==", user.uid)
    );

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
  }, [user]);

  const totals = useMemo(
    () => ({
      credits: transactions
        .filter((entry) => !isHiddenTransactionType(entry.type))
        .filter((entry) => entry.amount > 0).length,
      debits: transactions
        .filter((entry) => !isHiddenTransactionType(entry.type))
        .filter((entry) => entry.amount < 0).length,
    }),
    [transactions]
  );

  const visibleTransactions = useMemo(
    () => transactions.filter((entry) => !isHiddenTransactionType(entry.type)),
    [transactions]
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
                <Text style={styles.title}>Transactions</Text>
              </View>
              <AppMenuButton onPress={() => setIsMenuOpen(true)} />
            </View>
            <Text style={styles.subtitle}>
              Wallet credits, debits, and bet-related account movement.
            </Text>
          </View>

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
            <SummaryCard
              label="Balance"
              value={`₹ ${(profile?.balance ?? 0).toLocaleString("en-IN")}`}
              fullWidth
            />
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
                <TransactionRow key={entry.id} entry={entry} isCompact={isCompact} />
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

function isHiddenTransactionType(type: string) {
  return type === "bet_edit_refund" || type === "bet_edit_placed";
}

function TransactionRow({
  entry,
  isCompact,
}: {
  entry: TransactionRecord;
  isCompact: boolean;
}) {
  const isCredit = entry.amount > 0;

  return (
    <View style={[styles.row, isCompact && styles.rowCompact]}>
      <Text style={[styles.rowDescription, styles.descriptionCol]} numberOfLines={2}>
        {formatDescription(entry)}
      </Text>

      <View style={[styles.amountCol, isCompact && styles.amountColCompact, styles.amountCell]}>
        <Text style={[styles.rowAmount, isCredit ? styles.amountPositive : styles.amountNegative]}>
          {isCredit ? "+" : "-"}₹ {Math.abs(entry.amount).toLocaleString("en-IN")}
        </Text>
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
  value: string;
  accent?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, fullWidth && styles.summaryCardFullWidth, accent && styles.summaryCardAccent]}>
      <Text style={[styles.summaryLabel, accent && styles.summaryLabelAccent]}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function formatDescription(entry: TransactionRecord) {
  if (entry.referenceType === "match") {
    const matchNumber = entry.note.match(/match\s+(\d+)/i)?.[1];
    return matchNumber ? `Match ${matchNumber}` : "Match";
  }

  if (entry.referenceType === "referral") {
    return "Referral Bonus";
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
  amountPositive: {
    color: "#4AE39A",
  },
  amountNegative: {
    color: "#F6B1B1",
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
