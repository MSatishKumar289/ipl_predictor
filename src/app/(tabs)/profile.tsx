import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { logout } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

export default function ProfileTab() {
  const { profile, error } = useAuth();
  const { width } = useWindowDimensions();
  const adminRoute = "/admin" as Href;
  const isDesktop = width >= 1024;

  async function handleLogout() {
    try {
      await logout();
      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace("/");
    } catch (logoutError) {
      const message = logoutError instanceof Error ? logoutError.message : "Unable to sign out.";
      Alert.alert("Sign out failed", message);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageShell, isDesktop && styles.pageShellDesktop]}>
          <View style={[styles.header, isDesktop && styles.headerDesktop]}>
            <Text style={[styles.eyebrow, isDesktop && styles.headerTextDesktop]}>Account</Text>
            <Text style={[styles.title, isDesktop && styles.headerTextDesktop]}>Profile</Text>
            <Text style={[styles.subtitle, isDesktop && styles.headerTextDesktop]}>
              Track your balance, results, and account status.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Profile sync error</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(profile?.displayName)}</Text>
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.name}>{profile?.displayName || "Player"}</Text>
              <Text style={styles.email}>{profile?.email || "No email"}</Text>
              <View style={styles.roleChip}>
                <Text style={styles.roleChipText}>
                  {profile?.role === "admin" ? "Admin" : "User"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <Text style={styles.balanceValue}>
              Rs. {(profile?.balance ?? 0).toLocaleString("en-IN")}
            </Text>
            <Text style={styles.balanceHint}>
              This updates when bets are placed, edited, or settled.
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <StatCard label="Points" value={String(profile?.points ?? 0)} accent />
            <StatCard label="Wins" value={String(profile?.wins ?? 0)} />
            <StatCard label="Losses" value={String(profile?.losses ?? 0)} />
            <StatCard label="Predictions" value={String(profile?.totalPredictions ?? 0)} />
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Account Details</Text>
            <DetailRow label="Phone" value={profile?.phoneNumber || "Not added"} />
            <DetailRow
              label="Win Rate"
              value={formatWinRate(profile?.wins ?? 0, profile?.losses ?? 0)}
            />
            <DetailRow
              label="Status"
              value={profile?.role === "admin" ? "Admin access enabled" : "Standard player"}
            />
          </View>

          {profile?.role === "admin" ? (
            <Pressable style={styles.adminButton} onPress={() => router.push(adminRoute)}>
              <Text style={styles.adminButtonText}>Open Admin Panel</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function getInitials(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (!parts.length) {
    return "P";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatWinRate(wins: number, losses: number) {
  const total = wins + losses;

  if (!total) {
    return "No settled matches yet";
  }

  return `${Math.round((wins / total) * 100)}%`;
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
  },
  pageShell: {
    width: "100%",
    alignSelf: "center",
    gap: 18,
  },
  pageShellDesktop: {
    maxWidth: 960,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  headerDesktop: {
    alignItems: "center",
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
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: "#1E5AE0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#F7FAFF",
    fontSize: 28,
    fontWeight: "800",
  },
  heroBody: {
    flex: 1,
    gap: 6,
  },
  name: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  email: {
    color: "#9FB0CF",
    fontSize: 15,
  },
  roleChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#16356D",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  roleChipText: {
    color: "#DCE8FF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  balanceCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#355AA8",
    backgroundColor: "#102042",
    padding: 22,
    gap: 8,
  },
  balanceLabel: {
    color: "#9FB0CF",
    fontSize: 15,
    fontWeight: "700",
  },
  balanceValue: {
    color: "#F7FAFF",
    fontSize: 32,
    fontWeight: "900",
  },
  balanceHint: {
    color: "#8EA0C1",
    fontSize: 14,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  statCard: {
    width: "49%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 18,
    gap: 8,
  },
  statCardAccent: {
    borderColor: "#355AA8",
  },
  statLabel: {
    color: "#9FB0CF",
    fontSize: 14,
    fontWeight: "700",
  },
  statLabelAccent: {
    color: "#7FAAFF",
  },
  statValue: {
    color: "#F7FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  infoCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#223A63",
    backgroundColor: "#102042",
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "700",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: 16,
    backgroundColor: "#0E1B36",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  detailLabel: {
    color: "#8EA0C1",
    fontSize: 15,
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  adminButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#123E8F",
  },
  adminButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
  },
  logoutButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E5AE0",
  },
  logoutButtonText: {
    color: "#F7FAFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
